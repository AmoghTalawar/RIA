"""Live checks of design A against the LOCAL Supabase stack (supabase start).

Real sign-ins, real JWTs, real database: the backend runs its real `get_scope`
(no dependency overrides). Only the LLM call is mocked. Skipped unless RIA_LIVE=1,
so the offline suite (`test_auth_scope.py`) stays offline.

Needs, in backend/.env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
the migration 20260924000000_scope_hardening.sql applied, and the demo users from
scripts/create_auth_users.mjs with their profiles linked
(supabase/link_profiles_to_faculty.sql).

    $env:RIA_LIVE = "1"; python -m unittest tests.test_live_local -v      # from backend/
"""
from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest import mock

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

LIVE = os.environ.get("RIA_LIVE") == "1"
URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:55321").rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
SERVICE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PASSWORD = "KLE@2026"  # local demo password from scripts/create_auth_users.mjs

USERS = {
    "faculty": "uday.kulkarni@kletech.ac.in",
    "hod": "narayan.dg@kletech.ac.in",
    "faculty_dean": "vijayalaxmi.m@kletech.ac.in",
    "executive_dean": "tewari.pg@kletech.ac.in",
    "vc": "uma.mudengudi@kletech.ac.in",
}


def _rest(key: str, token: str | None = None, write: bool = False) -> dict:
    h = {"apikey": key, "Authorization": f"Bearer {token or key}", "Content-Type": "application/json"}
    h["Content-Profile" if write else "Accept-Profile"] = "ria"
    return h


def _sign_in(email: str) -> str:
    r = httpx.post(
        f"{URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": PASSWORD}, timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


@unittest.skipUnless(LIVE, "set RIA_LIVE=1 to run against the local Supabase stack")
class LiveScopeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import auth_scope
        import main
        from fastapi.testclient import TestClient

        assert SERVICE, "SUPABASE_SERVICE_ROLE_KEY is not set in backend/.env"
        cls.auth_scope, cls.main = auth_scope, main
        cls.client = TestClient(main.app)
        cls.tok = {name: _sign_in(email) for name, email in USERS.items()}

    def setUp(self):
        self.auth_scope.clear_cache()
        self.main._cache.clear()

    def _get(self, path, who=None, token=None, **kw):
        t = token or (self.tok[who] if who else None)
        return self.client.get(path, headers={"Authorization": f"Bearer {t}"} if t else {}, **kw)

    def _post(self, path, who=None, token=None, **kw):
        t = token or (self.tok[who] if who else None)
        headers = kw.pop("headers", {})
        if t:
            headers["Authorization"] = f"Bearer {t}"
        return self.client.post(path, headers=headers, **kw)

    def _profile_id(self, email: str) -> str:
        r = httpx.get(f"{URL}/auth/v1/admin/users", headers={"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"},
                      params={"per_page": 200}, timeout=20)
        r.raise_for_status()
        return next(u["id"] for u in r.json()["users"] if u["email"] == email)

    def _service_patch_profile(self, uid: str, patch: dict):
        r = httpx.patch(f"{URL}/rest/v1/profiles?id=eq.{uid}", headers={**_rest(SERVICE, write=True), "Prefer": "return=representation"},
                        json=patch, timeout=20)
        r.raise_for_status()
        return r.json()

    # ── database hardening ──────────────────────────────────
    def test_exec_sql_is_service_role_only(self):
        body = {"query_text": "select 1 as x"}
        anon = httpx.post(f"{URL}/rest/v1/rpc/exec_sql", headers=_rest(ANON), json=body, timeout=20)
        self.assertIn(anon.status_code, (401, 403, 404), anon.text)
        authed = httpx.post(f"{URL}/rest/v1/rpc/exec_sql", headers=_rest(ANON, self.tok["faculty"]), json=body, timeout=20)
        self.assertIn(authed.status_code, (401, 403, 404), authed.text)
        svc = httpx.post(f"{URL}/rest/v1/rpc/exec_sql", headers=_rest(SERVICE), json=body, timeout=20)
        self.assertEqual(svc.status_code, 200, svc.text)

    def test_views_run_with_callers_rights(self):
        q = ("select relname, reloptions::text as o from pg_class where relnamespace='ria'::regnamespace "
             "and relname in ('v_faculty_full','v_pub_faculty','v_institute_summary')")
        r = httpx.post(f"{URL}/rest/v1/rpc/exec_sql", headers=_rest(SERVICE), json={"query_text": q}, timeout=20)
        self.assertEqual(r.status_code, 200, r.text)
        rows = r.json()
        self.assertEqual(len(rows), 3)
        for row in rows:
            self.assertIn("security_invoker=true", row["o"], row)

    def test_user_cannot_promote_or_relocate_themselves(self):
        uid = self._profile_id(USERS["faculty"])
        for patch in ({"role_level": "VC"}, {"dean_type": "executive_dean"}, {"is_active": False},
                      {"ria_user_id": 1}, {"faculty_id": None}, {"department_id": None}):
            r = httpx.patch(f"{URL}/rest/v1/profiles?id=eq.{uid}", headers={**_rest(ANON, self.tok["faculty"], write=True), "Prefer": "return=representation"},
                            json=patch, timeout=20)
            self.assertGreaterEqual(r.status_code, 400, (patch, r.text))
            self.assertIn("42501", r.text, (patch, r.text))
        row = httpx.get(f"{URL}/rest/v1/profiles?id=eq.{uid}&select=role_level,is_active,ria_user_id,faculty_id",
                        headers=_rest(SERVICE), timeout=20).json()[0]
        self.assertEqual((row["role_level"], row["is_active"], row["ria_user_id"]), ("Faculty", True, 232730))
        self.assertIsNotNone(row["faculty_id"])

    def test_user_can_still_edit_harmless_columns(self):
        uid = self._profile_id(USERS["faculty"])
        orig = httpx.get(f"{URL}/rest/v1/profiles?id=eq.{uid}&select=full_name", headers=_rest(SERVICE), timeout=20).json()[0]["full_name"]
        try:
            r = httpx.patch(f"{URL}/rest/v1/profiles?id=eq.{uid}", headers={**_rest(ANON, self.tok["faculty"], write=True), "Prefer": "return=representation"},
                            json={"full_name": orig + " "}, timeout=20)
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(len(r.json()), 1, "RLS or trigger blocked a harmless self-update")
        finally:
            self._service_patch_profile(uid, {"full_name": orig})

    def test_user_cannot_insert_profiles(self):
        r = httpx.post(f"{URL}/rest/v1/profiles", headers={**_rest(ANON, self.tok["faculty"], write=True), "Prefer": "return=minimal"},
                       json={"id": "00000000-0000-0000-0000-00000000dead", "full_name": "x", "role_level": "VC"}, timeout=20)
        self.assertGreaterEqual(r.status_code, 400, r.text)

    # ── backend, real tokens ────────────────────────────────
    def test_scope_for_each_demo_user(self):
        expect = {
            "faculty": ("faculty", "Faculty", None, 232730, "Computer Science and Engineering"),
            "hod": ("hod", "HoD", None, 232716, "Computer Science and Engineering"),
            "faculty_dean": ("faculty_dean", "Dean", "cluster", 232696, "Computer Science and Engineering"),
            "executive_dean": ("executive_dean", "Dean", "university", 232858, "Mechanical Engineering"),
            "vc": ("vice_chancellor", "VC", None, 232799, "Electronics and Communication Engineering"),
        }
        for who, (persona, role, dean_scope, ria, dept) in expect.items():
            s = self.auth_scope.resolve_scope(self.tok[who])
            self.assertEqual((s.persona_id, s.role_level, s.dean_scope, s.ria_user_id, s.department_name), (persona, role, dean_scope, ria, dept), who)
        fd = self.auth_scope.resolve_scope(self.tok["faculty_dean"])
        self.assertEqual(fd.institute_name, "School of Computer Science and Engineering")

    def test_bad_tokens_are_401(self):
        for r in (self._get("/api/personas"), self._get("/api/personas", token="garbage"),
                  self._get("/api/personas", token=self.tok["faculty"][:-6] + "AAAAAA"),
                  self._post("/chat", token="garbage", json={"message": "hi"})):
            self.assertEqual(r.status_code, 401, r.text)
        # the anon key is a valid JWT but not a user session
        self.assertEqual(self._get("/api/personas", token=ANON).status_code, 401)

    def test_personas_endpoint_per_user(self):
        for who, own, count in (("faculty", "faculty", 1), ("hod", "hod", 1), ("faculty_dean", "faculty_dean", 1),
                                ("executive_dean", "executive_dean", 1), ("vc", "vice_chancellor", 5)):
            r = self._get("/api/personas", who)
            self.assertEqual(r.status_code, 200, (who, r.text))
            d = r.json()
            self.assertEqual((d["own_persona_id"], len(d["personas"])), (own, count), who)

    def test_forged_role_in_body_is_ignored(self):
        agent = mock.AsyncMock(return_value="ok")
        with mock.patch.object(self.main, "call_ria_agent", agent), mock.patch.object(self.main, "route_intent", return_value=(None, None)):
            r = self._post("/chat", "faculty", headers={"X-Groq-Key": "k"}, json={
                "message": "list every faculty member's citations", "role_level": "VC", "dean_scope": "university",
                "user_context": {"name": "Dr. Uma Mudenagudi", "riaUserId": 232799},
            })
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["persona_id"], "faculty")
        sc = agent.call_args.kwargs["scope"]
        self.assertEqual((sc.role_level, sc.dean_scope), ("Faculty", None))
        self.assertEqual(sc.user_context()["riaUserId"], 232730)
        self.assertEqual(sc.user_context()["name"], "Uday Kulkarni")

    def test_role_restricted_endpoints(self):
        body = {"messages": [{"role": "user", "content": "hi"}]}
        for who in ("faculty", "hod", "faculty_dean", "executive_dean"):
            self.assertEqual(self._post("/api/pub-chat", who, headers={"X-Groq-Key": "k"}, json=body).status_code, 403, who)
        with mock.patch.object(self.main, "call_ria_agent", mock.AsyncMock(return_value="ok")):
            self.assertEqual(self._post("/api/pub-chat", "vc", headers={"X-Groq-Key": "k"}, json=body).status_code, 200)
        for who in USERS:
            self.assertEqual(self._post("/api/sql", who, json={"query": "select 1"}).status_code, 403, who)

    def test_inactive_profile_is_403_then_recovers(self):
        uid = self._profile_id(USERS["hod"])
        self._service_patch_profile(uid, {"is_active": False})
        try:
            self.auth_scope.clear_cache()
            r = self._get("/api/personas", "hod")
            self.assertEqual(r.status_code, 403, r.text)
            self.assertIn("inactive", r.json()["detail"].lower())
        finally:
            self._service_patch_profile(uid, {"is_active": True})
        self.auth_scope.clear_cache()
        self.assertEqual(self._get("/api/personas", "hod").status_code, 200)

    def test_unlinked_faculty_is_403_then_recovers(self):
        uid = self._profile_id(USERS["faculty"])
        before = httpx.get(f"{URL}/rest/v1/profiles?id=eq.{uid}&select=faculty_id,ria_user_id,department_id,institute_id",
                           headers=_rest(SERVICE), timeout=20).json()[0]
        self._service_patch_profile(uid, {"faculty_id": None, "ria_user_id": None})
        try:
            self.auth_scope.clear_cache()
            r = self._get("/api/personas", "faculty")
            self.assertEqual(r.status_code, 403, r.text)
            self.assertIn("not linked", r.json()["detail"])
        finally:
            self._service_patch_profile(uid, before)
        self.auth_scope.clear_cache()
        self.assertEqual(self._get("/api/personas", "faculty").status_code, 200)

    def test_hod_without_department_is_403_then_recovers(self):
        uid = self._profile_id(USERS["hod"])
        before = httpx.get(f"{URL}/rest/v1/profiles?id=eq.{uid}&select=faculty_id,ria_user_id,department_id,institute_id",
                           headers=_rest(SERVICE), timeout=20).json()[0]
        self._service_patch_profile(uid, {"department_id": None, "faculty_id": None, "ria_user_id": None})
        try:
            self.auth_scope.clear_cache()
            self.assertEqual(self._get("/api/personas", "hod").status_code, 403)
        finally:
            self._service_patch_profile(uid, before)


@unittest.skipUnless(LIVE, "set RIA_LIVE=1 to run against the local Supabase stack")
class LiveToolGuardTests(unittest.TestCase):
    """Real scopes, real tools, real data: what each persona's tool calls actually return."""

    DRILL = "Drill down to faculty level for School of Sciences"

    @classmethod
    def setUpClass(cls):
        import asyncio
        import json
        import auth_scope
        import ria_agent
        import scope_guard

        cls.asyncio, cls.json, cls.ria_agent, cls.scope_guard = asyncio, json, ria_agent, scope_guard
        auth_scope.clear_cache()
        scope_guard.clear_directory_cache()
        cls.scope = {n: auth_scope.resolve_scope(_sign_in(e)) for n, e in USERS.items()}
        cls.directory = scope_guard.get_directory()
        r = httpx.get(f"{URL}/rest/v1/faculty?select=author_name&limit=2000", headers=_rest(SERVICE), timeout=30)
        r.raise_for_status()
        cls.roster = {x["author_name"] for x in r.json() if x.get("author_name") and len(x["author_name"]) > 5}

    def tool(self, who, name, args, msg=""):
        raw = self.asyncio.run(self.ria_agent._run_tool(name, args, self.scope[who], msg))
        return raw, self.json.loads(raw)

    def leaked(self, raw, allowed=()):
        return sorted(n for n in self.roster if n in raw and n not in allowed)

    def school_departments(self, institute_name):
        inst = next(i for i in self.directory.institutes if i.name == institute_name)
        return [d.name for d in self.directory.departments if d.institute_id == inst.id]

    def test_directory_matches_the_database(self):
        self.assertGreaterEqual(len(self.directory.departments), 40)
        self.assertEqual(len(self.directory.institutes), 8)
        self.assertIn("Computer Science and Engineering", {d.name for d in self.directory.departments})
        self.assertTrue(self.school_departments("School of Computer Science and Engineering"))

    # ── Faculty ─────────────────────────────────────────────
    def test_faculty_sees_only_themselves(self):
        raw, out = self.tool("faculty", "get_faculty_stats", {"faculty_name": "Uday Kulkarni"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(out["data"]["name"], "Uday Kulkarni")
        self.assertEqual(self.leaked(raw, {"Uday Kulkarni"}), [])
        raw, out = self.tool("faculty", "get_faculty_stats", {"faculty_name": "Narayan D G"})
        self.assertEqual(out["status"], "forbidden", raw)
        self.assertEqual(self.leaked(raw, {"Uday Kulkarni"}), [])
        raw, out = self.tool("faculty", "get_faculty_stats", {"faculty_name": "Narayan D G", "ria_user_id": 232730})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_faculty_publications_are_their_own(self):
        raw, out = self.tool("faculty", "search_publications_by_author", {"author_name": "Uday Kulkarni", "limit": 5})
        self.assertEqual(out["status"], "success", raw)
        self.assertGreater(out["count"], 0)
        raw, out = self.tool("faculty", "search_publications_by_author", {"author_name": "Narayan D G"})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_faculty_department_and_university_figures(self):
        raw, out = self.tool("faculty", "get_department_stats", {"department": ""})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(out["department_resolved"], "Computer Science and Engineering")
        self.assertFalse([k for k in out if k.startswith("top_")])
        self.assertEqual(self.leaked(raw), [], "department figures must carry no names")
        self.assertEqual(self.tool("faculty", "get_department_stats", {"department": "Physics"})[1]["status"], "forbidden")
        self.assertEqual(self.tool("faculty", "compare_entities", {"entity_type": "faculty"})[1]["status"], "forbidden")
        out = self.tool("faculty", "count_qrank_publications", {"qrank": "Q1"})[1]
        self.assertEqual(out["status"], "success")
        self.assertGreater(out["count"], 0)

    # ── HoD ─────────────────────────────────────────────────
    def test_hod_individuals_are_limited_to_the_department(self):
        raw, out = self.tool("hod", "get_faculty_stats", {"faculty_name": "Uday Kulkarni"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(out["data"]["department"], "Computer Science and Engineering")
        raw, out = self.tool("hod", "get_faculty_stats", {"faculty_name": "Girish Narayanrao Desai"})   # Chemical Engineering
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("hod", "search_publications_by_author", {"author_name": "Girish Narayanrao Desai"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("hod", "search_publications_by_author", {"author_name": "Uday Kulkarni", "limit": 3})
        self.assertEqual(out["status"], "success", raw)

    def test_hod_names_only_for_own_department(self):
        raw, out = self.tool("hod", "get_department_stats", {"department": "CSE"})
        self.assertEqual(out["status"], "success", raw)
        self.assertTrue(out["top_5_by_citations"])
        raw, out = self.tool("hod", "get_department_stats", {"department": "Physics"})
        self.assertEqual(out["status"], "success", raw)
        self.assertFalse([k for k in out if k.startswith("top_")])
        self.assertEqual(self.leaked(raw), [])

    def test_hod_faculty_ranking_stays_in_the_department(self):
        raw, out = self.tool("hod", "compare_entities", {"entity_type": "faculty", "department": "Physics", "top_n": 10})
        self.assertEqual(out["status"], "success", raw)
        self.assertTrue(out["data"])
        self.assertEqual({r["department"] for r in out["data"]}, {"Computer Science and Engineering"})
        raw, out = self.tool("hod", "compare_entities", {"entity_type": "department", "top_n": 5})
        self.assertEqual(out["status"], "success", raw)
        self.assertGreater(len(out["data"]), 1)
        self.assertEqual(self.leaked(raw), [])

    # ── Faculty Dean ────────────────────────────────────────
    def test_faculty_dean_is_confined_to_the_school(self):
        school = self.school_departments("School of Computer Science and Engineering")
        outside = next(d.name for d in self.directory.departments if d.name not in school)
        # named faculty of the Dean's own school: yes (Uday Kulkarni is CSE)
        for name, args in (("get_faculty_stats", {"faculty_name": "Uday Kulkarni"}),
                           ("search_publications_by_author", {"author_name": "Uday Kulkarni"}),
                           ("get_citations_by_year", {"faculty_name": "Uday Kulkarni"})):
            raw, out = self.tool("faculty_dean", name, args)
            self.assertEqual(out["status"], "success", (name, raw))
        raw, out = self.tool("faculty_dean", "compare_entities", {"entity_type": "faculty"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual({r["department"] for r in out["data"]} - set(school), set())
        # someone outside the school: not found within scope
        raw, out = self.tool("faculty_dean", "get_faculty_stats", {"faculty_name": "Girish Narayanrao Desai"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("faculty_dean", "get_department_stats", {"department": "Computer Science and Engineering"})
        self.assertEqual(out["status"], "success", raw)
        self.assertTrue(out["top_5_by_citations"], raw)
        self.assertEqual(self.tool("faculty_dean", "get_department_stats", {"department": outside})[1]["status"], "forbidden")
        self.assertEqual(self.tool("faculty_dean", "count_qrank_publications", {"department": outside})[1]["status"], "forbidden")
        raw, out = self.tool("faculty_dean", "compare_entities", {"entity_type": "department"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual({r["department"] for r in out["data"]} - set(school), set())
        self.assertEqual(self.leaked(raw), [])
        both = {"entity_type": "department", "entities": ["Computer Science and Engineering", outside]}
        self.assertEqual(self.tool("faculty_dean", "compare_entities", both)[1]["status"], "forbidden")

    def test_faculty_dean_school_totals_cover_the_school_only(self):
        school = self.school_departments("School of Computer Science and Engineering")
        _, out = self.tool("faculty_dean", "get_department_stats", {"department": "School of Computer Science and Engineering"})
        self.assertEqual(out["status"], "success")
        r = httpx.get(f"{URL}/rest/v1/v_faculty_full?select=department&limit=2000", headers=_rest(SERVICE), timeout=30)
        in_school = sum(1 for x in r.json() if x["department"] in school)
        self.assertEqual(out["summary"]["faculty_count"], in_school)

    # ── Executive Dean ──────────────────────────────────────
    def test_executive_dean_sees_any_individual_without_a_drilldown_phrase(self):
        raw, out = self.tool("executive_dean", "get_department_stats", {"department": "Physics"})
        self.assertEqual(out["status"], "success", raw)
        self.assertTrue(out["top_5_by_citations"], raw)
        for who in ("Uday Kulkarni", "Sunil Gurlahosur V", "Girish Narayanrao Desai"):
            raw, out = self.tool("executive_dean", "get_faculty_stats", {"faculty_name": who})
            self.assertEqual(out["status"], "success", raw)

    # ── same question, same answer, every role (role testing) ──
    def test_cse_figures_are_identical_for_every_role_that_can_see_cse(self):
        # Role testing: "What's CSE's total h-index?" was 418 across 147 faculty for the VC and 370
        # across 133 for everyone else; CSE's Q1 count was 81, 59 or 56 depending on the tool.
        seen = {}
        for who in ("faculty", "hod", "faculty_dean", "executive_dean", "vc"):
            raw, out = self.tool(who, "get_department_stats", {"department": "CSE"})
            self.assertEqual(out["status"], "success", (who, raw))
            sm = out["summary"]
            seen[who] = (sm["faculty_count"], sm["total_hindex"], sm["total_publications"], sm["total_q1_publications"])
        self.assertEqual(len(set(seen.values())), 1, seen)
        raw, q = self.tool("vc", "get_qrank_distribution", {"department": "CSE"})
        self.assertEqual(q["q1_count"], seen["vc"][3], "department Q1 must match the Q-rank breakdown")

    def test_a_shared_surname_is_ambiguous_for_every_role_that_can_look_people_up(self):
        for who in ("hod", "faculty_dean", "executive_dean", "vc"):
            for tool in ("get_faculty_stats", "get_citations_by_year"):
                raw, out = self.tool(who, tool, {"faculty_name": "Dr. Patil"})
                self.assertEqual(out["status"], "ambiguous", (who, tool, raw))
                self.assertGreater(len(out["candidates"]), 1)

    def test_campus_figures_match_the_dashboard(self):
        # The VC dashboard shows Belagavi "1,020 papers, 14%"; the chatbot refused ("campus is not a
        # field I can filter by") before get_campus_stats existed.
        for who in ("faculty", "hod", "faculty_dean", "executive_dean", "vc"):
            raw, out = self.tool(who, "get_campus_stats", {})
            self.assertEqual(out["status"], "success", (who, raw))
            by = {r["campus"]: r for r in out["data"]}
            self.assertEqual(by["Belagavi"]["papers_only_this_campus"], 1020, who)
            self.assertEqual(round(by["Belagavi"]["share_of_university_papers_percent"]), 14, who)
            self.assertEqual(out["university_total_papers"], 7061)
            self.assertGreater(by["Belagavi"]["papers_with_an_author_from_campus"], 1020)
        raw, out = self.tool("hod", "get_campus_stats", {"campus": "Belgaum campus"})
        self.assertTrue(out["data"][0]["top_departments_by_papers"], raw)
        raw, out = self.tool("faculty", "get_campus_stats", {"campus": "Belgaum campus"})
        self.assertNotIn("top_departments_by_papers", out["data"][0], raw)

    def test_list_scopus_papers_from_belgaum_campus(self):
        for who in ("executive_dean", "vc"):
            raw, out = self.tool(who, "list_campus_publications", {"campus": "Belgaum campus", "limit": 5})
            self.assertEqual(out["status"], "success", (who, raw))
            self.assertEqual(out["returned"], 5)
            self.assertGreater(out["total_matching"], 500)
            self.assertEqual(len(out["data"]), 5)
            self.assertTrue(all(r["title"] for r in out["data"]))
        for who in ("faculty", "hod", "faculty_dean"):
            raw, out = self.tool(who, "list_campus_publications", {"campus": "Belagavi"})
            self.assertEqual(out["status"], "forbidden", (who, raw))

    def test_belgaum_follow_up_flow(self):
        """Compare campuses -> zoom into Belgaum -> who published the most there -> show their papers."""
        for who in ("hod", "faculty_dean", "executive_dean", "vc"):
            raw, out = self.tool(who, "get_campus_stats", {})
            self.assertEqual(out["status"], "success", (who, raw))
            raw, out = self.tool(who, "get_campus_stats", {"campus": "Belgaum"})
            self.assertEqual(out["data"][0]["papers_only_this_campus"], 1020, who)
        raw, out = self.tool("vc", "get_campus_top_authors", {"campus": "Belgaum", "limit": 5})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(len(out["data"]), 5)
        name, dept, papers = out["data"][0][0], out["data"][0][1], out["data"][0][2]
        self.assertEqual((name, papers), ("Rajashri N Khanai", 67))
        self.assertGreater(out["faculty_with_papers"], 100)
        self.assertEqual([r[2] for r in out["data"]], sorted((r[2] for r in out["data"]), reverse=True))
        raw, out = self.tool("vc", "search_publications_by_author", {"author_name": name, "department": dept, "limit": 5})
        self.assertEqual(out["status"], "success", raw)
        self.assertGreaterEqual(out["count"], 1)

    def test_campus_top_authors_respects_scope(self):
        raw, out = self.tool("faculty", "get_campus_top_authors", {"campus": "Belagavi"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("hod", "get_campus_top_authors", {"campus": "Belagavi"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual({r[1] for r in out["data"]}, {"Computer Science and Engineering"})     # the HoD's own department
        raw, out = self.tool("hod", "get_campus_top_authors", {"campus": "Belagavi", "department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("faculty_dean", "get_campus_top_authors", {"campus": "Belagavi"})
        self.assertEqual(out["status"], "success", raw)
        school = set(self.school_departments("School of Computer Science and Engineering"))
        self.assertTrue({r[1] for r in out["data"]} <= school)
        raw, out = self.tool("executive_dean", "get_campus_top_authors", {"campus": "Belagavi", "department": "ECE"})
        self.assertEqual({r[1] for r in out["data"]}, {"Electronics and Communication Engineering"})

    def test_q1_ranking_by_department(self):
        raw, out = self.tool("vc", "compare_entities", {"entity_type": "department", "metric": "q1_count", "top_n": 50})
        self.assertEqual(out["status"], "success", raw)
        q1 = [r["total_q1"] for r in out["data"]]
        self.assertEqual(q1, sorted(q1, reverse=True))
        self.assertGreater(len(out["data"]), 25)

    def test_top_journals_for_a_department(self):
        for who in ("faculty", "hod", "faculty_dean", "executive_dean", "vc"):
            raw, out = self.tool(who, "get_top_journals", {"department": "CSE", "limit": 5})
            self.assertEqual(out["status"], "success", (who, raw))
            self.assertLessEqual(len(out["data"]), 5)

    # ── VC ──────────────────────────────────────────────────
    def test_vc_is_unrestricted(self):
        raw, out = self.tool("vc", "get_faculty_stats", {"faculty_name": "Girish Narayanrao Desai"})
        self.assertEqual(out["status"], "success", raw)
        raw, out = self.tool("vc", "get_department_stats", {"department": "Physics"})
        self.assertTrue(out["top_5_by_citations"])

    # ── hostile input ───────────────────────────────────────
    def test_wildcards_and_sql_metacharacters_do_nothing(self):
        for who, name, args in (
            ("hod", "get_department_stats", {"department": "%"}),
            ("hod", "count_qrank_publications", {"department": "%"}),
            ("faculty_dean", "count_qrank_publications", {"department": "%"}),
            ("faculty_dean", "get_department_stats", {"department": "'; DROP TABLE ria.faculty; --"}),
            ("executive_dean", "get_department_stats", {"department": "x' OR '1'='1"}),
        ):
            raw, out = self.tool(who, name, args)
            self.assertEqual(out["status"], "forbidden", (who, name, raw))
        raw, out = self.tool("hod", "get_faculty_stats", {"faculty_name": "x' OR 1=1 --"})
        self.assertIn(out["status"], ("forbidden", "no_match", "ambiguous", "error"), raw)
        self.assertEqual(self.leaked(raw), [])
        r = httpx.get(f"{URL}/rest/v1/faculty?select=id&limit=1", headers=_rest(SERVICE), timeout=20)
        self.assertEqual(r.status_code, 200)

    # ── P3 tools: get_university_overview, get_qrank_distribution, get_institute_summary,
    #    compare_entities(institute) ────────────────────────────────────
    def test_university_overview_same_for_every_persona(self):
        results = {who: self.tool(who, "get_university_overview", {})[1] for who in
                   ("faculty", "hod", "faculty_dean", "executive_dean", "vc")}
        for who, out in results.items():
            self.assertEqual(out["status"], "success", who)
            self.assertGreater(out["total_publications"], 0, who)
            self.assertGreater(out["faculty_count"], 0, who)
            self.assertTrue(out["top_5_departments_by_publications"], who)
        totals = {out["total_publications"] for out in results.values()}
        self.assertEqual(len(totals), 1, "the university total must not depend on who is asking")

    def test_qrank_distribution_matches_count_qrank(self):
        _, dist = self.tool("faculty", "get_qrank_distribution", {})
        self.assertEqual(dist["status"], "success")
        _, q1 = self.tool("faculty", "count_qrank_publications", {"qrank": "Q1"})
        self.assertEqual(dist["q1_count"], q1["count"])
        self.assertEqual(dist["total_ranked"], dist["q1_count"] + dist["q2_count"] + dist["q3_count"] + dist["q4_count"])

    def test_qrank_distribution_is_scoped_the_same_as_count_qrank(self):
        raw, out = self.tool("hod", "get_qrank_distribution", {"department": "Physics"})
        self.assertEqual(out["status"], "success", raw)
        raw, out = self.tool("faculty", "get_qrank_distribution", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("faculty_dean", "get_qrank_distribution", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_institute_summary_scoped_to_own_school(self):
        raw, out = self.tool("faculty_dean", "get_institute_summary", {})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(len(out["data"]), 1)
        self.assertEqual(out["data"][0]["institute"], "School of Computer Science and Engineering")
        raw, out = self.tool("faculty_dean", "get_institute_summary", {"institute": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("executive_dean", "get_institute_summary", {"institute": "CSE"})
        self.assertEqual(out["status"], "success", raw)
        self.assertGreaterEqual(len(out["data"]), 1)

    def test_institute_summary_denied_for_faculty_and_hod(self):
        for who, extra in (("faculty", {}), ("hod", {})):
            raw, out = self.tool(who, "get_institute_summary", {})
            self.assertEqual(out["status"], "forbidden", (who, raw))

    def test_institute_comparison_is_executive_dean_and_vc_only(self):
        raw, out = self.tool("executive_dean", "compare_entities", {"entity_type": "institute"})
        self.assertEqual(out["status"], "success", raw)
        self.assertGreaterEqual(len(out["data"]), 2)
        self.assertEqual(self.leaked(raw), [])
        raw, out = self.tool("vc", "compare_entities", {"entity_type": "institute"})
        self.assertEqual(out["status"], "success", raw)
        for who in ("faculty", "hod", "faculty_dean"):
            raw, out = self.tool(who, "compare_entities", {"entity_type": "institute"})
            self.assertEqual(out["status"], "forbidden", (who, raw))

    # ── P4: department name matching no longer bleeds into a superstring department ──
    def test_department_matching_bugfix_on_real_data(self):
        # 'Management' is a substring of 'Management Studies' (and 'Computer Application' of
        # 'Master of Computer Applications'). A plain ILIKE '%Management%' wrongly pulled in
        # 'Management Studies' too: 128 rows instead of the true 2. This checks the fixed,
        # ';'-bounded SQL scope_guard now injects (scope_departments), against the real database,
        # not scope_guard.resolve_departments()/DEPT_ABBREV's own separate 'Management' ->
        # 'Management Studies' abbreviation, which is a distinct, pre-existing naming choice.
        old_buggy = "SELECT COUNT(*) AS cnt FROM publications WHERE home_author_department ILIKE '%Management%'"
        new_fixed = ("SELECT COUNT(*) AS cnt FROM publications WHERE "
                    "(';' || home_author_department || ';') ILIKE '%;Management;%'")
        buggy = httpx.post(f"{URL}/rest/v1/rpc/exec_sql", headers=_rest(SERVICE), json={"query_text": old_buggy}, timeout=20)
        fixed = httpx.post(f"{URL}/rest/v1/rpc/exec_sql", headers=_rest(SERVICE), json={"query_text": new_fixed}, timeout=20)
        self.assertEqual((buggy.status_code, fixed.status_code), (200, 200))
        buggy_count, fixed_count = buggy.json()[0]["cnt"], fixed.json()[0]["cnt"]
        self.assertEqual(fixed_count, 2, "expected exactly the true 'Management' publications")
        self.assertGreater(buggy_count, fixed_count, "the old substring match should over-count")

    # ── P4: get_department_trend ─────────────────────────────
    def test_department_trend_scoped_like_the_other_department_tools(self):
        raw, out = self.tool("hod", "get_department_trend", {})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(out["department"], "Computer Science and Engineering")
        self.assertEqual(len(out["yearly"]), out["to_year"] - out["from_year"] + 1)
        raw, out = self.tool("faculty", "get_department_trend", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("faculty_dean", "get_department_trend", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("executive_dean", "get_department_trend", {"department": "Physics"})
        self.assertEqual(out["status"], "success", raw)

    # ── P4: get_inactive_faculty ──────────────────────────────
    def test_inactive_faculty_scoped_to_hod_own_department(self):
        raw, out = self.tool("hod", "get_inactive_faculty", {})
        self.assertEqual(out["status"], "success", raw)
        self.assertIn("inactive_faculty", out)
        raw, out = self.tool("hod", "get_inactive_faculty", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_inactive_faculty_denied_for_faculty(self):
        raw, out = self.tool("faculty", "get_inactive_faculty", {})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_inactive_faculty_faculty_dean_own_school_executive_dean_any(self):
        raw, out = self.tool("faculty_dean", "get_inactive_faculty", {})
        self.assertEqual(out["status"], "success", raw)
        raw, out = self.tool("faculty_dean", "get_inactive_faculty", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("executive_dean", "get_inactive_faculty", {"department": "Physics"})
        self.assertEqual(out["status"], "success", raw)

    # ── P5: get_faculty_stats' Q1-Q4 fix (junction, not staff_ria_user_id) ──
    def test_faculty_stats_qrank_breakdown_matches_the_junction_on_real_data(self):
        raw, out = self.tool("faculty", "get_faculty_stats", {"faculty_name": "Uday Kulkarni"})
        self.assertEqual(out["status"], "success", raw)
        d = out["data"]
        self.assertEqual((d["q1_count"], d["q2_count"], d["q3_count"], d["q4_count"]), (3, 2, 52, 10))

    # ── P5: get_top_cited_publications ────────────────────────
    def test_top_cited_publications(self):
        raw, out = self.tool("faculty", "get_top_cited_publications", {"faculty_name": "me", "limit": 3})
        self.assertEqual(out["status"], "success", raw)
        cites = [p["scopus_citations"] for p in out["data"]]
        self.assertEqual(cites, sorted(cites, reverse=True))
        self.assertEqual(cites[0], 104)
        raw, out = self.tool("faculty", "get_top_cited_publications", {"faculty_name": "Narayan D G"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("hod", "get_top_cited_publications", {"faculty_name": "Girish Narayanrao Desai"})
        self.assertEqual(out["status"], "forbidden", raw)   # Chemical Engineering, not CSE

    # ── P5: get_department_benchmark ──────────────────────────
    def test_department_benchmark_on_real_data(self):
        raw, out = self.tool("faculty", "get_department_benchmark", {"faculty_name": "me"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(out["department"], "Computer Science and Engineering")
        self.assertEqual(out["own"]["publications"], 147)   # v_faculty_full.total_pub_count (junction-based)
        self.assertGreater(out["department_average"]["publications"], 0)
        self.assertIn(out["vs_department_average"]["publications"], ("above", "below", "at"))
        raw, out = self.tool("faculty_dean", "get_department_benchmark", {"faculty_name": "Girish Narayanrao Desai"})
        self.assertEqual(out["status"], "forbidden", raw)   # outside the Faculty Dean's school

    # ── P5: get_citations_by_year ──────────────────────────────
    def test_citations_by_year_on_real_data(self):
        raw, out = self.tool("faculty", "get_citations_by_year", {"faculty_name": "me"})
        self.assertEqual(out["status"], "success", raw)
        self.assertTrue(out["yearly"])
        self.assertIn("not", out["note"].lower())
        self.assertEqual(sum(y["publications"] for y in out["yearly"]), 147)

    # ── Faculty Dean cluster: get_author_concentration, get_cross_department_collaboration,
    #    get_growth_acceleration — Faculty Dean only, scoped to their own school ──────────
    def test_dean_cluster_denied_for_faculty_hod_and_executive_dean(self):
        for who in ("faculty", "hod", "executive_dean"):
            raw, out = self.tool(who, "get_author_concentration", {})
            self.assertEqual(out["status"], "forbidden", (who, raw))
            raw, out = self.tool(who, "get_growth_acceleration", {})
            self.assertEqual(out["status"], "forbidden", (who, raw))
            raw, out = self.tool(who, "get_cross_department_collaboration",
                                 {"dept_a": "CSE", "dept_b": "Computer Application"})
            self.assertEqual(out["status"], "forbidden", (who, raw))
        # the drilldown phrase never unlocks the dean cluster for Executive Dean
        raw, out = self.tool("executive_dean", "get_author_concentration", {}, self.DRILL)
        self.assertEqual(out["status"], "forbidden", raw)

    def test_author_concentration_scoped_to_own_school(self):
        school = self.school_departments("School of Computer Science and Engineering")
        raw, out = self.tool("faculty_dean", "get_author_concentration", {})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(out["department"], ", ".join(school))
        self.assertEqual(self.leaked(raw), [], "must never name individual authors")
        self.assertGreaterEqual(out["total_publications"], out["top_k_publications"])
        self.assertGreaterEqual(out["concentration_percent"], 0)
        raw, out = self.tool("faculty_dean", "get_author_concentration", {"department": "CSE"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual(out["department"], "Computer Science and Engineering")
        raw, out = self.tool("faculty_dean", "get_author_concentration", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_cross_department_collaboration_within_own_school(self):
        raw, out = self.tool("faculty_dean", "get_cross_department_collaboration",
                             {"dept_a": "CSE", "dept_b": "Computer Application"})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual((out["dept_a"], out["dept_b"]),
                         ("Computer Science and Engineering", "Computer Application"))
        self.assertGreaterEqual(out["dept_a_publications"], out["joint_publications"])
        self.assertGreaterEqual(out["dept_b_publications"], out["joint_publications"])
        self.assertEqual(self.leaked(raw), [])
        raw, out = self.tool("faculty_dean", "get_cross_department_collaboration",
                             {"dept_a": "CSE", "dept_b": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)
        raw, out = self.tool("faculty_dean", "get_cross_department_collaboration",
                             {"dept_a": "CSE", "dept_b": "CSE"})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_cross_department_collaboration_unrestricted_for_vc(self):
        raw, out = self.tool("vc", "get_cross_department_collaboration",
                             {"dept_a": "Physics", "dept_b": "Chemistry"})
        self.assertEqual(out["status"], "success", raw)

    def test_growth_acceleration_school_breakdown(self):
        school = self.school_departments("School of Computer Science and Engineering")
        raw, out = self.tool("faculty_dean", "get_growth_acceleration", {})
        self.assertEqual(out["status"], "success", raw)
        self.assertEqual({d["department"] for d in out["departments"]}, set(school))
        for d in out["departments"]:
            self.assertEqual(len(d["yearly"]), out["to_year"] - out["from_year"] + 1)
            self.assertIn(d["trend"], ("accelerating", "decelerating", "stable", "unknown"))
        self.assertEqual(self.leaked(raw), [])
        raw, out = self.tool("faculty_dean", "get_growth_acceleration", {"department": "Physics"})
        self.assertEqual(out["status"], "forbidden", raw)

    def test_growth_acceleration_excludes_the_incomplete_latest_year(self):
        raw, out = self.tool("faculty_dean", "get_growth_acceleration", {"department": "CSE"})
        self.assertEqual(out["status"], "success", raw)
        r = httpx.get(f"{URL}/rest/v1/publications?select=year&order=year.desc&limit=1", headers=_rest(SERVICE), timeout=20)
        newest_year_in_data = r.json()[0]["year"]
        self.assertEqual(out["to_year"], newest_year_in_data - 1)


if __name__ == "__main__":
    unittest.main()
