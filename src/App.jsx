import React from "react";

const OPTIONS = [
  { name: "--servers", desc: "Archivo JSON con la lista de servidores." },
  { name: "--min-mbps", desc: "Velocidad mínima de descarga (Mbps)." },
  { name: "--max-mbps", desc: "Velocidad máxima de descarga (Mbps)." },
  { name: "--duration-hours", desc: "Duración total del sondeo en horas." },
  { name: "--request-timeout", desc: "Timeout por descarga en segundos." },
  { name: "--cooldown-seconds", desc: "Tiempo de enfriamiento al marcar un servidor como ocupado." },
  { name: "--client-id", desc: "Identificador del cliente para anunciar la velocidad." },
  { name: "--max-consecutive-errors", desc: "Errores consecutivos antes de poner el servidor en cooldown." },
  { name: "--busy-statuses", desc: "Códigos HTTP que se consideran ocupados (coma separada)." }
];

const SWITCHING_RULES = [
  "Timeout o error de conexión.",
  "HTTP 429/503/504 (servidor ocupado) configurables con --busy-statuses.",
  "Errores consecutivos que superen --max-consecutive-errors.",
  "Cooldown activo por servidor para evitar saturación reiterada."
];

const SERVERS = [
  "speed.hetzner.de",
  "speedtest.tele2.net",
  "ipv4.download.thinkbroadband.com",
  "proof.ovh.net",
  "speedtest.ams01.softlayer.com",
  "speedtest.wdc01.softlayer.com",
  "speedtest.sng01.softlayer.com",
  "speedtest.ato1.googlefiber.net"
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="px-6 py-10 border-b border-slate-800">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-slate-400">Network Probe UI</p>
          <h1 className="text-3xl font-semibold">Sondeo continuo de redes (receive-only)</h1>
          <p className="mt-3 text-slate-300 max-w-2xl">
            Panel de referencia para ejecutar la app Python que mide eficiencia de red durante 24 horas,
            anunciando la velocidad objetivo y cambiando de servidor cuando hay congestión.
          </p>
        </div>
      </header>

      <main className="px-6 py-10">
        <div className="max-w-5xl mx-auto grid gap-8">
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-lg font-semibold">Flujo principal</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>1. Selecciona servidor disponible.</li>
                <li>2. Anuncia velocidad objetivo.</li>
                <li>3. Descarga controlada a 0.5–2 Mbps.</li>
                <li>4. Registra métricas y rota.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-lg font-semibold">Comando rápido</h2>
              <code className="mt-3 block text-xs text-slate-200 bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                python tools/network_probe.py --servers tools/servers.example.json
              </code>
              <p className="mt-3 text-xs text-slate-400">
                Instala dependencias con: <span className="text-slate-200">pip install -r tools/requirements.txt</span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-lg font-semibold">Estado esperado</h2>
              <p className="mt-3 text-sm text-slate-300">
                La app se mantiene activa, evita servidores saturados y sostiene un rango de recepción estable para
                medir eficiencia de red en largas ventanas de tiempo.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">Opciones de ejecución</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {OPTIONS.map((opt) => (
                <div key={opt.name} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-sm font-semibold text-slate-100">{opt.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{opt.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-lg font-semibold">Reglas de cambio de servidor</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-300 list-disc list-inside">
                {SWITCHING_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-lg font-semibold">Servidores sugeridos</h2>
              <p className="text-xs text-slate-400 mt-2">
                Lista ampliada para repartir carga. Ajusta URLs según disponibilidad regional.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-200">
                {SERVERS.map((server) => (
                  <div key={server} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1">
                    {server}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
