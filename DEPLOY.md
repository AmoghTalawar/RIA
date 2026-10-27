# RIA Dashboard — Deploy Instructions

**From zero to working dashboard in 5 steps.**

Prerequisites:
- Self-hosted Supabase running at `10.9.0.115` (`docker compose up` from your Supabase docker dir)
- Python 3 with packages: `pip install supabase pandas openpyxl tqdm python-dotenv`
- Node.js 20+ (`node -v` to check)

**Credentials:** Find your `SERVICE_ROLE_KEY` in the Supabase dashboard at `http://10.9.0.115:8000` → Settings → API, or read directly from the docker `.env` file. The `anon` key is read-only (RLS blocks inserts) — `service_role` is backend-only.

**Data files required before Step 2** — obtain from the research cell (not in git):

| File | Location | Needed by |
|------|----------|-----------|
| `FACULTY COMPARE (2).xlsx` | `src/assets/` | Step 2a (`import_faculty.py`) |
| `Pub_Mine_export*.xlsx` | `src/assets/` | Step 2b (`import_publications.py`) |

---

## Intern Dev Setup (Supabase Cloud)

> Use this path if you are an intern with a **Supabase Cloud** account.
> Production runs on the self-hosted instance at `10.9.0.115` — you do NOT get direct access to that.

**1. Create a free Supabase Cloud project**

Go to [supabase.com](https://supabase.com) → New project. Choose any region. Note down:
- **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
- **service_role secret** — Settings → API → `service_role` (keep private, never commit)
- **anon public** key — same page, `anon` key

**2. Enable the `ria` schema in PostgREST**

Settings → API → *Extra schemas* field → add `ria`:
```
public, ria
```
Save and wait ~30 seconds. Without this, all table reads return 404.

**3. Run migrations in SQL Editor**

Open SQL Editor (left sidebar) and run each file in order — paste contents, click Run:

```
supabase/migrations/20250101000000_initial_schema.sql       ← schema + departments + institutes
supabase/migrations/20250101000001_exec_sql_rpc.sql         ← AI chatbot SQL gateway
supabase/migrations/20250101000002_anon_read_policies.sql   ← anon read grants (critical)
supabase/migrations/20260511000000_add_openalex_columns.sql ← OpenAlex author columns
```

**4. Import faculty and publications**

Get the two Excel files from the research cell (ask Saiprasad) and place them in `src/assets/`:
- `FACULTY COMPARE (2).xlsx`
- `Pub_Mine_export*.xlsx`

```bash
export SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_secret>"

cd src/assets
python3 import_faculty.py
python3 import_publications.py
```

Then run `supabase/populate_department_fks.sql` in SQL Editor.

**5. Seed OpenAlex author mappings (HIGH-confidence only)**

```bash
# Run this from the repo root once the mapping file exists
python export_openalex_seed.py
# → supabase/seeds/openalex_faculty_mapping.sql
```

Paste the generated SQL into SQL Editor and run it. If the seed file already exists in the repo, skip the generate step and run it directly.

**6. Set up your `.env` files**

`backend/.env`:
```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_secret>
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
HOST=0.0.0.0
PORT=8000
```

`.env` (repo root, for frontend):
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_public_key>
VITE_RIA_BACKEND_URL=http://localhost:8000
VITE_CHAT_API_URL=http://localhost:8000
```

**7. Start and verify**

```bash
cd backend && pip install -r requirements.txt && python main.py
# in another terminal:
npm install && npm run dev
```

Open `http://localhost:5173` → log in as `dean` / `dean123` → ask the chatbot *"how many Q1 publications in CSE?"*

**Verify row counts:**
```sql
SELECT 'institutes',   COUNT(*) FROM ria.institutes  UNION ALL
SELECT 'departments',  COUNT(*) FROM ria.departments UNION ALL
SELECT 'faculty',      COUNT(*) FROM ria.faculty     UNION ALL
SELECT 'publications', COUNT(*) FROM ria.publications;
-- Expected: 18 · 36 · ~739 · ~6516
```

> **Write access:** Your Cloud project is yours — you can alter schema freely.
> Never run `import_*.py` or DDL against `10.9.0.115` (prod) unless Saiprasad explicitly asks.

---

## Step 1: Deploy Schema

Open **Supabase SQL Editor** and run the three migration files **in order**:

**1a — Initial schema** (`supabase/migrations/20250101000000_initial_schema.sql`)

Creates the `ria` schema, all tables, ENUMs, indexes, 3 views, and RLS policies.
Also seeds 18 institutes and 36 departments.

**1b — exec_sql RPC** (`supabase/migrations/20250101000001_exec_sql_rpc.sql`)

Creates `public.exec_sql(query_text TEXT)` — the read-only SQL gateway used by the AI chatbot.
Only `SELECT` and `WITH` queries are permitted.

**1c — Anon read policies** (`supabase/migrations/20250101000002_anon_read_policies.sql`)

**Critical.** The dashboard uses localStorage auth, not Supabase Auth JWTs — every call runs as the `anon` role. Without these policies all table reads return empty arrays.

**Enable the `ria` schema in PostgREST:**

Go to **Supabase Dashboard → Project Settings → API**, add `ria` to the *Extra schemas* field:

```
public, ria
```

Save and wait ~30 seconds. Without this, all `/rest/v1/` calls to `ria.*` tables return 404.

---

## Step 2: Import Data

```bash
export SUPABASE_URL="http://10.9.0.115:8000"
export SUPABASE_SERVICE_ROLE_KEY="<your SERVICE_ROLE_KEY>"

# 2a. Faculty (739 rows) — run from src/assets/
cd src/assets
python3 import_faculty.py
# → institutes (18) + departments (36) upserted, 739 faculty rows inserted

# 2b. Publications (6,516 rows)
python3 import_publications.py
# → 6,516 publications; handles MM/DD/YYYY pub_date format
```

After both imports, run `supabase/populate_department_fks.sql` in the SQL Editor to link publications to departments via FK.

**Verify row counts:**

```sql
SELECT 'institutes'    AS tbl, COUNT(*) FROM ria.institutes    UNION ALL
SELECT 'departments',           COUNT(*) FROM ria.departments   UNION ALL
SELECT 'faculty',               COUNT(*) FROM ria.faculty       UNION ALL
SELECT 'publications',          COUNT(*) FROM ria.publications;
```

Expected: 18 · 36 · ~739 · ~6516.

---

## Step 3: Backend

**Create `backend/.env`** (copy from `backend/.env.example`):

```env
SUPABASE_URL=http://10.9.0.115:8000
SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt>
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
HOST=0.0.0.0
PORT=8000
```

Get an OpenRouter key at `https://openrouter.ai/keys` (free tier available).
`OPENROUTER_MODEL` defaults to `anthropic/claude-3.5-sonnet` if not set — Claude handles the 6-tool loop reliably.

**CORS — `ALLOWED_ORIGINS`** controls which frontend origins the backend accepts.
Default (no entry) allows `localhost:5173` and `127.0.0.1:5173` only.

```env
# Add your machine's LAN IP when the frontend runs on a different device
ALLOWED_ORIGINS=http://localhost:5173,http://10.9.0.109:5173

# Allow all origins — open LAN access (dev/demo only)
ALLOWED_ORIGINS=*
```

Find your LAN IP: `ipconfig getifaddr en0` (Mac) or `hostname -I` (Linux).

> **Port mismatch gotcha:** Vite picks the next free port if 5173 is busy (5174, 5175, 5176…).
> If you get a CORS error with status 200, check the actual port Vite started on and update
> `ALLOWED_ORIGINS` to match. Restart the backend after any `.env` change.

**Start the backend:**

```bash
cd backend
pip install -r requirements.txt
python main.py    # → http://0.0.0.0:8000
```

> **Important:** always use `python main.py`, not `uvicorn main:app` directly.
> The `__main__` block reads `HOST`/`PORT` from `.env` and binds to `0.0.0.0`.
> Running uvicorn directly defaults to `127.0.0.1` (localhost only, invisible on LAN).

---

## Step 4: Frontend

**Create `.env`** in the project root:

```env
VITE_RIA_BACKEND_URL=http://<server-ip>:8000
VITE_CHAT_API_URL=http://<server-ip>:8000
```

Replace `<server-ip>` with the IP of the machine running the backend (e.g. `10.9.0.115`).
If backend and frontend are on the same machine, use `localhost`.

```bash
npm install
npm run dev      # → http://localhost:5173
```

---

## Step 5: Verify

Open `http://localhost:5173` and log in:

| Username | Password | Role |
|----------|----------|------|
| `staff` | `staff123` | Faculty |
| `hod` | `hod123` | Head of Department |
| `dean` | `dean123` | Vice Chancellor |

Check the VC dashboard AI chatbot responds to: *"how many Q1 publications in CSE?"*

Check the backend health endpoint: `curl http://localhost:8000/health` → `{"ok": true}`

---

## Real Data Access (Authorized Personnel Only)

The data files in the repo (`src/assets/RIA_Faculty.xlsx`, `src/assets/RIA_Publications.xlsx`)
are **anonymized** — faculty names and IDs replaced with fake equivalents via Faker `en_IN`, and
numeric metrics jittered ±10%.

Real data lives on the production server at `10.9.0.115` and is accessible only via
**Tailscale + SSH**. Contact Saiprasad for Tailscale access.

### Pull real data files (requires Tailscale + SSH access)

```bash
# Faculty (244KB)
scp user@10.9.0.115:/opt/ria-data/RIA_Faculty.xlsx src/assets/RIA_Faculty.xlsx

# Publications (5.6MB)
scp user@10.9.0.115:/opt/ria-data/RIA_Publications.xlsx src/assets/RIA_Publications.xlsx
```

> **Do not commit real data files.** They are tracked via Git LFS but the versions in the repo
> are anonymized. Running `git status` after the scp will show them as modified — do not stage
> or commit these changes.

After pulling real files, run the import scripts normally (Step 2). The anonymized files are
sufficient for frontend development, schema exploration, and testing the AI chatbot.

---

## Files Reference

| File | Purpose | When to Run |
|------|---------|-------------|
| `supabase/migrations/20250101000000_initial_schema.sql` | Schema, views, RLS | Step 1a (once) |
| `supabase/migrations/20250101000001_exec_sql_rpc.sql` | AI chatbot SQL gateway | Step 1b (once) |
| `supabase/migrations/20250101000002_anon_read_policies.sql` | anon read grants | Step 1c (once) |
| `supabase/populate_department_fks.sql` | Backfill department FKs | After Step 2 |
| `src/assets/import_faculty.py` | 739 faculty → Supabase | Step 2a |
| `src/assets/import_publications.py` | 6,516 publications → Supabase | Step 2b |

## Schema Changes (Future Migrations)

When you modify the schema, always create a timestamped migration file alongside running the SQL in the Editor — keeps the repo in sync:

```bash
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_<short_name>.sql
# Write the ALTER / CREATE statements in that file,
# then run the exact same SQL in Supabase SQL Editor.
```

Safe changes:
- `ALTER TABLE ria.faculty ADD COLUMN IF NOT EXISTS ...` — always nullable or with DEFAULT
- `CREATE INDEX CONCURRENTLY ...` — non-blocking
- `CREATE OR REPLACE VIEW ...` — safe if column list doesn't shrink

Risky changes (coordinate with interns):
- `NOT NULL` without DEFAULT on a populated table — requires a backfill first
- ENUM changes — use `ALTER TYPE ... ADD VALUE` (safe); rename/drop is breaking
- Dropping columns — check `src/lib/supabaseQueries.js` for all column references first

---

## Database Backup (Production)

Production DB is self-hosted Supabase at `10.9.0.115`, PostgreSQL inside Docker.
Port 5432 is accessible on the LAN. Run backups before any schema migration or bulk import.

### Option A — From your local machine (needs `pg_dump`)

Install if missing:
```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
pg_dump --version   # verify
```

Run backup (postgres password is in the docker `.env` on the server):
```bash
mkdir -p ~/backups/kletech

# RIA schema only
pg_dump -h 10.9.0.115 -U postgres -Fc --schema=ria \
  -f ~/backups/kletech/ria_$(date +%Y%m%d).dump

# Full DB (includes RIA + FIA + auth + storage)
pg_dump -h 10.9.0.115 -U postgres -Fc \
  -f ~/backups/kletech/full_$(date +%Y%m%d).dump
```

You will be prompted for the postgres password. To avoid the prompt:
```bash
export PGPASSWORD="<postgres_password>"
```

### Option B — On the server via SSH (no local pg_dump needed)

```bash
# Dump on the server
ssh user@10.9.0.115 "docker exec supabase-db pg_dump -U postgres -Fc --schema=ria > /home/user/ria_$(date +%Y%m%d).dump"
ssh user@10.9.0.115 "docker exec supabase-db pg_dump -U postgres -Fc > /home/user/full_$(date +%Y%m%d).dump"

# Pull to your machine
mkdir -p ~/backups/kletech
scp user@10.9.0.115:"/home/user/*_$(date +%Y%m%d).dump" ~/backups/kletech/
```

### Restore from backup

**To self-hosted production (10.9.0.115):**
```bash
# Option A — from your local machine
pg_restore -h 10.9.0.115 -U postgres -d postgres --schema=ria \
  ~/backups/kletech/ria_<date>.dump

# Option B — entirely on the server (no network transfer)
scp ~/backups/kletech/ria_<date>.dump user@10.9.0.115:/home/user/
ssh user@10.9.0.115 "docker exec -i supabase-db pg_restore -U postgres -d postgres < /home/user/ria_<date>.dump"
```

**To Supabase Cloud / dev instance:**
```bash
# If you have a .dump file (binary), convert it to plain SQL first — no DB connection needed:
pg_restore -f ria_<date>.sql ~/backups/kletech/ria_<date>.dump

# If you have access to the live server, dump directly as plain SQL:
pg_dump -h 10.9.0.115 -U postgres --schema=ria -f ria_<date>.sql

# Then paste ria_<date>.sql into Supabase Cloud SQL Editor and run.
```

### Recommended schedule
- **Before any migration** — always
- **Weekly** — automated cron on the server (add to `/etc/cron.weekly/`)

---

## Troubleshooting

**All API calls return 404 or `[]`**
→ Add `ria` to PostgREST Extra schemas (Step 1) and wait 30 seconds

**`exec_sql` RPC not found**
→ Run migration 001 in SQL Editor

**Backend can't be reached from another device**
→ Confirm `HOST=0.0.0.0` in `backend/.env` and started via `python main.py`
→ Add your client IP to `ALLOWED_ORIGINS` in `backend/.env` and restart

**AI chatbot returns no data / tool errors**
→ Check `OPENROUTER_API_KEY` is set and valid in `backend/.env`
→ Check `backend/logs/ria_agent.log` for tool-call traces

**Faculty import fails on department lookup**
→ The xlsx may have a trailing `\xa0` (non-breaking space) in dept names — `import_faculty.py` handles known cases via `DEPT_FIXES`; add new variants there if needed

**Publications import skips rows**
→ `pub_date` must be `MM/DD/YYYY` — "Not Available" values are treated as NULL (expected)
