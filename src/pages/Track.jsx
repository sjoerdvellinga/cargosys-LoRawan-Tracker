// src/pages/Track.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import DeviceMap from "../components/DeviceMap.jsx";
import { generateMockData } from "../mock/mockData.js";

// Small utilities (no extra files needed)
function toMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function fmtDateTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  // YYYY-MM-DD HH:mm
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

// Simple time range presets
const RANGE_PRESETS = [
  { key: "24h", label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "custom", label: "Custom", ms: null },
];

// Chart max points presets (Option A style: simple select)
const CHART_MAX_PRESETS = [200, 500, 1000, 2000];

// Route point density options (UI)
const ROUTE_NTH_OPTIONS = [
  { label: "Auto (All)", value: 0 },
  { label: "All points", value: 1 },
  { label: "Every 2nd", value: 2 },
  { label: "Every 5th", value: 5 },
  { label: "Every 10th", value: 10 },
  { label: "Every 25th", value: 25 },
];

export default function Track() {
  // UI state
  const [trackingCode, setTrackingCode] = useState("");
  const [loadedCode, setLoadedCode] = useState("");

  const [useDemo, setUseDemo] = useState(true);

  const [rangeKey, setRangeKey] = useState("24h");
  const [fromMs, setFromMs] = useState(0);
  const [toMs, setToMs] = useState(0);

  const [chartMaxPoints, setChartMaxPoints] = useState(500);
  const [impactThresholdG, setImpactThresholdG] = useState(2.0);

  const [routeNth, setRouteNth] = useState(0); // 0 = auto
  const [showDots, setShowDots] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [followLast, setFollowLast] = useState(true);

  // Battery option A (simple): just show in charts with same downsampling & range
  // No extra UI needed besides displaying the chart; but we keep it consistent.

  // Data cache
  const demoAll = useMemo(() => {
    // Demo: 60 days, ~30min intervals with jitter & route jitter in generator
    return generateMockData({
      trackingCode: loadedCode || "CS-DEMO",
      days: 60,
      impactThresholdG,
    });
    // impactThresholdG affects how many points cross threshold in generator
  }, [loadedCode, impactThresholdG]);

  const allPoints = useMemo(() => {
    // You can later replace with real API fetch using loadedCode
    // For now: demo only
    return useDemo ? demoAll : demoAll;
  }, [useDemo, demoAll]);

  // Initialize time window (on first load or when range preset changes)
  useEffect(() => {
    if (!allPoints?.length) return;

    const maxTs = toMs(allPoints[allPoints.length - 1].ts);
    const minTs = toMs(allPoints[0].ts);

    if (!toMs || !maxTs) return;

    if (rangeKey === "custom") {
      // If custom and not set yet, default to last 24h
      if (!fromMs || !toMs) {
        const newTo = maxTs;
        const newFrom = Math.max(minTs, newTo - 24 * 60 * 60 * 1000);
        setFromMs(newFrom);
        setToMs(newTo);
      }
      return;
    }

    const preset = RANGE_PRESETS.find((p) => p.key === rangeKey);
    const span = preset?.ms ?? 24 * 60 * 60 * 1000;

    const newTo = maxTs;
    const newFrom = Math.max(minTs, newTo - span);
    setFromMs(newFrom);
    setToMs(newTo);
  }, [rangeKey, allPoints]);

  // Derived: filtered points in time range
  const rangePoints = useMemo(() => {
    if (!allPoints?.length) return [];
    const a = fromMs || 0;
    const b = toMs || 0;
    if (!a || !b) return allPoints;

    const out = [];
    for (const p of allPoints) {
      const t = toMs(p.ts);
      if (t >= a && t <= b) out.push(p);
    }
    return out;
  }, [allPoints, fromMs, toMs]);

  // Downsampling for charts: keep <= chartMaxPoints evenly across the range
  const chartPoints = useMemo(() => {
    const pts = rangePoints;
    if (!pts.length) return [];
    if (pts.length <= chartMaxPoints) return pts;

    const step = Math.ceil(pts.length / chartMaxPoints);
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
    // ensure last point included
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out;
  }, [rangePoints, chartMaxPoints]);

  // Map points (all range points, but can be thinned in map component via nth)
  const mapPoints = useMemo(() => {
    // Ensure lat/lon are present
    return rangePoints.filter((p) => isNum(p.lat) && isNum(p.lon));
  }, [rangePoints]);

  const incidentPoints = useMemo(() => {
    return mapPoints.filter((p) => isNum(p.impactG) && p.impactG >= impactThresholdG);
  }, [mapPoints, impactThresholdG]);

  // Auto route density recommendation (requested)
  const defaultNth = useMemo(() => {
    const n = mapPoints.length;
    return n > 10000 ? 25 : n > 5000 ? 10 : n > 3000 ? 5 : n > 1500 ? 2 : 1;
  }, [mapPoints.length]);

  const effectiveRouteNth = routeNth === 0 ? defaultNth : routeNth;

  // Metrics / debug counters
  const counts = useMemo(() => {
    return {
      charts: chartPoints.length,
      map: mapPoints.length,
      routeNth: effectiveRouteNth,
      incidents: incidentPoints.length,
    };
  }, [chartPoints.length, mapPoints.length, effectiveRouteNth, incidentPoints.length]);

  // CSV export
  const downloadCsv = () => {
    const pts = rangePoints;
    if (!pts.length) return;

    const cols = [
      "ts",
      "trackingCode",
      "lat",
      "lon",
      "tempC",
      "rhPct",
      "impactG",
      "vibrationRms",
      "vibrationHz",
      "batteryPct",
      "batteryV",
    ];

    const lines = [];
    lines.push(cols.join(","));
    for (const p of pts) {
      const row = cols
        .map((k) => {
          const v = p[k];
          if (v === null || v === undefined) return "";
          const s = String(v);
          // escape
          if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(",");
      lines.push(row);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = `${loadedCode || "CS-DEMO"}_${fmtDateTime(fromMs).replace(/[: ]/g, "-")}_${fmtDateTime(
      toMs
    ).replace(/[: ]/g, "-")}.csv`;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Load button behavior (demo now)
  const loadData = () => {
    const code = trackingCode.trim();
    setLoadedCode(code);
    setUseDemo(true);
  };

  const useDemoNow = () => {
    setTrackingCode("");
    setLoadedCode("CS-DEMO");
    setUseDemo(true);
  };

  // Basic inline chart renderer (no external libs)
  // This keeps Track.jsx self-contained. If you're already using a chart lib,
  // you can swap these sections out.
  function SimpleLineChart({
    title,
    yLabel,
    series,
    threshold,
    height = 280,
  }) {
    // series: [{name, values: [{xMs, y}]}]
    const all = [];
    for (const s of series) for (const v of s.values) all.push(v);
    const xs = all.map((v) => v.xMs);
    const ys = all.map((v) => v.y);

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMinRaw = Math.min(...ys);
    const yMaxRaw = Math.max(...ys);

    const pad = (yMaxRaw - yMinRaw) * 0.08 || 1;
    const yMin = yMinRaw - pad;
    const yMax = yMaxRaw + pad;

    const w = 900;
    const h = height;
    const left = 55;
    const right = 18;
    const top = 18;
    const bottom = 30;

    const xTo = (x) => {
      if (xMax === xMin) return left;
      return left + ((x - xMin) / (xMax - xMin)) * (w - left - right);
    };
    const yTo = (y) => {
      if (yMax === yMin) return top + (h - top - bottom) / 2;
      return top + ((yMax - y) / (yMax - yMin)) * (h - top - bottom);
    };

    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks);

    return (
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ opacity: 0.8 }}>{yLabel}</div>
        </div>

        <div
          style={{
            marginTop: 10,
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            padding: 12,
            overflowX: "auto",
          }}
        >
          <svg width={w} height={h} style={{ display: "block" }}>
            {/* grid + y labels */}
            {yTicks.map((t, i) => {
              const y = yTo(t);
              return (
                <g key={i}>
                  <line
                    x1={left}
                    x2={w - right}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.12)"
                    strokeDasharray="4 4"
                  />
                  <text x={10} y={y + 4} fill="rgba(255,255,255,0.65)" fontSize="12">
                    {t.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* threshold */}
            {typeof threshold === "number" && Number.isFinite(threshold) && (
              <g>
                <line
                  x1={left}
                  x2={w - right}
                  y1={yTo(threshold)}
                  y2={yTo(threshold)}
                  stroke="rgba(255,80,80,0.9)"
                  strokeWidth="2"
                />
                <text
                  x={w - right - 6}
                  y={yTo(threshold) - 6}
                  fill="rgba(255,80,80,0.9)"
                  fontSize="12"
                  textAnchor="end"
                >
                  threshold
                </text>
              </g>
            )}

            {/* series */}
            {series.map((s, idx) => {
              const d = s.values
                .map((v, i) => `${i === 0 ? "M" : "L"} ${xTo(v.xMs).toFixed(2)} ${yTo(v.y).toFixed(2)}`)
                .join(" ");
              return (
                <g key={s.name || idx}>
                  <path d={d} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
                </g>
              );
            })}

            {/* x labels */}
            <text x={left} y={h - 8} fill="rgba(255,255,255,0.65)" fontSize="12">
              {fmtDateTime(xMin)}
            </text>
            <text x={w - right} y={h - 8} fill="rgba(255,255,255,0.65)" fontSize="12" textAnchor="end">
              {fmtDateTime(xMax)}
            </text>
          </svg>
        </div>
      </div>
    );
  }

  // Build series from chartPoints
  const seriesTempHum = useMemo(() => {
    const valuesT = [];
    const valuesH = [];
    for (const p of chartPoints) {
      const x = toMs(p.ts);
      if (isNum(p.tempC)) valuesT.push({ xMs: x, y: p.tempC });
      if (isNum(p.rhPct)) valuesH.push({ xMs: x, y: p.rhPct });
    }
    return { valuesT, valuesH };
  }, [chartPoints]);

  const seriesImpact = useMemo(() => {
    const values = [];
    for (const p of chartPoints) {
      const x = toMs(p.ts);
      if (isNum(p.impactG)) values.push({ xMs: x, y: p.impactG });
    }
    return values;
  }, [chartPoints]);

  const seriesVibration = useMemo(() => {
    const valuesR = [];
    const valuesF = [];
    for (const p of chartPoints) {
      const x = toMs(p.ts);
      if (isNum(p.vibrationRms)) valuesR.push({ xMs: x, y: p.vibrationRms });
      if (isNum(p.vibrationHz)) valuesF.push({ xMs: x, y: p.vibrationHz });
    }
    return { valuesR, valuesF };
  }, [chartPoints]);

  const seriesBattery = useMemo(() => {
    const valuesPct = [];
    const valuesV = [];
    for (const p of chartPoints) {
      const x = toMs(p.ts);
      if (isNum(p.batteryPct)) valuesPct.push({ xMs: x, y: p.batteryPct });
      if (isNum(p.batteryV)) valuesV.push({ xMs: x, y: p.batteryV });
    }
    return { valuesPct, valuesV };
  }, [chartPoints]);

  // Basic styling
  const page = {
    color: "white",
    minHeight: "100vh",
    padding: "26px 22px 60px",
    background: "radial-gradient(1200px 700px at 15% 10%, rgba(60,120,255,0.18), transparent 60%), #061a33",
  };
  const input = {
    height: 38,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    padding: "0 12px",
    outline: "none",
  };
  const button = {
    height: 38,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    padding: "0 12px",
    cursor: "pointer",
  };
  const pill = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
  };
  const panel = {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  };
  const label = { opacity: 0.8, fontSize: 12, marginBottom: 4 };
  const row = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" };

  return (
    <div style={page}>
      <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0.2 }}>Track a device</h1>
      <div style={{ marginTop: 6, opacity: 0.85 }}>
        Enter your tracking code to view sensor data.
      </div>

      {/* Top bar */}
      <div style={{ ...row, marginTop: 14 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={label}>Tracking code</div>
          <input
            style={{ ...input, width: 320 }}
            placeholder="Tracking code (e.g. CS-4K8)"
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value)}
          />
        </div>

        <button style={button} onClick={loadData}>
          View data
        </button>

        <button style={button} onClick={downloadCsv}>
          Download CSV
        </button>

        <button style={button} onClick={useDemoNow}>
          Demo data
        </button>

        <div style={{ ...pill, marginLeft: "auto" }}>
          <span style={{ opacity: 0.85 }}>API</span>
          <span style={{ fontWeight: 600 }}>not configured</span>
          <span style={{ opacity: 0.7 }}>— demo</span>
        </div>
      </div>

      {/* Controls */}
      <div style={panel}>
        <div style={{ ...row, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}>
            {/* Range */}
            <div>
              <div style={label}>Range</div>
              <select
                style={{ ...input, height: 38 }}
                value={rangeKey}
                onChange={(e) => setRangeKey(e.target.value)}
              >
                {RANGE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={label}>From</div>
              <input
                style={{ ...input, width: 190 }}
                type="datetime-local"
                value={
                  fromMs
                    ? new Date(fromMs - new Date().getTimezoneOffset() * 60000)
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  setRangeKey("custom");
                  const t = Date.parse(e.target.value);
                  if (Number.isFinite(t)) setFromMs(t);
                }}
              />
            </div>

            <div>
              <div style={label}>To</div>
              <input
                style={{ ...input, width: 190 }}
                type="datetime-local"
                value={
                  toMs
                    ? new Date(toMs - new Date().getTimezoneOffset() * 60000)
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  setRangeKey("custom");
                  const t = Date.parse(e.target.value);
                  if (Number.isFinite(t)) setToMs(t);
                }}
              />
            </div>

            {/* Chart max points */}
            <div>
              <div style={label}>Chart max points</div>
              <select
                style={{ ...input, height: 38 }}
                value={chartMaxPoints}
                onChange={(e) => setChartMaxPoints(+e.target.value)}
              >
                {CHART_MAX_PRESETS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Impact threshold */}
            <div>
              <div style={label}>Impact threshold (g)</div>
              <input
                style={{ ...input, width: 120 }}
                type="number"
                step="0.1"
                min="0"
                value={impactThresholdG}
                onChange={(e) => setImpactThresholdG(clamp(+e.target.value, 0, 99))}
              />
            </div>

            {/* Route points */}
            <div>
              <div style={label}>Route points</div>
              <select
                style={{ ...input, height: 38 }}
                value={routeNth}
                onChange={(e) => setRouteNth(+e.target.value)}
              >
                {ROUTE_NTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", paddingBottom: 2 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.9 }}>
                <input type="checkbox" checked={showDots} onChange={(e) => setShowDots(e.target.checked)} />
                Show dots
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={showIncidents}
                  onChange={(e) => setShowIncidents(e.target.checked)}
                />
                Show incidents
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={followLast}
                  onChange={(e) => setFollowLast(e.target.checked)}
                />
                Follow last position
              </label>
            </div>
          </div>

          {/* Counters */}
          <div style={{ opacity: 0.85, paddingBottom: 2 }}>
            Charts: <b>{counts.charts}</b> pts · Map: <b>{counts.map}</b> pts · Route:{" "}
            <b>{routeNth === 0 ? `Auto (every ${counts.routeNth}th)` : `Every ${counts.routeNth}th`}</b> ·
            Incidents: <b>{counts.incidents}</b>
          </div>
        </div>
      </div>

      {/* Location */}
      <h2 style={{ marginTop: 22 }}>Location</h2>
      <div style={{ opacity: 0.8, marginTop: -6, marginBottom: 10 }}>
        Route shows GPS samples in the selected time range. Red markers indicate impact above threshold.
      </div>

      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
        <DeviceMap
          points={mapPoints}
          incidents={incidentPoints}
          impactThresholdG={impactThresholdG}
          nth={effectiveRouteNth}
          showDots={showDots}
          showIncidents={showIncidents}
          followLast={followLast}
        />
      </div>

      {/* Charts */}
      <SimpleLineChart
        title="Temperature"
        yLabel="°C"
        series={[{ name: "tempC", values: seriesTempHum.valuesT }]}
      />
      <SimpleLineChart
        title="Humidity"
        yLabel="%RH"
        series={[{ name: "rhPct", values: seriesTempHum.valuesH }]}
      />

      <SimpleLineChart
        title="Impact"
        yLabel="g"
        series={[{ name: "impactG", values: seriesImpact }]}
        threshold={impactThresholdG}
      />

      <SimpleLineChart
        title="Vibration RMS"
        yLabel="g RMS"
        series={[{ name: "vibrationRms", values: seriesVibration.valuesR }]}
      />
      <SimpleLineChart
        title="Dominant frequency"
        yLabel="Hz"
        series={[{ name: "vibrationHz", values: seriesVibration.valuesF }]}
      />

      {/* Battery (Option A: same UX pattern as others: range + downsampling already applies) */}
      <SimpleLineChart
        title="Battery level"
        yLabel="%"
        series={[{ name: "batteryPct", values: seriesBattery.valuesPct }]}
      />
      <SimpleLineChart
        title="Battery voltage"
        yLabel="V"
        series={[{ name: "batteryV", values: seriesBattery.valuesV }]}
      />
    </div>
  );
}