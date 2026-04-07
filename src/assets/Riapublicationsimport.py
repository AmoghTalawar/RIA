#!/usr/bin/env python3
"""
RIA Publications Import Script  v3
────────────────────────────────────
Reads RIA_Publications.xlsx  →  populates:
  1. publications          (6,516 rows)
  2. faculty_publications  (M:N links via STAFF USER ID integer FK only)

Key design decisions (schema v3):
  • ID-based linking only — faculty linked by ria_user_id integer, not by author name.
    (Name matching has only 54% recall due to abbreviated forms in HOME AUTHORS.)
  • STAFF USER ID (present in 5,525 rows) is 100% reliable — all values match faculty.ria_user_id.
  • For the 991 UNMATCHED rows (no STAFF USER ID), no faculty_publications row is created.
  • match_method and match_source are NOT imported (removed from schema).
  • authors:         pipe-separated  "A|B|C"    — already in source data
  • home_authors:    semicolon-sep   "A;B;C"    — already in source data
  • technology_areas: comma-sep       "X,Y,Z"   — already in source data;
                     "Not Available" preserved as-is
  • pub_date:        MM/DD/YYYY      built from YEAR + MONTH integers in source
  • SCS/WOS/IEEE/GS: INTEGER citation counts (not booleans)
  • ABDC:            abdc_grade_t enum (A*, A, B, C)
  • NIRF/NAAC/QS/THE/IsIndexed: BOOLEAN (source: 0/1 integers)

Usage:
    pip install psycopg2-binary pandas openpyxl tqdm
    python ria_publications_import_v3.py
    python ria_publications_import_v3.py /path/to/RIA_Publications.xlsx --dry-run
"""

import sys
import math
import time
import argparse
import traceback
from pathlib import Path

import pandas as pd
import psycopg2
from tqdm import tqdm

# ── Supabase local DB ────────────────────────────────────────
DB_CONFIG = {
    "host": "127.0.0.1", "port": 54322,
    "dbname": "postgres", "user": "postgres", "password": "postgres",
}
DEFAULT_XLSX = "RIA_Publications.xlsx"

# Source column → DB column for straightforward mappings
# (complex columns handled inline in the row loop)
SIMPLE_TEXT_COLS = {
    "AUTHORS":               "authors",
    "HOME AUTHORS":          "home_authors",
    "HOME AUTHOR DEPARTMENT":"home_author_department",
    "HOME AUTHOR INSTITUTE": "home_author_institute",
    "HOME AUTHOR SCHOOL":    "home_author_school",
    "HOME AUTHOR LOCATION":  "home_author_location",
    "AUTHOR ADDRESS":        "author_address",
    "SOURCE PUBLICATION":    "source_publication",
    "AUTHOR ADDRESS":        "author_address",
    "VOL NO":                "vol_no",
    "ISS NO":                "iss_no",
    "B PAGE":                "b_page",
    "E PAGE":                "e_page",
    "DOI":                   "doi",
    "LINK":                  "link",
    "ABSTRACT":              "abstract",
    "TECHNOLOGYAREAS":       "technology_areas",
    "P ISSN":                "p_issn",
    "E ISSN":                "e_issn",
    "P ISBN":                "p_isbn",
    "E ISBN":                "e_isbn",
    "MATCHED INSTITUTE":     "matched_institute",
    "MATCHED DEPARTMENT":    "matched_department",
}

ARTICLE_TYPE_MAP = {
    "Journal":       "Journal",
    "Conference":    "Conference",
    "Book Chapter":  "Book Chapter",
    "Book":          "Book",
    "PrePrint":      "PrePrint",
    "Working Paper": "Working Paper",
}
LEVEL_MAP = {
    "International": "International",
    "National":      "National",
}
ABDC_MAP = {
    "A*": "A*", "A": "A", "B": "B", "C": "C",
    "A ": "A",  "B ": "B", "C ": "C",        # strip trailing spaces
}
Q_RANK_MAP = {"Q1": "Q1", "Q2": "Q2", "Q3": "Q3", "Q4": "Q4"}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def safe_int(val, default=None):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return default
        return int(float(val))
    except (ValueError, TypeError):
        return default


def safe_float(val):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return None
        f = float(val)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None


def safe_str(val, default=None):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return default
    s = str(val).strip()
    return s if s else default


def safe_bool_from_int(val):
    """Convert 0/1 integer column to Python bool. None if missing."""
    i = safe_int(val)
    if i is None:
        return None
    return bool(i)


def make_pub_date(year_val, month_val) -> str | None:
    """Build MM/DD/YYYY from source YEAR (int) and MONTH (int)."""
    y = safe_int(year_val)
    m = safe_int(month_val)
    if y is None or not (1900 <= y <= 2100):
        return None
    if m is None or not (1 <= m <= 12):
        m = 1          # default to January when month is missing/invalid
    return f"{m:02d}/01/{y}"   # day 01 — source has no day field


def banner(text):
    print(f"\n{'─'*60}\n  {text}\n{'─'*60}")


def summary(label, ins, upd, skp, err):
    print(f"  ✔  {label:32s} inserted={ins:5d} updated={upd:5d} skipped={skp:4d} errors={err:4d}")


# ─────────────────────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────────────────────

def load_excel(path: str) -> pd.DataFrame:
    banner(f"Loading: {path}")
    df = pd.read_excel(path, sheet_name="Publications", dtype=str)
    df.columns = [c.strip() for c in df.columns]
    print(f"  Rows: {len(df):,}   Cols: {len(df.columns)}")
    required = ["PUB ID", "PUBLICATION TITLE"]
    for r in required:
        if r not in df.columns:
            raise ValueError(f"Required column missing: {r}")
    return df


# ─────────────────────────────────────────────────────────────
# Step 1 — Publications
# ─────────────────────────────────────────────────────────────

def upsert_publications(cur, df: pd.DataFrame) -> dict:
    """Upsert all publications; return {pub_id_int: uuid}."""
    banner("Step 1/2 — Publications (6,516 rows)")

    ins = upd = skp = err = 0
    pub_map = {}
    errs = []

    for _, row in tqdm(df.iterrows(), total=len(df), desc="  publications"):

        # ── Required: pub_id and title ───────────────────────
        pub_id = safe_int(row.get("PUB ID"))
        if pub_id is None:
            skp += 1; continue

        title = safe_str(row.get("PUBLICATION TITLE")) or safe_str(row.get("SOURCE PUBLICATION"))
        if not title:
            skp += 1; continue

        # ── Date: MM/DD/YYYY from YEAR + MONTH ───────────────
        pub_date = make_pub_date(row.get("YEAR"), row.get("MONTH"))

        # ── Article type and level (enum-safe) ───────────────
        article_type = ARTICLE_TYPE_MAP.get(safe_str(row.get("ARTICLE TYPE")))
        level        = LEVEL_MAP.get(safe_str(row.get("LEVEL")))

        # ── ABDC grade (enum — not boolean) ──────────────────
        abdc_raw = safe_str(row.get("ABDC"))
        abdc_grade = ABDC_MAP.get(abdc_raw) if abdc_raw else None

        # ── Citation counts (INTEGER, not boolean) ────────────
        # NULL = not indexed; 0 = indexed with 0 citations
        def ci(col):
            v = row.get(col)
            return safe_int(v)    # preserves 0; returns None if blank/nan

        scs_citations    = ci("SCS")
        wos_citations_pub= ci("WOS")
        ieee_citations   = ci("IEEE")
        gs_citations_pub = ci("GS")

        # ── Boolean indexing flags ────────────────────────────
        is_sci       = True if safe_str(row.get("SCI"))       in ("YES",)      else None
        is_pm        = True if safe_str(row.get("PM"))         in ("INDEXED",)  else None
        is_ugc       = True if safe_str(row.get("UGC"))        in ("YES","YES-C") else None
        is_ugc_group1= True if safe_str(row.get("UGC GROUP1")) in ("YES",)      else None

        # ── Ranking / indexed flags (0/1 → bool) ─────────────
        nirf       = safe_bool_from_int(row.get("NIRF"))
        naac       = safe_bool_from_int(row.get("NAAC"))
        qs         = safe_bool_from_int(row.get("QS"))
        the        = safe_bool_from_int(row.get("THE"))
        is_indexed = safe_bool_from_int(row.get("IsIndexed"))

        # ── Q ranks ───────────────────────────────────────────
        q_rank_scopus = Q_RANK_MAP.get(safe_str(row.get("Q RANK(SCS)")))
        q_rank_wos    = Q_RANK_MAP.get(safe_str(row.get("Q RANK(WOS)")))

        # ── Integer FK to faculty (ID-based) ─────────────────
        staff_ria_user_id = safe_int(row.get("STAFF USER ID"))

        # ── Build data dict ───────────────────────────────────
        data = {
            "pub_id":                pub_id,
            "title":                 title,
            "pub_date":              pub_date,
            "article_type":          article_type,
            "level":                 level,
            "abdc_grade":            abdc_grade,
            "scs_citations":         scs_citations,
            "wos_citations_pub":     wos_citations_pub,
            "ieee_citations":        ieee_citations,
            "gs_citations_pub":      gs_citations_pub,
            "is_sci":                is_sci,
            "is_pm":                 is_pm,
            "is_ugc":                is_ugc,
            "is_ugc_group1":         is_ugc_group1,
            "nirf":                  nirf if nirf is not None else False,
            "naac":                  naac if naac is not None else False,
            "qs":                    qs   if qs   is not None else False,
            "the":                   the  if the  is not None else False,
            "is_indexed":            is_indexed if is_indexed is not None else False,
            "q_rank_scopus":         q_rank_scopus,
            "q_rank_wos":            q_rank_wos,
            "snip":                  safe_float(row.get("SNIP")),
            "sjr":                   safe_float(row.get("SJR")),
            "impact_factor":         safe_float(row.get("IF")),
            "cite_score":            safe_float(row.get("CITE SCORE")),
            "staff_ria_user_id":     staff_ria_user_id,
        }

        # Simple text columns
        for src_col, db_col in SIMPLE_TEXT_COLS.items():
            v = safe_str(row.get(src_col))
            if v:
                data[db_col] = v

        # Strip None values so we don't accidentally overwrite with NULL on conflict
        data = {k: v for k, v in data.items() if v is not None}
        # But keep boolean false fields
        for bool_col in ("nirf","naac","qs","the","is_indexed"):
            if bool_col not in data:
                data[bool_col] = False

        cols    = list(data.keys())
        vals    = [data[c] for c in cols]
        upd_set = [f"{c} = EXCLUDED.{c}" for c in cols if c != "pub_id"]
        upd_set.append("updated_at = NOW()")

        sql = f"""
            INSERT INTO public.publications ({', '.join(cols)})
            VALUES ({', '.join(['%s']*len(cols))})
            ON CONFLICT (pub_id) DO UPDATE SET {', '.join(upd_set)}
            RETURNING id, (xmax = 0)
        """
        try:
            cur.execute("SAVEPOINT sp_pub")
            cur.execute(sql, vals)
            r = cur.fetchone()
            pub_map[pub_id] = r[0]
            if r[1]: ins += 1
            else:    upd += 1
            cur.execute("RELEASE SAVEPOINT sp_pub")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp_pub")
            cur.execute("RELEASE SAVEPOINT sp_pub")
            err += 1
            errs.append(f"  ✗ pub_id={pub_id} '{str(title)[:50]}' — {str(e)[:80]}")

    summary("publications", ins, upd, skp, err)
    for m in errs[:15]: print(m)
    if len(errs) > 15: print(f"  ... and {len(errs)-15} more errors")
    return pub_map


# ─────────────────────────────────────────────────────────────
# Step 2 — Faculty_Publications (M:N)
# ─────────────────────────────────────────────────────────────

def link_faculty_publications(cur, df: pd.DataFrame, pub_map: dict) -> None:
    """
    Build M:N links using STAFF USER ID integer FK only.

    Strategy:
      - STAFF USER ID present (5,525 rows / 85%):
          Look up faculty.id by ria_user_id = STAFF USER ID.
          is_corresponding = TRUE (this faculty is the primary author).
      - STAFF USER ID absent (991 rows / 15%):
          No junction row created — these are genuinely unmatched.

    We do NOT attempt name-matching via HOME AUTHORS because:
      - Names in HOME AUTHORS use abbreviated forms (e.g. "Banapurmath N R")
        while faculty.author_name has full names ("Nalinadev Raghavendra Banapurmath")
      - Name match recall is only ~54% — unreliable for data integrity
      - All STAFF USER IDs are confirmed present in faculty.ria_user_id (100% match)
    """
    banner("Step 2/2 — Faculty-Publications M:N Links (ID-based)")

    # Build faculty lookup: ria_user_id → faculty.id (UUID)
    cur.execute("SELECT id, ria_user_id FROM public.faculty")
    fac_map = {row[1]: row[0] for row in cur.fetchall()}
    print(f"  Faculty loaded: {len(fac_map)} rows")

    ins = upd = skp = err = 0
    errs = []

    for _, row in tqdm(df.iterrows(), total=len(df), desc="  faculty_publications"):
        pub_id_int = safe_int(row.get("PUB ID"))
        if not pub_id_int or pub_id_int not in pub_map:
            skp += 1; continue

        staff_uid = safe_int(row.get("STAFF USER ID"))
        if not staff_uid:
            skp += 1; continue       # UNMATCHED — no reliable ID, skip

        fac_uuid = fac_map.get(staff_uid)
        if not fac_uuid:
            errs.append(f"  ✗ pub_id={pub_id_int} — ria_user_id {staff_uid} not in faculty table")
            err += 1; continue

        pub_uuid = pub_map[pub_id_int]

        try:
            cur.execute("SAVEPOINT sp_fp")
            cur.execute("""
                INSERT INTO public.faculty_publications
                    (faculty_id, publication_id, is_corresponding)
                VALUES (%s, %s, TRUE)
                ON CONFLICT (faculty_id, publication_id) DO UPDATE
                    SET is_corresponding = TRUE,
                        updated_at       = NOW()
                RETURNING id, (xmax = 0)
            """, (fac_uuid, pub_uuid))
            r = cur.fetchone()
            if r[1]: ins += 1
            else:    upd += 1
            cur.execute("RELEASE SAVEPOINT sp_fp")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp_fp")
            cur.execute("RELEASE SAVEPOINT sp_fp")
            err += 1
            errs.append(f"  ✗ pub_id={pub_id_int} uid={staff_uid} — {str(e)[:70]}")

    summary("faculty_publications", ins, upd, skp, err)
    for m in errs[:15]: print(m)
    if len(errs) > 15: print(f"  ... and {len(errs)-15} more errors")


# ─────────────────────────────────────────────────────────────
# Verify
# ─────────────────────────────────────────────────────────────

def verify(cur):
    banner("Verification")

    for t, label in [
        ("publications",       "publications"),
        ("faculty_publications","faculty_publications"),
    ]:
        cur.execute(f"SELECT COUNT(*) FROM public.{t}")
        print(f"  {label:32s} {cur.fetchone()[0]:>7,} rows")

    cur.execute("""
        SELECT COUNT(*) FROM public.faculty_publications WHERE is_corresponding
    """)
    print(f"  {'(is_corresponding=TRUE)':32s} {cur.fetchone()[0]:>7,} rows")

    print()
    cur.execute("""
        SELECT article_type, COUNT(*) n
        FROM   public.publications
        GROUP  BY article_type ORDER BY n DESC
    """)
    print("  Breakdown by article_type:")
    for at, n in cur.fetchall():
        print(f"    {str(at):20s} {n:>5,}")

    print()
    cur.execute("""
        SELECT p.pub_date, p.year, p.month, p.title
        FROM   public.publications p
        WHERE  p.pub_date IS NOT NULL
        LIMIT  3
    """)
    print("  Sample pub_date → year/month (GENERATED columns):")
    for pd_val, yr, mo, t in cur.fetchall():
        print(f"    pub_date={pd_val}  year={yr}  month={mo}  title={str(t)[:40]}")

    print()
    cur.execute("""
        SELECT f.author_name, COUNT(fp.publication_id) n
        FROM   public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        GROUP  BY f.id, f.author_name
        ORDER  BY n DESC LIMIT 5
    """)
    print("  Top 5 faculty by linked publication count:")
    for name, n in cur.fetchall():
        print(f"    {name[:40]:40s} {n:>5,} pubs")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Import RIA_Publications.xlsx → Supabase v3 schema"
    )
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
        print("  ✔ Dry-run — no DB writes."); sys.exit(0)

    banner("Connecting to Supabase")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        cur = conn.cursor()
        print("  ✔ Connected to postgresql://127.0.0.1:54322/postgres")
    except Exception as e:
        print(f"  ✗ {e}"); sys.exit(1)

    t0 = time.time()
    try:
        pub_map = upsert_publications(cur, df);       conn.commit()
        link_faculty_publications(cur, df, pub_map);  conn.commit()
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