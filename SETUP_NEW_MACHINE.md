# RIA Dashboard — Complete Machine Setup Guide

This guide provides end-to-end instructions for setting up the **RIA Dashboard** (Research Intelligence & Analytics) from scratch on a new machine (Windows, macOS, or Linux).

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Clone Repository & Folder Structure](#2-clone-repository--folder-structure)
3. [Database Setup (Supabase)](#3-database-setup-supabase)
   - [Option A: Free Supabase Cloud (Recommended — No Docker Required)](#option-a-supabase-cloud-recommended)
   - [Option B: Local Supabase via Docker CLI](#option-b-local-supabase-via-docker-cli)
   - [Exposing the `ria` Schema (Critical Step!)](#critical-expose-the-ria-schema)
   - [Applying Migrations](#applying-migrations)
   - [Populating Data (Faculty & Publications)](#populating-data-faculty--publications)
   - [Default Test Accounts](#default-test-accounts)
4. [Backend Setup (FastAPI & Python)](#4-backend-setup-fastapi--python)
   - [Virtual Environment Setup](#a-create-python-virtual-environment)
   - [Install Dependencies](#b-install-dependencies)
   - [Configure `backend/.env`](#c-configure-backendenv)
   - [Run Backend Server](#d-run-the-backend)
5. [Frontend Setup (React + Vite)](#5-frontend-setup-react--vite)
   - [Install Dependencies](#a-install-npm-packages)
   - [Configure Root `.env`](#b-configure-root-env)
   - [Run Frontend Server](#c-run-the-frontend)
6. [Quick Verification Checklist](#6-quick-verification-checklist)
7. [Troubleshooting & Common Pitfalls](#7-troubleshooting--common-pitfalls)

---

## 1. Prerequisites

Make sure the new machine has the following installed:

| Tool | Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Git** | `2.30+` | `git --version` | Version control |
| **Node.js** | `20.x` or `22.x` | `node -v` | JavaScript runtime (includes `npm`) |
| **Python** | `3.10+` (3.11/3.12 recommended) | `python --version` (or `python3 --version`) | Backend API & scripts |
| **LLM Key** | Any | OpenRouter / Groq / Gemini API key | For RIA AI Chatbot (Free tiers available) |
| **Docker** | Latest | `docker --version` | *Only needed if choosing Option B (Local Supabase)* |

---

## 2. Clone Repository & Folder Structure

Clone the repository to your preferred location:

```bash
git clone <YOUR_GIT_REPO_URL> RIA-Dashboard
cd RIA-Dashboard
```

### Key Folders in this Project:
- `src/` — React frontend application (Vite, Tailwind, Supabase Client).
- `backend/` — Python FastAPI backend for AI queries, intent routing, and scope guard.
- `supabase/migrations/` — SQL migration scripts defining the database schema, functions, and user roles.
- `src/assets/` & `supabase/migrations/V2/` — Data import scripts and datasets.

---

## 3. Database Setup (Supabase)

RIA uses PostgreSQL with a dedicated schema named `ria`. You can choose either **Supabase Cloud** (fastest & easiest) or **Local Supabase Docker**.

---

### Option A: Supabase Cloud (Recommended)

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New Project**, choose an organization, set a project name (e.g. `ria-dashboard`), set a database password, and select your preferred region.
3. Once provisioned, navigate to **Project Settings** → **API** and copy:
   - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
   - **anon public** API key
   - **service_role** Secret key (keep this safe; for backend use only)

---

### Option B: Local Supabase via Docker CLI

If you want to run completely offline or on a local server with Docker:
1. Ensure **Docker Desktop** is running.
2. In the project root, start local Supabase:
   ```bash
   npx supabase start
   ```
3. When ready, the CLI displays your local credentials:
   - **API URL**: `http://127.0.0.1:54321`
   - **GraphQL URL**: `http://127.0.0.1:54321/graphql/v1`
   - **Database URL**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
   - **Studio URL**: `http://127.0.0.1:54323`
   - **anon key**: `eyJhbGciOiJIUzI1NiIsIn...`
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsIn...`

---

### ⚠️ CRITICAL: Expose the `ria` Schema

Supabase defaults to exposing only the `public` schema. Because RIA tables live in the `ria` schema, you **must enable it**:

- **For Supabase Cloud:**
  1. Go to **Project Settings** → **API**.
  2. Under **PostgREST Configuration**, locate **Extra schemas** (or "Exposed schemas").
  3. Add `ria` so the field reads:
     ```
     public, ria
     ```
  4. Click **Save** and wait 30 seconds for PostgREST to reload. *(Without this, API calls return 404)*.

- **For Local Supabase (CLI):**
  Edit `supabase/config.toml`:
  ```toml
  [api]
  schemas = ["public", "graphql_public", "ria"]
  extra_search_path = ["public", "extensions", "ria"]
  ```
  Then reload: `npx supabase stop && npx supabase start`.

---

### Applying Migrations

Open the **SQL Editor** in Supabase Studio (Cloud or `http://127.0.0.1:54323` for local) and run the following migration scripts in order:

| Step | File Path | Purpose |
| :--- | :--- | :--- |
| **1** | `supabase/migrations/20250101000000_initial_schema.sql` | Creates `ria` schema, tables (`institutes`, `departments`, `faculty`, `publications`, `faculty_publications`), and seeds basic institutes & departments. |
| **2** | `supabase/migrations/20250101000001_exec_sql_rpc.sql` | Creates `public.exec_sql()` function used by the AI chatbot to query analytics. |
| **3** | `supabase/migrations/20250101000002_anon_read_policies.sql` | Grants read access to `anon` role so the dashboard can load data. |
| **4** | `supabase/migrations/20260511000000_add_openalex_columns.sql` | Adds OpenAlex identifiers to faculty tables. |
| **5** | `supabase/migrations/20260524000000_jwt_auth_users.sql` | **Creates demo login accounts & role profiles** (Password: `KLE@2026`). |
| **6** | `supabase/migrations/20260924000000_scope_hardening.sql` | Enforces backend role-based scope guard checks. |
| **7** | `supabase/migrations/20261019000000_faculty_counts_from_publications.sql` | Performance triggers & helper queries for publication counts. |

---

### Populating Data (Faculty & Publications)

To load the full dataset of ~739 faculty members and ~7,000+ publications:

#### Method 1: Using the V2 Migration Pipeline (Recommended)
Navigate to `supabase/migrations/V2/`:
1. In SQL Editor, execute:
   `supabase/migrations/V2/01_rebuild_taxonomy_and_truncate.sql`
2. Run the population script:
   ```bash
   cd supabase/migrations/V2
   
   # Set environment variables for the script
   # On Windows (PowerShell):
   $env:SUPABASE_URL="<YOUR_SUPABASE_URL>"
   $env:SUPABASE_SERVICE_KEY="<YOUR_SERVICE_ROLE_KEY>"
   
   # On Linux / macOS:
   export SUPABASE_URL="<YOUR_SUPABASE_URL>"
   export SUPABASE_SERVICE_KEY="<YOUR_SERVICE_ROLE_KEY>"
   
   # Install script dependencies if needed
   pip install pandas openpyxl supabase tqdm
   
   # Run population script
   python 02_populate_ria.py --faculty "FACULTY COMPARE.xlsx" --pubs "Pub_Mine_export_cleaned_v3.xlsx"
   ```

#### Method 2: Using `src/assets` Importers
```bash
cd src/assets
pip install -r requirements.txt

# Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment or .env
python import_faculty.py
python import_publications.py
```
After importing, open SQL Editor and execute `supabase/populate_department_fks.sql`.

#### Verification Query:
Run this query in SQL Editor to confirm data:
```sql
SELECT 'institutes' AS table_name, COUNT(*) FROM ria.institutes UNION ALL
SELECT 'departments', COUNT(*) FROM ria.departments UNION ALL
SELECT 'faculty', COUNT(*) FROM ria.faculty UNION ALL
SELECT 'publications', COUNT(*) FROM ria.publications;
```

---

### Default Test Accounts

After running migration `20260524000000_jwt_auth_users.sql`, the following test users are ready to log in:

| Email | Password | Role Level | Dashboard View |
| :--- | :--- | :--- | :--- |
| `uday.kulkarni@kletech.ac.in` | `KLE@2026` | Faculty | Staff Dashboard (`/staff`) |
| `narayan.dg@kletech.ac.in` | `KLE@2026` | HoD (Head of Dept) | Department Dashboard (`/department`) |
| `vijayalaxmi.m@kletech.ac.in` | `KLE@2026` | Faculty Dean | School / Faculty Dean View (`/faculty-dean`) |
| `tewari.pg@kletech.ac.in` | `KLE@2026` | Executive Dean | Executive Dean View (`/executive-dean`) |
| `uma.mudengudi@kletech.ac.in` | `KLE@2026` | Vice Chancellor (VC) | University-wide VC View (`/university`) |

---

## 4. Backend Setup (FastAPI & Python)

The backend runs an intelligent multi-agent pipeline using FastAPI (port `5002` by default).

### A. Create Python Virtual Environment
Open a terminal in the project directory:

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment:
# On Windows (Command Prompt):
venv\Scripts\activate.bat
# On Windows (PowerShell):
venv\Scripts\Activate.ps1
# On Linux / macOS:
source venv/bin/activate
```

### B. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### C. Configure `backend/.env`
Create a `.env` file inside the `backend/` folder:

```bash
# On Linux/macOS:
cp .env.example .env
# On Windows (PowerShell):
copy .env.example .env
```

Edit `backend/.env` with your values:
```env
# ── Supabase Configuration ─────────────────────────────────────
# For Cloud: https://<your-project-ref>.supabase.co
# For Local: http://127.0.0.1:54321
SUPABASE_URL=http://127.0.0.1:54321

# Supabase Anon Key (Public)
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Supabase Service Role Key (Keep private, backend only)
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# ── LLM Provider Configuration (Choose OpenRouter, Groq, or Gemini) ─
# Option 1: OpenRouter (Recommended for Claude 3.5 Sonnet / Haiku)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
OPENROUTER_MODEL=anthropic/claude-haiku-5.5
LLM_PROVIDER=openrouter

# Option 2: Groq (Fast & free tier)
# GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
# GROQ_MODEL=llama-3.3-70b-versatile
# LLM_PROVIDER=groq

# ── Server & CORS ──────────────────────────────────────────────
HOST=0.0.0.0
PORT=5002

# Allowed origins for frontend access:
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

### D. Run the Backend
From within the `backend/` directory (with `venv` active):
```bash
python main.py
```
> The API will be live at `http://127.0.0.1:5002`. Test by visiting `http://127.0.0.1:5002/docs` in your browser.

---

## 5. Frontend Setup (React + Vite)

Open a **second terminal** in the root directory `RIA-Dashboard`.

### A. Install NPM Packages
```bash
npm install
```

### B. Configure Root `.env`
Create a `.env` file in the root project directory:

```bash
# On Linux/macOS:
cp .env.example .env
# On Windows (PowerShell):
copy .env.example .env
```

Edit `.env` in the root folder:
```env
# ── Supabase (Frontend Client) ─────────────────────────────────
# Must match your Supabase instance
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# ── Backend API URLs (Points to the FastAPI backend) ───────────
VITE_RIA_BACKEND_URL=http://127.0.0.1:5002
VITE_CHAT_API_URL=http://127.0.0.1:5002
```

### C. Run the Frontend
```bash
npm run dev
```
> The frontend will start at `http://localhost:5173`.

---

## 6. Quick Verification Checklist

1. [ ] **Frontend Loaded**: Open `http://localhost:5173` in your browser. You should see the RIA login screen.
2. [ ] **Login**: Sign in with `uma.mudengudi@kletech.ac.in` and password `KLE@2026`.
3. [ ] **Dashboard Metrics**: The University Dean / VC dashboard should load publication trends, department breakdown, and faculty rankings without error spinners.
4. [ ] **AI Assistant**: Click the RIA AI Chatbot in the bottom-right corner and ask:
   *"How many total publications are there in CSE?"*
   Verify that the response returns accurate numbers retrieved from the database.

---

## 7. Troubleshooting & Common Pitfalls

### 1. `404 Not Found` when fetching `publications` or `faculty`
- **Cause**: The `ria` schema is not exposed in PostgREST.
- **Fix**: In Supabase Dashboard → **Project Settings** → **API** → Add `ria` to **Extra schemas** (so it reads `public, ria`). Wait 30 seconds for reload.

### 2. Table queries return empty arrays `[]`
- **Cause**: Row-Level Security (RLS) policies are blocking the `anon` role.
- **Fix**: Run `supabase/migrations/20250101000002_anon_read_policies.sql` in the Supabase SQL Editor.

### 3. Login fails with "Invalid login credentials"
- **Cause**: User accounts were not created or identities are missing.
- **Fix**: Re-run `supabase/migrations/20260524000000_jwt_auth_users.sql` in the Supabase SQL Editor. Ensure all passwords match `KLE@2026`.

### 4. CORS Error when sending Chatbot messages
- **Cause**: Backend does not allow the frontend origin.
- **Fix**: In `backend/.env`, set `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` (or `ALLOWED_ORIGINS=*` during local development), then restart `python main.py`.

### 5. Chatbot returns `502 Bad Gateway`
- **Cause**: Missing or invalid LLM API key (`OPENROUTER_API_KEY` or `GROQ_API_KEY`), or quota exceeded.
- **Fix**: Check `backend/.env` and ensure a valid API key is set for your chosen provider.

---

🎉 **Setup complete!** You are now ready to develop and run the RIA Dashboard on your new machine.
