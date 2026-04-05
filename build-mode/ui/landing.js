const state = {
  bootstrap: null,
  liveFeed: { stats: {}, updates: [] },
  pointer: { x: 0, y: 0 },
  globeFlash: 0
};

const elements = {
  heroTitle: document.querySelector("#hero-title"),
  heroText: document.querySelector("#hero-text"),
  heroMetrics: document.querySelector("#hero-metrics"),
  liveUpdates: document.querySelector("#live-updates"),
  focusFeatured: document.querySelector("#focus-featured"),
  globeCanvas: document.querySelector("#globe-canvas")
};

const globeContext = elements.globeCanvas.getContext("2d");

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.detail || error.error || "Request failed");
  }

  return response.json();
}

function resizeCanvas(canvas, context, width, height) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
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
    state.globeFlash = 1;
    renderLiveUpdates();
  });
}

function installPointerTracking() {
  elements.globeCanvas.addEventListener("pointermove", (event) => {
    const rect = elements.globeCanvas.getBoundingClientRect();
    state.pointer.x = event.clientX - rect.left - rect.width / 2;
    state.pointer.y = event.clientY - rect.top - rect.height / 2;
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
  renderLiveUpdates();
  installPointerTracking();
  installActions();
  connectLiveStream();
  requestAnimationFrame(drawGlobe);
}

window.addEventListener("resize", () => {
  if (state.bootstrap) {
    drawGlobe();
  }
});

initialize().catch((error) => {
  console.error(error);
});
