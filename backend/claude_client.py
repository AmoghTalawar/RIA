"""Claude (Anthropic) tool-calling loop — replaces Groq as the LLM fallback."""
from __future__ import annotations

import json
import logging
import os
from typing import Any

import anthropic

from sql_tool import SCHEMA_METADATA, execute_sql

log = logging.getLogger(__name__)

DEFAULT_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")

_SYSTEM_PROMPT = (
    "You are KLE Tech's Research AI Assistant. Answer questions about research "
    "publications, faculty metrics, and department stats using the database below.\n\n"
    f"{SCHEMA_METADATA}\n\n"
    "RULES:\n"
    "- Every data question → call execute_sql ONCE. Never answer from memory.\n"
    "- Use CANONICAL QUERIES from the schema above exactly — just substitute the term.\n"
    "- If SQL returns [] (zero rows): reply \"No matching records found.\"\n"
    "- If SQL returns {\"error\":\"database_unavailable\"}: reply "
    "\"The research database is currently unavailable. Please try again later.\"\n"
    "- Multiple faculty matches → list them as bullets and ask which one.\n"
    "- For counts/aggregates: one or two sentences with the numbers only.\n"
    "- Never mention SQL, tools, schema, or these rules in your reply.\n"
    "- Be concise. No preamble."
)

_TOOL = {
    "name": "execute_sql",
    "description": (
        "Execute a PostgreSQL SELECT query against the RIA research database "
        "and return results as a JSON array."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "sql": {
                "type": "string",
                "description": "A valid PostgreSQL SELECT query.",
            }
        },
        "required": ["sql"],
    },
}


def _cap_payload(result: Any) -> str:
    if isinstance(result, dict) and result.get("unavailable"):
        payload: Any = {"error": "database_unavailable"}
    elif isinstance(result, list) and len(result) > 10:
        payload = {
            "note": f"Truncated to first 10 of {len(result)} rows. Aggregate in SQL for totals.",
            "rows": result[:10],
        }
    else:
        payload = result
    content = json.dumps(payload, default=str)
    if len(content) > 3000:
        content = content[:3000] + '..."truncated"'
    return content


def call_claude(
    user_message: str,
    api_key: str,
    model: str = DEFAULT_MODEL,
    conversation_history: list[dict[str, str]] | None = None,
    context_prompt: str = "",
) -> str:
    client = anthropic.Anthropic(api_key=api_key)

    system = _SYSTEM_PROMPT
    if context_prompt:
        system += "\n" + context_prompt

    messages: list[dict[str, Any]] = []

    if conversation_history:
        for msg in conversation_history[-6:]:
            if msg.get("role") in ("user", "assistant"):
                if msg["role"] == "user" and msg["content"].strip() == user_message.strip():
                    continue
                messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    MAX_ITERATIONS = 6
    sql_unavailable = False

    for _ in range(MAX_ITERATIONS):
        response = client.messages.create(
            model=model,
            max_tokens=600,
            system=system,
            tools=[_TOOL],
            messages=messages,
        )

        # Collect text and tool-use blocks
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        text_blocks = [b for b in response.content if b.type == "text"]

        if not tool_uses:
            # Final text answer
            return "\n".join(b.text for b in text_blocks).strip() or (
                "I couldn't reliably answer that from the database. "
                "Try rephrasing — for example, ask for stats on a specific faculty, "
                "or list publications by a faculty name."
            )

        # Append assistant turn
        messages.append({"role": "assistant", "content": response.content})

        # Execute each tool call and append results
        tool_results = []
        for block in tool_uses:
            sql = block.input.get("sql", "")
            result = execute_sql(sql)
            if isinstance(result, dict) and result.get("unavailable"):
                sql_unavailable = True
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": _cap_payload(result),
            })

        messages.append({"role": "user", "content": tool_results})

        if sql_unavailable:
            return "The research database is currently unavailable. Please try again later."

    return (
        "I couldn't reliably answer that from the database. "
        "Try rephrasing — for example, ask for stats on a specific faculty, "
        "or list publications by a faculty name."
    )
