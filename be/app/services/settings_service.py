from be.app.core.security import hash_password, verify_password
from be.app.repositories.auth_repository import (
    find_user_by_email,
    find_user_by_id,
    update_user_account,
)
import logging
import os
import time
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

from be.app.repositories.children_repository import (
    find_active_ai_config_by_user_id,
    find_active_ai_secret_config_by_user_id,
    upsert_ai_config,
)
from be.app.schemas.auth import PublicUser
from be.app.schemas.settings import ParentSettingsUpdateRequest, ParentSettingsValidateRequest
from be.app.services.webauthn_service import get_webauthn_summary_for_user

DEFAULT_MONTHLY_TOKEN_LIMIT = 20_000
DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_CLAUDE_BASE_URL = "https://api.anthropic.com"

# Get environment settings for httpx
HTTPX_TRUST_ENV = os.getenv("HTTPX_TRUST_ENV", "false").strip().lower() == "true"
VALIDATION_TIMEOUT = float(os.getenv("VALIDATION_TIMEOUT_SECONDS", "30.0"))


def _infer_llm_provider(base_url: str | None, model_name: str | None) -> str:
    normalized_url = (base_url or "").strip().lower()
    normalized_model = (model_name or "").strip().lower()

    if ":generatecontent" in normalized_url:
        return "gemini"
    if "/v1/messages" in normalized_url or normalized_url.endswith("/messages"):
        return "claude"
    if "/chat/completions" in normalized_url or "/responses" in normalized_url:
        return "openai"

    if "anthropic" in normalized_url or normalized_model.startswith("claude"):
        return "claude"
    if (
        "googleapis" in normalized_url
        or "aistudio.google.com" in normalized_url
        or ":generatecontent" in normalized_url
        or normalized_model.startswith("gemini")
    ):
        return "gemini"
    if "dashscope" in normalized_url or normalized_model.startswith("qwen"):
        return "qwen"
    return "openai"


class SettingsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _mask_last4(value: str | None) -> str:
    return f"******-{value}" if value else ""


def _normalize_gemini_generate_content_url(base_url: str | None, model_name: str, api_key: str) -> str:
    trimmed_base_url = (base_url or DEFAULT_GEMINI_BASE_URL).strip()
    trimmed_model = (model_name or "gemini-2.5-flash").strip()

    if not trimmed_base_url:
        raise SettingsError(400, "Missing Gemini base URL")
    if not trimmed_model:
        raise SettingsError(400, "Missing Gemini model name")

    normalized_root = trimmed_base_url.rstrip("/")
    lower = normalized_root.lower()
    generate_suffix = f"/{trimmed_model.lower()}:generatecontent"

    if "aistudio.google.com" in lower:
        normalized_root = DEFAULT_GEMINI_BASE_URL
        lower = normalized_root.lower()

    if ":generatecontent" in lower:
        url = normalized_root
    elif lower.endswith("/v1beta/models"):
        url = f"{normalized_root}/{trimmed_model}:generateContent"
    elif lower.endswith("/v1beta"):
        url = f"{normalized_root}/models/{trimmed_model}:generateContent"
    elif lower.endswith(generate_suffix):
        url = normalized_root
    else:
        url = f"{normalized_root}/v1beta/models/{trimmed_model}:generateContent"

    separator = "&" if "?" in url else "?"
    return f"{url}{separator}key={quote(api_key)}"


def _resolve_openai_compatible_endpoint(base_url: str | None) -> tuple[str, str]:
    normalized_base_url = (base_url or DEFAULT_OPENAI_BASE_URL).strip().rstrip("/")
    if not normalized_base_url:
        raise SettingsError(400, "Missing OpenAI-compatible base URL")

    lower = normalized_base_url.lower()
    if lower.endswith("/chat/completions"):
        return normalized_base_url, "chat"
    if lower.endswith("/responses"):
        return normalized_base_url, "responses"
    if "/v1" in lower or "/v2" in lower or "/v3" in lower:
        return f"{normalized_base_url}/chat/completions", "chat"
    return f"{normalized_base_url}/v1/chat/completions", "chat"


def _resolve_claude_endpoint(base_url: str | None) -> str:
    normalized_base_url = (base_url or DEFAULT_CLAUDE_BASE_URL).strip().rstrip("/")
    if not normalized_base_url:
        raise SettingsError(400, "Missing Claude base URL")

    lower = normalized_base_url.lower()
    if lower.endswith("/v1/messages") or lower.endswith("/messages"):
        return normalized_base_url
    if lower.endswith("/v1"):
        return f"{normalized_base_url}/messages"
    return f"{normalized_base_url}/v1/messages"


def _classify_validation_error(message: str, status_code: int | None = None) -> str:
    normalized = (message or "").strip().lower()
    
    # Check for timeout errors first
    if status_code == 504 or "timed out" in normalized or "timeout" in normalized:
        return "network_error"
    
    # Check for connection errors
    if status_code == 503 or "could not connect" in normalized or "connection" in normalized or "network" in normalized:
        return "network_error"
    
    # Check for authentication errors
    if status_code in {401, 403} or "api key" in normalized or "authentication" in normalized or "unauthorized" in normalized:
        return "invalid_api_key"
    
    # Check for model errors
    if status_code == 404 or "model" in normalized and ("not found" in normalized or "unknown" in normalized):
        return "invalid_model"
    
    # Check for URL/endpoint errors
    if "url" in normalized or "endpoint" in normalized or "404" in normalized:
        return "invalid_url"
    
    return "unknown_error"


def _validate_with_gemini(api_key: str, model_name: str, base_url: str | None) -> tuple[str, int]:
    endpoint = _normalize_gemini_generate_content_url(base_url, model_name, api_key)
    logger.info(f"Validating Gemini connection to endpoint: {endpoint.split('?')[0]}")
    
    try:
        with httpx.Client(timeout=VALIDATION_TIMEOUT, trust_env=HTTPX_TRUST_ENV) as client:
            started_at = time.perf_counter()
            response = client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "speakjoy-settings-validator",
                },
                json={
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": "Reply with OK"}],
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0,
                        "thinkingConfig": {"thinkingBudget": 0},
                        "maxOutputTokens": 8,
                    },
                },
            )
            latency_ms = int((time.perf_counter() - started_at) * 1000)
    except httpx.TimeoutException as error:
        logger.error(f"Gemini validation timeout after {VALIDATION_TIMEOUT}s: {error}")
        raise SettingsError(504, f"Connection timed out after {VALIDATION_TIMEOUT} seconds. Please check your network connection.")
    except httpx.ConnectError as error:
        logger.error(f"Gemini validation connection error: {error}")
        raise SettingsError(503, "Could not connect to Gemini API. Please check the endpoint and your network connection.")
    except Exception as error:
        logger.error(f"Gemini validation unexpected error: {error}")
        raise SettingsError(500, f"Unexpected error during validation: {str(error)}")

    payload = response.json() if response.content else {}
    if not response.is_success:
        message = payload.get("error", {}).get("message") if isinstance(payload, dict) else None
        logger.error(f"Gemini validation failed with status {response.status_code}: {message}")
        raise SettingsError(response.status_code, message or f"Gemini validation failed with status {response.status_code}")

    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    reply_text = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
    if not reply_text:
        logger.error("Gemini validation succeeded but returned no text")
        raise SettingsError(422, "Gemini validation succeeded but returned no text")
    
    logger.info(f"Gemini validation successful in {latency_ms}ms")
    return reply_text, latency_ms


def _validate_with_openai_compatible(api_key: str, model_name: str, base_url: str | None) -> tuple[str, int, str]:
    endpoint, mode = _resolve_openai_compatible_endpoint(base_url)
    logger.info(f"Validating OpenAI-compatible connection to endpoint: {endpoint}")
    
    request_payload = (
        {
            "model": model_name,
            "temperature": 0,
            "max_output_tokens": 8,
            "instructions": "Reply with OK",
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Reply with OK"}],
                }
            ],
        }
        if mode == "responses"
        else {
            "model": model_name,
            "temperature": 0,
            "max_tokens": 8,
            "messages": [
                {"role": "system", "content": "Reply with OK"},
                {"role": "user", "content": "Reply with OK"},
            ],
        }
    )

    try:
        with httpx.Client(timeout=VALIDATION_TIMEOUT, trust_env=HTTPX_TRUST_ENV) as client:
            started_at = time.perf_counter()
            response = client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "speakjoy-settings-validator",
                },
                json=request_payload,
            )
            latency_ms = int((time.perf_counter() - started_at) * 1000)
    except httpx.TimeoutException as error:
        logger.error(f"OpenAI-compatible validation timeout after {VALIDATION_TIMEOUT}s: {error}")
        raise SettingsError(504, f"Connection timed out after {VALIDATION_TIMEOUT} seconds. Please check your network connection.")
    except httpx.ConnectError as error:
        logger.error(f"OpenAI-compatible validation connection error: {error}")
        raise SettingsError(503, "Could not connect to API. Please check the endpoint and your network connection.")
    except Exception as error:
        logger.error(f"OpenAI-compatible validation unexpected error: {error}")
        raise SettingsError(500, f"Unexpected error during validation: {str(error)}")

    payload = response.json() if response.content else {}
    if not response.is_success:
        message = payload.get("error", {}).get("message") if isinstance(payload, dict) else None
        logger.error(f"OpenAI-compatible validation failed with status {response.status_code}: {message}")
        raise SettingsError(response.status_code, message or f"OpenAI-compatible validation failed with status {response.status_code}")

    reply_text = ""
    if isinstance(payload, dict):
        reply_text = (payload.get("output_text") or "").strip()
        if not reply_text and isinstance(payload.get("output"), list):
            reply_text = "".join(
                part.get("text", "") or part.get("output_text", "")
                for item in payload["output"]
                for part in (item.get("content") or [])
                if isinstance(part, dict)
            ).strip()
        if not reply_text:
            content = (((payload.get("choices") or [{}])[0]).get("message") or {}).get("content")
            if isinstance(content, str):
                reply_text = content.strip()
            elif isinstance(content, list):
                reply_text = "".join(part.get("text", "") for part in content if isinstance(part, dict)).strip()

    if not reply_text:
        logger.error("OpenAI-compatible validation succeeded but returned no text")
        raise SettingsError(422, "OpenAI-compatible validation succeeded but returned no text")
    
    logger.info(f"OpenAI-compatible validation successful in {latency_ms}ms")
    return reply_text, latency_ms, endpoint


def _validate_with_claude(api_key: str, model_name: str, base_url: str | None) -> tuple[str, int, str]:
    endpoint = _resolve_claude_endpoint(base_url)
    logger.info(f"Validating Claude connection to endpoint: {endpoint}")
    
    try:
        with httpx.Client(timeout=VALIDATION_TIMEOUT, trust_env=HTTPX_TRUST_ENV) as client:
            started_at = time.perf_counter()
            response = client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "User-Agent": "speakjoy-settings-validator",
                },
                json={
                    "model": model_name,
                    "max_tokens": 8,
                    "temperature": 0,
                    "system": "Reply with OK",
                    "messages": [
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": "Reply with OK"}],
                        }
                    ],
                },
            )
            latency_ms = int((time.perf_counter() - started_at) * 1000)
    except httpx.TimeoutException as error:
        logger.error(f"Claude validation timeout after {VALIDATION_TIMEOUT}s: {error}")
        raise SettingsError(504, f"Connection timed out after {VALIDATION_TIMEOUT} seconds. Please check your network connection.")
    except httpx.ConnectError as error:
        logger.error(f"Claude validation connection error: {error}")
        raise SettingsError(503, "Could not connect to Claude API. Please check the endpoint and your network connection.")
    except Exception as error:
        logger.error(f"Claude validation unexpected error: {error}")
        raise SettingsError(500, f"Unexpected error during validation: {str(error)}")

    payload = response.json() if response.content else {}
    if not response.is_success:
        message = None
        if isinstance(payload, dict):
            message = payload.get("error", {}).get("message") or payload.get("message")
        logger.error(f"Claude validation failed with status {response.status_code}: {message}")
        raise SettingsError(response.status_code, message or f"Claude validation failed with status {response.status_code}")

    content = payload.get("content") if isinstance(payload, dict) else None
    reply_text = "".join(part.get("text", "") for part in (content or []) if isinstance(part, dict)).strip()
    if not reply_text:
        logger.error("Claude validation succeeded but returned no text")
        raise SettingsError(422, "Claude validation succeeded but returned no text")
    
    logger.info(f"Claude validation successful in {latency_ms}ms")
    return reply_text, latency_ms, endpoint


def _serialize_settings(user, ai_config) -> dict:
    passkeys = get_webauthn_summary_for_user(
        PublicUser(
            id=str(user.id),
            name=user.display_name or user.email,
            email=user.email,
            username=user.username,
            fullName=user.display_name or user.email,
            displayName=user.display_name or user.email,
            role=user.role,
            authProvider=user.auth_provider,
            avatarUrl=user.avatar_url,
            emailVerified=bool(user.email_verified),
        )
    )
    return {
        "profile": {
            "displayName": user.display_name,
            "email": user.email,
            "authProvider": user.auth_provider,
            "avatarUrl": user.avatar_url,
            "emailVerified": user.email_verified,
            "hasPassword": bool(user.password_hash),
        },
        "aiSettings": {
            "apiKeyMasked": _mask_last4(ai_config.api_key_last4 if ai_config else None),
            "hasApiKey": bool(ai_config and ai_config.api_key_last4),
            "modelName": ai_config.model_name if ai_config else "gemini-2.5-flash",
            "baseUrl": ai_config.base_url if ai_config else "https://generativelanguage.googleapis.com/v1beta",
            "llmProvider": ai_config.llm_provider if ai_config else "gemini",
            "usageCount": ai_config.usage_count if ai_config else 0,
            "usageLimit": ai_config.usage_limit if ai_config else DEFAULT_MONTHLY_TOKEN_LIMIT,
            "useEnvAsrTts": ai_config.use_env_asr_tts if ai_config else False,
        },
        "passkeys": passkeys,
    }


def get_parent_settings_for_user(user: PublicUser) -> dict:
    fresh_user = find_user_by_id(user.id)
    if fresh_user is None:
        raise SettingsError(404, "User not found")

    ai_config = find_active_ai_config_by_user_id(user.id)
    return _serialize_settings(fresh_user, ai_config)


def update_parent_settings_for_user(user: PublicUser, payload: ParentSettingsUpdateRequest) -> dict:
    fresh_user = find_user_by_id(user.id)
    if fresh_user is None:
        raise SettingsError(404, "User not found")

    next_email = payload.email or None
    if next_email and next_email != fresh_user.email:
        existing = find_user_by_email(next_email)
        if existing is not None and existing.id != fresh_user.id:
            raise SettingsError(409, "Email already exists")

    password_hash = hash_password(payload.password) if payload.password else None

    try:
        updated_user = update_user_account(
            user_id=fresh_user.id,
            email=next_email,
            display_name=payload.displayName,
            password_hash=password_hash,
        )
        ai_config = upsert_ai_config(
            user_id=fresh_user.id,
            api_key=payload.apiKey,
            base_url=payload.baseUrl,
            model_name=payload.modelName,
            llm_provider=_infer_llm_provider(payload.baseUrl, payload.modelName), 
            use_env_asr_tts=None,
            usage_count=payload.usageCount,
            usage_limit=payload.usageLimit,
            clear_api_key=payload.clearApiKey,
        )
    except ValueError as error:
        raise SettingsError(400, str(error)) from error
    except Exception as error:
        message = str(error).lower()
        if "email" in message and "unique" in message:
            raise SettingsError(409, "Email already exists") from error
        raise

    return _serialize_settings(updated_user, ai_config)


def increment_parent_ai_usage_for_user(user: PublicUser, amount: int = 1) -> dict:
    fresh_user = find_user_by_id(user.id)
    if fresh_user is None:
        raise SettingsError(404, "User not found")

    current_config = find_active_ai_config_by_user_id(user.id)
    next_usage_count = max(0, (current_config.usage_count if current_config else 0) + amount)
    next_usage_limit = current_config.usage_limit if current_config else DEFAULT_MONTHLY_TOKEN_LIMIT

    try:
        ai_config = upsert_ai_config(
            user_id=fresh_user.id,
            api_key=None,
            base_url=None,
            model_name=current_config.model_name if current_config else None,
            llm_provider=current_config.llm_provider if current_config else None,
            use_env_asr_tts=current_config.use_env_asr_tts if current_config else None,
            usage_count=next_usage_count,
            usage_limit=next_usage_limit,
        )
    except ValueError as error:
        raise SettingsError(400, str(error)) from error

    return _serialize_settings(fresh_user, ai_config)


def verify_parent_gate_password_for_user(user: PublicUser, password: str) -> dict:
    fresh_user = find_user_by_id(user.id)
    if fresh_user is None:
        raise SettingsError(404, "User not found")
    if not fresh_user.password_hash:
        raise SettingsError(400, "This account does not have a password yet")
    if not verify_password(password, fresh_user.password_hash):
        raise SettingsError(401, "Parent password is incorrect")
    return {"verified": True}


def validate_parent_ai_settings_for_user(user: PublicUser, payload: ParentSettingsValidateRequest) -> dict:
    fresh_user = find_user_by_id(user.id)
    if fresh_user is None:
        raise SettingsError(404, "User not found")

    current_config = find_active_ai_secret_config_by_user_id(user.id)
    active_api_key = payload.apiKey or (current_config.api_key if current_config else "")
    active_model_name = payload.modelName or (current_config.model_name if current_config else "gemini-2.5-flash")
    active_base_url = payload.baseUrl or (current_config.base_url if current_config else "")

    if not active_api_key:
        raise SettingsError(400, "Please enter an API key or save one before testing the connection")
    if not active_model_name:
        raise SettingsError(400, "Please enter a model name before testing the connection")

    provider = _infer_llm_provider(active_base_url, active_model_name)
    resolved_endpoint = active_base_url
    
    logger.info(f"Starting validation for user {user.id} with provider: {provider}, model: {active_model_name}")

    try:
        if provider == "gemini":
            sample_reply, latency_ms = _validate_with_gemini(active_api_key, active_model_name, active_base_url)
            resolved_endpoint = _normalize_gemini_generate_content_url(active_base_url, active_model_name, active_api_key).split("?")[0]
        elif provider == "claude":
            sample_reply, latency_ms, resolved_endpoint = _validate_with_claude(active_api_key, active_model_name, active_base_url)
        else:
            sample_reply, latency_ms, resolved_endpoint = _validate_with_openai_compatible(active_api_key, active_model_name, active_base_url)
    except SettingsError as error:
        logger.warning(f"Validation failed for user {user.id}: {error.message}")
        return {
            "connected": False,
            "provider": provider,
            "modelName": active_model_name,
            "endpoint": resolved_endpoint or active_base_url,
            "errorType": _classify_validation_error(error.message, error.status_code),
            "message": error.message,
        }
    except Exception as error:
        message = str(error) or "Unknown validation error"
        logger.error(f"Unexpected validation error for user {user.id}: {message}")
        return {
            "connected": False,
            "provider": provider,
            "modelName": active_model_name,
            "endpoint": resolved_endpoint or active_base_url,
            "errorType": _classify_validation_error(message),
            "message": message,
        }

    logger.info(f"Validation successful for user {user.id}")
    return {
        "connected": True,
        "provider": provider,
        "modelName": active_model_name,
        "endpoint": resolved_endpoint or active_base_url,
        "latencyMs": latency_ms,
        "sampleReply": sample_reply,
    }
