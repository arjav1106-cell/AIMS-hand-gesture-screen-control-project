#!/usr/bin/env python3
"""
Gesture Control Server
======================
Bridges frontend and backend. Serves static files, exposes REST APIs,
manages MediaPipe + ANN lifecycle, and streams video/predictions.

Run: python server.py
Then open http://localhost:5000 in the browser.
"""

import os
import sys
import json
import threading
import time
import queue
import subprocess
import platform

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from flask import Flask, request, jsonify, Response, redirect, send_from_directory
from flask_cors import CORS

import gesture_storage as gs
from mediapipe_engine import MediaPipeEngine
import desktop_stream as ds
# Note: gesture_images.py disabled - no LLM image generation required

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "backend")
GESTURES_DB = os.path.join(BACKEND_DIR, "gestures_db.json")

app = Flask(__name__, static_folder=None)
CORS(app)

# -----------------------------------------------------------------------------
# GLOBAL STATE (single engine instance, mode: training | recognition | idle)
# -----------------------------------------------------------------------------
_mode = "idle"  # idle | training | recognition
_engine: MediaPipeEngine | None = None
_event_queue = queue.Queue()
_last_frame = None
_last_hand_detected = False

# For training: track current recording state
_recording = False
_recording_gesture = None
_recording_hitting_time = 3.0


def _get_engine() -> MediaPipeEngine | None:
    return _engine


def _set_mode(m: str):
    global _mode
    _mode = m


# -----------------------------------------------------------------------------
# STATIC FILE SERVING (frontend)
# -----------------------------------------------------------------------------

@app.route("/")
def index():
    """Redirect to home page."""
    return redirect("/home%20page/main-index.html")


@app.route("/<path:path>")
def serve_static(path):
    """
    Serve frontend files. Paths like:
    - home page/main-index.html
    - home page/main-script.js
    - training screen/gesture-training.html
    - control screen/index.html
    - etc.
    """
    return send_from_directory(FRONTEND_DIR, path)


# -----------------------------------------------------------------------------
# GESTURE CRUD API (central database - syncs everywhere)
# -----------------------------------------------------------------------------

@app.route("/api/gestures", methods=["GET"])
def get_gestures():
    """
    GET /api/gestures
    Returns all gestures: [{ id, name, image, hittingTime }, ...]
    Used by: Home sidebar, Gesture List screen. Poll for auto-sync.
    """
    gestures = gs.load_gestures(GESTURES_DB)
    # Map to frontend format (name, image, hittingTime)
    out = [{"id": g["id"], "name": g["name"], "image": g.get("image", ""), "hittingTime": g.get("hittingTime", 3)} for g in gestures]
    return jsonify(out)


@app.route("/api/gestures", methods=["POST"])
def add_gesture():
    """
    POST /api/gestures
    Body: { "name": "...", "image": "...", "hittingTime": 3 }
    Add new gesture. Used after training save.
    """
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    image = data.get("image", "")
    hitting_time = float(data.get("hittingTime", 3))
    if not name:
        return jsonify({"error": "name required"}), 400
    try:
        g = gs.add_gesture(name, image, hitting_time, GESTURES_DB)
        return jsonify(g)
    except ValueError as e:
        return jsonify({"error": str(e)}), 409


@app.route("/api/gestures/delete-latest", methods=["DELETE"])
def delete_latest_gesture():
    """
    DELETE /api/gestures/delete-latest
    Remove the most recently added gesture. Used by Training "Delete New Gesture".
    """
    removed = gs.delete_latest_gesture(GESTURES_DB)
    if removed:
        return jsonify({"deleted": removed})
    return jsonify({"error": "No gestures to delete"}), 404


@app.route("/api/gestures/<gesture_id>", methods=["DELETE"])
def delete_gesture(gesture_id):
    """
    DELETE /api/gestures/<id>
    Remove gesture by id. Used by Gesture List screen delete.
    """
    if gs.delete_gesture_by_id(gesture_id, GESTURES_DB):
        return jsonify({"ok": True})
    return jsonify({"error": "Gesture not found"}), 404


@app.route("/api/gestures/delete-by-name", methods=["POST"])
def delete_gesture_by_name():
    """
    POST /api/gestures/delete-by-name
    Body: { "name": "..." }
    Remove gesture by name. Used by Training "Delete New Gesture".
    """
    data = request.get_json() or {}
    name = data.get("name", "")
    if gs.delete_gesture_by_name(name, GESTURES_DB):
        return jsonify({"ok": True})
    return jsonify({"error": "Gesture not found"}), 404


# -----------------------------------------------------------------------------
# TRAINING API
# -----------------------------------------------------------------------------

def _on_training_frame(jpeg_bytes: bytes, hand_detected: bool):
    """Callback: store latest frame for MJPEG stream."""
    global _last_frame, _last_hand_detected
    _last_frame = jpeg_bytes
    _last_hand_detected = hand_detected


def _on_training_recording_done(done: bool):
    """Callback: push event when recording completes."""
    if done:
        _event_queue.put({"type": "recording_done"})


def _start_training_engine():
    """Start MediaPipe in training mode (preview only, no ANN prediction)."""
    global _engine, _mode
    if _engine:
        _engine.stop()
    _engine = MediaPipeEngine(
        frame_callback=_on_training_frame,
        recording_callback=_on_training_recording_done,
        use_separate_window=False,
    )
    _engine.load_model()  # load if exists, for label mapping
    _engine.start()
    _set_mode("training")


@app.route("/api/training/start", methods=["GET"])
@app.route("/api/start_training_preview", methods=["GET"])
def training_start():
    """
    GET /api/training/start or /api/start_training_preview
    Start MediaPipe in PREVIEW mode for Training screen. Access camera, stream to /api/video/feed.
    """
    _start_training_engine()
    return jsonify({"ok": True, "videoUrl": "/api/video/feed"})


@app.route("/api/training/record", methods=["POST"])
@app.route("/api/start_recording", methods=["POST"])  # Alias: switch from preview -> recording
def training_record():
    """
    POST /api/training/record
    Body: { "action": "start"|"stop", "gestureName": "...", "hittingTime": 3 }
    Start or stop recording. On stop: train model, save gesture to DB.
    """
    global _recording, _recording_gesture, _recording_hitting_time, _engine
    data = request.get_json() or {}
    action = data.get("action", "stop")
    gesture_name = data.get("gestureName", "").strip()
    hitting_time = float(data.get("hittingTime", 3))

    eng = _get_engine()
    if not eng or _mode != "training":
        return jsonify({"error": "Training not started"}), 400

    if action == "start":
        if not gesture_name:
            return jsonify({"error": "gestureName required"}), 400
        _recording = True
        _recording_gesture = gesture_name
        _recording_hitting_time = hitting_time
        eng.start_recording(gesture_name, duration_sec=4)
        return jsonify({"ok": True, "recording": True})

    elif action == "stop":
        if not _recording:
            return jsonify({"ok": True, "recording": False})
        X_data, Y_data = eng.stop_recording()
        _recording = False

        if X_data and Y_data:
            eng.train_and_save(X_data, Y_data)
            gs.add_gesture(_recording_gesture, "", _recording_hitting_time, GESTURES_DB)

        _recording_gesture = None
        return jsonify({"ok": True, "recording": False, "saved": True})


@app.route("/api/training/stop", methods=["GET"])
@app.route("/api/stop_training", methods=["GET"])
def training_stop():
    """Stop training mode and release camera."""
    _stop_all()
    return jsonify({"ok": True})


# -----------------------------------------------------------------------------
# RECOGNITION API (Control / Focus / Home Start)
# -----------------------------------------------------------------------------

def _on_recognition_frame(jpeg_bytes: bytes, hand_detected: bool):
    global _last_frame, _last_hand_detected
    _last_frame = jpeg_bytes
    _last_hand_detected = hand_detected


def _on_recognition_prediction(gesture: str, confidence: float, hitting_time: float, timer_elapsed: float):
    _event_queue.put({
        "type": "prediction",
        "gesture": gesture,
        "confidence": round(confidence * 100, 1),
        "hittingTime": hitting_time,
        "timerElapsed": round(timer_elapsed, 2),
    })


def _start_recognition_engine(focus_mode: bool = False):
    """Start MediaPipe + ANN for gesture recognition."""
    global _engine, _mode
    if _engine:
        _engine.stop()

    gestures = gs.load_gestures(GESTURES_DB)
    label_to_id = {}
    id_to_label = {}
    hitting_times = {}
    for i, g in enumerate(gestures):
        label_to_id[g["name"]] = i
        id_to_label[i] = g["name"]
        hitting_times[g["name"]] = g.get("hittingTime", 3)

    _engine = MediaPipeEngine(
        frame_callback=_on_recognition_frame,
        prediction_callback=_on_recognition_prediction,
        use_separate_window=focus_mode,
    )
    _engine.set_label_mapping(label_to_id, id_to_label)
    _engine.set_hitting_times(hitting_times)
    _engine.load_model()
    _engine.start()
    _set_mode("recognition")


@app.route("/api/recognition/start", methods=["GET"])
def recognition_start():
    """
    GET /api/recognition/start?focus=0|1
    Start gesture recognition. focus=1 for Focus Control (separate window).
    """
    focus = request.args.get("focus", "0") == "1"
    _start_recognition_engine(focus_mode=focus)
    return jsonify({"ok": True, "videoUrl": "/api/video/feed", "focusMode": focus})


@app.route("/api/recognition/stop", methods=["GET"])
def recognition_stop():
    """Stop recognition and release camera."""
    _stop_all()
    return jsonify({"ok": True})


@app.route("/api/stop_all", methods=["GET"])
@app.route("/api/stop_recognition", methods=["GET"])
@app.route("/api/focus/stop_all", methods=["GET"])
def stop_all():
    """
    Unified stop endpoint: stops MediaPipe engine AND desktop stream.
    Used by Focus Layer Stop button and Control screen Stop.
    Cleans up all threads/loops, releases camera.
    """
    _stop_all()
    return jsonify({"ok": True})


def _stop_all():
    """
    Unified stop function: stops MediaPipe engine AND desktop stream.
    Called by Focus Layer Stop button and other stop endpoints.
    """
    global _engine, _mode, _last_frame
    if _engine:
        try:
            _engine.stop()
        except Exception as e:
            print("Engine stop error:", e)
        _engine = None
    _last_frame = None
    _set_mode("idle")
    # Stop desktop stream
    try:
        ds.stop()
    except Exception as e:
        print("Desktop stream stop error:", e)


# -----------------------------------------------------------------------------
# DESKTOP STREAM API (live PC desktop capture + input injection)
# -----------------------------------------------------------------------------

def _generate_desktop_mjpeg():
    """MJPEG generator for desktop stream. Yields frames while desktop capture runs."""
    while True:
        frame = ds.get_last_frame()
        if frame:
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n")
        time.sleep(0.04)


@app.route("/api/desktop/start", methods=["GET"])
def desktop_start():
    """
    GET /api/desktop/start
    Start desktop capture. One capture loop at a time. Feed at /api/desktop/feed.
    """
    try:
        ok = ds.start()
        return jsonify({"ok": ok})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/desktop/stop", methods=["GET"])
def desktop_stop():
    """Stop desktop capture and release resources."""
    try:
        ds.stop()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/desktop/feed")
def desktop_feed():
    """MJPEG stream of live desktop. Use as <img src="/api/desktop/feed">."""
    return Response(
        _generate_desktop_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache"},
    )


@app.route("/api/desktop/mouse", methods=["POST"])
def desktop_mouse():
    """
    POST /api/desktop/mouse
    Body: { "x": 0.5, "y": 0.5, "button": "left", "action": "click" }
    x, y: normalized 0-1 (fraction of screen). action: click, down, up, move.
    """
    data = request.get_json() or {}
    x = float(data.get("x", 0))
    y = float(data.get("y", 0))
    button = data.get("button", "left")
    action = data.get("action", "click")
    try:
        ds.inject_mouse(x, y, button=button, action=action)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/desktop/keyboard", methods=["POST"])
def desktop_keyboard():
    """
    POST /api/desktop/keyboard
    Body: { "key": "enter" } or { "key": "a", "action": "press" } or { "text": "hello" }
    """
    data = request.get_json() or {}
    if "text" in data:
        try:
            ds.inject_text(data["text"])
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500
    key = data.get("key", "")
    action = data.get("action", "press")
    if not key:
        return jsonify({"error": "key or text required"}), 400
    try:
        ds.inject_key(key, action=action)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# -----------------------------------------------------------------------------
# MJPEG VIDEO FEED (MediaPipe webcam - embed in Training / Control)
# -----------------------------------------------------------------------------

def _generate_mjpeg():
    """Generator for MJPEG stream."""
    while True:
        if _last_frame:
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + _last_frame + b"\r\n")
        time.sleep(0.033)  # ~30 FPS


@app.route("/api/video/feed")
def video_feed():
    """
    MJPEG stream of MediaPipe webcam. Use as <img src="/api/video/feed">.
    Available when training or recognition is active.
    """
    return Response(
        _generate_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


# -----------------------------------------------------------------------------
# SSE EVENTS (predictions, recording done, hand detected)
# -----------------------------------------------------------------------------

def _generate_events():
    """Server-Sent Events stream for real-time updates."""
    while True:
        try:
            ev = _event_queue.get(timeout=1)
            yield f"data: {json.dumps(ev)}\n\n"
        except queue.Empty:
            yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"


@app.route("/api/events")
def events():
    """
    SSE stream: prediction, recording_done, heartbeat.
    Frontend: const es = new EventSource('/api/events'); es.onmessage = e => { const d = JSON.parse(e.data); ... }
    """
    return Response(
        _generate_events(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/status")
def status():
    """
    GET /api/status
    Returns: { handDetected, mode, recording }
    For Control screen "No Hand Detected" -> "Hand Detected" toggle.
    """
    return jsonify({
        "handDetected": _last_hand_detected,
        "mode": _mode,
        "recording": _recording,
    })


# -----------------------------------------------------------------------------
# FOCUS LAYER LAUNCHER (Desktop Overlay Window)
# -----------------------------------------------------------------------------

_layer_process = None


@app.route("/api/focus-layer/launch", methods=["GET"])
def launch_focus_layer():
    """
    GET /api/focus-layer/launch
    Launches the Focus Layer desktop overlay window (Electron app).
    The Layer window is always-on-top and shows gesture controls.
    MediaPipe webcam opens in a separate small window.
    """
    global _layer_process
    if _layer_process and _layer_process.poll() is None:
        return jsonify({"ok": True, "message": "Layer already running"})
    
    layer_dir = os.path.join(os.path.dirname(__file__), "focus-layer")
    main_js = os.path.join(layer_dir, "main.js")
    
    if not os.path.exists(main_js):
        return jsonify({"ok": False, "error": "Focus Layer not found. Install: cd focus-layer && npm install"}), 404
    
    try:
        # Launch Electron app
        if platform.system() == "Windows":
            # On Windows, use npx electron or electron.cmd
            _layer_process = subprocess.Popen(
                ["npx", "electron", "."],
                cwd=layer_dir,
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        else:
            _layer_process = subprocess.Popen(
                ["npx", "electron", "."],
                cwd=layer_dir,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        return jsonify({"ok": True, "message": "Focus Layer launched"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/focus-layer/status", methods=["GET"])
def focus_layer_status():
    """Check if Focus Layer is running."""
    global _layer_process
    running = _layer_process and _layer_process.poll() is None
    return jsonify({"running": running})


# -----------------------------------------------------------------------------
# ENTRY POINT
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    print("Gesture Control Server")
    print("Open http://localhost:5000")
    print("  - Home: / (or home page/main-index.html)")
    print("  - Training: training screen/gesture-training.html")
    print("  - Gesture List: gesture list screen/gesture-list.html")
    print("  - Control: control screen/index.html")
    print("  - Focus Layer: Launch via Focus Mode toggle on Control Screen")
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=True)
