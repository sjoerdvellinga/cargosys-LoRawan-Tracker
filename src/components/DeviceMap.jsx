// src/components/DeviceMap.jsx
import React, { useMemo } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function FitBounds({ latlngs, enabled }) {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;
    if (!latlngs || latlngs.length < 2) return;
    try {
      map.fitBounds(latlngs, { padding: [25, 25] });
    } catch {
      // ignore
    }
  }, [map, latlngs, enabled]);

  return null;
}

function FollowLast({ lastLatLng, enabled }) {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;
    if (!lastLatLng) return;
    try {
      // keep zoom, just pan
      map.panTo(lastLatLng, { animate: true });
    } catch {
      // ignore
    }
  }, [map, lastLatLng, enabled]);

  return null;
}

function chunkRouteByImpact(sampled, incidentThresholdG) {
  // Returns [{positions: [[lat,lon]...], isHot: boolean}]
  // We mark a segment "hot" if either endpoint has impact >= threshold.
  if (sampled.length < 2) return [];

  const segs = [];
  let cur = {
    isHot: (sampled[0].impactG ?? 0) >= incidentThresholdG,
    positions: [[sampled[0].lat, sampled[0].lon]],
  };

  for (let i = 1; i < sampled.length; i++) {
    const prev = sampled[i - 1];
    const p = sampled[i];

    const hot = ((prev.impactG ?? 0) >= incidentThresholdG) || ((p.impactG ?? 0) >= incidentThresholdG);

    // if state changes, close current and start new, ensuring continuity
    if (hot !== cur.isHot) {
      cur.positions.push([p.lat, p.lon]);
      segs.push(cur);
      cur = { isHot: hot, positions: [[p.lat, p.lon]] };
    } else {
      cur.positions.push([p.lat, p.lon]);
    }
  }

  if (cur.positions.length >= 2) segs.push(cur);
  return segs;
}

export default function DeviceMap({
  points = [],
  height = 420,

  // display options
  showRoute = true,
  showRouteDots = true,
  showLast = true,
  showIncidents = true,
  followLast = false,

  // route density
  routeEveryNth = 1, // 1 = all

  // incident thresholds
  incidentThresholdG = 2.0,

  // behavior
  autoFit = true, // fit bounds on load/change

  // tooltip
  formatTooltip,
}) {
  const normalized = useMemo(() => {
    return (points || [])
      .map((p) => ({
        ts: p.ts instanceof Date ? p.ts : new Date(p.ts),
        lat: Number(p.lat),
        lon: Number(p.lon),
        impactG: Number(p.impactG ?? 0),
        tempC: p.tempC,
        rhPct: p.rhPct,
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .sort((a, b) => a.ts - b.ts);
  }, [points]);

  const defaultCenter = [51.9244, 4.4777]; // Rotterdam

  const sampled = useMemo(() => {
    const n = Math.max(1, Number(routeEveryNth || 1));
    if (n === 1) return normalized;
    return normalized.filter((_, idx) => idx % n === 0 || idx === normalized.length - 1);
  }, [normalized, routeEveryNth]);

  const latlngs = useMemo(() => sampled.map((p) => [p.lat, p.lon]), [sampled]);

  const incidents = useMemo(() => {
    if (!showIncidents) return [];
    return normalized.filter((p) => (p.impactG ?? 0) >= incidentThresholdG);
  }, [normalized, showIncidents, incidentThresholdG]);

  const last = normalized.length ? normalized[normalized.length - 1] : null;
  const lastLatLng = last ? [last.lat, last.lon] : null;

  const routeChunks = useMemo(() => {
    if (!showRoute) return [];
    return chunkRouteByImpact(sampled, incidentThresholdG);
  }, [showRoute, sampled, incidentThresholdG]);

  const tooltipText = (p) => {
    if (formatTooltip) return formatTooltip(p);
    return `${p.ts.toISOString()} • ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} • impact ${Number(p.impactG ?? 0).toFixed(2)}g`;
  };

  return (
    <div style={{ height, borderRadius: 12, overflow: "hidden" }}>
      <MapContainer
        center={normalized.length ? [normalized[0].lat, normalized[0].lon] : defaultCenter}
        zoom={6}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {latlngs.length >= 2 && <FitBounds latlngs={latlngs} enabled={autoFit && !followLast} />}
        <FollowLast lastLatLng={lastLatLng} enabled={followLast} />

        {/* Route with impact-aware coloring */}
        {showRoute &&
          routeChunks.map((c, idx) => (
            <Polyline
              key={`route-chunk-${idx}`}
              positions={c.positions}
              pathOptions={{
                weight: 4,
                opacity: 0.95,
                color: c.isHot ? "rgba(255,80,80,0.95)" : "rgba(80,170,255,0.95)",
              }}
            />
          ))}

        {/* Route dots */}
        {showRouteDots &&
          sampled.map((p, idx) => {
            const over = (p.impactG ?? 0) >= incidentThresholdG;
            return (
              <CircleMarker
                key={`route-dot-${p.ts.toISOString()}-${idx}`}
                center={[p.lat, p.lon]}
                radius={over ? 5 : 3.5}
                pathOptions={{
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.85,
                  color: "rgba(0,0,0,0.25)",
                  fillColor: over ? "rgba(255,80,80,0.95)" : "rgba(255,255,255,0.9)",
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  {tooltipText(p)}
                </Tooltip>
              </CircleMarker>
            );
          })}

        {/* Incident markers (bigger red) */}
        {showIncidents &&
          incidents.map((p, idx) => (
            <CircleMarker
              key={`impact-${p.ts.toISOString()}-${idx}`}
              center={[p.lat, p.lon]}
              radius={8}
              pathOptions={{
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9,
                color: "rgba(255,120,120,0.95)",
                fillColor: "rgba(255,80,80,0.95)",
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                {tooltipText(p)}
              </Tooltip>
            </CircleMarker>
          ))}

        {/* Last location */}
        {showLast && last && (
          <CircleMarker
            center={[last.lat, last.lon]}
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
              {`Last • ${tooltipText(last)}`}
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}