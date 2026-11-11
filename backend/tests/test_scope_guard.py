"""Offline tests for the tool scope guard (backend/scope_guard.py) and the scoped tools.

No database, network or LLM. Run from backend/:

    python -m unittest discover -s tests -t . -v
"""
from __future__ import annotations

import asyncio
import json
import unittest
from unittest import mock

import ria_agent
import ria_tools_groq as tools
import scope_guard
from auth_scope import Scope
from scope_guard import (
    Dept, Directory, Inst, authorize, filter_tools, refers_to_self,
    resolve_departments, resolve_institutes, sanitize_args,
)

CSE, MCA = "Computer Science and Engineering", "Computer Application"
ECE, EEE = "Electronics and Communication Engineering", "Electrical and Electronics Engineering"
PHY, CHE, MAT = "Physics", "Chemistry", "Mathematics"

DIR = Directory(
    departments=(
        Dept("d1", CSE, "i1"), Dept("d2", MCA, "i1"),
        Dept("d3", ECE, "i2"), Dept("d4", EEE, "i2"),
        Dept("d5", PHY, "i3"), Dept("d6", CHE, "i3"), Dept("d7", MAT, "i3"),
    ),
    institutes=(
        Inst("i1", "School of Computer Science and Engineering", "SoCSE"),
        Inst("i2", "School of Electrical and Electronics Engineering", "SoEEE"),
        Inst("i3", "School of Sciences", "SoS"),
    ),
)


def scope(persona: str, **kw) -> Scope:
    role = {"faculty": "Faculty", "hod": "HoD", "faculty_dean": "Dean", "executive_dean": "Dean",
            "vice_chancellor": "VC"}[persona]
    dean = {"faculty_dean": "faculty_dean", "executive_dean": "executive_dean"}.get(persona)
    base = dict(user_id="00000000-0000-0000-0000-000000000001", email=None, full_name="Test User", role_level=role,
                dean_type=dean, persona_id=persona)
    base.update(kw)
    return Scope(**base)


FACULTY = scope("faculty", full_name="Uday Kulkarni", author_name="Uday Kulkarni", ria_user_id=232730,
                faculty_id="f1", department_id="d1", department_name=CSE)
FACULTY_MISSPELT = scope("faculty", full_name="Dr. Uma Mudenagudi", author_name="Uma Mudengudi", ria_user_id=232799,
                         faculty_id="f2", department_id="d3", department_name=ECE)
HOD = scope("hod", full_name="Narayan D G", ria_user_id=232716, department_id="d1", department_name=CSE)
FDEAN = scope("faculty_dean", full_name="Vijayalaxmi M", institute_id="i1",
             institute_name="School of Computer Science and Engineering")
EDEAN = scope("executive_dean", full_name="Tewari P G")
VC = scope("vice_chancellor", full_name="VC")

DRILL = "Drill down to faculty level for School of Sciences"


def allow(t: unittest.TestCase, sc, tool, args, msg="", **expect):
    d = authorize(sc, tool, args, msg, directory=DIR)
    t.assertTrue(d.allowed, f"{sc.persona_id}/{tool}{args} denied: {d.message}")
    for k, v in expect.items():
        t.assertEqual(d.args.get(k), v, f"{sc.persona_id}/{tool}: {k}")
    return d


def deny(t: unittest.TestCase, sc, tool, args, msg=""):
    d = authorize(sc, tool, args, msg, directory=DIR)
    t.assertFalse(d.allowed, f"{sc.persona_id}/{tool}{args} should be denied, got args={d.args}")
    t.assertTrue(d.message)
    return d


class ResolveTests(unittest.TestCase):
    def names(self, text):
        return [d.name for d in resolve_departments(DIR, text)]

    def test_resolution(self):
        self.assertEqual(self.names("CSE"), [CSE])
        self.assertEqual(self.names("  cse "), [CSE])
        self.assertEqual(self.names("physics"), [PHY])
        self.assertEqual(self.names("School of Sciences"), [PHY, CHE, MAT])
        self.assertEqual(self.names("SoCSE"), [CSE, MCA])
        self.assertEqual(self.names("computer"), [CSE, MCA])

    def test_wildcards_and_junk_resolve_to_nothing(self):
        for junk in ("", "   ", None, "%", "_", "%%", "*", ".*", "zz", "ab", "x' OR '1'='1", "Physics'; DROP TABLE faculty;--"):
            self.assertEqual(self.names(junk), [], junk)


class SelfTests(unittest.TestCase):
    def test_recognises_self(self):
        for name in ("", "me", "my", "myself", "Uday Kulkarni", "uday kulkarni", "Dr. Uday Kulkarni", "Uday", "Kulkarni",
                     "Kulkarni Uday", "Uday Kulkarnii"):
            self.assertTrue(refers_to_self(FACULTY, name), name)

    def test_rejects_others(self):
        for name in ("Narayan D G", "Narayan Kulkarni", "Uday Desai", "my colleague Narayan", "D G", "K", "Uday Kulkarni Sr"):
            self.assertFalse(refers_to_self(FACULTY, name), name)

    def test_profile_and_roster_spellings_both_count(self):
        for name in ("Uma Mudengudi", "Dr. Uma Mudenagudi", "Mudenagudi", "Mudengudi"):
            self.assertTrue(refers_to_self(FACULTY_MISSPELT, name), name)
        self.assertFalse(refers_to_self(FACULTY_MISSPELT, "Uma Kulkarni"))


class SanitizeTests(unittest.TestCase):
    def test_only_schema_arguments_survive(self):
        a = sanitize_args("get_faculty_stats", {"faculty_name": "X", "source": "wos", "ria_user_id": 1,
                                                 "scope_departments": ["Physics"], "include_names": True, "sql": "drop"})
        self.assertEqual(a, {"faculty_name": "X", "source": "wos"})

    def test_types_are_coerced_and_bounded(self):
        a = sanitize_args("get_department_stats", {"department": "x" * 500, "top_n": "7"})
        self.assertEqual((len(a["department"]), a["top_n"]), (200, 7))
        a = sanitize_args("compare_entities", {"entities": ["a", "b"] + ["c"] * 30, "top_n": 3})
        self.assertEqual(len(a["entities"]), 10)
        self.assertEqual(sanitize_args("compare_entities", {"entities": "CSE"})["entities"], ["CSE"])
        self.assertEqual(sanitize_args("count_qrank_publications", {"qrank": None, "department": None}), {})

    def test_bad_values_are_rejected(self):
        for args in ({"top_n": "abc"}, {"top_n": True}, {"department": {"a": 1}}):
            with self.assertRaises(scope_guard.BadArgument):
                sanitize_args("get_department_stats", args)
        with self.assertRaises(scope_guard.BadArgument):
            sanitize_args("no_such_tool", {})


class FacultyRules(unittest.TestCase):
    def test_own_profile_is_pinned_by_id(self):
        for name in ("Uday Kulkarni", "me", ""):
            d = allow(self, FACULTY, "get_faculty_stats", {"faculty_name": name}, ria_user_id=232730)
            self.assertNotIn("scope_departments", d.args)

    def test_someone_elses_profile_is_denied(self):
        deny(self, FACULTY, "get_faculty_stats", {"faculty_name": "Narayan D G"})
        deny(self, FACULTY, "search_publications_by_author", {"author_name": "Narayan D G"})

    def test_model_cannot_inject_trusted_arguments(self):
        d = allow(self, FACULTY, "get_faculty_stats",
                  {"faculty_name": "Uday Kulkarni", "ria_user_id": 999, "scope_departments": ["Physics"], "include_names": True})
        self.assertEqual(d.args["ria_user_id"], 232730)
        self.assertNotIn("scope_departments", d.args)
        self.assertNotIn("include_names", d.args)
        deny(self, FACULTY, "get_faculty_stats", {"faculty_name": "Narayan D G", "ria_user_id": 232730})

    def test_spelling_differences_between_profile_and_roster(self):
        allow(self, FACULTY_MISSPELT, "get_faculty_stats", {"faculty_name": "Uma Mudengudi"}, ria_user_id=232799)
        allow(self, FACULTY_MISSPELT, "get_faculty_stats", {"faculty_name": "Dr. Uma Mudenagudi"}, ria_user_id=232799)

    def test_own_publications_only(self):
        allow(self, FACULTY, "search_publications_by_author", {"author_name": "Uday Kulkarni", "year": 2024}, ria_user_id=232730)

    def test_department_figures_are_own_department_without_names(self):
        for text in ("CSE", CSE, ""):
            allow(self, FACULTY, "get_department_stats", {"department": text},
                  scope_departments=[CSE], include_names=False)
        for text in ("Physics", "ECE", "School of Sciences", "%", "x' OR '1'='1"):
            deny(self, FACULTY, "get_department_stats", {"department": text})

    def test_university_counts_and_own_department_counts(self):
        d = allow(self, FACULTY, "count_qrank_publications", {"qrank": "Q1"})
        self.assertNotIn("scope_departments", d.args)
        allow(self, FACULTY, "get_yearly_stats", {"year": 2024})
        allow(self, FACULTY, "count_qrank_publications", {"qrank": "Q1", "department": "CSE"}, scope_departments=[CSE])
        deny(self, FACULTY, "count_qrank_publications", {"department": "ECE"})
        deny(self, FACULTY, "get_yearly_stats", {"year": 2024, "department": "Physics"})

    def test_no_comparisons(self):
        for etype in ("department", "faculty"):
            deny(self, FACULTY, "compare_entities", {"entity_type": etype})

    def test_unlinked_faculty_is_denied(self):
        deny(self, scope("faculty", full_name="Nobody", department_name=CSE), "get_faculty_stats", {"faculty_name": "me"})
        deny(self, scope("faculty", ria_user_id=1, full_name="X"), "get_department_stats", {"department": ""})


class HodRules(unittest.TestCase):
    def test_individuals_are_limited_to_own_department(self):
        for tool, args in (("get_faculty_stats", {"faculty_name": "Anyone At All"}),
                           ("search_publications_by_author", {"author_name": "Anyone At All"})):
            d = allow(self, HOD, tool, args, scope_departments=[CSE])
            self.assertNotIn("ria_user_id", d.args)

    def test_own_department_shows_names_others_do_not(self):
        for text in ("", "CSE", CSE):
            allow(self, HOD, "get_department_stats", {"department": text}, scope_departments=[CSE], include_names=True)
        allow(self, HOD, "get_department_stats", {"department": "Physics"}, scope_departments=[PHY], include_names=False)
        allow(self, HOD, "get_department_stats", {"department": "School of Sciences"},
              scope_departments=[PHY, CHE, MAT], include_names=False)
        # own department inside a wider match still hides names
        allow(self, HOD, "get_department_stats", {"department": "School of Computer Science and Engineering"},
              scope_departments=[CSE, MCA], include_names=False)

    def test_wildcards_and_unknown_departments_are_denied(self):
        for text in ("%", "_", "nonsense dept", "x' OR '1'='1"):
            deny(self, HOD, "get_department_stats", {"department": text})
            deny(self, HOD, "count_qrank_publications", {"department": text})

    def test_publication_counts_any_department(self):
        allow(self, HOD, "count_qrank_publications", {"department": "Physics", "qrank": "Q1"}, scope_departments=[PHY])
        d = allow(self, HOD, "get_yearly_stats", {"year": 2023})
        self.assertNotIn("scope_departments", d.args)

    def test_comparisons(self):
        d = allow(self, HOD, "compare_entities", {"entity_type": "department", "entities": ["CSE", "ECE"]},
                  scope_departments=[CSE, ECE], include_names=False)
        self.assertNotIn("entities", d.args)
        d = allow(self, HOD, "compare_entities", {"entity_type": "department"}, include_names=False)
        self.assertNotIn("scope_departments", d.args)
        allow(self, HOD, "compare_entities", {"entity_type": "faculty", "department": "Physics"},
              scope_departments=[CSE], include_names=True)
        allow(self, HOD, "compare_entities", {"entity_type": "faculty", "entities": ["A B", "C D"]},
              scope_departments=[CSE], include_names=True)

    def test_hod_without_department_is_denied(self):
        deny(self, scope("hod", full_name="X"), "get_faculty_stats", {"faculty_name": "A"})


class FacultyDeanRules(unittest.TestCase):
    def test_individuals_inside_the_school_only(self):
        # Role testing: "how many papers did <name> publish" was refused outright for the Faculty
        # Dean. Policy now: any named faculty member of the Dean's OWN school, nobody outside it
        # (the tool resolves the name only inside scope_departments).
        for tool, key in (("get_faculty_stats", "faculty_name"), ("search_publications_by_author", "author_name"),
                          ("get_citations_by_year", "faculty_name"), ("get_top_cited_publications", "faculty_name")):
            d = allow(self, FDEAN, tool, {key: "Uday Kulkarni"})
            self.assertEqual(sorted(d.args.get("scope_departments")), sorted([CSE, MCA]), tool)
            self.assertNotIn("ria_user_id", d.args)
        allow(self, FDEAN, "compare_entities", {"entity_type": "faculty"}, scope_departments=[CSE, MCA], include_names=True)
        allow(self, FDEAN, "compare_entities", {"entity_type": "faculty", "department": "CSE"},
              scope_departments=[CSE], include_names=True)
        deny(self, FDEAN, "compare_entities", {"entity_type": "faculty", "department": "Physics"})

    def test_department_stats_inside_the_school_with_names(self):
        allow(self, FDEAN, "get_department_stats", {"department": "CSE"}, scope_departments=[CSE], include_names=True)
        allow(self, FDEAN, "get_department_stats", {"department": "computer"}, scope_departments=[CSE, MCA], include_names=True)
        allow(self, FDEAN, "get_department_stats", {"department": "School of Computer Science and Engineering"},
              scope_departments=[CSE, MCA], include_names=True)
        allow(self, FDEAN, "get_department_stats", {"department": ""}, scope_departments=[CSE, MCA], include_names=True)

    def test_outside_the_school_is_denied(self):
        for text in ("Physics", "ECE", "School of Sciences", "Engineering", "%"):
            deny(self, FDEAN, "get_department_stats", {"department": text})
            deny(self, FDEAN, "count_qrank_publications", {"department": text})

    def test_comparisons_stay_inside_the_school(self):
        allow(self, FDEAN, "compare_entities", {"entity_type": "department"}, scope_departments=[CSE, MCA], include_names=False)
        allow(self, FDEAN, "compare_entities", {"entity_type": "department", "entities": ["CSE"]}, scope_departments=[CSE])
        deny(self, FDEAN, "compare_entities", {"entity_type": "department", "entities": ["CSE", "Physics"]})

    def test_counts(self):
        d = allow(self, FDEAN, "count_qrank_publications", {"qrank": "Q1"})
        self.assertNotIn("scope_departments", d.args)
        allow(self, FDEAN, "get_yearly_stats", {"year": 2024, "department": "CSE"}, scope_departments=[CSE])

    def test_dean_without_institute_is_denied(self):
        deny(self, scope("faculty_dean", full_name="X"), "get_department_stats", {"department": "CSE"})


class ExecutiveDeanRules(unittest.TestCase):
    def test_any_individual_without_a_drilldown_phrase(self):
        # Role testing: the Executive Dean refused "How many papers did Sunil Gurlahosur V publish
        # this year?" unless the message said "drill down". Policy now: university-wide, any person.
        for msg in ("", "what about their h-index?", DRILL):
            d = allow(self, EDEAN, "get_faculty_stats", {"faculty_name": "Uday Kulkarni"}, msg)
            self.assertNotIn("ria_user_id", d.args)
            self.assertNotIn("scope_departments", d.args)
        allow(self, EDEAN, "search_publications_by_author", {"author_name": "Uday Kulkarni"})
        allow(self, EDEAN, "get_department_stats", {"department": "Physics"}, scope_departments=[PHY], include_names=True)
        allow(self, EDEAN, "compare_entities", {"entity_type": "faculty"}, include_names=True)
        allow(self, EDEAN, "compare_entities", {"entity_type": "faculty", "department": "CSE"},
              scope_departments=[CSE], include_names=True)
        allow(self, EDEAN, "compare_entities", {"entity_type": "department"}, include_names=False)

    def test_unknown_department_is_denied(self):
        deny(self, EDEAN, "get_department_stats", {"department": "%"})
        deny(self, EDEAN, "get_department_stats", {"department": ""})


class ViceChancellorRules(unittest.TestCase):
    def test_everything_unrestricted_but_whitelisted(self):
        for tool, args in (("get_faculty_stats", {"faculty_name": "Anyone"}),
                           ("search_publications_by_author", {"author_name": "Anyone"}),
                           ("count_qrank_publications", {"qrank": "Q1"}),
                           ("compare_entities", {"entity_type": "faculty"}),
                           ("compare_entities", {"entity_type": "institute"}),
                           ("get_yearly_stats", {"year": 2024}),
                           ("get_university_overview", {})):
            d = allow(self, VC, tool, dict(args, ria_user_id=1, scope_departments=["x"],
                                          scope_institutes=["y"], include_names=False))
            for k in ("ria_user_id", "scope_departments", "include_names", "scope_institutes"):
                self.assertNotIn(k, d.args)
            self.assertEqual(d.action, "allow")

    def test_department_text_is_resolved_like_every_other_role(self):
        # Role testing: "What's CSE's total h-index?" gave the VC 418 across 147 faculty and every
        # other role 370 across 133 - the VC's raw "CSE" reached the tool's fuzzy ILIKE, which also
        # matched the School of CSE's other department. The VC is unrestricted, but names resolve.
        for tool in ("get_department_stats", "get_qrank_distribution", "count_qrank_publications",
                     "get_department_trend", "get_top_journals", "get_inactive_faculty"):
            d = allow(self, VC, tool, {"department": "CSE"}, scope_departments=[CSE])
            self.assertNotIn("department", d.args, tool)
        allow(self, VC, "compare_entities", {"entity_type": "department", "entities": ["CSE", "physics"]},
              scope_departments=[CSE, PHY])
        allow(self, VC, "compare_entities", {"entity_type": "faculty", "department": "CSE"}, scope_departments=[CSE])
        allow(self, VC, "get_institute_summary", {"institute": "SoCSE"},
              scope_institutes=["School of Computer Science and Engineering"])
        allow(self, VC, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "physics"},
              dept_a_scope=CSE, dept_b_scope=PHY)
        allow(self, VC, "get_department_stats", {"department": "School of Sciences"}, scope_departments=[PHY, CHE, MAT])

    def test_unknown_department_text_is_denied_not_widened(self):
        for text in ("%", "nonsense", "x' OR '1'='1"):
            deny(self, VC, "get_department_stats", {"department": text})
            deny(self, VC, "count_qrank_publications", {"department": text})
        deny(self, VC, "get_department_stats", {})

    def test_admin_shares_the_vc_persona(self):
        allow(self, scope("vice_chancellor", role_level="Admin"), "get_faculty_stats", {"faculty_name": "Anyone"})


class InstituteAndOverviewToolRules(unittest.TestCase):
    """get_university_overview, get_qrank_distribution, get_institute_summary, compare_entities(institute)."""

    # ── get_university_overview: no scope, everyone who has the tool ────
    def test_university_overview_needs_no_scope(self):
        for sc in (FACULTY, HOD, FDEAN, EDEAN, VC):
            d = allow(self, sc, "get_university_overview", {})
            self.assertEqual(d.args, {})
            self.assertEqual(d.action, "allow")

    # ── get_qrank_distribution: same scoping as count_qrank_publications ──
    def test_qrank_distribution_scoping_matches_count_qrank(self):
        allow(self, FACULTY, "get_qrank_distribution", {}, scope_departments=None)
        d = allow(self, FACULTY, "get_qrank_distribution", {"department": "CSE"})
        self.assertEqual(d.args.get("scope_departments"), [CSE])
        deny(self, FACULTY, "get_qrank_distribution", {"department": "Physics"})
        allow(self, HOD, "get_qrank_distribution", {"department": "Physics"}, scope_departments=[PHY])
        d = allow(self, FDEAN, "get_qrank_distribution", {})
        self.assertNotIn("scope_departments", d.args)
        deny(self, FDEAN, "get_qrank_distribution", {"department": "Physics"})

    def test_faculty_and_hod_do_not_have_institute_summary(self):
        deny(self, FACULTY, "get_institute_summary", {})
        deny(self, HOD, "get_institute_summary", {})

    # ── get_institute_summary: Faculty Dean = own school only ────────────
    def test_faculty_dean_institute_summary_is_own_school_only(self):
        for text in ("", "SoCSE", "socse", "School of Computer Science and Engineering"):
            d = allow(self, FDEAN, "get_institute_summary", {"institute": text})
            self.assertEqual(d.args.get("scope_institutes"), ["School of Computer Science and Engineering"])
        for text in ("Physics", "School of Sciences", "SoEEE", "%", "x' OR '1'='1"):
            deny(self, FDEAN, "get_institute_summary", {"institute": text})

    def test_faculty_dean_without_institute_is_denied(self):
        deny(self, scope("faculty_dean", full_name="X"), "get_institute_summary", {})

    def test_executive_dean_institute_summary_is_unrestricted(self):
        d = allow(self, EDEAN, "get_institute_summary", {})
        self.assertNotIn("scope_institutes", d.args)
        d = allow(self, EDEAN, "get_institute_summary", {"institute": "Physics"})
        self.assertNotIn("scope_institutes", d.args)
        self.assertEqual(d.args.get("institute"), "Physics")

    # ── compare_entities(institute): executive_dean / vc only ────────────
    def test_institute_comparison_is_executive_dean_and_vc_only(self):
        allow(self, EDEAN, "compare_entities", {"entity_type": "institute"})
        for sc in (FACULTY, HOD, FDEAN):
            deny(self, sc, "compare_entities", {"entity_type": "institute"})

    def test_institute_comparison_entities_pass_through_for_executive_dean(self):
        d = allow(self, EDEAN, "compare_entities", {"entity_type": "institute", "entities": ["CSE", "EEE"]})
        self.assertEqual(d.args.get("entities"), ["CSE", "EEE"])


class ResolveInstituteTests(unittest.TestCase):
    def names(self, text):
        return [i.name for i in resolve_institutes(DIR, text)]

    def test_resolution(self):
        self.assertEqual(self.names("SoCSE"), ["School of Computer Science and Engineering"])
        self.assertEqual(self.names("  socse "), ["School of Computer Science and Engineering"])
        self.assertEqual(self.names("School of Sciences"), ["School of Sciences"])
        self.assertEqual(self.names("sciences"), ["School of Sciences"])

    def test_wildcards_and_junk_resolve_to_nothing(self):
        for junk in ("", "  ", None, "%", "_", "xx", "'; DROP TABLE ria.institutes; --"):
            self.assertEqual(self.names(junk), [], junk)


class DepartmentTrendAndInactiveFacultyRules(unittest.TestCase):
    """get_department_trend and get_inactive_faculty (P4)."""

    # ── get_department_trend: same "own department by default" shape as get_department_stats ──
    def test_faculty_own_department_or_deny(self):
        for text in ("", "CSE", CSE):
            d = allow(self, FACULTY, "get_department_trend", {"department": text})
            self.assertEqual(d.args.get("scope_departments"), [CSE])
        deny(self, FACULTY, "get_department_trend", {"department": "Physics"})

    def test_hod_any_department(self):
        d = allow(self, HOD, "get_department_trend", {})
        self.assertEqual(d.args.get("scope_departments"), [CSE])
        d = allow(self, HOD, "get_department_trend", {"department": "Physics"})
        self.assertEqual(d.args.get("scope_departments"), [PHY])

    def test_faculty_dean_own_school_only(self):
        d = allow(self, FDEAN, "get_department_trend", {})
        self.assertEqual(sorted(d.args.get("scope_departments")), sorted([CSE, MCA]))
        allow(self, FDEAN, "get_department_trend", {"department": "CSE"})
        deny(self, FDEAN, "get_department_trend", {"department": "Physics"})

    def test_executive_dean_needs_a_department_name(self):
        deny(self, EDEAN, "get_department_trend", {})
        allow(self, EDEAN, "get_department_trend", {"department": "Physics"})

    def test_no_names_kwarg_is_ever_injected(self):
        for sc, args in ((FACULTY, {}), (HOD, {}), (FDEAN, {}), (EDEAN, {"department": "Physics"})):
            d = allow(self, sc, "get_department_trend", args)
            self.assertNotIn("include_names", d.args)

    def test_wildcards_and_unknown_departments_are_denied(self):
        for text in ("%", "'; DROP TABLE ria.faculty; --", "nonsense"):
            deny(self, HOD, "get_department_trend", {"department": text})

    # ── get_inactive_faculty: names, so HoD (own dept) / Executive Dean drilldown only ──
    def test_faculty_never_sees_it(self):
        deny(self, FACULTY, "get_inactive_faculty", {})

    def test_faculty_dean_own_school_only(self):
        d = allow(self, FDEAN, "get_inactive_faculty", {})
        self.assertEqual(sorted(d.args.get("scope_departments")), sorted([CSE, MCA]))
        allow(self, FDEAN, "get_inactive_faculty", {"department": "CSE"}, scope_departments=[CSE])
        deny(self, FDEAN, "get_inactive_faculty", {"department": "Physics"})

    def test_hod_own_department_only(self):
        for text in ("", "CSE", CSE):
            d = allow(self, HOD, "get_inactive_faculty", {"department": text})
            self.assertEqual(d.args.get("scope_departments"), [CSE])
        deny(self, HOD, "get_inactive_faculty", {"department": "Physics"})

    def test_hod_without_department_is_denied(self):
        deny(self, scope("hod", full_name="X"), "get_inactive_faculty", {})

    def test_executive_dean_any_department(self):
        allow(self, EDEAN, "get_inactive_faculty", {"department": "Physics"}, scope_departments=[PHY])
        d = allow(self, EDEAN, "get_inactive_faculty", {})
        self.assertNotIn("scope_departments", d.args)

    def test_wildcards_are_denied(self):
        for text in ("%", "x' OR '1'='1"):
            deny(self, HOD, "get_inactive_faculty", {"department": text})


class PerPersonToolRules(unittest.TestCase):
    """get_top_cited_publications, get_department_benchmark, get_citations_by_year (P5) all
    reuse the existing _individual rule — same shape as get_faculty_stats."""

    TOOLS = ("get_top_cited_publications", "get_department_benchmark", "get_citations_by_year")

    def test_faculty_self_only(self):
        for tool in self.TOOLS:
            for name in ("Uday Kulkarni", "me", ""):
                d = allow(self, FACULTY, tool, {"faculty_name": name})
                self.assertEqual(d.args.get("ria_user_id"), 232730, tool)
            deny(self, FACULTY, tool, {"faculty_name": "Narayan D G"})

    def test_hod_own_department_scoped(self):
        for tool in self.TOOLS:
            d = allow(self, HOD, tool, {"faculty_name": "Anyone At All"})
            self.assertEqual(d.args.get("scope_departments"), [CSE], tool)
            self.assertNotIn("ria_user_id", d.args)

    def test_faculty_dean_own_school_scoped(self):
        for tool in self.TOOLS:
            d = allow(self, FDEAN, tool, {"faculty_name": "Anyone"})
            self.assertEqual(sorted(d.args.get("scope_departments")), sorted([CSE, MCA]), tool)

    def test_executive_dean_unrestricted(self):
        for tool in self.TOOLS:
            d = allow(self, EDEAN, tool, {"faculty_name": "Anyone"})
            self.assertNotIn("scope_departments", d.args)

    def test_unlinked_faculty_is_denied(self):
        unlinked = scope("faculty", full_name="Nobody", department_name=CSE)
        for tool in self.TOOLS:
            deny(self, unlinked, tool, {"faculty_name": "me"})

    def test_tools_are_offered_to_both_deans(self):
        for tool in self.TOOLS:
            self.assertIn(tool, scope_guard.allowed_tool_names(FDEAN))
            self.assertIn(tool, scope_guard.allowed_tool_names(EDEAN))


class DeanClusterRules(unittest.TestCase):
    """get_author_concentration, get_growth_acceleration, get_cross_department_collaboration:
    Faculty-Dean-only, scoped to the caller's own school (plan §8.3)."""

    SINGLE_DEPT_TOOLS = ("get_author_concentration", "get_growth_acceleration")

    def test_only_faculty_dean_may_call_them(self):
        for tool in self.SINGLE_DEPT_TOOLS:
            deny(self, FACULTY, tool, {})
            deny(self, HOD, tool, {})
            deny(self, EDEAN, tool, {})
        deny(self, FACULTY, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "MCA"})
        deny(self, HOD, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "MCA"})
        deny(self, EDEAN, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "MCA"})

    def test_faculty_dean_defaults_to_own_school(self):
        for tool in self.SINGLE_DEPT_TOOLS:
            d = allow(self, FDEAN, tool, {})
            self.assertEqual(sorted(d.args.get("scope_departments")), sorted([CSE, MCA]), tool)

    def test_faculty_dean_explicit_department_must_be_in_school(self):
        for tool in self.SINGLE_DEPT_TOOLS:
            d = allow(self, FDEAN, tool, {"department": "CSE"})
            self.assertEqual(d.args.get("scope_departments"), [CSE], tool)
            deny(self, FDEAN, tool, {"department": "Physics"}, )

    def test_faculty_dean_with_no_school_is_denied(self):
        homeless = scope("faculty_dean", full_name="No School")
        for tool in self.SINGLE_DEPT_TOOLS:
            deny(self, homeless, tool, {})

    def test_collaboration_both_departments_must_be_in_school(self):
        d = allow(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "MCA"})
        self.assertEqual(d.args.get("dept_a_scope"), CSE)
        self.assertEqual(d.args.get("dept_b_scope"), MCA)
        deny(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "Physics"})
        deny(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "Physics", "dept_b": "ECE"})

    def test_collaboration_needs_two_different_departments(self):
        deny(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "CSE"})
        deny(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": ""})
        deny(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "", "dept_b": "MCA"})

    def test_collaboration_ambiguous_text_is_denied(self):
        # "SoCSE" resolves to BOTH CSE and MCA -- not a single department, so must be refused.
        deny(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "SoCSE", "dept_b": "MCA"})

    def test_no_trusted_kwarg_leaks_to_other_tools(self):
        d = allow(self, FDEAN, "get_department_trend", {})
        self.assertNotIn("dept_a_scope", d.args)

    def test_wildcards_are_denied(self):
        for tool in self.SINGLE_DEPT_TOOLS:
            deny(self, FDEAN, tool, {"department": "%"})
        deny(self, FDEAN, "get_cross_department_collaboration", {"dept_a": "%", "dept_b": "MCA"})

    def test_vc_is_unrestricted(self):
        for tool in self.SINGLE_DEPT_TOOLS:
            allow(self, VC, tool, {})
            allow(self, VC, tool, {"department": "Physics"})
        allow(self, VC, "get_cross_department_collaboration", {"dept_a": "CSE", "dept_b": "Physics"})


class CampusToolRules(unittest.TestCase):
    """get_campus_stats (everyone) and list_campus_publications (Executive Dean and VC)."""

    def test_campus_stats_is_offered_to_every_role(self):
        for sc in (FACULTY, HOD, FDEAN, EDEAN, VC):
            allow(self, sc, "get_campus_stats", {"campus": "Belgaum campus"})

    def test_department_breakdown_only_for_roles_that_may_compare_departments(self):
        for sc, expected in ((FACULTY, False), (FDEAN, False), (HOD, True), (EDEAN, True), (VC, True)):
            d = allow(self, sc, "get_campus_stats", {"campus": "Belagavi"}, include_departments=expected)
            self.assertEqual(d.args.get("campus"), "Belagavi")

    def test_paper_lists_are_executive_dean_and_vc_only(self):
        allow(self, EDEAN, "list_campus_publications", {"campus": "Belagavi"})
        allow(self, VC, "list_campus_publications", {"campus": "Belagavi"})
        for sc in (FACULTY, HOD, FDEAN):
            deny(self, sc, "list_campus_publications", {"campus": "Belagavi"})

    def test_trusted_argument_cannot_be_supplied_by_the_model(self):
        d = allow(self, FACULTY, "get_campus_stats", {"campus": "Belagavi", "include_departments": True},
                  include_departments=False)
        self.assertFalse(d.args["include_departments"])


class CampusTopAuthorsRules(unittest.TestCase):
    """get_campus_top_authors returns names, so it follows the inactive-faculty scoping."""

    def test_faculty_never_has_it(self):
        deny(self, FACULTY, "get_campus_top_authors", {"campus": "Belagavi"})

    def test_hod_only_for_their_own_department(self):
        d = allow(self, HOD, "get_campus_top_authors", {"campus": "Belgaum"})
        self.assertEqual(d.args.get("scope_departments"), [CSE])
        allow(self, HOD, "get_campus_top_authors", {"campus": "Belagavi", "department": "CSE"}, scope_departments=[CSE])
        deny(self, HOD, "get_campus_top_authors", {"campus": "Belagavi", "department": "Physics"})

    def test_faculty_dean_own_school_only(self):
        d = allow(self, FDEAN, "get_campus_top_authors", {"campus": "Belagavi"})
        self.assertEqual(sorted(d.args.get("scope_departments")), sorted([CSE, MCA]))
        allow(self, FDEAN, "get_campus_top_authors", {"campus": "Belagavi", "department": "MCA"}, scope_departments=[MCA])
        deny(self, FDEAN, "get_campus_top_authors", {"campus": "Belagavi", "department": "Physics"})

    def test_executive_dean_and_vc_any_department(self):
        d = allow(self, EDEAN, "get_campus_top_authors", {"campus": "Belagavi"})
        self.assertNotIn("scope_departments", d.args)
        allow(self, EDEAN, "get_campus_top_authors", {"campus": "Belagavi", "department": "ECE"}, scope_departments=[ECE])
        d = allow(self, VC, "get_campus_top_authors", {"campus": "Belagavi"})
        self.assertNotIn("scope_departments", d.args)
        allow(self, VC, "get_campus_top_authors", {"campus": "Belagavi", "department": "physics"}, scope_departments=[PHY])

    def test_unknown_department_text_is_denied(self):
        for sc in (HOD, FDEAN, EDEAN, VC):
            deny(self, sc, "get_campus_top_authors", {"campus": "Belagavi", "department": "%"})


class GeneralRules(unittest.TestCase):
    def test_unknown_tool_and_persona_are_denied(self):
        for sc in (FACULTY, HOD, FDEAN, EDEAN, VC):
            deny(self, sc, "execute_sql", {"sql": "select 1"})
            deny(self, sc, "drop_everything", {})
        deny(self, scope("vice_chancellor", persona_id="mystery"), "get_yearly_stats", {"year": 2024})

    def test_hidden_tools_are_denied_even_if_the_model_calls_them(self):
        deny(self, FACULTY, "compare_entities", {"entity_type": "department"})
        deny(self, HOD, "get_institute_summary", {})

    def test_bad_arguments_are_denied(self):
        deny(self, HOD, "get_department_stats", {"department": "CSE", "top_n": "many"})

    def test_directory_outage_fails_closed(self):
        scope_guard.clear_directory_cache()
        with mock.patch.object(scope_guard, "_directory_loader", side_effect=RuntimeError("db down")):
            d = authorize(HOD, "get_department_stats", {"department": "Physics"})
        self.assertFalse(d.allowed)
        self.assertIn("temporarily unavailable", d.message)
        scope_guard.clear_directory_cache()

    def test_faculty_self_lookup_needs_no_directory(self):
        scope_guard.clear_directory_cache()
        with mock.patch.object(scope_guard, "_directory_loader", side_effect=RuntimeError("db down")):
            self.assertTrue(authorize(FACULTY, "get_faculty_stats", {"faculty_name": "me"}).allowed)
        scope_guard.clear_directory_cache()

    def test_university_overview_needs_no_directory(self):
        scope_guard.clear_directory_cache()
        with mock.patch.object(scope_guard, "_directory_loader", side_effect=RuntimeError("db down")):
            for sc in (FACULTY, HOD, FDEAN, EDEAN, VC):
                self.assertTrue(authorize(sc, "get_university_overview", {}).allowed, sc.persona_id)
        scope_guard.clear_directory_cache()

    def test_tools_shown_to_the_model(self):
        names = lambda sc, msg="": sorted(t["function"]["name"] for t in filter_tools(tools.TOOLS, sc, msg))
        self.assertEqual(len(names(VC)), 21)
        self.assertEqual(len(names(HOD)), 16)
        self.assertNotIn("compare_entities", names(FACULTY))
        self.assertNotIn("get_institute_summary", names(FACULTY))
        self.assertNotIn("get_inactive_faculty", names(FACULTY))
        self.assertIn("get_top_journals", names(FACULTY))
        self.assertEqual(len(names(FACULTY)), 13)
        self.assertNotIn("get_institute_summary", names(HOD))
        base = [
            "compare_entities", "count_qrank_publications", "get_department_stats", "get_yearly_stats",
            "get_qrank_distribution", "get_institute_summary", "get_university_overview", "get_department_trend",
            "get_top_journals", "get_campus_stats",
            # individual faculty: Executive Dean any person, Faculty Dean own school (guard-scoped)
            "get_faculty_stats", "search_publications_by_author", "get_inactive_faculty",
            "get_top_cited_publications", "get_department_benchmark", "get_citations_by_year",
            "get_campus_top_authors",
        ]
        self.assertEqual(names(EDEAN), sorted(base + ["list_campus_publications"]))
        self.assertNotIn("list_campus_publications", names(FDEAN))
        self.assertEqual(names(FDEAN), sorted(base + [
            "get_author_concentration", "get_cross_department_collaboration", "get_growth_acceleration",
        ]))
        self.assertEqual(names(EDEAN, DRILL), names(EDEAN), "the tool list no longer depends on the message")
        self.assertEqual(names(scope("vice_chancellor", persona_id="mystery")), [])

    def test_dean_cluster_tools_are_faculty_dean_only(self):
        names = lambda sc: sorted(t["function"]["name"] for t in filter_tools(tools.TOOLS, sc))
        cluster = {"get_author_concentration", "get_cross_department_collaboration", "get_growth_acceleration"}
        self.assertTrue(cluster <= set(names(FDEAN)))
        self.assertTrue(cluster <= set(names(VC)))
        for sc in (FACULTY, HOD, EDEAN):
            self.assertFalse(cluster & set(names(sc)), sc.persona_id)

    def test_no_trusted_argument_is_in_the_model_facing_schemas(self):
        for t in tools.TOOLS:
            props = set(t["function"]["parameters"]["properties"])
            self.assertFalse(
                props & {"ria_user_id", "scope_departments", "include_names", "scope_institutes",
                         "dept_a_scope", "dept_b_scope"},
                t["function"]["name"],
            )


# ─────────────────────────────────────────────────────────────
# The tools themselves: the SQL they build
# ─────────────────────────────────────────────────────────────

FAC_ROW = dict(ria_user_id=232730, faculty_id="fac-uday", author_name="Uday Kulkarni", department=CSE,
               institute="School of CSE", short_name="SoCSE",
               total_pub_count=112, scopus_citation=900, scopus_hindex=15, scopus_q1_count=30, wos_q1_count=5,
               journal_count=60, conference_count=50, wos_pub_count=40, wos_hindex=9, avg_citescore=3.1, avg_impfactor=2.2,
               match_score=1.0)


AGG_ROW = dict(faculty_count=30, total_hindex=200, avg_hindex=6.67, pubs=500, cit=9000, q1=100, j=300, c=200)
DEPT_ROW = dict(department=CSE, faculty_count=1, total_hindex=1, avg_hindex=1, total_publications=1, total_citations=1,
                total_q1=1, total_journals=1, total_conferences=1, pubs_per_faculty=1)


class FakeSQL:
    def __init__(self, *responses):
        self.calls: list[str] = []
        self._responses = list(responses)

    def __call__(self, sql):
        self.calls.append(" ".join(sql.split()))
        return self._responses.pop(0) if self._responses else []


class ToolSqlTests(unittest.TestCase):
    def run_tool(self, fn, fake, *a, **kw):
        with mock.patch.object(tools, "execute_sql", fake):
            return json.loads(fn(*a, **kw))

    def test_faculty_stats_pinned_by_id_has_no_name_matching(self):
        fake = FakeSQL([FAC_ROW], [])
        out = self.run_tool(tools.get_faculty_stats, fake, "whatever the model typed", ria_user_id=232730)
        self.assertEqual(out["status"], "success")
        self.assertIn("WHERE ria_user_id = 232730", fake.calls[0])
        self.assertNotIn("similarity", fake.calls[0])
        self.assertNotIn("whatever", fake.calls[0])

    def test_faculty_stats_department_scope_is_exact(self):
        fake = FakeSQL([FAC_ROW], [])
        self.run_tool(tools.get_faculty_stats, fake, "Uday", scope_departments=[CSE])
        self.assertIn(f"AND department IN ('{CSE}')", fake.calls[0])

    def test_faculty_stats_scope_miss_is_forbidden_not_no_match(self):
        out = self.run_tool(tools.get_faculty_stats, FakeSQL([]), "Someone Elsewhere", scope_departments=[CSE])
        self.assertEqual(out["status"], "forbidden")
        self.assertIn(CSE, out["message"])
        out = self.run_tool(tools.get_faculty_stats, FakeSQL([]), "Someone Elsewhere")
        self.assertEqual(out["status"], "no_match")

    def test_unrestricted_faculty_stats_tries_the_exact_name_first(self):
        fake = FakeSQL([FAC_ROW], [])
        out = self.run_tool(tools.get_faculty_stats, fake, "Dr. Uday Kulkarni")
        self.assertEqual(out["status"], "success")
        self.assertIn("lower(author_name) = lower('Uday Kulkarni')", fake.calls[0])   # title stripped
        self.assertNotIn("department IN", fake.calls[0])

    def test_a_surname_shared_by_several_people_is_always_ambiguous(self):
        # Role testing: for "Dr. Patil's publication trend" the HoD was asked "which Patil?" but the
        # VC silently got one Patil's numbers (the per-person tools took the best trigram match).
        # Every per-person tool now resolves names the same way.
        patils = [dict(_name="Pooja Patil", _dept=CSE, ria_user_id=1, faculty_id="a", author_name="Pooja Patil",
                       department=CSE, _total=2),
                  dict(_name="Uma S Patil", _dept=CSE, ria_user_id=2, faculty_id="b", author_name="Uma S Patil",
                       department=CSE, _total=2)]
        for fn in (tools.get_faculty_stats, tools.get_citations_by_year, tools.get_top_cited_publications,
                   tools.get_department_benchmark, tools.search_publications_by_author):
            fake = FakeSQL([], patils)
            out = self.run_tool(fn, fake, "Dr. Patil")
            self.assertEqual(out["status"], "ambiguous", fn.__name__)
            self.assertEqual([c["name"] for c in out["candidates"]], ["Pooja Patil", "Uma S Patil"], fn.__name__)
            self.assertIn("~* '\\mpatil\\M'", fake.calls[1], fn.__name__)

    def test_a_unique_surname_resolves(self):
        one = [dict(_name="Sunil Gurlahosur V", _dept=CSE, ria_user_id=9, faculty_id="s", author_name="Sunil Gurlahosur V",
                    department=CSE, _total=1)]
        fake = FakeSQL([], one, [])
        out = self.run_tool(tools.get_citations_by_year, fake, "Gurlahosur")
        self.assertNotEqual(out["status"], "ambiguous")
        self.assertIn("fp.faculty_id = 's'", fake.calls[2])

    def test_near_tied_similarity_matches_are_ambiguous(self):
        rows = [dict(_name="A Kulkarni", _dept=CSE, _score=0.62, ria_user_id=1, faculty_id="a"),
                dict(_name="B Kulkarni", _dept=PHY, _score=0.60, ria_user_id=2, faculty_id="b")]
        out = self.run_tool(tools.get_citations_by_year, FakeSQL([], rows), "X Kulkarni")
        self.assertEqual(out["status"], "ambiguous")

    def test_faculty_stats_qrank_breakdown_uses_the_junction_not_staff_ria_user_id(self):
        # staff_ria_user_id is only the FIRST resolvable author per paper and undercounts
        # co-authors; the junction gives an exact per-person join. On real data this changed
        # one sampled faculty member's Q3 count from 40 to the true 52.
        fake = FakeSQL([FAC_ROW], [{"q_rank_scopus": "Q1", "cnt": 3}, {"q_rank_scopus": "Q3", "cnt": 52}])
        out = self.run_tool(tools.get_faculty_stats, fake, "Uday Kulkarni")
        self.assertEqual((out["data"]["q1_count"], out["data"]["q3_count"]), (3, 52))
        self.assertIn("faculty_publications", fake.calls[1])
        self.assertIn(f"fp.faculty_id = '{FAC_ROW['faculty_id']}'", fake.calls[1])
        self.assertNotIn("staff_ria_user_id", fake.calls[1])

    def test_empty_scope_is_forbidden_without_touching_the_database(self):
        fake = FakeSQL()
        for fn, args in ((tools.get_faculty_stats, ("A",)), (tools.get_department_stats, ("CSE",)),
                         (tools.count_qrank_publications, ()), (tools.search_publications_by_author, ("A",)),
                         (tools.compare_entities, ()), (tools.get_yearly_stats, (2024,))):
            out = self.run_tool(fn, fake, *args, scope_departments=[])
            self.assertEqual(out["status"], "forbidden", fn.__name__)
        self.assertEqual(fake.calls, [])

    def test_department_stats_without_names(self):
        fake = FakeSQL([AGG_ROW])
        out = self.run_tool(tools.get_department_stats, fake, "", scope_departments=[CSE], include_names=False)
        self.assertEqual(len(fake.calls), 1, "the top-N (names) query must not even run")
        self.assertEqual(out["summary"]["faculty_count"], 30)
        self.assertFalse([k for k in out if k.startswith("top_")])
        self.assertIn("names are not available", out["note"])
        self.assertIn(f"WHERE department IN ('{CSE}')", fake.calls[0])

    def test_department_totals_count_distinct_papers(self):
        # Role testing: CSE was 2,023 papers / 56 Q1 here (sum of per-faculty counts, so a paper
        # with five CSE authors counted five times) and 1,465 / 59 in the Q-rank tools.
        fake = FakeSQL([AGG_ROW])
        out = self.run_tool(tools.get_department_stats, fake, "", scope_departments=[CSE, MCA], include_names=False)
        sql = fake.calls[0]
        self.assertIn("SELECT DISTINCT id, cit, q, t FROM", sql)
        self.assertIn(f"WHERE dep IN ('{CSE}', '{MCA}')", sql)
        self.assertNotIn("SUM(total_pub_count)", sql)
        self.assertNotIn("SUM(scopus_q1_count)", sql)
        self.assertEqual((out["summary"]["total_publications"], out["summary"]["total_q1_publications"]), (500, 100))
        self.assertIn("counting", out)

    def test_department_stats_with_names(self):
        top = [dict(author_name="Uday Kulkarni", scopus_hindex=15, scopus_citation=900, total_pub_count=112, scopus_q1_count=30)]
        fake = FakeSQL([AGG_ROW], top)
        out = self.run_tool(tools.get_department_stats, fake, "", scope_departments=[CSE], include_names=True)
        self.assertEqual(out["top_5_by_citations"][0]["name"], "Uday Kulkarni")

    def test_unrestricted_department_stats_resolves_names_first(self):
        fake = FakeSQL([{"department": CSE}], [AGG_ROW], [])
        out = self.run_tool(tools.get_department_stats, fake, "CSE")
        self.assertIn("department ILIKE '%Computer Science and Engineering%' OR short_name ILIKE", fake.calls[0])
        self.assertIn(f"WHERE dep IN ('{CSE}')", fake.calls[1])
        self.assertEqual(out["department_resolved"], CSE)

    def test_publication_counts_use_canonical_names_and_escape_them(self):
        fake = FakeSQL([{"cnt": 5}])
        out = self.run_tool(tools.count_qrank_publications, fake, "Q1", "ignored by scope", 2024, scope_departments=["A_B%'C"])
        self.assertEqual(out["count"], 5)
        sql = fake.calls[0]
        self.assertIn("(';' || home_author_department || ';') ILIKE '%;A\\_B\\%''C;%'", sql)
        self.assertNotIn("ignored by scope", sql)
        fake = FakeSQL([{"cnt": 5}])
        self.run_tool(tools.count_qrank_publications, fake, scope_departments=[CSE, PHY])
        self.assertIn(
            f"((';' || home_author_department || ';') ILIKE '%;{CSE};%' OR "
            f"(';' || home_author_department || ';') ILIKE '%;{PHY};%')",
            fake.calls[0],
        )

    def test_department_matching_does_not_bleed_into_a_superstring_department(self):
        # 'Management' is a substring of 'Management Studies' — a plain ILIKE would wrongly
        # match papers whose real department is the other one. See the tool's own department
        # name resolution too: the guard resolves free text to one canonical name before this
        # ever runs, but the SQL itself must also not blur two distinct department names.
        fake = FakeSQL([{"cnt": 1}])
        self.run_tool(tools.count_qrank_publications, fake, department=None, scope_departments=["Management"])
        sql = fake.calls[0]
        self.assertIn("ILIKE '%;Management;%'", sql)
        self.assertNotIn("Management Studies", sql)

    def test_yearly_stats_scoped(self):
        fake = FakeSQL([{"cnt": 3}])
        self.run_tool(tools.get_yearly_stats, fake, 2024, None, scope_departments=[CSE])
        self.assertIn(f"AND ((';' || home_author_department || ';') ILIKE '%;{CSE};%')", fake.calls[0])
        fake = FakeSQL([{"year": 2024, "cnt": 3}, {"year": 2023, "cnt": 2}])
        self.run_tool(tools.get_yearly_stats, fake, None, None, scope_departments=[CSE])
        self.assertIn(f"AND ((';' || home_author_department || ';') ILIKE '%;{CSE};%')", fake.calls[0])

    def test_publications_pinned_by_id(self):
        row = dict(title="T", year=2024, source_publication="J", article_type="A", q_rank_scopus="Q1", scs_citations=2, doi="d", home_authors="x")
        fake = FakeSQL([row])
        out = self.run_tool(tools.search_publications_by_author, fake, "typed by model", ria_user_id=232730)
        self.assertEqual(out["count"], 1)
        self.assertIn("LIKE '%;232730;%'", fake.calls[0])
        self.assertIn("home_author_userid", fake.calls[0])
        self.assertNotIn("home_authors ILIKE", fake.calls[0])
        self.assertNotIn("typed by model", fake.calls[0])

    def test_publications_department_scope_resolves_inside_department_first(self):
        row = dict(title="T", year=2024, source_publication="J", article_type="A", q_rank_scopus="Q1", scs_citations=2, doi="d", home_authors="x")
        fake = FakeSQL([{"ria_user_id": 232730}], [row])
        out = self.run_tool(tools.search_publications_by_author, fake, "Uday", scope_departments=[CSE])
        self.assertEqual(out["count"], 1)
        self.assertIn(f"AND department IN ('{CSE}')", fake.calls[0])
        self.assertIn("LIKE '%;232730;%'", fake.calls[1])
        out = self.run_tool(tools.search_publications_by_author, FakeSQL([]), "Someone Else", scope_departments=[CSE])
        self.assertEqual(out["status"], "forbidden")

    def test_compare_scoped_departments(self):
        fake = FakeSQL([DEPT_ROW])
        out = self.run_tool(tools.compare_entities, fake, "department", ["ignored"], "citations", 10, "", scope_departments=[CSE, MCA], include_names=False)
        self.assertEqual(out["status"], "success")
        self.assertIn(f"WHERE department IN ('{CSE}', '{MCA}') GROUP BY department", fake.calls[0])
        self.assertIn("ORDER BY total_citations DESC", fake.calls[0])
        self.assertNotIn("ignored", fake.calls[0])

    def test_rank_departments_by_q1_and_per_faculty(self):
        # Role testing: "which department published the most Q1 papers?" and "rank departments by
        # publications per faculty" must be one compare_entities call each.
        for metric, col in (("q1_count", "total_q1"), ("publications_per_faculty", "pubs_per_faculty"),
                            ("publications", "total_publications")):
            fake = FakeSQL([DEPT_ROW])
            out = self.run_tool(tools.compare_entities, fake, "department", None, metric, 50, "")
            self.assertEqual(out["status"], "success", metric)
            self.assertIn(f"ORDER BY {col} DESC", fake.calls[0])
            self.assertIn("LIMIT 50", fake.calls[0])
            self.assertIn("unnest(string_to_array(p.home_author_department, ';'))", fake.calls[0])
        self.assertIn("publications_per_faculty", out["data"][0])

    def test_compare_faculty_without_names_is_forbidden(self):
        fake = FakeSQL()
        out = self.run_tool(tools.compare_entities, fake, "faculty", None, "citations", 10, "", include_names=False)
        self.assertEqual(out["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_compare_faculty_scoped(self):
        row = dict(author_name="Uday Kulkarni", department=CSE, total_pub_count=1, scopus_citation=1, scopus_hindex=1,
                   scopus_q1_count=1, journal_count=1, conference_count=1)
        fake = FakeSQL([row])
        self.run_tool(tools.compare_entities, fake, "faculty", None, "citations", 10, "Physics", scope_departments=[CSE])
        self.assertIn(f"WHERE department IN ('{CSE}')", fake.calls[0])
        self.assertNotIn("Physics", fake.calls[0])
        fake = FakeSQL([row], [row])
        self.run_tool(tools.compare_entities, fake, "faculty", ["A B", "C D"], "citations", 10, "", scope_departments=[CSE])
        for sql in fake.calls:
            self.assertIn(f"> 0.2 AND department IN ('{CSE}')", sql)

    def test_trusted_arguments_are_keyword_only(self):
        with self.assertRaises(TypeError):
            tools.get_department_stats("CSE", 5, [CSE])          # scope_departments cannot be passed positionally

    # ── get_qrank_distribution ──────────────────────────────
    def test_qrank_distribution_unrestricted(self):
        fake = FakeSQL([{"q_rank_scopus": "Q1", "cnt": 30}, {"q_rank_scopus": "Q2", "cnt": 20},
                        {"q_rank_scopus": "Q3", "cnt": 40}, {"q_rank_scopus": "Q4", "cnt": 10}])
        out = self.run_tool(tools.get_qrank_distribution, fake, "CSE", 2024)
        self.assertEqual(out["status"], "success")
        self.assertEqual((out["q1_count"], out["q2_count"], out["q3_count"], out["q4_count"]), (30, 20, 40, 10))
        self.assertEqual(out["total_ranked"], 100)
        self.assertEqual(out["q1_q2_share_percent"], 50.0)
        self.assertIn(f"(';' || home_author_department || ';') ILIKE '%;{CSE};%'", fake.calls[0])
        self.assertIn("AND year = 2024", fake.calls[0])

    def test_qrank_distribution_scoped_and_escaped(self):
        fake = FakeSQL([{"q_rank_scopus": "Q1", "cnt": 5}])
        out = self.run_tool(tools.get_qrank_distribution, fake, None, None, scope_departments=["A_B%'C"])
        self.assertEqual(out["q1_count"], 5)
        self.assertIn("(';' || home_author_department || ';') ILIKE '%;A\\_B\\%''C;%'", fake.calls[0])

    def test_qrank_distribution_empty_scope_is_forbidden(self):
        fake = FakeSQL()
        out = self.run_tool(tools.get_qrank_distribution, fake, scope_departments=[])
        self.assertEqual(out["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_qrank_distribution_no_data_is_zeroed(self):
        out = self.run_tool(tools.get_qrank_distribution, FakeSQL([]))
        self.assertEqual(out["total_ranked"], 0)
        self.assertEqual(out["q1_q2_share_percent"], 0)

    # ── get_institute_summary ────────────────────────────────
    # "name" is what get_institute_summary's SELECT * returns; "institute" is what
    # compare_entities' "name AS institute" alias returns. Both keys cover either caller.
    INST_ROW = dict(institute="School of Computer Science and Engineering",
                    short_name="CSE", faculty_count=132, total_hindex=380, avg_hindex=2.9, total_publications=1668,
                    total_citations=7945, total_q1=81, total_journals=515, total_conferences=1076, pubs_per_faculty=11.35)

    def test_institute_summary_scoped(self):
        fake = FakeSQL([self.INST_ROW])
        out = self.run_tool(tools.get_institute_summary, fake, None,
                            scope_institutes=["School of Computer Science and Engineering"])
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["data"][0]["institute"], "School of Computer Science and Engineering")
        self.assertIn("WHERE i.name = 'School of Computer Science and Engineering'", fake.calls[0])
        self.assertNotIn("v_institute_summary", fake.calls[0])

    def test_institute_summary_empty_scope_is_forbidden(self):
        out = self.run_tool(tools.get_institute_summary, FakeSQL(), None, scope_institutes=[])
        self.assertEqual(out["status"], "forbidden")

    def test_institute_summary_unrestricted_all_and_one(self):
        fake = FakeSQL([self.INST_ROW, self.INST_ROW])
        out = self.run_tool(tools.get_institute_summary, fake, None)
        self.assertEqual(out["query"], "All schools")
        self.assertEqual(len(out["data"]), 2)
        fake = FakeSQL([self.INST_ROW])
        out = self.run_tool(tools.get_institute_summary, fake, "CSE")
        self.assertIn("i.name ILIKE '%CSE%' OR i.short_name ILIKE '%CSE%'", fake.calls[0])
        self.assertEqual(out["data"][0]["avg_hindex"], 2.9)

    def test_institute_summary_no_match(self):
        out = self.run_tool(tools.get_institute_summary, FakeSQL([]), "Nonexistent School")
        self.assertEqual(out["status"], "no_match")

    # ── get_university_overview ──────────────────────────────
    def test_university_overview(self):
        fake = FakeSQL(
            [{"total_publications": 7061, "total_citations": 55000}],
            [{"q_rank_scopus": "Q1", "cnt": 700}, {"q_rank_scopus": "Q2", "cnt": 900}],
            [{"faculty_count": 739, "avg_hindex": 3.1}],
            [{"department": CSE, "total_publications": 2288, "total_citations": 13237}],
        )
        out = self.run_tool(tools.get_university_overview, fake)
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["total_publications"], 7061)
        self.assertEqual(out["q1_count"], 700)
        self.assertEqual(out["q2_count"], 900)
        self.assertEqual(out["q3_count"], 0)
        self.assertEqual(out["faculty_count"], 739)
        self.assertEqual(out["top_5_departments_by_publications"][0]["department"], CSE)
        self.assertIn("COUNT(DISTINCT id)", fake.calls[0])

    def test_university_overview_propagates_sql_errors(self):
        out = self.run_tool(tools.get_university_overview, FakeSQL({"error": "db down"}))
        self.assertEqual(out["status"], "error")

    def test_university_overview_takes_no_arguments(self):
        with self.assertRaises(TypeError):
            tools.get_university_overview(department="CSE")

    # ── compare_entities(institute) ──────────────────────────
    def test_compare_institutes_ranking(self):
        fake = FakeSQL([self.INST_ROW])
        out = self.run_tool(tools.compare_entities, fake, "institute", None, "citations", 8, "")
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["comparison_type"], "institute")
        self.assertEqual(out["data"][0]["institute"], "School of Computer Science and Engineering")
        self.assertIn("ORDER BY total_citations DESC", fake.calls[0])
        self.assertIn("LIMIT 8", fake.calls[0])

    def test_compare_institutes_specific(self):
        fake = FakeSQL([self.INST_ROW])
        out = self.run_tool(tools.compare_entities, fake, "institute", ["CSE", "EEE"], "publications", 10, "")
        self.assertEqual(out["status"], "success")
        self.assertIn("(i.name = 'CSE' OR i.short_name = 'CSE')", fake.calls[0])
        self.assertIn("ORDER BY total_publications DESC", fake.calls[0])
        self.assertNotIn("LIMIT", fake.calls[0])

    def test_compare_institutes_no_match(self):
        out = self.run_tool(tools.compare_entities, FakeSQL([]), "institute")
        self.assertEqual(out["status"], "no_match")

    # ── campus tools ─────────────────────────────────────────
    def test_campus_names_resolve(self):
        for text, want in (("Belgaum campus", "Belagavi"), ("belagavi", "Belagavi"), ("BVB", "Hubballi"),
                           ("Hubli", "Hubballi"), ("hubballi campus", "Hubballi"), ("Bangalore", "Bengaluru"),
                           ("Mars", None), ("", None), (None, None)):
            self.assertEqual(tools._resolve_campus(text), want, text)

    def test_campus_stats_counts_each_campus_and_the_dashboard_figure(self):
        row = dict(any_author=1174, only_this=1020, scopus_indexed=722, scopus_ranked=451, q1=155, q2=1, q3=1, q4=1,
                   journals=1, conferences=1, scopus_citations=1)
        fake = FakeSQL([{"n": 7061}], [row])
        out = self.run_tool(tools.get_campus_stats, fake, "Belgaum campus")
        r = out["data"][0]
        self.assertEqual((r["campus"], r["papers_only_this_campus"], r["papers_with_an_author_from_campus"]),
                         ("Belagavi", 1020, 1174))
        self.assertEqual(r["papers_shared_with_other_campuses"], 154)
        self.assertEqual(r["share_of_university_papers_percent"], 14.4)      # the dashboard's 14%
        self.assertIn("%;Belagavi;%", fake.calls[1])
        self.assertIn("trim(home_author_location) = 'Belagavi'", fake.calls[1])
        self.assertEqual(len(fake.calls), 2, "no department query unless include_departments")

    def test_campus_stats_returns_the_ratios_so_the_model_does_not_divide(self):
        # Role testing Q09: the model worked out "Q1 about 34%" and "7.9 citations per paper" itself and later had to
        # retract them as unverified. The tool now returns them, with the denominator named.
        row = dict(any_author=1174, only_this=1020, scopus_indexed=722, scopus_ranked=451, q1=155, q2=94, q3=111,
                   q4=91, journals=705, conferences=407, scopus_citations=5732)
        r = self.run_tool(tools.get_campus_stats, FakeSQL([{"n": 7061}], [row]), "Belagavi")["data"][0]
        self.assertEqual(r["q1_share_of_ranked_percent"], 34.4)               # 155 / 451
        self.assertEqual(r["citations_per_scopus_paper"], 7.9)                # 5,732 / 722

    def test_campus_stats_omits_a_ratio_with_no_denominator(self):
        row = dict(any_author=2, only_this=2, scopus_indexed=0, scopus_ranked=0, q1=0, q2=0, q3=0, q4=0,
                   journals=0, conferences=2, scopus_citations=0)
        r = self.run_tool(tools.get_campus_stats, FakeSQL([{"n": 10}], [row]), "Bengaluru")["data"][0]
        self.assertNotIn("q1_share_of_ranked_percent", r)
        self.assertNotIn("citations_per_scopus_paper", r)

    def test_campus_stats_all_campuses_and_year(self):
        row = dict(any_author=1, only_this=1, scopus_indexed=1, scopus_ranked=1, q1=1, q2=0, q3=0, q4=0,
                   journals=1, conferences=0, scopus_citations=1)
        fake = FakeSQL([{"n": 10}], [row], [row], [row])
        out = self.run_tool(tools.get_campus_stats, fake, None, 2024)
        self.assertEqual([r["campus"] for r in out["data"]], ["Hubballi", "Belagavi", "Bengaluru"])
        self.assertTrue(all("year = 2024" in c for c in fake.calls))

    def test_unknown_campus_is_no_match_without_sql(self):
        fake = FakeSQL()
        out = self.run_tool(tools.get_campus_stats, fake, "Mars")
        self.assertEqual(out["status"], "no_match")
        out = self.run_tool(tools.list_campus_publications, fake, "Mars")
        self.assertEqual(out["status"], "no_match")
        self.assertEqual(fake.calls, [])

    def test_list_campus_publications_filters(self):
        row = dict(title="T", year=2026, source_publication="J", article_type="Journal", q_rank_scopus="Q1",
                   scs_citations=2, home_author_location="Belagavi")
        fake = FakeSQL([{"n": 155}], [row])
        out = self.run_tool(tools.list_campus_publications, fake, "Belgaum", "q1", 2026, True, "journal", 5)
        self.assertEqual((out["total_matching"], out["returned"]), (155, 1))
        sql = fake.calls[1]
        for part in ("%;Belagavi;%", "scs_citations IS NOT NULL", "q_rank_scopus = 'Q1'", "year = 2026",
                     "article_type = 'Journal'", "LIMIT 5"):
            self.assertIn(part, sql)
        fake = FakeSQL([{"n": 0}], [])
        self.run_tool(tools.list_campus_publications, fake, "Belagavi", "", None, False)
        self.assertNotIn("scs_citations IS NOT NULL", fake.calls[0])

    def test_list_campus_publications_rejects_bad_quartile(self):
        out = self.run_tool(tools.list_campus_publications, FakeSQL(), "Belagavi", "Q9")
        self.assertEqual(out["status"], "error")

    def test_campus_top_authors_ranks_faculty_on_single_campus_papers(self):
        rows = [dict(name="Rajashri N Khanai", department=CSE, papers=67, scopus=45, q1=7, cites=303),
                dict(name="Sridhar Iyer", department=ECE, papers=34, scopus=27, q1=7, cites=254)]
        fake = FakeSQL(rows, [{"n": 121}])
        out = self.run_tool(tools.get_campus_top_authors, fake, "Belgaum campus")
        self.assertEqual(out["data"][0], ["Rajashri N Khanai", CSE, 67, 45, 7, 303])
        self.assertEqual((out["campus"], out["faculty_with_papers"], out["sorted_by"]), ("Belagavi", 121, "papers"))
        self.assertEqual(out["columns"], ["name", "department", "papers", "scopus_indexed", "q1", "citations"])
        sql = fake.calls[0]
        self.assertIn("trim(p.home_author_location) = 'Belagavi'", sql)      # single-campus papers only
        self.assertIn("faculty_publications fp", sql)
        self.assertIn("ORDER BY papers DESC", sql)
        self.assertIn("LIMIT 10", sql)
        self.assertIn("search_publications_by_author", out["note"])

    def test_campus_top_authors_filters_and_sorts(self):
        fake = FakeSQL([dict(name="A", department=CSE, papers=1, scopus=1, q1=1, cites=1)], [{"n": 1}])
        self.run_tool(tools.get_campus_top_authors, fake, "Belagavi", None, 2024, "q1", 500, scope_departments=[CSE, MCA])
        sql = fake.calls[0]
        self.assertIn("p.year = 2024", sql)
        self.assertIn(f"d.name IN ('{CSE}', '{MCA}')", sql)
        self.assertIn("ORDER BY q1 DESC", sql)
        self.assertIn("LIMIT 25", sql)                                       # capped

    def test_campus_top_authors_bad_input_runs_no_sql(self):
        fake = FakeSQL()
        self.assertEqual(self.run_tool(tools.get_campus_top_authors, fake, "Mars")["status"], "no_match")
        self.assertEqual(self.run_tool(tools.get_campus_top_authors, fake, "Belagavi", metric="nonsense")["status"], "error")
        self.assertEqual(self.run_tool(tools.get_campus_top_authors, fake, "Belagavi", scope_departments=[])["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_a_department_narrows_name_matching_but_never_widens_scope(self):
        # "Show me their papers": the department printed in the previous answer tells two people apart
        rows = [dict(_name="Pooja Patil", _dept=CSE, ria_user_id=1, faculty_id="a", author_name="Pooja Patil", department=CSE)]
        fake = FakeSQL(rows, [])
        self.run_tool(tools.search_publications_by_author, fake, "Pooja Patil", None, None, CSE, 5, "scopus",
                      scope_departments=[CSE, MCA])
        first = fake.calls[0]
        self.assertIn(f"department IN ('{CSE}', '{MCA}')", first)             # the caller's scope is still there
        self.assertIn(f"department ILIKE '%{CSE}%'", first)                    # ...and the department only narrows

    # ── get_department_trend ─────────────────────────────────
    def test_department_trend_explicit_years_is_one_query(self):
        fake = FakeSQL([{"year": 2023, "total": 10, "q1": 3, "q2": 2}])
        out = self.run_tool(tools.get_department_trend, fake, "CSE", 2023, 2024)
        self.assertEqual(out["status"], "success")
        self.assertEqual(len(fake.calls), 1, "explicit from/to years must not query MAX(year)")
        self.assertEqual(out["yearly"], [
            {"year": 2023, "publications": 10, "q1_count": 3, "q2_count": 2},
            {"year": 2024, "publications": 0, "q1_count": 0, "q2_count": 0},   # zero-filled, no data returned
        ])
        self.assertIn(f"(';' || home_author_department || ';') ILIKE '%;{CSE};%'", fake.calls[0])

    def test_department_trend_defaults_to_last_5_complete_years(self):
        fake = FakeSQL([{"y": 2026}], [])
        out = self.run_tool(tools.get_department_trend, fake, "CSE")
        self.assertEqual((out["from_year"], out["to_year"]), (2021, 2025))
        self.assertEqual(len(fake.calls), 2)
        self.assertIn("MAX(year)", fake.calls[0])
        self.assertIn("BETWEEN 2021 AND 2025", fake.calls[1])

    def test_department_trend_scoped(self):
        fake = FakeSQL([])
        self.run_tool(tools.get_department_trend, fake, None, 2023, 2024, scope_departments=[CSE, PHY])
        self.assertIn(f"ILIKE '%;{CSE};%' OR", fake.calls[0])
        self.assertIn(f"ILIKE '%;{PHY};%'", fake.calls[0])

    def test_department_trend_empty_scope_is_forbidden_without_a_query(self):
        fake = FakeSQL()
        out = self.run_tool(tools.get_department_trend, fake, scope_departments=[])
        self.assertEqual(out["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_department_trend_requires_a_department(self):
        out = self.run_tool(tools.get_department_trend, FakeSQL(), None)
        self.assertEqual(out["status"], "error")

    def test_department_trend_bad_years(self):
        for from_year, to_year in ((1500, 2024), (2024, 3000)):
            out = self.run_tool(tools.get_department_trend, FakeSQL(), "CSE", from_year, to_year)
            self.assertEqual(out["status"], "error")

    def test_department_trend_reversed_years_are_swapped(self):
        fake = FakeSQL([])
        out = self.run_tool(tools.get_department_trend, fake, "CSE", 2024, 2022)
        self.assertEqual((out["from_year"], out["to_year"]), (2022, 2024))

    def test_department_trend_is_keyword_only(self):
        with self.assertRaises(TypeError):
            tools.get_department_trend("CSE", 2020, 2024, [CSE])

    # ── get_inactive_faculty ──────────────────────────────────
    def test_inactive_faculty_full_flow(self):
        fake = FakeSQL(
            [{"y": 2026}],                                                    # _latest_complete_year
            [{"cnt": 3}],                                                     # department exists, 3 faculty
            [{"author_name": "A", "last_pub_year": None},                     # never published
             {"author_name": "B", "last_pub_year": 2019}],                    # inactive
        )
        out = self.run_tool(tools.get_inactive_faculty, fake, "CSE", 12)
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["reference_year"], 2025)
        self.assertEqual(out["cutoff_year"], 2025)                            # 12 months -> 1 year back
        self.assertEqual(out["inactive_count"], 2)
        self.assertEqual(out["inactive_faculty"], [["A", None], ["B", 2019]])     # compact [name, last year] pairs
        self.assertEqual(out["columns"], ["name", "last_publication_year"])
        self.assertIn("faculty_publications", fake.calls[2])
        self.assertIn(f"ILIKE '%{CSE}%'", fake.calls[1])          # "CSE" is expanded to the full name

    def test_inactive_faculty_counts_list_every_department(self):
        # 31 departments have faculty; the list used to stop at 25 while the totals covered all of them.
        rows = [{"department": f"Dept {i}", "faculty": 10, "inactive": 31 - i, "never": 1} for i in range(31)]
        out = self.run_tool(tools.get_inactive_faculty, FakeSQL([{"y": 2026}], rows), None, 24)
        self.assertEqual(len(out["by_department"]), 31)
        self.assertEqual(out["faculty_total"], 310)

    def test_inactive_faculty_splits_never_published_from_older(self):
        fake = FakeSQL([{"y": 2026}], [{"cnt": 4}],
                       [{"author_name": "A", "last_pub_year": None}, {"author_name": "B", "last_pub_year": None},
                        {"author_name": "C", "last_pub_year": 2019}])
        out = self.run_tool(tools.get_inactive_faculty, fake, "CSE", 24)
        self.assertEqual((out["inactive_count"], out["no_paper_on_record"], out["last_published_before_window"]), (3, 2, 1))

    def test_inactive_faculty_rule_only_for_personas_with_the_tool(self):
        with_tool = tools.build_ria_prompt(["get_inactive_faculty"])
        self.assertIn("name only departments that appear in the result", with_tool)
        self.assertNotIn("name only departments that appear in the result", tools.build_ria_prompt(["get_faculty_stats"]))

    def test_inactive_faculty_boundary_year_is_active(self):
        # 24 months, newest complete year 2025 -> window 2024..2025: a paper in 2024 keeps the person active
        fake = FakeSQL([{"y": 2026}], [{"cnt": 1}], [])
        out = self.run_tool(tools.get_inactive_faculty, fake, "CSE", 24)
        self.assertEqual(out["cutoff_year"], 2024)
        self.assertIn("last_pub_year < 2024", fake.calls[2])
        self.assertNotIn("last_pub_year <= 2024", fake.calls[2])

    def test_inactive_faculty_department_scoped_uses_exact_match(self):
        fake = FakeSQL([{"y": 2026}], [{"cnt": 1}], [])
        self.run_tool(tools.get_inactive_faculty, fake, None, 12, scope_departments=[CSE])
        self.assertIn(f"department IN ('{CSE}')", fake.calls[1])
        self.assertIn(f"department IN ('{CSE}')", fake.calls[2])

    def test_inactive_faculty_nobody_inactive_is_still_success(self):
        fake = FakeSQL([{"y": 2026}], [{"cnt": 5}], [])
        out = self.run_tool(tools.get_inactive_faculty, fake, "CSE")
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["inactive_count"], 0)

    def test_inactive_faculty_unknown_department_is_no_match(self):
        out = self.run_tool(tools.get_inactive_faculty, FakeSQL([{"y": 2026}], [{"cnt": 0}]), "Nonexistent")
        self.assertEqual(out["status"], "no_match")

    def test_inactive_faculty_months_round_up_to_years(self):
        for months, expected_cutoff in ((12, 2025), (13, 2024), (24, 2024), (25, 2023)):
            fake = FakeSQL([{"y": 2026}], [{"cnt": 1}], [])
            out = self.run_tool(tools.get_inactive_faculty, fake, "CSE", months)
            self.assertEqual(out["cutoff_year"], expected_cutoff, months)

    def test_inactive_faculty_empty_scope_is_forbidden_without_a_query(self):
        fake = FakeSQL()
        out = self.run_tool(tools.get_inactive_faculty, fake, scope_departments=[])
        self.assertEqual(out["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_inactive_faculty_without_a_department_gives_counts_per_department(self):
        # Role testing: the VC's "Faculty with zero publications in 2 years?" had no department, got an error
        # on the first call, then silently answered for ECE only (43k tokens). Several departments or the whole
        # university now return counts per department - never thousands of names.
        rows = [{"department": ECE, "faculty": 103, "inactive": 51, "never": 30}, {"department": CSE, "faculty": 133, "inactive": 49, "never": 28}]
        out = self.run_tool(tools.get_inactive_faculty, FakeSQL([{"y": 2026}], rows), None, 24)
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["by_department"], [[ECE, 51, 103, 30], [CSE, 49, 133, 28]])
        self.assertEqual(out["no_paper_on_record_total"], 58)
        self.assertIn("ALL the departments in scope", out["note"])
        self.assertEqual((out["inactive_total"], out["faculty_total"]), (100, 236))
        self.assertNotIn("inactive_faculty", out)
        self.assertIn("one department", out["note"])

    def test_inactive_faculty_for_a_school_is_counts_too(self):
        rows = [{"department": CSE, "faculty": 133, "inactive": 49}, {"department": MCA, "faculty": 14, "inactive": 2}]
        fake = FakeSQL([{"y": 2026}], rows)
        out = self.run_tool(tools.get_inactive_faculty, fake, None, 12, scope_departments=[CSE, MCA])
        self.assertIn("by_department", out)
        self.assertIn(f"department IN ('{CSE}', '{MCA}')", fake.calls[1])

    def test_inactive_faculty_is_keyword_only(self):
        with self.assertRaises(TypeError):
            tools.get_inactive_faculty("CSE", 12, [CSE])

    # ── _resolve_one_faculty (shared by the three tools below) ──
    def _resolve(self, fake, *a, **kw):
        with mock.patch.object(tools, "execute_sql", fake):
            return tools._resolve_one_faculty(*a, **kw)

    def test_resolve_one_faculty_pinned_vs_named_vs_scoped(self):
        fake = FakeSQL([FAC_ROW])
        person, err = self._resolve(fake, "ignored", ria_user_id=232730)
        self.assertIsNone(err)
        self.assertEqual(person["author_name"], "Uday Kulkarni")
        self.assertIn("WHERE ria_user_id = 232730", fake.calls[0])

        fake = FakeSQL([FAC_ROW])
        self._resolve(fake, "Uday", scope_departments=[CSE])
        self.assertIn(f"AND department IN ('{CSE}')", fake.calls[0])

    def test_resolve_one_faculty_empty_scope_is_forbidden(self):
        fake = FakeSQL()
        person, err = self._resolve(fake, "Uday", scope_departments=[])
        self.assertIsNone(person)
        self.assertEqual(json.loads(err)["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_resolve_one_faculty_not_found_is_scoped_message(self):
        _, err = self._resolve(FakeSQL([]), "Nobody", scope_departments=[CSE])
        self.assertEqual(json.loads(err)["status"], "forbidden")
        _, err = self._resolve(FakeSQL([]), "Nobody")
        self.assertEqual(json.loads(err)["status"], "no_match")

    def test_resolve_one_faculty_requires_a_name_or_id(self):
        _, err = self._resolve(FakeSQL(), "")
        self.assertEqual(json.loads(err)["status"], "error")

    # ── get_top_cited_publications ───────────────────────────
    def test_top_cited_sorted_by_citations(self):
        rows = [
            dict(title="B", year=2021, source_publication="J", q_rank_scopus="Q1", scs_citations=104, doi="d1"),
            dict(title="C", year=2022, source_publication="J", q_rank_scopus="Q1", scs_citations=42, doi="d2"),
        ]
        fake = FakeSQL([FAC_ROW], rows)
        out = self.run_tool(tools.get_top_cited_publications, fake, "Uday Kulkarni", 5)
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["data"][0]["scopus_citations"], 104)
        self.assertIn("faculty_publications", fake.calls[1])
        self.assertIn("ORDER BY p.scs_citations DESC", fake.calls[1])
        self.assertIn("LIMIT 5", fake.calls[1])

    def test_top_cited_no_publications(self):
        out = self.run_tool(tools.get_top_cited_publications, FakeSQL([FAC_ROW], []), "Uday")
        self.assertEqual(out["status"], "no_match")

    def test_top_cited_limit_is_bounded(self):
        fake = FakeSQL([FAC_ROW], [])
        self.run_tool(tools.get_top_cited_publications, fake, "Uday", 999)
        self.assertIn("LIMIT 30", fake.calls[1])

    def test_top_cited_pinned_and_scoped_deny_paths(self):
        out = self.run_tool(tools.get_top_cited_publications, FakeSQL([]), "Someone Else", scope_departments=[CSE])
        self.assertEqual(out["status"], "forbidden")

    # ── get_department_benchmark ──────────────────────────────
    def test_department_benchmark_compares_own_to_department(self):
        dept_row = dict(faculty_count=132, avg_pub=15.2, avg_citation=88.7, avg_hindex=2.8,
                        median_pub=10.0, median_citation=40.0, median_hindex=2.0)
        own_row = dict(total_pub_count=112, scopus_citation=900, scopus_hindex=15)
        fake = FakeSQL([FAC_ROW], [dept_row], [own_row])
        out = self.run_tool(tools.get_department_benchmark, fake, "Uday Kulkarni")
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["department_faculty_count"], 132)
        self.assertEqual(out["own"]["publications"], 112)
        self.assertEqual(out["department_average"]["publications"], 15.2)
        self.assertEqual(out["vs_department_average"], {"publications": "above", "citations": "above", "hindex": "above"})

    def test_department_benchmark_below_average(self):
        dept_row = dict(faculty_count=10, avg_pub=200, avg_citation=2000, avg_hindex=30,
                        median_pub=200, median_citation=2000, median_hindex=30)
        own_row = dict(total_pub_count=5, scopus_citation=10, scopus_hindex=1)
        out = self.run_tool(tools.get_department_benchmark, FakeSQL([FAC_ROW], [dept_row], [own_row]), "Uday")
        self.assertEqual(out["vs_department_average"], {"publications": "below", "citations": "below", "hindex": "below"})

    def test_department_benchmark_denied_for_someone_out_of_scope(self):
        out = self.run_tool(tools.get_department_benchmark, FakeSQL([]), "Someone Else", scope_departments=[CSE])
        self.assertEqual(out["status"], "forbidden")

    # ── get_citations_by_year ─────────────────────────────────
    def test_citations_by_year(self):
        rows = [{"year": 2024, "pubs": 5, "citations": 30}, {"year": 2023, "pubs": 3, "citations": 90}]
        fake = FakeSQL([FAC_ROW], rows)
        out = self.run_tool(tools.get_citations_by_year, fake, "Uday Kulkarni")
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["yearly"], [{"year": 2024, "publications": 5, "citations": 30},
                                         {"year": 2023, "publications": 3, "citations": 90}])
        self.assertIn("trend", out["note"].lower())
        self.assertIn("not", out["note"].lower())

    def test_citations_by_year_no_data(self):
        out = self.run_tool(tools.get_citations_by_year, FakeSQL([FAC_ROW], []), "Uday")
        self.assertEqual(out["status"], "no_match")

    # ── get_author_concentration ───────────────────────────────
    def test_author_concentration_scoped(self):
        fake = FakeSQL([{"total_publications": 100, "author_count": 20, "top_k_publications": 60}])
        out = self.run_tool(tools.get_author_concentration, fake, None, 5, scope_departments=[CSE])
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["concentration_percent"], 60.0)
        self.assertIn(f"f.department IN ('{CSE}')", fake.calls[0])
        self.assertIn("faculty_publications", fake.calls[0])

    def test_author_concentration_top_k_bounded_and_capped_to_author_count(self):
        fake = FakeSQL([{"total_publications": 10, "author_count": 2, "top_k_publications": 10}])
        out = self.run_tool(tools.get_author_concentration, fake, None, 999, scope_departments=[CSE])
        self.assertEqual(out["top_k"], 2, "top_k in the reply should not exceed the actual author count")
        self.assertIn("LIMIT 20", fake.calls[0])   # the SQL-side cap, before the reply-side min()

    def test_author_concentration_empty_scope_is_forbidden(self):
        fake = FakeSQL()
        out = self.run_tool(tools.get_author_concentration, fake, None, 5, scope_departments=[])
        self.assertEqual(out["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_author_concentration_no_data_is_no_match(self):
        out = self.run_tool(tools.get_author_concentration, FakeSQL([{"total_publications": 0, "author_count": 0, "top_k_publications": 0}]),
                             "Nonexistent")
        self.assertEqual(out["status"], "no_match")

    def test_author_concentration_unrestricted_uses_ilike(self):
        fake = FakeSQL([{"total_publications": 1, "author_count": 1, "top_k_publications": 1}])
        self.run_tool(tools.get_author_concentration, fake, "CSE")
        self.assertIn("f.department ILIKE '%Computer Science and Engineering%'", fake.calls[0])

    def test_author_concentration_is_keyword_only_for_scope(self):
        with self.assertRaises(TypeError):
            tools.get_author_concentration("CSE", 5, [CSE])

    # ── get_cross_department_collaboration ─────────────────────
    def test_collaboration_scoped(self):
        fake = FakeSQL([{"cnt": 12}], [{"a_total": 100, "b_total": 40}])
        out = self.run_tool(tools.get_cross_department_collaboration, fake, "ignored a", "ignored b",
                             dept_a_scope=CSE, dept_b_scope=MCA)
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["joint_publications"], 12)
        self.assertEqual(out["joint_share_of_dept_a_percent"], 12.0)
        self.assertEqual(out["joint_share_of_dept_b_percent"], 30.0)
        self.assertIn("faculty_publications", fake.calls[0])
        self.assertIn(f"fa.department = '{CSE}'", fake.calls[0])
        self.assertIn(f"fb.department = '{MCA}'", fake.calls[0])
        self.assertNotIn("ignored", fake.calls[0])
        self.assertNotIn("home_authors", fake.calls[0])

    def test_collaboration_same_department_is_rejected(self):
        out = self.run_tool(tools.get_cross_department_collaboration, FakeSQL(), "x", "y",
                             dept_a_scope=CSE, dept_b_scope=CSE)
        self.assertEqual(out["status"], "error")

    def test_collaboration_unrestricted_resolves_free_text(self):
        fake = FakeSQL([{"department": CSE}], [{"department": MCA}], [{"cnt": 1}], [{"a_total": 1, "b_total": 1}])
        out = self.run_tool(tools.get_cross_department_collaboration, fake, "cse", "computer application")
        self.assertEqual(out["status"], "success")
        self.assertEqual((out["dept_a"], out["dept_b"]), (CSE, MCA))

    def test_collaboration_unresolvable_department_is_no_match(self):
        out = self.run_tool(tools.get_cross_department_collaboration, FakeSQL([]), "Nonexistent", "MCA")
        self.assertEqual(out["status"], "no_match")

    def test_collaboration_is_keyword_only_for_scope(self):
        with self.assertRaises(TypeError):
            tools.get_cross_department_collaboration("CSE", "MCA", CSE, MCA)

    # ── get_growth_acceleration ─────────────────────────────────
    def test_growth_acceleration_single_department(self):
        fake = FakeSQL(
            [{"y": 2026}],                                           # _latest_complete_year -> 2025
            [{"year": 2022, "cnt": 10}, {"year": 2023, "cnt": 20}, {"year": 2024, "cnt": 22}, {"year": 2025, "cnt": 33}],
        )
        out = self.run_tool(tools.get_growth_acceleration, fake, None, scope_departments=[CSE])
        self.assertEqual(out["status"], "success")
        self.assertEqual((out["from_year"], out["to_year"]), (2022, 2025))
        dept = out["departments"][0]
        self.assertEqual(dept["department"], CSE)
        # growth: 2022->2023 +100%, 2023->2024 +10%, 2024->2025 +50%; acceleration = 50 - 10 = 40
        self.assertEqual(dept["growth_percent"], [100.0, 10.0, 50.0])
        self.assertEqual(dept["acceleration"], 40.0)
        self.assertEqual(dept["trend"], "accelerating")
        self.assertIn(f"(';' || home_author_department || ';') ILIKE '%;{CSE};%'", fake.calls[1])

    def test_growth_acceleration_decelerating_and_stable(self):
        fake = FakeSQL(
            [{"y": 2026}],
            [{"year": 2022, "cnt": 10}, {"year": 2023, "cnt": 20}, {"year": 2024, "cnt": 30}, {"year": 2025, "cnt": 33}],
        )
        out = self.run_tool(tools.get_growth_acceleration, fake, None, scope_departments=[CSE])
        # growth: +100%, +50%, +10% -> decelerating
        self.assertEqual(out["departments"][0]["trend"], "decelerating")

        fake = FakeSQL([{"y": 2026}], [{"year": y, "cnt": 10} for y in (2022, 2023, 2024, 2025)])
        out = self.run_tool(tools.get_growth_acceleration, fake, None, scope_departments=[CSE])
        self.assertEqual(out["departments"][0]["growth_percent"], [0.0, 0.0, 0.0])
        self.assertEqual(out["departments"][0]["trend"], "stable")

    def test_growth_acceleration_school_breakdown_is_one_row_per_department(self):
        fake = FakeSQL(
            [{"y": 2026}],
            [{"year": 2025, "cnt": 5}],   # CSE series (other years zero-filled)
            [{"year": 2025, "cnt": 3}],   # MCA series
        )
        out = self.run_tool(tools.get_growth_acceleration, fake, None, scope_departments=[CSE, MCA])
        self.assertEqual([d["department"] for d in out["departments"]], [CSE, MCA])

    def test_growth_acceleration_zero_prior_year_is_null_growth_not_a_crash(self):
        fake = FakeSQL([{"y": 2026}], [{"year": 2024, "cnt": 5}, {"year": 2025, "cnt": 3}])
        out = self.run_tool(tools.get_growth_acceleration, fake, None, scope_departments=[CSE])
        self.assertIsNone(out["departments"][0]["growth_percent"][0])   # from a zero-filled 2022/2023
        self.assertEqual(out["departments"][0]["trend"], "unknown")

    def test_growth_acceleration_empty_scope_is_forbidden(self):
        fake = FakeSQL()
        out = self.run_tool(tools.get_growth_acceleration, fake, None, scope_departments=[])
        self.assertEqual(out["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_growth_acceleration_unrestricted_no_department_is_university_wide(self):
        fake = FakeSQL([{"y": 2026}], [{"year": 2025, "cnt": 7}])
        out = self.run_tool(tools.get_growth_acceleration, fake)
        self.assertEqual(len(out["departments"]), 1)
        self.assertIn("university-wide", out["departments"][0]["department"].lower())
        self.assertIn("WHERE year BETWEEN", fake.calls[1])
        self.assertNotIn("home_author_department", fake.calls[1])

    def test_growth_acceleration_no_yearly_data(self):
        out = self.run_tool(tools.get_growth_acceleration, FakeSQL({"error": "boom"}), None, scope_departments=[CSE])
        self.assertEqual(out["status"], "error")

    def test_growth_acceleration_is_keyword_only_for_scope(self):
        with self.assertRaises(TypeError):
            tools.get_growth_acceleration("CSE", [CSE])


# ─────────────────────────────────────────────────────────────
# The agent loop: nothing reaches a tool except through the guard
# ─────────────────────────────────────────────────────────────

def _llm_reply(content=None, tool_calls=None):
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return 200, {"choices": [{"message": msg}], "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}


def _call(fn, args, cid="c1"):
    return {"id": cid, "type": "function", "function": {"name": fn, "arguments": json.dumps(args)}}


class AgentLoopTests(unittest.TestCase):
    def setUp(self):
        scope_guard.clear_directory_cache()
        p = [mock.patch.object(scope_guard, "_directory_loader", return_value=DIR),
             mock.patch.object(ria_agent, "_write_log_entry"), mock.patch.object(ria_agent, "_print_agent_trace"),
             mock.patch.object(ria_agent, "_newest_data_year", return_value=2026)]
        for x in p:
            x.start()
            self.addCleanup(x.stop)

    def run_agent(self, sc, message, replies, fake_sql=None):
        seen: list[dict] = []
        queue = list(replies)

        async def fake_http(client, api_key, body, url):
            seen.append(json.loads(json.dumps(body)))
            return queue.pop(0)

        dev: dict = {}
        with mock.patch.object(ria_agent, "_call_groq_http", fake_http), mock.patch.object(tools, "execute_sql", fake_sql or FakeSQL()):
            reply = asyncio.run(ria_agent.call_ria_agent(message, "gsk_test", sc, _dev=dev))
        return reply, seen, dev

    def test_model_only_sees_its_persona_tools(self):
        expected = {"faculty": 13, "hod": 16, "faculty_dean": 20, "executive_dean": 18, "vice_chancellor": 21}
        for sc in (FACULTY, HOD, FDEAN, EDEAN, VC):
            _, seen, _ = self.run_agent(sc, "hello", [_llm_reply("hi")])
            self.assertEqual(len(seen[0]["tools"]), expected[sc.persona_id], sc.persona_id)

    def test_system_prompt_carries_the_date_and_profile_link(self):
        _, seen, _ = self.run_agent(FDEAN, "hello", [_llm_reply("hi")])
        system = seen[0]["messages"][0]["content"]
        self.assertIn("TODAY: ", system)
        self.assertIn("newest publication year in the database is 2026", system)
        self.assertIn("Linked faculty profile: no", system)
        _, seen, _ = self.run_agent(FACULTY, "hello", [_llm_reply("hi")])
        self.assertIn("Linked faculty profile: yes", seen[0]["messages"][0]["content"])

    def test_forbidden_result_is_returned_to_the_model_and_no_sql_runs(self):
        fake = FakeSQL()
        replies = [_llm_reply(tool_calls=[_call("get_faculty_stats", {"faculty_name": "Narayan D G"})]), _llm_reply("Sorry, no.")]
        reply, seen, dev = self.run_agent(FACULTY, "what is Narayan's h-index", replies, fake)
        self.assertEqual(reply, "Sorry, no.")
        tool_msg = [m for m in seen[1]["messages"] if m["role"] == "tool"][0]
        self.assertEqual(json.loads(tool_msg["content"])["status"], "forbidden")
        self.assertEqual(fake.calls, [])
        self.assertEqual(dev["tool_calls"][0]["guard"], "deny")

    def test_a_tool_hidden_from_the_persona_is_refused_if_called_anyway(self):
        fake = FakeSQL()
        replies = [_llm_reply(tool_calls=[_call("compare_entities", {"entity_type": "department"})]), _llm_reply("no")]
        _, seen, _ = self.run_agent(FACULTY, "compare departments", replies, fake)
        tool_msg = [m for m in seen[1]["messages"] if m["role"] == "tool"][0]
        self.assertEqual(json.loads(tool_msg["content"])["status"], "forbidden")
        self.assertEqual(fake.calls, [])

    def test_raw_function_text_fallback_is_guarded_too(self):
        fake = FakeSQL()
        raw = "<function=get_faculty_stats '{\"faculty_name\":\"Narayan D G\"}'></function>"
        _, seen, dev = self.run_agent(FACULTY, "narayan", [_llm_reply(raw), _llm_reply("no")], fake)
        tool_msg = [m for m in seen[1]["messages"] if m["role"] == "tool"][0]
        self.assertEqual(json.loads(tool_msg["content"])["status"], "forbidden")
        self.assertEqual(fake.calls, [])
        self.assertTrue(dev["tool_calls"][0]["fallback"])

    def test_own_profile_runs_pinned_and_the_guard_choice_is_logged(self):
        fake = FakeSQL([FAC_ROW], [])
        replies = [_llm_reply(tool_calls=[_call("get_faculty_stats", {"faculty_name": "Narayan D G", "ria_user_id": 1})]),
                   _llm_reply("done")]
        # the model asks for someone else: denied even with an injected id
        _, _, dev = self.run_agent(FACULTY, "x", replies, fake)
        self.assertEqual(dev["tool_calls"][0]["guard"], "deny")
        fake = FakeSQL([FAC_ROW], [])
        replies = [_llm_reply(tool_calls=[_call("get_faculty_stats", {"faculty_name": "Uday Kulkarni", "ria_user_id": 1})]),
                   _llm_reply("done")]
        _, _, dev = self.run_agent(FACULTY, "my stats", replies, fake)
        self.assertEqual(dev["tool_calls"][0]["guard"], "rewrite")
        self.assertIn("ria_user_id = 232730", fake.calls[0])
        self.assertNotIn("ria_user_id = 1 ", fake.calls[0] + " ")

    def test_hod_department_query_runs_with_exact_scope(self):
        fake = FakeSQL([FAC_ROW], [])
        replies = [_llm_reply(tool_calls=[_call("get_faculty_stats", {"faculty_name": "Uday"})]), _llm_reply("done")]
        self.run_agent(HOD, "uday", replies, fake)
        self.assertIn(f"department IN ('{CSE}')", fake.calls[0])

    def test_guard_hides_names_from_a_hod_looking_at_another_department(self):
        fake = FakeSQL([AGG_ROW])
        replies = [_llm_reply(tool_calls=[_call("get_department_stats", {"department": "Physics", "top_n": 5})]), _llm_reply("done")]
        _, seen, _ = self.run_agent(HOD, "how is Physics doing", replies, fake)
        tool_msg = json.loads([m for m in seen[1]["messages"] if m["role"] == "tool"][0]["content"])
        self.assertEqual(len(fake.calls), 1)
        self.assertFalse([k for k in tool_msg if k.startswith("top_")])

    def test_scope_is_required(self):
        with self.assertRaises(TypeError):
            asyncio.run(ria_agent.call_ria_agent("hi", "gsk_test"))

    def test_a_tool_the_model_hallucinated_outside_its_persona_gets_a_friendly_message(self):
        # The system prompt's routing table names every tool, but a persona's request only
        # includes its own subset; if the model still names one it wasn't given, the provider
        # rejects the whole turn with a raw validation error that must never reach the user.
        err = (400, {"error": {"message": "Tool call validation failed: tool call validation "
                               "failed: attempted to call tool 'get_inactive_faculty' which was "
                               "not in request.tools"}})
        reply, _, _ = self.run_agent(FACULTY, "hi", [err])
        self.assertEqual(reply, "That isn't something I can help with at your access level.")

    def test_an_unrelated_provider_error_is_still_shown(self):
        err = (500, {"error": {"message": "internal server error"}})
        reply, _, _ = self.run_agent(FACULTY, "hi", [err])
        self.assertIn("internal server error", reply)


class OverrideRoutingTests(unittest.TestCase):
    """_override_tool_choice must not turn a personal question into a university-wide number."""

    def test_personal_questions_are_not_rerouted(self):
        for q, fn in (("How many Q1 publications do I have?", "get_faculty_stats"),
                      ("how many of my papers were published in 2023?", "get_department_stats"),
                      ("how many Q1 papers does Narayan have", "get_faculty_stats"),
                      ("list my papers in 2024", "search_publications_by_author"),
                      ("what is my publication trend in 2024", "get_department_stats")):
            self.assertEqual(tools._override_tool_choice(q, fn, {}), (None, None), q)

    def test_aggregate_routing_still_works(self):
        self.assertEqual(tools._override_tool_choice("how many Q1 papers in 2024", "get_department_stats", {}),
                         ("count_qrank_publications", {"qrank": "Q1", "year": 2024}))
        self.assertEqual(tools._override_tool_choice("total publications in 2023", "get_department_stats", {}),
                         ("count_qrank_publications", {"year": 2023}))
        self.assertEqual(tools._override_tool_choice("publication trend", "get_department_stats", {}),
                         ("get_yearly_stats", {}))

    def test_department_trend_and_growth_acceleration_are_never_rerouted(self):
        # Found live: "Is our growth accelerating or decelerating?" correctly chose
        # get_growth_acceleration, but this override then swapped it for a plain, university-wide
        # get_yearly_stats because the query contains "growth" -- silently dropping the department
        # scope and answering a different question. Same risk for get_department_trend ("trend").
        for q, fn, args in (
            ("Is our growth accelerating or decelerating?", "get_growth_acceleration", {}),
            ("Is our growth accelerating or decelerating for Physics?", "get_growth_acceleration", {"department": "Physics"}),
            ("how has CSE's trend been over the last 5 years", "get_department_trend", {"department": "CSE"}),
        ):
            self.assertEqual(tools._override_tool_choice(q, fn, args), (None, None), q)


if __name__ == "__main__":
    unittest.main()
