"""Offline tests for the token-efficiency changes: per-persona prompts, prompt caching, the concept-question
path, history clipping, the empty-reply retry, and compact tool results.

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
from llm_provider import Provider
from question_class import is_concept_question
from tests.test_scope_guard import DIR, EDEAN, FACULTY, FDEAN, HOD, VC, FakeSQL, _call, _llm_reply


class ConceptQuestionTests(unittest.TestCase):
    def test_plain_concept_questions(self):
        for q in ("What is h-index and how is it calculated?", "What is Scopus vs Web of Science?",
                  "How does peer review work?", "Explain the h-index", "What is a Q1 journal?",
                  "Define i10-index", "What's the difference between Scopus and Web of Science?",
                  "What is the impact factor?"):
            self.assertTrue(is_concept_question(q), q)

    def test_anything_about_data_takes_the_normal_path(self):
        for q in ("Which journals are top quartile for CS?", "How do I improve my citation count?",
                  "What's CSE's total h-index?", "What is Dr. Kumar's citation count?",
                  "What is the h-index of Uday Kulkarni", "What is my h-index?", "What is our NIRF score?",
                  "How many papers did Sunil publish this year?", "What is the h-index of CSE?",
                  "What is the total number of Q1 papers?", "list the top journals", "What is the h-index in 2024?",
                  "What is that?", "Compare scopus and wos for our faculty", "", None, "x" * 300):
            self.assertFalse(is_concept_question(q), q)


class PromptTests(unittest.TestCase):
    def test_each_persona_only_gets_routing_rules_for_its_tools(self):
        full = tools.RIA_SYSTEM_PROMPT
        for sc in (FACULTY, HOD, FDEAN, EDEAN, VC):
            names = {t["function"]["name"] for t in scope_guard.filter_tools(tools.TOOLS, sc)}
            prompt = tools.build_ria_prompt(names)
            for tool in (t["function"]["name"] for t in tools.TOOLS):
                routed = [line for line in prompt.splitlines() if "→" in line or "→ " in line]
                in_rules = any(f"→ {tool}" in line or f"→ {tool}(" in line for line in routed)
                if tool not in names:
                    self.assertFalse(in_rules, f"{sc.persona_id} is routed to {tool} it doesn't have")
        faculty = {t["function"]["name"] for t in scope_guard.filter_tools(tools.TOOLS, FACULTY)}
        self.assertNotIn("compare_entities", tools.build_ria_prompt(faculty))
        self.assertIn("get_faculty_stats", tools.build_ria_prompt(faculty))
        self.assertLess(len(tools.build_ria_prompt(faculty)), len(full))

    def test_full_prompt_keeps_every_rule_and_the_precedence_line(self):
        full = tools.RIA_SYSTEM_PROMPT
        self.assertEqual(full, tools.build_ria_prompt(None))
        for part in ("PRECEDENCE:", "get_campus_stats", "get_top_journals", "get_inactive_faculty",
                     "status='ambiguous'", "status='forbidden'", "Dates:", "'counting' field", "RESPONSE FORMAT",
                     "MARKDOWN", "Keep responses concise."):
            self.assertIn(part, full)

    def test_conditional_rule_only_with_its_tool(self):
        self.assertIn("never call them", tools.build_ria_prompt({"get_citations_by_year"}))
        self.assertNotIn("never call them", tools.build_ria_prompt({"get_faculty_stats"}))

    def test_concept_prompt_is_tiny_and_states_no_data(self):
        self.assertLess(len(tools.CONCEPT_PROMPT), 700)
        self.assertIn("Do NOT state any KLE Tech figure", " ".join(tools.CONCEPT_PROMPT.split()))


class AgentTokenTests(unittest.TestCase):
    def setUp(self):
        scope_guard.clear_directory_cache()
        for x in (mock.patch.object(scope_guard, "_directory_loader", return_value=DIR),
                  mock.patch.object(ria_agent, "_write_log_entry"), mock.patch.object(ria_agent, "_print_agent_trace"),
                  mock.patch.object(ria_agent, "_newest_data_year", return_value=2026)):
            x.start()
            self.addCleanup(x.stop)

    def run_agent(self, sc, message, replies, fake_sql=None, provider=None, history=None, chart_title=None):
        seen: list[dict] = []
        queue = list(replies)

        async def fake_http(client, api_key, body, url):
            seen.append(json.loads(json.dumps(body)))
            return queue.pop(0)

        dev: dict = {}
        patches = [mock.patch.object(ria_agent, "_call_groq_http", fake_http),
                   mock.patch.object(tools, "execute_sql", fake_sql or FakeSQL())]
        if provider is not None:
            patches.append(mock.patch.object(ria_agent, "resolve_provider", return_value=provider))
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        reply = asyncio.run(ria_agent.call_ria_agent(message, "gsk_test", sc, conversation_history=history,
                                                     chart_title=chart_title, _dev=dev))
        return reply, seen, dev

    # ── concept path ─────────────────────────────────────────
    def test_concept_question_sends_no_tools_and_the_short_prompt(self):
        _, seen, dev = self.run_agent(FACULTY, "What is h-index and how is it calculated?", [_llm_reply("It is...")])
        body = seen[0]
        self.assertNotIn("tools", body)
        self.assertNotIn("tool_choice", body)
        system = body["messages"][0]["content"]
        self.assertIn("no data tools", system)
        self.assertIn("ROLE PERSONA", system)
        self.assertNotIn("TOOL ROUTING", system)
        self.assertLess(len(system), 4200)
        self.assertEqual(dev["mode"], "concept")

    def test_data_question_keeps_tools_and_only_its_routing_rules(self):
        _, seen, dev = self.run_agent(FACULTY, "How many Q1 papers do I have?", [_llm_reply("3")])
        body = seen[0]
        self.assertGreater(len(body["tools"]), 5)
        system = body["messages"][0]["content"]
        self.assertIn("TOOL ROUTING", system)
        self.assertIn("get_faculty_stats", system)
        self.assertNotIn("→ compare_entities", system)          # Faculty has no compare_entities
        self.assertEqual(dev["mode"], "tools")

    def test_a_chart_focused_question_is_never_treated_as_a_concept_question(self):
        _, seen, _ = self.run_agent(VC, "What is h-index?", [_llm_reply("x")], chart_title="H-Index trend")
        self.assertIn("tools", seen[0])

    # ── caching ──────────────────────────────────────────────
    def test_anthropic_via_openrouter_marks_the_system_prefix_cacheable(self):
        prov = Provider("openrouter", "https://x", "anthropic/claude-haiku-5.5", "k")
        _, seen, _ = self.run_agent(HOD, "hello there", [_llm_reply("hi")], provider=prov)
        content = seen[0]["messages"][0]["content"]
        self.assertIsInstance(content, list)
        self.assertEqual(content[0]["cache_control"], {"type": "ephemeral"})
        self.assertIn("ROLE PERSONA", content[0]["text"])

    def test_other_providers_get_a_plain_system_string(self):
        for prov in (Provider("groq", "https://x", "openai/gpt-oss-120b", "k"),
                     Provider("gemini", "https://x", "gemini-3.5-flash", "k"),
                     Provider("openrouter", "https://x", "openai/gpt-5", "k")):
            _, seen, _ = self.run_agent(HOD, "hello there", [_llm_reply("hi")], provider=prov)
            self.assertIsInstance(seen[0]["messages"][0]["content"], str, prov.model)

    def test_the_prefix_is_identical_on_every_call_of_a_turn(self):
        # a cache only hits when the cached prefix is byte-identical
        prov = Provider("openrouter", "https://x", "anthropic/claude-haiku-5.5", "k")
        replies = [_llm_reply(tool_calls=[_call("get_university_overview", {})]), _llm_reply("done")]
        fake = FakeSQL([{"total_publications": 1, "total_citations": 1}], [], [{"faculty_count": 1, "avg_hindex": 1}], [])
        _, seen, _ = self.run_agent(VC, "research overview", replies, fake, provider=prov)
        self.assertEqual(len(seen), 2)
        self.assertEqual(seen[0]["messages"][0], seen[1]["messages"][0])
        self.assertEqual(seen[0]["tools"], seen[1]["tools"])

    def test_cached_tokens_are_recorded(self):
        reply = (200, {"choices": [{"message": {"role": "assistant", "content": "hi"}}],
                       "usage": {"prompt_tokens": 100, "completion_tokens": 5, "total_tokens": 105,
                                 "prompt_tokens_details": {"cached_tokens": 80}}})
        _, _, dev = self.run_agent(HOD, "hello there", [reply])
        self.assertEqual(dev["tokens"]["cached"], 80)

    # ── history ──────────────────────────────────────────────
    def test_long_history_messages_are_clipped(self):
        history = [{"role": "assistant", "content": "x" * 5000}, {"role": "user", "content": "short"}]
        _, seen, _ = self.run_agent(HOD, "next question", [_llm_reply("ok")], history=history)
        sent = [m["content"] for m in seen[0]["messages"] if m["role"] == "assistant"][0]
        self.assertLessEqual(len(sent), ria_agent.HISTORY_MESSAGE_CHARS + 40)
        self.assertIn("shortened", sent)
        self.assertEqual([m["content"] for m in seen[0]["messages"] if m["role"] == "user"][0], "short")

    # ── loop guard ───────────────────────────────────────────
    def test_no_more_tools_after_a_refused_call(self):
        # Role testing: Faculty "rank departments" tried department after department (each refused), 5 calls / 23k tokens.
        replies = [_llm_reply(tool_calls=[_call("get_faculty_stats", {"faculty_name": "Narayan D G"})]),
                   _llm_reply("You can only see your own profile.")]
        reply, seen, dev = self.run_agent(FACULTY, "stats for Narayan D G", replies)
        self.assertEqual(dev["tool_calls"][0]["status"], "forbidden")
        self.assertEqual(seen[0]["tool_choice"], "auto")
        self.assertEqual(seen[1]["tool_choice"], "none")                     # must answer now
        self.assertTrue(reply.startswith("You can only see"))

    def test_the_last_round_cannot_start_another_tool_call(self):
        fake = FakeSQL(*[[{"total_publications": 1, "total_citations": 1}], [], [{"faculty_count": 1, "avg_hindex": 1}], []] * 3)
        replies = [_llm_reply(tool_calls=[_call("get_university_overview", {})]),
                   _llm_reply(tool_calls=[_call("get_university_overview", {})]),
                   _llm_reply("Done.")]
        _, seen, _ = self.run_agent(VC, "research overview", replies, fake)
        self.assertEqual([b["tool_choice"] for b in seen], ["auto", "auto", "none"])

    # ── empty reply after a tool result ──────────────────────
    def test_an_empty_reply_after_tool_results_is_retried_once(self):
        fake = FakeSQL([{"total_publications": 1, "total_citations": 1}], [], [{"faculty_count": 1, "avg_hindex": 1}], [])
        replies = [_llm_reply(tool_calls=[_call("get_university_overview", {})]), _llm_reply(None),
                   _llm_reply("Here is a short summary.")]
        reply, seen, dev = self.run_agent(VC, "research overview", replies, fake)
        self.assertTrue(reply.startswith("Here is a short summary."))
        self.assertIn("Source: KLE Tech research publications database", reply)   # footer added in code
        self.assertEqual(len(seen), 3)
        self.assertIn("under 150 words", seen[2]["messages"][-1]["content"])

    def test_a_second_empty_reply_still_fails_cleanly(self):
        fake = FakeSQL([{"total_publications": 1, "total_citations": 1}], [], [{"faculty_count": 1, "avg_hindex": 1}], [])
        replies = [_llm_reply(tool_calls=[_call("get_university_overview", {})]), _llm_reply(None), _llm_reply(None)]
        reply, _, _ = self.run_agent(VC, "research overview", replies, fake)
        self.assertIn("couldn't generate a response", reply)


class CompactResultTests(unittest.TestCase):
    def run_tool(self, fn, fake, *a, **kw):
        with mock.patch.object(tools, "execute_sql", fake):
            return fn(*a, **kw)

    def test_results_are_compact_json(self):
        raw = self.run_tool(tools.get_university_overview,
                            FakeSQL([{"total_publications": 5, "total_citations": 9}], [], [{"faculty_count": 1, "avg_hindex": 2}], []))
        self.assertNotIn("\n", raw)
        self.assertNotIn(": ", raw)
        self.assertEqual(json.loads(raw)["total_publications"], 5)

    def test_campus_list_is_capped_and_rows_are_trimmed(self):
        row = dict(title="T" * 300, year=2026, source_publication="V" * 200, q_rank_scopus="Q1", scs_citations=2)
        fake = FakeSQL([{"n": 722}], [row])
        out = json.loads(self.run_tool(tools.list_campus_publications, fake, "Belagavi", "", None, True, "", 500))
        self.assertIn("LIMIT 30", fake.calls[1])                               # asked for 500, capped at 30
        self.assertEqual(len(out["data"][0]["title"]), 110)
        self.assertEqual(len(out["data"][0]["venue"]), 45)
        self.assertEqual(set(out["data"][0]), {"title", "year", "venue", "quartile", "citations"})
        fake = FakeSQL([{"n": 0}], [])
        self.run_tool(tools.list_campus_publications, fake, "Belagavi")
        self.assertIn("LIMIT 15", fake.calls[1])                               # default page


if __name__ == "__main__":
    unittest.main()


class ChatFormatRuleTests(unittest.TestCase):
    """The chat panel is ~400px wide: the prompt must keep tables narrow and lead with the answer."""

    def test_format_rules_keep_tables_narrow_and_answer_first(self):
        prompt = tools.build_ria_prompt(["get_campus_stats"])
        self.assertIn("at most 5 columns", prompt)
        self.assertIn("MEASURES down the first column", prompt)
        self.assertIn("Lead with the answer", prompt)


    def test_personas_without_a_ranking_tool_are_told_not_to_loop(self):
        faculty = tools.build_ria_prompt([t["function"]["name"] for t in scope_guard.filter_tools(tools.TOOLS, FACULTY, "")])
        vc = tools.build_ria_prompt([t["function"]["name"] for t in scope_guard.filter_tools(tools.TOOLS, VC, "")])
        self.assertIn("You cannot rank or compare departments", faculty)
        self.assertNotIn("You cannot rank or compare departments", vc)
        self.assertNotIn("You cannot rank or compare departments", tools.build_ria_prompt())   # None = every rule

    def test_every_persona_is_told_citation_history_does_not_exist(self):
        self.assertIn("No data holds citations OVER TIME", tools.build_ria_prompt(["get_faculty_stats"]))
