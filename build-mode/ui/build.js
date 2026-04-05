const MAPBOX_TOKEN = window.__MAPBOX_TOKEN || "";

const state = {
  bootstrap: null,
  viewport: null,
  posts: [],
  selectedPostId: null,
  detailCache: new Map(),
  mapPlaces: [],
  routineTypeOptions: [],
  composerDefaults: {},
  map: null,
  markers: [],
  pendingViewportFetch: null
};

const elements = {
  workspaceTitle: document.querySelector("#workspace-title"),
  postList: document.querySelector("#post-list"),
  detailTitle: document.querySelector("#detail-title"),
  detailBody: document.querySelector("#detail-body"),
  viewportLabel: document.querySelector("#viewport-label"),
  postCountLabel: document.querySelector("#post-count-label"),
  composerForm: document.querySelector("#composer-form"),
  routineTypeSelect: document.querySelector("#routine-type-select"),
  mapElement: document.querySelector("#map"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out")
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.detail || error.error || "Request failed");
  }

  return response.json();
}

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
        <p class="eyebrow">Nudges for you</p>
        <ul class="notification-list">
          ${notificationMarkup || "<li>No personalized nudges are scheduled yet.</li>"}
        </ul>
      </div>
    </div>
  `;
}

function renderDetail() {
  if (!state.selectedPostId || !state.detailCache.has(state.selectedPostId)) {
    elements.detailTitle.textContent = "Select a post to inspect the ritual plan";
    elements.detailBody.innerHTML =
      '<p class="empty-state">The selected post will show its generated ritual blueprint, top routine matches, and nudges meant for you here.</p>';
    return;
  }

  const detail = state.detailCache.get(state.selectedPostId);
  elements.detailTitle.textContent = detail.post.label;
  elements.detailBody.innerHTML = detailMarkup(detail);
}

function applyViewportFromMap() {
  if (!state.map) {
    return;
  }

  const center = state.map.getCenter();
  state.viewport.center = {
    lat: center.lat,
    lng: center.lng
  };
  state.viewport.zoom = state.map.getZoom();
}

function clearMarkers() {
  for (const marker of state.markers) {
    marker.remove();
  }
  state.markers = [];
}

function markerElementForPost(post) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = `mapbox-post-marker${post.id === state.selectedPostId ? " selected" : ""}${
    post.creatorId === state.bootstrap.viewer.id ? " is-viewer" : ""
  }`;
  marker.innerHTML = `<span>${post.creatorId === state.bootstrap.viewer.id ? "You" : post.creatorName}</span>`;
  marker.addEventListener("click", async (event) => {
    event.stopPropagation();
    await loadDetail(post.id);
  });
  return marker;
}

function renderMapMarkers() {
  if (!state.map) {
    return;
  }

  clearMarkers();

  for (const post of state.posts) {
    const marker = new mapboxgl.Marker({
      element: markerElementForPost(post),
      anchor: "bottom"
    })
      .setLngLat([post.startLocation.lng, post.startLocation.lat])
      .addTo(state.map);

    state.markers.push(marker);
  }
}

async function loadPosts() {
  if (!state.map) {
    return;
  }

  applyViewportFromMap();
  const bounds = state.map.getBounds();
  const query = new URLSearchParams({
    centerLat: String(state.viewport.center.lat),
    centerLng: String(state.viewport.center.lng),
    zoom: String(state.viewport.zoom),
    minLat: String(bounds.getSouth()),
    maxLat: String(bounds.getNorth()),
    minLng: String(bounds.getWest()),
    maxLng: String(bounds.getEast()),
    spanLat: String(bounds.getNorth() - bounds.getSouth()),
    spanLng: String(bounds.getEast() - bounds.getWest())
  }).toString();

  const payload = await requestJson(`/api/posts?${query}`);
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
  renderMapMarkers();
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
  renderMapMarkers();

  const selected = state.posts.find((post) => post.id === postId);
  if (selected && state.map) {
    state.map.easeTo({
      center: [selected.startLocation.lng, selected.startLocation.lat],
      duration: 700
    });
  }
}

function installMapboxMap() {
  if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.") || typeof mapboxgl === "undefined") {
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;
  state.map = new mapboxgl.Map({
    container: elements.mapElement,
    style: "mapbox://styles/mapbox/light-v11",
    center: [state.viewport.center.lng, state.viewport.center.lat],
    zoom: state.viewport.zoom + 10.2,
    attributionControl: false
  });

  state.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

  state.map.on("load", () => {
    if (state.map.getSource("places")) {
      return;
    }

    state.map.addSource("places", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: state.mapPlaces.map((place) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [place.lng, place.lat]
          },
          properties: { label: place.label }
        }))
      }
    });

    state.map.addLayer({
      id: "place-dots",
      type: "circle",
      source: "places",
      paint: {
        "circle-radius": 4,
        "circle-color": "#C46A4A",
        "circle-opacity": 0.68,
        "circle-stroke-color": "#F7F5F2",
        "circle-stroke-width": 1.5
      }
    });

    state.map.addLayer({
      id: "place-labels",
      type: "symbol",
      source: "places",
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 11,
        "text-offset": [0, 1.2]
      },
      paint: {
        "text-color": "#2C2C2C",
        "text-halo-color": "rgba(247,245,242,0.9)",
        "text-halo-width": 1
      }
    });

    loadPosts().catch(console.error);
  });

  state.map.on("moveend", () => {
    scheduleLoadPosts();
  });

  state.map.on("error", (event) => {
    console.error("Mapbox error:", event?.error || event);
  });

  elements.zoomIn.addEventListener("click", () => state.map?.zoomIn());
  elements.zoomOut.addEventListener("click", () => state.map?.zoomOut());
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

    const center = state.map ? state.map.getCenter() : { lat: state.viewport.center.lat, lng: state.viewport.center.lng };
    payload.startLat = center.lat;
    payload.startLng = center.lng;
    payload.endLat = center.lat + 0.0012;
    payload.endLng = center.lng + 0.0012;

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

    if (state.map) {
      state.map.easeTo({
        center: [created.post.startLocation.lng, created.post.startLocation.lat],
        duration: 700
      });
    }

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

function applyFocusFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("focus");
}

async function initialize() {
  state.bootstrap = await requestJson("/api/bootstrap");
  state.viewport = {
    center: { ...state.bootstrap.viewport.center },
    zoom: state.bootstrap.viewport.zoom
  };
  state.mapPlaces = state.bootstrap.mapPlaces || [];
  state.routineTypeOptions = state.bootstrap.routineTypeOptions || [];
  state.composerDefaults = state.bootstrap.composerDefaults || {};

  elements.workspaceTitle.textContent =
    state.bootstrap.brand?.promise || "Browse routines around you and post your own anchor.";

  installComposer();
  installListInteractions();
  installMapboxMap();

  const focusId = applyFocusFromUrl();
  if (focusId) {
    const focusedPost =
      state.posts.find((post) => post.id === focusId) ||
      (await requestJson(`/api/posts/${focusId}`)
        .then((detail) => {
          state.detailCache.set(focusId, detail);
          return detail.post;
        })
        .catch(() => null));

    if (focusedPost) {
      state.viewport.center = { ...focusedPost.startLocation };
      if (state.map) {
        state.map.jumpTo({
          center: [focusedPost.startLocation.lng, focusedPost.startLocation.lat]
        });
      }
      await loadPosts();
      await loadDetail(focusId);
    }
  }

  renderDetail();
}

window.addEventListener("resize", () => {
  state.map?.resize();
});

initialize().catch((error) => {
  console.error(error);
  elements.detailBody.innerHTML = `<p class="empty-state">${error.message}</p>`;
});
