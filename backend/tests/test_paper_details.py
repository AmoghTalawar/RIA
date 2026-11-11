"""Paper detail page: database first, OpenAlex/Crossref only for the fields the database lacks. No network."""
import unittest
from unittest import mock

import paper_details as pd

FULL_ROW = {"pub_id": 1, "title": "T", "doi": "10.1007/abc", "abstract": "Stored abstract.", "vol_no": "7",
            "iss_no": "2", "b_page": "1", "e_page": "9", "p_issn": "1111-1111", "e_issn": "2222-2222"}


def row(**over):
    r = dict(FULL_ROW)
    r.update(over)
    return r


class ParsingTests(unittest.TestCase):
    def test_clean_doi(self):
        self.assertEqual(pd.clean_doi("https://doi.org/10.1007/978-3-032-19690-3_14"), "10.1007/978-3-032-19690-3_14")
        self.assertEqual(pd.clean_doi(" doi: 10.1016/j.x.2024.1 "), "10.1016/j.x.2024.1")
        for bad in (None, "", "not a doi", "10.1/short", "http://evil.example/10.1007/x"):
            self.assertIsNone(pd.clean_doi(bad), bad)

    def test_openalex_abstract_is_rebuilt_in_word_order(self):
        inv = {"We": [0], "study": [1], "5G": [2, 5], "and": [3], "then": [4], "again.": [6]}
        self.assertEqual(pd.rebuild_abstract(inv), "We study 5G and then 5G again.")
        self.assertEqual(pd.rebuild_abstract(None), "")

    def test_crossref_abstract_markup_is_stripped(self):
        self.assertEqual(pd.strip_markup("<jats:title>Abstract</jats:title><jats:p>Hello   <jats:italic>world</jats:italic>.</jats:p>"),
                         "Hello world.")

    def test_pages_split(self):
        self.assertEqual(pd.split_pages("147-156"), ("147", "156"))
        self.assertEqual(pd.split_pages("147–156"), ("147", "156"))
        self.assertEqual(pd.split_pages("e42828"), ("e42828", ""))
        self.assertEqual(pd.split_pages(None), ("", ""))

    def test_parse_openalex(self):
        work = {"abstract_inverted_index": {"Hi": [0], "there": [1]},
                "biblio": {"volume": "12", "issue": "3", "first_page": "10", "last_page": "20"},
                "primary_location": {"source": {"issn": ["1234-5678", "8765-4321"]}}}
        self.assertEqual(pd.parse_openalex(work), {"abstract": "Hi there", "vol_no": "12", "iss_no": "3",
                                                   "b_page": "10", "e_page": "20", "p_issn": "1234-5678",
                                                   "e_issn": "8765-4321"})
        self.assertEqual(pd.parse_openalex(None), {})

    def test_parse_crossref(self):
        msg = {"volume": "5", "issue": "1", "page": "30-40", "abstract": "<jats:p>Text</jats:p>",
               "issn-type": [{"type": "print", "value": "1111-2222"}, {"type": "electronic", "value": "3333-4444"}]}
        out = pd.parse_crossref(msg)
        self.assertEqual((out["abstract"], out["vol_no"], out["b_page"], out["e_page"], out["p_issn"], out["e_issn"]),
                         ("Text", "5", "30", "40", "1111-2222", "3333-4444"))


class DetailsTests(unittest.TestCase):
    def setUp(self):
        pd.clear_cache()
        env = mock.patch.dict("os.environ", {"PAPER_ENRICH": "1"})
        env.start()
        self.addCleanup(env.stop)

    def details(self, paper_row, openalex=None, crossref=None):
        calls = []

        def fake_get(url, params=None):
            calls.append(url)
            if url.startswith(pd.OPENALEX):
                return openalex
            return {"message": crossref} if crossref is not None else None

        with mock.patch.object(pd, "get_paper", return_value=dict(paper_row) if paper_row else None), \
             mock.patch.object(pd, "_get_json", fake_get):
            return pd.paper_details(1), calls

    def test_complete_record_is_not_changed_by_the_outside_lookup(self):
        out, calls = self.details(row(), openalex={"abstract_inverted_index": {"Other": [0]}, "biblio": {"volume": "99"}},
                                  crossref={"volume": "88", "abstract": "<jats:p>Other</jats:p>"})
        self.assertEqual(out["paper"]["abstract"], "Stored abstract.")
        self.assertEqual(out["paper"]["vol_no"], "7")
        self.assertEqual(set(out["sources"].values()), {"database"})
        self.assertEqual(len(calls), 2, "both services are still asked, for the live citation counts")

    def test_missing_abstract_comes_from_openalex_and_is_labelled(self):
        out, calls = self.details(row(abstract=None), openalex={"abstract_inverted_index": {"Found": [0], "it": [1]}})
        self.assertEqual(out["paper"]["abstract"], "Found it")
        self.assertEqual(out["sources"]["abstract"], "OpenAlex")
        self.assertEqual(out["sources"]["vol_no"], "database")
        self.assertEqual(len(calls), 2)

    def test_crossref_fills_what_openalex_lacks(self):
        out, calls = self.details(row(abstract="", vol_no=None, e_page=None),
                                  openalex={"abstract_inverted_index": {"A": [0]}},
                                  crossref={"volume": "9", "page": "1-8"})
        self.assertEqual(out["sources"]["abstract"], "OpenAlex")
        self.assertEqual((out["paper"]["vol_no"], out["sources"]["vol_no"]), ("9", "Crossref"))
        self.assertEqual((out["paper"]["e_page"], out["sources"]["e_page"]), ("8", "Crossref"))
        self.assertEqual(out["paper"]["b_page"], "1", "a stored value is never overwritten")
        self.assertEqual(len(calls), 2)

    def test_database_values_win_over_outside_values(self):
        out, _ = self.details(row(abstract=None), openalex={"abstract_inverted_index": {"X": [0]},
                                                           "biblio": {"volume": "99"}})
        self.assertEqual(out["paper"]["vol_no"], "7")

    def test_outside_failure_just_leaves_the_field_empty(self):
        out, _ = self.details(row(abstract=None), openalex=None, crossref=None)
        self.assertIsNone(out["paper"]["abstract"])
        self.assertNotIn("abstract", out["sources"])

    def test_no_doi_means_no_outside_call(self):
        out, calls = self.details(row(abstract=None, doi=None))
        self.assertEqual(calls, [])

    def test_unknown_paper(self):
        out, _ = self.details(None)
        self.assertIsNone(out)

    def test_lookups_are_cached(self):
        calls = []

        def fake_get(url, params=None):
            calls.append(url)
            return {"abstract_inverted_index": {"Once": [0]}} if url.startswith(pd.OPENALEX) else None

        with mock.patch.object(pd, "get_paper", side_effect=lambda _id: row(abstract=None)), \
             mock.patch.object(pd, "_get_json", fake_get):
            pd.paper_details(1)
            pd.paper_details(1)
        self.assertEqual(len(calls), 2, "one OpenAlex and one Crossref request, then served from the cache")

    def test_switch_off(self):
        with mock.patch.dict("os.environ", {"PAPER_ENRICH": "0"}):
            out, calls = self.details(row(abstract=None))
        self.assertEqual(calls, [])
        self.assertEqual(out["live_citations"], {})

    def test_live_citation_counts_from_both_services(self):
        out, _ = self.details(row(), openalex={"id": "https://openalex.org/W123", "cited_by_count": 17},
                              crossref={"is-referenced-by-count": 11})
        self.assertEqual(out["live_citations"], {
            "OpenAlex": {"count": 17, "url": "https://openalex.org/works?filter=cites:W123"},
            "Crossref": {"count": 11}})

    def test_zero_is_a_real_count_and_a_missing_count_is_left_out(self):
        out, _ = self.details(row(), openalex={"id": "https://openalex.org/W9", "cited_by_count": 0}, crossref={})
        self.assertEqual(out["live_citations"]["OpenAlex"]["count"], 0)
        self.assertNotIn("Crossref", out["live_citations"])

    def test_unexpected_openalex_id_gets_no_link(self):
        out, _ = self.details(row(), openalex={"id": "https://evil.example/x", "cited_by_count": 3})
        self.assertNotIn("url", out["live_citations"]["OpenAlex"])


class RouteTests(unittest.TestCase):
    def test_route_needs_a_login_and_404s_for_an_unknown_paper(self):
        from fastapi.testclient import TestClient
        import main
        client = TestClient(main.app)
        self.assertEqual(client.get("/api/publications/1").status_code, 401)
        main.app.dependency_overrides[main.get_scope] = lambda: object()
        try:
            with mock.patch.object(main, "paper_details", return_value=None):
                self.assertEqual(client.get("/api/publications/999999999").status_code, 404)
            with mock.patch.object(main, "paper_details", return_value={"paper": {"title": "T"}, "sources": {}}):
                r = client.get("/api/publications/1")
                self.assertEqual((r.status_code, r.json()["paper"]["title"]), (200, "T"))
            seen = []
            with mock.patch.object(main, "paper_details", side_effect=lambda i, outside=True: seen.append(outside) or {"paper": {}, "sources": {}}):
                client.get("/api/publications/1")
                client.get("/api/publications/1/outside")
            self.assertEqual(seen, [False, True], "the first route never calls the outside services")
        finally:
            main.app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
