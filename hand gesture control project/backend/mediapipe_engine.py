"""
MediaPipe + ANN Engine
======================
Extracted and refactored from testing.py. Runs MediaPipe hand detection
and ANN gesture recognition. Supports:
- Frame callbacks (for MJPEG stream)
- Prediction callbacks (gesture, confidence)
- Recording mode (collects landmarks for training)
"""

import cv2
import mediapipe as mp
import numpy as np
import torch
import torch.nn as nn
import threading
import time
import os

# Import shared components from core (avoids importing testing.py which blocks)
import sys
sys.path.insert(0, os.path.dirname(__file__))
from core import (
    GestureANN,
    normalize_landmarks,
    llm_to_command,
    execute_command,
)


class MediaPipeEngine:
    """
    MediaPipe + ANN engine. Runs in a background thread.
    - frame_callback: (frame_jpeg_bytes, hand_detected: bool) called each frame
    - prediction_callback: (gesture: str, confidence: float) when gesture detected
    - recording_callback: (done: bool) when recording finishes
    """

    def __init__(
        self,
        frame_callback=None,
        prediction_callback=None,
        recording_callback=None,
        llm_execute_callback=None,
        use_separate_window=False,
        camera_index=0,
    ):
        self.frame_callback = frame_callback
        self.prediction_callback = prediction_callback
        self.recording_callback = recording_callback
        self.llm_execute_callback = llm_execute_callback
        self.use_separate_window = use_separate_window
        self.camera_index = camera_index

        self._running = False
        self._thread = None
        self._lock = threading.Lock()

        # MediaPipe
        self.mp_hands = mp.solutions.hands
        self.hands = None
        self.mp_draw = mp.solutions.drawing_utils
        self.cap = None

        # ANN model
        self.model = None
        self.label_to_id = {}
        self.id_to_label = {}
        self.model_path = os.path.join(os.path.dirname(__file__), "model.pt")

        # Recording state
        self.recording = False
        self.current_label = None
        self.X_data = []
        self.Y_data = []
        self.recording_duration_sec = 4  # default

        # Prediction state
        self.confidence_threshold = 0.85
        self.stable_frames_required = 8
        self.gesture_counter = 0
        self.current_detected = None
        self.last_exec_time = 0
        self.cooldown_sec = 4

        # Timer state (for LLM execution)
        self.gesture_hitting_times = {}  # {gesture_name: seconds}
        self.timer_active_gesture = None
        self.timer_start_time = None
        self.timer_duration = 3

    def load_model(self):
        """Load ANN model and label mapping from disk if available."""
        model_pt = self.model_path
        labels_path = os.path.join(os.path.dirname(__file__), "label_mapping.json")
        if os.path.exists(model_pt) and os.path.exists(labels_path):
            import json
            with open(labels_path, "r") as f:
                mapping = json.load(f)
            self.label_to_id = mapping.get("label_to_id", {})
            self.id_to_label = {int(k): v for k, v in mapping.get("id_to_label", {}).items()}
            num_classes = max(len(self.label_to_id), 1)
            self.model = GestureANN(num_classes=num_classes)
            self.model.load_state_dict(torch.load(model_pt, map_location="cpu"))
            self.model.eval()
            return True
        return False

    def set_label_mapping(self, label_to_id: dict, id_to_label: dict):
        """Set label mapping (from gesture DB)."""
        self.label_to_id = label_to_id
        self.id_to_label = id_to_label

    def set_hitting_times(self, hitting_times: dict):
        """Set gesture hitting times: {gesture_name: seconds}."""
        self.gesture_hitting_times = hitting_times

    def start(self):
        """Start the engine in a background thread."""
        with self._lock:
            if self._running:
                return
            self._running = True
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=1,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.6,
        )
        self.cap = cv2.VideoCapture(self.camera_index)
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """
        Stop MediaPipe loop, release camera, clean up threads.
        Sets _running=False so _run_loop exits; joins thread; releases resources.
        """
        with self._lock:
            if not self._running:
                return
            self._running = False
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None
        if self.hands:
            try:
                self.hands.close()
            except Exception:
                pass
            self.hands = None
        cv2.destroyAllWindows()

    def start_recording(self, label: str, duration_sec: float = 4):
        """Start recording landmarks for the given gesture label."""
        if label not in self.label_to_id:
            idx = len(self.label_to_id)
            self.label_to_id[label] = idx
            self.id_to_label[idx] = label
        self.current_label = label
        self.recording = True
        self.X_data = []
        self.Y_data = []
        self.recording_duration_sec = duration_sec

    def stop_recording(self) -> tuple[list, list]:
        """Stop recording and return (X_data, Y_data)."""
        self.recording = False
        x, y = self.X_data[:], self.Y_data[:]
        self.current_label = None
        if self.recording_callback:
            self.recording_callback(done=True)
        return x, y

    def train_and_save(self, X_data: list, Y_data: list):
        """Train ANN and save model + label mapping."""
        if not self.label_to_id:
            return
        import json
        X = torch.tensor(np.array(X_data), dtype=torch.float32)
        Y = torch.tensor(Y_data, dtype=torch.long)
        self.model = GestureANN(num_classes=len(self.label_to_id))
        opt = torch.optim.Adam(self.model.parameters(), lr=0.001)
        loss_fn = nn.CrossEntropyLoss()
        for _ in range(50):
            out = self.model(X)
            loss = loss_fn(out, Y)
            opt.zero_grad()
            loss.backward()
            opt.step()
        self.model.eval()
        torch.save(self.model.state_dict(), self.model_path)
        labels_path = os.path.join(os.path.dirname(__file__), "label_mapping.json")
        with open(labels_path, "w") as f:
            json.dump({
                "label_to_id": self.label_to_id,
                "id_to_label": {str(k): v for k, v in self.id_to_label.items()},
            }, f, indent=2)

    def _run_loop(self):
        """Main processing loop (runs in thread)."""
        while self._running and self.cap and self.hands:
            ret, frame = self.cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb)
            hand_detected = results.multi_hand_landmarks is not None

            display_text = "IDLE"

            if results.multi_hand_landmarks:
                lm = results.multi_hand_landmarks[0]
                self.mp_draw.draw_landmarks(frame, lm, self.mp_hands.HAND_CONNECTIONS)

                landmark_list = [[p.x, p.y, p.z] for p in lm.landmark]
                features = normalize_landmarks(landmark_list)

                if self.recording and self.current_label:
                    self.X_data.append(features)
                    self.Y_data.append(self.label_to_id[self.current_label])
                    display_text = f"REC {self.current_label}"

                elif not self.recording and self.model and self.label_to_id:
                    tensor = torch.tensor(features, dtype=torch.float32).unsqueeze(0)
                    with torch.no_grad():
                        out = self.model(tensor)
                        probs = torch.softmax(out, dim=1)
                        conf, pred = torch.max(probs, dim=1)
                    conf_val = conf.item()
                    pred_id = pred.item()
                    gesture = self.id_to_label.get(pred_id, "Unknown")

                    hitting_time = self.gesture_hitting_times.get(gesture, 3)
                    timer_elapsed = 0.0
                    now = time.time()

                    if conf_val > self.confidence_threshold:
                        display_text = gesture

                        if gesture == self.current_detected:
                            self.gesture_counter += 1
                        else:
                            self.current_detected = gesture
                            self.gesture_counter = 1

                        if self.gesture_counter >= self.stable_frames_required:
                            # Check cooldown
                            if now - self.last_exec_time > self.cooldown_sec:
                                # Start timer: LLM executes only after hitting_time seconds
                                if not self.timer_active_gesture or self.timer_active_gesture != gesture:
                                    self.timer_active_gesture = gesture
                                    self.timer_start_time = now
                                    self.timer_duration = hitting_time

                                timer_elapsed = now - self.timer_start_time

                                if timer_elapsed >= hitting_time:
                                    # Timer completed - execute LLM
                                    try:
                                        cmd = llm_to_command(gesture)
                                        execute_command(cmd)
                                        if self.llm_execute_callback:
                                            self.llm_execute_callback(gesture, cmd)
                                    except Exception as e:
                                        print("LLM ERROR:", e)
                                    self.last_exec_time = now
                                    self.timer_active_gesture = None
                                    self.gesture_counter = 0
                        else:
                            # Gesture stable but timer not started yet
                            if self.timer_active_gesture == gesture and self.timer_start_time:
                                timer_elapsed = now - self.timer_start_time

                    else:
                        self.gesture_counter = 0
                        self.current_detected = None

                    # Report prediction + confidence + timer to frontend
                    if self.prediction_callback:
                        self.prediction_callback(gesture, conf_val, hitting_time, timer_elapsed)
            else:
                self.gesture_counter = 0
                self.current_detected = None
                self.timer_active_gesture = None
                if self.prediction_callback:
                    self.prediction_callback("None", 0.0, 3.0, 0.0)

            cv2.putText(frame, display_text, (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

            # Send frame to callback (MJPEG)
            _, jpeg = cv2.imencode(".jpg", frame)
            if self.frame_callback:
                self.frame_callback(jpeg.tobytes(), hand_detected)

            # Optional: show OpenCV window (for Focus mode separate window - small/minimized)
            if self.use_separate_window:
                small = cv2.resize(frame, (320, 240))
                cv2.imshow("MediaPipe Hand Detection", small)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            else:
                time.sleep(0.03)  # ~30 FPS cap

        # Loop exited: release resources. Do NOT call self.stop() (would deadlock:
        # stop() joins this thread, but we are IN this thread).
        if self.cap:
            self.cap.release()
            self.cap = None
        if self.hands:
            self.hands.close()
            self.hands = None
        cv2.destroyAllWindows()
