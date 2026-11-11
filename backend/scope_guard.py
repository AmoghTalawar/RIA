"""Per-request scope guard for the RIA agent's tools (design A, P2).

The model never decides what a user may see. Every tool call the model makes goes
through `authorize()`, which uses the caller's verified `Scope` (backend/auth_scope.py):

  1. The tool must be allowed for the persona (and the model is only shown those tools).
  2. The model's arguments are whitelisted against the tool's schema and type-coerced.
     Anything else - including `ria_user_id`, `scope_departments`, `include_names` -
     is dropped, so the model cannot supply the trusted arguments below.
  3. Trusted arguments are then injected:
       ria_user_id         pin a query to one person
       scope_departments   canonical department names the caller may see (exact match)
       include_names       False -> the tool never returns individual faculty names
  4. Department text the model typed is resolved to canonical names from the database
     directory and never reaches SQL (so '%' and friends are inert). Anything that
     resolves outside the caller's scope is refused.

Rules (see docs in the plan, section 8.3):
  faculty          own profile and own publications only; own-department aggregates
                   (no names); university-wide counts; no comparisons.
  hod              individual faculty and publications of OWN department; own department
                   with names; other departments aggregates only; comparisons of
                   departments (aggregates) and of faculty inside own department.
  faculty_dean     everything inside OWN school (institute), including named faculty of the
                   school's departments; other departments are out of scope; university-wide
                   counts. Also: author concentration, cross-department collaboration, and
                   growth acceleration, all scoped to OWN school.
  executive_dean   whole university, including any individual faculty member.
  vice_chancellor  everything (also used for Admin). Department/school text is still resolved
                   to canonical names, so "CSE" means the same department for every role.

Fails closed: unknown persona, missing profile links, an unresolved department, or an
unavailable directory all deny. Denials come back to the model as
{"status": "forbidden", "message": ...}.
"""
from __future__ import annotations

import difflib
import logging
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

log = logging.getLogger("ria.guard")

INDIVIDUAL_TOOLS = frozenset({
    # Tools that can return a specific person's identity: own profile/publications for Faculty,
    # own-department data for HoD, and (for Executive Dean only) an explicit drill-down.
    "get_faculty_stats", "search_publications_by_author", "get_inactive_faculty",
    "get_top_cited_publications", "get_department_benchmark", "get_citations_by_year",
    "get_campus_top_authors",      # names ranked by campus: HoD own department, Faculty Dean own school
})
AGGREGATE_TOOLS = frozenset({
    "get_department_stats", "count_qrank_publications", "get_yearly_stats", "compare_entities",
    "get_qrank_distribution", "get_university_overview", "get_department_trend", "get_top_journals",
    "get_campus_stats",
})
# A paper LIST (titles), by campus: Executive Dean and VC only.
LISTING_TOOLS = frozenset({"list_campus_publications"})
# Institute/school-level tools: Faculty Dean (own school only) and up. Not HoD or Faculty — their
# scope is a department, and an institute tool would show them a school beyond their own department.
INSTITUTE_TOOLS = frozenset({"get_institute_summary"})
# Faculty Dean's own analysis cluster (plan §8.3): concentration/collaboration/acceleration
# WITHIN their own school. Per the recorded plan these are Faculty-Dean-only, not HoD or
# Executive Dean (who have their own broader tools) — VC still sees them via ALL_TOOLS.
FACULTY_DEAN_TOOLS = frozenset({
    "get_author_concentration", "get_cross_department_collaboration", "get_growth_acceleration",
})
ALL_TOOLS = INDIVIDUAL_TOOLS | AGGREGATE_TOOLS | INSTITUTE_TOOLS | FACULTY_DEAN_TOOLS | LISTING_TOOLS

_TOOLS_BY_PERSONA: dict[str, frozenset[str]] = {
    "faculty": frozenset({
        "get_faculty_stats", "search_publications_by_author", "get_department_stats",
        "count_qrank_publications", "get_yearly_stats", "get_qrank_distribution", "get_university_overview",
        "get_department_trend", "get_top_cited_publications", "get_department_benchmark", "get_citations_by_year",
        "get_top_journals", "get_campus_stats",
    }),
    "hod": INDIVIDUAL_TOOLS | AGGREGATE_TOOLS,
    "faculty_dean": INDIVIDUAL_TOOLS | AGGREGATE_TOOLS | INSTITUTE_TOOLS | FACULTY_DEAN_TOOLS,  # names: own school only
    "executive_dean": INDIVIDUAL_TOOLS | AGGREGATE_TOOLS | INSTITUTE_TOOLS | LISTING_TOOLS,
    "vice_chancellor": ALL_TOOLS,
}

# ─────────────────────────────────────────────────────────────
# Decision
# ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Decision:
    allowed: bool
    args: dict = field(default_factory=dict)   # kwargs to call the tool with (sanitised + trusted)
    message: str = ""                          # user-facing reason when denied
    action: str = "allow"                      # allow | rewrite | deny
    note: str = ""                             # short log detail


def _deny(message: str, note: str = "") -> Decision:
    return Decision(False, {}, message, "deny", note or message)


class GuardUnavailable(Exception):
    """A dependency the guard needs (the department directory) could not be reached."""


# ─────────────────────────────────────────────────────────────
# Department directory
# ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Dept:
    id: str
    name: str
    institute_id: Optional[str]


@dataclass(frozen=True)
class Inst:
    id: str
    name: str
    short_name: str


@dataclass(frozen=True)
class Directory:
    departments: tuple[Dept, ...]
    institutes: tuple[Inst, ...]

    def names_in_institute(self, institute_id: Optional[str]) -> list[str]:
        return [d.name for d in self.departments if institute_id and d.institute_id == institute_id]


def _abbrev_map() -> dict[str, str]:
    from ria_tools_groq import DEPT_ABBREV  # lazy: keeps this module cheap to import
    return DEPT_ABBREV


def resolve_departments(directory: Directory, text: Any) -> list[Dept]:
    """Map free text ('CSE', 'Chemistry', 'School of X', 'SCSE') to canonical departments.

    Order: exact department name (after abbreviation expansion) -> exact institute name or
    short name (all its departments) -> substring of department names -> substring of
    institute names. The raw text is never used in SQL."""
    norm = re.sub(r"\s+", " ", str(text or "")).strip().lower()
    if not norm:
        return []
    expanded = _abbrev_map().get(norm, norm).strip().lower()
    for candidate in (norm, expanded):
        exact = [d for d in directory.departments if d.name.lower() == candidate]
        if exact:
            return exact
    for candidate in (norm, expanded):
        insts = [i for i in directory.institutes if i.name.lower() == candidate or (i.short_name or "").lower() == candidate]
        if insts:
            ids = {i.id for i in insts}
            return [d for d in directory.departments if d.institute_id in ids]
    if len(expanded) >= 3:
        hits = [d for d in directory.departments if expanded in d.name.lower()]
        if hits:
            return hits
        insts = [i for i in directory.institutes if expanded in i.name.lower()]
        if insts:
            ids = {i.id for i in insts}
            return [d for d in directory.departments if d.institute_id in ids]
    return []


def resolve_institutes(directory: Directory, text: Any) -> list[Inst]:
    """Map free text ('CSE', 'School of Sciences', 'SoCSE') to canonical institutes.

    Order: exact name or short name, then substring of the name. The raw text is never used
    in SQL."""
    norm = re.sub(r"\s+", " ", str(text or "")).strip().lower()
    if not norm:
        return []
    exact = [i for i in directory.institutes if i.name.lower() == norm or (i.short_name or "").lower() == norm]
    if exact:
        return exact
    if len(norm) >= 3:
        return [i for i in directory.institutes if norm in i.name.lower()]
    return []


_DIR_TTL = 300.0
_dir_cache: tuple[float, Directory] | None = None
_dir_lock = threading.Lock()


def _load_directory() -> Directory:
    import auth_scope
    sb = auth_scope._client()
    depts = auth_scope._rows(sb.table("departments").select("id,name,institute_id").limit(2000).execute())
    insts = auth_scope._rows(sb.table("institutes").select("id,name,short_name").limit(500).execute())
    return Directory(
        tuple(Dept(str(d["id"]), d["name"], str(d["institute_id"]) if d.get("institute_id") else None) for d in depts),
        tuple(Inst(str(i["id"]), i["name"], i.get("short_name") or "") for i in insts),
    )


_directory_loader: Callable[[], Directory] = _load_directory


def get_directory() -> Directory:
    global _dir_cache
    now = time.time()
    with _dir_lock:
        if _dir_cache and _dir_cache[0] > now:
            return _dir_cache[1]
    try:
        d = _directory_loader()
    except Exception as err:  # noqa: BLE001
        log.error("department directory unavailable: %s", err)
        raise GuardUnavailable(str(err)) from err
    if not d.departments:
        raise GuardUnavailable("department directory is empty")
    with _dir_lock:
        _dir_cache = (now + _DIR_TTL, d)
    return d


def clear_directory_cache() -> None:
    global _dir_cache
    with _dir_lock:
        _dir_cache = None


# ─────────────────────────────────────────────────────────────
# "Is this name me?"
# ─────────────────────────────────────────────────────────────

_TITLES = {"dr", "prof", "professor", "mr", "mrs", "ms", "shri", "smt", "sri"}
_SELF_WORDS = {"me", "my", "myself", "self", "mine", "i"}


def _name_tokens(name: Any) -> list[str]:
    toks = re.findall(r"[a-z0-9]+", str(name or "").lower())
    return [t for t in toks if t not in _TITLES]


def refers_to_self(scope, name: Any) -> bool:
    """True if `name` (from the model) plausibly refers to the caller.

    Used only as a friendly check: the query itself is pinned to scope.ria_user_id, so a
    false positive returns the caller's OWN data and never anyone else's."""
    req = _name_tokens(name)
    if not req or set(req) <= _SELF_WORDS:
        return True                                   # empty, or only "me" / "my" / "myself"
    own = set(_name_tokens(scope.full_name)) | set(_name_tokens(getattr(scope, "author_name", None)))
    if not own:
        return False
    if not any(len(t) >= 3 for t in req):
        return False                                  # initials alone never identify a person
    for t in req:
        if t in own:
            continue
        if len(t) >= 4 and any(len(o) >= 4 and difflib.SequenceMatcher(None, t, o).ratio() >= 0.8 for o in own):
            continue
        return False
    return True


# ─────────────────────────────────────────────────────────────
# Argument whitelisting
# ─────────────────────────────────────────────────────────────

class BadArgument(Exception):
    pass


def _schema_props(fn_name: str) -> Optional[dict]:
    from ria_tools_groq import TOOLS
    for t in TOOLS:
        if t["function"]["name"] == fn_name:
            return t["function"]["parameters"].get("properties", {})
    return None


def _coerce(name: str, prop: dict, value: Any) -> Any:
    types = prop.get("type")
    types = [t for t in (types if isinstance(types, list) else [types]) if t != "null"]
    try:
        if "integer" in types:
            if isinstance(value, bool):
                raise ValueError
            return int(value)
        if "array" in types:
            items = value if isinstance(value, list) else [value]
            return [str(v).strip()[:100] for v in items[:10] if isinstance(v, (str, int, float)) and str(v).strip()]
        if "string" in types:
            if not isinstance(value, (str, int, float)) or isinstance(value, bool):
                raise ValueError
            return str(value).strip()[:200]
    except (ValueError, TypeError) as err:
        raise BadArgument(f"Invalid value for '{name}'.") from err
    return value


def sanitize_args(fn_name: str, args: dict) -> dict:
    """Keep only arguments in the tool's model-facing schema, type-coerced and bounded."""
    props = _schema_props(fn_name)
    if props is None:
        raise BadArgument(f"Unknown tool: {fn_name}")
    clean: dict = {}
    for key, value in (args or {}).items():
        if key not in props or value is None:
            continue
        clean[key] = _coerce(key, props[key], value)
    return clean


# ─────────────────────────────────────────────────────────────
# Rules
# ─────────────────────────────────────────────────────────────

class _Ctx:
    def __init__(self, scope, args: dict, user_message: str, directory: Optional[Directory]):
        self.scope = scope
        self.args = args
        self._directory = directory

    @property
    def persona(self) -> str:
        return self.scope.persona_id

    def directory(self) -> Directory:
        if self._directory is None:
            self._directory = get_directory()
        return self._directory

    def own_department(self) -> Optional[str]:
        return self.scope.department_name

    def own_institute(self) -> Optional[str]:
        return self.scope.institute_name

    def school_departments(self) -> list[str]:
        return self.directory().names_in_institute(self.scope.institute_id)


def _rewrite(ctx: _Ctx, drop: tuple[str, ...] = (), **trusted) -> Decision:
    args = {k: v for k, v in ctx.args.items() if k not in drop}
    args.update(trusted)
    changed = bool(drop) or bool(trusted)
    return Decision(True, args, "", "rewrite" if changed else "allow",
                    ", ".join(f"{k}={v}" for k, v in trusted.items()))


def _no_dept(what: str = "department") -> Decision:
    return _deny(f"Your account has no {what} on file, so this can't be answered. Please contact an administrator.")


def _not_found(text: str) -> Decision:
    return _deny(f"No department or school matching '{text}' was found.")


def _individual(ctx: _Ctx) -> Decision:
    """get_faculty_stats / search_publications_by_author."""
    p, s = ctx.persona, ctx.scope
    if p == "faculty":
        if s.ria_user_id is None:
            return _deny("Your account is not linked to a faculty record, so this can't be answered.")
        if not refers_to_self(s, ctx.args.get("faculty_name") or ctx.args.get("author_name") or ""):
            return _deny(
                f"You can only view your own research profile ({s.full_name}). "
                "Ask about your own publications, citations or h-index, or about department and university totals."
            )
        return _rewrite(ctx, ria_user_id=s.ria_user_id)
    if p == "hod":
        dept = ctx.own_department()
        if not dept:
            return _no_dept()
        return _rewrite(ctx, scope_departments=[dept])
    if p == "faculty_dean":
        school = ctx.school_departments()
        if not school:
            return _no_dept("school")
        return _rewrite(ctx, scope_departments=school)
    if p == "executive_dean":
        return _rewrite(ctx)
    return _deny("Individual faculty data isn't available for your role.")


def _resolve_all(ctx: _Ctx, texts: list[str]) -> tuple[Optional[list[str]], Optional[Decision]]:
    """Canonical department names for every text, or a denial if any cannot be resolved."""
    names: list[str] = []
    for t in texts:
        found = resolve_departments(ctx.directory(), t)
        if not found:
            return None, _not_found(t)
        for d in found:
            if d.name not in names:
                names.append(d.name)
    return names, None


def _resolve_institutes_all(ctx: _Ctx, texts: list[str]) -> tuple[Optional[list[str]], Optional[Decision]]:
    """Canonical institute names for every text, or a denial if any cannot be resolved."""
    names: list[str] = []
    for t in texts:
        found = resolve_institutes(ctx.directory(), t)
        if not found:
            return None, _deny(f"No school matching '{t}' was found.")
        for i in found:
            if i.name not in names:
                names.append(i.name)
    return names, None


def _institute_summary(ctx: _Ctx) -> Decision:
    """get_institute_summary: Faculty Dean sees only their own school; Executive Dean is unrestricted."""
    p = ctx.persona
    text = ctx.args.get("institute", "")
    if p == "faculty_dean":
        own = ctx.own_institute()
        if not own:
            return _no_dept("school")
        if text:
            names, denial = _resolve_institutes_all(ctx, [text])
            if denial:
                return denial
            if names != [own]:
                return _deny(f"You can view your own school ({own}) only.")
        return _rewrite(ctx, drop=("institute",), scope_institutes=[own])
    return _rewrite(ctx)                                       # executive_dean: unrestricted


def _campus_stats(ctx: _Ctx) -> Decision:
    """get_campus_stats: counts only. The campus's department breakdown (department names with paper
    counts, no people) is shown to HoD, Executive Dean and VC - the roles that may compare departments."""
    return _rewrite(ctx, include_departments=ctx.persona in ("hod", "executive_dean", "vice_chancellor"))


def _no_scope(ctx: _Ctx) -> Decision:
    """Tools with no department/institute argument: allowed once the persona check passes."""
    return _rewrite(ctx)


def _department_stats(ctx: _Ctx) -> Decision:
    p, s = ctx.persona, ctx.scope
    text = ctx.args.get("department", "")
    if p == "faculty":
        own = ctx.own_department()
        if not own:
            return _no_dept()
        if text:
            names, denial = _resolve_all(ctx, [text])
            if denial:
                return denial
            if names != [own]:
                return _deny(f"As a faculty member you can view department-level figures for your own department "
                             f"({own}) only.")
        return _rewrite(ctx, drop=("department",), scope_departments=[own], include_names=False)
    if p == "hod":
        own = ctx.own_department()
        if not own:
            return _no_dept()
        if not text:
            return _rewrite(ctx, drop=("department",), scope_departments=[own], include_names=True)
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        return _rewrite(ctx, drop=("department",), scope_departments=names, include_names=(names == [own]))
    if p == "faculty_dean":
        school = ctx.school_departments()
        if not school:
            return _no_dept("school")
        if not text:
            return _rewrite(ctx, drop=("department",), scope_departments=school, include_names=True)
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        if not set(names) <= set(school):
            return _deny("That department is outside your school. You can view: " + ", ".join(school) + ".")
        return _rewrite(ctx, drop=("department",), scope_departments=names, include_names=True)
    if p == "executive_dean":
        if not text:
            return _deny("Please name a department or school.")
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        return _rewrite(ctx, drop=("department",), scope_departments=names, include_names=True)
    return _rewrite(ctx)


def _publication_aggregate(ctx: _Ctx) -> Decision:
    """count_qrank_publications / get_yearly_stats: a count, optionally for one department."""
    p, s = ctx.persona, ctx.scope
    text = ctx.args.get("department", "")
    if not text:
        return _rewrite(ctx)                                  # university-wide total
    names, denial = _resolve_all(ctx, [text])
    if denial:
        return denial
    if p == "faculty":
        own = ctx.own_department()
        if not own:
            return _no_dept()
        if names != [own]:
            return _deny(f"As a faculty member you can view counts for the whole university or for your own "
                         f"department ({own}).")
    elif p == "faculty_dean":
        school = ctx.school_departments()
        if not school:
            return _no_dept("school")
        if not set(names) <= set(school):
            return _deny("That department is outside your school. You can view: " + ", ".join(school) + ".")
    return _rewrite(ctx, drop=("department",), scope_departments=names)


def _department_trend(ctx: _Ctx) -> Decision:
    """get_department_trend: same 'own department by default' shape as _department_stats, but this
    tool never returns names, so there is no include_names to inject."""
    p = ctx.persona
    text = ctx.args.get("department", "")
    if p == "faculty":
        own = ctx.own_department()
        if not own:
            return _no_dept()
        if text:
            names, denial = _resolve_all(ctx, [text])
            if denial:
                return denial
            if names != [own]:
                return _deny(f"As a faculty member you can view the trend for your own department ({own}) only.")
        return _rewrite(ctx, drop=("department",), scope_departments=[own])
    if p == "hod":
        own = ctx.own_department()
        if not own:
            return _no_dept()
        if not text:
            return _rewrite(ctx, drop=("department",), scope_departments=[own])
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        return _rewrite(ctx, drop=("department",), scope_departments=names)
    if p == "faculty_dean":
        school = ctx.school_departments()
        if not school:
            return _no_dept("school")
        if not text:
            return _rewrite(ctx, drop=("department",), scope_departments=school)
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        if not set(names) <= set(school):
            return _deny("That department is outside your school. You can view: " + ", ".join(school) + ".")
        return _rewrite(ctx, drop=("department",), scope_departments=names)
    if p == "executive_dean":
        if not text:
            return _deny("Please name a department.")
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        return _rewrite(ctx, drop=("department",), scope_departments=names)
    return _rewrite(ctx)


def _inactive_faculty(ctx: _Ctx) -> Decision:
    """get_inactive_faculty returns NAMES: HoD (own department), Faculty Dean (own school),
    Executive Dean (any department). Never Faculty."""
    p = ctx.persona
    text = ctx.args.get("department", "")
    if p == "hod":
        own = ctx.own_department()
        if not own:
            return _no_dept()
        if text:
            names, denial = _resolve_all(ctx, [text])
            if denial:
                return denial
            if names != [own]:
                return _deny(f"As a HoD you can view faculty lists for your own department ({own}) only.")
        return _rewrite(ctx, drop=("department",), scope_departments=[own])
    if p == "faculty_dean":
        school = ctx.school_departments()
        if not school:
            return _no_dept("school")
        if not text:
            return _rewrite(ctx, drop=("department",), scope_departments=school)
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        if not set(names) <= set(school):
            return _deny("That department is outside your school. You can view: " + ", ".join(school) + ".")
        return _rewrite(ctx, drop=("department",), scope_departments=names)
    if p == "executive_dean":
        if not text:
            return _rewrite(ctx)
        names, denial = _resolve_all(ctx, [text])
        if denial:
            return denial
        return _rewrite(ctx, drop=("department",), scope_departments=names)
    return _deny("Individual faculty activity isn't available at your level. Ask about a department's "
                "publication trend instead.")


def _campus_top_authors(ctx: _Ctx) -> Decision:
    """get_campus_top_authors returns NAMES: HoD (own department only), Faculty Dean (own school), Executive
    Dean (any department). Never Faculty. (VC never reaches here: _unrestricted resolves department text.)"""
    return _inactive_faculty(ctx)


def _compare(ctx: _Ctx) -> Decision:
    p, s = ctx.persona, ctx.scope
    etype = str(ctx.args.get("entity_type", "department")).strip().lower()
    entities = ctx.args.get("entities") or []
    if p == "faculty":
        return _deny("Comparisons aren't available for your role. You can view your own profile and your "
                     "department's totals.")
    if etype == "faculty":
        if p == "hod":
            dept = ctx.own_department()
            if not dept:
                return _no_dept()
            return _rewrite(ctx, drop=("department",), scope_departments=[dept], include_names=True)
        if p == "faculty_dean":
            school = ctx.school_departments()
            if not school:
                return _no_dept("school")
            text = ctx.args.get("department", "")
            if text:
                names, denial = _resolve_all(ctx, [text])
                if denial:
                    return denial
                if not set(names) <= set(school):
                    return _deny("That department is outside your school. You can view: " + ", ".join(school) + ".")
                school = names
            return _rewrite(ctx, drop=("department",), scope_departments=school, include_names=True)
        if p == "executive_dean":
            return _vc_or_dean_department_text(ctx, include_names=True)
        return _deny("Comparisons of individual faculty aren't available at your level. Compare departments instead.")
    if etype == "institute":
        # Institute ranking spans schools beyond any one department/school, so it is
        # university-wide only (executive_dean and vice_chancellor, which short-circuits earlier).
        if p == "executive_dean":
            return _rewrite(ctx)
        return _deny("School/institute comparisons aren't available at your level. Ask about departments instead.")
    if etype != "department":
        return _rewrite(ctx)                                  # the tool reports the invalid type itself
    if p == "faculty_dean":
        school = ctx.school_departments()
        if not school:
            return _no_dept("school")
        if not entities:
            return _rewrite(ctx, drop=("entities", "department"), scope_departments=school, include_names=False)
        names, denial = _resolve_all(ctx, entities)
        if denial:
            return denial
        if not set(names) <= set(school):
            return _deny("Some of those departments are outside your school. You can compare: " + ", ".join(school) + ".")
        return _rewrite(ctx, drop=("entities", "department"), scope_departments=names, include_names=False)
    if entities:                                              # hod / executive_dean: any department, aggregates
        names, denial = _resolve_all(ctx, entities)
        if denial:
            return denial
        return _rewrite(ctx, drop=("entities", "department"), scope_departments=names, include_names=False)
    return _rewrite(ctx, include_names=False)                 # rank all departments (aggregates)


def _dean_cluster_single_dept(ctx: _Ctx) -> Decision:
    """get_author_concentration / get_growth_acceleration: Faculty Dean only, defaulting to the
    caller's whole school; an explicit department must belong to it. (VC never reaches here —
    authorize() short-circuits it to unrestricted before any rule runs.)"""
    if ctx.persona != "faculty_dean":
        return _deny("This analysis is only available to Faculty Deans, for their own school.")
    school = ctx.school_departments()
    if not school:
        return _no_dept("school")
    text = ctx.args.get("department", "")
    if not text:
        return _rewrite(ctx, drop=("department",), scope_departments=school)
    names, denial = _resolve_all(ctx, [text])
    if denial:
        return denial
    if not set(names) <= set(school):
        return _deny("That department is outside your school. You can view: " + ", ".join(school) + ".")
    return _rewrite(ctx, drop=("department",), scope_departments=names)


def _cross_department_collaboration(ctx: _Ctx) -> Decision:
    """get_cross_department_collaboration: Faculty Dean only; both departments must resolve to
    exactly one department each, both inside the caller's own school, and be different."""
    if ctx.persona != "faculty_dean":
        return _deny("This analysis is only available to Faculty Deans, for their own school.")
    school = ctx.school_departments()
    if not school:
        return _no_dept("school")
    text_a, text_b = ctx.args.get("dept_a", ""), ctx.args.get("dept_b", "")
    if not text_a or not text_b:
        return _deny("Please name two departments in your school to compare.")
    names_a, denial = _resolve_all(ctx, [text_a])
    if denial:
        return denial
    names_b, denial = _resolve_all(ctx, [text_b])
    if denial:
        return denial
    if len(names_a) != 1 or len(names_b) != 1:
        return _deny("Please name one specific department for each side of the comparison.")
    if not set(names_a) <= set(school) or not set(names_b) <= set(school):
        return _deny("Both departments must be in your school. You can choose from: " + ", ".join(school) + ".")
    if names_a == names_b:
        return _deny("Please choose two different departments to compare.")
    return _rewrite(ctx, drop=("dept_a", "dept_b"), dept_a_scope=names_a[0], dept_b_scope=names_b[0])


def _vc_or_dean_department_text(ctx: _Ctx, **trusted) -> Decision:
    """No department restriction, but any department text the model typed is still resolved to
    canonical names. Without this, a free-text 'CSE' reaches the tool's own fuzzy ILIKE matching,
    which also matches the School of CSE's other departments - so the VC got different numbers
    for "CSE" than every other role."""
    text = ctx.args.get("department", "")
    if not text:
        return _rewrite(ctx, **trusted)
    names, denial = _resolve_all(ctx, [text])
    if denial:
        return denial
    return _rewrite(ctx, drop=("department",), scope_departments=names, **trusted)


def _unrestricted(ctx: _Ctx, fn_name: str) -> Decision:
    """Vice Chancellor / Admin: no scope limits, only canonical name resolution."""
    a = ctx.args
    if fn_name == "compare_entities":
        etype = str(a.get("entity_type", "department")).strip().lower()
        entities = a.get("entities") or []
        if etype == "department" and entities:
            names, denial = _resolve_all(ctx, entities)
            if denial:
                return denial
            return _rewrite(ctx, drop=("entities", "department"), scope_departments=names)
        if etype == "faculty":
            return _vc_or_dean_department_text(ctx)
        if etype == "institute" and entities:
            names, denial = _resolve_institutes_all(ctx, entities)
            if denial:
                return denial
            return Decision(True, {**a, "entities": names}, "", "rewrite", f"entities={names}")
        return _rewrite(ctx)
    if fn_name == "get_cross_department_collaboration":
        text_a, text_b = a.get("dept_a", ""), a.get("dept_b", "")
        if not text_a or not text_b:
            return _deny("Please name two departments to compare.")
        names_a, denial = _resolve_all(ctx, [text_a])
        if denial:
            return denial
        names_b, denial = _resolve_all(ctx, [text_b])
        if denial:
            return denial
        if len(names_a) != 1 or len(names_b) != 1:
            return _deny("Please name one specific department for each side of the comparison.")
        if names_a == names_b:
            return _deny("Please choose two different departments to compare.")
        return _rewrite(ctx, drop=("dept_a", "dept_b"), dept_a_scope=names_a[0], dept_b_scope=names_b[0])
    if fn_name == "get_institute_summary" and a.get("institute"):
        names, denial = _resolve_institutes_all(ctx, [a["institute"]])
        if denial:
            return denial
        return _rewrite(ctx, drop=("institute",), scope_institutes=names)
    if fn_name == "get_campus_stats":
        return _campus_stats(ctx)
    if fn_name == "get_department_stats" and not a.get("department"):
        return _deny("Please name a department or school.")
    return _vc_or_dean_department_text(ctx)


_RULES: dict[str, Callable[[_Ctx], Decision]] = {
    "get_faculty_stats": _individual,
    "search_publications_by_author": _individual,
    "get_department_stats": _department_stats,
    "count_qrank_publications": _publication_aggregate,
    "get_yearly_stats": _publication_aggregate,
    "get_qrank_distribution": _publication_aggregate,
    "get_top_journals": _publication_aggregate,
    "get_campus_stats": _campus_stats,
    "list_campus_publications": _no_scope,
    "get_institute_summary": _institute_summary,
    "get_university_overview": _no_scope,
    "get_department_trend": _department_trend,
    "get_inactive_faculty": _inactive_faculty,
    "get_campus_top_authors": _campus_top_authors,
    "get_top_cited_publications": _individual,
    "get_department_benchmark": _individual,
    "get_citations_by_year": _individual,
    "compare_entities": _compare,
    "get_author_concentration": _dean_cluster_single_dept,
    "get_growth_acceleration": _dean_cluster_single_dept,
    "get_cross_department_collaboration": _cross_department_collaboration,
}


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────

def allowed_tool_names(scope, user_message: str = "") -> frozenset[str]:
    return _TOOLS_BY_PERSONA.get(getattr(scope, "persona_id", None), frozenset())


def filter_tools(tools: list[dict], scope, user_message: str = "") -> list[dict]:
    """The tool schemas the model may see for this caller."""
    ok = allowed_tool_names(scope, user_message)
    return [t for t in tools if t["function"]["name"] in ok]


def authorize(scope, fn_name: str, fn_args: dict, user_message: str = "",
              directory: Optional[Directory] = None) -> Decision:
    """Decide whether `scope` may run tool `fn_name`, and with which (trusted) arguments."""
    persona = getattr(scope, "persona_id", None)
    try:
        if fn_name not in allowed_tool_names(scope, user_message):
            return _finish(scope, fn_name, _deny("That isn't available for your role."))
        try:
            args = sanitize_args(fn_name, fn_args)
        except BadArgument as err:
            return _finish(scope, fn_name, _deny(str(err)))
        ctx = _Ctx(scope, args, user_message, directory)
        if persona == "vice_chancellor":                       # VC / Admin: unrestricted, still whitelisted
            return _finish(scope, fn_name, _unrestricted(ctx, fn_name))
        return _finish(scope, fn_name, _RULES[fn_name](ctx))
    except GuardUnavailable:
        return _finish(scope, fn_name, _deny("Scope checks are temporarily unavailable. Please try again shortly.",
                                             "directory unavailable"))
    except Exception:  # noqa: BLE001 - never fall open
        log.exception("guard error persona=%s tool=%s", persona, fn_name)
        return _finish(scope, fn_name, _deny("This request couldn't be checked against your access, so it was not run.",
                                             "guard error"))


def _finish(scope, fn_name: str, decision: Decision) -> Decision:
    log.info("guard persona=%s user=%s tool=%s action=%s %s", getattr(scope, "persona_id", None),
             str(getattr(scope, "user_id", ""))[:8], fn_name, decision.action, decision.note)
    return decision
