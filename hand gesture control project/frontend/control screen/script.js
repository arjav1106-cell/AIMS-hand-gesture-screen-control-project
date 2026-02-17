// Apply saved theme on load
if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
  // Update switch icon if it exists on this page
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
sidebarToggle.addEventListener("click", () => {
  layout.classList.toggle("collapsed");
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

// Focus - Navigate to focus mode with circular transition
focusToggle.addEventListener("click", (e) => {
  // Get the position of the toggle switch
  const rect = focusToggle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  // Create circular transition overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${document.body.classList.contains('light') 
    ? 'linear-gradient(180deg, #e6ecf5 0%, #dde5f0 100%)' 
    : 'radial-gradient(circle at 30% 20%, #16213e 0%, #0a0f1f 40%, #050814 100%)'};
    z-index: 9999;
    pointer-events: none;
    clip-path: circle(0% at ${x}px ${y}px);
    transition: clip-path 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  
  document.body.appendChild(overlay);
  
  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.clipPath = `circle(150% at ${x}px ${y}px)`;
    });
  });
  
  // Navigate after animation
  setTimeout(() => {
    window.location.href = '../control screen focus mode/focus.html';
  }, 800);
});

// System status blinking
setInterval(() => {
  statusDot.classList.toggle("active");
  statusDot.classList.toggle("inactive");
}, 3000);

// =========================
// Doughnut Timer
// =========================

const circle = document.querySelector(".progress-circle");
const timerText = document.getElementById("timerText");

const radius = 70;
const circumference = 2 * Math.PI * radius;

circle.style.strokeDasharray = circumference;
circle.style.strokeDashoffset = circumference;

// This duration should come from backend later
// For now simulate 10 seconds
let totalDuration = 10; // seconds (backend will set this)
let elapsed = 0;

function startTimer(duration) {
  totalDuration = duration;
  elapsed = 0;

  const interval = setInterval(() => {
    elapsed++;

    const progress = elapsed / totalDuration;
    const offset = circumference - progress * circumference;
    circle.style.strokeDashoffset = offset;

    timerText.textContent = `${elapsed}s`;

    if (elapsed >= totalDuration) {
      clearInterval(interval);
    }
  }, 1000);
}

// Example start (remove later when backend controls it)
startTimer(10);
