/**
 * Full-width list + map for /build/explore?view=rsvp|activity|events
 */

const params = new URLSearchParams(window.location.search);
const view = (params.get("view") || "rsvp").toLowerCase();

const titles = {
  rsvp: "Join requests (full inbox)",
  activity: "Your plan (rituals & errands)",
  events: "This week’s events",
  rituals: "Open rituals (full list)",
  picks: "Suggestions & repeats (full list)"
};

const leads = {
  rsvp: "Respond to pending requests. Map shows open rituals in the area.",
  activity: "Everything you’ve posted or logged. Map shows rituals nearby.",
  events: "Curated happenings — save, then RSVP. Map shows event anchors.",
  rituals: "Every open ritual in the default view — pan the map to refresh pins.",
  picks: "Group matches, solo picks, history, and repeat shortcuts. Map shows who’s hosting nearby."
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.detail || error.error || "Request failed");
  }
  return response.json();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function stablePravatarImg(id) {
  const s = String(id || "anon");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i) || 0;
  }
  return (Math.abs(h) % 70) + 1;
}

function avatarUrlForCreator(creatorId, explicitUrl) {
  if (explicitUrl && String(explicitUrl).trim()) {
    return explicitUrl;
  }
  const fromBoot = state.bootstrap?.avatarUrlByUserId?.[creatorId];
  if (fromBoot) {
    return fromBoot;
  }
  return `https://i.pravatar.cc/96?img=${stablePravatarImg(creatorId)}`;
}

function pinSpreadOffsetsByPostId(posts) {
  const keyOf = (loc) => {
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return null;
    }
    return `${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
  };
  const buckets = new Map();
  for (const post of posts) {
    const k = keyOf(post.startLocation);
    if (k == null) {
      continue;
    }
    if (!buckets.has(k)) {
      buckets.set(k, []);
    }
    buckets.get(k).push(post);
  }
  const out = new Map();
  for (const group of buckets.values()) {
    const sorted = [...group].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const n = sorted.length;
    if (n === 1) {
      out.set(sorted[0].id, { lat: 0, lng: 0 });
      continue;
    }
    const radius = 0.00013;
    sorted.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / n;
      out.set(p.id, {
        lat: radius * Math.sin(angle),
        lng: radius * Math.cos(angle)
      });
    });
  }
  return out;
}

function formatEventStarts(iso) {
  if (!iso) {
    return "Soon";
  }
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function mergeRsvpPayload(data) {
  if (data?.inbox) {
    state.rsvpInbox = data.inbox;
    if (state.bootstrap) {
      state.bootstrap.rsvpInbox = data.inbox;
    }
  }
  if (data?.events) {
    state.nearbyEvents = data.events;
    if (state.bootstrap) {
      state.bootstrap.nearbyEvents = data.events;
    }
  }
}

let state = {
  bootstrap: null,
  posts: [],
  map: null,
  markers: [],
  rsvpInbox: [],
  nearbyEvents: [],
  viewerActivity: { openPosts: [], errands: [] },
  viewport: null,
  pendingFetch: null
};

function renderRsvpFull() {
  const list = state.rsvpInbox || [];
  const root = document.getElementById("explore-list");
  if (!list.length) {
    root.innerHTML = `<p class="explore-empty">Nothing pending right now.</p>`;
    return;
  }
  root.innerHTML = list
    .map((r) => {
      const late =
        r.revealPolicy === "last2days"
          ? '<span class="rsvp-reveal-pill">Late reveal</span>'
          : "";
      const kind = r.kind === "ritual" ? "Ritual" : "Event";
      const guestAv = r.guestId ? avatarUrlForCreator(r.guestId, null) : "";
      return `
      <div class="rsvp-inbox-row explore-rsvp-row" data-request-id="${escapeHtml(r.id)}">
        <img class="rsvp-inbox-avatar" src="${escapeAttr(guestAv)}" alt="" width="44" height="44" loading="lazy" />
        <div class="rsvp-inbox-text">
          <span class="rsvp-kind-pill">${kind}</span>
          <strong>${escapeHtml(r.guestName)}</strong>
          <span class="rsvp-inbox-event">${escapeHtml(r.eventTitle)}</span>
          ${late}
        </div>
        <div class="rsvp-inbox-actions">
          <button type="button" class="primary-button rsvp-accept-btn" data-request-id="${escapeHtml(r.id)}">Accept</button>
          <button type="button" class="ghost-button rsvp-decline-btn" data-request-id="${escapeHtml(r.id)}">Decline</button>
        </div>
      </div>`;
    })
    .join("");

  root.querySelectorAll(".rsvp-accept-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const data = await requestJson(`/api/rsvp/${btn.dataset.requestId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept: true })
        });
        mergeRsvpPayload(data);
        renderRsvpFull();
      } catch (e) {
        alert(e.message || "Could not accept");
      }
    });
  });
  root.querySelectorAll(".rsvp-decline-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const data = await requestJson(`/api/rsvp/${btn.dataset.requestId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept: false })
        });
        mergeRsvpPayload(data);
        renderRsvpFull();
      } catch (e) {
        alert(e.message || "Could not decline");
      }
    });
  });
}

function renderActivityFull() {
  const va = state.viewerActivity || { openPosts: [], errands: [] };
  const posts = va.openPosts || [];
  const errands = va.errands || [];
  const root = document.getElementById("explore-list");
  if (!posts.length && !errands.length) {
    root.innerHTML = `<p class="explore-empty">No open rituals or errands yet.</p>`;
    return;
  }
  let html = "";
  if (posts.length) {
    html += '<p class="my-activity-sub">Your open rituals</p><ul class="my-activity-ul">';
    for (const p of posts) {
      html += `<li><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(p.localSpotName)} · ${escapeHtml(
        p.startTimeLabel
      )}</span></li>`;
    }
    html += "</ul>";
  }
  if (errands.length) {
    html += '<p class="my-activity-sub">Your errands</p><ul class="my-activity-ul">';
    for (const e of errands) {
      html += `<li><strong>${escapeHtml(e.label)}</strong><span>${escapeHtml(e.errandKey)}</span></li>`;
    }
    html += "</ul>";
  }
  root.innerHTML = html;
}

function renderEventsFull() {
  const root = document.getElementById("explore-list");
  const evs = state.nearbyEvents || [];
  if (!evs.length) {
    root.innerHTML = `<p class="explore-empty">No curated events in this demo.</p>`;
    return;
  }
  root.innerHTML = evs
    .map((ev) => {
      const hostAv = ev.hostId ? avatarUrlForCreator(ev.hostId, null) : "";
      const hostImg = hostAv
        ? `<img class="event-host-avatar" src="${escapeAttr(hostAv)}" alt="" width="44" height="44" />`
        : "";
      const going = Number(ev.interestCount || 0);
      return `
      <div class="event-row event-row--compact explore-event-row">
        <div class="event-row-main">
          ${hostImg}
          <div class="event-row-text">
            <h5>${escapeHtml(ev.title)}</h5>
            <p class="event-meta-line">${escapeHtml(ev.venueLabel)} · ${escapeHtml(
        formatEventStarts(ev.startsAt)
      )} · ${going} going</p>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function renderRitualsFull() {
  const root = document.getElementById("explore-list");
  const posts = state.posts || [];
  if (!posts.length) {
    root.innerHTML = `<p class="explore-empty">No open rituals in this view.</p>`;
    return;
  }
  root.innerHTML = posts
    .map((p) => {
      const av = avatarUrlForCreator(p.creatorId, p.creatorAvatarUrl);
      const you = p.creatorId === state.bootstrap?.viewer?.id;
      const face = you
        ? `<span class="explore-ritual-you">You</span>`
        : `<img src="${escapeAttr(av)}" alt="" width="44" height="44" class="explore-ritual-face" />`;
      return `<div class="explore-ritual-row">
        ${face}
        <div>
          <strong>${escapeHtml(p.label)}</strong>
          <p class="explore-ritual-meta">${escapeHtml(p.creatorName)} · ${escapeHtml(p.localSpotName)} · ${escapeHtml(
        p.startTimeLabel || ""
      )}</p>
        </div>
      </div>`;
    })
    .join("");
}

function renderPicksFull() {
  const b = state.bootstrap;
  const root = document.getElementById("explore-list");
  const groups = b.groupRecommendations || [];
  const ws = b.workspaceRecommendations || [];
  const history = ws.filter((i) => i.kind === "history");
  const vibe = ws.filter((i) => i.kind !== "history");
  const repeats = b.repeatTemplates || [];
  const face = (ids) =>
    (ids || [])
      .slice(0, 3)
      .map(
        (id) =>
          `<img class="explore-pick-face" src="${escapeAttr(avatarUrlForCreator(id, null))}" alt="" width="36" height="36" />`
      )
      .join("");

  let html = "";
  if (groups.length) {
    html += `<h3 class="explore-picks-h3">Match your vibe</h3><ul class="explore-picks-ul">`;
    for (const item of groups) {
      html += `<li><span class="explore-pick-faces">${face(item.neighborIds)}</span><div><strong>${escapeHtml(
        item.title
      )}</strong><p>${escapeHtml(item.reason)}</p></div></li>`;
    }
    html += `</ul>`;
  }
  if (vibe.length) {
    html += `<h3 class="explore-picks-h3">Similar rhythm</h3><ul class="explore-picks-ul">`;
    for (const item of vibe) {
      html += `<li><span class="explore-pick-faces">${face(item.neighborIds)}</span><div><strong>${escapeHtml(
        item.title
      )}</strong><p>${escapeHtml(item.reason)}</p></div></li>`;
    }
    html += `</ul>`;
  }
  if (history.length) {
    html += `<h3 class="explore-picks-h3">Because you’ve done this before</h3><ul class="explore-picks-ul">`;
    for (const item of history) {
      html += `<li><span class="explore-pick-faces">${face(item.neighborIds)}</span><div><strong>${escapeHtml(
        item.title
      )}</strong><p>${escapeHtml(item.reason)}</p></div></li>`;
    }
    html += `</ul>`;
  }
  if (repeats.length) {
    html += `<h3 class="explore-picks-h3">Repeat since you liked it</h3><ul class="explore-picks-ul explore-picks-ul--repeats">`;
    for (const t of repeats) {
      const ids = t.neighborIds || [];
      html += `<li><span class="explore-pick-faces">${face(ids)}</span><div><strong>${escapeHtml(
        t.label
      )}</strong><p>${escapeHtml(t.buddyLine || "")}</p></div></li>`;
    }
    html += `</ul>`;
  }
  if (!html) {
    html = `<p class="explore-empty">No suggestions yet — save your profile on the main page.</p>`;
  }
  root.innerHTML = html;
}

function renderList() {
  if (view === "rsvp") {
    renderRsvpFull();
  } else if (view === "activity") {
    renderActivityFull();
  } else if (view === "events") {
    renderEventsFull();
  } else if (view === "rituals") {
    renderRitualsFull();
  } else if (view === "picks") {
    renderPicksFull();
  } else {
    renderEventsFull();
  }
}

function renderMarkers() {
  if (!state.map || typeof mapboxgl === "undefined") {
    return;
  }
  for (const m of state.markers) {
    m.remove();
  }
  state.markers = [];
  const spread = pinSpreadOffsetsByPostId(state.posts);
  const vid = state.bootstrap?.viewer?.id;
  for (const post of state.posts) {
    if (!post.startLocation) {
      continue;
    }
    const o = spread.get(post.id) || { lat: 0, lng: 0 };
    const lat = post.startLocation.lat + o.lat;
    const lng = post.startLocation.lng + o.lng;
    const isViewer = post.creatorId === vid;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `mapbox-post-marker${isViewer ? " is-viewer" : ""}`;
    const av = !isViewer
      ? avatarUrlForCreator(post.creatorId, post.creatorAvatarUrl)
      : "";
    const face = !isViewer
      ? `<img class="marker-avatar" src="${escapeAttr(av)}" alt="" width="40" height="40" />`
      : `<span class="marker-avatar marker-avatar--you">Y</span>`;
    el.innerHTML = `<span class="marker-pin-inner">${face}<span class="marker-name">${isViewer ? "You" : escapeHtml(post.creatorName)}</span></span>`;
    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(state.map);
    state.markers.push(marker);
  }
}

async function loadPosts() {
  if (!state.map) {
    return;
  }
  const bounds = state.map.getBounds();
  const c = state.map.getCenter();
  const z = state.map.getZoom();
  const query = new URLSearchParams({
    centerLat: String(c.lat),
    centerLng: String(c.lng),
    zoom: String(z),
    minLat: String(bounds.getSouth()),
    maxLat: String(bounds.getNorth()),
    minLng: String(bounds.getWest()),
    maxLng: String(bounds.getEast()),
    spanLat: String(bounds.getNorth() - bounds.getSouth()),
    spanLng: String(bounds.getEast() - bounds.getWest())
  }).toString();
  const payload = await requestJson(`/api/posts?${query}`);
  state.posts = payload.posts || [];
  renderMarkers();
}

function mapboxToken() {
  return String(window.__MAPBOX_TOKEN || "").trim();
}

async function fetchPostsForDefaultViewport() {
  const vp = state.bootstrap.viewport;
  const center = vp.center;
  const spanLat = Number(vp.spanLat) || 0.055;
  const spanLng = Number(vp.spanLng) || 0.07;
  const minLat = center.lat - spanLat / 2;
  const maxLat = center.lat + spanLat / 2;
  const minLng = center.lng - spanLng / 2;
  const maxLng = center.lng + spanLng / 2;
  const query = new URLSearchParams({
    centerLat: String(center.lat),
    centerLng: String(center.lng),
    zoom: String(vp.zoom ?? 1.2),
    minLat: String(minLat),
    maxLat: String(maxLat),
    minLng: String(minLng),
    maxLng: String(maxLng),
    spanLat: String(spanLat),
    spanLng: String(spanLng)
  }).toString();
  const payload = await requestJson(`/api/posts?${query}`);
  state.posts = payload.posts || [];
}

async function main() {
  document.getElementById("explore-page-title").textContent = titles[view] || titles.rsvp;
  document.getElementById("explore-page-lead").textContent = leads[view] || "";

  state.bootstrap = await requestJson("/api/bootstrap");
  state.viewport = {
    center: { ...state.bootstrap.viewport.center },
    zoom: state.bootstrap.viewport.zoom
  };
  state.rsvpInbox = state.bootstrap.rsvpInbox || [];
  state.nearbyEvents = state.bootstrap.nearbyEvents || [];
  state.viewerActivity = state.bootstrap.viewerActivity || { openPosts: [], errands: [] };

  await fetchPostsForDefaultViewport();
  renderList();

  const token = mapboxToken();
  if (!token || !token.startsWith("pk.") || typeof mapboxgl === "undefined") {
    document.getElementById("explore-map").innerHTML =
      '<p class="explore-map-fallback">Add MAPBOX_TOKEN to show the map here.</p>';
    return;
  }

  mapboxgl.accessToken = token;
  state.map = new mapboxgl.Map({
    container: "explore-map",
    style: "mapbox://styles/mapbox/light-v11",
    center: [state.viewport.center.lng, state.viewport.center.lat],
    zoom: Number(state.viewport.zoom) + 10.2,
    attributionControl: false
  });
  state.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

  state.map.on("load", () => {
    loadPosts().catch(console.error);
  });
  state.map.on("moveend", () => {
    clearTimeout(state.pendingFetch);
    state.pendingFetch = setTimeout(() => loadPosts().catch(console.error), 200);
  });
}

main().catch((e) => {
  console.error(e);
  document.getElementById("explore-list").innerHTML = `<p class="explore-empty">${escapeHtml(e.message)}</p>`;
});
