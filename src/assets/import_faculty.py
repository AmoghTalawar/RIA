#!/usr/bin/env python3
"""
RIA Faculty Import Script  v4
──────────────────────────────
Reads RIA_Faculty.xlsx  →  populates ria schema via Supabase REST API:
  1. institutes   (18 rows, upserted)
  2. departments  (36 rows, upserted)
  3. faculty      (739 rows, upserted)
  4. profiles     (skeleton rows updated when auth.users row already exists)

Connection: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  ‼  The anon key is READ-ONLY (RLS blocks inserts) — must use service_role.
     Find both in: Supabase dashboard → Settings → API

Usage:
    pip install supabase pandas openpyxl tqdm python-dotenv
    python import_faculty.py
    python import_faculty.py /path/to/RIA_Faculty.xlsx --dry-run
"""

from __future__ import annotations

import sys
import math
import time
import argparse
import os
from pathlib import Path

import pandas as pd
from tqdm import tqdm

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, ClientOptions

BATCH_SIZE   = 500
DEFAULT_XLSX = "RIA_Faculty.xlsx"

METRIC_COL_MAP = {
    "TOTAL PUBLICATIONS":  "total_pub_count",
    "SCOPUS PUB COUNT":    "scopus_pub_count",
    "WOS PUB COUNT":       "wos_pub_count",
    "SCI PUB COUNT":       "sci_pub_count",
    "PUBMED PUB COUNT":    "pubmed_pub_count",
    "IEEE PUB COUNT":      "ieee_pub_count",
    "ABDC PUB COUNT":      "abdc_pub_count",
    "UGC CARE PUB COUNT":  "ugc_care_pub_count",
    "UGC CARE GP1 COUNT":  "ugc_care_gp1_count",
    "GS PUB COUNT":        "gs_pub_count",
    "SCOPUS CITATIONS":    "scopus_citation",
    "WOS CITATIONS":       "wos_citations",
    "GS CITATIONS":        "gs_citations",
    "SCOPUS H-INDEX":      "scopus_hindex",
    "WOS H-INDEX":         "wos_hindex",
    "GS H-INDEX":          "gs_hindex",
    "SCOPUS i10-INDEX":    "scopus_i10_index",
    "WOS i10-INDEX":       "wos_i10_index",
    "AVG SNIP":            "avg_snip",
    "AVG CITE SCORE":      "avg_citescore",
    "AVG IMPACT FACTOR":   "avg_impfactor",
    "SCOPUS Q1 COUNT":     "scopus_q1_count",
    "SCOPUS Q2 COUNT":     "scopus_q2_count",
    "WOS Q1 COUNT":        "wos_q1_count",
    "WOS Q2 COUNT":        "wos_q2_count",
    "JOURNAL COUNT":       "journal_count",
    "CONFERENCE COUNT":    "conference_count",
    "BOOK COUNT":          "book_count",
    "BOOK CHAPTER COUNT":  "book_chapter_count",
}
INT_COLS   = [v for v in METRIC_COL_MAP.values() if v not in ("avg_snip", "avg_citescore", "avg_impfactor")]
FLOAT_COLS = ["avg_snip", "avg_citescore", "avg_impfactor"]

SHORT_MAP = {
    "Department of Chemistry":                                "Chemistry",
    "Centres":                                                "Centres",
    "School of Mechanical Engineering":                       "Mechanical",
    "Department of Electrical and Electronics Engineering":   "EEE",
    "Department of Physics":                                  "Physics",
    "School of Computer Science and Engineering":             "CSE",
    "School of Electronics and Communication Engineering":    "ECE",
    "Department of Biotechnology":                            "Biotech",
    "School of Sciences":                                     "Sciences",
    "Master of Computer Application":                         "MCA",
    "Dr. MS Sheshgiri College of Engineering and Technology": "Sheshgiri",
    "Department of Mathematics":                              "Maths",
    "School of Civil Engineering":                            "Civil",
    "Department of Automation and Robotics":                  "Automation",
    "School of Management Studies and Research":              "Management",
    "Department of Humanities":                               "Humanities",
    "School of Architecture":                                 "Architecture",
    "KLE Law College":                                        "Law",
}
DEPT_FIXES = {
    "Law\xa0":                         "Law",
    "Centre for Material Science":     "Centre for Material Science (CMS)",
    "Master of Computer Applications": "Computer Application",
}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def safe_int(val, default=0):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return default
        return int(float(val))
    except Exception:
        return default


def safe_float(val):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return None
        return float(val)
    except Exception:
        return None


def safe_str(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    return str(val).strip() or None


def norm_dept(name: str) -> str:
    return DEPT_FIXES.get(name.strip(), name.strip())


def banner(t: str):
    print(f"\n{'─'*60}\n  {t}\n{'─'*60}")


def batch_upsert(client, table: str, rows: list[dict], on_conflict: str) -> int:
    """Upsert rows in BATCH_SIZE chunks; return total rows processed."""
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        resp = client.table(table).upsert(chunk, on_conflict=on_conflict).execute()
        total += len(resp.data)
    return total


def fetch_all(client, table: str, cols: str) -> list[dict]:
    """Paginate past the PostgREST 1000-row default limit."""
    PAGE, offset, result = 1000, 0, []
    while True:
        resp = client.table(table).select(cols).range(offset, offset + PAGE - 1).execute()
        result.extend(resp.data)
        if len(resp.data) < PAGE:
            break
        offset += PAGE
    return result


# ─────────────────────────────────────────────────────────────
# Connection
# ─────────────────────────────────────────────────────────────

def get_client():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("  ✗ Missing environment variables. Set:")
        print("      SUPABASE_URL=https://<ref>.supabase.co")
        print("      SUPABASE_SERVICE_ROLE_KEY=eyJ...")
        print()
        print("    The anon key is READ-ONLY — inserts require service_role to bypass RLS.")
        print("    Find both in: Supabase dashboard → Settings → API")
        sys.exit(1)
    return create_client(url, key, options=ClientOptions(schema="ria"))


# ─────────────────────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────────────────────

def load_excel(path: str) -> pd.DataFrame:
    banner(f"Loading: {path}")
    xf = pd.ExcelFile(path)
    sheet = "All Faculty" if "All Faculty" in xf.sheet_names else xf.sheet_names[0]
    df = pd.read_excel(path, sheet_name=sheet)
    print(f"  Sheet: {sheet}  Rows: {len(df)}  Cols: {len(df.columns)}")
    for r in ["USER ID", "AUTHOR NAME", "INSTITUTE", "DEPARTMENT"]:
        if r not in df.columns:
            raise ValueError(f"Required column missing: {r}")
    print(f"  USER ID null count: {df['USER ID'].isna().sum()}")
    return df


# ─────────────────────────────────────────────────────────────
# Step 1 — Institutes
# ─────────────────────────────────────────────────────────────

def upsert_institutes(client, df: pd.DataFrame) -> dict[str, str]:
    banner("Step 1/4 — Institutes")
    rows = [
        {"name": name.strip(), "short_name": SHORT_MAP.get(name.strip())}
        for name in df["INSTITUTE"].dropna().unique()
    ]
    n = batch_upsert(client, "institutes", rows, "name")
    print(f"  ✔  institutes  upserted={n}")

    return {r["name"]: r["id"] for r in fetch_all(client, "institutes", "id,name")}


# ─────────────────────────────────────────────────────────────
# Step 2 — Departments
# ─────────────────────────────────────────────────────────────

def upsert_departments(client, df: pd.DataFrame, inst_map: dict) -> dict[tuple, str]:
    banner("Step 2/4 — Departments")
    rows, skipped = [], 0
    for inst_name, dept_name in df[["INSTITUTE", "DEPARTMENT"]].dropna().drop_duplicates().values.tolist():
        inst_id = inst_map.get(inst_name.strip())
        if not inst_id:
            skipped += 1
            continue
        rows.append({"name": norm_dept(dept_name), "institute_id": inst_id})

    # Deduplicate after norm_dept() — two raw names can normalise to the same value
    seen: dict[tuple, dict] = {}
    for r in rows:
        seen[(r["name"], r["institute_id"])] = r
    rows = list(seen.values())

    n = batch_upsert(client, "departments", rows, "name,institute_id")
    print(f"  ✔  departments  upserted={n}  skipped={skipped}")

    return {
        (r["name"], r["institute_id"]): r["id"]
        for r in fetch_all(client, "departments", "id,name,institute_id")
    }


# ─────────────────────────────────────────────────────────────
# Step 3 — Faculty
# ─────────────────────────────────────────────────────────────

def upsert_faculty(client, df: pd.DataFrame, inst_map: dict, dept_map: dict) -> dict[int, str]:
    banner("Step 3/4 — Faculty (739 rows)")
    rows, skipped, errors = [], 0, []

    for _, row in df.iterrows():
        ria_user_id = safe_int(row.get("USER ID"), default=None)
        if not ria_user_id:
            skipped += 1
            continue
        author_name = safe_str(row.get("AUTHOR NAME"))
        if not author_name:
            skipped += 1
            continue

        inst_name = safe_str(row.get("INSTITUTE"))
        dept_name = safe_str(row.get("DEPARTMENT"))
        if dept_name:
            dept_name = norm_dept(dept_name)

        inst_id = inst_map.get(inst_name)
        dept_id = dept_map.get((dept_name, inst_id)) if (dept_name and inst_id) else None

        if not inst_id:
            errors.append(f"  ✗ [{ria_user_id}] {author_name} — institute '{inst_name}' not found")
            continue
        if not dept_id:
            errors.append(f"  ✗ [{ria_user_id}] {author_name} — dept '{dept_name}' in '{inst_name}' not found")
            continue

        emp_raw = row.get("EMPLOYEE ID")
        emp_id = None
        if emp_raw is not None and not (isinstance(emp_raw, float) and math.isnan(emp_raw)):
            emp_id = str(int(float(emp_raw)))

        data: dict = {
            "ria_user_id":   ria_user_id,
            "author_name":   author_name,
            "department_id": dept_id,
            "institute_id":  inst_id,
        }
        if emp_id:
            data["employee_id"] = emp_id

        for excel_col, db_col in METRIC_COL_MAP.items():
            val = row.get(excel_col)
            data[db_col] = safe_int(val) if db_col in INT_COLS else safe_float(val)

        rows.append(data)

    # Deduplicate by ria_user_id — guard against duplicate rows in Excel
    before = len(rows)
    seen: dict[int, dict] = {}
    for data in rows:
        seen[data["ria_user_id"]] = data
    rows = list(seen.values())
    if before != len(rows):
        print(f"  Dupes removed: {before - len(rows)}")

    total = 0
    for i in tqdm(range(0, len(rows), BATCH_SIZE), desc="  faculty batches"):
        chunk = rows[i : i + BATCH_SIZE]
        resp = client.table("faculty").upsert(chunk, on_conflict="ria_user_id").execute()
        total += len(resp.data)

    print(f"  ✔  faculty  upserted={total}  skipped={skipped}  errors={len(errors)}")
    for m in errors[:10]:
        print(m)

    return {r["ria_user_id"]: r["id"] for r in fetch_all(client, "faculty", "id,ria_user_id")}


# ─────────────────────────────────────────────────────────────
# Step 4 — Profiles
# ─────────────────────────────────────────────────────────────

def upsert_profiles(client, df: pd.DataFrame, faculty_map: dict, inst_map: dict, dept_map: dict):
    banner("Step 4/4 — Profiles (skeleton rows)")

    existing_resp = client.table("profiles").select("id,ria_user_id").not_.is_("ria_user_id", "null").execute()
    existing = {r["ria_user_id"]: r["id"] for r in existing_resp.data}
    print(f"  Profiles with auth.users rows: {len(existing)}")

    upd = skp = 0
    for _, row in df.iterrows():
        ria_user_id = safe_int(row.get("USER ID"), default=None)
        if not ria_user_id:
            skp += 1
            continue
        profile_id = existing.get(ria_user_id)
        if not profile_id:
            skp += 1
            continue  # no auth.users row yet — skip

        inst_name = safe_str(row.get("INSTITUTE"))
        dept_name = safe_str(row.get("DEPARTMENT"))
        if dept_name:
            dept_name = norm_dept(dept_name)
        inst_id    = inst_map.get(inst_name)
        dept_id    = dept_map.get((dept_name, inst_id)) if (dept_name and inst_id) else None
        faculty_id = faculty_map.get(ria_user_id)

        resp = (
            client.table("profiles")
            .update({
                "full_name":     safe_str(row.get("AUTHOR NAME")),
                "role_level":    "Faculty",
                "department_id": dept_id,
                "institute_id":  inst_id,
                "faculty_id":    faculty_id,
            })
            .eq("id", profile_id)
            .execute()
        )
        if resp.data:
            upd += 1
        else:
            skp += 1

    print(f"  ✔  profiles  updated={upd}  skipped={skp}")


# ─────────────────────────────────────────────────────────────
# Verify
# ─────────────────────────────────────────────────────────────

def verify(client):
    banner("Verification")
    for t in ["institutes", "departments", "faculty"]:
        resp = client.table(t).select("id", count="exact").execute()
        print(f"  {t:30s} {resp.count:>6} rows")

    print()
    resp = (
        client.table("faculty")
        .select("author_name,total_pub_count,departments(name),institutes(name)")
        .order("total_pub_count", desc=True)
        .limit(5)
        .execute()
    )
    print("  Top 5 by publication count:")
    for r in resp.data:
        dept = r.get("departments", {}).get("name", "?") if r.get("departments") else "?"
        print(f"    {r['author_name'][:35]:35s} | {dept[:28]:28s} | pubs={r['total_pub_count']}")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Import RIA_Faculty.xlsx → Supabase ria schema")
    ap.add_argument("file", nargs="?", default=DEFAULT_XLSX)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"  ✗ File not found: {path}")
        sys.exit(1)

    try:
        df = load_excel(str(path))
    except Exception as e:
        print(f"  ✗ {e}")
        sys.exit(1)

    if args.dry_run:
        print("  ✔ Dry-run — no writes.")
        sys.exit(0)

    client = get_client()
    banner(f"Connected to Supabase (schema: ria)")

    t0 = time.time()
    inst_map    = upsert_institutes(client, df)
    dept_map    = upsert_departments(client, df, inst_map)
    faculty_map = upsert_faculty(client, df, inst_map, dept_map)
    upsert_profiles(client, df, faculty_map, inst_map, dept_map)
    verify(client)
    print(f"\n  ✔ Done in {time.time() - t0:.1f}s\n")


if __name__ == "__main__":
    main()
