import { getRoutineAnchorPoints, haversineMiles } from "./geo.js";

/**
 * Aggregated social heat at public anchors — counts distinct people
 * (routines + open intentions + tag-along errands) near each place.
 *
 * Consumed by DemoBuildModeApp.getHeatZones() → bootstrap JSON → ui/build.js
 * Mapbox layer id: "social-heat" (fill extrusion on GeoJSON from heat-zones source).
 */
export function computeHeatZones({
  mapPlaces = [],
  userRoutines = [],
  activeIntentions = [],
  viewerErrands = [],
  minNeighborsForGlow = 3,
  radiusMiles = 0.12
}) {
  const anchors = [];

  for (const place of mapPlaces) {
    const neighborIds = new Set();

    for (const routine of userRoutines) {
      const pts = getRoutineAnchorPoints(routine);
      const near = pts.some((point) => {
        const miles = haversineMiles(place, point);
        return Number.isFinite(miles) && miles <= radiusMiles;
      });
      if (near) neighborIds.add(routine.userId);
    }

    for (const post of activeIntentions) {
      if (post.status !== "open" || !post.startLocation) continue;
      const miles = haversineMiles(place, post.startLocation);
      if (Number.isFinite(miles) && miles <= radiusMiles) {
        neighborIds.add(post.creatorId);
      }
    }

    for (const errand of viewerErrands) {
      if (!errand.lat || !errand.lng) continue;
      const miles = haversineMiles(place, { lat: errand.lat, lng: errand.lng });
      if (Number.isFinite(miles) && miles <= radiusMiles) {
        neighborIds.add(errand.userId || "viewer");
      }
    }

    const neighborCount = neighborIds.size;
    const glows = neighborCount >= minNeighborsForGlow;
    const heatIntensity = glows
      ? Math.min(1, 0.52 + (neighborCount - minNeighborsForGlow) * 0.11)
      : Math.min(0.48, (neighborCount / Math.max(minNeighborsForGlow, 1)) * 0.48);

    anchors.push({
      label: place.label,
      lat: place.lat,
      lng: place.lng,
      radiusMiles,
      neighborCount,
      glows,
      heatIntensity: Number(heatIntensity.toFixed(2)),
      privacyNote: "Heat is aggregated; strangers see a zone, not a pin."
    });
  }

  return anchors;
}
