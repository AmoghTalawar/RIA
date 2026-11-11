"""Full details of one paper, for the publication detail page.

The database is the source of truth. Only the fields it is MISSING (abstract, volume, issue, pages, ISSN) are
filled in from OpenAlex and then Crossref, looked up by DOI, and every such field is labelled with where it came
from so it is never mistaken for the Scopus record. Results are cached; any failure just leaves the field empty.

Set PAPER_ENRICH=0 to switch the outside lookups off. OUTBOUND_MAILTO (optional) is sent to OpenAlex/Crossref for
their faster "polite" service; nothing is sent unless it is set.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import quote

import httpx

from sql_tool import execute_sql

log = logging.getLogger("ria.paper")

OPENALEX = "https://api.openalex.org/works/doi:"
CROSSREF = "https://api.crossref.org/works/"
TIMEOUT = httpx.Timeout(6.0, connect=3.0)
CACHE_TTL = 24 * 3600          # a paper's published details do not change
MISS_TTL = 10 * 60             # retry a failed lookup after a few minutes
CACHE_MAX = 2000

DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")

# Fields a lookup may fill, and the database column each one replaces.
ENRICHABLE = ("abstract", "vol_no", "iss_no", "b_page", "e_page", "p_issn", "e_issn")

_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()


# ── database ────────────────────────────────────────────────────────────────
def get_paper(pub_id: int) -> dict | None:
    rows = execute_sql(f"SELECT * FROM publications WHERE pub_id = {int(pub_id)} LIMIT 1")
    if isinstance(rows, dict) or not rows:
        return None
    row = rows[0]
    for noisy in ("id", "matched_department_id", "matched_institute_id", "created_at", "updated_at"):
        row.pop(noisy, None)
    return row


def _blank(value: Any) -> bool:
    return value is None or str(value).strip() in ("", "nan", "None")


# ── parsing helpers (pure, unit-tested) ─────────────────────────────────────
def clean_doi(raw: str | None) -> str | None:
    """'https://doi.org/10.1007/x' or '10.1007/x ' -> '10.1007/x'; None when it is not a DOI."""
    doi = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", (raw or "").strip(), flags=re.I).strip()
    return doi if DOI_RE.match(doi) else None


def rebuild_abstract(inverted: dict | None) -> str:
    """OpenAlex stores abstracts as {word: [positions]}; put the words back in order."""
    if not inverted:
        return ""
    slots: dict[int, str] = {}
    for word, positions in inverted.items():
        for pos in positions or []:
            slots[pos] = word
    return " ".join(slots[i] for i in sorted(slots)).strip()


def strip_markup(text: str | None) -> str:
    """Crossref abstracts arrive as JATS XML ('<jats:p>...</jats:p>'): drop the tags and a leading 'Abstract'."""
    out = re.sub(r"</?(?:jats:)?(?:italic|bold|sup|sub|em|strong|i|b)(?=[ >/])[^>]*>", "", text or "")   # inline: no gap
    out = re.sub(r"<[^>]+>", " ", out)                                                           # blocks: a gap
    out = re.sub(r"\s+", " ", out).strip()
    return re.sub(r"^abstract[:.\s]+", "", out, flags=re.I).strip()


def split_pages(pages: str | None) -> tuple[str, str]:
    """'147-156' / '147–156' -> ('147', '156'); a single page gives (page, '')."""
    parts = [p.strip() for p in re.split(r"\s*[-–—]\s*", pages or "") if p.strip()]
    return (parts[0], parts[1]) if len(parts) >= 2 else ((parts[0], "") if parts else ("", ""))


def parse_openalex(work: dict | None) -> dict:
    if not work:
        return {}
    biblio = work.get("biblio") or {}
    source = ((work.get("primary_location") or {}).get("source")) or {}
    issns = [i for i in (source.get("issn") or []) if i]
    found = {
        "abstract": rebuild_abstract(work.get("abstract_inverted_index")),
        "vol_no": biblio.get("volume"),
        "iss_no": biblio.get("issue"),
        "b_page": biblio.get("first_page"),
        "e_page": biblio.get("last_page"),
        "p_issn": issns[0] if issns else None,
        "e_issn": issns[1] if len(issns) > 1 else None,
    }
    return {k: str(v).strip() for k, v in found.items() if not _blank(v)}


def parse_crossref(message: dict | None) -> dict:
    if not message:
        return {}
    first, last = split_pages(message.get("page"))
    issns = {t.get("type"): t.get("value") for t in (message.get("issn-type") or [])}
    plain = [i for i in (message.get("ISSN") or []) if i]
    found = {
        "abstract": strip_markup(message.get("abstract")),
        "vol_no": message.get("volume"),
        "iss_no": message.get("issue"),
        "b_page": first,
        "e_page": last,
        "p_issn": issns.get("print") or (plain[0] if plain else None),
        "e_issn": issns.get("electronic") or (plain[1] if len(plain) > 1 else None),
    }
    return {k: str(v).strip() for k, v in found.items() if not _blank(v)}


# ── outside lookups ─────────────────────────────────────────────────────────
def _get_json(url: str, params: dict | None = None) -> dict | None:
    """One GET, JSON back, None on any failure (network, 404, rate limit, bad JSON)."""
    headers = {"User-Agent": "RIA-Dashboard/1.0", "Accept": "application/json"}
    mailto = os.environ.get("OUTBOUND_MAILTO", "").strip()
    params = dict(params or {})
    if mailto:
        params["mailto"] = mailto
    try:
        r = httpx.get(url, params=params, headers=headers, timeout=TIMEOUT, follow_redirects=True)
        if r.status_code != 200:
            log.info("[paper] %s -> HTTP %s", url.split("?")[0], r.status_code)
            return None
        return r.json()
    except (httpx.HTTPError, ValueError) as err:
        log.info("[paper] %s failed: %s", url.split("?")[0], err)
        return None


def _cached(key: str, fetch):
    """Run `fetch()` once per key: a good answer is kept for a day, a failed one for a few minutes."""
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    value = fetch()
    with _lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (now + (CACHE_TTL if value else MISS_TTL), value)
    return value


def openalex_work(doi: str) -> dict | None:
    return _cached("oa|" + doi.lower(), lambda: _get_json(
        OPENALEX + quote(doi, safe="/"),
        {"select": "id,cited_by_count,abstract_inverted_index,biblio,primary_location"}))


def crossref_message(doi: str) -> dict | None:
    return _cached("cr|" + doi.lower(), lambda: (_get_json(CROSSREF + quote(doi, safe="/")) or {}).get("message"))


def live_citations(work: dict | None, message: dict | None) -> dict:
    """Current citation counts from the two services (they count differently, and both differ from Scopus)."""
    out: dict[str, dict] = {}
    if work and work.get("cited_by_count") is not None:
        entry: dict[str, Any] = {"count": int(work["cited_by_count"])}
        short = str(work.get("id") or "").rsplit("/", 1)[-1]
        if re.fullmatch(r"W\d+", short):
            entry["url"] = f"https://openalex.org/works?filter=cites:{short}"      # the papers that cite this one
        out["OpenAlex"] = entry
    if message and message.get("is-referenced-by-count") is not None:
        out["Crossref"] = {"count": int(message["is-referenced-by-count"])}
    return out


def clear_cache() -> None:
    with _lock:
        _cache.clear()


# ── public entry point ──────────────────────────────────────────────────────
def paper_details(pub_id: int, outside: bool = True) -> dict | None:
    """{'paper': row, 'sources': {field: 'database' | 'OpenAlex' | 'Crossref'}, 'live_citations': {...}}
    or None if no such paper. `outside=False` answers from the database alone (fast); the page then asks again with
    `outside=True` for the OpenAlex / Crossref extras."""
    paper = get_paper(pub_id)
    if paper is None:
        return None
    sources = {f: "database" for f in ENRICHABLE if not _blank(paper.get(f))}
    citations: dict = {}

    doi = clean_doi(paper.get("doi"))
    if outside and doi and os.environ.get("PAPER_ENRICH", "1") != "0":
        with ThreadPoolExecutor(max_workers=2) as pool:        # the two services are asked at the same time
            work_f, message_f = pool.submit(openalex_work, doi), pool.submit(crossref_message, doi)
            work, message = work_f.result(), message_f.result()
        citations = live_citations(work, message)
        # fill only what the database lacks: OpenAlex first, then Crossref
        for source, found in (("OpenAlex", parse_openalex(work)), ("Crossref", parse_crossref(message))):
            for field, value in found.items():
                if field in ENRICHABLE and _blank(paper.get(field)):
                    paper[field] = value
                    sources[field] = source
    return {"paper": paper, "sources": sources, "live_citations": citations}
