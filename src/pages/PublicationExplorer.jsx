/**
 * PublicationExplorer.jsx — Interactive Plotly drill-down for RIA Publications
 *
 * Three tabs powered by Plotly.js (already in package.json as plotly.js ^3.4.0):
 *   Tab 0 — Sunburst:   Campus → Department → Q-Rank  (click sector to zoom)
 *   Tab 1 — Treemap:    Departments sized by pub count, colored by Q1 share
 *   Tab 2 — Stacked Bar: Year × Q-Rank breakdown       (click bar for dept detail)
 *
 * Data source: /public/RIA_Publications.xlsx (6,516 rows, 50 columns)
 * Parsed client-side via SheetJS (xlsx) through the shared excelDataLoader.
 *
 * Design: matches the existing Tailwind + panel class system used across
 * UniversityDeanDashboard, StaffDashboard, etc.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist';
import ReactMarkdown from 'react-markdown';
import {
  BookOpen,
  TreePine,
  BarChart3,
  Loader2,
  X,
  ChevronRight,
  TrendingUp,
  Award,
  FileText,
  MessageSquare,
  Send,
  Bot,
  User,
  Sparkles,
  Settings,
  Key,
} from 'lucide-react';
import { loadExcelData, aggregateUniversityData } from '../data/excelDataLoader';
import publicationContext from '../data/publicationContext.json';
import departmentContextData from '../data/departmentContext.json';

/**
 * Factory pattern: creates a React <Plot> component bound to the FULL
 * plotly.js-dist bundle. The full dist (~3 MB) is required because
 * sunburst and treemap trace types are NOT in plotly.js-basic-dist.
 * Must be placed after all import statements (ESLint import/first rule).
 */
const Plot = createPlotlyComponent(Plotly);

/* ─────────────────────────────────────────────
 *  Constants & helpers
 * ───────────────────────────────────────────── */

/** Tab configuration — each tab has a key, label, and Lucide icon */
const TABS = [
  { key: 'sunburst', label: 'Publication Hierarchy', icon: BookOpen },
  { key: 'treemap',  label: 'Department Landscape',  icon: TreePine },
  { key: 'trends',   label: 'Year × Q-Rank Trends',  icon: BarChart3 },
];

/** KLE brand + accent palette — same palette as other dashboard pages */
const COLORS = {
  Q1:       '#0F766E',  // Teal     — top quartile
  Q2:       '#3730A3',  // Indigo
  Q3:       '#B45309',  // Gold
  Q4:       '#B91C1C',  // KLE Crimson
  Unranked: '#78716C',  // Smoke/gray
  BVB:       '#B91C1C',
  Belagavi:  '#3730A3',
  Bengaluru: '#0F766E',
  Other:     '#6D28D9',
};

/**
 * Resolve campus from HOME AUTHOR LOCATION string.
 * Same logic as excelDataLoader.js lines 130-140.
 */
function getCampus(location) {
  const loc = (location || '').toLowerCase();
  if (loc.includes('hubballi') || loc.includes('hubli') || loc.includes('dharwad')) return 'BVB';
  if (loc.includes('belagavi') || loc.includes('belgaum')) return 'Belagavi';
  if (loc.includes('bengaluru') || loc.includes('bangalore')) return 'Bengaluru';
  return 'BVB'; // default — most faculty are BVB
}

/** Format large numbers: 6516 → "6,516" */
const fmt = (n) => Number(n).toLocaleString('en-IN');

/** Framer Motion transition for tab content */
const tabVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.15 } },
};

/* ─────────────────────────────────────────────
 *  Data aggregation — runs once after Excel load
 * ───────────────────────────────────────────── */

/**
 * Build all Plotly-ready datasets from the raw publications array.
 *
 * Returns: { sunburst, treemap, yearStack, deptStats, campusStats }
 *
 *  sunburst  — { ids, labels, parents, values }  for Plotly Sunburst trace
 *  treemap   — { ids, labels, parents, values, colors }  for Plotly Treemap
 *  yearStack — { years, q1, q2, q3, q4, unranked }  for stacked bar
 *  deptStats — Map<dept, { total, q1, q2, q3, q4, unranked, campus, topPubs }>
 *  campusStats — { BVB, Belagavi, Bengaluru, Other } counts
 */
function buildPlotlyData(publications) {
  /* ── Step 1: Bucket every publication by campus, department, Q-rank ── */
  const deptMap = {};   // dept → { campus, Q1, Q2, Q3, Q4, Unranked, total, pubs[] }
  const campusCounts = { BVB: 0, Belagavi: 0, Bengaluru: 0, Other: 0 };
  const yearQRank = {}; // year → { Q1, Q2, Q3, Q4, Unranked }

  publications.forEach((p) => {
    const dept   = (p['HOME AUTHOR DEPARTMENT'] || 'Unknown').trim();
    const campus = getCampus(p['HOME AUTHOR LOCATION']);
    const qr     = (p['Q RANK(SCS)'] || '').trim();
    const year   = Number(p['YEAR']);
    const qKey   = ['Q1', 'Q2', 'Q3', 'Q4'].includes(qr) ? qr : 'Unranked';

    // Campus totals
    campusCounts[campus] = (campusCounts[campus] || 0) + 1;

    // Department bucket
    if (!deptMap[dept]) {
      deptMap[dept] = { campus, Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0, total: 0, pubs: [] };
    }
    deptMap[dept][qKey]++;
    deptMap[dept].total++;
    // Keep a sample of publications for the detail panel (max 20)
    if (deptMap[dept].pubs.length < 20) {
      deptMap[dept].pubs.push({
        title: p['PUBLICATION TITLE'] || '—',
        journal: p['SOURCE PUBLICATION'] || '—',
        year,
        qRank: qKey,
        citescore: Number(p['CITE SCORE']) || 0,
        doi: p['DOI'] || '',
      });
    }

    // Year × Q-Rank for stacked bar
    if (year >= 2018 && year <= 2030) {
      if (!yearQRank[year]) yearQRank[year] = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
      yearQRank[year][qKey]++;
    }
  });

  /* ── Step 2: Build Sunburst arrays ──
   * Hierarchy:  Total → Campus → Department → Q-Rank
   * Plotly sunburst needs 4 parallel arrays: ids, labels, parents, values
   */
  const ids = [], labels = [], parents = [], values = [];

  // L1: Campuses (no root node — campuses are the innermost ring)
  Object.entries(campusCounts)
    .filter(([, v]) => v > 0)
    .forEach(([campus, count]) => {
      ids.push(`C-${campus}`);
      labels.push(campus);
      parents.push('');
      values.push(count);
    });

  // L3: Departments (under their campus)
  // L4: Q-Ranks (under their department)
  // Use the full dept name as the ID — Plotly IDs just need to be unique strings.
  // Truncating caused collisions (e.g. "Computer Science" and "Computer Science and Eng"
  // both became "D-ComputerScie") which caused Plotly to throw "ambiguous" and render blank.
  Object.entries(deptMap)
    .sort((a, b) => b[1].total - a[1].total)   // largest departments first
    .forEach(([dept, info]) => {
      const deptId = `D||${dept}`;   // full name as ID, prefixed to avoid collisions with campus IDs
      ids.push(deptId);
      labels.push(dept.length > 28 ? dept.slice(0, 26) + '…' : dept);
      parents.push(`C-${info.campus}`);
      values.push(info.total);

      // Q-rank children for this department
      ['Q1', 'Q2', 'Q3', 'Q4', 'Unranked'].forEach((qr) => {
        if (info[qr] > 0) {
          ids.push(`${deptId}||${qr}`);
          labels.push(qr);
          parents.push(deptId);
          values.push(info[qr]);
        }
      });
    });

  const sunburst = { ids, labels, parents, values };

  /* ── Step 3: Build Treemap arrays ──
   * Flat list: one node per department, sized by total pubs, colored by Q1 share.
   * The color indicates research quality: greener = higher Q1%.
   */
  // Root value must equal the sum of all children when branchvalues:'total' is used.
  // We populate it after building children, or just set it to publications.length.
  const tmIds = ['All'], tmLabels = ['All Departments'], tmParents = [''], tmValues = [publications.length];
  const tmColors = ['#f5f5f4'];  // root node: neutral

  Object.entries(deptMap)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([dept, info]) => {
      const q1Share = info.total > 0 ? info.Q1 / info.total : 0;
      // Color gradient: low Q1 → crimson (#B91C1C), mid → gold (#B45309), high Q1 → teal (#0F766E)
      let color;
      if (q1Share >= 0.3)      color = '#0F766E';  // strong — teal
      else if (q1Share >= 0.15) color = '#3730A3';  // moderate — indigo
      else if (q1Share >= 0.05) color = '#B45309';  // low — gold
      else                      color = '#B91C1C';  // very low — crimson

      tmIds.push(dept);
      tmLabels.push(dept);
      tmParents.push('All');
      tmValues.push(info.total);
      tmColors.push(color);
    });

  const treemap = { ids: tmIds, labels: tmLabels, parents: tmParents, values: tmValues, colors: tmColors };

  /* ── Step 4: Build Year × Q-Rank stacked bar data ── */
  const sortedYears = Object.keys(yearQRank).map(Number).sort();
  const yearStack = {
    years: sortedYears.map(String),
    Q1:       sortedYears.map((y) => yearQRank[y].Q1),
    Q2:       sortedYears.map((y) => yearQRank[y].Q2),
    Q3:       sortedYears.map((y) => yearQRank[y].Q3),
    Q4:       sortedYears.map((y) => yearQRank[y].Q4),
    Unranked: sortedYears.map((y) => yearQRank[y].Unranked),
  };

  /* ── Step 5: Department stats for the detail panel ── */
  const deptStats = {};
  Object.entries(deptMap).forEach(([dept, info]) => {
    deptStats[dept] = {
      total: info.total,
      Q1: info.Q1, Q2: info.Q2, Q3: info.Q3, Q4: info.Q4, Unranked: info.Unranked,
      campus: info.campus,
      q1Pct: info.total > 0 ? Math.round((info.Q1 / info.total) * 100) : 0,
      topPubs: info.pubs.sort((a, b) => b.citescore - a.citescore),
    };
  });

  return { sunburst, treemap, yearStack, deptStats, campusStats: campusCounts };
}

/* ─────────────────────────────────────────────
 *  Detail Panel — slides in when a dept is clicked
 * ───────────────────────────────────────────── */

function DeptDetailPanel({ dept, stats, onClose }) {
  if (!dept || !stats) return null;

  /** Mini donut data for this department's Q-rank split */
  const qData = ['Q1', 'Q2', 'Q3', 'Q4', 'Unranked']
    .filter((q) => stats[q] > 0)
    .map((q) => ({ label: q, value: stats[q], color: COLORS[q] }));

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="panel border-l-4 border-accent-teal"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-md">
        <div>
          <h3 className="font-heading font-semibold text-h2 text-kle-dark">{dept}</h3>
          <p className="text-label text-smoke mt-xs">
            {stats.campus} Campus · {fmt(stats.total)} publications
          </p>
        </div>
        <button onClick={onClose} className="p-xs rounded hover:bg-fog transition-colors">
          <X size={18} className="text-smoke" />
        </button>
      </div>

      {/* Q1% badge */}
      <div className="flex items-center gap-sm mb-md">
        <span
          className={`inline-flex items-center gap-xs px-md py-xs rounded-full text-label font-medium ${
            stats.q1Pct >= 30 ? 'bg-accent-teal/10 text-accent-teal'
            : stats.q1Pct >= 15 ? 'bg-accent-indigo/10 text-accent-indigo'
            : 'bg-kle-crimson/10 text-kle-crimson'
          }`}
        >
          <Award size={14} />
          {stats.q1Pct}% Q1
        </span>
        <span className="text-label text-smoke">
          Q1: {stats.Q1} · Q2: {stats.Q2} · Q3: {stats.Q3} · Q4: {stats.Q4}
        </span>
      </div>

      {/* Mini Q-Rank pie */}
      <div className="h-48 mb-md">
        <Plot
          data={[{
            type: 'pie',
            labels: qData.map((d) => d.label),
            values: qData.map((d) => d.value),
            marker: { colors: qData.map((d) => d.color) },
            hole: 0.5,
            textinfo: 'label+percent',
            textfont: { size: 11, family: 'Inter' },
            hovertemplate: '%{label}: %{value} pubs (%{percent})<extra></extra>',
          }]}
          layout={{
            autosize: true,
            margin: { t: 10, b: 10, l: 10, r: 10 },
            showlegend: false,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
          config={{ displayModeBar: false, responsive: true }}
        />
      </div>

      {/* Top publications table */}
      <h4 className="font-heading font-medium text-sm text-kle-dark mb-sm flex items-center gap-xs">
        <FileText size={14} /> Top Publications (by CiteScore)
      </h4>
      <div className="overflow-y-auto max-h-60 space-y-sm">
        {stats.topPubs.slice(0, 8).map((pub, i) => (
          <div key={i} className="p-sm rounded-md bg-fog/50 border border-mist">
            <p className="text-xs font-medium text-kle-dark leading-snug line-clamp-2">{pub.title}</p>
            <div className="flex items-center gap-sm mt-xs text-micro text-smoke">
              <span>{pub.journal}</span>
              <span>·</span>
              <span>{pub.year}</span>
              <span>·</span>
              <span className={`font-medium ${
                pub.qRank === 'Q1' ? 'text-accent-teal' :
                pub.qRank === 'Q2' ? 'text-accent-indigo' :
                pub.qRank === 'Q3' ? 'text-accent-gold' : 'text-smoke'
              }`}>{pub.qRank}</span>
              {pub.citescore > 0 && <span>· CS {pub.citescore.toFixed(1)}</span>}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
 *  AI Chat Panel — Groq-powered Q&A on publication data
 * ───────────────────────────────────────────── */

function PublicationAIChat({ publications, deptStats, campusStats, yearStack }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('groq_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! I'm your Publication AI Assistant. Ask me anything about KLE Tech's 6,500+ publications — departments, Q-ranks, trends, journals, or specific authors.", isBot: true },
  ]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, showSettings]);

  const saveApiKey = (e) => {
    e.preventDefault();
    setApiKey(tempKey);
    localStorage.setItem('groq_api_key', tempKey);
    setShowSettings(false);
  };

  /* ── Pre-computed base context from chart data (~2K tokens) ── */
  const baseContext = useMemo(() => {
    if (!publications.length) return 'No data loaded.';

    // Top 15 departments by count
    const topDepts = Object.entries(deptStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15);

    // Q-rank totals
    const qTotals = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
    Object.values(deptStats).forEach((s) => {
      qTotals.Q1 += s.Q1; qTotals.Q2 += s.Q2; qTotals.Q3 += s.Q3;
      qTotals.Q4 += s.Q4; qTotals.Unranked += s.Unranked;
    });

    // Article type counts
    const artTypes = {};
    const journalCounts = {};
    const levelCounts = { International: 0, National: 0 };
    const indexCounts = { Scopus: 0, WoS: 0, SCI: 0, UGC: 0, PubMed: 0, GoogleScholar: 0 };
    publications.forEach((p) => {
      const at = (p['ARTICLE TYPE'] || 'Unknown').trim();
      artTypes[at] = (artTypes[at] || 0) + 1;
      const j = (p['SOURCE PUBLICATION'] || '').trim();
      if (j) journalCounts[j] = (journalCounts[j] || 0) + 1;
      const lv = (p['LEVEL'] || '').trim();
      if (lv === 'International') levelCounts.International++;
      else if (lv === 'National') levelCounts.National++;
      if (p['SCS'] && String(p['SCS']) !== '0') indexCounts.Scopus++;
      if (p['WOS'] && String(p['WOS']) !== '0') indexCounts.WoS++;
      if (p['SCI'] === 'YES') indexCounts.SCI++;
      if (String(p['UGC'] || '').startsWith('YES')) indexCounts.UGC++;
      if (p['PM'] === 'INDEXED') indexCounts.PubMed++;
      if (p['GS'] && String(p['GS']) !== '0') indexCounts.GoogleScholar++;
    });

    const topJournals = Object.entries(journalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([j, c]) => `${j}: ${c}`)
      .join('\n');

    return `=== PUBLICATION OVERVIEW ===
Total Publications: ${publications.length}
Campuses: BVB ${campusStats.BVB}, Belagavi ${campusStats.Belagavi}, Bengaluru ${campusStats.Bengaluru}
Departments: ${Object.keys(deptStats).length}

=== Q-RANK DISTRIBUTION (Scopus) ===
Q1: ${qTotals.Q1} (${(qTotals.Q1/publications.length*100).toFixed(1)}%) | Q2: ${qTotals.Q2} | Q3: ${qTotals.Q3} | Q4: ${qTotals.Q4} | Unranked: ${qTotals.Unranked}

=== ARTICLE TYPES ===
${Object.entries(artTypes).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`${t}: ${c}`).join(' | ')}

=== LEVEL ===
International: ${levelCounts.International} | National: ${levelCounts.National}

=== INDEXING ===
Scopus: ${indexCounts.Scopus} | WoS: ${indexCounts.WoS} | SCI: ${indexCounts.SCI} | UGC: ${indexCounts.UGC} | PubMed: ${indexCounts.PubMed} | Google Scholar: ${indexCounts.GoogleScholar}

=== YEAR-WISE PUBLICATIONS ===
${yearStack.years.map((y, i) => `${y}: ${yearStack.Q1[i]+yearStack.Q2[i]+yearStack.Q3[i]+yearStack.Q4[i]+yearStack.Unranked[i]} (Q1:${yearStack.Q1[i]})`).join(' | ')}

=== DEPARTMENTS (top 15) ===
${departmentContextData.slice(0, 15).map(d => `${d.department}: ${d.totalPubs} pubs, ${d.totalCitations} cit, H:${d.avgHIndex}, Q1:${d.qRank.Q1}`).join('\n')}

=== TOP 15 JOURNALS ===
${topJournals}

Total publications: ${publicationContext.length}`;
  }, [publications, deptStats, campusStats, yearStack]);

  // Token budget helpers
  const estimateTokens = (text) => Math.ceil((text || '').length / 4);
  const MAX_CONTEXT_TOKENS = 5500;

  const formatPubList = (pubs, tokenBudget) => {
    let result = '';
    const pubLine = (p, i) => `${i + 1}. "${p.title}" | ${p.journal || 'N/A'} | ${p.year} | ${p.qrankScopus || 'N/A'} | ${p.department || 'N/A'}\n`;
    const avgLineTokens = 40;
    const maxByBudget = Math.max(5, Math.floor(Math.max(0, tokenBudget - 50) / avgLineTokens));
    const maxPubs = Math.min(pubs.length, maxByBudget, 30);

    if (maxPubs >= pubs.length) {
      result += `\nALL ${pubs.length} PUBLICATIONS:\n`;
      pubs.forEach((p, i) => { result += pubLine(p, i); });
    } else {
      result += `\n${pubs.length} PUBLICATIONS (showing ${maxPubs}, use counts above for exact totals):\n`;
      pubs.slice(0, maxPubs).forEach((p, i) => { result += pubLine(p, i); });
    }
    return result;
  };

  /* ── Dynamic query context: search pre-processed publication data ── */
  const buildQueryContext = (query) => {
    const q = query.toLowerCase();
    const stopWords = new Set(['the','and','for','how','many','what','who','give','get','me','is','are','was','were','in','on','at','of','to','a','an','by','show','list','tell','details','data','info','publications','publication','about','please','can','you','do','has','have','with','from','all','total','number','count','paper','papers','titles','title','journal','journals','research','work','works','their','them','author','authors','name','professor','prof','doctor','published','wrote','written','done','did','much','specific','specifically']);
    const queryWords = q.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));
    if (queryWords.length === 0) return '';

    let extra = '';

    // Extract year and Q-rank from query
    const yearMatch = q.match(/\b(20[12]\d)\b/);
    const targetYear = yearMatch ? yearMatch[1] : null;
    const qrankMatch = q.match(/\bq([1-4])\b/i);
    const targetQRank = qrankMatch ? `Q${qrankMatch[1]}` : null;

    const nameWords = queryWords.filter(w => w.length >= 4);

    // Detect person query
    const isPersonQuery = nameWords.length > 0 && publicationContext.some(p => {
      const ha = (p.homeAuthors || '').toLowerCase();
      return nameWords.every(token => ha.includes(token));
    });

    // Search publications using pre-processed data
    let matched;
    if (isPersonQuery && nameWords.length > 0) {
      matched = publicationContext.filter(p => {
        const ha = (p.homeAuthors || '').toLowerCase();
        const all = (p.authors || '').toLowerCase();
        return nameWords.every(token => ha.includes(token) || all.includes(token));
      });
    } else {
      matched = publicationContext.filter(p => {
        const searchable = [p.title, p.journal, p.homeAuthors, p.department, p.technologyAreas]
          .map(v => (v || '').toLowerCase()).join(' ');
        return queryWords.filter(w => w.length >= 3).some(w => searchable.includes(w));
      });
    }

    // Apply year filter
    let filtered = matched;
    if (targetYear) {
      const yf = matched.filter(p => String(p.year) === targetYear);
      if (yf.length > 0) filtered = yf;
    }

    // Apply Q-rank filter
    if (targetQRank) {
      const qf = filtered.filter(p => (p.qrankScopus || '').toUpperCase() === targetQRank);
      if (qf.length > 0) filtered = qf;
    }

    if (filtered.length > 0) {
      extra += `\n=== QUERY MATCH SUMMARY ===\n`;
      extra += `Total matched: ${filtered.length} publications\n`;

      // Year breakdown
      const yrCounts = {};
      filtered.forEach(p => { yrCounts[p.year || '?'] = (yrCounts[p.year || '?'] || 0) + 1; });
      extra += `By year: ${Object.entries(yrCounts).sort((a, b) => b[0] - a[0]).map(([y, c]) => `${y}:${c}`).join(', ')}\n`;

      // Q-rank breakdown
      const qrCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
      filtered.forEach(p => {
        const qr = (p.qrankScopus || '').toUpperCase();
        if (qrCounts[qr] !== undefined) qrCounts[qr]++; else qrCounts.Unranked++;
      });
      extra += `By Q-rank: Q1:${qrCounts.Q1}, Q2:${qrCounts.Q2}, Q3:${qrCounts.Q3}, Q4:${qrCounts.Q4}, Unranked:${qrCounts.Unranked}\n`;

      // Department breakdown
      const deptSummary = {};
      filtered.forEach(p => {
        const d = p.department || 'Unknown';
        deptSummary[d] = (deptSummary[d] || 0) + 1;
      });
      extra += `\n=== DEPARTMENT BREAKDOWN ===\n`;
      Object.entries(deptSummary).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => {
        extra += `${d}: ${c}\n`;
      });

      const baseTokens = estimateTokens(baseContext);
      const remainingBudget = MAX_CONTEXT_TOKENS - baseTokens - estimateTokens(extra);
      extra += formatPubList(filtered, remainingBudget);
    } else if (targetYear) {
      // Year-only query
      const yearPubs = publicationContext.filter(p => String(p.year) === targetYear);
      if (yearPubs.length > 0) {
        extra += `\n=== PUBLICATIONS IN ${targetYear}: ${yearPubs.length} total ===\n`;
        const qCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
        const deptCounts = {};
        yearPubs.forEach(p => {
          const qr = (p.qrankScopus || '').toUpperCase();
          if (qCounts[qr] !== undefined) qCounts[qr]++; else qCounts.Unranked++;
          deptCounts[p.department || 'Unknown'] = (deptCounts[p.department || 'Unknown'] || 0) + 1;
        });
        extra += `Q-rank: Q1:${qCounts.Q1}, Q2:${qCounts.Q2}, Q3:${qCounts.Q3}, Q4:${qCounts.Q4}, Unranked:${qCounts.Unranked}\n`;
        extra += `\nBy Department:\n`;
        Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => {
          extra += `  ${d}: ${c}\n`;
        });

        let finalPubs = yearPubs;
        if (targetQRank) {
          const qf = yearPubs.filter(p => (p.qrankScopus || '').toUpperCase() === targetQRank);
          if (qf.length > 0) finalPubs = qf;
        }

        const baseTokens = estimateTokens(baseContext);
        const remainingBudget = MAX_CONTEXT_TOKENS - baseTokens - estimateTokens(extra);
        extra += formatPubList(finalPubs, remainingBudget);
      }
    } else {
      extra += '\n(No specific publication matches for this query — using aggregate data.)';
    }

    return extra;
  };

  const callGroq = async (promptText) => {
    const queryContext = buildQueryContext(promptText);

    const systemInstruction = `You are the Publication Intelligence Assistant for KLE Technological University's Research Analytics Dashboard.

Here is live data from 6,500+ publications:

${baseContext}
${queryContext}

RULES:
1. Answer clearly and concisely using ONLY the data above. Do not invent names or numbers.
2. Use bullet points, tables, or short paragraphs as appropriate.
3. When listing publications, list EVERY title from the PUBLICATIONS section with title, journal, year, and Q-rank. Do NOT skip any. The data provided is the complete matched result from the university database, not sample data.
4. For department questions, reference the TOP 15 DEPARTMENTS data and any matched publications.
5. For year-specific questions, use YEAR-WISE PUBLICATIONS and matched data.
6. For journal questions, use TOP 15 JOURNALS and matched publications.
7. For Q-rank analysis, reference Q-RANK DISTRIBUTION and department-wise Q1 percentages.
8. For counts, use the exact numbers from QUERY MATCH SUMMARY (total, year-wise, Q-rank). Do NOT count listed records manually — use the pre-computed numbers.
9. If data is not available or insufficient, say so — do not speculate.
10. When asked about trends, compare year-over-year numbers from the YEAR-WISE data.
11. All data provided is real, verified data from the university database. Do NOT say "sample" or "partial".`;

    // Include last 4 conversation turns for follow-up context
    const recentHistory = messages.slice(-4).map(m => ({
      role: m.isBot ? 'assistant' : 'user',
      content: m.text,
    }));

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemInstruction },
            ...recentHistory,
            { role: 'user', content: promptText },
          ],
          temperature: 0.1,
          max_tokens: 2048,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Groq API Error');
      return data.choices[0].message.content;
    } catch (err) {
      console.error(err);
      return 'Sorry, I ran into an error connecting to Groq: ' + err.message;
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (!apiKey) { setShowSettings(true); return; }

    const userMsg = { id: Date.now(), text: input, isBot: false };
    const currentInput = input;
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const reply = await callGroq(currentInput);
    setIsTyping(false);
    setMessages(prev => [...prev, { id: Date.now() + 1, text: reply, isBot: true }]);
  };

  const suggestedPrompts = [
    'Which department has the most Q1 publications?',
    'Publication growth trend over the last 5 years?',
    'Top journals by paper count?',
  ];

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-8 right-8 w-14 h-14 bg-kle-crimson text-white rounded-full shadow-lg flex items-center justify-center cursor-pointer z-50 hover:bg-kle-dark transition-colors"
          >
            <MessageSquare size={24} />
            <span className="absolute top-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-8 right-8 w-full max-w-[420px] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-mist overflow-hidden"
          >
            {/* Header */}
            <div className="bg-kle-crimson p-md flex items-center justify-between text-white shadow-md z-10">
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-inner">
                  <Bot size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-base text-white">Publication AI</h3>
                  <p className="text-micro text-white flex items-center gap-1.5 opacity-90">
                    {apiKey ? (
                      <><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> {fmt(publications.length)} publications loaded</>
                    ) : (
                      <><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Needs API Key</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-xs">
                <button onClick={() => setShowSettings(!showSettings)} className="text-white/80 hover:text-white transition-colors p-xs hover:bg-white/10 rounded-lg" title="Settings">
                  <Settings size={18} />
                </button>
                <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white transition-colors p-xs hover:bg-white/10 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Settings panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute inset-x-0 top-[72px] bg-white border-b border-mist p-md shadow-lg z-20">
                  <h4 className="font-heading font-medium text-kle-dark flex items-center gap-2 mb-sm text-sm">
                    <Key size={16} /> Groq API Key
                  </h4>
                  <p className="text-xs text-smoke mb-md">Enter your Groq API key (gsk_...). Stored in browser localStorage only.</p>
                  <form onSubmit={saveApiKey} className="flex gap-2">
                    <input type="password" placeholder="gsk_..." value={tempKey} onChange={(e) => setTempKey(e.target.value)} className="flex-1 border border-mist rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-kle-crimson" />
                    <button type="submit" className="bg-kle-crimson text-white px-3 py-1.5 rounded-md text-sm hover:bg-kle-dark transition-colors">Save</button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-md space-y-lg bg-fog relative">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-sm max-w-[85%] ${msg.isBot ? '' : 'ml-auto flex-row-reverse'}`}>
                  <div className={`w-8 h-8 mt-1 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm ${msg.isBot ? 'bg-white border border-mist text-kle-crimson' : 'bg-kle-crimson/10 text-kle-crimson'}`}>
                    {msg.isBot ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div className={`p-md rounded-2xl text-sm leading-relaxed ${msg.isBot ? 'bg-white border border-mist text-graphite rounded-tl-sm shadow-sm' : 'bg-gradient-to-br from-kle-crimson to-kle-dark text-white rounded-tr-sm shadow-md'}`}>
                    {msg.isBot ? (
                      <div className="prose prose-sm prose-slate max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    ) : msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-sm max-w-[85%]">
                  <div className="w-8 h-8 mt-1 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm bg-white border border-mist text-kle-crimson"><Bot size={16} /></div>
                  <div className="p-sm rounded-2xl bg-white border border-mist rounded-tl-sm shadow-sm flex items-center gap-1 text-graphite h-10">
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-smoke rounded-full" />
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-smoke rounded-full" />
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-smoke rounded-full" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested prompts */}
            <AnimatePresence>
              {messages.length < 3 && !isTyping && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-md pb-sm bg-fog flex flex-wrap gap-xs pt-2 border-t border-mist/50">
                  {suggestedPrompts.map((prompt, idx) => (
                    <button key={idx} onClick={() => setInput(prompt)} className="text-micro bg-white border border-mist px-sm py-1.5 rounded-full text-graphite hover:border-kle-crimson hover:text-kle-crimson transition-colors flex items-center shadow-sm">
                      <Sparkles size={12} className="mr-1 text-accent-indigo" />
                      {prompt}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <form onSubmit={handleSend} className="p-md bg-white flex gap-sm items-center shadow-[0_-4px_20px_-15px_rgba(0,0,0,0.1)] z-10 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={apiKey ? 'Ask about publications, departments, journals…' : 'Please configure API Key above…'}
                disabled={!apiKey}
                className="flex-1 bg-fog border border-mist rounded-xl px-md py-3 text-sm focus:outline-none focus:border-kle-crimson focus:ring-2 focus:ring-kle-crimson/20 transition-all font-body text-kle-dark placeholder:text-smoke disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping || !apiKey}
                className="w-12 h-12 flex-shrink-0 bg-kle-crimson text-white rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-kle-dark transition-colors shadow-md active:scale-95"
              >
                {isTyping ? <Loader2 size={20} className="animate-spin" /> : <Send size={18} className="ml-1" />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────────────────────────────────────────
 *  Main Component
 * ───────────────────────────────────────────── */

export default function PublicationExplorer() {
  /* ── State ── */
  const [activeTab, setActiveTab]       = useState('sunburst');
  const [loading, setLoading]           = useState(true);
  const [publications, setPublications] = useState([]);
  const [plotData, setPlotData]         = useState(null);
  const [selectedDept, setSelectedDept] = useState(null); // for detail panel
  const [selectedYear, setSelectedYear] = useState(null); // for year drill-down

  /* ── Load publications from Excel on mount ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await loadExcelData();
        if (cancelled) return;
        setPublications(raw.publications);
        setPlotData(buildPlotlyData(raw.publications));
      } catch (err) {
        console.error('Failed to load publications:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Year drill-down: when a year bar is clicked, compute dept breakdown ── */
  const yearDeptBreakdown = useMemo(() => {
    if (!selectedYear || !publications.length) return null;
    const byDept = {};
    publications.forEach((p) => {
      if (String(p['YEAR']) !== String(selectedYear)) return;
      const dept = (p['HOME AUTHOR DEPARTMENT'] || 'Unknown').trim();
      const qr = (p['Q RANK(SCS)'] || '').trim();
      const qKey = ['Q1', 'Q2', 'Q3', 'Q4'].includes(qr) ? qr : 'Unranked';
      if (!byDept[dept]) byDept[dept] = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0, total: 0 };
      byDept[dept][qKey]++;
      byDept[dept].total++;
    });
    return Object.entries(byDept)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15); // top 15 departments for readability
  }, [selectedYear, publications]);

  /* ── Shared Plotly layout defaults ── */
  const baseLayout = {
    autosize: true,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: 'Inter, DM Sans, sans-serif', color: '#44403C' },
    margin: { t: 30, b: 40, l: 50, r: 20 },
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-md">
        <Loader2 className="animate-spin text-kle-crimson" size={28} />
        <span className="text-smoke text-sm">Loading 6,500+ publications…</span>
      </div>
    );
  }

  if (!plotData) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-smoke">No publication data available.</p>
      </div>
    );
  }

  const { sunburst, treemap, yearStack, deptStats, campusStats } = plotData;

  /* ─────────────────────────────────────────────
   *  Render
   * ───────────────────────────────────────────── */
  return (
    <div className="space-y-lg">
      {/* ── Page header ── */}
      <div>
        <h1 className="font-display text-display text-kle-dark">Publication Explorer</h1>
        <p className="text-body text-smoke mt-xs">
          Interactive drill-down into {fmt(publications.length)} publications across{' '}
          {Object.keys(deptStats).length} departments
        </p>
      </div>

      {/* ── KPI strip ── */}
      <div className="bg-kle-dark rounded-lg px-xl py-md">
        <div className="flex items-center justify-between overflow-x-auto gap-lg">
          {[
            { label: 'Total Pubs', value: fmt(publications.length), color: 'text-white' },
            { label: 'BVB Campus', value: fmt(campusStats.BVB), color: 'text-kle-crimson-light' },
            { label: 'Belagavi', value: fmt(campusStats.Belagavi), color: 'text-accent-indigo-light' },
            { label: 'Bengaluru', value: fmt(campusStats.Bengaluru), color: 'text-accent-teal-light' },
            { label: 'Q1 Pubs', value: fmt(sunburst.values.filter((_, i) => sunburst.labels[i] === 'Q1').reduce((a, b) => a + b, 0)), color: 'text-accent-teal-light' },
            { label: 'Departments', value: Object.keys(deptStats).length, color: 'text-white' },
          ].map((item, idx, arr) => (
            <div
              key={item.label}
              className={`flex-shrink-0 text-center ${idx < arr.length - 1 ? 'border-r border-charcoal pr-lg' : ''}`}
            >
              <p className="text-micro uppercase tracking-wider text-smoke mb-xs">{item.label}</p>
              <p className={`font-mono text-lg font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-xs bg-fog rounded-lg p-xs">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setSelectedDept(null); setSelectedYear(null); }}
            className={`flex items-center gap-sm px-lg py-sm rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-white text-kle-dark shadow-sm'
                : 'text-smoke hover:text-kle-dark hover:bg-white/50'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content + optional detail panel ── */}
      <div className={`grid ${selectedDept ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'} gap-lg`}>
        {/* Main chart area */}
        <div className={selectedDept ? 'lg:col-span-2' : ''}>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} variants={tabVariants} initial="initial" animate="animate" exit="exit">

              {/* ═══════ TAB 0: SUNBURST ═══════
               * 4-level hierarchy: Total → Campus → Department → Q-Rank
               * Click any sector to zoom in; click center to zoom back out.
               * branchvalues: 'total' means parent value = sum of children.
               * maxdepth: 3 shows 3 rings at a time (Campus → Dept → Q-Rank).
               */}
              {activeTab === 'sunburst' && (
                <div className="panel">
                  <h3 className="font-heading font-medium text-h2 text-kle-dark mb-sm">
                    Publication Hierarchy
                  </h3>
                  <p className="text-label text-smoke mb-md">
                    Click any sector to zoom in · Click center to zoom out
                  </p>
                  <div className="h-[520px]">
                    <Plot
                      data={[{
                        type: 'sunburst',
                        ids: sunburst.ids,
                        labels: sunburst.labels,
                        parents: sunburst.parents,
                        values: sunburst.values,
                        branchvalues: 'total',
                        maxdepth: 3,
                        hovertemplate: '<b>%{label}</b><br>%{value} publications<br>%{percentRoot:.1%} of total<extra></extra>',
                        textinfo: 'label+percent entry',
                        textfont: { size: 11, family: 'Inter' },
                        insidetextorientation: 'radial',
                        marker: {
                          colors: sunburst.ids.map((id) => {
                            if (id.startsWith('C-')) return COLORS[id.slice(2)] || '#78716C';
                            // Q-rank leaf nodes: "D||DeptName||Q1" etc.
                            if (id.endsWith('||Q1')) return COLORS.Q1;
                            if (id.endsWith('||Q2')) return COLORS.Q2;
                            if (id.endsWith('||Q3')) return COLORS.Q3;
                            if (id.endsWith('||Q4')) return COLORS.Q4;
                            if (id.endsWith('||Unranked')) return COLORS.Unranked;
                            // Department nodes
                            return '#A8A29E'; // stone-400
                          }),
                        },
                      }]}
                      layout={{
                        ...baseLayout,
                        margin: { t: 10, b: 10, l: 10, r: 10 },
                      }}
                      useResizeHandler
                      style={{ width: '100%', height: '100%' }}
                      config={{ displayModeBar: false, responsive: true }}
                      onClick={(e) => {
                        if (!e.points?.[0]) return;
                        const clickedId = e.points[0].id || '';
                        // IDs for department nodes are "D||DeptName"
                        if (clickedId.startsWith('D||') && !clickedId.slice(3).includes('||')) {
                          const deptName = clickedId.slice(3); // strip the "D||" prefix
                          if (deptStats[deptName]) setSelectedDept(deptName);
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ═══════ TAB 1: TREEMAP ═══════
               * Each rectangle = one department.
               * Area proportional to publication count.
               * Color indicates Q1 share: teal (high) → crimson (low).
               * Click a department to open the detail panel.
               */}
              {activeTab === 'treemap' && (
                <div className="panel">
                  <h3 className="font-heading font-medium text-h2 text-kle-dark mb-sm">
                    Department Research Landscape
                  </h3>
                  <p className="text-label text-smoke mb-md">
                    Area = publication count · Color = Q1 quality (teal = high, crimson = low) · Click to explore
                  </p>
                  <div className="h-[520px]">
                    <Plot
                      data={[{
                        type: 'treemap',
                        ids: treemap.ids,
                        labels: treemap.labels,
                        parents: treemap.parents,
                        values: treemap.values,
                        branchvalues: 'total',
                        marker: { colors: treemap.colors },
                        textinfo: 'label+value',
                        textfont: { family: 'Inter', size: 12 },
                        hovertemplate: '<b>%{label}</b><br>%{value} publications<br>%{percentRoot:.1%} of total<extra></extra>',
                        pathbar: { visible: true },
                      }]}
                      layout={{
                        ...baseLayout,
                        margin: { t: 30, b: 5, l: 5, r: 5 },
                        treemapcolorway: [COLORS.Q1, COLORS.Q2, COLORS.Q3, COLORS.Q4],
                      }}
                      useResizeHandler
                      style={{ width: '100%', height: '100%' }}
                      config={{ displayModeBar: false, responsive: true }}
                      onClick={(e) => {
                        if (!e.points?.[0]) return;
                        const label = e.points[0].label;
                        if (label && label !== 'All Departments' && deptStats[label]) {
                          setSelectedDept(label);
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ═══════ TAB 2: YEAR × Q-RANK STACKED BAR ═══════
               * Each year is a group of stacked bars: Q1/Q2/Q3/Q4/Unranked.
               * Click a year bar to see the department breakdown below.
               */}
              {activeTab === 'trends' && (
                <div className="space-y-lg">
                  <div className="panel">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-sm">
                      Publications by Year & Quartile
                    </h3>
                    <p className="text-label text-smoke mb-md">
                      Click any bar to see department breakdown for that year
                    </p>
                    <div className="h-[400px]">
                      <Plot
                        data={['Q1', 'Q2', 'Q3', 'Q4', 'Unranked'].map((qr) => ({
                          type: 'bar',
                          name: qr,
                          x: yearStack.years,
                          y: yearStack[qr],
                          marker: { color: COLORS[qr] },
                          hovertemplate: `${qr}: %{y} pubs<extra></extra>`,
                        }))}
                        layout={{
                          ...baseLayout,
                          barmode: 'stack',
                          xaxis: {
                            title: { text: 'Year', font: { size: 12 } },
                            tickfont: { size: 11 },
                          },
                          yaxis: {
                            title: { text: 'Publications', font: { size: 12 } },
                            tickfont: { size: 11 },
                            gridcolor: '#E7E5E4',
                          },
                          legend: {
                            orientation: 'h',
                            y: 1.12,
                            x: 0.5,
                            xanchor: 'center',
                            font: { size: 11 },
                          },
                        }}
                        useResizeHandler
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false, responsive: true }}
                        onClick={(e) => {
                          if (!e.points?.[0]) return;
                          setSelectedYear(e.points[0].x);
                        }}
                      />
                    </div>
                  </div>

                  {/* Year drill-down: department breakdown for selected year */}
                  <AnimatePresence>
                    {selectedYear && yearDeptBreakdown && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="panel"
                      >
                        <div className="flex items-center justify-between mb-md">
                          <h3 className="font-heading font-medium text-h2 text-kle-dark flex items-center gap-sm">
                            <TrendingUp size={18} className="text-accent-teal" />
                            {selectedYear} — Top Departments
                          </h3>
                          <button
                            onClick={() => setSelectedYear(null)}
                            className="p-xs rounded hover:bg-fog transition-colors"
                          >
                            <X size={16} className="text-smoke" />
                          </button>
                        </div>

                        {/* Horizontal stacked bars per department for the selected year */}
                        <div className="h-[400px]">
                          <Plot
                            data={['Q1', 'Q2', 'Q3', 'Q4', 'Unranked'].map((qr) => ({
                              type: 'bar',
                              name: qr,
                              y: yearDeptBreakdown.map(([d]) => d.length > 20 ? d.slice(0, 18) + '…' : d),
                              x: yearDeptBreakdown.map(([, s]) => s[qr]),
                              orientation: 'h',
                              marker: { color: COLORS[qr] },
                              hovertemplate: `${qr}: %{x} pubs<extra></extra>`,
                            }))}
                            layout={{
                              ...baseLayout,
                              barmode: 'stack',
                              margin: { t: 10, b: 40, l: 160, r: 20 },
                              xaxis: {
                                title: { text: 'Publications', font: { size: 12 } },
                                tickfont: { size: 11 },
                                gridcolor: '#E7E5E4',
                              },
                              yaxis: {
                                tickfont: { size: 10 },
                                autorange: 'reversed',
                              },
                              legend: {
                                orientation: 'h',
                                y: -0.15,
                                x: 0.5,
                                xanchor: 'center',
                                font: { size: 11 },
                              },
                              showlegend: false,
                            }}
                            useResizeHandler
                            style={{ width: '100%', height: '100%' }}
                            config={{ displayModeBar: false, responsive: true }}
                            onClick={(e) => {
                              if (!e.points?.[0]) return;
                              const deptLabel = e.points[0].y;
                              // Match potentially truncated label back to full name
                              const match = yearDeptBreakdown.find(([d]) =>
                                d === deptLabel || (d.length > 20 && d.slice(0, 18) + '…' === deptLabel)
                              );
                              if (match && deptStats[match[0]]) {
                                setSelectedDept(match[0]);
                              }
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Detail Panel (right side) ── */}
        <AnimatePresence>
          {selectedDept && deptStats[selectedDept] && (
            <DeptDetailPanel
              dept={selectedDept}
              stats={deptStats[selectedDept]}
              onClose={() => setSelectedDept(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── AI Chat (floating) ── */}
      <PublicationAIChat
        publications={publications}
        deptStats={deptStats}
        campusStats={campusStats}
        yearStack={yearStack}
      />
    </div>
  );
}
