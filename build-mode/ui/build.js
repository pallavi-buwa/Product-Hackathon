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
  ritualBonds: [],
  repeatTemplates: [],
  workspaceFunFacts: [],
  errandPresets: [],
  hobbyOptions: [],
  quickChoices: [],
  neighborMatches: [],
  matchHighlight: null,
  rsvpInbox: [],
  syncToastDedupe: { message: "", until: 0 },
  selectedHobbies: new Set(),
  selectedErrandPresetId: null,
  map: null,
  markers: [],
  pendingViewportFetch: null,
  neighborContactsById: {},
  viewerActivity: { openPosts: [], errands: [] },
  _pinTooltipTimer: null,
  _pinTooltipHideTimer: null,
  livingMap: { heatZones: [], generationMode: "template", copy: {} },
  privateSocialHealth: null
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
  spotlightNotHelpful: document.querySelector("#spotlight-not-helpful"),
  spotlightAvatar: document.querySelector("#spotlight-avatar"),
  mapPinTooltip: document.querySelector("#map-pin-tooltip"),
  funFactRotator: document.querySelector("#fun-fact-rotator"),
  bondsRow: document.querySelector("#bonds-row"),
  bondsEmpty: document.querySelector("#bonds-empty"),
  repeatTemplateChips: document.querySelector("#repeat-template-chips"),
  myActivityBody: document.querySelector("#my-activity-body"),
  myFavoritesBlock: document.querySelector("#my-favorites-block"),
  myFavoritesList: document.querySelector("#my-favorites-list"),
  rsvpInboxList: document.querySelector("#rsvp-inbox-list"),
  conciergeThread: document.querySelector("#concierge-thread"),
  conciergeInput: document.querySelector("#concierge-input"),
  conciergeSend: document.querySelector("#concierge-send"),
  conciergeStatus: document.querySelector("#concierge-status"),
  socialHealthBody: document.querySelector("#social-health-body"),
  socialHealthCard: document.querySelector("#social-health-card"),
  friendBloomLayer: document.querySelector("#friend-bloom-layer")
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

const FRIEND_BLOOM_MS = 1400;

function playFriendBloom() {
  const layer =
    elements.friendBloomLayer || document.getElementById("friend-bloom-layer");
  if (!layer) {
    return;
  }

  layer.setAttribute("aria-hidden", "false");
  layer.classList.remove("friend-bloom-layer--active", "friend-bloom-layer--subtle");
  void layer.offsetWidth;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const applyActive = () => {
    if (reduced) {
      layer.classList.add("friend-bloom-layer--subtle", "friend-bloom-layer--active");
    } else {
      layer.classList.add("friend-bloom-layer--active");
    }
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(applyActive);
  });

  window.clearTimeout(layer._friendBloomTimer);
  layer._friendBloomTimer = window.setTimeout(() => {
    layer.classList.remove("friend-bloom-layer--active", "friend-bloom-layer--subtle");
    layer.setAttribute("aria-hidden", "true");
  }, reduced ? 520 : FRIEND_BLOOM_MS);
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

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function updateHeatLayer() {
  if (!state.map || !state.map.getSource("heat-zones")) {
    return;
  }
  state.map.getSource("heat-zones").setData(heatZonesToGeoJSON(state.heatZones));
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
  if (!elements.matchSpotlight || highlight == null || typeof highlight.percent !== "number") {
    return;
  }
  state._spotlightTargetPostId = highlight.postId || null;
  if (elements.spotlightTitle) {
    elements.spotlightTitle.textContent = highlight.firstName || "Neighbor";
  }
  if (elements.spotlightBody) {
    elements.spotlightBody.textContent = `${highlight.percent}% fit with your profile`;
  }
  if (elements.spotlightAvatar) {
    if (highlight.avatarUrl) {
      elements.spotlightAvatar.src = highlight.avatarUrl;
      elements.spotlightAvatar.alt = `${highlight.firstName || "Neighbor"} portrait`;
      elements.spotlightAvatar.hidden = false;
    } else {
      elements.spotlightAvatar.hidden = true;
      elements.spotlightAvatar.removeAttribute("src");
    }
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
      if (helpful) {
        playFriendBloom();
      }
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

function mergeRsvpApiPayload(data) {
  if (!data) {
    return;
  }
  if (Array.isArray(data.events)) {
    state.nearbyEvents = data.events;
    state.bootstrap.nearbyEvents = data.events;
    renderNearbyEvents();
  }
  if (Array.isArray(data.inbox)) {
    state.rsvpInbox = data.inbox;
    state.bootstrap.rsvpInbox = data.inbox;
    renderRsvpInbox();
  }
}

function renderRsvpInbox() {
  if (!elements.rsvpInboxList) {
    return;
  }
  const list = state.rsvpInbox || [];
  if (!list.length) {
    elements.rsvpInboxList.innerHTML = emptyWithMascot(
      "Nothing pending — you’ll see join requests here when you host.",
      { variant: "tiny", pClass: "empty-state rsvp-inbox-empty" }
    );
    return;
  }

  elements.rsvpInboxList.innerHTML = list
    .map((r) => {
      const late =
        r.revealPolicy === "last2days"
          ? '<span class="rsvp-reveal-pill" title="Guest asked to stay hidden until 2 days before start">Late reveal</span>'
          : "";
      return `
        <div class="rsvp-inbox-row" data-request-id="${escapeHtml(r.id)}">
          <div class="rsvp-inbox-text">
            <strong>${escapeHtml(r.guestName)}</strong>
            <span class="rsvp-inbox-event">${escapeHtml(r.eventTitle)}</span>
            ${late}
          </div>
          <div class="rsvp-inbox-actions">
            <button type="button" class="primary-button rsvp-accept-btn" data-request-id="${escapeHtml(r.id)}">Accept</button>
            <button type="button" class="ghost-button rsvp-decline-btn" data-request-id="${escapeHtml(r.id)}">Decline</button>
          </div>
        </div>
      `;
    })
    .join("");

  elements.rsvpInboxList.querySelectorAll(".rsvp-accept-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const data = await requestJson(`/api/rsvp/${btn.dataset.requestId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept: true })
        });
        mergeRsvpApiPayload(data);
        showLiveToast("Accepted — they’re on the guest list.");
        await refreshNeighborMatches();
      } catch (e) {
        console.error(e);
        showLiveToast(e.message || "Could not accept");
      }
    });
  });

  elements.rsvpInboxList.querySelectorAll(".rsvp-decline-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const data = await requestJson(`/api/rsvp/${btn.dataset.requestId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept: false })
        });
        mergeRsvpApiPayload(data);
        showLiveToast("Declined.");
      } catch (e) {
        console.error(e);
        showLiveToast(e.message || "Could not decline");
      }
    });
  });
}

function renderNearbyEvents() {
  if (!elements.nearbyEventsList) {
    return;
  }
  if (!state.nearbyEvents.length) {
    elements.nearbyEventsList.innerHTML = emptyWithMascot("No curated events in this demo.", {
      variant: "tiny",
      pClass: "empty-state"
    });
    return;
  }

  elements.nearbyEventsList.innerHTML = state.nearbyEvents
    .map((ev) => {
      const on = ev.youAreInterested ? "on" : "";
      const interestLabel = ev.youAreInterested ? "Saved" : "Save";
      const titleEsc = escapeHtml(ev.title);
      const venueEsc = escapeHtml(ev.venueLabel);
      const idEsc = escapeHtml(ev.id);
      const going = Number(ev.interestCount || 0);
      let rsvpHtml = "";
      if (ev.youAreHost) {
        rsvpHtml = `<p class="event-rsvp-note">You’re hosting — use <strong>Inbox</strong> for requests.</p>`;
      } else if (ev.yourRsvp === "accepted") {
        rsvpHtml = `<p class="event-rsvp-note event-rsvp-note--ok">Host accepted your RSVP.</p>`;
      } else if (ev.yourRsvp === "rejected") {
        rsvpHtml = `<p class="event-rsvp-note">Host declined this time.</p>`;
      } else if (ev.yourRsvp === "pending") {
        rsvpHtml = `<p class="event-rsvp-note">Request sent — host will respond.</p>`;
      } else {
        rsvpHtml = `
          <label class="event-pick-label">
            <input type="checkbox" class="event-pick-cb" data-event-id="${idEsc}" />
            <span>Ask host for a spot</span>
          </label>
          <div class="event-rsvp-form hidden" data-rsvp-panel="${idEsc}">
            <label class="checkbox-inline event-hide-label">
              <input type="checkbox" class="event-hide-until-cb" data-event-id="${idEsc}" />
              Hide my name until 2 days before start
            </label>
            <button type="button" class="primary-button event-rsvp-send" data-event-id="${idEsc}">Send RSVP</button>
          </div>
        `;
      }

      return `
        <div class="event-row event-row--compact" data-event-id="${idEsc}">
          <div class="event-row-main">
            <div class="event-row-text">
              <h5>${titleEsc}</h5>
              <p class="event-meta-line">${venueEsc} · ${escapeHtml(formatEventStarts(ev.startsAt))} · ${going} going</p>
              ${rsvpHtml}
            </div>
            <button type="button" class="interest-btn interest-btn--small ${on}" data-event-id="${idEsc}">${interestLabel}</button>
          </div>
        </div>
      `;
    })
    .join("");

  elements.nearbyEventsList.querySelectorAll(".event-pick-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const panel = elements.nearbyEventsList.querySelector(`[data-rsvp-panel="${cb.dataset.eventId}"]`);
      if (panel) {
        panel.classList.toggle("hidden", !cb.checked);
      }
    });
  });

  elements.nearbyEventsList.querySelectorAll(".event-rsvp-send").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.eventId;
      const pick = elements.nearbyEventsList.querySelector(`.event-pick-cb[data-event-id="${id}"]`);
      if (!pick?.checked) {
        showLiveToast("Check “Ask host for a spot” first.");
        return;
      }
      const hideCb = elements.nearbyEventsList.querySelector(`.event-hide-until-cb[data-event-id="${id}"]`);
      const revealPolicy = hideCb?.checked ? "last2days" : "always";
      try {
        const data = await requestJson(`/api/events/${id}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revealPolicy })
        });
        if (data.duplicate) {
          showLiveToast("You already have a pending request for this event.");
          mergeRsvpApiPayload(data);
          return;
        }
        mergeRsvpApiPayload(data);
        showLiveToast(
          revealPolicy === "last2days"
            ? "RSVP sent — host may not see your name until 2 days before."
            : "RSVP sent — host can respond anytime."
        );
        playFriendBloom();
      } catch (e) {
        console.error(e);
        showLiveToast(e.message || "RSVP failed");
      }
    });
  });

  elements.nearbyEventsList.querySelectorAll(".interest-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.eventId;
      const wasInterested = Boolean(
        state.nearbyEvents.find((e) => e.id === id)?.youAreInterested
      );
      try {
        const { events } = await requestJson(`/api/events/${id}/interest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        state.nearbyEvents = events || [];
        state.bootstrap.nearbyEvents = state.nearbyEvents;
        const nowInterested = Boolean(
          state.nearbyEvents.find((e) => e.id === id)?.youAreInterested
        );
        renderNearbyEvents();
        await refreshNeighborMatches({ fromEventInterest: true });
        if (!wasInterested && nowInterested) {
          playFriendBloom();
        }
      } catch (e) {
        console.error(e);
        showLiveToast(e.message || "Could not update interest");
      }
    });
  });
}

function installConciergeChat() {
  const thread = elements.conciergeThread;
  const input = elements.conciergeInput;
  const sendBtn = elements.conciergeSend;
  const status = elements.conciergeStatus;
  if (!thread || !input || !sendBtn) {
    return;
  }

  const history = [];

  function appendBubble(role, text) {
    const div = document.createElement("div");
    div.className = `concierge-bubble concierge-bubble--${role}`;
    div.textContent = text;
    thread.appendChild(div);
    thread.scrollTop = thread.scrollHeight;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) {
      return;
    }
    input.value = "";
    appendBubble("user", text);
    history.push({ role: "user", content: text });
    sendBtn.disabled = true;
    if (status) {
      status.hidden = false;
      status.textContent = "Thinking…";
    }
    try {
      const data = await requestJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
      });
      if (data.error === "missing_key") {
        if (status) {
          status.textContent = "Add OPENAI_API_KEY on the server to enable replies.";
        }
        appendBubble("assistant", "Demo mode: set OPENAI_API_KEY to get concierge replies.");
        return;
      }
      if (data.error || !data.reply) {
        if (status) {
          status.textContent = data.error || "No reply";
        }
        appendBubble("assistant", "Could not get a reply — try again.");
        return;
      }
      history.push({ role: "assistant", content: data.reply });
      appendBubble("assistant", data.reply);
      if (status) {
        status.textContent = "";
        status.hidden = true;
      }
    } catch (e) {
      console.error(e);
      if (status) {
        status.textContent = e.message || "Request failed";
      }
      appendBubble("assistant", "Something went wrong — try again.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", () => {
    void send();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void send();
    }
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

function formatShortTime(iso) {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isActivityFavorite(id) {
  return (state.bootstrap?.viewer?.activityFavorites || []).some((f) => f.id === id);
}

function hidePinTooltip() {
  const tt = elements.mapPinTooltip;
  if (tt) {
    tt.hidden = true;
    tt.innerHTML = "";
  }
}

function positionPinTooltip(anchorEl) {
  const tt = elements.mapPinTooltip;
  const shell = tt?.closest(".map-shell");
  if (!tt || !shell || !anchorEl) {
    return;
  }
  const shellRect = shell.getBoundingClientRect();
  const r = anchorEl.getBoundingClientRect();
  const tw = 300;
  const left = Math.min(
    Math.max(10, r.left - shellRect.left + r.width / 2 - tw / 2),
    shellRect.width - tw - 10
  );
  const top = Math.min(r.bottom - shellRect.top + 10, shellRect.height - 120);
  tt.style.width = `${tw}px`;
  tt.style.left = `${left}px`;
  tt.style.top = `${top}px`;
}

function buildErrandRowsHtml(contact) {
  const errands = (contact.errands || []).slice(0, 6);
  return errands
    .map((log) => {
      const fav = isActivityFavorite(log.id);
      return `<li class="contact-errand-row">
      <div class="contact-errand-main">
        <span>${escapeHtml(log.label)}</span>
        <span class="contact-errand-meta">${escapeHtml(formatShortTime(log.loggedAt))}</span>
      </div>
      <div class="contact-errand-actions">
        <button type="button" class="ghost-button contact-fav-btn" data-log-id="${escapeAttr(log.id)}">${fav ? "Saved" : "Favorite"}</button>
        <button type="button" class="ghost-button contact-repeat-btn" data-errand-key="${escapeAttr(
          log.errandKey
        )}" data-label="${escapeAttr(log.label)}">Repeat</button>
      </div>
    </li>`;
    })
    .join("");
}

function bindTooltipHoverLeave() {
  const tt = elements.mapPinTooltip;
  if (!tt) {
    return;
  }
  tt.onmouseenter = () => {
    if (state._pinTooltipHideTimer) {
      clearTimeout(state._pinTooltipHideTimer);
    }
  };
  tt.onmouseleave = () => {
    state._pinTooltipHideTimer = setTimeout(() => hidePinTooltip(), 180);
  };
}

function openPinTooltip(anchorEl, post) {
  const tt = elements.mapPinTooltip;
  if (!tt || !post) {
    return;
  }
  const contact = state.neighborContactsById[post.creatorId];
  if (!contact) {
    return;
  }
  const fitLineRaw = contact.fitLine || "";
  const fitLineHtml =
    fitLineRaw && !(post.creatorId === state.bootstrap?.viewer?.id && fitLineRaw === "You")
      ? `<p class="tt-fit">${escapeHtml(fitLineRaw)}</p>`
      : "";
  const ritual = contact.openRitual
    ? `<p class="tt-ritual"><strong>Open ritual:</strong> ${escapeHtml(contact.openRitual.label)} @ ${escapeHtml(
        contact.openRitual.localSpotName
      )} · ${escapeHtml(contact.openRitual.startTimeLabel)}</p>`
    : `<p class="tt-muted">No open ritual from them in seed right now.</p>`;
  const routines = (contact.routineHints || []).length
    ? `<p class="tt-routines"><strong>Often logs:</strong> ${contact.routineHints.map(escapeHtml).join(" · ")}</p>`
    : "";
  const fun = contact.funFact ? `<p class="tt-fun">${escapeHtml(contact.funFact)}</p>` : "";
  const errandsBlock = (contact.errands || []).length
    ? `<div class="tt-errands"><strong>Errands logged</strong><ul class="tt-errand-ul">${buildErrandRowsHtml(contact)}</ul></div>`
    : `<p class="tt-muted">No demo errand history for them.</p>`;

  tt.innerHTML = `
    <div class="pin-tooltip-inner">
      <div class="tt-head">
        <img src="${escapeAttr(contact.avatarUrl)}" alt="" width="40" height="40" class="tt-avatar" />
        <div>
          <strong>${escapeHtml(contact.firstName)}</strong>
          ${fitLineHtml}
        </div>
      </div>
      ${fun}
      ${ritual}
      ${routines}
      ${errandsBlock}
    </div>
  `;
  tt.hidden = false;
  positionPinTooltip(anchorEl);
  bindTooltipHoverLeave();

  tt.querySelectorAll(".contact-fav-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const logId = btn.dataset.logId;
      const log = (contact.errands || []).find((e) => e.id === logId);
      if (log) {
        toggleActivityFavoriteEntry({
          id: log.id,
          kind: "neighbor_errand",
          sourceUserId: contact.userId,
          label: log.label,
          errandKey: log.errandKey
        });
      }
    });
  });
  tt.querySelectorAll(".contact-repeat-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      repeatErrandFromLog(btn.dataset.errandKey, btn.dataset.label);
    });
  });
}

async function toggleActivityFavoriteEntry(entry) {
  const wasFav = isActivityFavorite(entry.id);
  try {
    const { viewer } = await requestJson("/api/viewer/activity-favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry })
    });
    state.bootstrap.viewer = viewer;
    renderMyFavorites();
    renderBondsRow();
    showLiveToast(wasFav ? "Removed from favorites." : "Saved to favorites.");
  } catch (e) {
    showLiveToast(e.message || "Could not update favorites");
  }
}

function repeatErrandFromLog(errandKey, label) {
  const preset = state.errandPresets.find((p) => p.errandKey === errandKey);
  if (preset) {
    state.selectedErrandPresetId = preset.id;
    renderErrandPresets();
  } else {
    state.selectedErrandPresetId = null;
    renderErrandPresets();
  }
  if (elements.errandCustomLabel) {
    elements.errandCustomLabel.value = label || "";
  }
  document.getElementById("errands-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  showLiveToast("Quick errand prefilled — adjust window, then log.");
}

function renderMyActivity() {
  const el = elements.myActivityBody;
  if (!el) {
    return;
  }
  const va = state.viewerActivity || { openPosts: [], errands: [] };
  const posts = va.openPosts || [];
  const errands = va.errands || [];
  if (!posts.length && !errands.length) {
    el.innerHTML = emptyWithMascot(
      "No open rituals yet — publish from the left. Logged errands appear here too.",
      { variant: "tiny", pClass: "my-activity-empty" }
    );
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
      const win = `${formatShortTime(e.windowStart)} – ${formatShortTime(e.windowEnd)}`;
      html += `<li><strong>${escapeHtml(e.label)}</strong><span>${escapeHtml(e.errandKey)} · ${escapeHtml(
        win
      )}</span></li>`;
    }
    html += "</ul>";
  }
  el.innerHTML = html;
}

function renderMyFavorites() {
  const favs = state.bootstrap?.viewer?.activityFavorites || [];
  const block = elements.myFavoritesBlock;
  const list = elements.myFavoritesList;
  if (!block || !list) {
    return;
  }
  if (!favs.length) {
    block.hidden = true;
    list.innerHTML = "";
    return;
  }
  block.hidden = false;
  list.innerHTML = favs
    .map(
      (f) => `
    <div class="fav-row">
      <span class="fav-row-label">${escapeHtml(f.label)}</span>
      <div class="fav-row-actions">
        <button type="button" class="ghost-button fav-repeat-btn" data-fav-id="${escapeAttr(f.id)}">Repeat</button>
        <button type="button" class="ghost-button fav-remove-btn" data-fav-id="${escapeAttr(f.id)}">Remove</button>
      </div>
    </div>`
    )
    .join("");
  list.querySelectorAll(".fav-repeat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = favs.find((x) => x.id === btn.dataset.favId);
      if (f) {
        repeatErrandFromLog(f.errandKey, f.label);
      }
    });
  });
  list.querySelectorAll(".fav-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const f = favs.find((x) => x.id === btn.dataset.favId);
      if (f) {
        await toggleActivityFavoriteEntry({
          id: f.id,
          kind: f.kind || "neighbor_errand",
          sourceUserId: f.sourceUserId,
          label: f.label,
          errandKey: f.errandKey
        });
      }
    });
  });
}

function syncViewerContactOpenRitual() {
  const vid = state.bootstrap?.viewer?.id;
  const root = state.neighborContactsById;
  if (!vid || !root || !root[vid]) {
    return;
  }
  const mine = state.posts.filter((p) => p.creatorId === vid);
  const first = mine[0];
  root[vid].openRitual = first
    ? {
        label: first.label,
        localSpotName: first.localSpotName,
        startTimeLabel: first.startTimeLabel
      }
    : null;
}

async function focusNeighborOnMap(neighborId) {
  if (!state.map) {
    showLiveToast("Map is still loading — try again in a moment.");
    return;
  }
  await loadPosts();
  const post = state.posts.find((p) => p.creatorId === neighborId);
  if (post) {
    await loadDetail(post.id);
    document.querySelector("#map-nearby-posts-block")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showLiveToast(`Focused ${post.creatorName}'s pin.`);
    return;
  }
  showLiveToast("Not in this map frame — zoom out or check back when they post.");
}

function renderBondsRow() {
  if (!elements.bondsRow) {
    return;
  }
  const bonds = state.ritualBonds || [];
  if (elements.bondsEmpty) {
    elements.bondsEmpty.hidden = bonds.length > 0;
  }
  if (!bonds.length) {
    elements.bondsRow.innerHTML = "";
    return;
  }
  elements.bondsRow.innerHTML = bonds
    .map((b) => {
      const contact = state.neighborContactsById[b.neighborId] || {};
      const fit = escapeHtml(contact.fitLine || "");
      const errandsHtml =
        (contact.errands || []).length > 0
          ? `<ul class="bond-errand-ul">${buildErrandRowsHtml(contact)}</ul>`
          : `<p class="bond-no-errands">No demo errands on file.</p>`;
      const ritual = contact.openRitual
        ? `<p class="bond-open-ritual"><strong>Open:</strong> ${escapeHtml(contact.openRitual.label)} @ ${escapeHtml(
            contact.openRitual.localSpotName
          )}</p>`
        : "";
      return `
    <div class="bond-tile bond-tile--contact" role="listitem" data-neighbor-id="${escapeHtml(b.neighborId)}">
      <img class="bond-tile-avatar" src="${escapeAttr(b.avatarUrl)}" alt="" width="44" height="44" loading="lazy" />
      <div class="bond-tile-body">
        <strong>${escapeHtml(b.firstName)}</strong>
        <p class="bond-tile-fit">${fit}</p>
        <span class="bond-tile-meta">${b.timesTogether}× together · last: ${escapeHtml(b.lastSharedLabel)}</span>
        ${b.funFact ? `<span class="bond-tile-fact">${escapeHtml(b.funFact)}</span>` : ""}
        ${ritual}
        <p class="bond-errands-label">Their logged errands</p>
        ${errandsHtml}
        <button type="button" class="ghost-button bond-focus-btn" data-neighbor-id="${escapeHtml(b.neighborId)}">Show on map</button>
      </div>
    </div>`;
    })
    .join("");
  elements.bondsRow.querySelectorAll(".bond-focus-btn").forEach((btn) => {
    btn.addEventListener("click", () => focusNeighborOnMap(btn.dataset.neighborId));
  });
  elements.bondsRow.querySelectorAll(".bond-tile--contact").forEach((tile) => {
    const nid = tile.dataset.neighborId;
    const contact = state.neighborContactsById[nid];
    if (!contact) {
      return;
    }
    tile.querySelectorAll(".contact-fav-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const logId = btn.dataset.logId;
        const log = (contact.errands || []).find((e) => e.id === logId);
        if (log) {
          toggleActivityFavoriteEntry({
            id: log.id,
            kind: "neighbor_errand",
            sourceUserId: contact.userId,
            label: log.label,
            errandKey: log.errandKey
          });
        }
      });
    });
    tile.querySelectorAll(".contact-repeat-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        repeatErrandFromLog(btn.dataset.errandKey, btn.dataset.label);
      });
    });
  });
}

function applyRepeatTemplate(tpl) {
  if (!tpl || !elements.composerForm) {
    return;
  }
  const f = elements.composerForm.elements;
  f.label.value = tpl.label || "";
  if (elements.routineTypeSelect && tpl.type) {
    elements.routineTypeSelect.value = tpl.type;
  }
  f.localSpotName.value = tpl.localSpotName || "";
  f.desiredGroupSize.value = String(tpl.desiredGroupSize ?? 2);
  f.cadencePerWeek.value = String(tpl.cadencePerWeek ?? 2);
  f.durationMinutes.value = String(tpl.durationMinutes ?? 40);
  f.contextTags.value = Array.isArray(tpl.contextTags) ? tpl.contextTags.join(", ") : "";
  if (tpl.errandPresetId) {
    const presetExists = state.errandPresets.some((p) => p.id === tpl.errandPresetId);
    if (presetExists) {
      state.selectedErrandPresetId = tpl.errandPresetId;
      renderErrandPresets();
    }
  }
  document.querySelector(".composer-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  showLiveToast("Composer prefilled — tweak time, then publish.");
}

function renderRepeatTemplateChips() {
  if (!elements.repeatTemplateChips) {
    return;
  }
  const templates = state.repeatTemplates || [];
  elements.repeatTemplateChips.innerHTML = templates
    .map(
      (t) => `
    <button type="button" class="repeat-template-chip repeat-template-chip--compact" data-template-id="${escapeHtml(
      t.id
    )}" title="${escapeHtml([t.label, t.buddyLine].filter(Boolean).join(" — "))}">
      <span class="repeat-chip-title">${escapeHtml(t.label)}</span>
    </button>`
    )
    .join("");
  elements.repeatTemplateChips.querySelectorAll(".repeat-template-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.templateId;
      const tpl = templates.find((x) => x.id === id);
      applyRepeatTemplate(tpl);
    });
  });
}

function startFunFactRotator() {
  const facts = state.workspaceFunFacts || [];
  if (!elements.funFactRotator || !facts.length) {
    return;
  }
  let i = 0;
  elements.funFactRotator.textContent = facts[0];
  if (state._funFactTimer) {
    clearInterval(state._funFactTimer);
  }
  if (facts.length < 2) {
    return;
  }
  state._funFactTimer = setInterval(() => {
    i = (i + 1) % facts.length;
    elements.funFactRotator.textContent = facts[i];
  }, 12000);
}

function installTrustRepeatPanel() {
  renderMyActivity();
  renderMyFavorites();
  renderBondsRow();
  renderRepeatTemplateChips();
  startFunFactRotator();
}

function renderPrivateSocialHealth() {
  const block = state.bootstrap?.privateSocialHealth;
  if (!elements.socialHealthBody || !elements.socialHealthCard) {
    return;
  }
  if (!block?.narrative) {
    elements.socialHealthCard.hidden = true;
    return;
  }
  elements.socialHealthCard.hidden = false;
  elements.socialHealthBody.textContent = block.narrative;
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

function patchContactsFromMatches(matches) {
  const root = state.neighborContactsById;
  if (!root || !matches) {
    return;
  }
  for (const m of matches) {
    const c = root[m.neighborId];
    if (c && typeof m.percent === "number") {
      c.fitPercent = m.percent;
      c.fitLine = `${m.percent}% fit with your profile`;
    }
  }
}

async function refreshNeighborMatches(options = {}) {
  try {
    const { matches, highlight } = await requestJson("/api/neighbor-matches");
    state.neighborMatches = matches || [];
    state.matchHighlight = highlight || null;
    patchContactsFromMatches(matches);
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
      if (result.viewerActivity) {
        state.viewerActivity = result.viewerActivity;
        state.bootstrap.viewerActivity = result.viewerActivity;
        renderMyActivity();
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
  const isViewer = post.creatorId === state.bootstrap?.viewer?.id;
  const avatarSrc = post.creatorAvatarUrl || "";
  const bondLine =
    post.bondBlurb && !isViewer
      ? `<p class="post-card-bond-line">${escapeHtml(post.bondBlurb)}</p>`
      : "";
  const avatarBlock = isViewer
    ? `<div class="post-card-avatar post-card-avatar--you post-card-avatar--sm" aria-hidden="true">You</div>`
    : `<img class="post-card-avatar post-card-avatar--sm" src="${escapeAttr(avatarSrc)}" alt="" width="40" height="40" loading="lazy" />`;
  return `
    <article class="post-card post-card--strip post-card--compact ${selected}" data-post-id="${post.id}" role="listitem">
      <div class="post-card-row">
        ${avatarBlock}
        <div class="post-meta">
          <p class="post-card-kicker">${escapeHtml(post.creatorName)} · ${escapeHtml(post.startTimeLabel)}</p>
          ${bondLine}
          <h5>${escapeHtml(post.label)}</h5>
          <p class="post-card-where">${escapeHtml(post.localSpotName)} · ${escapeHtml(formatDistance(post.distanceMiles))}</p>
          <div class="tag-row">${tags}</div>
        </div>
      </div>
    </article>
  `;
}

function mascotMarkup(variant = "inline") {
  const map = {
    inline: "lodge-mascot-wrap--inline",
    tiny: "lodge-mascot-wrap--tiny",
    micro: "lodge-mascot-wrap--micro"
  };
  const cls = map[variant] || map.inline;
  const size = variant === "tiny" ? 38 : variant === "micro" ? 30 : 48;
  return `<span class="lodge-mascot-wrap ${cls}" aria-hidden="true">
  <img class="lodge-mascot-img" src="/lodge-mascot.svg" width="${size}" height="${size}" alt="" decoding="async" />
</span>`;
}

function emptyWithMascot(messageHtml, { variant = "tiny", extraWrapClass = "", pClass = "empty-state" } = {}) {
  return `<div class="empty-with-mascot ${extraWrapClass}" role="presentation">
    ${mascotMarkup(variant)}
    <p class="${pClass}">${messageHtml}</p>
  </div>`;
}

function renderPostList() {
  if (!state.posts.length) {
    elements.postList.innerHTML = emptyWithMascot(
      "Pan the map or publish a ritual — open posts show here in a row.",
      { variant: "inline", extraWrapClass: "empty-with-mascot--spacious", pClass: "empty-state map-posts-empty" }
    );
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
  marker.setAttribute(
    "aria-label",
    `${isViewer ? "Your" : post.creatorName}'s ritual pin — hover for details`
  );
  const face = !isViewer
    ? `<img class="marker-avatar" src="${escapeAttr(post.creatorAvatarUrl || "")}" alt="" width="34" height="34" />`
    : `<span class="marker-avatar marker-avatar--you" aria-hidden="true">Y</span>`;
  marker.innerHTML = `<span class="marker-pin-inner">${face}<span class="marker-name">${isViewer ? "You" : post.creatorName}</span></span>`;
  marker.addEventListener("click", async (event) => {
    event.stopPropagation();
    hidePinTooltip();
    await loadDetail(post.id);
  });
  marker.addEventListener("mouseenter", () => {
    if (state._pinTooltipHideTimer) {
      clearTimeout(state._pinTooltipHideTimer);
    }
    openPinTooltip(marker, post);
  });
  marker.addEventListener("mouseleave", () => {
    state._pinTooltipHideTimer = setTimeout(() => hidePinTooltip(), 200);
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
  syncViewerContactOpenRitual();
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

function mapboxToken() {
  return String(window.__MAPBOX_TOKEN || "").trim();
}

function renderMapUnavailable(message) {
  const box = elements.mapElement;
  if (!box) {
    return;
  }
  const fileProto = window.location.protocol === "file:";
  box.innerHTML = `
    <div class="map-unavailable" role="alert">
      <strong>Map not loading</strong>
      <p class="map-unavailable-lead">${message}</p>
      <ul class="map-unavailable-list">
        <li>Use a <strong>Mapbox public token</strong> that starts with <code>pk.</code> from
          <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener">Mapbox access tokens</a>
          — not an OpenAI key.</li>
        <li>Set <code>MAPBOX_TOKEN</code> in <code>build-mode/.env</code> or run
          <code>export MAPBOX_TOKEN=pk.…</code> in the same terminal, then <code>npm start</code>.</li>
        <li>Open <strong>http://localhost:3030/build</strong> after starting the server
          ${fileProto ? "(you are on <code>file://</code> — use the local server URL instead)." : "."}</li>
        <li>Restart the Node server after changing the token.</li>
      </ul>
    </div>
  `;
}

function installMapboxMap() {
  const token = mapboxToken();
  if (!token) {
    renderMapUnavailable("No Mapbox token was sent to this page (empty <code>MAPBOX_TOKEN</code>).");
    return;
  }
  if (!token.startsWith("pk.")) {
    renderMapUnavailable(
      "Your token must start with <code>pk.</code> (Mapbox public token). Secret keys or other prefixes will not work here."
    );
    return;
  }
  if (typeof mapboxgl === "undefined") {
    renderMapUnavailable("Mapbox GL JS did not load (network blocked or script error). Check the browser console.");
    return;
  }

  mapboxgl.accessToken = token;
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

  state.map.on("movestart", () => {
    hidePinTooltip();
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

    if (created.viewerActivity) {
      state.viewerActivity = created.viewerActivity;
      state.bootstrap.viewerActivity = created.viewerActivity;
      renderMyActivity();
    }

    await loadPosts();
    document.querySelector("#map-nearby-posts-block")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  state.ritualBonds = state.bootstrap.ritualBonds || [];
  state.repeatTemplates = state.bootstrap.repeatTemplates || [];
  state.workspaceFunFacts = state.bootstrap.workspaceFunFacts || [];
  state.errandPresets = state.bootstrap.errandPresets || [];
  state.hobbyOptions = state.bootstrap.hobbyOptions || [];
  state.quickChoices = state.bootstrap.quickChoices || [];
  state.neighborContactsById = state.bootstrap.neighborContactsById || {};
  state.viewerActivity = state.bootstrap.viewerActivity || { openPosts: [], errands: [] };
  state.rsvpInbox = state.bootstrap.rsvpInbox || [];
  state.livingMap = state.bootstrap.livingMap || state.livingMap;
  state.privateSocialHealth = state.bootstrap.privateSocialHealth || null;

  elements.workspaceTitle.textContent =
    state.bootstrap.brand?.promise || "Browse routines around you and post your own anchor.";

  renderPrivateSocialHealth();
  installComposer();
  installTrustRepeatPanel();
  renderRsvpInbox();
  renderNearbyEvents();
  installConciergeChat();
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
