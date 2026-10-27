# RIA Dashboard — Project Status & Tooling Architecture

**Last Updated:** September 2026  
**Project:** RIA (Research Intelligence Agent) Dashboard — KLE Technological University  
**Architecture:** React (Vite + Tailwind) + Python (FastAPI + Async Groq/OpenRouter Agent) + Self-hosted Supabase (PostgreSQL 15+)

---

## 1. Executive Summary & Overall Status

| Component | Status | Details |
|---|---|---|
| **Frontend (React/Vite)** |  **Completed / Functional** | 5 Role-based dashboards (Faculty, HoD, Faculty Dean, Executive Dean, Vice Chancellor), Publication Explorer, Analytics & charts (Recharts + Plotly), Dark/Light theme, responsive UI. |
| **Backend (FastAPI)** |  **Operational** | Data endpoints (`/api/publications`, `/api/faculty`, `/api/institutes`, `/api/sql`), hybrid chatbot routing (`/chat`, `/api/pub-chat`), caching layer, thread-pooled sync DB executions. |
| **Database (Supabase PostgreSQL)** |  **Active & Indexed** | `ria` schema hosting 6,500+ publications, 730+ faculty records, materialized views (`v_faculty_full`, `v_institute_summary`), fuzzy matching (`pg_trgm`). |
| **AI Chatbot (RIA Agent)** |  **Operational & Stabilized** | 6 specialized function-calling tools with hybrid routing (Fast deterministic intent router + Groq Llama 3.3 LLM agent fallback). Fixed `tool_choice` and token constraints. |

---

## 2. Tools Created (Agent Function Calling)

The backend implements **6 core specialized database tools** in [`ria_tools_groq.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_tools_groq.py) that allow the LLM to query the university database safely without generating unconstrained raw SQL:

```
                      ┌─────────────────────────┐
                      │    User Chat Prompt     │
                      └────────────┬────────────┘
                                   │
                      ┌────────────▼────────────┐
                      │  Intent Router (0 LLM)  │ ──► Fast Direct SQL (7 intents)
                      └────────────┬────────────┘
                            [If No Direct Match]
                                   │
                      ┌────────────▼────────────┐
                      │  RIA Agent (Groq LLM)   │
                      └────────────┬────────────┘
                                   │
          ┌────────────┬───────────┼───────────┬────────────┬────────────┐
          ▼            ▼           ▼           ▼            ▼            ▼
     [Faculty]    [Dept Stats]  [Q-Rank]  [Search Pubs] [Compare]    [Yearly]
```

### Detailed Breakdown of the 6 Tools

| # | Tool Name | Purpose | Key Parameters | Target Database Source |
|---|---|---|---|---|
| 1 | `get_faculty_stats` | Retrieves individual faculty metrics (h-index, citations, publications, Q1–Q4 counts, impact factor). Uses fuzzy name matching (`pg_trgm`). | `faculty_name` (str), `source` ("scopus" / "wos") | `v_faculty_full` |
| 2 | `get_department_stats` | Fetches aggregated department/school stats (faculty count, total pub count, total citations, cumulative h-index, Q1 counts, and top N faculty). | `department` (str), `top_n` (int) | `v_faculty_full`, `departments` |
| 3 | `count_qrank_publications` | Aggregates and counts publications by Scopus Q-rank tier (Q1/Q2/Q3/Q4) across the university or filtered by department/year. | `qrank` ("Q1".."Q4"), `department` (str), `year` (int) | `publications`, `departments` |
| 4 | `search_publications_by_author` | Returns a list of actual publication titles, publication years, journal names, Q-ranks, and citation counts for a faculty member. | `author_name` (str), `year` (int), `qrank` (str), `limit` (int) | `publications`, `v_faculty_full` |
| 5 | `compare_entities` | Compares and ranks departments or faculty members by metrics (citations, publications, h-index, Q1 count, journals, conferences). | `entity_type` ("department"/"faculty"), `metric`, `top_n`, `entities`, `department` | `v_faculty_full`, `departments` |
| 6 | `get_yearly_stats` | Retrieves total publications for a specific calendar year or computes Year-over-Year (YoY) growth rate and research trends. | `year` (int), `department` (str) | `publications` |

---

## 3. Supporting Infrastructure & Routers

- **Deterministic Intent Router ([`intent_router.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/intent_router.py))**:
  - Handles 7 frequent queries with zero LLM latency and zero API cost (e.g. university total publications, university Q1 count, yearly publication counts, top faculty rankings).
- **Direct SQL Execution Engine ([`sql_tool.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/sql_tool.py))**:
  - Executes read-only SQL queries via Supabase `exec_sql` RPC with schema metadata validation and connection pooling.
- **Publication Explorer Agent ([`main.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/main.py) → `/api/pub-chat`)**:
  - Context-aware query endpoint scoped to current dashboard charts and active filters.

---

## 4. Recent Fixes & Stability Updates

1. **Model Upgraded for Groq Function Calling**:
   - Replaced non-standard `openai/gpt-oss-120b` with `llama-3.3-70b-versatile` in `.env` for native tool calling support.
2. **Fixed HTTP 400 (`Tool choice is required / none`)**:
   - Switched `tool_choice` to dynamic `"auto"` across all iterations in [`ria_agent.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_agent.py).
3. **Increased Token Budget**:
   - Increased turn-0 token limit from 256 to 1024 tokens to prevent truncated tool arguments and reasoning failures.

---

## 5. What Else is Remaining / Backlog

###  Priority 1: Multi-Step & Compound Query Handling
- **Compound Queries**: Queries like *"Who are the top faculty AND top departments for Q1?"* require calling `compare_entities` twice (or coordinating results).
- **Sub-queries**: Enhancing the agent loop so it can chain multiple tools in a single session before generating the response.

###  Priority 2: Automated Test Suite Execution
- Run queries from [`chatbot_test_suite.md`](file:///e:/RIA_GitHUb/RIA-Dashboard/chatbot_test_suite.md) to benchmark precision against all 25+ rephrased query variations.
- Ensure all department-level queries strictly adhere to foreign key joins (`matched_department_id`).

###  Priority 3: OpenAlex Metadata Enrichment (In-progress scripts)
- Run and finalize faculty disambiguation using [`map_faculty_openalex.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/map_faculty_openalex.py) and [`openalex_audit.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/openalex_audit.py).
- Integrate enriched citation topics and external author identifiers.

###  Priority 4: Auth & Production Hardening
- Transition demo `localStorage` authentication to Supabase Auth / Institutional SSO.
- Finalize production deployment setup using Docker / LAN configuration detailed in [`DEPLOY.md`](file:///e:/RIA_GitHUb/RIA-Dashboard/DEPLOY.md).
