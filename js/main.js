import { EventBus } from "./eventBus.js";
import { SurgicalCoach } from "../ai/coach.js";
import { SafetyAgent } from "../ai/safety.js";
import { SkillEvaluator } from "../ai/evaluator.js";

const bus = new EventBus();
const coach = new SurgicalCoach({ bus, enableVoice: true });
const safety = new SafetyAgent({ bus });
const evaluator = new SkillEvaluator({ bus });

coach.start();
safety.start();
evaluator.start();

const ui = {
  video: document.getElementById("inputVideo"),
  trackingCanvas: document.getElementById("trackingCanvas"),
  brainCanvas: document.getElementById("brainCanvas"),
  selectedInstrumentText: document.getElementById("selectedInstrumentText"),
  coachHint: document.getElementById("coachHint"),
  safetyMessage: document.getElementById("safetyMessage"),
  warningOverlay: document.getElementById("warningOverlay"),
  metricPrecision: document.getElementById("metricPrecision"),
  metricAccuracy: document.getElementById("metricAccuracy"),
  metricTime: document.getElementById("metricTime"),
  metricErrors: document.getElementById("metricErrors"),
  startSessionBtn: document.getElementById("startSessionBtn"),
  endSessionBtn: document.getElementById("endSessionBtn"),
  finalPanel: document.getElementById("finalPanel"),
  finalScoreText: document.getElementById("finalScoreText"),
  finalBreakdown: document.getElementById("finalBreakdown"),
  closeFinalPanelBtn: document.getElementById("closeFinalPanelBtn"),
};

const state = {
  sessionActive: false,
  instrument: "scalpel",
  pointer: { x: 0, y: 0, z: 0.2 },
  prevPointer: { x: 0, y: 0, z: 0.2 },
  speed: 0,
  angleDeg: 0,
  zone: "neutral",
};

const zones = {
  safe: { center: new THREE.Vector3(0.15, 0.05, 0), radius: 0.42 },
  danger: { center: new THREE.Vector3(-0.35, -0.1, 0), radius: 0.28 },
};

let three = null;
initializeThreeScene();
initializeUIEvents();
initializeInputTracking();
startLoop();

function initializeThreeScene() {
  const renderer = new THREE.WebGLRenderer({ canvas: ui.brainCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(ui.brainCanvas.clientWidth, ui.brainCanvas.clientHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(45, ui.brainCanvas.clientWidth / ui.brainCanvas.clientHeight, 0.1, 50);
  camera.position.set(0, 0, 2.6);

  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 2, 3);
  scene.add(ambient, dir);

  const brain = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 48, 48),
    new THREE.MeshStandardMaterial({ color: 0xf0b4c3, roughness: 0.52, metalness: 0.08 }),
  );
  scene.add(brain);

  const safeZone = new THREE.Mesh(
    new THREE.SphereGeometry(zones.safe.radius, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.24 }),
  );
  safeZone.position.copy(zones.safe.center);
  scene.add(safeZone);

  const dangerZone = new THREE.Mesh(
    new THREE.SphereGeometry(zones.danger.radius, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.18 }),
  );
  dangerZone.position.copy(zones.danger.center);
  scene.add(dangerZone);

  const instrumentTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x2563eb }),
  );
  scene.add(instrumentTip);

  three = { renderer, scene, camera, brain, safeZone, dangerZone, instrumentTip };

  window.addEventListener("resize", () => {
    const w = ui.brainCanvas.clientWidth;
    const h = ui.brainCanvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
}

function initializeUIEvents() {
  document.querySelectorAll(".instrument-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".instrument-btn").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      state.instrument = btn.dataset.instrument;
      ui.selectedInstrumentText.textContent = `Selected: ${state.instrument}`;
      bus.emit("instrument:changed", { instrument: state.instrument });
    });
  });

  ui.startSessionBtn.addEventListener("click", () => {
    state.sessionActive = true;
    ui.finalPanel.classList.add("hidden");
    bus.emit("session:started");
  });

  ui.endSessionBtn.addEventListener("click", () => {
    state.sessionActive = false;
    bus.emit("session:ended");
  });

  ui.closeFinalPanelBtn.addEventListener("click", () => {
    ui.finalPanel.classList.add("hidden");
  });

  bus.on("coach:hint", ({ message }) => {
    ui.coachHint.textContent = message;
  });

  bus.on("safety:warning", ({ message, blocked }) => {
    ui.safetyMessage.textContent = message;
    ui.warningOverlay.classList.remove("hidden");
    if (blocked) {
      state.pointer = { ...state.prevPointer };
    }
  });

  bus.on("safety:clear", () => {
    ui.safetyMessage.textContent = "No safety incidents.";
    ui.warningOverlay.classList.add("hidden");
  });

  bus.on("evaluation:live", (metrics) => {
    ui.metricPrecision.textContent = metrics.precision.toFixed(1);
    ui.metricAccuracy.textContent = metrics.accuracy.toFixed(1);
    ui.metricTime.textContent = `${metrics.timeSec}s`;
    ui.metricErrors.textContent = `${metrics.errors}`;
  });

  bus.on("evaluation:complete", (result) => {
    ui.finalScoreText.textContent = `Score: ${result.score} / 100`;
    ui.finalBreakdown.innerHTML = [
      `<p>Precision: ${result.precision.toFixed(1)}</p>`,
      `<p>Accuracy: ${result.accuracy.toFixed(1)}</p>`,
      `<p>Time: ${result.timeSec}s</p>`,
      `<p>Errors: ${result.errors}</p>`,
      `<p>Suggestions: ${result.suggestions.join(" ")}</p>`,
    ].join("");
    ui.finalPanel.classList.remove("hidden");
  });
}

function initializeInputTracking() {
  const overlayCtx = ui.trackingCanvas.getContext("2d");

  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
    .then((stream) => {
      ui.video.srcObject = stream;
    })
    .catch(() => {
      ui.coachHint.textContent = "Camera unavailable. Falling back to mouse control.";
    });

  if (window.Hands && window.Camera) {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65,
    });

    hands.onResults((results) => {
      ui.trackingCanvas.width = ui.video.videoWidth || 640;
      ui.trackingCanvas.height = ui.video.videoHeight || 480;
      overlayCtx.clearRect(0, 0, ui.trackingCanvas.width, ui.trackingCanvas.height);

      if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
        return;
      }
      const lm = results.multiHandLandmarks[0];
      drawConnectors(overlayCtx, lm, HAND_CONNECTIONS, { color: "#22c55e", lineWidth: 2 });
      drawLandmarks(overlayCtx, lm, { color: "#3b82f6", lineWidth: 1 });

      const tip = lm[8];
      const thumb = lm[4];
      const pinchDist = Math.hypot(tip.x - thumb.x, tip.y - thumb.y);

      const mapped = {
        x: (tip.x - 0.5) * 1.8,
        y: -(tip.y - 0.5) * 1.4,
        z: 0.2 + pinchDist,
      };
      updatePointer(mapped);
    });

    const camera = new Camera(ui.video, {
      onFrame: async () => {
        await hands.send({ image: ui.video });
      },
      width: 1280,
      height: 720,
    });
    camera.start();
  }

  ui.brainCanvas.addEventListener("mousemove", (event) => {
    const rect = ui.brainCanvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    updatePointer({ x: nx * 0.9, y: ny * 0.7, z: 0.2 });
  });
}

function updatePointer(next) {
  state.prevPointer = { ...state.pointer };
  state.pointer = next;

  const dx = state.pointer.x - state.prevPointer.x;
  const dy = state.pointer.y - state.prevPointer.y;
  const dz = state.pointer.z - state.prevPointer.z;
  state.speed = Math.sqrt(dx * dx + dy * dy + dz * dz);
  state.angleDeg = (Math.atan2(dy, Math.max(0.0001, dx)) * 180) / Math.PI;
}

function resolveZone(pointerVec3) {
  const dSafe = pointerVec3.distanceTo(zones.safe.center);
  const dDanger = pointerVec3.distanceTo(zones.danger.center);
  if (dDanger <= zones.danger.radius) return "danger";
  if (dSafe <= zones.safe.radius) return "safe";
  return "neutral";
}

function startLoop() {
  const tick = () => {
    const pointerV = new THREE.Vector3(state.pointer.x, state.pointer.y, 0);
    state.zone = resolveZone(pointerV);

    if (three) {
      three.instrumentTip.position.set(pointerV.x, pointerV.y, 0.72);
      if (state.instrument === "scalpel") three.instrumentTip.material.color.set(0x2563eb);
      if (state.instrument === "forceps") three.instrumentTip.material.color.set(0x16a34a);
      if (state.instrument === "scissors") three.instrumentTip.material.color.set(0xf59e0b);
      three.dangerZone.material.opacity = state.zone === "danger" ? 0.45 : 0.18;
      three.safeZone.material.opacity = state.zone === "safe" ? 0.36 : 0.24;
      three.renderer.render(three.scene, three.camera);
    }

    bus.emit("interaction:tick", {
      sessionActive: state.sessionActive,
      instrument: state.instrument,
      zone: state.zone,
      speed: state.speed,
      angleDeg: state.angleDeg,
      pointer: { ...state.pointer },
    });

    requestAnimationFrame(tick);
  };
  tick();
}
