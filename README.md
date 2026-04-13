 # Weather Dashboard + Voice Assistant (Vanilla JS)

Animated weather dashboard that pulls real forecasts from Open-Meteo and includes a built-in voice assistant (speech-to-text + text-to-speech) to guide the user.

## Run it

This is a static website. You can open `index.html` directly, but speech recognition typically works best when served from `http://localhost`.

### Option A (recommended): VS Code / Cursor Live Server
- Install "Live Server"
- Right-click `index.html` -> Open with Live Server

### Option B: simple local server (PowerShell)

If you have Python installed:

```powershell
cd .\weather_dashboard_ai
python -m http.server 5173
```

Then open `http://localhost:5173`

## Features
- City search (geocoding) + current/hourly/daily forecast
- Animated forecast cards + animated sky canvas
- Voice assistant:
  - Click Speak to ask by microphone (browser support required)
  - The assistant can speak summaries (toggle Voice / Auto speak)

## Notes
- Data is from Open-Meteo (https://open-meteo.com/) and requires no API key.
- Voice uses browser Speech APIs (best in Chrome / Edge).

# Weather Dashboard + Voice Assistant (Vanilla JS)

Animated weather dashboard that pulls **real forecasts** from **Open‑Meteo** and includes a built‑in **voice assistant** (speech‑to‑text + text‑to‑speech) to guide the user.

## Run it

This is a static website. You can open `index.html` directly, but **speech recognition** typically works best when served from `http://localhost`.

### Option A (recommended): VS Code / Cursor Live Server
- Install “Live Server”
- Right‑click `index.html` → **Open with Live Server**

### Option B: simple local server (PowerShell)

If you have Python installed:

```powershell
cd .\weather_dashboard_ai
python -m http.server 5173
```

Then open `http://localhost:5173`.

## Features
- City search (geocoding) + current/hourly/daily forecast
- Animated forecast cards + animated sky canvas
- Voice assistant:
  - Click **Speak** to ask by microphone (browser support required)
  - The assistant can speak summaries (toggle **Voice** / **Auto speak**)

## Notes
- Data is from Open‑Meteo (`https://open-meteo.com/`) and requires **no API key**.
- Voice uses browser Speech APIs (best in Chrome / Edge).

