import { randomUUID } from "node:crypto";
import { createBuildModePlan } from "./buildModeService.js";
import { haversineMiles } from "./geo.js";
import { createTemplateInvitationSynthesizer } from "./invitationSynthesizer.js";
import { InMemoryBuildModeRepository } from "./repositories/inMemoryBuildModeRepository.js";
import { createTemplateRitualBlueprintGenerator } from "./ritualBlueprint.js";

const DEFAULT_CENTER = { lat: 39.7684, lng: -86.1581 };
const DEFAULT_VIEWPORT = {
  center: DEFAULT_CENTER,
  zoom: 1.2,
  spanLat: 0.055,
  spanLng: 0.07
};

function isoMinutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function buildSeedState() {
  return {
    viewerId: "viewer",
    userProfiles: [
      {
        id: "viewer",
        firstName: "You",
        homeCity: "Indianapolis",
        socialEnergyLevel: "steady",
        preferredGroupSize: 2,
        interests: ["walk", "coffee", "design"]
      },
      {
        id: "maya",
        firstName: "Maya",
        homeCity: "Indianapolis",
        socialEnergyLevel: "steady",
        preferredGroupSize: 2,
        interests: ["coffee", "walk", "sunrise"]
      },
      {
        id: "noah",
        firstName: "Noah",
        homeCity: "Indianapolis",
        socialEnergyLevel: "high",
        preferredGroupSize: 3,
        maxSharedRitualsPerWeek: 6,
        interests: ["gym", "fitness", "smoothies"]
      },
      {
        id: "priya",
        firstName: "Priya",
        homeCity: "Indianapolis",
        socialEnergyLevel: "steady",
        preferredGroupSize: 2,
        interests: ["walk", "books", "tea"]
      },
      {
        id: "elena",
        firstName: "Elena",
        homeCity: "Indianapolis",
        socialEnergyLevel: "low",
        preferredGroupSize: 2,
        interests: ["market", "cooking", "coffee"]
      },
      {
        id: "marcus",
        firstName: "Marcus",
        homeCity: "Indianapolis",
        socialEnergyLevel: "steady",
        preferredGroupSize: 2,
        interests: ["run", "trail", "brunch"]
      },
      {
        id: "zoe",
        firstName: "Zoe",
        homeCity: "Indianapolis",
        socialEnergyLevel: "steady",
        preferredGroupSize: 3,
        interests: ["ceramics", "market", "walking"]
      }
    ],
    userRoutines: [
      {
        id: "routine-maya",
        userId: "maya",
        type: "coffee_run",
        label: "Canal coffee loop",
        daysOfWeek: ["monday", "wednesday", "friday", "saturday"],
        timeWindow: { start: "08:05", end: "08:35" },
        locationCoords: { lat: 39.7691, lng: -86.1612 },
        anchorPoints: [{ lat: 39.7686, lng: -86.1588 }],
        routineTags: ["coffee", "walk", "canal"],
        cadencePerWeek: 3
      },
      {
        id: "routine-noah",
        userId: "noah",
        type: "gym_session",
        label: "Downtown lift block",
        daysOfWeek: ["tuesday", "wednesday", "thursday", "saturday"],
        timeWindow: { start: "07:15", end: "08:40" },
        locationCoords: { lat: 39.7712, lng: -86.1568 },
        routineTags: ["gym", "fitness"],
        cadencePerWeek: 5
      },
      {
        id: "routine-priya",
        userId: "priya",
        type: "morning_walk",
        label: "Bridge walk",
        daysOfWeek: ["wednesday", "saturday"],
        timeWindow: { start: "07:45", end: "08:30" },
        locationCoords: { lat: 39.7688, lng: -86.1584 },
        routineTags: ["walk", "outside"],
        cadencePerWeek: 2
      },
      {
        id: "routine-elena",
        userId: "elena",
        type: "market_run",
        label: "Midweek market stop",
        daysOfWeek: ["wednesday", "sunday"],
        timeWindow: { start: "17:40", end: "18:30" },
        locationCoords: { lat: 39.7649, lng: -86.1462 },
        routineTags: ["market", "groceries", "cooking"],
        cadencePerWeek: 2
      },
      {
        id: "routine-marcus",
        userId: "marcus",
        type: "river_run",
        label: "White River loop",
        daysOfWeek: ["tuesday", "thursday", "saturday"],
        timeWindow: { start: "18:05", end: "19:00" },
        locationCoords: { lat: 39.7742, lng: -86.1714 },
        routineTags: ["run", "trail"],
        cadencePerWeek: 3
      },
      {
        id: "routine-zoe",
        userId: "zoe",
        type: "ceramics_walk",
        label: "Ceramics + walk",
        daysOfWeek: ["thursday"],
        timeWindow: { start: "18:10", end: "19:10" },
        locationCoords: { lat: 39.7814, lng: -86.1498 },
        routineTags: ["ceramics", "walking", "coffee"],
        cadencePerWeek: 1
      },
      {
        id: "routine-viewer",
        userId: "viewer",
        type: "morning_walk",
        label: "Your soft-start walk",
        daysOfWeek: ["wednesday", "friday", "saturday"],
        timeWindow: { start: "08:00", end: "08:35" },
        locationCoords: { lat: 39.7685, lng: -86.1582 },
        routineTags: ["walk", "coffee"],
        cadencePerWeek: 2
      }
    ],
    routineLogs: [
      { userId: "viewer", occurredAt: "2026-04-01T08:00:00-04:00" },
      { userId: "viewer", occurredAt: "2026-04-03T08:05:00-04:00" },
      { userId: "maya", occurredAt: "2026-03-03T08:12:00-05:00" },
      { userId: "maya", occurredAt: "2026-03-05T08:15:00-05:00" },
      { userId: "maya", occurredAt: "2026-03-10T08:18:00-04:00" },
      { userId: "noah", occurredAt: "2026-04-01T07:25:00-04:00" },
      { userId: "noah", occurredAt: "2026-04-02T07:22:00-04:00" },
      { userId: "noah", occurredAt: "2026-04-03T07:28:00-04:00" },
      { userId: "priya", occurredAt: "2026-03-26T07:52:00-04:00" },
      { userId: "priya", occurredAt: "2026-04-02T07:50:00-04:00" },
      { userId: "elena", occurredAt: "2026-03-30T17:45:00-04:00" },
      { userId: "elena", occurredAt: "2026-04-02T17:48:00-04:00" },
      { userId: "marcus", occurredAt: "2026-04-01T18:06:00-04:00" },
      { userId: "marcus", occurredAt: "2026-04-03T18:09:00-04:00" }
    ],
    activeIntentions: [
      {
        id: "intent-priya-1",
        creatorId: "priya",
        type: "morning_walk",
        label: "Bridge walk before work",
        startTime: isoMinutesFromNow(35),
        startLocation: { lat: 39.7688, lng: -86.1584 },
        endLocation: { lat: 39.7702, lng: -86.1569 },
        localSpotName: "Highland Park Bridge",
        desiredGroupSize: 2,
        cadencePerWeek: 2,
        durationMinutes: 35,
        contextTags: ["walk", "gentle"],
        status: "open",
        createdAt: new Date().toISOString()
      },
      {
        id: "intent-elena-1",
        creatorId: "elena",
        type: "market_run",
        label: "Midweek market stop",
        startTime: isoMinutesFromNow(140),
        startLocation: { lat: 39.7649, lng: -86.1462 },
        endLocation: { lat: 39.7634, lng: -86.1446 },
        localSpotName: "City Market",
        desiredGroupSize: 2,
        cadencePerWeek: 1,
        durationMinutes: 45,
        contextTags: ["market", "cooking"],
        status: "open",
        createdAt: new Date().toISOString()
      },
      {
        id: "intent-marcus-1",
        creatorId: "marcus",
        type: "river_run",
        label: "White River loop",
        startTime: isoMinutesFromNow(170),
        startLocation: { lat: 39.7742, lng: -86.1714 },
        endLocation: { lat: 39.7761, lng: -86.1738 },
        localSpotName: "White River Trailhead",
        desiredGroupSize: 2,
        cadencePerWeek: 2,
        durationMinutes: 50,
        contextTags: ["run", "trail"],
        status: "open",
        createdAt: new Date().toISOString()
      },
      {
        id: "intent-maya-1",
        creatorId: "maya",
        type: "coffee_run",
        label: "Canal walk + coffee",
        startTime: isoMinutesFromNow(55),
        startLocation: { lat: 39.7691, lng: -86.1612 },
        endLocation: { lat: 39.7682, lng: -86.1591 },
        localSpotName: "Canal Walk",
        desiredGroupSize: 2,
        cadencePerWeek: 3,
        durationMinutes: 40,
        contextTags: ["coffee", "walk"],
        status: "open",
        createdAt: new Date().toISOString()
      },
      {
        id: "intent-zoe-1",
        creatorId: "zoe",
        type: "ceramics_walk",
        label: "Clay studio stroll",
        startTime: isoMinutesFromNow(220),
        startLocation: { lat: 39.7814, lng: -86.1498 },
        endLocation: { lat: 39.7801, lng: -86.1512 },
        localSpotName: "Mass Ave Studio",
        desiredGroupSize: 3,
        cadencePerWeek: 1,
        durationMinutes: 60,
        contextTags: ["ceramics", "walking"],
        status: "open",
        createdAt: new Date().toISOString()
      }
    ],
    updates: [
      {
        id: randomUUID(),
        kind: "anchor",
        message: "Bridge walk sync opened near Highland Park Bridge.",
        timestamp: new Date().toISOString()
      },
      {
        id: randomUUID(),
        kind: "nudge",
        message: "A quiet nudge was sent for a Canal coffee loop.",
        timestamp: new Date().toISOString()
      },
      {
        id: randomUUID(),
        kind: "ritual",
        message: "A new ritual blueprint was drafted for City Market.",
        timestamp: new Date().toISOString()
      }
    ],
    plansByIntentionId: new Map()
  };
}

function startTimeLabel(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildViewportFromQuery(query) {
  const centerLat = Number(query.centerLat ?? DEFAULT_VIEWPORT.center.lat);
  const centerLng = Number(query.centerLng ?? DEFAULT_VIEWPORT.center.lng);
  const zoom = Number(query.zoom ?? DEFAULT_VIEWPORT.zoom);
  const spanLat = Number(query.spanLat ?? DEFAULT_VIEWPORT.spanLat);
  const spanLng = Number(query.spanLng ?? DEFAULT_VIEWPORT.spanLng);

  return {
    center: { lat: centerLat, lng: centerLng },
    zoom,
    spanLat,
    spanLng,
    bounds: {
      minLat: Number(query.minLat ?? centerLat - spanLat / 2),
      maxLat: Number(query.maxLat ?? centerLat + spanLat / 2),
      minLng: Number(query.minLng ?? centerLng - spanLng / 2),
      maxLng: Number(query.maxLng ?? centerLng + spanLng / 2)
    }
  };
}

function withinBounds(point, bounds) {
  if (!point) {
    return false;
  }

  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}

function toPostSummary({ post, profile, center }) {
  const distanceMiles = center ? haversineMiles(center, post.startLocation) : null;

  return {
    id: post.id,
    creatorId: post.creatorId,
    creatorName: profile?.firstName || "Someone",
    type: post.type,
    label: post.label,
    localSpotName: post.localSpotName,
    startTime: post.startTime,
    startTimeLabel: startTimeLabel(post.startTime),
    desiredGroupSize: post.desiredGroupSize,
    cadencePerWeek: post.cadencePerWeek,
    durationMinutes: post.durationMinutes,
    contextTags: post.contextTags || [],
    startLocation: post.startLocation,
    endLocation: post.endLocation,
    distanceMiles: distanceMiles === null ? null : Number(distanceMiles.toFixed(2)),
    createdAt: post.createdAt,
    status: post.status
  };
}

export class DemoBuildModeApp {
  constructor({ baseUrl = "http://localhost:3030" } = {}) {
    this.baseUrl = baseUrl;
    this.state = buildSeedState();
    this.subscribers = new Set();
    this.invitationSynthesizer = createTemplateInvitationSynthesizer();
    this.blueprintGenerator = createTemplateRitualBlueprintGenerator();
    this.pulseTimer = setInterval(() => {
      const spotlight = this.state.activeIntentions[
        Math.floor(Math.random() * this.state.activeIntentions.length)
      ];
      this.publishUpdate({
        kind: "pulse",
        message: `${spotlight.label} is still open near ${spotlight.localSpotName}.`,
        timestamp: new Date().toISOString()
      });
    }, 14000);
  }

  createRepository() {
    return new InMemoryBuildModeRepository({
      userProfiles: this.state.userProfiles,
      userRoutines: this.state.userRoutines,
      routineLogs: this.state.routineLogs,
      activeIntentions: this.state.activeIntentions
    });
  }

  getProfile(userId) {
    return this.state.userProfiles.find((profile) => profile.id === userId) || null;
  }

  publishUpdate(update) {
    const payload = {
      id: update.id || randomUUID(),
      kind: update.kind,
      message: update.message,
      timestamp: update.timestamp || new Date().toISOString()
    };

    this.state.updates.unshift(payload);
    this.state.updates = this.state.updates.slice(0, 18);

    for (const subscriber of this.subscribers) {
      subscriber.write(`event: pulse\n`);
      subscriber.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  subscribe(response) {
    this.subscribers.add(response);
    response.write(`retry: 4000\n\n`);
    response.write(`event: bootstrap\n`);
    response.write(`data: ${JSON.stringify(this.getLiveFeed())}\n\n`);

    return () => {
      this.subscribers.delete(response);
    };
  }

  getLiveFeed() {
    return {
      stats: {
        openPosts: this.state.activeIntentions.length,
        activeNeighbors: this.state.userRoutines.length - 1,
        liveNudges: this.state.updates.filter((item) => item.kind === "nudge").length,
        lastUpdatedAt: new Date().toISOString()
      },
      updates: this.state.updates.slice(0, 6)
    };
  }

  getBootstrap() {
    const viewport = {
      ...DEFAULT_VIEWPORT,
      bounds: {
        minLat: DEFAULT_VIEWPORT.center.lat - DEFAULT_VIEWPORT.spanLat / 2,
        maxLat: DEFAULT_VIEWPORT.center.lat + DEFAULT_VIEWPORT.spanLat / 2,
        minLng: DEFAULT_VIEWPORT.center.lng - DEFAULT_VIEWPORT.spanLng / 2,
        maxLng: DEFAULT_VIEWPORT.center.lng + DEFAULT_VIEWPORT.spanLng / 2
      }
    };

    return {
      brand: {
        name: "Lodge",
        mode: "BUILD",
        promise: "Turn what you already do alone into a shared ritual."
      },
      viewer: this.getProfile(this.state.viewerId),
      viewport,
      liveFeed: this.getLiveFeed(),
      featuredPosts: this.listPosts({ center: viewport.center, bounds: viewport.bounds }).slice(0, 6)
    };
  }

  listPosts(query = {}) {
    const viewport = buildViewportFromQuery(query);

    return this.state.activeIntentions
      .filter((post) => post.status === "open" && withinBounds(post.startLocation, viewport.bounds))
      .map((post) =>
        toPostSummary({
          post,
          profile: this.getProfile(post.creatorId),
          center: viewport.center
        })
      )
      .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
  }

  async getPostDetail(postId) {
    const post = this.state.activeIntentions.find((item) => item.id === postId);
    if (!post) {
      return null;
    }

    const profile = this.getProfile(post.creatorId);
    const summary = toPostSummary({ post, profile, center: DEFAULT_VIEWPORT.center });
    const plan = await this.getPlan(postId);

    return {
      post: summary,
      creator: profile,
      plan: {
        blueprint: plan.blueprint,
        matches: plan.matches.slice(0, 4),
        notifications: plan.notifications
      }
    };
  }

  async getPlan(postId) {
    if (this.state.plansByIntentionId.has(postId)) {
      return this.state.plansByIntentionId.get(postId);
    }

    const activeIntention = this.state.activeIntentions.find((item) => item.id === postId);
    if (!activeIntention) {
      return null;
    }

    const repository = this.createRepository();
    const plan = await createBuildModePlan({
      activeIntention,
      repository,
      invitationSynthesizer: this.invitationSynthesizer,
      blueprintGenerator: this.blueprintGenerator,
      baseUrl: this.baseUrl
    });

    this.state.plansByIntentionId.set(postId, plan);
    this.publishUpdate({
      kind: "ritual",
      message: `${activeIntention.label} just generated a ritual blueprint.`,
      timestamp: new Date().toISOString()
    });

    return plan;
  }

  async createPost(payload) {
    const startLat = Number(payload.startLat ?? payload.lat ?? DEFAULT_CENTER.lat);
    const startLng = Number(payload.startLng ?? payload.lng ?? DEFAULT_CENTER.lng);
    const activeIntention = {
      id: randomUUID(),
      creatorId: this.state.viewerId,
      type: payload.type || "morning_walk",
      label: payload.label || "New shared ritual",
      startTime: payload.startTime || isoMinutesFromNow(45),
      startLocation: { lat: startLat, lng: startLng },
      endLocation: {
        lat: Number(payload.endLat ?? startLat + 0.0015),
        lng: Number(payload.endLng ?? startLng + 0.0012)
      },
      localSpotName: payload.localSpotName || "Neighborhood anchor",
      desiredGroupSize: Number(payload.desiredGroupSize ?? 2),
      cadencePerWeek: Number(payload.cadencePerWeek ?? 1),
      durationMinutes: Number(payload.durationMinutes ?? 40),
      contextTags: Array.isArray(payload.contextTags)
        ? payload.contextTags
        : String(payload.contextTags || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
      status: "open",
      createdAt: new Date().toISOString()
    };

    this.state.activeIntentions.unshift(activeIntention);
    this.publishUpdate({
      kind: "anchor",
      message: `A new ${activeIntention.label.toLowerCase()} opened near ${activeIntention.localSpotName}.`,
      timestamp: new Date().toISOString()
    });

    const plan = await this.getPlan(activeIntention.id);
    return {
      post: toPostSummary({
        post: activeIntention,
        profile: this.getProfile(activeIntention.creatorId),
        center: DEFAULT_VIEWPORT.center
      }),
      plan
    };
  }

  close() {
    clearInterval(this.pulseTimer);
    for (const subscriber of this.subscribers) {
      subscriber.end();
    }
    this.subscribers.clear();
  }
}

export { DEFAULT_CENTER, DEFAULT_VIEWPORT };
