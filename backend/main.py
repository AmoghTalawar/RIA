"""FastAPI entry point for the RIA chatbot backend."""
from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import create_client, ClientOptions

load_dotenv(Path(__file__).parent / ".env")

from auth_scope import Scope, get_scope, require_roles  # noqa: E402
from ria_agent import call_ria_agent, extract_pub_chat_parts  # noqa: E402
from signal_context import build_signal_prompt  # noqa: E402
from llm_provider import default_api_key  # noqa: E402
from intent_router import route_intent  # noqa: E402
from nlp_pipeline import normalize_query  # noqa: E402
from persona.persona_loader import get_persona, list_all_personas  # noqa: E402
from sql_tool import execute_sql  # noqa: E402
from paper_details import paper_details  # noqa: E402

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("ria.backend")

app = FastAPI(title="RIA Dashboard Chatbot")

# Allowed origins: comma-separated in ALLOWED_ORIGINS env var; defaults to localhost only.
# Example for production: ALLOWED_ORIGINS=http://10.9.0.100:5173,http://localhost:5173
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
ALLOWED_ORIGINS = ["*"] if _raw_origins.strip() == "*" else [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────
# Supabase client (ria schema) + simple TTL cache
# ─────────────────────────────────────────────────────────────

_sb_ria = None
_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()
CACHE_TTL = 300  # 5 minutes


def get_sb_ria():
    global _sb_ria
    if _sb_ria is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"]
        _sb_ria = create_client(url, key, options=ClientOptions(schema="ria"))
    return _sb_ria


def cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.time() - entry["ts"] < CACHE_TTL:
            return entry["data"]
    return None


def cache_set(key: str, data: Any):
    with _cache_lock:
        _cache[key] = {"data": data, "ts": time.time()}


def fetch_all_pages(table: str, cols: str, filters: dict | None = None) -> list:
    """Paginate past the PostgREST 1000-row limit."""
    sb, PAGE, offset, result = get_sb_ria(), 1000, 0, []
    while True:
        q = sb.table(table).select(cols).range(offset, offset + PAGE - 1)
        if filters:
            for col, val in filters.items():
                q = q.eq(col, val)
        resp = q.execute()
        result.extend(resp.data)
        if len(resp.data) < PAGE:
            break
        offset += PAGE
    return result


PUB_COLS = ",".join([
    "id", "pub_id", "title", "source_publication", "article_type", "level",
    "year", "doi", "home_authors", "home_author_department", "home_author_institute",
    "home_author_location", "technology_areas", "q_rank_scopus", "q_rank_wos",
    "cite_score", "impact_factor", "scs_citations", "wos_citations_pub",
    "gs_citations_pub", "is_sci", "is_pm", "is_ugc", "abdc_grade", "authors",
])

FAC_COLS = ",".join([
    "faculty_id", "author_name", "department", "institute", "short_name",
    "role_level", "total_pub_count", "scopus_pub_count", "wos_pub_count",
    "scopus_citation", "scopus_hindex", "wos_hindex", "gs_hindex",
    "scopus_i10_index", "avg_citescore", "avg_impfactor",
    "scopus_q1_count", "wos_q1_count", "journal_count", "conference_count",
    "book_count", "book_chapter_count",
])


# ─────────────────────────────────────────────────────────────
# Data endpoints (frontend data fetching — no keys in browser)
# All require a valid Supabase session (Authorization: Bearer <access token>).
# ─────────────────────────────────────────────────────────────

@app.get("/api/publications")
def publications(_scope: Scope = Depends(get_scope)):
    cached = cache_get("publications")
    if cached is not None:
        return JSONResponse(cached)
    data = fetch_all_pages("publications", PUB_COLS)
    cache_set("publications", data)
    return JSONResponse(data)


@app.get("/api/publications/{pub_id}")
def publication_details(pub_id: int, _scope: Scope = Depends(get_scope)):
    """One paper in full (abstract, authors, volume/pages/ISSN...) from the database, with no outside calls."""
    result = paper_details(pub_id, outside=False)
    if result is None:
        raise HTTPException(status_code=404, detail="No such publication.")
    return JSONResponse(result)


@app.get("/api/publications/{pub_id}/outside")
def publication_outside(pub_id: int, _scope: Scope = Depends(get_scope)):
    """The slower part of the detail page: missing fields and live citation counts from OpenAlex / Crossref."""
    result = paper_details(pub_id, outside=True)
    if result is None:
        raise HTTPException(status_code=404, detail="No such publication.")
    return JSONResponse(result)


@app.get("/api/faculty")
def faculty(
    department: Optional[str] = Query(default=None),
    _scope: Scope = Depends(get_scope),
):
    if department:
        data = (
            get_sb_ria()
            .table("v_faculty_full")
            .select(FAC_COLS)
            .eq("department", department)
            .order("scopus_citation", desc=True)
            .execute()
            .data or []
        )
        return JSONResponse(data)
    cached = cache_get("faculty_all")
    if cached is not None:
        return JSONResponse(cached)
    data = fetch_all_pages("v_faculty_full", FAC_COLS)
    cache_set("faculty_all", data)
    return JSONResponse(data)


@app.get("/api/institutes")
def institutes(_scope: Scope = Depends(get_scope)):
    cached = cache_get("institutes")
    if cached is not None:
        return JSONResponse(cached)
    data = get_sb_ria().table("v_institute_summary").select("*").execute().data or []
    cache_set("institutes", data)
    return JSONResponse(data)


class SqlRequest(BaseModel):
    query: str


@app.post("/api/sql")
def run_sql(body: SqlRequest, _scope: Scope = Depends(require_roles("Admin"))):
    # Arbitrary SELECT with the service role bypasses every persona scope, so it is
    # Admin-only. The frontend does not call it (src/tools/sqlTool.js is unused).
    sql = body.query.strip()
    if not sql.lower().startswith(("select", "with")):
        raise HTTPException(status_code=403, detail="Only SELECT/WITH queries allowed")
    result = execute_sql(sql)
    if isinstance(result, dict) and result.get("unavailable"):
        raise HTTPException(status_code=503, detail=result)
    return JSONResponse(result)


class PubChatRequest(BaseModel):
    messages: list[dict]


@app.post("/api/pub-chat")
async def pub_chat(
    body: PubChatRequest,
    x_groq_key: Optional[str] = Header(default=None, alias="X-Groq-Key"),
    scope: Scope = Depends(require_roles("VC", "Admin")),
):
    """Publication Explorer chatbot — routes through the 6-tool RIA agent.

    Restricted to the roles that can open the Publication Explorer (VC / Admin)."""
    api_key = x_groq_key or default_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="No API key configured (set OPENROUTER_API_KEY / GEMINI_API_KEY / GROQ_API_KEY or send X-Groq-Key header).",
        )

    user_message, history, focus_context = extract_pub_chat_parts(body.messages)
    if not user_message:
        raise HTTPException(status_code=400, detail="No user message found in messages array")

    t0 = time.time()
    dev: dict = {}
    reply = await call_ria_agent(
        user_message=user_message,
        api_key=api_key,
        scope=scope,
        conversation_history=history,
        context_prompt=focus_context,
        persona_prompt=False,
        _dev=dev,
    )
    log.info(
        "[pub-chat] user=%s persona=%s query=%r tools=%d tokens=%d latency_ms=%d",
        scope.user_id[:8], scope.persona_id,
        user_message[:60], len(dev.get("tool_calls", [])),
        dev.get("tokens", {}).get("total", 0),
        round((time.time() - t0) * 1000),
    )
    return {"reply": reply}


# ─────────────────────────────────────────────────────────────
# Pydantic models (chat)
# ─────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    chart_title: Optional[str] = None
    session_id: Optional[str] = None
    # role_level / dean_scope / user_context are accepted only so older clients do not
    # get a 422. They are IGNORED: role, persona and user context come from the verified
    # session (auth_scope.Scope), never from the request body.
    role_level: Optional[str] = None
    dean_scope: Optional[str] = None
    user_context: Optional[dict] = None
    # VC dashboard "Ask AI" signal; honoured only for VC / Executive Dean / Admin (see signal_context.py).
    context: Optional[dict] = None
    history: Optional[list[HistoryMessage]] = None


class ChatResponse(BaseModel):
    reply: str
    source: str  # "intent_router" | "llm"
    session_id: str
    persona_id: Optional[str] = None


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/personas")
def get_personas(scope: Scope = Depends(get_scope)) -> dict:
    """The caller's own persona, plus any persona it may view as (only the VC has any)."""
    own = get_persona(role_level=scope.role_level, dean_scope=scope.dean_scope)
    visible = {own["persona_id"], *own.get("can_impersonate", [])}
    return {
        "own_persona_id": own["persona_id"],
        "personas": [p for p in list_all_personas() if p["persona_id"] in visible],
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    x_groq_key: Optional[str] = Header(default=None, alias="X-Groq-Key"),
    scope: Scope = Depends(get_scope),
) -> ChatResponse:
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    if req.role_level and req.role_level != scope.role_level:
        log.warning(
            "[chat] ignoring client-supplied role_level=%r; session role is %r (user=%s)",
            req.role_level, scope.role_level, scope.user_id[:8],
        )

    session_id = req.session_id or str(uuid.uuid4())
    t0 = time.time()

    if not req.chart_title:
        try:
            # Normalize synonyms & abbreviations (e.g., 'cse' -> 'CSE', 'pubs' -> 'publications')
            # to increase fast-path intent matching accuracy without stateful leaks.
            norm_msg = normalize_query(req.message)
            reply, _ = route_intent(norm_msg)
            if reply is None and norm_msg != req.message:
                # Also try original raw message if normalized query didn't match
                reply, _ = route_intent(req.message)
        except Exception:  # noqa: BLE001
            log.exception("route_intent failed")
            reply = None
        if reply is not None:
            log.info(
                "[chat] source=intent_router latency_ms=%d query=%r",
                round((time.time() - t0) * 1000), req.message[:60],
            )
            return ChatResponse(reply=reply, source="intent_router", session_id=session_id)

    api_key = x_groq_key or default_api_key()
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="No API key configured (set OPENROUTER_API_KEY / GEMINI_API_KEY / GROQ_API_KEY or send X-Groq-Key header).",
        )

    conversation_history = [
        {"role": msg.role, "content": msg.content}
        for msg in (req.history or [])[-10:]
    ]

    dev: dict = {}
    resolved_persona_id = scope.persona_id

    try:
        reply = await call_ria_agent(
            user_message=req.message,
            api_key=api_key,
            chart_title=req.chart_title,
            conversation_history=conversation_history,
            context_prompt=build_signal_prompt(req.context, scope.role_level, scope.persona_id),
            scope=scope,
            _dev=dev,
        )
    except Exception as err:  # noqa: BLE001
        log.exception("call_ria_agent failed")
        raise HTTPException(status_code=502, detail=str(err))

    log.info(
        "[chat] source=llm session=%s persona=%s tools=%d tokens=%d latency_ms=%d query=%r",
        session_id[:8], resolved_persona_id, len(dev.get("tool_calls", [])),
        dev.get("tokens", {}).get("total", 0),
        round((time.time() - t0) * 1000), req.message[:60],
    )
    return ChatResponse(
        reply=reply,
        source="llm",
        session_id=session_id,
        persona_id=resolved_persona_id,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", 5002)),
        reload=False,
    )
