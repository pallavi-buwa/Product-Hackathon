const MAPBOX_TOKEN = window.__MAPBOX_TOKEN || "";

const state = {
  bootstrap: null,
  liveFeed: { stats: {}, updates: [] },
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

function installGlobe() {
  if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.") || typeof mapboxgl === "undefined") {
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;
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
  renderBrandCopy();
  installGlobe();
}

window.addEventListener("resize", () => {
  state.globeMap?.resize();
});

initialize().catch((error) => {
  console.error(error);
});
