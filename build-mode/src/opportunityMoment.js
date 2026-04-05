function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizedWords(values) {
  return values
    .flatMap((value) => String(value || "").toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean);
}

function timeWindowDurationMinutes(timeWindow) {
  if (!timeWindow?.start || !timeWindow?.end) {
    return null;
  }

  const parse = (value) => {
    const [h, m] = String(value).split(":").map((part) => Number(part));
    if (!Number.isFinite(h)) {
      return null;
    }
    return h * 60 + (Number.isFinite(m) ? m : 0);
  };

  const start = parse(timeWindow.start);
  const end = parse(timeWindow.end);
  if (start === null || end === null) {
    return null;
  }

  let span = end - start;
  if (span < 0) {
    span += 24 * 60;
  }
  return span;
}

const energyDepthMinutes = {
  low: 15,
  steady: 28,
  high: 55
};

/**
 * "Compatibility of moment" — weighted lens aligned with product pitch:
 * activity 40%, social velocity 30%, conversational anchors 15%, routine entropy 15%.
 */
export function computeCompatibilityOfMoment({
  activeIntention,
  posterProfile,
  recipientProfile,
  recipientRoutine,
  activityAffinityScore,
  anchorScore,
  entropy
}) {
  const activityAlignment = clamp01(activityAffinityScore);

  const posterDepth =
    Number(activeIntention.durationMinutes) ||
    energyDepthMinutes[posterProfile?.socialEnergyLevel] ||
    energyDepthMinutes.steady;
  const recipientWindow = timeWindowDurationMinutes(recipientRoutine?.timeWindow);
  const recipientDepth =
    recipientWindow ??
    energyDepthMinutes[recipientProfile?.socialEnergyLevel] ??
    energyDepthMinutes.steady;
  const socialVelocity = clamp01(1 - Math.abs(posterDepth - recipientDepth) / 75);

  const intentionTokens = new Set(
    normalizedWords([
      activeIntention.type,
      activeIntention.label,
      ...(activeIntention.contextTags || [])
    ])
  );
  const recipientTokens = new Set(
    normalizedWords([
      ...(recipientProfile?.interests || []),
      ...(recipientRoutine?.routineTags || [])
    ])
  );
  const shared = [...intentionTokens].filter((token) => recipientTokens.has(token));
  const unionSize = new Set([...intentionTokens, ...recipientTokens]).size;
  const jaccard = unionSize ? shared.length / unionSize : 0;
  const conversationalAnchors = clamp01(Math.min(1, jaccard * 2.5));

  let routineEntropy;
  if (entropy?.entropyTriggerActive) {
    routineEntropy = clamp01(0.42 + anchorScore * 0.58);
  } else {
    const decline = Number.isFinite(entropy?.declineRate) ? entropy.declineRate : 0;
    routineEntropy = clamp01(1 - decline * 0.85);
  }

  const wActivity = 0.4;
  const wVelocity = 0.3;
  const wAnchors = 0.15;
  const wEntropy = 0.15;
  const weighted =
    wActivity * activityAlignment +
    wVelocity * socialVelocity +
    wAnchors * conversationalAnchors +
    wEntropy * routineEntropy;
  const percent = Math.round(clamp01(weighted) * 100);

  return {
    percent,
    headline: "Compatibility of moment",
    weights: {
      activityAlignment: wActivity,
      socialVelocity: wVelocity,
      conversationalAnchors: wAnchors,
      routineEntropy: wEntropy
    },
    breakdown: {
      activityAlignment: {
        label: "Activity alignment",
        score: Number(activityAlignment.toFixed(2)),
        weight: wActivity,
        contribution: Number((wActivity * activityAlignment).toFixed(3))
      },
      socialVelocity: {
        label: "Social velocity",
        note: "Quick hello vs longer hang — how your windows line up.",
        score: Number(socialVelocity.toFixed(2)),
        weight: wVelocity,
        contribution: Number((wVelocity * socialVelocity).toFixed(3))
      },
      conversationalAnchors: {
        label: "Conversational anchors",
        note: "Shared hobbies and mundane overlaps.",
        score: Number(conversationalAnchors.toFixed(2)),
        weight: wAnchors,
        contribution: Number((wAnchors * conversationalAnchors).toFixed(3))
      },
      routineEntropy: {
        label: "Routine entropy",
        note: "Isolation signal — boosts steady anchor overlap when rhythm slipped.",
        score: Number(routineEntropy.toFixed(2)),
        weight: wEntropy,
        contribution: Number((wEntropy * routineEntropy).toFixed(3))
      }
    }
  };
}
