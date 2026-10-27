"""Slim intent router — year queries, paper authors, campus guard.

Everything else falls through to the 6-tool RIA agent (ria_agent.py).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable

from sql_tool import execute_sql

log = logging.getLogger(__name__)

_I = re.IGNORECASE
DB_DOWN_MSG = "The research database is currently unavailable. Please try again later."
NO_MATCH_MSG = "No matching records found."


def _esc(s: Any) -> str:
    return str(s).replace("'", "''")


def _clean(s: str) -> str:
    return re.sub(r"[?.!,]+$", "", s.strip()).strip()


def _fail(rows: Any) -> str | None:
    if rows is None:
        return DB_DOWN_MSG
    if isinstance(rows, dict):
        if rows.get("unavailable"):
            return DB_DOWN_MSG
        if rows.get("error"):
            return None
    if not isinstance(rows, list) or len(rows) == 0:
        return NO_MATCH_MSG
    return None


# ── Matchers ──────────────────────────────────────────────────────────

def _m_campus_unsupported(q: str):
    if re.search(r"\b(?:bvb|belagavi|bengaluru|bangalore|hubli|hubballi)\s+campus\b", q, _I) \
       or re.search(r"\bcampus\s+(?:wise|level|split|break\s*down|comparison)\b", q, _I):
        return {}
    return None


def _m_compare_years(q: str):
    m = re.search(
        r"(?:publications?|papers?|pubs?)?.{0,30}?(20[12]\d)\s*"
        r"(?:vs\.?|versus|or|compared?\s+(?:to|with))\s*(20[12]\d)",
        q, _I,
    )
    if m:
        y1, y2 = int(m.group(1)), int(m.group(2))
        if y1 != y2:
            return {"year1": min(y1, y2), "year2": max(y1, y2)}
    years = re.findall(r"\b(20[12]\d)\b", q)
    if len(years) >= 2:
        y1, y2 = int(years[0]), int(years[1])
        if y1 != y2 and re.search(r"\b(?:which|better|compare|vs|versus|between|and|or)\b", q, _I):
            return {"year1": min(y1, y2), "year2": max(y1, y2)}
    return None


def _m_best_year(q: str):
    if re.search(r"best\s+year\s+for\s+publications", q, _I):
        return {}
    if re.search(
        r"which\s+year\s+(?:had|has|is|was)\s+(?:the\s+)?(?:most|best|highest|maximum|peak)"
        r"\s+(?:publications?|papers?|pubs?|research)", q, _I,
    ):
        return {}
    if re.search(r"\b(?:peak|most\s+productive)\s+year\b", q, _I):
        return {}
    return None


def _m_year_trend(q: str):
    if re.search(r"publications?\s+by\s+year\s+trend", q, _I):
        return {}
    if re.search(
        r"(?:publications?|papers?|pubs?|research)\s+(?:by\s+year|per\s+year|year[- ]?wise)\b",
        q, _I,
    ):
        return {}
    if re.search(
        r"year[- ]?wise\s+(?:publication|paper|pub|research)\s+(?:count|trend|breakdown|summary)",
        q, _I,
    ):
        return {}
    return None


def _m_year_range(q: str):
    m = re.search(
        r"(?:publications?|papers?|pubs?|research\s+output)?[^0-9]*"
        r"(20[12]\d)\s*(?:to|-|through|until|–)\s*(20[12]\d)",
        q, _I,
    )
    if m:
        y1, y2 = int(m.group(1)), int(m.group(2))
        if y1 != y2:
            return {"year1": min(y1, y2), "year2": max(y1, y2)}
    return None


def _m_yearly_count(q: str):
    years = re.findall(r"\b(20[12]\d)\b", q)
    if len(years) >= 2 and years[0] != years[1]:
        return None
    m = re.search(
        r"(?:how\s+many\s+|total\s+|number\s+of\s+)?(?:publications?|papers?|pubs?)"
        r"\s+(?:are\s+there\s+)?(?:in|for|during)\s+(\d{4})\s*[.?!]*$",
        q, _I,
    ) or re.search(r"^publications?\s+in\s+(\d{4})\s*[.?!]*$", q, _I)
    if m:
        return {"year": int(m.group(1))}
    return None


def _m_paper_authors(q: str):
    want_corresponding = bool(re.search(r"corresponding", q, _I))
    m = re.search(
        r"^who\s+(?:are|is|was|were)\s+(?:the\s+)?corresponding[- ]authors?\s+(.+?)\s*[.?!]*$",
        q, _I,
    )
    if m:
        return {"title": _clean(m.group(1)), "corresponding": True}
    m = re.search(
        r"^who\s+(?:are|is|was|were)\s+(?:the\s+)?"
        r"(?:corresponding[- ]author(?:s)?|authors?|co[- ]authors?|writers?)"
        r"\s+(?:of|for|in|on)\s+(.+?)\s*[.?!]*$",
        q, _I,
    )
    if m:
        return {"title": _clean(m.group(1)), "corresponding": want_corresponding}
    m = re.search(r"^who\s+(?:wrote|published|authored|created)\s+(.+?)\s*[.?!]*$", q, _I)
    if m:
        return {"title": _clean(m.group(1)), "corresponding": False}
    m = re.search(
        r"^(?:(?:corresponding[- ])?authors?\s+(?:of|for|in|on)|authored\s+by)\s+(.+?)\s*[.?!]*$",
        q, _I,
    )
    if m:
        return {"title": _clean(m.group(1)), "corresponding": want_corresponding}
    m = re.search(
        r"(?:paper|article|publication)\s+(?:titled?|called|named|about)\s+(.+?)"
        r"(?:\s+(?:and\s+)?(?:show|list|give|find)\s+(?:the\s+)?(?:corresponding[- ])?authors?)?"
        r"\s*[.?!]*$",
        q, _I,
    )
    if m and re.search(r"author", q, _I):
        return {"title": _clean(m.group(1)), "corresponding": want_corresponding}
    return None


# ── Handlers ──────────────────────────────────────────────────────────

def _handle_campus_unsupported(_args: dict) -> str:
    return (
        "Campus-level data (BVB / Belagavi / Bengaluru) isn't in the current "
        "database schema — only **departments**, **schools/institutes**, and "
        "**faculty** are tracked. Try asking about a specific school "
        "(e.g., *School of Computer Science*) or department instead."
    )


def _handle_compare_years(args: dict) -> str | None:
    y1, y2 = args["year1"], args["year2"]
    rows = execute_sql(
        f"SELECT year, COUNT(*)::int AS total, "
        f"COUNT(*) FILTER (WHERE scs_citations IS NOT NULL)::int AS scopus, "
        f"COUNT(*) FILTER (WHERE wos_citations_pub IS NOT NULL)::int AS wos, "
        f"COUNT(*) FILTER (WHERE is_sci = TRUE)::int AS sci "
        f"FROM publications WHERE year IN ({y1}, {y2}) GROUP BY year ORDER BY year"
    )
    err = _fail(rows)
    if err:
        return err
    data = {r["year"]: r for r in rows}
    r1 = data.get(y1, {"total": 0, "scopus": 0, "wos": 0, "sci": 0})
    r2 = data.get(y2, {"total": 0, "scopus": 0, "wos": 0, "sci": 0})
    diff = r2["total"] - r1["total"]
    pct = round(abs(diff) / r1["total"] * 100, 1) if r1["total"] else 0
    if diff > 0:
        verdict = f"**{y2}** was better with {diff} more publications ({pct}% growth)."
    elif diff < 0:
        verdict = f"**{y1}** was better with {abs(diff)} more publications ({pct}% decline)."
    else:
        verdict = "Both years had the same number of publications."
    return (
        f"**{y1}**: {r1['total']} pubs (Scopus: {r1['scopus']}, WoS: {r1['wos']}, SCI: {r1['sci']})\n"
        f"**{y2}**: {r2['total']} pubs (Scopus: {r2['scopus']}, WoS: {r2['wos']}, SCI: {r2['sci']})\n\n"
        f"{verdict}"
    )


def _handle_best_year(_args: dict) -> str | None:
    rows = execute_sql(
        "SELECT year, COUNT(*)::int AS total FROM publications "
        "WHERE year BETWEEN 2018 AND 2026 GROUP BY year ORDER BY total DESC LIMIT 5"
    )
    err = _fail(rows)
    if err:
        return err
    best = rows[0]
    others = "\n".join(f"  {i+2}. {r['year']}: {r['total']} pubs" for i, r in enumerate(rows[1:]))
    return (
        f"**{best['year']}** had the most publications: **{best['total']}**.\n\n"
        f"Top 5 years:\n  1. {best['year']}: {best['total']} pubs\n{others}"
    )


def _handle_year_trend(_args: dict) -> str | None:
    rows = execute_sql(
        "SELECT year, COUNT(*)::int AS total FROM publications "
        "WHERE year BETWEEN 2018 AND 2026 GROUP BY year ORDER BY year"
    )
    err = _fail(rows)
    if err:
        return err
    lines = "\n".join(f"  {r['year']}: **{r['total']}** pubs" for r in rows)
    return f"Publications by year:\n{lines}"


def _handle_year_range(args: dict) -> str | None:
    y1, y2 = args["year1"], args["year2"]
    rows = execute_sql(
        f"SELECT year, COUNT(*)::int AS total FROM publications "
        f"WHERE year BETWEEN {y1} AND {y2} GROUP BY year ORDER BY year"
    )
    err = _fail(rows)
    if err:
        return err
    total = sum(r["total"] for r in rows)
    lines = "\n".join(f"  {r['year']}: **{r['total']}**" for r in rows)
    return f"Publications from {y1} to {y2} (total: **{total}**):\n{lines}"


def _handle_yearly_count(args: dict) -> str | None:
    year = args["year"]
    rows = execute_sql(
        f"SELECT COUNT(*)::int AS total, "
        f"COUNT(*) FILTER (WHERE scs_citations IS NOT NULL)::int AS scopus, "
        f"COUNT(*) FILTER (WHERE wos_citations_pub IS NOT NULL)::int AS wos, "
        f"COUNT(*) FILTER (WHERE is_sci = TRUE)::int AS sci "
        f"FROM publications WHERE year = {year}"
    )
    err = _fail(rows)
    if err:
        return err
    r = rows[0]
    return (
        f"**{r['total']}** publications in {year} | "
        f"Scopus: {r['scopus']}, WoS: {r['wos']}, SCI: {r['sci']}."
    )


def _handle_paper_authors(args: dict) -> str | None:
    title = args["title"]
    want_corresponding = args.get("corresponding", False)
    t = _esc(title)
    rows = execute_sql(
        f"SELECT title, authors, home_authors, author_address, staff_ria_user_id "
        f"FROM publications "
        f"WHERE similarity(title, '{t}') > 0.25 OR title ILIKE '%{t}%' "
        f"ORDER BY similarity(title, '{t}') DESC LIMIT 1"
    )
    err = _fail(rows)
    if err:
        return err
    r = rows[0]
    pub_title = r.get("title") or title
    authors_raw = r.get("home_authors") or r.get("authors") or ""
    author_list = [a.strip() for a in re.split(r"[|;]", authors_raw) if a.strip()]
    if not want_corresponding:
        authors_fmt = "\n".join(f"{i+1}. {a}" for i, a in enumerate(author_list))
        return f"**Authors of:** _{pub_title}_\n\n{authors_fmt}"
    staff_id = r.get("staff_ria_user_id")
    corresponding = None
    addr_raw = r.get("author_address") or ""
    if staff_id:
        m = re.compile(rf"([^|]+)\[{staff_id}\]").search(addr_raw)
        if m:
            corresponding = m.group(1).strip().rstrip(",").strip()
    if not corresponding and author_list:
        corresponding = author_list[0]
    authors_fmt = "\n".join(f"{i+1}. {a}" for i, a in enumerate(author_list))
    return (
        f"**Corresponding author:** **{corresponding}**\n\n"
        f"**Paper:** _{pub_title}_\n\n"
        f"**All authors:**\n{authors_fmt}"
    )


# ── Router ────────────────────────────────────────────────────────────

INTENTS: list[tuple[str, Callable[[str], dict | None], Callable[[dict], str | None]]] = [
    ("campus_unsupported", _m_campus_unsupported, _handle_campus_unsupported),
    ("compare_years",      _m_compare_years,      _handle_compare_years),
    ("best_year",          _m_best_year,           _handle_best_year),
    ("year_trend",         _m_year_trend,          _handle_year_trend),
    ("year_range",         _m_year_range,          _handle_year_range),
    ("yearly_count",       _m_yearly_count,        _handle_yearly_count),
    ("paper_authors",      _m_paper_authors,       _handle_paper_authors),
]


def route_intent(user_message: str) -> tuple[str | None, str | None]:
    """Match user_message against the slim intent set.

    Returns (reply, intent_name) or (None, None) to fall through to the agent.
    """
    q = user_message.strip()
    for name, matcher, handler in INTENTS:
        args = matcher(q)
        if args is not None:
            log.info("[intent_router] matched '%s' → %s", q[:60], name)
            try:
                return handler(args), name
            except Exception:  # noqa: BLE001
                log.exception("[intent_router] %s handler failed", name)
                return None, None
    return None, None
