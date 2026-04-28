"""SQL tool: schema metadata + execute_sql via Supabase RPC."""
from __future__ import annotations

import logging
import os
from typing import Any

from supabase import create_client, Client

log = logging.getLogger("ria.sql")

SCHEMA_METADATA = """
TABLES (Postgres, pg_trgm enabled):
- v_faculty_full(faculty_id, author_name, department_id, department, institute_id, institute, short_name, total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count, wos_q1_count, journal_count, conference_count, wos_pub_count, wos_hindex, avg_citescore, avg_impfactor)
- publications(id, pub_id, title, authors, home_authors, year, source_publication, article_type, q_rank_scopus, q_rank_wos, impact_factor, cite_score, matched_department TEXT, matched_institute TEXT, home_author_department TEXT, home_author_institute TEXT, staff_ria_user_id INT)
- departments(id UUID PK, name, institute_id UUID FK)
- institutes(id UUID PK, name, short_name)
- faculty_publications(faculty_id, publication_id) — WARNING: only 84.8% complete, DO NOT use for counts
- v_institute_summary(name, short_name, faculty_count, total_publications, total_scopus_citations, avg_scopus_hindex, total_q1_scopus)

COLUMN SEMANTICS (critical):
- v_faculty_full.short_name is the institute abbreviation: 'CSE', 'ECE', 'EEE', 'Mechanical', 'Civil', 'Biotech', 'Maths', 'Architecture', 'Chemistry', 'MCA', etc.
- v_faculty_full.department is the full dept name: 'Computer Science and Engineering', 'Mechanical Engineering', etc.
- v_faculty_full.institute is the school/college: 'School of Computer Science and Engineering', etc.
- publications.home_authors is a semicolon-separated TEXT field of KLE-normalized author names (e.g. "Patil M R;Quadri S S"). ALWAYS use this for author-name filtering — it matches v_faculty_full.author_name exactly.
- publications.authors is the raw external/Scopus field with inconsistent formatting: "M R Patil." vs "Patil M R" vs "M R Pati." (truncated). NEVER use authors for filtering by KLE faculty name — use home_authors instead.
- publications.home_author_department is a semicolon-separated TEXT field listing ALL departments of all KLE authors on a publication (e.g. "Computer Science and Engineering;Chemistry"). Use this for department-level publication counts — it captures cross-department collaborations.
- publications.matched_department is a single-value TEXT field with the PRIMARY department only. DO NOT use for counts — it misses co-authored papers.
- publications.q_rank_scopus is the Scopus Q-rank (Q1/Q2/Q3/Q4). ALWAYS use this for Q-rank queries, not q_rank_wos.
- publications.staff_ria_user_id identifies the corresponding/submitting KLE author. Cross-reference with [id] in author_address to find their name.
- For faculty queries on v_faculty_full, match broadly: WHERE (short_name ILIKE '%X%' OR department ILIKE '%X%' OR institute ILIKE '%X%').
- For department-level publication queries, use: WHERE home_author_department ILIKE '%<full_dept_name>%'.
- Year: publications.year (GENERATED from pub_date). Valid years: 2018..2026.

RULES:
1. Use pre-aggregated columns on v_faculty_full for per-faculty totals. NEVER COUNT(*) from faculty_publications — join table is only 84.8% complete.
2. Faculty name match: WHERE similarity(author_name,'X')>0.2 ORDER BY similarity DESC LIMIT 5.
3. Publications by author: ALWAYS use home_authors ILIKE '%<name>%'. NEVER use authors ILIKE — it has inconsistent name formats and will miss papers. NEVER use similarity(authors,...).
4. ONE SELECT per user question. Use CTEs/subqueries for multi-part answers.
5. Never SELECT *; name the columns.
6. Each question is independent - do not carry filters from prior turns.
7. Q-rank counts: ALWAYS count from publications.q_rank_scopus. For department filtering, use home_author_department ILIKE (semicolon-separated, captures ALL depts). NEVER use faculty_publications for counts. NEVER use matched_department or matched_department_id for counts (single-value, misses co-authored papers). For per-faculty Q1 count use v_faculty_full.scopus_q1_count.

CANONICAL QUERIES (use these exactly, substituting user terms):

(a) Stats on a faculty:
SELECT author_name, department, institute, total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count, journal_count, conference_count
FROM v_faculty_full
WHERE similarity(author_name,'<term>')>0.2
ORDER BY similarity(author_name,'<term>') DESC LIMIT 5;

(b) Top N faculty in a department/school:
SELECT author_name, department, total_pub_count, scopus_citation, scopus_hindex
FROM v_faculty_full
WHERE short_name ILIKE '%<term>%' OR department ILIKE '%<term>%' OR institute ILIKE '%<term>%'
ORDER BY scopus_citation DESC LIMIT <N>;

(b2) List or count publications by a specific faculty — use home_authors (NOT authors):
SELECT title, year, source_publication, q_rank_scopus, article_type
FROM publications
WHERE home_authors ILIKE '%<author_name>%'
ORDER BY year DESC, title LIMIT 30;

-- For count only:
SELECT COUNT(*)::int AS total FROM publications WHERE home_authors ILIKE '%<author_name>%';

-- With department anchor (when multiple faculty share the same name):
SELECT title, year, source_publication, q_rank_scopus
FROM publications
WHERE home_authors ILIKE '%<author_name>%'
  AND home_author_department ILIKE '%<full_dept_name>%'
ORDER BY year DESC LIMIT 30;

(c) Q-rank count in a department — use home_author_department (captures ALL depts for multi-author papers):
SELECT COUNT(*) AS cnt FROM publications
WHERE q_rank_scopus='Q1' AND home_author_department ILIKE '%<full_dept_name>%';

(d) Publication count by year:
SELECT COUNT(*) AS cnt FROM publications WHERE year=<Y>;

(e) YoY totals + growth for latest 2 years (assume 2024 vs 2025):
WITH y AS (SELECT year, COUNT(*) AS n FROM publications WHERE year IN (2024,2025) GROUP BY year)
SELECT (SELECT SUM(n) FROM y) AS total, (SELECT n FROM y WHERE year=2024) AS prev, (SELECT n FROM y WHERE year=2025) AS curr, ROUND(100.0*((SELECT n FROM y WHERE year=2025)-(SELECT n FROM y WHERE year=2024))/(SELECT n FROM y WHERE year=2024),2) AS yoy_pct;

(f) Dept with highest avg H-index:
SELECT department, ROUND(AVG(scopus_hindex)::numeric,2) AS avg_h FROM v_faculty_full GROUP BY department ORDER BY avg_h DESC LIMIT 1;

(g) University-wide Q-rank count:
SELECT COUNT(*) AS cnt FROM publications WHERE q_rank_scopus='<Q1|Q2|Q3|Q4>';

(h) Q-rank distribution in a department — use home_author_department:
SELECT q_rank_scopus, COUNT(*) AS cnt FROM publications
WHERE q_rank_scopus IS NOT NULL AND home_author_department ILIKE '%<full_dept_name>%'
GROUP BY q_rank_scopus ORDER BY q_rank_scopus;

(i) Q-rank distribution university-wide:
SELECT q_rank_scopus, COUNT(*) AS cnt FROM publications WHERE q_rank_scopus IS NOT NULL GROUP BY q_rank_scopus ORDER BY q_rank_scopus;

DEPARTMENT NAME MAPPING (abbreviation → full dept name):
CSE = 'Computer Science and Engineering', ECE = 'Electronics and Communication Engineering',
EEE = 'Electrical and Electronics Engineering', Mechanical = 'Mechanical Engineering',
Civil = 'Civil Engineering', Chemistry = 'Chemistry', Physics = 'Physics',
Maths = 'Mathematics', Biotech = 'Biotechnology', MCA = 'Computer Application',
Architecture = 'Architecture'.
"""

SQL_TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "execute_sql",
        "description": (
            "Executes a PostgreSQL SELECT query against the RIA database and "
            "returns the result as a JSON array. Use this for complex data "
            "aggregation, counts, or listing specific records."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SQL SELECT query to execute. MUST be a valid PostgreSQL query.",
                },
            },
            "required": ["sql"],
        },
    },
}


_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_ANON_KEY"]
        _client = create_client(url, key)
    return _client


def execute_sql(sql: str) -> Any:
    _CYAN = "\033[36m"
    _GREEN = "\033[32m"
    _RED = "\033[31m"
    _RESET = "\033[0m"
    verbose = os.environ.get("VERBOSE_SQL", "").strip() == "1"

    if not sql.lstrip().lower().startswith("select"):
        log.warning("[SQL REJECTED] Non-SELECT: %s", sql[:200])
        if verbose:
            print(f"{_RED}[SQL REJECTED] Only SELECT queries are allowed.{_RESET}")
        return {"error": "Only SELECT queries are allowed for security reasons."}

    if verbose:
        print(f"\n{_CYAN}[SQL EXECUTED] -------------------------------------------{_RESET}")
        for line in sql.strip().split("\n"):
            print(f"{_CYAN}|{_RESET} {line}")
        print(f"{_CYAN}---------------------------------------------------------{_RESET}")

    log.info("\n┌─ SQL QUERY ─────────────────────────────────────────")
    for line in sql.strip().split("\n"):
        log.info("│ %s", line)
    log.info("└────────────────────────────────────────────────────")

    try:
        # Strip trailing semicolons — they break the inner EXECUTE in exec_sql
        clean_sql = sql.rstrip().rstrip(";").rstrip()
        resp = _get_client().rpc("exec_sql", {"query_text": clean_sql}).execute()
        row_count = len(resp.data) if isinstance(resp.data, list) else "n/a"
        log.info("[SQL RESULT] %s rows returned", row_count)
        if verbose:
            print(f"{_GREEN}[OK] {row_count} row(s) returned{_RESET}")
        return resp.data
    except Exception as err:  # noqa: BLE001
        msg = str(err)
        lowered = msg.lower()
        log.error("[SQL ERROR] %s", msg[:300])
        if verbose:
            print(f"\033[31m[ERR] SQL error: {msg[:200]}\033[0m")
        if (
            "exec_sql" in lowered
            or "connection refused" in lowered
            or "failed to fetch" in lowered
            or "networkerror" in lowered
            or "name or service not known" in lowered
        ):
            return {
                "error": "database_unavailable",
                "reason": msg,
                "unavailable": True,
            }
        return {"error": msg}
