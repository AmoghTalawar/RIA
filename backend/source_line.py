"""Footer that tells the user which data an answer came from.

Built in code from the tools that actually ran (not written by the model), so it costs no LLM tokens and
cannot claim a source the answer did not use.
"""
from __future__ import annotations

DATABASE = "KLE Tech research publications database"

# tool -> (what it read, quality/citation source it relies on)
_TOOL_SOURCE: dict[str, tuple[str, str]] = {
    "get_faculty_stats":                  ("faculty profile", "Scopus"),
    "get_top_cited_publications":         ("faculty publications", "Scopus"),
    "get_citations_by_year":              ("faculty publications", "Scopus"),
    "search_publications_by_author":      ("faculty publications", "Scopus"),
    "get_department_benchmark":           ("department benchmark", "Scopus"),
    "get_department_stats":               ("department statistics", "Scopus"),
    "get_department_trend":               ("yearly department trend", "Scopus"),
    "get_inactive_faculty":               ("faculty-publication links", "Scopus"),
    "get_author_concentration":           ("author concentration", "Scopus"),
    "get_cross_department_collaboration": ("co-authorship across departments", "Scopus"),
    "get_growth_acceleration":            ("yearly publication growth", "Scopus"),
    "get_top_journals":                   ("journal records", "Scopus"),
    "get_institute_summary":              ("school summary", "Scopus"),
    "get_university_overview":            ("university overview", "Scopus"),
    "get_yearly_stats":                   ("yearly university statistics", "Scopus"),
    "compare_entities":                   ("department/school comparison", "Scopus"),
    "get_campus_stats":                   ("campus statistics", "Scopus"),
    "list_campus_publications":           ("campus publication records", "Scopus"),
    "get_campus_top_authors":             ("campus author records", "Scopus"),
    "get_qrank_distribution":             ("quartile distribution", "Scopus"),
    "count_qrank_publications":           ("quartile counts", "Scopus or Web of Science"),
}

SOURCE_MARK = "\n\n---\n*Source"       # every footer starts with this; history drops everything from here
GENERAL_KNOWLEDGE ="Source: general knowledge, not KLE Tech data."


def build_source_line(tool_calls: list[dict], *, concept: bool = False, data_year: int | None = None) -> str:
    """Return the footer (starting with a blank line and a rule), or '' when nothing should be cited.

    `tool_calls` are the agent's log entries; only calls that returned data are cited. A concept question
    (no tools) is labelled as general knowledge so it is never mistaken for a data-backed answer."""
    if concept:
        return f"\n\n---\n*{GENERAL_KNOWLEDGE}*"

    used: list[str] = []
    bases: list[str] = []
    for call in tool_calls:
        if call.get("status") != "success":
            continue
        label, base = _TOOL_SOURCE.get(call.get("tool"), (None, None))
        if label is None:
            continue
        if label not in used:
            used.append(label)
        if base not in bases:
            bases.append(base)
    if not used:
        return ""

    through = f" Data through {data_year}." if data_year else ""
    return (f"\n\n---\n*Source: {DATABASE} ({' / '.join(bases)} records), "
            f"{', '.join(used)}.{through}*")
