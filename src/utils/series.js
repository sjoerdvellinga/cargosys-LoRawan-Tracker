// Filter readings between two dates (inclusive)
export function filterByRange(readings, fromDate, toDate) {
  const from = fromDate ? new Date(fromDate).getTime() : -Infinity;
  const to = toDate ? new Date(toDate).getTime() : Infinity;

  return readings.filter(r => {
    const t = new Date(r.ts).getTime();
    return t >= from && t <= to;
  });
}

/**
 * Downsample time-series to a max number of points.
 * Strategy: bucket by time, keep:
 * - first point in bucket
 * - max impact point in bucket (preserves spikes)
 * - last point in bucket
 * Then sort & de-dupe.
 */
export function downsample(readings, maxPoints = 250) {
  if (!Array.isArray(readings) || readings.length <= maxPoints) return readings;

  const sorted = [...readings].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const n = sorted.length;

  const start = new Date(sorted[0].ts).getTime();
  const end = new Date(sorted[n - 1].ts).getTime();
  const span = Math.max(1, end - start);

  const bucketCount = Math.min(maxPoints, n);
  const bucketMs = Math.ceil(span / bucketCount);

  const buckets = new Map();
  for (const r of sorted) {
    const t = new Date(r.ts).getTime();
    const key = Math.floor((t - start) / bucketMs);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const picked = [];
  for (const arr of buckets.values()) {
    const a = arr[0];
    const z = arr[arr.length - 1];

    // preserve spikes: pick the max impactG point in this bucket if present
    let m = arr[0];
    for (const r of arr) {
      if (Number(r.impactG) > Number(m.impactG)) m = r;
    }

    picked.push(a, m, z);
  }

  // de-dupe by timestamp+values (simple)
  const seen = new Set();
  const unique = [];
  for (const r of picked) {
    const key = `${r.ts}|${r.temp}|${r.rh}|${r.impactG}|${r.vibHz}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  unique.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return unique;
}

export function addFlags(readings, { impactThresholdG = 2.0 } = {}) {
  return readings.map(r => ({
    ...r,
    impactExceeded: Number(r.impactG) >= Number(impactThresholdG)
  }));
}