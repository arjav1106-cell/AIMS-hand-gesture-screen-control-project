# Gesture Image Generation

## Overview

When a user successfully trains and saves a new gesture, the backend automatically generates a clean icon image using the OpenAI DALL-E 2 API.

## Where Images Are Stored

```
frontend/assets/images/main page images/gesture list/<gesture_name>.png
```

Example: Gesture "Open Settings" → `open_settings.png`

## File Naming

- Lowercase
- Spaces replaced with underscore
- Invalid characters removed
- Example: "Swipe Left" → `swipe_left.png`

## Setup

1. **Install dependency:** `pip install openai`
2. **Set API key:** `OPENAI_API_KEY=sk-...` (environment variable)

## Behavior

- **If OPENAI_API_KEY is set:** Generates image, saves to assets folder, updates gesture in DB
- **If not set or generation fails:** Gesture still saves; `image` field remains empty; UI shows placeholder (🖐)

## Reuse

- If an image already exists for the same gesture name, it is reused (not overwritten)
