import http from "node:http";
import { fileURLToPath } from "node:url";
import {
  closeCachedApp,
  handleRequest,
  loadLocalEnvFile
} from "./requestHandler.js";

const __filename = fileURLToPath(import.meta.url);

loadLocalEnvFile();

export function createServer({ port = 3030 } = {}) {
  const baseUrl = `http://localhost:${port}`;
  const server = http.createServer((request, response) =>
    handleRequest(request, response, { baseUrl })
  );

  server.on("close", () => {
    closeCachedApp();
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
    if (process.env.VERCEL) {
      console.warn(
        "[lodge-build] Running on Vercel: runtime data is stored in temporary /tmp storage and may reset between invocations or deployments."
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
