import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoBuildModeApp } from "./demoBuildApp.js";
import { analyzeRoutines, findCombos, findWorst, weeklyInsight } from "./socialOpportunityMap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiDir = path.resolve(__dirname, "../ui");

/** Load `build-mode/.env` into `process.env` if present (no extra dependencies). */
function loadLocalEnvFile() {
  const envPath = path.join(__dirname, "../.env");
  if (!existsSync(envPath)) {
    return;
  }
  try {
    const text = readFileSync(envPath, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val.trim();
      }
    }
  } catch {
    /* ignore malformed .env */
  }
}

loadLocalEnvFile();

function getContentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  return "text/html; charset=utf-8";
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendNotFound(response) {
  sendJson(response, 404, { error: "Not found" });
}

async function serveStaticFile(response, relativePath = "index.html") {
  const safePath = relativePath === "/" ? "index.html" : relativePath.replace(/^\/+/, "");
  const filePath = path.resolve(uiDir, safePath);

  if (!filePath.startsWith(uiDir) || !existsSync(filePath)) {
    return false;
  }

  response.writeHead(200, { "Content-Type": getContentType(filePath) });
  createReadStream(filePath).pipe(response);
  return true;
}

function injectMapboxTokenIntoHtml(html) {
  const mbToken = String(process.env.MAPBOX_TOKEN || "").trim();
  const assignment = `window.__MAPBOX_TOKEN = ${JSON.stringify(mbToken)};`;
  return html.replace(/window\.__MAPBOX_TOKEN\s*=\s*[^;]*;/, assignment);
}

async function serveHtmlWithMapboxToken(response, fileName) {
  let html = await readFile(path.join(uiDir, fileName), "utf-8");
  html = injectMapboxTokenIntoHtml(html);
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function getPagePath(pathname) {
  if (pathname === "/" || pathname === "/index.html") {
    return "index.html";
  }

  if (pathname === "/build" || pathname === "/build/" || pathname === "/build.html") {
    return "build.html";
  }

  return pathname.slice(1);
}

export function createServer({ port = 3030 } = {}) {
  const baseUrl = `http://localhost:${port}`;
  const app = new DemoBuildModeApp({ baseUrl });

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, baseUrl);
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/api/bootstrap") {
        return sendJson(response, 200, await app.getBootstrap());
      }

      if (request.method === "GET" && pathname === "/api/posts") {
        return sendJson(response, 200, {
          posts: await app.listPosts(Object.fromEntries(url.searchParams.entries()))
        });
      }

      if (request.method === "GET" && pathname === "/api/live-feed") {
        await app.ensureReady();
        return sendJson(response, 200, app.getLiveFeed());
      }

      if (request.method === "GET" && pathname === "/api/stream") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
          "Cache-Control": "no-cache"
        });

        await app.ensureReady();
        const unsubscribe = app.subscribe(response);
        request.on("close", unsubscribe);
        return;
      }

      const postDetailMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
      if (request.method === "GET" && postDetailMatch) {
        const detail = await app.getPostDetail(postDetailMatch[1]);
        if (!detail) {
          return sendNotFound(response);
        }

        return sendJson(response, 200, detail);
      }

      const postPlanMatch = pathname.match(/^\/api\/posts\/([^/]+)\/plan$/);
      if (request.method === "POST" && postPlanMatch) {
        const plan = await app.getPlan(postPlanMatch[1]);
        if (!plan) {
          return sendNotFound(response);
        }

        return sendJson(response, 200, plan);
      }

      if (request.method === "POST" && pathname === "/api/posts") {
        const payload = await readJsonBody(request);
        const created = await app.createPost(payload);
        return sendJson(response, 201, created);
      }

      if (request.method === "GET" && pathname === "/api/neighbor-matches") {
        return sendJson(response, 200, await app.getNeighborMatches());
      }

      if (request.method === "POST" && pathname === "/api/viewer/onboarding") {
        const payload = await readJsonBody(request);
        const viewer = await app.updateViewerOnboarding(payload);
        return sendJson(response, 200, { viewer });
      }

      if (request.method === "POST" && pathname === "/api/viewer/errand") {
        const payload = await readJsonBody(request);
        const result = await app.addViewerErrand(payload);
        return sendJson(response, 201, result);
      }

      if (request.method === "GET" && pathname === "/api/viewer/activity") {
        await app.ensureReady();
        return sendJson(response, 200, {
          viewerActivity: app.getViewerActivity(),
          viewer: app.getProfile(app.state.viewerId)
        });
      }

      if (request.method === "POST" && pathname === "/api/viewer/activity-favorite") {
        const payload = await readJsonBody(request);
        const viewer = await app.toggleActivityFavorite(payload);
        if (!viewer) {
          return sendJson(response, 400, { error: "Could not update favorites" });
        }
        return sendJson(response, 200, { viewer });
      }

      if (request.method === "POST" && pathname === "/api/viewer/recommendation-feedback") {
        const payload = await readJsonBody(request);
        const viewer = await app.submitRecommendationFeedback(payload);
        if (!viewer) {
          return sendJson(response, 404, { error: "Viewer not found" });
        }
        return sendJson(response, 200, { viewer, events: app.getPublicEvents() });
      }

      const eventInterestMatch = pathname.match(/^\/api\/events\/([^/]+)\/interest$/);
      if (request.method === "POST" && eventInterestMatch) {
        const events = await app.toggleEventInterest(eventInterestMatch[1]);
        if (!events) {
          return sendNotFound(response);
        }
        return sendJson(response, 200, { events });
      }

      const eventRsvpMatch = pathname.match(/^\/api\/events\/([^/]+)\/rsvp$/);
      if (request.method === "POST" && eventRsvpMatch) {
        const payload = await readJsonBody(request);
        const result = await app.requestEventRsvp(eventRsvpMatch[1], {
          revealPolicy: payload?.revealPolicy
        });
        if (!result) {
          return sendNotFound(response);
        }
        return sendJson(response, 200, result);
      }

      const rsvpRespondMatch = pathname.match(/^\/api\/rsvp\/([^/]+)\/respond$/);
      if (request.method === "POST" && rsvpRespondMatch) {
        const payload = await readJsonBody(request);
        const result = await app.respondToRsvp(rsvpRespondMatch[1], Boolean(payload?.accept));
        if (!result) {
          return sendJson(response, 400, { error: "Could not update RSVP" });
        }
        return sendJson(response, 200, result);
      }

      if (request.method === "POST" && pathname === "/api/chat") {
        const payload = await readJsonBody(request);
        const out = await app.lodgeChat(payload?.messages || []);
        return sendJson(response, 200, out);
      }

      // Social Opportunity Map — cross-analyze full weekly routine
      if (request.method === "POST" && pathname === "/api/social-map") {
        const { routines, city, name: userName } = await readJsonBody(request);
        if (!routines || !Array.isArray(routines) || routines.length < 2) {
          return sendJson(response, 400, { error: "At least 2 routines required" });
        }
        const ranked = analyzeRoutines(routines);
        const combos = findCombos(ranked);
        const worst = findWorst(ranked);
        const insight = weeklyInsight(ranked);
        return sendJson(response, 200, {
          socialMap: { opportunities: ranked, combos, worst_candidate: worst, weekly_insight: insight },
          meta: { city, name: userName, analyzed: routines.length },
        });
      }

      // Inject Mapbox token into social-map page
      if (request.method === "GET" && (pathname === "/social-map" || pathname === "/social-map.html")) {
        let html = await readFile(path.join(uiDir, "social-map.html"), "utf-8");
        const mbToken = String(process.env.MAPBOX_TOKEN || "").trim();
        html = html.replace(
          /const MAPBOX_TOKEN = window\.__MAPBOX_TOKEN \|\| "";?/,
          `const MAPBOX_TOKEN = ${JSON.stringify(mbToken)};`
        );
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }

      if (request.method === "GET" && (pathname === "/build" || pathname === "/build/" || pathname === "/build.html")) {
        await serveHtmlWithMapboxToken(response, "build.html");
        return;
      }

      if (request.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        await serveHtmlWithMapboxToken(response, "index.html");
        return;
      }

      if (request.method === "GET") {
        const requestedPath = getPagePath(pathname);
        const served = await serveStaticFile(response, requestedPath);
        if (served) {
          return;
        }

        const fallbackPage = pathname.startsWith("/build")
          ? "build.html"
          : "index.html";
        await serveHtmlWithMapboxToken(response, fallbackPage);
        return;
      }

      sendNotFound(response);
    } catch (error) {
      sendJson(response, 500, {
        error: "Server error",
        detail: error.message
      });
    }
  });

  server.on("close", () => {
    app.close();
  });

  return server;
}

export function startServer({ port = 3030 } = {}) {
  const server = createServer({ port });
  server.listen(port, () => {
    console.log(`Lodge BUILD mode running at http://localhost:${port}`);
    const token = String(process.env.MAPBOX_TOKEN || "").trim();
    if (!token.startsWith("pk.")) {
      console.warn(
        "[lodge-build] Set MAPBOX_TOKEN (public pk.*) to show Mapbox on /, /build, and /social-map. " +
          "Copy build-mode/.env.example to build-mode/.env or export MAPBOX_TOKEN. " +
          "https://account.mapbox.com/access-tokens/"
      );
    }
  });
  return server;
}

if (process.argv[1] === __filename) {
  startServer({
    port: Number(process.env.PORT || 3030)
  });
}
