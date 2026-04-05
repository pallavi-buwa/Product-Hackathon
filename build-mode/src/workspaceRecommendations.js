/**
 * Spotify-style “for you” lines: history + overlap, not generic ads.
 * Used only for the logged-in viewer’s workspace.
 */

function hobbyOverlapCount(viewer, neighbor) {
  const v = new Set((viewer?.hobbies || []).map((x) => String(x).toLowerCase()));
  let n = 0;
  for (const h of neighbor?.hobbies || []) {
    if (v.has(String(h).toLowerCase())) {
      n += 1;
    }
  }
  return n;
}

function interestOverlapLabels(viewer, neighbor) {
  const v = new Set((viewer?.interests || []).map((x) => String(x).toLowerCase()));
  const out = [];
  for (const x of neighbor?.interests || []) {
    if (v.has(String(x).toLowerCase())) {
      out.push(x);
    }
  }
  return out;
}

/**
 * @param {object} ctx
 * @param {object} ctx.viewer
 * @param {object[]} ctx.ritualBondsForViewer — from getRitualBondsForViewer()
 * @param {object[]} ctx.userProfiles
 * @param {object[]} ctx.activeIntentions
 */
export function buildWorkspaceRecommendations({
  viewer,
  ritualBondsForViewer = [],
  userProfiles = [],
  activeIntentions = []
}) {
  if (!viewer?.id) {
    return [];
  }
  const vid = viewer.id;
  const byId = Object.fromEntries(userProfiles.map((p) => [p.id, p]));
  const items = [];
  const seen = new Set();

  for (const bond of ritualBondsForViewer) {
    const p = byId[bond.neighborId];
    if (!p) {
      continue;
    }
    const id = `bond-${bond.neighborId}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    items.push({
      id,
      kind: "history",
      title: `Meet up with ${p.firstName} again`,
      subtitle: bond.lastSharedLabel ? `Last: “${bond.lastSharedLabel}”` : "You’ve linked up before",
      reason: `Because you’ve shared a ritual before (${bond.timesTogether}×)`,
      neighborIds: [bond.neighborId]
    });
  }

  const neighbors = userProfiles.filter((p) => p.id !== vid);
  for (const n of neighbors) {
    const shared = interestOverlapLabels(viewer, n);
    const ho = hobbyOverlapCount(viewer, n);
    if (shared.length >= 1 && ho >= 1) {
      const id = `overlap-${n.id}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const open = activeIntentions.find((i) => i.status === "open" && i.creatorId === n.id);
      items.push({
        id,
        kind: "overlap",
        title: open ? `${n.firstName} · ${open.label}` : `${n.firstName} · overlaps your world`,
        subtitle: shared.slice(0, 2).join(" · "),
        reason: `Because you both care about ${shared[0]} — like picks you’ve trained`,
        neighborIds: [n.id],
        postId: open?.id ?? null
      });
    }
  }

  for (const n of neighbors) {
    const ho = hobbyOverlapCount(viewer, n);
    if (ho >= 2) {
      const id = `hobbies-${n.id}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const sharedH = (n.hobbies || []).filter((h) =>
        (viewer.hobbies || []).some((vh) => String(vh).toLowerCase() === String(h).toLowerCase())
      );
      items.push({
        id,
        kind: "taste",
        title: `Group-sized opening with ${n.firstName}`,
        subtitle: sharedH.slice(0, 2).join(" · "),
        reason: `Because you’ve leaned into ${sharedH[0] || "similar"} before`,
        neighborIds: [n.id]
      });
    }
  }

  return items.slice(0, 8);
}

function tagSet(profile) {
  const s = new Set();
  for (const x of [...(profile?.interests || []), ...(profile?.hobbies || [])]) {
    s.add(String(x).toLowerCase());
  }
  return s;
}

/**
 * Multi-person “pods” where the viewer + two neighbors all share at least one signal
 * (Spotify-style “fans also liked” but for small groups).
 */
export function buildGroupRecommendations({
  viewer,
  userProfiles = []
}) {
  if (!viewer?.id) {
    return [];
  }
  const vid = viewer.id;
  const neighbors = userProfiles.filter((p) => p.id !== vid);
  const vTags = tagSet(viewer);
  const groups = [];
  const seen = new Set();

  for (let i = 0; i < neighbors.length; i += 1) {
    for (let j = i + 1; j < neighbors.length; j += 1) {
      const a = neighbors[i];
      const b = neighbors[j];
      const aTags = tagSet(a);
      const bTags = tagSet(b);
      const triple = [...aTags].filter((t) => vTags.has(t) && bTags.has(t));
      if (!triple.length) {
        continue;
      }
      const anchor = triple.sort((x, y) => x.localeCompare(y))[0];
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      groups.push({
        id: `group-pod-${key}`,
        kind: "group",
        title: `Try a 3-person ${anchor} loop`,
        subtitle: `${a.firstName}, ${b.firstName} & you`,
        reason: `Because you’ve all shown up around ${anchor} before — easy group chemistry`,
        neighborIds: [a.id, b.id]
      });
      if (groups.length >= 6) {
        return groups;
      }
    }
  }

  for (let i = 0; i < neighbors.length; i += 1) {
    for (let j = i + 1; j < neighbors.length; j += 1) {
      const a = neighbors[i];
      const b = neighbors[j];
      const tpA = new Set((a.thirdPlaces || []).map((x) => String(x)));
      const tpB = new Set((b.thirdPlaces || []).map((x) => String(x)));
      const viewerTp = new Set((viewer.thirdPlaces || []).map((x) => String(x)));
      const sameSpot = [...tpA].find((spot) => viewerTp.has(spot) && tpB.has(spot));
      if (!sameSpot) {
        continue;
      }
      const key = `spot-${sameSpot}-${[a.id, b.id].sort().join("|")}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      groups.push({
        id: `group-spot-${key}`,
        kind: "group",
        title: `Corner crew · ${sameSpot}`,
        subtitle: `${a.firstName}, ${b.firstName} & you`,
        reason: `Because you all already orbit the same third place — natural group size`,
        neighborIds: [a.id, b.id]
      });
      if (groups.length >= 6) {
        return groups;
      }
    }
  }

  return groups;
}
