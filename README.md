# RIA Dashboard — Research Intelligence Agent

Role-based research analytics platform for KLE Technological University. Provides hierarchical dashboards for Faculty, HoD, Faculty Dean, Executive Dean, and Vice Chancellor — each tailored to the user's decision-making scope.

All data is fetched through a Python backend that queries a self-hosted Supabase instance (`ria` schema). Supabase credentials are server-side only — no keys in the browser.

---

## Quick Start

### 1 — Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
# copy backend/.env.example → backend/.env and fill in credentials
python main.py        # binds to 0.0.0.0:8000 — accessible on LAN
```

> **Important:** run via `python main.py`, not `uvicorn main:app` directly.
> The `__main__` block reads `HOST` and `PORT` from `backend/.env` and binds to `0.0.0.0`.
> Running uvicorn directly skips this and defaults to `127.0.0.1` (localhost only).

`backend/.env` (required):

```env
SUPABASE_URL=http://<your-server-ip>:8000
SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt>
GROQ_API_KEY=<groq_api_key>
HOST=0.0.0.0
PORT=8000
```

### 2 — Frontend (React + Vite)

```bash
npm install
npm run dev          # http://localhost:5173/
```

Frontend `.env` (project root):

```env
VITE_RIA_BACKEND_URL=http://<your-server-ip>:8000
VITE_CHAT_API_URL=http://<your-server-ip>:8000
```

### Demo Accounts

| Username | Password | Role | Dashboard |
|----------|----------|------|-----------|
| `staff` | `staff123` | Faculty | /staff |
| `hod` | `hod123` | Head of Department | /department |
| `facultydean` | `fdean123` | Faculty Dean | /faculty-dean |
| `executivedean` | `edean123` | Executive Dean | /executive-dean |
| `dean` | `dean123` | Vice Chancellor | /university |

Authentication uses localStorage with hardcoded demo accounts — it does **not** use Supabase Auth.

---

## Architecture

```
Browser (React)
    │
    │  fetch()  — no Supabase keys in browser
    ▼
Python Backend  (FastAPI, port 8000, binds 0.0.0.0)
    │  backend/.env  →  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + GROQ_API_KEY
    │
    ├── GET  /api/publications          →  ria.publications     (6,516 rows, paginated)
    ├── GET  /api/faculty               →  ria.v_faculty_full   (739 rows)
    ├── GET  /api/faculty?department=X  →  filtered + ordered by citations
    ├── GET  /api/institutes            →  ria.v_institute_summary
    ├── POST /api/sql                   →  exec_sql() RPC  (read-only SQL queries)
    ├── POST /chat                      →  slim router → 6-tool RIA agent → Groq LLM
    └── POST /api/pub-chat              →  6-tool RIA agent (Publication Explorer chat)
    │
    ▼
Supabase  (PostgreSQL 15+, ria schema)
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **UI Framework** | React | 19.2.0 |
| **Build Tool** | Vite | 7.3.1 |
| **Routing** | React Router DOM | 7.1.0 |
| **Styling** | Tailwind CSS | 3.4.17 |
| **Charts** | Recharts + Plotly.js | 2.15.0 / 3.4.0 |
| **Animations** | Framer Motion | 11.15.0 |
| **Icons** | Lucide React | 0.468.0 |
| **Backend** | FastAPI + Uvicorn | 0.111+ |
| **Database client** | supabase-py | 2.4+ |
| **Database** | Supabase (PostgreSQL 15+) | — |
| **AI Chat** | Groq API (Llama 3.1) | — |

---

## Project Structure

```
RIA-Dashboard-1/
├── backend/                       # Python FastAPI backend
│   ├── main.py                    # FastAPI app — data endpoints + /chat + /api/pub-chat
│   ├── ria_agent.py               # Async 6-tool RIA agent (replaces groq_client.py)
│   ├── ria_tools_groq.py          # 6 tool implementations + RIA_SYSTEM_PROMPT
│   ├── sql_tool.py                # execute_sql() via exec_sql RPC + schema metadata
│   ├── intent_router.py           # Slim router: 7 intents (year queries, paper authors, campus guard)
│   ├── requirements.txt
│   ├── .env                       # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, HOST, PORT
│   └── .env.example
│
├── src/
│   ├── App.jsx                    # Routing setup (React Router v7)
│   ├── main.jsx                   # React entry point
│   │
│   ├── auth/
│   │   ├── AuthContext.jsx        # Auth state (localStorage, 5 demo roles)
│   │   └── ProtectedRoute.jsx     # Role-based route guard
│   │
│   ├── lib/
│   │   └── supabaseQueries.js     # fetch() wrappers → backend /api/* endpoints
│   │
│   ├── tools/
│   │   └── sqlTool.js             # executeSql() → POST /api/sql  (AI chatbot)
│   │
│   ├── data/
│   │   ├── excelDataLoader.js     # Calls supabaseQueries, aggregates KPIs
│   │   └── mockData.js            # Static fallback (NIRF, PhD pipeline, targets)
│   │
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── StaffDashboard.jsx     # Individual faculty metrics
│   │   ├── HodDashboard.jsx       # Faculty summary table
│   │   ├── FacultyDeanDashboard.jsx
│   │   ├── ExecutiveDeanDashboard.jsx
│   │   ├── UniversityDeanDashboard.jsx  # VC-level (5 tabs + AI chatbot)
│   │   ├── PublicationExplorer.jsx      # Full publication browser + AI chat
│   │   └── department/
│   │       ├── DeptLayout.jsx     # Fetches CSE faculty once, distributes via context
│   │       ├── DeptOverview.jsx
│   │       ├── DeptResearchOutcomes.jsx
│   │       ├── DeptFacultyData.jsx
│   │       ├── DeptScores.jsx
│   │       └── DeptFacultyList.jsx
│   │
│   └── components/                # 27 reusable components
│       ├── PublicationListView.jsx
│       └── PublicationDetailView.jsx
│
├── supabase/
│   ├── README.md                  # Database setup and deploy guide
│   ├── config.toml                # Supabase CLI / Docker schema exposure config
│   ├── migrations/
│   │   ├── 20250101000000_initial_schema.sql   # Tables, indexes, views, RLS
│   │   ├── 20250101000001_exec_sql_rpc.sql     # exec_sql() RPC for AI chatbot
│   │   └── 20250101000002_anon_read_policies.sql
│   ├── db.sql                     # Standalone schema snapshot
│   └── populate_department_fks.sql
│
├── src/assets/
│   ├── import_faculty.py          # Imports 739 faculty rows → Supabase
│   ├── import_publications.py     # Imports 6,516 publications → Supabase
│   └── .env.example               # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
│
├── .env                           # VITE_RIA_BACKEND_URL (frontend only)
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## Components (27 total)

### Charts (10)
| Component | Type | Used For |
|-----------|------|---------|
| `DonutChart` | Pie/Donut | Q-rank distribution, category breakdown |
| `NestedDonutChart` | Multi-ring | Nested category breakdown |
| `StackedBarChart` | Stacked vertical | Publications by year + quartile |
| `SimpleBarChart` | Vertical bars | Department comparisons |
| `HorizontalBarChart` | Horizontal ranked | Faculty rankings |
| `MultiLineChart` | Multi-line | Citation trends (Scopus/WoS/GS) |
| `RadarChart` | Spider | Multi-metric comparison |
| `ScatterPlot` | Scatter | Impact factor vs citations |
| `SemiCircleGauge` | Gauge | Target progress |
| `StatGauge` | Numeric gauge | KPI progress |

### Data Display (6)
| Component | Purpose |
|-----------|---------|
| `KPICard` | Metric card with delta/trend indicator |
| `DataTable` | Sortable, filterable generic table |
| `TargetProgressCard` | Budget target vs actual progress |
| `FacultyScoreCard` | Faculty classification display |
| `CategoryScoreBand` | Score band visualization (SRG/ERG/ERS/R1–R4) |
| `ParameterScoreTable` | Faculty metrics vs department average |

### Panels (6)
| Component | Purpose |
|-----------|---------|
| `AIChatbot` | Groq-powered Q&A — routes through 6-tool RIA agent |
| `AIInsightsPanel` | Auto-generated narrative insights |
| `PublicationListView` | Searchable publication list with filters |
| `PublicationDetailView` | Publication detail modal |
| `FundedProjectsPanel` | Research project tracking |
| `PhDTrackingPanel` | PhD scholar supervision tracking |

### Layout (5)
`Layout.jsx` · `Sidebar.jsx` · `Topbar.jsx` · `BreadcrumbNavigation.jsx` · `AlertNotificationCenter.jsx`

---

## Dashboard Hierarchy

```
Vice Chancellor (/university)
  5 tabs: Overview | Trends | Research Landscape | Funding & PhD | Benchmarks
  AI Chatbot, Publication Explorer, NIRF tracking
      │
Executive Dean (/executive-dean)
  Campus-level aggregations, inter-campus comparison
      │
Faculty Dean (/faculty-dean)
  Multi-department oversight, department rankings
      │
Head of Department (/department)
  Department KPIs, faculty categories, research outcomes
  Sub-pages: Overview | Research | Faculty Data | Scores | Faculty List
      │
Faculty (/staff)
  Personal metrics, publication list, citation trends, score card
```

---

## Routes

```
/login                     Public — demo account selector
/                          Redirects to role-specific dashboard
/staff                     Faculty dashboard
/department                HoD shell with nested sub-pages:
  /department/             Overview
  /department/research     Research Outcomes
  /department/faculty      Faculty Data
  /department/scores       Score Bands
  /department/faculty-list Faculty List (sortable, filterable, paginated)
/faculty-dean              Faculty Dean dashboard
/executive-dean            Executive Dean dashboard
/university                VC dashboard (publications + AI chatbot)
```

---

## Data Sources

| Source | Records | Backend endpoint |
|--------|---------|-----------------|
| `ria.publications` | 6,516 publications | `GET /api/publications` |
| `ria.v_faculty_full` | 739 faculty | `GET /api/faculty` |
| `ria.v_faculty_full` filtered | per-department | `GET /api/faculty?department=X` |
| `ria.v_institute_summary` | 18 institutes | `GET /api/institutes` |
| `mockData.js` | NIRF trajectory, PhD pipeline, funding, benchmarks | Static — not yet in DB |

All data fetching goes through `src/lib/supabaseQueries.js` → `fetch()` → FastAPI backend.
Publications are paginated server-side (1,000-row pages) and returned as a single array.

---

## Database Schema

See **`supabase/README.md`** for the full deploy guide.

6 tables with Row Level Security in the `ria` PostgreSQL schema:

```
institutes (18)  ──┐
                   └── departments (36)  ──┐
                                           └── faculty (739)
                                                   │
profiles (auth bridge) ────────────────────────────┘
                                                   │
                                    faculty_publications (M:N)
                                                   │
                                         publications (6,516)
```

3 read-only views:

| View | Purpose |
|------|---------|
| `v_faculty_full` | Faculty + department + institute + role |
| `v_pub_faculty` | Publications joined with linked faculty |
| `v_institute_summary` | Per-institute aggregate metrics |

---

## AI Chatbot

Both the VC dashboard chatbot (`/chat`) and Publication Explorer chatbot (`/api/pub-chat`) route through the same pipeline:

```
User query
  → Slim intent router (7 intents — zero LLM cost)
      year queries, paper authors, campus guard → SQL → reply
      no match ↓
  → RIA Agent (ria_agent.py)
      iter 0: tool_choice=required → LLM picks one of 6 tools
        ├── get_faculty_stats          per-person metrics, h-index, Q-rank
        ├── get_department_stats       dept aggregate + top faculty
        ├── count_qrank_publications   Q1/Q2/Q3/Q4 counts
        ├── search_publications_by_author  paper titles + metadata
        ├── compare_entities           dept/faculty rankings & comparisons
        └── get_yearly_stats           year count + YoY growth
      tool runs in thread pool (sync Supabase → async FastAPI)
      iter 1: tool_choice=none → LLM answers from tool result
  → Formatted Markdown reply
```

Key files: `backend/main.py`, `backend/ria_agent.py`, `backend/ria_tools_groq.py`, `backend/intent_router.py`, `backend/sql_tool.py`.
Only `SELECT` and `WITH` queries are permitted by the RPC guard.

---

## RIA Scoring System

Faculty are classified using a derived composite score (computed in frontend, not stored in DB):

| Metric | Weight |
|--------|--------|
| `total_pub_count` | ×2 |
| `scopus_hindex` | ×5 |
| `scopus_citation` | ÷50 |
| `scopus_q1_count` | ×3 |

Score is normalized 0–100 relative to the highest scorer in the group.

**Bands:** R1 (≥75) · R2 (≥50) · R3 (≥25) · R4 (<25)

**Categories:**

| Category | Threshold |
|----------|-----------|
| SRG (Senior Research Guide) | pubs ≥20, h-index ≥10, citations ≥200 |
| ERG (Emerging Research Guide) | pubs ≥10, h-index ≥5 |
| ERGWS | pubs ≥5, h-index ≥3 |
| ERS (Evolving Research Scholar) | pubs ≥2 |
| IREF | pubs ≥1 |
| Pre-IREF | pubs = 0 |

---

## Design System

### Colors
- **Primary**: KLE Crimson `#B91C1C`
- **Accents**: Teal `#0F766E`, Gold `#B45309`, Indigo `#3730A3`
- **Neutrals**: `kle-dark`, graphite, smoke, ash, mist, fog

### Typography
- **Display**: EB Garamond (serif)
- **Headings**: DM Sans
- **Body**: Inter
- **Monospace**: JetBrains Mono

---

## Build

```bash
# Backend (must use python main.py — not uvicorn directly)
cd backend && python main.py     # → http://0.0.0.0:8000

# Frontend (separate terminal)
npm install
npm run dev        # → http://localhost:5173
npm run build      # → /dist
npm run preview
npm run lint
```

---

## OpenAlex Integration

Enriches faculty data with live OpenAlex author IDs, h-index, and works count.
KLETech institution ID on OpenAlex: `I3132975163`

### Scripts

| Script | Purpose |
|--------|---------|
| `openalex_audit.py` | Fetch all KLETech works from OpenAlex, compare with Scopus export |
| `map_faculty_openalex.py` | Map 739 faculty names → OpenAlex author IDs |
| `export_openalex_seed.py` | Export HIGH-confidence mappings as seed SQL for intern dev DBs |
| `apply_review_corrections.py` | Apply dept-reviewed LOW-confidence corrections to Supabase |

### Schema (run migration first)

```sql
-- supabase/migrations/20260511000000_add_openalex_columns.sql
ALTER TABLE ria.faculty
  ADD COLUMN IF NOT EXISTS openalex_author_id   TEXT,
  ADD COLUMN IF NOT EXISTS openalex_hindex      INTEGER,
  ADD COLUMN IF NOT EXISTS openalex_works_count INTEGER,
  ADD COLUMN IF NOT EXISTS openalex_confidence  TEXT;
```

### Confidence levels

| Value | Meaning |
|-------|---------|
| `HIGH` | Exactly 1 OpenAlex match with institution filter — pre-marked Y in review CSV |
| `REVIEWED` | Dept head confirmed correct candidate — trusted |
| `LOW` | Multiple candidates or fallback name match — pending review |
| `NOT_FOUND` | No OpenAlex match found |

> **No data is pushed automatically.** All mappings — including HIGH — go through manual
> review via `openalex_review.csv` before anything touches Supabase.

### Full workflow

```bash
# Step 1 — run mapping (reads faculty from Supabase, calls OpenAlex API)
cd RIA-Dashboard-1
python map_faculty_openalex.py --limit 20   # test with first 20 rows
python map_faculty_openalex.py              # full run — writes review files only

# Step 2 — review files generated automatically:
#
#   openalex_review.csv     — HIGH + LOW combined (share with dept heads)
#     HIGH rows: correct_choice pre-filled "Y" — remove Y if the match looks wrong
#     LOW  rows: correct_choice blank          — mark Y on the correct candidate
#     Columns: ria_user_id | faculty_name | department | confidence | reason |
#              candidate_rank | openalex_id | openalex_name | works_count |
#              h_index | openalex_url | correct_choice
#
#   openalex_not_found.csv  — NO match at all (sorted by department)
#     Columns: ria_user_id | faculty_name | department | note | manual_openalex_id
#     → Share with concerned person; they paste the OpenAlex author ID manually
#       (find it at https://openalex.org/authors?search=<name>)

# Step 3 — apply reviewed corrections (works for both files)
python apply_review_corrections.py                              # dry-run
python apply_review_corrections.py --push                       # review CSV
python apply_review_corrections.py --file openalex_not_found.csv --push  # not-found CSV

# Step 4 — generate seed SQL for intern dev instances (HIGH-confidence only)
python export_openalex_seed.py
# → supabase/seeds/openalex_faculty_mapping.sql  (idempotent upsert)
```

### Resume after interruption

```bash
python map_faculty_openalex.py --resume   # skips already-mapped rows
```

### Audit results (2026-05-11)

| Metric | Count |
|--------|------:|
| OpenAlex total works for KLETech | 5,992 |
| Matched with Scopus export | 4,410 |
| In OpenAlex NOT in Scopus | 1,531 |
| In Scopus NOT in OpenAlex | 1,050 |

---

## Current Status

### Working
- All 5 role-based dashboards fetching live data via FastAPI backend
- Supabase credentials server-side only — no keys exposed in the browser
- `publications` and `faculty` fully imported (6,516 + 739 rows)
- Department faculty list, overview, and HoD table all live from `ria` schema
- AI chatbot: slim 7-intent router (zero LLM cost) → 6-tool RIA agent → Groq LLM
- Publication Explorer chatbot scoped to focused department/filter when drilling down
- Chatbot UX: always-visible quick actions, Trash2 context clear, sessionStorage session ID
- Backend binds to `0.0.0.0:8000` — accessible across LAN (start via `python main.py`)
- Pagination across 6,516 publications handled server-side
- 27 reusable chart and panel components with Framer Motion animations

### Not Yet Wired
- `faculty_publications` junction table only 84.8% populated (STAFF USER ID absent for ~991 rows)
- Staff (/staff) dashboard still uses `mockData.js`
- Faculty Dean and Executive Dean dashboards still use `mockData.js`
- NIRF trajectory, PhD pipeline, and funding portfolio remain static in `mockData.js`
- No Supabase Auth — authentication is localStorage demo accounts only

<!-- setup guide: see SETUP_NEW_MACHINE.md -->
