import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Dot
} from "recharts";
import { Link } from "react-router-dom";

import { mockReadings } from "../mock/mockData.js";
import { downloadCsv } from "../utils/csv.js";
import { fetchDeviceReadings } from "../api/client.js";

/** ---------- Helpers (self-contained) ---------- **/

function formatTick(date) {
  // date is a Date object
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTooltip(date) {
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function normalizeReadings(readings, impactThresholdG) {
  return readings.map((d) => {
    const impactG = Number(d.impactG);
    return {
      ts: new Date(d.ts), // Date object for axis formatting
      temp: Number(d.temp),
      rh: Number(d.rh),
      impactG,
      vibHz: Number(d.vibHz),
      impactExceeded: impactG >= Number(impactThresholdG)
    };
  });
}

function filterByRange(readings, fromDate, toDate) {
  const from = fromDate ? new Date(fromDate).getTime() : -Infinity;
  const to = toDate ? new Date(toDate).getTime() : Infinity;

  return readings.filter((r) => {
    const t = new Date(r.ts).getTime();
    return t >= from && t <= to;
  });
}

/**
 * Downsample time-series to a max number of points.
 * Bucket by time, keep first + maxImpact + last per bucket to preserve spikes.
 */
function downsample(readings, maxPoints = 250) {
  if (!Array.isArray(readings) || readings.length <= maxPoints) return readings;

  const sorted = [...readings].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const n = sorted.length;

  const start = new Date(sorted[0].ts).getTime();
  const end = new Date(sorted[n - 1].ts).getTime();
  const span = Math.max(1, end - start);

  const bucketCount = Math.min(Number(maxPoints) || 250, n);
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
    const first = arr[0];
    const last = arr[arr.length - 1];

    let maxImpact = arr[0];
    for (const r of arr) {
      if (Number(r.impactG) > Number(maxImpact.impactG)) maxImpact = r;
    }

    picked.push(first, maxImpact, last);
  }

  // de-dupe (coarse)
  const seen = new Set();
  const unique = [];
  for (const r of picked) {
    const k = `${r.ts}|${r.temp}|${r.rh}|${r.impactG}|${r.vibHz}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(r);
    }
  }

  unique.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return unique;
}

function applyPreset(preset, baseReadings) {
  const sorted = [...baseReadings].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const end = sorted.length ? new Date(sorted[sorted.length - 1].ts) : new Date();
  let start = null;

  if (preset === "24h") start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  if (preset === "7d") start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (preset === "30d") start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    from: start ? start.toISOString().slice(0, 16) : "",
    to: end.toISOString().slice(0, 16)
  };
}

function ImpactDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  if (!payload?.impactExceeded) return null;
  return <Dot cx={cx} cy={cy} r={4} fill="#ff4d4f" stroke="none" />;
}

/** ---------- Component ---------- **/

export default function Track() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | ready
  const [errorMsg, setErrorMsg] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [readings, setReadings] = useState([]);

  // Range + performance + thresholds
  const [rangePreset, setRangePreset] = useState("24h"); // 24h | 7d | 30d | custom
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [maxPoints, setMaxPoints] = useState(250);
  const [impactThresholdG, setImpactThresholdG] = useState(2.0);

  async function onView() {
    const trimmed = code.trim();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");
    setIsDemo(false);

    try {
      const apiReadings = await fetchDeviceReadings(trimmed);
      setReadings(apiReadings);

      if (rangePreset !== "custom") {
        const p = applyPreset(rangePreset, apiReadings);
        setFrom(p.from);
        setTo(p.to);
      }

      setStatus("ready");
    } catch (err) {
      // fallback to mock data
      setIsDemo(true);
      setReadings(mockReadings);

      if (rangePreset !== "custom") {
        const p = applyPreset(rangePreset, mockReadings);
        setFrom(p.from);
        setTo(p.to);
      }

      const msg =
        err?.code === "NO_API"
          ? "API is not configured yet — showing demo data."
          : "Could not load live data — showing demo data.";

      setErrorMsg(msg);
      setStatus("ready");
    }
  }

  const processed = useMemo(() => {
    if (!readings.length) return [];
    const filtered = filterByRange(readings, from || null, to || null);
    const sampled = downsample(filtered, Number(maxPoints) || 250);
    return normalizeReadings(sampled, Number(impactThresholdG) || 2.0);
  }, [readings, from, to, maxPoints, impactThresholdG]);

  function onDownload() {
    const trimmed = code.trim() || "demo";
    if (!processed.length) return;

    // For CSV we prefer raw-ish fields, convert Date -> ISO
    const rows = processed.map((d) => ({
      ts: d.ts.toISOString(),
      temp: d.temp,
      rh: d.rh,
      impactG: d.impactG,
      vibHz: d.vibHz
    }));

    downloadCsv(`cargosys-${trimmed}.csv`, rows);
  }

  return (
    <div style={{ padding: "60px", fontFamily: "Arial" }}>
      <h1>Track a device</h1>
      <p>Enter your tracking code to view sensor data.</p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Tracking code (e.g. CS-4K8F-21A)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ padding: "10px 12px", minWidth: "280px" }}
        />

        <button onClick={onView} disabled={status === "loading"} style={{ padding: "10px 12px" }}>
          {status === "loading" ? "Loading..." : "View data"}
        </button>

        <button onClick={onDownload} disabled={!processed.length} style={{ padding: "10px 12px" }}>
          Download CSV
        </button>

        {isDemo && (
          <span
            style={{
              padding: "6px 10px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              fontSize: "12px"
            }}
          >
            Demo data
          </span>
        )}
      </div>

      {errorMsg && <p style={{ marginTop: "14px", opacity: 0.9 }}>{errorMsg}</p>}

      {status === "idle" && <p style={{ marginTop: "20px" }}>Fill in a tracking code to load data.</p>}

      {status === "ready" && (
        <div
          style={{
            marginTop: "18px",
            padding: "14px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "12px"
          }}
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <label>
              Range:&nbsp;
              <select
                value={rangePreset}
                onChange={(e) => {
                  const preset = e.target.value;
                  setRangePreset(preset);

                  if (preset !== "custom") {
                    const p = applyPreset(preset, readings);
                    setFrom(p.from);
                    setTo(p.to);
                  }
                }}
              >
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7d</option>
                <option value="30d">Last 30d</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label>
              From:&nbsp;
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setRangePreset("custom");
                }}
                disabled={rangePreset !== "custom"}
              />
            </label>

            <label>
              To:&nbsp;
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setRangePreset("custom");
                }}
                disabled={rangePreset !== "custom"}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginTop: "12px" }}>
            <label>
              Max points:&nbsp;
              <input
                type="number"
                min="50"
                max="2000"
                step="50"
                value={maxPoints}
                onChange={(e) => setMaxPoints(e.target.value)}
                style={{ width: "110px" }}
              />
            </label>

            <label>
              Impact threshold (g):&nbsp;
              <input
                type="number"
                min="0.5"
                max="50"
                step="0.1"
                value={impactThresholdG}
                onChange={(e) => setImpactThresholdG(e.target.value)}
                style={{ width: "90px" }}
              />
            </label>

            <span style={{ opacity: 0.9 }}>
              Showing <b>{processed.length}</b> points
            </span>
          </div>
        </div>
      )}

      {status === "ready" && processed.length > 0 && (
        <>
          <h2 style={{ marginTop: "28px" }}>Temperature & Humidity</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={processed}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tickFormatter={formatTick} minTickGap={24} />
              <YAxis />
              <Tooltip labelFormatter={formatTooltip} />
              <Legend />
              <Line type="monotone" dataKey="temp" name="Temp °C" dot={false} />
              <Line type="monotone" dataKey="rh" name="Humidity %" dot={false} />
            </LineChart>
          </ResponsiveContainer>

          <h2 style={{ marginTop: "28px" }}>Impact & Vibration</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={processed}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tickFormatter={formatTick} minTickGap={24} />
              <YAxis />
              <Tooltip labelFormatter={formatTooltip} />
              <Legend />

              <ReferenceLine
                y={Number(impactThresholdG)}
                label={`Impact threshold (${impactThresholdG}g)`}
                strokeDasharray="4 4"
              />

              <Line type="monotone" dataKey="impactG" name="Impact g" dot={<ImpactDot />} />
              <Line type="monotone" dataKey="vibHz" name="Vibration Hz" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      <p style={{ marginTop: "40px" }}>
        <Link to="/">← Back to home</Link>
      </p>
    </div>
  );
}