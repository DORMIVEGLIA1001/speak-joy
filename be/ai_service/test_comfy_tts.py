import json
import uuid
import os
import time
from pathlib import Path

try:
    import requests
    import websocket
except ImportError:
    print("Please install requests and websocket-client")
    exit(1)

# --- Configuration ---
COMFYUI_URL = os.environ.get("COMFYUI_URL", "https://comfy.hungnm.top")
AUDIO_PATH: r"hello"