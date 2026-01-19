export function normalizeReadings(readings) {
  return readings.map(d => ({
    ts: d.ts,
    temp: Number(d.temp),
    rh: Number(d.rh),
    impactG: Number(d.impactG),
    vibHz: Number(d.vibHz),
    time: new Date(d.ts).toLocaleString()
  }));
}