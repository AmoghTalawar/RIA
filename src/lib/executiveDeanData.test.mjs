// Run: node --test src/lib/executiveDeanData.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutiveDeanData } from './executiveDeanData.js';

const NOW = new Date('2026-10-29');
const pub = (o) => ({ year: 2025, home_author_institute: 'School A', q_rank_scopus: 'Q1', scs_citations: 2, impact_factor: 4, ...o });
const institutes = [{ name: 'School A', short_name: 'SA', avg_scopus_hindex: '5.5' }, { name: 'School B', short_name: 'SB', avg_scopus_hindex: '0' }];

test('counts each paper once per real institute and ignores placeholders', () => {
  const pubs = [
    pub({ home_author_institute: 'School A;Unknown;Unknown' }),
    pub({ home_author_institute: 'School A;School B' }),
    pub({ home_author_institute: 'Not Available;Unknown' }),
  ];
  const d = buildExecutiveDeanData({ pubs, faculty: [], institutes, now: NOW });
  const by = Object.fromEntries(d.facultyBoards.map((b) => [b.shortName, b.actual]));
  assert.deepEqual(by, { SA: 2, SB: 1 });
  assert.equal(d.kpis.publications.value, 3);
});

test('Q-rank split, Q1 ratio and avg IF come from the papers, nothing estimated', () => {
  const pubs = [pub({ q_rank_scopus: 'Q1' }), pub({ q_rank_scopus: 'Q2', impact_factor: 2 }), pub({ q_rank_scopus: null, impact_factor: null })];
  const d = buildExecutiveDeanData({ pubs, faculty: [], institutes, now: NOW });
  assert.deepEqual(d.facultyBoardQRanks[0], { shortName: 'SA', Q1: 1, Q2: 1, Q3: 0, Q4: 0, avgQRank: 1.5 });
  assert.equal(d.tableRows[0].q1Ratio, '33%');
  assert.equal(d.tableRows[0].avgIF, 3);
});

test('YoY growth uses complete years only; partial current year is ignored', () => {
  const pubs = [...Array(10).fill(0).map(() => pub({ year: 2024 })), ...Array(15).fill(0).map(() => pub({ year: 2025 })), pub({ year: 2026 })];
  const d = buildExecutiveDeanData({ pubs, faculty: [], institutes, now: NOW });
  assert.equal(d.kpis.publications.delta, 50);
  assert.equal(d.latestYear, 2025);
  assert.deepEqual(d.growth.map((g) => g.year), ['2024', '2025']);
});

test('active researchers, citations and activity bands come from faculty rows', () => {
  const faculty = [
    { total_pub_count: 0, scopus_citation: 0 }, { total_pub_count: 3, scopus_citation: 100 },
    { total_pub_count: 10, scopus_citation: 50 }, { total_pub_count: 40, scopus_citation: 400 },
  ];
  const d = buildExecutiveDeanData({ pubs: [pub()], faculty, institutes, now: NOW });
  assert.equal(d.kpis.activeResearchers.value, 3);
  assert.equal(d.kpis.activeResearchers.of, 4);
  assert.equal(d.kpis.citations.value, 550);
  assert.deepEqual(d.researcherActivity.map((b) => b.value), [1, 1, 1, 1]);
});

test('h-index list drops institutes with no data; empty input does not throw', () => {
  const d = buildExecutiveDeanData({ pubs: [pub()], faculty: [], institutes, now: NOW });
  assert.deepEqual(d.avgHIndex, [{ name: 'SA', value: 5.5 }]);
  const empty = buildExecutiveDeanData({});
  assert.equal(empty.facultyBoards.length, 0);
  assert.equal(empty.kpis.publications.delta, undefined);
});
