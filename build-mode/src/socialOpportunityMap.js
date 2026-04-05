/**
 * Social Opportunity Map — top-down weekly routine analyzer.
 *
 * User inputs their ENTIRE weekly routine. Engine cross-analyzes
 * all activities and ranks which ones to convert from solo → shared first.
 *
 * Deterministic scoring (not GPT):
 *   - Consistency   (30%) — frequency per week
 *   - Activity compat (20%) — how well it works shared
 *   - Time flexibility (15%) — morning > evening for new rituals
 *   - Location sociability (15%) — parks > gyms > grocery stores
 *   - Invitation ease (10%) — how easy to frame casually
 *   - Relationship accel (10%) — cooking together > eating together
 */

const ACTIVITY_COMPAT = {
  walk: 0.95, run: 0.85, hike: 0.92, coffee: 0.90, cook: 0.88,
  gym: 0.60, yoga: 0.75, study: 0.55, read: 0.40, errands: 0.25,
  groceries: 0.30, nails: 0.70, swim: 0.65, bike: 0.80, garden: 0.78,
};

const LOCATION_SOC = {
  park: 0.95, trail: 0.90, lake: 0.92, cafe: 0.88, coffee: 0.88,
  beach: 0.85, market: 0.70, gym: 0.45, home: 0.80, store: 0.25,
  target: 0.20, library: 0.30,
};

function lookup(text, table) {
  const l = (text || "").toLowerCase();
  for (const [k, v] of Object.entries(table)) {
    if (l.includes(k)) return v;
  }
  return 0.50;
}

function consistencyScore(days) {
  const l = (days || "").toLowerCase();
  const dayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  let count = dayNames.filter((d) => l.includes(d)).length;
  if (/daily|every\s*day/i.test(l)) count = 7;
  if (/weekday/i.test(l)) count = 5;
  if (/weekend/i.test(l)) count = 2;
  if (count === 0) count = 1;
  if (count >= 5) return 1.0;
  if (count >= 3) return 0.85;
  if (count >= 2) return 0.70;
  return 0.50;
}

function timeFlexScore(time) {
  const l = (time || "").toLowerCase();
  if (/\b([5-9]|10)\s*(am|a\.m)/i.test(l) || /morning/i.test(l)) return 0.95;
  if (/\b(11|12)\s*(am|pm)/i.test(l) || /noon/i.test(l)) return 0.75;
  if (/\b[1-4]\s*(pm)/i.test(l) || /afternoon/i.test(l)) return 0.60;
  if (/\b[5-7]\s*(pm)/i.test(l) || /evening/i.test(l)) return 0.45;
  if (/\b([8-9]|1[0-2])\s*(pm)/i.test(l) || /night/i.test(l)) return 0.30;
  return 0.50;
}

function inviteEase(activity) {
  const l = (activity || "").toLowerCase();
  if (/walk|hike|run|coffee|cook/i.test(l)) return 0.90;
  if (/gym|yoga|swim|bike/i.test(l)) return 0.65;
  if (/study|read|work/i.test(l)) return 0.50;
  if (/errand|groceries|target/i.test(l)) return 0.25;
  return 0.55;
}

function relAccel(activity) {
  const l = (activity || "").toLowerCase();
  if (/cook|hike|trail/i.test(l)) return 0.95;
  if (/walk|run|bike/i.test(l)) return 0.80;
  if (/coffee|cafe/i.test(l)) return 0.75;
  if (/gym|yoga/i.test(l)) return 0.55;
  if (/study|work|read/i.test(l)) return 0.40;
  if (/errand|groceries/i.test(l)) return 0.20;
  return 0.50;
}

export function analyzeRoutines(routines) {
  const scored = routines.map((r, index) => {
    const f = {
      consistency: consistencyScore(r.days),
      activityCompat: lookup(r.activity, ACTIVITY_COMPAT),
      timeFlex: timeFlexScore(r.time),
      locationSoc: lookup(r.location || r.activity, LOCATION_SOC),
      inviteEase: inviteEase(r.activity),
      relAccel: relAccel(r.activity),
    };

    const score = Math.min(
      Math.round(
        (f.consistency * 0.30 + f.activityCompat * 0.20 + f.timeFlex * 0.15 +
          f.locationSoc * 0.15 + f.inviteEase * 0.10 + f.relAccel * 0.10) * 100
      ),
      99
    );

    return { index, ...r, score, factors: f };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((item, rank) => ({
    ...item,
    rank: rank + 1,
    reasoning: buildReasoning(item, rank === 0),
  }));
}

function buildReasoning(item, isBest) {
  const f = item.factors;
  const parts = [];

  if (f.consistency >= 0.85) parts.push(`you do this 3+ times a week — strong habit foundation`);
  else if (f.consistency >= 0.70) parts.push(`twice-a-week consistency gives moderate habit foundation`);

  if (f.activityCompat >= 0.80) parts.push(`${item.activity.toLowerCase()} naturally works as a shared activity`);
  else if (f.activityCompat < 0.40) parts.push(`this is task-focused and harder to share`);

  if (f.timeFlex >= 0.80) parts.push(`morning timing is ideal — people cancel evenings, not mornings`);
  else if (f.timeFlex < 0.50) parts.push(`evening timing has higher no-show rates`);

  if (f.locationSoc >= 0.80) parts.push(`the setting has natural conversation affordances`);

  if (isBest) parts.push(`this is your strongest social opportunity window`);

  return parts.join(". ") + ".";
}

export function findCombos(ranked) {
  const combos = [];
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const a = ranked[i], b = ranked[j];
      if (timeFlexScore(a.time) >= 0.80 && timeFlexScore(b.time) >= 0.80 && a.score >= 70 && b.score >= 70) {
        combos.push({
          routines: [a.activity, b.activity],
          reasoning: `${a.activity} and ${b.activity} are both morning routines — the same person could join both, creating a 2x/week cadence that accelerates friendship formation.`,
        });
      }
    }
  }
  return combos;
}

export function findWorst(ranked) {
  if (!ranked.length) return null;
  const w = ranked[ranked.length - 1];
  const weak = [];
  if (w.factors.activityCompat < 0.40) weak.push("task-focused and hard to share");
  if (w.factors.locationSoc < 0.40) weak.push("the setting doesn't support conversation");
  if (w.factors.inviteEase < 0.40) weak.push("it's awkward to invite someone");
  return {
    activity: w.activity, score: w.score,
    reason: weak.length ? `${w.activity} scored lowest: ${weak.join(", ")}.` : `${w.activity} scored lowest across combined factors.`,
  };
}

export function weeklyInsight(ranked) {
  const morning = ranked.filter((r) => timeFlexScore(r.time) >= 0.80).length;
  const total = ranked.length;
  if (morning >= total * 0.6) return "Your mornings are your social goldmine. Multiple consistent morning routines lend themselves naturally to shared activities.";
  if (total >= 4) return `You have ${total} routines across the week. Start with your highest-scored opportunity — one person, same time, every week.`;
  return "Start with your top-scored routine. One shared ritual, one person, same time every week. That's how friendships form.";
}
