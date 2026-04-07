import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  Award,
  TrendingUp,
  TrendingDown,
  Users,
  BarChart3,
  FileText,
  Download,
  GraduationCap,
  DollarSign,
  Target,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Sparkles,
  BookOpen,
  FlaskConical,
  Loader2,
  MousePointerClick,
} from 'lucide-react';

import StatGauge from '../components/StatGauge';
import DonutChart from '../components/DonutChart';
import MultiLineChart from '../components/MultiLineChart';
import HorizontalBarChart from '../components/HorizontalBarChart';
import DataTable from '../components/DataTable';
import AIInsightsPanel from '../components/AIInsightsPanel';
import AIChatbot from '../components/AIChatbot';
import TargetProgressCard from '../components/TargetProgressCard';
import PublicationListView from '../components/PublicationListView';
import PublicationDetailView from '../components/PublicationDetailView';

import { loadExcelData, aggregateUniversityData } from '../data/excelDataLoader';

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
    universityTargets,
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
    { type: 'warning', title: 'Bengaluru Campus Gap', message: 'Bengaluru campus at 85% of publication target. Recommend faculty mentorship program and seed grants to boost output.', priority: 'high' },
    { type: 'trend', title: '5-Year CAGR Strong', message: 'University publications CAGR of 14.2% exceeds national average of 9.5%. BVB campus leads with 15.8% CAGR.', priority: 'medium' },
    { type: 'info', title: 'Q1 Publishing Target', message: 'Q1 percentage at 42% vs 50% target. Focus interdisciplinary collaborations in high-impact journals.', priority: 'medium' },
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
                {/* Target Progress Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
                  <div
                    onClick={() => {
                      setDrillDownView('list');
                    }}
                    className="cursor-pointer"
                    title="Click to explore publications"
                  >
                    <TargetProgressCard title="Publications" current={universityTargets.publications.current} subtitle="Click to explore →" trend={`+${universityKPIs.yoyGrowth.value}% YoY`} />
                  </div>
                  <TargetProgressCard title="Citations" current={universityTargets.citations.current} subtitle="Cumulative Scopus" />
                  <TargetProgressCard title="H-Index" current={universityTargets.hIndex.current} subtitle="University aggregate" />
                  <TargetProgressCard title="Q1 Publications %" current={universityTargets.q1Percent.current} unit="%" subtitle="Top-quartile share" />
                </div>

                {/* Second row target cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
                  {/* <TargetProgressCard title="External Funding" current={universityTargets.fundingCrore.current} unit=" Cr" subtitle="₹ Crore received" /> */}
                  {/* <TargetProgressCard title="NIRF Rank" current={universityTargets.nirfRank.current} subtitle="All India Rank" /> */}
                  {/* <TargetProgressCard title="Patents Filed" current={universityTargets.patents.current} subtitle="Filed + Granted" /> */}
                  {/* <TargetProgressCard title="PhD Completions" current={universityTargets.phdCompletions.current} subtitle="Thesis awarded" /> */}
                </div>

                {/* AI Strategic Briefing */}
                {/* <AIInsightsPanel insights={strategicInsights} role="university-dean" /> */}

                {/* Campus Performance (horizontal) */}
                <div
                  className="panel relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200"
                  onClick={() => focusChart('campus-perf', 'Campus Performance', `Campus data: ${campusData.map(c => `${c.name}: ${c.actual}/${c.target} (${((c.actual/c.target)*100).toFixed(0)}%)`).join(', ')}`, 'Analyze campus performance — which campus is ahead or behind target and by how much?')}
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none"><MousePointerClick size={12} />Click to analyze with AI</div>
                  <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Campus Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
                    {campusData.map((campus) => (
                      <div key={campus.name} className="flex items-center gap-md">
                        <StatGauge actual={campus.actual} target={campus.target} label={campus.name} size="sm" />
                        <div className="flex-1 space-y-xs">
                          <div className="flex justify-between text-label">
                            <span className="text-smoke">Achievement</span>
                            <span className="font-mono text-kle-dark">{((campus.actual / campus.target) * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between text-label">
                            <span className="text-smoke">Actual / Target</span>
                            <span className="font-mono text-kle-dark">{campus.actual} / {campus.target}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Q-Rank + Top Faculty side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg mb-lg">
                  <div
                    className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200"
                    onClick={() => focusChart('qrank', 'Q-Rank Distribution', `Q-Rank: ${universityQRankDistribution.map(q => `${q.name}: ${q.value}`).join(', ')}`, 'Explain the university Q-rank distribution — what percentage are Q1, Q2, Q3, Q4? How can we improve Q1 share?')}
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
                  <DonutChart
                    data={universityQRankDistribution}
                    title="University Q-Rank Distribution"
                    centerValue={universityQRankDistribution.reduce((sum, item) => sum + item.value, 0)}
                    centerLabel="Total Pubs"
                    size="md"
                  />
                  </div>

                  <div
                    className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200"
                    onClick={() => focusChart('top-faculty', 'Top 10 Faculty', `Top faculty: ${topUniversityFaculty.slice(0,5).map(f => `${f.name}: ${f.value} citations`).join(', ')}`, 'Who are the top 10 faculty by Scopus citations? Which departments and campuses do they belong to?')}
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
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
                  <div
                    className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200"
                    onClick={() => focusChart('article-types', 'Article Types', `Article types: ${universityArticleTypes.map(a => `${a.name}: ${a.value}`).join(', ')}`, 'Break down publications by article type — how many are journal articles vs conference papers vs reviews?')}
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
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
                <div
                  className="panel relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200"
                  onClick={() => focusChart('campus-trends', '5-Year Campus Trends', `Trends: ${campusTrend.map(c => `${c.year}: BVB=${c.BVB}, Bel=${c.Belagavi}, Blr=${c.Bengaluru}`).join('; ')}`, 'Analyze the 5-year campus publication trends — which campus is growing fastest? Are any falling behind their targets?')}
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
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
                        targetLines={[
                          { value: 900, label: 'BVB Target', color: '#B91C1C' },
                          { value: 300, label: 'Belagavi Target', color: '#3730A3' },
                        ]}
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
                  <div
                    className="panel relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200"
                    onClick={() => focusChart('citation-target', 'Citation Target vs Actual', `Citations: ${campusData.map(c => `${c.name}: actual=${c.actual*28}, target=${c.target*30}`).join(', ')}`, 'Compare citation target vs actual for each campus — who is on track and who needs improvement?')}
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Citation Target vs Actual</h3>
                    <div className="space-y-lg">
                      {campusData.map((campus) => {
                        const citationActual = campus.actual * 28;
                        const citationTarget = campus.target * 30;
                        const percentage = (citationActual / citationTarget) * 100;
                        return (
                          <div key={campus.name} className="space-y-xs">
                            <div className="flex justify-between text-label">
                              <span className="text-graphite">{campus.name}</span>
                              <span className="font-mono text-kle-dark">
                                {citationActual.toLocaleString('en-IN')} / {citationTarget.toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div className="h-3 bg-mist rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: campus.color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className="panel relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200"
                    onClick={() => focusChart('hindex-trend', 'H-Index Trend', `H-Index: ${universityHIndexTrend.map(h => `${h.year}: BVB=${h.BVB}`).join(', ')}`, 'Analyze the H-index trend across campuses — which campus has the best improvement? What is the current average?')}
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
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
                <div
                  className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200 rounded-xl"
                  onClick={() => focusChart('research-landscape', 'Research Landscape', `Departments: ${universityResearchLandscape.map(d => `${d.name}(${d.campus}): ${d.pubs} pubs, ${d.citations} cit`).join('; ')}`, 'Analyze the university research landscape — which departments lead in publications and citations? How do campuses compare?')}
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
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
                  <div
                    className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200 rounded-xl"
                    onClick={() => focusChart('funding', 'Funding Portfolio', `Funding: ${universityFundingPortfolio.map(f => `${f.name}: ₹${f.value}Cr, ${f.projects} proj`).join('; ')}`, 'Analyze the funding portfolio — which agencies contribute most? What is the total funding and how has it grown?')}
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
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
                <div
                  className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200 rounded-xl"
                  onClick={() => focusChart('phd-pipeline', 'PhD Pipeline', `PhD: ${universityPhDPipeline.total} scholars, OnTrack: ${universityPhDPipeline.onTrack}, Delayed: ${universityPhDPipeline.delayed}, Critical: ${universityPhDPipeline.critical}, Avg: ${universityPhDPipeline.avgDuration}yr`, 'Analyze the PhD scholar pipeline — how many are on track vs delayed vs critical? What is the average completion duration?')}
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
                  <PhDPipelineFunnel pipeline={universityPhDPipeline} />
                </div>
              </div>
            )}

            {/* ═══════ BENCHMARKS & NIRF TAB ═══════ */}
            {activeTab === 'benchmarks' && (
              <div className="space-y-lg">
                <div
                  className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200 rounded-xl"
                  onClick={() => focusChart('nirf', 'NIRF Trajectory', `NIRF: ${nirfTrajectory.map(n => `${n.year}: #${n.rank} (Score: ${n.score}, Band: ${n.band})`).join('; ')}`, 'Analyze the NIRF ranking trajectory — how has the rank improved over the years? What score and band were achieved?')}
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
                  <NIRFTrajectory data={nirfTrajectory} />
                </div>
                <div
                  className="relative group/chart cursor-pointer hover:ring-2 hover:ring-kle-crimson/30 hover:shadow-lg transition-all duration-200 rounded-xl"
                  onClick={() => focusChart('peer-comparison', 'Peer Comparison', `Peers: ${peerComparison.map(p => `${p.name}: ${p.publications} pubs, H:${p.hIndex}`).join('; ')}`, 'Compare KLE Tech with peer institutions — where do we stand on publications, citations, H-index, and Q1 percentage?')}
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover/chart:opacity-100 transition-opacity flex items-center gap-1 text-xs text-kle-crimson bg-kle-crimson/10 px-2 py-1 rounded-md pointer-events-none z-10"><MousePointerClick size={12} />Click to analyze with AI</div>
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
