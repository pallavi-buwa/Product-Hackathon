export function detectRoutineEntropy({
  baselineCount,
  current7DayCount,
  threshold = 0.4
}) {
  if (baselineCount <= 0) {
    return {
      baselineCount,
      current7DayCount,
      declineRate: 0,
      entropyTriggerActive: false
    };
  }

  const declineRate = Number(
    Math.max(0, (baselineCount - current7DayCount) / baselineCount).toFixed(2)
  );

  return {
    baselineCount,
    current7DayCount,
    declineRate,
    entropyTriggerActive: declineRate > threshold
  };
}

export function analyzeRoutineEntropy({
  logs = [],
  asOf = new Date(),
  recentWindowDays = 14,
  baselineWindowDays = 28,
  threshold = 0.35
}) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const dayMs = 24 * 60 * 60 * 1000;
  const recentStart = new Date(asOfDate.getTime() - recentWindowDays * dayMs);
  const baselineStart = new Date(recentStart.getTime() - baselineWindowDays * dayMs);

  const normalizedLogs = logs
    .map((log) => new Date(log.occurredAt || log.loggedAt || log.timestamp || log))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const recentCount = normalizedLogs.filter((date) => date >= recentStart && date < asOfDate).length;
  const baselineCount = normalizedLogs.filter((date) => date >= baselineStart && date < recentStart).length;
  const expectedRecentCount =
    baselineWindowDays > 0
      ? Number((baselineCount * (recentWindowDays / baselineWindowDays)).toFixed(2))
      : baselineCount;

  const declineRate =
    expectedRecentCount > 0
      ? Number(Math.max(0, (expectedRecentCount - recentCount) / expectedRecentCount).toFixed(2))
      : 0;

  const lastSeenAt = normalizedLogs.length
    ? normalizedLogs[normalizedLogs.length - 1].toISOString()
    : null;

  const staleDays = lastSeenAt
    ? Math.floor((asOfDate.getTime() - new Date(lastSeenAt).getTime()) / dayMs)
    : null;

  return {
    baselineCount,
    currentWindowCount: recentCount,
    expectedCurrentWindowCount: expectedRecentCount,
    declineRate,
    staleDays,
    lastSeenAt,
    entropyTriggerActive:
      (expectedRecentCount > 0 && declineRate > threshold) ||
      (staleDays !== null && staleDays > recentWindowDays)
  };
}
