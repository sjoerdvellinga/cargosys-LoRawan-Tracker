export function normalizeReadings(readings) {
  return readings.map(d => ({
    ts: new Date(d.ts),          // echte Date
    temp: Number(d.temp),
    rh: Number(d.rh),
    impactG: Number(d.impactG),
    vibHz: Number(d.vibHz)
  }));
}