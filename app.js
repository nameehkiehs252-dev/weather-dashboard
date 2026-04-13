const $ = (sel) => document.querySelector(sel);

const els = {
  searchForm: $("#searchForm"),
  cityInput: $("#cityInput"),
  btnUseLocation: $("#btnUseLocation"),
  placeTitle: $("#placeTitle"),
  placeMeta: $("#placeMeta"),
  chipUpdated: $("#chipUpdated"),
  nowTemp: $("#nowTemp"),
  nowFeels: $("#nowFeels"),
  nowWind: $("#nowWind"),
  nowRain: $("#nowRain"),
  bigTemp: $("#bigTemp"),
  bigDesc: $("#bigDesc"),
  bigHint: $("#bigHint"),
  hourlyRow: $("#hourlyRow"),
  dailyGrid: $("#dailyGrid"),
  skyCanvas: $("#skyCanvas"),

  chatLog: $("#chatLog"),
  chatForm: $("#chatForm"),
  chatInput: $("#chatInput"),
  btnMic: $("#btnMic"),
  micLabel: $("#micLabel"),
  btnSpeakSummary: $("#btnSpeakSummary"),
  btnStopVoice: $("#btnStopVoice"),
  toggleVoice: $("#toggleVoice"),
  toggleAutoSpeak: $("#toggleAutoSpeak"),
};

/** @type {null | { place: any, weather: any, derived: any }} */
let latest = null;

// ---------------------------
// Weather API (Open-Meteo)
// ---------------------------

async function geocodeCity(query) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({
      name: query,
      count: "5",
      language: "en",
      format: "json",
    });
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding failed.");
  const data = await res.json();
  const best = data?.results?.[0];
  if (!best) throw new Error("City not found.");
  return best;
}

async function fetchForecast(lat, lon, timezone = "auto") {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone,
    current:
      "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    hourly:
      "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Forecast fetch failed.");
  return await res.json();
}

function wmoToLabel(code) {
  // https://open-meteo.com/en/docs#weathervariables
  if (code === 0) return "Clear sky";
  if (code === 1 || code === 2) return "Mainly clear";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code === 51 || code === 53 || code === 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing drizzle";
  if (code === 61 || code === 63 || code === 65) return "Rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code === 71 || code === 73 || code === 75) return "Snow";
  if (code === 77) return "Snow grains";
  if (code === 80 || code === 81 || code === 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm (hail)";
  return "Mixed conditions";
}

function wmoToTheme(code) {
  // Used for animations + summary tone
  if (code === 0 || code === 1) return "sun";
  if (code === 2 || code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloud";
}

function fmtTemp(c) {
  return `${Math.round(c)}°C`;
}

function fmtKmH(v) {
  return `${Math.round(v)} km/h`;
}

function fmtMM(v) {
  if (v == null) return "—";
  if (v < 0.1) return "0 mm";
  return `${v.toFixed(1)} mm`;
}

function fmtTimeLocal(iso, timeZone) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(d);
}

function fmtDay(iso, timeZone) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    timeZone,
  }).format(d);
}

function fmtDate(iso, timeZone) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    timeZone,
  }).format(d);
}

function pickIndicesAroundNow(times) {
  const now = Date.now();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (t <= now) idx = i;
    else break;
  }
  return { nowIdx: idx, nextSlice: [idx, Math.min(idx + 10, times.length)] };
}

function deriveInsights(place, weather) {
  const tz = weather.timezone || "UTC";
  const cur = weather.current;
  const theme = wmoToTheme(cur.weather_code);
  const desc = wmoToLabel(cur.weather_code);

  const h = weather.hourly;
  const d = weather.daily;

  const { nowIdx, nextSlice } = pickIndicesAroundNow(h.time);
  const [start, end] = nextSlice;
  const nextHours = [];
  for (let i = start; i < end; i++) {
    nextHours.push({
      time: h.time[i],
      temp: h.temperature_2m[i],
      wind: h.wind_speed_10m[i],
      pop: h.precipitation_probability?.[i] ?? null,
      pr: h.precipitation?.[i] ?? null,
      code: h.weather_code[i],
    });
  }

  const days = [];
  for (let i = 0; i < d.time.length; i++) {
    days.push({
      time: d.time[i],
      tmax: d.temperature_2m_max[i],
      tmin: d.temperature_2m_min[i],
      popMax: d.precipitation_probability_max?.[i] ?? null,
      prSum: d.precipitation_sum?.[i] ?? null,
      code: d.weather_code[i],
    });
  }

  const rainRisk = (() => {
    const pop = nextHours.map((x) => x.pop ?? 0);
    const maxPop = pop.length ? Math.max(...pop) : 0;
    const pr = nextHours.map((x) => x.pr ?? 0);
    const sumPr = pr.reduce((a, b) => a + b, 0);
    return { maxPop, sumPr };
  })();

  const windNow = cur.wind_speed_10m ?? 0;
  const caution = [];
  if (rainRisk.maxPop >= 60 || rainRisk.sumPr >= 2.5) caution.push("rain");
  if (windNow >= 35) caution.push("wind");
  if (theme === "storm") caution.push("storm");

  return {
    tz,
    theme,
    desc,
    nextHours,
    days,
    caution,
  };
}

function render(place, weather, derived) {
  const tz = derived.tz;

  els.placeTitle.textContent = `${place.name}${place.admin1 ? `, ${place.admin1}` : ""}${
    place.country ? `, ${place.country}` : ""
  }`;
  els.placeMeta.textContent = `Lat ${place.latitude.toFixed(2)} • Lon ${place.longitude.toFixed(
    2
  )} • Timezone ${tz}`;

  els.chipUpdated.textContent = `Updated: ${fmtDate(weather.current.time, tz)} ${fmtTimeLocal(
    weather.current.time,
    tz
  )}`;

  els.nowTemp.textContent = fmtTemp(weather.current.temperature_2m);
  els.nowFeels.textContent = fmtTemp(weather.current.apparent_temperature);
  els.nowWind.textContent = fmtKmH(weather.current.wind_speed_10m);
  els.nowRain.textContent = fmtMM(weather.current.precipitation ?? 0);

  els.bigTemp.textContent = fmtTemp(weather.current.temperature_2m);
  els.bigDesc.textContent = derived.desc;
  els.bigHint.textContent = buildHint(derived);

  els.hourlyRow.replaceChildren(
    ...derived.nextHours.map((h) => {
      const card = document.createElement("div");
      card.className = "hourCard";
      const pill = rainPill(h.pop, h.pr);
      card.innerHTML = `
        <div class="hourCard__t">${fmtTimeLocal(h.time, tz)}</div>
        <div class="hourCard__v">${fmtTemp(h.temp)}</div>
        <div class="hourCard__m">
          <span>${fmtKmH(h.wind)}</span>
          ${pill}
        </div>
      `;
      return card;
    })
  );

  els.dailyGrid.replaceChildren(
    ...derived.days.slice(0, 7).map((d) => {
      const card = document.createElement("div");
      card.className = "dayCard";
      const icon = dayIcon(d.code);
      const pop = d.popMax ?? 0;
      const rainLine = d.prSum != null ? `${Math.round(pop)}% • ${fmtMM(d.prSum)}` : `${Math.round(pop)}%`;
      card.innerHTML = `
        <div class="dayCard__d">${fmtDay(d.time, tz)}</div>
        <div class="dayCard__icon">${icon}</div>
        <div class="dayCard__temps"><span>${fmtTemp(d.tmax)}</span><span>${fmtTemp(d.tmin)}</span></div>
        <div class="dayCard__rain">Rain: ${rainLine}</div>
      `;
      return card;
    })
  );

  paintSky(els.skyCanvas, derived.theme);
}

function buildHint(derived) {
  const parts = [];
  if (derived.caution.includes("storm")) parts.push("Storm risk — stay alert.");
  if (derived.caution.includes("rain")) parts.push("Carry an umbrella for the next few hours.");
  if (derived.caution.includes("wind")) parts.push("Windy — secure loose items.");
  if (!parts.length) parts.push("Looks steady. Ask me what to wear or if rain is coming.");
  return parts.join(" ");
}

function rainPill(pop, mm) {
  const p = pop == null ? 0 : pop;
  let cls = "pill pill--ok";
  if (p >= 60 || (mm ?? 0) >= 0.8) cls = "pill pill--bad";
  else if (p >= 30 || (mm ?? 0) >= 0.2) cls = "pill pill--warn";
  const label = pop == null ? "—" : `${Math.round(p)}%`;
  return `<span class="${cls}">${label}</span>`;
}

function dayIcon(code) {
  const theme = wmoToTheme(code);
  if (theme === "sun") return `<div class="animSun" aria-hidden="true"></div>`;
  if (theme === "cloud") return `<div class="animCloud" aria-hidden="true"></div>`;
  if (theme === "rain")
    return `<div class="animCloud" aria-hidden="true"></div><div class="animRain" aria-hidden="true"></div>`;
  if (theme === "storm")
    return `<div class="animCloud" aria-hidden="true"></div><div class="animRain" aria-hidden="true"></div><div class="animBolt" aria-hidden="true"></div>`;
  if (theme === "snow")
    return `<div class="animCloud" aria-hidden="true"></div><div class="animRain" style="opacity:.25" aria-hidden="true"></div>`;
  return `<div class="animCloud" aria-hidden="true"></div>`;
}

// ---------------------------
// Animated sky canvas
// ---------------------------

function paintSky(canvas, theme) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const state = {
    theme,
    t0: performance.now(),
    running: true,
  };

  const particles = makeParticles(theme, w, h);

  function frame(now) {
    if (!state.running) return;
    const t = (now - state.t0) / 1000;

    // bg gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (theme === "sun") {
      g.addColorStop(0, "rgba(53,215,255,0.20)");
      g.addColorStop(1, "rgba(124,92,255,0.05)");
    } else if (theme === "storm") {
      g.addColorStop(0, "rgba(40,55,90,0.35)");
      g.addColorStop(1, "rgba(10,10,18,0.20)");
    } else if (theme === "rain") {
      g.addColorStop(0, "rgba(53,215,255,0.14)");
      g.addColorStop(1, "rgba(20,26,45,0.14)");
    } else if (theme === "fog") {
      g.addColorStop(0, "rgba(230,240,255,0.10)");
      g.addColorStop(1, "rgba(80,90,120,0.12)");
    } else {
      g.addColorStop(0, "rgba(124,92,255,0.10)");
      g.addColorStop(1, "rgba(53,215,255,0.08)");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // sun glow
    if (theme === "sun") {
      const x = w * 0.18 + Math.sin(t * 0.3) * 4;
      const y = h * 0.32 + Math.cos(t * 0.25) * 3;
      const rg = ctx.createRadialGradient(x, y, 6, x, y, 110);
      rg.addColorStop(0, "rgba(255,209,102,0.65)");
      rg.addColorStop(1, "rgba(255,209,102,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 16 + Math.sin(t * 2) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // clouds
    const cloudAlpha = theme === "storm" ? 0.75 : theme === "rain" ? 0.62 : 0.5;
    drawCloud(ctx, w * 0.35 + Math.sin(t * 0.25) * 18, h * 0.35, 1.2, cloudAlpha);
    drawCloud(ctx, w * 0.64 + Math.sin(t * 0.22 + 1.4) * 22, h * 0.46, 1.05, cloudAlpha * 0.9);

    // fog overlay
    if (theme === "fog") {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const y = h * (0.35 + i * 0.11) + Math.sin(t * 0.8 + i) * 3;
        ctx.ellipse(w * 0.5, y, w * 0.52, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // particles (rain/snow)
    stepParticles(ctx, particles, theme, w, h, t);

    // lightning flash
    if (theme === "storm") {
      const flash = Math.max(0, Math.sin(t * 1.7 + 0.8));
      if (flash > 0.98) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(0, 0, w, h);
      }
    }

    requestAnimationFrame(frame);
  }

  // Stop older loops by replacing a token on the canvas element
  const token = Symbol("sky");
  canvas.__skyToken = token;
  const oldFrame = frame;
  requestAnimationFrame(function tick(ts) {
    if (canvas.__skyToken !== token) {
      state.running = false;
      return;
    }
    oldFrame(ts);
  });
}

function drawCloud(ctx, x, y, s, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(255,255,255,0.85)";

  blob(ctx, -56, 0, 46);
  blob(ctx, -18, -18, 38);
  blob(ctx, 18, -4, 44);
  blob(ctx, 54, -12, 30);
  ctx.restore();
}

function blob(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function makeParticles(theme, w, h) {
  const count =
    theme === "storm" ? 140 : theme === "rain" ? 110 : theme === "snow" ? 70 : 0;
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      x: Math.random() * w,
      y: Math.random() * h,
      v: theme === "snow" ? 18 + Math.random() * 24 : 160 + Math.random() * 120,
      s: theme === "snow" ? 1.4 + Math.random() * 1.8 : 0.9 + Math.random() * 0.9,
      w: theme === "snow" ? 0 : 1,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return parts;
}

function stepParticles(ctx, parts, theme, w, h, t) {
  if (!parts.length) return;
  ctx.save();
  if (theme === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    for (const p of parts) {
      p.y += p.v * 0.016;
      p.x += Math.sin(t * 1.2 + p.phase) * 0.6;
      if (p.y > h + 10) {
        p.y = -10;
        p.x = Math.random() * w;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === "rain" || theme === "storm") {
    ctx.strokeStyle =
      theme === "storm" ? "rgba(53,215,255,0.55)" : "rgba(53,215,255,0.48)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const p of parts) {
      p.y += p.v * 0.016;
      p.x += 1.1; // slight slant
      if (p.y > h + 20) {
        p.y = -20;
        p.x = Math.random() * w;
      }
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 6, p.y + 16);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------
// Voice assistant (browser speech APIs)
// ---------------------------

const voice = makeVoice();

function makeVoice() {
  const supportsTTS = "speechSynthesis" in window;
  const SR =
    window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition;
  const supportsSTT = Boolean(SR);

  /** @type {SpeechRecognition | null} */
  let rec = null;
  let listening = false;

  function speak(text) {
    if (!supportsTTS) return;
    if (!els.toggleVoice.checked) return;
    if (!text?.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }

  function stop() {
    if (supportsTTS) window.speechSynthesis.cancel();
    if (rec && listening) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
  }

  function startListening(onText) {
    if (!supportsSTT) throw new Error("Speech recognition not supported in this browser.");
    if (listening) return;
    rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    listening = true;
    els.micLabel.textContent = "Listening…";
    els.btnMic.classList.add("isListening");

    let finalText = "";
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = transcript;
      }
      if (transcript.trim()) {
        els.chatInput.value = transcript.trim();
      }
    };
    rec.onerror = () => {
      listening = false;
      els.micLabel.textContent = "Speak";
      els.btnMic.classList.remove("isListening");
    };
    rec.onend = () => {
      listening = false;
      els.micLabel.textContent = "Speak";
      els.btnMic.classList.remove("isListening");
      const text = (finalText || els.chatInput.value || "").trim();
      if (text) onText(text);
    };
    rec.start();
  }

  return { supportsTTS, supportsSTT, speak, stop, startListening };
}

function addMsg(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "you" ? "msg--you" : "msg--bot"}`;
  const when = new Date();
  wrap.innerHTML = `
    <div class="msg__meta">
      <div>${role === "you" ? "You" : "Assistant"}</div>
      <div>${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
    <div class="msg__text"></div>
  `;
  wrap.querySelector(".msg__text").textContent = text;
  els.chatLog.appendChild(wrap);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function assistantReply(userText) {
  const text = userText.trim();
  if (!text) return;

  addMsg("you", text);

  const reply = generateWeatherAnswer(text);
  addMsg("bot", reply);

  if (els.toggleAutoSpeak.checked) voice.speak(reply);
}

function generateWeatherAnswer(userText) {
  const lower = userText.toLowerCase();
  if (!latest) {
    return `Search a city first, then ask me things like “Will it rain today?” or “What should I wear?”`;
  }

  const { place, weather, derived } = latest;
  const cur = weather.current;

  const name = place.name;
  const desc = derived.desc;
  const temp = Math.round(cur.temperature_2m);
  const feels = Math.round(cur.apparent_temperature);
  const wind = Math.round(cur.wind_speed_10m);

  const next = derived.nextHours.slice(0, 6);
  const maxPop = Math.max(...next.map((x) => x.pop ?? 0));
  const soonestRain = next.find((x) => (x.pop ?? 0) >= 50 || (x.pr ?? 0) >= 0.5);

  if (/(hello|hi|hey)\b/.test(lower)) {
    return `Hi! In ${name} it’s ${temp}°C (${desc}). Ask: rain, wind, outfit, or a summary.`;
  }

  if (/(summary|overview|brief|tell me the weather)/.test(lower)) {
    return buildSpokenSummary(place, weather, derived);
  }

  if (/(rain|umbrella|precip)/.test(lower)) {
    if (soonestRain) {
      const t = fmtTimeLocal(soonestRain.time, derived.tz);
      const p = Math.round(soonestRain.pop ?? 0);
      return `Rain chance is up to ${Math.round(maxPop)}% in the next few hours. Earliest higher risk is around ${t} (~${p}%). I’d bring an umbrella.`;
    }
    return `Rain risk looks low in the next few hours (max about ${Math.round(maxPop)}%). You probably don’t need an umbrella.`;
  }

  if (/(wind|gust)/.test(lower)) {
    const note = wind >= 35 ? "That’s fairly windy—secure loose items." : "Wind looks manageable.";
    return `Current wind in ${name} is about ${wind} km/h. ${note}`;
  }

  if (/(wear|outfit|clothes|jacket)/.test(lower)) {
    const outfit = temp <= 10 ? "a warm jacket" : temp <= 18 ? "a light jacket or hoodie" : "light clothes";
    const rain = maxPop >= 50 ? "Bring an umbrella too." : "";
    return `It feels like ${feels}°C in ${name}. I’d wear ${outfit}. ${rain}`.trim();
  }

  if (/(tomorrow|next day)/.test(lower)) {
    const d1 = derived.days[1];
    if (!d1) return "I don’t have tomorrow’s forecast loaded yet.";
    const pop = Math.round(d1.popMax ?? 0);
    return `Tomorrow: ${wmoToLabel(d1.code)} with about ${Math.round(d1.tmax)}°C / ${Math.round(
      d1.tmin
    )}°C. Rain chance up to ${pop}%.`;
  }

  if (/(is it (hot|cold)|temperature|temp)/.test(lower)) {
    return `Right now in ${name}: ${temp}°C, feels like ${feels}°C. Conditions: ${desc}.`;
  }

  return `In ${name} it’s ${temp}°C (feels ${feels}°C) with ${desc}. Ask “summary”, “rain”, “wind”, or “what should I wear?”.`;
}

function buildSpokenSummary(place, weather, derived) {
  const cur = weather.current;
  const name = place.name;
  const temp = Math.round(cur.temperature_2m);
  const feels = Math.round(cur.apparent_temperature);
  const wind = Math.round(cur.wind_speed_10m);
  const desc = derived.desc;
  const next = derived.nextHours.slice(0, 8);
  const maxPop = Math.max(...next.map((x) => x.pop ?? 0));
  const soon = next.find((x) => (x.pop ?? 0) >= 60 || (x.pr ?? 0) >= 0.8);

  let rainLine = `Rain risk is low.`;
  if (maxPop >= 30) rainLine = `Rain chance may reach about ${Math.round(maxPop)}%.`;
  if (soon) rainLine = `Higher rain risk starts around ${fmtTimeLocal(soon.time, derived.tz)}.`;

  const windLine = wind >= 35 ? `It’s windy at about ${wind} kilometers per hour.` : `Wind is about ${wind} kilometers per hour.`;

  return `Here’s the weather for ${name}. Right now it’s ${temp} degrees celsius, feels like ${feels}. Conditions are ${desc}. ${windLine} ${rainLine}`;
}

// ---------------------------
// App wiring
// ---------------------------

async function setCity(query) {
  els.bigHint.textContent = "Loading forecast…";
  const place = await geocodeCity(query);
  const weather = await fetchForecast(place.latitude, place.longitude, place.timezone || "auto");
  const derived = deriveInsights(place, weather);
  latest = { place, weather, derived };
  render(place, weather, derived);

  const intro = buildSpokenSummary(place, weather, derived);
  addMsg("bot", `Loaded ${place.name}. Ask me about rain, wind, tomorrow, or what to wear.`);
  if (els.toggleAutoSpeak.checked) voice.speak(intro);
}

async function setLocationFromGeolocation() {
  if (!("geolocation" in navigator)) throw new Error("Geolocation not available.");
  const pos = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    })
  );
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const weather = await fetchForecast(lat, lon, "auto");
  // Reverse geocode via open-meteo "search" isn't perfect for lat/lon, so show coords as place
  const place = {
    name: "Your location",
    admin1: "",
    country: "",
    latitude: lat,
    longitude: lon,
    timezone: weather.timezone || "auto",
  };
  const derived = deriveInsights(place, weather);
  latest = { place, weather, derived };
  render(place, weather, derived);
  addMsg("bot", "Loaded your location. Ask me about rain, wind, or a summary.");
  if (els.toggleAutoSpeak.checked) voice.speak(buildSpokenSummary(place, weather, derived));
}

els.searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = els.cityInput.value.trim();
  if (!q) return;
  try {
    await setCity(q);
  } catch (err) {
    els.bigHint.textContent = "Couldn’t load that city. Try another name.";
    addMsg("bot", `I couldn’t find “${q}”. Try a nearby big city name.`);
  }
});

els.btnUseLocation.addEventListener("click", async () => {
  try {
    await setLocationFromGeolocation();
  } catch {
    addMsg("bot", "I couldn’t access your location. You can still search by city.");
  }
});

els.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.chatInput.value;
  els.chatInput.value = "";
  assistantReply(text);
});

els.btnMic.addEventListener("click", () => {
  if (!voice.supportsSTT) {
    addMsg(
      "bot",
      "Speech recognition isn’t supported in this browser. Try Chrome or Edge, or type your question."
    );
    return;
  }
  try {
    voice.startListening((text) => {
      els.chatInput.value = "";
      assistantReply(text);
    });
  } catch (e) {
    addMsg("bot", String(e?.message || e));
  }
});

els.btnStopVoice.addEventListener("click", () => voice.stop());

els.btnSpeakSummary.addEventListener("click", () => {
  const msg = latest
    ? buildSpokenSummary(latest.place, latest.weather, latest.derived)
    : "Search a city first, then I can summarize the forecast.";
  addMsg("bot", msg);
  voice.speak(msg);
});

function bootChat() {
  addMsg(
    "bot",
    "Hi! Search a city, then ask me by voice or text. Try: “Will it rain today?”, “What should I wear?”, or “Summary”."
  );
  if (!voice.supportsTTS) {
    addMsg("bot", "Text-to-speech isn’t available in this browser, but everything else will work.");
  }
  if (!voice.supportsSTT) {
    addMsg("bot", "Voice input isn’t available here. You can still type questions.");
  }
}

bootChat();
paintSky(els.skyCanvas, "cloud");

