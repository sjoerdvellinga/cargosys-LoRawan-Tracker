// src/api/trackingApi.js
import { fetchDeviceReadings } from "./client";
import { mockReadings } from "../mock/mockData";

const USE_MOCK =
  import.meta.env.VITE_USE_MOCK === "true" ||
  !import.meta.env.VITE_API_BASE_URL;

/**
 * Fetch tracking data for a device
 * @param {Object} params
 * @param {string} params.trackingCode
 * @param {string} params.from ISO string (optional)
 * @param {string} params.to ISO string (optional)
 * @returns {Promise<{ source: "mock" | "api", data: Array }>}
 */
export async function fetchTrackingData({ trackingCode, from, to }) {
  if (USE_MOCK) {
    return { source: "mock", data: mockReadings };
  }

  // Live API via client.js (GET /v1/track/:trackingCode)
  // from/to zijn momenteel nog niet gekoppeld aan het endpoint in client.js.
  const data = await fetchDeviceReadings(trackingCode);

  return { source: "api", data };
}