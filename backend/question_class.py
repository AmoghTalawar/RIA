"""Spot plain concept questions ("what is h-index?", "how does peer review work?") that need no KLE Tech data.

Such a question is answered without tool definitions or the tool-routing prompt, which are about 5k of the
7-9k tokens every request carries. The check is deliberately conservative: it only fires for a definitional
phrasing about a known bibliometrics concept with no sign of a data request (a person, department, "my/our",
a number, a year). Anything doubtful takes the normal path, which can always answer concept questions too.
"""
from __future__ import annotations

import re

_I = re.IGNORECASE

_START = re.compile(
    r"^\s*(?:what\s+is|what's|what\s+are|what\s+does|define|explain|"
    r"how\s+(?:does|do|is|are)\b.*\b(?:work|calculated|computed|measured|determined|assigned)|"
    r"difference\s+between|what\s+is\s+the\s+difference)\b",
    _I,
)

_CONCEPT = re.compile(
    r"\b(?:h[\s-]?index|i10|impact\s+factor|cite\s*score|citescore|snip|sjr|scopus|web\s+of\s+science|wos|"
    r"quartile|q[\s-]?rank|q[1-4]|peer[\s-]?review|citations?|nirf|open\s+access|preprint|orcid|"
    r"google\s+scholar|bibliometrics?|journal\s+ranking|predatory|doi|scimago|jcr)\b",
    _I,
)

# Words that mean "this is about KLE Tech / a specific person or unit / a figure".
_DATA_CUES = re.compile(
    r"\b(?:my|mine|me|our|ours|we|us|kle|kletech|bvb|department|dept|school|campus|faculty|professor|prof|dr|"
    r"university|institute|hod|dean|total|count|number|how\s+many|average|list|show|compare|trend|rank(?:ed|ing)?|"
    r"top|best|highest|lowest|cse|ece|eee|mech|mechanical|civil|chemistry|physics|biotech|"
    r"publications?|papers?|articles?)\b",
    _I,
)

# Capitalised words that are part of the concept itself, not a name.
_CONCEPT_CAPS = {
    "Scopus", "Web", "Science", "Google", "Scholar", "Hirsch", "Elsevier", "Clarivate", "Journal", "Citation",
    "Reports", "Impact", "Factor", "Peer", "Review", "Open", "Access", "Scimago", "Rank", "Quartile", "Index",
    "Cite", "Score",
}


def is_concept_question(message: str, max_len: int = 140) -> bool:
    """True for a short, definitional question about a bibliometrics concept with no data request in it."""
    text = (message or "").strip()
    if not text or len(text) > max_len or "\n" in text:
        return False
    if not _START.search(text) or not _CONCEPT.search(text):
        return False
    if _DATA_CUES.search(text):
        return False
    if re.search(r"\d", re.sub(r"\b(?:q[1-4]|i10)\b", "", text, flags=_I)):  # a year or any figure
        return False
    words = re.findall(r"\b[A-Z][a-z]+\b", text)
    if any(w not in _CONCEPT_CAPS for w in words[1:]):                      # a person or place name
        return False
    return True
