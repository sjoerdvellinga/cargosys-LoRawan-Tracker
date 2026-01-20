// src/pages/Track.jsx
import React, { useMemo, useState, useEffect } from "react";
import DeviceMap from "../components/DeviceMap";
import { generateMockData } from "../mock/mockData";

// --- helpers
function downsample(points, maxPoints) {
  if (!Array.isArray(points)) return [];
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

function toCsv(rows) {
  const header = [
    "ts",
    "lat",
    "lon",
    "tempC",
    "rhPct",
    "impactG",
    "vibrationRms",
    "vibrationHz",
    "batteryPct",
    "batteryV"
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.ts,
        r.lat,
        r.lon,
        r.tempC,
        r.rhPct,
        r.impactG,
        r.vibrationRms,
        r.vibrationHz,
        r.batteryPct,
        r.batteryV
      ].join(",")
    );
  }
  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatIsoLocal(dt) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(
    dt.getMinutes()
  )}`;
}

function parseIsoLocal(value) {
  if (!value) return null;
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}

// --- tiny chart (SVG)
function MiniLineChart({ title, series, height = 220, valueKey, yLabel, threshold }) {
  const w = 900;
  const h = height;
  const pad = 40;

  const pts = series.map((p) => ({
    x: p.ts.getTime(),
    y: Number(p[valueKey] ?? 0)
  }));

  const xMin = Math.min(...pts.map((p) => p.x));
  const xMax = Math.max(...pts.map((p) => p.x));
  const yMin = Math.min(...pts.map((p) => p.y));
  const yMax = Math.max(...pts.map((p) => p.y));

  const yMinPad = yMin - (yMax - yMin) * 0.05;
  const yMaxPad = yMax + (yMax - yMin) * 0.05;

  const scaleX = (x) => (xMax === xMin ? pad : pad + ((x - xMin) / (xMax - xMin)) * (w - pad * 2));
  const scaleY = (y) =>
    yMaxPad === yMinPad ? h / 2 : h - pad - ((y - yMinPad) / (yMaxPad - yMinPad)) * (h - pad * 2);

  const d =
    pts.length < 2
      ? ""
      : pts.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.x).toFixed(2)} ${scaleY(p.y).toFixed(2)}`).join(" ");

  const thrY = threshold != null ? scaleY(threshold) : null;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ opacity: 0.8 }}>{yLabel}</div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", borderRadius: 12, opacity: 0.95 }}>
        {[0, 1, 2, 3].map((i) => {
          const y = pad + (i / 3) * (h - pad * 2);
          return <line key={i} x1={pad} x2={w - pad} y1={y} y2={y} stroke="rgba(255,255,255,0.15)" />;
        })}

        {thrY != null && (
          <g>
            <line x1={pad} x2={w - pad} y1={thrY} y2={thrY} stroke="rgba(255,80,80,0.8)" strokeDasharray="6 6" />
            <text x={pad} y={thrY - 6} fill="rgba(255,180,180,0.9)" fontSize="14">
              threshold: {threshold}
            </text>
          </g>
        )}

        <path d={d} fill="none" stroke="rgba(160,210,255,0.95)" strokeWidth="3" />

        {pts.map((p, i) => {
          const isOver = threshold != null && p.y >= threshold;
          return (
            <circle
              key={i}
              cx={scaleX(p.x)}
              cy={scaleY(p.y)}
              r={isOver ? 5 : 3.5}
              fill={isOver ? "rgba(255,80,80,0.95)" : "rgba(255,255,255,0.9)"}
              stroke="rgba(0,0,0,0.25)"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function Track() {
  const [trackingCode, setTrackingCode] = useState("");
  const [loadedCode, setLoadedCode] = useState("");

  const [rangePreset, setRangePreset] = useState("24h"); // 24h | 7d | 30d | all | custom
  const [fromLocal, setFromLocal] = useState("");
  const [toLocal, setToLocal] = useState("");

  const [chartMaxPoints, setChartMaxPoints] = useState(500);
  const [impactThresholdG, setImpactThresholdG] = useState(2.0);

  // toggles
  const [showDots, setShowDots] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [followLast, setFollowLast] = useState(false);

  // route density
  const [routeMode, setRouteMode] = useState("auto"); // auto | 1 | 2 | 5 | 10 | 25
  const [routeEveryNth, setRouteEveryNth] = useState(1);

  const allPoints = useMemo(() => {
    const codeSeed = loadedCode || "CS-DEMO";
    return generateMockData({
      trackingCode: codeSeed,
      days: 60,
      sampleMinutes: 30,
      sampleJitterMinutes: 3,
      gpsJitterKm: 1.0,
      impactThresholdG: impactThresholdG
    });
  }, [loadedCode, impactThresholdG]);

  const { from, to } = useMemo(() => {
    if (!allPoints.length) return { from: null, to: null };
    const minTs = new Date(allPoints[0].ts);
    const maxTs = new Date(allPoints[allPoints.length - 1].ts);

    const nowTo = maxTs;
    if (rangePreset === "all") return { from: minTs, to: maxTs };
    if (rangePreset === "24h") return { from: new Date(nowTo.getTime() - 24 * 3600 * 1000), to: nowTo };
    if (rangePreset === "7d") return { from: new Date(nowTo.getTime() - 7 * 24 * 3600 * 1000), to: nowTo };
    if (rangePreset === "30d") return { from: new Date(nowTo.getTime() - 30 * 24 * 3600 * 1000), to: nowTo };

    const f = parseIsoLocal(fromLocal);
    const t = parseIsoLocal(toLocal);
    if (f && t && f <= t) return { from: f, to: t };
    return { from: new Date(nowTo.getTime() - 24 * 3600 * 1000), to: nowTo };
  }, [allPoints, rangePreset, fromLocal, toLocal]);

  useEffect(() => {
    if (!allPoints.length) return;
    if (!from || !to) return;
    setFromLocal(formatIsoLocal(from));
    setToLocal(formatIsoLocal(to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangePreset, allPoints.length]);

  const inRangePoints = useMemo(() => {
    if (!from || !to) return [];
    const f = from.getTime();
    const t = to.getTime();
    return allPoints.filter((p) => {
      const ts = new Date(p.ts).getTime();
      return ts >= f && ts <= t;
    });
  }, [allPoints, from, to]);

  const chartSeries = useMemo(() => {
    const normalized = inRangePoints
      .map((p) => ({ ...p, ts: new Date(p.ts) }))
      .sort((a, b) => a.ts - b.ts);
    return downsample(normalized, chartMaxPoints);
  }, [inRangePoints, chartMaxPoints]);

  const mapPoints = useMemo(() => inRangePoints, [inRangePoints]);

  // snap-to-density includes 10/25 at high volumes
  const defaultNth = useMemo(() => {
    const n = mapPoints.length;
    return n > 10000 ? 25 : n > 5000 ? 10 : n > 3000 ? 5 : n > 1500 ? 2 : 1;
  }, [mapPoints.length]);

  useEffect(() => {
    if (routeMode === "auto") setRouteEveryNth(defaultNth);
    else setRouteEveryNth(Number(routeMode));
  }, [routeMode, defaultNth]);

  const routeLabel =
    routeMode === "auto" ? `Auto (${defaultNth === 1 ? "All" : `/${defaultNth}`})` : `/${routeEveryNth}`;

  const formatTooltip = (p) => {
    const ts = p.ts instanceof Date ? p.ts : new Date(p.ts);
    return `${ts.toISOString()} • ${Number(p.lat).toFixed(4)}, ${Number(p.lon).toFixed(4)} • impact ${Number(
      p.impactG ?? 0
    ).toFixed(2)}g • freq ${Number(p.vibrationHz ?? 0).toFixed(1)}Hz • batt ${Number(p.batteryPct ?? 0).toFixed(1)}%`;
  };

  const onViewData = () => setLoadedCode(trackingCode.trim() || "CS-DEMO");
  const onDemoData = () => {
    setTrackingCode("CS-DEMO");
    setLoadedCode("CS-DEMO");
  };

  const onDownloadCsv = () => {
    const csv = toCsv(inRangePoints);
    downloadText(`cargosys-${loadedCode || "demo"}-${Date.now()}.csv`, csv);
  };

  return (
    <div style={{ padding: "28px 22px", maxWidth: 1200, margin: "0 auto", color: "#fff" }}>
      <h1 style={{ marginTop: 8 }}>Track a device</h1>
      <div style={{ opacity: 0.85, marginBottom: 14 }}>Enter your tracking code to view sensor data.</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={trackingCode}
          onChange={(e) => setTrackingCode(e.target.value)}
          placeholder="Tracking code (e.g. CS-4K8...)"
          style={{
            width: 320,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.08)",
            color: "#fff"
          }}
        />
        <button onClick={onViewData} style={btnStyle}>
          View data
        </button>
        <button onClick={onDownloadCsv} style={btnStyle}>
          Download CSV
        </button>
        <button onClick={onDemoData} style={btnStyleSecondary}>
          Demo data
        </button>
      </div>

      <div style={{ marginTop: 10, opacity: 0.85 }}>API is not configured yet — showing demo data.</div>

      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 12,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center"
        }}
      >
        <label style={labelStyle}>
          Range:&nbsp;
          <select value={rangePreset} onChange={(e) => setRangePreset(e.target.value)} style={selectStyle}>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
            <option value="all">All</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label style={labelStyle}>
          From:&nbsp;
          <input
            type="datetime-local"
            value={fromLocal}
            onChange={(e) => {
              setRangePreset("custom");
              setFromLocal(e.target.value);
            }}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          To:&nbsp;
          <input
            type="datetime-local"
            value={toLocal}
            onChange={(e) => {
              setRangePreset("custom");
              setToLocal(e.target.value);
            }}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Chart max points:&nbsp;
          <select value={chartMaxPoints} onChange={(e) => setChartMaxPoints(Number(e.target.value))} style={selectStyle}>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
          </select>
        </label>

        <label style={labelStyle}>
          Impact threshold (g):&nbsp;
          <select value={impactThresholdG} onChange={(e) => setImpactThresholdG(Number(e.target.value))} style={selectStyle}>
            <option value={1.5}>1.5</option>
            <option value={2.0}>2.0</option>
            <option value={2.5}>2.5</option>
            <option value={3.0}>3.0</option>
          </select>
        </label>

        <label style={labelStyle}>
          Route points:&nbsp;
          <select value={routeMode} onChange={(e) => setRouteMode(e.target.value)} style={selectStyle}>
            <option value="auto">Auto</option>
            <option value="1">All points</option>
            <option value="2">Every 2nd</option>
            <option value="5">Every 5th</option>
            <option value="10">Every 10th</option>
            <option value="25">Every 25th</option>
          </select>
        </label>

        <label style={toggleStyle}>
          <input type="checkbox" checked={showDots} onChange={(e) => setShowDots(e.target.checked)} />
          <span>Show dots</span>
        </label>

        <label style={toggleStyle}>
          <input type="checkbox" checked={showIncidents} onChange={(e) => setShowIncidents(e.target.checked)} />
          <span>Show incidents</span>
        </label>

        <label style={toggleStyle}>
          <input type="checkbox" checked={followLast} onChange={(e) => setFollowLast(e.target.checked)} />
          <span>Follow last position</span>
        </label>

        <div style={{ opacity: 0.85 }}>
          Charts: {chartSeries.length} pts • Map: {mapPoints.length} pts • Route: {routeLabel}
        </div>
      </div>

      <h2 style={{ marginTop: 22 }}>Location</h2>
      <DeviceMap
        points={mapPoints}
        height={420}
        showRoute
        showRouteDots={showDots}
        showLast
        showIncidents={showIncidents}
        followLast={followLast}
        routeEveryNth={routeEveryNth}
        incidentThresholdG={impactThresholdG}
        formatTooltip={formatTooltip}
      />

      <div style={{ marginTop: 8, opacity: 0.85 }}>
        Route line turns red where impact exceeds threshold. Tooltips show impact, frequency and battery level.
      </div>

      {chartSeries.length >= 2 && (
        <>
          <MiniLineChart title="Temperature" series={chartSeries} valueKey="tempC" yLabel="°C" />
          <MiniLineChart title="Humidity" series={chartSeries} valueKey="rhPct" yLabel="%RH" />
          <MiniLineChart title="Impact" series={chartSeries} valueKey="impactG" yLabel="g" threshold={impactThresholdG} />

          {/* NEW: Frequency chart */}
          <MiniLineChart title="Vibration frequency" series={chartSeries} valueKey="vibrationHz" yLabel="Hz" />

          {/* NEW: Battery level chart */}
          <MiniLineChart title="Battery level" series={chartSeries} valueKey="batteryPct" yLabel="%" />
        </>
      )}
    </div>
  );
}

const btnStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
  cursor: "pointer"
};

const btnStyleSecondary = { ...btnStyle, background: "rgba(255,255,255,0.07)" };

const labelStyle = { display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };

const selectStyle = {
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.20)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff"
};

const inputStyle = {
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.20)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff"
};

const toggleStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.18)"
};