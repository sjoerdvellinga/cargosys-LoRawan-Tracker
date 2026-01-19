const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

// Verwacht response shape (voor later):
// { readings: [{ ts, temp, rh, impactG, vibHz, lat?, lon? }] }
export async function fetchDeviceReadings(trackingCode) {
  if (!API_BASE) {
    const err = new Error("API not configured");
    err.code = "NO_API";
    throw err;
  }

  const url = `${API_BASE}/v1/track/${encodeURIComponent(trackingCode)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`API error ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    err.code = "API_ERROR";
    err.status = res.status;
    throw err;
  }

  const json = await res.json();

  // Flexibel: accepteer zowel {readings:[...]} als direct [...]
  const readings = Array.isArray(json) ? json : json.readings;

  if (!Array.isArray(readings)) {
    const err = new Error("Invalid API response: expected readings array");
    err.code = "BAD_RESPONSE";
    throw err;
  }

  return readings;
}