"""Deterministic intent router. Ported from intentRouter.js.

Returns a markdown reply string when an intent matches, or None to fall
through to the LLM tool-calling path.

Two-stage matching:
1. Regex matchers (precise, ordered — specific first)
2. Keyword-based fallback (catches rephrased questions the regex misses)
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable

from sql_tool import execute_sql
from nlp_pipeline import (
    extract_entities,
    DEPT_SYNONYMS,
    METRIC_SYNONYMS,
    METRIC_SYNONYMS as _MSYN,
)

log = logging.getLogger(__name__)


def _esc(s: Any) -> str:
    return str(s).replace("'", "''")


def _clean(s: str) -> str:
    return re.sub(r"[?.!,]+$", "", s.strip()).strip()


METRIC_COL = {
    "citation": "scopus_citation",
    "citations": "scopus_citation",
    "publication": "total_pub_count",
    "publications": "total_pub_count",
    "pub": "total_pub_count",
    "pubs": "total_pub_count",
    "publicationcount": "total_pub_count",
    "publicationcounts": "total_pub_count",
    "pubcount": "total_pub_count",
    "pubcounts": "total_pub_count",
    "hindex": "scopus_hindex",
    "h-index": "scopus_hindex",
    "h index": "scopus_hindex",
    "q1": "scopus_q1_count",
    "q1s": "scopus_q1_count",
}

METRIC_LABEL = {
    "scopus_citation": "Cit",
    "total_pub_count": "Pubs",
    "scopus_hindex": "H-idx",
    "scopus_q1_count": "Q1",
}


def _dept_filter(dept: str) -> str:
    """Build a WHERE clause that matches a department term against v_faculty_full columns."""
    d = _esc(dept)
    return (
        f"(short_name ILIKE '%{d}%' OR department ILIKE '%{d}%' OR institute ILIKE '%{d}%')"
    )


DB_DOWN_MSG = "The research database is currently unavailable. Please try again later."
NO_MATCH_MSG = "No matching records found."


def _fail(rows: Any) -> str | None:
    if rows is None:
        return DB_DOWN_MSG
    if isinstance(rows, dict):
        if rows.get("unavailable"):
            return DB_DOWN_MSG
        if rows.get("error"):
            return None  # unknown error -> fall through to LLM
    if not isinstance(rows, list) or len(rows) == 0:
        return NO_MATCH_MSG
    return None


# ─────────────────────────────────────────────
# Intent matchers (ordered — specific first)
# Each returns an args dict or None.
# ─────────────────────────────────────────────

_I = re.IGNORECASE


def _m_qrank_distribution(q: str):
    # Check for department-scoped Q-rank distribution first
    m = re.search(
        r"q[- ]?rank\s+distribution(?:s)?\s+(?:across|in|for|of)\s+(?:the\s+)?(.+?)(?:\s+department|\s+dept|\s+school)?\s*[.?!]*$",
        q, _I,
    )
    if m:
        return {"dept": _clean(m.group(1))}
    m = re.search(
        r"(?:summarize|summary of|show|give|get|what(?:'s|\s+is))\s+(?:me\s+)?(?:the\s+)?q[- ]?rank\s+(?:distribution|breakdown|split|spread)\s+(?:across|in|for|of)\s+(?:the\s+)?(.+?)(?:\s+department|\s+dept|\s+school)?\s*[.?!]*$",
        q, _I,
    )
    if m:
        return {"dept": _clean(m.group(1))}
    # University-wide
    if re.search(r"q[- ]?rank\s+distribution", q, _I) or re.search(
        r"(summarize|summary of|show)\s+(the\s+)?(university\s+)?q[- ]?rank", q, _I
    ):
        return {}
    return None


def _m_yoy_total(q: str):
    if (
        re.search(r"\byoy\b|\byear[- ]over[- ]year\b|\bgrowth rate\b", q, _I)
        or re.search(r"total\s+publication\s+count\s+and", q, _I)
        or re.search(r"total\s+pubs?\s+and\s+yoy", q, _I)
    ):
        return {}
    return None


def _m_dept_highest_metric(q: str):
    m = re.search(
        r"which\s+(?:department|dept|school)\s+has\s+(?:the\s+)?highest\s+(average\s+|avg\s+)?(h[- ]?index|citations?|publications?|pubs?|q1)",
        q,
        _I,
    )
    if m:
        return {"metric": re.sub(r"\s+", "", m.group(2).lower())}
    return None


def _m_qrank_university(q: str):
    """Match university-wide Q-rank count queries like:
    - "how many Q1 papers across the university"
    - "total Q1 publications"
    - "Q1 paper count"
    - "number of Q1 papers"
    """
    m = re.search(
        r"(?:how\s+many|total|number\s+of|count\s+of)?\s*(q[1-4])\s+(?:publications?|papers?|pubs?|articles?)"
        r"(?:\s+(?:across|in|at|for)\s+(?:the\s+)?(?:university|college|institution|kle|overall|total))?\s*[.?!]*$",
        q, _I,
    )
    if m:
        return {"qrank": m.group(1).upper()}
    # Also match "how many Q1 papers" / "total Q1 papers" (no dept)
    m = re.search(
        r"(?:how\s+many|total|number\s+of|count\s+of)\s+(q[1-4])\s+(?:publications?|papers?|pubs?|articles?)\s*[.?!]*$",
        q, _I,
    )
    if m:
        return {"qrank": m.group(1).upper()}
    return None


def _m_qrank_in_dept(q: str):
    m = re.search(
        r"(?:total\s+|how\s+many\s+)?(q[1-4])\s+(?:publications?|papers?|pubs?)\s+(?:from|in|of)\s+(?:the\s+)?([a-z &]+?)(?:\s+department|\s+dept|\s+school)?\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {"qrank": m.group(1).upper(), "dept": _clean(m.group(2))}
    return None


def _m_top_faculty(q: str):
    m = re.search(
        r"^(?:top|best|leading)\s+(\d+)?\s*(?:faculty|authors?|researchers?|publishers?)(?:\s+(?:in|from|of)\s+(.+?))?\s+by\s+(citations?|publications?|pubs?|publication\s+counts?|pub\s+counts?|h[-\s]?index|q1s?)\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {
            "limit": int(m.group(1)) if m.group(1) else 10,
            "dept": _clean(m.group(2) or ""),
            "metric": m.group(3).lower(),
        }
    m = re.search(
        r"^who\s+has\s+(?:the\s+)?(?:highest|most)\s+(citations?|publications?|pubs?|publication\s+counts?|h[-\s]?index|q1s?)(?:\s+(?:in|from|of)\s+(.+?))?\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {
            "limit": 1,
            "dept": _clean(m.group(2) or ""),
            "metric": m.group(1).lower(),
        }
    return None


def _m_faculty_pubs_list(q: str):
    # Handles: "give me paper titles of X", "list publications by X",
    # "give publications title of X", "show all papers of X in 2024".
    # The (?:\s+titles?)? after paper/publication makes "publications title" work.
    m = re.search(
        r"^(?:give|show|list|get)\s+(?:me\s+)?(?:all\s+)?"
        r"(?:(?:paper|publication|article)s?(?:\s+titles?)?"
        r"|titles?\s+of\s+(?:papers?|publications?))"
        r"\s+(?:by|of|from|for)\s+(.+?)"
        r"(?:\s+in\s+(\d{4}))?\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {"name": _clean(m.group(1)), "year": int(m.group(2)) if m.group(2) else None}
    # "X's papers", "X's publications" (without "stats/metrics/etc")
    m = re.search(
        r"^(.+?)'s\s+(?:papers?|publications?|paper\s+titles?|publication\s+titles?)"
        r"(?:\s+in\s+(\d{4}))?\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {"name": _clean(m.group(1)), "year": int(m.group(2)) if m.group(2) else None}
    return None


def _m_bare_name(q: str):
    # Last-resort: 1-4 words, looks like a person's name (letters/dots/spaces only),
    # no question words or common keywords. Treat as a faculty stats lookup.
    if re.search(r"\b(how|what|which|who|when|where|why|list|show|give|tell|count|top|publications?|papers?|pubs?|stats?|for|about|in|by|from|citations?|h[- ]?index|department|dept|journal|conference|total|number)\b", q, _I):
        return None
    if not re.match(r"^[A-Za-z][A-Za-z .'-]{1,60}$", q.strip()):
        return None
    words = [w for w in re.split(r"\s+", q.strip()) if w]
    if not (1 <= len(words) <= 5):
        return None
    return {"name": _clean(q)}


def _m_faculty_qrank_year(q: str):
    m = re.search(
        r"^(?:(?:show|list|get|give|tell)\s+(?:me\s+)?(?:about\s+)?)?"
        r"(.+?)(?:'s?)?\s+(q[1-4])\s+(?:publications?|papers?|pubs?)"
        r"(?:\s+(?:in|during|for)\s+(\d{4}))?\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {
            "name": _clean(m.group(1)),
            "qrank": m.group(2).upper(),
            "year": int(m.group(3)) if m.group(3) else None,
        }
    m = re.search(
        r"^(?:show|list|count)\s+(q[1-4])\s+(?:publications?|papers?|pubs?)\s+by\s+(.+?)(?:\s+(?:in|during|for)\s+(\d{4}))?\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {
            "name": _clean(m.group(2)),
            "qrank": m.group(1).upper(),
            "year": int(m.group(3)) if m.group(3) else None,
        }
    return None


def _m_top_journals(q: str):
    if re.search(
        r"(?:which|what)\s+journals?\s+(?:have|has|do|did)\s+(?:we|i|the\s+university)?\s*publish(?:ed)?\s+(?:in\s+)?(?:most|the\s+most|most\s+often|more\s+often)",
        q,
        _I,
    ):
        return {"limit": 1}
    m = re.search(r"^top\s+(\d+)?\s*journals?\b", q, _I)
    if m:
        return {"limit": int(m.group(1)) if m.group(1) else 5}
    if re.search(r"^most\s+(?:frequently\s+)?published\s+journals?", q, _I):
        return {"limit": 5}
    return None


def _m_campus_unsupported(q: str):
    if re.search(
        r"\b(?:bvb|belagavi|bengaluru|bangalore|hubli|hubballi)\s+campus\b", q, _I
    ) or re.search(r"\bcampus\s+(?:wise|level|split|break\s*down|comparison)\b", q, _I):
        return {}
    return None


def _m_yearly_count(q: str):
    m = re.search(
        r"(?:how\s+many\s+|total\s+|number\s+of\s+)?(?:publications?|papers?|pubs?)\s+(?:are\s+there\s+)?(?:in|for|during)\s+(\d{4})\s*[.?!]*$",
        q,
        _I,
    ) or re.search(r"^publications?\s+in\s+(\d{4})\s*[.?!]*$", q, _I)
    if m:
        return {"year": int(m.group(1))}
    return None


def _m_faculty_stats(q: str):
    m = re.search(
        r"^(?:give\s+me\s+|show\s+me\s+)?stats?\s+(?:on|for|about|of)\s+(.+?)\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {"name": _clean(m.group(1))}
    m = re.search(
        r"^how\s+many\s+(?:publications?|papers?|pubs?)\s+(?:does|do|has|have|are\s+there\s+for|for)\s+(.+?)(?:\s+have|\s+has|\s+published|\s+written)?\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {"name": _clean(m.group(1)), "subset": "pubcount"}
    m = re.search(
        r"^(.+?)'s\s+(?:stats?|publications?|metrics?|citations?|h[- ]?index)\s*[.?!]*$",
        q,
        _I,
    )
    if m:
        return {"name": _clean(m.group(1))}
    m = re.search(r"^tell\s+me\s+about\s+(.+?)\s*[.?!]*$", q, _I)
    if m:
        return {"name": _clean(m.group(1))}
    return None


# ─────────────────────────────────────────────
# Handlers
# ─────────────────────────────────────────────

def _fmt_num(v: Any) -> str:
    if v is None:
        return "—"
    return str(v)


def _handle_faculty_stats(args: dict) -> str | None:
    name = args["name"]
    subset = args.get("subset")
    q = _esc(name)
    rows = execute_sql(
        f"SELECT author_name, department, institute, short_name, "
        f"total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count, "
        f"journal_count, conference_count, wos_pub_count, wos_hindex, "
        f"avg_citescore, avg_impfactor, "
        f"similarity(author_name, '{q}') AS sim "
        f"FROM v_faculty_full "
        f"WHERE similarity(author_name, '{q}') > 0.15 OR author_name ILIKE '%{q}%' "
        f"ORDER BY sim DESC LIMIT 5"
    )
    err = _fail(rows)
    if err:
        return err

    top = rows[0]
    runner_up = rows[1]["sim"] if len(rows) > 1 else 0
    unambiguous = (
        len(rows) == 1
        or top["sim"] >= 0.7
        or (top["sim"] >= 0.4 and top["sim"] - runner_up >= 0.1)
    )

    if unambiguous:
        if subset == "pubcount":
            return f"**{top['author_name']}** has **{top['total_pub_count']}** publications."
        # Full multi-line stats card with every column from v_faculty_full.
        return (
            f"### {top['author_name']}\n"
            f"- **Department:** {top.get('department') or '—'}"
            f" ({top.get('short_name') or '—'})\n"
            f"- **Institute:** {top.get('institute') or '—'}\n"
            f"- **Total publications:** {_fmt_num(top.get('total_pub_count'))}"
            f"  (Journals: {_fmt_num(top.get('journal_count'))},"
            f" Conferences: {_fmt_num(top.get('conference_count'))})\n"
            f"- **Scopus** — Citations: {_fmt_num(top.get('scopus_citation'))},"
            f" H-index: {_fmt_num(top.get('scopus_hindex'))},"
            f" Q1 papers: {_fmt_num(top.get('scopus_q1_count'))}\n"
            f"- **Web of Science** — Publications: {_fmt_num(top.get('wos_pub_count'))},"
            f" H-index: {_fmt_num(top.get('wos_hindex'))}\n"
            f"- **Averages** — CiteScore: {_fmt_num(top.get('avg_citescore'))},"
            f" Impact Factor: {_fmt_num(top.get('avg_impfactor'))}"
        )

    lines = "\n".join(
        f"{i + 1}. **{r['author_name']}** · {r['department']} · "
        f"Pubs: {r['total_pub_count']} · Cit: {r['scopus_citation']}"
        for i, r in enumerate(rows[:5])
    )
    return f'Multiple faculty match "{name}":\n{lines}\n\nWhich one did you mean?'


def _resolve_author(name: str) -> tuple[str | None, str | None]:
    """Look up the canonical author_name in v_faculty_full.

    Returns (author_name, error_msg). One of them is always None.
    """
    q = _esc(name)
    rows = execute_sql(
        f"SELECT author_name FROM v_faculty_full "
        f"WHERE similarity(author_name, '{q}') > 0.15 OR author_name ILIKE '%{q}%' "
        f"ORDER BY similarity(author_name, '{q}') DESC LIMIT 1"
    )
    if rows is None:
        return None, DB_DOWN_MSG
    if isinstance(rows, dict):
        if rows.get("unavailable"):
            return None, DB_DOWN_MSG
        return None, None  # unknown error → fall through to LLM
    if not rows:
        return None, f'No faculty matched "{name}".'
    return rows[0].get("author_name"), None


def _handle_top_faculty(args: dict) -> str | None:
    metric = args["metric"]
    dept = args.get("dept") or ""
    limit = args["limit"]
    key = re.sub(r"[- ]", "", metric)
    col = METRIC_COL.get(key) or METRIC_COL.get(metric) or "scopus_citation"
    n = min(max(limit, 1), 20)
    where = f"WHERE {_dept_filter(dept)}" if dept else ""
    rows = execute_sql(
        f"SELECT author_name, department, total_pub_count, scopus_citation, "
        f"scopus_hindex, scopus_q1_count FROM v_faculty_full {where} "
        f"ORDER BY {col} DESC NULLS LAST LIMIT {n}"
    )
    err = _fail(rows)
    if err:
        return err

    label = METRIC_LABEL[col]
    header = f"Top {n} in {dept} by {label}:" if dept else f"Top {n} by {label}:"
    lines = "\n".join(
        f"{i + 1}. **{r['author_name']}** ({r['department']}) — {label}: {r.get(col) or 0}"
        for i, r in enumerate(rows)
    )
    return f"{header}\n{lines}"


def _handle_yearly_count(args: dict) -> str | None:
    year = args["year"]
    rows = execute_sql(
        f"SELECT COUNT(*)::int AS cnt FROM publications WHERE year = {year}"
    )
    err = _fail(rows)
    if err:
        return err
    return f"**{rows[0]['cnt']}** publications in {year}."


def _handle_yoy_total(_args: dict) -> str | None:
    rows = execute_sql(
        "WITH y AS (SELECT year, COUNT(*)::int AS n FROM publications "
        "WHERE year IN (2024,2025) GROUP BY year), "
        "t AS (SELECT COUNT(*)::int AS n FROM publications) "
        "SELECT (SELECT n FROM t) AS total, "
        "COALESCE((SELECT n FROM y WHERE year=2024),0) AS prev, "
        "COALESCE((SELECT n FROM y WHERE year=2025),0) AS curr, "
        "ROUND(100.0*(COALESCE((SELECT n FROM y WHERE year=2025),0)-"
        "COALESCE((SELECT n FROM y WHERE year=2024),0))/"
        "NULLIF((SELECT n FROM y WHERE year=2024),0),2) AS yoy_pct"
    )
    err = _fail(rows)
    if err:
        return err
    r = rows[0]
    yoy = r.get("yoy_pct") if r.get("yoy_pct") is not None else 0
    return (
        f"Total publications: **{r['total']}**. 2024: {r['prev']}, "
        f"2025: {r['curr']} — YoY growth **{yoy}%**."
    )


def _handle_qrank_university(args: dict) -> str | None:
    """University-wide Q-rank count — uses publications.q_rank_scopus directly
    (Scopus ranking, not WoS). This is the authoritative count."""
    qrank = args["qrank"]
    rows = execute_sql(
        f"SELECT COUNT(*)::int AS cnt FROM publications "
        f"WHERE q_rank_scopus = '{qrank}'"
    )
    err = _fail(rows)
    if err:
        return err
    return f"**{rows[0]['cnt']}** {qrank} publications across the university (Scopus)."


def _handle_qrank_in_dept(args: dict) -> str | None:
    qrank = args["qrank"]
    dept = args["dept"]
    # Use home_author_department which is semicolon-separated and captures
    # ALL departments for multi-author publications. matched_department_id
    # only stores ONE department, missing cross-department collaborations.
    where = _pub_dept_where(dept)
    rows = execute_sql(
        f"SELECT COUNT(*)::int AS cnt FROM publications "
        f"WHERE q_rank_scopus = '{_esc(qrank)}' AND {where}"
    )
    err = _fail(rows)
    if err:
        return err
    return f"**{rows[0]['cnt']}** {qrank} publications in {dept} (Scopus)."


def _handle_dept_highest_metric(args: dict) -> str | None:
    metric = args["metric"]
    mapping = {
        "hindex": ("AVG(scopus_hindex)", "avg H-index"),
        "h-index": ("AVG(scopus_hindex)", "avg H-index"),
        "citations": ("SUM(scopus_citation)", "total citations"),
        "citation": ("SUM(scopus_citation)", "total citations"),
        "publications": ("SUM(total_pub_count)", "total publications"),
        "publication": ("SUM(total_pub_count)", "total publications"),
        "pubs": ("SUM(total_pub_count)", "total publications"),
        "q1": ("SUM(scopus_q1_count)", "total Q1 publications"),
    }
    expr, label = mapping.get(metric, mapping["hindex"])
    rows = execute_sql(
        f"SELECT department, ROUND({expr}::numeric, 2) AS val FROM v_faculty_full "
        f"GROUP BY department ORDER BY val DESC NULLS LAST LIMIT 1"
    )
    err = _fail(rows)
    if err:
        return err
    return f"**{rows[0]['department']}** has the highest {label}: {rows[0]['val']}."


_DEPT_FULL_NAMES: dict[str, str] = {
    "CSE": "Computer Science and Engineering",
    "ECE": "Electronics and Communication Engineering",
    "EEE": "Electrical and Electronics Engineering",
    "Mechanical": "Mechanical Engineering",
    "Civil": "Civil Engineering",
    "ISE": "Information Science and Engineering",
    "Biotech": "Biotechnology",
    "Chemistry": "Chemistry",
    "Maths": "Mathematics",
    "Physics": "Physics",
    "MCA": "Computer Application",
    "Architecture": "Architecture",
    "CEER": "Centre for Engineering Education and Research",
    "MBA": "Management Studies",
    "Automation": "Automation and Robotics",
}


def _pub_dept_where(dept: str) -> str:
    """Build a WHERE clause to filter publications by department.

    Uses home_author_department (semicolon-separated, contains ALL departments
    for multi-author publications) — this is the only field that correctly
    captures cross-department collaborations.

    matched_department / matched_department_id only store ONE department per
    publication, so they miss co-authored papers from other departments.
    """
    d = _esc(dept)
    full = _DEPT_FULL_NAMES.get(dept)
    if full:
        f = _esc(full)
        return (
            f"(home_author_department ILIKE '%{f}%' "
            f"OR home_author_department ILIKE '%{d}%')"
        )
    return f"home_author_department ILIKE '%{d}%'"


def _handle_qrank_distribution(args: dict) -> str | None:
    dept = args.get("dept")
    if dept:
        where = _pub_dept_where(dept)
        rows = execute_sql(
            f"SELECT q_rank_scopus, COUNT(*)::int AS cnt FROM publications "
            f"WHERE q_rank_scopus IS NOT NULL AND {where} "
            f"GROUP BY q_rank_scopus ORDER BY q_rank_scopus"
        )
    else:
        rows = execute_sql(
            "SELECT q_rank_scopus, COUNT(*)::int AS cnt FROM publications "
            "WHERE q_rank_scopus IS NOT NULL GROUP BY q_rank_scopus ORDER BY q_rank_scopus"
        )
    err = _fail(rows)
    if err:
        return err
    total = sum(r["cnt"] for r in rows)
    lines = "\n".join(
        f"- {r['q_rank_scopus']}: **{r['cnt']}** ({(r['cnt'] / total * 100):.1f}%)"
        for r in rows
    )
    scope = f" in {dept}" if dept else ""
    return f"Q-rank distribution{scope} ({total} ranked Scopus pubs):\n{lines}"


def _query_pubs_by_author(
    author_name: str,
    qrank: str | None = None,
    year: int | None = None,
    limit: int = 30,
) -> Any:
    """Find publications by an author via publications.authors text match.

    Bypasses the faculty_publications join (which the schema warns is
    incomplete) — uses pg_trgm + ILIKE on the publications.authors column.
    """
    a = _esc(author_name)
    filters = [
        f"(similarity(p.authors, '{a}') > 0.15 OR p.authors ILIKE '%{a}%')"
    ]
    if qrank:
        filters.append(f"p.q_rank_scopus = '{_esc(qrank)}'")
    if year:
        filters.append(f"p.year = {int(year)}")
    where = " AND ".join(filters)
    return execute_sql(
        f"SELECT p.title, p.year AS pub_year, p.source_publication, "
        f"p.q_rank_scopus, p.article_type "
        f"FROM publications p WHERE {where} "
        f"ORDER BY p.year DESC NULLS LAST, p.title LIMIT {limit}"
    )


def _handle_faculty_qrank_year(args: dict) -> str | None:
    name = args["name"]
    qrank = args["qrank"]
    year = args.get("year")

    author, err = _resolve_author(name)
    if err:
        return err
    if not author:
        return f'No faculty matched "{name}".'

    rows = _query_pubs_by_author(author, qrank=qrank, year=year, limit=30)
    err = _fail(rows)
    scope = f" in {year}" if year else ""

    # When no rows from publications.authors lookup, fall back to the
    # canonical aggregate column on v_faculty_full so we stay consistent
    # with the stats card (which uses scopus_q1_count directly).
    if err == NO_MATCH_MSG and qrank == "Q1" and not year:
        agg = execute_sql(
            f"SELECT scopus_q1_count FROM v_faculty_full "
            f"WHERE author_name = '{_esc(author)}' LIMIT 1"
        )
        if isinstance(agg, list) and agg:
            cnt = agg[0].get("scopus_q1_count") or 0
            return (
                f"**{author}** has **{cnt}** {qrank} publications{scope} "
                f"(per Scopus aggregate). Individual paper records aren't "
                f"linked, so titles can't be listed."
            )
    if err:
        return err

    header = (
        f"**{author}** — {len(rows)} {qrank} publication"
        f"{'s' if len(rows) != 1 else ''}{scope}"
        f"{' (showing up to 30)' if len(rows) >= 30 else ''}:"
    )
    lines = [
        f"{i}. **{r.get('title') or 'Untitled'}** · "
        f"_{r.get('source_publication') or '—'}_ · "
        f"{r.get('pub_year') or 'n.d.'}"
        for i, r in enumerate(rows, 1)
    ]
    return f"{header}\n" + "\n".join(lines)


def _handle_faculty_pubs_list(args: dict) -> str | None:
    name = args["name"]
    year = args.get("year")

    author, err = _resolve_author(name)
    if err:
        return err
    if not author:
        return f'No faculty matched "{name}".'

    rows = _query_pubs_by_author(author, year=year, limit=30)
    err = _fail(rows)
    if err:
        return err

    scope = f" in {year}" if year else ""
    header = (
        f"Publications by **{author}**{scope} "
        f"({len(rows)}{' shown, more available' if len(rows) >= 30 else ''}):"
    )
    lines = [
        f"{i}. **{r.get('title') or 'Untitled'}** · "
        f"_{r.get('source_publication') or '—'}_ · "
        f"{r.get('pub_year') or 'n.d.'} · "
        f"{r.get('q_rank_scopus') or '—'}"
        for i, r in enumerate(rows, 1)
    ]
    return f"{header}\n" + "\n".join(lines)


def _handle_top_journals(args: dict) -> str | None:
    n = min(max(args["limit"], 1), 20)
    rows = execute_sql(
        f"SELECT source_publication, COUNT(*)::int AS cnt FROM publications "
        f"WHERE source_publication IS NOT NULL AND source_publication <> '' "
        f"GROUP BY source_publication ORDER BY cnt DESC LIMIT {n}"
    )
    err = _fail(rows)
    if err:
        return err
    if n == 1:
        return (
            f"The most-published-in journal is **{rows[0]['source_publication']}** "
            f"with {rows[0]['cnt']} publications."
        )
    lines = "\n".join(
        f"{i + 1}. **{r['source_publication']}** — {r['cnt']} pubs"
        for i, r in enumerate(rows)
    )
    return f"Top {n} journals by publication count:\n{lines}"


def _handle_campus_unsupported(_args: dict) -> str:
    return (
        "Campus-level data (BVB / Belagavi / Bengaluru) isn't in the current "
        "database schema — only **departments**, **schools/institutes**, and "
        "**faculty** are tracked. Try asking about a specific school "
        "(e.g., *School of Computer Science*) or department instead."
    )


INTENTS: list[tuple[str, Callable[[str], dict | None], Callable[[dict], str | None]]] = [
    ("qrank_distribution", _m_qrank_distribution, _handle_qrank_distribution),
    ("yoy_total", _m_yoy_total, _handle_yoy_total),
    ("dept_highest_metric", _m_dept_highest_metric, _handle_dept_highest_metric),
    # University-wide Q-rank count MUST come before qrank_in_dept (which requires a dept)
    ("qrank_university", _m_qrank_university, _handle_qrank_university),
    ("qrank_in_dept", _m_qrank_in_dept, _handle_qrank_in_dept),
    ("top_faculty", _m_top_faculty, _handle_top_faculty),
    ("faculty_qrank_year", _m_faculty_qrank_year, _handle_faculty_qrank_year),
    # Paper-list intents must come before faculty_stats — both can match a name.
    ("faculty_pubs_list", _m_faculty_pubs_list, _handle_faculty_pubs_list),
    ("top_journals", _m_top_journals, _handle_top_journals),
    ("campus_unsupported", _m_campus_unsupported, _handle_campus_unsupported),
    ("yearly_count", _m_yearly_count, _handle_yearly_count),
    ("faculty_stats", _m_faculty_stats, _handle_faculty_stats),
    # Last-resort: a bare name (e.g. "Patil M R") → faculty stats lookup.
    ("bare_name", _m_bare_name, _handle_faculty_stats),
]


def _keyword_fallback(q: str) -> tuple[str | None, dict | None]:
    """Keyword-based intent matching for queries that miss the regex matchers.

    Extracts entities from the query and scores against known intent patterns.
    Returns (intent_name, args) or (None, None).
    """
    entities = extract_entities(q)
    q_lower = q.lower()

    # Detect intent by keyword presence + extracted entities
    has_top = bool(re.search(r"\b(?:top|best|leading|highest|most)\b", q_lower))
    has_dept = entities.department is not None
    has_name_like = bool(re.search(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]*)+", q))  # Capitalized words
    has_year = entities.year is not None
    has_qrank = entities.qrank is not None
    has_which_dept = bool(re.search(r"\b(?:which|what)\s+(?:dept|department|school)\b", q_lower))
    has_metric = entities.metric is not None
    has_count = bool(re.search(r"\b(?:how\s+many|count|number|total)\b", q_lower))
    has_list = bool(re.search(r"\b(?:list|show|give|get|papers?|titles?)\b", q_lower))
    has_pub = bool(re.search(r"\b(?:publications?|papers?|pubs?|articles?|research)\b", q_lower))
    has_growth = bool(re.search(r"\b(?:growth|trend|yoy|year[- ]over[- ]year|compare|comparison)\b", q_lower))
    has_qrank_word = bool(re.search(r"\b(?:q[- ]?rank|quartile)\b", q_lower))
    has_distribution = bool(re.search(r"\b(?:distribution|breakdown|split|summary|summarize|overview)\b", q_lower))
    has_journal = bool(re.search(r"\b(?:journals?)\b", q_lower))
    has_faculty_ref = bool(re.search(r"\b(?:faculty|professor|researcher|author|person)\b", q_lower))
    has_stats = bool(re.search(r"\b(?:stats?|statistics|info|information|details?|profile|about|performance|overview)\b", q_lower))

    # Priority-ordered keyword intent matching

    # 1. Q-rank distribution (dept-scoped or university-wide)
    if has_qrank_word and has_distribution:
        if has_dept:
            return "qrank_distribution", {"dept": entities.department}
        return "qrank_distribution", {}

    # 2. YoY / growth
    if has_growth:
        return "yoy_total", {}

    # 3. Which department has highest X
    if has_which_dept and has_metric:
        metric_key = entities.metric or "citations"
        # Map canonical metric to the key the handler expects
        metric_map = {
            "citations": "citations", "publications": "publications",
            "h-index": "hindex", "Q1": "q1",
        }
        return "dept_highest_metric", {"metric": metric_map.get(metric_key, "hindex")}

    # 4a. Q-rank count — university-wide (no dept mentioned)
    if has_qrank and not has_dept and (has_count or has_pub):
        return "qrank_university", {"qrank": entities.qrank}

    # 4b. Q-rank count in department
    if has_qrank and has_dept and (has_count or has_pub):
        return "qrank_in_dept", {"qrank": entities.qrank, "dept": entities.department}

    # 5. Top N faculty (by metric, optionally in dept)
    if has_top and (has_faculty_ref or has_dept) and not has_journal:
        metric = entities.metric or "citations"
        metric_map = {
            "citations": "citations", "publications": "publications",
            "h-index": "h-index", "Q1": "q1s",
        }
        return "top_faculty", {
            "limit": entities.limit or 10,
            "dept": entities.department or "",
            "metric": metric_map.get(metric, "citations"),
        }

    # 6. Top journals
    if has_top and has_journal:
        return "top_journals", {"limit": entities.limit or 5}
    if has_journal and (has_distribution or has_list or has_count):
        return "top_journals", {"limit": 5}

    # 7. Publication count in year
    if has_year and has_pub and (has_count or not has_name_like):
        # Only if there's no faculty name — otherwise it's faculty stats
        if not has_name_like and not has_list:
            return "yearly_count", {"year": entities.year}

    # 8. Department stats — "how many pubs in CSE", "CSE publication count"
    if has_dept and (has_count or has_pub or has_stats) and not has_name_like:
        return "top_faculty", {
            "limit": 10,
            "dept": entities.department,
            "metric": "publications",
        }

    return None, None


def route_intent(user_message: str, normalized_message: str | None = None) -> tuple[str | None, str | None]:
    """Try to match user_message to a deterministic intent.

    If normalized_message is provided (from nlp_pipeline), try that first
    for broader coverage, then fall back to the original message.

    Returns (reply, intent_name) — both None if no match.
    """
    candidates = []
    if normalized_message and normalized_message != user_message.strip():
        candidates.append(normalized_message)
    candidates.append(user_message.strip())

    # Stage 1: Regex matchers (try normalized first, then original)
    for q in candidates:
        for name, matcher, handler in INTENTS:
            args = matcher(q)
            if args is not None:
                log.info("[intent_router] matched '%s' via regex → %s", q[:60], name)
                try:
                    return handler(args), name
                except Exception:  # noqa: BLE001
                    log.exception("[intent_router] %s handler failed", name)
                    return None, None

    # Stage 2: Keyword-based fallback (on original message)
    intent_name, args = _keyword_fallback(user_message.strip())
    if intent_name and args is not None:
        # Find the handler for this intent
        handler_map = {name: handler for name, _, handler in INTENTS}
        handler = handler_map.get(intent_name)
        if handler:
            log.info("[intent_router] matched via keyword fallback → %s", intent_name)
            try:
                return handler(args), intent_name
            except Exception:  # noqa: BLE001
                log.exception("[intent_router] %s keyword handler failed", intent_name)
                return None, None

    return None, None
