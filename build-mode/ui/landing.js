const state = {
  bootstrap: null,
  liveFeed: { stats: {}, updates: [] },
  livingMap: { generationMode: "template" },
  globeMap: null
};

const elements = {
  heroTitle: document.querySelector("#hero-title"),
  heroText: document.querySelector("#hero-text"),
  globeMap: document.querySelector("#globe-map")
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.detail || error.error || "Request failed");
  }

  return response.json();
}

function renderBrandCopy() {
  const brand = state.bootstrap?.brand || {};
  elements.heroTitle.textContent =
    brand.heroTitle || brand.promise || "Let everyday routines feel a little less solitary.";
  elements.heroText.textContent =
    brand.heroText || "Lodge helps you share the quiet parts of everyday life.";
}

function renderHeroMetrics() {
  const stats = state.liveFeed.stats || {};
  const aiOn = state.livingMap?.generationMode === "openai";
  const chips = [
    { label: "Open posts", value: stats.openPosts ?? 0 },
    { label: "Routine neighbors", value: stats.activeNeighbors ?? 0 },
    { label: "Timely nudges", value: stats.liveNudges ?? 0 },
    {
      label: aiOn ? " OpenAI copy" : " Template copy",
      value: aiOn ? "On" : "Off",
      subtle: true
    }
  ];
  elements.heroMetrics.innerHTML = chips
    .map((item) => {
      const cls = item.subtle ? "metric-chip metric-chip-subtle" : "metric-chip";
      return `<div class="${cls}"><strong>${item.value}</strong>${item.label}</div>`;
    })
    .join("");
}

function globeGeoJson() {
  const signals = state.bootstrap?.globeSignals?.length
    ? state.bootstrap.globeSignals
    : (state.bootstrap?.featuredPosts || []).map((post) => ({
      id: post.id,
      label: post.label,
      subtitle: `${post.creatorName} near ${post.localSpotName}`,
      lat: post.startLocation.lat,
      lng: post.startLocation.lng
    }));
  return {
    type: "FeatureCollection",
    features: signals.map((signal) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [signal.lng, signal.lat]
      },
      properties: {
        id: signal.id,
        label: signal.label,
        subtitle: signal.subtitle || ""
      }
    }))
  };
}

function installGlobeMarkers() {
  if (!state.globeMap || !globeGeoJson().features.length) {
    return;
  }

  if (state.globeMap.getSource("featured-posts")) {
    state.globeMap.getSource("featured-posts").setData(globeGeoJson());
    return;
  }

  state.globeMap.addSource("featured-posts", {
    type: "geojson",
    data: globeGeoJson()
  });

  state.globeMap.addLayer({
    id: "featured-posts-glow",
    type: "circle",
    source: "featured-posts",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 3.2, 2, 5.4],
      "circle-color": "#D4A72C",
      "circle-opacity": 0.38,
      "circle-blur": 0.9
    }
  });

  state.globeMap.addLayer({
    id: "featured-posts-core",
    type: "circle",
    source: "featured-posts",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 0.95, 2, 1.8],
      "circle-color": "#FFF4C7",
      "circle-stroke-width": 0.8,
      "circle-stroke-color": "#D4A72C"
    }
  });

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 14
  });

  state.globeMap.on("mouseenter", "featured-posts-core", () => {
    state.globeMap.getCanvas().style.cursor = "pointer";
  });

  state.globeMap.on("mouseleave", "featured-posts-core", () => {
    state.globeMap.getCanvas().style.cursor = "";
    popup.remove();
  });

  state.globeMap.on("mousemove", "featured-posts-core", (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }

    popup
      .setLngLat(feature.geometry.coordinates)
      .setHTML(
        `<strong>${feature.properties.label}</strong><br />${feature.properties.subtitle}`
      )
      .addTo(state.globeMap);
  });
}

function mapboxToken() {
  return String(window.__MAPBOX_TOKEN || "").trim();
}

function renderGlobeUnavailable(message) {
  const box = elements.globeMap;
  if (!box) {
    return;
  }
  const fileProto = window.location.protocol === "file:";
  box.innerHTML = `
    <div class="map-unavailable globe-unavailable" role="alert">
      <strong>Globe not loading</strong>
      <p class="map-unavailable-lead">${message}</p>
      <ul class="map-unavailable-list">
        <li>Add a <code>pk.</code> Mapbox token via <code>MAPBOX_TOKEN</code> in <code>build-mode/.env</code> or export it before <code>npm start</code>.</li>
        <li>Open the site at <strong>http://localhost:3030/</strong> from the server
          ${fileProto ? "(not <code>file://</code>)." : "."}</li>
      </ul>
    </div>
  `;
}

function installGlobe() {
  const token = mapboxToken();
  if (!token) {
    renderGlobeUnavailable("No Mapbox token (empty).");
    return;
  }
  if (!token.startsWith("pk.")) {
    renderGlobeUnavailable("Token must start with pk. (Mapbox public token).");
    return;
  }
  if (typeof mapboxgl === "undefined") {
    renderGlobeUnavailable("Mapbox GL JS failed to load.");
    return;
  }

  mapboxgl.accessToken = token;
  state.globeMap = new mapboxgl.Map({
    container: elements.globeMap,
    style: "mapbox://styles/mapbox/satellite-v9",
    center: [-100, 38],
    zoom: 1.8,
    projection: "globe",
    interactive: true,
    attributionControl: false,
    dragRotate: true,
    touchZoomRotate: true
  });

  state.globeMap.on("style.load", () => {
    state.globeMap.setFog({
      color: "rgb(247, 245, 242)",
      "high-color": "rgb(244, 224, 181)",
      "space-color": "rgb(31, 61, 43)",
      "horizon-blend": 0.15,
      "star-intensity": 0.2
    });
  });

  state.globeMap.on("load", () => {
    installGlobeMarkers();
  });

  state.globeMap.on("error", (event) => {
    console.error("Landing globe error:", event?.error || event);
  });
}

async function initialize() {
  state.bootstrap = await requestJson("/api/bootstrap");
  state.liveFeed = state.bootstrap.liveFeed;
  state.livingMap = state.bootstrap.livingMap || state.livingMap;
  renderBrandCopy();
  installGlobe();
}

window.addEventListener("resize", () => {
  state.globeMap?.resize();
});

initialize().catch((error) => {
  console.error(error);
});
