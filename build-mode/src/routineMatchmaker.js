import { randomUUID } from "node:crypto";
import { nearestDistanceMiles, getIntentionAnchorPoints } from "./geo.js";
import { computeTemporalMatchScore, dayMatches } from "./time.js";

function buildMatchRecord({
  activeIntention,
  routine,
  primaryMatchType,
  matchSources,
  temporalMatchScore,
  proximityMiles,
  recipientProfile,
  invitationText
}) {
  return {
    id: randomUUID(),
    intentionId: activeIntention.id,
    recipientId: routine.userId,
    matchType: primaryMatchType,
    invitationText,
    temporalMatchScore,
    proximityMiles,
    recommendedForRoutine: Boolean(recipientProfile?.entropyTriggerActive),
    matchSources
  };
}

function mergeCandidate(existing, incoming) {
  if (!existing) {
    return incoming;
  }

  const sources = new Set([...existing.matchSources, ...incoming.matchSources]);
  const primaryMatchType =
    existing.primaryMatchType === "symmetry" || incoming.primaryMatchType === "symmetry"
      ? "symmetry"
      : "proximity";

  return {
    ...existing,
    primaryMatchType,
    temporalMatchScore: Math.max(existing.temporalMatchScore, incoming.temporalMatchScore),
    proximityMiles: Math.min(existing.proximityMiles, incoming.proximityMiles),
    matchSources: [...sources]
  };
}

function sortByPriority(a, b) {
  const aEntropy = a.recipientProfile?.entropyTriggerActive ? 1 : 0;
  const bEntropy = b.recipientProfile?.entropyTriggerActive ? 1 : 0;

  if (aEntropy !== bEntropy) {
    return bEntropy - aEntropy;
  }

  if (a.primaryMatchType !== b.primaryMatchType) {
    return a.primaryMatchType === "symmetry" ? -1 : 1;
  }

  if (a.temporalMatchScore !== b.temporalMatchScore) {
    return b.temporalMatchScore - a.temporalMatchScore;
  }

  return a.proximityMiles - b.proximityMiles;
}

export async function createRoutineMatches({
  activeIntention,
  repository,
  invitationSynthesizer,
  radiusMiles = 0.5,
  minimumTemporalMatch = 0.7
}) {
  const intentionDate = new Date(activeIntention.startTime);
  const anchorPoints = getIntentionAnchorPoints(activeIntention);
  const posterProfile = await repository.getUserProfile(activeIntention.creatorId);

  if (!posterProfile) {
    throw new Error(`Poster profile not found for creator ${activeIntention.creatorId}.`);
  }

  const symmetryRoutines = await repository.listCandidateRoutinesForSymmetry({
    creatorId: activeIntention.creatorId,
    activityType: activeIntention.type
  });

  const proximityRoutines = await repository.listCandidateRoutinesForProximity({
    creatorId: activeIntention.creatorId
  });

  const candidateMap = new Map();

  for (const routine of symmetryRoutines) {
    if (!dayMatches(routine.daysOfWeek, intentionDate)) {
      continue;
    }

    const temporalMatchScore = computeTemporalMatchScore(intentionDate, routine.timeWindow);
    if (temporalMatchScore < minimumTemporalMatch) {
      continue;
    }

    candidateMap.set(
      routine.userId,
      mergeCandidate(candidateMap.get(routine.userId), {
        routine,
        recipientId: routine.userId,
        primaryMatchType: "symmetry",
        matchSources: ["symmetry"],
        temporalMatchScore,
        proximityMiles: Number.POSITIVE_INFINITY
      })
    );
  }

  for (const routine of proximityRoutines) {
    const proximityMiles = nearestDistanceMiles(routine.locationCoords, anchorPoints);
    if (proximityMiles > radiusMiles) {
      continue;
    }

    candidateMap.set(
      routine.userId,
      mergeCandidate(candidateMap.get(routine.userId), {
        routine,
        recipientId: routine.userId,
        primaryMatchType: candidateMap.has(routine.userId) ? candidateMap.get(routine.userId).primaryMatchType : "proximity",
        matchSources: ["proximity"],
        temporalMatchScore: candidateMap.get(routine.userId)?.temporalMatchScore ?? 0,
        proximityMiles: Number(proximityMiles.toFixed(3))
      })
    );
  }

  const recipientProfiles = await repository.getRecipientProfiles([...candidateMap.keys()]);
  const recipientProfileMap = new Map(recipientProfiles.map((profile) => [profile.id, profile]));

  const rankedCandidates = [...candidateMap.values()]
    .map((candidate) => ({
      ...candidate,
      recipientProfile: recipientProfileMap.get(candidate.recipientId) || null
    }))
    .filter((candidate) => candidate.recipientProfile)
    .sort(sortByPriority);

  const matches = await Promise.all(
    rankedCandidates.map(async (candidate) => {
      const invitationText = await invitationSynthesizer.generateInvitation({
        posterProfile,
        recipientProfile: candidate.recipientProfile,
        activeIntention,
        primaryMatchType: candidate.primaryMatchType,
        matchSources: candidate.matchSources,
        temporalMatchScore: candidate.temporalMatchScore,
        proximityMiles: Number.isFinite(candidate.proximityMiles) ? candidate.proximityMiles : null
      });

      return buildMatchRecord({
        activeIntention,
        routine: candidate.routine,
        primaryMatchType: candidate.primaryMatchType,
        matchSources: candidate.matchSources,
        temporalMatchScore: candidate.temporalMatchScore,
        proximityMiles: Number.isFinite(candidate.proximityMiles) ? candidate.proximityMiles : null,
        recipientProfile: candidate.recipientProfile,
        invitationText
      });
    })
  );

  await repository.saveMatches(matches);
  return matches;
}


