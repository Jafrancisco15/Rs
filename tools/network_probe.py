#!/usr/bin/env python3
"""Continuous network efficiency probe.

Runs for a fixed duration (default: 24h), cycling through public servers,
announcing the target receive rate, and downloading data at 0.5–2 Mbps.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import aiohttp

DEFAULT_MIN_MBPS = 0.5
DEFAULT_MAX_MBPS = 2.0
DEFAULT_DURATION_HOURS = 24
DEFAULT_MIN_CHUNK = 16 * 1024
DEFAULT_MAX_CHUNK = 128 * 1024


@dataclass
class ServerTarget:
    name: str
    url: str
    announce_url: str | None = None


@dataclass
class CooldownEntry:
    until: float
    reason: str


class ServerPool:
    def __init__(self, servers: Iterable[ServerTarget]) -> None:
        self._servers = list(servers)
        self._cooldowns: dict[str, CooldownEntry] = {}
        self._index = 0

    def _is_available(self, server: ServerTarget, now: float) -> bool:
        entry = self._cooldowns.get(server.name)
        if not entry:
            return True
        return now >= entry.until

    def mark_busy(self, server: ServerTarget, seconds: int, reason: str) -> None:
        self._cooldowns[server.name] = CooldownEntry(
            until=time.monotonic() + seconds, reason=reason
        )

    def next(self) -> ServerTarget | None:
        if not self._servers:
            return None
        now = time.monotonic()
        for _ in range(len(self._servers)):
            server = self._servers[self._index]
            self._index = (self._index + 1) % len(self._servers)
            if self._is_available(server, now):
                return server
        return None


async def announce_rate(
    session: aiohttp.ClientSession,
    server: ServerTarget,
    target_mbps: float,
    client_id: str,
) -> None:
    if not server.announce_url:
        return
    payload = {"client_id": client_id, "target_mbps": target_mbps}
    try:
        async with session.post(server.announce_url, json=payload, timeout=10) as resp:
            await resp.release()
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return


async def download_with_rate(
    session: aiohttp.ClientSession,
    server: ServerTarget,
    target_mbps: float,
    chunk_min: int,
    chunk_max: int,
    request_timeout: int,
) -> tuple[int, float]:
    bytes_target_per_sec = target_mbps * 1_000_000 / 8
    total_bytes = 0
    start = time.monotonic()
    timeout = aiohttp.ClientTimeout(total=request_timeout)
    async with session.get(server.url, timeout=timeout) as resp:
        resp.raise_for_status()
        async for chunk in resp.content.iter_chunked(
            random.randint(chunk_min, chunk_max)
        ):
            if not chunk:
                break
            total_bytes += len(chunk)
            elapsed = time.monotonic() - start
            expected_bytes = bytes_target_per_sec * elapsed
            if total_bytes > expected_bytes:
                sleep_for = (total_bytes - expected_bytes) / bytes_target_per_sec
                await asyncio.sleep(sleep_for)
            if elapsed > request_timeout:
                break
    duration = max(time.monotonic() - start, 0.001)
    return total_bytes, duration


def load_servers(path: Path) -> list[ServerTarget]:
    data = json.loads(path.read_text(encoding="utf-8"))
    servers = []
    for entry in data.get("servers", []):
        servers.append(
            ServerTarget(
                name=entry["name"],
                url=entry["url"],
                announce_url=entry.get("announce_url"),
            )
        )
    return servers


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Continuous network efficiency probe (receive-only)."
    )
    parser.add_argument(
        "--servers",
        type=Path,
        required=True,
        help="Path to JSON file with server definitions.",
    )
    parser.add_argument(
        "--min-mbps",
        type=float,
        default=DEFAULT_MIN_MBPS,
        help="Minimum receive rate in Mbps.",
    )
    parser.add_argument(
        "--max-mbps",
        type=float,
        default=DEFAULT_MAX_MBPS,
        help="Maximum receive rate in Mbps.",
    )
    parser.add_argument(
        "--duration-hours",
        type=float,
        default=DEFAULT_DURATION_HOURS,
        help="Total runtime in hours.",
    )
    parser.add_argument(
        "--request-timeout",
        type=int,
        default=60,
        help="Timeout per download request in seconds.",
    )
    parser.add_argument(
        "--cooldown-seconds",
        type=int,
        default=300,
        help="Cooldown for busy servers in seconds.",
    )
    parser.add_argument(
        "--client-id",
        type=str,
        default="network-probe",
        help="Client identifier sent to announce endpoints.",
    )
    return parser


async def run_probe(args: argparse.Namespace) -> None:
    servers = load_servers(args.servers)
    if not servers:
        raise SystemExit("No servers configured.")

    pool = ServerPool(servers)
    end_time = time.monotonic() + args.duration_hours * 3600

    async with aiohttp.ClientSession() as session:
        while time.monotonic() < end_time:
            server = pool.next()
            if not server:
                await asyncio.sleep(5)
                continue

            target_mbps = random.uniform(args.min_mbps, args.max_mbps)
            await announce_rate(session, server, target_mbps, args.client_id)

            try:
                bytes_received, duration = await download_with_rate(
                    session,
                    server,
                    target_mbps,
                    DEFAULT_MIN_CHUNK,
                    DEFAULT_MAX_CHUNK,
                    args.request_timeout,
                )
                mbps = (bytes_received * 8) / (duration * 1_000_000)
                print(
                    f"{server.name}: target={target_mbps:.2f} Mbps, "
                    f"received={mbps:.2f} Mbps ({bytes_received} bytes)"
                )
            except aiohttp.ClientResponseError as exc:
                pool.mark_busy(server, args.cooldown_seconds, str(exc.status))
                print(f"{server.name}: busy (HTTP {exc.status}), cooling down")
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                pool.mark_busy(server, args.cooldown_seconds, str(exc))
                print(f"{server.name}: error ({exc}), cooling down")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.min_mbps <= 0 or args.max_mbps <= 0:
        raise SystemExit("Mbps values must be positive.")
    if args.min_mbps > args.max_mbps:
        raise SystemExit("min-mbps must be <= max-mbps.")

    try:
        asyncio.run(run_probe(args))
    except KeyboardInterrupt:
        print("Interrupted by user.")


if __name__ == "__main__":
    main()
