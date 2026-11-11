"""Async RIA agent — wraps ria_tools_groq.py's 6-tool loop for FastAPI use.

Replaces groq_client.py in the /chat endpoint and powers /api/pub-chat.
Uses httpx directly (no openai package required).
Tools run in a thread pool so sync Supabase calls don't block the event loop.
"""
from __future__ import annotations

import asyncio
import functools
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from auth_scope import Scope
from persona.persona_loader import get_persona, build_system_prompt
from scope_guard import authorize, filter_tools
from llm_provider import resolve_provider
from question_class import is_concept_question
from source_line import SOURCE_MARK, build_source_line

from ria_tools_groq import (
    TOOLS,
    TOOL_FUNCTIONS,
    CONCEPT_PROMPT,
    build_ria_prompt,
    _parse_raw_fn_text,
    _override_tool_choice,
)

log = logging.getLogger("ria.agent")

MAX_ITERATIONS = 3
# Each history message is clipped: a table-style assistant reply can be 1k+ tokens, and it is resent on
# every model call of every later question.
HISTORY_MESSAGE_CHARS = 1200


def _clip(text: str, limit: int = HISTORY_MESSAGE_CHARS) -> str:
    text = (text or "").split(SOURCE_MARK, 1)[0]     # the footer is added in code; not worth re-sending
    return text if len(text) <= limit else text[:limit].rstrip() + " …[earlier reply shortened]"


def _system_message(system: str, provider, model: str) -> dict:
    """The system message. For Anthropic models the whole prefix (tool definitions + system prompt, about
    90% of every request and identical for a persona) is marked cacheable, so the 2nd and 3rd model call of
    a question - and later questions from the same persona within the cache lifetime - are billed at the
    provider's cached-input rate. Other providers cache implicit prefixes on their own."""
    if provider.name == "openrouter" and str(model).startswith("anthropic/"):
        return {"role": "system",
                "content": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]}
    return {"role": "system", "content": system}


async def _call_groq_http(
    client: httpx.AsyncClient,
    api_key: str,
    body: dict,
    url: str,
) -> tuple[int, dict]:
    resp = await client.post(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=60.0,
    )
    data = resp.json()
    if isinstance(data, list):  # Gemini wraps its error objects in a list
        data = data[0] if data and isinstance(data[0], dict) else {}
    return resp.status_code, data


def _guarded_call(fn_name: str, fn_args: dict, scope: Scope, user_message: str, info: dict) -> str:
    """Authorize the call against the caller's scope, then run the tool with the guard's arguments.

    The model's own arguments never reach the tool directly: scope_guard whitelists them and adds
    the trusted ones (ria_user_id / scope_departments / include_names)."""
    decision = authorize(scope, fn_name, fn_args, user_message)
    info["guard"] = decision.action
    if not decision.allowed:
        return json.dumps({"status": "forbidden", "message": decision.message})
    fn = TOOL_FUNCTIONS.get(fn_name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {fn_name}"})
    result = fn(**decision.args)
    return result if isinstance(result, str) else json.dumps(result)


async def _run_tool(fn_name: str, fn_args: dict, scope: Scope, user_message: str = "",
                    info: dict | None = None) -> str:
    """Run a scope-checked tool in a thread pool to avoid blocking the event loop."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None,
            functools.partial(_guarded_call, fn_name, fn_args, scope, user_message, info if info is not None else {}),
        )
    except Exception as e:  # noqa: BLE001
        log.exception("[ria_agent] tool %s raised", fn_name)
        return json.dumps({"error": str(e)})


_LOG_DIR = Path(__file__).parent / "logs"
_LOG_FILE = _LOG_DIR / "ria_agent.log"


def _print_agent_trace(dev: dict) -> None:
    try:
        sep = "-" * 64
        tc = dev["tool_calls"]
        print(f"\n{sep}")
        print(f"  Query   : {dev['query'][:80]}")
        print(f"  Model   : {dev['model']}  |  Iters: {dev['iterations']}  |  Tools: {len(tc)}", end="")
        if dev.get("chart_title"):
            print(f"  |  Chart: {dev['chart_title']}", end="")
        if dev.get("raw_fn_fallback"):
            print("  |  [raw-fn fallback]", end="")
        print()
        for t in tc:
            tag = "[fallback]" if t.get("fallback") else ""
            print(f"    -> {t['tool']}({t['args']}) {tag}")
            print(f"      result: {t['result_chars']} chars  exec: {t['exec_ms']}ms")
        tok = dev["tokens"]
        print(
            f"  Tokens  : {tok['prompt']} prompt + {tok['completion']} completion"
            f" = {tok['total']} total"
        )
        print(f"  Latency : {dev['latency_ms']}ms")
        print(f"  Reply   : {dev['reply_preview']}")
        print(sep)
    except Exception as exc:
        log.warning("[ria_agent] could not print agent trace: %s", exc)


def _write_log_entry(dev: dict) -> None:
    try:
        _LOG_DIR.mkdir(exist_ok=True)
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            **dev,
        }
        with _LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:  # noqa: BLE001
        log.warning("[ria_agent] could not write log entry: %s", exc)


_DATA_YEAR_TTL = 600.0
_data_year_cache: tuple[float, int | None] = (0.0, None)


def _result_status(result: str) -> str:
    """'success' / 'error' / 'forbidden' / 'no_match' ... from a tool's JSON result."""
    try:
        return str(json.loads(result).get("status", "success"))
    except (ValueError, AttributeError):
        return "unknown"


async def _source_footer(dev: dict, concept_mode: bool, reply: str) -> str:
    """The 'Source:' line for the answer; empty for refusals and errors, which cite nothing."""
    if reply.lstrip().startswith(("Sorry,", "I couldn't", "Request timed out", "Rate limit", "That isn't something")):
        return ""
    try:
        year = None if concept_mode else await asyncio.to_thread(_newest_data_year)
    except Exception:  # noqa: BLE001 - the year is a nicety, never required
        year = None
    return build_source_line(dev["tool_calls"], concept=concept_mode, data_year=year)


def _newest_data_year() -> int | None:
    """Newest publication year in the database (cached; the data is a periodic export)."""
    global _data_year_cache
    now = time.time()
    if _data_year_cache[0] > now:
        return _data_year_cache[1]
    from sql_tool import execute_sql
    rows = execute_sql("SELECT MAX(year)::int AS y FROM publications WHERE year IS NOT NULL")
    year = rows[0]["y"] if isinstance(rows, list) and rows else None
    _data_year_cache = (now + _DATA_YEAR_TTL, year)
    return year


def _runtime_context(scope: Scope) -> str:
    """Facts the model can't know on its own: today's date, how current the data is, and whether
    "my" can be answered (role testing: a HoD called 2024 "this year" and 2025-26 papers
    "scheduled"; Deans answered "how do I improve my citations" for the whole school)."""
    today = datetime.now(timezone.utc).date()
    newest = _newest_data_year()
    data = (f"newest publication year in the database is {newest}; {newest - 1} is the newest complete year"
            if newest else "newest publication year unknown")
    linked = ("yes" if scope.ria_user_id is not None
              else "no (questions about 'my' own research can't be answered for this account)")
    return f"TODAY: {today.isoformat()} (current year {today.year}). DATA: {data}.\nLinked faculty profile: {linked}."


async def call_ria_agent(
    user_message: str,
    api_key: str,
    scope: Scope,
    chart_title: str | None = None,
    conversation_history: list[dict] | None = None,
    context_prompt: str = "",
    persona_prompt: bool = True,
    _dev: dict | None = None,
) -> str:
    """
    Async RIA tool-calling agent with role-specific persona system prompt.

    `scope` is the caller's verified Scope (backend/auth_scope.py) and is REQUIRED: it picks the
    persona, the tools the model can see, and (via scope_guard) what every tool call may touch.
    `persona_prompt=False` skips the persona framing (Publication Explorer) but not the guard.

    Flow per turn:
      iter 0: tool_choice='required' (force a tool call, 256 token budget)
      iter 1+: tool_choice='none'    (have result → produce text answer, 1024 tokens)
      fallback: if LLM emits raw <function=...> text, parse and execute it
    """
    # 1. Resolve role persona from the VERIFIED scope (never from the request body)
    persona = None
    if persona_prompt:
        try:
            persona = get_persona(role_level=scope.role_level, dean_scope=scope.dean_scope)
        except Exception as p_err:
            log.warning("[ria_agent] Failed to resolve persona for %s/%s: %s", scope.role_level, scope.dean_scope, p_err)
    tools = filter_tools(TOOLS, scope, user_message)

    # A plain concept question ("what is h-index?") needs no data tools: skip the tool definitions and the
    # routing prompt for it (saves about 5k tokens per call).
    concept_mode = bool(persona_prompt and not chart_title and is_concept_question(user_message))
    if concept_mode:
        tools = []

    # 2. Assemble system prompt (Persona framing + Tool rules + Chart/Session context)
    system_sections = []
    if persona:
        persona_text = build_system_prompt(persona, scope.user_context())
        system_sections.append(f"=== ROLE PERSONA: {persona['level_label']} ===\n{persona_text}\n")

    if chart_title:
        system_sections.append(
            f'You are KLE Tech\'s Research AI — scope all answers to the "{chart_title}" chart.'
        )

    # Only the routing rules for the tools this persona actually has.
    system_sections.append(CONCEPT_PROMPT if concept_mode else build_ria_prompt(t["function"]["name"] for t in tools))

    if concept_mode:
        runtime = ""
    else:
        try:
            runtime = await asyncio.to_thread(_runtime_context, scope)
        except Exception as err:  # noqa: BLE001 - context is helpful, never required
            log.warning("[ria_agent] runtime context unavailable: %s", err)
            runtime = f"TODAY: {datetime.now(timezone.utc).date().isoformat()}."
    session = "\n".join(x for x in (runtime, context_prompt) if x)
    if session:
        system_sections.append(f"=== SESSION CONTEXT ===\n{session}")

    system = "\n\n".join(system_sections)

    # Determine the API endpoint and model dynamically based on api_key format
    provider = resolve_provider(api_key)
    url, model, api_key = provider.url, provider.model, provider.api_key

    messages: list[dict[str, Any]] = [_system_message(system, provider, model)]

    # Include conversation history (last 6 turns, skip current message if duplicated)
    if conversation_history:
        for msg in conversation_history[-6:]:
            if msg.get("role") not in ("user", "assistant"):
                continue
            if msg["role"] == "user" and msg["content"].strip() == user_message.strip():
                continue
            messages.append({"role": msg["role"], "content": _clip(msg["content"])})

    messages.append({"role": "user", "content": user_message})

    tool_called_this_turn = False
    agent_start = time.monotonic()

    # Dev info collected across all iterations
    dev: dict[str, Any] = {
        "query": user_message,
        "model": model,
        "persona": scope.persona_id,
        "chart_title": chart_title,
        "iterations": 0,
        "tool_calls": [],
        "tokens": {"prompt": 0, "completion": 0, "total": 0, "cached": 0},
        "mode": "concept" if concept_mode else "tools",
        "latency_ms": 0,
        "raw_fn_fallback": False,
        "reply_preview": "",
    }

    final_reply = (
        "I couldn't reliably answer that from the database. "
        "Try rephrasing — for example, ask for stats on a specific faculty, "
        "compare departments, or ask about Q-rank counts."
    )

    iteration = 0
    refused_this_turn = False
    empty_retried = False
    rate_limit_retries = 0
    max_rate_limit_retries = 5

    async with httpx.AsyncClient(headers=provider.headers) as client:
        while iteration < MAX_ITERATIONS:
            dev["iterations"] = iteration + 1

            # No more tools once a call was refused (retrying other departments/people only burns tokens) or on
            # the last allowed round (the model must answer, not start another tool call).
            tool_choice = "none" if (refused_this_turn or iteration == MAX_ITERATIONS - 1) and iteration > 0 else "auto"
            # Answer budget. 768 cut long answers off mid-sentence (and reasoning models such as Gemini
            # spend part of it on thinking). Groq's free tier needs ~768 to stay under 1000 OTPM:
            # set LLM_MAX_TOKENS=768 there.
            max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "1800"))

            body: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": max_tokens,
            }
            if tools:
                body["tools"] = tools
                body["tool_choice"] = tool_choice

            try:
                iter_start = time.monotonic()
                status, data = await _call_groq_http(client, api_key, body, url)
                iter_ms = round((time.monotonic() - iter_start) * 1000)
            except httpx.TimeoutException:
                final_reply = "Request timed out. Please try again."
                break

            # Accumulate token usage
            usage = data.get("usage") or {}
            dev["tokens"]["prompt"] += usage.get("prompt_tokens", 0)
            dev["tokens"]["completion"] += usage.get("completion_tokens", 0)
            dev["tokens"]["total"] += usage.get("total_tokens", 0)
            dev["tokens"]["cached"] += (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0) or 0

            if status == 429:
                rate_limit_retries += 1
                if rate_limit_retries > max_rate_limit_retries:
                    final_reply = "Rate limit hit repeatedly — please wait a moment and try again."
                    break
                err_msg = (data.get("error") or {}).get("message", "")
                m = re.search(r"try again in ([\d.]+)s", err_msg, re.IGNORECASE)
                wait = float(m.group(1)) if m else 5.0
                # Allow waiting up to 35s instead of giving up immediately
                if wait <= 35:
                    log.info("[ria_agent] rate limited, auto-sleeping %.1fs (retry %d/%d)", wait, rate_limit_retries, max_rate_limit_retries)
                    await asyncio.sleep(wait + 0.5)
                    continue
                final_reply = f"Rate limit hit — please wait {int(wait)}s and try again."
                break

            if status != 200:
                err = (data.get("error") or {}).get("message", "Groq API error")
                log.error("[ria_agent] HTTP %s: %s", status, err)
                if "not in request.tools" in err.lower() or "tool call validation failed" in err.lower():
                    # The model tried to call a tool that wasn't offered this turn (usually one
                    # outside its persona's access) — never surface the provider's raw validation
                    # text; the tool routing table in the prompt mentions every tool, filtered per
                    # persona only in what's actually sent, so the model can still name one it
                    # doesn't have.
                    final_reply = "That isn't something I can help with at your access level."
                else:
                    final_reply = f"Sorry, I ran into an error: {err}"
                break

            # Advance iteration count only on successful API completions
            iteration += 1

            message = data["choices"][0]["message"]
            tool_calls = message.get("tool_calls")

            log.debug(
                "[ria_agent] iter=%d tool_choice=%s max_tokens=%d groq_ms=%d",
                iteration, tool_choice, max_tokens, iter_ms,
            )

            if not tool_calls:
                content = message.get("content") or ""

                # Handle raw <function=name '{...}'></function> text leaks
                fn_name, fn_args = _parse_raw_fn_text(content)
                if fn_name and fn_name in TOOL_FUNCTIONS:
                    log.info("[ria_agent] raw-fn fallback: %s", fn_name)
                    dev["raw_fn_fallback"] = True
                    tool_start = time.monotonic()
                    guard_info: dict = {}
                    result = await _run_tool(fn_name, fn_args or {}, scope, user_message, guard_info)
                    tool_ms = round((time.monotonic() - tool_start) * 1000)
                    dev["tool_calls"].append({
                        "tool": fn_name, "args": fn_args or {},
                        "result_chars": len(result), "exec_ms": tool_ms,
                        "fallback": True, "guard": guard_info.get("guard"),
                    })
                    messages.append({"role": "assistant", "content": content})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": "raw_fn_fallback",
                        "content": result,
                    })
                    tool_called_this_turn = True
                    continue

                # Answer hit the token limit: ask the model to carry on (at most twice) instead of
                # returning a reply that stops mid-sentence.
                finish = data["choices"][0].get("finish_reason")
                continuations = 0
                while content and finish == "length" and continuations < 2:
                    continuations += 1
                    cont_body = dict(body)
                    cont_body.pop("tools", None)
                    cont_body.pop("tool_choice", None)
                    cont_body["messages"] = messages + [
                        {"role": "assistant", "content": content},
                        {"role": "user", "content": "Continue exactly where you stopped. Do not repeat anything and do not add an introduction."},
                    ]
                    c_status, c_data = await _call_groq_http(client, api_key, cont_body, url)
                    if c_status != 200:
                        break
                    c_usage = c_data.get("usage") or {}
                    dev["tokens"]["prompt"] += c_usage.get("prompt_tokens", 0)
                    dev["tokens"]["completion"] += c_usage.get("completion_tokens", 0)
                    dev["tokens"]["total"] += c_usage.get("total_tokens", 0)
                    c_choice = c_data["choices"][0]
                    content += c_choice["message"].get("content") or ""
                    finish = c_choice.get("finish_reason")
                dev["continuations"] = continuations

                if not content and tool_called_this_turn and not empty_retried and iteration < MAX_ITERATIONS:
                    # An empty reply after tool results (seen live on a long list) would otherwise surface as a
                    # failure after ~25k tokens. Ask once for a short answer instead.
                    empty_retried = True
                    messages.append({"role": "user", "content": (
                        "Answer now from the tool results above, in under 150 words. If the result was a long "
                        "list, summarise it, show the first few items and say how many there are in total.")})
                    continue

                final_reply = content or "I couldn't generate a response. Try rephrasing your question."
                break

            # Execute all tool calls in this response
            messages.append(message)
            for call in tool_calls:
                fn_name = call["function"]["name"]
                try:
                    fn_args = json.loads(call["function"]["arguments"])
                    # Strip explicit nulls — some LLMs send null for optional
                    # params instead of omitting them, which causes Groq schema
                    # validation errors like "expected string, but got null".
                    fn_args = {k: v for k, v in fn_args.items() if v is not None}
                except (json.JSONDecodeError, TypeError):
                    fn_args = {}

                # Keyword-based safety net: override misrouted tools
                override_name, override_args = _override_tool_choice(
                    user_message, fn_name, fn_args
                )
                if override_name:
                    log.info("[ria_agent] override %s → %s", fn_name, override_name)
                    fn_name, fn_args = override_name, override_args

                tool_start = time.monotonic()
                guard_info = {}
                result = await _run_tool(fn_name, fn_args, scope, user_message, guard_info)
                tool_ms = round((time.monotonic() - tool_start) * 1000)

                dev["tool_calls"].append({
                    "tool": fn_name, "args": fn_args,
                    "result_chars": len(result), "exec_ms": tool_ms,
                    "fallback": False, "guard": guard_info.get("guard"),
                    "status": _result_status(result),
                })
                if dev["tool_calls"][-1]["status"] == "forbidden":
                    refused_this_turn = True
                log.info(
                    "[ria_agent] tool=%s args=%s result_chars=%d exec_ms=%d",
                    fn_name, fn_args, len(result), tool_ms,
                )

                messages.append({
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": result,
                })

            tool_called_this_turn = True

    dev["latency_ms"] = round((time.monotonic() - agent_start) * 1000)
    final_reply += await _source_footer(dev, concept_mode, final_reply)
    dev["reply_preview"] = final_reply[:120].replace("\n", " ")

    # Populate caller's dev dict if provided
    if _dev is not None:
        _dev.update(dev)

    _print_agent_trace(dev)
    _write_log_entry(dev)

    return final_reply


def extract_pub_chat_parts(
    messages: list[dict],
) -> tuple[str, list[dict], str]:
    """
    Extract (user_message, history, focus_context) from a pub-chat messages array.

    The frontend sends: [system_msg, ...history, user_msg]
    We pull out the last user message, keep prior turns as history,
    and extract the CURRENT FOCUS block from the system message (if any)
    so the agent knows which dept/qrank the chart is showing.
    """
    system_content = ""
    chat_turns: list[dict] = []

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            system_content = content
        elif role in ("user", "assistant"):
            chat_turns.append({"role": role, "content": content})

    if not chat_turns or chat_turns[-1]["role"] != "user":
        return "", [], ""

    user_message = chat_turns[-1]["content"]
    history = chat_turns[:-1]

    # Extract the FOCUS block — pass it as context_prompt so the agent knows the scope
    focus_context = ""
    if "CURRENT FOCUS" in system_content:
        idx = system_content.find("=== CURRENT FOCUS")
        if idx != -1:
            focus_context = system_content[idx:].strip()

    return user_message, history, focus_context
