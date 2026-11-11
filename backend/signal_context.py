"""Turns a dashboard "signal" (sent by the VC dashboard's Ask AI button) into a short prompt block.

The signal is client-supplied, so it is treated as a hint about where to look, never as data:
everything is type-checked, clipped, and the prompt tells the model to verify via the tools.
"""
from __future__ import annotations

import json
from typing import Any

# Only the VC and Executive Dean dashboards emit signals (Admin acts as the VC).
ALLOWED_PERSONAS = {"vice_chancellor", "executive_dean"}
ALLOWED_ROLES = {"Admin"}
AUDIENCE = {"vice_chancellor": "Vice Chancellor", "executive_dean": "Executive Dean"}
KINDS = {"trend_decline", "zero_output", "target_gap", "outlier"}
MAX_STR = 120
MAX_EVIDENCE_CHARS = 800


def _clip(v: Any) -> str:
    return str(v).replace("\n", " ")[:MAX_STR]


def build_signal_prompt(context: dict | None, role_level: str | None, persona_id: str | None = None) -> str:
    if not context or not (persona_id in ALLOWED_PERSONAS or role_level in ALLOWED_ROLES):
        return ""
    kind = context.get("kind")
    if kind not in KINDS:
        return ""
    entity = context.get("entity") if isinstance(context.get("entity"), dict) else {}
    evidence = context.get("evidence") if isinstance(context.get("evidence"), (dict, list)) else {}
    ev = json.dumps(evidence, default=str)[:MAX_EVIDENCE_CHARS]
    return (
        "=== DASHBOARD SIGNAL ===\n"
        f"The {AUDIENCE.get(persona_id, 'user')} clicked 'Ask AI' on this dashboard item:\n"
        f"- signal: {_clip(context.get('title', ''))} (type: {kind})\n"
        f"- subject: {_clip(entity.get('type', ''))} {_clip(entity.get('name', ''))}; metric: {_clip(context.get('metric', ''))}\n"
        f"- dashboard figures (unverified): {ev}\n"
        "Use this only to know what the question refers to. Re-check any number you quote with the tools; "
        "if the database disagrees with the dashboard figures, say so."
    )
