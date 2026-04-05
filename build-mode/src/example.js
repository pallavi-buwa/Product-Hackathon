import { createBuildModePlan } from "./buildModeService.js";
import { createTemplateInvitationSynthesizer } from "./invitationSynthesizer.js";
import { InMemoryBuildModeRepository } from "./repositories/inMemoryBuildModeRepository.js";
import { createTemplateRitualBlueprintGenerator } from "./ritualBlueprint.js";

const repository = new InMemoryBuildModeRepository({
  userProfiles: [
    { id: "u1", firstName: "Jake", preferredGroupSize: 2, socialEnergyLevel: "steady" },
    { id: "u2", firstName: "Maya", interests: ["coffee"], preferredGroupSize: 2 },
    { id: "u3", firstName: "Noah", interests: ["gym"], maxSharedRitualsPerWeek: 5 },
    { id: "u4", firstName: "Priya", interests: ["walks"], preferredGroupSize: 2 }
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
      cadencePerWeek: 3
    },
    {
      id: "r2",
      userId: "u3",
      type: "gym_session",
      daysOfWeek: ["wednesday"],
      timeWindow: { start: "07:15", end: "08:45" },
      locationCoords: { lat: 39.7701, lng: -86.1576 },
      routineTags: ["gym", "fitness"],
      cadencePerWeek: 6
    },
    {
      id: "r3",
      userId: "u4",
      type: "morning_walk",
      daysOfWeek: ["wednesday"],
      timeWindow: { start: "07:45", end: "08:30" },
      locationCoords: { lat: 39.7688, lng: -86.1584 },
      routineTags: ["walk"],
      cadencePerWeek: 2
    }
  ],
  routineLogs: [
    { userId: "u2", occurredAt: "2026-03-02T08:15:00-05:00" },
    { userId: "u2", occurredAt: "2026-03-05T08:20:00-05:00" },
    { userId: "u2", occurredAt: "2026-03-09T08:10:00-05:00" },
    { userId: "u3", occurredAt: "2026-04-01T07:20:00-04:00" },
    { userId: "u3", occurredAt: "2026-04-02T07:25:00-04:00" },
    { userId: "u3", occurredAt: "2026-04-03T07:30:00-04:00" },
    { userId: "u4", occurredAt: "2026-03-26T07:50:00-04:00" },
    { userId: "u4", occurredAt: "2026-04-02T07:55:00-04:00" },
    { userId: "u1", occurredAt: "2026-04-01T08:00:00-04:00" },
    { userId: "u1", occurredAt: "2026-04-03T08:05:00-04:00" }
  ]
});

const invitationSynthesizer = createTemplateInvitationSynthesizer();
const blueprintGenerator = createTemplateRitualBlueprintGenerator();

const activeIntention = {
  id: "intent-1",
  creatorId: "u1",
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

const buildPlan = await createBuildModePlan({
  activeIntention,
  repository,
  invitationSynthesizer,
  blueprintGenerator
});

console.log(JSON.stringify(buildPlan, null, 2));
