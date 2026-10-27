"""
RIA — populate faculty, publications, faculty_publications
from FACULTY_COMPARE_(2).xlsx and Pub_Mine_export_cleaned_v3.xlsx

Run AFTER 01_rebuild_taxonomy_and_truncate.sql has been applied.

Requires:
    pip install supabase pandas openpyxl --break-system-packages

Env vars (or edit directly below):
    SUPABASE_URL           - your project URL
    SUPABASE_SERVICE_KEY   - service_role key (bypasses RLS; needed for bulk insert)

Usage:
    python 02_populate_ria.py --faculty FACULTY_COMPARE_2.xlsx --pubs Pub_Mine_export_cleaned_v3.xlsx
"""

import os
import re
import sys
import argparse
import pandas as pd
from datetime import datetime
from supabase import create_client, Client

SCHEMA = "ria"
BATCH_SIZE = 500
USERID_RE = re.compile(r"\[(\d{5,7})\]")

# ============================================================
# Old -> new department name normalization
# (fixes typos/formatting drift before matching against the
#  rebuilt `departments` table)
# ============================================================
DEPT_NAME_FIX = {
    "Centre for Material Science": "Centre for Material Science (CMS)",
    "Law ": "Law",                       # trailing-space variant seen in source
    "Political Scince": "Political Science",
}


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit(
            "Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables "
            "(service_role key required — anon key cannot bulk-insert under RLS)."
        )
    return create_client(url, key)


def load_lookup_tables(sb: Client):
    """Pull the freshly-seeded institutes/departments and build name -> id maps."""
    insts = sb.schema(SCHEMA).table("institutes").select("id,name").execute().data
    depts = sb.schema(SCHEMA).table("departments").select("id,name,institute_id").execute().data

    inst_by_name = {r["name"]: r["id"] for r in insts}
    # department names are not globally unique across institutes in principle,
    # but in the rebuilt 42-row taxonomy every name IS unique — build a simple map.
    dept_by_name = {r["name"]: r["id"] for r in depts}
    dept_institute_by_name = {r["name"]: r["institute_id"] for r in depts}

    if len(dept_by_name) != len(depts):
        print("WARNING: duplicate department names found in rebuilt taxonomy — "
              "name-only lookup may be ambiguous. Verify 01_rebuild_taxonomy_and_truncate.sql ran cleanly.")

    return inst_by_name, dept_by_name, dept_institute_by_name


def batch_insert(sb: Client, table: str, rows: list, on_conflict: str = None):
    if not rows:
        return
    tbl = sb.schema(SCHEMA).table(table)
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i + BATCH_SIZE]
        if on_conflict:
            tbl.upsert(chunk, on_conflict=on_conflict).execute()
        else:
            tbl.insert(chunk).execute()
        print(f"  {table}: inserted {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")


# ============================================================
# STEP A — FACULTY
# ============================================================
def load_faculty(path: str, dept_by_name: dict, dept_institute_by_name: dict):
    df = pd.read_excel(path)
    print(f"Faculty source: {df.shape[0]} rows")

    rows = []
    unresolved_depts = set()

    for _, r in df.iterrows():
        dept_name = str(r["DEPARTMENT"]).strip()
        dept_name = DEPT_NAME_FIX.get(dept_name, dept_name)

        dept_id = dept_by_name.get(dept_name)
        if dept_id is None:
            unresolved_depts.add(dept_name)
            continue  # cannot insert without a valid department_id (NOT NULL FK)
        inst_id = dept_institute_by_name[dept_name]

        employee_id = None if pd.isna(r["EMPLOYEEID"]) else str(int(r["EMPLOYEEID"]))

        rows.append({
            "employee_id": employee_id,
            "ria_user_id": int(r["USERID"]),
            "author_name": str(r["AUTHORNAME"]).strip(),
            "department_id": dept_id,
            "institute_id": inst_id,
            "total_pub_count": int(r["TOTALPUBCOUNT"]),
            "scopus_pub_count": int(r["SCOPUSPUBCOUNT"]),
            "wos_pub_count": int(r["WOSPUBCOUNT"]),
            "sci_pub_count": int(r["SCIPUBCOUNT"]),
            "pubmed_pub_count": int(r["PUBMEDPUBCOUNT"]),
            "ieee_pub_count": int(r["IEEEPUBCOUNT"]),
            "abdc_pub_count": int(r["ABDCPUBCOUNT"]),
            "ugc_care_pub_count": int(r["UGCCAREPUBCOUNT"]),
            "ugc_care_gp1_count": int(r["UGCCAREGP1PUBCOUNT"]),
            "gs_pub_count": int(r["GSPUBCOUNT"]),
            "scopus_citation": int(r["SCOPUSCITATION"]),
            "wos_citations": int(r["WOSCITATION"]),
            "gs_citations": int(r["GSCITATION"]),
            "scopus_hindex": int(r["SCOPUSHINDEX"]),
            "wos_hindex": int(r["WOSHINDEX"]),
            "gs_hindex": int(r["GSHINDEX"]),
            "scopus_i10_index": int(r["SCOPUSI10INDEX"]),
            "wos_i10_index": int(r["WOSI10INDEX"]),
            "avg_snip": float(r["SCOPUSAVGSNIP"]) if pd.notna(r["SCOPUSAVGSNIP"]) else None,
            "avg_citescore": float(r["SCOPUSAVGCITESCORE"]) if pd.notna(r["SCOPUSAVGCITESCORE"]) else None,
            "avg_impfactor": float(r["WOSAVGIMPFACTOR"]) if pd.notna(r["WOSAVGIMPFACTOR"]) else None,
            "scopus_q1_count": int(r["SCOPUSQ1"]),
            "scopus_q2_count": int(r["SCOPUSQ2"]),
            "wos_q1_count": int(r["WOSQ1"]),
            "wos_q2_count": int(r["WOSQ2"]),
            "journal_count": int(r["JOURNALCOUNT"]),
            "conference_count": int(r["CONFERENCECOUNT"]),
            "book_count": int(r["BOOKCOUNT"]),
            "book_chapter_count": int(r["BOOKCHAPTERCOUNT"]),
        })

    if unresolved_depts:
        print(f"WARNING: {len(unresolved_depts)} department name(s) from FACULTY_COMPARE "
              f"had no match in the rebuilt taxonomy — those faculty rows were SKIPPED:")
        for d in sorted(unresolved_depts):
            print(f"    - {d!r}")

    print(f"Faculty rows ready to insert: {len(rows)}")
    return rows


# ============================================================
# STEP B — PUBLICATIONS + FACULTY_PUBLICATIONS
# ============================================================
def yn_to_bool(val):
    if pd.isna(val):
        return None
    return str(val).strip().upper() in ("YES", "YES-C", "INDEXED")


def build_pub_date(row):
    """Prefer ONLINE DATE, then PRINT DATE, else 01/01/<YEAR> fallback."""
    for col in ("ONLINE DATE", "PRINT DATE"):
        v = row.get(col)
        if pd.notna(v):
            try:
                dt = pd.to_datetime(v)
                if 1900 <= dt.year <= 2100: return dt.strftime("%m/%d/%Y"), False
            except Exception:
                pass
    year = row.get("YEAR")
    if pd.notna(year):
        return f"01/01/{int(year)}", True  # True = inferred fallback
    return None, True


def load_publications(path: str, ria_user_ids: set, faculty_id_by_ria: dict,
                       dept_by_name: dict, dept_institute_by_name: dict):
    df = pd.read_excel(path)
    print(f"Publications source: {df.shape[0]} rows")

    pub_rows = []
    junction_rows = []  # deferred: needs publication UUIDs after insert, built by pub_id key
    fallback_date_count = 0
    orphan_userid_count = 0

    for _, r in df.iterrows():
        pub_date, is_fallback = build_pub_date(r)
        if is_fallback:
            fallback_date_count += 1

        # IEEE citation anomaly: value equal to the pub year is a known
        # data-entry error (year pasted into citation field) — null it.
        ieee_val = r["IEEE"]
        if pd.notna(ieee_val) and pd.notna(r["YEAR"]) and int(ieee_val) == int(r["YEAR"]) and ieee_val > 100:
            ieee_val = None

        # Primary matched dept/institute: first non-Unknown/Not Available
        # entry in HOME AUTHOR DEPARTMENT / INSTITUTE (positionally aligned).
        dept_list = [x.strip() for x in str(r["HOME AUTHOR DEPARTMENT"]).split(";") if x.strip()]
        primary_dept = next((d for d in dept_list if d not in ("Unknown", "Not Available")), None)
        primary_dept = DEPT_NAME_FIX.get(primary_dept, primary_dept) if primary_dept else None
        primary_dept_id = dept_by_name.get(primary_dept) if primary_dept else None
        primary_inst_id = dept_institute_by_name.get(primary_dept) if primary_dept else None

        # staff_ria_user_id: first resolvable numeric ID in HOME AUTHOR USERID
        # that exists in the faculty roster (skips 'Unmatched' and orphan IDs).
        userid_list = [x.strip() for x in str(r["HOME AUTHOR USERID"]).split(";") if x.strip()]
        staff_ria_user_id = None
        for uid in userid_list:
            if uid.isdigit() and int(uid) in ria_user_ids:
                staff_ria_user_id = int(uid)
                break

        abdc_raw = r["ABDC"]
        abdc_grade = str(abdc_raw).strip() if pd.notna(abdc_raw) else None
        if abdc_grade == "" or abdc_grade == "nan":
            abdc_grade = None

        pub_rows.append({
            "pub_id": int(r["PUB ID"]),
            "authors": str(r["AUTHORS"]).replace(";", "|") if pd.notna(r["AUTHORS"]) else None,
            "home_authors": r["HOME AUTHORS"] if pd.notna(r["HOME AUTHORS"]) else None,
            "home_author_userid": r["HOME AUTHOR USERID"] if pd.notna(r["HOME AUTHOR USERID"]) else None,
            "home_author_department": r["HOME AUTHOR DEPARTMENT"] if pd.notna(r["HOME AUTHOR DEPARTMENT"]) else None,
            "home_author_institute": r["HOME AUTHOR INSTITUTE"] if pd.notna(r["HOME AUTHOR INSTITUTE"]) else None,
            "home_author_school": r["HOME AUTHOR SCHOOL"] if pd.notna(r["HOME AUTHOR SCHOOL"]) else None,
            "home_author_location": r["HOME AUTHOR LOCATION"] if pd.notna(r["HOME AUTHOR LOCATION"]) else None,
            "author_address": r["AUTHOR ADDRESS"] if pd.notna(r["AUTHOR ADDRESS"]) else None,
            "title": str(r["PUBLICATION TITLE"]),
            "source_publication": r["SOURCE PUBLICATION"] if pd.notna(r["SOURCE PUBLICATION"]) else None,
            "article_type": r["ARTICLE TYPE"] if pd.notna(r["ARTICLE TYPE"]) else None,
            "level": r["LEVEL"] if pd.notna(r["LEVEL"]) else None,
            "pub_date": pub_date,
            "vol_no": str(r["VOL NO"]) if pd.notna(r["VOL NO"]) else None,
            "iss_no": str(r["ISS NO"]) if pd.notna(r["ISS NO"]) else None,
            "b_page": str(r["B PAGE"]) if pd.notna(r["B PAGE"]) else None,
            "e_page": str(r["E PAGE"]) if pd.notna(r["E PAGE"]) else None,
            "doi": r["DOI"] if pd.notna(r["DOI"]) else None,
            "link": r["LINK"] if pd.notna(r["LINK"]) else None,
            "abstract": r["ABSTRACT"] if pd.notna(r["ABSTRACT"]) else None,
            "technology_areas": r["TECHNOLOGYAREAS"] if pd.notna(r["TECHNOLOGYAREAS"]) else None,
            "scs_citations": int(r["SCS"]) if pd.notna(r["SCS"]) else None,
            "wos_citations_pub": int(r["WOS"]) if pd.notna(r["WOS"]) else None,
            "ieee_citations": int(ieee_val) if pd.notna(ieee_val) else None,
            "gs_citations_pub": int(r["GS"]) if pd.notna(r["GS"]) else None,
            "is_sci": yn_to_bool(r["SCI"]),
            "is_pm": yn_to_bool(r["PM"]),
            "is_ugc": yn_to_bool(r["UGC"]),
            "is_ugc_group1": yn_to_bool(r["UGC GROUP1"]),
            "abdc_grade": abdc_grade,
            "snip": float(r["SNIP"]) if pd.notna(r["SNIP"]) else None,
            "sjr": float(r["SJR"]) if pd.notna(r["SJR"]) else None,
            "impact_factor": float(r["IF"]) if pd.notna(r["IF"]) else None,
            "cite_score": float(r["CITE SCORE"]) if pd.notna(r["CITE SCORE"]) else None,
            "q_rank_scopus": r["Q RANK(SCS)"] if pd.notna(r["Q RANK(SCS)"]) else None,
            "q_rank_wos": r["Q RANK(WOS)"] if pd.notna(r["Q RANK(WOS)"]) else None,
            "p_issn": r["P ISSN"] if pd.notna(r["P ISSN"]) else None,
            "e_issn": r["E ISSN"] if pd.notna(r["E ISSN"]) else None,
            "p_isbn": r["P ISBN"] if pd.notna(r["P ISBN"]) else None,
            "e_isbn": r["E ISBN"] if pd.notna(r["E ISBN"]) else None,
            "nirf": bool(r["NIRF"]) if pd.notna(r["NIRF"]) else False,
            "naac": bool(r["NAAC"]) if pd.notna(r["NAAC"]) else False,
            "qs": bool(r["QS"]) if pd.notna(r["QS"]) else False,
            "is_indexed": bool(r["IsIndexed"]) if pd.notna(r["IsIndexed"]) else False,
            "staff_ria_user_id": staff_ria_user_id,
            "matched_department": primary_dept,
            "matched_institute": r["HOME AUTHOR INSTITUTE"].split(";")[0].strip()
                if pd.notna(r["HOME AUTHOR INSTITUTE"]) else None,
            "matched_department_id": primary_dept_id,
            "matched_institute_id": primary_inst_id,
        })

        # ---- junction candidates (resolved after publication insert) ----
        for uid in userid_list:
            if uid.isdigit():
                uid_int = int(uid)
                if uid_int in ria_user_ids:
                    junction_rows.append({
                        "pub_id": int(r["PUB ID"]),
                        "ria_user_id": uid_int,
                        "is_corresponding": (uid_int == staff_ria_user_id),
                    })
                else:
                    orphan_userid_count += 1

    print(f"Publications rows ready to insert: {len(pub_rows)}")
    print(f"  pub_date used a 01/01/YYYY fallback for {fallback_date_count} rows (no online/print date in source)")
    print(f"  {orphan_userid_count} author-USERID references in AUTHOR ADDRESS did not match any faculty "
          f"row and were skipped for the junction table")
    return pub_rows, junction_rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--faculty", required=True, help="Path to FACULTY_COMPARE_(2).xlsx")
    ap.add_argument("--pubs", required=True, help="Path to Pub_Mine_export_cleaned_v3.xlsx")
    args = ap.parse_args()

    sb = get_client()

    print("Loading rebuilt institute/department lookup tables...")
    inst_by_name, dept_by_name, dept_institute_by_name = load_lookup_tables(sb)
    if len(inst_by_name) != 8 or len(dept_by_name) != 42:
        sys.exit(
            f"Expected 8 institutes / 42 departments after taxonomy rebuild, "
            f"found {len(inst_by_name)} / {len(dept_by_name)}. "
            f"Run 01_rebuild_taxonomy_and_truncate.sql first."
        )

    # ---------------- FACULTY ----------------
    print("\n=== FACULTY ===")
    faculty_rows = load_faculty(args.faculty, dept_by_name, dept_institute_by_name)
    batch_insert(sb, "faculty", faculty_rows)

    # pull back faculty id + ria_user_id for junction building
    fac_result = sb.schema(SCHEMA).table("faculty").select("id,ria_user_id").execute().data
    faculty_id_by_ria = {r["ria_user_id"]: r["id"] for r in fac_result}
    ria_user_ids = set(faculty_id_by_ria.keys())
    print(f"Faculty now in DB: {len(faculty_id_by_ria)}")

    # ---------------- PUBLICATIONS ----------------
    print("\n=== PUBLICATIONS ===")
    pub_rows, junction_candidates = load_publications(
        args.pubs, ria_user_ids, faculty_id_by_ria, dept_by_name, dept_institute_by_name
    )
    batch_insert(sb, "publications", pub_rows)

    # pull back publication id + pub_id for junction building (paginated)
    pub_id_by_pubid = {}
    offset = 0
    while True:
        res = sb.schema(SCHEMA).table("publications").select("id,pub_id").range(offset, offset + 999).execute().data
        if not res:
            break
        for r in res:
            pub_id_by_pubid[r["pub_id"]] = r["id"]
        if len(res) < 1000:
            break
        offset += 1000
    print(f"Publications now in DB: {len(pub_id_by_pubid)}")

    # ---------------- FACULTY_PUBLICATIONS ----------------
    print("\n=== FACULTY_PUBLICATIONS (junction) ===")
    junction_rows = []
    seen = set()
    for jc in junction_candidates:
        pub_uuid = pub_id_by_pubid.get(jc["pub_id"])
        fac_uuid = faculty_id_by_ria.get(jc["ria_user_id"])
        if pub_uuid is None or fac_uuid is None:
            continue
        key = (fac_uuid, pub_uuid)
        if key in seen:
            continue
        seen.add(key)
        junction_rows.append({
            "faculty_id": fac_uuid,
            "publication_id": pub_uuid,
            "is_corresponding": jc["is_corresponding"],
        })
    batch_insert(sb, "faculty_publications", junction_rows)
    print(f"Junction rows inserted: {len(junction_rows)}")

    print("\nDone. Spot-check counts against the SQL script's verification query.")


if __name__ == "__main__":
    main()
