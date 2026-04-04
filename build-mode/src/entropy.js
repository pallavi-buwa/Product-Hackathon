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
