import { randomUUID } from "node:crypto";

function toTitleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatStartContext(activeIntention) {
  const startDate = new Date(activeIntention.startTime);
  const day = startDate.toLocaleDateString("en-US", { weekday: "long" });
  const time = startDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });

  return { day, time };
}

function buildScaffolding(activeIntention) {
  const activity = activeIntention.label || toTitleCase(activeIntention.type);
  const spot = activeIntention.localSpotName || "your usual spot";

  return [
    {
      sessionNumber: 1,
      title: "Easy first overlap",
      structure: `Keep the first ${activity.toLowerCase()} short and logistical. Meet at ${spot}, do the routine, and end with a simple next-week check-in.`,
      hostPrompt: "Open with the route or plan, not personal backstory."
    },
    {
      sessionNumber: 2,
      title: "Repeat with one small add-on",
      structure: `Repeat the same anchor, then add one tiny extension like coffee, a shared errand, or a 10-minute cooldown.`,
      hostPrompt: "Ask one concrete follow-up question about their week or routine."
    },
    {
      sessionNumber: 3,
      title: "Turn it into a ritual",
      structure: "Confirm the recurring cadence before you leave so the habit survives past the novelty phase.",
      hostPrompt: "Lock next week's time while the momentum is still warm."
    }
  ];
}

export function createTemplateRitualBlueprintGenerator() {
  return {
    async generateBlueprint({ posterProfile, activeIntention, rankedMatches = [] }) {
      const { day, time } = formatStartContext(activeIntention);
      const activity = activeIntention.label || toTitleCase(activeIntention.type);
      const spot = activeIntention.localSpotName || "your usual neighborhood stop";
      const targetGroupSize = activeIntention.desiredGroupSize ?? 2;

      return {
        id: randomUUID(),
        intentionId: activeIntention.id,
        ritualName: `${day} ${activity}`,
        summary: `Turn ${activity.toLowerCase()} at ${spot} into a small recurring ritual that feels easy to repeat.`,
        cadence: {
          dayOfWeek: day,
          startTime: time,
          cadencePerWeek: activeIntention.cadencePerWeek ?? 1,
          durationMinutes: activeIntention.durationMinutes ?? 45
        },
        recommendedGroupSize: {
          min: 1,
          target: targetGroupSize,
          max: 3
        },
        shareCopy: {
          headline: `Join me for ${activity.toLowerCase()} ${day.toLowerCase()} at ${time}`,
          body: `I already do this on my own, so this is intentionally low-key. If you're usually nearby, come make it a standing thing with me.`
        },
        firstThreeSessions: buildScaffolding(activeIntention),
        anchorStrategy: {
          place: spot,
          whyItWorks:
            "The ritual attaches to something you already do, which lowers coordination friction and makes repetition more likely."
        },
        audienceAngles: rankedMatches.slice(0, 3).map((match) => ({
          recipientId: match.recipientId,
          viewerLens: match.viewerLens,
          angle: match.viewerLens?.promptAngle || "Routine overlap"
        })),
        createdFor: {
          userId: activeIntention.creatorId,
          firstName: posterProfile?.firstName || null
        }
      };
    }
  };
}

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

export function createOpenAIRitualBlueprintGenerator({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
  fetchImpl = fetch
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the OpenAI ritual blueprint generator.");
  }

  return {
    async generateBlueprint({ posterProfile, activeIntention, rankedMatches = [] }) {
      const systemPrompt =
        "You generate concise Ritual Blueprints for a routine-sharing app. " +
        "Output JSON only. The ritual should feel practical, repeatable, and low-pressure.";

      const userPrompt = {
        poster_profile: posterProfile,
        active_intention: activeIntention,
        top_matches: rankedMatches.slice(0, 3).map((match) => ({
          recipient_id: match.recipientId,
          viewer_lens: match.viewerLens,
          anchor_score: match.anchorScore,
          compatibility_score: match.compatibilityScore
        })),
        output_shape: {
          ritualName: "string",
          summary: "string",
          shareCopy: { headline: "string", body: "string" },
          cadence: {
            dayOfWeek: "string",
            startTime: "string",
            cadencePerWeek: "number",
            durationMinutes: "number"
          },
          recommendedGroupSize: { min: "number", target: "number", max: "number" },
          firstThreeSessions: [
            {
              sessionNumber: "number",
              title: "string",
              structure: "string",
              hostPrompt: "string"
            }
          ],
          anchorStrategy: { place: "string", whyItWorks: "string" }
        }
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
        throw new Error(`OpenAI ritual blueprint generation failed: ${response.status} ${errorBody}`);
      }

      const payload = await response.json();
      const text = extractOutputText(payload);

      if (!text) {
        throw new Error("OpenAI ritual blueprint generation returned no text.");
      }

      const parsed = JSON.parse(text);
      return {
        id: randomUUID(),
        intentionId: activeIntention.id,
        ...parsed,
        createdFor: {
          userId: activeIntention.creatorId,
          firstName: posterProfile?.firstName || null
        }
      };
    }
  };
}
