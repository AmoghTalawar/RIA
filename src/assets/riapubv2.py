#!/usr/bin/env python3
"""
RIA Faculty-Publications Junction Rebuild  v2  (FINAL)
───────────────────────────────────────────────────────
Rebuilds faculty_publications using ALL user IDs from AUTHOR ADDRESS.
Handles every edge case found in the data audit.

COVERAGE ANALYSIS (from source data):
  Total publications        : 6,516
  Fully linked via ADDR UIDs: 5,521  (85%) — primary method
  Edge case (STAFF UID only): 4      (<1%) — NAME-matched, no ADDR UIDs
  Truly unmatched           : 991    (15%) — no KLE faculty UIDs anywhere
  Faculty with 0 ADDR links : 6      — have pubs in Excel but no UIDs in ADDR

MAPPING STRATEGY (in priority order):
  1. AUTHOR ADDRESS UIDs  → extract [USERID] from address text
     is_corresponding = TRUE  if uid == STAFF USER ID
     is_corresponding = FALSE for all other co-author UIDs
  2. STAFF USER ID fallback → 4 pubs where MATCH SOURCE = NAME (no ADDR UIDs)
     is_corresponding = TRUE
  3. Unmatched (991 pubs)  → no junction row created (no reliable ID available)

KNOWN LIMITATIONS (cannot fix without new source data):
  - 991 pubs have no KLE faculty IDs anywhere in AUTHOR ADDRESS
    These are faculty whose affiliation address was not properly tagged
    in the source system. Their HOME AUTHORS name is known but no [USERID]
    exists in AUTHOR ADDRESS. Without a [USERID], pure ID-based linking
    is impossible.
  - 6 faculty have publications counted in Excel but no [USERID] tags
    in any publication's AUTHOR ADDRESS field. Their pub counts in the
    faculty table are correct (from Excel) but junction rows cannot be
    created without name matching or manual tagging.

Run after ria_publications_import_v3.py (publications table must exist first).
Safe to re-run — uses ON CONFLICT DO UPDATE (idempotent).

Usage:
    python ria_rebuild_junction.py
    python ria_rebuild_junction.py /path/to/RIA_Publications.xlsx
    python ria_rebuild_junction.py RIA_Publications.xlsx --dry-run
"""

import sys, re, math, time, argparse, traceback
from pathlib import Path

import pandas as pd
import psycopg2
from tqdm import tqdm

DB_CONFIG = {
    "host": "127.0.0.1", "port": 54322,
    "dbname": "postgres", "user": "postgres", "password": "postgres",
}
DEFAULT_XLSX = "Development\DB\RIA_Publications.xlsx"

# Regex: extracts [USERID] from AUTHOR ADDRESS — e.g. "[232727]"
USERID_RE = re.compile(r'\[(\d{5,7})\]')


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

def banner(t): print(f"\n{'─'*60}\n  {t}\n{'─'*60}")

def summary(label, ins, upd, skp, err):
    print(f"  ✔  {label:32s} inserted={ins:6d} updated={upd:6d} skipped={skp:5d} errors={err:4d}")


# ─────────────────────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────────────────────

def load_excel(path: str) -> pd.DataFrame:
    banner(f"Loading: {path}")
    df = pd.read_excel(path, sheet_name="Publications", dtype=str)
    df.columns = [c.strip() for c in df.columns]
    print(f"  Rows: {len(df):,}   Cols: {len(df.columns)}")
    for req in ["PUB ID", "AUTHOR ADDRESS", "STAFF USER ID"]:
        if req not in df.columns:
            raise ValueError(f"Required column missing: {req}")
    return df


# ─────────────────────────────────────────────────────────────
# Core: rebuild junction
# ─────────────────────────────────────────────────────────────

def rebuild_junction(cur, df: pd.DataFrame) -> None:
    banner("Rebuilding faculty_publications (ID-based, all edge cases handled)")

    # Load faculty: ria_user_id → faculty UUID
    cur.execute("SELECT ria_user_id, id FROM public.faculty")
    fac_map = {row[0]: row[1] for row in cur.fetchall()}
    print(f"  Faculty in DB      : {len(fac_map):,}")

    # Load publications: pub_id (integer) → publication UUID
    cur.execute("SELECT pub_id, id FROM public.publications")
    pub_map = {row[0]: row[1] for row in cur.fetchall()}
    print(f"  Publications in DB : {len(pub_map):,}")

    ins = upd = skp = 0
    err = 0
    errs = []

    # Tracking counters
    method_addr  = 0   # linked via AUTHOR ADDRESS UIDs
    method_staff = 0   # linked via STAFF USER ID fallback
    truly_unmatched = 0

    for _, row in tqdm(df.iterrows(), total=len(df), desc="  linking"):

        pub_id_int = safe_int(row.get("PUB ID"))
        if not pub_id_int or pub_id_int not in pub_map:
            skp += 1
            continue

        pub_uuid  = pub_map[pub_id_int]
        staff_uid = safe_int(row.get("STAFF USER ID"))

        # ── Method 1: Extract ALL UIDs from AUTHOR ADDRESS ──
        addr     = str(row.get("AUTHOR ADDRESS", ""))
        raw_uids = USERID_RE.findall(addr)

        # Deduplicate preserving order
        seen, all_uids = set(), []
        for u in raw_uids:
            u_int = int(u)
            if u_int not in seen:
                seen.add(u_int)
                all_uids.append(u_int)

        # Keep only UIDs that exist in our faculty table
        valid_uids = [u for u in all_uids if u in fac_map]

        # ── Method 2: STAFF USER ID fallback ────────────────
        # Used for 4 pubs where MATCH SOURCE=NAME and AUTHOR ADDRESS
        # has no [USERID] tags but STAFF USER ID is populated
        if not valid_uids and staff_uid and staff_uid in fac_map:
            valid_uids = [staff_uid]
            method_staff += 1
        elif valid_uids:
            method_addr += 1
        else:
            truly_unmatched += 1
            skp += 1
            continue

        # ── Insert one junction row per valid UID ────────────
        for uid in valid_uids:
            fac_uuid = fac_map[uid]

            # is_corresponding TRUE only for the primary matched author
            is_corr = (uid == staff_uid)

            try:
                cur.execute("SAVEPOINT sp_fp")
                cur.execute("""
                    INSERT INTO public.faculty_publications
                        (faculty_id, publication_id, is_corresponding)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (faculty_id, publication_id) DO UPDATE
                        SET is_corresponding = EXCLUDED.is_corresponding,
                            updated_at       = NOW()
                    RETURNING id, (xmax = 0)
                """, (fac_uuid, pub_uuid, is_corr))
                r = cur.fetchone()
                if r[1]: ins += 1
                else:    upd += 1
                cur.execute("RELEASE SAVEPOINT sp_fp")
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT sp_fp")
                cur.execute("RELEASE SAVEPOINT sp_fp")
                err += 1
                errs.append(
                    f"  ✗ pub_id={pub_id_int} uid={uid} — {str(e)[:70]}"
                )

    summary("faculty_publications", ins, upd, skp, err)
    print()
    print(f"  Linked via AUTHOR ADDRESS UIDs : {method_addr:,}")
    print(f"  Linked via STAFF UID fallback  : {method_staff:,}  (4 NAME-matched pubs)")
    print(f"  Truly unmatched (no IDs found) : {truly_unmatched:,}  (expected: 991)")

    if errs:
        print("\n  Errors:")
        for m in errs[:10]: print(m)
        if len(errs) > 10:
            print(f"  ... and {len(errs)-10} more")


# ─────────────────────────────────────────────────────────────
# Verify
# ─────────────────────────────────────────────────────────────

def verify(cur):
    banner("Verification")

    cur.execute("SELECT COUNT(*) FROM public.faculty_publications")
    total = cur.fetchone()[0]
    print(f"  Total junction rows           : {total:>7,}  (expected ≈ 9,669)")

    cur.execute("SELECT COUNT(*) FROM public.faculty_publications WHERE is_corresponding")
    corr = cur.fetchone()[0]
    print(f"  is_corresponding = TRUE       : {corr:>7,}  (primary authors)")

    cur.execute("SELECT COUNT(*) FROM public.faculty_publications WHERE NOT is_corresponding")
    coauth = cur.fetchone()[0]
    print(f"  is_corresponding = FALSE      : {coauth:>7,}  (co-authors)")

    print()
    # Known test cases
    test_cases = [
        (232727, "Sunil Gurlahosur V",       33, "was 3 before fix"),
        (233046, "Tejraj Aminabhavi",        286, "high-volume faculty"),
        (232730, "Uday Kulkarni",             None, "frequent co-author"),
    ]
    print("  Key faculty verification:")
    for uid, name, expected, note in test_cases:
        cur.execute("""
            SELECT COUNT(*) FROM public.faculty_publications fp
            JOIN   public.faculty f ON f.id = fp.faculty_id
            WHERE  f.ria_user_id = %s
        """, (uid,))
        count = cur.fetchone()[0]
        status = ""
        if expected:
            status = "✔" if count >= expected - 5 else "✗ CHECK"
        print(f"    [{uid}] {name[:35]:35s} {count:>5,} pubs  {status}  ({note})")

    print()
    print("  Top 5 faculty by linked pub count:")
    cur.execute("""
        SELECT f.author_name, f.ria_user_id, COUNT(fp.id) n
        FROM   public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        GROUP  BY f.id, f.author_name, f.ria_user_id
        ORDER  BY n DESC LIMIT 5
    """)
    for name, uid, n in cur.fetchall():
        print(f"    [{uid}] {name[:40]:40s} {n:>5,} pubs")

    print()
    print("  Faculty with 0 junction rows (known 6 — cannot fix without new source data):")
    cur.execute("""
        SELECT f.author_name, f.ria_user_id, f.total_pub_count
        FROM   public.faculty f
        WHERE  NOT EXISTS (
            SELECT 1 FROM public.faculty_publications fp
            WHERE  fp.faculty_id = f.id
        )
        AND f.total_pub_count > 0
        ORDER  BY f.total_pub_count DESC
        LIMIT  10
    """)
    rows = cur.fetchall()
    print(f"    Count: {len(rows)} (expected: 6)")
    for name, uid, pubs in rows:
        print(f"    [{uid}] {name[:40]:40s} total_pubs={pubs}")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Rebuild faculty_publications — all UIDs from AUTHOR ADDRESS"
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
        print("  ✔ Connected")
    except Exception as e:
        print(f"  ✗ {e}"); sys.exit(1)

    t0 = time.time()
    try:
        rebuild_junction(cur, df)
        conn.commit()
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