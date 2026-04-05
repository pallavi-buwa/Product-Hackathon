import test from "node:test";
import assert from "node:assert/strict";

import { createBuildModePlan } from "../src/buildModeService.js";
import { analyzeRoutineEntropy } from "../src/entropy.js";
import { createTemplateInvitationSynthesizer } from "../src/invitationSynthesizer.js";
import { InMemoryBuildModeRepository } from "../src/repositories/inMemoryBuildModeRepository.js";
import { createTemplateRitualBlueprintGenerator } from "../src/ritualBlueprint.js";
import { createRoutineMatches } from "../src/routineMatchmaker.js";

function buildRepository() {
  return new InMemoryBuildModeRepository({
    userProfiles: [
      { id: "creator", firstName: "Jake", preferredGroupSize: 2, socialEnergyLevel: "steady" },
      { id: "u2", firstName: "Maya", interests: ["coffee"], preferredGroupSize: 2 },
      {
        id: "u3",
        firstName: "Noah",
        interests: ["gym"],
        preferredGroupSize: 3,
        maxSharedRitualsPerWeek: 7
      },
      { id: "u4", firstName: "Priya", interests: ["walk"], preferredGroupSize: 2 }
    ],
    userRoutines: [
      {
        id: "r1",
        userId: "u2",
        type: "coffee_run",
        daysOfWeek: ["wednesday"],
        timeWindow: { start: "08:10", end: "08:40" },
        locationCoords: { lat: 39.7689, lng: -86.158 },
        routineTags: ["coffee", "cafe"],
        cadencePerWeek: 2
      },
      {
        id: "r2",
        userId: "u3",
        type: "gym_session",
        daysOfWeek: ["wednesday"],
        timeWindow: { start: "07:20", end: "08:45" },
        locationCoords: { lat: 39.7694, lng: -86.1578 },
        routineTags: ["gym", "fitness"],
        cadencePerWeek: 6
      },
      {
        id: "r3",
        userId: "u4",
        type: "morning_walk",
        daysOfWeek: ["wednesday"],
        timeWindow: { start: "07:45", end: "08:35" },
        locationCoords: { lat: 39.7688, lng: -86.1584 },
        routineTags: ["walk", "outside"],
        cadencePerWeek: 2
      }
    ],
    routineLogs: [
      { userId: "creator", occurredAt: "2026-04-01T08:00:00-04:00" },
      { userId: "creator", occurredAt: "2026-04-03T08:05:00-04:00" },
      { userId: "u2", occurredAt: "2026-03-01T08:15:00-05:00" },
      { userId: "u2", occurredAt: "2026-03-05T08:15:00-05:00" },
      { userId: "u2", occurredAt: "2026-03-08T08:15:00-04:00" },
      { userId: "u3", occurredAt: "2026-04-01T07:20:00-04:00" },
      { userId: "u3", occurredAt: "2026-04-02T07:25:00-04:00" },
      { userId: "u3", occurredAt: "2026-04-03T07:30:00-04:00" },
      { userId: "u4", occurredAt: "2026-03-26T07:45:00-04:00" },
      { userId: "u4", occurredAt: "2026-04-02T07:50:00-04:00" }
    ]
  });
}

function buildActiveIntention() {
  return {
    id: "intent-1",
    creatorId: "creator",
    type: "morning_walk",
    label: "morning walk",
    startTime: "2026-04-08T08:00:00-04:00",
    startLocation: { lat: 39.7687, lng: -86.1585 },
    endLocation: { lat: 39.7702, lng: -86.1569 },
    localSpotName: "Highland Park Bridge",
    desiredGroupSize: 2,
    cadencePerWeek: 2,
    durationMinutes: 40,
    contextTags: ["walk", "coffee"],
    status: "open"
  };
}

test("createRoutineMatches ranks anchor-compatible routines and personalizes invitation framing", async () => {
  const repository = buildRepository();

  const matches = await createRoutineMatches({
    activeIntention: buildActiveIntention(),
    repository,
    invitationSynthesizer: createTemplateInvitationSynthesizer()
  });

  assert.equal(matches.length, 3);
  assert.equal(matches[0].recipientId, "u2");
  assert.equal(matches[0].recommendedForRoutine, true);
  assert.equal(matches.find((match) => match.recipientId === "u4").matchType, "anchor");
  assert.equal(matches.find((match) => match.recipientId === "u2").viewerLens.id, "coffee-lover");
  assert.match(matches.find((match) => match.recipientId === "u2").invitationText, /coffee/i);
  assert.ok(matches.find((match) => match.recipientId === "u3").compatibilityScore < matches[0].compatibilityScore);
});

test("createBuildModePlan assembles blueprint, share link, and silent bridge notifications", async () => {
  const repository = buildRepository();

  const plan = await createBuildModePlan({
    activeIntention: buildActiveIntention(),
    repository,
    invitationSynthesizer: createTemplateInvitationSynthesizer(),
    blueprintGenerator: createTemplateRitualBlueprintGenerator(),
    baseUrl: "https://lodge.example.com"
  });

  assert.equal(plan.blueprint.firstThreeSessions.length, 3);
  assert.equal(plan.blueprint.recommendedGroupSize.target, 2);
  assert.match(plan.shareLink.url, /\/build\//);
  assert.ok(plan.notifications.length >= 1);
  assert.match(plan.notifications[0].message, /usually head out around now/i);
  assert.equal(repository.blueprints.length, 1);
  assert.equal(repository.notifications.length, plan.notifications.length);
});

test("analyzeRoutineEntropy flags slipping routines from recent check-in dropoff", () => {
  const entropy = analyzeRoutineEntropy({
    logs: [
      { occurredAt: "2026-03-01T08:00:00-05:00" },
      { occurredAt: "2026-03-03T08:00:00-05:00" },
      { occurredAt: "2026-03-05T08:00:00-05:00" },
      { occurredAt: "2026-03-08T08:00:00-05:00" }
    ],
    asOf: "2026-04-08T08:00:00-04:00"
  });

  assert.equal(entropy.entropyTriggerActive, true);
  assert.ok(entropy.declineRate > 0);
  assert.ok(entropy.staleDays >= 14);
});
