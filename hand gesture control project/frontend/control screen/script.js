// API base
const API_BASE = (typeof window !== 'undefined' && window.location.origin) ? '' : 'http://localhost:5000';

// Apply saved theme on load
if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
  const icon = document.querySelector(".switch-icon");
  if (icon) icon.textContent = "☀";
}

const layout = document.querySelector(".layout");
const sidebarToggle = document.getElementById("sidebarToggle");
const themeToggle = document.getElementById("themeToggle");
const focusToggle = document.getElementById("focusToggle");
const switchIcon = document.querySelector(".switch-icon");
const statusDot = document.getElementById("statusDot");

// Collapse
if (localStorage.getItem("sidebarCollapsed") === "true") {
  layout.classList.add("collapsed");
}

sidebarToggle.addEventListener("click", () => {
  layout.classList.toggle("collapsed");
  localStorage.setItem("sidebarCollapsed", layout.classList.contains("collapsed"));
});

// Home - Navigate to home page with circular transition
const homeBtn = document.getElementById("homeBtn");
homeBtn.addEventListener("click", () => {
  const rect = homeBtn.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: ${document.body.classList.contains('light') 
    ? 'linear-gradient(180deg, #e6ecf5 0%, #dde5f0 100%)' 
    : 'radial-gradient(circle at 30% 20%, #16213e 0%, #0a0f1f 40%, #050814 100%)'};
    z-index: 9999;
    pointer-events: none;
    clip-path: circle(0% at ${x}px ${y}px);
    transition: clip-path 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.clipPath = `circle(150% at ${x}px ${y}px)`;
    });
  });

  setTimeout(() => {
    window.location.href = '../home page/main-index.html';
  }, 800);
});

// Theme
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  switchIcon.textContent =
    document.body.classList.contains("light") ? "☀" : "🌙";
  // Save current theme
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

// Focus Mode Toggle - Launch desktop overlay Layer window
focusToggle.addEventListener("click", async (e) => {
  try {
    const res = await fetch(`${API_BASE}/api/focus-layer/launch`);
    const data = await res.json();
    if (data.ok) {
      console.log("Focus Layer launched");
      // Visual feedback: toggle switch animation
      focusToggle.classList.add("active");
      setTimeout(() => focusToggle.classList.remove("active"), 300);
    } else {
      alert(`Failed to launch Focus Layer: ${data.error || "Unknown error"}\n\nMake sure to install:\ncd focus-layer && npm install`);
    }
  } catch (err) {
    console.error("Focus Layer launch error:", err);
    alert("Failed to launch Focus Layer. Check console for details.");
  }
});

// System status blinking
setInterval(() => {
  statusDot.classList.toggle("active");
  statusDot.classList.toggle("inactive");
}, 3000);

// ============================================================
// SLIDING NAVIGATION (for Gesture List)
// ============================================================
function navigateWithSlide(destination) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: ${document.body.classList.contains('light')
      ? 'linear-gradient(180deg, #e6ecf5 0%, #dde5f0 100%)'
      : 'radial-gradient(circle at 30% 20%, #16213e 0%, #0a0f1f 40%, #050814 100%)'};
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.35s ease;
    pointer-events: none;
  `;
  document.body.appendChild(overlay);

  document.body.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
  document.body.style.opacity = '0';
  document.body.style.transform = 'translateY(-12px)';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  });

  setTimeout(() => {
    window.location.href = destination;
  }, 350);
}

// Gesture List button
const gestureListBtn = document.getElementById("gestureListBtn");
if (gestureListBtn) {
  gestureListBtn.addEventListener("click", () => {
    navigateWithSlide('../gesture list screen/gesture-list.html'); // Adjust path as needed
  });
}
// =========================
// Control Screen: Start recognition, MediaPipe feed, Timer, Gesture
// =========================

const feedImg = document.getElementById("mediaPipeFeedImg");
const feedPlaceholder = document.getElementById("feedPlaceholder");
const handStatusText = document.getElementById("handStatusText");
const detectedGestureEl = document.getElementById("detectedGestureEl");
const confidenceEl = document.getElementById("confidenceEl");
const circle = document.querySelector(".progress-circle");
const timerText = document.getElementById("timerText");

const radius = 70;
const circumference = 2 * Math.PI * radius;
circle.style.strokeDasharray = circumference;
circle.style.strokeDashoffset = circumference;

let timerInterval = null;

// Desktop stream elements
const desktopPanel = document.getElementById("desktopPanel");
const desktopFeedImg = document.getElementById("desktopFeedImg");
const desktopPlaceholder = document.getElementById("desktopPlaceholder");

// Start recognition + desktop stream
async function startControl() {
  try {
    await fetch(`${API_BASE}/api/desktop/start`);
    await fetch(`${API_BASE}/api/recognition/start?focus=0`);
    if (feedImg) {
      feedImg.src = `${API_BASE}/api/video/feed`;
      feedImg.style.display = "block";
      if (feedPlaceholder) { feedPlaceholder.style.display = "none"; feedPlaceholder.textContent = ""; }
    }
    if (desktopFeedImg) {
      desktopFeedImg.src = `${API_BASE}/api/desktop/feed`;
      desktopFeedImg.classList.add("active");
      if (desktopPlaceholder) desktopPlaceholder.style.display = "none";
    }
  } catch (e) {
    if (feedPlaceholder) feedPlaceholder.textContent = "Start server.py";
    if (desktopPlaceholder) desktopPlaceholder.textContent = "Start server.py";
  }
}

// Stop MediaPipe, camera, and desktop stream
async function stopControl() {
  try {
    await fetch(`${API_BASE}/api/desktop/stop`);
    await fetch(`${API_BASE}/api/stop_all`);
    if (feedImg) { feedImg.src = ""; feedImg.style.display = "none"; }
    if (feedPlaceholder) { feedPlaceholder.style.display = ""; feedPlaceholder.textContent = "Stopped"; }
    if (desktopFeedImg) { desktopFeedImg.src = ""; desktopFeedImg.classList.remove("active"); }
    if (desktopPlaceholder) { desktopPlaceholder.style.display = ""; desktopPlaceholder.textContent = "Click Start to view live desktop"; }
    if (handStatusText) handStatusText.textContent = "No Hand Detected";
    if (detectedGestureEl) detectedGestureEl.textContent = "None";
    if (confidenceEl) confidenceEl.textContent = "Confidence: 0%";
  } catch (e) {
    console.warn("Stop failed:", e);
  }
}

// Desktop input: map click to normalized 0-1 and send to backend
function setupDesktopInput() {
  if (!desktopPanel || !desktopFeedImg) return;
  desktopPanel.addEventListener("click", (e) => {
    desktopPanel.focus();  // Ensure panel has focus for keyboard
    if (!desktopFeedImg.classList.contains("active")) return;
    const rect = desktopFeedImg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      fetch(`${API_BASE}/api/desktop/mouse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y, button: "left", action: "click" }),
      }).catch(() => {});
    }
  });
  desktopPanel.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!desktopFeedImg.classList.contains("active")) return;
    const rect = desktopFeedImg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      fetch(`${API_BASE}/api/desktop/mouse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y, button: "right", action: "click" }),
      }).catch(() => {});
    }
  });
  desktopPanel.addEventListener("keydown", (e) => {
    if (!desktopFeedImg.classList.contains("active")) return;
    e.preventDefault();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const keyMap = { "Enter": "enter", " ": "space", "Backspace": "backspace", "Tab": "tab", "Escape": "escape", "ArrowUp": "up", "ArrowDown": "down", "ArrowLeft": "left", "ArrowRight": "right" };
    const k = keyMap[key] || key;
    fetch(`${API_BASE}/api/desktop/keyboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, action: "press" }),
    }).catch(() => {});
  });
}
setupDesktopInput();

document.getElementById("startControlBtn")?.addEventListener("click", startControl);
document.getElementById("stopControlBtn")?.addEventListener("click", stopControl);

startControl();

// SSE for predictions, timer, hand status
let eventSource = null;
function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`${API_BASE}/api/events`);
  eventSource.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === "prediction") {
        if (detectedGestureEl) detectedGestureEl.textContent = d.gesture || "None";
        if (confidenceEl) confidenceEl.textContent = `Confidence: ${d.confidence || 0}%`;
        updateTimer(d.hittingTime, d.timerElapsed);
      } else if (d.type === "heartbeat") {
        pollStatus();
      }
    } catch (_) {}
  };
}
connectSSE();

async function pollStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const d = await res.json();
    if (handStatusText) handStatusText.textContent = d.handDetected ? "Hand Detected" : "No Hand Detected";
  } catch (_) {}
}
setInterval(pollStatus, 500);

function updateTimer(hittingTime, timerElapsed) {
  if (!hittingTime || hittingTime <= 0) hittingTime = 3;
  const elapsed = timerElapsed || 0;
  const progress = Math.min(elapsed / hittingTime, 1);
  const offset = circumference - progress * circumference;
  circle.style.strokeDashoffset = offset;
  timerText.textContent = `${Math.round(elapsed)}s`;
}
