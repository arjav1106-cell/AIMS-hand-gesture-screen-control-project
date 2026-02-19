"""
Desktop Stream Module
=====================
Captures the live PC desktop in real time and streams it as MJPEG.
Provides mouse and keyboard input injection via pyautogui.

Lifecycle: start() -> capture loop runs in thread -> stop() releases resources.
Independent of MediaPipe (camera) - does not conflict with gesture recognition.
"""

import threading
import time
import numpy as np

# Desktop capture: mss is fast and cross-platform (works on Windows)
try:
    import mss
except ImportError:
    mss = None

# Input injection
try:
    import pyautogui
    pyautogui.FAILSAFE = False  # Allow remote control from web UI
except ImportError:
    pyautogui = None

# JPEG encoding
try:
    import cv2
except ImportError:
    cv2 = None

# -----------------------------------------------------------------------------
# STATE
# -----------------------------------------------------------------------------
_running = False
_thread = None
_last_desktop_frame = None
_screen_width = 1920
_screen_height = 1080
_lock = threading.Lock()


def _capture_loop():
    """
    Capture loop: grab desktop, encode to JPEG, store in _last_desktop_frame.
    Runs in background thread. Exits when _running becomes False.
    """
    global _last_desktop_frame, _screen_width, _screen_height
    if not mss or not cv2:
        return

    with mss.mss() as sct:
        # Monitor 0 = primary display (full virtual screen)
        mon = sct.monitors[0]
        _screen_width = mon["width"]
        _screen_height = mon["height"]

        while _running:
            try:
                screenshot = sct.grab(mon)
                # mss returns BGRA; convert to BGR for OpenCV
                frame = np.array(screenshot)
                frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
                _, jpeg = cv2.imencode(".jpg", frame)
                _last_desktop_frame = jpeg.tobytes()
            except Exception as e:
                print("Desktop capture error:", e)
            time.sleep(0.04)  # ~25 FPS


def start():
    """
    Start desktop capture. Only one capture loop runs at a time.
    Idempotent: no-op if already running.
    """
    global _running, _thread
    with _lock:
        if _running:
            return True
        if not mss or not cv2:
            return False
        _running = True
        _thread = threading.Thread(target=_capture_loop, daemon=True)
        _thread.start()
    return True


def stop():
    """
    Stop desktop capture, release resources. No zombie threads.
    """
    global _running, _thread, _last_desktop_frame
    with _lock:
        _running = False
    if _thread:
        _thread.join(timeout=2)
        _thread = None
    _last_desktop_frame = None


def get_last_frame():
    """Return latest JPEG frame bytes, or None if not running."""
    return _last_desktop_frame


def is_running():
    return _running


def get_screen_size():
    """Return (width, height) of primary monitor."""
    return _screen_width, _screen_height


# -----------------------------------------------------------------------------
# INPUT INJECTION
# -----------------------------------------------------------------------------

def inject_mouse(x: float, y: float, button: str = "left", action: str = "click"):
    """
    Inject mouse event on the physical screen.
    x, y: normalized 0-1 coordinates, or absolute pixel coords if screen size known.
    button: "left", "right", "middle"
    action: "click", "down", "up", "move"
    """
    if not pyautogui:
        return
    # Map normalized (0-1) to screen pixels
    px = int(x * _screen_width) if 0 <= x <= 1 else int(x)
    py = int(y * _screen_height) if 0 <= y <= 1 else int(y)
    px = max(0, min(px, _screen_width - 1))
    py = max(0, min(py, _screen_height - 1))

    if action == "move":
        pyautogui.moveTo(px, py)
    elif action == "down":
        pyautogui.mouseDown(px, py, button=button)
    elif action == "up":
        pyautogui.mouseUp(px, py, button=button)
    else:  # click
        pyautogui.click(px, py, button=button)


def inject_key(key: str, action: str = "press"):
    """
    Inject keyboard event.
    key: key name (e.g. "enter", "space", "a", "ctrl")
    action: "press", "down", "up"
    """
    if not pyautogui:
        return
    if action == "down":
        pyautogui.keyDown(key)
    elif action == "up":
        pyautogui.keyUp(key)
    else:
        pyautogui.press(key)


def inject_text(text: str):
    """Type a string of characters."""
    if pyautogui:
        pyautogui.write(text, interval=0.02)
