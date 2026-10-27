# Contributing to RIA Dashboard

## The One Rule That Matters

**Never push directly to `production`.** Open a PR. Wait for review. Only Saiprasad merges.

If you push directly to `production`, your commits will be reverted without discussion.

---

## Setup

```bash
# 1. Clone
git clone http://10.9.0.115:3000/KLETech-AI-Agents/RIA-Dashboard
cd RIA-Dashboard

# 2. Frontend
npm install
cp .env.example .env          # fill in VITE_RIA_BACKEND_URL

# 3. Backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY

# 4. Run
python main.py                # backend → http://0.0.0.0:8000  (use python main.py, NOT uvicorn)
npm run dev                   # frontend → http://localhost:5173
```

> Ask your lead for `.env` credentials. Never share keys in chat — DM only.

---

## Branch Workflow

```
production (protected — no direct push)
    ↑
    PR reviewed and approved by Saiprasad
    ↑
intern/yourname-feature-name   ← you work here
```

### Create your branch

```bash
git checkout production
git pull origin production
git checkout -b intern/yourname-short-description
```

### Branch naming

```
intern/ravi-department-filter
intern/priya-fix-chart-crash
intern/ravi-add-hod-export
```

Always prefix with `intern/yourname-`. Never work directly on `production`, `main`, or someone else's branch.

---

## Before You Write Any Code

1. Pull latest `production` — `git pull origin production`
2. Understand the task from Notion before touching files
3. If unclear, ask in the team channel — do not guess and push

---

## Commit Messages

```
feat: add department filter to faculty table
fix: handle null hindex in score calculation
chore: update supabase-py to 2.5
docs: add SQL query examples to README
```

**One logical change per commit.** Do not bundle unrelated changes.

---

## Before Opening a PR

Run through this checklist yourself — don't leave it for the reviewer:

- [ ] App runs locally without errors (`npm run dev` + `python main.py`)
- [ ] The specific feature/fix works as expected — test it manually
- [ ] No console errors in the browser
- [ ] No Python tracebacks in the backend terminal
- [ ] No API keys, passwords, or secrets anywhere in the code
- [ ] `git pull origin production` done and conflicts resolved
- [ ] Only files related to your task are in the diff (`git diff` before committing)

---

## Opening a PR

Target branch: **`production`**

PR description must include:

```
## What does this PR do?
One or two sentences.

## How to test
1. Go to...
2. Click / query...
3. Expected result...

## Screenshots
(required for any UI change)
```

Tag **Saiprasad** as reviewer. Do not merge your own PR.

---

## What Gets Your PR Rejected

- Direct push attempt to `production`
- Hardcoded IP addresses, keys, or passwords
- Commented-out blocks of old code left behind
- Unrelated files in the diff (node_modules, .env, __pycache__)
- No test instructions in the PR description
- Breaking the backend startup (`python main.py` must still work)
- Breaking the frontend build (`npm run dev` must still work)

---

## Repo Structure (what goes where)

```
backend/
  main.py              — FastAPI entry point (data endpoints + /chat)
  ria_agent.py         — Async 6-tool AI agent
  ria_tools_groq.py    — Tool implementations + system prompt
  sql_tool.py          — execute_sql() via Supabase RPC
  intent_router.py     — Slim 7-intent deterministic router
  .env                 — NOT committed — copy from .env.example

src/
  pages/               — Dashboard pages (one file per role)
  components/          — Reusable chart and panel components
  lib/supabaseQueries.js — All fetch() calls to backend API
  tools/sqlTool.js     — executeSql() for AI chatbot

supabase/migrations/   — SQL schema files — never edit existing ones
```

---

## Database Changes

If your task requires a schema change:

1. Create a new file in `supabase/migrations/` — `YYYYMMDD_description.sql`
2. Never modify existing migration files
3. Include RLS policies in the same file
4. Document the change in your PR description
5. Test with a fresh DB reset before pushing

---

## Getting Unstuck

| Situation | Action |
|-----------|--------|
| Stuck > 30 minutes | Post in team channel with what you tried |
| Need credentials | DM Saiprasad — never post in channel |
| Found a bug in someone else's code | Open an issue, don't fix on their branch |
| Unsure what to build | Re-read the Notion task, then ask |
| Build is broken | Check backend terminal + browser console before asking |
