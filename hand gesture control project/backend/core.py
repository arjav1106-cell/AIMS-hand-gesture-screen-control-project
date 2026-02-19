"""
Shared core components for hand gesture control.
Used by mediapipe_engine.py and testing.py.
"""

import numpy as np
import torch
import torch.nn as nn
import subprocess
import shutil
import os

# Optional: Groq LLM (may fail if groq not installed or no API key)
try:
    from groq import Groq
    _groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", "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"))
except Exception:
    _groq_client = None


def normalize_landmarks(lm):
    """Convert MediaPipe landmarks to 63-element feature vector."""
    data = np.array(lm)
    wrist = data[0]
    data = data - wrist
    m = np.max(np.abs(data))
    if m > 0:
        data = data / m
    return data.flatten()


class GestureANN(nn.Module):
    def __init__(self, input_size=63, num_classes=1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_size, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, num_classes),
        )

    def forward(self, x):
        return self.net(x)


def llm_to_command(instruction: str) -> str:
    """Convert gesture name to Windows command via LLM."""
    if not _groq_client:
        return "NOT_EXECUTABLE"
    prompt = f"""
You are a Windows system command generator.
Convert a natural language instruction into ONE executable Windows terminal command.
STRICT RULES: Output EXACTLY ONE LINE. Output ONLY the command. NO explanations. NO markdown. NO quotes.
If impossible return NOT_EXECUTABLE
Instruction: {instruction}
"""
    try:
        completion = _groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        return completion.choices[0].message.content.strip()
    except Exception:
        return "NOT_EXECUTABLE"


def is_executable(cmd: str) -> bool:
    if cmd == "NOT_EXECUTABLE":
        return False
    parts = cmd.split()
    if not parts:
        return False
    exe = parts[0]
    if exe.lower() == "ms-settings:":
        return True
    if shutil.which(exe):
        return True
    builtins = ["start", "explorer", "powershell", "cmd", "shutdown", "control"]
    return exe.lower() in builtins


def execute_command(cmd: str):
    if cmd.startswith("ms-settings:"):
        cmd = "cmd /c start " + cmd
    if not is_executable(cmd):
        print("SYSTEM:", cmd, "is not executable")
        return
    print("EXECUTING:", cmd)
    subprocess.Popen(cmd, shell=True)
