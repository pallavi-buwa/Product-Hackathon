const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineMiles(a, b) {
  if (!a || !b) {
    return Number.POSITIVE_INFINITY;
  }

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const inner =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(inner), Math.sqrt(1 - inner));
}

export function getIntentionAnchorPoints(activeIntention) {
  const anchors = [];

  if (activeIntention.startLocation) {
    anchors.push(activeIntention.startLocation);
  }

  if (activeIntention.endLocation) {
    anchors.push(activeIntention.endLocation);
  }

  if (!anchors.length && Array.isArray(activeIntention.routePolygon) && activeIntention.routePolygon.length) {
    anchors.push(activeIntention.routePolygon[0]);
    if (activeIntention.routePolygon.length > 1) {
      anchors.push(activeIntention.routePolygon[activeIntention.routePolygon.length - 1]);
    }
  }

  return anchors;
}

export function nearestDistanceMiles(origin, targets) {
  if (!origin || !targets.length) {
    return Number.POSITIVE_INFINITY;
  }

  return targets.reduce((closest, target) => {
    const miles = haversineMiles(origin, target);
    return Math.min(closest, miles);
  }, Number.POSITIVE_INFINITY);
}
