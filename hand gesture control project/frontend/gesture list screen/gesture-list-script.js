/* ============================================================
   gesture-list-script.js
   Dynamic gesture loading, rendering, and management
============================================================ */

// ============================================================
// THEME PERSISTENCE
// ============================================================
if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
  const icon = document.querySelector(".switch-icon");
  if (icon) icon.textContent = "☀";
}

// ============================================================
// DOM ELEMENTS
// ============================================================
const layout = document.querySelector(".layout");
const sidebarToggle = document.getElementById("sidebarToggle");
const themeToggle = document.getElementById("themeToggle");
const switchIcon = document.querySelector(".switch-icon");
const gestureGrid = document.getElementById("gestureGrid");
const gestureCount = document.getElementById("gestureCount");
const homeBtn = document.getElementById("homeBtn");
const controlBtn = document.getElementById("controlBtn");

// ============================================================
// SIDEBAR COLLAPSE
// ============================================================
if (localStorage.getItem("sidebarCollapsed") === "true") {
  layout.classList.add("collapsed");
}

sidebarToggle.addEventListener("click", () => {
  layout.classList.toggle("collapsed");
  localStorage.setItem("sidebarCollapsed", layout.classList.contains("collapsed"));
});

// ============================================================
// THEME TOGGLE
// ============================================================
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  switchIcon.textContent =
    document.body.classList.contains("light") ? "☀" : "🌙";
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

// ============================================================
// NAVIGATION WITH CIRCULAR TRANSITION
// ============================================================
function navigateWithCircle(element, destination) {
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
    transition: opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  `;
  document.body.appendChild(overlay);

  document.body.style.transition = 'opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1), transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)';
  document.body.style.opacity = '0';
  document.body.style.transform = 'translateY(12px)';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  });

  setTimeout(() => {
    window.location.href = destination;
  }, 550);
}

// Home button
homeBtn.addEventListener("click", () => {
  navigateWithCircle(homeBtn, '../home page/main-index.html');
});

// Control Screen button
controlBtn.addEventListener("click", () => {
  navigateWithCircle(controlBtn, '../control screen/index.html');
});

// ============================================================
// GESTURE DATA & MANAGEMENT
// ============================================================

// Path to gesture images folder (customize this to match your structure)
const GESTURE_IMAGE_PATH = '../assets/images/main page images/gesture list/';

/**
 * Build a single gesture card DOM element
 * @param {{name: string, image: string}} gesture
 * @returns {HTMLElement}
 */
function buildGestureCard(gesture) {
  const card = document.createElement('div');
  card.className = 'gesture-card';
  card.dataset.name = gesture.name;

  // Card header with name and delete button
  const header = document.createElement('div');
  header.className = 'gesture-card-header';

  const name = document.createElement('div');
  name.className = 'gesture-name';
  name.textContent = gesture.name;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <line x1="6" y1="6" x2="18" y2="18"></line>
      <line x1="18" y1="6" x2="6" y2="18"></line>
    </svg>
  `;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showDeleteModal(gesture.name, gesture.image, card);
  });

  header.appendChild(name);
  header.appendChild(deleteBtn);

  // Image container
  const imageContainer = document.createElement('div');
  imageContainer.className = 'gesture-image-container';

  if (gesture.image) {
    const img = document.createElement('img');
    img.src = GESTURE_IMAGE_PATH + gesture.image;
    img.alt = gesture.name;
    img.className = 'gesture-image';
    img.onerror = () => {
      img.replaceWith(makePlaceholder());
    };
    imageContainer.appendChild(img);
  } else {
    imageContainer.appendChild(makePlaceholder());
  }

  card.appendChild(header);
  card.appendChild(imageContainer);

  return card;
}

/**
 * Create placeholder icon when image is missing
 * @returns {HTMLElement}
 */
function makePlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'gesture-placeholder';
  placeholder.textContent = '🖐';
  return placeholder;
}

/**
 * Build the "Add New Gesture" card
 * @returns {HTMLElement}
 */
function buildAddCard() {
  const card = document.createElement('div');
  card.className = 'add-gesture-card';
  card.id = 'addGestureCard';

  card.innerHTML = `
    <svg viewBox="0 0 24 24" class="add-icon">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="16"></line>
      <line x1="8" y1="12" x2="16" y2="12"></line>
    </svg>
    <div class="add-text">Add New Gesture</div>
  `;

  card.addEventListener('click', handleAddGesture);

  return card;
}

/**
 * Render the complete gesture grid
 * @param {Array<{name: string, image: string}>} gestures
 */
function renderGestureList(gestures) {
  gestureGrid.innerHTML = '';

  if (!gestures || gestures.length === 0) {
    gestureCount.textContent = '0';
    gestureGrid.appendChild(buildAddCard());
    return;
  }

  gestures.forEach(g => {
    gestureGrid.appendChild(buildGestureCard(g));
  });

  gestureGrid.appendChild(buildAddCard());

  // Update count
  gestureCount.textContent = gestures.length;
}

/**
 * Show delete confirmation modal
 * @param {string} gestureName
 * @param {string} gestureImage
 * @param {HTMLElement} cardElement
 */
function showDeleteModal(gestureName, gestureImage, cardElement) {
  const modal = document.getElementById('deleteModal');
  const modalName = document.getElementById('modalGestureName');
  const modalImage = document.getElementById('modalGestureImage');
  const modalClose = document.getElementById('modalClose');
  const modalConfirm = document.getElementById('modalConfirmBtn');

  // Set gesture info
  modalName.textContent = gestureName;
  modalImage.src = GESTURE_IMAGE_PATH + gestureImage;
  modalImage.alt = gestureName;

  // Show modal
  modal.classList.add('active');

  // Close button handler
  const closeModal = () => {
    modal.classList.remove('active');
  };

  modalClose.onclick = closeModal;

  // Click outside to close
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  // Confirm delete handler
  modalConfirm.onclick = () => {
    closeModal();
    deleteGesture(gestureName, cardElement);
  };
}

/**
 * Delete a gesture with animation
 * @param {string} gestureName
 * @param {HTMLElement} cardElement
 */
function deleteGesture(gestureName, cardElement) {
  console.log(`Deleting gesture: ${gestureName}`);

  // Add deleting animation
  cardElement.classList.add('deleting');

  // Wait for animation to complete
  setTimeout(() => {
    // Remove from DOM
    cardElement.remove();

    // Remove from DEMO_GESTURES array (in production, also call backend API)
    const index = DEMO_GESTURES.findIndex(g => g.name === gestureName);
    if (index > -1) {
      DEMO_GESTURES.splice(index, 1);
    }

    // Update count
    gestureCount.textContent = DEMO_GESTURES.length;

    // TODO: Call backend API to delete
    // fetch(`/api/gestures/${gestureName}`, { method: 'DELETE' });

  }, 400); // Match animation duration
}

/**
 * Handle "Add New Gesture" click
 */
function handleAddGesture() {
  console.log('Add new gesture clicked');
  
  // TODO: Open modal or navigate to add gesture form
  // For now, just show a console message
  alert('Add New Gesture functionality - connect to your backend/modal here');
}

// ============================================================
// DEMO GESTURE DATA
// In production: fetch from backend API
// ============================================================
const DEMO_GESTURES = [
  { name: "Swipe Left",    image: "gesture_swipe_left.png"   },
  { name: "Swipe Right",   image: "gesture_swipe_right.png"  },
  { name: "Swipe Up",      image: "gesture_swipe_up.png"     },
  { name: "Swipe Down",    image: "gesture_swipe_down.png"   },
  { name: "Pinch",         image: "gesture_pinch.png"        },
  { name: "Open Palm",     image: "gesture_open_palm.png"    },
  { name: "Fist",          image: "gesture_fist.png"         },
  { name: "Peace Sign",    image: "gesture_peace.png"        },
  { name: "Thumbs Up",     image: "gesture_thumbs_up.png"    },
  { name: "Point Up",      image: "gesture_point_up.png"     },
  { name: "OK Hand",       image: "gesture_ok.png"           },
  { name: "Wave",          image: "gesture_wave.png"         },
];

// ============================================================
// INITIAL RENDER
// ============================================================
renderGestureList(DEMO_GESTURES);

// ============================================================
// BACKEND INTEGRATION (COMMENTED OUT)
// Uncomment and customize when backend is ready
// ============================================================

/*
// Fetch gestures from backend on page load
async function loadGestures() {
  try {
    const response = await fetch('/api/gestures');
    const gestures = await response.json();
    renderGestureList(gestures);
  } catch (error) {
    console.error('Failed to load gestures:', error);
  }
}

// Poll for updates every 5 seconds
setInterval(async () => {
  try {
    const response = await fetch('/api/gestures');
    const gestures = await response.json();
    renderGestureList(gestures);
  } catch (error) {
    console.warn('Failed to refresh gestures:', error);
  }
}, 5000);

// Call on load
loadGestures();
*/
