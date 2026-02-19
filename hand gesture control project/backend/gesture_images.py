"""
Gesture Image Generation Module
===============================
Generates clean, minimal icons for gestures using OpenAI DALL-E 2 API.

WHERE IMAGES ARE STORED:
  frontend/assets/images/main page images/gesture list/<sanitized_name>.png

HOW UI LOADS THEM:
  Frontend uses: ../assets/images/main page images/gesture list/<image>
  Server serves static files from FRONTEND_DIR, so URL is:
  /assets/images/main page images/gesture list/<image>

REQUIRES: OPENAI_API_KEY environment variable for image generation.
Falls back gracefully if API unavailable (gesture still saves, no image).
"""

import os
import re
import base64

# Project root (parent of backend/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GESTURE_IMAGE_DIR = os.path.join(
    PROJECT_ROOT,
    "frontend", "assets", "images", "main page images", "gesture list"
)


def _sanitize_filename(gesture_name: str) -> str:
    """
    Sanitize gesture name for use as filename.
    Lowercase, replace spaces with underscore, remove invalid chars.
    """
    s = gesture_name.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s)  # Remove non-alphanumeric except space, hyphen
    s = re.sub(r"\s+", "_", s)       # Spaces -> underscore
    s = re.sub(r"_+", "_", s)        # Collapse multiple underscores
    s = s.strip("_") or "gesture"
    return f"{s}.png"


def _ensure_image_dir():
    """Create gesture list directory if it doesn't exist."""
    os.makedirs(GESTURE_IMAGE_DIR, exist_ok=True)


def _image_exists(gesture_name: str) -> str | None:
    """
    Check if image already exists for this gesture.
    Returns filename if exists, else None.
    """
    filename = _sanitize_filename(gesture_name)
    path = os.path.join(GESTURE_IMAGE_DIR, filename)
    return filename if os.path.exists(path) else None


def generate_gesture_image(gesture_name: str) -> str | None:
    """
    Generate a minimal icon for the gesture using image API.
    Saves to: frontend/assets/images/main page images/gesture list/<sanitized_name>.png

    Returns:
        Filename (e.g. "open_settings.png") if successful, else None.
        Reuses existing image if already generated for same gesture name.
    """
    if not gesture_name or not gesture_name.strip():
        return None

    # Reuse existing image if present (do not overwrite unless retraining)
    existing = _image_exists(gesture_name)
    if existing:
        return existing

    _ensure_image_dir()
    filename = _sanitize_filename(gesture_name)
    out_path = os.path.join(GESTURE_IMAGE_DIR, filename)

    # Try OpenAI DALL-E
    try:
        import openai
        client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
        if not client.api_key:
            return None

        prompt = (
            f"Minimal, clean, flat icon representing the hand gesture: {gesture_name}. "
            "Simple line art or silhouette style. White or transparent background. "
            "High contrast, UI-friendly. Single hand gesture only."
        )

        response = client.images.generate(
            model="dall-e-2",
            prompt=prompt,
            size="256x256",
            response_format="b64_json",
            n=1,
        )
        b64_data = response.data[0].b64_json
        data = base64.b64decode(b64_data)
        with open(out_path, "wb") as f:
            f.write(data)
        return filename

    except ImportError:
        return None
    except Exception as e:
        print(f"Gesture image generation failed for '{gesture_name}':", e)
        return None


def get_image_path_for_gesture(gesture_name: str) -> str:
    """
    Return the image filename for a gesture (for DB storage).
    Checks if file exists; returns empty string if not.
    """
    existing = _image_exists(gesture_name)
    return existing or ""
