# Focus Layer - Desktop Overlay Window

Always-on-top overlay window for Gesture Control Focus Mode.

## Setup

1. **Install dependencies:**
   ```bash
   cd focus-layer
   npm install
   ```

2. **Launch from Control Screen:**
   - Click the Focus Mode toggle on the Control Screen
   - The Layer window will open automatically
   - MediaPipe webcam preview opens in a separate small window

## Features

- **Always on top:** Stays visible when switching apps (Alt+Tab)
- **Right sidebar:** Shows timer, detected gesture, confidence, gesture list
- **Stop buttons:** Stop MediaPipe or Desktop Stream independently
- **Auto-start:** MediaPipe starts in separate window when Layer opens

## Window Behavior

- Window is always-on-top (cannot be hidden behind other windows)
- Small, compact size (400x600px default)
- Resizable horizontally for sidebar
- Closing the window stops MediaPipe + Desktop Stream

## Architecture

- **main.js:** Electron main process - creates always-on-top window
- **layer.html:** Minimal UI (top bar + right sidebar)
- **layer-script.js:** Connects to backend API, displays gesture info
- **Launched via:** `/api/focus-layer/launch` endpoint in server.py
