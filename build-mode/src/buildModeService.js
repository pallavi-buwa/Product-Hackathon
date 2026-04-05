import { createAnchorLink } from "./anchorLink.js";
import { createRoutineMatches } from "./routineMatchmaker.js";
import { buildSilentBridgeMessage, createSilentBridgeNotifications } from "./silentBridge.js";

export async function createBuildModePlan({
  activeIntention,
  repository,
  invitationSynthesizer,
  blueprintGenerator,
  silentBridgeMessageBuilder = buildSilentBridgeMessage,
  baseUrl = "https://lodge.example.com"
}) {
  const posterProfile = await repository.getUserProfile(activeIntention.creatorId);

  if (!posterProfile) {
    throw new Error(`Poster profile not found for creator ${activeIntention.creatorId}.`);
  }

  const matches = await createRoutineMatches({
    activeIntention,
    repository,
    invitationSynthesizer
  });

  const blueprint = await blueprintGenerator.generateBlueprint({
    posterProfile,
    activeIntention,
    rankedMatches: matches
  });
  const shareLink = createAnchorLink({
    baseUrl,
    intentionId: activeIntention.id,
    slug: "build"
  });
  const notifications = await createSilentBridgeNotifications({
    activeIntention,
    posterProfile,
    rankedMatches: matches,
    buildMessage: silentBridgeMessageBuilder
  });

  if (typeof repository.saveBlueprint === "function") {
    await repository.saveBlueprint(blueprint);
  }

  if (typeof repository.saveNotifications === "function") {
    await repository.saveNotifications(notifications);
  }

  return {
    activeIntention,
    blueprint,
    matches,
    shareLink,
    notifications
  };
}
