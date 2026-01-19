import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div style={{ padding: "60px", fontFamily: "Arial" }}>
      <h1>CargoSys – Cargo Monitoring</h1>
      <p>
        We provide LoRaWAN-based cargo monitoring devices that collect temperature,
        humidity, location and impact data — even where mobile networks are unavailable.
      </p>

      <p>
        This website is currently a landing page. A full tracking dashboard is coming soon.
      </p>

      <Link to="/track">Go to tracking demo →</Link>
    </div>
  );
}