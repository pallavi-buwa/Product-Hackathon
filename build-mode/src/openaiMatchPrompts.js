/**
 * OpenAI prompts + post-processing for neighbor match copy only.
 * Match % stays deterministic (pillarScoring.js); the LLM never overrides scores.
 */

export const MATCH_HIGHLIGHT_SYSTEM = `You write one short line of UI copy for a neighborhood ritual app (not dating).

Rules:
- Output exactly one sentence, plain text, no quotation marks around it.
- Max 28 words. No emojis, hashtags, or bullet points.
- Use only the neighbor first name given in JSON. Do not invent other names, ages, employers, or addresses.
- Do not claim exact location, GPS, or that you tracked anyone.
- No medical, legal, or romantic advice. No pressure to meet in private homes.
- If matchPercent is provided, you may mention it once as a number with %.
- overlappingErrand true: you may say errand timing or a mundane run lines up.
- Be warm and specific to hobbies or ritual label only if they appear in JSON.`;

export const PILLAR_INSIGHT_SYSTEM = `You explain neighbor compatibility for a social (not dating) app.

Rules:
- One sentence only, max 26 words, plain text.
- Reference hobby/interest overlap or pillars at a high level. No PII beyond first name already given.
- Do not contradict the given match %; treat it as fixed.
- No addresses, workplaces, schools, or contact info.`;

export function buildMatchHighlightUserPrompt(payloadCtx) {
  return `Write the line now.

Context (JSON, authoritative — do not invent fields):
${JSON.stringify(payloadCtx)}`;
}

export function buildPillarInsightUserPrompt(viewer, neighbor, base) {
  return `Given pillars 0-100 and hobby lists, return ONE short insight sentence.

Viewer hobbies/interests: ${JSON.stringify({ hobbies: viewer?.hobbies, interests: viewer?.interests })}
Neighbor (first name only): ${JSON.stringify({ firstName: neighbor?.firstName, hobbies: neighbor?.hobbies, interests: neighbor?.interests })}
Pillars: ${JSON.stringify(base?.breakdown)}
Match %: ${base?.percent}`;
}

const EMAIL_LIKE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_LIKE = /\bhttps?:\/\/\S+/i;
const PHONE_LIKE = /(?:\+1\s?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/;

/**
 * Sanitize model output for safe one-line UI. Returns null if unusable.
 */
export function sanitizeLlmSentence(raw, { maxWords = 32, maxChars = 220 } = {}) {
  if (raw == null) return null;
  let s = String(raw).trim();
  s = s.replace(/^["'«»]+|["'«»]+$/g, "").replace(/\s+/g, " ");
  if (!s) return null;
  if (EMAIL_LIKE.test(s) || URL_LIKE.test(s) || PHONE_LIKE.test(s)) return null;

  const words = s.split(/\s+/);
  if (words.length > maxWords) {
    s = words.slice(0, maxWords).join(" ");
    if (!s.endsWith(".") && !s.endsWith("!") && !s.endsWith("?")) s += "…";
  }
  if (s.length > maxChars) s = `${s.slice(0, maxChars - 1).trim()}…`;
  return s;
}
