import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoBuildModeApp } from "./demoBuildApp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiDir = path.resolve(__dirname, "../ui");

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

      if (request.method === "GET") {
        const requestedPath = getPagePath(pathname);
        const served = await serveStaticFile(response, requestedPath);
        if (served) {
          return;
        }

        const fallbackPage = pathname.startsWith("/build")
          ? "build.html"
          : "index.html";
        const fallback = await readFile(path.join(uiDir, fallbackPage), "utf-8");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(fallback);
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
  });
  return server;
}

if (process.argv[1] === __filename) {
  startServer({
    port: Number(process.env.PORT || 3030)
  });
}
