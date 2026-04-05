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
