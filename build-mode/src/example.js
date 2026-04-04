import { createAnchorLink } from "./anchorLink.js";
import { createTemplateInvitationSynthesizer } from "./invitationSynthesizer.js";
import { InMemoryBuildModeRepository } from "./repositories/inMemoryBuildModeRepository.js";
import { createRoutineMatches } from "./routineMatchmaker.js";

const repository = new InMemoryBuildModeRepository({
  userProfiles: [
    { id: "u1", firstName: "Jake" },
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
      type: "coffee_run",
      daysOfWeek: ["wednesday"],
      timeWindow: { start: "09:00", end: "10:00" },
      locationCoords: { lat: 39.769, lng: -86.1575 },
      routineTags: ["coffee"]
    },
    {
      id: "r3",
      userId: "u4",
      type: "morning_walk",
      daysOfWeek: ["wednesday"],
      timeWindow: { start: "11:00", end: "12:00" },
      locationCoords: { lat: 39.79, lng: -86.2 },
      routineTags: ["morning_walk"]
    }
  ]
});

const invitationSynthesizer = createTemplateInvitationSynthesizer();

const activeIntention = {
  id: "intent-1",
  creatorId: "u1",
  type: "morning_walk",
  label: "a morning walk",
  startTime: "2026-04-08T08:00:00-04:00",
  startLocation: { lat: 39.7687, lng: -86.1585 },
  endLocation: { lat: 39.7702, lng: -86.1569 },
  localSpotName: "Highland Park",
  status: "open"
};

const matches = await createRoutineMatches({
  activeIntention,
  repository,
  invitationSynthesizer
});

const shareLink = createAnchorLink({
  baseUrl: "https://lodge.example.com",
  intentionId: activeIntention.id
});

console.log(JSON.stringify({ matches, shareLink }, null, 2));
