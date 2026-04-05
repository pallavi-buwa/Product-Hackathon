/**
 * Social health metrics are derived only from the viewer's own routine logs.
 * Each log counts as one "meaningful ritual moment" (check-in / aligned activity proxy).
 */

export function startOfWeekMonday(reference) {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function computeSocialHealthMetrics({
  viewerId,
  routineLogs = [],
  now = new Date()
} = {}) {
  const logs = (routineLogs || []).filter((l) => l && l.userId === viewerId);
  const thisWeekStart = startOfWeekMonday(now);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const inRange = (ms, start, end) => ms >= start.getTime() && ms < end.getTime();

  const thisWeekLogs = logs.filter((l) => {
    const ms = new Date(l.occurredAt).getTime();
    if (Number.isNaN(ms)) {
      return false;
    }
    return inRange(ms, thisWeekStart, nextWeekStart);
  });
  const lastWeekLogs = logs.filter((l) => {
    const ms = new Date(l.occurredAt).getTime();
    if (Number.isNaN(ms)) {
      return false;
    }
    return inRange(ms, lastWeekStart, thisWeekStart);
  });

  return {
    meaningfulEncountersThisWeek: thisWeekLogs.length,
    meaningfulEncountersLastWeek: lastWeekLogs.length,
    weekStartsOn: thisWeekStart.toISOString().slice(0, 10)
  };
}

/**
 * Private 0–100 index for the logged-in user only — not shared, not comparable across people.
 * Combines rhythm (weekly check-ins) and week-over-week momentum for wellbeing framing.
 */
export function computeSocialHealthScore(metrics) {
  const t = metrics.meaningfulEncountersThisWeek;
  const l = metrics.meaningfulEncountersLastWeek;
  let score = Math.round(Math.min(100, 22 + t * 16 + Math.min(l, 5) * 5));
  if (t > l) {
    score = Math.min(100, score + 10);
  } else if (l > 0 && t < l) {
    score = Math.max(8, score - 8);
  }
  score = Math.max(0, Math.min(100, score));

  let band = "Finding rhythm";
  if (score >= 72) {
    band = "Thriving";
  } else if (score >= 48) {
    band = "Steady";
  }

  return { score, band };
}

/**
 * Demo-only: viewer ritual check-ins anchored to "now" so this week vs last week always looks real.
 */
export function buildDemoViewerRoutineLogs(now = new Date(), viewerId = "viewer") {
  const thisWeekStart = startOfWeekMonday(now);
  const logs = [];
  const addDayOffset = (dayOffset, hour, minute) => {
    const d = new Date(thisWeekStart);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    logs.push({ userId: viewerId, occurredAt: d.toISOString(), source: "demo" });
  };
  addDayOffset(0, 8, 8);
  addDayOffset(2, 7, 42);
  addDayOffset(4, 9, 5);
  const lastWeek = new Date(thisWeekStart);
  lastWeek.setDate(lastWeek.getDate() - 7);
  lastWeek.setHours(8, 12, 0, 0);
  logs.push({ userId: viewerId, occurredAt: lastWeek.toISOString(), source: "demo" });
  return logs;
}
