import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { mockReadings } from "../mock/mockData.js";
import { downloadCsv } from "../utils/csv.js";
import { Link } from "react-router-dom";

export default function Track() {
  const [code, setCode] = useState("");
  const [active, setActive] = useState(false);

  const data = useMemo(() => {
    return mockReadings.map(d => ({
      ...d,
      time: new Date(d.ts).toLocaleString()
    }));
  }, []);

  return (
    <div style={{ padding: "60px", fontFamily: "Arial" }}>
      <h1>Track a device</h1>
      <p>Enter your tracking code to view sensor data (demo mode).</p>

      <input
        placeholder="Tracking code (e.g. CS-4K8F-21A)"
        value={code}
        onChange={e => setCode(e.target.value)}
        style={{ padding: "8px", marginRight: "8px" }}
      />
      <button onClick={() => setActive(true)}>View data</button>
      <button onClick={() => downloadCsv(`cargosys-${code || "demo"}.csv`, data)}>
        Download CSV
      </button>

      {!active ? (
        <p style={{ marginTop: "20px" }}>Fill in a tracking code to see demo data.</p>
      ) : (
        <>
          <h2>Temperature & Humidity</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" hide />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="temp" name="Temp °C" />
              <Line type="monotone" dataKey="rh" name="Humidity %" />
            </LineChart>
          </ResponsiveContainer>

          <h2>Impact & Vibration</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
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