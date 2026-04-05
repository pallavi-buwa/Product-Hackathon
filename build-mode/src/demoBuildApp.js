import { randomUUID } from "node:crypto";
import { createBuildModePlan } from "./buildModeService.js";
import { BuildModeDataStore } from "./buildModeDataStore.js";
import { haversineMiles } from "./geo.js";
import { createTemplateInvitationSynthesizer } from "./invitationSynthesizer.js";
import { InMemoryBuildModeRepository } from "./repositories/inMemoryBuildModeRepository.js";
import { createTemplateRitualBlueprintGenerator } from "./ritualBlueprint.js";

function startTimeLabel(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildViewportFromQuery(query, defaultViewport) {
  const centerLat = Number(query.centerLat ?? defaultViewport.center.lat);
  const centerLng = Number(query.centerLng ?? defaultViewport.center.lng);
  const zoom = Number(query.zoom ?? defaultViewport.zoom);
  const spanLat = Number(query.spanLat ?? defaultViewport.spanLat);
  const spanLng = Number(query.spanLng ?? defaultViewport.spanLng);

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

function getDefaultCenter(state) {
  return state.viewport?.center || { lat: 39.7684, lng: -86.1581 };
}

function getDefaultViewport(state) {
  const center = getDefaultCenter(state);
  return {
    center,
    zoom: Number(state.viewport?.zoom ?? 1.2),
    spanLat: Number(state.viewport?.spanLat ?? 0.055),
    spanLng: Number(state.viewport?.spanLng ?? 0.07)
  };
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
  constructor({
    baseUrl = "http://localhost:3030",
    dataStore = new BuildModeDataStore()
  } = {}) {
    this.baseUrl = baseUrl;
    this.dataStore = dataStore;
    this.state = null;
    this.ready = this.initialize();
    this.subscribers = new Set();
    this.invitationSynthesizer = createTemplateInvitationSynthesizer();
    this.blueprintGenerator = createTemplateRitualBlueprintGenerator();
    this.pulseTimer = setInterval(async () => {
      await this.ensureReady();
      if (!this.state.activeIntentions.length) {
        return;
      }

      const spotlight =
        this.state.activeIntentions[
          Math.floor(Math.random() * this.state.activeIntentions.length)
        ];
      this.publishUpdate({
        kind: "pulse",
        message: `${spotlight.label} is still open near ${spotlight.localSpotName}.`,
        timestamp: new Date().toISOString()
      });
    }, 14000);
  }

  async initialize() {
    const loadedState = await this.dataStore.loadState();
    this.state = {
      ...loadedState,
      plansByIntentionId: new Map()
    };
  }

  async ensureReady() {
    await this.ready;
  }

  async persistState() {
    await this.dataStore.saveState(this.state);
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
        activeNeighbors: this.state.userRoutines.filter(
          (routine) => routine.userId !== this.state.viewerId
        ).length,
        liveNudges: this.state.updates.filter((item) => item.kind === "nudge").length,
        lastUpdatedAt: new Date().toISOString()
      },
      updates: this.state.updates.slice(0, 6)
    };
  }

  async getBootstrap() {
    await this.ensureReady();
    const defaultViewport = getDefaultViewport(this.state);
    const viewport = {
      ...defaultViewport,
      bounds: {
        minLat: defaultViewport.center.lat - defaultViewport.spanLat / 2,
        maxLat: defaultViewport.center.lat + defaultViewport.spanLat / 2,
        minLng: defaultViewport.center.lng - defaultViewport.spanLng / 2,
        maxLng: defaultViewport.center.lng + defaultViewport.spanLng / 2
      }
    };

    return {
      brand: this.state.brand,
      viewer: this.getProfile(this.state.viewerId),
      viewport,
      mapPlaces: this.state.mapPlaces,
      routineTypeOptions: this.state.routineTypeOptions,
      composerDefaults: this.state.composerDefaults,
      liveFeed: this.getLiveFeed(),
      featuredPosts: (await this.listPosts({ center: viewport.center, bounds: viewport.bounds })).slice(0, 6)
    };
  }

  async listPosts(query = {}) {
    await this.ensureReady();
    const defaultViewport = getDefaultViewport(this.state);
    const viewport = buildViewportFromQuery(query, defaultViewport);

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
    await this.ensureReady();
    const post = this.state.activeIntentions.find((item) => item.id === postId);
    if (!post) {
      return null;
    }

    const profile = this.getProfile(post.creatorId);
    const summary = toPostSummary({
      post,
      profile,
      center: getDefaultCenter(this.state)
    });
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
    await this.ensureReady();
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
    await this.ensureReady();
    const defaultCenter = getDefaultCenter(this.state);
    const defaultStartOffsetMinutes = Number(
      this.state.composerDefaults?.startOffsetMinutes ?? 45
    );
    const startLat = Number(payload.startLat ?? payload.lat ?? defaultCenter.lat);
    const startLng = Number(payload.startLng ?? payload.lng ?? defaultCenter.lng);
    const startTime = payload.startTime
      ? new Date(payload.startTime).toISOString()
      : new Date(Date.now() + defaultStartOffsetMinutes * 60 * 1000).toISOString();

    const activeIntention = {
      id: randomUUID(),
      creatorId: this.state.viewerId,
      type: payload.type || this.state.composerDefaults?.type || "morning_walk",
      label: payload.label || this.state.composerDefaults?.label || "New shared ritual",
      startTime,
      startLocation: { lat: startLat, lng: startLng },
      endLocation: {
        lat: Number(payload.endLat ?? startLat + 0.0015),
        lng: Number(payload.endLng ?? startLng + 0.0012)
      },
      localSpotName:
        payload.localSpotName ||
        this.state.composerDefaults?.localSpotName ||
        "Neighborhood anchor",
      desiredGroupSize: Number(
        payload.desiredGroupSize ?? this.state.composerDefaults?.desiredGroupSize ?? 2
      ),
      cadencePerWeek: Number(
        payload.cadencePerWeek ?? this.state.composerDefaults?.cadencePerWeek ?? 1
      ),
      durationMinutes: Number(
        payload.durationMinutes ?? this.state.composerDefaults?.durationMinutes ?? 40
      ),
      contextTags: Array.isArray(payload.contextTags)
        ? payload.contextTags
        : String(
            payload.contextTags ||
              (this.state.composerDefaults?.contextTags || []).join(", ")
          )
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
      status: "open",
      createdAt: new Date().toISOString()
    };

    this.state.activeIntentions.unshift(activeIntention);
    await this.persistState();

    this.publishUpdate({
      kind: "anchor",
      message: `A new ${activeIntention.label.toLowerCase()} opened near ${activeIntention.localSpotName}.`,
      timestamp: new Date().toISOString()
    });
    await this.persistState();

    const plan = await this.getPlan(activeIntention.id);
    return {
      post: toPostSummary({
        post: activeIntention,
        profile: this.getProfile(activeIntention.creatorId),
        center: defaultCenter
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
