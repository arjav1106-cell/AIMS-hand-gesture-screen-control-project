/* ============================================================
   script.js — Gesture Control System Homepage
   Modular, well-commented, no inline styles.
============================================================ */

// ============================================================
// 1. SIDEBAR TOGGLE
// ============================================================

// Apply saved theme on load
if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
  // Update switch icon if it exists on this page
  const icon = document.querySelector(".switch-icon");
  if (icon) icon.textContent = "☀";
}

const layout        = document.getElementById("layout");
const sidebarToggle = document.getElementById("sidebarToggle");

sidebarToggle.addEventListener("click", () => {
  layout.classList.toggle("collapsed");
});


// ============================================================
// 2. THEME TOGGLE
// ============================================================

const themeToggle = document.getElementById("themeToggle");
const switchIcon  = document.querySelector(".switch-icon");

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  switchIcon.textContent =
    document.body.classList.contains("light") ? "☀" : "🌙";
  // Save current theme
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

// ============================================================
// 3. SYSTEM STATUS INDICATORS
//    These are controlled by the backend in production.
//    For now, we simulate states and expose setStatus() for
//    the backend to call whenever a state changes.
// ============================================================

/**
 * Update one status indicator in the navbar.
 * @param {"camera"|"model"|"engine"} id  - which indicator
 * @param {boolean} isActive              - true = connected/loaded/active
 */
function setStatus(id, isActive) {
  const dotMap = {
    camera: "dot-camera",
    model:  "dot-model",
    engine: "dot-engine",
  };
  const valMap = {
    camera: { true: "Connected",  false: "Disconnected" },
    model:  { true: "Loaded",     false: "Not Loaded"   },
    engine: { true: "Active",     false: "Inactive"     },
  };
  const activeClass = {
    camera: "connected",
    model:  "loaded",
    engine: "active-engine",
  };

  const dot = document.getElementById(dotMap[id]);
  const val = document.getElementById("val-" + id);
  if (!dot || !val) return;

  if (isActive) {
    dot.classList.add(activeClass[id]);
    val.textContent = valMap[id].true;
  } else {
    dot.classList.remove(activeClass[id]);
    val.textContent = valMap[id].false;
  }
}

// --- Demo: simulate status changes so the UI is not static ---
// Remove this block when backend integration is in place.
(function simulateStatus() {
  setTimeout(() => setStatus("camera", true),  1200);
  setTimeout(() => setStatus("model",  true),  2400);
  setTimeout(() => setStatus("engine", true),  3600);
})();


// ============================================================
// 4. GESTURE LIST — Dynamic Rendering
//    Backend should call renderGestureList(gesturesArray)
//    whenever the list changes.
//    Each gesture: { name: "Swipe Left", image: "swipe_left.png" }
// ============================================================

const gestureListEl = document.getElementById("gestureList");

/**
 * Build a single gesture card DOM node.
 * @param {{name: string, image: string}} gesture
 * @returns {HTMLElement}
 */
function buildGestureItem(gesture) {
  const item = document.createElement("div");
  item.className = "gesture-item";
  item.dataset.name = gesture.name;

  // Dot accent
  const dot = document.createElement("span");
  dot.className = "gesture-dot";

  // Name label
  const nameEl = document.createElement("span");
  nameEl.className = "gesture-name";
  nameEl.textContent = gesture.name;

  // Preview box (appears to the LEFT on hover via CSS)
  const preview = document.createElement("div");
  preview.className = "gesture-preview";

  if (gesture.image) {
    const img = document.createElement("img");
    // Images live in  gesture list/<filename>
    img.src = `../assets/images/main page images/gesture list/${gesture.image}`;
    img.alt = gesture.name;
    // Fallback if image fails to load
    img.onerror = () => {
      img.replaceWith(makePlaceholder());
    };
    preview.appendChild(img);
  } else {
    preview.appendChild(makePlaceholder());
  }

  item.appendChild(dot);
  item.appendChild(nameEl);
  item.appendChild(preview);

  return item;
}

/** Returns a plain emoji placeholder when no image is available */
function makePlaceholder() {
  const ph = document.createElement("span");
  ph.className = "gesture-preview-placeholder";
  ph.textContent = "🖐";
  return ph;
}

/**
 * Render (or re-render) the full gesture list.
 * Call this whenever the backend data changes.
 * @param {Array<{name: string, image: string}>} gestures
 */
function renderGestureList(gestures) {
  // Clear existing items cleanly
  gestureListEl.innerHTML = "";

  if (!gestures || gestures.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "opacity:0.4; font-size:12px; text-align:center; margin-top:20px;";
    empty.textContent = "No gestures found";
    gestureListEl.appendChild(empty);
    return;
  }

  gestures.forEach(g => {
    gestureListEl.appendChild(buildGestureItem(g));
  });
}

// ---- Demo gesture data (replace with backend fetch) ----
// In production: fetch("/api/gestures").then(r => r.json()).then(renderGestureList)
const DEMO_GESTURES = [
  { name: "Swipe Left",    image: "swipe_left.png"   },
  { name: "Swipe Right",   image: "swipe_right.png"  },
  { name: "Swipe Up",      image: "swipe_up.png"     },
  { name: "Swipe Down",    image: "swipe_down.png"   },
  { name: "Pinch",         image: "pinch.png"        },
  { name: "Open Palm",     image: "open_palm.png"    },
  { name: "Fist",          image: "fist.png"         },
  { name: "Peace Sign",    image: "peace.png"        },
  { name: "Thumbs Up",     image: "thumbs_up.png"    },
  { name: "Point Up",      image: "point_up.png"     },
];

// Initial render
renderGestureList(DEMO_GESTURES);

// ---- Polling: re-fetch from backend every 5 seconds ----
// Uncomment when backend is ready:
//
// setInterval(async () => {
//   try {
//     const res  = await fetch("/api/gestures");
//     const data = await res.json();
//     renderGestureList(data);
//   } catch (err) {
//     console.warn("Could not refresh gesture list:", err);
//   }
// }, 5000);


// ============================================================
// 5. START BUTTON — handled entirely in CSS via hover.
//    The JS below fires when the user actually clicks the
//    start wrapper, so the backend can hook in here.
// ============================================================

const startWrapper = document.getElementById("startWrapper");

startWrapper.addEventListener("click", () => {
  console.log("Start Gesture Control clicked — connect backend here.");

  // Get center position of the start button
  const rect = startWrapper.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Create circular transition overlay
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

  // Trigger the expanding circle
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.clipPath = `circle(150% at ${x}px ${y}px)`;
    });
  });

  // Navigate after animation completes
  setTimeout(() => {
    window.location.href = "../control screen/index.html";
  }, 800);
});