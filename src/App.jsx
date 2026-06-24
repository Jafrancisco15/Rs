import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PREINFUSION_THRESHOLD = 0.25;
const FLOW_OPTIMAL_MIN = 1.5;
const FLOW_OPTIMAL_MAX = 3.5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const standardDeviation = (values) => {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return 0;
  const avg = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / clean.length;
  return Math.sqrt(variance);
};

const interpolateNodes = (nodes, progress) => {
  if (!nodes?.length) return null;
  const sorted = [...nodes].sort((a, b) => a.progress - b.progress);
  if (progress <= sorted[0].progress) return sorted[0];
  if (progress >= sorted[sorted.length - 1].progress) return sorted[sorted.length - 1];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const next = sorted[index];
    if (progress <= next.progress) {
      const span = Math.max(1e-6, next.progress - previous.progress);
      const ratio = (progress - previous.progress) / span;
      return {
        progress,
        min: previous.min + (next.min - previous.min) * ratio,
        max: previous.max + (next.max - previous.max) * ratio,
      };
    }
  }

  return null;
};

const interpolateZoneRanges = (segments, progress) => {
  if (!segments || !segments.length) return [];

  return segments
    .map((segment) => {
      const range = interpolateNodes(segment.nodes, progress);
      if (!range) return null;

      const min = Number.isFinite(range.min) ? range.min : null;
      const max = Number.isFinite(range.max) ? range.max : null;

      if (min === null || max === null) return null;
      if (max <= min) return null;
      if (min === 0 && max === 0) return null;

      return {
        ...range,
        min,
        max,
        segmentId: segment.id,
        label: segment.label || "",
      };
    })
    .filter(Boolean);
};

const classifyFlowAgainstRanges = (flow, ranges) => {
  if (!Number.isFinite(flow) || !ranges.length) {
    return { classification: "outside", gapValue: 0, nearestRange: null };
  }

  const insideRange = ranges.find((range) => flow >= range.min && flow <= range.max);
  if (insideRange) {
    return { classification: "inside", gapValue: 0, nearestRange: insideRange };
  }

  let nearest = null;
  for (const range of ranges) {
    let gapValue = 0;
    let classification = "outside";

    if (flow < range.min) {
      gapValue = range.min - flow;
      classification = "below";
    } else if (flow > range.max) {
      gapValue = flow - range.max;
      classification = "above";
    }

    if (!nearest || gapValue < nearest.gapValue) {
      nearest = { classification, gapValue, nearestRange: range };
    }
  }

  return nearest || { classification: "outside", gapValue: 0, nearestRange: null };
};

const averageFlowByProgress = (samples, startProgress, endProgress) => {
  if (!samples || samples.length < 2) return 0;

  const startTime = samples[0].t;
  const endTime = samples[samples.length - 1].t;
  const duration = Math.max(1e-6, endTime - startTime);
  const selected = samples.filter((sample) => {
    const progress = (sample.t - startTime) / duration;
    return progress >= startProgress && progress <= endProgress;
  });

  if (!selected.length) return 0;
  return selected.reduce((sum, sample) => sum + sample.flow, 0) / selected.length;
};

const parseShotCsv = (csv) => csv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [t, weight] = line.split(",").map(Number);
    return { t, weight };
  })
  .filter((sample) => Number.isFinite(sample.t) && Number.isFinite(sample.weight))
  .map((sample, index, samples) => {
    if (index === 0) return { ...sample, flow: 0 };
    const previous = samples[index - 1];
    const dt = Math.max(1e-6, sample.t - previous.t);
    return { ...sample, flow: Math.max(0, (sample.weight - previous.weight) / dt) };
  });

const parseZoneCsv = (csv) => {
  const rows = csv.trim().split(/\r?\n/).slice(1);
  const segmentsById = new Map();

  rows.forEach((line) => {
    const [segmentId, label, progressRaw, minRaw, maxRaw] = line.split(",");
    const progress = Number(progressRaw);
    const min = Number(minRaw);
    const max = Number(maxRaw);
    if (![progress, min, max].every(Number.isFinite)) return;
    const id = segmentId || "default";
    if (!segmentsById.has(id)) {
      segmentsById.set(id, { id, label: label || "", nodes: [] });
    }
    segmentsById.get(id).nodes.push({ progress, min, max });
  });

  return [...segmentsById.values()].map((segment) => ({
    ...segment,
    nodes: segment.nodes.sort((a, b) => a.progress - b.progress),
  }));
};

const correlation = (left, right) => {
  const pairs = left.map((value, index) => [value, right[index]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return 0;
  const avgLeft = pairs.reduce((sum, [value]) => sum + value, 0) / pairs.length;
  const avgRight = pairs.reduce((sum, [, value]) => sum + value, 0) / pairs.length;
  const numerator = pairs.reduce((sum, [a, b]) => sum + (a - avgLeft) * (b - avgRight), 0);
  const denomLeft = Math.sqrt(pairs.reduce((sum, [a]) => sum + (a - avgLeft) ** 2, 0));
  const denomRight = Math.sqrt(pairs.reduce((sum, [, b]) => sum + (b - avgRight) ** 2, 0));
  return denomLeft && denomRight ? numerator / (denomLeft * denomRight) : 0;
};

const analyzeShot = (samples, zoneSegments) => {
  const activeSamples = samples.filter((sample) => sample.flow >= PREINFUSION_THRESHOLD);
  if (activeSamples.length < 3) {
    return { error: "Sin datos suficientes después del inicio de flujo sostenido." };
  }

  const duration = samples[samples.length - 1].t - samples[0].t;
  const activeFlows = activeSamples.map((sample) => sample.flow);
  const avgFlow = activeFlows.reduce((sum, flow) => sum + flow, 0) / activeFlows.length;
  const peakFlow = Math.max(...activeFlows);
  const finalFlow = averageFlowByProgress(activeSamples, 0.9, 1);
  const preinfusionDuration = activeSamples[0].t - samples[0].t;
  const initialRamp = averageFlowByProgress(activeSamples, 0, 0.2);
  const flowStd = standardDeviation(activeFlows);
  const flowCv = avgFlow > 0 ? flowStd / avgFlow : 0;
  const uniformityScore = Math.round(clamp((1 - flowCv) * 100, 0, 100));
  const hydraulicScore = uniformityScore;
  const correlationFlowWeight = correlation(samples.map((sample) => sample.flow), samples.map((sample) => sample.weight));

  let maxAccel = 0;
  let spikeCount = 0;
  for (let index = 2; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const dt = Math.max(1e-6, current.t - previous.t);
    const accel = (current.flow - previous.flow) / dt;
    maxAccel = Math.max(maxAccel, accel);
    if (accel > 2.5 && current.flow > avgFlow * 1.3) spikeCount += 1;
  }

  let zoneInside = 0;
  let zoneBelow = 0;
  let zoneAbove = 0;
  let gapTotal = 0;
  let gapMax = 0;
  const chartData = [];

  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    const previous = samples[index - 1];
    const dt = Math.max(0, sample.t - previous.t);
    const progress = duration > 0 ? (sample.t - samples[0].t) / duration : 0;
    const ranges = interpolateZoneRanges(zoneSegments, progress);
    const visualEnvelope = ranges.length
      ? { min: Math.min(...ranges.map((range) => range.min)), max: Math.max(...ranges.map((range) => range.max)) }
      : { min: null, max: null };
    const { classification, gapValue } = classifyFlowAgainstRanges(sample.flow, ranges);

    if (classification === "inside") zoneInside += dt;
    else if (classification === "below") zoneBelow += dt;
    else if (classification === "above") zoneAbove += dt;

    gapTotal += gapValue * dt;
    gapMax = Math.max(gapMax, gapValue);
    chartData.push({
      time: sample.t,
      flow: Number(sample.flow.toFixed(2)),
      zoneMin: visualEnvelope.min,
      zoneMax: visualEnvelope.max,
      weight: Number(sample.weight.toFixed(1)),
    });
  }

  const zoneTotal = zoneInside + zoneBelow + zoneAbove || 1;
  const zoneCoverage = {
    inside: Math.round((zoneInside / zoneTotal) * 100),
    below: Math.round((zoneBelow / zoneTotal) * 100),
    above: Math.round((zoneAbove / zoneTotal) * 100),
  };
  const averageGap = gapTotal / zoneTotal;

  const midFlow = averageFlowByProgress(activeSamples, 0.35, 0.65);
  const lateFlow = averageFlowByProgress(activeSamples, 0.8, 0.95);
  const lateAccelerationRatio = midFlow > 0 ? lateFlow / midFlow : 1;
  const lateAccelerationScore = Math.round(clamp(((lateAccelerationRatio - 1.15) / 0.85) * 100, 0, 100));
  const spikeScore = Math.round(clamp((spikeCount / 3) * 100, 0, 100));
  const aboveZoneScore = zoneCoverage.above || 0;
  const instabilityScore = Math.round(clamp((1 - uniformityScore / 100) * 100, 0, 100));
  const accelerationScore = Math.round(clamp((maxAccel / 6) * 100, 0, 100));
  const channelingIndex = Math.round(clamp(
    (0.3 * aboveZoneScore) +
    (0.25 * lateAccelerationScore) +
    (0.2 * spikeScore) +
    (0.15 * instabilityScore) +
    (0.1 * accelerationScore),
    0,
    100,
  ));

  let hydraulicSummary;
  if (uniformityScore >= 80) hydraulicSummary = "Flujo muy uniforme: la curva mantiene una entrega estable durante la extracción.";
  else if (uniformityScore >= 60) hydraulicSummary = "Flujo razonablemente uniforme: hay variaciones, pero no dominan el tiro.";
  else if (uniformityScore >= 40) hydraulicSummary = "Flujo irregular: revisa distribución, molienda y preparación del puck.";
  else hydraulicSummary = "Flujo muy inestable: patrón compatible con puck irregular, erosión o canalización.";
  hydraulicSummary += ` Correlación flujo-peso: ${correlationFlowWeight.toFixed(2)}.`;

  let channelingSummary;
  if (channelingIndex >= 70) {
    channelingSummary = "Patrón fuertemente compatible con canalización o degradación del puck: exceso de flujo sobre zona, aceleración final o picos marcados.";
  } else if (channelingIndex >= 45) {
    channelingSummary = "Patrón moderadamente compatible con canalización: revisa distribución, nivelación y molienda.";
  } else if (channelingIndex >= 25) {
    channelingSummary = "Irregularidad leve: hay señales de aceleración o salida fuera de zona, pero no dominan el tiro.";
  } else {
    channelingSummary = "Curva estable: pocas señales compatibles con canalización.";
  }

  const flowDistribution = activeFlows.reduce((acc, flow) => {
    if (flow < FLOW_OPTIMAL_MIN) acc.low += 1;
    else if (flow > FLOW_OPTIMAL_MAX) acc.high += 1;
    else acc.optimal += 1;
    return acc;
  }, { low: 0, optimal: 0, high: 0 });
  Object.keys(flowDistribution).forEach((key) => {
    flowDistribution[key] = Math.round((flowDistribution[key] / activeFlows.length) * 100);
  });

  let flowDistributionSummary;
  if (flowDistribution.optimal > 60) flowDistributionSummary = "Mayor parte de la extracción dentro de la referencia clásica de flujo.";
  else if (flowDistribution.high > flowDistribution.low) flowDistributionSummary = "Flujo alto frente a la referencia clásica; confirma con la zona segura activa antes de ajustar.";
  else if (flowDistribution.low > flowDistribution.high) flowDistributionSummary = "Flujo bajo frente a la referencia clásica; confirma con la zona segura activa antes de ajustar.";
  else flowDistributionSummary = "Distribución mixta frente a la referencia clásica; prioriza la zona segura activa.";

  const zoneSummary = zoneCoverage.inside >= 70
    ? "Buena cobertura de zona segura usando segmentos reales del CSV."
    : "Salida fuera de zona segura: revisa si el flujo queda por debajo o por encima de los segmentos activos.";

  return {
    avgFlow,
    peakFlow,
    finalFlow,
    initialRamp,
    preinfusionDuration,
    hydraulicScore,
    uniformityScore,
    hydraulicSummary,
    channelingIndex,
    channelingSummary,
    zoneCoverage,
    averageGap,
    maxGap: gapMax,
    flowDistribution,
    flowDistributionSummary,
    zoneSummary,
    chartData,
  };
};

const DEFAULT_SHOT_CSV = `time,weight
0,0
3,0
6,0.4
9,3.4
12,8.5
15,14.0
18,20.5
21,27.2
24,33.5
27,39.0
30,44.4`;

const samplesToCsv = (samples) => `time,weight\n${samples.map((sample) => `${sample.t},${sample.weight}`).join("\n")}`;

const DEFAULT_ZONE_CSV = `segment,label,progress,min,max
low,Perfil bajo,0,1.2,1.9
low,Perfil bajo,0.5,1.5,2.1
low,Perfil bajo,1,1.2,1.8
high,Perfil alto,0,2.4,3.0
high,Perfil alto,0.5,2.5,3.2
high,Perfil alto,1,2.0,2.8`;

function MetricCard({ label, value, suffix = "" }) {
  return (
    <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-4">
      <div className="text-xs uppercase tracking-wide text-amber-200/70">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}{suffix}</div>
    </div>
  );
}

export default function App() {
  const [shotCsv, setShotCsv] = useState(DEFAULT_SHOT_CSV);
  const [connectionStatus, setConnectionStatus] = useState("Desconectada");
  const [tareOffset, setTareOffset] = useState(0);
  const [manualTime, setManualTime] = useState(33);
  const [manualWeight, setManualWeight] = useState(48);
  const [simulating, setSimulating] = useState(false);
  const [simulationStart, setSimulationStart] = useState(null);
  const [zoneCsv, setZoneCsv] = useState(DEFAULT_ZONE_CSV);
  const samples = useMemo(() => parseShotCsv(shotCsv), [shotCsv]);
  const zoneSegments = useMemo(() => parseZoneCsv(zoneCsv), [zoneCsv]);
  const analysis = useMemo(() => analyzeShot(samples, zoneSegments), [samples, zoneSegments]);
  const currentWeight = samples.length ? samples[samples.length - 1].weight - tareOffset : 0;

  useEffect(() => {
    if (!simulating) return undefined;
    const start = Date.now();
    setSimulationStart(start);
    const timer = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const flow = elapsed < 5 ? 0 : Math.max(0.4, 2.8 - elapsed * 0.018 + Math.sin(elapsed / 2) * 0.25);
      setShotCsv((previousCsv) => {
        const previous = parseShotCsv(previousCsv);
        const lastWeight = previous.length ? previous[previous.length - 1].weight : 0;
        const lastTime = previous.length ? previous[previous.length - 1].t : 0;
        if (elapsed <= lastTime) return previousCsv;
        const dt = Math.max(0, elapsed - lastTime);
        const next = [...previous, { t: Number(elapsed.toFixed(1)), weight: Number((lastWeight + flow * dt).toFixed(1)) }];
        return samplesToCsv(next);
      });
      if (elapsed >= 32) setSimulating(false);
    }, 1000);
    return () => clearInterval(timer);
  }, [simulating]);

  const connectBluetoothScale = async () => {
    if (!navigator.bluetooth) {
      setConnectionStatus("Bluetooth no disponible; usa entrada manual o simulación.");
      return;
    }
    setConnectionStatus("Buscando balanza Bluetooth...");
    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ["battery_service"] });
      setConnectionStatus(`Conectada a ${device.name || "balanza Bluetooth"}`);
    } catch (error) {
      setConnectionStatus("Conexión cancelada o no disponible; usa entrada manual o simulación.");
    }
  };

  const tareScale = () => {
    setTareOffset(samples.length ? samples[samples.length - 1].weight : 0);
  };

  const addManualSample = () => {
    const next = [...samples, { t: Number(manualTime), weight: Number(manualWeight) + tareOffset }]
      .filter((sample) => Number.isFinite(sample.t) && Number.isFinite(sample.weight))
      .sort((a, b) => a.t - b.t);
    setShotCsv(samplesToCsv(next));
    setManualTime((value) => Number(value) + 3);
  };

  const resetShot = () => {
    setShotCsv("time,weight\n0,0");
    setTareOffset(0);
    setSimulating(false);
  };

  const exportAnalysis = () => {
    if (analysis.error) return;
    const rows = [
      ["metric", "value"],
      ["Flujo promedio", analysis.avgFlow.toFixed(2)],
      ["Pico de flujo", analysis.peakFlow.toFixed(2)],
      ["Flujo final", analysis.finalFlow.toFixed(2)],
      ["Rampa inicial", analysis.initialRamp.toFixed(2)],
      ["Latencia de percolación", analysis.preinfusionDuration.toFixed(1)],
      ["Uniformidad de flujo", analysis.hydraulicScore],
      ["Índice de canalización", analysis.channelingIndex],
      ["Cobertura", analysis.zoneCoverage.inside],
      ["Brecha media", analysis.averageGap.toFixed(2)],
      ["Brecha máxima", analysis.maxGap.toFixed(2)],
    ];
    const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "espresso-analysis.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 text-stone-100">
      <header className="border-b border-amber-900/30 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-amber-200/80">Espresso Dial In · Balanza Bluetooth</p>
            <h1 className="text-4xl font-bold">Análisis de curva de flujo por balanza</h1>
            <p className="mt-3 max-w-3xl text-stone-300">
              La app conserva la captura de peso, tiempo y flujo calculado: conecta una balanza Bluetooth, haz tara, introduce datos manualmente o corre una simulación sin agregar sensores externos.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-800/40 bg-stone-950/70 p-4 shadow-xl">
            <div className="text-xs uppercase tracking-wide text-amber-200/70">Peso actual</div>
            <div className="text-4xl font-bold">{currentWeight.toFixed(1)} g</div>
            <div className="mt-1 text-xs text-stone-400">{connectionStatus}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
            <h2 className="text-xl font-semibold">Conexión de balanza</h2>
            <p className="mt-2 text-sm text-stone-300">Web Bluetooth se usa cuando el navegador lo permite; si no, la entrada manual y la simulación siguen disponibles.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-stone-950" onClick={connectBluetoothScale}>Conectar Bluetooth</button>
              <button className="rounded-lg border border-amber-700 px-3 py-2 text-sm" onClick={tareScale}>Tara</button>
              <button className="rounded-lg border border-stone-700 px-3 py-2 text-sm" onClick={resetShot}>Reiniciar tiro</button>
            </div>
          </div>

          <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
            <h2 className="text-xl font-semibold">Introducir datos</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">Tiempo (s)<input className="rounded-lg border border-stone-700 bg-stone-950 p-2" type="number" value={manualTime} onChange={(event) => setManualTime(event.target.value)} /></label>
              <label className="grid gap-1 text-sm">Peso neto (g)<input className="rounded-lg border border-stone-700 bg-stone-950 p-2" type="number" value={manualWeight} onChange={(event) => setManualWeight(event.target.value)} /></label>
            </div>
            <button className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-950" onClick={addManualSample}>Agregar muestra</button>
          </div>

          <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
            <h2 className="text-xl font-semibold">Simulación</h2>
            <p className="mt-2 text-sm text-stone-300">Genera una curva de extracción para probar gráficos, zona segura y diagnósticos sin balanza conectada.</p>
            <button className="mt-4 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => { resetShot(); setSimulating(true); }}>
              {simulating ? "Simulando..." : "Iniciar simulación"}
            </button>
            {simulationStart && <p className="mt-2 text-xs text-stone-400">Simulación activa desde {new Date(simulationStart).toLocaleTimeString()}.</p>}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="font-semibold">Datos de balanza (tiempo, peso)</span>
            <textarea className="min-h-40 rounded-xl border border-stone-700 bg-stone-900 p-3 font-mono text-sm" value={shotCsv} onChange={(event) => setShotCsv(event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="font-semibold">CSV de zona segura por segmentos</span>
            <textarea className="min-h-40 rounded-xl border border-stone-700 bg-stone-900 p-3 font-mono text-sm" value={zoneCsv} onChange={(event) => setZoneCsv(event.target.value)} />
          </label>
        </section>

        {analysis.error ? (
          <section className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-100">{analysis.error}</section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Flujo promedio" value={analysis.avgFlow.toFixed(2)} suffix=" g/s" />
              <MetricCard label="Pico de flujo" value={analysis.peakFlow.toFixed(2)} suffix=" g/s" />
              <MetricCard label="Flujo final" value={analysis.finalFlow.toFixed(2)} suffix=" g/s" />
              <MetricCard label="Rampa inicial" value={analysis.initialRamp.toFixed(2)} suffix=" g/s" />
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Latencia de percolación" value={analysis.preinfusionDuration.toFixed(1)} suffix=" s" />
              <MetricCard label="Uniformidad de flujo" value={analysis.hydraulicScore} suffix="/100" />
              <MetricCard label="Índice de canalización" value={analysis.channelingIndex} suffix="/100" />
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5 lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Zona segura</h2>
                    <p className="text-sm text-stone-400">Banda visual: el diagnóstico usa segmentos individuales del CSV.</p>
                  </div>
                  <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-stone-950" onClick={exportAnalysis}>Exportar CSV</button>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={analysis.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#44403c" />
                    <XAxis dataKey="time" stroke="#d6d3d1" label={{ value: "Tiempo (s)", position: "insideBottom", offset: -3, fill: "#d6d3d1" }} />
                    <YAxis stroke="#d6d3d1" label={{ value: "Flujo (g/s)", angle: -90, position: "insideLeft", fill: "#d6d3d1" }} />
                    <Tooltip contentStyle={{ background: "#1c1917", border: "1px solid #57534e" }} />
                    <Legend />
                    <Area name="Zona segura visual" dataKey="zoneMax" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12} dot={false} />
                    <Line name="Límite inferior visual" type="monotone" dataKey="zoneMin" stroke="#fbbf24" dot={false} strokeDasharray="4 4" />
                    <Line name="Flujo" type="monotone" dataKey="flow" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-4">
                <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
                  <h2 className="text-xl font-semibold">Cobertura</h2>
                  <p className="mt-2 text-3xl font-bold">{analysis.zoneCoverage.inside}%</p>
                  <p className="mt-2 text-sm text-stone-300">{analysis.zoneSummary}</p>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex justify-between"><dt>Debajo</dt><dd>{analysis.zoneCoverage.below}%</dd></div>
                    <div className="flex justify-between"><dt>Encima</dt><dd>{analysis.zoneCoverage.above}%</dd></div>
                    <div className="flex justify-between"><dt>Brecha media</dt><dd>{analysis.averageGap.toFixed(2)} g/s</dd></div>
                    <div className="flex justify-between"><dt>Brecha máxima</dt><dd>{analysis.maxGap.toFixed(2)} g/s</dd></div>
                  </dl>
                </div>

                <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
                  <h2 className="text-xl font-semibold">Distribución del flujo</h2>
                  <p className="text-sm text-stone-400">Referencia clásica {FLOW_OPTIMAL_MIN}-{FLOW_OPTIMAL_MAX} g/s</p>
                  <p className="mt-3 text-sm text-stone-300">{analysis.flowDistributionSummary}</p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
                <h2 className="text-xl font-semibold">Estabilidad y flujo</h2>
                <p className="mt-3 text-stone-300">{analysis.hydraulicSummary}</p>
              </div>
              <div className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
                <h2 className="text-xl font-semibold">Patrón compatible con canalización/degradación del puck</h2>
                <p className="mt-3 text-stone-300">{analysis.channelingSummary}</p>
              </div>
            </section>

            <section className="rounded-xl border border-amber-900/30 bg-stone-900/70 p-5">
              <h2 className="text-xl font-semibold">Peso acumulado</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analysis.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#44403c" />
                  <XAxis dataKey="time" stroke="#d6d3d1" />
                  <YAxis stroke="#d6d3d1" />
                  <Tooltip contentStyle={{ background: "#1c1917", border: "1px solid #57534e" }} />
                  <Line name="Peso" type="monotone" dataKey="weight" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
