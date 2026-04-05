import { randomUUID } from "node:crypto";

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const text = payload?.output
    ?.flatMap((item) => item.content ?? [])
    ?.filter((item) => item.type === "output_text")
    ?.map((item) => item.text)
    ?.join(" ")
    ?.trim();

  return text || null;
}

export function buildSilentBridgeMessage({ posterProfile, activeIntention, match }) {
  const posterName = posterProfile?.firstName || "Someone";
  const label = activeIntention.label || activeIntention.type.replaceAll("_", " ");
  const etaMinutes =
    match.estimatedTravelMinutes ??
    (Number.isFinite(match.proximityMiles) ? Math.max(5, Math.round(match.proximityMiles * 18)) : 5);

  return `You usually head out around now; ${posterName} is starting a similar ${label} ${etaMinutes} mins away. Want to catch up?`;
}

export function createOpenAISilentBridgeMessageBuilder({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
  fetchImpl = fetch
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI silent bridge copy.");
  }

  return async function buildMessage({ posterProfile, activeIntention, match }) {
    const systemPrompt =
      "You write one short push notification for a neighborhood routine app. " +
      "Tone: warm coincidence, logistical, low-pressure, mundane errands — never dating or therapy. " +
      "Output plain text only, one sentence, under 32 words.";

    const etaMinutes =
      match.estimatedTravelMinutes ??
      (Number.isFinite(match.proximityMiles) ? Math.max(2, Math.round(match.proximityMiles * 18)) : 5);

    const userPayload = {
      poster: { firstName: posterProfile?.firstName || null },
      activity: {
        label: activeIntention.label || activeIntention.type,
        local_spot: activeIntention.localSpotName || null
      },
      proximity_minutes_away: etaMinutes,
      receptivity: {
        note: "User is in an 8–10 minute receptivity window after a routine; nudge should feel like a mutual friend, not tracking."
      },
      style: [
        "Mention rough proximity or timing, not exact addresses.",
        "Optional: reference the shared spot type (cafe, park, market) if natural.",
        "End with a soft yes/no hook (e.g. quick hello)."
      ]
    };

    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI silent bridge failed: ${response.status} ${errorBody}`);
    }

    const payload = await response.json();
    const text = extractOutputText(payload);
    if (!text) {
      throw new Error("OpenAI silent bridge returned no text.");
    }

    return text.replace(/^["']|["']$/g, "").trim();
  };
}

export async function createSilentBridgeNotifications({
  activeIntention,
  posterProfile,
  rankedMatches,
  leadMinutes = 5,
  maxNotifications = 3,
  buildMessage = buildSilentBridgeMessage
} = {}) {
  const startTime = new Date(activeIntention.startTime);
  const eligible = rankedMatches.filter((match) => match.silentBridgeEligible).slice(0, maxNotifications);
  const notifications = [];

  for (const match of eligible) {
    const message = await Promise.resolve(
      buildMessage({
        posterProfile,
        activeIntention,
        match
      })
    );

    notifications.push({
      id: randomUUID(),
      recipientId: match.recipientId,
      intentionId: activeIntention.id,
      notificationType: "silent_bridge",
      scheduledFor: new Date(startTime.getTime() - leadMinutes * 60 * 1000).toISOString(),
      channel: "push",
      message,
      metadata: {
        anchorScore: match.anchorScore,
        compatibilityScore: match.compatibilityScore,
        proximityMiles: match.proximityMiles,
        temporalMatchScore: match.temporalMatchScore,
        compatibilityOfMomentPercent: match.compatibilityOfMoment?.percent ?? null
      }
    });
  }

  return notifications;
}
