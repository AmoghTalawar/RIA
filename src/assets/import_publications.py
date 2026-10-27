#!/usr/bin/env python3
"""
RIA Publications Import Script  v4
─────────────────────────────────────
Reads RIA_Publications.xlsx  →  populates ria schema via Supabase REST API:
  1. publications        (6,516 rows, upserted)
  2. faculty_publications (M:N links via STAFF USER ID integer FK only)

Connection: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  ‼  The anon key is READ-ONLY (RLS blocks inserts) — must use service_role.
     Find both in: Supabase dashboard → Settings → API

Key design decisions:
  • ID-based linking only — faculty linked by ria_user_id integer, not by author name.
    (Name matching has only 54% recall due to abbreviated forms in HOME AUTHORS.)
  • STAFF USER ID (present in 5,525 rows) is 100% reliable — all values match faculty.ria_user_id.
  • For the 991 UNMATCHED rows (no STAFF USER ID), no faculty_publications row is created.
  • authors:          pipe-separated  "A|B|C"    — already in source data
  • home_authors:     semicolon-sep   "A;B;C"    — already in source data
  • pub_date:         MM/DD/YYYY      built from YEAR + MONTH integers in source
  • q_rank_scopus:    Q1/Q2/Q3/Q4 ENUM — NULL means unranked
  • scs_citations:    NULL = not Scopus-indexed; 0 = indexed with 0 citations

Usage:
    pip install supabase pandas openpyxl tqdm python-dotenv
    python import_publications.py
    python import_publications.py /path/to/RIA_Publications.xlsx --dry-run
"""

from __future__ import annotations   # str | None works on Python 3.7+

import sys
import math
import time
import argparse
import os
from pathlib import Path
from collections import Counter

import pandas as pd
from tqdm import tqdm

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, ClientOptions

BATCH_SIZE   = 500
DEFAULT_XLSX = "RIA_Publications.xlsx"

# Truncate values to match schema VARCHAR limits before inserting
VARCHAR_LIMITS: dict[str, int] = {
    "vol_no":   20,
    "iss_no":   20,
    "b_page":   20,
    "e_page":   20,
    "p_issn":   20,
    "e_issn":   20,
    "p_isbn":   30,
    "e_isbn":   30,
    "pub_date": 10,
}

SIMPLE_TEXT_COLS = {
    "AUTHORS":               "authors",
    "HOME AUTHORS":          "home_authors",
    "HOME AUTHOR DEPARTMENT":"home_author_department",
    "HOME AUTHOR INSTITUTE": "home_author_institute",
    "HOME AUTHOR SCHOOL":    "home_author_school",
    "HOME AUTHOR LOCATION":  "home_author_location",
    "AUTHOR ADDRESS":        "author_address",
    "SOURCE PUBLICATION":    "source_publication",
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
    "A ": "A",  "B ": "B", "C ": "C",
}
Q_RANK_MAP = {"Q1": "Q1", "Q2": "Q2", "Q3": "Q3", "Q4": "Q4"}


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
    i = safe_int(val)
    return None if i is None else bool(i)


def make_pub_date(year_val, month_val) -> str | None:
    """Build MM/DD/YYYY from source YEAR (int) and MONTH (int)."""
    y = safe_int(year_val)
    m = safe_int(month_val)
    if y is None or not (1900 <= y <= 2100):
        return None
    if m is None or not (1 <= m <= 12):
        m = 1
    return f"{m:02d}/01/{y}"


def banner(text):
    print(f"\n{'─'*60}\n  {text}\n{'─'*60}")


# ─────────────────────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────────────────────

def load_excel(path: str) -> pd.DataFrame:
    banner(f"Loading: {path}")
    df = pd.read_excel(path, sheet_name="Publications", dtype=str)
    df.columns = [c.strip() for c in df.columns]
    print(f"  Rows: {len(df):,}   Cols: {len(df.columns)}")
    for r in ["PUB ID", "PUBLICATION TITLE"]:
        if r not in df.columns:
            raise ValueError(f"Required column missing: {r}")
    return df


# ─────────────────────────────────────────────────────────────
# Step 1 — Publications
# ─────────────────────────────────────────────────────────────

def upsert_publications(client, df: pd.DataFrame) -> dict:
    """Upsert all publications; return {pub_id_int: uuid}."""
    banner("Step 1/2 — Publications (6,516 rows)")

    rows_to_upsert = []
    skp = 0

    for _, row in df.iterrows():
        pub_id = safe_int(row.get("PUB ID"))
        if pub_id is None:
            skp += 1
            continue

        title = safe_str(row.get("PUBLICATION TITLE")) or safe_str(row.get("SOURCE PUBLICATION"))
        if not title:
            skp += 1
            continue

        pub_date     = make_pub_date(row.get("YEAR"), row.get("MONTH"))
        article_type = ARTICLE_TYPE_MAP.get(safe_str(row.get("ARTICLE TYPE")))
        level        = LEVEL_MAP.get(safe_str(row.get("LEVEL")))
        abdc_raw     = safe_str(row.get("ABDC"))
        abdc_grade   = ABDC_MAP.get(abdc_raw) if abdc_raw else None

        def ci(col):
            return safe_int(row.get(col))

        is_sci        = True if safe_str(row.get("SCI"))       in ("YES",)        else None
        is_pm         = True if safe_str(row.get("PM"))         in ("INDEXED",)    else None
        is_ugc        = True if safe_str(row.get("UGC"))        in ("YES","YES-C") else None
        is_ugc_group1 = True if safe_str(row.get("UGC GROUP1")) in ("YES",)        else None

        nirf       = safe_bool_from_int(row.get("NIRF"))
        naac       = safe_bool_from_int(row.get("NAAC"))
        qs         = safe_bool_from_int(row.get("QS"))
        the        = safe_bool_from_int(row.get("THE"))
        is_indexed = safe_bool_from_int(row.get("IsIndexed"))

        data: dict = {
            "pub_id":             pub_id,
            "title":              title,
            "pub_date":           pub_date,
            "article_type":       article_type,
            "level":              level,
            "abdc_grade":         abdc_grade,
            "scs_citations":      ci("SCS"),
            "wos_citations_pub":  ci("WOS"),
            "ieee_citations":     ci("IEEE"),
            "gs_citations_pub":   ci("GS"),
            "is_sci":             is_sci,
            "is_pm":              is_pm,
            "is_ugc":             is_ugc,
            "is_ugc_group1":      is_ugc_group1,
            "nirf":               nirf      if nirf      is not None else False,
            "naac":               naac      if naac      is not None else False,
            "qs":                 qs        if qs        is not None else False,
            "the":                the       if the       is not None else False,
            "is_indexed":         is_indexed if is_indexed is not None else False,
            "q_rank_scopus":      Q_RANK_MAP.get(safe_str(row.get("Q RANK(SCS)"))),
            "q_rank_wos":         Q_RANK_MAP.get(safe_str(row.get("Q RANK(WOS)"))),
            "snip":               safe_float(row.get("SNIP")),
            "sjr":                safe_float(row.get("SJR")),
            "impact_factor":      safe_float(row.get("IF")),
            "cite_score":         safe_float(row.get("CITE SCORE")),
            "staff_ria_user_id":  safe_int(row.get("STAFF USER ID")),
        }

        for src_col, db_col in SIMPLE_TEXT_COLS.items():
            v = safe_str(row.get(src_col))
            if v:
                data[db_col] = v

        # Strip None — don't overwrite existing data with NULL on conflict
        data = {k: v for k, v in data.items() if v is not None}
        # Ensure boolean false fields are always present
        for bool_col in ("nirf", "naac", "qs", "the", "is_indexed"):
            if bool_col not in data:
                data[bool_col] = False
        # Truncate to schema VARCHAR limits
        for col, limit in VARCHAR_LIMITS.items():
            if col in data and isinstance(data[col], str):
                data[col] = data[col][:limit]

        rows_to_upsert.append(data)

    # Deduplicate by pub_id — Excel may have duplicate rows for the same publication
    before = len(rows_to_upsert)
    seen: dict[int, dict] = {}
    for data in rows_to_upsert:
        seen[data["pub_id"]] = data
    rows_to_upsert = list(seen.values())
    print(f"  After dedup: {len(rows_to_upsert)} unique pub_ids  (dupes removed: {before - len(rows_to_upsert)})")

    pub_map: dict[int, str] = {}
    total = err = 0
    errs = []

    for i in tqdm(range(0, len(rows_to_upsert), BATCH_SIZE), desc="  publications batches"):
        chunk = rows_to_upsert[i : i + BATCH_SIZE]
        try:
            resp = client.table("publications").upsert(chunk, on_conflict="pub_id").execute()
            for r in resp.data:
                pub_map[r["pub_id"]] = r["id"]
            total += len(resp.data)
        except Exception as e:
            errs.append(f"  ✗ batch {i // BATCH_SIZE} — {str(e)[:80]}")
            err += len(chunk)

    print(f"  ✔  publications  upserted={total}  skipped={skp}  errors={err}")
    for m in errs[:15]:
        print(m)
    return pub_map


# ─────────────────────────────────────────────────────────────
# Step 2 — Faculty_Publications (M:N)
# ─────────────────────────────────────────────────────────────

def link_faculty_publications(client, df: pd.DataFrame, pub_map: dict) -> None:
    """
    Build M:N links using STAFF USER ID integer FK only.

    STAFF USER ID present (5,525 rows / 85%):
        Look up faculty.id by ria_user_id = STAFF USER ID.
        is_corresponding = TRUE (this faculty is the primary author).
    STAFF USER ID absent (991 rows / 15%):
        No junction row created — these are genuinely unmatched.

    Name matching via HOME AUTHORS is not attempted:
        Abbreviated forms have only ~54% recall against faculty.author_name.
        All STAFF USER IDs are confirmed present in faculty.ria_user_id (100% match).
    """
    banner("Step 2/2 — Faculty-Publications M:N Links (ID-based)")

    fac_rows = fetch_all(client, "faculty", "id,ria_user_id")
    fac_map = {r["ria_user_id"]: r["id"] for r in fac_rows}
    print(f"  Faculty loaded: {len(fac_map)} rows")

    junctions = []
    skp = err = 0
    errs = []

    for _, row in df.iterrows():
        pub_id_int = safe_int(row.get("PUB ID"))
        if not pub_id_int or pub_id_int not in pub_map:
            skp += 1
            continue

        staff_uid = safe_int(row.get("STAFF USER ID"))
        if not staff_uid:
            skp += 1
            continue

        fac_uuid = fac_map.get(staff_uid)
        if not fac_uuid:
            errs.append(f"  ✗ pub_id={pub_id_int} — ria_user_id {staff_uid} not in faculty table")
            err += 1
            continue

        junctions.append({
            "faculty_id":       fac_uuid,
            "publication_id":   pub_map[pub_id_int],
            "is_corresponding": True,
        })

    # Deduplicate by (faculty_id, publication_id)
    before = len(junctions)
    seen_pairs: dict[tuple, dict] = {}
    for j in junctions:
        seen_pairs[(j["faculty_id"], j["publication_id"])] = j
    junctions = list(seen_pairs.values())
    if before != len(junctions):
        print(f"  Dupes removed: {before - len(junctions)}")

    total = 0
    batch_errs = []
    for i in tqdm(range(0, len(junctions), BATCH_SIZE), desc="  faculty_pub batches"):
        chunk = junctions[i : i + BATCH_SIZE]
        try:
            resp = client.table("faculty_publications").upsert(
                chunk, on_conflict="faculty_id,publication_id"
            ).execute()
            total += len(resp.data)
        except Exception as e:
            batch_errs.append(f"  ✗ batch {i // BATCH_SIZE} — {str(e)[:80]}")

    print(f"  ✔  faculty_publications  upserted={total}  skipped={skp}  errors={err}")
    for m in (errs + batch_errs)[:15]:
        print(m)
    if len(errs) + len(batch_errs) > 15:
        print(f"  ... and {len(errs) + len(batch_errs) - 15} more errors")


# ─────────────────────────────────────────────────────────────
# Verify
# ─────────────────────────────────────────────────────────────

def verify(client):
    banner("Verification")

    for t in ["publications", "faculty_publications"]:
        resp = client.table(t).select("id", count="exact").execute()
        print(f"  {t:32s} {resp.count:>7,} rows")

    resp = (
        client.table("faculty_publications")
        .select("id", count="exact")
        .eq("is_corresponding", True)
        .execute()
    )
    print(f"  {'(is_corresponding=TRUE)':32s} {resp.count:>7,} rows")

    print()
    rows = fetch_all(client, "publications", "article_type")
    breakdown = Counter(r.get("article_type") or "None" for r in rows)
    print("  Breakdown by article_type:")
    for at, n in breakdown.most_common():
        print(f"    {str(at):20s} {n:>5,}")

    print()
    fp_rows  = fetch_all(client, "faculty_publications", "faculty_id")
    fac_counts = Counter(r["faculty_id"] for r in fp_rows)
    fac_data = fetch_all(client, "faculty", "id,author_name")
    fac_names = {r["id"]: r["author_name"] for r in fac_data}
    print("  Top 5 faculty by linked publication count:")
    for fid, n in fac_counts.most_common(5):
        print(f"    {fac_names.get(fid, '?')[:40]:40s} {n:>5,} pubs")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Import RIA_Publications.xlsx → Supabase ria schema"
    )
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
    pub_map = upsert_publications(client, df)
    link_faculty_publications(client, df, pub_map)
    verify(client)
    print(f"\n  ✔ Done in {time.time() - t0:.1f}s\n")


if __name__ == "__main__":
    main()
