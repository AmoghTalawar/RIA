/**
 * Live-data view model for the Executive Dean dashboard. Pure: takes the rows the page fetched
 * (publications, faculty, institute summary) and returns everything the cards/charts render.
 * Nothing here is mocked or estimated; where the database has no figure the field is left out.
 *
 * A publication's institute field can list several institutes joined by ';' (one per co-author), so
 * board totals count a paper once per distinct institute and can add up to more than the university total.
 */
import { cleanDepartments } from './signals.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 6).toUpperCase();
const RANK_VALUE = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
const PALETTE = ['#B91C1C', '#0F766E', '#3730A3', '#B45309', '#44403C'];

export function buildExecutiveDeanData({ pubs = [], faculty = [], institutes = [], now = new Date() } = {}) {
  const shortByName = {};
  institutes.forEach((i) => { if (i.name) shortByName[i.name] = i.short_name || initials(i.name); });

  /* ── per-board aggregates ── */
  const boards = {};
  const years = {};
  pubs.forEach((p) => {
    const yr = p.year ? Number(p.year) : null;
    const cites = num(p.scs_citations);
    const q = p.q_rank_scopus;
    if (yr) {
      const y = (years[yr] ||= { pubs: 0, cites: 0, q1: 0 });
      y.pubs++; y.cites += cites; if (q === 'Q1') y.q1++;
    }
    cleanDepartments(p.home_author_institute).forEach((name) => {
      const b = (boards[name] ||= {
        name, shortName: shortByName[name] || initials(name), pubs: 0, cites: 0,
        Q1: 0, Q2: 0, Q3: 0, Q4: 0, rankSum: 0, rankN: 0, ifSum: 0, ifN: 0, byYear: {},
      });
      b.pubs++; b.cites += cites;
      if (q in RANK_VALUE) { b[q]++; b.rankSum += RANK_VALUE[q]; b.rankN++; }
      if (p.impact_factor != null && num(p.impact_factor) > 0) { b.ifSum += num(p.impact_factor); b.ifN++; }
      if (yr) b.byYear[yr] = (b.byYear[yr] || 0) + cites;
    });
  });

  const ranked = Object.values(boards).sort((a, b) => b.pubs - a.pubs);
  const top = ranked.slice(0, 8);

  /* ── years: only complete ones count for trends ── */
  const completeYears = Object.keys(years).map(Number).filter((y) => y < now.getFullYear()).sort();
  const latest = completeYears.at(-1);
  const prev = completeYears.at(-2);
  const trendYears = completeYears.slice(-3);
  const pubGrowthPct = latest && prev && years[prev].pubs > 0
    ? Math.round(((years[latest].pubs - years[prev].pubs) / years[prev].pubs) * 100)
    : null;

  /* ── headline KPIs ── */
  const totalPubs = pubs.length;
  const q1Total = pubs.filter((p) => p.q_rank_scopus === 'Q1').length;
  const totalCitations = faculty.reduce((s, f) => s + num(f.scopus_citation), 0);
  const activeResearchers = faculty.filter((f) => num(f.total_pub_count) > 0).length;

  const kpis = {
    publications: { value: totalPubs, delta: pubGrowthPct ?? undefined },
    citations: { value: totalCitations },
    q1Percent: { value: pct(q1Total, totalPubs) },
    activeResearchers: { value: activeResearchers, of: faculty.length },
  };

  /* ── researcher activity bands (from each faculty member's total publication count) ── */
  const bands = [
    { name: 'None', color: '#B91C1C', test: (n) => n === 0 },
    { name: '1-5', color: '#B45309', test: (n) => n >= 1 && n <= 5 },
    { name: '6-20', color: '#3730A3', test: (n) => n >= 6 && n <= 20 },
    { name: '21+', color: '#0F766E', test: (n) => n >= 21 },
  ];
  const researcherActivity = bands.map((b) => ({
    name: b.name, color: b.color, value: faculty.filter((f) => b.test(num(f.total_pub_count))).length,
  }));

  /* ── per-board views ── */
  const facultyBoards = top.map((b) => ({ name: b.name, shortName: b.shortName, actual: b.pubs }));
  const facultyBoardQRanks = top.map((b) => ({
    shortName: b.shortName, Q1: b.Q1, Q2: b.Q2, Q3: b.Q3, Q4: b.Q4,
    avgQRank: b.rankN ? Math.round((b.rankSum / b.rankN) * 10) / 10 : 0,
  }));
  const tableRows = top.map((b, idx) => ({
    id: idx,
    facultyBoard: b.name,
    shortName: b.shortName,
    actual: b.pubs,
    q1Count: b.Q1,
    q1Ratio: `${pct(b.Q1, b.pubs)}%`,
    avgIF: b.ifN ? Math.round((b.ifSum / b.ifN) * 100) / 100 : 0,
  }));

  /* ── citations on papers published each year (paper-level), top 5 boards ── */
  const trendBoards = top.slice(0, 5);
  const citationTrend = trendYears.map((y) => {
    const row = { year: String(y) };
    trendBoards.forEach((b) => { row[b.shortName] = b.byYear[y] || 0; });
    return row;
  });
  const citationSeries = trendBoards.map((b) => ({ key: b.shortName, name: b.shortName }));
  const citationColors = Object.fromEntries(trendBoards.map((b, i) => [b.shortName, PALETTE[i % PALETTE.length]]));

  const avgHIndex = institutes
    .map((i) => ({ name: i.short_name || initials(i.name || ''), value: Math.round(num(i.avg_scopus_hindex) * 10) / 10 }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const growth = trendYears.map((y) => ({ year: String(y), pubs: years[y].pubs, cites: years[y].cites }));

  const citationCard = {
    total: totalCitations,
    latestYear: latest ?? null,
    prevYear: prev ?? null,
    latestPubs: latest ? years[latest].pubs : 0,
    prevPubs: prev ? years[prev].pubs : 0,
    pubGrowthPct,
  };

  /* ── plain-language insights, each one a fact computed above ── */
  const insights = [];
  if (ranked.length) {
    insights.push({
      type: 'success', priority: 'medium', title: `${ranked[0].shortName} leads in publications`,
      message: `${ranked[0].name} has ${ranked[0].pubs.toLocaleString('en-IN')} publications, ${pct(ranked[0].pubs, totalPubs)}% of the university total.`,
    });
    const low = [...ranked].filter((b) => b.pubs >= 10).sort((a, b) => a.pubs - b.pubs)[0];
    if (low && low !== ranked[0]) {
      insights.push({
        type: 'warning', priority: 'high', title: `${low.shortName} has the lowest output`,
        message: `${low.name} has ${low.pubs} publications, ${pct(low.Q1, low.pubs)}% of them Q1.`,
      });
    }
  }
  if (pubGrowthPct !== null) {
    insights.push({
      type: 'trend', priority: 'medium', title: `Publications ${pubGrowthPct >= 0 ? 'up' : 'down'} ${Math.abs(pubGrowthPct)}% in ${latest}`,
      message: `${years[latest].pubs} papers in ${latest} against ${years[prev].pubs} in ${prev}.`,
    });
  }
  const bestQ1 = ranked.filter((b) => b.pubs >= 50).sort((a, b) => b.Q1 / b.pubs - a.Q1 / a.pubs)[0];
  insights.push({
    type: 'info', priority: 'low', title: `Q1 share is ${pct(q1Total, totalPubs)}%`,
    message: bestQ1
      ? `${q1Total.toLocaleString('en-IN')} of ${totalPubs.toLocaleString('en-IN')} papers are Q1. Highest share: ${bestQ1.shortName} at ${pct(bestQ1.Q1, bestQ1.pubs)}%.`
      : `${q1Total.toLocaleString('en-IN')} of ${totalPubs.toLocaleString('en-IN')} papers are Q1.`,
  });

  return {
    kpis, facultyBoards, facultyBoardQRanks, tableRows, citationTrend, citationSeries, citationColors,
    avgHIndex, growth, citationCard, researcherActivity, insights, latestYear: latest ?? null,
  };
}
