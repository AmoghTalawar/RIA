"""The 'Source:' footer is built in code from the tools that ran."""
import unittest

from ria_agent import _clip
from source_line import GENERAL_KNOWLEDGE, build_source_line


def call(tool, status="success"):
    return {"tool": tool, "status": status}


class SourceLineTests(unittest.TestCase):
    def test_names_the_data_behind_the_answer(self):
        line = build_source_line([call("get_faculty_stats"), call("get_department_benchmark")], data_year=2026)
        self.assertIn("KLE Tech research publications database", line)
        self.assertIn("faculty profile", line)
        self.assertIn("department benchmark", line)
        self.assertIn("Data through 2026", line)
        self.assertTrue(line.startswith("\n\n---\n"))

    def test_same_data_is_listed_once(self):
        line = build_source_line([call("get_faculty_stats"), call("get_faculty_stats")])
        self.assertEqual(line.count("faculty profile"), 1)

    def test_failed_or_refused_tools_are_not_cited(self):
        self.assertEqual(build_source_line([call("get_faculty_stats", "forbidden")]), "")
        self.assertEqual(build_source_line([call("get_faculty_stats", "error"), call("compare_entities", "no_match")]), "")
        line = build_source_line([call("get_faculty_stats", "error"), call("get_campus_stats")])
        self.assertNotIn("faculty profile", line)
        self.assertIn("campus statistics", line)

    def test_concept_answer_is_labelled_general_knowledge(self):
        self.assertIn(GENERAL_KNOWLEDGE, build_source_line([], concept=True))

    def test_no_tools_and_not_a_concept_cites_nothing(self):
        self.assertEqual(build_source_line([]), "")

    def test_quartile_counts_can_be_web_of_science(self):
        self.assertIn("Scopus or Web of Science", build_source_line([call("count_qrank_publications")]))

    def test_footer_is_not_sent_back_as_history(self):
        reply = "CSE has 1,465 papers." + build_source_line([call("get_department_stats")], data_year=2026)
        self.assertEqual(_clip(reply), "CSE has 1,465 papers.")


if __name__ == "__main__":
    unittest.main()
