import { randomUUID } from "node:crypto";

function buildSilentBridgeMessage({ posterProfile, activeIntention, match }) {
  const posterName = posterProfile?.firstName || "Someone";
  const label = activeIntention.label || activeIntention.type.replaceAll("_", " ");
  const etaMinutes =
    match.estimatedTravelMinutes ??
    (Number.isFinite(match.proximityMiles) ? Math.max(5, Math.round(match.proximityMiles * 18)) : 5);

  return `You usually head out around now; ${posterName} is starting a similar ${label} ${etaMinutes} mins away. Want to catch up?`;
}

export function createSilentBridgeNotifications({
  activeIntention,
  posterProfile,
  rankedMatches,
  leadMinutes = 5,
  maxNotifications = 3
}) {
  const startTime = new Date(activeIntention.startTime);

  return rankedMatches
    .filter((match) => match.silentBridgeEligible)
    .slice(0, maxNotifications)
    .map((match) => ({
      id: randomUUID(),
      recipientId: match.recipientId,
      intentionId: activeIntention.id,
      notificationType: "silent_bridge",
      scheduledFor: new Date(startTime.getTime() - leadMinutes * 60 * 1000).toISOString(),
      channel: "push",
      message: buildSilentBridgeMessage({ posterProfile, activeIntention, match }),
      metadata: {
        anchorScore: match.anchorScore,
        compatibilityScore: match.compatibilityScore,
        proximityMiles: match.proximityMiles,
        temporalMatchScore: match.temporalMatchScore
      }
    }));
}
