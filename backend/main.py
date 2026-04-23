"""FastAPI entry point for the RIA chatbot backend."""
from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from groq_client import call_groq  # noqa: E402
from intent_router import route_intent  # noqa: E402
from nlp_pipeline import (  # noqa: E402
    normalize_query,
    extract_entities,
    get_session,
    build_context_prompt,
)

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("ria.backend")

app = FastAPI(title="RIA Dashboard Chatbot")

_origins = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


class HistoryMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    chart_title: Optional[str] = None
    session_id: Optional[str] = None
    history: Optional[list[HistoryMessage]] = None


class ChatResponse(BaseModel):
    reply: str
    source: str  # "intent_router" | "llm"
    session_id: str


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    x_groq_key: Optional[str] = Header(default=None, alias="X-Groq-Key"),
) -> ChatResponse:
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    # Session management
    session_id = req.session_id or str(uuid.uuid4())
    session = get_session(session_id)

    # Record user turn in session
    session.add_turn("user", req.message)

    # NLP pipeline: normalize the query using synonyms + session context
    normalized = normalize_query(req.message, session)
    entities = extract_entities(req.message)
    log.info(
        "[nlp] original=%r  normalized=%r  entities=%s",
        req.message[:80], normalized[:80],
        {k: v for k, v in entities.__dict__.items() if v is not None},
    )

    # Deterministic router first — skips the LLM for common intents.
    # Chart-focused mode always goes through the LLM so it can scope answers.
    if not req.chart_title:
        try:
            reply, matched_intent = route_intent(req.message, normalized_message=normalized)
        except Exception:  # noqa: BLE001
            log.exception("route_intent failed")
            reply, matched_intent = None, None
        if reply is not None:
            # Update session context with what we matched
            session.update(entities, intent=matched_intent)
            session.add_turn("assistant", reply)
            return ChatResponse(reply=reply, source="intent_router", session_id=session_id)

    api_key = x_groq_key or os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="No Groq API key configured (set GROQ_API_KEY or send X-Groq-Key header).",
        )

    # Build conversation history for LLM
    conversation_history = []
    if req.history:
        # Use frontend-provided history (last 10 messages)
        for msg in (req.history or [])[-10:]:
            conversation_history.append({"role": msg.role, "content": msg.content})
    else:
        # Fall back to server-side session history
        conversation_history = session.get_history_for_llm()

    # Build context prompt from session state
    context_prompt = build_context_prompt(session)

    try:
        reply = await call_groq(
            user_message=req.message,
            api_key=api_key,
            chart_title=req.chart_title,
            conversation_history=conversation_history,
            context_prompt=context_prompt,
        )
    except Exception as err:  # noqa: BLE001
        log.exception("call_groq failed")
        raise HTTPException(status_code=502, detail=str(err))

    # Update session context
    session.update(entities)
    session.add_turn("assistant", reply)

    return ChatResponse(reply=reply, source="llm", session_id=session_id)
