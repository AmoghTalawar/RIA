import { executeSql } from './sqlTool';

const esc = (s) => String(s).replace(/'/g, "''");
const clean = (s) => s.trim().replace(/[?.!,]+$/, '').trim();

const METRIC_COL = {
  citation: 'scopus_citation',
  citations: 'scopus_citation',
  publication: 'total_pub_count',
  publications: 'total_pub_count',
  pub: 'total_pub_count',
  pubs: 'total_pub_count',
  publicationcount: 'total_pub_count',
  publicationcounts: 'total_pub_count',
  pubcount: 'total_pub_count',
  pubcounts: 'total_pub_count',
  hindex: 'scopus_hindex',
  'h-index': 'scopus_hindex',
  'h index': 'scopus_hindex',
  q1: 'scopus_q1_count',
  q1s: 'scopus_q1_count',
};

const METRIC_LABEL = {
  scopus_citation: 'Cit',
  total_pub_count: 'Pubs',
  scopus_hindex: 'H-idx',
  scopus_q1_count: 'Q1',
};

const DEPT_FILTER = (dept) => {
  const d = esc(dept);
  return `(short_name ILIKE '%${d}%' OR department ILIKE '%${d}%' OR institute ILIKE '%${d}%')`;
};

const DB_DOWN_MSG = "The research database is currently unavailable. Please try again later.";
const NO_MATCH_MSG = "No matching records found.";

const fail = (rows) => {
  if (!rows) return DB_DOWN_MSG;
  if (rows.unavailable) return DB_DOWN_MSG;
  if (rows.error) return null; // unknown error → fall through to LLM
  if (!Array.isArray(rows) || rows.length === 0) return NO_MATCH_MSG;
  return null; // ok
};

// ─────────────────────────────────────────────
// Intent patterns (ordered — more specific first)
// Each `match` returns an args object when it matches, else null.
// ─────────────────────────────────────────────

const INTENTS = [
  {
    name: 'qrank_distribution',
    match: (q) =>
      /q[- ]?rank\s+distribution/i.test(q) ||
      /(summarize|summary of|show)\s+(the\s+)?(university\s+)?q[- ]?rank/i.test(q)
        ? {}
        : null,
  },
  {
    name: 'yoy_total',
    match: (q) =>
      /\byoy\b|\byear[- ]over[- ]year\b|\bgrowth rate\b/i.test(q) ||
      /total\s+publication\s+count\s+and/i.test(q) ||
      /total\s+pubs?\s+and\s+yoy/i.test(q)
        ? {}
        : null,
  },
  {
    name: 'dept_highest_metric',
    match: (q) => {
      const m = q.match(
        /which\s+(?:department|dept|school)\s+has\s+(?:the\s+)?highest\s+(average\s+|avg\s+)?(h[- ]?index|citations?|publications?|pubs?|q1)/i,
      );
      return m ? { metric: m[2].toLowerCase().replace(/\s+/g, '') } : null;
    },
  },
  {
    name: 'qrank_in_dept',
    match: (q) => {
      const m = q.match(
        /(?:total\s+|how\s+many\s+)?(q[1-4])\s+(?:publications?|papers?|pubs?)\s+(?:from|in|of)\s+(?:the\s+)?([a-z &]+?)(?:\s+department|\s+dept|\s+school)?\s*\??$/i,
      );
      return m ? { qrank: m[1].toUpperCase(), dept: clean(m[2]) } : null;
    },
  },
  {
    name: 'top_faculty',
    match: (q) => {
      // "Top 10 authors by publication count" / "Top 5 faculty in CSE by citations"
      let m = q.match(
        /^(?:top|best|leading)\s+(\d+)?\s*(?:faculty|authors?|researchers?|publishers?)(?:\s+(?:in|from|of)\s+(.+?))?\s+by\s+(citations?|publications?|pubs?|publication\s+counts?|pub\s+counts?|h[-\s]?index|q1s?)\s*\??$/i,
      );
      if (m)
        return {
          limit: m[1] ? parseInt(m[1], 10) : 10,
          dept: clean(m[2] || ''),
          metric: m[3].toLowerCase(),
        };
      // "Who has highest citations?" / "Who has the most publications?"
      m = q.match(
        /^who\s+has\s+(?:the\s+)?(?:highest|most)\s+(citations?|publications?|pubs?|publication\s+counts?|h[-\s]?index|q1s?)(?:\s+(?:in|from|of)\s+(.+?))?\s*\??$/i,
      );
      if (m)
        return {
          limit: 1,
          dept: clean(m[2] || ''),
          metric: m[1].toLowerCase(),
        };
      return null;
    },
  },
  {
    name: 'faculty_qrank_year',
    // "Narayan DG's Q1 publications in 2024" / "Show Q2 papers by Patil in 2023"
    match: (q) => {
      let m = q.match(
        /^(.+?)'s?\s+(q[1-4])\s+(?:publications?|papers?|pubs?)(?:\s+(?:in|during|for)\s+(\d{4}))?\s*\.?\??$/i,
      );
      if (m) return { name: clean(m[1]), qrank: m[2].toUpperCase(), year: m[3] ? parseInt(m[3], 10) : null };
      m = q.match(
        /^(?:show|list|count)\s+(q[1-4])\s+(?:publications?|papers?|pubs?)\s+by\s+(.+?)(?:\s+(?:in|during|for)\s+(\d{4}))?\s*\.?\??$/i,
      );
      if (m) return { name: clean(m[2]), qrank: m[1].toUpperCase(), year: m[3] ? parseInt(m[3], 10) : null };
      return null;
    },
  },
  {
    name: 'top_journals',
    // "Which journal have we published in most often?" / "Top 5 journals"
    match: (q) => {
      if (
        /(?:which|what)\s+journals?\s+(?:have|has|do|did)\s+(?:we|i|the\s+university)?\s*publish(?:ed)?\s+(?:in\s+)?(?:most|the\s+most|most\s+often|more\s+often)/i.test(
          q,
        )
      )
        return { limit: 1 };
      const m = q.match(/^top\s+(\d+)?\s*journals?\b/i);
      if (m) return { limit: m[1] ? parseInt(m[1], 10) : 5 };
      if (/^most\s+(?:frequently\s+)?published\s+journals?/i.test(q)) return { limit: 5 };
      return null;
    },
  },
  {
    name: 'campus_unsupported',
    // BVB / Belagavi / Bengaluru campus isn't a queryable column in the current schema.
    // Intercept to give the user a clear message instead of a hallucinated answer.
    match: (q) =>
      /\b(?:bvb|belagavi|bengaluru|bangalore|hubli|hubballi)\s+campus\b/i.test(q) ||
      /\bcampus\s+(?:wise|level|split|break\s*down|comparison)\b/i.test(q)
        ? {}
        : null,
  },
  {
    name: 'yearly_count',
    match: (q) => {
      const m =
        q.match(
          /(?:how\s+many\s+|total\s+|number\s+of\s+)?(?:publications?|papers?|pubs?)\s+(?:are\s+there\s+)?(?:in|for|during)\s+(\d{4})\s*\??$/i,
        ) || q.match(/^publications?\s+in\s+(\d{4})\s*\??$/i);
      return m ? { year: parseInt(m[1], 10) } : null;
    },
  },
  {
    name: 'faculty_stats',
    match: (q) => {
      let m = q.match(/^(?:give\s+me\s+|show\s+me\s+)?stats?\s+(?:on|for|about|of)\s+(.+?)\s*\??$/i);
      if (m) return { name: clean(m[1]) };
      m = q.match(
        /^how\s+many\s+(?:publications?|papers?|pubs?)\s+(?:does|do|has|have|are\s+there\s+for|for)\s+(.+?)(?:\s+have|\s+has|\s+published|\s+written)?\s*\??$/i,
      );
      if (m) return { name: clean(m[1]), subset: 'pubcount' };
      m = q.match(/^(.+?)'s\s+(?:stats?|publications?|metrics?|citations?|h[- ]?index)\s*\??$/i);
      if (m) return { name: clean(m[1]) };
      m = q.match(/^tell\s+me\s+about\s+(.+?)\s*\??$/i);
      if (m) return { name: clean(m[1]) };
      return null;
    },
  },
];

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────

async function handleFacultyStats({ name, subset }) {
  const q = esc(name);
  const rows = await executeSql(
    `SELECT author_name, department, institute, total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count, journal_count, conference_count, similarity(author_name, '${q}') AS sim FROM v_faculty_full WHERE similarity(author_name, '${q}') > 0.2 ORDER BY sim DESC LIMIT 5`,
  );
  const err = fail(rows);
  if (err) return err;

  const top = rows[0];
  const runnerUp = rows[1]?.sim || 0;
  // "Unambiguous" = only one result, OR top similarity is high on its own,
  // OR top beats the runner-up by a clear margin (>= 0.1 absolute).
  const unambiguous =
    rows.length === 1 ||
    top.sim >= 0.7 ||
    (top.sim >= 0.4 && top.sim - runnerUp >= 0.1);

  if (unambiguous) {
    if (subset === 'pubcount') {
      return `**${top.author_name}** has **${top.total_pub_count}** publications.`;
    }
    return `**${top.author_name}** · ${top.department} · Pubs: ${top.total_pub_count} · Cit: ${top.scopus_citation} · H: ${top.scopus_hindex} · Q1: ${top.scopus_q1_count} · Journals: ${top.journal_count} · Conf: ${top.conference_count}`;
  }

  const lines = rows
    .slice(0, 5)
    .map(
      (r, i) =>
        `${i + 1}. **${r.author_name}** · ${r.department} · Pubs: ${r.total_pub_count} · Cit: ${r.scopus_citation}`,
    )
    .join('\n');
  return `Multiple faculty match "${name}":\n${lines}\n\nWhich one did you mean?`;
}

async function handleTopFaculty({ limit, dept, metric }) {
  const col = METRIC_COL[metric.replace(/[- ]/g, '')] || METRIC_COL[metric] || 'scopus_citation';
  const n = Math.min(Math.max(limit, 1), 20);
  const where = dept ? `WHERE ${DEPT_FILTER(dept)}` : '';
  const rows = await executeSql(
    `SELECT author_name, department, total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count FROM v_faculty_full ${where} ORDER BY ${col} DESC NULLS LAST LIMIT ${n}`,
  );
  const err = fail(rows);
  if (err) return err;

  const label = METRIC_LABEL[col];
  const header = dept ? `Top ${n} in ${dept} by ${label}:` : `Top ${n} by ${label}:`;
  const lines = rows
    .map((r, i) => `${i + 1}. **${r.author_name}** (${r.department}) — ${label}: ${r[col] ?? 0}`)
    .join('\n');
  return `${header}\n${lines}`;
}

async function handleYearlyCount({ year }) {
  const rows = await executeSql(`SELECT COUNT(*)::int AS cnt FROM publications WHERE year = ${year}`);
  const err = fail(rows);
  if (err) return err;
  return `**${rows[0].cnt}** publications in ${year}.`;
}

async function handleYoyTotal() {
  const rows = await executeSql(
    `WITH y AS (SELECT year, COUNT(*)::int AS n FROM publications WHERE year IN (2024,2025) GROUP BY year), t AS (SELECT COUNT(*)::int AS n FROM publications) SELECT (SELECT n FROM t) AS total, COALESCE((SELECT n FROM y WHERE year=2024),0) AS prev, COALESCE((SELECT n FROM y WHERE year=2025),0) AS curr, ROUND(100.0*(COALESCE((SELECT n FROM y WHERE year=2025),0)-COALESCE((SELECT n FROM y WHERE year=2024),0))/NULLIF((SELECT n FROM y WHERE year=2024),0),2) AS yoy_pct`,
  );
  const err = fail(rows);
  if (err) return err;
  const r = rows[0];
  return `Total publications: **${r.total}**. 2024: ${r.prev}, 2025: ${r.curr} — YoY growth **${r.yoy_pct ?? 0}%**.`;
}

async function handleQrankInDept({ qrank, dept }) {
  const rows = await executeSql(
    `SELECT COUNT(DISTINCT p.id)::int AS cnt FROM publications p JOIN faculty_publications fp ON fp.publication_id = p.id JOIN v_faculty_full f ON f.faculty_id = fp.faculty_id WHERE p.q_rank_scopus = '${qrank}' AND ${DEPT_FILTER(dept)}`,
  );
  const err = fail(rows);
  if (err) return err;
  return `**${rows[0].cnt}** ${qrank} publications in ${dept}.`;
}

async function handleDeptHighestMetric({ metric }) {
  const map = {
    hindex: { expr: 'AVG(scopus_hindex)', label: 'avg H-index' },
    'h-index': { expr: 'AVG(scopus_hindex)', label: 'avg H-index' },
    citations: { expr: 'SUM(scopus_citation)', label: 'total citations' },
    citation: { expr: 'SUM(scopus_citation)', label: 'total citations' },
    publications: { expr: 'SUM(total_pub_count)', label: 'total publications' },
    publication: { expr: 'SUM(total_pub_count)', label: 'total publications' },
    pubs: { expr: 'SUM(total_pub_count)', label: 'total publications' },
    q1: { expr: 'SUM(scopus_q1_count)', label: 'total Q1 publications' },
  };
  const cfg = map[metric] || map.hindex;
  const rows = await executeSql(
    `SELECT department, ROUND(${cfg.expr}::numeric, 2) AS val FROM v_faculty_full GROUP BY department ORDER BY val DESC NULLS LAST LIMIT 1`,
  );
  const err = fail(rows);
  if (err) return err;
  return `**${rows[0].department}** has the highest ${cfg.label}: ${rows[0].val}.`;
}

async function handleQrankDistribution() {
  const rows = await executeSql(
    `SELECT q_rank_scopus, COUNT(*)::int AS cnt FROM publications WHERE q_rank_scopus IS NOT NULL GROUP BY q_rank_scopus ORDER BY q_rank_scopus`,
  );
  const err = fail(rows);
  if (err) return err;
  const total = rows.reduce((s, r) => s + r.cnt, 0);
  const lines = rows
    .map((r) => `- ${r.q_rank_scopus}: **${r.cnt}** (${((r.cnt / total) * 100).toFixed(1)}%)`)
    .join('\n');
  return `Q-rank distribution (${total} ranked pubs):\n${lines}`;
}

async function handleFacultyQrankYear({ name, qrank, year }) {
  const q = esc(name);
  const yearFilter = year ? `AND p.year = ${year}` : '';
  const rows = await executeSql(
    `WITH matched AS (
       SELECT faculty_id, author_name, similarity(author_name, '${q}') AS sim
       FROM v_faculty_full
       WHERE similarity(author_name, '${q}') > 0.2
       ORDER BY sim DESC LIMIT 1
     )
     SELECT (SELECT author_name FROM matched) AS author_name,
            COUNT(DISTINCT p.id)::int AS cnt
     FROM publications p
     JOIN faculty_publications fp ON fp.publication_id = p.id
     WHERE fp.faculty_id = (SELECT faculty_id FROM matched)
       AND p.q_rank_scopus = '${qrank}'
       ${yearFilter}`,
  );
  const err = fail(rows);
  if (err) return err;
  const r = rows[0];
  if (!r.author_name) return `No faculty matched "${name}".`;
  const scope = year ? ` in ${year}` : '';
  return `**${r.author_name}** has **${r.cnt}** ${qrank} publications${scope}.`;
}

async function handleTopJournals({ limit }) {
  const n = Math.min(Math.max(limit, 1), 20);
  const rows = await executeSql(
    `SELECT source_publication, COUNT(*)::int AS cnt FROM publications WHERE source_publication IS NOT NULL AND source_publication <> '' GROUP BY source_publication ORDER BY cnt DESC LIMIT ${n}`,
  );
  const err = fail(rows);
  if (err) return err;
  if (n === 1) {
    return `The most-published-in journal is **${rows[0].source_publication}** with ${rows[0].cnt} publications.`;
  }
  const lines = rows.map((r, i) => `${i + 1}. **${r.source_publication}** — ${r.cnt} pubs`).join('\n');
  return `Top ${n} journals by publication count:\n${lines}`;
}

async function handleCampusUnsupported() {
  return (
    "Campus-level data (BVB / Belagavi / Bengaluru) isn't in the current database schema — only **departments**, **schools/institutes**, and **faculty** are tracked. " +
    "Try asking about a specific school (e.g., *School of Computer Science*) or department instead."
  );
}

const HANDLERS = {
  faculty_stats: handleFacultyStats,
  top_faculty: handleTopFaculty,
  yearly_count: handleYearlyCount,
  yoy_total: handleYoyTotal,
  qrank_in_dept: handleQrankInDept,
  dept_highest_metric: handleDeptHighestMetric,
  qrank_distribution: handleQrankDistribution,
  faculty_qrank_year: handleFacultyQrankYear,
  top_journals: handleTopJournals,
  campus_unsupported: handleCampusUnsupported,
};

// ─────────────────────────────────────────────
// Public entry point.
// Returns a markdown reply when an intent matched; null = fall through to LLM.
// ─────────────────────────────────────────────
export async function routeIntent(userMessage) {
  const q = userMessage.trim();
  for (const intent of INTENTS) {
    const args = intent.match(q);
    if (args) {
      try {
        const reply = await HANDLERS[intent.name](args);
        return reply; // may be a user-facing string or null (fall through on unknown error)
      } catch (err) {
        console.error(`[intentRouter] ${intent.name} failed:`, err);
        return null;
      }
    }
  }
  return null;
}
