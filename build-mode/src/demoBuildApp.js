import { randomUUID } from "node:crypto";
import { createBuildModePlan } from "./buildModeService.js";
import { BuildModeDataStore } from "./buildModeDataStore.js";
import { analyzeRoutineEntropy } from "./entropy.js";
import { haversineMiles } from "./geo.js";
import { computeHeatZones } from "./heatMapCompute.js";
import {
  createOpenAIInvitationSynthesizer,
  createTemplateInvitationSynthesizer
} from "./invitationSynthesizer.js";
import {
  computePillarScores,
  matchHighlightTemplate,
  maybeMatchHighlightLine
} from "./pillarScoring.js";
import { lodgeConciergeReply } from "./lodgeConciergeChat.js";
import { InMemoryBuildModeRepository } from "./repositories/inMemoryBuildModeRepository.js";
import {
  createOpenAIRitualBlueprintGenerator,
  createTemplateRitualBlueprintGenerator
} from "./ritualBlueprint.js";
import {
  buildSilentBridgeMessage,
  createOpenAISilentBridgeMessageBuilder
} from "./silentBridge.js";
import { computeSocialHeatZones } from "./livingMapHeat.js";
import { computeSocialHealthMetrics } from "./socialHealthScore.js";
import {
  buildTemplateSocialHealthNarrative,
  createOpenAISocialHealthNarrativeBuilder
} from "./socialHealthNarrative.js";

function createDemoAiStack() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const templateInvite = createTemplateInvitationSynthesizer();
  const templateBlueprint = createTemplateRitualBlueprintGenerator();

  const templateSocialHealth = async (ctx) =>
    buildTemplateSocialHealthNarrative(ctx.metrics, ctx.viewerProfile);

  if (!apiKey) {
    return {
      invitationSynthesizer: templateInvite,
      blueprintGenerator: templateBlueprint,
      silentBridgeMessageBuilder: buildSilentBridgeMessage,
      socialHealthNarrativeBuilder: templateSocialHealth,
      generationMode: "template"
    };
  }

  const openAiInvite = createOpenAIInvitationSynthesizer({ apiKey });
  const openAiBlueprint = createOpenAIRitualBlueprintGenerator({ apiKey });
  const openAiSilentBridge = createOpenAISilentBridgeMessageBuilder({ apiKey });
  const openAiSocialHealth = createOpenAISocialHealthNarrativeBuilder({ apiKey });

  return {
    invitationSynthesizer: {
      async generateInvitation(args) {
        try {
          return await openAiInvite.generateInvitation(args);
        } catch (err) {
          console.warn("[lodge-build] invitation AI fallback:", err.message);
          return templateInvite.generateInvitation(args);
        }
      }
    },
    blueprintGenerator: {
      async generateBlueprint(args) {
        try {
          return await openAiBlueprint.generateBlueprint(args);
        } catch (err) {
          console.warn("[lodge-build] blueprint AI fallback:", err.message);
          return templateBlueprint.generateBlueprint(args);
        }
      }
    },
    silentBridgeMessageBuilder: async (ctx) => {
      try {
        return await openAiSilentBridge(ctx);
      } catch (err) {
        console.warn("[lodge-build] silent bridge AI fallback:", err.message);
        return buildSilentBridgeMessage(ctx);
      }
    },
    socialHealthNarrativeBuilder: async (ctx) => {
      try {
        return await openAiSocialHealth(ctx);
      } catch (err) {
        console.warn("[lodge-build] social health narrative AI fallback:", err.message);
        return buildTemplateSocialHealthNarrative(ctx.metrics, ctx.viewerProfile);
      }
    },
    generationMode: "openai"
  };
}

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

function stablePravatarImg(id) {
  const s = String(id || "anon");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i) || 0;
  }
  return (Math.abs(h) % 70) + 1;
}

function displayAvatarForProfile(profile) {
  if (profile?.avatarUrl) {
    return profile.avatarUrl;
  }
  const id = profile?.id || profile?.firstName || "neighbor";
  return `https://i.pravatar.cc/96?img=${stablePravatarImg(id)}`;
}

function bondWithNeighbor(ritualBonds, neighborId) {
  return (ritualBonds || []).find((b) => b.neighborId === neighborId) || null;
}

function toPostSummary({ post, profile, center, ritualBonds }) {
  const distanceMiles = center ? haversineMiles(center, post.startLocation) : null;
  const bond = bondWithNeighbor(ritualBonds, post.creatorId);

  return {
    id: post.id,
    creatorId: post.creatorId,
    creatorName: profile?.firstName || "Someone",
    creatorOriginNote: profile?.originNote || null,
    creatorAvatarUrl: displayAvatarForProfile(profile),
    creatorFunFact: profile?.funFact || null,
    bondBlurb:
      bond &&
      `You've linked up ${bond.timesTogether}x — last "${bond.lastSharedLabel}" at ${bond.lastSpotName || "a favorite corner"}`,
    repeatCadenceNote: post.repeatCadenceNote || null,
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
    const ai = createDemoAiStack();
    this.invitationSynthesizer = ai.invitationSynthesizer;
    this.blueprintGenerator = ai.blueprintGenerator;
    this.silentBridgeMessageBuilder = ai.silentBridgeMessageBuilder;
    this.socialHealthNarrativeBuilder = ai.socialHealthNarrativeBuilder;
    this.generationMode = ai.generationMode;
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
      eventInterests: loadedState.eventInterests || [],
      ritualBonds: loadedState.ritualBonds || [],
      repeatTemplates: loadedState.repeatTemplates || [],
      workspaceFunFacts: loadedState.workspaceFunFacts || [],
      neighborErrandLogs: loadedState.neighborErrandLogs || [],
      eventRsvpRequests: loadedState.eventRsvpRequests || [],
      postRsvpRequests: loadedState.postRsvpRequests || []
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

    const { matches } = await this.getNeighborMatches();

    const socialHeatZones = computeSocialHeatZones({
      mapPlaces: this.state.mapPlaces,
      userRoutines: this.state.userRoutines
    });

    const socialHealthMetrics = computeSocialHealthMetrics({
      viewerId: this.state.viewerId,
      routineLogs: this.state.routineLogs,
      now: new Date()
    });
    const socialHealthNarrative = await this.socialHealthNarrativeBuilder({
      metrics: socialHealthMetrics,
      viewerProfile: this.getProfile(this.state.viewerId)
    });

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
      pillarGuide: this.state.pillarGuide || {},
      ritualBonds: this.getRitualBondsForViewer(),
      repeatTemplates: this.state.repeatTemplates || [],
      workspaceFunFacts: this.state.workspaceFunFacts || [],
      neighborContactsById: this.buildNeighborContactsMap(matches || []),
      viewerActivity: this.getViewerActivity(),
      rsvpInbox: this.getHostRsvpInbox(),
      livingMap: {
        heatZones: socialHeatZones,
        generationMode: this.generationMode,
        copy: {
          heatTitle: "Social heat zones",
          heatBody:
            "Warm glows show where three or more compatible neighbors cluster around a public anchor — vibe, not pins.",
          opportunityTitle: "Opportunity %",
          opportunityBody:
            "Not a dating score. It is compatibility-of-moment: activity overlap, social velocity, shared anchors, and routine entropy."
        }
      },
      privateSocialHealth: {
        neverShared: true,
        generationMode: this.generationMode,
        metrics: socialHealthMetrics,
        narrative: socialHealthNarrative
      }
    };
  }

  getHostRsvpInbox() {
    const vid = this.state.viewerId;
    const now = Date.now();
    const visible = (r) => now >= new Date(r.visibleToHostAfter || 0).getTime();

    const eventRows = (this.state.eventRsvpRequests || [])
      .filter((r) => {
        if (r.status !== "pending") {
          return false;
        }
        const ev = (this.state.nearbyEvents || []).find((e) => e.id === r.eventId);
        if (!ev || ev.hostId !== vid) {
          return false;
        }
        return visible(r);
      })
      .map((r) => {
        const ev = (this.state.nearbyEvents || []).find((e) => e.id === r.eventId);
        const g = this.getProfile(r.guestId);
        return {
          id: r.id,
          kind: "event",
          eventId: r.eventId,
          eventTitle: ev?.title || "Event",
          guestId: r.guestId,
          guestName: g?.firstName || "Someone",
          revealPolicy: r.revealPolicy,
          createdAt: r.createdAt
        };
      });

    const ritualRows = (this.state.postRsvpRequests || [])
      .filter((r) => {
        if (r.status !== "pending") {
          return false;
        }
        const post = this.state.activeIntentions.find((p) => p.id === r.postId);
        if (!post || post.creatorId !== vid) {
          return false;
        }
        return visible(r);
      })
      .map((r) => {
        const post = this.state.activeIntentions.find((p) => p.id === r.postId);
        const g = this.getProfile(r.guestId);
        return {
          id: r.id,
          kind: "ritual",
          postId: r.postId,
          eventTitle: post?.label || "Open ritual",
          guestId: r.guestId,
          guestName: g?.firstName || "Someone",
          revealPolicy: r.revealPolicy,
          createdAt: r.createdAt
        };
      });

    return [...eventRows, ...ritualRows].sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
  }

  async requestEventRsvp(eventId, { revealPolicy = "always" } = {}) {
    await this.ensureReady();
    const event = (this.state.nearbyEvents || []).find((e) => e.id === eventId);
    if (!event) {
      return null;
    }
    const dup = (this.state.eventRsvpRequests || []).find(
      (r) => r.eventId === eventId && r.guestId === this.state.viewerId && r.status === "pending"
    );
    if (dup) {
      return { events: this.getPublicEvents(), inbox: this.getHostRsvpInbox(), duplicate: true };
    }
    const starts = new Date(event.startsAt).getTime();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    const policy = revealPolicy === "last2days" ? "last2days" : "always";
    const createdAt = new Date().toISOString();
    const visibleToHostAfter =
      policy === "last2days" ? new Date(starts - twoDays).toISOString() : createdAt;
    const req = {
      id: randomUUID(),
      eventId,
      guestId: this.state.viewerId,
      status: "pending",
      revealPolicy: policy,
      createdAt,
      visibleToHostAfter
    };
    if (!this.state.eventRsvpRequests) {
      this.state.eventRsvpRequests = [];
    }
    this.state.eventRsvpRequests.push(req);
    await this.persistState();
    return { events: this.getPublicEvents(), inbox: this.getHostRsvpInbox() };
  }

  async respondToRsvp(requestId, accept) {
    await this.ensureReady();
    let req = (this.state.eventRsvpRequests || []).find((r) => r.id === requestId);
    if (req && req.status === "pending") {
      const event = (this.state.nearbyEvents || []).find((e) => e.id === req.eventId);
      if (!event || event.hostId !== this.state.viewerId) {
        return null;
      }
      req.status = accept ? "accepted" : "rejected";
      req.respondedAt = new Date().toISOString();
      if (accept) {
        if (!event.interestedUserIds) {
          event.interestedUserIds = [];
        }
        if (!event.interestedUserIds.includes(req.guestId)) {
          event.interestedUserIds.push(req.guestId);
        }
      }
      await this.persistState();
      return { events: this.getPublicEvents(), inbox: this.getHostRsvpInbox() };
    }

    req = (this.state.postRsvpRequests || []).find((r) => r.id === requestId);
    if (!req || req.status !== "pending") {
      return null;
    }
    const post = this.state.activeIntentions.find((p) => p.id === req.postId);
    if (!post || post.creatorId !== this.state.viewerId) {
      return null;
    }
    req.status = accept ? "accepted" : "rejected";
    req.respondedAt = new Date().toISOString();
    if (accept) {
      if (!post.rsvpAcceptedUserIds) {
        post.rsvpAcceptedUserIds = [];
      }
      if (!post.rsvpAcceptedUserIds.includes(req.guestId)) {
        post.rsvpAcceptedUserIds.push(req.guestId);
      }
    }
    await this.persistState();
    return { events: this.getPublicEvents(), inbox: this.getHostRsvpInbox() };
  }

  async requestPostRsvp(postId, { revealPolicy = "always" } = {}) {
    await this.ensureReady();
    const post = this.state.activeIntentions.find((p) => p.id === postId && p.status === "open");
    if (!post) {
      return null;
    }
    if (post.creatorId === this.state.viewerId) {
      return null;
    }
    const dup = (this.state.postRsvpRequests || []).find(
      (r) => r.postId === postId && r.guestId === this.state.viewerId && r.status === "pending"
    );
    if (dup) {
      return { inbox: this.getHostRsvpInbox(), duplicate: true };
    }
    const starts = new Date(post.startTime).getTime();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    const policy = revealPolicy === "last2days" ? "last2days" : "always";
    const createdAt = new Date().toISOString();
    const visibleToHostAfter =
      policy === "last2days" ? new Date(starts - twoDays).toISOString() : createdAt;
    const row = {
      id: randomUUID(),
      postId,
      hostId: post.creatorId,
      guestId: this.state.viewerId,
      status: "pending",
      revealPolicy: policy,
      createdAt,
      visibleToHostAfter
    };
    if (!this.state.postRsvpRequests) {
      this.state.postRsvpRequests = [];
    }
    this.state.postRsvpRequests.push(row);
    await this.persistState();
    return { inbox: this.getHostRsvpInbox(), duplicate: false };
  }

  async lodgeChat(messages) {
    const key = process.env.OPENAI_API_KEY?.trim();
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const baseUrl = process.env.OPENAI_BASE_URL;
    const last = messages?.length ? messages[messages.length - 1] : null;
    if (!last || last.role !== "user") {
      return { reply: null, error: "no_user_message" };
    }
    const history = messages.slice(0, -1);
    const { text, error } = await lodgeConciergeReply({
      userMessage: last.content,
      history,
      apiKey: key,
      model,
      baseUrl
    });
    return { reply: text, error: key ? error : "missing_key" };
  }

  buildNeighborContactsMap(matches) {
    const byFit = Object.fromEntries((matches || []).map((m) => [m.neighborId, m.percent]));
    const viewerId = this.state.viewerId;
    const logs = this.state.neighborErrandLogs || [];
    const out = {};

    for (const p of this.state.userProfiles) {
      const id = p.id;
      const fit = byFit[id];
      const open = this.state.activeIntentions.find((i) => i.creatorId === id && i.status === "open");
      const routines = this.state.userRoutines.filter((r) => r.userId === id).slice(0, 4);
      const errands =
        id === viewerId
          ? (this.state.viewerErrands || []).map((e) => ({
            id: e.id,
            label: e.label,
            errandKey: e.errandKey,
            loggedAt: e.windowStart || e.createdAt
          }))
          : logs.filter((l) => l.userId === id);

      out[id] = {
        userId: id,
        firstName: p.firstName || "Someone",
        avatarUrl: displayAvatarForProfile(p),
        funFact: p.funFact || null,
        fitPercent: id === viewerId ? null : (typeof fit === "number" ? fit : null),
        fitLine:
          id === viewerId
            ? "You"
            : typeof fit === "number"
              ? `${fit}% fit with your profile`
              : "Save profile signals to see fit scores.",
        openRitual: open
          ? {
            label: open.label,
            localSpotName: open.localSpotName,
            startTimeLabel: startTimeLabel(open.startTime)
          }
          : null,
        errands: errands.map((e) => ({
          id: e.id,
          label: e.label,
          errandKey: e.errandKey,
          loggedAt: e.loggedAt
        })),
        routineHints: routines.map((r) => r.label)
      };
    }

    return out;
  }

  getViewerActivity() {
    const vid = this.state.viewerId;
    const openPosts = this.state.activeIntentions
      .filter((p) => p.creatorId === vid && p.status === "open")
      .map((p) => ({
        id: p.id,
        label: p.label,
        localSpotName: p.localSpotName,
        startTimeLabel: startTimeLabel(p.startTime)
      }));
    const errands = (this.state.viewerErrands || [])
      .filter((e) => e.userId === vid)
      .map((e) => ({
        id: e.id,
        label: e.label,
        errandKey: e.errandKey,
        windowStart: e.windowStart,
        windowEnd: e.windowEnd,
        openToTagAlong: Boolean(e.openToTagAlong)
      }))
      .sort((a, b) => new Date(b.windowStart).getTime() - new Date(a.windowStart).getTime());

    return { openPosts, errands };
  }

  async toggleActivityFavorite(payload) {
    await this.ensureReady();
    const idx = this.state.userProfiles.findIndex((p) => p.id === this.state.viewerId);
    if (idx < 0) {
      return null;
    }
    const cur = this.state.userProfiles[idx];
    const prev = Array.isArray(cur.activityFavorites) ? [...cur.activityFavorites] : [];
    const entry = payload?.entry;
    if (!entry || !entry.id) {
      return null;
    }
    const exists = prev.findIndex((f) => f.id === entry.id);
    let next;
    if (exists >= 0) {
      next = prev.filter((_, i) => i !== exists);
    } else {
      next = [...prev, { ...entry, savedAt: new Date().toISOString() }].slice(0, 24);
    }
    this.state.userProfiles[idx] = {
      ...cur,
      activityFavorites: next
    };
    await this.persistState();
    return this.getProfile(this.state.viewerId);
  }

  getRitualBondsForViewer() {
    return (this.state.ritualBonds || []).map((b) => {
      const p = this.getProfile(b.neighborId);
      return {
        neighborId: b.neighborId,
        firstName: p?.firstName || "Neighbor",
        timesTogether: b.timesTogether,
        lastSharedLabel: b.lastSharedLabel,
        lastSpotName: b.lastSpotName || null,
        lastSharedAt: b.lastSharedAt,
        avatarUrl: displayAvatarForProfile(p),
        funFact: p?.funFact || null
      };
    });
  }

  getHeatZones() {
    return computeHeatZones({
      mapPlaces: this.state.mapPlaces,
      userRoutines: this.state.userRoutines,
      activeIntentions: this.state.activeIntentions,
      viewerErrands: this.state.viewerErrands || [],
      /** Demo-friendly: orange “glow” with 2+ distinct people (prod may use 3+). */
      minNeighborsForGlow: 2
    });
  }

  getPublicEvents() {
    const viewer = this.getProfile(this.state.viewerId);
    const prefs = viewer?.recommendationPreferences || { venueScores: {}, tagHits: {}, netScore: 0 };
    const raw = [...(this.state.nearbyEvents || [])];
    raw.sort(
      (a, b) => eventPersonalizationScore(b, prefs) - eventPersonalizationScore(a, prefs)
    );
    const vid = this.state.viewerId;
    const rsvps = this.state.eventRsvpRequests || [];
    return raw.map((e) => {
      const mine = rsvps.filter((r) => r.eventId === e.id && r.guestId === vid);
      const latest = mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      let yourRsvp = "none";
      if (latest) {
        yourRsvp = latest.status === "pending" ? "pending" : latest.status;
      }
      return {
        id: e.id,
        title: e.title,
        venueLabel: e.venueLabel,
        lat: e.lat,
        lng: e.lng,
        startsAt: e.startsAt,
        hostId: e.hostId || null,
        youAreHost: e.hostId === vid,
        interestCount: (e.interestedUserIds || []).length,
        youAreInterested: (e.interestedUserIds || []).includes(vid),
        yourRsvp
      };
    });
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
      const neighborProfile = this.getProfile(top.neighborId);
      const line = `${top.firstName} · ${top.percent}% fit with your profile`;
      highlight = {
        neighborId: top.neighborId,
        firstName: top.firstName,
        percent: top.percent,
        postId: openPost?.id ?? null,
        overlappingErrand: top.overlappingErrand,
        line,
        fitLine: line,
        avatarUrl: displayAvatarForProfile(neighborProfile)
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
    return {
      errand,
      heatZones: this.getHeatZones(),
      errandSync,
      viewerActivity: this.getViewerActivity()
    };
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

    const vid = this.state.viewerId;
    const rsvps = this.state.postRsvpRequests || [];
    return this.state.activeIntentions
      .filter((post) => post.status === "open" && withinBounds(post.startLocation, viewport.bounds))
      .map((post) => {
        const summary = toPostSummary({
          post,
          profile: this.getProfile(post.creatorId),
          center: viewport.center,
          ritualBonds: this.state.ritualBonds
        });
        const mine = rsvps.filter((r) => r.postId === post.id && r.guestId === vid);
        const latest = mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        let yourRsvp = "none";
        if (latest) {
          yourRsvp = latest.status === "pending" ? "pending" : latest.status;
        }
        return {
          ...summary,
          hostId: post.creatorId,
          youAreHost: post.creatorId === vid,
          yourRsvp
        };
      })
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
      center: getDefaultCenter(this.state),
      ritualBonds: this.state.ritualBonds
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
      silentBridgeMessageBuilder: this.silentBridgeMessageBuilder,
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
        center: defaultCenter,
        ritualBonds: this.state.ritualBonds
      }),
      plan,
      viewerActivity: this.getViewerActivity()
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
