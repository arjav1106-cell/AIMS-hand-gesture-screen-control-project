// ============================================================
// THEME
// ============================================================
const themeToggle = document.getElementById('themeToggle');
const switchIcon  = document.querySelector('.switch-icon');
const layout      = document.getElementById('layout');

if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light');
  switchIcon.textContent = '☀';
}
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light');
  switchIcon.textContent = document.body.classList.contains('light') ? '☀' : '🌙';
  localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

// ============================================================
// SIDEBAR
// ============================================================
const sidebarToggle = document.getElementById('sidebarToggle');
if (localStorage.getItem('sidebarCollapsed') === 'true') layout.classList.add('collapsed');
sidebarToggle.addEventListener('click', () => {
  layout.classList.toggle('collapsed');
  localStorage.setItem('sidebarCollapsed', layout.classList.contains('collapsed'));
});

// ============================================================
// NAVIGATION
// ============================================================
function navigateWithSlide(destination) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; top:0; left:0; width:100%; height:100%;
    background:${document.body.classList.contains('light')
      ? 'linear-gradient(180deg,#e6ecf5 0%,#dde5f0 100%)'
      : 'radial-gradient(circle at 30% 20%,#16213e 0%,#0a0f1f 40%,#050814 100%)'};
    z-index:9999; opacity:0;
    transition:opacity 0.55s cubic-bezier(0.4,0,0.2,1);
    pointer-events:none;
  `;
  document.body.appendChild(overlay);
  document.body.style.transition = 'opacity 0.55s cubic-bezier(0.4,0,0.2,1), transform 0.55s cubic-bezier(0.4,0,0.2,1)';
  document.body.style.opacity = '0';
  document.body.style.transform = 'translateY(-12px)';
  requestAnimationFrame(() => requestAnimationFrame(() => { overlay.style.opacity = '1'; }));
  setTimeout(() => { window.location.href = destination; }, 550);
}

document.getElementById('homeBtn').addEventListener('click', () => navigateWithSlide('../home page/main-index.html'));
document.getElementById('controlBtn').addEventListener('click', () => navigateWithSlide('../control screen/index.html'));
document.getElementById('navGestureListBtn').addEventListener('click', () => navigateWithSlide('../gesture list screen/gesture-list.html'));

// ============================================================
// STATE
// ============================================================
let gestureName   = '';
let capturesDone  = false;
let gestureTotal  = 0;   // updated from backend after save

// ============================================================
// STEP MACHINE
// ============================================================
const stepItems  = document.querySelectorAll('.step-item');
const stepVlines = document.querySelectorAll('.step-vline');
const stepCards  = document.querySelectorAll('.step-card');

function goToStep(n) {
  stepCards.forEach(c => c.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  stepItems.forEach((item, i) => {
    item.classList.remove('active', 'done');
    if (i + 1 < n)  item.classList.add('done');
    if (i + 1 === n) item.classList.add('active');
  });
  stepVlines.forEach((vl, i) => vl.classList.toggle('done', i + 1 < n));
}

// ============================================================
// STEP 1 — Name
// ============================================================
const nameInput  = document.getElementById('gestureNameInput');
const charCount  = document.getElementById('charCount');
const toStep2Btn = document.getElementById('toStep2Btn');

const nameError = document.createElement('p');
nameError.style.cssText = 'color:#ef4444; font-size:11px; margin-top:-8px; display:none;';
nameInput.insertAdjacentElement('afterend', nameError);

nameInput.addEventListener('input', () => {
  const val = nameInput.value.trim();
  charCount.textContent = nameInput.value.length;

  // Check against stored gesture list
  const stored = localStorage.getItem('gestureList');
  const list = stored ? JSON.parse(stored) : [];
  const isDuplicate = list.some(g => g.name.toLowerCase() === val.toLowerCase());

  if (isDuplicate) {
    nameInput.style.borderColor = '#ef4444';
    nameInput.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.15)';
    nameError.textContent = 'A gesture with this name already exists.';
    nameError.style.display = 'block';
    toStep2Btn.disabled = true;
  } else {
    nameInput.style.borderColor = '';
    nameInput.style.boxShadow = '';
    nameError.style.display = 'none';
    toStep2Btn.disabled = val.length === 0;
  }
});

toStep2Btn.addEventListener('click', () => {
  gestureName = nameInput.value.trim();
  document.getElementById('gestureNameDisplay').textContent = `"${gestureName}"`;

  // Show gesture name in webcam footer
  const wcName = document.getElementById('wcGestureName');
  wcName.textContent = gestureName;
  wcName.classList.add('visible');

  goToStep(2);
});

// ============================================================
// STEP 2 — Preview
// ============================================================
function resetStep1() {
  nameInput.value = '';
  charCount.textContent = '0';
  gestureName = '';
  toStep2Btn.disabled = true;
  const wcName = document.getElementById('wcGestureName');
  wcName.textContent = '';
  wcName.classList.remove('visible');
  nameInput.style.borderColor = '';
  nameInput.style.boxShadow = '';
}

document.getElementById('backToStep1Btn').addEventListener('click', () => {
  resetStep1();
  goToStep(1);
});
document.getElementById('toStep3Btn').addEventListener('click', () => {
  resetCaptureState();
  goToStep(3);
});

// ============================================================
// STEP 3 — Capture with loading bar + confirmation
// ============================================================
document.getElementById('backToStep2Btn').addEventListener('click', () => goToStep(2));

const startCaptureBtn = document.getElementById('startCaptureBtn');
const toStep4Btn      = document.getElementById('toStep4Btn');
const captureIdle     = document.getElementById('captureIdle');
const captureLoading  = document.getElementById('captureLoading');
const captureSuccess  = document.getElementById('captureSuccess');
const loadingBarFill  = document.getElementById('loadingBarFill');
const loadingPct      = document.getElementById('loadingPct');
const loadingLabel    = document.getElementById('loadingLabel');

function setState(id) {
  [captureIdle, captureLoading, captureSuccess].forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function resetCaptureState() {
  capturesDone = false;
  loadingBarFill.style.width = '0%';
  loadingBarFill.style.transition = '';
  loadingPct.textContent = '0%';
  loadingLabel.textContent = 'Recording gesture…';
  startCaptureBtn.disabled = false;
  startCaptureBtn.textContent = '';
  // rebuild button content
  startCaptureBtn.innerHTML = `
    <span class="capture-ring"></span>
    <svg viewBox="0 0 24 24" class="capture-icon"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
    Start Recording`;
  toStep4Btn.disabled = true;
  setState('captureIdle');
}

// Simulated loading: fills to ~90% in fixed time, then waits for backend "confirmation"
// Replace simulateBackendConfirmation() with your real backend call.
startCaptureBtn.addEventListener('click', () => {
  if (capturesDone) return;
  startCaptureBtn.disabled = true;
  setState('captureLoading');

  const FILL_DURATION = 4000;   // ms to reach ~90%
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const rawPct = Math.min((elapsed / FILL_DURATION) * 90, 90);
    const pct = Math.round(rawPct);
    loadingBarFill.style.width = pct + '%';
    loadingPct.textContent = pct + '%';

    if (pct < 90) {
      requestAnimationFrame(tick);
    } else {
      // Filled to 90% — wait for backend
      loadingLabel.textContent = 'Finalising…';
      simulateBackendConfirmation();
    }
  }
  requestAnimationFrame(tick);
});

function simulateBackendConfirmation() {
  // TODO: replace with real backend call, then call onCaptureConfirmed() in the callback
  setTimeout(() => {
    onCaptureConfirmed();
  }, 1200);   // simulates backend response delay
}

function onCaptureConfirmed() {
  // Fill remaining bar to 100%
  loadingBarFill.style.transition = 'width 0.5s cubic-bezier(0.4,0,0.2,1)';
  loadingBarFill.style.width = '100%';
  loadingPct.textContent = '100%';

  setTimeout(() => {
    setState('captureSuccess');
    capturesDone = true;
    toStep4Btn.disabled = false;
  }, 550);
}

toStep4Btn.addEventListener('click', () => {
  const stored = localStorage.getItem('gestureList');
  const currentCount = stored ? JSON.parse(stored).length : 0;
  gestureTotal = currentCount + 1;  // +1 for the gesture being added

  document.getElementById('summaryName').textContent  = gestureName;
  document.getElementById('summaryTotal').textContent = gestureTotal;

  // Reset step-4 button states
  setStep4State('pending');
  goToStep(4);
});

// ============================================================
// STEP 4 — Save / Delete logic
// ============================================================
document.getElementById('backToStep3Btn').addEventListener('click', () => goToStep(3));

const confirmSaveBtn  = document.getElementById('confirmSaveBtn');
const deleteNewBtn    = document.getElementById('deleteNewBtn');
const goGestureListBtn = document.getElementById('goGestureListBtn');
const trainAnotherBtn = document.getElementById('trainAnotherBtn');

// pending  → both confirm+delete active, nav buttons locked
// saved    → delete faded, nav buttons unlocked
// deleted  → confirm faded, nav buttons unlocked
function setStep4State(state) {
  // reset all
  confirmSaveBtn.disabled  = false;
  deleteNewBtn.disabled    = false;
  goGestureListBtn.classList.add('locked');
  trainAnotherBtn.classList.add('locked');
  goGestureListBtn.disabled = true;
  trainAnotherBtn.disabled  = true;

  if (state === 'saved') {
    deleteNewBtn.disabled = true;
    goGestureListBtn.classList.remove('locked');
    trainAnotherBtn.classList.remove('locked');
    goGestureListBtn.disabled = false;
    trainAnotherBtn.disabled  = false;
  } else if (state === 'deleted') {
    confirmSaveBtn.disabled = true;
    goGestureListBtn.classList.remove('locked');
    trainAnotherBtn.classList.remove('locked');
    goGestureListBtn.disabled = false;
    trainAnotherBtn.disabled  = false;
  }
}

confirmSaveBtn.addEventListener('click', () => {
  console.log('[Backend] Save gesture:', gestureName);

  // Add new gesture to the shared localStorage list
  const stored = localStorage.getItem('gestureList');
  const list = stored ? JSON.parse(stored) : [];
  if (!list.find(g => g.name === gestureName)) {
    list.push({ name: gestureName, image: '' });
    localStorage.setItem('gestureList', JSON.stringify(list));
  }

  // Update displayed total
  document.getElementById('summaryTotal').textContent = list.length;

  // TODO: replace with real API call
  // fetch('/api/gestures/save', { method:'POST', body: JSON.stringify({ name: gestureName }) })

  confirmSaveBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Saved!`;
  confirmSaveBtn.style.background = 'rgba(52,211,153,0.25)';

  setStep4State('saved');
});

deleteNewBtn.addEventListener('click', () => {
  console.log('[Backend] Delete newly recorded gesture:', gestureName);

  // Remove from localStorage list if it was saved
  const stored = localStorage.getItem('gestureList');
  if (stored) {
    const list = JSON.parse(stored).filter(g => g.name !== gestureName);
    localStorage.setItem('gestureList', JSON.stringify(list));
  }

  // TODO: replace with real API call
  // fetch('/api/gestures/delete-latest', { method:'DELETE' })

  deleteNewBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Deleted`;
  deleteNewBtn.style.background = 'rgba(239,68,68,0.2)';

  setStep4State('deleted');
});

goGestureListBtn.addEventListener('click', () => navigateWithSlide('../gesture list screen/gesture-list.html'));

trainAnotherBtn.addEventListener('click', () => {
  resetStep1();
  capturesDone = false;

  // Reset confirm/delete buttons
  confirmSaveBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Confirm Save`;
  confirmSaveBtn.style.background = '';
  deleteNewBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete New Gesture`;
  deleteNewBtn.style.background = '';

  resetCaptureState();
  goToStep(1);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    switch (currentStep) {
      case 1:
        if (!toStep2Btn.disabled) toStep2Btn.click();
        break;
      case 2:
        document.getElementById('toStep3Btn').click();
        break;
      case 3:
        if (!toStep4Btn.disabled) toStep4Btn.click();
        break;
      case 4:
        if (!confirmSaveBtn.disabled) confirmSaveBtn.click();
        break;
    }
  }

  if (e.key === 'Escape') {
    switch (currentStep) {
      case 2:
        document.getElementById('backToStep1Btn').click();
        break;
      case 3:
        document.getElementById('backToStep2Btn').click();
        break;
      case 4:
        document.getElementById('backToStep3Btn').click();
        break;
    }
  }
});

// ============================================================
// GESTURE LIST — backend integration note
// ============================================================
// When the gesture list page loads, it should call:
//   GET /api/gestures  →  returns array of gesture objects
// and render them.  The count stored in localStorage here is
// only a client-side placeholder until your backend is wired.
//
// For the gesture-list DELETE to update the backend, in
// gesture-list-script.js add a fetch inside the delete handler:
//   fetch(`/api/gestures/${gestureId}`, { method: 'DELETE' })
