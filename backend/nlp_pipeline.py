"""NLP pipeline: normalizer, entity extraction, synonym mapping, session context.

Sits between the user message and the intent router / Groq LLM to:
1. Normalize synonyms (dept names, metrics, phrasings)
2. Extract entities (department, faculty name, year, metric, qrank)
3. Rewrite the query into a canonical form for better intent matching
4. Manage session context so follow-up questions work
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

# ── Department synonym map ──────────────────────────────────────────
# Maps common abbreviations / alternate names → canonical short_name
DEPT_SYNONYMS: dict[str, str] = {
    # Computer Science
    "cs": "CSE", "cse": "CSE", "comp sci": "CSE", "computer science": "CSE",
    "computer science and engineering": "CSE", "computer engineering": "CSE",
    "cs department": "CSE", "cse department": "CSE", "compsci": "CSE",
    "computing": "CSE",
    # Electronics
    "ece": "ECE", "electronics": "ECE", "ec": "ECE",
    "electronics and communication": "ECE",
    "electronics and communication engineering": "ECE",
    "electronics & communication": "ECE",
    # Electrical
    "eee": "EEE", "electrical": "EEE",
    "electrical and electronics": "EEE",
    "electrical and electronics engineering": "EEE",
    "electrical engineering": "EEE",
    # Mechanical
    "mech": "Mechanical", "mechanical": "Mechanical",
    "mechanical engineering": "Mechanical",
    # Civil
    "civil": "Civil", "civil engineering": "Civil",
    # Information Science
    "ise": "ISE", "information science": "ISE",
    "information science and engineering": "ISE",
    # Biotech
    "biotech": "Biotech", "bt": "Biotech", "biotechnology": "Biotech",
    # Chemistry
    "chem": "Chemistry", "chemistry": "Chemistry",
    # Mathematics
    "math": "Maths", "maths": "Maths", "mathematics": "Maths",
    # MCA
    "mca": "MCA", "master of computer applications": "MCA",
    # Architecture
    "arch": "Architecture", "architecture": "Architecture",
    # Physics
    "physics": "Physics", "phy": "Physics",
    # MBA
    "mba": "MBA", "management": "MBA", "business administration": "MBA",
    # CEER
    "ceer": "CEER", "environmental": "CEER",
    "center for environmental engineering research": "CEER",
    # Mining
    "mining": "Mining", "mining engineering": "Mining",
    # Textile
    "textile": "Textile", "textile technology": "Textile",
    # Automobile
    "auto": "Automobile", "automobile": "Automobile",
    "automobile engineering": "Automobile",
}

# ── Metric synonym map ──────────────────────────────────────────────
METRIC_SYNONYMS: dict[str, str] = {
    "citation": "citations", "cit": "citations", "cited": "citations",
    "cite": "citations", "citation count": "citations",
    "total citations": "citations", "scopus citations": "citations",
    "publication": "publications", "pub": "publications",
    "pubs": "publications", "papers": "publications", "paper": "publications",
    "research papers": "publications", "articles": "publications",
    "article": "publications", "publication count": "publications",
    "pub count": "publications", "total publications": "publications",
    "number of publications": "publications", "research output": "publications",
    "h-index": "h-index", "hindex": "h-index", "h index": "h-index",
    "hirsch index": "h-index", "hirsch": "h-index",
    "q1": "Q1", "q-1": "Q1", "q 1": "Q1", "quartile 1": "Q1",
    "q1 papers": "Q1", "q1 publications": "Q1",
    "q2": "Q2", "q-2": "Q2", "q 2": "Q2", "quartile 2": "Q2",
    "q3": "Q3", "q-3": "Q3", "q 3": "Q3", "quartile 3": "Q3",
    "q4": "Q4", "q-4": "Q4", "q 4": "Q4", "quartile 4": "Q4",
    "impact factor": "impact factor", "if": "impact factor",
    "citescore": "citescore", "cite score": "citescore",
    "journal": "journals", "journals": "journals",
    "conference": "conferences", "conferences": "conferences",
    "conf": "conferences",
}

# ── Question phrasings → canonical forms ────────────────────────────
# Maps alternate ways of asking the same thing
PHRASING_PATTERNS: list[tuple[re.Pattern, str]] = [
    # "how many papers/pubs/publications does X have" → "publications for X"
    (re.compile(r"how\s+many\s+(?:papers?|pubs?|publications?|articles?)\s+(?:does|do|did|has|have|are\s+there\s+(?:for|in|by))\s+(.+?)(?:\s+have|\s+has|\s+published|\s+written)?\s*[?.!]*$", re.I),
     r"publications for \1"),
    # "how many papers/pubs were published in YEAR" → "publications in YEAR"
    (re.compile(r"how\s+many\s+(?:papers?|pubs?|publications?|articles?)\s+(?:were|are|got)\s+(?:published|released|produced)\s+(?:in|during)\s+(\d{4})\s*[?.!]*$", re.I),
     r"publications in \1"),
    # "what is the h-index/publication count of X" → "stats on X"
    # Also catches common typos: "wha is", "whats", "wat is"
    (re.compile(r"wh(?:at?|ats?)(?:'s|\s+is|\s+are)?\s+(?:the\s+)?(?:h[- ]?index|citation(?:s)?|publication[s]?\s+count|pub(?:lication)?\s+count|number\s+of\s+(?:publications?|pubs?|papers?))\s+(?:of|for|by)\s+(.+?)\s*[?.!]*$", re.I),
     r"stats on \1"),
    # "tell me about X" / "info on X" / "details of X" → "stats on X"
    (re.compile(r"(?:tell\s+me\s+about|info(?:rmation)?\s+(?:on|about)|details?\s+(?:of|about|on)|describe)\s+(.+?)\s*[?.!]*$", re.I),
     r"stats on \1"),
    # "how is X performing" / "X's performance" → "stats on X"
    (re.compile(r"how\s+is\s+(.+?)\s+(?:doing|performing|ranked)\s*[?.!]*$", re.I),
     r"stats on \1"),
    (re.compile(r"(.+?)(?:'s)?\s+(?:performance|profile|overview|summary|record)\s*[?.!]*$", re.I),
     r"stats on \1"),
    # "count of publications in YEAR" → "publications in YEAR"
    (re.compile(r"(?:count|number|total)\s+(?:of\s+)?(?:publications?|papers?|pubs?|articles?)\s+(?:in|for|during)\s+(\d{4})\s*[?.!]*$", re.I),
     r"publications in \1"),
    # "papers published in YEAR" → "publications in YEAR"
    (re.compile(r"(?:papers?|publications?|pubs?|articles?)\s+(?:published|released|produced)\s+(?:in|during)\s+(\d{4})\s*[?.!]*$", re.I),
     r"publications in \1"),
    # "which dept/department is best/top/leading in X" → "which department has highest X"
    (re.compile(r"which\s+(?:dept|department|school)\s+(?:is|are)\s+(?:best|top|leading|highest|number\s+one|#1)\s+(?:in|for|by)\s+(.+?)\s*[?.!]*$", re.I),
     r"which department has highest \1"),
    # "department with most X" → "which department has highest X"
    (re.compile(r"(?:dept|department|school)\s+with\s+(?:the\s+)?(?:most|highest|maximum|max)\s+(.+?)\s*[?.!]*$", re.I),
     r"which department has highest \1"),
    # "top researchers/faculty in X" (no "by metric" suffix) → "top faculty in X by citations"
    (re.compile(r"(?:top|best|leading)\s+(?:\d+\s+)?(?:researchers?|faculty|professors?|authors?)\s+(?:in|from|of)\s+([^.?!]+?)(?:\s+by\s+.+)?\s*[?.!]*$", re.I),
     r"top 10 faculty in \1 by citations"),
    # "show/give/list me the q-rank breakdown/split" → "q-rank distribution"
    (re.compile(r"(?:show|give|list|get|what(?:'s|\s+is))\s+(?:me\s+)?(?:the\s+)?(?:q[- ]?rank|quartile)\s+(?:breakdown|split|summary|overview|distribution|spread)\s*[?.!]*$", re.I),
     r"q-rank distribution"),
    # "growth rate" / "year over year" / "yoy" / "how are publications trending" → yoy
    (re.compile(r"(?:what(?:'s|\s+is)\s+(?:the\s+)?)?(?:publication\s+)?(?:growth|trend(?:ing)?|yoy|year[- ]over[- ]year)\s*(?:rate|trend|analysis)?\s*(?:of\s+publications?)?\s*[?.!]*$", re.I),
     r"total publication count and yoy growth rate"),
    # "how are publications trending" / "publication trend"
    (re.compile(r"(?:how\s+are\s+)?(?:publications?|papers?|research)\s+(?:trending|growing|changing|increasing|decreasing)\s*[?.!]*$", re.I),
     r"total publication count and yoy growth rate"),
    # "compare 2024 and 2025" / "2024 vs 2025" (generic) → yoy
    (re.compile(r"(?:compare|comparison|diff(?:erence)?)\s+(?:between\s+)?(?:20\d{2})\s+(?:and|vs\.?|versus|with)\s+(?:20\d{2})\s*[?.!]*$", re.I),
     r"total publication count and yoy growth rate"),
    # "which year had most / best publications" → best year
    (re.compile(r"which\s+year\s+(?:had|has|is|was)\s+(?:the\s+)?(?:most|best|highest|maximum|max)\s+(?:publications?|papers?|pubs?|research\s+output)\s*[?.!]*$", re.I),
     r"best year for publications"),
    # "publications by year" / "publication trend" / "year-wise breakdown"
    (re.compile(r"(?:publications?|papers?|pubs?|research)\s+(?:by\s+year|per\s+year|year[- ]?wise|year[- ]?by[- ]?year(?!\s+growth))\s*[?.!]*$", re.I),
     r"publications by year trend"),
]

# ── Follow-up / pronoun patterns ───────────────────────────────────
FOLLOWUP_PATTERNS = [
    re.compile(r"\b(?:what about|how about|and (?:for|in|about)?)\s+(.+?)\s*[?.!]*$", re.I),
    re.compile(r"\b(?:same|similar|likewise)\s+(?:for|in|about)\s+(.+?)\s*[?.!]*$", re.I),
    re.compile(r"^(?:and|also|now)\s+(.+?)\s*[?.!]*$", re.I),
]

PRONOUN_REFS = re.compile(
    r"\b(?:his|her|their|them|they|he|she|that\s+(?:person|faculty|professor|department|dept))\b", re.I
)

DEPT_PRONOUN_REFS = re.compile(
    r"\b(?:that\s+(?:department|dept|school)|this\s+(?:department|dept|school)|the\s+same\s+(?:department|dept|school)|it|its)\b", re.I
)


# ── Extracted entities ─────────────────────────────────────────────
@dataclass
class Entities:
    department: str | None = None
    faculty_name: str | None = None
    year: int | None = None
    year2: int | None = None   # second year for comparison queries
    metric: str | None = None
    qrank: str | None = None
    limit: int | None = None


@dataclass
class SessionContext:
    """Tracks entities from the last successful query for follow-up resolution."""
    last_department: str | None = None
    last_faculty: str | None = None
    last_year: int | None = None
    last_metric: str | None = None
    last_intent: str | None = None
    history: list[dict[str, str]] = field(default_factory=list)

    def update(self, entities: Entities, intent: str | None = None):
        if entities.department:
            self.last_department = entities.department
        if entities.faculty_name:
            self.last_faculty = entities.faculty_name
        if entities.year:
            self.last_year = entities.year
        if entities.metric:
            self.last_metric = entities.metric
        if intent:
            self.last_intent = intent

    def add_turn(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        # Keep last 10 turns (5 exchanges)
        if len(self.history) > 10:
            self.history = self.history[-10:]

    def get_history_for_llm(self) -> list[dict[str, str]]:
        """Return conversation history formatted for the LLM."""
        return list(self.history)


# ── Active sessions store ──────────────────────────────────────────
_sessions: dict[str, SessionContext] = {}


def get_session(session_id: str) -> SessionContext:
    if session_id not in _sessions:
        _sessions[session_id] = SessionContext()
    return _sessions[session_id]


def _fuzzy_dept_match(word: str, min_ratio: float = 0.82) -> tuple[str | None, str | None]:
    """Fuzzy-match a single token against DEPT_SYNONYMS.

    Handles common typos (e.g. "chemiistry" → "chemistry", "mechnical" →
    "mechanical"). Only compares against synonyms of comparable length
    (±2 chars) to avoid spurious matches on short words.

    Returns (matched_synonym, canonical_short_name) or (None, None).
    """
    if len(word) < 4:
        return None, None
    best_syn: str | None = None
    best_canonical: str | None = None
    best_ratio = min_ratio
    for syn, canonical in DEPT_SYNONYMS.items():
        # Only consider single-word synonyms of comparable length.
        if " " in syn or len(syn) < 4 or abs(len(syn) - len(word)) > 2:
            continue
        ratio = SequenceMatcher(None, word, syn).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_syn = syn
            best_canonical = canonical
    return best_syn, best_canonical


def _normalize_dept(text: str) -> str | None:
    """Try to resolve text to a canonical department short_name."""
    low = text.strip().lower()
    # Direct lookup
    if low in DEPT_SYNONYMS:
        return DEPT_SYNONYMS[low]
    # Substring match (e.g. "the CSE department" → "CSE")
    for syn, canonical in DEPT_SYNONYMS.items():
        if syn in low or low in syn:
            return canonical
    # Fuzzy match against each token (catches typos like "chemiistry").
    for token in re.findall(r"[a-z]+", low):
        _, canonical = _fuzzy_dept_match(token)
        if canonical:
            return canonical
    return None


def _normalize_metric(text: str) -> str | None:
    """Try to resolve text to a canonical metric name."""
    low = text.strip().lower()
    if low in METRIC_SYNONYMS:
        return METRIC_SYNONYMS[low]
    for syn, canonical in METRIC_SYNONYMS.items():
        if syn in low:
            return canonical
    return None


def extract_entities(query: str) -> Entities:
    """Extract structured entities from the user query."""
    entities = Entities()

    # Year extraction — capture up to two years for comparison queries
    year_matches = re.findall(r"\b(20[12]\d)\b", query)
    if year_matches:
        entities.year = int(year_matches[0])
        if len(year_matches) >= 2 and year_matches[1] != year_matches[0]:
            entities.year2 = int(year_matches[1])

    # Q-rank extraction
    qrank_match = re.search(r"\b(q[1-4])\b", query, re.I)
    if qrank_match:
        entities.qrank = qrank_match.group(1).upper()

    # Limit extraction (top N)
    limit_match = re.search(r"\btop\s+(\d+)\b", query, re.I)
    if limit_match:
        entities.limit = int(limit_match.group(1))

    # Department extraction - check each synonym against the query
    # Skip very short synonyms (<=2 chars) to avoid false matches on common words
    q_lower = query.lower()
    best_dept = None
    best_len = 0
    for syn, canonical in DEPT_SYNONYMS.items():
        if len(syn) <= 2:
            continue  # Skip "cs", "bt", "ee" etc. — too ambiguous
        # Match as whole word or phrase in the query
        pattern = r"\b" + re.escape(syn) + r"\b"
        if re.search(pattern, q_lower):
            if len(syn) > best_len:  # Prefer longest match
                best_dept = canonical
                best_len = len(syn)
    # Fallback: fuzzy-match each token to catch typos like "chemiistry".
    if best_dept is None:
        for token in re.findall(r"[a-z]{4,}", q_lower):
            _, canonical = _fuzzy_dept_match(token)
            if canonical:
                best_dept = canonical
                break
    entities.department = best_dept

    # Metric extraction
    for syn, canonical in METRIC_SYNONYMS.items():
        pattern = r"\b" + re.escape(syn) + r"\b"
        if re.search(pattern, q_lower):
            if entities.metric is None or len(syn) > len(entities.metric):
                entities.metric = canonical

    return entities


def resolve_followup(query: str, session: SessionContext) -> str:
    """Resolve follow-up references using session context.

    E.g. "what about CSE?" after asking about ECE faculty → reuse last intent
    E.g. "his citations?" after asking about a faculty → resolve pronoun
    """
    q = query.strip()

    # Check for pronoun references to faculty
    if PRONOUN_REFS.search(q) and session.last_faculty:
        q = PRONOUN_REFS.sub(session.last_faculty, q)

    # Check for department pronoun references
    if DEPT_PRONOUN_REFS.search(q) and session.last_department:
        q = DEPT_PRONOUN_REFS.sub(session.last_department, q)

    # Check for "what about X" style follow-ups
    for pat in FOLLOWUP_PATTERNS:
        m = pat.search(q)
        if m:
            new_entity = m.group(1).strip()
            # If new_entity is a department, replay last intent with new dept
            dept = _normalize_dept(new_entity)
            if dept and session.last_intent:
                # Reconstruct query based on last intent
                return _reconstruct_query(session.last_intent, dept=dept, session=session)
            # If it looks like a faculty name, replay with new name
            if re.match(r"^[A-Za-z][A-Za-z .'-]{1,60}$", new_entity):
                if session.last_intent:
                    return _reconstruct_query(session.last_intent, faculty=new_entity, session=session)
            # Fall through - let the query pass as-is with context
            break

    return q


def _reconstruct_query(intent: str, dept: str | None = None,
                       faculty: str | None = None, session: SessionContext | None = None) -> str:
    """Reconstruct a query string from a known intent + new entities."""
    s = session or SessionContext()

    if intent == "faculty_stats" and faculty:
        return f"stats on {faculty}"
    if intent == "top_faculty" and dept:
        metric = s.last_metric or "citations"
        return f"top 10 faculty in {dept} by {metric}"
    if intent == "qrank_in_dept" and dept:
        qrank = "Q1"  # default
        return f"total {qrank} publications in {dept}"
    if intent == "yearly_count" and s.last_year:
        return f"publications in {s.last_year}"
    if intent == "dept_highest_metric":
        metric = s.last_metric or "citations"
        return f"which department has highest {metric}"
    if intent == "faculty_pubs_list" and faculty:
        return f"list publications of {faculty}"

    # Generic fallback: just mention the new entity
    if dept:
        return f"stats on {dept}"
    if faculty:
        return f"stats on {faculty}"
    return ""


def normalize_query(query: str, session: SessionContext | None = None) -> str:
    """Apply synonym normalization and phrasing canonicalization.

    Returns a cleaned query that the intent router is more likely to match.
    The original query is preserved for the LLM fallback.
    """
    q = query.strip()

    # Step 1: Resolve follow-ups if we have session context
    if session:
        q = resolve_followup(q, session)

    # Step 2: Apply phrasing normalization patterns
    for pattern, replacement in PHRASING_PATTERNS:
        m = pattern.match(q)
        if m:
            q = pattern.sub(replacement, q)
            break  # Only apply first match

    # Step 3: Normalize department names in the query
    # Replace long department names with short_name for better matching
    q_lower = q.lower()
    matched = False
    for syn, canonical in sorted(DEPT_SYNONYMS.items(), key=lambda x: -len(x[0])):
        pattern = r"\b" + re.escape(syn) + r"\b"
        if re.search(pattern, q_lower):
            q = re.sub(pattern, canonical, q, flags=re.I)
            q_lower = q.lower()
            matched = True
            break  # Only replace the first/longest match

    # Step 4: Fuzzy-correct misspelled department tokens (e.g.
    # "chemiistry" → "Chemistry"). Only runs when no exact synonym matched,
    # to avoid double-substituting a term that was already canonicalized.
    if not matched:
        def _sub_token(m: re.Match) -> str:
            tok = m.group(0)
            _, canonical = _fuzzy_dept_match(tok.lower())
            return canonical if canonical else tok
        q = re.sub(r"[A-Za-z]{4,}", _sub_token, q)

    return q


def build_context_prompt(session: SessionContext) -> str:
    """Build a context string to prepend to the system prompt for the LLM,
    summarizing what the user has been asking about."""
    parts = []
    if session.last_faculty:
        parts.append(f"The user was recently asking about faculty member: {session.last_faculty}")
    if session.last_department:
        parts.append(f"The user was recently asking about department: {session.last_department}")
    if session.last_year:
        parts.append(f"The user was recently discussing year: {session.last_year}")
    if session.last_metric:
        parts.append(f"The user was recently asking about metric: {session.last_metric}")

    if not parts:
        return ""

    return (
        "\nCONVERSATION CONTEXT (use to resolve ambiguous references like "
        "'that department', 'his', 'their', 'same for', etc.):\n"
        + "\n".join(f"- {p}" for p in parts)
        + "\n"
    )
