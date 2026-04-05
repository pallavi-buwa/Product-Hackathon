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

export function buildTemplateSocialHealthNarrative(metrics, viewerProfile) {
  const { meaningfulEncountersThisWeek, meaningfulEncountersLastWeek } = metrics;
  const rawName = viewerProfile?.firstName?.trim();
  const name = rawName && rawName.toLowerCase() !== "you" ? rawName : null;
  const opener = name ? `${name}, you've had` : "You've had";

  if (meaningfulEncountersThisWeek === 0 && meaningfulEncountersLastWeek === 0) {
    return `${opener} no logged ritual moments in the last two weeks. When you check in after a walk or ritual, we'll reflect your gentle momentum here — private to you.`;
  }

  const noun =
    meaningfulEncountersThisWeek === 1 ? "meaningful encounter" : "meaningful encounters";
  let tail;
  if (meaningfulEncountersLastWeek === 0) {
    tail =
      meaningfulEncountersThisWeek <= 1
        ? " — a quiet start to the week."
        : " — a bit more rhythm than the week before.";
  } else if (meaningfulEncountersThisWeek > meaningfulEncountersLastWeek) {
    tail = `, up from ${meaningfulEncountersLastWeek} last week.`;
  } else if (meaningfulEncountersThisWeek < meaningfulEncountersLastWeek) {
    tail = `, compared with ${meaningfulEncountersLastWeek} last week — pace shifts, and that's normal.`;
  } else {
    tail = `, about the same as last week (${meaningfulEncountersLastWeek}).`;
  }

  return `${opener} ${meaningfulEncountersThisWeek} ${noun} this week${tail}`;
}

export function createOpenAISocialHealthNarrativeBuilder({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
  fetchImpl = fetch
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI social health narrative.");
  }

  return async function buildNarrative({ metrics, viewerProfile }) {
    const {
      meaningfulEncountersThisWeek,
      meaningfulEncountersLastWeek
    } = metrics;

    const systemPrompt =
      "You write one short paragraph for a neighborhood wellbeing app (not dating, not therapy). " +
      "The user sees a PRIVATE summary. Use ONLY the integer counts provided — never invent or change numbers. " +
      "Tone: warm, plain, non-judgmental. Mention week-over-week naturally if both counts are given. " +
      "Output plain text only, max 45 words, one paragraph.";

    const userPayload = {
      first_name: viewerProfile?.firstName || null,
      counts: {
        meaningful_encounters_this_week: meaningfulEncountersThisWeek,
        meaningful_encounters_last_week: meaningfulEncountersLastWeek
      },
      meaning:
        "A meaningful encounter here means one routine check-in the user logged in Lodge (solo ritual moment they chose to record)."
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
      throw new Error(`OpenAI social health narrative failed: ${response.status} ${errorBody}`);
    }

    const payload = await response.json();
    const text = extractOutputText(payload);
    if (!text) {
      throw new Error("OpenAI social health narrative returned no text.");
    }

    return text.replace(/^["']|["']$/g, "").trim();
  };
}
