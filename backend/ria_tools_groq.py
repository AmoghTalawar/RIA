#!/usr/bin/env python3
"""
RIA Research Intelligence Agent — Groq API version (4 specialized tools)

Prerequisites:
  pip install groq supabase python-dotenv

Usage:
  export GROQ_API_KEY="your_groq_api_key"
  export SUPABASE_URL="http://10.9.0.115:8000"
  export SUPABASE_KEY="your_service_role_key"
  python3 ria_tools_groq.py
"""

import os
import json
import time
from typing import Dict, Any
from dotenv import load_dotenv
from openai import OpenAI
from sql_tool import execute_sql, SCHEMA_METADATA

load_dotenv()

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "groq").lower()
_client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.environ.get("GROQ_API_KEY", ""),
)
LLM_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

# ── Abbreviation → full dept name expansion ─────────────────────────────────
DEPT_ABBREV = {
    "cse":          "Computer Science and Engineering",
    "cs":           "Computer Science and Engineering",
    "ece":          "Electronics and Communication Engineering",
    "eee":          "Electrical and Electronics Engineering",
    "ee":           "Electrical and Electronics Engineering",
    "electrical":   "Electrical and Electronics Engineering",
    "mechanical":   "Mechanical Engineering",
    "mech":         "Mechanical Engineering",
    "civil":        "Civil Engineering",
    "chemistry":    "Chemistry",
    "chem":         "Chemistry",
    "physics":      "Physics",
    "maths":        "Mathematics",
    "math":         "Mathematics",
    "mathematics":  "Mathematics",
    "biotech":      "Biotechnology",
    "bio":          "Biotechnology",
    "mca":          "Computer Application",
    "ca":           "Computer Application",
    "arch":         "Architecture",
    "architecture": "Architecture",
    "management":   "Management Studies",
    "mba":          "Master of Business Administration",
    "automation":   "Automation and Robotics",
    "robotics":     "Automation and Robotics",
    "law":          "Law",
    "humanities":   "Humanities and Social Sciences",
}

def _expand_dept(name: str) -> str:
    """Expand abbreviation to full dept name, or return original if no match."""
    if not name:
        return name
    return DEPT_ABBREV.get(name.strip().lower(), name.strip())


# ── Scope helpers ───────────────────────────────────────────────────────────
# The tools below accept keyword-only TRUSTED arguments (ria_user_id,
# scope_departments, include_names). They are never part of the model-facing
# schemas in TOOLS: backend/scope_guard.py injects them after whitelisting the
# model's arguments, so a model cannot supply or override them.
#   ria_user_id         pin the query to one person (ignores any name)
#   scope_departments   canonical department names the caller may see; matched
#                       EXACTLY on v_faculty_full and as ';'-list substrings on
#                       publications.home_author_department
#   include_names       False -> never return individual faculty names

def _sql_str(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _like_escape(value) -> str:
    return str(value).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _faculty_dept_in(names) -> str:
    """Exact department match on v_faculty_full for canonical names."""
    return "department IN (" + ", ".join(_sql_str(n) for n in names) + ")"


def _pub_dept_any(names) -> str:
    """publications.home_author_department is a ';'-joined list: match each canonical name as an
    EXACT element of that list (bounded by ';' on both sides, added around the whole column so a
    single unlisted value also matches). A plain substring match is wrong here: e.g. 'Management'
    is a substring of 'Management Studies', and 'Computer Application' of 'Master of Computer
    Applications' — on real data that inflated 'Management' from 2 true matches to 128."""
    return "(" + " OR ".join(
        "(';' || home_author_department || ';') ILIKE " + _sql_str("%;" + _like_escape(n) + ";%")
        for n in names
    ) + ")"


def _forbidden(message: str) -> str:
    return json.dumps({"status": "forbidden", "message": message})


def _faculty_miss(faculty_name: str, scope_departments) -> str:
    if scope_departments is not None:
        return _forbidden(
            f"No faculty member named '{faculty_name}' was found in your department "
            f"({', '.join(scope_departments)}). You can view individual faculty in your own department only."
        )
    return json.dumps({
        "status": "no_match",
        "message": f"No faculty named '{faculty_name}' exists in the KLE Tech database."
    })


# ═══════════════════════════════════════════════════
# TOOL IMPLEMENTATIONS
# ═══════════════════════════════════════════════════

def get_faculty_stats(faculty_name: str = "", source: str = "scopus", *,
                      ria_user_id: int = None, scope_departments: list = None) -> str:
    """
    Get individual faculty stats using fuzzy name matching on v_faculty_full.
    Fix 1: Uses ria_user_id for the Q-rank sub-query (exact ID join, no ILIKE false-matches).
    Fix 2: Disambiguation threshold lowered to 0.55 (was 0.6, missed near-exact matches).
    """
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")
    if ria_user_id is None and not faculty_name:
        return json.dumps({"status": "error", "message": "faculty_name is required"})

    if ria_user_id is not None:
        # Trusted pin: exact ID, no name matching.
        match_expr = "1.0"
        where_sql = f"ria_user_id = {int(ria_user_id)}"
        order_sql = "ria_user_id"
    else:
        name_escaped = faculty_name.replace("'", "''")
        match_expr = f"ROUND(similarity(author_name, '{name_escaped}')::numeric, 4)"
        where_sql = f"similarity(author_name, '{name_escaped}') > 0.2"
        order_sql = f"similarity(author_name, '{name_escaped}') DESC"
        if scope_departments is not None:
            where_sql += " AND " + _faculty_dept_in(scope_departments)

    sql = f"""
        SELECT
            ria_user_id,
            faculty_id,
            author_name,
            department,
            institute,
            short_name,
            total_pub_count,
            scopus_citation,
            scopus_hindex,
            scopus_q1_count,
            wos_q1_count,
            journal_count,
            conference_count,
            wos_pub_count,
            wos_hindex,
            avg_citescore,
            avg_impfactor,
            {match_expr} AS match_score
        FROM v_faculty_full
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT 5
    """

    rows = execute_sql(sql)

    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})

    if not rows or len(rows) == 0:
        return _faculty_miss(faculty_name, scope_departments)

    top_score = float(rows[0].get("match_score", 0))

    # Hard threshold: if the best similarity score is very low, the name simply
    # doesn't exist in the DB — return no_match immediately.
    if top_score < 0.4:
        return _faculty_miss(faculty_name, scope_departments)

    # Show candidates when genuinely ambiguous:
    #  (a) top score is moderate (< 0.55), OR
    #  (b) multiple candidates have scores close to the top (within 0.05)
    if len(rows) > 1:
        close_matches = [r for r in rows if abs(float(r.get("match_score", 0)) - top_score) <= 0.05]
        if top_score < 0.55 or len(close_matches) >= 2:
            return json.dumps({
                "status": "ambiguous",
                "message": f"Found {len(close_matches)} faculty members matching '{faculty_name}'. Please specify:",
                "candidates": [
                    {
                        "name": r["author_name"],
                        "department": r["department"],
                        "institute": r["short_name"],
                        "publications": r["total_pub_count"],
                        "match_score": float(r.get("match_score", 0))
                    } for r in close_matches
                ]
            })

    f = rows[0]
    ria_uid = f["ria_user_id"]

    # Q1-Q4 breakdown via the faculty_publications junction (exact per-person joins), not
    # staff_ria_user_id: that column is only the FIRST resolvable author per paper, so it
    # undercounts anyone who is a co-author further down the list. On real data this
    # undercounted one sampled faculty member's Q3 papers by 12 (40 vs the true 52).
    qrank_sql = f"""
        SELECT p.q_rank_scopus, COUNT(*)::int AS cnt
        FROM faculty_publications fp
        JOIN publications p ON p.id = fp.publication_id
        WHERE fp.faculty_id = {_sql_str(f["faculty_id"])}
          AND p.q_rank_scopus IS NOT NULL
        GROUP BY p.q_rank_scopus
        ORDER BY p.q_rank_scopus
    """
    qrank_rows = execute_sql(qrank_sql)
    qrank_breakdown = {}
    if isinstance(qrank_rows, list):
        for r in qrank_rows:
            qrank_breakdown[r["q_rank_scopus"]] = r["cnt"]

    if source.lower() == "wos":
        data = {
            "name": f["author_name"],
            "department": f["department"],
            "institute": f["institute"],
            "institute_short": f["short_name"],
            "source": "Web of Science (WoS)",
            "wos_h_index": f["wos_hindex"] or "N/A",
            "wos_publications": f["wos_pub_count"] or 0,
            "wos_q1_count": f["wos_q1_count"] or 0,
        }
    else:
        data = {
            "name": f["author_name"],
            "department": f["department"],
            "institute": f["institute"],
            "institute_short": f["short_name"],
            "source": "Scopus",
            "publications": f["total_pub_count"] or 0,
            "scopus_citations": f["scopus_citation"] or 0,
            "scopus_h_index": f["scopus_hindex"] or 0,
            # Q-rank from publications table (staff_ria_user_id exact join)
            "q1_count": qrank_breakdown.get("Q1", 0),
            "q2_count": qrank_breakdown.get("Q2", 0),
            "q3_count": qrank_breakdown.get("Q3", 0),
            "q4_count": qrank_breakdown.get("Q4", 0),
            "wos_q1_count": f["wos_q1_count"] or 0,
            "journals": f["journal_count"] or 0,
            "conferences": f["conference_count"] or 0,
            "avg_cite_score": round(float(f["avg_citescore"]), 2) if f["avg_citescore"] else 0,
            "avg_impact_factor": round(float(f["avg_impfactor"]), 2) if f["avg_impfactor"] else 0,
        }

    return json.dumps({"status": "success", "data": data}, indent=2)


def _qrank_col(source: str = "scopus") -> str:
    """Q-rank column to use: Excel 'Q RANK(SCS)' (q_rank_scopus) by default, 'Q RANK(WOS)' only on request."""
    return "q_rank_wos" if str(source or "").strip().lower() in ("wos", "web of science") else "q_rank_scopus"


def count_qrank_publications(qrank: str = "", department: str = "", year: int = None, source: str = "scopus", *,
                             scope_departments: list = None) -> str:
    """
    Count publications by Q-rank, optionally filtered by department and/or year.
    Expands dept abbreviations (CSE/ECE/etc.) before querying.
    """
    if qrank and qrank not in ("Q1", "Q2", "Q3", "Q4"):
        return json.dumps({
            "status": "error",
            "message": f"Invalid Q-rank: '{qrank}'. Must be one of Q1, Q2, Q3, or Q4."
        })

    if year is not None:
        try:
            year_int = int(year)
            if not (2000 <= year_int <= 2030):
                return json.dumps({"status": "error", "message": f"Year {year_int} out of range (2000-2030)."})
        except (ValueError, TypeError):
            return json.dumps({"status": "error", "message": f"Invalid year: '{year}'"})
    else:
        year_int = None

    dept_full = _expand_dept(department) if department else ""

    conditions = []
    if qrank:
        conditions.append(f"{_qrank_col(source)} = '{qrank}'")
    if scope_departments is not None:
        if not scope_departments:
            return _forbidden("No department is available for your account.")
        conditions.append(_pub_dept_any(scope_departments))
    elif dept_full:
        conditions.append(_pub_dept_any([dept_full]))
    if year_int:
        conditions.append(f"year = {year_int}")

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    sql = f"""
        SELECT COUNT(*)::int AS cnt
        FROM publications
        {where_clause}
    """

    rows = execute_sql(sql)

    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})

    count = rows[0]["cnt"] if rows else 0

    return json.dumps({
        "status": "success",
        "qrank": qrank or "All",
        "source": "WoS" if _qrank_col(source) == "q_rank_wos" else "Scopus",
        "department": ", ".join(scope_departments) if scope_departments else (dept_full or "All departments (university-wide)"),
        "year": year_int or "All years",
        "count": count,
    }, indent=2)


def search_publications_by_author(
    author_name: str = "",
    year: int = None,
    qrank: str = None,
    department: str = None,
    limit: int = 10,
    source: str = "scopus",
    *,
    ria_user_id: int = None,
    scope_departments: list = None,
) -> str:
    """
    List publications by author name.
    FIX: Year out-of-range now returns a clear error instead of silently ignoring.
    FIX: Dept abbreviation expansion applied.
    """
    author_name = author_name or ""
    if not author_name and ria_user_id is None:
        return json.dumps({"status": "error", "message": "author_name is required"})
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")

    limit = max(1, min(int(limit), 30))

    if ria_user_id is None and scope_departments is not None:
        # Resolve the name to a person INSIDE the allowed departments, then pin their ID.
        name_escaped = author_name.replace("'", "''")
        who = execute_sql(f"""
            SELECT ria_user_id
            FROM v_faculty_full
            WHERE similarity(author_name, '{name_escaped}') > 0.4
              AND {_faculty_dept_in(scope_departments)}
            ORDER BY similarity(author_name, '{name_escaped}') DESC
            LIMIT 1
        """)
        if isinstance(who, dict) and "error" in who:
            return json.dumps({"status": "error", "message": who["error"]})
        if not who:
            return _faculty_miss(author_name, scope_departments)
        ria_user_id = who[0]["ria_user_id"]

    if ria_user_id is not None:
        # home_author_userid is a ';'-joined list of RIA user ids.
        filters = [f"(';' || COALESCE(home_author_userid, '') || ';') LIKE '%;{int(ria_user_id)};%'"]
    else:
        name_escaped = author_name.replace("'", "''")
        filters = [f"home_authors ILIKE '%{name_escaped}%'"]

    if year is not None:
        try:
            year_int = int(year)
            if 1990 <= year_int <= 2030:
                filters.append(f"year = {year_int}")
            else:
                return json.dumps({
                    "status": "error",
                    "message": f"Year {year_int} is out of expected range (1990–2030)."
                })
        except (ValueError, TypeError):
            return json.dumps({"status": "error", "message": f"Invalid year value: '{year}'"})

    if qrank:
        if qrank not in ("Q1", "Q2", "Q3", "Q4"):
            return json.dumps({
                "status": "error",
                "message": f"Invalid Q-rank filter: '{qrank}'. Must be Q1, Q2, Q3, or Q4."
            })
        filters.append(f"{_qrank_col(source)} = '{qrank}'")

    if department:
        dept_full = _expand_dept(department)
        filters.append(_pub_dept_any([dept_full]))

    where_clause = " AND ".join(filters)

    sql = f"""
        SELECT
            title,
            year,
            source_publication,
            article_type,
            {_qrank_col(source)},
            scs_citations,
            doi,
            home_authors
        FROM publications
        WHERE {where_clause}
        ORDER BY year DESC NULLS LAST, title
        LIMIT {limit}
    """

    rows = execute_sql(sql)

    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})

    if not rows or len(rows) == 0:
        return json.dumps({
            "status": "no_match",
            "message": f"No publications found for author '{author_name}' with the specified filters."
        })

    publications = [
        {
            "title": r["title"],
            "year": r["year"],
            "source": r["source_publication"],
            "type": r["article_type"],
            "qrank": r[_qrank_col(source)],
            "scopus_citations": r["scs_citations"] or 0,
            "doi": r["doi"],
        }
        for r in rows
    ]

    return json.dumps({
        "status": "success",
        "author": author_name,
        "filters": {"year": year, "qrank": qrank, "department": department,
                    "qrank_source": "WoS" if _qrank_col(source) == "q_rank_wos" else "Scopus"},
        "count": len(publications),
        "data": publications,
    }, indent=2)


def get_department_stats(department: str = "", top_n: int = 5, *,
                         scope_departments: list = None, include_names: bool = True) -> str:
    """
    NEW TOOL: Get aggregated stats for a department/institute.
    Returns: faculty count, total pubs, total h-index (sum of all faculty h-indexes), top N faculty by citations.
    Covers the gap: "How is CSE doing?", "Top researchers in Mechanical", etc.
    Expands abbreviations automatically.
    """
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")
    if not department and scope_departments is None:
        return json.dumps({"status": "error", "message": "department is required"})

    dept_full = _expand_dept(department)
    dept_escaped = dept_full.replace("'", "''")
    top_n = max(1, min(int(top_n), 20))
    if scope_departments is not None:
        where_sql = _faculty_dept_in(scope_departments)
        dept_full = ", ".join(scope_departments)
    else:
        where_sql = (
            f"department ILIKE '%{dept_escaped}%' "
            f"OR short_name ILIKE '%{dept_escaped}%' "
            f"OR institute ILIKE '%{dept_escaped}%'"
        )

    # Aggregate stats
    agg_sql = f"""
        SELECT
            COUNT(*)::int                              AS faculty_count,
            COALESCE(SUM(total_pub_count), 0)::int    AS total_publications,
            COALESCE(SUM(scopus_citation), 0)::int    AS total_citations,
            COALESCE(SUM(scopus_hindex), 0)::int      AS total_hindex,
            COALESCE(SUM(scopus_q1_count), 0)::int    AS total_q1,
            COALESCE(SUM(journal_count), 0)::int      AS total_journals,
            COALESCE(SUM(conference_count), 0)::int   AS total_conferences
        FROM v_faculty_full
        WHERE {where_sql}
    """

    # Top N faculty
    top_sql = f"""
        SELECT author_name, scopus_hindex, scopus_citation, total_pub_count, scopus_q1_count
        FROM v_faculty_full
        WHERE {where_sql}
        ORDER BY scopus_citation DESC
        LIMIT {top_n}
    """

    agg_rows = execute_sql(agg_sql)
    top_rows = execute_sql(top_sql) if include_names else []

    if isinstance(agg_rows, dict) and "error" in agg_rows:
        return json.dumps({"status": "error", "message": agg_rows["error"]})

    if not agg_rows or agg_rows[0]["faculty_count"] == 0:
        return json.dumps({
            "status": "no_match",
            "message": f"No department found matching '{department}'. Try full name like 'Computer Science and Engineering'."
        })

    agg = agg_rows[0]
    top = []
    if include_names and isinstance(top_rows, list):
        top = [
            {
                "name": r["author_name"],
                "h_index": r["scopus_hindex"],
                "citations": r["scopus_citation"],
                "publications": r["total_pub_count"],
                "q1_count": r["scopus_q1_count"],
            }
            for r in top_rows
        ]

    result = {
        "status": "success",
        "department_query": department,
        "department_resolved": dept_full,
        "summary": {
            "faculty_count": agg["faculty_count"],
            "total_publications": agg["total_publications"],
            "total_citations": agg["total_citations"],
            "total_hindex": agg["total_hindex"] or 0,
            "total_q1_publications": agg["total_q1"],
            "total_journals": agg["total_journals"],
            "total_conferences": agg["total_conferences"],
        },
    }
    if include_names:
        result[f"top_{top_n}_by_citations"] = top
    else:
        result["note"] = "Individual faculty names are not available at your access level; these are aggregate figures."
    return json.dumps(result, indent=2)


def compare_entities(
    entity_type: str = "department",
    entities: list = None,
    metric: str = "citations",
    top_n: int = 10,
    department: str = "",
    *,
    scope_departments: list = None,
    include_names: bool = True,
) -> str:
    """
    Compare departments, faculty members, or institutes/schools side-by-side, or rank all of them.
    entity_type: 'department', 'faculty', or 'institute'.
    entities: list of names to compare. If empty/None → rank ALL (departments or institutes).
    metric: sort/compare by this metric (citations, publications, hindex, q1_count).
    top_n: when ranking all departments, how many to return (max 30).
    """
    VALID_METRICS = {
        "citations":    {"col": "scopus_citation",  "label": "Total Scopus Citations"},
        "publications": {"col": "total_pub_count",   "label": "Total Publications"},
        "hindex":       {"col": "scopus_hindex",    "label": "H-Index"},
        "h-index":      {"col": "scopus_hindex",    "label": "H-Index"},
        "h_index":      {"col": "scopus_hindex",    "label": "H-Index"},
        "q1_count":     {"col": "scopus_q1_count",  "label": "Q1 Publications"},
        "q1":           {"col": "scopus_q1_count",  "label": "Q1 Publications"},
        "journals":     {"col": "journal_count",    "label": "Journal Publications"},
        "conferences":  {"col": "conference_count",  "label": "Conference Publications"},
    }

    metric_key = metric.strip().lower().replace(" ", "_")
    m = VALID_METRICS.get(metric_key)
    if not m:
        return json.dumps({
            "status": "error",
            "message": f"Unknown metric '{metric}'. Valid: {', '.join(set(v['label'] for v in VALID_METRICS.values()))}"
        })

    col = m["col"]
    label = m["label"]
    top_n = max(1, min(int(top_n), 30))
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")

    # ── DEPARTMENT comparison / ranking ──
    if entity_type.strip().lower() == "department":
        if scope_departments is not None:
            sql = f"""
                SELECT
                    department,
                    COUNT(*)::int                            AS faculty_count,
                    COALESCE(SUM(total_pub_count), 0)::int  AS total_publications,
                    COALESCE(SUM(scopus_citation), 0)::int  AS total_citations,
                    COALESCE(SUM(scopus_hindex), 0)::int    AS total_hindex,
                    COALESCE(SUM(scopus_q1_count), 0)::int  AS total_q1,
                    COALESCE(SUM(journal_count), 0)::int    AS total_journals,
                    COALESCE(SUM(conference_count), 0)::int AS total_conferences
                FROM v_faculty_full
                WHERE {_faculty_dept_in(scope_departments)}
                GROUP BY department
                ORDER BY SUM({col}) DESC
            """
        elif entities and len(entities) > 0:
            # Compare specific departments
            expanded = [_expand_dept(d) for d in entities]
            or_clauses = " OR ".join(
                f"department ILIKE '%{d.replace(chr(39), chr(39)*2)}%'" for d in expanded
            )
            sql = f"""
                SELECT
                    department,
                    COUNT(*)::int                            AS faculty_count,
                    COALESCE(SUM(total_pub_count), 0)::int  AS total_publications,
                    COALESCE(SUM(scopus_citation), 0)::int  AS total_citations,
                    COALESCE(SUM(scopus_hindex), 0)::int    AS total_hindex,
                    COALESCE(SUM(scopus_q1_count), 0)::int  AS total_q1,
                    COALESCE(SUM(journal_count), 0)::int    AS total_journals,
                    COALESCE(SUM(conference_count), 0)::int AS total_conferences
                FROM v_faculty_full
                WHERE {or_clauses}
                GROUP BY department
                ORDER BY SUM({col}) DESC
            """
        else:
            # Rank ALL departments
            sql = f"""
                SELECT
                    department,
                    COUNT(*)::int                            AS faculty_count,
                    COALESCE(SUM(total_pub_count), 0)::int  AS total_publications,
                    COALESCE(SUM(scopus_citation), 0)::int  AS total_citations,
                    COALESCE(SUM(scopus_hindex), 0)::int    AS total_hindex,
                    COALESCE(SUM(scopus_q1_count), 0)::int  AS total_q1,
                    COALESCE(SUM(journal_count), 0)::int    AS total_journals,
                    COALESCE(SUM(conference_count), 0)::int AS total_conferences
                FROM v_faculty_full
                GROUP BY department
                ORDER BY SUM({col}) DESC
                LIMIT {top_n}
            """

        rows = execute_sql(sql)
        if isinstance(rows, dict) and "error" in rows:
            return json.dumps({"status": "error", "message": rows["error"]})

        if not rows:
            return json.dumps({"status": "no_match", "message": "No departments found."})

        results = []
        for i, r in enumerate(rows, 1):
            results.append({
                "rank": i,
                "department": r["department"],
                "faculty_count": r["faculty_count"],
                "total_publications": r["total_publications"],
                "total_citations": r["total_citations"],
                "total_hindex": r["total_hindex"],
                "total_q1": r["total_q1"],
                "total_journals": r["total_journals"],
                "total_conferences": r["total_conferences"],
            })

        return json.dumps({
            "status": "success",
            "comparison_type": "department",
            "sorted_by": label,
            "count": len(results),
            "data": results,
        }, indent=2)

    # ── FACULTY comparison / ranking ──
    elif entity_type.strip().lower() == "faculty":
        if not include_names:
            return _forbidden("Individual faculty comparisons are not available at your access level.")
        if not entities or len(entities) < 2:
            # Rank top N faculty (optionally filtered by department)
            dept_filter = ""
            dept_label = "university-wide"
            if scope_departments is not None:
                dept_filter = "WHERE " + _faculty_dept_in(scope_departments)
                dept_label = ", ".join(scope_departments)
            elif department:
                dept_full = _expand_dept(department)
                dept_escaped = dept_full.replace("'", "''")
                dept_filter = f"WHERE department ILIKE '%{dept_escaped}%' OR short_name ILIKE '%{dept_escaped}%'"
                dept_label = dept_full

            sql = f"""
                SELECT
                    author_name, department, total_pub_count,
                    scopus_citation, scopus_hindex, scopus_q1_count,
                    journal_count, conference_count
                FROM v_faculty_full
                {dept_filter}
                ORDER BY {col} DESC NULLS LAST
                LIMIT {top_n}
            """
            rows = execute_sql(sql)
            if isinstance(rows, dict) and "error" in rows:
                return json.dumps({"status": "error", "message": rows["error"]})
            if not rows:
                return json.dumps({"status": "no_match", "message": f"No faculty found for '{department}'."}) 

            faculty_data = []
            for i, f in enumerate(rows, 1):
                faculty_data.append({
                    "rank": i,
                    "name": f["author_name"],
                    "department": f["department"],
                    "publications": f["total_pub_count"] or 0,
                    "citations": f["scopus_citation"] or 0,
                    "hindex": f["scopus_hindex"] or 0,
                    "q1_count": f["scopus_q1_count"] or 0,
                    "journals": f["journal_count"] or 0,
                    "conferences": f["conference_count"] or 0,
                })

            return json.dumps({
                "status": "success",
                "comparison_type": "faculty_ranking",
                "scope": dept_label,
                "sorted_by": label,
                "count": len(faculty_data),
                "data": faculty_data,
            }, indent=2)

        else:
            # Compare specific faculty members
            scope_sql = (" AND " + _faculty_dept_in(scope_departments)) if scope_departments is not None else ""
            faculty_data = []
            for name in entities[:10]:
                name_escaped = name.replace("'", "''")
                sql = f"""
                    SELECT
                        author_name, department, total_pub_count,
                        scopus_citation, scopus_hindex, scopus_q1_count,
                        journal_count, conference_count
                    FROM v_faculty_full
                    WHERE similarity(author_name, '{name_escaped}') > 0.2{scope_sql}
                    ORDER BY similarity(author_name, '{name_escaped}') DESC
                    LIMIT 1
                """
                rows = execute_sql(sql)
                if isinstance(rows, list) and rows:
                    f = rows[0]
                    faculty_data.append({
                        "query_name": name,
                        "matched_name": f["author_name"],
                        "department": f["department"],
                        "publications": f["total_pub_count"] or 0,
                        "citations": f["scopus_citation"] or 0,
                        "hindex": f["scopus_hindex"] or 0,
                        "q1_count": f["scopus_q1_count"] or 0,
                        "journals": f["journal_count"] or 0,
                        "conferences": f["conference_count"] or 0,
                    })
                else:
                    faculty_data.append({"query_name": name, "error": "Not found"})

            metric_map = {
                "scopus_citation": "citations",
                "total_pub_count": "publications",
                "scopus_hindex": "hindex",
                "scopus_q1_count": "q1_count",
                "journal_count": "journals",
                "conference_count": "conferences",
            }
            sort_key = metric_map.get(col, "citations")
            faculty_data.sort(key=lambda x: x.get(sort_key, 0), reverse=True)

            return json.dumps({
                "status": "success",
                "comparison_type": "faculty",
                "sorted_by": label,
                "count": len(faculty_data),
                "data": faculty_data,
            }, indent=2)

    elif entity_type.strip().lower() == "institute":
        inst_col_map = {
            "citations": "total_scopus_citations", "publications": "total_publications",
            "hindex": "avg_scopus_hindex", "h-index": "avg_scopus_hindex", "h_index": "avg_scopus_hindex",
            "q1_count": "total_q1_scopus", "q1": "total_q1_scopus",
            "journals": "total_journals", "conferences": "total_conferences",
        }
        inst_col = inst_col_map.get(metric_key, "total_scopus_citations")
        inst_cols_sql = ("name AS institute, short_name, faculty_count, total_publications, "
                         "total_scopus_citations, avg_scopus_hindex, total_q1_scopus, "
                         "total_journals, total_conferences")

        if entities:
            or_clauses = " OR ".join(
                f"(name = {_sql_str(n)} OR short_name = {_sql_str(n)})" for n in entities[:10]
            )
            sql = f"""
                SELECT {inst_cols_sql}
                FROM v_institute_summary
                WHERE {or_clauses}
                ORDER BY {inst_col} DESC
            """
        else:
            sql = f"""
                SELECT {inst_cols_sql}
                FROM v_institute_summary
                ORDER BY {inst_col} DESC
                LIMIT {top_n}
            """

        rows = execute_sql(sql)
        if isinstance(rows, dict) and "error" in rows:
            return json.dumps({"status": "error", "message": rows["error"]})
        if not rows:
            return json.dumps({"status": "no_match", "message": "No schools/institutes found."})

        results = []
        for i, r in enumerate(rows, 1):
            results.append({
                "rank": i,
                "institute": r["institute"],
                "short_name": r["short_name"],
                "faculty_count": r["faculty_count"],
                "total_publications": r["total_publications"],
                "total_citations": r["total_scopus_citations"],
                "avg_hindex": float(r["avg_scopus_hindex"]) if r["avg_scopus_hindex"] is not None else 0,
                "total_q1": r["total_q1_scopus"],
                "total_journals": r["total_journals"],
                "total_conferences": r["total_conferences"],
            })

        return json.dumps({
            "status": "success",
            "comparison_type": "institute",
            "sorted_by": label,
            "count": len(results),
            "data": results,
        }, indent=2)

    else:
        return json.dumps({
            "status": "error",
            "message": f"Unknown entity_type '{entity_type}'. Use 'department', 'faculty', or 'institute'."
        })


def get_yearly_stats(year: int = None, department: str = None, *, scope_departments: list = None) -> str:
    """
    Count publications for a specific year (2018-2026), optionally by department.
    Omit year for year-over-year growth between the two most recent years.
    """
    if year is not None:
        year_int = int(year)
        if not (2000 <= year_int <= 2030):
            return json.dumps({"status": "error", "message": f"Year {year_int} is out of valid range (2000-2030)."})

        dept_filter = ""
        dept_label = "All departments"
        if scope_departments is not None:
            if not scope_departments:
                return _forbidden("No department is available for your account.")
            dept_filter = "AND " + _pub_dept_any(scope_departments)
            dept_label = ", ".join(scope_departments)
        elif department:
            dept_full = _expand_dept(department)
            dept_filter = "AND " + _pub_dept_any([dept_full])
            dept_label = dept_full

        sql = f"""
            SELECT COUNT(*)::int AS cnt
            FROM publications
            WHERE year = {year_int}
            {dept_filter}
        """
        rows = execute_sql(sql)
        if isinstance(rows, dict) and "error" in rows:
            return json.dumps({"status": "error", "message": rows["error"]})
        count = rows[0]["cnt"] if rows else 0
        return json.dumps({
            "status": "success",
            "year": year_int,
            "department": dept_label,
            "publication_count": count,
        }, indent=2)

    else:
        # YoY growth: compare the two most recent COMPLETE years
        # Skip the current year (incomplete data would be misleading)
        import datetime
        current_year = datetime.datetime.now().year

        yoy_scope = ("AND " + _pub_dept_any(scope_departments)) if scope_departments else ""
        sql = f"""
            SELECT year, COUNT(*)::int AS cnt
            FROM publications
            WHERE year BETWEEN 2018 AND {current_year - 1}
            {yoy_scope}
            GROUP BY year
            ORDER BY year DESC
        """
        rows = execute_sql(sql)
        if isinstance(rows, dict) and "error" in rows:
            return json.dumps({"status": "error", "message": rows["error"]})
        if not rows or len(rows) < 2:
            return json.dumps({"status": "error", "message": "Not enough yearly data for YoY comparison."})

        curr_year, curr_cnt = rows[0]["year"], rows[0]["cnt"]
        prev_year, prev_cnt = rows[1]["year"], rows[1]["cnt"]
        growth_pct = round(100.0 * (curr_cnt - prev_cnt) / prev_cnt, 1) if prev_cnt else 0

        # Build full yearly breakdown for context
        yearly_breakdown = {str(r["year"]): r["cnt"] for r in rows}

        return json.dumps({
            "status": "success",
            "comparison": "year_over_year",
            "latest_year": curr_year,
            "latest_count": curr_cnt,
            "previous_year": prev_year,
            "previous_count": prev_cnt,
            "growth_percent": growth_pct,
            "trend": "up" if growth_pct >= 0 else "down",
            "note": f"Comparing completed years only. {current_year} excluded (partial data).",
            "yearly_breakdown": yearly_breakdown,
        }, indent=2)


def get_qrank_distribution(department: str = None, year: int = None, source: str = "scopus", *, scope_departments: list = None) -> str:
    """
    Full Q1/Q2/Q3/Q4 publication breakdown (and the Q1+Q2 share) in ONE call, optionally
    filtered by department and/or year. Prefer this over calling count_qrank_publications
    once per quartile. Expands dept abbreviations (CSE/ECE/etc.) before querying.
    """
    if year is not None:
        try:
            year_int = int(year)
            if not (2000 <= year_int <= 2030):
                return json.dumps({"status": "error", "message": f"Year {year_int} out of range (2000-2030)."})
        except (ValueError, TypeError):
            return json.dumps({"status": "error", "message": f"Invalid year: '{year}'"})
    else:
        year_int = None

    qcol = _qrank_col(source)
    conditions = [f"{qcol} IS NOT NULL"]
    if scope_departments is not None:
        if not scope_departments:
            return _forbidden("No department is available for your account.")
        conditions.append(_pub_dept_any(scope_departments))
        dept_label = ", ".join(scope_departments)
    elif department:
        dept_full = _expand_dept(department)
        conditions.append(_pub_dept_any([dept_full]))
        dept_label = dept_full
    else:
        dept_label = "All departments (university-wide)"
    if year_int:
        conditions.append(f"year = {year_int}")

    sql = f"""
        SELECT {qcol}, COUNT(*)::int AS cnt
        FROM publications
        WHERE {" AND ".join(conditions)}
        GROUP BY {qcol}
    """
    rows = execute_sql(sql)
    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})

    breakdown = {r[qcol]: r["cnt"] for r in rows} if isinstance(rows, list) else {}
    q1, q2, q3, q4 = breakdown.get("Q1", 0), breakdown.get("Q2", 0), breakdown.get("Q3", 0), breakdown.get("Q4", 0)
    total = q1 + q2 + q3 + q4

    return json.dumps({
        "status": "success",
        "source": "WoS" if qcol == "q_rank_wos" else "Scopus",
        "department": dept_label,
        "year": year_int or "All years",
        "q1_count": q1,
        "q2_count": q2,
        "q3_count": q3,
        "q4_count": q4,
        "total_ranked": total,
        "q1_q2_share_percent": round(100.0 * (q1 + q2) / total, 1) if total else 0,
    }, indent=2)


def get_institute_summary(institute: str = None, *, scope_institutes: list = None) -> str:
    """
    Aggregated stats for one school/institute (faculty count, total publications, total
    citations, average h-index, Q1 count, journals, conferences), or for ALL schools if
    'institute' is omitted. Wraps the v_institute_summary view. Accepts full name or short
    name (CSE, EEE, Applied Eng, etc.).
    """
    if scope_institutes is not None and not scope_institutes:
        return _forbidden("No school is available for your account.")

    if scope_institutes is not None:
        or_clauses = " OR ".join(f"name = {_sql_str(n)}" for n in scope_institutes)
        sql = f"SELECT * FROM v_institute_summary WHERE {or_clauses} ORDER BY name"
        label = ", ".join(scope_institutes)
    elif institute:
        inst_escaped = institute.replace("'", "''")
        sql = f"""
            SELECT * FROM v_institute_summary
            WHERE name ILIKE '%{inst_escaped}%' OR short_name ILIKE '%{inst_escaped}%'
            ORDER BY name
        """
        label = institute
    else:
        sql = "SELECT * FROM v_institute_summary ORDER BY total_publications DESC"
        label = "All schools"

    rows = execute_sql(sql)
    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})
    if not rows:
        return json.dumps({
            "status": "no_match",
            "message": f"No school found matching '{institute}'." if institute else "No schools found.",
        })

    schools = [
        {
            "institute": r["name"],
            "short_name": r["short_name"],
            "faculty_count": r["faculty_count"],
            "total_publications": r["total_publications"],
            "total_citations": r["total_scopus_citations"],
            "avg_hindex": float(r["avg_scopus_hindex"]) if r["avg_scopus_hindex"] is not None else 0,
            "total_q1": r["total_q1_scopus"],
            "total_journals": r["total_journals"],
            "total_conferences": r["total_conferences"],
        }
        for r in rows
    ]
    return json.dumps({
        "status": "success",
        "query": label,
        "count": len(schools),
        "data": schools,
    }, indent=2)


def get_university_overview() -> str:
    """
    One-call university-wide snapshot: total publications, total citations, Q1-Q4
    breakdown, the top 5 departments by publications, and faculty count / average h-index.
    Use for compound requests like 'give me a research overview' instead of several calls.
    Total publications/citations use COUNT(DISTINCT id)/SUM over publications directly (not
    summed per-faculty), so a co-authored paper is counted once.
    """
    totals_sql = """
        SELECT COUNT(DISTINCT id)::int AS total_publications,
               COALESCE(SUM(scs_citations), 0)::int AS total_citations
        FROM publications
    """
    qrank_sql = """
        SELECT q_rank_scopus, COUNT(*)::int AS cnt
        FROM publications
        WHERE q_rank_scopus IS NOT NULL
        GROUP BY q_rank_scopus
    """
    faculty_sql = """
        SELECT COUNT(*)::int AS faculty_count,
               ROUND(AVG(scopus_hindex)::numeric, 2) AS avg_hindex
        FROM v_faculty_full
    """
    dept_sql = """
        SELECT department,
               COALESCE(SUM(total_pub_count), 0)::int AS total_publications,
               COALESCE(SUM(scopus_citation), 0)::int AS total_citations
        FROM v_faculty_full
        GROUP BY department
        ORDER BY total_publications DESC
        LIMIT 5
    """

    totals = execute_sql(totals_sql)
    if isinstance(totals, dict) and "error" in totals:
        return json.dumps({"status": "error", "message": totals["error"]})
    qrank_rows = execute_sql(qrank_sql)
    if isinstance(qrank_rows, dict) and "error" in qrank_rows:
        return json.dumps({"status": "error", "message": qrank_rows["error"]})
    faculty = execute_sql(faculty_sql)
    if isinstance(faculty, dict) and "error" in faculty:
        return json.dumps({"status": "error", "message": faculty["error"]})
    dept_rows = execute_sql(dept_sql)
    if isinstance(dept_rows, dict) and "error" in dept_rows:
        return json.dumps({"status": "error", "message": dept_rows["error"]})

    t = totals[0] if totals else {"total_publications": 0, "total_citations": 0}
    breakdown = {r["q_rank_scopus"]: r["cnt"] for r in qrank_rows} if isinstance(qrank_rows, list) else {}
    f = faculty[0] if faculty else {"faculty_count": 0, "avg_hindex": 0}
    top_depts = [
        {"department": r["department"], "publications": r["total_publications"], "citations": r["total_citations"]}
        for r in (dept_rows or [])
    ]

    return json.dumps({
        "status": "success",
        "total_publications": t["total_publications"],
        "total_citations": t["total_citations"],
        "q1_count": breakdown.get("Q1", 0),
        "q2_count": breakdown.get("Q2", 0),
        "q3_count": breakdown.get("Q3", 0),
        "q4_count": breakdown.get("Q4", 0),
        "faculty_count": f["faculty_count"],
        "avg_faculty_hindex": float(f["avg_hindex"]) if f["avg_hindex"] is not None else 0,
        "top_5_departments_by_publications": top_depts,
    }, indent=2)


def _latest_complete_year() -> int | None:
    """The newest year with data, minus one: the current year is usually a partial year in
    progress (the export has a fixed as-of date, not "today")."""
    rows = execute_sql("SELECT MAX(year)::int AS y FROM publications WHERE year IS NOT NULL")
    if isinstance(rows, dict) and "error" in rows:
        return None
    y = rows[0]["y"] if rows else None
    return (y - 1) if y else None


def get_department_trend(department: str = None, from_year: int = None, to_year: int = None, *,
                         scope_departments: list = None) -> str:
    """
    Multi-year publication trend for one department: total, Q1 and Q2 counts per year.
    Defaults to the last 5 completed years (the newest year in the data is usually partial
    and is excluded). Expands dept abbreviations (CSE/ECE/etc.) before querying.
    """
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")
    if scope_departments is None and not department:
        return json.dumps({"status": "error", "message": "department is required"})

    if to_year is None or from_year is None:
        latest_complete_year = _latest_complete_year()
        if latest_complete_year is None:
            return json.dumps({"status": "error", "message": "No yearly data available."})
        if to_year is None:
            to_year = latest_complete_year
        if from_year is None:
            from_year = to_year - 4
    for y in (from_year, to_year):
        try:
            if not (2000 <= int(y) <= 2035):
                return json.dumps({"status": "error", "message": f"Year {y} out of range (2000-2035)."})
        except (TypeError, ValueError):
            return json.dumps({"status": "error", "message": f"Invalid year: '{y}'"})
    from_year, to_year = int(from_year), int(to_year)
    if from_year > to_year:
        from_year, to_year = to_year, from_year

    if scope_departments is not None:
        dept_label = ", ".join(scope_departments)
        dept_filter = _pub_dept_any(scope_departments)
    else:
        dept_full = _expand_dept(department)
        dept_label = dept_full
        dept_filter = _pub_dept_any([dept_full])

    sql = f"""
        SELECT year,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE q_rank_scopus = 'Q1')::int AS q1,
               COUNT(*) FILTER (WHERE q_rank_scopus = 'Q2')::int AS q2
        FROM publications
        WHERE year BETWEEN {from_year} AND {to_year}
          AND {dept_filter}
        GROUP BY year
        ORDER BY year
    """
    rows = execute_sql(sql)
    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})

    by_year = {r["year"]: r for r in rows} if isinstance(rows, list) else {}
    yearly = [
        {
            "year": y,
            "publications": by_year.get(y, {}).get("total", 0),
            "q1_count": by_year.get(y, {}).get("q1", 0),
            "q2_count": by_year.get(y, {}).get("q2", 0),
        }
        for y in range(from_year, to_year + 1)
    ]
    return json.dumps({
        "status": "success",
        "department": dept_label,
        "from_year": from_year,
        "to_year": to_year,
        "yearly": yearly,
    }, indent=2)


def get_inactive_faculty(department: str = None, months: int = 12, *, scope_departments: list = None) -> str:
    """
    Faculty in one department with no publication on record (via the faculty-publication
    link) in the last N months, based on the newest COMPLETE year in the dataset — not
    today's calendar date, since the export has a fixed as-of date. Includes faculty with no
    publication on record at all.
    """
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")
    if scope_departments is None and not department:
        return json.dumps({"status": "error", "message": "department is required"})

    months = max(1, min(int(months), 240))
    years_back = max(1, -(-months // 12))          # ceil(months / 12)

    reference_year = _latest_complete_year()
    if reference_year is None:
        return json.dumps({"status": "error", "message": "No yearly data available."})
    cutoff_year = reference_year - years_back + 1

    if scope_departments is not None:
        dept_sql = _faculty_dept_in(scope_departments)
        dept_label = ", ".join(scope_departments)
    else:
        dept_full = _expand_dept(department)
        dept_escaped = dept_full.replace("'", "''")
        dept_sql = f"(department ILIKE '%{dept_escaped}%' OR short_name ILIKE '%{dept_escaped}%')"
        dept_label = dept_full

    count_sql = f"SELECT COUNT(*)::int AS cnt FROM v_faculty_full WHERE {dept_sql}"
    count_rows = execute_sql(count_sql)
    if isinstance(count_rows, dict) and "error" in count_rows:
        return json.dumps({"status": "error", "message": count_rows["error"]})
    if not count_rows or count_rows[0]["cnt"] == 0:
        return json.dumps({
            "status": "no_match",
            "message": f"No department found matching '{department}'." if department else "No matching faculty.",
        })

    sql = f"""
        SELECT f.author_name, MAX(p.year) AS last_pub_year
        FROM v_faculty_full f
        LEFT JOIN faculty_publications fp ON fp.faculty_id = f.faculty_id
        LEFT JOIN publications p ON p.id = fp.publication_id
        WHERE {dept_sql}
        GROUP BY f.author_name
        HAVING MAX(p.year) IS NULL OR MAX(p.year) <= {cutoff_year}
        ORDER BY last_pub_year NULLS FIRST, f.author_name
    """
    rows = execute_sql(sql)
    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})

    inactive = [{"name": r["author_name"], "last_publication_year": r["last_pub_year"]} for r in (rows or [])]
    return json.dumps({
        "status": "success",
        "department": dept_label,
        "reference_year": reference_year,
        "cutoff_year": cutoff_year,
        "months_threshold": months,
        "inactive_count": len(inactive),
        "inactive_faculty": inactive,
        "note": (
            "'reference_year' is the newest COMPLETE year in the dataset, not today's date. "
            "A null last_publication_year means no publication is on record for that person at all."
        ),
    }, indent=2)


def _resolve_one_faculty(faculty_name: str, *, ria_user_id: int = None, scope_departments: list = None):
    """Resolve to exactly one v_faculty_full row (ria_user_id, faculty_id, author_name, department).

    Returns (row, None) on success or (None, error_json_str) on failure. Shared by the
    self/named-person tools below (get_top_cited_publications, get_department_benchmark,
    get_citations_by_year) so each only has to build its own query on top of a resolved person."""
    if scope_departments is not None and not scope_departments:
        return None, _forbidden("No department is available for your account.")
    if ria_user_id is None and not faculty_name:
        return None, json.dumps({"status": "error", "message": "faculty_name is required"})

    if ria_user_id is not None:
        where_sql = f"ria_user_id = {int(ria_user_id)}"
        order_sql = "ria_user_id"
    else:
        name_escaped = faculty_name.replace("'", "''")
        where_sql = f"similarity(author_name, '{name_escaped}') > 0.4"
        if scope_departments is not None:
            where_sql += " AND " + _faculty_dept_in(scope_departments)
        order_sql = f"similarity(author_name, '{name_escaped}') DESC"

    rows = execute_sql(f"""
        SELECT ria_user_id, faculty_id, author_name, department
        FROM v_faculty_full
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT 1
    """)
    if isinstance(rows, dict) and "error" in rows:
        return None, json.dumps({"status": "error", "message": rows["error"]})
    if not rows:
        return None, _faculty_miss(faculty_name, scope_departments)
    return rows[0], None


def get_top_cited_publications(faculty_name: str = "", limit: int = 10, *,
                               ria_user_id: int = None, scope_departments: list = None) -> str:
    """
    A faculty member's own publications sorted by Scopus citation count, highest first.
    Use when the user wants to know WHICH paper is most cited, not just a citation total
    (search_publications_by_author can only sort by year).
    """
    person, err = _resolve_one_faculty(faculty_name, ria_user_id=ria_user_id, scope_departments=scope_departments)
    if err:
        return err
    limit = max(1, min(int(limit), 30))

    rows = execute_sql(f"""
        SELECT p.title, p.year, p.source_publication, p.q_rank_scopus, p.scs_citations, p.doi
        FROM faculty_publications fp
        JOIN publications p ON p.id = fp.publication_id
        WHERE fp.faculty_id = {_sql_str(person["faculty_id"])}
        ORDER BY p.scs_citations DESC NULLS LAST, p.year DESC
        LIMIT {limit}
    """)
    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})
    if not rows:
        return json.dumps({"status": "no_match", "message": f"No publications on record for {person['author_name']}."})

    papers = [
        {
            "title": r["title"], "year": r["year"], "source": r["source_publication"],
            "qrank": r["q_rank_scopus"], "scopus_citations": r["scs_citations"] or 0, "doi": r["doi"],
        }
        for r in rows
    ]
    return json.dumps({
        "status": "success",
        "name": person["author_name"],
        "sorted_by": "Scopus citations (highest first)",
        "count": len(papers),
        "data": papers,
    }, indent=2)


def get_department_benchmark(faculty_name: str = "", *, ria_user_id: int = None, scope_departments: list = None) -> str:
    """
    Compare one faculty member's publications, citations and h-index against their own
    department's average and median, in one call (no need to divide totals manually).
    """
    person, err = _resolve_one_faculty(faculty_name, ria_user_id=ria_user_id, scope_departments=scope_departments)
    if err:
        return err

    dept_escaped = person["department"].replace("'", "''")
    dept_rows = execute_sql(f"""
        SELECT
            COUNT(*)::int AS faculty_count,
            ROUND(AVG(total_pub_count)::numeric, 1) AS avg_pub,
            ROUND(AVG(scopus_citation)::numeric, 1) AS avg_citation,
            ROUND(AVG(scopus_hindex)::numeric, 1) AS avg_hindex,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_pub_count) AS median_pub,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY scopus_citation) AS median_citation,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY scopus_hindex) AS median_hindex
        FROM v_faculty_full
        WHERE department = '{dept_escaped}'
    """)
    if isinstance(dept_rows, dict) and "error" in dept_rows:
        return json.dumps({"status": "error", "message": dept_rows["error"]})
    own_rows = execute_sql(f"""
        SELECT total_pub_count, scopus_citation, scopus_hindex
        FROM v_faculty_full
        WHERE ria_user_id = {int(person["ria_user_id"])}
    """)
    if isinstance(own_rows, dict) and "error" in own_rows:
        return json.dumps({"status": "error", "message": own_rows["error"]})

    d = dept_rows[0] if dept_rows else {}
    o = own_rows[0] if own_rows else {}

    def _cmp(own_val, avg_val):
        if own_val is None or avg_val is None:
            return "unknown"
        return "above" if own_val > avg_val else ("below" if own_val < avg_val else "at")

    return json.dumps({
        "status": "success",
        "name": person["author_name"],
        "department": person["department"],
        "department_faculty_count": d.get("faculty_count", 0),
        "own": {
            "publications": o.get("total_pub_count") or 0,
            "citations": o.get("scopus_citation") or 0,
            "hindex": o.get("scopus_hindex") or 0,
        },
        "department_average": {
            "publications": float(d.get("avg_pub") or 0),
            "citations": float(d.get("avg_citation") or 0),
            "hindex": float(d.get("avg_hindex") or 0),
        },
        "department_median": {
            "publications": float(d.get("median_pub") or 0),
            "citations": float(d.get("median_citation") or 0),
            "hindex": float(d.get("median_hindex") or 0),
        },
        "vs_department_average": {
            "publications": _cmp(o.get("total_pub_count"), d.get("avg_pub")),
            "citations": _cmp(o.get("scopus_citation"), d.get("avg_citation")),
            "hindex": _cmp(o.get("scopus_hindex"), d.get("avg_hindex")),
        },
    }, indent=2)


def get_citations_by_year(faculty_name: str = "", *, ria_user_id: int = None, scope_departments: list = None) -> str:
    """
    A faculty member's publication count and total Scopus citations, grouped by the year
    each paper was published. This is NOT a citation growth trend over time: the database
    stores one current citation total per paper, not a history of how citations accumulated.
    """
    person, err = _resolve_one_faculty(faculty_name, ria_user_id=ria_user_id, scope_departments=scope_departments)
    if err:
        return err

    rows = execute_sql(f"""
        SELECT p.year, COUNT(*)::int AS pubs, COALESCE(SUM(p.scs_citations), 0)::int AS citations
        FROM faculty_publications fp
        JOIN publications p ON p.id = fp.publication_id
        WHERE fp.faculty_id = {_sql_str(person["faculty_id"])}
          AND p.year IS NOT NULL
        GROUP BY p.year
        ORDER BY p.year DESC
    """)
    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})
    if not rows:
        return json.dumps({"status": "no_match", "message": f"No publications on record for {person['author_name']}."})

    yearly = [{"year": r["year"], "publications": r["pubs"], "citations": r["citations"]} for r in rows]
    return json.dumps({
        "status": "success",
        "name": person["author_name"],
        "note": (
            "Publications and their current total citations, grouped by publication year. This "
            "is not a citation trend over time — the database stores one citation count per "
            "paper, not how citations accumulated year by year."
        ),
        "yearly": yearly,
    }, indent=2)


def _resolve_dept_name(text: str) -> str | None:
    """Best-effort: map free text to ONE canonical department name via v_faculty_full (exact
    match preferred, falls back to a substring match). Only needed for VC callers, who bypass
    the guard and so pass raw, unvalidated text; Faculty Dean callers arrive here with an
    already-canonical name injected by scope_guard."""
    if not text:
        return None
    expanded = _expand_dept(text)
    esc = expanded.replace("'", "''")
    rows = execute_sql(f"""
        SELECT department FROM (
            SELECT DISTINCT department, (department = '{esc}') AS is_exact
            FROM v_faculty_full
            WHERE department = '{esc}' OR department ILIKE '%{esc}%' OR short_name ILIKE '%{esc}%'
        ) matches
        ORDER BY is_exact DESC
        LIMIT 1
    """)
    if isinstance(rows, list) and rows:
        return rows[0]["department"]
    return None


_JUNCTION_COVERAGE_NOTE = (
    "Counts are papers linked to a faculty record via faculty_publications; not every "
    "publication has a linked author yet, so totals may be a subset of the department's full "
    "publication count."
)


def get_author_concentration(department: str = None, top_k: int = 5, *, scope_departments: list = None) -> str:
    """
    Share of a department's (or your whole school's) DISTINCT publications produced by its
    top-K most-published authors, via the faculty_publications junction (exact per-person
    joins, not home_authors text matching) — shows whether output is concentrated in a few
    people or broadly spread. Never returns individual names.
    """
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")
    top_k = max(1, min(int(top_k), 20))

    if scope_departments is not None:
        dept_where = "f.department IN (" + ", ".join(_sql_str(n) for n in scope_departments) + ")"
        dept_label = ", ".join(scope_departments)
    elif department:
        dept_full = _expand_dept(department)
        dept_escaped = dept_full.replace("'", "''")
        dept_where = (
            f"(f.department ILIKE '%{dept_escaped}%' OR f.short_name ILIKE '%{dept_escaped}%' "
            f"OR f.institute ILIKE '%{dept_escaped}%')"
        )
        dept_label = dept_full
    else:
        dept_where = "TRUE"
        dept_label = "All departments (university-wide)"

    # Wrapped in an outer SELECT (rather than starting with WITH) because execute_sql only
    # allows statements that literally start with the word SELECT.
    sql = f"""
        SELECT * FROM (
            WITH scoped AS (
                SELECT fp.faculty_id, fp.publication_id
                FROM faculty_publications fp
                JOIN v_faculty_full f ON f.faculty_id = fp.faculty_id
                WHERE {dept_where}
            ),
            per_author AS (
                SELECT faculty_id, COUNT(DISTINCT publication_id)::int AS pub_count
                FROM scoped
                GROUP BY faculty_id
            )
            SELECT
                (SELECT COUNT(DISTINCT publication_id) FROM scoped)::int AS total_publications,
                (SELECT COUNT(*) FROM per_author)::int AS author_count,
                COALESCE((SELECT SUM(pub_count)::int FROM (
                    SELECT pub_count FROM per_author ORDER BY pub_count DESC LIMIT {top_k}
                ) t), 0) AS top_k_publications
        ) result
    """
    rows = execute_sql(sql)
    if isinstance(rows, dict) and "error" in rows:
        return json.dumps({"status": "error", "message": rows["error"]})
    if not rows or not rows[0]["total_publications"]:
        return json.dumps({
            "status": "no_match",
            "message": f"No publications linked to a faculty record were found for '{dept_label}'.",
        })

    r = rows[0]
    total, authors, top_k_pubs = r["total_publications"], r["author_count"], r["top_k_publications"]
    return json.dumps({
        "status": "success",
        "department": dept_label,
        "top_k": min(top_k, authors),
        "author_count": authors,
        "total_publications": total,
        "top_k_publications": top_k_pubs,
        "concentration_percent": round(100.0 * top_k_pubs / total, 1) if total else 0,
        "note": _JUNCTION_COVERAGE_NOTE,
    }, indent=2)


def get_cross_department_collaboration(dept_a: str = "", dept_b: str = "", *,
                                       dept_a_scope: str = None, dept_b_scope: str = None) -> str:
    """
    Publications with at least one faculty member from department A AND at least one from
    department B — cross-department co-authorship — via the faculty_publications junction
    (exact per-person department joins, never publications.home_authors text matching).
    """
    a = dept_a_scope or _resolve_dept_name(dept_a)
    b = dept_b_scope or _resolve_dept_name(dept_b)
    if not a:
        return json.dumps({"status": "no_match", "message": f"No department matching '{dept_a}' was found."})
    if not b:
        return json.dumps({"status": "no_match", "message": f"No department matching '{dept_b}' was found."})
    if a == b:
        return json.dumps({"status": "error", "message": "dept_a and dept_b must be different departments."})

    a_esc, b_esc = a.replace("'", "''"), b.replace("'", "''")

    joint_rows = execute_sql(f"""
        SELECT COUNT(DISTINCT fp1.publication_id)::int AS cnt
        FROM faculty_publications fp1
        JOIN v_faculty_full fa ON fa.faculty_id = fp1.faculty_id AND fa.department = '{a_esc}'
        JOIN faculty_publications fp2 ON fp2.publication_id = fp1.publication_id
        JOIN v_faculty_full fb ON fb.faculty_id = fp2.faculty_id AND fb.department = '{b_esc}'
    """)
    if isinstance(joint_rows, dict) and "error" in joint_rows:
        return json.dumps({"status": "error", "message": joint_rows["error"]})

    totals_rows = execute_sql(f"""
        SELECT
            (SELECT COUNT(DISTINCT fp.publication_id) FROM faculty_publications fp
             JOIN v_faculty_full f ON f.faculty_id = fp.faculty_id AND f.department = '{a_esc}')::int AS a_total,
            (SELECT COUNT(DISTINCT fp.publication_id) FROM faculty_publications fp
             JOIN v_faculty_full f ON f.faculty_id = fp.faculty_id AND f.department = '{b_esc}')::int AS b_total
    """)
    if isinstance(totals_rows, dict) and "error" in totals_rows:
        return json.dumps({"status": "error", "message": totals_rows["error"]})

    joint = joint_rows[0]["cnt"] if joint_rows else 0
    a_total = totals_rows[0]["a_total"] if totals_rows else 0
    b_total = totals_rows[0]["b_total"] if totals_rows else 0

    return json.dumps({
        "status": "success",
        "dept_a": a,
        "dept_b": b,
        "dept_a_publications": a_total,
        "dept_b_publications": b_total,
        "joint_publications": joint,
        "joint_share_of_dept_a_percent": round(100.0 * joint / a_total, 1) if a_total else 0,
        "joint_share_of_dept_b_percent": round(100.0 * joint / b_total, 1) if b_total else 0,
        "note": _JUNCTION_COVERAGE_NOTE,
    }, indent=2)


def get_growth_acceleration(department: str = None, *, scope_departments: list = None) -> str:
    """
    Year-over-year publication growth AND growth acceleration (whether that growth is speeding
    up or slowing down) for the last 4 completed years, broken down per department (every
    department in your school if department is omitted). Excludes the current, likely-
    incomplete year.
    """
    if scope_departments is not None and not scope_departments:
        return _forbidden("No department is available for your account.")

    if scope_departments is not None:
        dept_names = list(scope_departments)
    elif department:
        dept_names = [_expand_dept(department)]
    else:
        dept_names = None   # unrestricted (VC, no department given): one university-wide series

    latest = _latest_complete_year()
    if latest is None:
        return json.dumps({"status": "error", "message": "No yearly data available."})
    from_year = latest - 3   # 4 completed years -> 3 growth-rate transitions -> 1 acceleration value

    def _series_for(dept_filter: str) -> list[dict]:
        rows = execute_sql(f"""
            SELECT year, COUNT(*)::int AS cnt
            FROM publications
            WHERE year BETWEEN {from_year} AND {latest}
              AND {dept_filter}
            GROUP BY year
            ORDER BY year
        """)
        if isinstance(rows, dict) and "error" in rows:
            raise RuntimeError(rows["error"])
        by_year = {r["year"]: r["cnt"] for r in rows} if isinstance(rows, list) else {}
        return [{"year": y, "publications": by_year.get(y, 0)} for y in range(from_year, latest + 1)]

    def _analyze(name: str, dept_filter: str) -> dict:
        yearly = _series_for(dept_filter)
        counts = [y["publications"] for y in yearly]
        growth = []
        for i in range(1, len(counts)):
            prev, curr = counts[i - 1], counts[i]
            growth.append(round(100.0 * (curr - prev) / prev, 1) if prev else None)
        acceleration = None
        trend = "unknown"
        if len(growth) >= 2 and growth[-1] is not None and growth[-2] is not None:
            acceleration = round(growth[-1] - growth[-2], 1)
            trend = "accelerating" if acceleration > 0 else ("decelerating" if acceleration < 0 else "stable")
        return {
            "department": name,
            "yearly": yearly,
            "growth_percent": growth,
            "acceleration": acceleration,
            "trend": trend,
        }

    try:
        if dept_names is None:
            departments = [_analyze("All departments (university-wide)", "TRUE")]
        else:
            departments = [_analyze(n, _pub_dept_any([n])) for n in dept_names]
    except RuntimeError as err:
        return json.dumps({"status": "error", "message": str(err)})

    return json.dumps({
        "status": "success",
        "from_year": from_year,
        "to_year": latest,
        "departments": departments,
        "note": (
            "'acceleration' is the change in year-over-year growth rate between the two most "
            "recent completed-year transitions: positive means growth is speeding up, negative "
            "means it is slowing down (or output is shrinking faster). The current year is "
            "excluded because its data is usually incomplete."
        ),
    }, indent=2)


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_faculty_stats",
            "description": (
                "Research metrics for one named faculty member: publications, citations, h-index, "
                "Q1-Q4 counts, journals, conferences, impact factor. source='scopus' by default; "
                "'wos' only if the user says Web of Science/WoS."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "faculty_name": {
                        "type": "string",
                        "description": "Full/partial name; fuzzy-matched."
                    },
                    "source": {
                        "type": "string",
                        "enum": ["scopus", "wos"],
                        "default": "scopus"
                    }
                },
                "required": ["faculty_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_department_stats",
            "description": (
                "Aggregated stats for one department/school: faculty count, total publications, "
                "citations, total h-index (sum across faculty), Q1 count, and top-N faculty by "
                "citations. Accepts abbreviations (CSE, ECE, Mech, ...)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": "string",
                        "description": "Department name or abbreviation (CSE, ECE, Mechanical, etc.)"
                    },
                    "top_n": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 20,
                        "default": 5,
                        "description": "Number of top faculty to return (by citations). Default 5."
                    }
                },
                "required": ["department"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "count_qrank_publications",
            "description": (
                "Count publications by Scopus Q-rank, optionally by department/year. Omit qrank "
                "for a total count, omit department for university-wide. DO NOT use for one "
                "person's Q-rank — use get_faculty_stats."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "qrank": {
                        "type": ["string", "null"],
                        "enum": ["Q1", "Q2", "Q3", "Q4", None],
                        "description": "Scopus Q-rank tier; omit for a total count across all ranks."
                    },
                    "department": {
                        "type": ["string", "null"],
                        "description": "Dept name/abbreviation; omit for university-wide."
                    },
                    "year": {
                        "type": ["integer", "null"],
                        "description": "Specific publication year, e.g. 2024; omit for all years."
                    },
                    "source": {
                        "type": "string",
                        "enum": ["scopus", "wos"],
                        "description": "Q-rank index. Default 'scopus' (Excel Q RANK(SCS)); use 'wos' ONLY if the user explicitly asks for Web of Science/WoS."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_publications_by_author",
            "description": (
                "List one faculty member's actual publication titles/years/journals/Q-ranks/"
                "citations — use when the user wants to see papers, not just a count."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "author_name": {
                        "type": "string",
                        "description": "Full or partial faculty name."
                    },
                    "year": {
                        "type": ["integer", "null"],
                        "description": "Specific year; omit for all years."
                    },
                    "qrank": {
                        "type": ["string", "null"],
                        "enum": ["Q1", "Q2", "Q3", "Q4", None],
                        "description": "Scopus Q-rank filter; omit for all ranks."
                    },
                    "department": {
                        "type": ["string", "null"],
                        "description": "Optional: disambiguate when multiple faculty share a name."
                    },
                    "limit": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": 30,
                        "default": 10
                    },
                    "source": {
                        "type": "string",
                        "enum": ["scopus", "wos"],
                        "description": "Q-rank index. Default 'scopus' (Excel Q RANK(SCS)); use 'wos' ONLY if the user explicitly asks for Web of Science/WoS."
                    }
                },
                "required": ["author_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compare_entities",
            "description": (
                "Compare or rank departments, faculty, or institutes/schools. "
                "entity_type='department'|'faculty'|'institute'. Leave entities empty to rank ALL "
                "of that type; for faculty ranking, optionally set department to filter."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entity_type": {
                        "type": "string",
                        "enum": ["department", "faculty", "institute"],
                        "description": "What to compare: 'department', 'faculty', or 'institute' (school-level)."
                    },
                    "entities": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Names to compare; leave empty to rank ALL."
                    },
                    "metric": {
                        "type": "string",
                        "enum": ["citations", "publications", "hindex", "q1_count", "journals", "conferences"],
                        "default": "citations",
                        "description": "Metric to sort/compare by."
                    },
                    "top_n": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 30,
                        "default": 10,
                        "description": "How many results to return. Default 10."
                    },
                    "department": {
                        "type": "string",
                        "description": "Filter faculty rankings by department (entity_type='faculty' only)."
                    }
                },
                "required": ["entity_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_yearly_stats",
            "description": (
                "University-wide publication count for one year, or year-over-year growth between "
                "the two most recent completed years if year is omitted. Optional department filter."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {
                        "type": ["integer", "null"],
                        "description": "Year to count publications for (2018-2026); omit for year-over-year growth."
                    },
                    "department": {
                        "type": ["string", "null"],
                        "description": "Optional dept filter; omit for university-wide."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_qrank_distribution",
            "description": (
                "Full Q1-Q4 breakdown plus the Q1+Q2 share in ONE call, optionally by "
                "department/year. Prefer this over calling count_qrank_publications once per quartile."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": ["string", "null"],
                        "description": "Dept name/abbreviation; omit for university-wide."
                    },
                    "year": {
                        "type": ["integer", "null"],
                        "description": "Specific publication year; omit for all years."
                    },
                    "source": {
                        "type": "string",
                        "enum": ["scopus", "wos"],
                        "description": "Q-rank index. Default 'scopus' (Excel Q RANK(SCS)); use 'wos' ONLY if the user explicitly asks for Web of Science/WoS."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_institute_summary",
            "description": (
                "Aggregated stats for one school/institute (faculty count, publications, citations, "
                "avg h-index, Q1, journals, conferences), or ALL schools if omitted. Accepts full "
                "or short name."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "institute": {
                        "type": ["string", "null"],
                        "description": "School/institute name or short name; omit for all schools."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_university_overview",
            "description": (
                "One-call university-wide snapshot: totals, Q1-Q4 breakdown, top 5 departments by "
                "publications, faculty count/avg h-index. Use instead of several separate calls."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_department_trend",
            "description": (
                "Multi-year trend for ONE department: total/Q1/Q2 counts per year. Single "
                "department only — use get_yearly_stats for the whole university. Omit years for "
                "the last 5 completed years; omit department for your own."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": ["string", "null"],
                        "description": "Dept name/abbreviation; omit for your own department."
                    },
                    "from_year": {
                        "type": ["integer", "null"],
                        "description": "First year of the range; omit for 5 years before to_year."
                    },
                    "to_year": {
                        "type": ["integer", "null"],
                        "description": "Last year of the range; omit for the newest completed year."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_inactive_faculty",
            "description": (
                "Faculty in ONE department with no publication in the last N months (default 12), "
                "based on the newest complete year in the dataset."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": ["string", "null"],
                        "description": "Dept name/abbreviation; omit for your own department."
                    },
                    "months": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": 240,
                        "default": 12,
                        "description": "How many months of inactivity counts as inactive. Default 12."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_cited_publications",
            "description": (
                "ONE named faculty member's own papers sorted by Scopus citations, highest first "
                "— search_publications_by_author can only sort by year."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "faculty_name": {
                        "type": "string",
                        "description": "Full/partial name; fuzzy-matched."
                    },
                    "limit": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": 30,
                        "default": 10,
                        "description": "Max papers to return. Default 10."
                    }
                },
                "required": ["faculty_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_department_benchmark",
            "description": (
                "ONE named faculty member's publications/citations/h-index vs. their own "
                "department's average and median, in one call."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "faculty_name": {
                        "type": "string",
                        "description": "Full/partial name; fuzzy-matched."
                    }
                },
                "required": ["faculty_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_citations_by_year",
            "description": (
                "ONE named faculty member's publication count and total Scopus citations, grouped "
                "by year. NOT a citation growth trend — even if asked for 'trend'/'trajectory', "
                "these are current totals, not a history."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "faculty_name": {
                        "type": "string",
                        "description": "Full/partial name; fuzzy-matched."
                    }
                },
                "required": ["faculty_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_author_concentration",
            "description": (
                "Share of a department's/school's publications from its top-K most-published "
                "authors (via the faculty-publication link, not text matching). Never returns "
                "names. Faculty Dean only; omit department for your whole school."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": ["string", "null"],
                        "description": "Dept name/abbreviation; omit for your whole school."
                    },
                    "top_k": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": 20,
                        "default": 5,
                        "description": "How many top authors to sum. Default 5."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_cross_department_collaboration",
            "description": (
                "Publications co-authored across two departments in your school (via the "
                "faculty-publication link, ID-based). Faculty Dean only; both departments must be "
                "in your school."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dept_a": {
                        "type": "string",
                        "description": "First department, name or abbreviation."
                    },
                    "dept_b": {
                        "type": "string",
                        "description": "Second department, name or abbreviation."
                    }
                },
                "required": ["dept_a", "dept_b"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_growth_acceleration",
            "description": (
                "Year-over-year growth AND whether that growth is speeding up/slowing down "
                "(acceleration), per department in your school, for the last few completed years. "
                "NOT a plain trend — use get_department_trend for that. Faculty Dean only."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": ["string", "null"],
                        "description": "Dept name/abbreviation; omit for a breakdown of every department in your school."
                    }
                },
                "required": []
            }
        }
    }
]

TOOL_FUNCTIONS = {
    "get_faculty_stats":             get_faculty_stats,
    "get_department_stats":          get_department_stats,
    "count_qrank_publications":      count_qrank_publications,
    "search_publications_by_author": search_publications_by_author,
    "compare_entities":              compare_entities,
    "get_yearly_stats":              get_yearly_stats,
    "get_qrank_distribution":        get_qrank_distribution,
    "get_institute_summary":         get_institute_summary,
    "get_university_overview":       get_university_overview,
    "get_department_trend":          get_department_trend,
    "get_inactive_faculty":          get_inactive_faculty,
    "get_top_cited_publications":    get_top_cited_publications,
    "get_department_benchmark":      get_department_benchmark,
    "get_citations_by_year":         get_citations_by_year,
    "get_author_concentration":         get_author_concentration,
    "get_cross_department_collaboration": get_cross_department_collaboration,
    "get_growth_acceleration":          get_growth_acceleration,
}

RIA_SYSTEM_PROMPT = """You are RIA (Research Intelligence Agent) for KLE Technological University.
You MUST ALWAYS call a tool. NEVER answer research data from memory or make up numbers.

PRECEDENCE: If a ROLE PERSONA section appears above, it defines your voice, tone, response structure
and who you are talking to. This prompt defines tool routing, data honesty and access limits. If they
conflict on style or format, follow the persona. If they conflict on which tools you may call or what
data you may state, follow this prompt.

IMPORTANT: the routing table below names every tool that exists, but your tools this turn may be a
subset (role-based access). If the best-matching tool isn't in your tools this turn, do NOT call it
anyway — say in plain words it's not available at your access level and suggest an alternative.

TOOL ROUTING (first matching rule wins; only applies to tools you actually have this turn):
- Compound overview, no specific dept/person ("research overview", "summarize our output") → get_university_overview
- Full Q1-Q4 breakdown / Q1+Q2 share in one call → get_qrank_distribution (not 4x count_qrank_publications)
- ONE school's stats ("how is School of CSE doing") → get_institute_summary
- School/institute ranking or comparison → compare_entities(entity_type='institute')
- Faculty inactive in a dept ("not published in N months/year") → get_inactive_faculty
- Output concentrated in a few authors ("author concentration", "how spread out") → get_author_concentration
- Collaboration between TWO named departments → get_cross_department_collaboration
- Growth SPEEDING UP or SLOWING DOWN ("accelerating/decelerating") → get_growth_acceleration (not get_department_trend)
- Multi-year trend/growth for ONE named department → get_department_trend
- Year count / YoY growth for the WHOLE UNIVERSITY ("in 2024", "YoY", "growth rate", "trending") → get_yearly_stats
- Compare/rank departments or faculty ("compare", "vs", "rank", "top", "leaderboard") → compare_entities
- ONE person's most-cited paper / papers sorted by citations → get_top_cited_publications
- ONE person vs their department average/median → get_department_benchmark
- ONE person's pubs/citations by year (NOT "trend"/"trajectory") → get_citations_by_year
- Per-person stats/h-index/citations/Q-rank/profile → get_faculty_stats
- Per-person paper listing/titles → search_publications_by_author
- ONE department's overview/stats/top faculty → get_department_stats
- Q-rank count for dept or university, optionally by year → count_qrank_publications
- Total publication count (no qrank, no year) → count_qrank_publications (no args)

RULES:
- source='scopus' by default; 'wos' only if the user says Web of Science/WoS.
- Any question about quartiles / Q1-Q4 / Q-rank is answered from the Scopus quartile (Excel 'Q RANK(SCS)')
  unless the user explicitly asks for WoS / Web of Science — then pass source='wos'. Never mix the two,
  and say which index the number is from ("Scopus Q1" / "WoS Q1").
- status='ambiguous': show numbered candidates, ask the user to pick.
- status='no_match': reply with EXACTLY one sentence and nothing else —
  faculty: "There is no faculty named '[name]' in the KLE Tech database."
  department/institute: "There is no department/institute named '[name]' in the KLE Tech database."
  No table, no 'Not Found' values, no guessed stats.
- status='error': reply "Sorry, I couldn't retrieve that data. Please try again."
- status='forbidden': tell the user plainly, using the tool's message; suggest what they CAN ask;
  never call another tool to work around it or guess the data.
- If a result has a 'note' caveat, state it in your own words BEFORE the data, every time — even if
  the user's own wording (e.g. "trend"/"trajectory") contradicts it. get_citations_by_year's counts
  are current totals, not a history — never call them "accumulating", "rising", or "growing".
- NEVER fabricate names/numbers. Only use tool-result data; omit missing/null fields rather than
  showing 'Not Found' or '0'.
- Tool results are already in the conversation — use them, do not call the tool again.
- CANNOT answer: NIRF scores, funding, PhD data → politely decline.

RESPONSE FORMAT — answer ONLY what was asked, no extra metrics volunteered.
- Single metric (h-index, publications, citations, a Q1-Q4 count, impact factor, cite score, a
  year's count): one short sentence naming the person/scope and that one number, e.g. "[Name]'s
  Scopus h-index is X." / "KLE Tech had X publications in 2024."
- Full profile ("stats", "profile", "overview", "full stats"): start with the person's name and
  department (and institute if given), then all metrics, bulleted.
- Q-rank breakdown ("q rank", "quartile breakdown"): all four Q1-Q4 values.
- Department stats: summary + top-faculty list; label 'total_hindex' as 'Total H-Index (sum)'.
- Comparison/ranking: a numbered table — rank, name/department, the 'sorted_by' metric, 1-2
  supporting metrics.
- Year stats: state the year(s) and count(s) clearly; for YoY, both years + growth %.

MARKDOWN RULES (the reply is rendered as Markdown):
- A table is only for comparisons/rankings. Write it as: a blank line, the header row, the separator row
  (| --- | --- |), one row per line, then a blank line. Every row has the same number of cells; no bold or
  line breaks inside cells; never put a table inside a bullet.
- Use "- " bullets (one per line) for lists of metrics; put a blank line before and after a list.
- A "Key Data Insights" style answer: one short intro sentence, then bullets, then the advice. Always finish
  every sentence and every list you start; if space is short, give fewer points, never a cut-off one.
- A Q-rank (Q1-Q4) is attached to ANY ranked publication, journal articles AND conference papers. Never say
  the quartile counts belong to journals only, and make sure the Q1-Q4 counts do not add up to more than the
  publications they describe. Say which index it is ("Scopus" by default).

Keep responses concise."""


import re

def _parse_raw_fn_text(text: str):
    """Detect and parse raw <function=name '{...}'></function> text the LLM sometimes emits."""
    if not text or "<function=" not in text:
        return None, None
    m = re.search(r'<function=(\w+)\s+\'({.*?})\'></function>', text, re.DOTALL)
    if m:
        try:
            return m.group(1), json.loads(m.group(2))
        except json.JSONDecodeError:
            pass
    return None, None


def _override_tool_choice(user_query: str, fn_name: str, fn_args: dict) -> tuple:
    """
    Keyword-based safety net: override the LLM's tool choice when it's
    obviously wrong. Returns (corrected_fn_name, corrected_fn_args) or
    (None, None) if no override needed.
    """
    q = user_query.lower()

    # A per-person question ("how many Q1 papers do I have?", or a call the model already made to a
    # per-person tool) must never be re-routed to a university/department aggregate: that would
    # answer a different question with someone else's number.
    if fn_name in ("get_faculty_stats", "search_publications_by_author") or re.search(
        r"\b(my|mine|myself)\b|\bi (have|got|published|wrote|authored)\b", q
    ):
        return None, None

    # A call the model already made to get_department_trend or get_growth_acceleration must never
    # be swapped for get_yearly_stats: both contain the word "growth"/"trend" in their own trigger
    # phrasing, but they are department/school-scoped and get_yearly_stats is university-wide with
    # no department argument at all -- the swap below would silently drop the department and widen
    # the answer to the whole university. Found live: "Is our growth accelerating or decelerating?"
    # for a Faculty Dean was rerouted from the correctly-chosen get_growth_acceleration to a plain
    # get_yearly_stats YoY count, then narrated as if it answered the acceleration question.
    if fn_name in ("get_department_trend", "get_growth_acceleration"):
        return None, None

    # Q-rank count queries -> count_qrank_publications
    qrank_match = re.search(r'\b(q[1-4])\b', q)
    if qrank_match:
        comp_keywords = ['compare', 'vs', 'versus', 'rank', 'leaderboard', 'top', 'highest', 'lowest', 'by department', 'dept-wise', 'dept wise']
        is_comparison = any(kw in q for kw in comp_keywords)
        if not is_comparison and fn_name != 'count_qrank_publications':
            count_keywords = ['total', 'how many', 'count', 'number of', 'papers', 'publications', 'articles']
            if any(kw in q for kw in count_keywords):
                qrank_val = qrank_match.group(1).upper()
                new_args = {'qrank': qrank_val}
                if re.search(r'(wos|web of science)', q):
                    new_args['source'] = 'wos'
                year_match = re.search(r'\b(20[12]\d)\b', q)
                if year_match:
                    new_args['year'] = int(year_match.group(1))
                return 'count_qrank_publications', new_args

    # General total publications count -> count_qrank_publications
    total_pub_keywords = ['total publications', 'total papers', 'how many publications', 'how many papers', 'number of publications', 'number of papers', 'total publication count', 'total paper count']
    if any(kw in q for kw in total_pub_keywords) and fn_name != 'count_qrank_publications':
        comp_keywords = ['compare', 'vs', 'versus', 'rank', 'leaderboard', 'top', 'highest', 'lowest', 'by department', 'dept-wise', 'dept wise']
        if not any(kw in q for kw in comp_keywords):
            new_args = {}
            year_match = re.search(r'\b(20[12]\d)\b', q)
            if year_match:
                new_args['year'] = int(year_match.group(1))
            return 'count_qrank_publications', new_args

    # Year / trend / growth queries -> get_yearly_stats
    year_keywords = ['trend', 'growth', 'yoy', 'year-over-year', 'year over year',
                     'publications in 20', 'papers in 20', 'output in 20',
                     'research in 20', 'count in 20']
    if any(kw in q for kw in year_keywords) and fn_name != 'get_yearly_stats':
        year_match = re.search(r'\b(20[12]\d)\b', q)
        new_args = {}
        if year_match:
            new_args['year'] = int(year_match.group(1))
        return 'get_yearly_stats', new_args

    return None, None


def main():
    if not os.environ.get('GROQ_API_KEY'):
        print("Set GROQ_API_KEY env var.")
        return
    if not os.environ.get('SUPABASE_URL') or not (os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_ANON_KEY')):
        print("Set SUPABASE_URL and SUPABASE_KEY.")
        return

    client = _client
    messages = [{"role": "system", "content": RIA_SYSTEM_PROMPT}]
    HISTORY_TURNS = 1

    print("=" * 60)
    print("  RIA — Research Intelligence Agent")
    print(f"  Model: {LLM_MODEL}")
    print("  Type 'quit' to exit")
    print("=" * 60)

    while True:
        user_input = input("\nYou: ").strip()
        if not user_input or user_input.lower() in ('quit', 'exit', 'q'):
            break

        messages.append({"role": "user", "content": user_input})
        dev = {"iterations": 0, "tool_calls": [],
               "tokens": {"prompt": 0, "completion": 0, "total": 0},
               "fallback": False}
        start_time = time.time()
        tool_called_this_turn = False  # FIX: track per-question, not global messages

        for iteration in range(3):
            dev["iterations"] = iteration + 1
            trimmed = [messages[0]] + messages[-(HISTORY_TURNS * 4):]

            # FIX: use per-turn flag instead of scanning all messages
            # (old code scanned all messages, so tool results from previous
            #  questions caused tool_choice='none' on new questions → hallucinations)
            if tool_called_this_turn:
                chosen_tool_choice = "none"   # have result → force text
                chosen_max_tokens = 1024
            elif iteration == 0:
                chosen_tool_choice = "required"  # force tool on first attempt
                chosen_max_tokens = 256
            else:
                chosen_tool_choice = "auto"
                chosen_max_tokens = 1024

            try:
                response = client.chat.completions.create(
                    model=LLM_MODEL,
                    messages=trimmed,
                    tools=TOOLS,
                    tool_choice=chosen_tool_choice,
                    max_tokens=chosen_max_tokens,
                )
            except Exception as e:
                error_str = str(e)
                if 'rate_limit_exceeded' in error_str or '429' in error_str:
                    print("\nRIA: Rate limit exceeded. Please wait a minute.")
                    break
                elif 'tool_use_failed' in error_str or 'looping_content' in error_str:
                    dev["fallback"] = True
                    try:
                        # Retry WITH tools but auto choice (not required)
                        response = client.chat.completions.create(
                            model=LLM_MODEL, messages=trimmed,
                            tools=TOOLS, tool_choice="auto",
                            max_tokens=1024,
                        )
                        if response.usage:
                            dev["tokens"]["prompt"]     += response.usage.prompt_tokens or 0
                            dev["tokens"]["completion"] += response.usage.completion_tokens or 0
                            dev["tokens"]["total"]      += response.usage.total_tokens or 0

                        fb_msg = response.choices[0].message

                        # If fallback produced tool calls, execute them
                        if fb_msg.tool_calls:
                            messages.append(fb_msg)
                            for tc in fb_msg.tool_calls:
                                fn_name = tc.function.name
                                fn_args = json.loads(tc.function.arguments) or {}
                                fn = TOOL_FUNCTIONS.get(fn_name)
                                t0 = time.time()
                                result = fn(**fn_args) if fn else json.dumps({"error": f"Unknown: {fn_name}"})
                                exec_ms = round((time.time() - t0) * 1000)
                                dev["tool_calls"].append({"tool": fn_name, "args": fn_args,
                                                          "result_length": len(result), "exec_ms": exec_ms})
                                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
                            tool_called_this_turn = True
                            dev["fallback"] = False  # recovered successfully
                            continue  # loop to format text answer

                        content = fb_msg.content or ""
                        # Check for raw function text
                        fn_name, fn_args = _parse_raw_fn_text(content)
                        if fn_name and fn_name in TOOL_FUNCTIONS:
                            fn = TOOL_FUNCTIONS[fn_name]
                            t0 = time.time()
                            result = fn(**fn_args)
                            exec_ms = round((time.time() - t0) * 1000)
                            dev["tool_calls"].append({"tool": fn_name, "args": fn_args,
                                                      "result_length": len(result), "exec_ms": exec_ms})
                            messages.append({"role": "assistant", "content": content})
                            messages.append({"role": "tool", "tool_call_id": "fallback", "content": result})
                            tool_called_this_turn = True
                            continue  # loop to format text answer

                        if content:
                            print(f"\nRIA: {content}")
                            messages.append({"role": "assistant", "content": content})
                    except Exception as e2:
                        print(f"\nError: {e2}")
                    break
                else:
                    print(f"\nLLM Error: {e}")
                    break

            if response.usage:
                dev["tokens"]["prompt"]     += response.usage.prompt_tokens or 0
                dev["tokens"]["completion"] += response.usage.completion_tokens or 0
                dev["tokens"]["total"]      += response.usage.total_tokens or 0

            choice = response.choices[0]
            msg = choice.message

            if not msg.tool_calls:
                content = msg.content or ""

                # FIX: detect raw <function=name '{...}'></function> text the
                # LLM sometimes emits when tool_choice='none' blocks proper calls
                fn_name, fn_args = _parse_raw_fn_text(content)
                if fn_name and fn_name in TOOL_FUNCTIONS:
                    fn = TOOL_FUNCTIONS[fn_name]
                    t0 = time.time()
                    result = fn(**fn_args)
                    exec_ms = round((time.time() - t0) * 1000)
                    dev["tool_calls"].append({
                        "tool": fn_name, "args": fn_args,
                        "result_length": len(result), "exec_ms": exec_ms
                    })
                    # Inject as a synthetic tool result so next iter formats it
                    messages.append({"role": "assistant", "content": content})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": "raw_fn_fallback",
                        "content": result,
                    })
                    tool_called_this_turn = True
                    continue  # loop again to get text answer

                if content:
                    print(f"\nRIA: {content}")
                    messages.append({"role": "assistant", "content": content})
                break

            messages.append(msg)

            for tool_call in msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments) or {}

                # Safety net: override misrouted tools
                override_name, override_args = _override_tool_choice(user_input, fn_name, fn_args)
                if override_name:
                    fn_name = override_name
                    fn_args = override_args

                fn = TOOL_FUNCTIONS.get(fn_name)

                t0 = time.time()
                result = fn(**fn_args) if fn else json.dumps({"error": f"Unknown tool: {fn_name}"})
                exec_ms = round((time.time() - t0) * 1000)

                dev["tool_calls"].append({
                    "tool": fn_name, "args": fn_args,
                    "result_length": len(result), "exec_ms": exec_ms
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })
            tool_called_this_turn = True  # FIX: mark tool called for this question
        else:
            print("\nRIA: (max iterations reached)")

        if len(messages) > 10:
            messages[:] = [messages[0]] + messages[-9:]

        elapsed = round((time.time() - start_time) * 1000)
        sep = "\u2500" * 60
        print(f"\n{sep}")
        print(f"  Iters: {dev['iterations']} | Tools: {len(dev['tool_calls'])} | Fallback: {dev['fallback']}")
        print(f"  Tokens: {dev['tokens']['prompt']}p + {dev['tokens']['completion']}c = {dev['tokens']['total']}")
        print(f"  Latency: {elapsed}ms")
        for tc in dev["tool_calls"]:
            print(f"    \u2192 {tc['tool']}({tc['args']}) [{tc['exec_ms']}ms]")
        print(sep)


if __name__ == '__main__':
    main()