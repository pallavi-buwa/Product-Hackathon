import test from "node:test";
import assert from "node:assert/strict";

import { createTemplateInvitationSynthesizer } from "../src/invitationSynthesizer.js";
import { InMemoryBuildModeRepository } from "../src/repositories/inMemoryBuildModeRepository.js";
import { createRoutineMatches } from "../src/routineMatchmaker.js";

test("createRoutineMatches deduplicates recipients across symmetry and proximity", async () => {
  const repository = new InMemoryBuildModeRepository({
    userProfiles: [
      { id: "creator", firstName: "Jake" },
      { id: "u2", firstName: "Maya", entropyTriggerActive: true },
      { id: "u3", firstName: "Noah" },
      { id: "u4", firstName: "Priya" }
    ],
    userRoutines: [
      {
        id: "r1",
        userId: "u2",
        type: "morning_walk",
        daysOfWeek: ["wednesday"],
        timeWindow: { start: "07:30", end: "08:30" },
        locationCoords: { lat: 39.7684, lng: -86.1581 },
        routineTags: ["morning_walk"]
      },
      {
        id: "r2",
        userId: "u3",
        type: "errands",
        daysOfWeek: ["wednesday"],
        timeWindow: { start: "11:00", end: "12:00" },
        locationCoords: { lat: 39.7691, lng: -86.1579 },
        routineTags: ["shopping"]
      },
      {
        id: "r3",
        userId: "u4",
        type: "morning_walk",
        daysOfWeek: ["wednesday"],
        timeWindow: { start: "07:30", end: "08:30" },
        locationCoords: { lat: 39.769, lng: -86.1583 },
        routineTags: ["morning_walk"]
      }
    ]
  });

  const matches = await createRoutineMatches({
    activeIntention: {
      id: "intent-1",
      creatorId: "creator",
      type: "morning_walk",
      label: "a morning walk",
      startTime: "2026-04-08T08:00:00-04:00",
      startLocation: { lat: 39.7687, lng: -86.1585 },
      endLocation: { lat: 39.7702, lng: -86.1569 },
      localSpotName: "Highland Park"
    },
    repository,
    invitationSynthesizer: createTemplateInvitationSynthesizer()
  });

  assert.equal(matches.length, 3);
  assert.equal(matches[0].recipientId, "u2");
  assert.equal(matches[0].recommendedForRoutine, true);
  assert.equal(matches.find((item) => item.recipientId === "u2").matchType, "symmetry");
  assert.deepEqual(matches.find((item) => item.recipientId === "u4").matchSources.sort(), ["proximity", "symmetry"]);
  assert.equal(matches.find((item) => item.recipientId === "u3").matchType, "proximity");
  assert.match(matches[0].invitationText, /Jake/);
});
