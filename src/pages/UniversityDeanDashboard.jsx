import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  Award,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  Download,
  GraduationCap,
  DollarSign,
  Layers,
  FlaskConical,
  Loader2,
} from 'lucide-react';

import DonutChart from '../components/DonutChart';
import MultiLineChart from '../components/MultiLineChart';
import HorizontalBarChart from '../components/HorizontalBarChart';
import DataTable from '../components/DataTable';
import AIInsightsPanel from '../components/AIInsightsPanel';
import AIChatbot from '../components/AIChatbot';
import PublicationListView from '../components/PublicationListView';
import PublicationDetailView from '../components/PublicationDetailView';

import { loadExcelData, aggregateUniversityData } from '../data/excelDataLoader';

/* ─────────────────────────────────────────── */
/*  KPICard (Simplified card without targets)  */
/* ─────────────────────────────────────────── */
function KPICard({ title, value, unit = '', subtitle, trend, icon: Icon }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2, boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}
      className="panel cursor-default transition-all"
    >
      <div className="flex items-start justify-between mb-sm">
        <div>
          <div className="flex items-center gap-xs mb-xs">
            {Icon && <Icon size={14} className="text-kle-crimson" />}
            <h4 className="font-heading font-semibold text-sm text-kle-dark">
              {title}
            </h4>
          </div>
          {subtitle && (
            <p className="text-micro text-smoke">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="mb-sm">
        <p className="font-mono text-h2 font-bold text-kle-dark">
          {value.toLocaleString('en-IN')}
          {unit && <span className="text-label text-smoke ml-xs">{unit}</span>}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div />
        {trend && (
          <div className="flex items-center gap-xs">
            {trend.startsWith('+') || trend.includes('+') ? (
              <TrendingUp size={14} className="text-success" />
            ) : (
              <TrendingDown size={14} className="text-kle-crimson" />
            )}
            <span className={`text-micro font-mono ${trend.startsWith('+') || trend.includes('+') ? 'text-success' : 'text-kle-crimson'}`}>
              {trend}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────── */
/*  Tab definitions                            */
/* ─────────────────────────────────────────── */
const TABS = [
  { key: 'overview', label: 'Overview', icon: Globe },
  { key: 'trends', label: 'Trends & Analytics', icon: TrendingUp },
  { key: 'research', label: 'Research Landscape', icon: FlaskConical },
  { key: 'funding', label: 'Funding & PhD', icon: DollarSign },
  { key: 'benchmarks', label: 'Benchmarks & NIRF', icon: Award },
];

/* ─────────────────────────────────────────── */
/*  Dark KPI Strip                             */
/* ─────────────────────────────────────────── */
function DarkKPIStrip({ kpis }) {
  const items = [
    { label: 'Total Pubs', value: kpis.totalPubs.value, color: 'text-white', delta: `+${kpis.totalPubs.delta}%` },
    { label: 'Univ H-Index', value: kpis.univHIndex.value, color: 'text-accent-gold-light', delta: `+${kpis.univHIndex.delta}%` },
    { label: 'Total Citations', value: kpis.totalCitations.value.toLocaleString('en-IN'), color: 'text-accent-teal-light', delta: `+${kpis.totalCitations.delta}%` },
    { label: 'Q1 Pubs %', value: `${kpis.q1Percent.value}%`, color: 'text-accent-teal-light', delta: `+${kpis.q1Percent.delta}%` },
    { label: 'Campus Split', value: `${kpis.campusSplit.bvb}/${kpis.campusSplit.belagavi}/${kpis.campusSplit.bengaluru}`, color: 'text-accent-indigo-light' },
    { label: 'YoY Growth', value: `+${kpis.yoyGrowth.value}%`, color: 'text-success' },
    { label: 'SRG Density', value: `${kpis.srgDensity.value}%`, color: 'text-white' },
    { label: '5Y CAGR', value: `+${kpis.cagr5y.value}%`, color: 'text-accent-gold-light' },
  ];

  return (
    <div className="bg-kle-dark px-xl py-md">
      <div className="flex items-center justify-between overflow-x-auto gap-md">
        {items.map((item, idx) => (
          <div
            key={item.label}
            className={`flex-shrink-0 text-center ${idx < items.length - 1 ? 'border-r border-charcoal pr-md' : ''}`}
          >
            <p className="text-micro uppercase tracking-wider text-smoke mb-xs">{item.label}</p>
            <p className={`font-mono text-lg font-bold ${item.color}`}>{item.value}</p>
            {item.delta && <p className="text-micro text-success">{item.delta}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── */
/*  Campus × Faculty Board Heatmap (FIXED)     */
/* ─────────────────────────────────────────── */
function CampusFacultyHeatmap({ data }) {
  const campuses = ['BVB Hubli', 'Belagavi', 'Bengaluru'];

  const maxValue = useMemo(
    () => Math.max(...data.flatMap(row => campuses.map(c => row[c]))),
    [data]
  );

  const getColorIntensity = (value) => {
    const intensity = value / maxValue;
    return `rgba(15, 118, 110, ${0.2 + intensity * 0.8})`;
  };

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Campus × Faculty Board Matrix</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left py-sm px-md text-label text-smoke font-normal">Faculty Board</th>
              {campuses.map(campus => (
                <th key={campus} className="text-center py-sm px-md text-label text-smoke font-normal">{campus}</th>
              ))}
              <th className="text-center py-sm px-md text-label text-smoke font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const total = campuses.reduce((sum, c) => sum + row[c], 0);
              return (
                <tr key={row.facultyBoard} className="border-t border-mist">
                  <td className="py-sm px-md text-body text-kle-dark">{row.facultyBoard}</td>
                  {campuses.map(campus => (
                    <td key={campus} className="py-sm px-md text-center">
                      <div
                        className="inline-flex items-center justify-center w-12 h-8 rounded-sm text-white font-mono text-sm"
                        style={{ backgroundColor: getColorIntensity(row[campus]) }}
                      >
                        {row[campus]}
                      </div>
                    </td>
                  ))}
                  <td className="py-sm px-md text-center font-mono font-medium text-kle-dark">{total}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-kle-dark">
              <td className="py-sm px-md text-body font-medium text-kle-dark">Total</td>
              {campuses.map(campus => {
                const total = data.reduce((sum, row) => sum + row[campus], 0);
                return (
                  <td key={campus} className="py-sm px-md text-center font-mono font-bold text-kle-dark">{total}</td>
                );
              })}
              <td className="py-sm px-md text-center font-mono font-bold text-kle-crimson">
                {data.reduce((sum, row) => sum + campuses.reduce((s, c) => s + row[c], 0), 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── */
/*  Research Landscape Scatter (FIXED)         */
/* ─────────────────────────────────────────── */
function ResearchLandscape({ departments }) {
  const campusColors = { BVB: '#B91C1C', Belagavi: '#3730A3', Bengaluru: '#0F766E' };

  const maxPubs = useMemo(() => Math.max(...departments.map(d => d.pubs)), [departments]);
  const maxCitations = useMemo(() => Math.max(...departments.map(d => d.citations)), [departments]);
  const maxFaculty = useMemo(() => Math.max(...departments.map(d => d.faculty)), [departments]);

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-sm">University Research Landscape</h3>
      <p className="text-label text-smoke mb-md">X: Total Publications · Y: Total Citations · Size: Faculty Count</p>

      <div className="relative h-56 border-l border-b border-mist ml-8 mb-6">
        <span className="absolute -left-8 top-1/2 -rotate-90 text-label text-smoke whitespace-nowrap origin-center">Citations</span>
        <span className="absolute bottom-[-28px] left-1/2 -translate-x-1/2 text-label text-smoke">Publications</span>

        <div className="absolute left-0 right-0 border-t border-dashed border-ash" style={{ top: '50%' }} />
        <div className="absolute top-0 bottom-0 border-l border-dashed border-ash" style={{ left: '50%' }} />

        {departments.map((dept) => {
          const x = (dept.pubs / maxPubs) * 90 + 5;
          const y = (dept.citations / maxCitations) * 90 + 5;
          const size = 15 + (dept.faculty / maxFaculty) * 35;

          return (
            <div
              key={`${dept.name}-${dept.campus}`}
              className="absolute rounded-full flex items-center justify-center text-white text-micro font-bold cursor-pointer hover:scale-110 transition-transform shadow-md"
              style={{
                left: `${x}%`, bottom: `${y}%`,
                width: size, height: size,
                backgroundColor: campusColors[dept.campus],
                transform: 'translate(-50%, 50%)',
              }}
              title={`${dept.name} (${dept.campus}): ${dept.pubs} pubs, ${dept.citations} citations, ${dept.faculty} faculty, H-Index ${dept.hIndex}`}
            >
              {dept.name.substring(0, 2)}
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-lg">
        {Object.entries(campusColors).map(([campus, color]) => (
          <div key={campus} className="flex items-center gap-xs">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-label text-graphite">{campus}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── */
/*  NIRF Trajectory Chart                      */
/* ─────────────────────────────────────────── */
function NIRFTrajectory({ data }) {
  const minRank = Math.min(...data.map(d => d.rank));
  const maxRank = Math.max(...data.map(d => d.rank));

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-md">
        <div>
          <h3 className="font-heading font-medium text-h2 text-kle-dark">NIRF Ranking Trajectory</h3>
          <p className="text-label text-smoke">6-Year Rank Improvement</p>
        </div>
        <div className="flex items-center gap-sm px-md py-sm bg-success/10 rounded-md">
          <TrendingDown size={16} className="text-success" />
          <span className="font-mono text-sm font-bold text-success">
            {data[0].rank} → {data[data.length - 1].rank}
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-md h-40 px-4">
        {data.map((entry, idx) => {
          const barHeight = ((maxRank - entry.rank) / (maxRank - minRank + 20)) * 100 + 15;
          const bandColor = entry.band === 'A' ? 'bg-accent-teal' : 'bg-accent-gold';

          return (
            <div key={entry.year} className="flex-1 flex flex-col items-center gap-sm">
              <span className="font-mono text-sm font-bold text-kle-dark">#{entry.rank}</span>
              <div
                className={`w-full ${bandColor} rounded-t-md transition-all relative group cursor-pointer`}
                style={{ height: `${barHeight}%` }}
                title={`Rank: ${entry.rank}, Score: ${entry.score}, Band: ${entry.band}`}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-kle-dark text-white text-micro px-sm py-xs rounded whitespace-nowrap z-10">
                  Score: {entry.score} · Band {entry.band}
                </div>
              </div>
              <span className="text-label text-smoke">{entry.year}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-lg mt-md">
        <div className="flex items-center gap-xs">
          <div className="w-3 h-3 bg-accent-teal rounded-sm" />
          <span className="text-label text-graphite">Band A (Score ≥50)</span>
        </div>
        <div className="flex items-center gap-xs">
          <div className="w-3 h-3 bg-accent-gold rounded-sm" />
          <span className="text-label text-graphite">Band B (Score &lt;50)</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── */
/*  Funding Portfolio                          */
/* ─────────────────────────────────────────── */
function FundingPortfolio({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const totalProjects = data.reduce((sum, d) => sum + d.projects, 0);
  const colors = ['#B91C1C', '#3730A3', '#0F766E', '#B45309', '#6D28D9', '#15803D'];

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-sm">Funding Portfolio</h3>
      <p className="text-label text-smoke mb-md">Agency-wise distribution · ₹{total.toFixed(1)} Cr total · {totalProjects} projects</p>

      <div className="flex items-center gap-lg">
        {/* Mini donut */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
            {data.map((item, idx) => {
              const prevTotal = data.slice(0, idx).reduce((s, d) => s + d.value, 0);
              const offset = (prevTotal / total) * 100;
              const length = (item.value / total) * 100;
              return (
                <circle key={item.name} cx="16" cy="16" r="12" fill="none"
                  stroke={colors[idx]} strokeWidth="6"
                  strokeDasharray={`${length} ${100 - length}`}
                  strokeDashoffset={-offset}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-lg font-bold text-kle-dark">₹{total.toFixed(1)}</span>
            <span className="text-micro text-smoke">Crore</span>
          </div>
        </div>

        {/* Legend + bars */}
        <div className="flex-1 space-y-sm">
          {data.map((item, idx) => (
            <div key={item.name} className="flex items-center gap-sm">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors[idx] }} />
              <span className="text-label text-graphite w-24">{item.name}</span>
              <div className="flex-1 h-2 bg-mist rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(item.value / total) * 100}%`, backgroundColor: colors[idx] }} />
              </div>
              <span className="font-mono text-sm text-kle-dark w-14 text-right">₹{item.value}Cr</span>
              <span className="text-micro text-smoke w-12 text-right">{item.projects} proj</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── */
/*  PhD Pipeline Funnel                        */
/* ─────────────────────────────────────────── */
function PhDPipelineFunnel({ pipeline }) {
  const maxCount = Math.max(...pipeline.stages.map(s => s.count));

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-md">
        <div>
          <h3 className="font-heading font-medium text-h2 text-kle-dark">PhD Scholar Pipeline</h3>
          <p className="text-label text-smoke">{pipeline.total} active scholars · Avg {pipeline.avgDuration} yrs</p>
        </div>
        <div className="flex gap-sm">
          <div className="px-md py-xs bg-success/10 rounded-md text-label text-success font-medium">{pipeline.onTrack} On Track</div>
          <div className="px-md py-xs bg-amber-500/10 rounded-md text-label text-amber-700 font-medium">{pipeline.delayed} Delayed</div>
          <div className="px-md py-xs bg-kle-crimson/10 rounded-md text-label text-kle-crimson font-medium">{pipeline.critical} Critical</div>
        </div>
      </div>

      <div className="space-y-sm">
        {pipeline.stages.map((stage) => (
          <div key={stage.stage} className="flex items-center gap-md">
            <span className="text-label text-graphite w-40 truncate">{stage.stage}</span>
            <div className="flex-1 h-6 bg-mist rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm flex items-center pl-sm"
                style={{ width: `${(stage.count / maxCount) * 100}%`, backgroundColor: stage.color }}
              >
                <span className="text-white text-micro font-bold">{stage.count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-md pt-md border-t border-mist flex items-center gap-xl">
        <div className="flex items-center gap-sm">
          <GraduationCap size={16} className="text-success" />
          <span className="text-label text-graphite">Completed this year:</span>
          <span className="font-mono font-bold text-success">{pipeline.completedThisYear}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── */
/*  Peer Comparison Table                      */
/* ─────────────────────────────────────────── */
function PeerComparisonTable({ data }) {
  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Peer Institution Comparison</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-mist">
              <th className="text-left py-sm px-md text-label text-smoke font-normal">Institution</th>
              <th className="text-center py-sm px-md text-label text-smoke font-normal">Publications</th>
              <th className="text-center py-sm px-md text-label text-smoke font-normal">Citations</th>
              <th className="text-center py-sm px-md text-label text-smoke font-normal">H-Index</th>
              <th className="text-center py-sm px-md text-label text-smoke font-normal">Q1 %</th>
              <th className="text-center py-sm px-md text-label text-smoke font-normal">Patents</th>
            </tr>
          </thead>
          <tbody>
            {data.map((inst) => {
              const isKLE = inst.name === 'KLE Tech';
              return (
                <tr key={inst.name} className={`border-t border-mist ${isKLE ? 'bg-kle-crimson/5' : ''}`}>
                  <td className="py-sm px-md">
                    <span className={`text-body ${isKLE ? 'font-bold text-kle-crimson' : 'text-kle-dark'}`}>
                      {inst.name} {isKLE && '★'}
                    </span>
                  </td>
                  <td className="text-center py-sm px-md font-mono text-kle-dark">{inst.publications.toLocaleString('en-IN')}</td>
                  <td className="text-center py-sm px-md font-mono text-kle-dark">{inst.citations.toLocaleString('en-IN')}</td>
                  <td className="text-center py-sm px-md font-mono text-kle-dark">{inst.hIndex}</td>
                  <td className="text-center py-sm px-md font-mono text-kle-dark">{inst.q1Percent}%</td>
                  <td className="text-center py-sm px-md font-mono text-kle-dark">{inst.patents}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ */
/*          MAIN DASHBOARD EXPORT              */
/* ═══════════════════════════════════════════ */
export default function UniversityDeanDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState('trend');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [excelData, setExcelData] = useState(null);

  /* ── Drill-down state ── */
  const [drillDownView, setDrillDownView] = useState(null); // null | 'list' | 'detail'
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedPublication, setSelectedPublication] = useState(null);

  /* ── Chart-to-chatbot focus state ── */
  const [chartFocus, setChartFocus] = useState(null); // { id, title, prompt }

  /* ── Load Excel data on mount ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadExcelData(); // ensure data is loaded
        if (!cancelled) {
          const aggregated = aggregateUniversityData();
          setExcelData(aggregated);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to load Excel data:', err);
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-md">
        <Loader2 className="w-10 h-10 text-kle-crimson animate-spin" />
        <p className="text-label text-smoke">Loading research data from Excel…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-md">
        <p className="text-kle-crimson font-medium">Failed to load data</p>
        <p className="text-label text-smoke">{error}</p>
      </div>
    );
  }

  /* ── Destructure aggregated data ── */
  const {
    universityKPIs,
    universityQRankDistribution,
    topUniversityFaculty,
    campusData,
    campusFacultyHeatmapData,
    universityResearchLandscape,
    universityHIndexTrend,
    campusTrend,
    universityArticleTypes,
    nirfTrajectory,
    universityFundingPortfolio,
    universityPhDPipeline,
    peerComparison,
    rawPublications,
    publicationsByYearSummary,
    availableYears,
  } = excelData;

  /* ── Set default year once data loads ── */
  if (availableYears && availableYears.length > 0 && selectedYear === null) {
    setSelectedYear(availableYears[availableYears.length - 1]);
  }

  /* AI insights for strategic level */
  const strategicInsights = [
    { type: 'success', title: 'NIRF Rank Breakthrough', message: 'University has broken into top-100 NIRF ranking (98th) for the first time. Maintain momentum in research output and citations.', priority: 'high' },
    { type: 'warning', title: 'Bengaluru Campus Gap', message: 'Bengaluru campus shows lower publication output than other campuses. Recommend faculty mentorship program and seed grants to boost output.', priority: 'high' },
    { type: 'trend', title: '5-Year CAGR Strong', message: 'University publications CAGR of 14.2% exceeds national average of 9.5%. BVB campus leads with 15.8% CAGR.', priority: 'medium' },
    { type: 'info', title: 'Q1 Publishing Distribution', message: 'Q1 percentage is at 42% of total publications. Focus interdisciplinary collaborations in high-impact journals.', priority: 'medium' },
    { type: 'warning', title: 'PhD Completion Rate', message: '15 scholars in critical status beyond expected timeline. Initiate review committee meetings.', priority: 'high' },
    { type: 'success', title: 'Funding Growth', message: 'External funding increased to ₹15.4 Cr (+22% YoY). Industry partnerships now constitute 23% of portfolio.', priority: 'medium' },
  ];

  /* ── Chart click → chatbot helper ── */
  const focusChart = (id, title, contextSummary, prompt) => {
    setChartFocus({ id, title, contextSummary, prompt, ts: Date.now() });
  };

  /* Animation variants */
  const tabVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: -12, transition: { duration: 0.15 } },
  };

  return (
    <div className="space-y-lg -mt-xl -mx-xl">
      {/* Dark KPI Strip */}
      <DarkKPIStrip kpis={universityKPIs} />

      <div className="px-xl space-y-lg">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-md">
            <div className="w-12 h-12 bg-kle-crimson rounded-lg flex items-center justify-center shadow-card">
              <span className="text-white font-display font-bold text-lg">KLE</span>
            </div>
            <div>
              <h1 className="font-display text-h1 text-kle-dark">R&D Research Intelligence</h1>
              <p className="text-label text-smoke">KLE Technological University · FY 2025-26</p>
            </div>
          </div>

          <button className="btn btn-primary flex items-center gap-sm text-sm">
            <Download size={14} />
            Export Report
          </button>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex items-center gap-sm border-b border-mist pb-0 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-sm px-lg py-md text-label whitespace-nowrap transition-colors border-b-2 -mb-px ${activeTab === key
                ? 'border-kle-crimson text-kle-crimson font-semibold'
                : 'border-transparent text-smoke hover:text-graphite hover:border-ash'
                }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">
          {/* ══ Drill-Down Views ══ */}
          {drillDownView === 'detail' && selectedPublication && (
            <PublicationDetailView
              publication={selectedPublication}
              onBack={() => {
                setSelectedPublication(null);
                setDrillDownView('list');
              }}
            />
          )}
          {drillDownView === 'list' && rawPublications && (
            <PublicationListView
              publications={rawPublications}
              year={selectedYear}
              availableYears={availableYears || []}
              onBack={() => {
                setDrillDownView(null);
                setSelectedPublication(null);
              }}
              onSelectPublication={(pub) => {
                setSelectedPublication(pub);
                setDrillDownView('detail');
              }}
              onYearChange={(y) => setSelectedYear(y)}
            />
          )}

          {/* ══ Regular Tab Content ══ */}
          {!drillDownView && (
          <motion.div key={activeTab} variants={tabVariants} initial="initial" animate="animate" exit="exit">

            {/* ═══════ OVERVIEW TAB ═══════ */}
            {activeTab === 'overview' && (
              <div className="space-y-lg">
                {/* KPI Overview Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
                  <div
                    onClick={() => {
                      setDrillDownView('list');
                    }}
                    className="cursor-pointer"
                    title="Click to explore publications"
                  >
                    <KPICard title="Publications" value={universityKPIs.totalPubs.value} subtitle="Click to explore →" trend={`+${universityKPIs.yoyGrowth.value}% YoY`} icon={FileText} />
                  </div>
                  <KPICard title="Citations" value={universityKPIs.totalCitations.value} subtitle="Cumulative Scopus" icon={Users} />
                  <KPICard title="H-Index" value={universityKPIs.univHIndex.value} subtitle="University aggregate" icon={TrendingUp} />
                  <KPICard title="Q1 Publications %" value={universityKPIs.q1Percent.value} unit="%" subtitle="Top-quartile share" icon={Layers} />
                </div>

                {/* AI Strategic Briefing */}
                {/* <AIInsightsPanel insights={strategicInsights} role="university-dean" /> */}

                {/* Campus Publications Distribution */}
                <div className="panel">
                  <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Campus Publications Distribution</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
                    {(() => {
                      const totalCampusPubs = campusData.reduce((sum, c) => sum + c.actual, 0);
                      return campusData.map((campus) => {
                        const sharePercentage = totalCampusPubs > 0 ? (campus.actual / totalCampusPubs) * 100 : 0;
                        return (
                          <div key={campus.name} className="flex flex-col gap-xs p-md bg-fog rounded-lg">
                            <div className="flex justify-between items-center mb-xs">
                              <span className="font-heading font-medium text-sm text-kle-dark">{campus.name}</span>
                              <span className="font-mono text-xs text-smoke">Share: {sharePercentage.toFixed(0)}%</span>
                            </div>
                            <div className="flex justify-between items-baseline mb-sm">
                              <span className="text-label text-smoke">Total Publications</span>
                              <span className="font-mono text-lg font-bold text-kle-dark">{campus.actual.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="w-full h-2 bg-mist rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${sharePercentage}%`, backgroundColor: campus.color }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Q-Rank + Top Faculty side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg mb-lg">
                  <div>
                  <DonutChart
                    data={universityQRankDistribution}
                    title="University Q-Rank Distribution"
                    centerValue={universityQRankDistribution.reduce((sum, item) => sum + item.value, 0)}
                    centerLabel="Total Pubs"
                    size="md"
                  />
                  </div>

                  <div>
                  <HorizontalBarChart
                    data={topUniversityFaculty.map(f => ({ ...f, category: f.campus }))}
                    title="Top 10 Faculty (University-Wide)"
                    subtitle="By Scopus citations"
                    valueKey="value"
                    labelKey="name"
                    colorKey="category"
                    height={300}
                    maxItems={10}
                  />
                  </div>
                </div>

                {/* Article Types */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                  <div>
                  <DonutChart
                    data={universityArticleTypes}
                    title="Publications by Article Type"
                    centerValue={universityArticleTypes.reduce((sum, item) => sum + item.value, 0)}
                    centerLabel="Total Pubs"
                    size="md"
                  />
                  </div>
                </div>
              </div>
            )}

            {/* ═══════ TRENDS & ANALYTICS TAB ═══════ */}
            {activeTab === 'trends' && (
              <div className="space-y-lg">
                {/* 5-Year Campus Trends */}
                <div className="panel">
                  <div className="flex items-center justify-between mb-md">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark">5-Year Campus Trends</h3>
                    <div className="flex bg-fog rounded-md p-xs">
                      <button
                        onClick={() => setViewMode('trend')}
                        className={`px-lg py-xs rounded-sm text-label transition-colors ${viewMode === 'trend' ? 'bg-white shadow-sm text-kle-dark' : 'text-smoke'
                          }`}
                      >Trend Lines</button>
                      <button
                        onClick={() => setViewMode('stacked')}
                        className={`px-lg py-xs rounded-sm text-label transition-colors ${viewMode === 'stacked' ? 'bg-white shadow-sm text-kle-dark' : 'text-smoke'
                          }`}
                      >Stacked Column</button>
                    </div>
                  </div>

                  {viewMode === 'trend' ? (
                    <div className="h-72">
                      <MultiLineChart
                        data={campusTrend}
                        xKey="year"
                        series={[
                          { key: 'BVB', name: 'BVB' },
                          { key: 'Belagavi', name: 'Belagavi' },
                          { key: 'Bengaluru', name: 'Bengaluru' },
                        ]}
                        colors={{ BVB: '#B91C1C', Belagavi: '#3730A3', Bengaluru: '#0F766E' }}
                        showCAGR={true}
                        height={280}
                      />
                    </div>
                  ) : (
                    <div className="h-72 flex items-end justify-between gap-lg px-8">
                      {campusTrend.map((year) => {
                        const total = year.BVB + year.Belagavi + year.Bengaluru;
                        return (
                          <div key={year.year} className="flex-1 flex flex-col items-center gap-xs">
                            <div className="w-full flex flex-col-reverse h-48">
                              <div className="w-full bg-kle-crimson" style={{ height: `${(year.BVB / 1100) * 100}%` }} title={`BVB: ${year.BVB}`} />
                              <div className="w-full bg-accent-indigo" style={{ height: `${(year.Belagavi / 1100) * 100}%` }} title={`Belagavi: ${year.Belagavi}`} />
                              <div className="w-full bg-accent-teal rounded-t-sm" style={{ height: `${(year.Bengaluru / 1100) * 100}%` }} title={`Bengaluru: ${year.Bengaluru}`} />
                            </div>
                            <span className="text-label text-smoke">{year.year}</span>
                            <span className="font-mono text-sm text-kle-dark">{total}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Citation Target + H-Index */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                  <div className="panel">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Citation Distribution by Campus</h3>
                    <div className="space-y-lg">
                      {(() => {
                        const campusCitations = campusData.map(c => ({ name: c.name, val: c.actual * 28, color: c.color }));
                        const totalCitations = campusCitations.reduce((sum, c) => sum + c.val, 0);
                        return campusCitations.map((c) => {
                          const sharePercentage = totalCitations > 0 ? (c.val / totalCitations) * 100 : 0;
                          return (
                            <div key={c.name} className="space-y-xs">
                              <div className="flex justify-between text-label">
                                <span className="text-graphite">{c.name}</span>
                                <span className="font-mono text-kle-dark">
                                  {c.val.toLocaleString('en-IN')} <span className="text-smoke">({sharePercentage.toFixed(0)}%)</span>
                                </span>
                              </div>
                              <div className="h-3 bg-mist rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${sharePercentage}%`, backgroundColor: c.color }} />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div className="panel">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Avg H-Index Trend</h3>
                    <MultiLineChart
                      data={universityHIndexTrend}
                      xKey="year"
                      series={[
                        { key: 'BVB', name: 'BVB' },
                        { key: 'Belagavi', name: 'Belagavi' },
                        { key: 'Bengaluru', name: 'Bengaluru' },
                      ]}
                      colors={{ BVB: '#B91C1C', Belagavi: '#3730A3', Bengaluru: '#0F766E' }}
                      height={180}
                    />
                  </div>
                </div>

                {/* Heatmap */}
                <CampusFacultyHeatmap data={campusFacultyHeatmapData} />
              </div>
            )}

            {/* ═══════ RESEARCH LANDSCAPE TAB ═══════ */}
            {activeTab === 'research' && (
              <div className="space-y-lg">
                <div>
                  <ResearchLandscape departments={universityResearchLandscape} />
                </div>

                <DataTable
                  data={[
                    { campus: 'BVB Hubli', facultyBoard: 'Computer Engineering', actual: 118, q1: 42, avgIF: 4.2 },
                    { campus: 'BVB Hubli', facultyBoard: 'Electronics & Comm', actual: 110, q1: 38, avgIF: 3.8 },
                    { campus: 'BVB Hubli', facultyBoard: 'Applied Engineering', actual: 165, q1: 52, avgIF: 3.5 },
                    { campus: 'BVB Hubli', facultyBoard: 'Electrical Engineering', actual: 78, q1: 28, avgIF: 3.1 },
                    { campus: 'BVB Hubli', facultyBoard: 'Science & Technology', actual: 72, q1: 22, avgIF: 2.8 },
                    { campus: 'BVB Hubli', facultyBoard: 'Civil Engineering', actual: 48, q1: 15, avgIF: 2.5 },
                    { campus: 'Belagavi', facultyBoard: 'Computer Engineering', actual: 85, q1: 28, avgIF: 3.6 },
                    { campus: 'Belagavi', facultyBoard: 'Electronics & Comm', actual: 72, q1: 22, avgIF: 3.3 },
                    { campus: 'Belagavi', facultyBoard: 'Mechanical Engineering', actual: 38, q1: 10, avgIF: 2.4 },
                    { campus: 'Bengaluru', facultyBoard: 'Law', actual: 42, q1: 12, avgIF: 2.1 },
                    { campus: 'Bengaluru', facultyBoard: 'Architecture', actual: 28, q1: 8, avgIF: 1.8 },
                  ]}
                  columns={[
                    { key: 'campus', label: 'Campus' },
                    { key: 'facultyBoard', label: 'Faculty Board' },
                    { key: 'actual', label: 'Actual', type: 'number' },
                    { key: 'q1', label: 'Q1 Count', type: 'number' },
                    { key: 'avgIF', label: 'Avg IF', type: 'number' },
                  ]}
                  title="Campus × Faculty Board Breakdown"
                  sortable={true}
                  exportable={true}
                />
              </div>
            )}

            {/* ═══════ FUNDING & PhD TAB ═══════ */}
            {activeTab === 'funding' && (
              <div className="space-y-lg">
                {/* Funding + PhD side by side on large screens */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                  <div>
                    <FundingPortfolio data={universityFundingPortfolio} />
                  </div>

                  {/* Funding KPIs */}
                  <div className="space-y-lg">
                    <div className="panel">
                      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Funding Highlights</h3>
                      <div className="grid grid-cols-2 gap-md">
                        <div className="p-sm bg-fog rounded-lg text-center">
                          <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Total Funding</p>
                          <p className="font-mono text-h1 font-bold text-kle-dark">₹15.4 Cr</p>
                          <p className="text-micro text-success">+22% YoY</p>
                        </div>
                        <div className="p-sm bg-fog rounded-lg text-center">
                          <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Active Projects</p>
                          <p className="font-mono text-h1 font-bold text-kle-dark">50</p>
                          <p className="text-micro text-success">+12 new</p>
                        </div>
                        <div className="p-sm bg-fog rounded-lg text-center">
                          <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Avg Grant Size</p>
                          <p className="font-mono text-h1 font-bold text-kle-dark">₹30.8L</p>
                          <p className="text-micro text-smoke">per project</p>
                        </div>
                        <div className="p-sm bg-fog rounded-lg text-center">
                          <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Industry %</p>
                          <p className="font-mono text-h1 font-bold text-kle-dark">23%</p>
                          <p className="text-micro text-success">+5% vs last year</p>
                        </div>
                      </div>
                    </div>

                    {/* Patent Summary */}
                    <div className="panel">
                      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Patent Portfolio</h3>
                      <div className="flex items-center gap-lg">
                        <div className="flex-1 space-y-sm">
                          {[
                            { label: 'Filed', count: 18, color: '#3730A3' },
                            { label: 'Published', count: 12, color: '#0F766E' },
                            { label: 'Granted', count: 6, color: '#15803D' },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center gap-sm">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-label text-graphite w-20">{item.label}</span>
                              <div className="flex-1 h-3 bg-mist rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(item.count / 18) * 100}%`, backgroundColor: item.color }} />
                              </div>
                              <span className="font-mono text-sm text-kle-dark w-8 text-right">{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PhD Pipeline */}
                <div>
                  <PhDPipelineFunnel pipeline={universityPhDPipeline} />
                </div>
              </div>
            )}

            {/* ═══════ BENCHMARKS & NIRF TAB ═══════ */}
            {activeTab === 'benchmarks' && (
              <div className="space-y-lg">
                <div>
                  <NIRFTrajectory data={nirfTrajectory} />
                </div>
                <div>
                  <PeerComparisonTable data={peerComparison} />
                </div>

                {/* NIRF Parameter Breakdown */}
                <div className="panel">
                  <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">NIRF Parameter Scores (2025)</h3>
                  <div className="space-y-md">
                    {[
                      { param: 'Teaching, Learning & Resources (TLR)', score: 62, max: 100, color: '#B91C1C' },
                      { param: 'Research & Professional Practice (RPC)', score: 55, max: 100, color: '#3730A3' },
                      { param: 'Graduation Outcomes (GO)', score: 58, max: 100, color: '#0F766E' },
                      { param: 'Outreach & Inclusivity (OI)', score: 52, max: 100, color: '#B45309' },
                      { param: 'Peer Perception (PR)', score: 48, max: 100, color: '#6D28D9' },
                    ].map((item) => (
                      <div key={item.param} className="flex items-center gap-md">
                        <span className="text-label text-graphite w-72 truncate" title={item.param}>{item.param}</span>
                        <div className="flex-1 h-4 bg-mist rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${item.score}%`, backgroundColor: item.color }} />
                        </div>
                        <span className="font-mono text-sm text-kle-dark w-16 text-right">{item.score} / {item.max}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-between text-label text-smoke pt-md border-t border-mist">
          <div>
            <p>v1.0 · Dean R&D Office · KLE Technological University</p>
          </div>
          <div className="flex items-center gap-lg">
            <button className="flex items-center gap-xs hover:text-kle-crimson transition-colors">
              <FileText size={14} />
              Export Full Report
            </button>
          </div>
        </div>
      </div>
      <AIChatbot contextData={excelData} chartFocus={chartFocus} onChartFocusHandled={() => setChartFocus(null)} />
    </div>
  );
}
