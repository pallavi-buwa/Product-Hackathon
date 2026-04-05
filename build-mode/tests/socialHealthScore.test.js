import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDemoViewerRoutineLogs,
  computeSocialHealthMetrics,
  computeSocialHealthScore,
  startOfWeekMonday
} from "../src/socialHealthScore.js";
import { buildTemplateSocialHealthNarrative } from "../src/socialHealthNarrative.js";

test("computeSocialHealthMetrics buckets viewer logs by week (Monday start)", () => {
  const now = new Date("2026-04-04T12:00:00-04:00");
  const routineLogs = [
    { userId: "viewer", occurredAt: "2026-03-27T08:00:00-04:00" },
    { userId: "viewer", occurredAt: "2026-04-01T08:00:00-04:00" },
    { userId: "viewer", occurredAt: "2026-04-03T08:05:00-04:00" },
    { userId: "viewer", occurredAt: "2026-04-04T09:00:00-04:00" },
    { userId: "maya", occurredAt: "2026-04-04T10:00:00-04:00" }
  ];
  const m = computeSocialHealthMetrics({
    viewerId: "viewer",
    routineLogs,
    now
  });
  assert.equal(m.meaningfulEncountersThisWeek, 3);
  assert.equal(m.meaningfulEncountersLastWeek, 1);
});

test("startOfWeekMonday returns Monday 00:00 local", () => {
  const ref = new Date("2026-04-04T15:00:00-04:00");
  const mon = startOfWeekMonday(ref);
  assert.equal(mon.getDay(), 1);
});

test("buildTemplateSocialHealthNarrative mentions counts and trend", () => {
  const text = buildTemplateSocialHealthNarrative(
    { meaningfulEncountersThisWeek: 3, meaningfulEncountersLastWeek: 1, weekStartsOn: "2026-03-30" },
    { firstName: "Riley" }
  );
  assert.match(text, /3/);
  assert.match(text, /1 last week/i);
});

test("computeSocialHealthScore returns bounded score and band", () => {
  const s = computeSocialHealthScore({
    meaningfulEncountersThisWeek: 3,
    meaningfulEncountersLastWeek: 1
  });
  assert.equal(s.score >= 0 && s.score <= 100, true);
  assert.match(s.band, /Thriving|Steady|Finding rhythm/);
});

test("buildDemoViewerRoutineLogs yields 3 this week and 1 last week", () => {
  const now = new Date("2026-04-04T12:00:00-04:00");
  const logs = buildDemoViewerRoutineLogs(now, "viewer");
  const m = computeSocialHealthMetrics({ viewerId: "viewer", routineLogs: logs, now });
  assert.equal(m.meaningfulEncountersThisWeek, 3);
  assert.equal(m.meaningfulEncountersLastWeek, 1);
});
