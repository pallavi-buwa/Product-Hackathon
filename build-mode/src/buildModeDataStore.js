import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    routineLogs: cloneJson(seed.routineLogs || []),
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
    nearbyEvents: (seed.nearbyEvents || []).map((item) => ({
      ...cloneJson(item),
      startsAt: item.startsAt || isoMinutesFrom(now, Number(item.startsOffsetMinutes ?? 300)),
      startsOffsetMinutes: undefined
    })),
    hobbyOptions: cloneJson(seed.hobbyOptions || []),
    quickChoices: cloneJson(seed.quickChoices || []),
    pillarGuide: cloneJson(seed.pillarGuide || {}),
    viewerErrands: [],
    eventInterests: []
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
    eventInterests: cloneJson(state.eventInterests || [])
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
      interestedUserIds: rt?.interestedUserIds ?? e.interestedUserIds ?? []
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
      viewerErrands: rt.viewerErrands || [],
      eventInterests: rt.eventInterests || []
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
