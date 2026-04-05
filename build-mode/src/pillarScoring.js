import { analyzeRoutineEntropy } from "./entropy.js";

const WEIGHTS = {
  activityAlignment: 0.4,
  socialVelocity: 0.3,
  lifestyleEntropy: 0.15,
  conversationalAnchors: 0.15
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function jaccard(a, b) {
  const A = new Set((a || []).map((x) => String(x).toLowerCase()));
  const B = new Set((b || []).map((x) => String(x).toLowerCase()));
  if (!A.size && !B.size) return 0.5;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const u = A.size + B.size - inter || 1;
  return inter / u;
}

function tokenOverlap(a, b) {
  const words = (s) =>
    String(s || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const A = new Set([...(a?.hobbies || []), ...(a?.interests || [])].flatMap(words));
  const B = new Set([...(b?.hobbies || []), ...(b?.interests || [])].flatMap(words));
  if (!A.size || !B.size) return 0.35;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

/**
 * @param {object} viewer - profile + optional viewerErrands, routineLogs
 * @param {object} neighbor - profile
 * @param {object} ctx - { sharedEventIds, overlappingErrand, neighborRoutineStable, now }
 */
export function computePillarScores(viewer, neighbor, ctx = {}) {
  const {
    sharedEventIds = [],
    overlappingErrand = false,
    neighborRoutineStable = true,
    viewerRoutineLogs = [],
    now = new Date()
  } = ctx;

  let activityAlignment = 0.35;
  if (overlappingErrand) activityAlignment = 0.92;
  else if (sharedEventIds.length > 0) activityAlignment = 0.55 + Math.min(0.35, sharedEventIds.length * 0.08);
  else activityAlignment = 0.38 + tokenOverlap(viewer, neighbor) * 0.25;
  activityAlignment = clamp01(activityAlignment);

  const vAtt = Number(viewer.eventsAttended ?? viewer.eventsAttendedCount ?? 0);
  const nAtt = Number(neighbor.eventsAttended ?? neighbor.eventsAttendedCount ?? 0);
  const vWill = Number(viewer.willingToAttendMore ?? 3);
  const nWill = Number(neighbor.willingToAttendMore ?? 3);
  const eventBoost = sharedEventIds.length ? 0.18 : 0;
  let socialVelocity =
    0.25 +
    clamp01((vAtt + nAtt) / 14) * 0.28 +
    clamp01((vWill + nWill) / 10) * 0.32 +
    eventBoost;
  socialVelocity = clamp01(socialVelocity);

  const entropy = analyzeRoutineEntropy({ logs: viewerRoutineLogs, asOf: now });
  const slipping = entropy.entropyTriggerActive || entropy.staleDays > 10;
  let lifestyleEntropy = 0.45;
  if (slipping && neighborRoutineStable) lifestyleEntropy = 0.88;
  else if (slipping) lifestyleEntropy = 0.62;
  else if (neighborRoutineStable) lifestyleEntropy = 0.55;
  lifestyleEntropy = clamp01(lifestyleEntropy);

  const hobbyJ = jaccard(viewer.hobbies, neighbor.hobbies);
  const placeJ = jaccard(viewer.thirdPlaces, neighbor.thirdPlaces);
  const interestJ = jaccard(viewer.interests, neighbor.interests);
  let conversationalAnchors = clamp01(0.25 + hobbyJ * 0.35 + placeJ * 0.25 + interestJ * 0.25);
  if (sharedEventIds.length) conversationalAnchors = clamp01(conversationalAnchors + 0.12);

  const breakdown = {
    activityAlignment: Math.round(activityAlignment * 100),
    socialVelocity: Math.round(socialVelocity * 100),
    lifestyleEntropy: Math.round(lifestyleEntropy * 100),
    conversationalAnchors: Math.round(conversationalAnchors * 100)
  };

  const total =
    breakdown.activityAlignment * WEIGHTS.activityAlignment +
    breakdown.socialVelocity * WEIGHTS.socialVelocity +
    breakdown.lifestyleEntropy * WEIGHTS.lifestyleEntropy +
    breakdown.conversationalAnchors * WEIGHTS.conversationalAnchors;

  const feedbackBonus = Number(ctx.feedbackPercentBonus || 0);
  const percent = Math.min(97, Math.max(1, Math.round(total + feedbackBonus)));

  return {
    percent,
    weights: WEIGHTS,
    breakdown,
    labels: {
      activityAlignment: "Overlap in mundane errands or timing windows",
      socialVelocity: "Events attended & willingness to join more",
      lifestyleEntropy: slipping
        ? "Routine re-anchor boost with steady neighbors"
        : "Steady rhythm vs neighbor consistency",
      conversationalAnchors: "Hobbies, interests & shared third places"
    }
  };
}

export async function maybeRefineWithOpenAI(
  base,
  viewer,
  neighbor,
  apiKey,
  model = "gpt-4o-mini",
  baseUrl = "https://api.openai.com/v1"
) {
  const key = String(apiKey || "").trim();
  if (!key) {
    return { ...base, aiNote: null };
  }

  const root = String(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const completionsUrl = `${root}/chat/completions`;

  const prompt = `You are scoring neighbor compatibility for a social app (not dating). Given JSON pillars 0-100 and two user hobby lists, return ONE short sentence (max 25 words) insight. No PII.
Viewer: ${JSON.stringify({ hobbies: viewer.hobbies, interests: viewer.interests })}
Neighbor: ${JSON.stringify({ firstName: neighbor.firstName, hobbies: neighbor.hobbies, interests: neighbor.interests })}
Pillars: ${JSON.stringify(base.breakdown)}
Match %: ${base.percent}`;

  try {
    const res = await fetch(completionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Reply with only the one sentence insight." },
          { role: "user", content: prompt }
        ],
        max_tokens: 80,
        temperature: 0.4
      })
    });
    if (!res.ok) return { ...base, aiNote: null };
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    return { ...base, aiNote: text };
  } catch {
    return { ...base, aiNote: null };
  }
}

/** Plain-language line for spotlight UI when OpenAI is off or fails. */
export function matchHighlightTemplate(topRow, post) {
  const name = topRow?.firstName || "Someone";
  const pct = topRow?.percent ?? 0;
  const overlap = Boolean(topRow?.overlappingErrand);
  if (overlap && post?.label) {
    return `${name} is a strong ${pct}% fit — your errand window lines up with their "${post.label}" nearby.`;
  }
  if (overlap) {
    return `${name} is a ${pct}% fit and your errand timing overlaps what they are doing nearby.`;
  }
  if (post?.label && post?.localSpotName) {
    return `${name} is your top pick at ${pct}% — they posted "${post.label}" at ${post.localSpotName}. Tap their pin.`;
  }
  return `${name} is your strongest neighbor match right now at ${pct}%.`;
}

export async function maybeMatchHighlightLine(
  viewer,
  topRow,
  post,
  apiKey,
  model = "gpt-4o-mini",
  baseUrl = "https://api.openai.com/v1"
) {
  const key = String(apiKey || "").trim();
  if (!key || !topRow) {
    return null;
  }

  const root = String(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const payloadCtx = {
    viewerHobbies: viewer?.hobbies,
    neighborFirstName: topRow.firstName,
    matchPercent: topRow.percent,
    overlappingErrand: topRow.overlappingErrand,
    theirPost: post
      ? { label: post.label, spot: post.localSpotName, tags: post.contextTags }
      : null
  };

  const prompt = `Write ONE friendly sentence (max 26 words) for a neighborhood app. Tell the user why to join this person's open ritual on the map now. If overlappingErrand is true, mention errands lining up. No emojis. JSON context only — do not invent names beyond neighborFirstName.
Context: ${JSON.stringify(payloadCtx)}`;

  try {
    const res = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Reply with only the one sentence. No quotes around it." },
          { role: "user", content: prompt }
        ],
        max_tokens: 90,
        temperature: 0.45
      })
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    return text || null;
  } catch {
    return null;
  }
}
