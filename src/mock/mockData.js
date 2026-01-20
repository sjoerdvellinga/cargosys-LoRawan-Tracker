// src/mock/mockData.js
// PURE JS ONLY (NO JSX). Safe for Vite.
// Demo generator for CargoSys IoT tracking.
//
// Features:
// - Route cycle repeating:
//   Rotterdam -> Tilburg (1h)
//   Stop Tilburg (4h)
//   Tilburg -> Budapest (32h)
//   Rest Budapest (48h)
//   Budapest -> Tilburg (32h)
//   Stop Tilburg (4h)
//   Tilburg -> Rotterdam (1h)
//   Rest Rotterdam (48h)
// - Sampling ~ every 30 minutes with ±3 min jitter
// - GPS jitter up to 1 km per sample
// - Impact: small bump during Tilburg stop, big drop + aftershocks during Tilburg->Budapest
// - Vibration RMS and dominant frequency (Hz)
// - Battery % drains over ~90 days, monotonic decreasing

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function deg2rad(d) {
  return (d * Math.PI) / 180;
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

function minutesBetween(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function hourOfDay(d) {
  return d.getHours() + d.getMinutes() / 60;
}

// Random displacement within circle of radius maxKm
function addGpsJitterKm(lat, lon, rand, maxKm = 1.0) {
  const r = Math.sqrt(rand()) * maxKm; // km
  const theta = rand() * 2 * Math.PI;

  // ~km per degree latitude
  const dLat = (r * Math.cos(theta)) / 111.32;
  const dLon = (r * Math.sin(theta)) / (111.32 * Math.cos(deg2rad(lat)) + 1e-9);

  return { lat: lat + dLat, lon: lon + dLon };
}

// Waypoints (to avoid straight line)
const WP = {
  rotterdam: { lat: 51.9244, lon: 4.4777 },
  dordrecht: { lat: 51.8133, lon: 4.6901 },
  breda: { lat: 51.5719, lon: 4.7683 },
  tilburg: { lat: 51.5606, lon: 5.0919 },
  eindhoven: { lat: 51.4416, lon: 5.4697 },
  venlo: { lat: 51.3704, lon: 6.1724 },
  cologne: { lat: 50.9375, lon: 6.9603 },
  frankfurt: { lat: 50.1109, lon: 8.6821 },
  nuremberg: { lat: 49.4521, lon: 11.0767 },
  vienna: { lat: 48.2082, lon: 16.3738 },
  budapest: { lat: 47.4979, lon: 19.0402 },
};

const ROUTE_RTM_TO_TILBURG = [WP.rotterdam, WP.dordrecht, WP.breda, WP.tilburg];
const ROUTE_TILBURG_TO_BUDAPEST = [
  WP.tilburg,
  WP.eindhoven,
  WP.venlo,
  WP.cologne,
  WP.frankfurt,
  WP.nuremberg,
  WP.vienna,
  WP.budapest,
];
const ROUTE_BUDAPEST_TO_TILBURG = [...ROUTE_TILBURG_TO_BUDAPEST].reverse();
const ROUTE_TILBURG_TO_RTM = [...ROUTE_RTM_TO_TILBURG].reverse();

function buildSegmentPolyline(routePoints, steps, rand, jitterKm) {
  const pts = [];
  if (routePoints.length < 2 || steps <= 1) return pts;

  // weight segment steps by rough distance
  const segLens = [];
  let total = 0;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const dLat = (b.lat - a.lat) * 111.32;
    const dLon = (b.lon - a.lon) * 111.32 * Math.cos(deg2rad((a.lat + b.lat) / 2));
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    segLens.push(dist);
    total += dist;
  }

  let remaining = steps;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];

    const segSteps =
      i === routePoints.length - 2
        ? remaining
        : Math.max(2, Math.round((segLens[i] / total) * steps));

    remaining -= segSteps;

    for (let s = 0; s < segSteps; s++) {
      const t = s / (segSteps - 1);
      const lat = lerp(a.lat, b.lat, t);
      const lon = lerp(a.lon, b.lon, t);
      pts.push(addGpsJitterKm(lat, lon, rand, jitterKm));
    }
  }

  return pts;
}

function buildStopPoints(location, steps, rand, jitterKm) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    pts.push(addGpsJitterKm(location.lat, location.lon, rand, jitterKm));
  }
  return pts;
}

function buildGpsForLeg(type, steps, rand, jitterKm) {
  switch (type) {
    case "rtm_to_tilburg":
      return buildSegmentPolyline(ROUTE_RTM_TO_TILBURG, steps, rand, jitterKm);
    case "tilburg_to_budapest":
      return buildSegmentPolyline(ROUTE_TILBURG_TO_BUDAPEST, steps, rand, jitterKm);
    case "budapest_to_tilburg":
      return buildSegmentPolyline(ROUTE_BUDAPEST_TO_TILBURG, steps, rand, jitterKm);
    case "tilburg_to_rtm":
      return buildSegmentPolyline(ROUTE_TILBURG_TO_RTM, steps, rand, jitterKm);
    case "stop_tilburg":
    case "stop_tilburg_2":
      return buildStopPoints(WP.tilburg, steps, rand, jitterKm);
    case "rest_budapest":
      return buildStopPoints(WP.budapest, steps, rand, jitterKm);
    case "rest_rtm":
      return buildStopPoints(WP.rotterdam, steps, rand, jitterKm);
    default:
      return buildStopPoints(WP.rotterdam, steps, rand, jitterKm);
  }
}

function buildCycleTimeline(startDate, daysTotal) {
  const start = new Date(startDate);
  const end = addMinutes(start, daysTotal * 24 * 60);

  const legsDef = [
    { type: "rtm_to_tilburg", mins: 60 },
    { type: "stop_tilburg", mins: 240 },
    { type: "tilburg_to_budapest", mins: 32 * 60 },
    { type: "rest_budapest", mins: 48 * 60 },
    { type: "budapest_to_tilburg", mins: 32 * 60 },
    { type: "stop_tilburg_2", mins: 240 },
    { type: "tilburg_to_rtm", mins: 60 },
    { type: "rest_rtm", mins: 48 * 60 },
  ];

  const legs = [];
  let t = new Date(start);

  while (t < end) {
    for (const l of legsDef) {
      const t2 = addMinutes(t, l.mins);
      legs.push({ type: l.type, from: new Date(t), to: new Date(t2) });
      t = t2;
      if (t >= end) break;
    }
  }

  return { start, end, legs };
}

function generateSensors({ ts, phase, rand }) {
  const hod = hourOfDay(ts);
  const weekend = isWeekend(ts);

  // Temperature: bigger swings, koeltransport colder while long driving
  const dayWave = Math.sin(((hod - 6) / 24) * 2 * Math.PI);
  let tempC = 6 + 2.8 * dayWave + (rand() - 0.5) * 0.8;

  if (phase === "tilburg_to_budapest" || phase === "budapest_to_tilburg") {
    tempC -= 1.4 + rand() * 0.4; // reefer running
  }
  if (phase.startsWith("stop") || phase.startsWith("rest")) {
    tempC += 0.7 + rand() * 0.5; // drift up slightly
  }

  // Humidity: night higher + multi-day rain spell
  const nightHumid = Math.cos(((hod - 3) / 24) * 2 * Math.PI);
  let rhPct = 58 + 12 * nightHumid + (rand() - 0.5) * 4.0;

  const dayIndex = Math.floor(ts.getTime() / (24 * 3600 * 1000));
  const inRain = dayIndex % 14 >= 6 && dayIndex % 14 <= 9;
  if (inRain) rhPct += 12 + rand() * 5;

  rhPct = clamp(rhPct, 35, 98);

  // Vibration RMS
  let vibrationRms;
  if (phase.includes("to_")) vibrationRms = 0.35 + rand() * 0.35;
  else if (phase.startsWith("stop")) vibrationRms = 0.12 + rand() * 0.10;
  else vibrationRms = 0.03 + rand() * 0.05;

  // Weekend effect
  if (weekend) vibrationRms *= 0.55;

  // Dominant frequency
  let vibrationHz;
  if (phase.includes("to_")) vibrationHz = 18 + rand() * 37;
  else if (phase.startsWith("stop")) vibrationHz = 6 + rand() * 12;
  else vibrationHz = rand() * 6;

  if (weekend) vibrationHz *= 0.7;

  // Slight correlation: higher RMS => slightly higher Hz
  vibrationHz += vibrationRms * (8 + rand() * 8);

  return {
    tempC: Number(tempC.toFixed(2)),
    rhPct: Number(rhPct.toFixed(1)),
    vibrationRms: Number(clamp(vibrationRms, 0, 2).toFixed(3)),
    vibrationHz: Number(clamp(vibrationHz, 0, 120).toFixed(1)),
  };
}

function generateImpactG({ ts, phase, rand, impactThresholdG }) {
  // baseline near zero
  let impactG = 0.02 + rand() * 0.08;

  // Small bump once during Tilburg stop (loading pallet)
  if (phase === "stop_tilburg" || phase === "stop_tilburg_2") {
    const minuteInBlock = ts.getHours() * 60 + ts.getMinutes();
    // deterministic-ish: happens at minute 20 modulo the stop length
    if (minuteInBlock % 240 === 20) {
      impactG = impactThresholdG + 0.35 + rand() * 0.2; // ~2.35..2.55
    }
  }

  // Big drop + aftershocks on Tilburg->Budapest
  if (phase === "tilburg_to_budapest") {
    const minuteOfDay = ts.getHours() * 60 + ts.getMinutes();
    if (minuteOfDay % (24 * 60) === 11) impactG = 7.8 + rand() * 1.8; // big fall
    if (minuteOfDay % (24 * 60) === 41) impactG = 2.4 + rand() * 0.6; // aftershock
    if (minuteOfDay % (24 * 60) === 71) impactG = 1.6 + rand() * 0.4; // settling
  }

  return Number(impactG.toFixed(2));
}

export function generateMockData({
  trackingCode = "CS-DEMO",
  days = 60,
  sampleMinutes = 30,
  sampleJitterMinutes = 3,
  gpsJitterKm = 1.0,
  impactThresholdG = 2.0,
  startDate = null,
  batteryDrainDays = 90, // ~3 months for 2xAAA in your story
} = {}) {
  const seed = hashStringToSeed(trackingCode);
  const rand = mulberry32(seed);

  const start =
    startDate instanceof Date ? new Date(startDate) : new Date(Date.now() - days * 24 * 60 * 60000);

  const { end, legs } = buildCycleTimeline(start, days);

  const points = [];
  let lastBatteryPct = 100;

  for (const leg of legs) {
    const legMins = minutesBetween(leg.from, leg.to);
    const steps = Math.max(2, Math.round(legMins / sampleMinutes));

    const gpsPts = buildGpsForLeg(leg.type, steps, rand, gpsJitterKm);

    for (let i = 0; i < steps; i++) {
      const ideal = addMinutes(leg.from, Math.round((i / (steps - 1)) * legMins));
      const jitter = Math.round((rand() * 2 - 1) * sampleJitterMinutes);
      const ts = addMinutes(ideal, jitter);

      if (ts < start || ts > end) continue;

      const gps = gpsPts[i] || gpsPts[gpsPts.length - 1];
      const sensors = generateSensors({ ts, phase: leg.type, rand });
      const impactG = generateImpactG({ ts, phase: leg.type, rand, impactThresholdG });

      // Battery: ideal linear drain with small noise, but monotonic decreasing
      const elapsedDays = (ts.getTime() - start.getTime()) / (24 * 3600 * 1000);
      const idealPct = 100 * (1 - elapsedDays / batteryDrainDays);
      const noisyPct = idealPct + (rand() - 0.5) * 1.2; // ±0.6%
      const pct = clamp(noisyPct, 0, 100);
      const batteryPct = Math.min(lastBatteryPct, pct);
      lastBatteryPct = batteryPct;

      // Optional voltage (indicative)
      const batteryV = 3.0 + (batteryPct / 100) * 0.6 + (rand() - 0.5) * 0.02;

      points.push({
        ts: ts.toISOString(),
        trackingCode,

        lat: Number(gps.lat.toFixed(6)),
        lon: Number(gps.lon.toFixed(6)),

        tempC: sensors.tempC,
        rhPct: sensors.rhPct,

        impactG,
        vibrationRms: sensors.vibrationRms,
        vibrationHz: sensors.vibrationHz,

        batteryPct: Number(batteryPct.toFixed(1)),
        batteryV: Number(clamp(batteryV, 2.8, 3.65).toFixed(2)),
      });
    }
  }

  points.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return points;
}