# RIA Supabase — database setup

This folder holds the SQL that defines the RIA database.
The project runs against a **Supabase cloud project** (shared with FIA on the same project using a separate `ria` PostgreSQL schema).

---

## Files

| Path | Purpose |
|------|---------|
| `migrations/20250101000000_initial_schema.sql` | Full schema — types, tables, indexes, views, RLS policies |
| `migrations/20250101000001_exec_sql_rpc.sql` | `exec_sql()` RPC in `public` schema (AI chatbot queries) |
| `migrations/20250101000002_anon_read_policies.sql` | `anon` role read policies (required for the dashboard) |
| `config.toml` | Supabase CLI config (project_id, ports — local dev only) |
| `db.sql` | Standalone schema snapshot (same content as migration 000, no seed data) |
| `populate_department_fks.sql` | One-time helper to backfill `department_id` FKs after data import |
| `snippets/` | Ad-hoc SQL used during development (safe to ignore) |

**Run the migrations in order: 000 → 001 → 002.**

---

## First-time cloud setup

### 1 — Supabase project

RIA shares the same Supabase project as FIA. Both schemas coexist without conflicts:

| Project | Schema | Tables |
|---------|--------|--------|
| FIA | `public` | `vouchers`, `budget_items`, … |
| RIA | `ria` | `faculty`, `publications`, … |

If you are setting up a **fresh project**, follow steps 2–6 below.
If FIA is already running on this project, skip to step 3.

### 2 — Enable the `ria` schema in PostgREST

Go to **Project Settings → API** in the Supabase dashboard and add `ria` to the *Extra schemas* field:

```
public, ria
```

Save and wait ~30 seconds for PostgREST to reload.
Without this step all `supabase.from('publications')` calls return 404.

### 3 — Run the migrations

Open **SQL Editor → New query** and run each file in order:

**Step 3a — Initial schema** (`migrations/20250101000000_initial_schema.sql`)

Creates the `ria` schema, all tables, ENUMs, indexes, 3 views, and RLS policies.
Also seeds 18 institutes and 36 departments.

**Step 3b — exec_sql RPC** (`migrations/20250101000001_exec_sql_rpc.sql`)

Creates `public.exec_sql(query_text TEXT) RETURNS JSONB`.
The AI chatbot at the VC dashboard calls this to run read-only SQL queries.
`SECURITY DEFINER` bypasses RLS so the chatbot can read all rows.
Only `SELECT` and `WITH` queries are allowed.

**Step 3c — Anon read policies** (`migrations/20250101000002_anon_read_policies.sql`)

**Critical.** The dashboard uses custom localStorage auth — it does NOT use Supabase Auth JWTs.
Every `supabase-js` client call therefore runs as the `anon` role.
Without these policies, all table reads return empty arrays (RLS blocks `anon`).

### 4 — Configure the backend and frontend

**Backend** (`backend/.env`):
```env
SUPABASE_URL=http://<server-ip>:8000
SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt>
GROQ_API_KEY=gsk_...
HOST=0.0.0.0
PORT=8000
```

**Frontend** (`.env` in project root):
```env
VITE_RIA_BACKEND_URL=http://<server-ip>:8000
VITE_CHAT_API_URL=http://<server-ip>:8000
```

The frontend does **not** talk to Supabase directly — all data goes through the FastAPI backend.
Supabase credentials live in `backend/.env` only — never in the frontend or browser.

### 5 — Import data

The schema seeds institutes and departments automatically.
Faculty (739 rows) and publications (6,516 rows) must be imported separately.

**Faculty import** — Python script using the data from `FACULTY COMPARE (2).xlsx`:
```bash
cd src/assets
python3 import_faculty.py   # maps Excel columns → ria.faculty snake_case
```

**Publications import** — Python script using `Pub_Mine_export*.xlsx`:
```bash
cd src/assets
python3 import_publications.py  # handles MM/DD/YYYY pub_date format
```

After import, run `supabase/populate_department_fks.sql` to link publications to departments via FK.

### 6 — Verify

Run this in the SQL Editor to confirm all rows loaded:

```sql
SELECT 'institutes'    AS tbl, COUNT(*) FROM ria.institutes    UNION ALL
SELECT 'departments',           COUNT(*) FROM ria.departments   UNION ALL
SELECT 'faculty',               COUNT(*) FROM ria.faculty       UNION ALL
SELECT 'publications',          COUNT(*) FROM ria.publications;
```

Expected:

| tbl | count |
|-----|------:|
| institutes | 18 |
| departments | 36 |
| faculty | ~739 |
| publications | ~6 516 |

Test the `anon` policies from the browser console or any REST client:

```bash
curl "https://<ref>.supabase.co/rest/v1/publications?select=title&limit=3" \
  -H "apikey: <anon-key>" \
  -H "Accept-Profile: ria"
```

Expected: 3 publication titles. If you get `[]` or 406, migration 002 was not applied.

---

## Schema overview

```
ria.institutes (18)
    │
    └── ria.departments (36)
            │
            └── ria.faculty (739)  ◄── ria.profiles (Supabase auth bridge)
                    │
                    └── ria.faculty_publications (M:N junction)
                                │
                            ria.publications (6 516)
```

### Tables at a glance

| Table | Rows | Key columns |
|-------|-----:|-------------|
| `institutes` | 18 | `name`, `short_name` |
| `departments` | 36 | `name`, `institute_id` |
| `profiles` | — | `id` (auth.uid), `role_level`, `faculty_id` |
| `faculty` | 739 | `ria_user_id`, `author_name`, `department_id`, all metric counts |
| `publications` | 6 516 | `pub_id`, `title`, `year` (generated), `q_rank_scopus`, `cite_score` |
| `faculty_publications` | — | `faculty_id`, `publication_id`, `is_corresponding` |

### Key type notes

| Column | Type | Note |
|--------|------|------|
| `publications.year` | `SMALLINT GENERATED ALWAYS` | Derived from `pub_date` (`MM/DD/YYYY`). Never write directly. |
| `publications.month` | `SMALLINT GENERATED ALWAYS` | Same source as `year`. |
| `publications.q_rank_scopus` | `ria.q_rank_t ENUM` | Values: `Q1 Q2 Q3 Q4` only. `NULL` = unranked. |
| `publications.scs_citations` | `INTEGER` | `NULL` = not indexed in Scopus. `0` = indexed with zero citations. |
| `publications.is_sci` | `BOOLEAN` | `true` = SCI-indexed. Replaces Excel `'YES'` string. |
| `faculty.ria_user_id` | `INTEGER UNIQUE NOT NULL` | Integer FK target for `publications.staff_ria_user_id`. |

### Views

| View | Purpose | Used by |
|------|---------|---------|
| `v_faculty_full` | Faculty joined with department, institute, and profile | All dashboards |
| `v_pub_faculty` | Publications joined with their linked faculty | Future detail pages |
| `v_institute_summary` | Per-institute aggregates (pub count, citations, avg h-index) | Executive Dean dashboard |

All views use `security_invoker = true` — they respect the caller's RLS role.
The `anon` GRANT on each view (migration 002) allows the dashboard to read them without auth.

---

## RLS summary

| Table / View | anon | authenticated (Faculty) | HoD | Dean/VC | Admin |
|---|---|---|---|---|---|
| `institutes` | SELECT | SELECT | SELECT | SELECT | ALL |
| `departments` | SELECT | SELECT | SELECT | SELECT | ALL |
| `faculty` | SELECT | SELECT | SELECT (own dept) | SELECT | ALL |
| `publications` | SELECT | SELECT/INSERT own | SELECT | SELECT | ALL |
| `faculty_publications` | SELECT | — | — | ALL | ALL |
| `profiles` | — | own row | own row | all | ALL |

**`anon` only gets SELECT.** Write operations always require a Supabase Auth JWT with a matching profile row.

---

## Schema changes

Edit the SQL Editor *and* add a new migration file here so the repo stays in sync:

```bash
# Use a timestamp larger than the last migration file
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_<short_name>.sql
# Write the ALTER / CREATE statements
# Then run the same SQL in the Supabase SQL Editor
```

Common safe changes:
- `ALTER TABLE ria.faculty ADD COLUMN ...` — always nullable or with a DEFAULT
- `CREATE INDEX CONCURRENTLY ...` — non-blocking on cloud Postgres
- `CREATE OR REPLACE VIEW ...` — safe if column list doesn't shrink

Risky changes (coordinate with interns):
- Adding `NOT NULL` without a DEFAULT to a populated table — requires a backfill
- Changing an ENUM — requires `ALTER TYPE ... ADD VALUE` (safe) vs rename/drop (breaking)
- Dropping columns — check all frontend column lists in `src/lib/supabaseQueries.js` first

---

## Security

- **Never** commit `service_role` keys, database passwords, or `.env` files.
- The frontend uses the `anon` key — it is intentionally public, but RLS limits what it can read.
- `service_role` is for backend import scripts only (bypasses all RLS).
- `exec_sql` RPC uses `SECURITY DEFINER` — it bypasses RLS, so it is executable by `service_role` **only** (`migrations/20260924000000_scope_hardening.sql`). The backend must run with `SUPABASE_SERVICE_ROLE_KEY`; with the anon key every chatbot query fails. Persona scope is enforced by the backend from the caller's verified JWT (`backend/auth_scope.py`), never by the request body.
- After that migration, link Faculty / HoD profiles to faculty rows with `link_profiles_to_faculty.sql` (review the preview first), otherwise those users get a 403 from the chatbot.
  Only `SELECT` queries are permitted; the guard is enforced inside the function.
