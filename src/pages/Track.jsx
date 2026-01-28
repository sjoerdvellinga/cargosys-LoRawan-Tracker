import { useEffect, useMemo, useRef, useState } from "react";
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
  Dot,
} from "recharts";
import { Link } from "react-router-dom";

import { fetchTrackingData } from "../api/trackingApi";
import { downloadCsv } from "../utils/csv";

/* ---------- Helpers ---------- */

function formatTick(date) {
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTooltip(date) {
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalizeReadings(readings, impactThresholdG) {
  return readings.map((d) => {
    const impactG = Number(d.impactG);
    return {
      ts: new Date(d.ts),
      temp: Number(d.tempC ?? d.temp),
      rh: Number(d.rhPct ?? d.rh),
      impactG,
      vibHz: Number(d.vibrationHz ?? d.vibHz),
      impactExceeded: impactG >= impactThresholdG,
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

function downsample(readings, maxPoints = 250) {
  if (!Array.isArray(readings) || readings.length <= maxPoints) return readings;

  const sorted = [...readings].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const bucketSize = Math.ceil(sorted.length / maxPoints);

  const sampled = [];
  for (let i = 0; i < sorted.length; i += bucketSize) {
    const bucket = sorted.slice(i, i + bucketSize);
    bucket.sort((a, b) => Number(b.impactG) - Number(a.impactG));
    sampled.push(bucket[0]); // meest impactvolle punt uit bucket
  }

  sampled.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return sampled;
}

function applyPreset(preset, readings) {
  if (!readings.length) return { from: "", to: "" };

  const sorted = [...readings].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const end = new Date(sorted[sorted.length - 1].ts);
  let start = null;

  if (preset === "24h") start = new Date(end.getTime() - 24 * 3600 * 1000);
  if (preset === "7d") start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
  if (preset === "30d") start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);

  return {
    from: start ? start.toISOString().slice(0, 16) : "",
    to: end.toISOString().slice(0, 16),
  };
}

function ImpactDot({ cx, cy, payload }) {
  if (!payload?.impactExceeded) return null;
  return <Dot cx={cx} cy={cy} r={4} fill="#ff4d4f" stroke="none" />;
}

/* ---------- Component ---------- */

export default function Track() {
  const inputRef = useRef(null);

  const [trackingCode, setTrackingCode] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | ready
  const [error, setError] = useState("");
  const [readings, setReadings] = useState([]);

  const [rangePreset, setRangePreset] = useState("24h"); // 24h | 7d | 30d | custom
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [maxPoints, setMaxPoints] = useState(250);
  const [impactThresholdG, setImpactThresholdG] = useState(2.0);

  const [dataSource, setDataSource] = useState("api"); // api | mock
  const chartHeight = window.innerWidth < 600 ? 260 : 320;

  const LAST_CODE_KEY = "cargosys:lastTrackingCode";
  const [autoLoaded, setAutoLoaded] = useState(false);

  // Load last code once
  useEffect(() => {
    const saved = localStorage.getItem(LAST_CODE_KEY);
    if (saved && !trackingCode && !autoLoaded) {
      setTrackingCode(saved);
      setAutoLoaded(true);

      // Auto-load (na state update)
      setTimeout(() => {
        onView(saved);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoaded]);

  async function onView(forcedCode) {
    const code = (forcedCode ?? trackingCode).trim();
    if (!code) return;

    localStorage.setItem(LAST_CODE_KEY, code);

    setStatus("loading");
    setError("");

    try {
      const result = await fetchTrackingData({
        trackingCode: code,
        // Optioneel later:
        // from: rangePreset === "custom" ? from : undefined,
        // to: rangePreset === "custom" ? to : undefined,
      });

      const data = result?.data ?? result; // extra defensief
      const source = result?.source ?? "api";

      setReadings(Array.isArray(data) ? data : []);
      setDataSource(source);

      if (rangePreset !== "custom") {
        const p = applyPreset(rangePreset, Array.isArray(data) ? data : []);
        setFrom(p.from);
        setTo(p.to);
      }

      setStatus("ready");

      // Zorg dat je daarna weer kunt typen (handig op iOS/Android)
      setTimeout(() => {
        inputRef.current?.focus?.();
      }, 0);
    } catch (err) {
      console.error(err);
      setError("Could not load tracking data.");
      setStatus("idle");
    }
  }

  const processed = useMemo(() => {
    if (!readings.length) return [];
    const filtered = filterByRange(readings, from, to);
    const sampled = downsample(filtered, Number(maxPoints) || 250);
    return normalizeReadings(sampled, Number(impactThresholdG) || 2.0);
  }, [readings, from, to, maxPoints, impactThresholdG]);

  function onDownload() {
    if (!processed.length) return;

    const rows = processed.map((d) => ({
      ts: d.ts.toISOString(),
      temp: d.temp,
      rh: d.rh,
      impactG: d.impactG,
      vibHz: d.vibHz,
    }));

    const safeCode = (trackingCode || "demo").trim() || "demo";
    downloadCsv(`cargosys-${safeCode}.csv`, rows);
  }

  return (
    <div className="app">
      <h1>Track a device</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          ref={inputRef}
          placeholder="Tracking code"
          value={trackingCode}
          onChange={(e) => setTrackingCode(e.target.value)}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          style={{
            padding: "10px 12px",
            fontSize: "16px", // voorkomt iOS input-zoom
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            outline: "none",
            minWidth: 240,
          }}
        />

        <button
          type="button"
          onClick={() => onView()}
          disabled={status === "loading"}
          style={{
            padding: "10px 14px",
            fontSize: "16px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            cursor: status === "loading" ? "not-allowed" : "pointer",
            opacity: status === "loading" ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Loading…" : "View data"}
        </button>

        <button
          type="button"
          onClick={onDownload}
          disabled={!processed.length}
          style={{
            padding: "10px 14px",
            fontSize: "16px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            cursor: !processed.length ? "not-allowed" : "pointer",
            opacity: !processed.length ? 0.6 : 1,
          }}
        >
          Download CSV
        </button>

        {dataSource === "mock" && (
          <span
            style={{
              padding: "6px 10px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              fontSize: "12px",
              marginLeft: "8px",
            }}
          >
            Demo data
          </span>
        )}
      </div>

      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

      {status === "ready" && processed.length > 0 && (
        <>
          <h2>Temperature & Humidity</h2>
          <ResponsiveContainer width="100%" height={chartHeight}>
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

          <h2>Impact & Vibration</h2>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={processed}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tickFormatter={formatTick} minTickGap={24} />
              <YAxis />
              <Tooltip labelFormatter={formatTooltip} />
              <Legend />
              <ReferenceLine
                y={Number(impactThresholdG)}
                strokeDasharray="4 4"
                label={`Threshold ${impactThresholdG}g`}
              />
              <Line type="monotone" dataKey="impactG" name="Impact g" dot={<ImpactDot />} />
              <Line type="monotone" dataKey="vibHz" name="Vibration Hz" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      <p style={{ marginTop: 32 }}>
        <Link to="/">← Back</Link>
      </p>
    </div>
  );
}