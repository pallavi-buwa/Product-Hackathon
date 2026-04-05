const MAPBOX_TOKEN = window.__MAPBOX_TOKEN || "";

const state = {
  bootstrap: null,
  liveFeed: { stats: {}, updates: [] },
  globeMap: null
};

const elements = {
  heroTitle: document.querySelector("#hero-title"),
  heroText: document.querySelector("#hero-text"),
  heroMetrics: document.querySelector("#hero-metrics"),
  focusFeatured: document.querySelector("#focus-featured"),
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
  elements.heroTitle.textContent = brand.heroTitle || brand.promise || "Build shared rituals";
  elements.heroText.textContent =
    brand.heroText || "Lodge helps you turn ordinary routines into something shared.";
}

function renderHeroMetrics() {
  const stats = state.liveFeed.stats || {};
  elements.heroMetrics.innerHTML = [
    { label: "Open posts", value: stats.openPosts ?? 0 },
    { label: "Routine neighbors", value: stats.activeNeighbors ?? 0 },
    { label: "Timely nudges", value: stats.liveNudges ?? 0 }
  ]
    .map(
      (item) =>
        `<div class="metric-chip"><strong>${item.value}</strong>${item.label}</div>`
    )
    .join("");
}

function globeGeoJson() {
  const posts = state.bootstrap?.featuredPosts || [];
  return {
    type: "FeatureCollection",
    features: posts.slice(0, 10).map((post) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [post.startLocation.lng, post.startLocation.lat]
      },
      properties: {
        id: post.id,
        label: post.label,
        creatorName: post.creatorName,
        spot: post.localSpotName
      }
    }))
  };
}

function installGlobeMarkers() {
  if (!state.globeMap || !state.bootstrap?.featuredPosts?.length) {
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 6, 3, 9],
      "circle-color": "#D4A72C",
      "circle-opacity": 0.26,
      "circle-blur": 0.9
    }
  });

  state.globeMap.addLayer({
    id: "featured-posts-core",
    type: "circle",
    source: "featured-posts",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 1.8, 3, 3.2],
      "circle-color": "#FFF4C7",
      "circle-stroke-width": 1,
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
        `<strong>${feature.properties.label}</strong><br />${feature.properties.creatorName} near ${feature.properties.spot}`
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
    center: [-25, 24],
    zoom: 1.45,
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

function installActions() {
  elements.focusFeatured.addEventListener("click", () => {
    const featured = state.bootstrap?.featuredPosts?.[0];
    if (!featured) {
      window.location.href = "/build";
      return;
    }

    window.location.href = `/build?focus=${encodeURIComponent(featured.id)}`;
  });
}

async function initialize() {
  state.bootstrap = await requestJson("/api/bootstrap");
  state.liveFeed = state.bootstrap.liveFeed;
  renderBrandCopy();
  renderHeroMetrics();
  installActions();
  installGlobe();
}

window.addEventListener("resize", () => {
  state.globeMap?.resize();
});

initialize().catch((error) => {
  console.error(error);
});
