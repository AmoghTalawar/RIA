"""
persona_loader.py

Two drill-down paths now coexist, and this module supports both:

1. CONVERSATIONAL (default, built into persona_l1_vc.py):
   The VC's system prompt embeds all 4 lower lenses verbatim. The model
   decides on its own, mid-conversation, when to enter/exit a lens, guided
   by the DRILL-DOWN LENS PROTOCOL text baked into that prompt. No backend
   involvement beyond building the system prompt once via get_persona().

2. EXPLICIT / UI-DRIVEN (resolve_effective_persona + format_active_lens_context):
   If your frontend has an actual "view as..." dropdown/selector rather than
   relying on the VC typing a request in chat, use these instead of trusting
   the model to self-navigate. This path lets the backend force a specific
   lens + target deterministically, which is the safer option whenever the
   UI already knows exactly which department/cluster/faculty was selected.

Both paths converge on the same rule: whichever lens ends up active, the
resulting scope_filter (from persona["scope_filter"] or from
vc_persona["lens_registry"][lens_id]["scope_filter"]) must be bound to a real
target_id and enforced as an actual WHERE clause / RLS session variable
before any tool query runs. Neither the embedded prompt text nor this
module's bookkeeping is itself a security boundary — see the SECURITY NOTE
at the top of persona_l1_vc.py.

CHANGE LOG (this revision):
- get_persona() no longer silently defaults a missing dean_scope to 'cluster',
  and no longer silently returns VC when role_level is empty/None. Both now
  raise — a silent default here means a real Executive Dean could get
  downgraded to Faculty Dean scope with zero error signal.
- Added resolve_effective_persona() for the explicit/UI-driven path.
- Added format_active_lens_context() + get_lens() to support the VC's new
  embedded lens_registry: given a lens_id + target_id, produces the
  "ACTIVE LENS" line that build_system_prompt() will inject into
  CURRENT USER CONTEXT, which the drilldown protocol explicitly checks for
  as the trigger to enter that lens without waiting on the model to infer it
  from conversation.
"""

try:
    from .persona_l1_vc import PERSONA as _VC_RAW
    from .persona_l2_executive_dean import PERSONA as _L2_RAW
    from .persona_l3_faculty_dean import PERSONA as _L3_RAW
    from .persona_l4_hod import PERSONA as _L4_RAW
    from .persona_l5_faculty import FACULTY_PERSONA as _L5_RAW
except ImportError:
    from persona_l1_vc import PERSONA as _VC_RAW
    from persona_l2_executive_dean import PERSONA as _L2_RAW
    from persona_l3_faculty_dean import PERSONA as _L3_RAW
    from persona_l4_hod import PERSONA as _L4_RAW
    from persona_l5_faculty import FACULTY_PERSONA as _L5_RAW


def _assemble_lens_prompt(persona: dict) -> str:
    """Build a persona's full prompt text from its role/expertise/
    communication_style/ground_rules fields."""
    rules_block = "\n".join(f"- {r}" for r in persona.get("ground_rules", []))
    return (
        f"{persona.get('role', '')}\n\n"
        f"EXPERTISE:\n{persona.get('expertise', '')}\n\n"
        f"COMMUNICATION STYLE:\n{persona.get('communication_style', '')}\n\n"
        f"GROUND RULES:\n{rules_block}\n"
    )


# The persona_l*.py files hold only voice/guardrails/scope (role, expertise,
# communication_style, ground_rules, scope_filter, ...). Identity metadata and
# the assembled system_prompt are derived here so there is one definition of
# "a persona" for ria_agent / main / scope_guard to consume.
_META = {
    "faculty":        dict(role_level_db="Faculty", dashboard_route="/staff",            level_label="Faculty (L5)"),
    "hod":            dict(role_level_db="HoD",     dashboard_route="/hod",              level_label="Head of Department (L4)"),
    "faculty_dean":   dict(role_level_db="Dean",    dashboard_route="/faculty-dean",     level_label="Faculty Dean (L3)"),
    "executive_dean": dict(role_level_db="Dean",    dashboard_route="/executive-dean",   level_label="Executive Dean (L2)"),
    "vice_chancellor": dict(role_level_db="VC",     dashboard_route="/vc",               level_label="Vice Chancellor (L1)"),
}


def _finalize(persona_id: str, raw: dict) -> dict:
    """Return a copy of a raw persona dict with identity metadata and the
    assembled system_prompt filled in (never mutates the module-level dict)."""
    p = {**_META[persona_id], **raw, "persona_id": persona_id}
    prompt = _assemble_lens_prompt(raw)
    if raw.get("drilldown_protocol"):
        prompt += raw["drilldown_protocol"]
    p.setdefault("system_prompt", prompt)
    return p


FACULTY_PERSONA = _finalize("faculty", _L5_RAW)
HOD_PERSONA = _finalize("hod", _L4_RAW)
FACULTY_DEAN_PERSONA = _finalize("faculty_dean", _L3_RAW)
EXECUTIVE_DEAN_PERSONA = _finalize("executive_dean", _L2_RAW)
VC_PERSONA = _finalize("vice_chancellor", _VC_RAW)


class PersonaResolutionError(ValueError):
    """Raised when a role/scope combination can't be resolved to a persona.
    Deliberately NOT caught-and-defaulted anywhere in this module — a bad or
    missing role/scope value must surface as an error, not a silent downgrade
    or upgrade in access."""


class PersonaPermissionError(PermissionError):
    """Raised when an actor requests a view_as persona it is not permitted
    to impersonate."""


_REGISTRY = {
    ("Faculty", None): FACULTY_PERSONA,
    ("HoD", None): HOD_PERSONA,
    ("Dean", "cluster"): FACULTY_DEAN_PERSONA,
    ("Dean", "university"): EXECUTIVE_DEAN_PERSONA,
    ("VC", None): VC_PERSONA,
    ("Admin", None): VC_PERSONA,
}

_PERSONA_BY_ID = {
    "faculty": FACULTY_PERSONA,
    "hod": HOD_PERSONA,
    "faculty_dean": FACULTY_DEAN_PERSONA,
    "executive_dean": EXECUTIVE_DEAN_PERSONA,
    "vice_chancellor": VC_PERSONA,
}

_FRONTEND_ROLE_MAP = {
    "staff": ("Faculty", None), "faculty": ("Faculty", None), "l5": ("Faculty", None),
    "hod": ("HoD", None), "l4": ("HoD", None),
    "faculty-dean": ("Dean", "cluster"), "faculty_dean": ("Dean", "cluster"), "l3": ("Dean", "cluster"),
    "executive-dean": ("Dean", "university"), "executive_dean": ("Dean", "university"), "l2": ("Dean", "university"),
    "vc": ("VC", None), "university": ("VC", None),
    "vice-chancellor": ("VC", None), "vice_chancellor": ("VC", None), "l1": ("VC", None),
    "admin": ("Admin", None),
}


def get_persona(role_level: str | None, dean_scope: str | None = None) -> dict:
    """
    Resolve the persona config for a given role. Accepts DB role names
    ('Faculty', 'HoD', 'Dean', 'VC') or frontend role strings ('staff', 'hod',
    'faculty-dean', 'executive-dean', 'vc').

    Raises PersonaResolutionError on missing/unresolvable role_level, or a
    Dean role with no dean_scope — never silently defaults either.
    """
    if not role_level or not role_level.strip():
        raise PersonaResolutionError(
            "role_level is required — no default persona is granted for a "
            "missing role. Check that profiles.role_level is populated for "
            "this user before calling get_persona()."
        )

    clean_role = role_level.strip().lower()

    if clean_role in _FRONTEND_ROLE_MAP:
        mapped_role, mapped_scope = _FRONTEND_ROLE_MAP[clean_role]
        return _lookup(mapped_role, dean_scope or mapped_scope)

    return _lookup(role_level.strip(), dean_scope)


def _lookup(role_level: str, dean_scope: str | None) -> dict:
    is_dean = role_level.strip().lower() == "dean"

    if is_dean and not dean_scope:
        raise PersonaResolutionError(
            "role_level='Dean' requires dean_scope ('cluster' or 'university') "
            "to resolve to Faculty Dean vs Executive Dean. Refusing to guess — "
            "confirm profiles.dean_scope is populated for this user."
        )

    key = (role_level, dean_scope if is_dean else None)
    persona = _REGISTRY.get(key)
    if persona is not None:
        return persona

    raise PersonaResolutionError(
        f"No persona registered for role_level={role_level!r}, dean_scope={dean_scope!r}."
    )


def get_lens(lens_id: str) -> dict:
    """
    Look up a single lens definition from the VC's embedded lens_registry
    (persona_l1_vc.py). Use this for the explicit/UI-driven path when you
    need a lens's scope_filter or target_param without loading the whole
    mega-prompt.

    lens_id: one of 'executive_dean' | 'faculty_dean' | 'hod' | 'faculty'
             ('vice_chancellor' is not a lens of itself — use get_persona
             directly for that.)
    """
    registry = VC_PERSONA.get("lens_registry")
    if registry and lens_id in registry:
        return registry[lens_id]
    if lens_id in _PERSONA_BY_ID:
        return _PERSONA_BY_ID[lens_id]
    raise PersonaResolutionError(
        f"Unknown lens_id={lens_id!r}. Valid lenses: {list(_PERSONA_BY_ID.keys())}"
    )


def resolve_effective_persona(
    actor_role_level: str,
    actor_dean_scope: str | None = None,
    view_as: str | None = None,
    target_id: str | None = None,
) -> tuple[dict, dict]:
    """
    EXPLICIT / UI-DRIVEN path. Use when the frontend itself selects a lens
    (a dropdown, not free-text chat) and you want the backend to force that
    lens deterministically rather than relying on the model's own
    conversational drill-down inside persona_l1_vc.py's embedded prompt.

    actor_role_level / actor_dean_scope: who is actually logged in. The
        authority ceiling is that persona's own `can_impersonate` list.
    view_as: persona_id being requested (e.g. 'hod'). Omit to just resolve
        the actor's own persona.
    target_id: department_id / institute_id / faculty_id the borrowed view
        is scoped to. REQUIRED whenever view_as differs from the actor's own
        persona_id and that lens has a target_param (see get_lens()).

    Returns (persona_dict, view_info) where view_info = {"scope_target": ...}.
    Bind scope_target into the returned persona's scope_filter placeholders
    as a real query constraint or RLS session variable.
    """
    actor_persona = get_persona(actor_role_level, actor_dean_scope)

    if view_as is None or view_as == actor_persona["persona_id"]:
        return actor_persona, {"scope_target": None}

    if view_as not in actor_persona.get("can_impersonate", []):
        raise PersonaPermissionError(
            f"{actor_persona['persona_id']!r} is not permitted to view as "
            f"{view_as!r}. Allowed views: {actor_persona.get('can_impersonate', [])}"
        )

    if view_as not in _PERSONA_BY_ID:
        raise PersonaResolutionError(f"Unknown view_as persona_id: {view_as!r}")

    needs_target = view_as != "executive_dean"  # only lens with no target_param
    if needs_target and not target_id:
        raise ValueError(
            f"view_as={view_as!r} requires target_id (the department/cluster/"
            f"faculty id the borrowed view is scoped to) — an impersonated "
            f"view with no target must never default to unrestricted access."
        )

    return _PERSONA_BY_ID[view_as], {"scope_target": target_id}


def format_active_lens_context(lens_id: str, target_label: str) -> dict:
    """
    Build the CURRENT USER CONTEXT entry that tells the VC's embedded prompt
    which lens is already active, so the model enters it immediately instead
    of asking or inferring from conversation. Feed the returned dict into
    build_system_prompt(persona, user_context=...).

    lens_id: matches a key in VC_PERSONA["lens_registry"]
             ('executive_dean' | 'faculty_dean' | 'hod' | 'faculty')
    target_label: human-readable target for the announcement, e.g.
             'Mechanical Engineering' or 'Dr. Suresh Rao' — NOT used for
             query scoping, display only. Bind the real target_id separately
             via resolve_effective_persona()/get_lens() before running tools.
    """
    lens = get_lens(lens_id)
    return {"ACTIVE LENS": f"{lens['level_label']} — {target_label}"}


def list_all_personas() -> list[dict]:
    """Return all unique active personas with summary metadata for a UI picker."""
    unique = [FACULTY_PERSONA, HOD_PERSONA, FACULTY_DEAN_PERSONA, EXECUTIVE_DEAN_PERSONA, VC_PERSONA]
    return [
        {
            "persona_id": p["persona_id"],
            "level_label": p["level_label"],
            "dashboard_route": p["dashboard_route"],
            "objective": p.get("objective", ""),
            "key_metrics": p.get("key_metrics", []),
            "suggested_questions": p.get("suggested_questions") or [
                e["question"] for e in p.get("example_exchanges", []) if "question" in e
            ],
            "can_impersonate": p.get("can_impersonate", []),
        }
        for p in unique
    ]


def build_system_prompt(persona: dict, user_context: dict | None = None) -> str:
    """
    Combine the persona's system_prompt with lightweight runtime context.
    For the VC persona, pass format_active_lens_context(...) output here to
    force-enter a specific lens; the embedded protocol checks CURRENT USER
    CONTEXT for exactly this "ACTIVE LENS" key.
    """
    prompt = persona["system_prompt"]
    if user_context:
        context_lines = "\n".join(f"- {k}: {v}" for k, v in user_context.items())
        prompt += f"\n\nCURRENT USER CONTEXT:\n{context_lines}\n"
    return prompt


def get_scope_filter(persona: dict) -> dict:
    """Returns the data-scope filter to apply BEFORE any tool executes a query."""
    return persona["scope_filter"]


if __name__ == "__main__":
    for role, scope in [("Faculty", None), ("HoD", None), ("Dean", "cluster"), ("Dean", "university"), ("VC", None)]:
        p = get_persona(role, scope)
        print(f"{role:10} scope={str(scope):12} -> persona_id={p['persona_id']}")

    print()

    # Explicit/UI-driven path
    persona, view = resolve_effective_persona(actor_role_level="VC", view_as="hod", target_id="dept-mech-uuid-123")
    print(f"[explicit] VC viewing as -> persona_id={persona['persona_id']} target={view['scope_target']}")

    # Conversational path — force-enter via ACTIVE LENS context
    ctx = format_active_lens_context("hod", "Mechanical Engineering")
    vc_prompt = build_system_prompt(VC_PERSONA, user_context=ctx)
    print(f"[conversational] injected context line: {ctx}")
    assert f"ACTIVE LENS: {get_lens('hod')['level_label']} — Mechanical Engineering" in vc_prompt
    print("ACTIVE LENS context correctly injected into VC system prompt.")

    # Guardrails still hold
    try:
        resolve_effective_persona(actor_role_level="Faculty", view_as="hod", target_id="dept-mech-uuid-123")
    except PersonaPermissionError as e:
        print(f"Faculty impersonation correctly blocked: {e}")

    try:
        get_persona("Dean", None)
    except PersonaResolutionError as e:
        print(f"Missing dean_scope correctly raised: {e}")

    # DRY check — if drilldown protocol is present
    if "drilldown_protocol" in _VC_RAW:
        assert FACULTY_PERSONA["system_prompt"] in VC_PERSONA["system_prompt"]
        print("DRY check passed: L5 prompt embedded in L1 matches persona_l5_faculty.py exactly.")