/**
 * Focus Layer Script
 * Connects to backend API, displays gesture info, handles unified Stop button
 * 
 * Stop button calls /api/focus/stop_all which stops both MediaPipe and Desktop Stream
 */

const API_BASE = 'http://localhost:5000';

// Elements
const timerText = document.getElementById('timerText');
const detectedHandsEl = document.getElementById('detectedHands');
const detectedGestureEl = document.getElementById('detectedGesture');
const confidenceEl = document.getElementById('confidence');
const gestureListEl = document.getElementById('gestureList');
const stopAllBtn = document.getElementById('stopAllBtn');
const closeBtn = document.getElementById('closeBtn');

const circle = document.querySelector('.progress-circle');
const radius = 35;
const circumference = 2 * Math.PI * radius;
circle.style.strokeDasharray = circumference;
circle.style.strokeDashoffset = circumference;

// Start MediaPipe in separate window (focus=1) when Layer opens
async function startFocusMode() {
  try {
    await fetch(`${API_BASE}/api/desktop/start`);
    await fetch(`${API_BASE}/api/recognition/start?focus=1`);
  } catch (e) {
    console.warn('Failed to start focus mode:', e);
  }
}

// Single Stop button: stops MediaPipe + Desktop Stream
stopAllBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/api/focus/stop_all`);
    // Update UI to show stopped state
    stopAllBtn.textContent = 'Stopped';
    stopAllBtn.disabled = true;
    stopAllBtn.style.opacity = '0.5';
  } catch (e) {
    console.warn('Stop failed:', e);
  }
});

// Close window: stops MediaPipe + Desktop Stream (handled in main.js window close event)
closeBtn.addEventListener('click', () => {
  window.close();
});

// SSE for predictions
let eventSource = null;
function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`${API_BASE}/api/events`);
  eventSource.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'prediction') {
        if (detectedGestureEl) detectedGestureEl.textContent = d.gesture || 'None';
        if (confidenceEl) confidenceEl.textContent = `${d.confidence || 0}%`;
        updateTimer(d.hittingTime, d.timerElapsed);
      }
    } catch (_) {}
  };
}

// Poll status for hand detection
async function pollStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const d = await res.json();
    if (detectedHandsEl) detectedHandsEl.textContent = d.handDetected ? 'Yes' : 'No';
  } catch (_) {}
}

// Load gesture list
async function loadGestures() {
  try {
    const res = await fetch(`${API_BASE}/api/gestures`);
    const gestures = await res.json();
    gestureListEl.innerHTML = '';
    gestures.forEach(g => {
      const item = document.createElement('div');
      item.className = 'gesture-item';
      item.textContent = g.name;
      gestureListEl.appendChild(item);
    });
  } catch (_) {}
}

function updateTimer(hittingTime, timerElapsed) {
  if (!hittingTime || hittingTime <= 0) hittingTime = 3;
  const elapsed = timerElapsed || 0;
  const progress = Math.min(elapsed / hittingTime, 1);
  const offset = circumference - progress * circumference;
  circle.style.strokeDashoffset = offset;
  timerText.textContent = `${Math.round(elapsed)}s`;
}

// Initialize
startFocusMode();
connectSSE();
setInterval(pollStatus, 500);
loadGestures();
setInterval(loadGestures, 3000);  // Refresh gesture list every 3s
