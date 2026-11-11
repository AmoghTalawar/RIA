/**
 * Dashboard "signals" for the VC view: facts worth asking the AI about, derived from the data
 * the dashboard already loaded. Pure functions, no I/O.
 *
 * A signal: { id, kind, severity (1-3), title, entity, metric, evidence, source }
 * `askFocusFromSignal` turns one into the payload AIChatbot consumes.
 */

const MIN_DECLINE_BASE = 10; // ignore tiny departments, where a drop of 2 papers is noise

/**
 * `home_author_department` can hold several departments joined by ';' (one per co-author), padded with
 * placeholders. Returns the distinct real department names, e.g.
 * "Electronics and Communication Engineering;Unknown;Unknown" -> ["Electronics and Communication Engineering"].
 */
const PLACEHOLDERS = new Set(['', 'unknown', 'not available', 'n/a', 'na', 'none', 'null']);
export function cleanDepartments(raw) {
  const out = new Set();
  String(raw ?? '').split(';').forEach((d) => {
    const name = d.trim();
    if (!PLACEHOLDERS.has(name.toLowerCase())) out.add(name);
  });
  return [...out];
}

const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Years with complete data: drops the calendar year still in progress. */
function completeYears(years, now = new Date()) {
  const current = now.getFullYear();
  return years.filter((y) => Number(y) < current);
}

function countBy(rows, keyFn) {
  const out = {};
  rows.forEach((r) => {
    const k = keyFn(r);
    if (k) out[k] = (out[k] || 0) + 1;
  });
  return out;
}

/** Departments whose publication count fell in each of the last `span` complete years. */
export function detectDeclines(pubs, { span = 3, now = new Date() } = {}) {
  const byDept = {};
  pubs.forEach((p) => {
    if (!p.year) return;
    cleanDepartments(p.home_author_department).forEach((dept) => {
      const d = (byDept[dept] ||= {});
      d[p.year] = (d[p.year] || 0) + 1;
    });
  });

  // A decline only matters if it runs up to the latest complete year, not one that ended long ago.
  const latest = completeYears([...new Set(Object.values(byDept).flatMap((d) => Object.keys(d)))], now).sort().at(-1);
  const signals = [];
  Object.entries(byDept).forEach(([dept, perYear]) => {
    const years = completeYears(Object.keys(perYear), now).sort().slice(-span);
    if (years.length < span || years.at(-1) !== latest) return;
    const values = years.map((y) => perYear[y]);
    const falling = values.every((v, i) => i === 0 || v < values[i - 1]);
    if (!falling || values[0] < MIN_DECLINE_BASE) return;
    const deltaPct = Math.round(((values.at(-1) - values[0]) / values[0]) * 100);
    signals.push({
      id: `decline:${dept}`,
      kind: 'trend_decline',
      severity: deltaPct <= -30 ? 3 : 2,
      title: `${dept} publications declining ${span} years`,
      entity: { type: 'department', name: dept },
      metric: 'publications',
      evidence: { years, values, delta_pct: deltaPct },
      source: 'Publications by department',
    });
  });
  return signals.sort((a, b) => b.severity - a.severity || a.evidence.delta_pct - b.evidence.delta_pct);
}

/** Faculty with no publications on record, grouped per department. */
export function detectZeroOutput(faculty) {
  const zero = faculty.filter((f) => toNum(f.total_pub_count) === 0 && f.author_name);
  if (!zero.length) return [];
  const byDept = countBy(zero, (f) => cleanDepartments(f.department)[0]);
  const ranked = Object.entries(byDept).sort((a, b) => b[1] - a[1]);
  const [topDept, topCount] = ranked[0] || [null, 0];
  return [{
    id: 'zero-output',
    kind: 'zero_output',
    severity: zero.length / Math.max(faculty.length, 1) > 0.1 ? 3 : 2,
    title: `${zero.length} faculty with 0 publications`,
    entity: { type: 'faculty_group', name: 'University' },
    metric: 'publications',
    evidence: {
      count: zero.length,
      of_total: faculty.length,
      top_department: topDept,
      top_department_count: topCount,
      by_department: byDept,
    },
    source: 'Faculty directory',
  }];
}

const TARGET_LABELS = {
  publications: 'Publications',
  citations: 'Citations',
  hIndex: 'H-index',
  q1Percent: 'Q1 publication share',
  fundingCrore: 'External funding',
  patents: 'Patents',
  phdCompletions: 'PhD completions',
  activeResearchers: 'Active researchers',
};

/** Headline targets (publications, citations, ...) running below `threshold` of target. */
export function detectTargetGaps(targets, { threshold = 0.7 } = {}) {
  const signals = [];
  Object.entries(targets || {}).forEach(([key, t]) => {
    if (!t || t.invert || !t.target) return;
    const ratio = toNum(t.current) / t.target;
    if (ratio >= threshold) return;
    signals.push({
      id: `target:${key}`,
      kind: 'target_gap',
      severity: ratio < 0.5 ? 3 : 2,
      title: `${TARGET_LABELS[key] || key} at ${Math.round(ratio * 100)}% of target`,
      entity: { type: 'university', name: 'University' },
      metric: TARGET_LABELS[key] || key,
      evidence: { current: t.current, target: t.target, pct_of_target: Math.round(ratio * 100), period: t.period },
      source: 'Target progress',
    });
  });
  return signals;
}

/** Share of Q1 publications per campus far below the university figure. */
export function detectQ1Outliers(pubs, { gap = 0.5, minPubs = 30 } = {}) {
  const total = pubs.length;
  if (!total) return [];
  const q1All = pubs.filter((p) => p.q_rank_scopus === 'Q1').length / total;
  const byDept = {};
  pubs.forEach((p) => {
    cleanDepartments(p.home_author_department).forEach((d) => {
      const e = (byDept[d] ||= { n: 0, q1: 0 });
      e.n++;
      if (p.q_rank_scopus === 'Q1') e.q1++;
    });
  });
  return Object.entries(byDept)
    .filter(([, e]) => e.n >= minPubs && e.q1 / e.n < q1All * gap)
    .map(([dept, e]) => ({
      id: `q1:${dept}`,
      kind: 'outlier',
      severity: 2,
      title: `${dept} Q1 share well below university average`,
      entity: { type: 'department', name: dept },
      metric: 'q1_percent',
      evidence: {
        dept_q1_pct: Math.round((e.q1 / e.n) * 100),
        university_q1_pct: Math.round(q1All * 100),
        publications: e.n,
      },
      source: 'Q-rank distribution',
    }));
}

export function detectSignals({ pubs = [], faculty = [], targets = {} } = {}) {
  return [
    ...detectDeclines(pubs),
    ...detectZeroOutput(faculty),
    ...detectTargetGaps(targets),
    ...detectQ1Outliers(pubs),
  ].sort((a, b) => b.severity - a.severity);
}

/* ── Question generation (deterministic: built from the signal's own evidence) ── */

export function questionsForSignal(s) {
  const e = s.evidence;
  const name = s.entity?.name;
  switch (s.kind) {
    case 'trend_decline':
      return [
        `Why did ${name} publications fall from ${e.values[0]} in ${e.years[0]} to ${e.values.at(-1)} in ${e.years.at(-1)}?`,
        `Which ${name} faculty account for most of the drop in publications since ${e.years[0]}?`,
        `How does the ${name} trend compare with other departments over the same years?`,
      ];
    case 'zero_output':
      return [
        `Which departments have the most faculty with zero publications, and who are they?`,
        `Of the ${e.count} faculty with no publications, how many joined in the last 3 years?`,
        ...(e.top_department ? [`What would it take to get ${e.top_department} faculty publishing? Show their peers' output.`] : []),
      ];
    case 'target_gap':
      return [
        `What is driving the gap to the ${s.metric} target (${e.pct_of_target}% reached)?`,
        `Which departments contribute least towards the ${s.metric} target?`,
        `At the current run rate, will we reach the ${s.metric} target by ${e.period || 'year end'}?`,
      ];
    case 'outlier':
      return [
        `Why is the ${name} Q1 share (${e.dept_q1_pct}%) below the university's ${e.university_q1_pct}%?`,
        `Which ${name} faculty publish the most in Q1 journals, and which in lower quartiles?`,
      ];
    default:
      return [`Tell me more about: ${s.title}`];
  }
}

/** Compact, size-bounded view of a signal for the backend (it re-verifies numbers via SQL). */
export function signalContext(s) {
  return {
    kind: s.kind,
    title: s.title,
    entity: s.entity,
    metric: s.metric,
    evidence: s.evidence,
    source: s.source,
  };
}

export function askFocusFromSignal(s) {
  const questions = questionsForSignal(s);
  return {
    id: s.id,
    title: s.title,
    contextSummary: s.source,
    prompt: questions[0],
    prefill: questions[0],
    questions,
    signal: signalContext(s),
    ts: Date.now(),
  };
}
