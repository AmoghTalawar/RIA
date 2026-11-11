// Run: node --test src/lib/signals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDepartments, detectDeclines, detectZeroOutput, detectTargetGaps, questionsForSignal, askFocusFromSignal } from './signals.js';

const NOW = new Date('2026-10-29');
const pubsFor = (dept, perYear) =>
  Object.entries(perYear).flatMap(([year, n]) =>
    Array.from({ length: n }, () => ({ home_author_department: dept, year: Number(year) })));

test('flags a department falling three complete years in a row', () => {
  const pubs = [...pubsFor('ECE', { 2022: 40, 2023: 30, 2024: 25 }), ...pubsFor('CSE', { 2022: 20, 2023: 25, 2024: 30 })];
  const s = detectDeclines(pubs, { now: NOW });
  assert.equal(s.length, 1);
  assert.equal(s[0].entity.name, 'ECE');
  assert.equal(s[0].evidence.delta_pct, -37);
});

test('ignores the partial current year and tiny departments', () => {
  const partial = pubsFor('ECE', { 2023: 40, 2024: 45, 2025: 50, 2026: 3 });
  const tiny = pubsFor('Law', { 2022: 5, 2023: 4, 2024: 3 });
  assert.equal(detectDeclines([...partial, ...tiny], { now: NOW }).length, 0);
});

test('zero-output groups by department', () => {
  const faculty = [
    { author_name: 'A', department: 'ECE', total_pub_count: 0 },
    { author_name: 'B', department: 'ECE', total_pub_count: 0 },
    { author_name: 'C', department: 'CSE', total_pub_count: 9 },
  ];
  const [s] = detectZeroOutput(faculty);
  assert.equal(s.evidence.count, 2);
  assert.equal(s.evidence.top_department, 'ECE');
  assert.deepEqual(detectZeroOutput([faculty[2]]), []);
});

test('target gaps skip inverted and met targets', () => {
  const s = detectTargetGaps({
    publications: { current: 600, target: 1500 },
    citations: { current: 54000, target: 55000 },
    nirfRank: { current: 98, target: 75, invert: true },
  });
  assert.deepEqual(s.map((x) => x.metric), ['Publications']);
});

test('asking about a signal yields prefill + specific questions + bounded context', () => {
  const [sig] = detectDeclines(pubsFor('ECE', { 2022: 40, 2023: 30, 2024: 25 }), { now: NOW });
  const qs = questionsForSignal(sig);
  assert.ok(qs[0].includes('ECE') && qs[0].includes('40') && qs[0].includes('25'));
  const focus = askFocusFromSignal(sig);
  assert.equal(focus.prefill, qs[0]);
  assert.equal(focus.signal.kind, 'trend_decline');
});

test('cleanDepartments drops Unknown / Not Available and dedupes', () => {
  assert.deepEqual(cleanDepartments('Electronics and Communication Engineering;Unknown;Unknown'), ['Electronics and Communication Engineering']);
  assert.deepEqual(cleanDepartments('CSE;Unknown;CSE; ECE '), ['CSE', 'ECE']);
  assert.deepEqual(cleanDepartments('Not Available;Unknown'), []);
  assert.deepEqual(cleanDepartments(null), []);
});

test('multi-department strings count toward each real department, never as their own group', () => {
  const rows = (dept, perYear) => pubsFor(dept, perYear);
  const pubs = [
    ...rows('ECE;Unknown;Unknown', { 2023: 12, 2024: 20, 2025: 30 }),
    ...rows('ECE', { 2023: 90, 2024: 134, 2025: 198 }),
    ...rows('Not Available;Unknown', { 2022: 40, 2023: 30, 2024: 20 }),
  ];
  const s = detectDeclines(pubs, { now: NOW });
  assert.deepEqual(s, []);
});
