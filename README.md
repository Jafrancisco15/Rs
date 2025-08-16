# Espresso Dial In — Starter (Vite + React + Tailwind + Recharts)

App interactiva para **dial-in de espresso** con:
- Parámetros completos (molienda, dosis, canasta, tiempo, bebida, TDS, temperatura, tamper)
- Factores adicionales (frescura, distribución, desnivel, dosis, pastilla rota)
- Descriptores sensoriales (defectos y positivos)
- **Motor de recomendaciones** priorizando **sabor**
- **Brew Control Chart** (TDS vs EY) con zona óptima
- **Historial de sesiones**
- Header con **logo** (URL editable y guardada en localStorage)

## Desarrollo

```bash
npm i
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy en Vercel

1. Sube el repo a GitHub (o usa “Import” directo en Vercel).
2. En Vercel: **Add New → Project**, selecciona el repo.
3. Build Command: `npm run build` — Output Directory: `dist`
4. Deploy. Obtendrás `https://tuapp.vercel.app`.

### Subdominio propio (opcional)
- Añade `espresso.escueladecaferd.com` en **Settings → Domains**.
- Crea un CNAME `espresso -> cname.vercel-dns.com` en tu DNS.

### WordPress (opcional)
Incrusta la app con:

```html
<iframe
  src="https://espresso.escueladecaferd.com"
  width="100%"
  height="1600"
  style="border:0; max-width:100%;"
  loading="lazy"
></iframe>
```

## Logo
En el header pulsa **“Cambiar logo”** y pega una URL (PNG/JPG). Se guarda en localStorage.
