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

function isValidPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

function dedupePoints(points) {
  const seen = new Set();

  return points.filter((point) => {
    if (!isValidPoint(point)) {
      return false;
    }

    const key = `${point.lat}:${point.lng}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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

  return dedupePoints(anchors);
}

export function getRoutineAnchorPoints(routine) {
  const anchors = [];

  if (routine.locationCoords) {
    anchors.push(routine.locationCoords);
  }

  if (Array.isArray(routine.anchorPoints)) {
    anchors.push(...routine.anchorPoints);
  }

  if (Array.isArray(routine.routePolygon) && routine.routePolygon.length) {
    anchors.push(routine.routePolygon[0]);
    if (routine.routePolygon.length > 1) {
      anchors.push(routine.routePolygon[routine.routePolygon.length - 1]);
    }
  }

  return dedupePoints(anchors);
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

export function pointSetMinDistanceMiles(origins, targets) {
  if (!origins.length || !targets.length) {
    return Number.POSITIVE_INFINITY;
  }

  return origins.reduce((closest, origin) => {
    return Math.min(closest, nearestDistanceMiles(origin, targets));
  }, Number.POSITIVE_INFINITY);
}

export function computeSpatialAnchorScore({
  intentionAnchors,
  routineAnchors,
  radiusMiles = 0.75
}) {
  const distanceMiles = pointSetMinDistanceMiles(intentionAnchors, routineAnchors);

  if (!Number.isFinite(distanceMiles)) {
    return {
      distanceMiles: null,
      spatialScore: 0
    };
  }

  const spatialScore = Math.max(0, 1 - distanceMiles / Math.max(radiusMiles, 0.01));

  return {
    distanceMiles: Number(distanceMiles.toFixed(3)),
    spatialScore: Number(spatialScore.toFixed(2))
  };
}
