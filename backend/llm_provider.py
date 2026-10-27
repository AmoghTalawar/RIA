"""LLM provider resolution + OpenRouter wrapper.

OpenRouter exposes an OpenAI-compatible chat-completions API, so the agent's body/tool-call
format is unchanged; only the URL, auth key, model id and a few optional headers differ.

Env:
  LLM_PROVIDER         openrouter | groq | gemini  (default: openrouter if OPENROUTER_API_KEY is set)
  OPENROUTER_API_KEY   key from openrouter.ai
  OPENROUTER_MODEL     default "anthropic/claude-haiku-5.5"
  OPENROUTER_REFERER   optional, sent as HTTP-Referer (shows in OpenRouter dashboards)
  OPENROUTER_TITLE     optional, sent as X-Title
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-5.5"


@dataclass(frozen=True)
class Provider:
    name: str
    url: str
    model: str
    api_key: str
    headers: dict = field(default_factory=dict)


def _openrouter(api_key: str) -> Provider:
    headers = {}
    if os.environ.get("OPENROUTER_REFERER"):
        headers["HTTP-Referer"] = os.environ["OPENROUTER_REFERER"]
    headers["X-Title"] = os.environ.get("OPENROUTER_TITLE", "RIA Dashboard")
    return Provider(
        "openrouter", OPENROUTER_URL,
        os.environ.get("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL), api_key, headers,
    )


def resolve_provider(api_key: str | None = None) -> Provider:
    """Pick the provider. Explicit LLM_PROVIDER wins; otherwise infer from the key prefix."""
    forced = os.environ.get("LLM_PROVIDER", "").lower()
    key = api_key or ""

    if forced == "openrouter" or (not forced and key.startswith("sk-or-")):
        return _openrouter(os.environ.get("OPENROUTER_API_KEY") or key)
    if forced == "groq" or (not forced and key.startswith("gsk_")):
        return Provider("groq", GROQ_URL, os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
                        os.environ.get("GROQ_API_KEY") or key)
    gem_env = os.environ.get("GEMINI_API_KEY", "")
    if forced == "gemini" or (not forced and (key.startswith("AIza") or (gem_env and key == gem_env))):
        return Provider("gemini", GEMINI_URL, os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
                        os.environ.get("GEMINI_API_KEY") or key)
    # Unknown key format: OpenRouter is the default gateway.
    return _openrouter(key)


def default_api_key() -> str | None:
    """Server-side key for the configured provider (used when the client sends no key)."""
    forced = os.environ.get("LLM_PROVIDER", "").lower()
    order = {
        "openrouter": ["OPENROUTER_API_KEY"],
        "groq": ["GROQ_API_KEY"],
        "gemini": ["GEMINI_API_KEY"],
    }.get(forced, ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"])
    for name in order:
        if os.environ.get(name):
            return os.environ[name]
    return None
