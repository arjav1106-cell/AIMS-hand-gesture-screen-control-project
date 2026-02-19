"""
Gesture Storage Module
======================
Central JSON-based database for gestures. Used by server.py and frontend APIs.
Each gesture has: id, name, image, hittingTime (seconds).
"""

import json
import os
import uuid

# Default path relative to project root (where server.py runs)
DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "gestures_db.json")


def _ensure_db(path=DEFAULT_DB_PATH):
    """Create empty gestures DB if it doesn't exist."""
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            json.dump([], f)
    return path


def load_gestures(path=DEFAULT_DB_PATH) -> list:
    """
    Load all gestures from the database.
    Returns list of dicts: { id, name, image, hittingTime }
    """
    path = _ensure_db(path)
    with open(path, "r") as f:
        data = json.load(f)
    # Normalize: ensure hittingTime exists (default 3 seconds)
    for g in data:
        if "hittingTime" not in g:
            g["hittingTime"] = 3
    return data


def save_gestures(gestures: list, path=DEFAULT_DB_PATH):
    """Persist gesture list to JSON."""
    path = _ensure_db(path)
    with open(path, "w") as f:
        json.dump(gestures, f, indent=2)


def add_gesture(name: str, image: str = "", hitting_time: float = 3, path=DEFAULT_DB_PATH) -> dict:
    """
    Add a new gesture. Returns the added gesture with id.
    """
    gestures = load_gestures(path)
    # Check for duplicate name
    if any(g["name"].lower() == name.strip().lower() for g in gestures):
        raise ValueError(f"Gesture with name '{name}' already exists")
    g = {
        "id": str(uuid.uuid4()),
        "name": name.strip(),
        "image": image or "",
        "hittingTime": float(hitting_time),
    }
    gestures.append(g)
    save_gestures(gestures, path)
    return g


def delete_gesture_by_id(gesture_id: str, path=DEFAULT_DB_PATH) -> bool:
    """Remove gesture by id. Returns True if removed."""
    gestures = load_gestures(path)
    before = len(gestures)
    gestures = [g for g in gestures if g.get("id") != gesture_id]
    if len(gestures) < before:
        save_gestures(gestures, path)
        return True
    return False


def delete_gesture_by_name(name: str, path=DEFAULT_DB_PATH) -> bool:
    """Remove gesture by name. Returns True if removed."""
    gestures = load_gestures(path)
    before = len(gestures)
    gestures = [g for g in gestures if g.get("name") != name]
    if len(gestures) < before:
        save_gestures(gestures, path)
        return True
    return False


def delete_latest_gesture(path=DEFAULT_DB_PATH) -> dict | None:
    """
    Remove the most recently added gesture (last in list).
    Returns the deleted gesture or None if empty.
    """
    gestures = load_gestures(path)
    if not gestures:
        return None
    removed = gestures.pop()
    save_gestures(gestures, path)
    return removed


def get_gesture_by_name(name: str, path=DEFAULT_DB_PATH) -> dict | None:
    """Get gesture by name."""
    for g in load_gestures(path):
        if g.get("name") == name:
            return g
    return None


def get_hitting_time(gesture_name: str, path=DEFAULT_DB_PATH) -> float:
    """Get hitting time in seconds for a gesture. Default 3 if not found."""
    g = get_gesture_by_name(gesture_name, path)
    return float(g["hittingTime"]) if g else 3.0


def update_gesture_image(gesture_id: str, image: str, path=DEFAULT_DB_PATH) -> bool:
    """
    Update the image path for a gesture by id.
    image: filename (e.g. "open_settings.png") stored in gesture list folder.
    Returns True if updated.
    """
    gestures = load_gestures(path)
    for g in gestures:
        if g.get("id") == gesture_id:
            g["image"] = image or ""
            save_gestures(gestures, path)
            return True
    return False
