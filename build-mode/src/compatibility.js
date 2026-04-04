function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function inferRoutineDensityPerWeek({
  routine = {},
  logs = [],
  asOf = new Date(),
  lookbackDays = 28
}) {
  if (Number.isFinite(routine.cadencePerWeek) && routine.cadencePerWeek > 0) {
    return Number(routine.cadencePerWeek);
  }

  if (!logs.length) {
    return 1;
  }

  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const start = new Date(asOfDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const count = logs.filter((log) => {
    const occurredAt = new Date(log.occurredAt || log.loggedAt || log.timestamp || log);
    return !Number.isNaN(occurredAt.getTime()) && occurredAt >= start && occurredAt <= asOfDate;
  }).length;

  return Number((count / Math.max(1, lookbackDays / 7)).toFixed(2));
}

export function inferSocialEnergyLevel({
  profile = {},
  routine = {},
  logs = [],
  asOf = new Date()
}) {
  if (profile.socialEnergyLevel) {
    return profile.socialEnergyLevel;
  }

  const density = inferRoutineDensityPerWeek({ routine, logs, asOf });

  if (density >= 4) {
    return "high";
  }

  if (density >= 2) {
    return "steady";
  }

  return "low";
}

export function computeCompatibilityFriction({
  posterProfile = {},
  recipientProfile = {},
  posterRoutine = {},
  recipientRoutine = {},
  posterLogs = [],
  recipientLogs = [],
  intentionCadencePerWeek = 1,
  asOf = new Date()
}) {
  const posterDensity = inferRoutineDensityPerWeek({
    routine: { ...posterRoutine, cadencePerWeek: posterRoutine.cadencePerWeek ?? intentionCadencePerWeek },
    logs: posterLogs,
    asOf
  });

  const recipientDensity = inferRoutineDensityPerWeek({
    routine: recipientRoutine,
    logs: recipientLogs,
    asOf
  });

  const posterPreferredGroupSize =
    posterProfile.preferredGroupSize ?? posterRoutine.preferredGroupSize ?? 2;
  const recipientPreferredGroupSize =
    recipientProfile.preferredGroupSize ?? recipientRoutine.preferredGroupSize ?? 2;
  const recipientCapacity =
    recipientProfile.maxSharedRitualsPerWeek ?? recipientRoutine.maxSharedRitualsPerWeek ?? recipientDensity;

  const densityGap = clamp01(
    Math.abs(posterDensity - recipientDensity) / Math.max(posterDensity, recipientDensity, 1)
  );
  const groupSizeGap = clamp01(
    Math.abs(posterPreferredGroupSize - recipientPreferredGroupSize) / 3
  );
  const capacityStrain = clamp01(
    intentionCadencePerWeek > recipientCapacity
      ? (intentionCadencePerWeek - recipientCapacity) / Math.max(intentionCadencePerWeek, 1)
      : 0
  );

  const frictionScore = Number(
    clamp01(densityGap * 0.6 + groupSizeGap * 0.25 + capacityStrain * 0.15).toFixed(2)
  );

  const compatibilityScore = Number((1 - frictionScore).toFixed(2));
  const recipientEnergyLevel = inferSocialEnergyLevel({
    profile: recipientProfile,
    routine: recipientRoutine,
    logs: recipientLogs,
    asOf
  });
  const posterEnergyLevel = inferSocialEnergyLevel({
    profile: posterProfile,
    routine: posterRoutine,
    logs: posterLogs,
    asOf
  });

  return {
    frictionScore,
    compatibilityScore,
    posterDensityPerWeek: posterDensity,
    recipientDensityPerWeek: recipientDensity,
    posterEnergyLevel,
    recipientEnergyLevel,
    label:
      frictionScore <= 0.25 ? "low-friction" : frictionScore <= 0.55 ? "workable" : "high-friction"
  };
}
