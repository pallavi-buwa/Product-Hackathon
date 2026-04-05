import { getRoutineAnchorPoints, haversineMiles } from "./geo.js";

/**
 * Aggregated "social heat" per public anchor — no individual pins; counts distinct
 * neighbors whose routine geometry falls within radius of each place.
 */
export function computeSocialHeatZones({
  mapPlaces = [],
  userRoutines = [],
  radiusMiles = 0.11,
  minNeighborsForGlow = 3
}) {
  return mapPlaces.map((place) => {
    const neighborIds = new Set();

    for (const routine of userRoutines) {
      const anchors = getRoutineAnchorPoints(routine);
      const near = anchors.some((point) => {
        const miles = haversineMiles(place, point);
        return Number.isFinite(miles) && miles <= radiusMiles;
      });
      if (near) {
        neighborIds.add(routine.userId);
      }
    }

    const neighborCount = neighborIds.size;
    const glows = neighborCount >= minNeighborsForGlow;
    const heatIntensity = glows
      ? Math.min(1, 0.55 + (neighborCount - minNeighborsForGlow) * 0.12)
      : Math.min(0.45, (neighborCount / Math.max(minNeighborsForGlow, 1)) * 0.45);

    return {
      label: place.label,
      lat: place.lat,
      lng: place.lng,
      radiusMiles,
      neighborCount,
      glows,
      heatIntensity: Number(heatIntensity.toFixed(2)),
      privacyNote: "Heat is aggregated; strangers see a zone, not a pin."
    };
  });
}
