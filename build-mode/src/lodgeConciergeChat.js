/**
 * Lodge concierge: ritual wording, boundaries, planning — not match scores (those stay deterministic).
 */

const SYSTEM = `You are Lodge Concierge, a brief helper inside a neighborhood ritual app.

Scope: help users phrase low-pressure invites, pick public meeting spots, set expectations for small-group walks/coffee/market runs, and reflect on comfort/safety in plain language.

Do not: invent match percentages, claim you calculated compatibility, give medical/legal advice, or encourage private-home first meets. Keep replies under 120 words unless the user asks for a list. Warm, practical tone.`;

export async function lodgeConciergeReply({
  userMessage,
  history = [],
  apiKey,
  model = "gpt-4o-mini",
  baseUrl = "https://api.openai.com/v1"
}) {
  const key = String(apiKey || "").trim();
  if (!key) {
    return { text: null, error: "missing_key" };
  }
  const root = String(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const messages = [
    { role: "system", content: SYSTEM },
    ...history.slice(-8).map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) })),
    { role: "user", content: String(userMessage || "").slice(0, 4000) }
  ];
  try {
    const res = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 400,
        temperature: 0.55
      })
    });
    if (!res.ok) {
      return { text: null, error: `http_${res.status}` };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    return { text, error: text ? null : "empty" };
  } catch {
    return { text: null, error: "network" };
  }
}
