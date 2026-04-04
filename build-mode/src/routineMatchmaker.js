import { randomUUID } from "node:crypto";
import { analyzeRoutineEntropy } from "./entropy.js";
import { computeCompatibilityFriction } from "./compatibility.js";
import {
  computeSpatialAnchorScore,
  getIntentionAnchorPoints,
  getRoutineAnchorPoints
} from "./geo.js";
import { inferViewerLens } from "./invitationSynthesizer.js";
import {
  computeCadenceAlignmentScore,
  computeStartDeltaMinutes,
  computeTemporalMatchScore,
  dayMatches
} from "./time.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizedWords(values) {
  return values
    .flatMap((value) => String(value || "").toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean);
}

function computeActivityAffinity(activeIntention, routine) {
  const intentionTokens = new Set(
    normalizedWords([
      activeIntention.type,
      activeIntention.label,
      ...(activeIntention.contextTags || [])
    ])
  );

  const routineTokens = new Set(
    normalizedWords([
      routine.type,
      ...(routine.routineTags || []),
      ...(routine.activityHistory || []).map((item) => item?.type)
    ])
  );

  const shared = [...intentionTokens].filter((token) => routineTokens.has(token));
  if (shared.length) {
    return 1;
  }

  const adjacentPairs = [
    ["walk", "coffee"],
    ["run", "coffee"],
    ["gym", "coffee"],
    ["errands", "grocery"],
    ["market", "coffee"],
    ["nails", "coffee"],
    ["cook", "groceries"]
  ];

  const hasAdjacentPair = adjacentPairs.some(([a, b]) => {
    return (
      (intentionTokens.has(a) && routineTokens.has(b)) ||
      (intentionTokens.has(b) && routineTokens.has(a))
    );
  });

  return hasAdjacentPair ? 0.72 : 0.35;
}

function inferAnchorRelationship({
  activeIntention,
  routine,
  proximityMiles,
  startDeltaMinutes,
  activityAffinityScore
}) {
  if (
    routine.type === activeIntention.type &&
    activityAffinityScore >= 0.95 &&
    proximityMiles !== null &&
    proximityMiles <= 0.35
  ) {
    return "parallel-routine";
  }

  if (
    proximityMiles !== null &&
    proximityMiles <= 0.35 &&
    startDeltaMinutes !== null &&
    startDeltaMinutes <= 20
  ) {
    return "adjacent-anchor";
  }

  if (routine.type === activeIntention.type) {
    return "same-activity";
  }

  return "nearby-overlap";
}

function buildMatchSources({
  spatialScore,
  temporalMatchScore,
  frequencyAlignmentScore,
  activityAffinityScore,
  entropy
}) {
  const sources = [];

  if (spatialScore >= 0.45) {
    sources.push("route");
  }

  if (temporalMatchScore >= 0.45) {
    sources.push("time");
  }

  if (frequencyAlignmentScore >= 0.45) {
    sources.push("frequency");
  }

  if (activityAffinityScore >= 0.7) {
    sources.push("affinity");
  }

  if (entropy.entropyTriggerActive) {
    sources.push("entropy");
  }

  return sources;
}

function computeOverallAnchorScore({
  spatialScore,
  temporalMatchScore,
  frequencyAlignmentScore,
  activityAffinityScore
}) {
  return Number(
    clamp01(
      spatialScore * 0.34 +
        temporalMatchScore * 0.28 +
        frequencyAlignmentScore * 0.2 +
        activityAffinityScore * 0.18
    ).toFixed(2)
  );
}

function determinePrimaryMatchType({ matchSources, overallAnchorScore, proximityMiles, temporalMatchScore }) {
  const hasAnchorStack = ["route", "time", "frequency"].every((source) => matchSources.includes(source));

  if (hasAnchorStack || overallAnchorScore >= 0.72) {
    return "anchor";
  }

  if (proximityMiles !== null && proximityMiles <= 0.35 && temporalMatchScore >= 0.45) {
    return "spatiotemporal";
  }

  if (temporalMatchScore >= 0.55) {
    return "timing";
  }

  return "proximity";
}

function sortByPriority(a, b) {
  if (a.recommendedForRoutine !== b.recommendedForRoutine) {
    return a.recommendedForRoutine ? -1 : 1;
  }

  if (a.totalScore !== b.totalScore) {
    return b.totalScore - a.totalScore;
  }

  if (a.compatibilityScore !== b.compatibilityScore) {
    return b.compatibilityScore - a.compatibilityScore;
  }

  return (a.proximityMiles ?? Number.POSITIVE_INFINITY) - (b.proximityMiles ?? Number.POSITIVE_INFINITY);
}

function mergeCandidate(existing, incoming) {
  if (!existing) {
    return incoming;
  }

  const matchSources = [...new Set([...existing.matchSources, ...incoming.matchSources])];
  return existing.totalScore >= incoming.totalScore
    ? { ...existing, matchSources }
    : { ...incoming, matchSources };
}

function buildMatchRecord({
  activeIntention,
  candidate,
  invitationText
}) {
  return {
    id: randomUUID(),
    intentionId: activeIntention.id,
    recipientId: candidate.recipientId,
    matchType: candidate.primaryMatchType,
    invitationText,
    temporalMatchScore: candidate.temporalMatchScore,
    proximityMiles: candidate.proximityMiles,
    frequencyAlignmentScore: candidate.frequencyAlignmentScore,
    activityAffinityScore: candidate.activityAffinityScore,
    anchorScore: candidate.anchorScore,
    compatibilityScore: candidate.compatibilityScore,
    compatibilityFrictionScore: candidate.compatibilityFrictionScore,
    recommendedForRoutine: candidate.recommendedForRoutine,
    matchSources: candidate.matchSources,
    viewerLens: candidate.viewerLens,
    anchorRelationship: candidate.anchorRelationship,
    socialEnergy: candidate.socialEnergy,
    totalScore: candidate.totalScore,
    silentBridgeEligible: candidate.silentBridgeEligible,
    estimatedTravelMinutes: candidate.estimatedTravelMinutes,
    explanation: candidate.explanation
  };
}

async function listCandidateRoutines({ repository, creatorId }) {
  if (typeof repository.listBuildModeCandidateRoutines === "function") {
    return repository.listBuildModeCandidateRoutines({ creatorId });
  }

  const [symmetryRoutines, proximityRoutines] = await Promise.all([
    repository.listCandidateRoutinesForSymmetry?.({ creatorId, activityType: null }) ?? [],
    repository.listCandidateRoutinesForProximity?.({ creatorId }) ?? []
  ]);

  const byRoutineId = new Map();
  for (const routine of [...symmetryRoutines, ...proximityRoutines]) {
    byRoutineId.set(routine.id, routine);
  }
  return [...byRoutineId.values()];
}

export async function createRoutineMatches({
  activeIntention,
  repository,
  invitationSynthesizer,
  radiusMiles = 0.75,
  minimumAnchorScore = 0.5,
  minimumCompatibilityScore = 0.45
}) {
  const intentionDate = new Date(activeIntention.startTime);
  const intentionAnchors = getIntentionAnchorPoints(activeIntention);
  const posterProfile = await repository.getUserProfile(activeIntention.creatorId);

  if (!posterProfile) {
    throw new Error(`Poster profile not found for creator ${activeIntention.creatorId}.`);
  }

  const candidateRoutines = await listCandidateRoutines({
    repository,
    creatorId: activeIntention.creatorId
  });

  const candidateUserIds = [...new Set(candidateRoutines.map((routine) => routine.userId))];
  const [recipientProfiles, routineLogsByUserId, posterLogs] = await Promise.all([
    repository.getRecipientProfiles(candidateUserIds),
    repository.getRoutineLogsForUsers?.(candidateUserIds) ?? new Map(),
    repository.getRoutineLogsForUser?.(activeIntention.creatorId) ?? []
  ]);

  const recipientProfileMap = new Map(recipientProfiles.map((profile) => [profile.id, profile]));
  const candidateMap = new Map();
  const intentionCadencePerWeek = activeIntention.cadencePerWeek ?? 1;

  for (const routine of candidateRoutines) {
    if (!dayMatches(routine.daysOfWeek, intentionDate)) {
      continue;
    }

    const recipientProfile = recipientProfileMap.get(routine.userId);
    if (!recipientProfile) {
      continue;
    }

    const recipientLogs =
      routineLogsByUserId instanceof Map
        ? routineLogsByUserId.get(routine.userId) || []
        : routineLogsByUserId?.[routine.userId] || [];

    const routineAnchors = getRoutineAnchorPoints(routine);
    const { distanceMiles, spatialScore } = computeSpatialAnchorScore({
      intentionAnchors,
      routineAnchors,
      radiusMiles
    });
    const temporalMatchScore = computeTemporalMatchScore(intentionDate, routine.timeWindow);
    const frequencyAlignmentScore = computeCadenceAlignmentScore({
      intentionCadencePerWeek,
      routineCadencePerWeek: routine.cadencePerWeek ?? recipientProfile.routineDensityPerWeek ?? 1
    });
    const activityAffinityScore = computeActivityAffinity(activeIntention, routine);
    const entropy = analyzeRoutineEntropy({
      logs: recipientLogs,
      asOf: intentionDate
    });
    const compatibility = computeCompatibilityFriction({
      posterProfile,
      recipientProfile,
      posterRoutine: activeIntention,
      recipientRoutine: routine,
      posterLogs,
      recipientLogs,
      intentionCadencePerWeek,
      asOf: intentionDate
    });

    const anchorScore = computeOverallAnchorScore({
      spatialScore,
      temporalMatchScore,
      frequencyAlignmentScore,
      activityAffinityScore
    });

    if (anchorScore < minimumAnchorScore || compatibility.compatibilityScore < minimumCompatibilityScore) {
      continue;
    }

    const startDeltaMinutes = computeStartDeltaMinutes(intentionDate, routine.timeWindow);
    const matchSources = buildMatchSources({
      spatialScore,
      temporalMatchScore,
      frequencyAlignmentScore,
      activityAffinityScore,
      entropy
    });
    const anchorRelationship = inferAnchorRelationship({
      activeIntention,
      routine,
      proximityMiles: distanceMiles,
      startDeltaMinutes,
      activityAffinityScore
    });
    const primaryMatchType = determinePrimaryMatchType({
      matchSources,
      overallAnchorScore: anchorScore,
      proximityMiles: distanceMiles,
      temporalMatchScore
    });
    const totalScore = Number(
      clamp01(
        anchorScore * 0.62 +
          compatibility.compatibilityScore * 0.24 +
          (entropy.entropyTriggerActive ? 0.08 : 0) +
          Math.min(activityAffinityScore, 0.75) * 0.06
      ).toFixed(2)
    );
    const viewerLens = inferViewerLens({
      recipientProfile,
      recipientRoutine: routine,
      activeIntention,
      anchorRelationship
    });
    const estimatedTravelMinutes =
      distanceMiles !== null ? Math.max(5, Math.round(distanceMiles * 18)) : null;

    candidateMap.set(
      routine.userId,
      mergeCandidate(candidateMap.get(routine.userId), {
        routine,
        recipientId: routine.userId,
        recipientProfile,
        primaryMatchType,
        temporalMatchScore,
        proximityMiles: distanceMiles,
        frequencyAlignmentScore,
        activityAffinityScore,
        anchorScore,
        compatibilityScore: compatibility.compatibilityScore,
        compatibilityFrictionScore: compatibility.frictionScore,
        matchSources,
        recommendedForRoutine: entropy.entropyTriggerActive,
        viewerLens,
        anchorRelationship,
        socialEnergy: {
          poster: compatibility.posterEnergyLevel,
          recipient: compatibility.recipientEnergyLevel
        },
        totalScore,
        silentBridgeEligible:
          temporalMatchScore >= 0.55 &&
          compatibility.compatibilityScore >= 0.6 &&
          distanceMiles !== null &&
          distanceMiles <= 0.5,
        estimatedTravelMinutes,
        explanation: {
          spatialScore,
          temporalMatchScore,
          frequencyAlignmentScore,
          activityAffinityScore,
          entropy,
          compatibilityLabel: compatibility.label
        }
      })
    );
  }

  const rankedCandidates = [...candidateMap.values()].sort(sortByPriority);

  const matches = await Promise.all(
    rankedCandidates.map(async (candidate) => {
      const invitationText = await invitationSynthesizer.generateInvitation({
        posterProfile,
        recipientProfile: candidate.recipientProfile,
        recipientRoutine: candidate.routine,
        activeIntention,
        primaryMatchType: candidate.primaryMatchType,
        matchSources: candidate.matchSources,
        temporalMatchScore: candidate.temporalMatchScore,
        proximityMiles: candidate.proximityMiles,
        compatibilityScore: candidate.compatibilityScore,
        viewerLens: candidate.viewerLens,
        anchorRelationship: candidate.anchorRelationship
      });

      return buildMatchRecord({
        activeIntention,
        candidate,
        invitationText
      });
    })
  );

  await repository.saveMatches(matches);
  return matches;
}
