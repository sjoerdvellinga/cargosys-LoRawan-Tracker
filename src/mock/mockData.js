// src/mock/mockData.js
// 2 months demo series (~30 min interval with ±3 min jitter)
// Adds:
// - Refrigerated transport: step-drop in temperature when cooling turns on
// - Weekend effect: lower vibration on Sat/Sun
// - Rain period: higher humidity across multiple days
// - Exactly 1 small bump + 1 big drop with aftershock

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toIsoZ(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function daysBetween(a, b) {
  return (a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}

function generateMockReadings({
  startIso = "2026-01-01T06:00:00Z",
  endIso = "2026-03-01T10:20:00Z",
  seed = 1337
} = {}) {
  const rand = mulberry32(seed);

  const start = new Date(startIso);
  const end = new Date(endIso);

  const baseStepMs = 30 * 60 * 1000;
  const jitterMs = 3 * 60 * 1000;

  // ---------- Scenarios timing ----------
  // Cooling turns on around day 10 (morning)
  const coolingOnAt = new Date(start.getTime() + 10 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000);

  // Rain period: day 18 -> day 23 (inclusive-ish)
  const rainStart = new Date(start.getTime() + 18 * 24 * 60 * 60 * 1000);
  const rainEnd = new Date(start.getTime() + 23 * 24 * 60 * 60 * 1000);

  // Impact events
  const smallBumpAt = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000);
  const bigDropAt = new Date(start.getTime() + 28 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000);
  const aftershockTimesSec = [20, 40, 60];

  // ---------- Event map (ensure exact points exist) ----------
  const eventMap = new Map();
  eventMap.set(toIsoZ(smallBumpAt), { type: "small" });
  eventMap.set(toIsoZ(bigDropAt), { type: "drop" });
  aftershockTimesSec.forEach((s, idx) => {
    eventMap.set(toIsoZ(new Date(bigDropAt.getTime() + s * 1000)), { type: "aftershock", idx });
  });

  // ---------- Base levels ----------
  let baseTemp = 7.0; // avg ambient
  let baseRh = 50;

  // Cooling parameters
  // When cooling turns on, target temp drops by ~5°C and stabilizes.
  const coolingDrop = 5.0;
  const coolingStabilizeHours = 6; // how quickly it reaches new level

  // Rain parameters (adds humidity offset during rain, with ramp in/out)
  const rainMaxBoost = 12; // extra RH at peak rain

  function dayNightPhase(dt) {
    // Peak around 14:00, low around 04:00
    const h = dt.getUTCHours();
    return Math.sin(((h - 4) / 24) * 2 * Math.PI);
  }

  function rainBoost(dt) {
    if (dt < rainStart || dt > rainEnd) return 0;

    // Smooth ramp in/out: first and last day are smaller boost
    const totalDays = Math.max(1, daysBetween(rainEnd, rainStart));
    const d = daysBetween(dt, rainStart);

    // 0..1..0 bell-ish curve across the rain window
    const x = clamp(d / totalDays, 0, 1);
    const bell = Math.sin(Math.PI * x); // 0 at edges, 1 in middle

    return rainMaxBoost * bell;
  }

  function coolingFactor(dt) {
    if (dt <= coolingOnAt) return 0;

    // approach 1 as time passes (exponential-ish with hours)
    const hours = (dt.getTime() - coolingOnAt.getTime()) / (60 * 60 * 1000);
    const k = clamp(hours / coolingStabilizeHours, 0, 1);
    // smoothstep for nicer curve
    return k * k * (3 - 2 * k);
  }

  function isWeekend(dt) {
    const dow = dt.getUTCDay(); // 0=Sun, 6=Sat
    return dow === 0 || dow === 6;
  }

  function isDriving(dt) {
    const h = dt.getUTCHours();
    // Weekday driving window 06-18; weekends much less
    if (isWeekend(dt)) return rand() > 0.92; // very rare on weekend
    return h >= 6 && h <= 18 && rand() > 0.25;
  }

  const readings = [];
  let t = new Date(start);

  while (t <= end) {
    const jitter = Math.round((rand() * 2 - 1) * jitterMs);
    const tj = new Date(t.getTime() + jitter);

    const phase = dayNightPhase(tj); // -1 night, +1 day-ish
    const coolF = coolingFactor(tj);
    const rainF = rainBoost(tj);

    // Temperature:
    // - bigger day/night swing
    // - after cooling: whole curve shifted down
    // - some random noise
    const tempAmbient =
      baseTemp +
      phase * 3.2 +            // day/night swing
      (rand() - 0.5) * 0.6;    // noise

    const temp = tempAmbient - coolF * coolingDrop;

    // Humidity:
    // - inverse of day/night phase (night higher)
    // - rain period boosts RH over multiple days
    // - some noise
    const rh =
      baseRh -
      phase * 10 +             // night more humid
      rainF +                  // rain boost (multi-day)
      (rand() - 0.5) * 3;

    // Vibration:
    // - higher when driving
    // - weekends mostly low
    let vibHz;
    if (isDriving(tj)) {
      vibHz = Math.round(18 + rand() * 20); // 18–38
    } else {
      vibHz = Math.round(5 + rand() * 7);   // 5–12
    }

    // Background impact (very low)
    let impactG = 0.12 + rand() * 0.25;
    if (rand() < 0.02) impactG += rand() * 0.4;

    // Apply planned impacts if timestamp matches
    const key = toIsoZ(tj);
    const evt = eventMap.get(key);

    if (evt?.type === "small") {
      impactG = 2.4; // small bump while loading
      vibHz = 12;
    } else if (evt?.type === "drop") {
      impactG = 9.8; // pallet fell
      vibHz = 7;
    } else if (evt?.type === "aftershock") {
      const levels = [1.6, 1.1, 0.7];
      impactG = levels[evt.idx] ?? 0.7;
      vibHz = 9 + evt.idx * 2;
    }

    readings.push({
      ts: key,
      temp: Number(clamp(temp, -2, 15).toFixed(1)),
      rh: Math.round(clamp(rh, 35, 85)),
      impactG: Number(impactG.toFixed(2)),
      vibHz
    });

    t = new Date(t.getTime() + baseStepMs);
  }

  // Ensure exact event timestamps exist even if jitter missed them
  for (const [iso, evt] of eventMap.entries()) {
    if (!readings.find((r) => r.ts === iso)) {
      const nearest = readings.reduce((a, b) =>
        Math.abs(new Date(a.ts) - new Date(iso)) < Math.abs(new Date(b.ts) - new Date(iso)) ? a : b
      );

      let impactG = nearest.impactG;
      let vibHz = nearest.vibHz;

      if (evt.type === "small") {
        impactG = 2.4; vibHz = 12;
      } else if (evt.type === "drop") {
        impactG = 9.8; vibHz = 7;
      } else if (evt.type === "aftershock") {
        const levels = [1.6, 1.1, 0.7];
        impactG = levels[evt.idx] ?? 0.7;
        vibHz = 9 + evt.idx * 2;
      }

      readings.push({
        ts: iso,
        temp: nearest.temp,
        rh: nearest.rh,
        impactG,
        vibHz
      });
    }
  }

  readings.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return readings;
}

export const mockReadings = generateMockReadings();