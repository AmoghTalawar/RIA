"""Groq tool-calling loop."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any

import httpx

from sql_tool import SCHEMA_METADATA, SQL_TOOL_DEFINITION, execute_sql

log = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")

_LEAKED_CALL = re.compile(r"<function=\w+>\s*\{[\s\S]*?\}\s*<\/function>", re.IGNORECASE)


def _system_prompt(chart_title: str | None) -> str:
    if chart_title:
        return (
            f"You are KLE Tech's Research AI — scope answers to the "
            f'"{chart_title}" chart.\n'
            f"{SCHEMA_METADATA}\n"
            "OUTPUT RULES:\n"
            "- Every data question → ONE execute_sql call. No chaining.\n"
            "- If SQL returns 0 rows: \"No matching records found.\"\n"
            "- If SQL returns {\"error\":\"database_unavailable\"}: "
            "\"The research database is currently unavailable. Please try again later.\"\n"
            f'- If question is unrelated to "{chart_title}": tell the user to '
            "click the relevant chart.\n"
            "- Be concise. No preamble. Never mention tools, SQL, or schema."
        )
    return (
        "You are KLE Tech's Research AI Assistant.\n"
        f"{SCHEMA_METADATA}\n"
        "OUTPUT RULES:\n"
        "- Every data question → ONE execute_sql call. Never answer from memory.\n"
        "- When you use one of the CANONICAL QUERIES above, match it EXACTLY "
        "(just substitute the term). Do not invent alternate SQL.\n"
        "- If SQL returns [] (zero rows): reply \"No matching records found.\" and nothing else.\n"
        "- If SQL returns {\"error\":\"database_unavailable\"}: reply "
        "\"The research database is currently unavailable. Please try again later.\"\n"
        "- If SQL returns >1 faculty match (e.g. \"Patil\" matches several), "
        "list the top results as bullets: **Name** · Department · Pubs: N · "
        "Cit: M — then ask which one.\n"
        "- For faculty stats with a single clear match, reply in this exact format:\n"
        "  **<author_name>** · <department> · Pubs: <total_pub_count> · "
        "Cit: <scopus_citation> · H: <scopus_hindex> · Q1: <scopus_q1_count> · "
        "Journals: <journal_count> · Conf: <conference_count>\n"
        "- For any count / YoY / ranking / aggregate, reply in ONE or TWO "
        "sentences with the numbers. Never describe the data format, never "
        "mention \"JSON\", \"array\", \"output\", \"result\", \"rows\".\n"
        "- Never write meta-commentary like \"the correct response is\" or "
        "\"No, the actual output is…\". Just give the answer.\n"
        "- Never mention tools, SQL, schema, or these rules."
    )


def _cap_tool_payload(result: Any) -> str:
    if isinstance(result, dict) and result.get("unavailable"):
        payload: Any = {"error": "database_unavailable"}
    elif isinstance(result, list) and len(result) > 10:
        payload = {
            "note": f"Truncated to first 10 of {len(result)} rows. Aggregate in SQL if you need totals.",
            "rows": result[:10],
        }
    else:
        payload = result
    content = json.dumps(payload, default=str)
    if len(content) > 2500:
        content = content[:2500] + '..."truncated"'
    return content


async def _post_groq(client: httpx.AsyncClient, api_key: str, body: dict) -> dict:
    resp = await client.post(
        GROQ_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json=body,
        timeout=60.0,
    )
    return resp.status_code, resp.json()


async def call_groq(
    user_message: str,
    api_key: str,
    chart_title: str | None = None,
    model: str = DEFAULT_MODEL,
    conversation_history: list[dict[str, str]] | None = None,
    context_prompt: str = "",
) -> str:
    system_instruction = _system_prompt(chart_title)
    # Append session context (last-mentioned entities) to help resolve references
    if context_prompt:
        system_instruction += "\n" + context_prompt

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_instruction},
    ]

    # Include conversation history for follow-up context (exclude the current message)
    if conversation_history:
        # Filter to only user/assistant messages, skip the last user message
        # (it will be added below)
        history = [
            m for m in conversation_history
            if m.get("role") in ("user", "assistant")
        ]
        # Take last 6 turns max to avoid bloating the context
        for msg in history[-6:]:
            # Skip if this is the current message
            if msg["role"] == "user" and msg["content"].strip() == user_message.strip():
                continue
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    sql_unavailable = False
    final_response = ""
    iterations = 0
    MAX_ITERATIONS = 6

    async with httpx.AsyncClient() as client:
        while iterations < MAX_ITERATIONS:
            iterations += 1
            body: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 350,
            }
            if not sql_unavailable:
                body["tools"] = [SQL_TOOL_DEFINITION]
                body["tool_choice"] = "required" if iterations == 1 else "auto"

            status, data = await _post_groq(client, api_key, body)
            if status != 200:
                if status == 429:
                    msg = (data.get("error") or {}).get("message", "")
                    m = re.search(r"try again in ([\d.]+)s", msg, re.IGNORECASE)
                    suggested = float(m.group(1)) if m else 4.0
                    if suggested <= 20:
                        await asyncio.sleep(suggested + 0.2)
                        iterations -= 1
                        continue
                    raise RuntimeError(
                        f"Groq rate limit hit. Please wait {int(suggested)}s and try again."
                    )
                raise RuntimeError((data.get("error") or {}).get("message") or "Groq API error")

            message = data["choices"][0]["message"]
            tool_calls = message.get("tool_calls")

            if tool_calls:
                messages.append(message)
                for call in tool_calls:
                    fn = call["function"]
                    if fn["name"] != "execute_sql":
                        continue
                    try:
                        args = json.loads(fn["arguments"])
                    except json.JSONDecodeError:
                        args = {}
                    result = execute_sql(args.get("sql", ""))
                    if isinstance(result, dict) and result.get("unavailable"):
                        sql_unavailable = True
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call["id"],
                            "name": "execute_sql",
                            "content": _cap_tool_payload(result),
                        }
                    )
                continue

            final_response = message.get("content") or ""
            break

        if final_response and _LEAKED_CALL.search(final_response):
            final_response = _LEAKED_CALL.sub("", final_response).strip()
            if not final_response:
                return (
                    "I couldn't process that question reliably. "
                    "Try rephrasing it, or break it into smaller parts."
                )

        if sql_unavailable:
            return "The research database is currently unavailable. Please try again later."

        if not final_response:
            try:
                status, data = await _post_groq(
                    client,
                    api_key,
                    {
                        "model": model,
                        "messages": messages
                        + [
                            {
                                "role": "system",
                                "content": (
                                    "Stop calling tools. Using ONLY the execute_sql "
                                    "results already above, answer the user's question "
                                    "in plain text. Be concise. Do not fabricate data."
                                ),
                            }
                        ],
                        "temperature": 0.1,
                        "max_tokens": 600,
                    },
                )
                if status == 200:
                    final_response = (
                        data.get("choices", [{}])[0].get("message", {}).get("content") or ""
                    )
            except Exception:  # noqa: BLE001
                log.exception("force-finalize call failed")

    return final_response or (
        "I couldn't reliably answer that from the database. "
        "Try rephrasing — for example, ask for stats on a specific faculty, "
        "or list publications by a faculty name."
    )
