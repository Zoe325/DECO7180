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
  voiceSupported: typeof window !== "undefined" && "speechSynthesis" in window,
  lastAlert: {
    voice: "off",
    vibration: "off",
  },
};

const phoneScreen = document.getElementById("phoneScreen");
const phoneShell = document.getElementById("phoneShell");
const screenLabel = document.getElementById("screenLabel");

function updateScreenLabel() {
  screenLabel.textContent = state.screen.toUpperCase();
}

function setScreen(next) {
  const previous = state.screen;
  state.screen = next;

  if (previous === "navigation" && next !== "navigation") {
    stopCamera();
    state.scanning = false;
  }

  if (next === "navigation") {
    startCamera();
  }

  updateScreenLabel();
  render();
}

function getDeviceCount() {
  return Object.values(state.devices).filter(Boolean).length;
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

    document.getElementById("goNavigation").addEventListener("click", () => setScreen("navigation"));
    document.getElementById("goDevices").addEventListener("click", () => setScreen("devices"));
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

    document.getElementById("backHome").addEventListener("click", () => setScreen("home"));
    document.getElementById("continueNav").addEventListener("click", () => setScreen("navigation"));
    bindDeviceToggles();
    return;
  }

  if (state.screen === "navigation") {
    phoneScreen.innerHTML = `
      <section class="screen">
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
            ${state.scanning && state.cameraStatus === "ready" ? '<div class="scan-line"></div>' : ''}
            ${cameraOverlayTemplate()}
          </div>
        </div>

        <div class="camera-meta">
          Camera status: <strong>${state.cameraStatus}</strong><br/>
          ${state.cameraError ? `<span style="color:#b85e19;">${escapeHtml(state.cameraError)}</span>` : 'Allow rear camera access on your phone for a more realistic demo.'}
        </div>

        <div class="toggle-area">
          <div class="toggle-row">
            <span>Voice alerts</span>
            <button class="toggle ${state.voiceEnabled ? 'active' : ''}" id="toggleVoice" aria-label="Toggle voice alerts"></button>
          </div>
          <div class="toggle-row">
            <span>Vibration alerts</span>
            <button class="toggle ${state.vibrationEnabled ? 'active' : ''}" id="toggleVibration" aria-label="Toggle vibration alerts"></button>
          </div>
        </div>

        <div class="control-grid">
          <button class="soft-btn" id="openCamera">Open Rear Camera</button>
          <button class="small-btn" id="scanBtn">${state.scanning ? 'Stop Scanning' : 'Start Scanning'}</button>
          <button class="small-btn secondary" id="simulateObstacle">Simulate “Obstacle Ahead”</button>
        </div>
      </section>
    `;

    document.getElementById("backHome").addEventListener("click", () => setScreen("home"));
    document.getElementById("toggleVoice").addEventListener("click", () => {
      state.voiceEnabled = !state.voiceEnabled;
      render();
    });
    document.getElementById("toggleVibration").addEventListener("click", () => {
      state.vibrationEnabled = !state.vibrationEnabled;
      render();
    });
    document.getElementById("openCamera").addEventListener("click", startCamera);
    document.getElementById("scanBtn").addEventListener("click", () => {
      state.scanning = !state.scanning;
      render();
    });
    document.getElementById("simulateObstacle").addEventListener("click", triggerAlert);
    attachStreamToVideo();
    return;
  }

  if (state.screen === "alert") {
    phoneScreen.innerHTML = `
      <section class="screen alert-screen">
        <div class="row-header" style="width:100%; justify-content:flex-start;">
          <button class="icon-btn" id="backNavigation">←</button>
        </div>
        <div class="alert-title">Alert</div>
        <div class="alert-icon"></div>
        <div class="alert-main">Obstacle Ahead</div>
        <div class="alert-sub">Turn slightly left</div>

        ${(state.lastAlert.voice === 'sent' || state.lastAlert.vibration === 'sent' || state.lastAlert.vibration === 'visual') ? `
          <div class="feedback-pulse">
            <span class="pulse-dot"></span>
            Warning feedback active
          </div>
        ` : ''}

        <div class="alert-status">
          ${statusRow(
            "Voice alert",
            state.lastAlert.voice === "sent"
              ? "Speech prompt played or queued in the browser."
              : state.lastAlert.voice === "issue"
              ? "Speech synthesis is unsupported in this browser preview."
              : "Voice alert is currently turned off.",
            state.lastAlert.voice
          )}
          ${statusRow(
            "Vibration alert",
            state.lastAlert.vibration === "sent"
              ? "Native vibration request was sent to the device."
              : state.lastAlert.vibration === "visual"
              ? "Visual buzz fallback is shown for unsupported devices."
              : "Vibration alert is currently turned off.",
            state.lastAlert.vibration
          )}
        </div>

        <div class="alert-actions">
          <button class="small-btn" id="replayVoice">Replay voice prompt</button>
          <button class="small-btn ghost" id="replayBuzz">Replay vibration / buzz</button>
          <button class="small-btn secondary" id="returnNavigation">Back to navigation</button>
        </div>
      </section>
    `;

    document.getElementById("backNavigation").addEventListener("click", () => setScreen("navigation"));
    document.getElementById("returnNavigation").addEventListener("click", () => setScreen("navigation"));
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
      <button class="tag ${state.devices[key] ? 'on' : 'off'}" data-device="${key}">${state.devices[key] ? 'Connected' : 'Off'}</button>
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
    state.cameraStatus === "loading"
      ? "Opening camera..."
      : "Rear camera preview";

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
    state.cameraError = "Camera permission was denied or this page is not running in a secure mobile browser context.";
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

function triggerAlert() {
  state.lastAlert.voice = state.voiceEnabled ? playVoicePrompt(false) : "off";
  state.lastAlert.vibration = state.vibrationEnabled ? playVibrationFeedback(false) : "off";
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

  if (!state.voiceSupported) {
    state.lastAlert.voice = "issue";
    if (shouldRender) render();
    return "issue";
  }

  try {
    const utterance = new SpeechSynthesisUtterance("Obstacle ahead. Turn slightly left.");
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

  if (navigator.vibrate) {
    const result = navigator.vibrate([200, 100, 200, 100, 280]);
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

function statusRow(title, description, mode) {
  const label =
    mode === "sent" ? "Sent" :
    mode === "visual" ? "Visual" :
    mode === "issue" ? "Browser issue" :
    "Off";

  return `
    <div class="status-row">
      <div>
        <strong>${title}</strong>
        <span>${description}</span>
      </div>
      <div class="status-badge ${mode === 'sent' ? 'sent' : mode === 'visual' ? 'visual' : mode === 'issue' ? 'issue' : 'off'}">${label}</div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("beforeunload", () => {
  stopCamera();
  if (state.voiceSupported) {
    window.speechSynthesis.cancel();
  }
});

updateScreenLabel();
render();
