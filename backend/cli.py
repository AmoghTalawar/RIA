#!/usr/bin/env python3
"""RIA Dashboard — Terminal Chatbot CLI

Processes natural-language queries through the full pipeline:
  NLP normalize → intent router → SQL → Supabase → answer
  (falls back to Groq LLM when no intent matches)

SQL queries executed against the database are printed to the terminal.

Usage:

  # One-shot
  python cli.py "What's our total publication count and YoY growth?"

  # Interactive
  python cli.py
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

# ── Path & env setup (must happen before other imports) ───────────
_BACKEND = Path(__file__).parent
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv
load_dotenv(_BACKEND / ".env")

# Tell sql_tool.py to print SQL to stdout
os.environ["VERBOSE_SQL"] = "1"

# Suppress noisy log output — SQL printing is handled via VERBOSE_SQL above
logging.basicConfig(level=logging.WARNING, format="%(message)s")
for _noisy in ("ria.sql", "ria.backend", "httpx", "httpcore", "supabase"):
    logging.getLogger(_noisy).setLevel(logging.ERROR)

# ── Main imports (after env setup) ────────────────────────────────
from nlp_pipeline import (  # noqa: E402
    build_context_prompt,
    extract_entities,
    get_session,
    normalize_query,
)
from intent_router import route_intent  # noqa: E402
from groq_client import call_groq       # noqa: E402

# ── ANSI helpers ──────────────────────────────────────────────────
_BOLD  = "\033[1m"
_GRAY  = "\033[90m"
_RESET = "\033[0m"
_HR    = "-" * 60


def _process(message: str, session_id: str = "cli") -> str:
    session = get_session(session_id)
    session.add_turn("user", message)

    # NLP pipeline
    normalized = normalize_query(message, session)
    entities   = extract_entities(message)

    print(f"{_GRAY}[NLP] original  : {message[:100]}{_RESET}")
    if normalized != message.strip():
        print(f"{_GRAY}[NLP] normalized: {normalized[:100]}{_RESET}")
    extracted = {k: v for k, v in entities.__dict__.items() if v is not None}
    if extracted:
        print(f"{_GRAY}[NLP] entities  : {extracted}{_RESET}")

    # Deterministic intent router (no LLM call for known patterns)
    reply, intent = route_intent(message, normalized_message=normalized)
    if reply is not None:
        print(f"{_GRAY}[router] matched intent: {intent}{_RESET}")
        session.update(entities, intent=intent)
        session.add_turn("assistant", reply)
        return reply

    # LLM fallback (Groq tool-calling loop)
    print(f"{_GRAY}[router] no direct match, delegating to LLM...{_RESET}")
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return "Error: GROQ_API_KEY is not configured in backend/.env"

    context_prompt = build_context_prompt(session)
    history = session.get_history_for_llm()

    try:
        reply = asyncio.run(
            call_groq(
                user_message=message,
                api_key=api_key,
                conversation_history=history,
                context_prompt=context_prompt,
            )
        )
    except Exception as exc:
        reply = f"LLM error: {exc}"

    session.update(entities)
    session.add_turn("assistant", reply)
    return reply


def _run_once(query: str) -> None:
    print(f"\n{_BOLD}Query:{_RESET} {query}")
    print(_HR)
    reply = _process(query)
    print(f"\n{_BOLD}Answer:{_RESET}\n{reply}\n")


def _run_interactive() -> None:
    print(f"\n{_BOLD}RIA Dashboard — Terminal Chatbot{_RESET}")
    print("Ask anything about research data. Type 'quit' to exit.\n")
    session_id = "cli_interactive"
    while True:
        try:
            query = input(f"{_BOLD}You:{_RESET} ").strip()
        except (EOFError, KeyboardInterrupt):
            print(f"\n{_GRAY}Exiting.{_RESET}")
            break
        if not query:
            continue
        if query.lower() in ("quit", "exit", "q", ":q"):
            print(f"{_GRAY}Goodbye!{_RESET}")
            break
        print(_HR)
        reply = _process(query, session_id=session_id)
        print(f"\n{_BOLD}RIA:{_RESET}\n{reply}\n{_HR}\n")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        _run_once(" ".join(sys.argv[1:]))
    else:
        _run_interactive()
