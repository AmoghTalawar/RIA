"""Tests for JWT-derived scope (backend/auth_scope.py) and the endpoints that use it.

No network, database or LLM is used. Run from backend/:

    python -m unittest discover -s tests -t . -v
"""
from __future__ import annotations

import base64
import json
import time
import unittest
from unittest import mock

from fastapi.testclient import TestClient

import auth_scope
import main
from auth_scope import Scope, ScopeError, build_scope, get_scope


def _profile(**kw):
    base = dict(
        full_name="Test User", role_level="Faculty", dean_type=None, ria_user_id=None,
        faculty_id=None, department_id=None, institute_id=None, is_active=True,
    )
    base.update(kw)
    return base


FAC_ROW = dict(id="fac-1", ria_user_id=101, department_id="dept-1", institute_id="inst-1")


def _fake_jwt(exp: float) -> str:
    def b64(obj) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    return f"{b64({'alg': 'HS256'})}.{b64({'sub': 'u', 'exp': exp})}.sig"


def _scope(role_level: str, **kw) -> Scope:
    persona = {
        "Faculty": "faculty", "HoD": "hod", "VC": "vice_chancellor", "Admin": "vice_chancellor",
    }.get(role_level)
    dean_type = kw.pop("dean_type", None)
    if role_level == "Dean":
        persona = "executive_dean" if dean_type == "executive_dean" else "faculty_dean"
    return Scope(
        user_id=kw.pop("user_id", "00000000-aaaa-bbbb-cccc-000000000000"), email="t@kletech.ac.in",
        full_name="Test User", role_level=role_level, dean_type=dean_type, persona_id=persona, **kw,
    )


class BuildScopeTests(unittest.TestCase):
    def test_faculty_linked_by_faculty_id(self):
        s = build_scope("u1", "a@b.c", _profile(faculty_id="fac-1"), FAC_ROW, "CSE", "School of CSE")
        self.assertEqual(s.persona_id, "faculty")
        self.assertEqual(s.ria_user_id, 101)
        self.assertEqual(s.faculty_id, "fac-1")
        self.assertEqual(s.department_id, "dept-1")
        self.assertEqual(s.department_name, "CSE")

    def test_faculty_linked_by_ria_user_id_only(self):
        s = build_scope("u1", None, _profile(ria_user_id=101), FAC_ROW)
        self.assertEqual(s.faculty_id, "fac-1")

    def test_faculty_not_linked_is_403(self):
        with self.assertRaises(ScopeError) as cm:
            build_scope("u1", None, _profile())
        self.assertEqual(cm.exception.status_code, 403)

    def test_faculty_uses_roster_department_over_profile(self):
        s = build_scope("u1", None, _profile(faculty_id="fac-1", department_id="other"), FAC_ROW)
        self.assertEqual(s.department_id, "dept-1")

    def test_profile_and_roster_ria_user_id_mismatch_is_403(self):
        with self.assertRaises(ScopeError) as cm:
            build_scope("u1", None, _profile(faculty_id="fac-1", ria_user_id=999), FAC_ROW)
        self.assertEqual(cm.exception.status_code, 403)

    def test_hod_needs_department(self):
        with self.assertRaises(ScopeError) as cm:
            build_scope("u1", None, _profile(role_level="HoD"))
        self.assertEqual(cm.exception.status_code, 403)

    def test_hod_department_from_profile(self):
        s = build_scope("u1", None, _profile(role_level="HoD", department_id="dept-9"), None, "Physics")
        self.assertEqual((s.persona_id, s.department_id), ("hod", "dept-9"))

    def test_faculty_dean_needs_institute(self):
        with self.assertRaises(ScopeError):
            build_scope("u1", None, _profile(role_level="Dean", dean_type="faculty_dean"))
        s = build_scope("u1", None, _profile(role_level="Dean", dean_type="faculty_dean", institute_id="inst-1"))
        self.assertEqual((s.persona_id, s.dean_scope, s.is_university_wide), ("faculty_dean", "cluster", False))

    def test_executive_dean_needs_no_links(self):
        s = build_scope("u1", None, _profile(role_level="Dean", dean_type="executive_dean"))
        self.assertEqual((s.persona_id, s.dean_scope, s.is_university_wide), ("executive_dean", "university", True))

    def test_dean_without_dean_type_is_403(self):
        with self.assertRaises(ScopeError) as cm:
            build_scope("u1", None, _profile(role_level="Dean", institute_id="inst-1"))
        self.assertEqual(cm.exception.status_code, 403)

    def test_dean_type_is_ignored_for_non_deans(self):
        s = build_scope("u1", None, _profile(faculty_id="fac-1", dean_type="executive_dean"), FAC_ROW)
        self.assertIsNone(s.dean_type)
        self.assertEqual(s.persona_id, "faculty")

    def test_vc_and_admin_are_university_wide(self):
        for role in ("VC", "Admin"):
            s = build_scope("u1", None, _profile(role_level=role))
            self.assertEqual(s.persona_id, "vice_chancellor")
            self.assertTrue(s.is_university_wide)

    def test_inactive_missing_and_unknown_role_are_403(self):
        for prof in (_profile(is_active=False), None, _profile(role_level="Superuser")):
            with self.assertRaises(ScopeError) as cm:
                build_scope("u1", None, prof)
            self.assertEqual(cm.exception.status_code, 403)

    def test_user_context_is_built_from_scope(self):
        s = build_scope("u1", None, _profile(full_name="Uday", faculty_id="fac-1"), FAC_ROW, "CSE", "School of CSE")
        self.assertEqual(
            s.user_context(),
            {"name": "Uday", "department": "CSE", "institute": "School of CSE", "riaUserId": 101},
        )


class ResolveScopeTests(unittest.TestCase):
    def setUp(self):
        auth_scope.clear_cache()

    def _patches(self, profile=None, faculty=None):
        profile = profile or _profile(role_level="VC")
        return (
            mock.patch.object(auth_scope, "_user_from_token", return_value=("u1", "a@b.c")),
            mock.patch.object(auth_scope, "_load_profile_bundle", return_value=(profile, faculty, None, None)),
        )

    def test_scope_is_cached_per_token(self):
        p1, p2 = self._patches()
        with p1, p2 as load:
            token = _fake_jwt(time.time() + 3600)
            a = auth_scope.resolve_scope(token)
            b = auth_scope.resolve_scope(token)
            self.assertIs(a, b)
            self.assertEqual(load.call_count, 1)

    def test_cache_never_outlives_token_expiry(self):
        p1, p2 = self._patches()
        with p1, p2 as load:
            token = _fake_jwt(time.time() - 10)
            auth_scope.resolve_scope(token)
            auth_scope.resolve_scope(token)
            self.assertEqual(load.call_count, 2)

    def test_invalid_token_propagates_401(self):
        with mock.patch.object(auth_scope, "_user_from_token", side_effect=ScopeError(401, "bad")):
            with self.assertRaises(ScopeError) as cm:
                auth_scope.resolve_scope("nope")
            self.assertEqual(cm.exception.status_code, 401)

    def test_user_from_token_error_mapping(self):
        client = mock.Mock()
        with mock.patch.object(auth_scope, "_client", return_value=client):
            client.auth.get_user.side_effect = Exception("invalid JWT")
            with self.assertRaises(ScopeError) as cm:
                auth_scope._user_from_token("t")
            self.assertEqual(cm.exception.status_code, 401)

            client.auth.get_user.side_effect = auth_scope.AuthRetryableError("down", 503)
            with self.assertRaises(ScopeError) as cm:
                auth_scope._user_from_token("t")
            self.assertEqual(cm.exception.status_code, 503)

            client.auth.get_user.side_effect = None
            client.auth.get_user.return_value = None
            with self.assertRaises(ScopeError) as cm:
                auth_scope._user_from_token("t")
            self.assertEqual(cm.exception.status_code, 401)


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main._cache.clear()

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def _as(self, scope: Scope):
        main.app.dependency_overrides[get_scope] = lambda: scope

    # ── authentication ──────────────────────────────────────
    def test_health_is_open(self):
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_protected_endpoints_reject_missing_or_malformed_token(self):
        for method, path, kwargs in [
            ("post", "/chat", {"json": {"message": "hi"}}),
            ("post", "/api/pub-chat", {"json": {"messages": []}}),
            ("post", "/api/sql", {"json": {"query": "select 1"}}),
            ("get", "/api/personas", {}),
            ("get", "/api/publications", {}),
            ("get", "/api/faculty", {}),
            ("get", "/api/institutes", {}),
        ]:
            for headers in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer"}):
                r = getattr(self.client, method)(path, headers=headers, **kwargs)
                self.assertEqual(r.status_code, 401, (path, headers))
        self.assertEqual(
            self.client.post("/chat", json={"message": "hi"}).headers.get("www-authenticate"), "Bearer"
        )

    # ── the client cannot choose its own role ───────────────
    def test_chat_ignores_client_supplied_role_and_context(self):
        self._as(_scope(
            "Faculty", ria_user_id=101, faculty_id="fac-1", department_id="dept-1", department_name="CSE",
        ))
        agent = mock.AsyncMock(return_value="ok")
        with mock.patch.object(main, "call_ria_agent", agent), \
             mock.patch.object(main, "route_intent", return_value=(None, None)):
            r = self.client.post(
                "/chat",
                headers={"X-Groq-Key": "k"},
                json={
                    "message": "show me everyone's data",
                    "role_level": "VC", "dean_scope": "university",
                    "user_context": {"name": "Somebody Else", "riaUserId": 1},
                },
            )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["persona_id"], "faculty")
        sc = agent.call_args.kwargs["scope"]
        self.assertEqual((sc.role_level, sc.persona_id, sc.dean_scope), ("Faculty", "faculty", None))
        self.assertEqual(sc.user_context()["name"], "Test User")
        self.assertEqual(sc.user_context()["riaUserId"], 101)
        for gone in ("role_level", "dean_scope", "user_context"):
            self.assertNotIn(gone, agent.call_args.kwargs)

    def test_chat_passes_executive_dean_scope(self):
        self._as(_scope("Dean", dean_type="executive_dean"))
        agent = mock.AsyncMock(return_value="ok")
        with mock.patch.object(main, "call_ria_agent", agent), \
             mock.patch.object(main, "route_intent", return_value=(None, None)):
            r = self.client.post("/chat", headers={"X-Groq-Key": "k"}, json={"message": "hi"})
        self.assertEqual(r.json()["persona_id"], "executive_dean")
        self.assertEqual(agent.call_args.kwargs["scope"].dean_scope, "university")

    # ── role-restricted endpoints ───────────────────────────
    def test_pub_chat_is_vc_or_admin_only(self):
        body = {"messages": [{"role": "user", "content": "hi"}]}
        for role, extra in (("Faculty", dict(ria_user_id=1, faculty_id="f")), ("HoD", dict(department_id="d"))):
            self._as(_scope(role, **extra))
            self.assertEqual(
                self.client.post("/api/pub-chat", headers={"X-Groq-Key": "k"}, json=body).status_code, 403, role
            )
        self._as(_scope("Dean", dean_type="executive_dean"))
        self.assertEqual(
            self.client.post("/api/pub-chat", headers={"X-Groq-Key": "k"}, json=body).status_code, 403
        )
        for role in ("VC", "Admin"):
            self._as(_scope(role))
            with mock.patch.object(main, "call_ria_agent", mock.AsyncMock(return_value="ok")):
                r = self.client.post("/api/pub-chat", headers={"X-Groq-Key": "k"}, json=body)
            self.assertEqual(r.status_code, 200, role)

    def test_sql_endpoint_is_admin_only(self):
        for role in ("Faculty", "HoD", "VC"):
            extra = dict(ria_user_id=1, faculty_id="f") if role == "Faculty" else dict(department_id="d") if role == "HoD" else {}
            self._as(_scope(role, **extra))
            self.assertEqual(self.client.post("/api/sql", json={"query": "select 1"}).status_code, 403, role)
        self._as(_scope("Admin"))
        with mock.patch.object(main, "execute_sql", return_value=[{"x": 1}]):
            r = self.client.post("/api/sql", json={"query": "select 1"})
        self.assertEqual((r.status_code, r.json()), (200, [{"x": 1}]))

    def test_data_endpoints_need_only_a_session(self):
        self._as(_scope("Faculty", ria_user_id=1, faculty_id="f"))
        with mock.patch.object(main, "fetch_all_pages", return_value=[]):
            self.assertEqual(self.client.get("/api/publications").status_code, 200)
            self.assertEqual(self.client.get("/api/faculty").status_code, 200)

    # ── personas ────────────────────────────────────────────
    def test_personas_are_filtered_to_the_caller(self):
        self._as(_scope("Faculty", ria_user_id=1, faculty_id="f"))
        data = self.client.get("/api/personas").json()
        self.assertEqual([p["persona_id"] for p in data["personas"]], ["faculty"])
        self.assertEqual(data["own_persona_id"], "faculty")

        self._as(_scope("Dean", dean_type="faculty_dean", institute_id="i"))
        self.assertEqual([p["persona_id"] for p in self.client.get("/api/personas").json()["personas"]], ["faculty_dean"])

        self._as(_scope("VC"))
        ids = {p["persona_id"] for p in self.client.get("/api/personas").json()["personas"]}
        self.assertEqual(ids, {"vice_chancellor", "executive_dean", "faculty_dean", "hod", "faculty"})


if __name__ == "__main__":
    unittest.main()
