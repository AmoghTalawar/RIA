# RIA Dashboard — Chatbot Backend

> **Research Intelligence Assistant** for KLE Technological University.
> Answers natural-language questions about faculty publications, citations, Q-ranks, and department metrics by querying a live Supabase PostgreSQL database.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [Database Schema](#3-database-schema)
4. [Full Query Workflow](#4-full-query-workflow)
5. [NLP Pipeline](#5-nlp-pipeline)
6. [Intent Router](#6-intent-router)
7. [SQL Tool](#7-sql-tool)
8. [Groq LLM Fallback](#8-groq-llm-fallback)
9. [FastAPI Server](#9-fastapi-server)
10. [Terminal CLI](#10-terminal-cli)
11. [Session & Context Management](#11-session--context-management)
12. [Environment Configuration](#12-environment-configuration)
13. [Supported Query Types](#13-supported-query-types)
14. [Adding New Intents](#14-adding-new-intents)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT INTERFACES                            │
│                                                                     │
│   ┌─────────────────────┐         ┌──────────────────────────┐     │
│   │  React Frontend UI  │         │   Terminal CLI (cli.py)  │     │
│   │  (localhost:5173)   │         │   python3 cli.py         │     │
│   └──────────┬──────────┘         └────────────┬─────────────┘     │
└──────────────┼──────────────────────────────────┼───────────────────┘
               │ HTTP POST /chat                  │ direct call
               ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND PIPELINE                            │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  1. NLP PIPELINE  (nlp_pipeline.py)                           │ │
│  │     • Synonym normalization (dept names, metrics)             │ │
│  │     • Entity extraction  (year, year2, dept, qrank, limit)    │ │
│  │     • Phrasing canonicalization (regex rewrites)              │ │
│  │     • Follow-up / pronoun resolution (session context)        │ │
│  └───────────────────────────┬────────────────────────────────────┘ │
│                              │ normalized query + entities           │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  2. INTENT ROUTER  (intent_router.py)                         │ │
│  │                                                                │ │
│  │   Stage 1 — Regex Matchers (19 intents, ordered):             │ │
│  │     paper_authors / compare_years / best_year / year_trend /  │ │
│  │     year_range / dept_year_count / qrank_distribution /       │ │
│  │     yoy_total / top_faculty / faculty_stats / yearly_count /  │ │
│  │     top_journals / campus_unsupported / bare_name / ...       │ │
│  │                                                                │ │
│  │   Stage 2 — Keyword Fallback (entity-based scoring)           │ │
│  └──────────────┬─────────────────────────┬───────────────────────┘ │
│                 │ MATCH                   │ NO MATCH                │
│                 ▼                         ▼                          │
│  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  3. SQL TOOL            │  │  4. GROQ LLM FALLBACK            │  │
│  │  (sql_tool.py)          │  │  (groq_client.py)                │  │
│  │                         │  │                                  │  │
│  │  execute_sql(query)     │  │  llama-3.1-8b-instant            │  │
│  │  Supabase RPC call      │◄─│  Tool-calling loop (max 6 iters) │  │
│  │  → JSON rows            │  │  → calls execute_sql tool        │  │
│  └─────────────┬───────────┘  └──────────────────────────────────┘  │
│                │                                                     │
│                ▼                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  5. RESPONSE FORMATTER                                         │ │
│  │     Handler formats rows → Markdown reply string               │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE  (PostgreSQL)                            │
│           API:      http://127.0.0.1:54321                          │
│           Studio:   http://127.0.0.1:54323/project/default          │
│                                                                     │
│  Tables:  publications · departments · institutes                   │
│           faculty_publications  (⚠ 84.8% complete only)            │
│  Views:   v_faculty_full · v_institute_summary                      │
│  RPC:     exec_sql(query_text TEXT) → JSONB                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. File Structure

```
backend/
├── cli.py              # Terminal chatbot — interactive + one-shot mode
├── main.py             # FastAPI server — HTTP /chat endpoint
├── nlp_pipeline.py     # Synonym maps, entity extraction, query normalization
├── intent_router.py    # Deterministic SQL handlers for 19 known intents
├── sql_tool.py         # Supabase RPC wrapper + DB schema metadata
├── groq_client.py      # Groq LLM tool-calling loop (LLM fallback)
├── .env                # API keys and config (never commit this)
└── requirements.txt    # Python dependencies
```

---

## 3. Database Schema

```
┌──────────────────────────────────────────────────────────────────────┐
│  publications                                                         │
│  ────────────────────────────────────────────────────────────────    │
│  id UUID PK            pub_id INT             title TEXT             │
│  authors TEXT          home_authors TEXT       author_address TEXT   │
│  year INT              source_publication      article_type          │
│  q_rank_scopus         q_rank_wos              impact_factor         │
│  cite_score            scs_citations           wos_citations_pub     │
│  is_sci BOOL           home_author_department  ← semicolon-sep list  │
│  home_author_institute matched_department      matched_institute     │
│  staff_ria_user_id INT ← ID of the corresponding/submitting author  │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │ (incomplete join — 84.8% only)
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  faculty_publications                                                 │
│  faculty_id UUID FK  ·  publication_id UUID FK                       │
│  ⚠ WARNING: Only 84.8% complete — never COUNT(*) through this table │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  v_faculty_full  (VIEW — pre-aggregated, use for all faculty totals) │
│  ────────────────────────────────────────────────────────────────    │
│  faculty_id        author_name         department_id   department    │
│  institute_id      institute           short_name  ← "CSE","ECE"... │
│  total_pub_count   scopus_citation     scopus_hindex  scopus_q1_count│
│  wos_pub_count     wos_hindex          journal_count  conference_count│
│  avg_citescore     avg_impfactor       wos_q1_count                  │
└──────────────────────────────────────────────────────────────────────┘

┌───────────────────────────┐    ┌───────────────────────────────────┐
│  departments              │    │  institutes                        │
│  id UUID PK               │    │  id UUID PK                        │
│  name TEXT                │    │  name TEXT                         │
│  institute_id UUID FK─────┼───►│  short_name TEXT                  │
└───────────────────────────┘    └───────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  v_institute_summary  (VIEW)                                          │
│  name · short_name · faculty_count · total_publications              │
│  total_scopus_citations · avg_scopus_hindex · total_q1_scopus         │
└──────────────────────────────────────────────────────────────────────┘
```

### Critical Column Rules

| Column | Use for | Warning |
|--------|---------|---------|
| `publications.home_author_department` | Dept-level pub counts | Semicolon-separated; captures ALL depts for co-authored papers |
| `publications.matched_department` | Avoid for counts | Only stores ONE dept per pub — misses co-authored papers |
| `publications.q_rank_scopus` | All Q-rank queries | Always use this, not `q_rank_wos` |
| `v_faculty_full.short_name` | Dept filter in faculty queries | e.g. `"CSE"`, `"ECE"`, `"Mechanical"` |
| `publications.staff_ria_user_id` | Corresponding author lookup | Matches `[id]` tag embedded in `author_address` field |
| `faculty_publications` | Joining faculty to papers | 84.8% complete only — never use for counts |

---

## 4. Full Query Workflow

### Path A — Intent Router (Fast Path, No LLM)

```
User types: "Pubs in 2019 vs 2024 — which year was better?"
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 1 — NLP PIPELINE (nlp_pipeline.py)                         │
│                                                                   │
│  extract_entities(query):                                         │
│    year=2019, year2=2024, dept=None, metric=None, qrank=None     │
│                                                                   │
│  normalize_query(query):                                          │
│    → No phrasing pattern matches → returned unchanged            │
└───────────────────────────────────┬───────────────────────────────┘
                                    │ normalized query + entities
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 2 — INTENT ROUTER Stage 1 (Regex Matchers)                 │
│                                                                   │
│  Tries each matcher on the normalized query, then original:      │
│    ✗ qrank_distribution  → no match                              │
│    ✗ yoy_total           → no match                              │
│    ✗ dept_highest_metric → no match                              │
│    ...                                                            │
│    ✓ compare_years       → MATCH                                 │
│      _m_compare_years() finds two years with "vs"               │
│      returns args = { year1: 2019, year2: 2024 }                │
└───────────────────────────────────┬───────────────────────────────┘
                                    │ args dict
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 3 — HANDLER: _handle_compare_years({year1:2019,year2:2024})│
│                                                                   │
│  Builds SQL:                                                      │
│    SELECT year, COUNT(*)::int AS total,                          │
│      COUNT(*) FILTER (WHERE scs_citations IS NOT NULL) AS scopus,│
│      COUNT(*) FILTER (WHERE wos_citations_pub IS NOT NULL) AS wos,│
│      COUNT(*) FILTER (WHERE is_sci = TRUE) AS sci                │
│    FROM publications                                              │
│    WHERE year IN (2019, 2024)                                    │
│    GROUP BY year ORDER BY year                                   │
└───────────────────────────────────┬───────────────────────────────┘
                                    │ SQL string
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 4 — SQL TOOL (sql_tool.py)                                 │
│                                                                   │
│  execute_sql(sql):                                                │
│    1. Validate: must start with SELECT                           │
│    2. Strip trailing semicolons                                  │
│    3. Print SQL to terminal  [SQL EXECUTED] block                │
│    4. supabase_client.rpc("exec_sql", {"query_text": sql})       │
│    5. Return list of row dicts                                   │
│                                                                   │
│  Result:                                                         │
│    [ {year:2019, total:299, scopus:218, wos:109, sci:34},        │
│      {year:2024, total:412, scopus:305, wos:180, sci:61} ]       │
└───────────────────────────────────┬───────────────────────────────┘
                                    │ rows
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 5 — RESPONSE FORMATTED by handler                          │
│                                                                   │
│  "**2019**: 299 pubs (Scopus: 218, WoS: 109, SCI: 34)           │
│   **2024**: 412 pubs (Scopus: 305, WoS: 180, SCI: 61)           │
│                                                                   │
│   **2024** was better — 113 more publications (37.8% growth)."  │
└───────────────────────────────────────────────────────────────────┘

Total time: ~100–300 ms  (zero LLM calls)
```

---

### Path B — Groq LLM Fallback (Slow Path)

```
User types: "Which faculty published the most papers on deep learning?"
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 1 — NLP PIPELINE                                           │
│  extract_entities → Entities(metric='publications')              │
│  normalize_query  → unchanged (no pattern matches)              │
└───────────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 2 — INTENT ROUTER                                          │
│  Stage 1: All 19 regex matchers → NO MATCH                       │
│  Stage 2: Keyword fallback scoring → NO MATCH                    │
│  route_intent() returns (None, None)                             │
└───────────────────────────────────┬───────────────────────────────┘
                                    │ no match
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 3 — GROQ LLM FALLBACK  (groq_client.py)                   │
│                                                                   │
│  Builds initial messages array:                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ {role:"system", content: SYSTEM_PROMPT + SCHEMA_METADATA}   │ │
│  │ {role:"user",   content: "...session context if any..."}    │ │  
│  │ ...last 6 turns of conversation history...                  │ │
│  │ {role:"user",   content: "Which faculty published..."}      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  GROQ API — ITERATION 1                                          │
│  POST https://api.groq.com/openai/v1/chat/completions           │
│  model:        llama-3.1-8b-instant                             │
│  tool_choice:  "required"  ← must call a tool on first turn     │
│  temperature:  0.1                                              │
│  max_tokens:   350                                              │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼ Groq decides to call execute_sql
┌──────────────────────────────────────────────────────────────────┐
│  GROQ RESPONSE — Tool Call                                       │
│                                                                  │
│  tool_calls: [{                                                  │
│    function: {                                                   │
│      name: "execute_sql",                                       │
│      arguments: {                                               │
│        sql: "SELECT author_name, total_pub_count                │
│              FROM v_faculty_full                                │
│              ORDER BY total_pub_count DESC LIMIT 5"            │
│      }                                                          │
│    }                                                            │
│  }]                                                             │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  execute_sql() called from groq_client                           │
│  → Supabase RPC exec_sql(...)                                   │
│  → Result printed to terminal  [SQL EXECUTED] block             │
│  → Rows truncated to 10 if >10, content capped at 2500 chars   │
│  → [{author_name:"Dr. Patil", total_pub_count:142}, ...]        │
└───────────────────────────┬──────────────────────────────────────┘
                            │ result appended as tool message
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  GROQ API — ITERATION 2                                          │
│  tool_choice: "auto"                                            │
│  Messages now:                                                  │
│    [system, history..., user, assistant(tool_call), tool(result)]│
│                                                                  │
│  Groq reads the SQL result and writes the final text answer.    │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  FINAL RESPONSE (text, no tool_calls)                            │
│  "Dr. Patil has published the most papers with 142 publications."│
└──────────────────────────────────────────────────────────────────┘

Total time: ~1–3 seconds  (1–2 LLM round-trips + 1 SQL call)
Max iterations: 6  (handles multi-step reasoning if Groq chains tools)
```

---

## 5. NLP Pipeline

**File:** `nlp_pipeline.py`

### Processing steps (in order)

```
Raw query string
       │
       ▼ Step 1: resolve_followup()  [only when session context exists]
       │
       │  • Pronoun replacement:
       │    "his citations?" + last_faculty="Sujatha C"
       │    → "Sujatha C citations?"
       │
       │  • Dept pronoun replacement:
       │    "that department's Q1" + last_dept="CSE"
       │    → "CSE Q1"
       │
       │  • Follow-up reconstruction:
       │    "what about ECE?" + last_intent="top_faculty"
       │    → "top 10 faculty in ECE by citations"
       │
       ▼ Step 2: PHRASING_PATTERNS  (regex rewrites, first match wins)
       │
       │  "how many papers were published in 2023"
       │    → "publications in 2023"
       │
       │  "which dept is best in citations"
       │    → "which department has highest citations"
       │
       │  "top researchers in ECE"
       │    → "top 10 faculty in ECE by citations"
       │
       │  "publication growth" / "yoy" / "year over year"
       │    → "total publication count and yoy growth rate"
       │
       │  "which year had most publications"
       │    → "best year for publications"
       │
       │  "papers published in 2022"
       │    → "publications in 2022"
       │
       ▼ Step 3: Department synonym normalization
       │
       │  "computer science" → "CSE"
       │  "mechanical engineering" → "Mechanical"
       │  "electronics and communication" → "ECE"
       │
       ▼ Step 4: Fuzzy dept typo correction  [only if Step 3 found nothing]
       │
       │  "chemiistry" → "Chemistry"   (SequenceMatcher ratio ≥ 0.82)
       │  "mechnical"  → "Mechanical"
       │
       ▼
  Normalized query string  (passed to intent router alongside original)
```

### Entity Extraction (`extract_entities`)

```python
Entities:
  year       → first 20XX number found           e.g. 2023
  year2      → second 20XX (different from year) e.g. 2024  ← comparison queries
  department → longest match from DEPT_SYNONYMS  e.g. "CSE"
  metric     → match from METRIC_SYNONYMS        e.g. "citations"
  qrank      → Q1 / Q2 / Q3 / Q4                e.g. "Q1"
  limit      → number after "top"               e.g. 10
```

### Synonym Maps (sample)

**Departments:**
```
"cs" / "cse" / "comp sci" / "computer science"          →  "CSE"
"ece" / "electronics" / "electronics and communication"  →  "ECE"
"eee" / "electrical" / "electrical and electronics"      →  "EEE"
"mech" / "mechanical" / "mechanical engineering"         →  "Mechanical"
"biotech" / "bt" / "biotechnology"                       →  "Biotech"
"mca" / "master of computer applications"               →  "MCA"
```

**Metrics:**
```
"citation" / "cit" / "cited" / "scopus citations"  →  "citations"
"pub" / "pubs" / "papers" / "articles"             →  "publications"
"h-index" / "hindex" / "hirsch index"              →  "h-index"
"q1" / "q-1" / "quartile 1" / "q1 papers"         →  "Q1"
"impact factor" / "if"                             →  "impact factor"
```

---

## 6. Intent Router

**File:** `intent_router.py`

### Two-Stage Matching

```
Stage 1 — Regex Matchers
  ├─ Tries the NORMALIZED query first
  ├─ Then tries the ORIGINAL query
  ├─ Runs through all 19 matchers in priority order
  └─ First match → calls handler → returns (reply, intent_name)

Stage 2 — Keyword Fallback  (only if Stage 1 finds nothing)
  ├─ Computes boolean feature flags from entities + keywords
  │     has_year / has_year2 / has_dept / has_qrank / has_growth /
  │     has_top / has_list / has_author_ref / has_pub / ...
  ├─ Priority-ordered rules pick an intent + args dict
  └─ Calls the matching handler → returns (reply, intent_name)

If both stages fail → returns (None, None) → Groq LLM is called
```

### All 19 Intents (in priority order)

| # | Intent | Example trigger |
|---|--------|----------------|
| 1 | `qrank_distribution` | "Q-rank distribution in CSE" |
| 2 | `yoy_total` | "total pubs and YoY growth" |
| 3 | `dept_highest_metric` | "which dept has highest H-index?" |
| 4 | `qrank_university` | "how many Q1 papers university-wide?" |
| 5 | `qrank_in_dept` | "Q2 papers in ECE" |
| 6 | `top_faculty` | "top 10 faculty by citations" |
| 7 | `faculty_qrank_year` | "Patil's Q1 papers in 2023" |
| 8 | `faculty_pubs_list` | "list publications by Uma Mudengudi" |
| 9 | `top_journals` | "top 5 journals" |
| 10 | `paper_authors` | "who are the corresponding authors of \<title\>" |
| 11 | `campus_unsupported` | "BVB campus publications" |
| 12 | `compare_years` | "pubs in 2019 vs 2024" |
| 13 | `best_year` | "which year had the most publications?" |
| 14 | `year_trend` | "publications by year" |
| 15 | `year_range` | "publications from 2019 to 2024" |
| 16 | `dept_year_count` | "CSE publications in 2023" |
| 17 | `yearly_count` | "how many pubs in 2022?" |
| 18 | `faculty_stats` | "stats on Patil M R" |
| 19 | `bare_name` | "Sujatha C" (bare name only) |

### Handler Structure (same pattern for all intents)

```python
# Step A: MATCHER — returns args dict if matched, else None
def _m_yearly_count(q: str) -> dict | None:
    m = re.search(
        r"publications?\s+in\s+(\d{4})\s*[.?!]*$", q, re.IGNORECASE
    )
    if m:
        return {"year": int(m.group(1))}
    return None

# Step B: HANDLER — builds SQL, queries DB, formats reply
def _handle_yearly_count(args: dict) -> str | None:
    year = args["year"]
    rows = execute_sql(
        f"SELECT COUNT(*)::int AS total, "
        f"COUNT(*) FILTER (WHERE scs_citations IS NOT NULL)::int AS scopus "
        f"FROM publications WHERE year = {year}"
    )
    err = _fail(rows)   # checks for DB error / empty result
    if err:
        return err
    r = rows[0]
    return f"**{r['total']}** publications in {year} (Scopus: {r['scopus']})."

# Step C: REGISTRATION — order determines priority
INTENTS = [
    ...
    ("yearly_count", _m_yearly_count, _handle_yearly_count),
    ...
]
```

### Faculty Name Resolution (pg_trgm fuzzy match)

```sql
SELECT author_name,
       similarity(author_name, 'patil') AS sim
FROM v_faculty_full
WHERE similarity(author_name, 'patil') > 0.15
   OR author_name ILIKE '%patil%'
ORDER BY sim DESC LIMIT 5
```

| Condition | Decision |
|-----------|---------|
| Only 1 result | Unambiguous → use it |
| Top sim ≥ 0.7 | Unambiguous → use top result |
| Top sim ≥ 0.4 AND leads by ≥ 0.1 | Unambiguous → use top result |
| Multiple close scores | Ambiguous → list all 5, ask "which one?" |

### Corresponding Author Detection

```
author_address field:
  "Khushi M Appannavar, KLE Tech...|Sujatha C [232737], KLE Tech...|..."
                                          ↑
                              staff_ria_user_id = 232737
                              embedded as [id] in the address string

Regex: ([^|]+)\[232737\]  →  extracts "Sujatha C"
```

---

## 7. SQL Tool

**File:** `sql_tool.py`

### execute_sql() Flow

```
execute_sql(sql_string)
       │
       ├─ 1. SECURITY: reject if not SELECT
       │       → returns {"error": "Only SELECT queries allowed"}
       │
       ├─ 2. Strip trailing semicolons
       │       (PostgreSQL EXECUTE inside exec_sql breaks on them)
       │
       ├─ 3. Print to terminal  (if VERBOSE_SQL=1)
       │       ┌─ [SQL EXECUTED] ──────────────────────┐
       │       │ SELECT COUNT(*)::int AS total FROM ... │
       │       └───────────────────────────────────────┘
       │
       ├─ 4. supabase_client.rpc("exec_sql", {"query_text": sql}).execute()
       │       Supabase URL: http://127.0.0.1:54321
       │       The exec_sql stored procedure runs EXECUTE inside PL/pgSQL
       │
       ├─ 5. Return resp.data → list of row dicts
       │       [{"col1": val1, "col2": val2, ...}, ...]
       │
       └─ Error handling:
               Connection refused / network error
                 → {"unavailable": True, "error": message}
               SQL error (bad syntax, unknown column, etc.)
                 → {"error": message}
```

### Department Filter Patterns

```python
# For v_faculty_full (faculty queries) — broad 3-column match:
WHERE (short_name ILIKE '%CSE%'
    OR department ILIKE '%CSE%'
    OR institute ILIKE '%CSE%')

# For publications (dept-level counts) — use home_author_department:
WHERE home_author_department ILIKE '%Computer Science and Engineering%'
# ✓ Semicolon-separated — captures ALL departments for co-authored papers
# ✗ Never use matched_department — single value, misses co-authorship
```

---

## 8. Groq LLM Fallback

**File:** `groq_client.py`

### When the LLM is used

```
Only when intent_router.route_intent() returns (None, None)
i.e., no regex AND no keyword pattern matched the query.

Also always used when:
  - Frontend sends chart_title in the request
    (chart-scoped mode — LLM scopes answer to that chart)
```

### Full Tool-Calling Loop

```
call_groq(user_message, api_key, chart_title, history, context_prompt)
       │
       │  Build messages:
       │  [ system_prompt,
       │    ...history (last 6 turns)...,
       │    user_message ]
       │
       ▼
   ┌────────────────────────────────────────────────────────────┐
   │  for iteration in range(MAX_ITERATIONS=6):                 │
   │                                                            │
   │    POST to Groq API                                        │
   │    body = {                                                │
   │      model: "llama-3.1-8b-instant",                       │
   │      messages: [...],                                      │
   │      temperature: 0.1,                                     │
   │      max_tokens: 350,                                      │
   │      tools: [execute_sql tool definition],                 │
   │      tool_choice: "required" (iter 1) / "auto" (iter 2+)  │
   │    }                                                       │
   │                                                            │
   │    response = Groq API response                           │
   │                                                            │
   │    if response has tool_calls:                             │
   │      for each tool_call:                                   │
   │        sql = tool_call.function.arguments.sql              │
   │        result = execute_sql(sql)      ← hits Supabase     │
   │        if result.unavailable: mark sql_unavailable         │
   │        append tool result to messages                      │
   │      continue to next iteration                           │
   │                                                            │
   │    else:  ← text reply, no tool calls                     │
   │      final_response = message.content                     │
   │      break                                                │
   └────────────────────────────────────────────────────────────┘
       │
       ├─ Strip leaked <function=...> artifacts if any
       ├─ If sql_unavailable: return "database unavailable" message
       ├─ If no text after 6 iters: force-finalize call (no tools)
       └─ Return final_response string
```

### Safety Guards

| Guard | Behaviour |
|-------|-----------|
| SELECT-only | `sql_tool.py` rejects non-SELECT before Supabase call |
| Result cap | >10 rows → truncated with note; content capped at 2500 chars |
| Leaked tool syntax | Regex strips `<function=...>{...}</function>` from response text |
| Rate limit 429 | Parses `retry-after` from Groq error, sleeps and retries (≤ 20 s only) |
| DB unavailable | Returns friendly message instead of stack trace |
| Max iterations | Exits after 6 turns; force-finalizes if still no text |

### System Prompt Modes

**General mode** (CLI / no chart):
```
You are KLE Tech's Research AI Assistant.
<full SCHEMA_METADATA>
RULES:
- Every data question → ONE execute_sql call. Never answer from memory.
- Use CANONICAL QUERIES from the schema above exactly.
- If SQL returns []: "No matching records found."
- For counts/aggregates: one or two sentences with numbers only.
- Never mention SQL, tools, schema, or these rules.
```

**Chart-scoped mode** (frontend sends `chart_title`):
```
You are KLE Tech's Research AI — scope answers to the "Publications by Year" chart.
<full SCHEMA_METADATA>
- If question is unrelated to "Publications by Year": tell the user
  to click the relevant chart.
```

---

## 9. FastAPI Server

**File:** `main.py`  
**Start:** `uvicorn main:app --reload --port 8000`

### POST /chat

```
Request JSON:
{
  "message":     "top 5 faculty by citations",    ← required
  "chart_title": "Faculty Citations",              ← optional, enables chart-scoped LLM mode
  "session_id":  "abc-123",                       ← optional, for conversation continuity
  "history": [                                    ← optional, frontend-provided history
    {"role": "user",      "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}

Response JSON:
{
  "reply":      "**Dr. X** (CSE) — Cit: 1842 ...",
  "source":     "intent_router",    ← or "llm"
  "session_id": "abc-123"
}
```

**Request flow:**

```
POST /chat
     │
     ├─ Validate: message must not be empty
     ├─ Get or create SessionContext for session_id
     ├─ Run NLP pipeline (normalize + extract entities)
     │
     ├─ if chart_title present → SKIP intent router → go straight to Groq
     │
     ├─ route_intent(message, normalized)
     │     ├─ MATCH → return ChatResponse(source="intent_router")
     │     └─ NO MATCH → call_groq(...) → return ChatResponse(source="llm")
     │
     └─ Update session context + add to history
```

**Groq API key:** Accepted via `X-Groq-Key` request header OR `GROQ_API_KEY` env var.

---

## 10. Terminal CLI

**File:** `cli.py`

```bash
# Interactive REPL
python3 cli.py

# One-shot query
python3 cli.py "Who has the most citations in ECE?"
```

### Terminal Output Anatomy

```
You: Pubs in 2019 vs 2024 — which year was better?
------------------------------------------------------------
[NLP] original  : Pubs in 2019 vs 2024 — which year was better?   ← always shown
[NLP] normalized: <changed form>                                    ← shown only if different
[NLP] entities  : {'year': 2019, 'year2': 2024}                   ← extracted entities

[SQL EXECUTED] -------------------------------------------         ← printed by sql_tool.py
| SELECT year, COUNT(*)::int AS total, ...                         ← actual SQL sent to DB
| FROM publications WHERE year IN (2019, 2024) ...
---------------------------------------------------------
[OK] 2 row(s) returned                                             ← row count

[router] matched intent: compare_years                             ← which intent fired

RIA:
**2019**: 299 pubs (Scopus: 218, WoS: 109, SCI: 34)
**2024**: 412 pubs (Scopus: 305, WoS: 180, SCI: 61)

**2024** was better with 113 more publications (37.8% growth).
------------------------------------------------------------
```

When LLM fallback is used:
```
[router] no direct match, delegating to LLM...     ← Groq will be called

[SQL EXECUTED] -------------------------------------------         ← Groq chose this SQL
| SELECT author_name, total_pub_count FROM v_faculty_full ...
---------------------------------------------------------
[OK] 5 row(s) returned
```

---

## 11. Session & Context Management

```python
SessionContext:
  last_department  →  e.g. "CSE"
  last_faculty     →  e.g. "Sujatha C"
  last_year        →  e.g. 2023
  last_metric      →  e.g. "citations"
  last_intent      →  e.g. "faculty_stats"
  history          →  last 10 turns (5 exchanges)
```

### Follow-up Resolution Examples

```
Turn 1: "stats on Sujatha C"
         last_faculty="Sujatha C", last_intent="faculty_stats"

Turn 2: "what about her Q1 papers?"
         PRONOUN_REFS matches "her" → replaced with "Sujatha C"
         → "what about Sujatha C Q1 papers?"
         → routes to faculty_qrank_year
─────────────────────────────────────────────────────────────
Turn 1: "top faculty in CSE by citations"
         last_department="CSE", last_intent="top_faculty"

Turn 2: "same for ECE"
         FOLLOWUP_PATTERNS matches "same for ECE"
         _normalize_dept("ECE") → "ECE"
         _reconstruct_query("top_faculty", dept="ECE")
         → "top 10 faculty in ECE by citations"
─────────────────────────────────────────────────────────────
Turn 1: "Q1 pubs in ECE"
         last_department="ECE", last_intent="qrank_in_dept"

Turn 2: "what about that department's Q2?"
         DEPT_PRONOUN_REFS matches "that department"
         → replaced with "ECE"
         → routes to qrank_in_dept with dept="ECE", qrank="Q2"
```

---

## 12. Environment Configuration

**File:** `backend/.env`

```env
# Groq (LLM fallback)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant      # optional, this is the default

# Supabase (local instance)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGci...

# Server
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Debugging
VERBOSE_SQL=1      # print every SQL query to terminal (cli.py sets this automatically)
LOG_LEVEL=INFO     # FastAPI log level
```

---

## 13. Supported Query Types

### Handled by Intent Router (no LLM, fast)

```
FACULTY
  "stats on Patil M R"
  "Sujatha C"                                   ← bare name
  "who has the highest citations in CSE?"
  "top 10 faculty by h-index"
  "top 5 researchers in ECE by publications"
  "list publications by Uma Mudengudi"
  "Uma Mudengudi's Q1 papers in 2023"
  "how many pubs does Sujatha C have?"

PUBLICATIONS — YEAR
  "how many pubs in 2022?"
  "publications in 2024"
  "pubs in 2019 vs 2024 — which was better?"
  "compare 2020 and 2023"
  "2021 vs 2023 research output"
  "publications from 2019 to 2024"
  "publications by year"
  "which year had the most publications?"
  "total pubs and YoY growth"
  "CSE publications in 2023"

Q-RANKS
  "how many Q1 papers university-wide?"
  "Q2 papers in ECE"
  "Q-rank distribution in CSE"
  "Q-rank distribution across the university"

DEPARTMENTS
  "which department has highest H-index?"
  "which department has the most Q1 publications?"
  "which dept has highest citations?"

JOURNALS
  "top 5 journals"
  "which journal do we publish in most?"
  "most frequently published journal"

PAPERS
  "who are the authors of Query-Based Sign Spotting..."
  "who are the corresponding authors of <paper title>"
  "who wrote <paper title>"
  "corresponding author of <paper title>"
```

### Handled by Groq LLM (flexible, ~1–3 s)

Any query that does not match an intent — e.g.:

```
"Which faculty published on deep learning topics?"
"Compare ECE and CSE citation impact"
"What is the average impact factor of Biotech publications?"
"Who collaborated most with faculty outside their department?"
"List all SCI papers from 2023 in CSE"
```

---

## 14. Adding New Intents

To handle a new query type without the LLM:

**Step 1 — Write the matcher** in `intent_router.py`:
```python
def _m_my_intent(q: str) -> dict | None:
    m = re.search(r"my pattern (\w+)", q, re.IGNORECASE)
    if m:
        return {"key": _clean(m.group(1))}
    return None
```

**Step 2 — Write the handler:**
```python
def _handle_my_intent(args: dict) -> str | None:
    rows = execute_sql(f"SELECT ... WHERE col = '{_esc(args['key'])}'")
    err = _fail(rows)   # handles DB down / no results automatically
    if err:
        return err
    return f"Result: **{rows[0]['value']}**"
```

**Step 3 — Register in INTENTS** (position = priority):
```python
INTENTS = [
    ...
    ("my_intent", _m_my_intent, _handle_my_intent),
    ...
]
```

**Step 4 — Add a phrasing pattern** (optional, `nlp_pipeline.py`):
```python
PHRASING_PATTERNS = [
    ...
    (re.compile(r"alternate phrasing for (.+)", re.I), r"canonical form \1"),
]
```

**Step 5 — Add keyword fallback** (optional, `_keyword_fallback()` in `intent_router.py`):
```python
# Add a flag
has_my_keyword = bool(re.search(r"\bmy_keyword\b", q_lower))

# Add a rule (priority-ordered)
if has_my_keyword and has_dept:
    return "my_intent", {"key": entities.department}
```

---

*Built for KLE Technological University — Research Intelligence Assistant (RIA)*
