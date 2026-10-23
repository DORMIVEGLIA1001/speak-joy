import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / "be" / ".env")

# Hybrid mode:
# - Qwen3-ASR runs through the configured ComfyUI workflow.
# - Qwen3-TTS follows .env, defaulting to local only when unset.
# - Local phoneme model can score IPA/pronunciation.
# - API key is used only for LLM feedback/decision.
os.environ.setdefault("ASR_PROVIDER", "comfyui")
os.environ.setdefault("TTS_PROVIDER", "comfyui")
os.environ.setdefault("SCORE_MODE", "phoneme_llm")
os.environ.setdefault("AI_PROVIDER", "dashscope")

from be.ai_service.app import app  # noqa: E402,F401
