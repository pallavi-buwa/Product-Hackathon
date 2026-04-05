const MAPBOX_TOKEN = window.__MAPBOX_TOKEN || "";

const state = {
  bootstrap: null,
  viewport: null,
  posts: [],
  selectedPostId: null,
  mapPlaces: [],
  routineTypeOptions: [],
  composerDefaults: {},
  heatZones: [],
  nearbyEvents: [],
  errandPresets: [],
  hobbyOptions: [],
  quickChoices: [],
  neighborMatches: [],
  matchHighlight: null,
  syncToastDedupe: { message: "", until: 0 },
  selectedHobbies: new Set(),
  selectedErrandPresetId: null,
  map: null,
  markers: [],
  pendingViewportFetch: null
};

const elements = {
  workspaceTitle: document.querySelector("#workspace-title"),
  workspaceError: document.querySelector("#workspace-error"),
  postList: document.querySelector("#post-list"),
  viewportLabel: document.querySelector("#viewport-label"),
  postCountLabel: document.querySelector("#post-count-label"),
  composerForm: document.querySelector("#composer-form"),
  routineTypeSelect: document.querySelector("#routine-type-select"),
  mapElement: document.querySelector("#map"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  liveToastHost: document.querySelector("#live-toast-host"),
  hobbyChipField: document.querySelector("#hobby-chip-field"),
  quickChoiceFields: document.querySelector("#quick-choice-fields"),
  willingEventsRange: document.querySelector("#willing-events-range"),
  willingEventsValue: document.querySelector("#willing-events-value"),
  saveSignalsBtn: document.querySelector("#save-signals-btn"),
  errandPresetRow: document.querySelector("#errand-preset-row"),
  errandCustomLabel: document.querySelector("#errand-custom-label"),
  errandWindow: document.querySelector("#errand-window"),
  errandTagAlong: document.querySelector("#errand-tag-along"),
  addErrandBtn: document.querySelector("#add-errand-btn"),
  nearbyEventsList: document.querySelector("#nearby-events-list"),
  matchSpotlight: document.querySelector("#match-spotlight"),
  spotlightBackdrop: document.querySelector("#spotlight-backdrop"),
  spotlightTitle: document.querySelector("#spotlight-title"),
  spotlightBody: document.querySelector("#spotlight-body"),
  spotlightClose: document.querySelector("#spotlight-close"),
  spotlightDismiss: document.querySelector("#spotlight-dismiss"),
  spotlightOpenPin: document.querySelector("#spotlight-open-pin"),
  spotlightHelpful: document.querySelector("#spotlight-helpful"),
  spotlightNotHelpful: document.querySelector("#spotlight-not-helpful")
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

function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function heatZonesToGeoJSON(zones) {
  return {
    type: "FeatureCollection",
    features: (zones || []).map((z) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [z.lng, z.lat]
      },
      properties: {
        label: z.label,
        neighborCount: z.neighborCount ?? 0,
        heatIntensity: typeof z.heatIntensity === "number" ? z.heatIntensity : 0,
        glows: z.glows ? 1 : 0
      }
    }))
  };
}

function showLiveToast(message, options = {}) {
  if (!elements.liveToastHost || !message) {
    return;
  }

  const durationMs = Math.min(35 * 60 * 1000, Math.max(4000, Number(options.durationMs) || 12000));

  const node = document.createElement("div");
  node.className = "live-toast";
  node.innerHTML = `${escapeHtml(message)}<time>${new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  })}</time>`;
  elements.liveToastHost.prepend(node);
  setTimeout(() => {
    node.remove();
  }, durationMs);
}

async function postRecommendationFeedback(body) {
  const { viewer, events } = await requestJson("/api/viewer/recommendation-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (viewer && state.bootstrap) {
    state.bootstrap.viewer = viewer;
  }
  if (events) {
    state.nearbyEvents = events;
    state.bootstrap.nearbyEvents = events;
    renderNearbyEvents();
  }
  await refreshNeighborMatches();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateHeatLayer() {
  if (!state.map || !state.map.getSource("heat-zones")) {
    return;
  }
  state.map.getSource("heat-zones").setData(heatZonesToGeoJSON(state.heatZones));
}

function matchPercentForCreator(creatorId) {
  if (!creatorId || creatorId === state.bootstrap?.viewer?.id) {
    return null;
  }
  const row = state.neighborMatches.find((m) => m.neighborId === creatorId);
  return typeof row?.percent === "number" ? row.percent : null;
}

function spotlightStorageKey(sig) {
  return `lodge-spotlight-${sig}`;
}

function hideSpotlight() {
  if (elements.matchSpotlight) {
    elements.matchSpotlight.hidden = true;
  }
}

function showSpotlight(highlight) {
  if (!elements.matchSpotlight || !highlight?.line) {
    return;
  }
  state._spotlightTargetPostId = highlight.postId || null;
  if (elements.spotlightTitle) {
    elements.spotlightTitle.textContent = `${highlight.firstName || "Neighbor"} · ${highlight.percent}% fit`;
  }
  if (elements.spotlightBody) {
    elements.spotlightBody.textContent = highlight.line;
  }
  const hasPin = Boolean(highlight.postId);
  if (elements.spotlightOpenPin) {
    elements.spotlightOpenPin.hidden = !hasPin;
    elements.spotlightOpenPin.disabled = !hasPin;
  }
  elements.matchSpotlight.hidden = false;
}

function considerSpotlight(highlight, { fromUserAction = false } = {}) {
  if (!highlight) {
    return;
  }
  const qualifies = highlight.percent >= 52 || highlight.overlappingErrand;
  if (!qualifies) {
    return;
  }
  const sig = `${highlight.neighborId}-${highlight.percent}-${highlight.postId || "x"}-${highlight.overlappingErrand ? "1" : "0"}`;
  if (!fromUserAction) {
    try {
      if (sessionStorage.getItem(spotlightStorageKey(sig))) {
        return;
      }
    } catch {
      /* ignore */
    }
  }
  showSpotlight(highlight);
}

function installSpotlight() {
  const close = () => {
    hideSpotlight();
    const h = state.matchHighlight;
    if (h) {
      const sig = `${h.neighborId}-${h.percent}-${h.postId || "x"}-${h.overlappingErrand ? "1" : "0"}`;
      try {
        sessionStorage.setItem(spotlightStorageKey(sig), "1");
      } catch {
        /* ignore */
      }
    }
  };

  elements.spotlightClose?.addEventListener("click", close);
  elements.spotlightDismiss?.addEventListener("click", close);
  elements.spotlightBackdrop?.addEventListener("click", close);

  elements.spotlightOpenPin?.addEventListener("click", async () => {
    const id = state._spotlightTargetPostId;
    if (id) {
      close();
      await loadDetail(id);
    }
  });

  const sendSpotlightFeedback = async (helpful) => {
    try {
      await postRecommendationFeedback({ helpful, source: "spotlight" });
      showLiveToast(helpful ? "We’ll surface more picks like that." : "We’ll weight those down.", {
        durationMs: 5000
      });
      close();
    } catch (e) {
      console.error(e);
      showLiveToast(e.message || "Could not save feedback");
    }
  };

  elements.spotlightHelpful?.addEventListener("click", () => {
    sendSpotlightFeedback(true).catch(console.error);
  });
  elements.spotlightNotHelpful?.addEventListener("click", () => {
    sendSpotlightFeedback(false).catch(console.error);
  });
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

function renderNearbyEvents() {
  if (!elements.nearbyEventsList) {
    return;
  }
  if (!state.nearbyEvents.length) {
    elements.nearbyEventsList.innerHTML = '<p class="empty-state">No curated events in this demo.</p>';
    return;
  }

  elements.nearbyEventsList.innerHTML = state.nearbyEvents
    .map((ev) => {
      const on = ev.youAreInterested ? "on" : "";
      const label = ev.youAreInterested ? "Saved" : "I'm in";
      const titleEsc = escapeHtml(ev.title);
      const venueEsc = escapeHtml(ev.venueLabel);
      const titleEnc = encodeURIComponent(ev.title || "");
      const venueEnc = encodeURIComponent(ev.venueLabel || "");
      return `
        <div class="event-row" data-event-id="${escapeHtml(ev.id)}">
          <div class="event-row-main">
            <div>
              <h5>${titleEsc}</h5>
              <p>${venueEsc} · ${escapeHtml(formatEventStarts(ev.startsAt))}</p>
              <p>${Number(ev.interestCount || 0)} interested nearby</p>
            </div>
            <button type="button" class="interest-btn ${on}" data-event-id="${escapeHtml(ev.id)}">${label}</button>
          </div>
          <div class="event-feedback-row">
            <span class="event-feedback-label">Useful for you?</span>
            <button type="button" class="feedback-thumb" data-feedback="1" data-event-id="${escapeHtml(ev.id)}" data-venue-enc="${venueEnc}" data-title-enc="${titleEnc}" aria-label="Yes, useful">👍</button>
            <button type="button" class="feedback-thumb" data-feedback="0" data-event-id="${escapeHtml(ev.id)}" data-venue-enc="${venueEnc}" data-title-enc="${titleEnc}" aria-label="Not useful">👎</button>
          </div>
        </div>
      `;
    })
    .join("");

  elements.nearbyEventsList.querySelectorAll(".feedback-thumb").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const helpful = btn.dataset.feedback === "1";
      try {
        await postRecommendationFeedback({
          helpful,
          source: "event",
          eventId: btn.dataset.eventId,
          venueLabel: decodeURIComponent(btn.dataset.venueEnc || ""),
          title: decodeURIComponent(btn.dataset.titleEnc || "")
        });
        showLiveToast(helpful ? "Thanks — we’ll rank similar events higher." : "Got it — we’ll show fewer like this.", {
          durationMs: 5000
        });
      } catch (e) {
        console.error(e);
        showLiveToast(e.message || "Feedback failed");
      }
    });
  });

  elements.nearbyEventsList.querySelectorAll(".interest-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.eventId;
      try {
        const { events } = await requestJson(`/api/events/${id}/interest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        state.nearbyEvents = events || [];
        state.bootstrap.nearbyEvents = state.nearbyEvents;
        renderNearbyEvents();
        await refreshNeighborMatches({ fromEventInterest: true });
      } catch (e) {
        console.error(e);
        showLiveToast(e.message || "Could not update interest");
      }
    });
  });
}

function renderHobbyChips() {
  if (!elements.hobbyChipField) {
    return;
  }
  const opts = state.hobbyOptions || [];
  elements.hobbyChipField.innerHTML = opts
    .map((h) => {
      const pressed = state.selectedHobbies.has(h) ? "true" : "false";
      return `<button type="button" class="chip-toggle" data-hobby="${escapeHtml(h)}" aria-pressed="${pressed}">${escapeHtml(
        h
      )}</button>`;
    })
    .join("");

  elements.hobbyChipField.querySelectorAll(".chip-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const h = btn.dataset.hobby;
      if (state.selectedHobbies.has(h)) {
        state.selectedHobbies.delete(h);
        btn.setAttribute("aria-pressed", "false");
      } else {
        state.selectedHobbies.add(h);
        btn.setAttribute("aria-pressed", "true");
      }
    });
  });
}

function renderQuickChoices() {
  if (!elements.quickChoiceFields) {
    return;
  }
  const viewer = state.bootstrap?.viewer || {};
  const hints = viewer.onboardingHints || {};
  const blocks = state.quickChoices || [];

  elements.quickChoiceFields.innerHTML = blocks
    .map((block) => {
      const opts = (block.options || [])
        .map((opt) => {
          const checked = hints[block.id] === opt.value ? "checked" : "";
          return `
            <label class="quick-choice-option">
              <input type="radio" name="qc-${escapeHtml(block.id)}" value="${escapeHtml(opt.value)}" ${checked} />
              <span>${escapeHtml(opt.label)}</span>
            </label>
          `;
        })
        .join("");
      return `
        <fieldset class="quick-choice-fieldset" data-qc-id="${escapeHtml(block.id)}">
          <legend class="quick-choice-legend">${escapeHtml(block.question)}</legend>
          <div class="quick-choice-options">${opts}</div>
        </fieldset>
      `;
    })
    .join("");
}

function renderErrandPresets() {
  if (!elements.errandPresetRow) {
    return;
  }
  const presets = state.errandPresets || [];
  elements.errandPresetRow.innerHTML = presets
    .map((p) => {
      const sel = state.selectedErrandPresetId === p.id ? "selected" : "";
      return `<button type="button" class="preset-chip ${sel}" data-preset-id="${escapeHtml(p.id)}">${escapeHtml(
        p.label
      )}</button>`;
    })
    .join("");

  elements.errandPresetRow.querySelectorAll(".preset-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedErrandPresetId = btn.dataset.presetId;
      renderErrandPresets();
    });
  });
}

async function refreshNeighborMatches(options = {}) {
  try {
    const { matches, highlight } = await requestJson("/api/neighbor-matches");
    state.neighborMatches = matches || [];
    state.matchHighlight = highlight || null;
    renderMapMarkers();
    if (options.fromEventInterest) {
      showLiveToast("Fit scores on the map just updated.");
    } else {
      considerSpotlight(state.matchHighlight, { fromUserAction: false });
    }
  } catch (e) {
    console.error(e);
    showLiveToast(e.message || "Could not refresh matches");
  }
}

function installSignalsAndErrands() {
  const viewer = state.bootstrap?.viewer;
  if (viewer?.hobbies?.length) {
    state.selectedHobbies = new Set(viewer.hobbies);
  }

  if (elements.willingEventsRange && viewer) {
    elements.willingEventsRange.value = String(viewer.willingToAttendMore ?? 3);
    if (elements.willingEventsValue) {
      elements.willingEventsValue.textContent = elements.willingEventsRange.value;
    }
  }

  elements.willingEventsRange?.addEventListener("input", () => {
    if (elements.willingEventsValue) {
      elements.willingEventsValue.textContent = elements.willingEventsRange.value;
    }
  });

  renderHobbyChips();
  renderQuickChoices();
  renderErrandPresets();

  elements.saveSignalsBtn?.addEventListener("click", async () => {
    const quickChoiceAnswers = {};
    elements.quickChoiceFields?.querySelectorAll(".quick-choice-fieldset").forEach((block) => {
      const qid = block.dataset.qcId;
      const picked = block.querySelector(`input[name="qc-${qid}"]:checked`);
      if (picked) {
        quickChoiceAnswers[qid] = picked.value;
      }
    });

    const hobbies = Array.from(state.selectedHobbies);
    const willingToAttendMore = Number(elements.willingEventsRange?.value ?? 3);

    try {
      const { viewer: next } = await requestJson("/api/viewer/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hobbies, quickChoiceAnswers, willingToAttendMore })
      });
      state.bootstrap.viewer = next;
      showLiveToast("Signals saved — matches refreshed.");
      await refreshNeighborMatches();
    } catch (e) {
      console.error(e);
      showLiveToast(e.message || "Save failed");
    }
  });

  elements.addErrandBtn?.addEventListener("click", async () => {
    const center = state.map
      ? state.map.getCenter()
      : { lat: state.viewport.center.lat, lng: state.viewport.center.lng };
    const customLabel = elements.errandCustomLabel?.value?.trim() || "";
    const windowMinutes = Number(elements.errandWindow?.value ?? 25);
    const openToTagAlong = Boolean(elements.errandTagAlong?.checked);
    const preset = state.errandPresets.find((p) => p.id === state.selectedErrandPresetId);

    try {
      const result = await requestJson("/api/viewer/errand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: state.selectedErrandPresetId || undefined,
          errandKey: preset?.errandKey || "custom",
          customLabel: customLabel || undefined,
          windowMinutes,
          openToTagAlong,
          lat: center.lat,
          lng: center.lng
        })
      });
      if (result.heatZones) {
        state.heatZones = result.heatZones;
        state.bootstrap.heatZones = result.heatZones;
        updateHeatLayer();
      }
      if (elements.errandCustomLabel) {
        elements.errandCustomLabel.value = "";
      }
      if (result.errandSync?.message && result.errandSync?.visibleMs) {
        state.syncToastDedupe = {
          message: result.errandSync.message,
          until: Date.now() + 8000
        };
        showLiveToast(result.errandSync.message, { durationMs: result.errandSync.visibleMs });
      } else {
        showLiveToast(`Errand logged: ${result.errand?.label || "done"}.`);
      }
      await refreshNeighborMatches();
    } catch (e) {
      console.error(e);
      showLiveToast(e.message || "Could not log errand");
    }
  });

}

function installLiveStream() {
  if (typeof EventSource === "undefined") {
    return;
  }
  const es = new EventSource("/api/stream");
  es.addEventListener("pulse", (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.kind === "sync" || data.kind === "event") {
        const dedupe = state.syncToastDedupe;
        if (
          data.kind === "sync" &&
          dedupe.message === data.message &&
          Date.now() < dedupe.until
        ) {
          refreshNeighborMatches().catch(() => {});
          return;
        }
        const durationMs =
          data.visibleMs != null ? Number(data.visibleMs) : data.kind === "event" ? 10000 : 12000;
        showLiveToast(data.message, { durationMs });
        refreshNeighborMatches().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  });
  es.addEventListener("error", () => {
    /* browser will retry */
  });
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
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
  const origin =
    post.creatorOriginNote && post.creatorId !== state.bootstrap?.viewer?.id
      ? `<p class="post-card-origin">${escapeHtml(post.creatorOriginNote)}</p>`
      : "";
  return `
    <article class="post-card post-card--strip ${selected}" data-post-id="${post.id}" role="listitem">
      <div class="post-meta">
        <p class="eyebrow">${escapeHtml(post.creatorName)} · ${escapeHtml(post.startTimeLabel)}</p>
        ${origin}
        <h5>${escapeHtml(post.label)}</h5>
        <p>${escapeHtml(post.localSpotName)} · ${escapeHtml(formatDistance(post.distanceMiles))}</p>
        <div class="tag-row">${tags}</div>
      </div>
    </article>
  `;
}

function renderPostList() {
  if (!state.posts.length) {
    elements.postList.innerHTML =
      '<p class="empty-state map-posts-empty">Pan the map or publish a ritual — open posts show here in a row.</p>';
    return;
  }

  elements.postList.innerHTML = state.posts.map(postCardMarkup).join("");
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
  const isViewer = post.creatorId === state.bootstrap.viewer.id;
  marker.className = `mapbox-post-marker${post.id === state.selectedPostId ? " selected" : ""}${
    isViewer ? " is-viewer" : ""
  }`;
  const fit = matchPercentForCreator(post.creatorId);
  const fitBlock =
    !isViewer && fit != null
      ? `<span class="marker-fit-badge" aria-label="Your fit ${fit} percent">${fit}%</span>`
      : "";
  marker.innerHTML = `<span class="marker-pin-inner"><span class="marker-name">${isViewer ? "You" : post.creatorName}</span>${fitBlock}</span>`;
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
  state.selectedPostId = postId;
  renderPostList();
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
    if (!state.map.getSource("heat-zones")) {
      state.map.addSource("heat-zones", {
        type: "geojson",
        data: heatZonesToGeoJSON(state.heatZones)
      });
      state.map.addLayer({
        id: "social-heat",
        type: "circle",
        source: "heat-zones",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "neighborCount"],
            0,
            12,
            2,
            24,
            4,
            38,
            8,
            56
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "heatIntensity"],
            0,
            "rgba(196, 106, 74, 0.12)",
            0.5,
            "rgba(212, 167, 44, 0.3)",
            1,
            "rgba(196, 106, 74, 0.45)"
          ],
          "circle-opacity": ["case", [">", ["get", "neighborCount"], 0], 0.75, 0],
          "circle-blur": 0.58,
          "circle-pitch-alignment": "map"
        }
      });
    } else {
      updateHeatLayer();
    }

    if (state.map.getSource("places")) {
      loadPosts().catch(console.error);
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

    if (state.map) {
      state.map.easeTo({
        center: [created.post.startLocation.lng, created.post.startLocation.lat],
        duration: 700
      });
    }

    await loadPosts();
    document.querySelector("#map-posts-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  state.heatZones = state.bootstrap.heatZones || [];
  state.nearbyEvents = state.bootstrap.nearbyEvents || [];
  state.errandPresets = state.bootstrap.errandPresets || [];
  state.hobbyOptions = state.bootstrap.hobbyOptions || [];
  state.quickChoices = state.bootstrap.quickChoices || [];

  elements.workspaceTitle.textContent =
    state.bootstrap.brand?.promise || "Browse routines around you and post your own anchor.";

  installComposer();
  renderNearbyEvents();
  installSignalsAndErrands();
  installSpotlight();
  installLiveStream();
  await refreshNeighborMatches();
  installListInteractions();
  installMapboxMap();

  const focusId = applyFocusFromUrl();
  if (focusId) {
    const focusedPost =
      state.posts.find((post) => post.id === focusId) ||
      (await requestJson(`/api/posts/${focusId}`)
        .then((detail) => detail.post)
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
}

window.addEventListener("resize", () => {
  state.map?.resize();
});

initialize().catch((error) => {
  console.error(error);
  if (elements.workspaceError) {
    elements.workspaceError.textContent = error.message || "Something went wrong.";
    elements.workspaceError.hidden = false;
  }
});
