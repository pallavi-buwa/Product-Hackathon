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

export function createTemplateInvitationSynthesizer() {
  return {
    async generateInvitation({
      posterProfile,
      recipientProfile,
      activeIntention,
      primaryMatchType
    }) {
      const posterName = posterProfile.firstName || "Someone";
      const recipientName = recipientProfile.firstName || "there";
      const label = activeIntention.label || activeIntention.type.replaceAll("_", " ");
      const spot = activeIntention.localSpotName || "a nearby spot";

      if (primaryMatchType === "symmetry") {
        return `Since you're usually out around this time, ${posterName} is heading out for ${label}. Want to join?`;
      }

      return `Your neighbor ${posterName} is heading to ${spot} for ${label}. Want to join for a quick 5-minute catch-up, ${recipientName}?`;
    }
  };
}

export function createOpenAIInvitationSynthesizer({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
  fetchImpl = fetch
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the OpenAI invitation synthesizer.");
  }

  return {
    async generateInvitation({
      posterProfile,
      recipientProfile,
      activeIntention,
      primaryMatchType,
      matchSources,
      temporalMatchScore,
      proximityMiles
    }) {
      const systemPrompt =
        "You write one-sentence, low-stakes social invitations for a routine-sharing app. " +
        "Make the invitation feel easy, logistical, and non-cringey. Avoid sounding like dating, therapy, or a sales pitch.";

      const userPrompt = {
        poster_profile: posterProfile,
        recipient_profile: recipientProfile,
        activity_type: activeIntention.type,
        activity_label: activeIntention.label || activeIntention.type.replaceAll("_", " "),
        local_spot: activeIntention.localSpotName || null,
        start_time: activeIntention.startTime,
        match_type: primaryMatchType,
        match_sources: matchSources,
        temporal_match_score: temporalMatchScore,
        proximity_miles: proximityMiles,
        style_rules: [
          "Keep it under 28 words.",
          "Make it sound like a practical invitation.",
          "If symmetry match, focus on shared routine timing.",
          "If proximity match, focus on convenience and location.",
          "Use the poster's first name if available."
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
            { role: "user", content: JSON.stringify(userPrompt) }
          ]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI invitation synthesis failed: ${response.status} ${errorBody}`);
      }

      const payload = await response.json();
      const text = extractOutputText(payload);

      if (!text) {
        throw new Error("OpenAI invitation synthesis returned no text.");
      }

      return text;
    }
  };
}
