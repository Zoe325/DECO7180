const ALERT_PROFILES = {
  near: {
    key: "near",
    distance: "0.8m",
    distanceValue: 0.8,
    level: "High",
    severityTitle: "HIGH SEVERITY",
    title: "STOP immediately",
    guidance: "Obstacle very close. Stop and prepare to change direction.",
    spoken: "Stop. Obstacle 0.8 meters ahead. Immediate obstacle. Stop.",
    voiceSummary: '"Stop. Obstacle very close."',
    vibrationSummary: "Strong vibration",
    voiceStatus: "Voice alert sent",
    vibrationPattern: [380, 120, 380, 120, 520],
    accent: "#ef4444",
  },
  medium: {
    key: "medium",
    distance: "1.5m",
    distanceValue: 1.5,
    level: "Medium",
    severityTitle: "MEDIUM SEVERITY",
    title: "Slow down",
    guidance: "Obstacle ahead. Reduce speed and stay alert.",
    spoken: "Slow down. Obstacle 1.5 meters ahead.",
    voiceSummary: '"Slow down. Obstacle ahead."',
    vibrationSummary: "Medium vibration",
    voiceStatus: "Voice alert sent",
    vibrationPattern: [220, 120, 220, 120, 280],
    accent: "#f59e0b",
  },
  far: {
    key: "far",
    distance: "2.5m",
    distanceValue: 2.5,
    level: "Low",
    severityTitle: "LOW SEVERITY",
    title: "Adjust direction",
    guidance: "Obstacle ahead. Turn slightly left.",
    spoken: "Adjust direction. Obstacle 2.5 meters ahead.",
    voiceSummary: '"Adjust direction. Path clear."',
    vibrationSummary: "Light vibration",
    voiceStatus: "Voice alert sent",
    vibrationPattern: [120, 120, 120],
    accent: "#67b44a",
  },
};

const state = {
  screen: "home",
  devices: {
    camera: true,
    earphones: true,
    smartwatch: true,
    others: false,
  },
  voiceEnabled: true,
  vibrationEnabled: true,
  scanning: false,
  cameraStatus: "idle",
  cameraError: "",
  stream: null,
  voicePlaying: false,
  voiceSupported:
    typeof window !== "undefined" && "speechSynthesis" in window,
  alertProfile: "medium",
  detectedDistance: null,
  detectedProfile: null,
  detectionNote:
    "Use the demo buttons below to simulate camera-based distance recognition.",
  detectionCooldownMs: 2500,
  lastAutoAlertAt: 0,
  previewMode: false,
  lastAlert: {
    voice: "off",
    vibration: "off",
  },
};

const phoneScreen = document.getElementById("phoneScreen");
const phoneShell = document.getElementById("phoneShell");
const screenLabel = document.getElementById("screenLabel");

function updateScreenLabel() {
  if (!screenLabel) return;
  screenLabel.textContent = state.screen.toUpperCase();
}

function setScreen(next) {
  const previous = state.screen;
  state.screen = next;

  if (previous === "navigation" && next !== "navigation") {
    stopCamera();
    state.scanning = false;
  }

  if (next === "navigation" && !state.previewMode) {
    startCamera();
  }

  updateScreenLabel();
  render();
}

function getDeviceCount() {
  return Object.values(state.devices).filter(Boolean).length;
}

function getCurrentAlert() {
  return ALERT_PROFILES[state.alertProfile] || ALERT_PROFILES.medium;
}

function getDetectedAlert() {
  return state.detectedProfile ? ALERT_PROFILES[state.detectedProfile] : null;
}

function mapDistanceToProfile(distanceMeters) {
  if (distanceMeters <= 1.0) return ALERT_PROFILES.near;
  if (distanceMeters <= 2.0) return ALERT_PROFILES.medium;
  if (distanceMeters <= 3.0) return ALERT_PROFILES.far;
  return null;
}

function recognizeDistance(distanceMeters) {
  const profile = mapDistanceToProfile(distanceMeters);
  state.detectedDistance = distanceMeters;

  if (!profile) {
    state.detectedProfile = null;
    state.detectionNote = `Detected distance: ${distanceMeters.toFixed(1)}m. No warning threshold reached.`;
    render();
    return;
  }

  state.detectedProfile = profile.key;
  state.detectionNote = `${profile.severityTitle} detected from camera distance recognition. Voice guidance and graded vibration will follow this severity.`;

  const now = Date.now();
  const severityChanged = state.alertProfile !== profile.key;
  const cooledDown = now - state.lastAutoAlertAt > state.detectionCooldownMs;

  if (severityChanged || cooledDown) {
    state.lastAutoAlertAt = now;
    triggerAlert(profile.key);
    return;
  }

  render();
}

function render() {
  updateScreenLabel();

  if (state.screen === "home") {
    phoneScreen.innerHTML = `
      <section class="screen">
        <div class="brand">GuideWay</div>
        <div class="button-stack">
          <button class="action-btn" id="goNavigation">Start<br/>Navigation</button>
          <button class="action-btn" id="goDevices" style="border-color:#d7dde5;">Connect<br/>Devices</button>
        </div>
        <p class="home-caption">Safe navigation support for visually impaired users.</p>
      </section>
    `;

    document
      .getElementById("goNavigation")
      .addEventListener("click", () => setScreen("navigation"));
    document
      .getElementById("goDevices")
      .addEventListener("click", () => setScreen("devices"));
    return;
  }

  if (state.screen === "devices") {
    phoneScreen.innerHTML = `
      <section class="screen">
        <div class="row-header">
          <button class="icon-btn" id="backHome">←</button>
          <div class="nav-title">
            <h3>Connect Devices</h3>
          </div>
        </div>

        <div class="device-list">
          ${deviceRow("camera", "📷", "Camera")}
          ${deviceRow("earphones", "🎧", "Earphones")}
          ${deviceRow("smartwatch", "⌚", "Smartwatch")}
          ${deviceRow("others", "📱", "Others")}
        </div>

        <div class="camera-meta">Connected devices: <strong>${getDeviceCount()}</strong></div>

        <div class="control-grid">
          <button class="soft-btn" id="continueNav">Continue</button>
        </div>
      </section>
    `;

    document
      .getElementById("backHome")
      .addEventListener("click", () => setScreen("home"));
    document
      .getElementById("continueNav")
      .addEventListener("click", () => setScreen("navigation"));
    bindDeviceToggles();
    return;
  }

  if (state.screen === "navigation") {
    const detected = getDetectedAlert();

    phoneScreen.innerHTML = `
      <section class="screen navigation-screen">
        <div class="row-header">
          <button class="icon-btn" id="backHome">←</button>
          <div class="nav-title">
            <h3>Navigation</h3>
            <p>${state.scanning ? "Scanning surroundings..." : "Ready to scan surroundings"}</p>
          </div>
        </div>

        <div class="camera-wrap">
          <div class="camera-stage">
            <video id="cameraVideo" autoplay playsinline muted></video>
            <div class="scanner-frame">
              <div class="corner tl"></div>
              <div class="corner tr"></div>
              <div class="corner bl"></div>
              <div class="corner br"></div>
            </div>
            ${
              state.scanning && state.cameraStatus === "ready"
                ? '<div class="scan-line"></div>'
                : ""
            }
            ${cameraOverlayTemplate()}
          </div>
        </div>

        <div class="camera-meta">
          Camera status: <strong>${state.cameraStatus}</strong><br/>
          ${
            state.cameraError
              ? `<span style="color:#b85e19;">${escapeHtml(
                  state.cameraError
                )}</span>`
              : "Allow rear camera access on your phone for a more realistic demo."
          }
        </div>

        <div class="recognition-card ${detected ? `severity-${detected.key}` : ""}">
          <div class="recognition-head">
            <strong>Distance recognition</strong>
            <span class="recognition-badge ${detected ? `severity-${detected.key}` : ""}">
              ${detected ? detected.severityTitle : "IDLE"}
            </span>
          </div>

          <div class="recognition-grid">
            <div class="recognition-metric">
              <span>Distance</span>
              <strong>${state.detectedDistance !== null ? `${state.detectedDistance.toFixed(1)}m` : "--"}</strong>
            </div>
            <div class="recognition-metric">
              <span>Danger level</span>
              <strong>${detected ? detected.level : "--"}</strong>
            </div>
          </div>

          <p class="recognition-note">${escapeHtml(state.detectionNote)}</p>
        </div>

        <div class="toggle-area">
          <div class="toggle-row">
            <span>Voice alerts</span>
            <button class="toggle ${
              state.voiceEnabled ? "active" : ""
            }" id="toggleVoice" aria-label="Toggle voice alerts"></button>
          </div>
          <div class="toggle-row">
            <span>Vibration alerts</span>
            <button class="toggle ${
              state.vibrationEnabled ? "active" : ""
            }" id="toggleVibration" aria-label="Toggle vibration alerts"></button>
          </div>
        </div>

        <div class="control-grid">
          <button class="soft-btn" id="openCamera">Open Rear Camera</button>
          <button class="small-btn" id="scanBtn">${
            state.scanning ? "Stop Scanning" : "Start Scanning"
          }</button>

          <div class="demo-group">
            <button class="small-btn severity-btn near" id="detectNear">Recognize 0.8m</button>
            <button class="small-btn severity-btn medium" id="detectMedium">Recognize 1.5m</button>
            <button class="small-btn severity-btn far" id="detectFar">Recognize 2.5m</button>
          </div>
        </div>
      </section>
    `;

    document
      .getElementById("backHome")
      .addEventListener("click", () => setScreen("home"));

    document.getElementById("toggleVoice").addEventListener("click", () => {
      state.voiceEnabled = !state.voiceEnabled;
      render();
    });

    document
      .getElementById("toggleVibration")
      .addEventListener("click", () => {
        state.vibrationEnabled = !state.vibrationEnabled;
        render();
      });

    document.getElementById("openCamera").addEventListener("click", startCamera);

    document.getElementById("scanBtn").addEventListener("click", () => {
      state.scanning = !state.scanning;
      render();
    });

    document
      .getElementById("detectNear")
      .addEventListener("click", () => recognizeDistance(0.8));
    document
      .getElementById("detectMedium")
      .addEventListener("click", () => recognizeDistance(1.5));
    document
      .getElementById("detectFar")
      .addEventListener("click", () => recognizeDistance(2.5));

    attachStreamToVideo();
    return;
  }

  if (state.screen === "alert") {
    const alertData = getCurrentAlert();

    phoneScreen.innerHTML = `
      <section class="screen alert-screen severity-${alertData.key}">
        <div class="row-header alert-topbar">
          <button class="icon-btn" id="backNavigation">←</button>
          <div class="alert-page-title">Alert</div>
          <div class="alert-top-spacer"></div>
        </div>

        <div class="severity-heading severity-${alertData.key}">${alertData.severityTitle} <span>(${alertData.distance})</span></div>

        <div class="alert-hero severity-${alertData.key}">
          <div class="alert-icon-ring outer"></div>
          <div class="alert-icon-ring inner"></div>
          <div class="alert-icon-circle severity-${alertData.key}">
            <div class="alert-icon-triangle"></div>
          </div>

          <div class="alert-distance-line">Obstacle ${alertData.distance} ahead</div>
          <div class="alert-main">${alertData.title}</div>
          <div class="alert-sub">${alertData.guidance}</div>
        </div>

        <div class="feedback-stack">
          <div class="feedback-card severity-${alertData.key}">
            <div class="feedback-icon-circle severity-${alertData.key}">
              <div class="feedback-speaker severity-${alertData.key}"></div>
            </div>
            <div class="feedback-copy">
              <strong>${alertData.voiceStatus}</strong>
              <span>${
                state.lastAlert.voice === "issue"
                  ? "Speech synthesis is unsupported in this browser preview."
                  : state.lastAlert.voice === "off"
                  ? "Voice alert is currently turned off."
                  : alertData.voiceSummary
              }</span>
            </div>
            <div class="status-badge ${
              state.lastAlert.voice === "sent"
                ? "sent"
                : state.lastAlert.voice === "issue"
                ? "issue"
                : "off"
            }">${
              state.lastAlert.voice === "sent"
                ? "Sent"
                : state.lastAlert.voice === "issue"
                ? "Issue"
                : "Off"
            }</div>
          </div>

          <div class="feedback-card severity-${alertData.key}">
            <div class="feedback-icon-circle severity-${alertData.key}">
              <div class="feedback-watch severity-${alertData.key}"></div>
            </div>
            <div class="feedback-copy">
              <strong>Vibration alert sent</strong>
              <span>${
                state.lastAlert.vibration === "off"
                  ? "Vibration alert is currently turned off."
                  : state.lastAlert.vibration === "visual"
                  ? `${alertData.vibrationSummary}. Visual buzz fallback is shown.`
                  : alertData.vibrationSummary
              }</span>
            </div>
            <div class="status-badge ${
              state.lastAlert.vibration === "sent"
                ? "sent"
                : state.lastAlert.vibration === "visual"
                ? "visual"
                : "off"
            }">${
              state.lastAlert.vibration === "sent"
                ? "Sent"
                : state.lastAlert.vibration === "visual"
                ? "Visual"
                : "Off"
            }</div>
          </div>
        </div>

        <div class="alert-actions">
          <button class="small-btn severity-confirm ${alertData.key}" id="ackAlert">OK, understood</button>
          <div class="secondary-actions">
            <button class="small-btn ghost" id="replayVoice">Replay voice</button>
            <button class="small-btn secondary" id="replayBuzz">Replay vibration</button>
          </div>
        </div>
      </section>
    `;

    document
      .getElementById("backNavigation")
      .addEventListener("click", () => setScreen("navigation"));
    document
      .getElementById("ackAlert")
      .addEventListener("click", () => setScreen("navigation"));

    document.getElementById("replayVoice").addEventListener("click", () => {
      if (!state.voiceEnabled) {
        state.lastAlert.voice = "off";
        render();
        return;
      }
      playVoicePrompt();
    });

    document.getElementById("replayBuzz").addEventListener("click", () => {
      if (!state.vibrationEnabled) {
        state.lastAlert.vibration = "off";
        render();
        return;
      }
      playVibrationFeedback();
    });

    return;
  }
}

function deviceRow(key, icon, label) {
  return `
    <div class="device-row">
      <div class="device-left">
        <div class="device-icon">${icon}</div>
        <div>${label}</div>
      </div>
      <button class="tag ${
        state.devices[key] ? "on" : "off"
      }" data-device="${key}">${state.devices[key] ? "Connected" : "Off"}</button>
    </div>
  `;
}

function bindDeviceToggles() {
  document.querySelectorAll("[data-device]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-device");
      state.devices[key] = !state.devices[key];
      render();
    });
  });
}

function cameraOverlayTemplate() {
  if (state.cameraStatus === "ready") return "";

  const title =
    state.cameraStatus === "loading" ? "Opening camera..." : "Rear camera preview";

  const message =
    state.cameraError ||
    "Allow camera permission on your phone to show the live navigation view.";

  return `
    <div class="camera-overlay-message">
      <strong>${title}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function attachStreamToVideo() {
  if (!state.stream) return;
  const video = document.getElementById("cameraVideo");
  if (!video) return;
  video.srcObject = state.stream;
  video.play().catch(() => {});
}

async function startCamera() {
  if (state.previewMode) {
    state.cameraStatus = "ready";
    render();
    return;
  }

  if (state.stream) {
    state.cameraStatus = "ready";
    render();
    attachStreamToVideo();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    state.cameraStatus = "error";
    state.cameraError = "Camera access is not supported in this browser.";
    render();
    return;
  }

  state.cameraStatus = "loading";
  state.cameraError = "";
  render();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1080 },
        height: { ideal: 1920 },
      },
      audio: false,
    });

    state.stream = stream;
    state.cameraStatus = "ready";
    state.cameraError = "";
    render();
    attachStreamToVideo();
  } catch (error) {
    state.cameraStatus = "error";
    state.cameraError =
      "Camera permission was denied or this page is not running in a secure mobile browser context.";
    render();
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  state.cameraStatus = "idle";
}

function triggerAlert(profile = "medium") {
  state.alertProfile = profile;
  state.lastAlert.voice = state.voiceEnabled ? playVoicePrompt(false) : "off";
  state.lastAlert.vibration = state.vibrationEnabled
    ? playVibrationFeedback(false)
    : "off";
  state.scanning = false;
  state.screen = "alert";
  stopCamera();
  render();
}

function playVoicePrompt(shouldRender = true) {
  if (!state.voiceEnabled) {
    state.lastAlert.voice = "off";
    if (shouldRender) render();
    return "off";
  }

  if (!state.voiceSupported || state.previewMode) {
    state.lastAlert.voice = state.previewMode ? "sent" : "issue";
    if (shouldRender) render();
    return state.lastAlert.voice;
  }

  try {
    const alertData = getCurrentAlert();
    const utterance = new SpeechSynthesisUtterance(alertData.spoken);
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => {
      state.voicePlaying = true;
      state.lastAlert.voice = "sent";
      if (state.screen === "alert") render();
    };

    utterance.onend = () => {
      state.voicePlaying = false;
      if (state.screen === "alert") render();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    state.lastAlert.voice = "sent";

    if (shouldRender) render();
    return "sent";
  } catch (error) {
    state.lastAlert.voice = "issue";
    if (shouldRender) render();
    return "issue";
  }
}

function playVibrationFeedback(shouldRender = true) {
  if (!state.vibrationEnabled) {
    state.lastAlert.vibration = "off";
    if (shouldRender) render();
    return "off";
  }

  addVisualBuzz();

  const alertData = getCurrentAlert();

  if (state.previewMode) {
    state.lastAlert.vibration = "sent";
    if (shouldRender) render();
    return "sent";
  }

  if (navigator.vibrate) {
    const result = navigator.vibrate(alertData.vibrationPattern);
    const mode = result === false ? "visual" : "sent";
    state.lastAlert.vibration = mode;
    if (shouldRender) render();
    return mode;
  }

  state.lastAlert.vibration = "visual";
  if (shouldRender) render();
  return "visual";
}

function addVisualBuzz() {
  phoneShell.classList.remove("visual-buzz");
  void phoneShell.offsetWidth;
  phoneShell.classList.add("visual-buzz");
  setTimeout(() => phoneShell.classList.remove("visual-buzz"), 1000);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function applyPreviewFromHash() {
  const hash = (window.location.hash || "").replace(/^#/, "");
  state.previewMode = hash.startsWith("preview-");

  if (!state.previewMode) return false;

  stopCamera();
  state.scanning = false;
  state.voiceEnabled = true;
  state.vibrationEnabled = true;
  state.lastAlert.voice = "sent";
  state.lastAlert.vibration = "sent";

  if (hash === "preview-navigation") {
    state.screen = "navigation";
    state.cameraStatus = "ready";
    state.detectedDistance = 1.5;
    state.detectedProfile = "medium";
    state.detectionNote =
      "MEDIUM SEVERITY detected from camera distance recognition. Voice guidance and graded vibration will follow this severity.";
    return true;
  }

  if (hash === "preview-alert-near") {
    state.screen = "alert";
    state.alertProfile = "near";
    return true;
  }

  if (hash === "preview-alert-medium") {
    state.screen = "alert";
    state.alertProfile = "medium";
    return true;
  }

  if (hash === "preview-alert-far") {
    state.screen = "alert";
    state.alertProfile = "far";
    return true;
  }

  return false;
}

window.addEventListener("beforeunload", () => {
  stopCamera();
  if (state.voiceSupported && !state.previewMode) {
    window.speechSynthesis.cancel();
  }
});

window.addEventListener("hashchange", () => {
  if (applyPreviewFromHash()) {
    updateScreenLabel();
    render();
  }
});

applyPreviewFromHash();
updateScreenLabel();
render();