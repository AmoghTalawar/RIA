# RIA Backend

FastAPI backend for the RIA Dashboard — serves data endpoints and routes AI chatbot queries.

**Start:** `python main.py` (not `uvicorn` directly — the `__main__` block reads `HOST`/`PORT` from `.env`)

---

## File Structure

```
backend/
├── main.py             # FastAPI entry point — data endpoints + /chat + /api/pub-chat
├── ria_agent.py        # Async 6-tool RIA agent (tool loop + Groq integration)
├── ria_tools_groq.py   # 6 tool implementations + RIA system prompt
├── intent_router.py    # Slim 7-intent deterministic router (zero LLM cost)
├── sql_tool.py         # execute_sql() via Supabase exec_sql RPC + schema metadata
├── requirements.txt    # Python dependencies
├── .env                # NOT committed — copy from .env.example
└── .env.example        # Template
```

> `nlp_pipeline.py` and `groq_client.py` are legacy files — not in the live request path.

---

## Environment

```env
SUPABASE_URL=http://10.9.0.115:8000
SUPABASE_SERVICE_ROLE_KEY=<jwt>
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
HOST=0.0.0.0
PORT=8000
```

`OPENROUTER_MODEL` defaults to `anthropic/claude-3.5-sonnet` if not set. Get a key at `https://openrouter.ai/keys`.

### CORS (ALLOWED_ORIGINS)

Controls which frontend origins can call the backend. Default (no entry) allows only `localhost:5173` and `127.0.0.1:5173`.

```env
# Default — localhost only (no entry needed)
# ALLOWED_ORIGINS not set

# Specific IPs — add your machine's LAN IP when accessing from another device
ALLOWED_ORIGINS=http://localhost:5173,http://10.9.0.109:5173

# Allow all origins — open LAN access, dev/demo only
ALLOWED_ORIGINS=*
```

Find your LAN IP: `ipconfig getifaddr en0` (Mac) or `hostname -I` (Linux).

---

## Architecture

```
POST /chat  or  POST /api/pub-chat
        │
        ├─ Slim intent router  (7 deterministic intents — no LLM, <5ms)
        │     compare_years / best_year / year_trend / year_range /
        │     yearly_count / paper_authors / campus_unsupported
        │     MATCH → SQL → formatted reply
        │     NO MATCH ↓
        │
        └─ RIA Agent  (ria_agent.py)
              iter 0: tool_choice=required, max_tokens=256
                      LLM picks one of 6 tools
              tool runs against Supabase via exec_sql RPC
              iter 1: tool_choice=none, max_tokens=1024
                      LLM writes final answer from tool result
```

### 6 Tools (ria_tools_groq.py)

| Tool | Answers |
|------|---------|
| `get_faculty_stats` | Per-faculty metrics — h-index, citations, Q-rank count |
| `get_department_stats` | Dept aggregate + top N faculty |
| `count_qrank_publications` | Q1/Q2/Q3/Q4 counts, optionally filtered by dept/year |
| `search_publications_by_author` | Paper titles + metadata for a faculty member |
| `compare_entities` | Rankings and comparisons across depts or faculty |
| `get_yearly_stats` | Publication count by year + YoY growth |

### 7 Intent Router Intents (intent_router.py)

Deterministic regex — no LLM, no NLP pipeline. Handles only these:

| Intent | Example |
|--------|---------|
| `compare_years` | "pubs in 2019 vs 2024" |
| `best_year` | "which year had the most publications?" |
| `year_trend` | "publications by year" |
| `year_range` | "publications from 2019 to 2024" |
| `yearly_count` | "how many pubs in 2022?" |
| `paper_authors` | "who are the authors of \<title\>" |
| `campus_unsupported` | "BVB campus publications" |

Everything else goes to the RIA agent.

---

## API Endpoints

### Data endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/publications` | All 6,516 publications (paginated server-side) |
| GET | `/api/faculty` | All 739 faculty |
| GET | `/api/faculty?department=X` | Faculty filtered by department, sorted by citations |
| GET | `/api/institutes` | 18 institute summaries |
| POST | `/api/sql` | Execute a read-only SELECT query |
| GET | `/health` | `{"ok": true}` |

### Chat endpoints

**POST /chat** — VC dashboard chatbot
```json
{
  "message": "top 5 faculty by citations",
  "chart_title": "Faculty Citations",   // optional — scopes LLM to chart context
  "session_id": "abc-123",              // optional
  "history": [...]                      // optional, last 10 turns
}
```
Response:
```json
{
  "reply": "...",
  "source": "intent_router",   // or "llm"
  "session_id": "abc-123"
}
```

**POST /api/pub-chat** — Publication Explorer chatbot
```json
{
  "messages": [
    {"role": "system", "content": "Focus context..."},
    {"role": "user",   "content": "show me Q1 papers in CSE"}
  ]
}
```
Response: `{"reply": "..."}`

---

## SQL Tool

`sql_tool.py` wraps the `exec_sql` Supabase RPC:
- Only `SELECT` queries are allowed — non-SELECT returns an error
- Leading/trailing whitespace is stripped before sending (RPC rejects leading newlines)
- Trailing semicolons are stripped (PostgreSQL `EXECUTE` breaks on them)

Enable verbose SQL logging:
```env
VERBOSE_SQL=1
```

---

## Database Schema (key tables/views)

| Object | Type | Purpose |
|--------|------|---------|
| `ria.publications` | Table | 6,516 publications |
| `ria.faculty` | Table | 739 faculty |
| `ria.v_faculty_full` | View | Faculty + dept + institute + all metrics |
| `ria.v_institute_summary` | View | Per-institute aggregate metrics |
| `public.exec_sql` | RPC | Read-only SQL execution for AI chatbot |

**Critical column rules:**
- `publications.home_authors` — use for author filtering (never `authors`, which has inconsistent formatting)
- `publications.home_author_department` — use for dept-level counts (semicolon-separated, captures all depts on co-authored papers)
- `publications.q_rank_scopus` — always use for Q-rank queries (never `q_rank_wos`)
- `faculty_publications` — 84.8% complete only, never use for counts

---

## Dependencies

```
fastapi
uvicorn
httpx>=0.27
pydantic>=2.0
supabase>=2.4
groq>=0.11
openai>=1.30
python-dotenv>=1.0
```


┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT INTERFACES                            │
│                                                                     │
│   ┌─────────────────────┐         ┌──────────────────────────┐      │
│   │  React Frontend UI  │         │   Terminal CLI (cli.py)  │      │
│   │  (localhost:5173)   │         │   python3 cli.py         │      │
│   └──────────┬──────────┘         └────────────┬─────────────┘      │
└──────────────┼──────────────────────────────────┼───────────────────┘
               │ HTTP POST /chat                  │ direct call
               │ (or /api/pub-chat)               │
               ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND PIPELINE                            │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  1. NLP PIPELINE  (nlp_pipeline.py)                            │ │
│  │     • Synonym normalization & Entity extraction                │ │
│  │     • Phrasing canonicalization (regex rewrites)               │ │
│  │     • Follow-up / pronoun resolution (session context)         │ │
│  └───────────────────────────┬────────────────────────────────────┘ │
│                              │ normalized query                   │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  2. INTENT ROUTER  (intent_router.py)                          │ │
│  │   Stage 1 — Regex Matchers (19 intents, ordered)               │ │
│  │   Stage 2 — Keyword Fallback (entity-based scoring)            │ │
│  └──────────────┬─────────────────────────┬───────────────────────┘ │
│                 │ MATCH                   │ NO MATCH (Fallback)     │
│                 ▼                         ▼                         │
│  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  3. STATIC EXECUTION    │  │  4. 6-TOOL RIA AGENT (LLM)       │  │
│  │  (sql_tool.py)          │  │  (ria_agent.py)                  │  │
│  │                         │  │                                  │  │
│  │  Direct SQL execution   │  │  Groq / Llama-3-8b (Agent loop)  │  │
│  │                         │◄─│  Tool-calling loop               │  │
│  │                         │  │  → determines which sub-tool req.│  │
│  └─────────────┬───────────┘  └───────────────┬──────────────────┘  │
│                │                              │ Tool Calls          │
│                │                              ▼                     │
│                │              ┌──────────────────────────────────┐  │
│                │              │  5. SPECIALIZED RIA TOOLS        │  │
│                │              │  (ria_tools_groq.py)             │  │
│                │              │                                  │  │
│                │              │  • get_faculty_stats()           │  │
│                │              │  • count_qrank_publications()    │  │
│                │              │  • search_publications_by_author │  │
│                │              │  • get_department_stats()        │  │
│                │              │  • compare_entities()            │  │
│                │              │  • get_yearly_stats()            │  │
│                │              └───────────────┬──────────────────┘  │
│                │                              │ DB queries          │
│                ▼                              ▼                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  6. RESPONSE FORMATTER                                         │ │
│  │     Generates final Markdown reply string                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE  (PostgreSQL)                           │
│           API:      http://127.0.0.1:54321                          │
│           Studio:   http://127.0.0.1:54323/project/default          │
│                                                                     │
│  Tables:  publications · departments · institutes                   │
│           faculty_publications                                      │
│  Views:   v_faculty_full · v_institute_summary                      │
│  RPC:     exec_sql(query_text TEXT) → JSONB                         │
└─────────────────────────────────────────────────────────────────────┘







