import os

# Full API mode:
# - Qwen3-ASR Flash API transcribes microphone audio.
# - LLM API scores/decides the response.
# - Qwen3 TTS Flash Realtime API speaks the response.
# No local ASR/TTS/phoneme model is loaded in this mode.
os.environ["ASR_PROVIDER"] = "dashscope"
os.environ["TTS_PROVIDER"] = "dashscope"
os.environ["SCORE_MODE"] = "llm"
os.environ["AI_PROVIDER"] = "dashscope"

from be.ai_service.app import app  # noqa: E402,F401
