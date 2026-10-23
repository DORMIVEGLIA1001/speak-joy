"""Lightweight per-IP sliding-window rate limiting for sensitive auth routes.

Login/register have no throttle, so an anonymous caller can brute-force passwords
or spray registrations (notes.md 3.B.10). This is the first line of defence: keep a
per-(scope, IP) list of recent hit timestamps, drop the ones older than the window,
and reject once the count reaches the cap.

In-memory only: correct for the current single-worker deploy. Multiple workers each
keep their own counters, so the effective cap is MAX x workers — move to a shared
store (Redis) if we scale out. Mirrors the limiter in be/ai_service/app.py.
"""
from __future__ import annotations

import os
import threading
import time

from fastapi import HTTPException, Request

AUTH_RATE_LIMIT_MAX = int(os.getenv("AUTH_RATE_LIMIT_MAX", "10"))
AUTH_RATE_LIMIT_WINDOW_SECONDS = float(os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "300"))

_hits: dict[str, list[float]] = {}
_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    """Best-effort client IP. Behind nginx the real client is the first X-Forwarded-For hop."""
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = request.client
    return client.host if client else "unknown"


def enforce_rate_limit(
    request: Request,
    scope: str,
    *,
    max_hits: int = AUTH_RATE_LIMIT_MAX,
    window_seconds: float = AUTH_RATE_LIMIT_WINDOW_SECONDS,
) -> None:
    """Raise HTTP 429 if this IP exceeded max_hits calls to `scope` within the window.

    `scope` namespaces the counter so login and register throttle independently.
    Disabled when max_hits <= 0.
    """
    if max_hits <= 0:
        return
    key = f"{scope}:{_client_ip(request)}"
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        hits = [t for t in _hits.get(key, []) if t > cutoff]
        if len(hits) >= max_hits:
            hits.append(now)  # extend the window so sustained abuse stays blocked
            _hits[key] = hits
            raise HTTPException(
                status_code=429,
                detail="Too many attempts — please wait a few minutes and try again.",
            )
        hits.append(now)
        _hits[key] = hits
        # Opportunistic cleanup so idle keys don't accumulate forever.
        if len(_hits) > 4096:
            for stale in [k for k, v in _hits.items() if not any(t > cutoff for t in v)]:
                _hits.pop(stale, None)
