import { randomUUID } from "node:crypto";

export function createAnchorLink({ baseUrl, intentionId, slug = "join" }) {
  const shareToken = randomUUID();
  const url = new URL(`${slug}/${shareToken}`, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("intentionId", intentionId);

  return {
    shareToken,
    url: url.toString()
  };
}
