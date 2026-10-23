import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ComfyASRConfig:
    url: str
    workflow_path: Path
    auth_user: str = ""
    auth_password: str = ""
    timeout_seconds: float = 120
    poll_interval_seconds: float = 0.5
    output_node_ids: tuple[str, ...] = ("3", "2")
    output_keys: tuple[str, ...] = ("source", "text", "string", "transcription", "STRING")
    trust_env: bool = False


def normalize_audio_mime(content_type: str, audio_path: str) -> str:
    content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if content_type.startswith("audio/"):
        return content_type

    suffix = Path(audio_path).suffix.lower()
    if suffix == ".wav":
        return "audio/wav"
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix == ".webm":
        return "audio/webm"
    return "audio/wav"


async def transcribe_comfyui_asr(
    audio_path: str,
    content_type: str,
    config: ComfyASRConfig,
) -> str:
    if not config.url:
        raise RuntimeError("Missing COMFYUI_URL for ComfyUI ASR")
    if not config.workflow_path.exists():
        raise RuntimeError(f"ComfyUI ASR workflow not found: {config.workflow_path}")

    client_id = str(uuid.uuid4())
    timeout = httpx.Timeout(config.timeout_seconds)
    auth = _comfyui_auth(config)

    async with httpx.AsyncClient(timeout=timeout, auth=auth, trust_env=config.trust_env) as client:
        uploaded_name = await _upload_audio(client, audio_path, content_type, config)
        workflow = _load_workflow(config.workflow_path, uploaded_name)

        response = await client.post(
            f"{config.url}/prompt",
            json={"prompt": workflow, "client_id": client_id},
        )
        response.raise_for_status()
        prompt_id = str(response.json().get("prompt_id") or "")
        if not prompt_id:
            raise RuntimeError(f"ComfyUI /prompt did not return prompt_id: {response.text}")

        deadline = time.perf_counter() + config.timeout_seconds
        last_history: dict[str, Any] = {}
        while time.perf_counter() < deadline:
            history_response = await client.get(f"{config.url}/history/{prompt_id}")
            history_response.raise_for_status()
            history_payload = history_response.json()
            last_history = history_payload.get(prompt_id, {}) if isinstance(history_payload, dict) else {}
            outputs = last_history.get("outputs", {}) if isinstance(last_history, dict) else {}
            if outputs:
                transcript = _extract_text(outputs, config)
                if transcript:
                    return transcript
                logger.info("ComfyUI ASR completed with empty transcript: %s", outputs)
                return ""
            await asyncio.sleep(config.poll_interval_seconds)

    raise TimeoutError(f"ComfyUI ASR timeout after {config.timeout_seconds}s. Last history: {last_history}")


def _comfyui_auth(config: ComfyASRConfig) -> httpx.BasicAuth | None:
    if config.auth_user or config.auth_password:
        return httpx.BasicAuth(config.auth_user, config.auth_password)
    return None


def _replace_placeholders(value: Any, replacements: dict[str, str]) -> Any:
    if isinstance(value, dict):
        return {
            key: _replace_placeholders(item, replacements)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_replace_placeholders(item, replacements) for item in value]
    if isinstance(value, str):
        for placeholder, replacement in replacements.items():
            value = value.replace(placeholder, replacement)
    return value


def _load_workflow(workflow_path: Path, audio_filename: str) -> dict[str, Any]:
    with workflow_path.open(encoding="utf-8") as file:
        workflow = json.load(file)

    return _replace_placeholders(
        workflow,
        {
            "__AUDIO_FILENAME__": audio_filename,
        },
    )


async def _upload_audio(
    client: httpx.AsyncClient,
    audio_path: str,
    content_type: str,
    config: ComfyASRConfig,
) -> str:
    audio_bytes = Path(audio_path).read_bytes()
    filename = Path(audio_path).name
    mime_type = normalize_audio_mime(content_type, audio_path)

    response = await client.post(
        f"{config.url}/upload/image",
        data={"overwrite": "true"},
        files={"image": (filename, audio_bytes, mime_type)},
    )
    response.raise_for_status()
    payload = response.json()
    uploaded_name = payload.get("name")
    if not uploaded_name:
        raise RuntimeError(f"ComfyUI upload did not return a filename: {payload}")
    return str(uploaded_name)


def _extract_text(outputs: dict[str, Any], config: ComfyASRConfig) -> str:
    for node_id in config.output_node_ids:
        node_output = outputs.get(node_id)
        if not isinstance(node_output, dict):
            continue
        for key in config.output_keys:
            value = node_output.get(key)
            if isinstance(value, list) and value:
                return str(value[0]).strip()
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""
