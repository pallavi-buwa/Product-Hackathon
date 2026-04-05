const state = {
  bootstrap: null,
  viewport: null,
  posts: [],
  selectedPostId: null,
  detailCache: new Map(),
  liveFeed: { stats: {}, updates: [] },
  mapPlaces: [],
  routineTypeOptions: [],
  composerDefaults: {},
  markerScreenPositions: [],
  pendingViewportFetch: null,
  pointer: { x: 0, y: 0 },
  globeFlash: 0
};

const elements = {
  heroTitle: document.querySelector("#hero-title"),
  heroText: document.querySelector("#hero-text"),
  heroMetrics: document.querySelector("#hero-metrics"),
  liveUpdates: document.querySelector("#live-updates"),
  focusFeatured: document.querySelector("#focus-featured"),
  postList: document.querySelector("#post-list"),
  detailTitle: document.querySelector("#detail-title"),
  detailBody: document.querySelector("#detail-body"),
  viewportLabel: document.querySelector("#viewport-label"),
  postCountLabel: document.querySelector("#post-count-label"),
  composerForm: document.querySelector("#composer-form"),
  routineTypeSelect: document.querySelector("#routine-type-select"),
  mapCanvas: document.querySelector("#map-canvas"),
  globeCanvas: document.querySelector("#globe-canvas"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out")
};

const mapContext = elements.mapCanvas.getContext("2d");
const globeContext = elements.globeCanvas.getContext("2d");

function formatDistance(value) {
  if (typeof value !== "number") {
    return "nearby";
  }

  return `${value.toFixed(1)} mi away`;
}

function formatDateLabel(value) {
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.detail || error.error || "Request failed");
  }
  return response.json();
}

function currentSpans() {
  return {
    spanLat: state.bootstrap.viewport.spanLat / state.viewport.zoom,
    spanLng: state.bootstrap.viewport.spanLng / state.viewport.zoom
  };
}

function currentBounds() {
  const { spanLat, spanLng } = currentSpans();
  return {
    minLat: state.viewport.center.lat - spanLat / 2,
    maxLat: state.viewport.center.lat + spanLat / 2,
    minLng: state.viewport.center.lng - spanLng / 2,
    maxLng: state.viewport.center.lng + spanLng / 2
  };
}

function nearestPlaceLabel(center) {
  if (!state.mapPlaces.length) {
    return "Current area";
  }

  let best = state.mapPlaces[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const place of state.mapPlaces) {
    const distance = Math.hypot(center.lat - place.lat, center.lng - place.lng);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }

  return best.label;
}

function updateViewportLabels() {
  elements.viewportLabel.textContent = nearestPlaceLabel(state.viewport.center);
  elements.postCountLabel.textContent = `${state.posts.length} posts in view`;
}

function renderBrandCopy() {
  const brand = state.bootstrap?.brand || {};
  elements.heroTitle.textContent = brand.heroTitle || brand.promise || "Build shared rituals";
  elements.heroText.textContent =
    brand.heroText || "Lodge helps you turn ordinary routines into something shared.";
}

function renderHeroMetrics() {
  const stats = state.liveFeed.stats || {};
  elements.heroMetrics.innerHTML = [
    { label: "Open posts", value: stats.openPosts ?? 0 },
    { label: "Routine neighbors", value: stats.activeNeighbors ?? 0 },
    { label: "Live nudges", value: stats.liveNudges ?? 0 }
  ]
    .map(
      (item) =>
        `<div class="metric-chip"><strong>${item.value}</strong>${item.label}</div>`
    )
    .join("");
}

function renderLiveUpdates() {
  elements.liveUpdates.innerHTML = state.liveFeed.updates
    .slice(0, 5)
    .map((update) => `<li><strong>${update.kind}</strong><br />${update.message}</li>`)
    .join("");
}

function postCardMarkup(post) {
  const selected = post.id === state.selectedPostId ? "selected" : "";
  const tags = (post.contextTags || [])
    .slice(0, 3)
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");

  return `
    <article class="post-card ${selected}" data-post-id="${post.id}">
      <div class="post-meta">
        <p class="eyebrow">${post.creatorName} - ${post.startTimeLabel}</p>
        <h5>${post.label}</h5>
        <p>${post.localSpotName} - ${formatDistance(post.distanceMiles)}</p>
        <div class="tag-row">${tags}</div>
      </div>
    </article>
  `;
}

function renderPostList() {
  if (!state.posts.length) {
    elements.postList.innerHTML =
      '<p class="empty-state">Nothing is in this viewport yet. Pan the map or publish your own ritual anchor.</p>';
    return;
  }

  elements.postList.innerHTML = state.posts.map(postCardMarkup).join("");
}

function detailMarkup(detail) {
  const { post, creator, plan } = detail;
  const sessionMarkup = plan.blueprint.firstThreeSessions
    .map(
      (session) => `
        <li>
          <strong>Session ${session.sessionNumber}: ${session.title}</strong><br />
          ${session.structure}
        </li>
      `
    )
    .join("");
  const matchMarkup = plan.matches
    .map(
      (match) => `
        <li>
          <strong>${match.viewerLens.id.replace("-", " ")}</strong><br />
          ${match.invitationText}
        </li>
      `
    )
    .join("");
  const notificationMarkup = plan.notifications
    .map((notification) => `<li>${notification.message}</li>`)
    .join("");

  return `
    <div class="detail-stack">
      <div>
        <p class="eyebrow">${creator.firstName} - ${formatDateLabel(post.startTime)}</p>
        <h5>${post.label}</h5>
        <p class="detail-copy">${plan.blueprint.summary}</p>
      </div>

      <div class="detail-meta">
        <span class="pill">${post.localSpotName}</span>
        <span class="pill">${post.desiredGroupSize} person target</span>
        <span class="pill">${post.cadencePerWeek}x per week</span>
      </div>

      <div class="detail-block">
        <p class="eyebrow">Share copy</p>
        <p class="detail-copy">${plan.blueprint.shareCopy.headline}</p>
        <p class="detail-copy">${plan.blueprint.shareCopy.body}</p>
      </div>

      <div class="detail-block">
        <p class="eyebrow">First three sessions</p>
        <ul class="session-list">${sessionMarkup}</ul>
      </div>

      <div class="detail-block">
        <p class="eyebrow">Top matches</p>
        <ul class="match-list">${matchMarkup || "<li>No high-quality matches yet.</li>"}</ul>
      </div>

      <div class="detail-block">
        <p class="eyebrow">Silent bridge nudges</p>
        <ul class="notification-list">
          ${notificationMarkup || "<li>No silent bridge nudges scheduled yet.</li>"}
        </ul>
      </div>
    </div>
  `;
}

function renderDetail() {
  if (!state.selectedPostId || !state.detailCache.has(state.selectedPostId)) {
    elements.detailTitle.textContent = "Select a post to inspect the ritual plan";
    elements.detailBody.innerHTML =
      '<p class="empty-state">The selected post will show its generated ritual blueprint, top routine matches, and silent bridge nudges here.</p>';
    return;
  }

  const detail = state.detailCache.get(state.selectedPostId);
  elements.detailTitle.textContent = detail.post.label;
  elements.detailBody.innerHTML = detailMarkup(detail);
}

function resizeCanvas(canvas, context, width, height) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawMapBackground(width, height) {
  const gradient = mapContext.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f8fbf9");
  gradient.addColorStop(1, "#edf2ee");
  mapContext.fillStyle = gradient;
  mapContext.fillRect(0, 0, width, height);

  mapContext.save();
  mapContext.strokeStyle = "rgba(54, 104, 89, 0.08)";
  mapContext.lineWidth = 1;
  for (let x = 0; x < width; x += 54) {
    mapContext.beginPath();
    mapContext.moveTo(x, 0);
    mapContext.lineTo(x, height);
    mapContext.stroke();
  }
  for (let y = 0; y < height; y += 54) {
    mapContext.beginPath();
    mapContext.moveTo(0, y);
    mapContext.lineTo(width, y);
    mapContext.stroke();
  }
  mapContext.restore();
}

function projectPoint(point, width, height) {
  const { spanLat, spanLng } = currentSpans();

  return {
    x: ((point.lng - state.viewport.center.lng) / spanLng) * width + width / 2,
    y: ((state.viewport.center.lat - point.lat) / spanLat) * height + height / 2
  };
}

function drawMap() {
  const width = elements.mapCanvas.clientWidth;
  const height = elements.mapCanvas.clientHeight;
  resizeCanvas(elements.mapCanvas, mapContext, width, height);
  drawMapBackground(width, height);

  mapContext.save();
  mapContext.strokeStyle = "rgba(95, 134, 169, 0.18)";
  mapContext.lineWidth = 2;
  for (let index = 0; index < state.mapPlaces.length - 1; index += 1) {
    const start = projectPoint(state.mapPlaces[index], width, height);
    const end = projectPoint(state.mapPlaces[index + 1], width, height);
    mapContext.beginPath();
    mapContext.moveTo(start.x, start.y);
    mapContext.bezierCurveTo(
      start.x + 55,
      start.y - 30,
      end.x - 40,
      end.y + 30,
      end.x,
      end.y
    );
    mapContext.stroke();
  }
  mapContext.restore();

  for (const place of state.mapPlaces) {
    const projected = projectPoint(place, width, height);
    if (
      projected.x < -80 ||
      projected.x > width + 80 ||
      projected.y < -40 ||
      projected.y > height + 40
    ) {
      continue;
    }

    mapContext.fillStyle = "rgba(28, 57, 47, 0.6)";
    mapContext.font = '12px "Manrope"';
    mapContext.fillText(place.label, projected.x + 8, projected.y - 8);
  }

  state.markerScreenPositions = state.posts.map((post, index) => {
    const projected = projectPoint(post.startLocation, width, height);
    const radius = post.creatorId === state.bootstrap.viewer.id ? 10 : 8;
    const pulse = 6 + Math.sin(performance.now() / 700 + index) * 2;

    mapContext.save();
    mapContext.fillStyle =
      post.creatorId === state.bootstrap.viewer.id
        ? "rgba(95, 134, 169, 0.18)"
        : "rgba(47, 125, 103, 0.16)";
    mapContext.beginPath();
    mapContext.arc(projected.x, projected.y, radius + pulse, 0, Math.PI * 2);
    mapContext.fill();

    mapContext.fillStyle =
      post.creatorId === state.bootstrap.viewer.id ? "#5f86a9" : "#2f7d67";
    mapContext.beginPath();
    mapContext.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    mapContext.fill();

    if (post.id === state.selectedPostId) {
      mapContext.strokeStyle = "rgba(23, 49, 40, 0.45)";
      mapContext.lineWidth = 2;
      mapContext.beginPath();
      mapContext.arc(projected.x, projected.y, radius + 7, 0, Math.PI * 2);
      mapContext.stroke();
    }
    mapContext.restore();

    return { id: post.id, x: projected.x, y: projected.y, radius: radius + 8 };
  });
}

function buildGlobePoints() {
  const points = [];
  for (let lat = -70; lat <= 70; lat += 10) {
    for (let lng = -180; lng < 180; lng += 15) {
      points.push({ lat, lng });
    }
  }
  return points;
}

const globePoints = buildGlobePoints();

function drawGlobe(time = 0) {
  const width = elements.globeCanvas.clientWidth;
  const height = elements.globeCanvas.clientHeight;
  resizeCanvas(elements.globeCanvas, globeContext, width, height);
  globeContext.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2 + 10;
  const radius = Math.min(width, height) * 0.33;
  const rotation = time * 0.00018 + state.pointer.x * 0.0006;

  globeContext.save();
  globeContext.translate(cx, cy);

  const glow = globeContext.createRadialGradient(0, 0, radius * 0.28, 0, 0, radius * 1.3);
  glow.addColorStop(0, `rgba(95, 134, 169, ${0.22 + state.globeFlash * 0.08})`);
  glow.addColorStop(1, "rgba(95, 134, 169, 0)");
  globeContext.fillStyle = glow;
  globeContext.beginPath();
  globeContext.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
  globeContext.fill();

  globeContext.strokeStyle = "rgba(255, 255, 255, 0.14)";
  globeContext.lineWidth = 1;
  for (let ring = 0; ring < 4; ring += 1) {
    globeContext.beginPath();
    globeContext.ellipse(
      0,
      0,
      radius + ring * 18,
      (radius + ring * 18) * 0.34,
      0,
      0,
      Math.PI * 2
    );
    globeContext.stroke();
  }

  for (const point of globePoints) {
    const latRad = (point.lat * Math.PI) / 180;
    const lngRad = (point.lng * Math.PI) / 180 + rotation;
    const x = Math.cos(latRad) * Math.sin(lngRad);
    const y = Math.sin(latRad);
    const z = Math.cos(latRad) * Math.cos(lngRad);

    const screenX = x * radius;
    const screenY = y * radius;
    const alpha = Math.max(0.1, (z + 1) / 2);

    globeContext.fillStyle =
      z > 0
        ? `rgba(92, 197, 160, ${0.22 + alpha * 0.55})`
        : `rgba(255, 255, 255, ${0.04 + alpha * 0.1})`;
    globeContext.beginPath();
    globeContext.arc(screenX, screenY, z > 0 ? 2.1 : 1.3, 0, Math.PI * 2);
    globeContext.fill();
  }

  const updateCount = Math.max(1, state.liveFeed.updates.length);
  for (let index = 0; index < updateCount; index += 1) {
    const angle = rotation + index * 0.95;
    const highlightX = Math.sin(angle) * radius * 0.82;
    const highlightY = Math.cos(angle * 1.2) * radius * 0.28;
    globeContext.fillStyle = `rgba(255, 255, 255, ${0.55 + state.globeFlash * 0.25})`;
    globeContext.beginPath();
    globeContext.arc(highlightX, highlightY, 4 + state.globeFlash * 2, 0, Math.PI * 2);
    globeContext.fill();
  }

  globeContext.restore();
  state.globeFlash *= 0.96;
  requestAnimationFrame(drawGlobe);
}

async function loadPosts() {
  const bounds = currentBounds();
  const { spanLat, spanLng } = currentSpans();
  const query = new URLSearchParams({
    centerLat: String(state.viewport.center.lat),
    centerLng: String(state.viewport.center.lng),
    zoom: String(state.viewport.zoom),
    spanLat: String(spanLat),
    spanLng: String(spanLng),
    ...Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, String(value)]))
  });
  const payload = await requestJson(`/api/posts?${query.toString()}`);
  state.posts = payload.posts;

  if (state.selectedPostId && !state.posts.some((post) => post.id === state.selectedPostId)) {
    state.selectedPostId = null;
  }

  if (!state.selectedPostId && state.posts.length) {
    state.selectedPostId = state.posts[0].id;
    await loadDetail(state.selectedPostId);
  }

  renderPostList();
  updateViewportLabels();
  drawMap();
}

function scheduleLoadPosts() {
  clearTimeout(state.pendingViewportFetch);
  state.pendingViewportFetch = setTimeout(() => {
    loadPosts().catch(console.error);
  }, 180);
}

async function loadDetail(postId) {
  if (!state.detailCache.has(postId)) {
    const detail = await requestJson(`/api/posts/${postId}`);
    state.detailCache.set(postId, detail);
  }

  state.selectedPostId = postId;
  renderPostList();
  renderDetail();
  drawMap();
}

function applyZoom(delta) {
  state.viewport.zoom = Math.max(0.75, Math.min(4.2, state.viewport.zoom * delta));
  scheduleLoadPosts();
  drawMap();
}

function connectLiveStream() {
  const stream = new EventSource("/api/stream");

  stream.addEventListener("bootstrap", (event) => {
    const payload = JSON.parse(event.data);
    state.liveFeed = payload;
    renderHeroMetrics();
    renderLiveUpdates();
  });

  stream.addEventListener("pulse", (event) => {
    const update = JSON.parse(event.data);
    state.liveFeed.updates.unshift(update);
    state.liveFeed.updates = state.liveFeed.updates.slice(0, 6);
    state.liveFeed.stats.lastUpdatedAt = update.timestamp;
    state.globeFlash = 1;
    renderLiveUpdates();
    loadPosts().catch(console.error);
  });
}

function installMapInteractions() {
  let drag = null;

  elements.mapCanvas.addEventListener("pointerdown", (event) => {
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false
    };
    elements.mapCanvas.classList.add("dragging");
    elements.mapCanvas.setPointerCapture(event.pointerId);
  });

  elements.mapCanvas.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }

    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.moved =
      drag.moved ||
      Math.abs(event.clientX - drag.startX) > 4 ||
      Math.abs(event.clientY - drag.startY) > 4;

    const { spanLat, spanLng } = currentSpans();
    state.viewport.center.lng -= (dx / elements.mapCanvas.clientWidth) * spanLng;
    state.viewport.center.lat += (dy / elements.mapCanvas.clientHeight) * spanLat;
    drawMap();
    scheduleLoadPosts();
  });

  elements.mapCanvas.addEventListener("pointerup", async (event) => {
    if (!drag) {
      return;
    }

    elements.mapCanvas.classList.remove("dragging");
    elements.mapCanvas.releasePointerCapture(event.pointerId);
    const wasDrag = drag.moved;
    drag = null;

    if (wasDrag) {
      return;
    }

    const rect = elements.mapCanvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    const hit = state.markerScreenPositions.find(
      (marker) => Math.hypot(marker.x - clickX, marker.y - clickY) <= marker.radius
    );

    if (hit) {
      await loadDetail(hit.id);
    }
  });

  elements.mapCanvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      applyZoom(event.deltaY < 0 ? 1.12 : 0.9);
    },
    { passive: false }
  );

  elements.zoomIn.addEventListener("click", () => applyZoom(1.12));
  elements.zoomOut.addEventListener("click", () => applyZoom(0.9));
}

function installComposer() {
  const { composerDefaults, routineTypeOptions } = state;
  elements.routineTypeSelect.innerHTML = routineTypeOptions
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  elements.composerForm.elements.label.value = composerDefaults.label || "";
  elements.routineTypeSelect.value = composerDefaults.type || routineTypeOptions[0]?.value || "";
  elements.composerForm.elements.desiredGroupSize.value = String(
    composerDefaults.desiredGroupSize ?? 2
  );
  elements.composerForm.elements.durationMinutes.value = String(
    composerDefaults.durationMinutes ?? 40
  );
  elements.composerForm.elements.localSpotName.value = composerDefaults.localSpotName || "";
  elements.composerForm.elements.cadencePerWeek.value = String(
    composerDefaults.cadencePerWeek ?? 2
  );
  elements.composerForm.elements.contextTags.value = Array.isArray(composerDefaults.contextTags)
    ? composerDefaults.contextTags.join(", ")
    : "";

  const initialDate = new Date(
    Date.now() + Number(composerDefaults.startOffsetMinutes ?? 45) * 60 * 1000
  );
  elements.composerForm.elements.startTime.value = toDateTimeLocalValue(initialDate);

  elements.composerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(elements.composerForm);
    const payload = Object.fromEntries(formData.entries());
    payload.startTime = new Date(payload.startTime).toISOString();
    payload.startLat = state.viewport.center.lat;
    payload.startLng = state.viewport.center.lng;
    payload.endLat = state.viewport.center.lat + 0.0012;
    payload.endLng = state.viewport.center.lng + 0.0012;

    const created = await requestJson("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    state.viewport.center = { ...created.post.startLocation };
    state.selectedPostId = created.post.id;
    state.detailCache.set(created.post.id, {
      post: created.post,
      creator: state.bootstrap.viewer,
      plan: {
        blueprint: created.plan.blueprint,
        matches: created.plan.matches.slice(0, 4),
        notifications: created.plan.notifications
      }
    });

    await loadPosts();
    renderDetail();
    document
      .querySelector("#detail-panel")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function installListInteractions() {
  elements.postList.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-post-id]");
    if (!card) {
      return;
    }

    await loadDetail(card.dataset.postId);
  });
}

function installHeroActions() {
  elements.focusFeatured.addEventListener("click", async () => {
    const featured = state.bootstrap.featuredPosts?.[0];
    if (!featured) {
      return;
    }

    state.viewport.center = { ...featured.startLocation };
    await loadPosts();
    await loadDetail(featured.id);
    document
      .querySelector("#build-app")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function installPointerTracking() {
  elements.globeCanvas.addEventListener("pointermove", (event) => {
    const rect = elements.globeCanvas.getBoundingClientRect();
    state.pointer.x = event.clientX - rect.left - rect.width / 2;
    state.pointer.y = event.clientY - rect.top - rect.height / 2;
  });
}

async function initialize() {
  state.bootstrap = await requestJson("/api/bootstrap");
  state.viewport = {
    center: { ...state.bootstrap.viewport.center },
    zoom: state.bootstrap.viewport.zoom
  };
  state.liveFeed = state.bootstrap.liveFeed;
  state.mapPlaces = state.bootstrap.mapPlaces || [];
  state.routineTypeOptions = state.bootstrap.routineTypeOptions || [];
  state.composerDefaults = state.bootstrap.composerDefaults || {};

  renderBrandCopy();
  renderHeroMetrics();
  renderLiveUpdates();
  updateViewportLabels();
  installMapInteractions();
  installComposer();
  installListInteractions();
  installHeroActions();
  installPointerTracking();
  connectLiveStream();
  await loadPosts();
  renderDetail();
  requestAnimationFrame(drawGlobe);
}

window.addEventListener("resize", () => {
  drawMap();
});

initialize().catch((error) => {
  console.error(error);
  elements.detailBody.innerHTML = `<p class="empty-state">${error.message}</p>`;
});
