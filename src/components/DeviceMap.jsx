// src/components/DeviceMap.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function FitBounds({ latlngs, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!latlngs || latlngs.length < 2) return;
    try {
      map.fitBounds(latlngs, { padding: [28, 28] });
    } catch {
      // ignore
    }
  }, [map, latlngs, enabled]);

  return null;
}

function FollowLast({ last, enabled }) {
  const map = useMap();
  const lastRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (!last) return;

    // Avoid spamming panTo when last hasn't changed
    const key = `${last[0].toFixed(6)}:${last[1].toFixed(6)}`;
    if (lastRef.current === key) return;
    lastRef.current = key;

    try {
      map.panTo(last, { animate: true });
    } catch {
      // ignore
    }
  }, [map, last, enabled]);

  return null;
}

function chunkByImpact(sampled, impactThresholdG) {
  // Split route polyline into segments so impacted segments can be colored red.
  // A segment is "hot" if either endpoint has impact >= threshold.
  if (!sampled || sampled.length < 2) return [];

  const segs = [];
  let cur = {
    hot: (sampled[0].impactG ?? 0) >= impactThresholdG,
    positions: [[sampled[0].lat, sampled[0].lon]],
  };

  for (let i = 1; i < sampled.length; i++) {
    const prev = sampled[i - 1];
    const p = sampled[i];

    const hot =
      ((prev.impactG ?? 0) >= impactThresholdG) || ((p.impactG ?? 0) >= impactThresholdG);

    // if hotness flips, close current and start a new segment
    if (hot !== cur.hot) {
      cur.positions.push([p.lat, p.lon]); // keep continuity
      segs.push(cur);
      cur = { hot, positions: [[p.lat, p.lon]] };
    } else {
      cur.positions.push([p.lat, p.lon]);
    }
  }

  if (cur.positions.length >= 2) segs.push(cur);
  return segs;
}

export default function DeviceMap({
  points = [],
  incidents = [],

  impactThresholdG = 2.0,

  // Route density: use every nth point (1 = all)
  nth = 1,

  // Toggles
  showDots = true,
  showIncidents = true,
  followLast = false,

  // Map behavior
  autoFit = true,
  height = 420,
}) {
  const normalized = useMemo(() => {
    const arr = (points || [])
      .map((p) => ({
        ts: p.ts ? new Date(p.ts) : null,
        lat: Number(p.lat),
        lon: Number(p.lon),
        impactG: Number(p.impactG ?? 0),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .sort((a, b) => (a.ts?.getTime?.() ?? 0) - (b.ts?.getTime?.() ?? 0));

    return arr;
  }, [points]);

  const effectiveNth = useMemo(() => Math.max(1, Number(nth || 1)), [nth]);

  const sampled = useMemo(() => {
    if (effectiveNth === 1) return normalized;
    return normalized.filter((_, idx) => idx % effectiveNth === 0 || idx === normalized.length - 1);
  }, [normalized, effectiveNth]);

  const latlngs = useMemo(() => sampled.map((p) => [p.lat, p.lon]), [sampled]);

  const last = useMemo(() => {
    if (!normalized.length) return null;
    const p = normalized[normalized.length - 1];
    return [p.lat, p.lon];
  }, [normalized]);

  const routeChunks = useMemo(() => chunkByImpact(sampled, impactThresholdG), [sampled, impactThresholdG]);

  const incidentMarkers = useMemo(() => {
    if (!showIncidents) return [];
    const arr = (incidents && incidents.length ? incidents : normalized).filter(
      (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && Number(p.impactG ?? 0) >= impactThresholdG
    );

    // Dedupe by timestamp if present
    const seen = new Set();
    return arr
      .map((p) => ({
        ts: p.ts ? new Date(p.ts) : null,
        lat: Number(p.lat),
        lon: Number(p.lon),
        impactG: Number(p.impactG ?? 0),
      }))
      .filter((p) => {
        const k = p.ts ? p.ts.toISOString() : `${p.lat}:${p.lon}:${p.impactG}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (a.ts?.getTime?.() ?? 0) - (b.ts?.getTime?.() ?? 0));
  }, [incidents, normalized, showIncidents, impactThresholdG]);

  const center = normalized.length ? [normalized[0].lat, normalized[0].lon] : [51.9244, 4.4777];

  return (
    <div style={{ height, width: "100%" }}>
      <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {latlngs.length >= 2 && <FitBounds latlngs={latlngs} enabled={autoFit && !followLast} />}
        <FollowLast last={last} enabled={followLast} />

        {/* Route line (split into red/blue chunks around incidents) */}
        {routeChunks.map((c, idx) => (
          <Polyline
            key={`chunk-${idx}`}
            positions={c.positions}
            pathOptions={{
              weight: 4,
              opacity: 0.95,
              color: c.hot ? "rgba(255,80,80,0.95)" : "rgba(80,170,255,0.95)",
            }}
          />
        ))}

        {/* Route dots */}
        {showDots &&
          sampled.map((p, idx) => {
            const over = (p.impactG ?? 0) >= impactThresholdG;
            return (
              <CircleMarker
                key={`dot-${p.ts ? p.ts.toISOString() : idx}`}
                center={[p.lat, p.lon]}
                radius={over ? 5 : 3.5}
                pathOptions={{
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.85,
                  color: "rgba(0,0,0,0.25)",
                  fillColor: over ? "rgba(255,80,80,0.95)" : "rgba(255,255,255,0.92)",
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  {(p.ts ? p.ts.toISOString() : "—") + ` • ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} • ${p.impactG.toFixed(2)}g`}
                </Tooltip>
              </CircleMarker>
            );
          })}

        {/* Incidents (bigger red dots) */}
        {showIncidents &&
          incidentMarkers.map((p, idx) => (
            <CircleMarker
              key={`inc-${p.ts ? p.ts.toISOString() : idx}`}
              center={[p.lat, p.lon]}
              radius={9}
              pathOptions={{
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9,
                color: "rgba(255,120,120,0.95)",
                fillColor: "rgba(255,80,80,0.95)",
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                {(p.ts ? p.ts.toISOString() : "—") + ` • IMPACT ${p.impactG.toFixed(2)}g`}
              </Tooltip>
            </CircleMarker>
          ))}

        {/* Last position highlight */}
        {last && (
          <CircleMarker
            center={last}
            radius={11}
            pathOptions={{
              weight: 3,
              opacity: 1,
              fillOpacity: 0.95,
              color: "rgba(255,255,255,0.95)",
              fillColor: "rgba(120,220,255,0.95)",
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={1}>
              Last position
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}