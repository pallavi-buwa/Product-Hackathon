import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoViewerRoutineLogs } from "./socialHealthScore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultSeedPath = path.resolve(__dirname, "../data/build-mode.seed.json");
const defaultRuntimePath = path.resolve(__dirname, "../data/build-mode.runtime.json");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isoMinutesFrom(baseDate, minutes) {
  return new Date(baseDate.getTime() + minutes * 60 * 1000).toISOString();
}

function materializeSeed(seed, now = new Date()) {
  const nearbyEvents = (seed.nearbyEvents || []).map((item) => ({
    ...cloneJson(item),
    startsAt: item.startsAt || isoMinutesFrom(now, Number(item.startsOffsetMinutes ?? 300)),
    startsOffsetMinutes: undefined
  }));
  const startsByEventId = Object.fromEntries(nearbyEvents.map((e) => [e.id, e.startsAt]));

  const eventRsvpRequests = (seed.eventRsvpRequests || []).map((item) => {
    const row = cloneJson(item);
    const offs = Number(row.createdOffsetMinutes);
    row.createdAt =
      row.createdAt || (Number.isFinite(offs) ? isoMinutesFrom(now, offs) : now.toISOString());
    delete row.createdOffsetMinutes;
    const startsAt = startsByEventId[row.eventId];
    const ts = startsAt ? new Date(startsAt).getTime() : now.getTime();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    row.visibleToHostAfter =
      row.revealPolicy === "last2days" ? new Date(ts - twoDays).toISOString() : row.createdAt;
    row.status = row.status || "pending";
    row.revealPolicy = row.revealPolicy === "last2days" ? "last2days" : "always";
    return row;
  });

  const intentionStartsById = Object.fromEntries(
    (seed.activeIntentions || []).map((item) => {
      const st = item.startTime || isoMinutesFrom(now, Number(item.startOffsetMinutes || 0));
      return [item.id, st];
    })
  );

  const postRsvpRequests = (seed.postRsvpRequests || []).map((item) => {
    const row = cloneJson(item);
    const offs = Number(row.createdOffsetMinutes);
    row.createdAt =
      row.createdAt || (Number.isFinite(offs) ? isoMinutesFrom(now, offs) : now.toISOString());
    delete row.createdOffsetMinutes;
    const startsAt = intentionStartsById[row.postId];
    const ts = startsAt ? new Date(startsAt).getTime() : now.getTime();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    row.visibleToHostAfter =
      row.revealPolicy === "last2days" ? new Date(ts - twoDays).toISOString() : row.createdAt;
    row.status = row.status || "pending";
    row.revealPolicy = row.revealPolicy === "last2days" ? "last2days" : "always";
    const post = (seed.activeIntentions || []).find((p) => p.id === row.postId);
    row.hostId = post?.creatorId || row.hostId || null;
    return row;
  });

  return {
    brand: cloneJson(seed.brand || {}),
    globeSignals: cloneJson(seed.globeSignals || []),
    viewport: cloneJson(seed.viewport || {}),
    mapPlaces: cloneJson(seed.mapPlaces || []),
    routineTypeOptions: cloneJson(seed.routineTypeOptions || []),
    composerDefaults: cloneJson(seed.composerDefaults || {}),
    viewerId: seed.viewerId || null,
    userProfiles: cloneJson(seed.userProfiles || []),
    userRoutines: cloneJson(seed.userRoutines || []),
    routineLogs: (() => {
      const vid = seed.viewerId || "viewer";
      const others = (seed.routineLogs || []).filter((l) => l.userId !== vid);
      return [...others, ...buildDemoViewerRoutineLogs(now, vid)];
    })(),
    activeIntentions: (seed.activeIntentions || []).map((item) => ({
      ...cloneJson(item),
      startTime: item.startTime || isoMinutesFrom(now, Number(item.startOffsetMinutes || 0)),
      createdAt:
        item.createdAt || isoMinutesFrom(now, Number(item.createdOffsetMinutes || -15)),
      startOffsetMinutes: undefined,
      createdOffsetMinutes: undefined
    })),
    updates: (seed.updates || []).map((item) => ({
      id: item.id || randomUUID(),
      kind: item.kind,
      message: item.message,
      timestamp: item.timestamp || isoMinutesFrom(now, Number(item.offsetMinutes || 0))
    })),
    errandPresets: cloneJson(seed.errandPresets || []),
    nearbyEvents,
    hobbyOptions: cloneJson(seed.hobbyOptions || []),
    quickChoices: cloneJson(seed.quickChoices || []),
    pillarGuide: cloneJson(seed.pillarGuide || {}),
    viewerErrands: (seed.viewerErrands || []).map((item) => {
      const row = cloneJson(item);
      const startOff = Number(row.windowStartOffsetMinutes);
      const endOff = Number(row.windowEndOffsetMinutes);
      if (!row.windowStart && Number.isFinite(startOff)) {
        row.windowStart = isoMinutesFrom(now, startOff);
      }
      if (!row.windowEnd && Number.isFinite(endOff)) {
        row.windowEnd = isoMinutesFrom(now, endOff);
      }
      delete row.windowStartOffsetMinutes;
      delete row.windowEndOffsetMinutes;
      return {
        id: row.id || randomUUID(),
        userId: row.userId || seed.viewerId || "viewer",
        label: row.label || "Errand",
        errandKey: row.errandKey || "custom",
        lat: Number(row.lat),
        lng: Number(row.lng),
        openToTagAlong: Boolean(row.openToTagAlong),
        windowStart: row.windowStart || isoMinutesFrom(now, -10),
        windowEnd: row.windowEnd || isoMinutesFrom(now, 35),
        createdAt: row.createdAt || now.toISOString()
      };
    }),
    eventInterests: cloneJson(seed.eventInterests || []),
    ritualBonds: (seed.ritualBonds || []).map((item) => {
      const row = cloneJson(item);
      const days = Number(row.lastSharedAtOffsetDays);
      if (!row.lastSharedAt && Number.isFinite(days)) {
        row.lastSharedAt = isoMinutesFrom(now, -days * 24 * 60);
      }
      if (!row.lastSharedAt) {
        row.lastSharedAt = isoMinutesFrom(now, -4 * 24 * 60);
      }
      delete row.lastSharedAtOffsetDays;
      return row;
    }),
    repeatTemplates: cloneJson(seed.repeatTemplates || []),
    workspaceFunFacts: cloneJson(seed.workspaceFunFacts || []),
    neighborErrandLogs: (seed.neighborErrandLogs || []).map((item) => {
      const row = cloneJson(item);
      const hours = Number(row.offsetHours);
      row.loggedAt =
        row.loggedAt ||
        (Number.isFinite(hours) ? isoMinutesFrom(now, -hours * 60) : isoMinutesFrom(now, -12 * 60));
      delete row.offsetHours;
      return row;
    }),
    eventRsvpRequests,
    postRsvpRequests
  };
}

function sanitizeState(state) {
  return {
    brand: cloneJson(state.brand || {}),
    globeSignals: cloneJson(state.globeSignals || []),
    viewport: cloneJson(state.viewport || {}),
    mapPlaces: cloneJson(state.mapPlaces || []),
    routineTypeOptions: cloneJson(state.routineTypeOptions || []),
    composerDefaults: cloneJson(state.composerDefaults || {}),
    viewerId: state.viewerId || null,
    userProfiles: cloneJson(state.userProfiles || []),
    userRoutines: cloneJson(state.userRoutines || []),
    routineLogs: cloneJson(state.routineLogs || []),
    activeIntentions: cloneJson(state.activeIntentions || []),
    updates: cloneJson(state.updates || []),
    errandPresets: cloneJson(state.errandPresets || []),
    nearbyEvents: cloneJson(state.nearbyEvents || []),
    hobbyOptions: cloneJson(state.hobbyOptions || []),
    quickChoices: cloneJson(state.quickChoices || []),
    pillarGuide: cloneJson(state.pillarGuide || {}),
    viewerErrands: cloneJson(state.viewerErrands || []),
    eventInterests: cloneJson(state.eventInterests || []),
    ritualBonds: cloneJson(state.ritualBonds || []),
    repeatTemplates: cloneJson(state.repeatTemplates || []),
    workspaceFunFacts: cloneJson(state.workspaceFunFacts || []),
    neighborErrandLogs: cloneJson(state.neighborErrandLogs || []),
    eventRsvpRequests: cloneJson(state.eventRsvpRequests || []),
    postRsvpRequests: cloneJson(state.postRsvpRequests || [])
  };
}

function mergeUserProfiles(seedList, runtimeList) {
  const byId = Object.fromEntries((runtimeList || []).map((p) => [p.id, p]));
  return (seedList || []).map((p) => ({ ...cloneJson(p), ...(byId[p.id] || {}) }));
}

function mergeNearbyEvents(seedEvents, runtimeEvents) {
  const rtById = Object.fromEntries((runtimeEvents || []).map((e) => [e.id, e]));
  return (seedEvents || []).map((e) => {
    const rt = rtById[e.id];
    return {
      ...cloneJson(e),
      interestedUserIds: rt?.interestedUserIds ?? e.interestedUserIds ?? [],
      hostId: rt?.hostId ?? e.hostId,
      startsAt: rt?.startsAt ?? e.startsAt
    };
  });
}

export class BuildModeDataStore {
  constructor({
    seedPath = defaultSeedPath,
    runtimePath = defaultRuntimePath
  } = {}) {
    this.seedPath = seedPath;
    this.runtimePath = runtimePath;
  }

  async loadState() {
    const seedContent = await readFile(this.seedPath, "utf-8");
    const seed = materializeSeed(JSON.parse(seedContent));

    if (!existsSync(this.runtimePath)) {
      return seed;
    }

    const runtime = JSON.parse(await readFile(this.runtimePath, "utf-8"));
    const rt = sanitizeState(runtime);

    return {
      ...seed,
      ...rt,
      globeSignals: seed.globeSignals?.length ? seed.globeSignals : rt.globeSignals,
      errandPresets: seed.errandPresets?.length ? seed.errandPresets : rt.errandPresets,
      hobbyOptions: seed.hobbyOptions?.length ? seed.hobbyOptions : rt.hobbyOptions,
      quickChoices: seed.quickChoices?.length ? seed.quickChoices : rt.quickChoices,
      pillarGuide: Object.keys(seed.pillarGuide || {}).length ? seed.pillarGuide : rt.pillarGuide,
      nearbyEvents: mergeNearbyEvents(seed.nearbyEvents, rt.nearbyEvents),
      userProfiles: mergeUserProfiles(seed.userProfiles, rt.userProfiles),
      viewerErrands:
        rt.viewerErrands !== undefined && rt.viewerErrands !== null
          ? rt.viewerErrands
          : seed.viewerErrands,
      eventInterests:
        rt.eventInterests !== undefined && rt.eventInterests !== null
          ? rt.eventInterests
          : seed.eventInterests,
      ritualBonds:
        Array.isArray(rt.ritualBonds) && rt.ritualBonds.length > 0 ? rt.ritualBonds : seed.ritualBonds,
      repeatTemplates: seed.repeatTemplates?.length ? seed.repeatTemplates : rt.repeatTemplates || [],
      workspaceFunFacts: seed.workspaceFunFacts?.length ? seed.workspaceFunFacts : rt.workspaceFunFacts || [],
      neighborErrandLogs:
        Array.isArray(rt.neighborErrandLogs) && rt.neighborErrandLogs.length > 0
          ? rt.neighborErrandLogs
          : seed.neighborErrandLogs,
      eventRsvpRequests:
        Array.isArray(rt.eventRsvpRequests) && rt.eventRsvpRequests.length > 0
          ? rt.eventRsvpRequests
          : seed.eventRsvpRequests,
      postRsvpRequests:
        Array.isArray(rt.postRsvpRequests) && rt.postRsvpRequests.length > 0
          ? rt.postRsvpRequests
          : seed.postRsvpRequests,
      routineLogs: (() => {
        const vid = seed.viewerId || "viewer";
        const base =
          Array.isArray(rt.routineLogs) && rt.routineLogs.length > 0 ? rt.routineLogs : seed.routineLogs;
        const others = (base || []).filter((l) => l.userId !== vid);
        return [...others, ...buildDemoViewerRoutineLogs(new Date(), vid)];
      })()
    };
  }

  async saveState(state) {
    await mkdir(path.dirname(this.runtimePath), { recursive: true });
    await writeFile(
      this.runtimePath,
      JSON.stringify(sanitizeState(state), null, 2),
      "utf-8"
    );
  }
}
