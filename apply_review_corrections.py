#!/usr/bin/env python3
"""
apply_review_corrections.py
────────────────────────────
Reads the filled-in openalex_review.csv (dept heads marked correct_choice = Y)
and pushes those corrected mappings to Supabase ria.faculty.

Usage:
    python apply_review_corrections.py              # dry-run: shows what would be pushed
    python apply_review_corrections.py --push       # writes to Supabase
    python apply_review_corrections.py --file path/to/review.csv  # custom file path
"""

from __future__ import annotations

import os, sys, csv, json, argparse
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

REVIEW_CSV   = Path("openalex_review.csv")
MAPPING_JSON = Path("openalex_mapping.json")
BATCH_SIZE   = 500


# ─── supabase ──────────────────────────────────────────────────────────────

def get_client():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("✗  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    from supabase import create_client, ClientOptions
    return create_client(url, key, options=ClientOptions(schema="ria"))


def fetch_faculty_id_map(client) -> dict[int, str]:
    """ria_user_id → internal UUID id."""
    PAGE, offset, result = 1000, 0, {}
    while True:
        resp = (
            client.table("faculty")
            .select("id,ria_user_id")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        for row in resp.data:
            result[int(row["ria_user_id"])] = row["id"]
        if len(resp.data) < PAGE:
            break
        offset += PAGE
    return result


# ─── parse CSV ─────────────────────────────────────────────────────────────

def load_corrections(csv_path: Path) -> list[dict]:
    """Return correctable rows from either review CSV or not_found CSV.

    Handles two formats:
      openalex_review.csv    — correct_choice = Y marks the right candidate
      openalex_not_found.csv — manual_openalex_id filled in by dept/person
    """
    if not csv_path.exists():
        print(f"✗  File not found: {csv_path}")
        sys.exit(1)

    corrections = []
    skipped = 0

    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []

        # Detect file format by column names
        is_not_found_csv = "manual_openalex_id" in fieldnames

        if is_not_found_csv:
            print(f"  Format detected: openalex_not_found.csv (manual_openalex_id column)")
            for row in reader:
                oa_id = row.get("manual_openalex_id", "").strip()
                if oa_id:
                    # Normalise to same shape as review CSV rows
                    row["openalex_id"] = oa_id
                    row["h_index"]     = ""
                    row["works_count"] = ""
                    corrections.append(row)
                else:
                    skipped += 1
            print(f"  With manual ID : {len(corrections)} rows")
            print(f"  Still empty    : {skipped} rows")
        else:
            print(f"  Format detected: openalex_review.csv (correct_choice column)")
            for row in reader:
                choice = row.get("correct_choice", "").strip().lower()
                if choice in ("y", "yes", "1", "true"):
                    corrections.append(row)
                else:
                    skipped += 1
            print(f"  Marked correct : {len(corrections)} rows")
            print(f"  Not marked     : {skipped} rows")

    if not corrections:
        if is_not_found_csv:
            print("\n✗  No manual_openalex_id values filled in.")
            print("   Open openalex_not_found.csv, paste the OpenAlex author ID")
            print("   (e.g. A1234567890) in the manual_openalex_id column, save, re-run.")
        else:
            print("\n✗  No rows marked with correct_choice = Y in the CSV.")
            print("   Open openalex_review.csv, mark correct_choice = Y, save, re-run.")
        sys.exit(0)

    return corrections


def validate_one_per_faculty(corrections: list[dict]) -> dict[int, dict]:
    """Ensure at most one Y per faculty. Warn and skip duplicates."""
    seen: dict[int, dict] = {}
    dupes = []
    for row in corrections:
        uid = int(row["ria_user_id"])
        if uid in seen:
            dupes.append(uid)
        else:
            seen[uid] = row

    if dupes:
        print(f"\n  ⚠  Multiple Y marks for {len(dupes)} faculty — keeping first occurrence:")
        for uid in dupes:
            print(f"     ria_user_id={uid}  {seen[uid]['faculty_name']}")
        print("   Fix the CSV and re-run to resolve these.")

    return seen


# ─── push ──────────────────────────────────────────────────────────────────

def push_corrections(client, corrected: dict[int, dict], id_map: dict[int, str]):
    rows = []
    missing = []
    for uid, row in corrected.items():
        internal_id = id_map.get(uid)
        if not internal_id:
            missing.append(uid)
            continue
        oa_id = row.get("openalex_id", "").strip() or None
        rows.append({
            "id":                   internal_id,
            "openalex_author_id":   oa_id,
            "openalex_hindex":      int(row["h_index"]) if row.get("h_index") else None,
            "openalex_works_count": int(row["works_count"]) if row.get("works_count") else None,
            "openalex_confidence":  "REVIEWED",   # distinct from AUTO-HIGH
        })

    if missing:
        print(f"  ⚠  {len(missing)} ria_user_id(s) not found in DB — skipped: {missing}")

    if not rows:
        print("  No rows to push.")
        return

    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        client.table("faculty").upsert(chunk, on_conflict="id").execute()

    print(f"  ✔ Pushed {len(rows)} REVIEWED rows to Supabase.")


def update_checkpoint(corrected: dict[int, dict]):
    """Mark corrected entries in openalex_mapping.json so resume works correctly."""
    if not MAPPING_JSON.exists():
        return
    mapping = json.loads(MAPPING_JSON.read_text())
    updated = 0
    for uid, row in corrected.items():
        key = str(uid)
        if key in mapping:
            mapping[key]["confidence"]  = "REVIEWED"
            mapping[key]["author_id"]   = row.get("openalex_id", "").strip() or None
            mapping[key]["hindex"]      = int(row["h_index"]) if row.get("h_index") else None
            mapping[key]["works_count"] = int(row["works_count"]) if row.get("works_count") else None
            updated += 1
    MAPPING_JSON.write_text(json.dumps(mapping, indent=2, ensure_ascii=False))
    print(f"  ✔ Updated {updated} entries in {MAPPING_JSON}")


# ─── main ──────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--push", action="store_true", help="Write corrections to Supabase")
    ap.add_argument("--file", default=str(REVIEW_CSV), help="Path to filled CSV")
    args = ap.parse_args()

    csv_path = Path(args.file)
    print(f"Reading corrections from: {csv_path}\n")

    corrections  = load_corrections(csv_path)
    corrected    = validate_one_per_faculty(corrections)

    print(f"\n  Faculty to update: {len(corrected)}")
    print(f"  {'ria_user_id':>12}  {'faculty_name':<35}  {'department':<25}  openalex_id")
    print(f"  {'-'*12}  {'-'*35}  {'-'*25}  {'-'*15}")
    for uid, row in sorted(corrected.items()):
        print(f"  {uid:>12}  {row['faculty_name']:<35}  {row.get('department',''):<25}  {row.get('openalex_id','')}")

    if not args.push:
        print("\n  Dry-run — no changes made. Re-run with --push to write to Supabase.")
        return

    client = get_client()
    print("\nFetching faculty ID map …")
    id_map = fetch_faculty_id_map(client)

    print("Pushing corrections …")
    push_corrections(client, corrected, id_map)
    update_checkpoint(corrected)
    print("\nDone. These faculty now have confidence = REVIEWED in Supabase.")


if __name__ == "__main__":
    main()
