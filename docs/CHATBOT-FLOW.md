# RIA Chatbot — End-to-End Flow

How a single chat message travels from the browser to an answer: request → auth → persona →
LLM reasoning → tool calling → scope enforcement → SQL → response. Written against
`backend/` on branch `intern/amogh-supabase-jwt-auth`, commit `060ffd8`.

---

## 1. The flow diagram

```
┌─────────────┐   POST /chat                    ┌────────────────────────────────────────┐
│  Browser     │  { message, session_id,        │  main.py  (FastAPI)                     │
│  (React UI)  │──  history }, header:          │                                          │
│              │    Authorization: Bearer <JWT> │  1. get_scope() ── verifies JWT          │
└─────────────┘                                 │  2. intent_router fast path (regex)      │
       ▲                                        │  3. else → call_ria_agent()              │
       │  { reply, source, persona_id }         └───────────────┬──────────────────────────┘
       │                                                         │
       │                                                         ▼
       │                                        ┌────────────────────────────────────────┐
       │                                        │  ria_agent.py :: call_ria_agent()       │
       │                                        │                                          │
       │                                        │  a. get_persona(role, dean_scope)        │
       │                                        │     → tone/voice system prompt           │
       │                                        │  b. filter_tools(TOOLS, scope)           │
       │                                        │     → only this persona's tool schemas   │
       │                                        │  c. build messages[]:                    │
       │                                        │     [system, ...history, user_message]   │
       │                                        └───────────────┬──────────────────────────┘
       │                                                         │  loop, up to 3 iterations
       │                                                         ▼
       │                                        ┌────────────────────────────────────────┐
       │                                        │  Groq / OpenRouter LLM API              │
       │                                        │  (openai/gpt-oss-120b, reasoning model) │
       │                                        │                                          │
       │                                        │  "Given these tool schemas and this      │
       │                                        │   question, which tool (if any) and      │
       │                                        │   which arguments?"                      │
       │                                        └───────┬───────────────────┬──────────────┘
       │                                    no tool call │                   │ tool_calls: [...]
       │                                        (answer) │                   ▼
       │                                                 │       ┌──────────────────────────────┐
       │                                                 │       │ scope_guard.authorize()       │
       │                                                 │       │  • tool allowed for persona?  │
       │                                                 │       │  • whitelist model's args     │
       │                                                 │       │  • inject TRUSTED args        │
       │                                                 │       │    (ria_user_id, scope_depts, │
       │                                                 │       │     include_names …)          │
       │                                                 │       │  • resolve dept/inst text     │
       │                                                 │       └──────────────┬────────────────┘
       │                                                 │              allowed │ denied
       │                                                 │                      ▼          └──▶ {"status":"forbidden"}
       │                                                 │       ┌──────────────────────────────┐   fed back to the LLM
       │                                                 │       │ ria_tools_groq.py tool fn      │   as a normal tool result
       │                                                 │       │  builds SQL with the GUARD'S   │
       │                                                 │       │  args, never the model's raw   │
       │                                                 │       │  ones for anything trusted     │
       │                                                 │       └──────────────┬────────────────┘
       │                                                 │                      ▼
       │                                                 │       ┌──────────────────────────────┐
       │                                                 │       │ sql_tool.execute_sql()        │
       │                                                 │       │  • rejects non-SELECT          │
       │                                                 │       │  • Supabase RPC exec_sql()     │
       │                                                 │       └──────────────┬────────────────┘
       │                                                 │                      ▼
       │                                                 │              Postgres (Supabase)
       │                                                 │                      │
       │                                                 │   tool result (JSON) │
       │                                                 │   appended as a "tool" message,
       │                                                 │   loop goes back to the LLM ──────────┐
       │                                                 ▼                                        │
       │                                        ┌────────────────────────────────────────┐        │
       │                                        │  final natural-language reply           │◀───────┘
       │                                        └───────────────┬──────────────────────────┘
       └─────────────────────────────────────────────────────────┘
                     ChatResponse { reply, source: "llm", persona_id }
```

---

## 2. Step-by-step: what happens for one query

Example: a Faculty user asks **"How many Q1 papers do I have?"**

1. **Frontend** (`src/lib/chatApi.js` → `chatAuthCore.js`) attaches the user's live Supabase
   access token as `Authorization: Bearer <JWT>` and POSTs to `/chat`. It never sends the
   user's role — only the message and the token.
2. **`main.py` `/chat`**: `Depends(get_scope)` runs first. If the JWT is missing/expired/invalid,
   the request never reaches any handler code — FastAPI returns 401 before a single line of
   `/chat`'s body executes.
3. **`auth_scope.get_scope()`** (`auth_scope.py`) verifies the JWT against Supabase Auth, then
   looks up the user's `profiles` row (+ `faculty`/`departments`/`institutes` joins depending on
   role) and returns a frozen **`Scope`** object: `role_level`, `dean_scope`, `persona_id`,
   `ria_user_id`, `department_id`/`name`, `institute_id`/`name`, `full_name`, `author_name`. This
   is the **only** source of identity for the rest of the request — nothing from the request body
   is trusted.
4. **Intent-router fast path** (`main.py` → `nlp_pipeline.normalize_query` →
   `intent_router.route_intent`): a small set of regex matchers (year comparisons, "best year",
   "who wrote paper X") that can answer instantly with **zero LLM calls** — pure SQL, no tokens
   spent. "How many Q1 papers do I have?" doesn't match any of these (it needs personal scoping,
   which this fast path doesn't have), so it falls through.
5. **`ria_agent.call_ria_agent(user_message, api_key, scope, ...)`** takes over:
   - `get_persona(scope.role_level, scope.dean_scope)` → the Faculty persona dict (tone only).
   - `filter_tools(TOOLS, scope, user_message)` (`scope_guard.py`) → the 11 tool schemas Faculty
     is allowed to even *see*. The other 6 (e.g. `get_inactive_faculty`,
     `get_author_concentration`) are not in the payload sent to the LLM at all — the model
     literally cannot name a tool it was never shown.
   - Assembles `messages = [system, ...last 6 history turns, user_message]`, where `system` is
     persona tone + the shared `RIA_SYSTEM_PROMPT` (tool-routing table + formatting rules).
6. **LLM round 1** (`_call_groq_http`): POSTs to Groq with `tools=<11 schemas>`,
   `tool_choice="auto"`, `temperature=0.1`. The model decides `get_faculty_stats` is the right
   tool and returns `tool_calls: [{function: {name: "get_faculty_stats", arguments: "{}"}}]`
   (Faculty questions about "I"/"my" resolve to no name needed — self is implicit).
7. **Safety net** `_override_tool_choice()` (`ria_tools_groq.py`) double-checks the model's
   choice against a keyword list, in case it picked something obviously wrong.
8. **`scope_guard.authorize(scope, "get_faculty_stats", {}, user_message)`**:
   - Is `get_faculty_stats` in `allowed_tool_names(scope)`? Yes for Faculty.
   - `sanitize_args()` whitelists the model's arguments against the tool's JSON schema (drops
     anything not declared there — the model cannot smuggle `ria_user_id` itself).
   - The `_individual` rule function runs: persona is `faculty` → **rewrite** the call with the
     **trusted** `ria_user_id=<scope.ria_user_id>` injected, ignoring whatever name (if any) the
     model supplied. This is the actual security boundary — not the system prompt.
9. **`ria_tools_groq.get_faculty_stats(ria_user_id=232730, ...)`** builds a SQL query pinned by
   the trusted ID (never a name-similarity search when an ID is present), calls
   **`sql_tool.execute_sql()`**, which refuses anything that isn't a `SELECT` and runs it via a
   Supabase Postgres RPC (`exec_sql`), then formats the row into a JSON result string containing
   the real Q1 count (computed via the `faculty_publications` junction, see the tool doc).
10. That JSON is appended to `messages` as a `role: "tool"` message; the loop goes back to the
    LLM.
11. **LLM round 2**: now `tool_calls` is empty and the model has the tool's JSON result in
    context — it produces the final natural-language sentence ("You have **3 Q1
    publications**.").
12. **`main.py`** wraps that in `ChatResponse{reply, source: "llm", persona_id: "faculty"}` and
    returns it. `session_id`, token usage, latency and every tool call + guard decision are
    logged to `backend/logs/ria_agent.log` for later audit (nothing sensitive is dropped from
    the trail).

If the model tries to call a tool that isn't in its filtered list (a raw `<function=...>` text
leak, or a hallucinated call), `scope_guard.authorize()` still runs and denies it —
`filter_tools()` prevents most attempts, `authorize()` is the backstop that assumes the filter
could be bypassed and checks again from scratch.

---

## 3. How tool calling actually works (the mechanics)

This uses the OpenAI-style **function calling** protocol that Groq's API implements:

- `ria_tools_groq.py`'s `TOOLS` list is a JSON array of `{"type": "function", "function": {name,
  description, parameters: <JSON Schema>}}` objects — one per tool, 17 total. This is sent as the
  `tools` field of the chat-completions request.
- The model is **not** running Python. It only ever sees the JSON Schemas and picks a
  `{name, arguments}` pair whose shape matches one of them — the actual Python function
  (`TOOL_FUNCTIONS[name]`) is looked up and called **by our backend code**, never by the model.
- `tool_choice="auto"` lets the model decide per-turn whether to call a tool at all (vs. just
  answering, or declining). Some earlier iterations of this backend forced `tool_choice="required"`
  on the first turn; the current code (see `ria_agent.py`) uses `"auto"` for every iteration and
  relies on the system prompt's *"You MUST ALWAYS call a tool"* instruction plus
  `_override_tool_choice()` as a keyword-based safety net for the cases where the model tries to
  reroute (e.g. picking `get_yearly_stats` for a "growth" question that should hit
  `get_growth_acceleration`).
- **Trusted keyword-only arguments** (`ria_user_id`, `scope_departments`, `scope_institutes`,
  `include_names`, `dept_a_scope`, `dept_b_scope`) exist on the Python tool functions but are
  **never** part of the JSON Schema the model sees. They can only be supplied by
  `scope_guard.authorize()` after the model's call has already been decided — this is what makes
  the guard un-bypassable by prompt injection: the model has no channel to set these values even
  if it tries.
- A defensive fallback (`_parse_raw_fn_text`) exists because some models occasionally emit a tool
  call as literal text (`<function=get_faculty_stats '{"faculty_name":"me"}'></function>`) instead
  of using the structured `tool_calls` field — the agent detects and parses this text the same way,
  so it still goes through the same guard.

---

## 4. How the LLM "reasons"

`openai/gpt-oss-120b` (the configured Groq model) is a **reasoning model**: its raw API response
includes a `reasoning` field alongside `content` — an internal scratchpad the model writes before
committing to an answer or a tool call (visible directly in the raw Groq responses captured during
this project's testing, e.g. `"reasoning": "The user says 'hi'..."`). That reasoning is:
- **Not shown to the end user** — only `content` (or `tool_calls`) is used by the agent.
- **Still billed as tokens** — this is a large part of why a single turn costs 3,600–8,800 tokens
  (see §6), even for short answers.

The actual "thinking" the agent relies on happens across **iterations**, not inside one model
call:

- `MAX_ITERATIONS = 3` (`ria_agent.py`). Each iteration is one full request/response round-trip.
- **Iteration 1**: model sees the question + tool schemas, decides whether/which tool to call.
- **Iteration 2**: model sees its own previous message + the tool's JSON result (as a `role:
  "tool"` message) and produces the final text — or, if it decides it needs another tool (e.g. two
  sequential lookups), it can call one more.
- **Iteration 3**: last chance before the agent gives up and returns a generic fallback message.
- `temperature=0.1` keeps tool selection and formatting close to deterministic — this is a
  data-reporting assistant, not a creative one.
- The **system prompt is where "judgment" is actually steered**, not weights: the `RULES` section
  tells the model exactly how to react to `status="forbidden"` / `"no_match"` / `"ambiguous"`, when
  to state a tool's `"note"` caveat before the data (added specifically after a live bug where the
  model narrated `get_citations_by_year`'s data as a "steady rise" despite the tool explicitly
  saying it isn't a trend), and a **TOOL ROUTING table** mapping phrasing → tool, first-match-wins,
  to reduce ambiguity before the model even has to reason it out itself.
- `_override_tool_choice()` is a deterministic (non-LLM) correction layer for exactly the cases
  where keyword overlap between two tools' trigger phrases (e.g. "growth" matching both
  `get_yearly_stats` and `get_growth_acceleration`) causes the model to reason its way to the
  wrong one anyway.

---

## 5. How personas help — two separate layers

This is the single most important architectural point in this codebase: **persona and scope
enforcement are two different systems that happen to agree with each other**, not one system.

### Layer 1 — `persona/persona_l*.py` (voice, tone, framing — NOT a security boundary)
- `persona_loader.get_persona(role_level, dean_scope)` maps the DB role
  (`Faculty`/`HoD`/`Dean`+`cluster`/`Dean`+`university`/`VC`/`Admin`) to one of 5 persona dicts.
- Each persona dict carries a `system_prompt` (how RIA should *talk* to this role — e.g. Faculty's
  persona is an "encouraging personal mentor" that says "you"/"your" and never names colleagues;
  the VC's persona is a "board-level strategic advisor"), plus cosmetic metadata
  (`suggested_questions`, `key_metrics`, `sample_query`/`sample_response` for the UI).
- Each persona dict also declares a `scope_filter` dict (e.g. Faculty's says
  `"faculty_publications": "faculty_id = :self_faculty_id"`) — but this is **documentation of
  intent only**. The module's own docstring says so explicitly: *"Neither the embedded prompt text
  nor this module's bookkeeping is itself a security boundary."* Nothing in `ria_agent.py` ever
  reads `scope_filter` to build a WHERE clause.
- **What persona actually changes in a real request**: the tone of the system prompt text, and
  (for VC only) an optional embedded "lens" protocol letting the VC's own persona prompt describe
  drilling into a lower level conversationally.

### Layer 2 — `scope_guard.py` (the real, unbypassable enforcement — Design A)
- Built specifically because Layer 1 alone was not enforcement (see [[12-Personas-and-Tool-Scope]]
  in the Obsidian vault for the design decision).
- Derives `persona_id` from the same verified `Scope` (not from the persona dict), and uses it to:
  1. **Filter which tools the model is even shown** (`filter_tools`/`allowed_tool_names`).
  2. **Rewrite/inject trusted arguments** into every tool call before it runs
     (`ria_user_id`, `scope_departments`, `scope_institutes`, `include_names`, `dept_a_scope`,
     `dept_b_scope`) — the model's own arguments for these fields, if it tries to supply any, are
     silently dropped by `sanitize_args()` because they're not in the tool's public JSON Schema.
  3. **Deny with a clear message** if the persona can't do this at all (e.g. Faculty Dean asking
     for `get_faculty_stats` → denied outright, no matter what the model tried).
- This is what makes the numbers in `docs`/[[13-Tool-Access-Reference]] actually true: the model
  cannot be talked out of them by clever prompting, because it never has the keys to the argument
  fields that would matter.

**In short**: persona = *how RIA sounds and what topics it's framed around*; `scope_guard` = *what
data can physically be returned, no matter what the model does*.

---

## 6. Backend file-by-file: what it's for and where it plugs into the flow

| File | Role in the flow | Used by |
|---|---|---|
| **`main.py`** | FastAPI app: `/chat`, `/api/pub-chat`, `/api/personas`, `/api/publications`, `/api/faculty`, `/api/institutes`, `/api/sql`, `/health`. Wires `get_scope`/`require_roles` onto every route, runs the intent-router fast path before falling to the LLM agent, logs every turn's tokens/latency. | Entry point — everything starts here |
| **`auth_scope.py`** | Verifies the Supabase JWT, loads the caller's profile + role-specific joins (faculty/department/institute), builds the immutable `Scope` object every other module trusts. `get_scope()` is a FastAPI dependency; `require_roles(...)` is a factory for role-gated endpoints. 60s in-memory cache per token. | `main.py`, `ria_agent.py` (via the `Scope` it's handed) |
| **`ria_agent.py`** | The actual agent loop: builds the system prompt (persona + shared rules), calls the LLM over HTTP (`httpx`, no SDK), runs the iteration loop (§4), executes tool calls in a thread pool (`_run_tool`/`_guarded_call`) so sync Supabase calls don't block the async event loop, and is where **every** tool call is funneled through `scope_guard.authorize()` — there is no other path to a tool function. Also logs a full JSON trace per turn to `backend/logs/ria_agent.log`. | `main.py` (`/chat`, `/api/pub-chat`) |
| **`scope_guard.py`** | Layer 2 enforcement (§5): `allowed_tool_names`/`filter_tools` (what the model sees), `authorize`/`sanitize_args` (what a call is actually allowed to do), the per-tool rule functions (`_individual`, `_department_stats`, `_dean_cluster_single_dept`, etc.), and the department/institute name-resolution `Directory` (free text → canonical DB names, cached 300s). | `ria_agent.py` |
| **`ria_tools_groq.py`** | All 17 tool implementations (SQL-building Python functions), their JSON Schemas (`TOOLS`), the `TOOL_FUNCTIONS` name→function map, the shared `RIA_SYSTEM_PROMPT` (tool-routing table + response-formatting rules), the keyword-based `_override_tool_choice` safety net, and a standalone dev CLI (`main()`, unguarded — for local testing only, never used by the FastAPI app). | `ria_agent.py`, `scope_guard.py` (reads `TOOLS` to validate schemas) |
| **`sql_tool.py`** | `execute_sql()`: the single choke point for all database reads from tools — rejects anything not starting with `SELECT`, executes via a Supabase Postgres RPC (`exec_sql`), classifies connection failures vs. query errors. Also holds `SCHEMA_METADATA`, a large text block describing table/column semantics, used only by the legacy free-form SQL path (`claude_client.py`, `intent_router.py`), not by the modern per-tool functions in `ria_tools_groq.py` (which build their own targeted SQL). | `ria_tools_groq.py`, `intent_router.py`, `main.py` (`/api/sql`), `claude_client.py` (unused) |
| **`intent_router.py`** | A small, fast, LLM-free regex layer for a handful of high-frequency question shapes (year-vs-year comparisons, "best year", "who wrote paper X"): tries to answer directly from `execute_sql()` with zero tokens spent. Falls through to the LLM agent (returns `(None, None)`) for anything it doesn't recognize. | `main.py`, only on `/chat` (not `/api/pub-chat`) |
| **`nlp_pipeline.py`** | `normalize_query()`: expands department abbreviations/synonyms and common phrasing before the message reaches `intent_router`, purely to raise the fast-path's hit rate. Does not touch the LLM path beyond that. | `main.py`, feeding `intent_router` |
| **`persona/persona_loader.py`** + **`persona_l1..l5_*.py`** | Layer 1 (§5): resolves a DB role/dean_scope pair to one of 5 persona dicts (tone, suggested questions, sample Q&A, `can_impersonate` list for the VC's conversational drilldown). `build_system_prompt()` concatenates the persona text with runtime context (e.g. an "ACTIVE LENS" line when the VC is drilling into a lower level). | `ria_agent.py`, `main.py` (`/api/personas`) |
| **`claude_client.py`** | **Dead code** — an older Claude-based chat client (`SCHEMA_METADATA` + free-form `execute_sql` tool-calling loop) that nothing in the current codebase imports. Superseded by `ria_agent.py` + `ria_tools_groq.py`. Safe to ignore when reasoning about the live flow. | Nothing (unused) |
| **`tests/test_auth_scope.py`** | Offline + live tests for JWT verification, profile loading, and `Scope` construction. | Verifies `auth_scope.py` |
| **`tests/test_scope_guard.py`** | The largest test file: offline guard-rule tests for every tool × every persona, SQL-builder tests (`FakeSQL` harness), and full agent-loop tests (mocking only the HTTP call to the LLM, exercising the real guard + real tool functions end-to-end). | Verifies `scope_guard.py` + `ria_tools_groq.py` + `ria_agent.py`'s wiring |
| **`tests/test_live_local.py`** | The same shapes as above, but against the real local Supabase database with real sign-ins for all 5 demo personas — gated behind `RIA_LIVE=1` so the offline suite never needs a database. | Verifies the whole stack end-to-end against real data |

---

## 7. One query, traced through every possible branch

Query: **"How many Q1 papers does Computer Science and Engineering have?"**

This section walks this *exact* query through every decision point in the system, including the
branches that don't happen for it (and why), so it's clear which parts of the pipeline are
actually live for a query like this.

### 7.1 First stop: does the Intent Router take it?

`main.py` runs `normalize_query()` then `route_intent()` **before any LLM call**. Both cost zero
tokens. `route_intent` checks 7 matchers in order (`intent_router.py`, `INTENTS` list) — here is
this exact query against every one of them:

| Matcher | What it needs | Does this query match? |
|---|---|---|
| `campus_unsupported` | "BVB campus", "campus-wise" | No — no campus wording |
| `compare_years` | two different years + comparison wording | No — no year at all |
| `best_year` | "best/peak year for publications" | No |
| `year_trend` | "publications by year/per year" | No |
| `year_range` | "2020 to 2024"-style range | No |
| `yearly_count` | "how many publications ... in `<year>`" | No — this has a Q-rank and a department, not a year |
| `paper_authors` | "who wrote/authored `<title>`" | No |

**None match** — the intent router has *no concept of Q-rank or department at all*. It falls
through with `(None, None)`, and `main.py` proceeds to `call_ria_agent()`. This is true for
**every persona** asking this exact question — the intent router runs before `get_scope()`'s
result is even used for anything beyond auth, so persona never affects whether the fast path
fires.

*(§8 below shows the phrasing that **would** hit this fast path.)*

### 7.2 Persona resolution + tool visibility

`ria_agent.call_ria_agent()` resolves persona from `scope.role_level`/`scope.dean_scope` and calls
`filter_tools(TOOLS, scope, user_message)`. For this specific tool
(`count_qrank_publications`, in `AGGREGATE_TOOLS`), it is visible to **every** persona — Faculty,
HoD, Faculty Dean, Executive Dean, VC all see it in the `tools` array sent to Groq. (Contrast this
with a per-person tool like `get_faculty_stats`, which Faculty Dean never even sees — that's a
different case, §7.6.)

### 7.3 LLM round 1: tool selection

The model reads the `RIA_SYSTEM_PROMPT` routing table line:
`"Q-rank count for dept or university, optionally filtered by year ... → count_qrank_publications"`
and (usually) returns `tool_calls: [{name: "count_qrank_publications", arguments:
{"qrank": "Q1", "department": "Computer Science and Engineering"}}]`.

**But it doesn't always pick correctly.** `get_qrank_distribution`'s own trigger phrase ("Q1/Q2
share", "quartile breakdown") can overlap in the model's reasoning with "Q1", so it sometimes
calls `get_qrank_distribution(department="Computer Science and Engineering")` instead — that tool
returns the *full* Q1–Q4 breakdown rather than just the Q1 count, technically answering a superset
of the question.

### 7.4 The `_override_tool_choice` safety net — and a real edge case in it

`ria_agent.py` runs every tool call through `_override_tool_choice(user_message, fn_name,
fn_args)` before the guard even sees it. For this query:

- **If the model already picked `count_qrank_publications`** → the override's qrank-branch
  condition `fn_name != 'count_qrank_publications'` is false, so it does nothing. `(None, None)`.
- **If the model picked `get_qrank_distribution` instead** (§7.3's mis-route) → the override
  detects the `q1` keyword + "how many" and **does** step in — but here's the catch, verified
  directly against the running code:

  ```python
  >>> tools._override_tool_choice(
  ...     "How many Q1 papers does CSE have?",
  ...     "get_qrank_distribution",
  ...     {"department": "Computer Science and Engineering"},
  ... )
  ('count_qrank_publications', {'qrank': 'Q1'})
  ```

  **The department is silently dropped.** The override rebuilds `new_args` from scratch
  (`{'qrank': qrank_val}` plus an optional `year` pulled by regex from the raw text) — it never
  re-reads `department` from the original call. The corrected call becomes a **university-wide**
  Q1 count, not a CSE one. This is the same class of bug already found and fixed for
  `get_department_trend`/`get_growth_acceleration` (they're now excluded from this override
  entirely, see the commit history) — `get_qrank_distribution` → `count_qrank_publications` is a
  live, **not yet fixed** instance of the same root cause. Worth patching the same way (exclude
  `get_qrank_distribution` from this branch, or carry `department` through) if this turns out to
  fire often in practice — flagging it here rather than fixing it unprompted.

### 7.5 `scope_guard.authorize()` — the real decision, per persona

Assuming the tool call reaches the guard as `count_qrank_publications(qrank="Q1",
department="Computer Science and Engineering")`, the rule function is `_publication_aggregate`.
Its decision differs **only by persona**, not by anything else in the request:

| Persona | Decision | Why |
|---|---|---|
| **Faculty in CSE** | ✅ Allowed, `scope_departments=["Computer Science and Engineering"]` | Named department equals their own |
| **Faculty in another dept** (e.g. Physics) | ❌ Denied: *"As a faculty member you can view counts for the whole university or for your own department (Physics)."* | Named department ≠ own; a Faculty tool call for another department is always refused, regardless of whether it's their own request or a hallucinated one |
| **HoD** (any department) | ✅ Allowed, any department — not limited to their own | `_publication_aggregate` has no restriction for `hod` at all; aggregate counts (no names) are open university-wide for HoD |
| **Faculty Dean, School of CSE** | ✅ Allowed | CSE is inside their own school |
| **Faculty Dean, a different school** (e.g. School of Sciences) | ❌ Denied: *"That department is outside your school. You can view: Physics, Chemistry, Mathematics."* | CSE ∉ their school's department list |
| **Executive Dean** | ✅ Allowed, any department | No restriction in this rule for `executive_dean` |
| **Vice Chancellor / Admin** | ✅ Allowed, unconditionally | `authorize()` short-circuits VC/Admin before any rule function runs at all |

Before any of the above runs, `resolve_departments()` (`scope_guard.py`) must first turn the text
"Computer Science and Engineering" into a canonical name. For this query it's already an exact
match. If the model (or a user, via `X-Groq-Key`-less normal chat) asked about **"CSEE"** or
a nonsense string, `resolve_departments` returns `[]` and the guard returns *"No department or
school matching '...' was found"* — a **denial that happens before any persona-specific logic
even runs**, identical for every persona.

### 7.6 Cases that do *not* apply to this query (for contrast)

| Case | Why it doesn't happen here | Where it *does* happen |
|---|---|---|
| **`status: "ambiguous"`** (multiple close name matches) | `_publication_aggregate` has no fuzzy name matching — department resolution is exact/canonical, not similarity-based | `get_faculty_stats`/`search_publications_by_author` with a common surname |
| **Tool hidden from persona entirely** (`authorize()`'s very first check) | `count_qrank_publications` is offered to all 5 personas | Faculty Dean asking `get_faculty_stats` — not even in the tools array sent to Groq; if a hallucinated raw-text call names it anyway, `authorize()`'s `fn_name not in allowed_tool_names(...)` check denies it before the rule function ever runs |
| **`ria_user_id` trusted-arg injection** | This tool has no per-person scoping | `get_faculty_stats`, `get_top_cited_publications`, etc. |
| **Drilldown phrase changing the outcome** | `_publication_aggregate` doesn't check `ctx.drilldown` at all | `get_faculty_stats` for Executive Dean, `get_inactive_faculty` |

### 7.7 Downstream: SQL, DB failure, and rate limits

- **Normal success**: `ria_tools_groq.count_qrank_publications(qrank="Q1",
  scope_departments=["Computer Science and Engineering"])` builds a `;`-bounded `ILIKE` clause
  (the P4 overcounting-bug fix) against `publications.home_author_department`, calls
  `sql_tool.execute_sql()`, which runs it via the Supabase `exec_sql` RPC and returns
  `{"status": "success", "count": <n>, ...}`.
- **Database unreachable**: `execute_sql()` catches the exception, detects "connection refused" /
  "failed to fetch" in the message, and returns `{"error": "database_unavailable", "unavailable":
  True}`. The tool wraps this as `{"status": "error", ...}`, the LLM sees it in the tool result,
  and per the system prompt's `RULES` replies exactly: *"Sorry, I couldn't retrieve that data.
  Please try again."*
- **Groq rate-limited mid-request**: `ria_agent.py`'s loop catches HTTP 429, parses `"try again in
  Ns"` from Groq's error body, and auto-sleeps (up to 35s, up to 5 retries) — the user usually
  never notices. If it's still failing after 5 retries, or the wait would be longer than 35s, the
  reply becomes *"Rate limit hit — please wait Ns and try again"* and **no tool call happens at
  all** for that turn (see the earlier part of this conversation for a real instance: a 200,000
  tokens/day quota, not a per-minute one, nearly exhausted from testing).
- **Max iterations (3) reached with no resolution**: falls back to the generic *"I couldn't
  reliably answer that from the database..."* message.

---

## 8. When does the Intent Router actually help?

The intent router only fires for a **narrow, fixed set of phrasings that need no persona scoping
at all** — every one of its 7 matchers answers a purely university-wide fact with a hand-written
SQL query and zero LLM tokens. It has no awareness of department, Q-rank, or "my"/"me" — the
moment a question needs *any* of those, it structurally cannot match and falls through to the LLM
agent, regardless of persona.

Rephrasings of ideas *close to* our example query that **would** hit the fast path instead:

| You ask | Matcher | Why it matches | LLM tokens used |
|---|---|---|---|
| "How many publications in 2024?" | `yearly_count` | Year present, no department/qrank | **0** |
| "Publications by year trend" | `year_trend` | Matches the year-wise phrasing regex exactly | **0** |
| "2023 vs 2024 publications" | `compare_years` | Two distinct years + comparison wording | **0** |
| "Which year had the most publications?" | `best_year` | Matches the "most/peak year" regex | **0** |
| "Who wrote 'Quantization Friendly Mobilenet'?" | `paper_authors` | Matches "who wrote `<title>`" | **0** |

The moment you add **"Q1"**, **"Computer Science"**, or **"my"** to any of these, none of the 7
matchers fire anymore (there's no department/qrank/person capture group in any of them) and the
question falls straight through to `call_ria_agent()` — meaning **every persona-scoped or
per-person question in this whole system always goes through the full LLM + tool-calling +
scope_guard pipeline**. The intent router exists purely to shave tokens off a small number of
common, ungated, whole-university lookups — it is never itself a security or scoping layer (it
calls `execute_sql()` directly, unscoped, which is safe only because none of its 7 handlers ever
touch per-person or per-department data).

---

## 9. Cross-reference

- Full tool list, per-role counts and per-tool scope: `docs`/Obsidian vault
  [[13-Tool-Access-Reference]].
- Design rationale, phased build history, and the guard rules as originally specified:
  [[12-Personas-and-Tool-Scope]].
- Real, measured token cost per query and the Groq daily-quota mechanics: see the chat
  conversation where these numbers were pulled directly from `backend/logs/ria_agent.log` and a
  live Groq 429 response (`tokens per day (TPD): Limit 200,000...`).
