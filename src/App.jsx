/* Espresso Dial-In — App.jsx (clean rebuild)
   - ES/EN UI with persistent language
   - Tabs: Main (Dial) + Tutorial
   - Grinder inputs with X notation
   - Predictive model (ridge + priors); note about ≥5 trials
   - Basket rule (±1 g) and extras priority (distribution/channeling)
   - Two charts: Brew Control (TDS vs EY) + Espresso Compass (EY vs TDS)
   - Export CSV (session/history) + Clear history
*/

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ScatterChart, XAxis, YAxis, Scatter, ReferenceArea, ReferenceLine, Tooltip, Legend
} from "recharts";
import {
  Coffee, Gauge, SlidersHorizontal, Wrench, Package, Timer, Scale,
  Thermometer, Info, AlertCircle, AlertTriangle, Droplet, Frown, Zap, Star, Heart, Ruler, Ban, Hourglass, Globe, Trash2
, Pencil} from "lucide-react";
// ========== Simple Info Popover ==========
function InfoPopover({ content, side="right" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button type="button" aria-label="info" onClick={()=>setOpen(!open)} className="ml-2 p-1 rounded hover:bg-white/10 focus:outline-none">
        <Info className="inline w-4 h-4 text-white/80" />
      </button>
      {open && content && (
        <div className="absolute z-40 mt-1 whitespace-normal max-w-[240px] p-2 rounded bg-black/90 text-white/90 text-xs shadow-lg"
             style={{ [side]: "-4px", top: "100%" }}>
          {content}
        </div>
      )}
    </span>
  );
}



// ========== Label helpers ==========
const PARAM_LABELS = {
  es: { grindSize:"Nivel de molienda", doseCoffee:"Cantidad de café (g)", basketSize:"Tamaño de la canasta (g)",
        time:"Tiempo de extracción (s)", beverageMass:"Rendimiento en taza (g)", tds:"TDS (%)", temp:"Temperatura (°C)", tampPressure:"Presión del tamper (1–8)"},
  en: { grindSize:"Grind setting", doseCoffee:"Dose (g)", basketSize:"Basket size (g)",
        time:"Shot time (s)", beverageMass:"Output (g)", tds:"TDS (%)", temp:"Temperature (°C)", tampPressure:"Tamp pressure (1–8)"},
};
const DEFECT_LABELS = {
  es: { sour:"Agrio", bitter:"Amargo", astringent:"Astringente", weak:"Acuoso", harsh:"Áspero" },
  en: { sour:"Sour", bitter:"Bitter", astringent:"Astringent", weak:"Watery", harsh:"Harsh" },
};
const POS_LABELS = {
  es: { balanced:"Balance", body:"Cuerpo", aroma:"Aroma", sweetness:"Dulzor" },
  en: { balanced:"Balance", body:"Body", aroma:"Aroma", sweetness:"Sweetness" },
};
const EXTRA_LABELS = {
  es: { freshness:"Tueste muy reciente", badDistribution:"Mala distribución", unevenTamp:"Tamper desnivelado", inaccurateDose:"Dosis imprecisa", brokenPuck:"Canalización/puck roto" },
  en: { freshness:"Very fresh roast", badDistribution:"Poor distribution", unevenTamp:"Uneven tamp", inaccurateDose:"Inaccurate dose", brokenPuck:"Channeling/broken puck" },
};
const GRINDER_LABELS = {
  es: { type:"Tipo de molino", perRevMax:"Rango por vuelta", dialNumber:"Número del dial", extraTurns:"Vueltas (X)", highDialMeansCoarser:"Números altos = más grueso" },
  en: { type:"Grinder type", perRevMax:"Range per turn", dialNumber:"Dial number", extraTurns:"Turns (X)", highDialMeansCoarser:"Higher number = coarser" },
};
function labelForKey(lang, k){
  const dicts = [PARAM_LABELS[lang], DEFECT_LABELS[lang], POS_LABELS[lang], EXTRA_LABELS[lang], GRINDER_LABELS[lang]];
  for (const d of dicts){ if (d && d[k]) return d[k]; }
  return k;
}
function grinderOptionLabel(lang, v){
  if (v==="stepless") return lang==="es" ? "Tornillo infinito (stepless)" : "Stepless (worm screw)";
  if (v==="stepped") return lang==="es" ? "Escalonado" : "Stepped";
  return v;
}

// ======== Texts ========
const STRINGS = {
  es: {

    help: {
  "params": {
    "grindSize": "Ajuste del molino. Más fino = menor caudal y mayor extracción; más grueso = mayor caudal y menor extracción. Úsalo como tu control principal.",
    "doseCoffee": "Gramos de café seco en el portafiltro. Afecta intensidad y presión. Con canasta nominal, mantén dosis ≈ tamaño de canasta ±1 g.",
    "basketSize": "Capacidad nominal de la canasta en gramos. Define el rango recomendado de dosis (N ±1 g).",
    "time": "Tiempo total desde el primer goteo hasta cortar la extracción. Menos tiempo = menos extracción; más tiempo = más extracción.",
    "beverageMass": "Peso de la bebida en taza. Determina el ratio bebida/dosis. Ratios comunes: 1.8–2.4 para espresso moderno.",
    "tds": "Sólidos Disueltos Totales (%). Si tienes refractómetro, actívalo para medir TDS y calcular EY con mayor precisión.",
    "temp": "Temperatura de salida del grupo. Más alta tiende a extraer más (y resalta amargos); más baja reduce extracción (puede resaltar acidez).",
    "tampPressure": "Fuerza del tamper (1–8). Impacta el caudal si es muy baja o muy alta o si está desnivelado; en rangos medios su efecto es menor que la molienda."
  },
  "defects": {
    "sour": "Ácido/verde: típico de subextracción (molienda muy gruesa, tiempo corto o ratio muy alto).",
    "bitter": "Amargo: típico de sobreextracción (molienda muy fina, tiempo largo, temperatura alta) o tueste muy oscuro.",
    "astringent": "Sensación secante/rasposa: canales, molienda demasiado fina o filtrado excesivo.",
    "weak": "Acuoso/débil: poco cuerpo; puede deberse a ratio alto, dosis baja o molienda demasiado gruesa.",
    "harsh": "Áspero/desbalanceado: combinación de defectos (canalización, temperatura inadecuada, distribución)."
  },
  "positives": {
    "balanced": "Equilibrio general entre dulzor, acidez y amargo.",
    "body": "Cuerpo/viscosidad en boca; sube con extracción y emulsión adecuadas.",
    "aroma": "Complejidad aromática; mejora con tueste adecuado y extracción uniforme.",
    "sweetness": "Dulzor percibido; aumenta con extracción suficiente sin llegar a amargos."
  },
  "grinder": {
    "type": "Tipo de ajuste del molino: continuo (stepless) o escalonado (stepped). Determina la precisión de ajuste.",
    "perRevMax": "Rango de números que cubre una vuelta completa del dial. Útil para registrar posiciones.",
    "dialNumber": "Número actual del dial. Se usa junto con vueltas para registrar el punto exacto.",
    "extraTurns": "Vueltas completas adicionales desde 0. Por ejemplo, 2 vueltas completas + 3.2 en el dial.",
    "highDialMeansCoarser": "Actívalo si números más altos significan más grueso en tu molino (en algunos es al revés)."
  },
  "extras": {
    "freshness": "Tueste muy reciente: el CO₂ puede generar burbujeo y desbalance. Deja reposar algunos días o ajusta molienda.",
    "badDistribution": "Distribución desigual: usa WDT/distribuidor para evitar canalización y mejorar uniformidad.",
    "unevenTamp": "Tamper desnivelado: genera canales. Asegura un nivelado consistente.",
    "inaccurateDose": "Dosis imprecisa: pesa con báscula precisa para repetir resultados.",
    "brokenPuck": "Puck roto/canalización: revisa molienda, distribución y nivelado; considera duchas/discos de precarga."
  }
},
      extras: {
        freshness: "Very fresh roast: CO₂/bubbling can unbalance extraction.",
        badDistribution: "Poor distribution: use WDT/distributor to even grounds.",
        unevenTamp: "Uneven tamp: keep level to avoid channeling.",
        inaccurateDose: "Inaccurate dose: weigh precisely.",
        brokenPuck: "Broken puck/channeling: check prep and calibration.",
      },
    
      extras: {
        freshness: "Tueste muy reciente: CO₂ y burbujeo pueden desbalancear la extracción.",
        badDistribution: "Mala distribución: usa WDT o distribuidor para uniformar.",
        unevenTamp: "Tamper desnivelado: procura nivelar para evitar canalización.",
        inaccurateDose: "Dosis imprecisa: pesa con báscula precisa.",
        brokenPuck: "Puck roto/canalización: revisa distribución y calibración.",
      },
     edit:"Editar", save:"Guardar", cancel:"Cancelar", useTDS:"Usar TDS", params:"Parámetros", defects:"Defectos", positives:"Positivos", extras:"Extras", grinderState:"Molino", recalcNote:"Corrige datos mal introducidos y vuelve a correr el modelo.", revertAll:"Revertir todo", revertField:"Revertir", drawerTitle:"Editar registro" },
  en: {

    help: {
  "params": {
    "grindSize": "Grinder adjustment. Finer = lower flow & higher extraction; coarser = higher flow & lower extraction. Primary control.",
    "doseCoffee": "Grams of dry coffee in the basket. Affects intensity and pressure. With a nominal basket, keep dose ≈ basket size ±1 g.",
    "basketSize": "Nominal basket capacity (g). Defines the recommended dose range (N ±1 g).",
    "time": "Total time from first drip until stopping the shot. Shorter = less extraction; longer = more extraction.",
    "beverageMass": "Beverage weight in cup. Determines beverage/dose ratio. Common espresso ratios: 1.8–2.4.",
    "tds": "Total Dissolved Solids (%). If you have a refractometer, enable it to measure TDS and compute EY more accurately.",
    "temp": "Group outlet temperature. Higher tends to extract more (can emphasize bitterness); lower extracts less (can emphasize acidity).",
    "tampPressure": "Tamping force (1–8). Matters mainly at extremes or when uneven; grind size has a larger effect in normal ranges."
  },
  "defects": {
    "sour": "Sour/green: typical of under‑extraction (too coarse, too short, or very high ratio).",
    "bitter": "Bitter: typical of over‑extraction (too fine, too long, high temperature) or very dark roast.",
    "astringent": "Drying/astringent: channeling, too fine, or over‑filtering.",
    "weak": "Watery/weak: low body; can be due to high ratio, low dose, or too coarse.",
    "harsh": "Harsh/unbalanced: combination of faults (channeling, wrong temperature, poor distribution)."
  },
  "positives": {
    "balanced": "Overall balance across sweetness, acidity, and bitterness.",
    "body": "Mouthfeel/viscosity; increases with proper extraction and emulsification.",
    "aroma": "Aromatic complexity; benefits from an appropriate roast and uniform extraction.",
    "sweetness": "Perceived sweetness; rises with sufficient extraction without drifting into bitterness."
  },
  "grinder": {
    "type": "Grinder adjustment type: stepless or stepped. Determines adjustment precision.",
    "perRevMax": "Number range covered by one full turn of the dial. Useful to log positions.",
    "dialNumber": "Current dial number. Used together with turns to record the exact point.",
    "extraTurns": "Full extra turns from zero. E.g., 2 full turns + 3.2 on the dial.",
    "highDialMeansCoarser": "Enable if higher numbers mean coarser on your grinder (some are reversed)."
  },
  "extras": {
    "freshness": "Very fresh roast: CO₂ can cause bubbling and imbalance. Rest beans a few days or adjust grind.",
    "badDistribution": "Uneven distribution: use WDT/distributor to prevent channeling and improve uniformity.",
    "unevenTamp": "Uneven tamp: causes channels. Keep tamp level and consistent.",
    "inaccurateDose": "Inaccurate dose: use a precise scale to repeat results.",
    "brokenPuck": "Broken puck/channeling: review grind, distribution, leveling; consider pre‑wetting showers/screens."
  }
}, edit:"Edit", save:"Save", cancel:"Cancel", useTDS:"Use TDS", params:"Params", defects:"Defects", positives:"Positives", extras:"Extras", grinderState:"Grinder", recalcNote:"Fix wrong inputs and re‑run the model.", revertAll:"Revert all", revertField:"Revert", drawerTitle:"Edit entry" },

  es: {
    appTitle: "Espresso Dial In",
    appSubtitle: "Ajusta tu espresso paso a paso",
    mainTab: "Ajustes",
    tutorialTab: "Tutorial",
    tutorialTitle: "Cómo usar la app",
    grinder: "Molino",
    grinderType: "Tipo de molino",
    grinderStepless: "Tornillo infinito (stepless)",
    grinderStepped: "Escalonado",
    dialPerRevMax: "Rango por vuelta (número máximo del dial)",
    currentDial: "Número actual en el dial",
    extraTurns: "Vueltas (veces que pasó por 0)",
    grinderNote: "La pista del dial se muestra con X (p.ej.: 3.2 xx → 2.8 x).",
    params: "Parámetros",
    useTDS: "Usar TDS/EY (refractómetro)",
    noMeterHint: "Si no tienes refractómetro, desmarca: se estima por sabor/flujo.",
    defects: "Defectos sensoriales",
    positives: "Atributos positivos",
    extras: "Factores adicionales",
    analyze: "Analizar",
    exportSession: "Exportar sesión (CSV)",
    exportHistory: "Exportar historial (CSV)",
    clearHistory: "Borrar historial",
    suggestionTitle: "Sugerencia",
    grinderState: "Estado del molino",
    modelTitle: "Motor predictivo (beta)",
    modelNote: "Se reentrena con cada sesión. La molienda es prioritaria; tamper solo si es extremo o hay mala nivelación.",
    modelTip: "Nota: el motor predictivo mejora después de al menos 5 pruebas registradas.",
    chartTitle: "Brew Control Chart (TDS vs EY)",
    chartNote: "Zona objetivo de referencia: TDS 8–12% y EY 18–22%.",
    compassTitle: "Compás del Espresso (EY vs TDS)",
    compassNote: "‘Fuerza’≈TDS. Visualiza fuerte/débil vs sub/sobre-extracción.",
    historyTitle: "Historial",
    thDate: "Fecha",
    thTDS: "TDS",
    thEY: "EY",
    thChange: "Cambio sugerido",
    impactTitle: "Impacto relativo",
    tasteFoot: "*Sabor = positivos normalizados – defectos normalizados. Tamper se de‑prioriza salvo extremos o mala nivelación.",
    metricsPrefix: "Métricas",
    otherSuggestions: "Otras sugerencias",
    extrasPriority: "Nota: los factores adicionales (distribución, canalización, nivelado, etc.) tienen prioridad sobre los ajustes numéricos.",
    basketRuleActive: "Regla de canasta activa",
    langES: "ES",
    langEN: "EN",
  },
  en: {
    appTitle: "Espresso Dial In",
    appSubtitle: "Dial in your espresso step by step",
    mainTab: "Dial",
    tutorialTab: "Tutorial",
    tutorialTitle: "How to use the app",
    grinder: "Grinder",
    grinderType: "Grinder type",
    grinderStepless: "Stepless (worm screw)",
    grinderStepped: "Stepped",
    dialPerRevMax: "Range per turn (dial max number)",
    currentDial: "Current dial number",
    extraTurns: "Turns (times it passed 0)",
    grinderNote: "Dial track shows X notation (e.g., 3.2 xx → 2.8 x).",
    params: "Parameters",
    useTDS: "Use TDS/EY (refractometer)",
    noMeterHint: "If you don’t have a refractometer, uncheck: values are estimated from taste/flow.",
    defects: "Sensory defects",
    positives: "Positive attributes",
    extras: "Additional factors",
    analyze: "Analyze",
    exportSession: "Export session (CSV)",
    exportHistory: "Export history (CSV)",
    clearHistory: "Clear history",
    suggestionTitle: "Suggestion",
    grinderState: "Grinder state",
    modelTitle: "Predictive engine (beta)",
    modelNote: "Retrains each session. Grind dominates; tamp only if extreme or uneven.",
    modelTip: "Note: the predictive engine performs better after at least 5 logged trials.",
    chartTitle: "Brew Control Chart (TDS vs EY)",
    chartNote: "Reference target zone: TDS 8–12% and EY 18–22%.",
    compassTitle: "Espresso Compass (EY vs TDS)",
    compassNote: "“Strength”≈TDS. See strong/weak vs under/over-extraction.",
    historyTitle: "History",
    thDate: "Date",
    thTDS: "TDS",
    thEY: "EY",
    thChange: "Suggested change",
    impactTitle: "Relative impact",
    tasteFoot: "*Taste = normalized positives – normalized defects. Tamp is de‑prioritized unless extreme or uneven.",
    metricsPrefix: "Metrics",
    otherSuggestions: "Other suggestions",
    extrasPriority: "Note: additional factors (distribution, channeling, leveling, etc.) take priority over numeric adjustments.",
    basketRuleActive: "Basket rule active",
    langES: "ES",
    langEN: "EN",
  },
};

const TUTORIAL = {
  es: {
    intro: "Este tutorial resume qué hace cada parámetro y cómo se calculan las recomendaciones.",
    sections: [
      {
        title: "Pasos para usar la app",
        items: [
          "Configura el molino: tipo (infinito/escalonado), rango por vuelta (máximo del dial), número actual y vueltas (X).",
          "Ajusta parámetros: molienda (0–10), dosis, tiempo, rendimiento en taza, temperatura y presión del tamper.",
          "Marca defectos y atributos positivos según el sabor percibido.",
          "Marca factores adicionales si aparecen (distribución, canalización, etc.). Estos tienen prioridad sobre ajustes numéricos.",
          "Pulsa Analizar para obtener la sugerencia principal y dos alternativas.",
          "Puedes exportar sesión o historial, o borrar historial.",
          "Si tienes refractómetro, activa TDS/EY. Si no, el sistema los estima."
        ]
      },
      {
        title: "Qué significa cada parámetro",
        items: [
          "Nivel de molienda: 0=fino, 10=grueso (más fino → más EY y TDS).",
          "Dosis (g): café seco en el portafiltro. Con canasta de N g, el rango válido es N±1 g.",
          "Tamaño de la canasta (g): define el rango de dosis permitido.",
          "Tiempo (s): duración de la extracción.",
          "Rendimiento en taza (g): masa de líquido en la taza.",
          "Temperatura (°C): temperatura del agua; más alta suele ↑ EY.",
          "Presión del tamper: 1–8; se de‑prioriza salvo extremos o desnivel.",
          "TDS (%): “fuerza”. Con medidor; si no, se estima.",
          "EY (%): “extracción”. EY = (TDS × bebida) / dosis.",
          "Relación (ratio): bebida/dosis. Caudal: bebida/tiempo."
        ]
      },
      {
        title: "Gráficas",
        items: [
          "Brew Control Chart: X=TDS, Y=EY. Cuadro objetivo TDS 8–12%, EY 18–22%.",
          "Compás del Espresso: X=EY, Y=TDS. Cruces en EY 20% y TDS 10%; flecha muestra el movimiento sugerido."
        ]
      },
      {
        title: "Reglas de decisión",
        items: [
          "Prioridad: factores adicionales primero (distribución/canalización), luego ajustes de molienda/dosis/tiempo.",
          "Regla de canasta: dosis dentro de N±1 g. Si no, se corrige antes de cualquier otra cosa.",
          "Sensorial: agrio ⇒ moler más fino; amargo ⇒ más grueso.",
          "Objetivos: acercarse a EY≈20% y TDS≈10% con buen sabor.",
          "Motor predictivo (beta): ridge con priors; aprende de tu historial y mejora tras ≥5 pruebas."
        ]
      }
    ]
  },
  en: {
    intro: "This tutorial explains each parameter and how recommendations are computed.",
    sections: [
      {
        title: "Steps to use the app",
        items: [
          "Set the grinder: type (stepless/stepped), range per turn (dial max), current number and turns (X).",
          "Adjust parameters: grind (0–10), dose, time, beverage mass, temperature, tamp pressure.",
          "Mark sensory defects and positive attributes.",
          "Enable additional factors if present (distribution, channeling, etc.). These have priority over numeric tweaks.",
          "Click Analyze to get the primary suggestion plus two alternates.",
          "You can export the session or history, or clear history.",
          "If you own a refractometer, enable TDS/EY; otherwise they are estimated."
        ]
      },
      {
        title: "What each parameter means",
        items: [
          "Grind setting: 0=fine, 10=coarse (finer → ↑ EY and TDS).",
          "Dose (g): dry coffee in the basket. With an N‑g basket, valid range is N±1 g.",
          "Basket size (g): defines the allowed dose range.",
          "Shot time (s): extraction duration.",
          "Output (g): beverage mass in the cup.",
          "Temperature (°C): water temp; higher usually ↑ EY.",
          "Tamp pressure: 1–8; de‑prioritized unless extreme or uneven.",
          "TDS (%): strength. Measured if enabled; else estimated.",
          "EY (%): extraction. EY = (TDS × beverage) / dose.",
          "Ratio: beverage/dose. Flow: beverage/time."
        ]
      },
      {
        title: "Charts",
        items: [
          "Brew Control Chart: X=TDS, Y=EY. Target box TDS 8–12%, EY 18–22%.",
          "Espresso Compass: X=EY, Y=TDS. Crosshairs at EY 20% and TDS 10%; arrow shows suggested move."
        ]
      },
      {
        title: "Decision rules",
        items: [
          "Priority: additional factors first (distribution/channeling), then grind/dose/time.",
          "Basket rule: dose must be within N±1 g. If not, fix before anything else.",
          "Sensory: sour ⇒ finer; bitter ⇒ coarser.",
          "Targets: approach EY≈20% and TDS≈10% with good taste.",
          "Predictive engine (beta): ridge with priors; learns from your history and improves after ≥5 trials."
        ]
      }
    ]
  }
};

function useLangDefault() {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem("espressoLang");
      if (saved === "es" || saved === "en") return saved;
      if (navigator?.language?.toLowerCase().startsWith("es")) return "es";
    } catch {}
    return "es";
  });
  useEffect(() => { try { localStorage.setItem("espressoLang", lang); } catch {} }, [lang]);
  return [lang, setLang];
}

// ======== Helpers ========
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const dialAbs = (dialNumber, extraTurns, perRevMax) =>
  Math.max(0, (Number(extraTurns) || 0) * (Number(perRevMax) || 1) + (Number(dialNumber) || 0));
const absToDial = (abs, perRevMax) => {
  const pr = Math.max(1, Number(perRevMax) || 1);
  const turns = Math.floor(Math.max(0, abs) / pr);
  const num = abs - turns * pr;
  return { dialNumber: Number(num.toFixed(1)), extraTurns: turns };
};
const dialString = (dialNumber, extraTurns) =>
  `${Number(dialNumber).toFixed(1)}${extraTurns > 0 ? " " + "x".repeat(extraTurns) : ""}`;

// ======== Ridge ========
function ridgeSolvePrior(X, y, lambdas, wprior) {
  const n = X.length;
  const d = (X[0] || []).length;
  if (!n || !d) return Array(d).fill(0);
  const A = Array.from({ length: d }, () => Array(d).fill(0));
  const b = Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let j = 0; j < d; j++) {
      b[j] += xi[j] * y[i];
      for (let k = 0; k < d; k++) A[j][k] += xi[j] * xi[k];
    }
  }
  for (let j = 0; j < d; j++) {
    A[j][j] += (lambdas[j] ?? 0);
    b[j] += (lambdas[j] ?? 0) * (wprior[j] ?? 0);
  }
  // Gauss-Jordan
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let col = 0; col < d; col++) {
    let piv = col;
    for (let r = col + 1; r < d; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) continue;
    if (piv !== col) { const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp; }
    const div = M[col][col];
    for (let c = col; c <= d; c++) M[col][c] /= div;
    for (let r = 0; r < d; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= d; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map(row => row[d] || 0);
}

// ======== Features & scoring ========

function tasteScore(entry) {
  const pos = entry?.positives || {}, neg = entry?.defects || {};
  const pSum = (pos.balanced||0)+(pos.body||0)+(pos.aroma||0)+(pos.sweetness||0);
  const nSum = (neg.sour||0)+(neg.bitter||0)+(neg.astringent||0)+(neg.weak||0)+(neg.harsh||0);
  return (pSum/40) - (nSum/50);
}
function estimateEY(p, ex, ratio) {
  let ey = 19.5;
  if (ratio != null) ey += (ratio - 2.0) * 1.5;
  ey += (5 - (p.grindSize ?? 5)) * 0.8;
  ey += ((p.time ?? 28) - 28) * 0.25;
  ey += ((p.temp ?? 93) - 93) * 0.15;
  ey -= Math.max(0, Math.abs((p.tampPressure ?? 5) - 5)) * 0.05;
  if (ex?.freshness) ey -= 1.0;
  if (ex?.badDistribution) ey -= 1.5;
  if (ex?.unevenTamp) ey -= 1.2;
  if (ex?.brokenPuck) ey -= 1.5;
  return clamp(ey, 10, 30);
}

function featuresFromParams(p) {
  const grind = Number(p.grindSize ?? 5);
  const tamp  = Number(p.tampPressure ?? 5);
  const dose  = Number(p.doseCoffee ?? 18);
  const time  = Number(p.time ?? 28);
  const ratio = (p.doseCoffee && p.beverageMass) ? (Number(p.beverageMass)/Number(p.doseCoffee)) : 2.0;
  // intercept + [grind, tamp, dose, time, ratio]  => length 6 (matches priors)
  return [1.0, grind, tamp, dose, time, ratio];
}

function estimateTDS(p, EY) {
  if (!p.beverageMass || !p.doseCoffee) return null;
  const ey = EY ?? 20;
  return clamp((p.doseCoffee * ey) / p.beverageMass, 4, 14);
}

// ======== Rank influence ========
function rankInfluence(models, lang) {
  const names = ["grindSize","tampPressure","doseCoffee","time","ratio"];
  const labels = lang==="es" ?
    {grindSize:"Molienda",tampPressure:"Presión del tamper",doseCoffee:"Dosis (g)",time:"Tiempo (s)"} :
    {grindSize:"Grind",tampPressure:"Tamp pressure",doseCoffee:"Dose (g)",time:"Time (s)"};
  const arr = names.map((n, i) => {
    const wt = Math.abs(models.wT[i+1] || 0);
    const we = Math.abs(models.wE[i+1] || 0);
    const ws = Math.abs(models.wS[i+1] || 0);
    return { name: labels[n] || n, key: n, weight: (wt + we + ws) / 3 };
  });
  arr.sort((a, b) => b.weight - a.weight);
  return arr;
}


// ======== EN+BO Utilities (Elastic Net + GP-RBF Bayesian Optimization) ========
function _dot(a,b){ let s=0; for(let i=0;i<a.length;i++) s+= (a[i]||0)*(b[i]||0); return s; }
function _solve(Ain, bin){ const n=Ain.length; const A=Ain.map(r=>r.slice()); const b=bin.slice();
  for(let i=0;i<n;i++){ let piv=i; for(let r=i+1;r<n;r++) if(Math.abs(A[r][i])>Math.abs(A[piv][i])) piv=r;
    if(Math.abs(A[piv][i])<1e-12) continue; if(piv!==i){ const t=A[i];A[i]=A[piv];A[piv]=t; const tb=b[i];b[i]=b[piv];b[piv]=tb; }
    const div=A[i][i]; for(let c=i;c<n;c++) A[i][c]/=div; b[i]/=div;
    for(let r=0;r<n;r++){ if(r===i) continue; const f=A[r][i]; for(let c=i;c<n;c++) A[r][c]-=f*A[i][c]; b[r]-=f*b[i]; }
  } return b; }
function _standardize(X){ const n=X.length,d=X[0].length; const means=Array(d).fill(0),stds=Array(d).fill(0);
  for(let j=0;j<d;j++){ let s=0; for(let i=0;i<n;i++) s+=X[i][j]; means[j]=s/n; let v=0; for(let i=0;i<n;i++){ const t=X[i][j]-means[j]; v+=t*t; } stds[j]=Math.sqrt(v/Math.max(1,n-1))||1; }
  const Xs=X.map(row=>row.map((v,j)=>(v-means[j])/stds[j])); return {Xs,means,stds}; }
function _soft(a,k){ if(a>k) return a-k; if(a<-k) return a+k; return 0; }
function fitElasticNetBasic(X,y,alpha=0.25,l1_ratio=0.5,maxIter=1500,tol=1e-5){
  const n=X.length,d=X[0].length; const yMean=y.reduce((s,v)=>s+v,0)/n; const yc=y.map(v=>v-yMean);
  const {Xs,means,stds}=_standardize(X); let w=Array(d).fill(0);
  const l1=alpha*l1_ratio, l2=alpha*(1-l1_ratio); const colN=Array(d).fill(0);
  for(let j=0;j<d;j++){ let s=0; for(let i=0;i<n;i++) s+=Xs[i][j]*Xs[i][j]; colN[j]=s+l2*n; }
  for(let it=0;it<maxIter;it++){ let md=0; for(let j=0;j<d;j++){ let rho=0;
      for(let i=0;i<n;i++){ let pred=0; for(let k=0;k<d;k++) if(k!==j) pred+=Xs[i][k]*w[k]; rho += Xs[i][j]*(yc[i]-pred); }
      const nw=_soft(rho,l1*n)/colN[j]; md=Math.max(md,Math.abs(nw-w[j])); w[j]=nw; } if(md<tol) break; }
  const w_orig=w.map((wj,j)=>wj/stds[j]); const intercept=yMean - _dot(w_orig,means); const predict=(x)=>intercept + _dot(w_orig,x);
  return {w:w_orig, intercept, predict};
}
function _rbf(x,z,l=1.0,v=1.0){ let s=0; for(let i=0;i<x.length;i++){ const u=(x[i]-z[i])/l; s+=u*u; } return v*Math.exp(-0.5*s); }
function _gpPosterior(X,y,Xstar,l=1.0,v=1.0,noise=1e-6){
  const n=X.length; const K=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++){ for(let j=0;j<n;j++){ K[i][j]=_rbf(X[i],X[j],l,v); if(i===j) K[i][j]+=noise; } }
  const alpha=_solve(K,y); const mu=[],sig=[];
  for(let t=0;t<Xstar.length;t++){ const kstar=X.map(xi=>_rbf(xi,Xstar[t],l,v)); const mu_t=kstar.reduce((s,kv,i)=>s+kv*alpha[i],0);
    const w=_solve(K.map(r=>r.slice()), kstar.slice()); const kss=_rbf(Xstar[t],Xstar[t],l,v)+noise; const var_t=Math.max(1e-12,kss - kstar.reduce((s,kv,i)=>s+kv*w[i],0));
    mu.push(mu_t); sig.push(Math.sqrt(var_t)); } return {mu,sig};
}
function _phi(x){ return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI); }
function _Phi(x){ const t=1/(1+0.2316419*Math.abs(x)); const d=0.3989423*Math.exp(-x*x/2);
  let p=d*t*(0.3193815 + t*(-0.3565638 + t*(1.781478 + t*(-1.821256 + t*1.330274)))); if(x>0) p=1-p; return p; }
function _EI(mu,sigma,best,xi=0.01){ if(sigma<1e-12) return 0; const Z=(mu-best-xi)/sigma; return (mu-best-xi)*_Phi(Z)+sigma*_phi(Z); }
function _boundsFromRanges(ranges){
  return [
    [ranges.grindSize.min, ranges.grindSize.max],
    [ranges.doseCoffee.min, ranges.doseCoffee.max],
    [ranges.beverageMass.min, ranges.beverageMass.max],
    [ranges.time.min, ranges.time.max],
    [ranges.temp.min, ranges.temp.max],
    [ranges.tampPressure.min, ranges.tampPressure.max],
  ];
}
function _normalizeRowsByBounds(X,bounds){ return X.map(row=>row.map((v,j)=>{ const lo=bounds[j][0], hi=bounds[j][1]; return (v-lo)/Math.max(1e-9,(hi-lo)); })); }
function _randCand(bounds){ return bounds.map(([lo,hi])=> lo + Math.random()*(hi-lo)); }
function _buildTrainingFromHistory(history){
  const feats = (p)=>[ Number(p.grindSize??5), Number(p.doseCoffee??18), Number(p.beverageMass??36), Number(p.time??28), Number(p.temp??93), Number(p.tampPressure??5) ];
  const X=[], y=[]; for(const e of history||[]){ const p=e?.params||{}; const xi=feats(p); const yi = tasteScore(e); if (isFinite(yi)) { X.push(xi); y.push(yi); } }
  return {X,y};
}
function _humanizeENBOChange(curr, sugg, lang="es", highDialMeansCoarser=true){
  const msgs = [];
  const dir = (v)=> v>0 ? (lang==="es"?"sube":"increase") : (lang==="es"?"baja":"decrease");
  const sign = (x)=> (x>0?"+":"") + x.toFixed(1);
  if (Number.isFinite(curr.grindSize) && Number.isFinite(sugg.grindSize)){
    const d = sugg.grindSize - curr.grindSize; if (Math.abs(d) >= 0.1){
      const coarse = highDialMeansCoarser ? (d>0) : (d<0);
      msgs.push(lang==="es"
        ? `${dir(d)} la molienda ${sign(d)} puntos del dial (${coarse?"más gruesa":"más fina"}). ${coarse?"Menos extracción: baja amargor/astringencia":"Más extracción: reduce agrio y sube dulzor (cuidado con sobreextraer)"}.`
        : `${dir(d)} grind by ${sign(d)} dial points (${coarse?"coarser":"finer"}). ${coarse?"Less extraction: lower bitterness/astringency":"More extraction: reduce sourness and increase sweetness (avoid over‑extraction)"}.`);
    }}
  if (Number.isFinite(curr.doseCoffee) && Number.isFinite(sugg.doseCoffee)){
    const d = sugg.doseCoffee - curr.doseCoffee; if (Math.abs(d) >= 0.2){
      msgs.push(lang==="es"
        ? `${dir(d)} la dosis ${sign(d)} g. Más dosis ↑ resistencia y cuerpo; menos dosis agiliza el flujo y puede aclarar el perfil.`
        : `${dir(d)} dose by ${sign(d)} g. More dose ↑ resistance/body; less dose speeds flow and can lighten the profile.`);
    }}
  if (Number.isFinite(curr.time) && Number.isFinite(sugg.time)){
    const d = sugg.time - curr.time; if (Math.abs(d) >= 0.5){
      msgs.push(lang==="es"
        ? `${dir(d)} el tiempo de extracción ${sign(d)} s. Más tiempo ⇒ más extracción/dulzor (hasta el límite); menos tiempo ⇒ menos extracción/menos amargor.`
        : `${dir(d)} shot time by ${sign(d)} s. Longer ⇒ more extraction/sweetness (to a point); shorter ⇒ less extraction/less bitterness.`);
    }}
  if (Number.isFinite(curr.tampPressure) && Number.isFinite(sugg.tampPressure)){
    const d = sugg.tampPressure - curr.tampPressure; if (Math.abs(d) >= 0.5){
      msgs.push(lang==="es"
        ? `${dir(d)} la presión del tamper ${sign(d)}. Más presión reduce el flujo (tiempos mayores); menos presión aumenta el flujo.`
        : `${dir(d)} tamp pressure by ${sign(d)}. More pressure reduces flow (longer times); less pressure increases flow.`);
    }}
  return msgs;
}
function suggestElasticNetBO(history, ranges, currParams){
  const TDS_LO=8, TDS_HI=12, EY_LO=18, EY_HI=22;
  function feasibleWithCurrentBev(candidate){
    const p = {
      grindSize: candidate.grindSize,
      tampPressure: candidate.tampPressure,
      doseCoffee: candidate.doseCoffee,
      time: candidate.time,
      temp: Number(currParams?.temp ?? 93),
      beverageMass: Number(currParams?.beverageMass ?? ( (currParams?.doseCoffee||18)*2.0 ))
    };
    const r = p.doseCoffee ? (p.beverageMass / p.doseCoffee) : null;
    const EY = estimateEY(p, currParams?.extras || {}, r);
    const TDS = estimateTDS(p, EY);
    return (EY!=null && TDS!=null && EY>=EY_LO && EY<=EY_HI && TDS>=TDS_LO && TDS<=TDS_HI);
  }

  const idx = [0,1,3,5]; // grind, dose, time, tamp
  const {X, y} = _buildTrainingFromHistory(history);
  if (X.length < 3) return { suggestion: null, info: {need: 3} };
  const proj = (row)=> idx.map(j=>row[j]);
  const Xp = X.map(proj);
  const yMin = Math.min(...y), yMax = Math.max(...y); const span=Math.max(1e-9, yMax-yMin);
  const yN = y.map(v => (v - yMin)/span);
  const boundsFull = _boundsFromRanges(ranges);
  const bounds = idx.map(j=>boundsFull[j]);
  const _normalize = (rows)=> rows.map(row => row.map((v,j)=>{
    const lo=bounds[j][0], hi=bounds[j][1]; return (v-lo)/Math.max(1e-9,(hi-lo));
  }));
  const Xn = _normalize(Xp);
  let avg=0, cnt=0;
  for(let i=0;i<Xn.length;i++) for(let j=i+1;j<Xn.length;j++){
    let d2=0; for(let k=0;k<Xn[0].length;k++){ const dv=Xn[i][k]-Xn[j][k]; d2+=dv*dv; } avg+=Math.sqrt(d2); cnt++;
  }
  const l = Math.max(0.12, (avg/cnt) || 0.25);
  const en = fitElasticNetBasic(Xp, yN);
  const last = Xp[Xp.length-1];
  const step = bounds.map(([lo,hi],j)=>0.05*(hi-lo)*(en.w[j]>=0?1:-1));
  let seed = last.map((v,j)=> Math.min(bounds[j][1], Math.max(bounds[j][0], v + step[j])) );
  const bestYN = Math.max(...yN);
  let bestCand=null, bestEI=-Infinity, bestMu=0, bestSigma=0;
  const N = 600;
  for(let t=0;t<N;t++){
    const cand = (t===0)? seed.slice() : _randCand(bounds);
    const candN = _normalize([cand])[0];
    const {mu, sig} = _gpPosterior(Xn, yN, [candN], l, 1.0, 1e-6);
    const candObj = { grindSize: jitter[0], doseCoffee: jitter[1], time: jitter[2], tampPressure: jitter[3] };
      const ok = feasibleWithCurrentBev(candObj);
      const ei = ok ? _EI(mu[0], sig[0], bestYN, 0.01) : -Infinity;
      if (ei>bestEI){ bestEI=ei; bestCand=cand; bestMu=mu[0]; bestSigma=sig[0]; }
  }
  if(bestCand){
    for(let t=0;t<60;t++){
      const jitter = bestCand.map((v,j)=>{
        const span=(bounds[j][1]-bounds[j][0])*0.03;
        let vv=v + (Math.random()*2-1)*span;
        vv = Math.min(bounds[j][1], Math.max(bounds[j][0], vv));
        return vv;
      });
      const candN = _normalize([jitter])[0];
      const {mu, sig} = _gpPosterior(Xn, yN, [candN], l, 1.0, 1e-6);
      const ei = _EI(mu[0], sig[0], bestYN, 0.01);
      if (ei>bestEI){ bestEI=ei; bestCand=jitter; bestMu=mu[0]; bestSigma=sig[0]; }
    }
  }
  if(!bestCand) return { suggestion: null, info: {need: 3} };
  const [grindSize, doseCoffee, time, tampPressure] = bestCand;
  return { suggestion: { grindSize, doseCoffee, time, tampPressure }, info: { mu: bestMu, sigma: bestSigma, ei: bestEI, l } };
}


// ======== Recommender ========
function recommend(params, defects, positives, extras, grinder, metrics, predictive) {
  const { eyUsed, tdsUsed, ratio } = metrics || {};
  const scores = new Map();
  const bump = (k, v = 1) => scores.set(k, (scores.get(k) || 0) + v);
  const flags = { extrasPriority: false, basket: null };

  // Basket rule ±1 g
  const basket = Number(params.basketSize || 0);
  if (basket > 0) {
    const minDose = Math.max(5, Math.round((basket - 1) * 10) / 10);
    const maxDose = Math.round((basket + 1) * 10) / 10;
    if (params.doseCoffee < minDose - 1e-6 || params.doseCoffee > maxDose + 1e-6) {
      bump("respect_basket_dose", 100);
      flags.basket = { size: basket, min: minDose, max: maxDose };
    }
  }

  // Extras priority
  if (extras?.brokenPuck) { bump("fix_channeling", 60); flags.extrasPriority = true; }
  if (extras?.badDistribution || extras?.unevenTamp) { bump("fix_distribution", 40); flags.extrasPriority = true; }
  if (extras?.inaccurateDose) { bump("respect_basket_dose", 30); flags.extrasPriority = true; }

  // Sensory
  if ((defects.sour ?? 0) >= 7) { bump("grind_finer", 4); bump("increase_temp", 1.2); }
  if ((defects.bitter ?? 0) >= 7) { bump("grind_coarser", 4); bump("decrease_temp", 1.2); }

  // Metrics
  // Sanity guard: ratio/time should drive grind direction predictably
  const r = metrics?.ratio ?? ((params.doseCoffee && params.beverageMass) ? params.beverageMass/params.doseCoffee : null);
  const t = Number(params.time || 0);
  if (r != null) {
    if (r >= 2.6 || t <= 22) bump("grind_finer", 5);
    if (r <= 1.6 || t >= 35) bump("grind_coarser", 5);
  }
  if (eyUsed != null) {
    if (eyUsed < 18) { bump("grind_finer", 2.2); bump("increase_ratio", 1.0); }
    if (eyUsed > 22) { bump("grind_coarser", 2.2); bump("decrease_ratio", 1.0); }
  }
  if (tdsUsed != null) {
    if (tdsUsed < 8) { bump("decrease_ratio", 1.8); }
    if (tdsUsed > 12) { bump("increase_ratio", 1.8); }
  }

  // Predictive gradient
  if (predictive) {
    const feats = featuresFromParams(params);
    const dot = (w, x) => w.reduce((s, wi, i) => s + wi * (x[i] ?? 0), 0);
    const tPred = dot(predictive.wT, feats);
    const ePred = dot(predictive.wE, feats);
    const sPred = dot(predictive.wS, feats);
    const tErr = tPred - 10, eErr = ePred - 20, cTaste = 1.2;
    for (let i = 1; i <= 4; i++) {
      const g = 2*tErr*(predictive.wT[i]||0) + 2*eErr*(predictive.wE[i]||0) - cTaste*(predictive.wS[i]||0);
      if (i===1) { if (g > 0) bump("grind_finer", 3.0); else bump("grind_coarser", 3.0); }
      if (i===2) {
        const tamp = params.tampPressure ?? 5;
        const relevant = (tamp < 4 || tamp > 6) || extras.unevenTamp || extras.badDistribution;
        const scale = relevant ? 1.0 : 0.3;
        if (g > 0) bump("decrease_tamp", 1.0 * scale); else bump("increase_tamp", 1.0 * scale);
      }
      if (i===3) { if (g > 0) bump("decrease_dose", 1.5); else bump("increase_dose", 1.5); }
      if (i===4) { if (g > 0) bump("decrease_time", 1.2); else bump("increase_time", 1.2); }
    }
  }

  if (flags.extrasPriority) {
    for (const k of Array.from(scores.keys())) if (!/^fix_/.test(k) && k !== "respect_basket_dose") scores.set(k, scores.get(k) * 0.6);
  }

  // Map to actions
  const pr = Math.max(1, Number(grinder?.perRevMax) || 10);
  const currAbs = dialAbs(grinder?.dialNumber ?? 0, grinder?.extraTurns ?? 0, pr);
  const fmtDial = (abs) => { const { dialNumber, extraTurns } = absToDial(abs, pr); return dialString(dialNumber, extraTurns); };
  const normStep = 0.2, deltaDial = normStep * pr;
  const coarseSign = (grinder?.highDialMeansCoarser ?? true) ? 1 : -1;
  const finerAbs = Math.max(0, currAbs - coarseSign * deltaDial), coarserAbs = Math.max(0, currAbs + coarseSign * deltaDial);
  const describe = () => {
    const xs = [];
    if (eyUsed != null) xs.push(`EY ${eyUsed.toFixed(1)}%`);
    if (tdsUsed != null) xs.push(`TDS ${tdsUsed.toFixed(1)}%`);
    if (ratio != null) xs.push(`${(ratio).toFixed(2)}:1`);
    return xs.join(" · ");
  };

  const mapAction = (k) => {
    const lang = (typeof navigator !== "undefined" && (localStorage.getItem("espressoLang") || navigator.language || "").toLowerCase().startsWith("es")) ? "es" : "en";
    switch (k) {
      case "fix_distribution":
        return { variable: null, change: lang==="es" ? "Corregir distribución/nivelado: WDT, distribución uniforme, tamper parejo (4–6). Priorízalo antes de tocar la molienda." : "Fix distribution/leveling: WDT, proper distribution, even tamp (4–6). Do this before changing grind.", reason: describe() };
      case "fix_channeling":
        return { variable: null, change: lang==="es" ? "Resolver canalización: mejorar distribución/nivelado, revisar integridad del puck; considerar un punto más grueso y preinfusión corta." : "Resolve channeling: improve distribution/leveling, check puck integrity; consider slightly coarser and short preinfusion.", reason: describe() };
      case "respect_basket_dose": {
        const basket = Number(params.basketSize || 0);
        const minDose = Math.max(5, Math.round((basket - 1) * 10) / 10);
        const maxDose = Math.round((basket + 1) * 10) / 10;
        const target = Math.max(minDose, Math.min(maxDose, params.doseCoffee));
        return { variable: "doseCoffee", change: (lang==="es"
          ? `Ajustar dosis a ${target.toFixed(1)} g para respetar canasta de ${basket} g (±1 g)`
          : `Adjust dose to ${target.toFixed(1)} g to respect a ${basket} g basket (±1 g)`), reason: describe() };
      }
      case "grind_finer": return { variable: "grindSize", change: `Moler más fino: ${params.grindSize.toFixed(1)} → ${(params.grindSize - normStep).toFixed(1)} (≈ Dial: ${fmtDial(currAbs)} → ${fmtDial(finerAbs)})`, reason: describe() };
      case "grind_coarser": return { variable: "grindSize", change: `Moler más grueso: ${params.grindSize.toFixed(1)} → ${(params.grindSize + normStep).toFixed(1)} (≈ Dial: ${fmtDial(currAbs)} → ${fmtDial(coarserAbs)})`, reason: describe() };
      case "increase_ratio": return { variable: "beverageMass", change: (lang==="es" ? `Aumentar rendimiento: ${params.beverageMass} → ${params.beverageMass + 4} g` : `Increase output: ${params.beverageMass} → ${params.beverageMass + 4} g`), reason: describe() };
      case "decrease_ratio": return { variable: "beverageMass", change: (lang==="es" ? `Disminuir rendimiento: ${params.beverageMass} → ${params.beverageMass - 4} g` : `Decrease output: ${params.beverageMass} → ${params.beverageMass - 4} g`), reason: describe() };
      case "increase_temp": return { variable: "temp", change: (lang==="es" ? `Subir temperatura: ${params.temp} → ${params.temp + 1} °C` : `Raise temperature: ${params.temp} → ${params.temp + 1} °C`), reason: describe() };
      case "decrease_temp": return { variable: "temp", change: (lang==="es" ? `Bajar temperatura: ${params.temp} → ${params.temp - 1} °C` : `Lower temperature: ${params.temp} → ${params.temp - 1} °C`), reason: describe() };
      case "decrease_dose": {
        const basket = Number(params.basketSize || 0);
        const minDose = basket ? Math.max(5, Math.round((basket - 1) * 10) / 10) : null;
        const newDose = params.doseCoffee - 0.5;
        const target = (minDose!=null) ? Math.max(newDose, minDose) : newDose;
        return { variable: "doseCoffee", change: (lang==="es" ? `Bajar dosis: ${params.doseCoffee} → ${target.toFixed(1)} g` : `Decrease dose: ${params.doseCoffee} → ${target.toFixed(1)} g`), reason: describe() };
      }
      case "increase_dose": {
        const basket = Number(params.basketSize || 0);
        const maxDose = basket ? Math.round((basket + 1) * 10) / 10 : null;
        const newDose = params.doseCoffee + 0.5;
        const target = (maxDose!=null) ? Math.min(newDose, maxDose) : newDose;
        return { variable: "doseCoffee", change: (lang==="es" ? `Subir dosis: ${params.doseCoffee} → ${target.toFixed(1)} g` : `Increase dose: ${params.doseCoffee} → ${target.toFixed(1)} g`), reason: describe() };
      }
      case "decrease_time": return { variable: "time", change: (lang==="es" ? `Disminuir tiempo: ${params.time} → ${params.time - 2} s` : `Decrease time: ${params.time} → ${params.time - 2} s`), reason: describe() };
      case "increase_time": return { variable: "time", change: (lang==="es" ? `Aumentar tiempo: ${params.time} → ${params.time + 2} s` : `Increase time: ${params.time} → ${params.time + 2} s`), reason: describe() };
      case "increase_tamp": return { variable: "tampPressure", change: (lang==="es" ? `Subir tamper: ${params.tampPressure} → ${params.tampPressure + 1}` : `Increase tamp: ${params.tampPressure} → ${params.tampPressure + 1}`), reason: describe() };
      case "decrease_tamp": return { variable: "tampPressure", change: (lang==="es" ? `Bajar tamper: ${params.tampPressure} → ${params.tampPressure - 1}` : `Decrease tamp: ${params.tampPressure} → ${params.tampPressure - 1}`), reason: describe() };
      default: return { variable: null, change: lang==="es" ? "Ajuste leve a la molienda" : "Slight grind adjustment", reason: describe() };
    }
  };

  // Ranking (fixes & basket first)
  let ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (ranked.includes("respect_basket_dose")) ranked = ["respect_basket_dose", ...ranked.filter(k => k !== "respect_basket_dose")];
  const fixes = ranked.filter(k => /^fix_/.test(k)), rest = ranked.filter(k => !/^fix_/.test(k));
  ranked = [...fixes, ...rest];

  const primaryKey = ranked[0] || "grind_finer";
  const principal = { key: primaryKey, ...mapAction(primaryKey) };
  const secundarios = ranked.slice(1,3).map(mapAction).map(a => a.change);
  return { principal, secundarios, flags };
}

// ======== UI: GrinderDial (clock-style) ========
function GrinderDial({ value, onChange, min = 0, max = 100, step = 1, decimals = 0 }) {
  const ref = React.useRef(null);
  const [drag, setDrag] = React.useState(false);

  const clamp = (v) => Math.min(max, Math.max(min, v));
  const roundToStep = (v) => {
    const inv = 1 / step;
    return Math.round(v * inv) / inv;
  };

  const START_ANGLE = 135; // degrees
  const END_ANGLE   = 405; // degrees (270° sweep)
  const SWEEP       = END_ANGLE - START_ANGLE;

  const valToAngle = (v) => {
    const t = (clamp(v) - min) / (max - min || 1);
    return START_ANGLE + t * SWEEP;
  };
  const angleToVal = (deg) => {
    let a = deg;
    a = ((a % 360) + 360) % 360;
    let delta = a - START_ANGLE;
    delta = ((delta % 360) + 360) % 360;
    if (delta > SWEEP) delta = SWEEP;
    const t = delta / SWEEP;
    return clamp(min + t * (max - min));
  };

  const angleFromCenter = (cx, cy, x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const rad = Math.atan2(dy, dx);
    return (rad * 180) / Math.PI;
  };

  const onPointer = (clientX, clientY) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const deg = angleFromCenter(cx, cy, clientX, clientY);
    const norm = ((deg % 360) + 360) % 360;
    const next = roundToStep(angleToVal(norm));
    onChange(next);
  };

  React.useEffect(() => {
    const move = (e) => { if (drag) onPointer(e.clientX, e.clientY); };
    const up = () => setDrag(false);
    if (drag) {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
    }
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag]);

  const onWheel = (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const next = clamp(roundToStep((Number(value) || 0) + dir * step));
    onChange(next);
  };

  const angle = valToAngle(value ?? min);
  const radius = 50;
  const ticks = 12;

  const polar = (angDeg, r) => {
    const a = (angDeg * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  const knobSize = 140;
  const center = knobSize / 2;

  return (
    <div
      ref={ref}
      className="relative w-[140px] h-[140px] mx-auto select-none"
      onWheel={onWheel}
      onPointerDown={(e) => { setDrag(true); onPointer(e.clientX, e.clientY); }}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          const next = clamp(roundToStep((Number(value) || 0) + step));
          onChange(next);
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          const next = clamp(roundToStep((Number(value) || 0) - step));
          onChange(next);
        }
      }}
    >
      <svg viewBox={`0 0 ${knobSize} ${knobSize}`} className="absolute inset-0">
        <circle cx={center} cy={center} r={radius} className="fill-none stroke-amber-300/20" strokeWidth="10" />
        {(() => {
          const start = START_ANGLE;
          const end = angle;
          const sweep = Math.max(0, Math.min(SWEEP, end - start >= 0 ? end - start : (end + 360) - start));
          const steps = Math.max(2, Math.round(sweep / 5));
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const a = start + (sweep * i) / steps;
            const [x, y] = polar(a, radius);
            pts.push(`${center + x},${center + y}`);
          }
          return (
            <polyline points={pts.join(" ")} className="fill-none stroke-amber-300/70" strokeWidth="10" strokeLinecap="round" />
          );
        })()}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const a = START_ANGLE + (SWEEP * i) / ticks;
          const [x1, y1] = polar(a, radius + 2);
          const [x2, y2] = polar(a, radius + (i % 3 === 0 ? 12 : 8));
          return (
            <line key={i} x1={center + x1} y1={center + y1} x2={center + x2} y2={center + y2} className="stroke-white/50" strokeWidth={i % 3 === 0 ? 2 : 1} />
          );
        })}
        <defs>
          <radialGradient id="knobFill" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)"/>
            <stop offset="100%" stopColor="rgba(251,191,36,0.25)"/>
          </radialGradient>
        </defs>
        <circle cx={center} cy={center} r={38} fill="url(#knobFill)" className="stroke-amber-200/50" strokeWidth="1"/>
        {(() => {
          const [px, py] = polar(angle, 36);
          return (
            <line x1={center} y1={center} x2={center + px} y2={center + py} className="stroke-yellow-300" strokeWidth="3" strokeLinecap="round" />
          );
        })()}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold text-white">{(Number(value) ?? min).toFixed(decimals)}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/60">Dial</div>
        </div>
      </div>


    </div>
  );
}

// ======== Component ========
export default function App() {
  const [lang, setLang] = useLangDefault();
  const T = STRINGS[lang];
  const [tab, setTab] = useState("main");
  // Inline help toggles
  const [helpOpen, setHelpOpen] = useState({});
  const toggleHelp = (key) => setHelpOpen(prev => ({ ...prev, [key]: !prev[key] }));


  // === Edit history drawer state ===
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState(null);
  const [initialDraft, setInitialDraft] = useState(null);

  const openEditor = (idx) => {
    setEditingIndex(idx);
    const base = JSON.parse(JSON.stringify(history[idx]));
    setDraft(base);
    setInitialDraft(base);
  };
  const closeEditor = () => { setEditingIndex(null); setDraft(null); setInitialDraft(null); };

  const updateDraft = (path, value) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev||{}));
      let obj = next;
      for (let i=0; i<path.length-1; i++) obj = obj[path[i]] = obj[path[i]] ?? {};
      obj[path[path.length-1]] = value;
      return next;
    });
  };
  const revertAll = () => { if (initialDraft) setDraft(JSON.parse(JSON.stringify(initialDraft))); };
  const revertField = (path) => {
    if (!initialDraft) return;
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev||{}));
      let obj = next, src = initialDraft;
      for (let i=0; i<path.length-1; i++) { obj = obj[path[i]] = obj[path[i]] ?? {}; src = src?.[path[i]]; }
      obj[path[path.length-1]] = src?.[path[path.length-1]];
      return next;
    });
  };
  const saveEditor = () => {
    if (editingIndex == null || !draft) return;
    try {
      const p = draft.params || {};
      const uses = !!draft.useTDS;
      const EY = uses && p.tds && p.beverageMass && p.doseCoffee ? (p.tds * p.beverageMass) / p.doseCoffee : (draft.ey ?? null);
      draft.ey = EY;
    } catch {}
    setHistory(prev => prev.map((e, i) => i===editingIndex ? draft : e));
    closeEditor();
  };


  const [params, setParams] = useState({ grindSize: 5, doseCoffee: 18, basketSize: 18, time: 28, beverageMass: 36, tds: 10, temp: 93, tampPressure: 5 });
  const [grinder, setGrinder] = useState({ type: "stepless", perRevMax: 10, dialNumber: 3.0, extraTurns: 0, highDialMeansCoarser: true });
  const [useTDS, setUseTDS] = useState(false);
  const [defects, setDefects] = useState({ sour: 0, bitter: 0, astringent: 0, weak: 0, harsh: 0 });
  const [positives, setPositives] = useState({ balanced: 0, body: 0, aroma: 0, sweetness: 0 });
  const [extras, setExtras] = useState({ freshness: false, badDistribution: false, unevenTamp: false, inaccurateDose: false, brokenPuck: false });

  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("espressoHistory") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("espressoHistory", JSON.stringify(history)); } catch {} }, [history]);

  const ratio = useMemo(() => (params.doseCoffee ? params.beverageMass / params.doseCoffee : null), [params.beverageMass, params.doseCoffee]);

  const eyReal = useMemo(() => (useTDS && params.tds && params.beverageMass && params.doseCoffee)
    ? (params.tds * params.beverageMass) / params.doseCoffee : null,
    [useTDS, params.tds, params.beverageMass, params.doseCoffee]);

  const eyEst = useMemo(() => (!useTDS ? estimateEY(params, extras, ratio) : null),
    [useTDS, ratio, params.grindSize, params.time, params.temp, params.tampPressure, extras]);

  const tdsUsed = useMemo(() => (useTDS && params.tds) ? params.tds : estimateTDS(params, eyReal ?? eyEst ?? 20),
    [useTDS, params.tds, params.beverageMass, params.doseCoffee, eyReal, eyEst]);

  const eyUsed = eyReal ?? eyEst ?? null;

  // Predictive model (priors when little data)
  const predictive = useMemo(() => {
    const wT_prior = [10.0, -0.55, 0.00, 0.15, 0.05, 0.00];
    const wE_prior = [20.0, -0.50, 0.00, 0.10, 0.12, 0.00];
    const wS_prior = [0.00, -0.12, 0.00, 0.05, 0.05, 0.00];

    if (!history || history.length < 3) return { wT: wT_prior, wE: wE_prior, wS: wS_prior, __usingPriors: true, n: 0 };

    const X = [], yT = [], yE = [], yS = [];
    for (const e of history) {
      const p = e.params || {};
      const feats = featuresFromParams(p);
      const r = p.doseCoffee ? p.beverageMass / p.doseCoffee : null;
      const EY = e.ey != null ? e.ey : estimateEY(p, e.extras || {}, r);
      const TDS = e.tds != null ? e.tds : estimateTDS(p, EY);
      const S = tasteScore(e);
      if (TDS != null && EY != null && isFinite(S)) { X.push(feats); yT.push(TDS); yE.push(EY); yS.push(S); }
    }
    if (X.length < 3) return { wT: wT_prior, wE: wE_prior, wS: wS_prior, __usingPriors: true, n: X.length };

    const L_T = [0.01, 0.08, 4.0, 0.25, 0.25, 0.30];
    const L_E = [0.01, 0.06, 4.0, 0.20, 0.22, 0.25];
    const L_S = [0.01, 0.10, 3.5, 0.30, 0.30, 0.30];

    const wT = ridgeSolvePrior(X, yT, L_T, wT_prior);
    const wE = ridgeSolvePrior(X, yE, L_E, wE_prior);
    const wS = ridgeSolvePrior(X, yS, L_S, wS_prior);
    return { wT, wE, wS, __usingPriors: false, n: X.length };
  }, [history]);

  const [suggestion, setSuggestion] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);

    // Advanced recommender state
  const [boSuggestion, setBoSuggestion] = useState(null);
  const [boInfo, setBoInfo] = useState(null);
  const [boBusy, setBoBusy] = useState(false);

  
  // Undo for deleted history entries
  const [undoDeleted, setUndoDeleted] = useState(null); // { entry, index }
// Grinder dial semantics: derive from grinder settings
  const highDialMeansCoarser = (grinder?.highDialMeansCoarser ?? true);
  const setHighDialMeansCoarser = (v) => setGrinder(g => ({...g, highDialMeansCoarser: !!(v?.target?.checked ?? v)}));
const onAnalyze = () => {
    const result = recommend(params, defects, positives, extras, grinder, { eyUsed, tdsUsed, ratio }, predictive);
    setSuggestion(result);
    const entry = {
      timestamp: new Date().toISOString(),
      params: { ...params }, grinder: { ...grinder }, defects: { ...defects }, positives: { ...positives }, extras: { ...extras },
      ey: useTDS ? eyReal : null, tds: useTDS ? params.tds : null, useTDS, result,
    };
    setHistory((prev) => [entry, ...prev]);

    const feats = featuresFromParams(params);
    const dot = (w, x) => w.reduce((s, wi, i) => s + wi * (x[i] ?? 0), 0);
    const tdsPred = dot(predictive.wT, feats);
    const eyPred = dot(predictive.wE, feats);
    const sPred = dot(predictive.wS, feats);
    const rank = rankInfluence(predictive, lang);
    setModelInfo({ tdsPred, eyPred, sPred, rank, usingPriors: !!predictive.__usingPriors, n: predictive.n });
  };
  
  const deleteHistoryAt = (idx) => {
    setHistory(prev => {
      if (idx < 0 || idx >= prev.length) return prev;
      const removed = prev[idx];
      const next = prev.slice(0, idx).concat(prev.slice(idx + 1));
      setUndoDeleted({ entry: removed, index: idx });
      return next;
    });
  };

  const undoDelete = () => {
    if (!undoDeleted) return;
    setHistory(prev => {
      const next = prev.slice();
      const i = Math.min(Math.max(0, undoDeleted.index), next.length);
      next.splice(i, 0, undoDeleted.entry);
      return next;
    });
    setUndoDeleted(null);
  };
const onGenerateBO = () => {
    setBoBusy(true);
    try {
      const { suggestion: s, info } = suggestElasticNetBO(history, ranges, params);
      setBoSuggestion(s);
      setBoInfo(info);
    } catch (e) {
      console.error("ElasticNet+BO error", e);
      setBoSuggestion(null);
      setBoInfo(null);
    } finally {
      setBoBusy(false);
    }
  };


  // Export / clear
  const toCSV = (rows) => {
    if (!rows || rows.length === 0) return "";
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const esc = (v) => (v == null ? "" : (/[\",\\n]/.test(String(v)) ? `"${String(v).replace(/\"/g, '""')}"` : String(v)));
    return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  };
  const triggerDownload = (filename, text) => {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename, rel: "noopener", style: "display:none" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const buildRow = (timestamp, p, d, pos, ex, eyVal, tdsVal, res, g) => {
    const ratioVal = p.doseCoffee ? p.beverageMass / p.doseCoffee : null;
    const flow = p.time ? p.beverageMass / p.time : null;
    return {
      timestamp,
      grindSize: p.grindSize, doseCoffee: p.doseCoffee, basketSize: p.basketSize, time: p.time, beverageMass: p.beverageMass,
      tds: tdsVal, temp: p.temp, tampPressure: p.tampPressure, ey: eyVal,
      ratio: ratioVal != null ? Number(ratioVal.toFixed(2)) : "", flow: flow != null ? Number(flow.toFixed(2)) : "",
      sour: d?.sour ?? 0, bitter: d?.bitter ?? 0, astringent: d?.astringent ?? 0, weak: d?.weak ?? 0, harsh: d?.harsh ?? 0,
      balanced: pos?.balanced ?? 0, body: pos?.body ?? 0, aroma: pos?.aroma ?? 0, sweetness: pos?.sweetness ?? 0,
      freshness: ex?.freshness ? 1 : 0, badDistribution: ex?.badDistribution ? 1 : 0, unevenTamp: ex?.unevenTamp ? 1 : 0, inaccurateDose: ex?.inaccurateDose ? 1 : 0, brokenPuck: ex?.brokenPuck ? 1 : 0,
      grinder_type: g?.type ?? "", grinder_perRevMax: g?.perRevMax ?? "", grinder_dialNumber: g ? `${dialString(g.dialNumber, g.extraTurns)}` : "",
      suggestion: res?.principal?.change ?? ""
    };
  };
  const exportCurrentCSV = () => {
    const res = suggestion || recommend(params, defects, positives, extras, grinder, { eyUsed, tdsUsed, ratio }, predictive);
    const row = buildRow(new Date().toISOString(), params, defects, positives, extras, eyUsed, tdsUsed, res, grinder);
    const csv = "\ufeff" + toCSV([row]);
    triggerDownload("espresso_sesion.csv", csv);
  };
  const exportHistoryCSV = () => {
    if (!history.length) return;
    const rows = history.map((e) => {
      const r = e.params.doseCoffee ? e.params.beverageMass / e.params.doseCoffee : null;
      const EY = e.ey ?? estimateEY(e.params, e.extras || {}, r);
      const TDS = e.tds ?? estimateTDS(e.params, EY);
      return buildRow(e.timestamp, e.params, e.defects || {}, e.positives || {}, e.extras || {}, EY, TDS, e.result, e.grinder || {});
    });
    const csv = "\ufeff" + toCSV(rows);
    triggerDownload("espresso_historial.csv", csv);
  };
  const clearHistory = () => { try { localStorage.removeItem("espressoHistory"); } catch {} setHistory([]); };

  // Derived history points for charts
  const historyPointsBrew = useMemo(() => {
    if (!history?.length) return [];
    return history.map(e => {
      const r = e.params?.doseCoffee ? e.params.beverageMass / e.params.doseCoffee : null;
      const EY = e.ey ?? estimateEY(e.params || {}, e.extras || {}, r);
      const TDS = e.tds ?? estimateTDS(e.params || {}, EY);
      return (EY!=null && TDS!=null) ? { x: TDS, y: EY } : null;
    }).filter(Boolean).slice(0, 100);
  }, [history]);

  const historyPointsCompass = useMemo(() => {
    if (!history?.length) return [];
    return history.map(e => {
      const r = e.params?.doseCoffee ? e.params.beverageMass / e.params.doseCoffee : null;
      const EY = e.ey ?? estimateEY(e.params || {}, e.extras || {}, r);
      const TDS = e.tds ?? estimateTDS(e.params || {}, EY);
      return (EY!=null && TDS!=null) ? { x: EY, y: TDS } : null;
    }).filter(Boolean).slice(0, 100);
  }, [history]);

  const ranges = {
    grindSize: { min: 0, max: 10, step: 0.1 },
    doseCoffee: { min: 5, max: 30, step: 0.1 },
    basketSize: { min: 5, max: 30, step: 1 },
    time: { min: 15, max: 40, step: 1 },
    beverageMass: { min: 1, max: 150, step: 0.1 },
    tds: { min: 1, max: 10, step: 1 },
    temp: { min: 80, max: 100, step: 1 },
    tampPressure: { min: 1, max: 8, step: 1 },
  };

  const defectLabels = {
    es: { sour: "Agrio", bitter: "Amargo", astringent: "Astringente", weak: "Acuoso", harsh: "Áspero" },
    en: { sour: "Sour", bitter: "Bitter", astringent: "Astringent", weak: "Watery", harsh: "Harsh" }
  }[lang];
  const positiveLabels = {
    es: { balanced: "Balance", body: "Cuerpo", aroma: "Aroma", sweetness: "Dulzor" },
    en: { balanced: "Balance", body: "Body", aroma: "Aroma", sweetness: "Sweetness" }
  }[lang];
  const extraLabels = {
    es: { freshness: "Café sin frescura", badDistribution: "Mala distribución", unevenTamp: "Desnivel del tamper", inaccurateDose: "Dosis inadecuada", brokenPuck: "Pastilla rota" },
    en: { freshness: "Stale coffee", badDistribution: "Poor distribution", unevenTamp: "Uneven tamp", inaccurateDose: "Inaccurate dose", brokenPuck: "Cracked puck" }
  }[lang];

  return (
    <div className="p-4 text-white space-y-6">
      <header className="rounded-xl border border-white/10 bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-amber-500/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center ring-1 ring-amber-300/40">
              <Coffee className="w-7 h-7 text-amber-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{T.appTitle}</h1>
              <p className="text-sm text-white/70">{T.appSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1 text-xs">
            <Globe className="w-4 h-4 mr-1" />
            <button onClick={() => setLang("es")} className={`px-2 py-0.5 rounded-full ${lang==="es"?"bg-amber-400 text-black":"text-white/80 hover:text-white"}`}>{T.langES}</button>
            <button onClick={() => setLang("en")} className={`px-2 py-0.5 rounded-full ${lang==="en"?"bg-amber-400 text-black":"text-white/80 hover:text-white"}`}>{T.langEN}</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setTab('main')} className={`px-3 py-1.5 rounded-full text-sm ${tab==='main'?'bg-amber-400 text-black':'bg-white/10 text-white/80 hover:bg-white/20'}`}>{T.mainTab}</button>
          <button onClick={() => setTab('tutorial')} className={`px-3 py-1.5 rounded-full text-sm ${tab==='tutorial'?'bg-amber-400 text-black':'bg-white/10 text-white/80 hover:bg-white/20'}`}>{T.tutorialTab}</button>
        </div>
      </header>

      {tab==='tutorial' && (
        <section className="bg-white/10 p-4 rounded">
          <h2 className="text-xl font-bold mb-2">{T.tutorialTitle}</h2>
          <p className="text-sm text-gray-300 mb-3">{TUTORIAL[lang].intro}</p>
          <div className="space-y-4">
            {TUTORIAL[lang].sections.map((sec, idx) => (
              <div key={idx} className="bg-white/5 rounded p-3">
                <h3 className="font-semibold mb-2">{sec.title}</h3>
                <ul className="list-disc list-inside text-sm text-white/90 space-y-1">
                  {sec.items.map((it, i) => (<li key={i}>{it}</li>))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab==='main' && (
        <>
        {/* Molino */}
        <section className="bg-white/10 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">{T.grinder}</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-start">
    <label className="block text-sm lg:col-span-1">
      <span className="mb-1 inline-flex items-center font-medium">
        <Wrench className="inline-block w-4 h-4 mr-1 align-middle" />{T.grinderType}
      </span>
      <select value={grinder.type} onChange={(e) => setGrinder({ ...grinder, type: e.target.value })}
        className="w-full bg-transparent border border-white/20 rounded px-2 py-1">
        <option value="stepless" className="bg-black">{T.grinderStepless}</option>
        <option value="stepped" className="bg-black">{T.grinderStepped}</option>
      </select>
    </label>

    <label className="block text-sm lg:col-span-1">
      <span className="mb-1 inline-flex items-center font-medium">
        <span className="inline-block w-4 h-4 mr-1 align-middle" />{lang==="es" ? "Dirección del dial" : "Dial direction"}
      </span>
      <div className="flex items-center gap-2">
        <input
          id="dialDirection"
          type="checkbox"
          checked={grinder.highDialMeansCoarser ?? true}
          onChange={(e) => setGrinder({ ...grinder, highDialMeansCoarser: e.target.checked })}
        />
        <label htmlFor="dialDirection" className="text-xs text-gray-300">
          {lang==="es" ? "Números altos → molienda más gruesa" : "Higher numbers → coarser grind"}
        </label>
      </div>
    </label>

    <div className="block text-sm lg:col-span-1">
      <span className="mb-2 inline-flex items-center font-medium">
        <Gauge className="inline-block w-4 h-4 mr-1 align-middle" />{T.dialPerRevMax}
      </span>
      <GrinderDial
        value={grinder.perRevMax}
        onChange={(v) => setGrinder({ ...grinder, perRevMax: Math.max(1, v) })}
        min={1}
        max={100}
        step={0.5}
        decimals={1}
      />
    </div>

    <div className="block text-sm lg:col-span-1">
      <span className="mb-2 inline-flex items-center font-medium">
        <SlidersHorizontal className="inline-block w-4 h-4 mr-1 align-middle" />{T.currentDial}
      </span>
      <GrinderDial
        value={grinder.dialNumber}
        onChange={(v) => setGrinder({ ...grinder, dialNumber: Math.max(0, v) })}
        min={0}
        max={grinder.perRevMax || 10}
        step={0.1}
        decimals={1}
      />
    </div>

    <div className="block text-sm lg:col-span-1">
      <span className="mb-2 inline-flex items-center font-medium">
        <Package className="inline-block w-4 h-4 mr-1 align-middle" />{T.extraTurns}
      </span>
      <GrinderDial
        value={grinder.extraTurns}
        onChange={(v) => setGrinder({ ...grinder, extraTurns: Math.max(0, Math.round(v)) })}
        min={0}
        max={50}
        step={1}
        decimals={0}
      />
    </div>
  </div>
  <p className="text-xs text-gray-300 mt-2">{T.grinderNote}</p>
        </section>

        {/* Parámetros */}
        <section className="bg-white/10 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">{T.params}</h2>
          <div className="mb-3 flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={useTDS} onChange={() => setUseTDS((v) => !v)} />
              {T.useTDS}
            </label>
            <span className="text-xs text-gray-300">{T.noMeterHint}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries({
              grindSize: lang==="es" ? "Nivel de molienda" : "Grind setting",
              doseCoffee: lang==="es" ? "Cantidad de café (g)" : "Dose (g)",
              basketSize: lang==="es" ? "Tamaño de la canasta (g)" : "Basket size (g)",
              time: lang==="es" ? "Tiempo de extracción (s)" : "Shot time (s)",
              beverageMass: lang==="es" ? "Rendimiento en taza (g)" : "Output (g)",
              ...(useTDS ? { tds: "TDS (%)" } : {}),
              temp: lang==="es" ? "Temperatura (°C)" : "Temperature (°C)",
              tampPressure: lang==="es" ? "Presión del tamper (1–8)" : "Tamp pressure (1–8)",
            }).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <div className="mb-1 flex items-center justify-between"><span className="inline-flex items-center font-medium">{paramIcons[key]} {label}</span><InfoPopover content={T?.help?.params?.[key]} /></div>
                <input
                  type="range"
                  min={ranges[key].min}
                  max={ranges[key].max}
                  step={ranges[key].step}
                  value={params[key]}
                  onChange={(e) => setParams({ ...params, [key]: parseFloat(e.target.value) })}
                  className="w-full accent-amber-300"
                />
                <span className="text-xs text-gray-300">{params[key]}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Defectos */}
        <section className="bg-white/10 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">{T.defects}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(defectLabels).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 inline-flex items-center font-medium">{defectIcons[key]} {label}</span><InfoPopover content={T?.help?.defects?.[key]} />
                <input type="range" min={0} max={10} step={1} value={defects[key]}
                  onChange={(e) => setDefects({ ...defects, [key]: parseInt(e.target.value) })}
                  className="w-full accent-red-400"/>
                <span className="text-xs text-gray-300">{defects[key]}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Positivos */}
        <section className="bg-white/10 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">{T.positives}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(positiveLabels).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 inline-flex items-center font-medium">{positiveIcons[key]} {label}</span><InfoPopover content={T?.help?.positives?.[key]} />
                <input type="range" min={0} max={10} step={1} value={positives[key]}
                  onChange={(e) => setPositives({ ...positives, [key]: parseInt(e.target.value) })}
                  className="w-full accent-green-400"/>
                <span className="text-xs text-gray-300">{positives[key]}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Extras */}
        <section className="bg-white/10 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">{T.extras}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(extraLabels).map(([key, label]) => (
              <label key={key} className="text-sm inline-flex items-center">
                {extraIcons[key]}
                <input type="checkbox" checked={!!extras[key]} onChange={() => setExtras({ ...extras, [key]: !extras[key] })} className="mr-2"/>
                {label}
              </label>
            ))}
          </div>
        </section>

        {/* Actions and metrics */}
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={onAnalyze} className="px-5 py-2 rounded-full font-semibold bg-gradient-to-r from-yellow-400 via-orange-400 to-amber-400 text-black hover:brightness-110">{T.analyze}</button>
          <button onClick={exportCurrentCSV} className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-white text-sm ring-1 ring-white/20">{T.exportSession}</button>
          <button onClick={exportHistoryCSV} disabled={history.length === 0} className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-white text-sm ring-1 ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed">{T.exportHistory}</button>
          <button onClick={clearHistory} disabled={history.length === 0} className="flex items-center gap-2 px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-red-300 text-sm ring-1 ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed">
            <Trash2 className="w-4 h-4" /> {T.clearHistory}
          </button>
          {eyUsed != null && tdsUsed != null && (
            <span className="text-xs text-white/80">
              <b>{T.metricsPrefix}:</b> EY <strong>{eyUsed.toFixed(1)}%</strong> · TDS <strong>{tdsUsed.toFixed(1)}%</strong> · {lang==="es"?"Relación":"Ratio"} <strong>{ratio?.toFixed(2) ?? "—"}:1</strong>
            </span>
          )}
        </div>

        {/* Result */}
        {suggestion && (
          <section className="bg-white/10 p-4 rounded">
            <h2 className="text-lg font-semibold mb-2">{T.suggestionTitle}</h2>
            <p><strong>{suggestion.principal.change}</strong></p>
            {suggestion.principal.reason && <p className="text-sm text-amber-300">{suggestion.principal.reason}</p>}
            <div className="mt-3 text-xs text-white/80">
              <span className="font-semibold">{T.grinderState}:</span>{" "}
              {dialString(grinder.dialNumber, grinder.extraTurns)} (max/turna: {grinder.perRevMax})
            </div>
            {suggestion?.flags?.extrasPriority && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 px-2 py-1 rounded">
                ⚠ {T.extrasPriority}
              </div>
            )}
            {suggestion?.flags?.basket && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-blue-300 bg-blue-500/10 px-2 py-1 rounded">
                📏 {T.basketRuleActive}: {suggestion.flags.basket.min.toFixed(1)}–{suggestion.flags.basket.max.toFixed(1)} g
              </div>
            )}
            {suggestion.secundarios && suggestion.secundarios.length > 0 && (
              <div className="mt-2 text-sm">
                <div className="font-medium mb-1">{T.otherSuggestions}:</div>
                <ul className="list-disc list-inside text-white/90">
                  {suggestion.secundarios.map((s,i)=>(<li key={i}>{s}</li>))}
                </ul>
              </div>
            )}

            {modelInfo && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <h3 className="font-semibold mb-1">{T.modelTitle}</h3>
                <p className="text-xs text-gray-300 mb-2">{T.modelNote}</p>
                <p className="text-xs text-amber-300 mb-2">{T.modelTip}</p>
                <div className="text-xs text-gray-200 space-y-1">
                  <div>Predicción — TDS: <b>{modelInfo.tdsPred.toFixed(2)}%</b>, EY: <b>{modelInfo.eyPred.toFixed(2)}%</b>, Score*: <b>{modelInfo.sPred.toFixed(2)}</b> {modelInfo.usingPriors ? <em className="text-gray-400">({lang==="es"?"entrenando: usando priors":"training: using priors"})</em> : <em className="text-green-300">({lang==="es"?"entrenado con":"trained with"} {modelInfo.n} {lang==="es"?"muestras":"samples"})</em>}</div>
                  <div className="text-gray-400">{T.tasteFoot}</div>
                  <div className="mt-2">{T.impactTitle}:</div>
                  <ul className="list-disc list-inside">
                    {modelInfo.rank.map((r, i) => (<li key={i}>{r.name}: {r.weight.toFixed(3)}</li>))}
                  </ul>
                </div>
              </div>
            )}
            {/* Advanced recommender: Elastic Net + Bayesian Optimization (GP-RBF) */}
            <div className="mt-4 border-t border-white/10 pt-3">
              <h3 className="font-semibold mb-1">{lang==="es"?"Recomendador avanzado (Elastic Net + BO)":"Advanced recommender (Elastic Net + BO)"}</h3>
              <p className="text-xs text-gray-300 mb-2">
                {lang==="es"
                  ? "Este motor sugiere cambios SOLO en: molienda, dosis, tiempo y presión del tamper. Usa tu historial para maximizar la puntuación de sabor."
                  : "This engine suggests changes ONLY to: grind, dose, time and tamp pressure. It uses your history to maximize flavor score."}
              </p>
<button
                onClick={onGenerateBO}
                disabled={boBusy || history.length < 3}
                className="px-3 py-1.5 rounded bg-amber-400 text-black hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed">
                {boBusy ? (lang==="es"?"Calculando…":"Computing…") : (lang==="es"?"Proponer con Elastic Net + BO":"Suggest with Elastic Net + BO")}
              </button>
              {history.length < 3 && (
                <div className="text-xs text-gray-400 mt-2">
                  {lang==="es"?"Necesitas al menos 3 muestras en el historial.":"You need at least 3 samples in history."}
                </div>
              )}
              {boSuggestion && (
                <div className="mt-3 p-3 bg-white/5 rounded">
                  <div className="text-sm font-medium mb-1">{lang==="es"?"Sugerencia (EN+BO)":"Suggestion (EN+BO)"}</div>
                  <ul className="text-xs grid grid-cols-2 gap-1">
                    <li>{lang==="es"?"Molienda":"Grind"}: <b>{boSuggestion.grindSize.toFixed(1)}</b></li>
                    <li>{lang==="es"?"Dosis":"Dose"}: <b>{boSuggestion.doseCoffee.toFixed(1)} g</b></li>
                    <li>{lang==="es"?"Tiempo":"Time"}: <b>{boSuggestion.time.toFixed(0)} s</b></li>
                    <li>{lang==="es"?"Tamper":"Tamp"}: <b>{boSuggestion.tampPressure.toFixed(0)}</b></li>
                  </ul>
                  <div className="mt-2 text-[13px] leading-relaxed">
                    <div className="font-medium mb-1">{lang==="es"?"Qué cambiar y por qué":"What to change and why"}</div>
                    {(() => {
                      const curr = params;
                      const sugg = boSuggestion;
                      const msgs = _humanizeENBOChange(curr, sugg, lang, (grinder?.highDialMeansCoarser ?? true));
                      return (
                        <ul className="list-disc ml-5 space-y-1">
                          {msgs.length ? msgs.map((m,i)=>(<li key={i} className="text-xs">{m}</li>))
                           : <li className="text-xs text-gray-400">{lang==="es"?"Cambios sugeridos mínimos; prueba y reevalúa.":"Minimal suggested changes; test and reassess."}</li>}
                        </ul>
                      );
                    })()}
                  </div>
                  {boInfo && (
                    <div className="text-[11px] text-gray-400 mt-2">
                      μ≈{boInfo.mu?.toFixed(3)} · σ≈{boInfo.sigma?.toFixed(3)} · EI≈{boInfo.ei?.toFixed(3)} · ℓ≈{boInfo.l?.toFixed(2)}
                    </div>
                  )}
                  <button
                    onClick={() => setParams(p => ({
                      ...p,
                      grindSize: Math.min(ranges.grindSize.max, Math.max(ranges.grindSize.min, boSuggestion.grindSize)),
                      doseCoffee: Math.min(ranges.doseCoffee.max, Math.max(ranges.doseCoffee.min, boSuggestion.doseCoffee)),
                      time: Math.min(ranges.time.max, Math.max(ranges.time.min, boSuggestion.time)),
                      tampPressure: Math.min(ranges.tampPressure.max, Math.max(ranges.tampPressure.min, boSuggestion.tampPressure)),
                    }))}
                    className="mt-3 px-3 py-1.5 rounded bg-amber-500 text-black hover:brightness-110">
                    {lang==="es"?"Cargar en el formulario":"Load into form"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Brew Control Chart */}
        {eyUsed != null && tdsUsed != null && (
          <section className="bg-white/10 p-4 rounded">
            <h2 className="text-lg font-semibold mb-2">{T.chartTitle}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <XAxis type="number" dataKey="x" name="TDS" domain={[4, 14]} tick={{ fill: "#fff" }} tickFormatter={(v) => `${Math.round(v)}%`}
                  label={{ value: "TDS (%)", position: "insideBottomRight", offset: -5, fill: "#fff" }}/>
                <YAxis type="number" dataKey="y" name="EY" domain={[10, 30]} tick={{ fill: "#fff" }} tickFormatter={(v) => `${Math.round(v)}%`}
                  label={{ value: "EY (%)", angle: -90, position: "insideLeft", fill: "#fff" }}/>
                <Legend/><Tooltip cursor={{ strokeDasharray: "3 3" }}/>
                <ReferenceArea x1={8} x2={12} y1={18} y2={22} fill="#facc15" stroke="#facc15" fillOpacity={0.35}/>
                <Scatter name={lang==="es" ? "Historial" : "History"} data={historyPointsBrew} fill="#60a5fa" opacity={0.5} />
                <Scatter name="Actual" data={[{ x: tdsUsed, y: eyUsed }]} fill="#f59e0b"/>
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-300 mt-1">{T.chartNote}</p>
          </section>
        )}

        {/* Espresso Compass */}
        {eyUsed != null && tdsUsed != null && (
          <section className="bg-white/10 p-4 rounded">
            <h2 className="text-lg font-semibold mb-2">{T.compassTitle}</h2>
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart>
                <XAxis type="number" dataKey="x" name="EY" domain={[10, 30]} tick={{ fill: "#fff" }}
                  tickFormatter={(v) => `${Math.round(v)}%`}
                  label={{ value: lang==="es"?"Extracción (EY%)":"Extraction (EY%)", position: "insideBottomRight", offset: -5, fill: "#fff" }}/>
                <YAxis type="number" dataKey="y" name="TDS" domain={[4, 14]} tick={{ fill: "#fff" }}
                  tickFormatter={(v) => `${Math.round(v)}%`}
                  label={{ value: lang==="es"?"Fuerza (TDS%)":"Strength (TDS%)", angle: -90, position: "insideLeft", fill: "#fff" }}/>
                <Legend/><Tooltip cursor={{ strokeDasharray: "3 3" }}/>
                <ReferenceArea x1={18} x2={22} y1={8} y2={12} fill="#22c55e" stroke="#22c55e" fillOpacity={0.18}/>
                <ReferenceLine x={20} stroke="#e5e7eb" strokeDasharray="4 4" label={{ value: "EY 20%", position: "insideTopRight", fill: "#e5e7eb" }} />
                <ReferenceLine y={10} stroke="#e5e7eb" strokeDasharray="4 4" label={{ value: "TDS 10%", position: "insideTopLeft", fill: "#e5e7eb" }} />
                <Scatter name={lang==="es" ? "Historial" : "History"} data={historyPointsCompass} fill="#60a5fa" opacity={0.5} />
                <Scatter name="Actual" data={[{ x: eyUsed, y: tdsUsed }]} fill="#f59e0b"/>
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-300 mt-1">{T.compassNote}</p>
          </section>
        )}

        {/* Historial */}
        <section className="bg-white/10 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">{T.historyTitle}</h2>
          {history.length === 0 ? (
            <p className="text-gray-400">{lang==="es"?"No hay sesiones aún.":"No sessions yet."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th>{T.thDate}</th><th>{T.thTDS}</th><th>{T.thEY}</th><th>{T.thChange}</th><th>{lang==="es"?"Borrar":"Delete"}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((e, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td>{new Date(e.timestamp).toLocaleString()}</td>
                      <td>{e.tds ?? "—"}</td>
                      <td>{e.ey != null ? e.ey.toFixed(1) : "—"}</td>
                      <td>{e.result?.principal?.change}</td>
                      <td>
                        <button
                          onClick={() => deleteHistoryAt(i)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 transition"
                          title={lang==="es"?"Eliminar este experimento":"Delete this entry"}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-xs">{lang==="es"?"Borrar":"Delete"}</span>
                        </button>
                          <button
                            onClick={() => openEditor(i)}
                            className="ml-2 inline-flex items-center gap-2 px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 transition"
                            title={lang==="es"?"Editar este experimento":"Edit this entry"}
                          >
                            <Pencil className="w-4 h-4" />
                            <span className="text-xs">{(T && T.edit) || (lang==="es"?"Editar":"Edit")}</span>
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {undoDeleted && (
                <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-100 flex items-center justify-between">
                  <div className="text-xs">
                    {lang==="es"
                      ? "Experimento eliminado. Puedes deshacer la eliminación."
                      : "Entry deleted. You can undo."}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={undoDelete} className="px-2 py-1 rounded bg-yellow-400 text-black text-xs hover:brightness-110">
                      {lang==="es"?"Deshacer":"Undo"}
                    </button>
                    <button onClick={() => setUndoDeleted(null)} className="px-2 py-1 rounded text-xs hover:bg-white/10">
                      {lang==="es"?"Descartar":"Dismiss"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        </>
      )}
<footer className="text-xs text-gray-400 text-center mt-8">
  Desarrollada por <strong>Jairon Francisco</strong>, <a href="https://escueladecaferd.com" target="_blank" className="underline">Escuela de Café</a> y <a href="https://cafemaguana.com" target="_blank" className="underline">Café Maguana</a>.
</footer>

      {/* === Edit Drawer === */}
      {editingIndex != null && draft && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeEditor} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-neutral-900 border-l border-white/10 shadow-2xl p-4 overflow-y-auto transition-transform duration-300 translate-x-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">{(T && T.drawerTitle) || (lang==="es"?"Editar registro":"Edit entry")}</h3>
              <div className="flex items-center gap-2">
                <button onClick={revertAll} className="px-2 py-1 rounded border border-white/20 text-xs hover:bg-white/10">{(T && T.revertAll) || (lang==="es"?"Revertir todo":"Revert all")}</button>
                <button onClick={closeEditor} className="text-white/70 hover:text-white text-lg">✕</button>
              </div>
            </div>
            <p className="text-xs text-white/60 mb-3">{(T && T.recalcNote) || (lang==="es"?"Corrige datos mal introducidos y vuelve a correr el modelo.":"Fix wrong inputs and re‑run the model.")}</p>

            <div className="space-y-4">
              <div className="bg-white/5 rounded p-3">
                <h4 className="font-medium mb-2">{(T && T.params) || "Params"}</h4>
                {["grindSize","doseCoffee","basketSize","time","beverageMass","tds","temp","tampPressure"].map((k)=> (
                  <label key={k} className="block text-sm mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80">{labelForKey(lang,k)}</span><InfoPopover content={T?.help?.params?.[k]} />
                      <button type="button" onClick={()=>revertField(["params", k])} className="text-xs text-white/70 hover:text-white underline">
                        {(T && T.revertField) || (lang==="es"?"Revertir":"Revert")}
                      </button>
                    </div>
                    <input type="number" step="any" value={draft.params?.[k] ?? ""}
                      onChange={(e)=>updateDraft(["params", k], Number(e.target.value))}
                      className="w-full bg-transparent border border-white/20 rounded px-2 py-1" {...(k==="beverageMass" ? {step:0.1, min:1, max:150} : {})}/>
                  </label>
                ))}
                <label className="inline-flex items-center gap-2 text-sm mt-1">
                  <input type="checkbox" checked={!!draft.useTDS} onChange={(e)=>updateDraft(["useTDS"], !!e.target.checked)} />
                  <span>{(T && T.useTDS) || "Use TDS"}</span>
                </label>
              </div>

              <div className="bg-white/5 rounded p-3">
                <h4 className="font-medium mb-2">{(T && T.defects) || "Defects"}</h4>
                {["sour","bitter","astringent","weak","harsh"].map((k)=> (
                  <label key={k} className="block text-sm mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80">{labelForKey(lang,k)}</span>
                      <button type="button" onClick={()=>revertField(["defects", k])} className="text-xs text-white/70 hover:text-white underline">
                        {(T && T.revertField) || (lang==="es"?"Revertir":"Revert")}
                      </button>
                    </div>
                    <input type="number" min="0" max="10" step="1" value={draft.defects?.[k] ?? 0}
                      onChange={(e)=>updateDraft(["defects", k], Number(e.target.value))}
                      className="w-full bg-transparent border border-white/20 rounded px-2 py-1"/>
                  </label>
                ))}
              </div>

              <div className="bg-white/5 rounded p-3">
                <h4 className="font-medium mb-2">{(T && T.positives) || "Positives"}</h4>
                {["balanced","body","aroma","sweetness"].map((k)=> (
                  <label key={k} className="block text-sm mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80">{labelForKey(lang,k)}</span>
                      <button type="button" onClick={()=>revertField(["positives", k])} className="text-xs text-white/70 hover:text-white underline">
                        {(T && T.revertField) || (lang==="es"?"Revertir":"Revert")}
                      </button>
                    </div>
                    <input type="number" min="0" max="10" step="1" value={draft.positives?.[k] ?? 0}
                      onChange={(e)=>updateDraft(["positives", k], Number(e.target.value))}
                      className="w-full bg-transparent border border-white/20 rounded px-2 py-1"/>
                  </label>
                ))}
              </div>

              <div className="bg-white/5 rounded p-3">
                <h4 className="font-medium mb-2">{(T && T.extras) || "Extras"}</h4>
                {["freshness","badDistribution","unevenTamp","inaccurateDose","brokenPuck"].map((k)=> (
                  <label key={k} className="flex items-center justify-between text-sm mb-1">
                    <span className="text-white/80">{k}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={()=>revertField(["extras", k])} className="text-xs text-white/70 hover:text-white underline">{(T && T.revertField) || (lang==="es"?"Revertir":"Revert")}</button>
                      <input type="checkbox" className="ml-2" checked={!!draft.extras?.[k]}
                        onChange={(e)=>updateDraft(["extras", k], !!e.target.checked)} />
                    </div>
                  </label>
                ))}
              </div>

              <div className="bg-white/5 rounded p-3">
                <h4 className="font-medium mb-2">{(T && T.grinderState) || "Grinder"}</h4>
                {["type","perRevMax","dialNumber","extraTurns","highDialMeansCoarser"].map((k)=> (
                  <label key={k} className="block text-sm mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80">{labelForKey(lang,k)}</span><InfoPopover content={T?.help?.grinder?.[k]} />
                      <button type="button" onClick={()=>revertField(["grinder", k])} className="text-xs text-white/70 hover:text-white underline">
                        {(T && T.revertField) || (lang==="es"?"Revertir":"Revert")}
                      </button>
                    </div>
                    {k==="type" ? (
                      <select value={draft.grinder?.type ?? "stepless"} onChange={(e)=>updateDraft(["grinder","type"], e.target.value)}
                        className="w-full bg-transparent border border-white/20 rounded px-2 py-1">
                        <option className="bg-black" value="stepless">{grinderOptionLabel(lang,"stepless")}</option>
                        <option className="bg-black" value="stepped">{grinderOptionLabel(lang,"stepped")}</option>
                      </select>
                    ) : k==="highDialMeansCoarser" ? (
                      <input type="checkbox" checked={!!draft.grinder?.highDialMeansCoarser}
                        onChange={(e)=>updateDraft(["grinder","highDialMeansCoarser"], !!e.target.checked)} />
                    ) : (
                      <input type="number" step="any" value={draft.grinder?.[k] ?? ""}
                        onChange={(e)=>updateDraft(["grinder", k], Number(e.target.value))}
                        className="w-full bg-transparent border border-white/20 rounded px-2 py-1"/>
                    )}
                  </label>
                ))}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={closeEditor} className="px-3 py-1.5 rounded border border-white/20 bg-white/5">{(T && T.cancel) || (lang==="es"?"Cancelar":"Cancel")}</button>
                <button onClick={saveEditor} className="px-3 py-1.5 rounded bg-amber-400 text-black hover:bg-amber-300">{(T && T.save) || (lang==="es"?"Guardar":"Save")}</button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

// ======== Icons ========
const paramIcons = {
  grindSize: <SlidersHorizontal className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
  doseCoffee: <Coffee className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
  basketSize: <Package className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
  time: <Timer className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
  beverageMass: <Scale className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
  tds: <Gauge className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
  temp: <Thermometer className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
  tampPressure: <SlidersHorizontal className="inline w-4 h-4 mr-1 text-amber-200 align-middle" />,
};
const defectIcons = {
  sour: <AlertCircle className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  bitter: <AlertTriangle className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  astringent: <Droplet className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  weak: <Frown className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  harsh: <Zap className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
};
const positiveIcons = {
  balanced: <Scale className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  body: <Gauge className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  aroma: <Star className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  sweetness: <Heart className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
};
const extraIcons = {
  freshness: <Hourglass className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  badDistribution: <Wrench className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  unevenTamp: <Ruler className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  inaccurateDose: <Scale className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
  brokenPuck: <Ban className="inline w-4 h-4 mr-1 text-stone-300 align-middle" />,
};
