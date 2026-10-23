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
class ComfyTTSConfig:
    url: str
    workflow_path: Path
    auth_user: str = ""
    auth_password: str = ""
    timeout_seconds: float = 120
    poll_interval_seconds: float = 0.5
    output_node_ids: tuple[str, ...] = ("2", "3")
    trust_env: bool = False
    speaker: str = "Ryan"
    model_choice: str = "0.6B"
    device: str = "cuda"
    precision: str = "bf16"
    language: str = "English"
    instruct: str = "Speak slowly and clearly for a child learning English."


async def synthesize_comfyui_tts(
    text: str,
    config: ComfyTTSConfig,
) -> bytes:
    if not config.url:
        raise RuntimeError("Missing COMFYUI_URL for ComfyUI TTS")
    if not config.workflow_path.exists():
        raise RuntimeError(f"ComfyUI TTS workflow not found: {config.workflow_path}")

    client_id = str(uuid.uuid4())
    timeout = httpx.Timeout(config.timeout_seconds)
    auth = _comfyui_auth(config)

    async with httpx.AsyncClient(timeout=timeout, auth=auth, trust_env=config.trust_env) as client:
        workflow = _load_workflow(config.workflow_path, text, config)

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
                filename, subfolder, file_type = _extract_audio_filename(outputs, config)
                if filename:
                    # Tải file audio về từ URL của ComfyUI
                    params = {"filename": filename}
                    if subfolder:
                        params["subfolder"] = subfolder
                    if file_type:
                        params["type"] = file_type
                    
                    audio_res = await client.get(f"{config.url}/view", params=params)
                    audio_res.raise_for_status()
                    return audio_res.content

                logger.info("ComfyUI TTS completed but no audio filename found in outputs: %s", outputs)
                raise RuntimeError(f"ComfyUI TTS completed but no audio filename found: {outputs}")
                
            await asyncio.sleep(config.poll_interval_seconds)

    raise TimeoutError(f"ComfyUI TTS timeout after {config.timeout_seconds}s. Last history: {last_history}")


def _comfyui_auth(config: ComfyTTSConfig) -> httpx.BasicAuth | None:
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


def _load_workflow(workflow_path: Path, text: str, config: ComfyTTSConfig) -> dict[str, Any]:
    with workflow_path.open(encoding="utf-8") as file:
        workflow = json.load(file)

    # Replace placeholders with the TTS prompt
    return _replace_placeholders(
        workflow,
        {
            "__TEXT_PROMPT__": text,
            "__PROMPT__": text,
            "__TEXT__": text,
            "__SPEAKER__": config.speaker,
            "__MODEL_CHOICE__": config.model_choice,
            "__DEVICE__": config.device,
            "__PRECISION__": config.precision,
            "__LANGUAGE__": config.language,
            "__INSTRUCT__": config.instruct,
        },
    )


def _extract_audio_filename(outputs: dict[str, Any], config: ComfyTTSConfig) -> tuple[str, str, str]:
    # 1. Tìm trong các node được chỉ định
    for node_id in config.output_node_ids:
        node_output = outputs.get(node_id)
        if not isinstance(node_output, dict):
            continue
        
        for key, value in node_output.items():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                first_item = value[0]
                if "filename" in first_item:
                    return first_item["filename"], first_item.get("subfolder", ""), first_item.get("type", "")

    # 2. Xử lý dự phòng: Dò tìm mọi node output
    for node_id, node_output in outputs.items():
        if not isinstance(node_output, dict):
            continue
        for key, value in node_output.items():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                first_item = value[0]
                if "filename" in first_item:
                    return first_item["filename"], first_item.get("subfolder", ""), first_item.get("type", "")

    return "", "", ""


AVAILABLE_SPEAKERS = ["Ryan", "Serena", "Sohee","Aiden","Dylan","Eric","Onna_anna","Sohee","Uncle_fu","Vivian"]

def select_speaker(config: ComfyTTSConfig, speaker: str) -> ComfyTTSConfig:
    import dataclasses
    if speaker not in AVAILABLE_SPEAKERS:
        logger.warning(f"Giọng đọc '{speaker}' không có trong danh sách mặc định: {AVAILABLE_SPEAKERS}")
    
    # Do ComfyTTSConfig là frozen=True, ta phải tạo một bản copy mới để đổi giá trị
    return dataclasses.replace(config, speaker=speaker)
