"""JWT verification and per-request scope for the RIA backend.

Design A: identity and role come ONLY from a verified Supabase access token and
the caller's row in ria.profiles. Nothing the client sends in a request body
(role_level, dean_scope, user_context, ...) is trusted.

    Authorization: Bearer <supabase access token>
        -> auth.get_user(token)            (GoTrue validates signature + expiry)
        -> ria.profiles (service role)     (role, dean_type, department, institute, faculty)
        -> Scope                           (frozen, cached ~60 s per token)

Fails closed:
    401  no / malformed / invalid / expired token
    403  no profile, inactive profile, unknown role, Dean without dean_type,
         or a profile that lacks the link its role needs
    503  the auth service is unreachable

Use `get_scope` as a FastAPI dependency, or `require_roles("VC", "Admin")` to
also restrict an endpoint to certain DB roles.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

import httpx
from fastapi import Depends, Header, HTTPException
from supabase import ClientOptions, create_client

from persona.persona_loader import PersonaResolutionError, get_persona

try:  # package was renamed gotrue -> supabase_auth
    from supabase_auth.errors import AuthRetryableError
except ImportError:  # pragma: no cover
    try:
        from gotrue.errors import AuthRetryableError  # type: ignore
    except ImportError:
        class AuthRetryableError(Exception):  # type: ignore
            pass

log = logging.getLogger("ria.auth")

TOKEN_CACHE_TTL = 60.0        # seconds; profile changes apply within this window
_CACHE_MAX_ENTRIES = 512

ROLE_LEVELS = ("Faculty", "HoD", "Dean", "VC", "Admin")
DEAN_TYPES = ("faculty_dean", "executive_dean")


class ScopeError(Exception):
    """Raised while resolving a scope; carries the HTTP status to return."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass(frozen=True)
class Scope:
    user_id: str
    email: Optional[str]
    full_name: str
    role_level: str                  # Faculty | HoD | Dean | VC | Admin
    dean_type: Optional[str]         # faculty_dean | executive_dean | None
    persona_id: str                  # faculty | hod | faculty_dean | executive_dean | vice_chancellor
    faculty_id: Optional[str] = None
    ria_user_id: Optional[int] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    institute_id: Optional[str] = None
    institute_name: Optional[str] = None
    author_name: Optional[str] = None     # name on the faculty roster (may differ from the profile's full_name)

    @property
    def dean_scope(self) -> Optional[str]:
        """'university' | 'cluster' | None — the value persona_loader expects for Deans."""
        if self.role_level != "Dean":
            return None
        return "university" if self.dean_type == "executive_dean" else "cluster"

    @property
    def is_university_wide(self) -> bool:
        return self.persona_id in ("executive_dean", "vice_chancellor")

    def user_context(self) -> dict[str, Any]:
        """Prompt context built server-side (replaces the client-supplied one)."""
        ctx: dict[str, Any] = {"name": self.full_name}
        if self.department_name:
            ctx["department"] = self.department_name
        if self.institute_name:
            ctx["institute"] = self.institute_name
        if self.ria_user_id is not None:
            ctx["riaUserId"] = self.ria_user_id
        return ctx


# ─────────────────────────────────────────────────────────────
# Building a Scope from database rows (pure, unit-tested)
# ─────────────────────────────────────────────────────────────

_LINK_HELP = "Ask an administrator to link your account (see supabase/link_profiles_to_faculty.sql)."


def build_scope(
    user_id: str,
    email: Optional[str],
    profile: Optional[dict],
    faculty: Optional[dict] = None,
    department_name: Optional[str] = None,
    institute_name: Optional[str] = None,
) -> Scope:
    if not profile:
        raise ScopeError(403, "No RIA profile exists for this account. Ask an administrator to create one.")
    if profile.get("is_active") is False:
        raise ScopeError(403, "This account is inactive.")

    role_level = profile.get("role_level")
    if role_level not in ROLE_LEVELS:
        raise ScopeError(403, f"Unrecognised role {role_level!r} on this profile.")

    dean_type = profile.get("dean_type")
    if role_level == "Dean" and dean_type not in DEAN_TYPES:
        raise ScopeError(
            403,
            "This Dean profile has no dean_type (faculty_dean or executive_dean). Ask an administrator to set it.",
        )
    if role_level != "Dean":
        dean_type = None

    dean_scope = None
    if role_level == "Dean":
        dean_scope = "university" if dean_type == "executive_dean" else "cluster"
    try:
        persona_id = get_persona(role_level=role_level, dean_scope=dean_scope)["persona_id"]
    except PersonaResolutionError as err:
        raise ScopeError(403, str(err)) from err

    faculty = faculty or {}
    profile_ria = profile.get("ria_user_id")
    faculty_ria = faculty.get("ria_user_id")
    if profile_ria is not None and faculty_ria is not None and int(profile_ria) != int(faculty_ria):
        raise ScopeError(403, "This profile's ria_user_id does not match its linked faculty record. " + _LINK_HELP)

    ria_user_id = faculty_ria if faculty_ria is not None else profile_ria
    faculty_id = profile.get("faculty_id") or faculty.get("id")

    # Faculty: the roster row is the source of truth. HoD / Dean: the profile is.
    if role_level == "Faculty":
        department_id = faculty.get("department_id") or profile.get("department_id")
        institute_id = faculty.get("institute_id") or profile.get("institute_id")
    else:
        department_id = profile.get("department_id") or faculty.get("department_id")
        institute_id = profile.get("institute_id") or faculty.get("institute_id")

    if role_level == "Faculty" and (ria_user_id is None or not faculty_id):
        raise ScopeError(403, "This Faculty profile is not linked to a faculty record. " + _LINK_HELP)
    if role_level == "HoD" and not department_id:
        raise ScopeError(403, "This HoD profile has no department. " + _LINK_HELP)
    if persona_id == "faculty_dean" and not institute_id:
        raise ScopeError(403, "This Faculty Dean profile has no institute. " + _LINK_HELP)

    return Scope(
        user_id=str(user_id),
        email=email,
        full_name=(profile.get("full_name") or email or "").strip(),
        role_level=role_level,
        dean_type=dean_type,
        persona_id=persona_id,
        faculty_id=str(faculty_id) if faculty_id else None,
        ria_user_id=int(ria_user_id) if ria_user_id is not None else None,
        department_id=str(department_id) if department_id else None,
        department_name=department_name,
        institute_id=str(institute_id) if institute_id else None,
        institute_name=institute_name,
        author_name=(faculty.get("author_name") or None),
    )


# ─────────────────────────────────────────────────────────────
# Supabase access (isolated so tests can patch them)
# ─────────────────────────────────────────────────────────────

_sb = None
_sb_lock = threading.Lock()


def _client():
    """Service-role client on the ria schema. Also validates access tokens."""
    global _sb
    with _sb_lock:
        if _sb is None:
            url = os.environ["SUPABASE_URL"]
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"]
            _sb = create_client(url, key, options=ClientOptions(schema="ria"))
        return _sb


def _user_from_token(token: str) -> tuple[str, Optional[str]]:
    """Validate the access token with GoTrue. Returns (user_id, email)."""
    try:
        resp = _client().auth.get_user(token)
    except (AuthRetryableError, httpx.HTTPError) as err:
        log.error("auth service unreachable: %s", err)
        raise ScopeError(503, "Authentication service is unavailable. Try again shortly.") from err
    except Exception as err:  # noqa: BLE001 — invalid / expired / revoked token
        log.info("token rejected: %s", type(err).__name__)
        raise ScopeError(401, "Invalid or expired session. Please sign in again.") from err
    user = getattr(resp, "user", None) if resp else None
    if not user or not getattr(user, "id", None):
        raise ScopeError(401, "Invalid or expired session. Please sign in again.")
    return str(user.id), getattr(user, "email", None)


def _rows(resp) -> list[dict]:
    data = getattr(resp, "data", None)
    return data if isinstance(data, list) else []


def _load_profile_bundle(user_id: str) -> tuple[Optional[dict], Optional[dict], Optional[str], Optional[str]]:
    """(profile, faculty, department_name, institute_name) for one auth user."""
    sb = _client()
    try:
        prof_rows = _rows(
            sb.table("profiles")
            .select("full_name,role_level,dean_type,ria_user_id,faculty_id,department_id,institute_id,is_active")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        profile = prof_rows[0] if prof_rows else None
        if profile is None:
            return None, None, None, None

        faculty = None
        if profile.get("faculty_id"):
            fac_q = sb.table("faculty").select("id,author_name,ria_user_id,department_id,institute_id").eq("id", profile["faculty_id"])
        elif profile.get("ria_user_id") is not None:
            fac_q = sb.table("faculty").select("id,author_name,ria_user_id,department_id,institute_id").eq("ria_user_id", profile["ria_user_id"])
        else:
            fac_q = None
        if fac_q is not None:
            fac_rows = _rows(fac_q.limit(1).execute())
            faculty = fac_rows[0] if fac_rows else None

        department_id = (faculty or {}).get("department_id") if profile.get("role_level") == "Faculty" else None
        department_id = department_id or profile.get("department_id") or (faculty or {}).get("department_id")
        institute_id = (faculty or {}).get("institute_id") if profile.get("role_level") == "Faculty" else None
        institute_id = institute_id or profile.get("institute_id") or (faculty or {}).get("institute_id")

        department_name = institute_name = None
        if department_id:
            rows = _rows(sb.table("departments").select("name").eq("id", department_id).limit(1).execute())
            department_name = rows[0]["name"] if rows else None
        if institute_id:
            rows = _rows(sb.table("institutes").select("name").eq("id", institute_id).limit(1).execute())
            institute_name = rows[0]["name"] if rows else None
        return profile, faculty, department_name, institute_name
    except (httpx.HTTPError, ConnectionError, TimeoutError) as err:
        log.error("profile lookup failed: %s", err)
        raise ScopeError(503, "Profile service is unavailable. Try again shortly.") from err


# ─────────────────────────────────────────────────────────────
# Token -> Scope, with a short cache
# ─────────────────────────────────────────────────────────────

_cache: dict[str, tuple[Scope, float]] = {}
_cache_lock = threading.Lock()


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _jwt_exp(token: str) -> Optional[float]:
    """`exp` claim, read WITHOUT verifying — used only to cap the cache lifetime."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        exp = json.loads(base64.urlsafe_b64decode(payload)).get("exp")
        return float(exp) if exp is not None else None
    except Exception:  # noqa: BLE001
        return None


def resolve_scope(token: str) -> Scope:
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[1] > now:
            return hit[0]

    user_id, email = _user_from_token(token)
    profile, faculty, dept_name, inst_name = _load_profile_bundle(user_id)
    scope = build_scope(user_id, email, profile, faculty, dept_name, inst_name)

    expires = now + TOKEN_CACHE_TTL
    exp = _jwt_exp(token)
    if exp is not None:
        expires = min(expires, exp)
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX_ENTRIES:
            for k in [k for k, (_, e) in _cache.items() if e <= now]:
                _cache.pop(k, None)
            if len(_cache) >= _CACHE_MAX_ENTRIES:
                _cache.clear()
        _cache[key] = (scope, expires)
    log.info("scope resolved: user=%s role=%s persona=%s", scope.user_id[:8], scope.role_level, scope.persona_id)
    return scope


# ─────────────────────────────────────────────────────────────
# FastAPI dependencies
# ─────────────────────────────────────────────────────────────

def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise ScopeError(401, "Authentication required.")
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise ScopeError(401, "Authentication required.")
    return parts[1].strip()


def get_scope(authorization: Optional[str] = Header(default=None)) -> Scope:
    """FastAPI dependency: the verified Scope of the caller, or 401/403/503."""
    try:
        return resolve_scope(_bearer_token(authorization))
    except ScopeError as err:
        headers = {"WWW-Authenticate": "Bearer"} if err.status_code == 401 else None
        raise HTTPException(status_code=err.status_code, detail=err.message, headers=headers) from err


def require_roles(*role_levels: str) -> Callable[..., Scope]:
    """Dependency factory: like get_scope, but only for the given DB role levels."""
    allowed = set(role_levels)

    def _dep(scope: Scope = Depends(get_scope)) -> Scope:
        if scope.role_level not in allowed:
            raise HTTPException(status_code=403, detail="Your role does not have access to this resource.")
        return scope

    return _dep
