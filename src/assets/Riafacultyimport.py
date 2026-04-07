#!/usr/bin/env python3
"""
RIA Faculty Import Script  v3
──────────────────────────────
Reads RIA_Faculty.xlsx  →  populates:
  1. institutes   (18 rows, upserted)
  2. departments  (36 rows, upserted)
  3. faculty      (739 rows, upserted)
  4. profiles     (skeleton rows updated when auth.users row already exists)

Schema v3 changes from v2:
  • All DB lookups by UUID id — no name-string joins in code.
  • Profile rows reference faculty.id (UUID) via ria_user_id link.
  • No match_method / match_source (not applicable to faculty).

Usage:
    pip install psycopg2-binary pandas openpyxl tqdm
    python ria_faculty_import_v3.py
    python ria_faculty_import_v3.py /path/to/RIA_Faculty.xlsx --dry-run
"""

import sys, math, time, argparse, traceback
from pathlib import Path

import pandas as pd
import psycopg2
from tqdm import tqdm

DB_CONFIG = {
    "host": "127.0.0.1", "port": 54322,
    "dbname": "postgres", "user": "postgres", "password": "postgres",
}
DEFAULT_XLSX = "RIA_Faculty.xlsx"

# Excel column → DB column for numeric metric columns
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
INT_COLS   = [v for k,v in METRIC_COL_MAP.items() if v not in ("avg_snip","avg_citescore","avg_impfactor")]
FLOAT_COLS = ["avg_snip","avg_citescore","avg_impfactor"]

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
    "Law\xa0":                        "Law",
    "Centre for Material Science":    "Centre for Material Science (CMS)",
    "Master of Computer Applications":"Computer Application",
}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def safe_int(val, default=0):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)): return default
        return int(float(val))
    except: return default


def safe_float(val):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)): return None
        return float(val)
    except: return None


def safe_str(val):
    if val is None or (isinstance(val, float) and math.isnan(val)): return None
    return str(val).strip() or None


def norm_dept(name):
    name = name.strip()
    return DEPT_FIXES.get(name, name)


def banner(t): print(f"\n{'─'*60}\n  {t}\n{'─'*60}")

def summary(label, ins, upd, skp, err):
    print(f"  ✔  {label:30s}  inserted={ins:4d}  updated={upd:4d}  skipped={skp:4d}  errors={err:3d}")


# ─────────────────────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────────────────────

def load_excel(path):
    banner(f"Loading: {path}")
    xf = pd.ExcelFile(path)
    sheet = "All Faculty" if "All Faculty" in xf.sheet_names else xf.sheet_names[0]
    df = pd.read_excel(path, sheet_name=sheet)
    print(f"  Sheet: {sheet}  Rows: {len(df)}  Cols: {len(df.columns)}")
    for r in ["USER ID","AUTHOR NAME","INSTITUTE","DEPARTMENT"]:
        if r not in df.columns:
            raise ValueError(f"Required column missing: {r}")
    print(f"  USER ID null count: {df['USER ID'].isna().sum()}")
    return df


# ─────────────────────────────────────────────────────────────
# Step 1 — Institutes
# ─────────────────────────────────────────────────────────────

def upsert_institutes(cur, df):
    banner("Step 1/4 — Institutes")
    ins = upd = skp = err = 0
    for name in tqdm(df["INSTITUTE"].dropna().unique(), desc="  institutes"):
        name = name.strip()
        try:
            cur.execute("""
                INSERT INTO public.institutes (name, short_name)
                VALUES (%s, %s)
                ON CONFLICT (name) DO UPDATE
                    SET short_name = EXCLUDED.short_name, updated_at = NOW()
                RETURNING id, (xmax = 0)
            """, (name, SHORT_MAP.get(name)))
            r = cur.fetchone()
            if r[1]: ins += 1
            else: upd += 1
        except Exception as e:
            err += 1; print(f"\n  ✗ institute '{name}': {e}")
    summary("institutes", ins, upd, skp, err)
    cur.execute("SELECT id, name FROM public.institutes")
    return {row[1]: row[0] for row in cur.fetchall()}


# ─────────────────────────────────────────────────────────────
# Step 2 — Departments
# ─────────────────────────────────────────────────────────────

def upsert_departments(cur, df, inst_map):
    banner("Step 2/4 — Departments")
    ins = upd = skp = err = 0
    pairs = df[["INSTITUTE","DEPARTMENT"]].dropna().drop_duplicates().values.tolist()
    for inst_name, dept_name in tqdm(pairs, desc="  departments"):
        inst_name = inst_name.strip()
        dept_name = norm_dept(dept_name)
        inst_id   = inst_map.get(inst_name)
        if not inst_id:
            skp += 1; continue
        try:
            cur.execute("""
                INSERT INTO public.departments (name, institute_id)
                VALUES (%s, %s)
                ON CONFLICT (name, institute_id) DO UPDATE SET updated_at = NOW()
                RETURNING id, (xmax = 0)
            """, (dept_name, inst_id))
            r = cur.fetchone()
            if r[1]: ins += 1
            else: upd += 1
        except Exception as e:
            err += 1; print(f"\n  ✗ dept '{dept_name}': {e}")
    summary("departments", ins, upd, skp, err)
    cur.execute("SELECT id, name, institute_id FROM public.departments")
    return {(r[1], r[2]): r[0] for r in cur.fetchall()}


# ─────────────────────────────────────────────────────────────
# Step 3 — Faculty
# ─────────────────────────────────────────────────────────────

def upsert_faculty(cur, df, inst_map, dept_map):
    banner("Step 3/4 — Faculty (739 rows)")
    ins = upd = skp = err = 0
    errs = []

    for _, row in tqdm(df.iterrows(), total=len(df), desc="  faculty"):
        ria_user_id = safe_int(row.get("USER ID"), default=None)
        if not ria_user_id: skp += 1; continue

        author_name = safe_str(row.get("AUTHOR NAME"))
        if not author_name: skp += 1; continue

        inst_name = safe_str(row.get("INSTITUTE"))
        dept_name = safe_str(row.get("DEPARTMENT"))
        if dept_name: dept_name = norm_dept(dept_name)

        inst_id = inst_map.get(inst_name)
        dept_id = dept_map.get((dept_name, inst_id)) if (dept_name and inst_id) else None

        if not inst_id:
            errs.append(f"  ✗ [{ria_user_id}] {author_name} — institute '{inst_name}' not found")
            err += 1; continue
        if not dept_id:
            errs.append(f"  ✗ [{ria_user_id}] {author_name} — dept '{dept_name}' in '{inst_name}' not found")
            err += 1; continue

        # employee_id: nullable
        emp_raw = row.get("EMPLOYEE ID")
        emp_id = None
        if emp_raw is not None and not (isinstance(emp_raw, float) and math.isnan(emp_raw)):
            emp_id = str(int(float(emp_raw)))

        data = {
            "employee_id":   emp_id,
            "ria_user_id":   ria_user_id,
            "author_name":   author_name,
            "department_id": dept_id,
            "institute_id":  inst_id,
        }
        for excel_col, db_col in METRIC_COL_MAP.items():
            val = row.get(excel_col)
            if db_col in INT_COLS:    data[db_col] = safe_int(val)
            elif db_col in FLOAT_COLS:data[db_col] = safe_float(val)

        cols = list(data.keys())
        vals = [data[c] for c in cols]
        upd_p = [f"{c} = EXCLUDED.{c}" for c in cols if c != "ria_user_id"]
        upd_p.append("updated_at = NOW()")

        sql = f"""
            INSERT INTO public.faculty ({', '.join(cols)})
            VALUES ({', '.join(['%s']*len(cols))})
            ON CONFLICT (ria_user_id) DO UPDATE SET {', '.join(upd_p)}
            RETURNING id, (xmax = 0)
        """
        try:
            cur.execute(sql, vals)
            r = cur.fetchone()
            if r[1]: ins += 1
            else: upd += 1
        except Exception as e:
            err += 1; errs.append(f"  ✗ [{ria_user_id}] {author_name} — {e}")

    summary("faculty", ins, upd, skp, err)
    for m in errs[:15]: print(m)
    if len(errs) > 15: print(f"  ... and {len(errs)-15} more")

    cur.execute("SELECT id, ria_user_id FROM public.faculty")
    return {r[1]: r[0] for r in cur.fetchall()}


# ─────────────────────────────────────────────────────────────
# Step 4 — Profiles
# ─────────────────────────────────────────────────────────────

def upsert_profiles(cur, df, faculty_map, inst_map, dept_map):
    banner("Step 4/4 — Profiles (skeleton rows)")
    ins = upd = skp = err = 0

    cur.execute("SELECT id, ria_user_id FROM public.profiles WHERE ria_user_id IS NOT NULL")
    existing = {r[1]: r[0] for r in cur.fetchall()}

    for _, row in tqdm(df.iterrows(), total=len(df), desc="  profiles"):
        ria_user_id = safe_int(row.get("USER ID"), default=None)
        if not ria_user_id: skp += 1; continue

        profile_id = existing.get(ria_user_id)
        if not profile_id: skp += 1; continue   # no auth.users row yet

        author_name = safe_str(row.get("AUTHOR NAME"))
        inst_name   = safe_str(row.get("INSTITUTE"))
        dept_name   = safe_str(row.get("DEPARTMENT"))
        if dept_name: dept_name = norm_dept(dept_name)

        inst_id    = inst_map.get(inst_name)
        dept_id    = dept_map.get((dept_name, inst_id)) if (dept_name and inst_id) else None
        faculty_id = faculty_map.get(ria_user_id)

        try:
            cur.execute("SAVEPOINT sp")
            cur.execute("""
                UPDATE public.profiles
                SET full_name     = %s,
                    role_level    = 'Faculty',
                    department_id = %s,
                    institute_id  = %s,
                    faculty_id    = %s,
                    updated_at    = NOW()
                WHERE id = %s
                RETURNING id
            """, (author_name, dept_id, inst_id, faculty_id, profile_id))
            r = cur.fetchone()
            cur.execute("RELEASE SAVEPOINT sp")
            if r: upd += 1
            else:  skp += 1
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp")
            cur.execute("RELEASE SAVEPOINT sp")
            err += 1; print(f"\n  ✗ profile [{ria_user_id}]: {e}")

    summary("profiles", ins, upd, skp, err)


# ─────────────────────────────────────────────────────────────
# Verify
# ─────────────────────────────────────────────────────────────

def verify(cur):
    banner("Verification")
    for t in ["institutes","departments","faculty","profiles"]:
        cur.execute(f"SELECT COUNT(*) FROM public.{t}")
        print(f"  {t:30s} {cur.fetchone()[0]:>6} rows")
    print()
    cur.execute("""
        SELECT f.author_name, d.name, i.name, f.total_pub_count
        FROM   public.faculty f
        JOIN   public.departments d ON d.id = f.department_id
        JOIN   public.institutes  i ON i.id = f.institute_id
        ORDER  BY f.total_pub_count DESC LIMIT 5
    """)
    print("  Top 5 by publication count:")
    for r in cur.fetchall():
        print(f"    {r[0][:35]:35s} | {r[1][:28]:28s} | pubs={r[3]}")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file", nargs="?", default=DEFAULT_XLSX)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"  ✗ File not found: {path}"); sys.exit(1)

    try:
        df = load_excel(str(path))
    except Exception as e:
        print(f"  ✗ {e}"); sys.exit(1)

    if args.dry_run:
        print("  ✔ Dry-run — no writes."); sys.exit(0)

    banner("Connecting to Supabase")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        cur = conn.cursor()
        print("  ✔ Connected")
    except Exception as e:
        print(f"  ✗ {e}"); sys.exit(1)

    t0 = time.time()
    try:
        inst_map    = upsert_institutes(cur, df);              conn.commit()
        dept_map    = upsert_departments(cur, df, inst_map);   conn.commit()
        faculty_map = upsert_faculty(cur, df, inst_map, dept_map); conn.commit()
        upsert_profiles(cur, df, faculty_map, inst_map, dept_map); conn.commit()
        verify(cur)
        print(f"\n  ✔ Done in {time.time()-t0:.1f}s")
    except Exception as e:
        conn.rollback()
        print("  ✗ Fatal — rolled back")
        traceback.print_exc(); sys.exit(1)
    finally:
        cur.close(); conn.close()
        print("  ✔ Connection closed\n")


if __name__ == "__main__":
    main()