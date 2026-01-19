import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Link } from "react-router-dom";
import { mockReadings } from "../mock/mockData.js";
import { downloadCsv } from "../utils/csv.js";
import { fetchDeviceReadings } from "../api/client.js";
import { normalizeReadings } from "../utils/normalize.js";

export default function Track() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [readings, setReadings] = useState([]);

  const chartData = useMemo(() => normalizeReadings(readings), [readings]);

  async function onView() {
    const trimmed = code.trim();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");
    setIsDemo(false);

    try {
      const apiReadings = await fetchDeviceReadings(trimmed);
      setReadings(apiReadings);
      setStatus("ready");
    } catch (err) {
      // Fallback naar mock data, maar wel duidelijk melden
      setIsDemo(true);
      setReadings(mockReadings);

      // Menselijke melding
      const msg =
        err?.code === "NO_API"
          ? "API is not configured yet — showing demo data."
          : "Could not load live data — showing demo data.";

      setErrorMsg(msg);
      setStatus("ready");
    }
  }

  function onDownload() {
    const trimmed = code.trim() || "demo";
    if (!readings.length) return;
    downloadCsv(`cargosys-${trimmed}.csv`, normalizeReadings(readings).map(({ time, ...rest }) => rest));
  }

  return (
    <div style={{ padding: "60px", fontFamily: "Arial" }}>
      <h1>Track a device</h1>
      <p>Enter your tracking code to view sensor data.</p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Tracking code (e.g. CS-4K8F-21A)"
          value={code}
          onChange={e => setCode(e.target.value)}
          style={{ padding: "10px 12px", minWidth: "280px" }}
        />
        <button onClick={onView} disabled={status === "loading"} style={{ padding: "10px 12px" }}>
          {status === "loading" ? "Loading..." : "View data"}
        </button>
        <button onClick={onDownload} disabled={!readings.length} style={{ padding: "10px 12px" }}>
          Download CSV
        </button>

        {isDemo && (
          <span style={{
            padding: "6px 10px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.12)",
            fontSize: "12px"
          }}>
            Demo data
          </span>
        )}
      </div>

      {errorMsg && (
        <p style={{ marginTop: "14px", opacity: 0.9 }}>
          {errorMsg}
        </p>
      )}

      {status === "idle" && (
        <p style={{ marginTop: "20px" }}>Fill in a tracking code to load data.</p>
      )}

      {status === "ready" && readings.length > 0 && (
        <>
          <h2 style={{ marginTop: "28px" }}>Temperature & Humidity</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="temp" name="Temp °C" />
              <Line type="monotone" dataKey="rh" name="Humidity %" />
            </LineChart>
          </ResponsiveContainer>

          <h2 style={{ marginTop: "28px" }}>Impact & Vibration</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="impactG" name="Impact g" />
              <Line type="monotone" dataKey="vibHz" name="Vibration Hz" />
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