import { randomUUID } from "node:crypto";
import { createBuildModePlan } from "./buildModeService.js";
import { BuildModeDataStore } from "./buildModeDataStore.js";
import { analyzeRoutineEntropy } from "./entropy.js";
import { haversineMiles } from "./geo.js";
import { computeHeatZones } from "./heatMapCompute.js";
import { createTemplateInvitationSynthesizer } from "./invitationSynthesizer.js";
import {
  computePillarScores,
  matchHighlightTemplate,
  maybeMatchHighlightLine
} from "./pillarScoring.js";
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

function tokenizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function eventPersonalizationScore(event, prefs) {
  const base = (event.interestedUserIds || []).length;
  const v = Number(prefs?.venueScores?.[event.venueLabel] || 0);
  let tag = 0;
  if (prefs?.tagHits) {
    for (const w of tokenizeTitle(event.title)) {
      tag += Number(prefs.tagHits[w] || 0);
    }
  }
  return base + v * 3 + tag * 2;
}

function feedbackPercentBonusFromViewer(viewer) {
  const n = viewer?.recommendationPreferences?.netScore ?? 0;
  return Math.round(Math.max(-2, Math.min(4, n * 0.35)));
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

function clampLat(lat) {
  return Math.max(-84, Math.min(84, lat));
}

function wrapLng(lng) {
  let value = lng;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function expandGlobeSignals(signals = []) {
  const offsets = [
    { lat: 0, lng: 0 },
    { lat: 0.82, lng: 1.26 },
    { lat: -0.94, lng: -1.18 },
    { lat: 0.58, lng: -1.44 }
  ];

  return signals.flatMap((signal, index) => {
    const scale = 0.55 + (index % 4) * 0.18;
    return offsets.map((offset, variant) => ({
      id: `${signal.id}-${variant}`,
      label: signal.label,
      subtitle: signal.subtitle,
      lat: clampLat(signal.lat + offset.lat * scale),
      lng: wrapLng(signal.lng + offset.lng * scale)
    }));
  });
}

function toPostSummary({ post, profile, center }) {
  const distanceMiles = center ? haversineMiles(center, post.startLocation) : null;

  return {
    id: post.id,
    creatorId: post.creatorId,
    creatorName: profile?.firstName || "Someone",
    creatorOriginNote: profile?.originNote || null,
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
      plansByIntentionId: new Map(),
      viewerErrands: loadedState.viewerErrands || [],
      nearbyEvents: loadedState.nearbyEvents || [],
      errandPresets: loadedState.errandPresets || [],
      eventInterests: loadedState.eventInterests || []
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
    if (update.visibleMs != null && Number.isFinite(update.visibleMs)) {
      payload.visibleMs = Math.round(update.visibleMs);
    }

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
      globeSignals: expandGlobeSignals(this.state.globeSignals || []),
      viewer: this.getProfile(this.state.viewerId),
      viewport,
      mapPlaces: this.state.mapPlaces,
      routineTypeOptions: this.state.routineTypeOptions,
      composerDefaults: this.state.composerDefaults,
      liveFeed: this.getLiveFeed(),
      featuredPosts: (await this.listPosts({ center: viewport.center, bounds: viewport.bounds })).slice(0, 6),
      heatZones: this.getHeatZones(),
      nearbyEvents: this.getPublicEvents(),
      errandPresets: this.state.errandPresets || [],
      hobbyOptions: this.state.hobbyOptions || [],
      quickChoices: this.state.quickChoices || [],
      pillarGuide: this.state.pillarGuide || {}
    };
  }

  getHeatZones() {
    return computeHeatZones({
      mapPlaces: this.state.mapPlaces,
      userRoutines: this.state.userRoutines,
      activeIntentions: this.state.activeIntentions,
      viewerErrands: this.state.viewerErrands || []
    });
  }

  getPublicEvents() {
    const viewer = this.getProfile(this.state.viewerId);
    const prefs = viewer?.recommendationPreferences || { venueScores: {}, tagHits: {}, netScore: 0 };
    const raw = [...(this.state.nearbyEvents || [])];
    raw.sort(
      (a, b) => eventPersonalizationScore(b, prefs) - eventPersonalizationScore(a, prefs)
    );
    return raw.map((e) => ({
      id: e.id,
      title: e.title,
      venueLabel: e.venueLabel,
      lat: e.lat,
      lng: e.lng,
      startsAt: e.startsAt,
      interestCount: (e.interestedUserIds || []).length,
      youAreInterested: (e.interestedUserIds || []).includes(this.state.viewerId)
    }));
  }

  sharedEventIds(viewerId, neighborId) {
    return (this.state.nearbyEvents || [])
      .filter(
        (e) =>
          (e.interestedUserIds || []).includes(viewerId) &&
          (e.interestedUserIds || []).includes(neighborId)
      )
      .map((e) => e.id);
  }

  detectErrandOverlapWithNeighbor(neighborId) {
    const mine = (this.state.viewerErrands || []).filter((e) => e.userId === this.state.viewerId);
    if (!mine.length) {
      return false;
    }
    const last = mine[mine.length - 1];
    const ws = new Date(last.windowStart).getTime();
    const we = new Date(last.windowEnd).getTime();
    const key = (last.errandKey || "").toLowerCase().replace(/_/g, " ");

    for (const post of this.state.activeIntentions) {
      if (post.creatorId !== neighborId || post.status !== "open") {
        continue;
      }
      const pt = new Date(post.startTime).getTime();
      if (pt < ws - 20 * 60 * 1000 || pt > we + 20 * 60 * 1000) {
        continue;
      }
      const blob = `${post.type} ${(post.contextTags || []).join(" ")} ${post.label || ""}`.toLowerCase();
      if (key && blob.includes(key.trim())) {
        return true;
      }
      const hints = ["coffee", "grocery", "gym", "walk", "dog", "market", "run"];
      if (hints.some((h) => blob.includes(h) && (key.includes(h) || (last.label || "").toLowerCase().includes(h)))) {
        return true;
      }
    }
    return false;
  }

  async getNeighborMatches() {
    await this.ensureReady();
    const viewer = this.getProfile(this.state.viewerId);
    if (!viewer) {
      return { matches: [] };
    }

    const viewerLogs = this.state.routineLogs.filter((l) => l.userId === viewer.id);
    const neighbors = this.state.userProfiles.filter((p) => p.id !== viewer.id);
    const results = [];

    const feedbackPercentBonus = feedbackPercentBonusFromViewer(viewer);

    for (const neighbor of neighbors) {
      const shared = this.sharedEventIds(viewer.id, neighbor.id);
      const overlappingErrand = this.detectErrandOverlapWithNeighbor(neighbor.id);
      const neighborLogs = this.state.routineLogs.filter((l) => l.userId === neighbor.id);
      const nEnt = analyzeRoutineEntropy({ logs: neighborLogs, asOf: new Date() });
      const neighborRoutineStable = !nEnt.entropyTriggerActive;

      const scoring = computePillarScores(viewer, neighbor, {
        sharedEventIds: shared,
        overlappingErrand,
        neighborRoutineStable,
        viewerRoutineLogs: viewerLogs,
        now: new Date(),
        feedbackPercentBonus
      });

      results.push({
        neighborId: neighbor.id,
        firstName: neighbor.firstName,
        percent: scoring.percent,
        weights: scoring.weights,
        breakdown: scoring.breakdown,
        labels: scoring.labels,
        sharedEventCount: shared.length,
        overlappingErrand
      });
    }

    results.sort((a, b) => b.percent - a.percent);

    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const baseUrl = process.env.OPENAI_BASE_URL;

    const slimMatches = results.map((r) => ({
      neighborId: r.neighborId,
      firstName: r.firstName,
      percent: r.percent,
      sharedEventCount: r.sharedEventCount,
      overlappingErrand: r.overlappingErrand
    }));

    let highlight = null;
    const top = results[0];
    if (top) {
      const openPost = this.state.activeIntentions.find(
        (p) => p.status === "open" && p.creatorId === top.neighborId
      );
      const postSummary = openPost
        ? {
            id: openPost.id,
            label: openPost.label,
            localSpotName: openPost.localSpotName,
            contextTags: openPost.contextTags || []
          }
        : null;

      let line = matchHighlightTemplate(top, postSummary);
      if (openaiKey) {
        const aiLine = await maybeMatchHighlightLine(
          viewer,
          top,
          postSummary,
          openaiKey,
          model,
          baseUrl
        );
        if (aiLine) {
          line = aiLine;
        }
      }

      highlight = {
        neighborId: top.neighborId,
        firstName: top.firstName,
        percent: top.percent,
        postId: postSummary?.id ?? null,
        overlappingErrand: top.overlappingErrand,
        line
      };
    }

    return { matches: slimMatches, highlight };
  }

  async updateViewerOnboarding(payload) {
    await this.ensureReady();
    const idx = this.state.userProfiles.findIndex((p) => p.id === this.state.viewerId);
    if (idx < 0) {
      return null;
    }
    const cur = this.state.userProfiles[idx];
    const hobbies = Array.isArray(payload.hobbies) ? payload.hobbies : cur.hobbies || [];
    const thirdPlaces = Array.isArray(payload.thirdPlaces) ? payload.thirdPlaces : cur.thirdPlaces || [];
    const quickChoiceAnswers =
      payload.quickChoiceAnswers && typeof payload.quickChoiceAnswers === "object"
        ? { ...(cur.onboardingHints || {}), ...payload.quickChoiceAnswers }
        : cur.onboardingHints || {};

    this.state.userProfiles[idx] = {
      ...cur,
      hobbies,
      thirdPlaces,
      interests: Array.isArray(payload.interests) ? payload.interests : cur.interests,
      willingToAttendMore:
        payload.willingToAttendMore != null ? Number(payload.willingToAttendMore) : cur.willingToAttendMore,
      onboardingHints: quickChoiceAnswers
    };
    await this.persistState();
    return this.getProfile(this.state.viewerId);
  }

  async addViewerErrand(payload) {
    await this.ensureReady();
    const preset = (this.state.errandPresets || []).find((p) => p.id === payload.presetId);
    const errandKey = payload.errandKey || preset?.errandKey || "custom";
    const label =
      payload.customLabel?.trim() ||
      preset?.label ||
      `${errandKey} errand`;
    const center = getDefaultCenter(this.state);
    const lat = Number(payload.lat ?? center.lat);
    const lng = Number(payload.lng ?? center.lng);
    const windowMinutes = Math.min(120, Math.max(10, Number(payload.windowMinutes || 25)));
    const windowStart = new Date().toISOString();
    const windowEnd = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();

    const errand = {
      id: randomUUID(),
      userId: this.state.viewerId,
      label,
      errandKey,
      lat,
      lng,
      openToTagAlong: Boolean(payload.openToTagAlong),
      windowStart,
      windowEnd,
      createdAt: new Date().toISOString()
    };

    if (!this.state.viewerErrands) {
      this.state.viewerErrands = [];
    }
    this.state.viewerErrands.push(errand);

    const halfWindowMs = Math.round((windowMinutes / 2) * 60 * 1000);
    const syncVisibleMs = Math.min(30 * 60 * 1000, Math.max(60 * 1000, halfWindowMs));

    let errandSync = null;
    for (const post of this.state.activeIntentions) {
      if (post.status !== "open" || post.creatorId === this.state.viewerId) {
        continue;
      }
      const profile = this.getProfile(post.creatorId);
      if (this.detectErrandOverlapWithNeighbor(post.creatorId)) {
        const msg = `${profile?.firstName || "Someone"} has a similar run near ${post.localSpotName} — open to tag along?`;
        this.publishUpdate({
          kind: "sync",
          message: msg,
          timestamp: new Date().toISOString(),
          visibleMs: syncVisibleMs
        });
        errandSync = { message: msg, visibleMs: syncVisibleMs };
        break;
      }
    }

    await this.persistState();
    return { errand, heatZones: this.getHeatZones(), errandSync };
  }

  async submitRecommendationFeedback(payload) {
    await this.ensureReady();
    const idx = this.state.userProfiles.findIndex((p) => p.id === this.state.viewerId);
    if (idx < 0) {
      return null;
    }
    const cur = this.state.userProfiles[idx];
    const helpful = Boolean(payload.helpful);
    const prev = cur.recommendationPreferences || {};
    const venueScores = { ...(prev.venueScores || {}) };
    const tagHits = { ...(prev.tagHits || {}) };
    let netScore = Number(prev.netScore || 0);

    if (payload.venueLabel) {
      const k = String(payload.venueLabel);
      venueScores[k] = (venueScores[k] || 0) + (helpful ? 0.12 : -0.08);
      venueScores[k] = Math.max(-1, Math.min(1.5, venueScores[k]));
    }

    const title = payload.title ? String(payload.title) : "";
    if (title) {
      for (const w of tokenizeTitle(title)) {
        tagHits[w] = (tagHits[w] || 0) + (helpful ? 0.06 : -0.04);
        tagHits[w] = Math.max(-0.5, Math.min(1, tagHits[w]));
      }
    }

    netScore += helpful ? 1 : -1;
    netScore = Math.max(-12, Math.min(16, netScore));

    this.state.userProfiles[idx] = {
      ...cur,
      recommendationPreferences: {
        venueScores,
        tagHits,
        netScore
      }
    };
    await this.persistState();
    return this.getProfile(this.state.viewerId);
  }

  async toggleEventInterest(eventId) {
    await this.ensureReady();
    const event = (this.state.nearbyEvents || []).find((e) => e.id === eventId);
    if (!event) {
      return null;
    }
    if (!event.interestedUserIds) {
      event.interestedUserIds = [];
    }
    const vid = this.state.viewerId;
    const i = event.interestedUserIds.indexOf(vid);
    if (i >= 0) {
      event.interestedUserIds.splice(i, 1);
    } else {
      event.interestedUserIds.push(vid);
      this.publishUpdate({
        kind: "event",
        message: `You're in for ${event.title}. Others who opted in will match you higher.`,
        timestamp: new Date().toISOString(),
        visibleMs: 10000
      });
    }
    await this.persistState();
    return this.getPublicEvents();
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
