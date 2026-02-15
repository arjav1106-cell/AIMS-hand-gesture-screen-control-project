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

// Theme
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  switchIcon.textContent =
    document.body.classList.contains("light") ? "☀" : "🌙";
});

// Focus
focusToggle.addEventListener("click", () => {
  document.body.classList.toggle("focus-active");
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
