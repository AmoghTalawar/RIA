# RIA Chatbot — Complete Backend Analysis

> How a query travels from browser → auth → persona → LLM → tool → scope → SQL → response.

---

## 1. The Complete Pipeline at a Glance

```
Browser (React)
    │  POST /chat  {message, session_id, history}
    │  Authorization: Bearer <JWT>
    ▼
main.py  (FastAPI entry point)
    ├─ get_scope()            ← verifies JWT; returns frozen Scope object
    ├─ normalize_query()      ← NLP cleanup (abbrev expansion)
    ├─ route_intent()         ← Fast regex path: 0 LLM tokens for simple queries
    │    (no match?)
    └─ call_ria_agent()       ← LLM + tool-calling pipeline
           │
           ├─ get_persona()       ← tone / voice selection (Layer 1)
           ├─ filter_tools()      ← hides tools not allowed for this persona (Layer 2)
           ├─ build messages[]
           │
           ▼  [up to 3 iterations]
       Groq / OpenRouter LLM
           │
           ├─ No tool call → final text reply
           └─ tool_calls: [{name, args}]
                │
                ▼
           scope_guard.authorize()
                ├─ Is the tool allowed for this persona?
                ├─ sanitize_args()    ← strip any trusted fields the model sneaked in
                ├─ _RULES[fn]()       ← per-tool per-persona decision
                └─ inject trusted kwargs (ria_user_id, scope_departments, include_names…)
                         │ allowed
                         ▼
                 ria_tools_groq.py  (tool Python function)
                         │  builds SQL with guard's args (not model's)
                         ▼
                 sql_tool.execute_sql()
                         ├─ Rejects non-SELECT
                         └─ Supabase RPC exec_sql → Postgres
                                  │ JSON rows
                                  ▼
                 Result fed back as role:"tool" message
                 → LLM produces final natural-language reply
                         │
                         ▼
                 ChatResponse { reply, source:"llm", persona_id }
```

---

## 2. Step-by-Step: Every Stage Explained

### Stage 1 — HTTP Request Arrives at `main.py`

- Browser POSTs to `/chat` with `{message, session_id, history}` and `Authorization: Bearer <JWT>`.
- FastAPI's `Depends(get_scope)` runs **before a single line of handler code executes**.
- If the JWT is missing/expired/invalid → **401 immediately**, no handler runs.
- Files: [`main.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/main.py)

---

### Stage 2 — `auth_scope.get_scope()`: Identity from JWT

**File:** [`auth_scope.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/auth_scope.py)

```
JWT  →  auth.get_user(token)       (GoTrue validates signature + expiry)
      →  ria.profiles (service role)   (role, dean_type, department, institute, faculty)
      →  Scope  (frozen dataclass)
```

The [`Scope`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/auth_scope.py#L66-L91) object contains:

| Field | Meaning |
|---|---|
| `user_id` | Supabase auth UUID |
| `role_level` | `Faculty` / `HoD` / `Dean` / `VC` / `Admin` |
| `dean_type` | `faculty_dean` / `executive_dean` / `None` |
| **`persona_id`** | `faculty` / `hod` / `faculty_dean` / `executive_dean` / `vice_chancellor` |
| `ria_user_id` | FK into the faculty research table (the real DB person ID) |
| `department_id` / `department_name` | The caller's own department |
| `institute_id` / `institute_name` | The caller's own school/institute |
| `full_name` / `author_name` | Display name and name on the research roster |

> [!IMPORTANT]
> **Nothing from the request body is trusted for identity.** `role_level`, `dean_scope`, `user_context` from the client are all ignored. Only the JWT + the `profiles` DB row matter.

The `Scope` is **cached 60 seconds per token** to avoid hitting Supabase on every message.

---

### Stage 3 — Intent Router Fast Path (Zero LLM Tokens)

**File:** [`intent_router.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/intent_router.py)  
**Pre-processing:** [`nlp_pipeline.normalize_query()`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/nlp_pipeline.py) — expands abbreviations (e.g. `"cse"` → `"Computer Science and Engineering"`)

The router checks **7 regex matchers** in order:

| Matcher | Triggers On | LLM Tokens |
|---|---|---|
| `campus_unsupported` | "BVB campus" / "campus-wise" | 0 (reject message) |
| `compare_years` | Two different years + comparison wording | **0** |
| `best_year` | "best / peak year for publications" | **0** |
| `year_trend` | "publications by year / per year" | **0** |
| `year_range` | "2020 to 2024" style range | **0** |
| `yearly_count` | "how many publications in `<year>`" | **0** |
| `paper_authors` | "who wrote / authored `<title>`" | **0** |

**Critical limitation:** The intent router has **no concept of Q-rank, department, or "my"/"me"**. The moment a query needs persona-scoped or per-person data, all 7 matchers fail and it falls through to the full LLM pipeline. The intent router directly calls `execute_sql()` — **unscoped** — which is safe only because none of its 7 handlers ever touch per-person or per-department rows.

---

### Stage 4 — `ria_agent.call_ria_agent()`: Core Agent Loop

**File:** [`ria_agent.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_agent.py)

#### 4a. Persona Resolution (Layer 1 — Voice/Tone only)

```python
persona = get_persona(role_level=scope.role_level, dean_scope=scope.dean_scope)
```

Maps the DB role to one of 5 persona dicts — these control **how RIA talks**, not what data it can access:

| Persona | Tone |
|---|---|
| `faculty` | "Encouraging personal mentor" — uses "you"/"your", never names colleagues |
| `hod` | Departmental manager voice |
| `faculty_dean` | School-level strategic view |
| `executive_dean` | University-wide advisor |
| `vice_chancellor` | Board-level strategic advisor |

> [!WARNING]
> **Persona is NOT a security boundary.** The persona dict's `scope_filter` field is documentation only — nothing in `ria_agent.py` reads it to build SQL. Security is `scope_guard.py` (Layer 2).

#### 4b. Tool Filtering (Layer 2 — First Security Gate)

```python
tools = filter_tools(TOOLS, scope, user_message)
```

From `scope_guard.py`, this returns only the **tool schemas the model is allowed to see**. Tools not in the list are literally invisible to the LLM — it cannot name a tool it was never shown.

| Persona | Tools Visible |
|---|---|
| `faculty` | 11 tools (own profile, aggregates, no inactive/concentration tools) |
| `hod` | `INDIVIDUAL_TOOLS` + `AGGREGATE_TOOLS` |
| `faculty_dean` | `AGGREGATE_TOOLS` + `INSTITUTE_TOOLS` + `FACULTY_DEAN_TOOLS` |
| `executive_dean` | `AGGREGATE_TOOLS` + `INSTITUTE_TOOLS` (+ `INDIVIDUAL_TOOLS` only if user asks to "drill down") |
| `vice_chancellor` | `ALL_TOOLS` (17 tools, unrestricted) |

#### 4c. System Prompt Assembly

```
[ROLE PERSONA: Faculty] ← persona tone/voice
=== TOOL ROUTING TABLE === ← which tool for which question
=== RULES === ← forbidden/no_match/forbidden response format
=== SESSION CONTEXT === ← chart context if applicable
...last 6 turns of history...
[user message]
```

#### 4d. LLM Iteration Loop (MAX_ITERATIONS = 3)

```
Iteration 0: tool_choice='auto', max_tokens=768
             → model picks a tool OR answers directly

Iteration 1: model has tool result as role:"tool" message
             → model produces final natural-language reply

Iteration 2: last chance if model needed 2 sequential tool calls
             → fallback: "I couldn't reliably answer..."
```

Model is called via raw **httpx** (no SDK):
- Groq if `api_key.startswith("gsk_")` → model `llama-3.3-70b-versatile`  
- OpenRouter otherwise → model `anthropic/claude-3.5-sonnet`
- `temperature=0.1` — near-deterministic for data reporting

---

### Stage 5 — How Tool Calling Works (Mechanics)

The OpenAI function-calling protocol:

1. `TOOLS` in `ria_tools_groq.py` = a JSON array of `{type:"function", function:{name, description, parameters:<JSON Schema>}}`.
2. Sent as the `tools` field to the LLM API.
3. **The model is not running Python** — it only sees JSON Schemas and returns `{name, arguments}`.
4. Our backend code looks up `TOOL_FUNCTIONS[name]` and calls it.

**Trusted keyword-only arguments** (`ria_user_id`, `scope_departments`, `scope_institutes`, `include_names`, `dept_a_scope`, `dept_b_scope`) are **never** in the JSON Schema the model sees. They can only come from `scope_guard.authorize()`. This is what makes the guard **unbypassable by prompt injection** — the model has no channel to set these values.

#### Safety Net: `_override_tool_choice()`

A keyword-based deterministic layer that runs **before** the guard:

```python
# Example: model picked get_qrank_distribution for "how many Q1 papers does CSE have?"
# → override detects q1 + "how many" → routes to count_qrank_publications
```

Known routing corrections it handles:
- Q-rank count queries → `count_qrank_publications`
- General total publication count → `count_qrank_publications`
- Year/trend/growth (whole-university) → `get_yearly_stats`
- Per-person / per-department growth questions → **skipped** (never override)

> [!WARNING]
> **Known Bug**: When overriding `get_qrank_distribution` → `count_qrank_publications`, it drops the `department` argument (rebuilds `new_args` from scratch). The corrected call silently becomes university-wide instead of department-specific. The same class of bug was already fixed for `get_department_trend` / `get_growth_acceleration` (they're now excluded entirely). `get_qrank_distribution` is the live unpatched instance.

#### Fallback: `_parse_raw_fn_text()`

Some models emit tool calls as literal XML text:
```
<function=get_faculty_stats '{"faculty_name": "me"}'></function>
```
This parser detects and executes it the same way — it still goes through `scope_guard.authorize()`.

---

### Stage 6 — `scope_guard.authorize()`: The Real Security Boundary

**File:** [`scope_guard.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/scope_guard.py)

Called from `ria_agent._guarded_call()` for **every single tool invocation**. There is no other path to a tool function.

```python
def _guarded_call(fn_name, fn_args, scope, user_message, info):
    decision = authorize(scope, fn_name, fn_args, user_message)
    if not decision.allowed:
        return json.dumps({"status": "forbidden", "message": decision.message})
    fn = TOOL_FUNCTIONS.get(fn_name)
    result = fn(**decision.args)   # ← uses guard's args, not model's raw args
```

#### Inside `authorize()`:

**Step 1 — Tool allowed for persona?**
```python
if fn_name not in allowed_tool_names(scope, user_message):
    return _deny("That isn't available for your role.")
```

**Step 2 — Sanitize model's arguments**
```python
args = sanitize_args(fn_name, fn_args)
# Only keeps keys declared in the tool's JSON Schema
# Drops ria_user_id / scope_departments / include_names even if model sent them
```

**Step 3 — VC short-circuit** (unrestricted)
```python
if persona == "vice_chancellor":
    return Decision(True, args, "", "allow", "unrestricted")
```

**Step 4 — Run per-tool rule function**
```python
ctx = _Ctx(scope, args, user_message, directory)
return _RULES[fn_name](ctx)
```

#### The `_RULES` Dispatch Table

```python
_RULES = {
    "get_faculty_stats":                  _individual,
    "search_publications_by_author":      _individual,
    "get_top_cited_publications":         _individual,
    "get_department_benchmark":           _individual,
    "get_citations_by_year":              _individual,
    "get_inactive_faculty":               _inactive_faculty,
    "get_department_stats":               _department_stats,
    "count_qrank_publications":           _publication_aggregate,
    "get_yearly_stats":                   _publication_aggregate,
    "get_qrank_distribution":             _publication_aggregate,
    "get_department_trend":               _department_trend,
    "get_institute_summary":              _institute_summary,
    "get_university_overview":            _no_scope,
    "compare_entities":                   _compare,
    "get_author_concentration":           _dean_cluster_single_dept,
    "get_growth_acceleration":            _dean_cluster_single_dept,
    "get_cross_department_collaboration": _cross_department_collaboration,
}
```

#### How Each Rule Enforces Scope

**`_individual`** (for `get_faculty_stats`, `search_publications_by_author`, etc.)

| Persona | Decision |
|---|---|
| `faculty` | Checks `refers_to_self()` — if asking about someone else, denied. Injects `ria_user_id=scope.ria_user_id` |
| `hod` | Injects `scope_departments=[own_department]` |
| `executive_dean` | Allowed only if message contains "drill down" / "faculty level" |
| `faculty_dean` | **Always denied** — never gets individual data |

**`_publication_aggregate`** (for `count_qrank_publications`, `get_yearly_stats`, `get_qrank_distribution`)

| Persona | Decision |
|---|---|
| `faculty` | Only own dept or university-wide; other dept → denied |
| `hod` | Any department (aggregates only, no names) |
| `faculty_dean` | Only departments inside own school |
| `executive_dean` | Any department, unrestricted |
| `vice_chancellor` | Already short-circuited before rule runs |

**`_department_stats`** — Like above but also injects `include_names=True/False` depending on whether the persona can see faculty names.

**`_dean_cluster_single_dept`** (for `get_author_concentration`, `get_growth_acceleration`) — Faculty Dean only, limited to departments inside their own school/institute.

**`_cross_department_collaboration`** — Validates both `dept_a` and `dept_b` are inside the Faculty Dean's school, rewrites with `dept_a_scope`/`dept_b_scope`.

#### The `_rewrite` Mechanism

When a rule approves a call, it returns `_rewrite(ctx, **trusted)`:

```python
def _rewrite(ctx, drop=(), **trusted):
    args = {k: v for k, v in ctx.args.items() if k not in drop}
    args.update(trusted)  # ← inject ria_user_id, scope_departments, etc.
    return Decision(True, args, "", "rewrite", ...)
```

The tool function then runs with these **server-verified** args, never the model's raw ones.

---

### Stage 7 — Department Name Resolution (`resolve_departments`)

Before any rule logic runs, the text department name from the model's args is resolved through the **in-memory Directory cache** (refreshed every 300 seconds from Supabase):

```
"cse"  →  DEPT_ABBREV lookup  →  "Computer Science and Engineering"
         (if not in abbrev map)
         difflib fuzzy match against all canonical dept names
         → exact/close match OR [] (denial)
```

If `resolve_departments()` returns `[]` for any text, the guard returns:
```json
{"status": "forbidden", "message": "No department or school matching '...' was found."}
```
This happens **before** persona-specific logic — identical denial for every persona.

This means raw SQL wildcards (`%`, `_`) the model might try to embed in a department name are neutralized — they hit string matching against the directory, never SQL.

---

### Stage 8 — `ria_tools_groq.py`: Building the SQL

**File:** [`ria_tools_groq.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_tools_groq.py)

Each tool function receives the guard's trusted kwargs and builds targeted SQL:

```python
def count_qrank_publications(qrank="", department="", year=None, *,
                             scope_departments=None):
    # scope_departments injected by guard — model cannot supply this
    if scope_departments:
        dept_clause = _pub_dept_any(scope_departments)  # ';'-bounded ILIKE
    ...
    sql = f"SELECT COUNT(*) AS cnt FROM publications WHERE ..."
    result = execute_sql(sql)
```

Key SQL helpers:
- `_sql_str(val)` — SQL-escapes strings (`'` → `''`)
- `_like_escape(val)` — escapes `%`, `_`, `\` in LIKE patterns
- `_pub_dept_any(names)` — builds `;`-bounded ILIKE to prevent overcounting (the "P4 fix"):
  ```sql
  (';' || home_author_department || ';') ILIKE '%;Computer Science and Engineering;%'
  ```
  Without the `;` bounds, "Management" would match "Management Studies" and "Computer Application" would match "Master of Computer Applications".

---

### Stage 9 — `sql_tool.execute_sql()`: The Database Choke Point

**File:** [`sql_tool.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/sql_tool.py)

```python
def execute_sql(sql: str):
    # 1. Reject non-SELECT
    if not sql.lstrip().lower().startswith("select"):
        return {"error": "Only SELECT queries are allowed for security reasons."}

    # 2. Strip trailing semicolons (break inner EXECUTE in exec_sql)
    clean_sql = sql.strip().rstrip(";").rstrip()

    # 3. Supabase RPC
    resp = _get_client().rpc("exec_sql", {"query_text": clean_sql}).execute()
    return resp.data

    # 4. Error classification
    except Exception as err:
        if "connection refused" / "failed to fetch" / ...:
            return {"error": "database_unavailable", "unavailable": True}
        return {"error": msg}
```

Error responses flow back to the LLM as `role:"tool"` messages. The system prompt instructs: on `status="error"` reply exactly "Sorry, I couldn't retrieve that data. Please try again."

---

### Stage 10 — LLM Produces Final Reply

The tool result (JSON) is appended to `messages` as `role:"tool"`. The loop continues — the LLM now has its own tool call + the result in context. On the next iteration, `tool_calls` is empty and the model produces the natural-language reply.

The final reply is returned as:
```json
{"reply": "You have 3 Q1 publications.", "source": "llm", "persona_id": "faculty"}
```

Every turn's tokens, latency, tool calls, guard decisions are logged to `backend/logs/ria_agent.log`.

---

## 3. Persona in Detail: Two Completely Separate Layers

```
Layer 1 — persona/persona_l*.py
  ├─ Controls: tone, voice, framing, suggested questions, sample Q&A
  ├─ Source: scope.role_level + scope.dean_scope → one of 5 persona dicts
  ├─ Used to: build the "ROLE PERSONA" section of the system prompt
  └─ NOT a security boundary — its scope_filter field is documentation only

Layer 2 — scope_guard.py
  ├─ Controls: which tools the model sees, which data the tools may return
  ├─ Source: scope.persona_id (from the verified JWT, same Scope object)
  ├─ Enforces: filter_tools() → authorize() → _RULES[tool](ctx)
  └─ IS the actual security boundary — cannot be bypassed by prompting
```

> [!TIP]
> **Mental model:** Persona = *how RIA sounds*. Scope guard = *what database rows can physically be returned*. Clever prompting can influence tone; it cannot bypass the guard because the guard runs Python, not the LLM.

---

## 4. Complete Example Trace: `"How many Q1 papers do I have?"` (Faculty user)

| Step | Where | What happens |
|---|---|---|
| 1 | Browser | POST /chat + `Authorization: Bearer <JWT>` |
| 2 | `main.py` | `get_scope()` verifies JWT → `Scope{persona_id="faculty", ria_user_id=232730, department_name="CSE"}` |
| 3 | `main.py` | `normalize_query()` — no abbrev expansion needed |
| 4 | `intent_router` | All 7 matchers fail (needs personal scoping) → falls through |
| 5 | `ria_agent` | `get_persona("Faculty", None)` → Faculty persona dict (encouraging mentor tone) |
| 6 | `scope_guard` | `filter_tools(TOOLS, scope)` → 11 tools returned; `get_inactive_faculty`, `get_author_concentration` etc. stripped |
| 7 | `ria_agent` | System prompt = persona text + RIA_SYSTEM_PROMPT + history |
| 8 | Groq API | Returns `tool_calls:[{name:"get_faculty_stats", arguments:"{}"}]` |
| 9 | `ria_agent` | `_override_tool_choice("how many Q1 papers do I have?", "get_faculty_stats", {})` → no override (per-person, excluded) |
| 10 | `scope_guard` | `authorize(scope, "get_faculty_stats", {})` → `_individual(ctx)` |
| 11 | `_individual` | persona=faculty → `refers_to_self(scope, "")` → True (empty = self) |
| 12 | `_rewrite` | Returns `Decision(allowed=True, args={ria_user_id=232730})` |
| 13 | `ria_tools_groq` | `get_faculty_stats(ria_user_id=232730)` → SQL pinned to real ID, never name-fuzzy |
| 14 | `sql_tool` | `SELECT` confirmed → Supabase RPC → Postgres → rows returned |
| 15 | `ria_agent` | Result appended as `role:"tool"` → back to LLM |
| 16 | Groq API | Produces: `"You have **3 Q1 publications**."` |
| 17 | `main.py` | Returns `ChatResponse{reply, source:"llm", persona_id:"faculty"}` |

---

## 5. File Reference Map

| File | Role | Key Functions |
|---|---|---|
| [`main.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/main.py) | FastAPI routes, wiring | `/chat`, `get_scope`, intent fast path |
| [`auth_scope.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/auth_scope.py) | JWT → Scope | `get_scope()`, `Scope` dataclass |
| [`ria_agent.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_agent.py) | Agent loop | `call_ria_agent()`, `_guarded_call()`, `_run_tool()` |
| [`scope_guard.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/scope_guard.py) | Security enforcement | `authorize()`, `filter_tools()`, `_RULES`, `resolve_departments()` |
| [`ria_tools_groq.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_tools_groq.py) | 17 tool implementations | `TOOLS`, `TOOL_FUNCTIONS`, `RIA_SYSTEM_PROMPT`, `_override_tool_choice()` |
| [`sql_tool.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/sql_tool.py) | Database choke point | `execute_sql()`, `SCHEMA_METADATA` |
| [`intent_router.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/intent_router.py) | Zero-LLM fast path | `route_intent()` |
| [`nlp_pipeline.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/nlp_pipeline.py) | Query normalization | `normalize_query()` |
| [`persona/persona_loader.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/persona) | Persona resolution | `get_persona()`, `build_system_prompt()` |
| `claude_client.py` | **Dead code** — unused | Superseded by ria_agent.py |
