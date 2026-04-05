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
    }))
  };
}

function sanitizeState(state) {
  return {
    brand: cloneJson(state.brand || {}),
    viewport: cloneJson(state.viewport || {}),
    mapPlaces: cloneJson(state.mapPlaces || []),
    routineTypeOptions: cloneJson(state.routineTypeOptions || []),
    composerDefaults: cloneJson(state.composerDefaults || {}),
    viewerId: state.viewerId || null,
    userProfiles: cloneJson(state.userProfiles || []),
    userRoutines: cloneJson(state.userRoutines || []),
    routineLogs: cloneJson(state.routineLogs || []),
    activeIntentions: cloneJson(state.activeIntentions || []),
    updates: cloneJson(state.updates || [])
  };
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
    if (existsSync(this.runtimePath)) {
      const runtimeContent = await readFile(this.runtimePath, "utf-8");
      return sanitizeState(JSON.parse(runtimeContent));
    }

    const seedContent = await readFile(this.seedPath, "utf-8");
    return materializeSeed(JSON.parse(seedContent));
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
