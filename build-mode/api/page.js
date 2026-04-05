import {
  handleRequest,
  loadLocalEnvFile
} from "../src/requestHandler.js";

loadLocalEnvFile();

export const config = {
  runtime: "nodejs"
};

export default async function handler(request, response) {
  const forwardedProto = request.headers["x-forwarded-proto"] || "https";
  const forwardedHost = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  const baseUrl = `${forwardedProto}://${forwardedHost}`;
  const url = new URL(request.url, baseUrl);
  const pathnameOverride = url.searchParams.get("path") || "/";

  await handleRequest(request, response, {
    baseUrl,
    pathnameOverride
  });
}
