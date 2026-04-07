import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, 
  Quote, 
  Award, 
  TrendingUp, 
  BarChart3, 
  Hash,
  Filter,
  Calendar,
  FileType,
  ArrowUp,
  ArrowDown,
  ChevronDown,
} from 'lucide-react';

import KPICard from '../components/KPICard';
import DonutChart from '../components/DonutChart';
import StackedBarChart from '../components/StackedBarChart';
import MultiLineChart from '../components/MultiLineChart';
import HorizontalBarChart from '../components/HorizontalBarChart';
import ScatterPlot from '../components/ScatterPlot';
import DataTable from '../components/DataTable';
import FacultyScoreCard from '../components/FacultyScoreCard';
import ParameterScoreTable from '../components/ParameterScoreTable';
import AIInsightsPanel from '../components/AIInsightsPanel';
import TargetProgressCard from '../components/TargetProgressCard';
import FundedProjectsPanel from '../components/FundedProjectsPanel';
import PhDTrackingPanel from '../components/PhDTrackingPanel';
import BreadcrumbNavigation from '../components/BreadcrumbNavigation';

import {
  staffKPIs,
  publicationsPerYear,
  qRankDistribution,
  citationTrend,
  topPapers,
  scatterData,
  publicationsTableData,
  facultyProfile,
  categoryParameterLabels,
  facultyParameterScores,
  quarterlyQRankComparison,
  multiYearComparison,
  departmentFacultyScores,
} from '../data/mockData';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, Line, ComposedChart,
} from 'recharts';

const CATEGORY_LABELS = {
  SRG: 'Senior Research Guide',
  ERG: 'Emerging Research Guide',
  ERGWS: 'Emerging Research Guide Without Student',
  ERS: 'Evolving Research Scholar',
  'ERS-prep': 'Evolving Research Scholar (Prep)',
  IREF: 'Immersive Research Experience',
  'pre-IREF': 'Pre - Immersive Research Experience',
  'Pre-IREF': 'Pre - Immersive Research Experience',
  'Pre IREF': 'Pre - Immersive Research Experience',
  NA: 'Not Applicable',
};

// ── Quarterly Q-Rank Comparison (last 5 quarters) ──
function QuarterlyComparison({ data }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="panel"
    >
      <h3 className="font-display text-2xl font-semibold text-kle-dark mb-sm tracking-tight">
        Last 5 Quarters – Q-Rank Comparison
      </h3>
      <p className="text-label text-smoke mb-lg font-body">Publications per quarter by Scopus quartile</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: '#6B7280' }} />
          <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB' }}
          />
          <Legend />
          <Bar dataKey="Q1" stackId="q" fill="#0F766E" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Q2" stackId="q" fill="#3730A3" />
          <Bar dataKey="Q3" stackId="q" fill="#B45309" />
          <Bar dataKey="Q4" stackId="q" fill="#B91C1C" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ── Dynamic Multi-Year Comparison Table ──
const yearRangePresets = [
  { label: 'Last 3 Years', count: 3 },
  { label: 'Last 5 Years', count: 5 },
  { label: 'All Years', count: null },
];

function MultiYearComparisonTable({ data }) {
  const [rangeCount, setRangeCount] = useState(3);
  const [showDropdown, setShowDropdown] = useState(false);

  const allYears = data.years;
  const displayYears = rangeCount
    ? allYears.slice(-rangeCount)
    : allYears;

  const startIdx = allYears.length - displayYears.length;

  const metrics = [
    { key: 'papers', label: 'Number of Papers', icon: BookOpen },
    { key: 'hIndex', label: 'H-Index', icon: Award },
    { key: 'citations', label: 'Total Citations', icon: Quote },
    { key: 'q1Percent', label: 'Q1 Publications %', icon: TrendingUp, suffix: '%' },
    { key: 'avgIF', label: 'Avg Impact Factor', icon: BarChart3 },
    { key: 'i10Index', label: 'i10-Index', icon: Hash },
  ];

  const currentPreset = yearRangePresets.find(p => p.count === rangeCount);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="panel"
    >
      <div className="flex items-center justify-between mb-lg flex-wrap gap-md">
        <div>
          <h3 className="font-display text-2xl font-semibold text-kle-dark tracking-tight">
            Year-over-Year Comparison
          </h3>
          <p className="text-label text-smoke mt-xs font-body">
            Key research metrics · {displayYears[0]} – {displayYears[displayYears.length - 1]}
          </p>
        </div>

        {/* Year range selector */}
        <div className="relative">
          <motion.button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-sm px-lg py-sm bg-fog border border-mist rounded-lg text-body text-kle-dark hover:bg-mist transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Calendar size={14} className="text-smoke" />
            <span className="font-heading font-medium">{currentPreset?.label || 'Custom'}</span>
            <motion.div animate={{ rotate: showDropdown ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={14} className="text-smoke" />
            </motion.div>
          </motion.button>
          
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 top-full mt-xs bg-white border border-mist rounded-lg shadow-lg z-10 min-w-[160px] overflow-hidden"
              >
                {yearRangePresets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => { setRangeCount(preset.count); setShowDropdown(false); }}
                    className={`w-full text-left px-lg py-sm text-body transition-colors ${
                      rangeCount === preset.count
                        ? 'bg-kle-crimson/10 text-kle-crimson font-medium'
                        : 'text-graphite hover:bg-fog'
                    }`}
                  >
                    {preset.label}
                    {preset.count && (
                      <span className="text-label text-smoke ml-sm">
                        ({allYears.slice(-preset.count)[0]}–{allYears[allYears.length - 1]})
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Quick toggle buttons */}
      <div className="flex gap-xs mb-lg">
        {yearRangePresets.map((preset) => (
          <motion.button
            key={preset.label}
            onClick={() => setRangeCount(preset.count)}
            className={`px-md py-xs rounded-lg text-label font-medium transition-all ${
              rangeCount === preset.count
                ? 'bg-kle-crimson text-white shadow-sm'
                : 'bg-fog text-smoke hover:bg-mist hover:text-graphite'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {preset.label}
          </motion.button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist">
        <table className="w-full">
          <thead>
            <tr className="bg-gradient-to-r from-kle-light/40 to-fog">
              <th className="text-left py-md px-md text-xs text-smoke font-semibold uppercase tracking-wider">Metric</th>
              {displayYears.map((yr) => (
                <th key={yr} className="text-center py-md px-md text-xs text-smoke font-semibold uppercase tracking-wider">{yr}</th>
              ))}
              <th className="text-center py-md px-md text-xs text-smoke font-semibold uppercase tracking-wider">Change</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="wait">
              {metrics.map(({ key, label, icon: Icon, suffix }, mIdx) => {
                const allVals = data[key];
                const vals = allVals.slice(startIdx);
                const first = vals[0];
                const last = vals[vals.length - 1];
                const change = first > 0 ? (((last - first) / first) * 100).toFixed(1) : 0;
                const positive = parseFloat(change) >= 0;

                return (
                  <motion.tr
                    key={`${key}-${rangeCount}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: mIdx * 0.05 }}
                    className="border-t border-mist hover:bg-fog/40 transition-colors group"
                  >
                    <td className="py-md px-md">
                      <div className="flex items-center gap-sm">
                        <Icon size={14} className="text-smoke group-hover:text-kle-crimson transition-colors" />
                        <span className="font-heading text-sm font-medium text-kle-dark">{label}</span>
                      </div>
                    </td>
                    {vals.map((v, i) => (
                      <td key={i} className="py-md px-md text-center font-mono text-kle-dark">
                        {typeof v === 'number' && v >= 1000 ? v.toLocaleString('en-IN') : v}
                        {suffix || ''}
                      </td>
                    ))}
                    <td className="py-md px-md text-center">
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 + mIdx * 0.05 }}
                        className={`inline-flex items-center gap-xs px-sm py-xs rounded-lg text-sm font-mono font-medium ${
                          positive ? 'bg-success/10 text-success' : 'bg-kle-crimson/10 text-kle-crimson'
                        }`}
                      >
                        {positive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        {positive ? '+' : ''}{change}%
                      </motion.div>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ── Department Faculty Score List ──
function DeptFacultyScoreList({ data, currentFaculty }) {
  const categories = [...new Set(data.map(d => d.category))];
  const [selectedCat, setSelectedCat] = useState('all');

  const filtered = selectedCat === 'all'
    ? data
    : data.filter(d => d.category === selectedCat);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="panel"
    >
      <div className="flex items-center justify-between mb-lg flex-wrap gap-md">
        <div>
          <h3 className="font-display text-2xl font-semibold text-kle-dark tracking-tight">Faculty Score List</h3>
          <p className="text-label text-smoke mt-xs font-body">Individual faculty can be viewed from category list / score list</p>
        </div>
        <div className="flex gap-xs flex-wrap">
          <motion.button
            onClick={() => setSelectedCat('all')}
            className={`px-md py-xs rounded-lg text-label font-medium transition-all ${
              selectedCat === 'all' ? 'bg-kle-crimson text-white shadow-sm' : 'bg-fog text-smoke hover:bg-mist'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            All
          </motion.button>
          {categories.map(cat => (
            <motion.button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-md py-xs rounded-lg text-label font-medium transition-all ${
                selectedCat === cat ? 'bg-kle-crimson text-white shadow-sm' : 'bg-fog text-smoke hover:bg-mist'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {cat}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="space-y-sm">
        <AnimatePresence mode="wait">
          {filtered.map((f, idx) => {
            const pct = f.maxScore > 0 ? (f.score / f.maxScore) * 100 : 0;
            const isCurrent = f.name === currentFaculty;
            return (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.3, delay: idx * 0.04 }}
                whileHover={{ x: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                className={`flex items-center gap-lg p-md rounded-lg transition-all cursor-pointer ${
                  isCurrent ? 'bg-kle-crimson/5 border border-kle-crimson/20' : 'bg-white border border-mist'
                }`}
              >
                <div className="w-8 text-center font-mono text-label text-smoke">
                  #{idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm">
                    <span className={`font-heading text-sm font-medium ${isCurrent ? 'text-kle-crimson' : 'text-kle-dark'}`}>
                      {f.name}
                    </span>
                    {isCurrent && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-micro bg-kle-crimson text-white px-sm py-xs rounded-full font-medium"
                      >
                        You
                      </motion.span>
                    )}
                  </div>
                  <span className="text-label text-smoke">Rank {f.rank} in {CATEGORY_LABELS[f.category] ? `${CATEGORY_LABELS[f.category]} (${f.category})` : f.category}</span>
                </div>
                <div className={`px-sm py-xs rounded-lg text-micro font-medium ${
                  f.category === 'SRG' ? 'bg-accent-teal/10 text-accent-teal' :
                  f.category === 'ERG' ? 'bg-accent-indigo/10 text-accent-indigo' :
                  f.category === 'ERGWS' ? 'bg-accent-gold/10 text-accent-gold' :
                  'bg-kle-crimson/10 text-kle-crimson'
                }`} title={CATEGORY_LABELS[f.category] ? `${CATEGORY_LABELS[f.category]} (${f.category})` : f.category}>
                  {f.category}
                </div>
                <div className="w-32">
                  <div className="flex justify-between text-micro mb-xs">
                    <span className="text-smoke">Score</span>
                    <span className="font-mono text-kle-dark">{f.score}/{f.maxScore}</span>
                  </div>
                  <div className="w-full bg-mist rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: idx * 0.05 }}
                      className="h-2 rounded-full"
                      style={{
                        backgroundColor: pct >= 70 ? '#16a34a' : pct >= 50 ? '#B45309' : '#B91C1C',
                      }}
                    />
                  </div>
                </div>
                <div className="text-right w-20">
                  <p className="text-micro text-smoke">Cat Avg</p>
                  <p className="font-mono text-sm text-graphite">{f.avgCat}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function StaffDashboard() {
  const [yearRange, setYearRange] = useState([2019, 2025]);
  const [selectedQRank, setSelectedQRank] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'trends', label: 'Trends & Analysis', icon: TrendingUp },
    { id: 'research', label: 'Research Output', icon: Award },
    { id: 'phd', label: 'PhD Scholars', icon: Award },
    { id: 'publications', label: 'Publications', icon: BookOpen },
    { id: 'benchmarking', label: 'Benchmarking', icon: Hash },
  ];

  const tableColumns = [
    { key: 'title', label: 'Title', width: '30%' },
    { key: 'year', label: 'Year', type: 'number' },
    { key: 'journal', label: 'Journal' },
    { key: 'qRank', label: 'Q-Rank', type: 'qrank' },
    { key: 'impactFactor', label: 'IF', type: 'number' },
    { key: 'citations', label: 'Citations', type: 'number' },
    { key: 'doi', label: 'DOI', type: 'doi' },
  ];

  const handleQRankFilter = (item) => {
    setSelectedQRank(prev => prev === item.name ? null : item.name);
  };

  // Determine parameter labels based on faculty category
  const getCategoryLabelKey = () => {
    const cat = facultyProfile.category;
    if (cat === 'SRG') return 'SRG';
    if (cat === 'ERG') return 'ERG-with-student'; // default; could switch based on student status
    if (cat === 'ERGWS') return 'ERG-without-student';
    if (cat === 'ERS' || cat === 'ERS-prep') return 'ERS';
    if (cat === 'IREF') return 'IREF';
    if (cat === 'pre-IREF') return 'pre-IREF';
    return 'SRG';
  };

  const paramLabels = categoryParameterLabels[getCategoryLabelKey()] || categoryParameterLabels.SRG;

  // Staggered section animation
  const sectionVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.08, duration: 0.45, ease: 'easeOut' },
    }),
  };

  return (
    <div className="space-y-xl">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* Faculty Research Score Card - Always Visible            */}
      {/* ═══════════════════════════════════════════════════════ */}
      <FacultyScoreCard profile={facultyProfile} />

      {/* Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="panel"
      >
        <div className="flex items-center gap-sm overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-sm px-lg py-sm rounded-lg font-heading font-medium text-sm transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-kle-crimson text-white shadow-md'
                    : 'bg-fog text-graphite hover:bg-mist'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-xl"
          >
            {/* Filter Bar */}
            <div className="panel flex items-center flex-wrap gap-lg">
              <div className="flex items-center gap-sm text-label text-smoke">
                <Filter size={14} />
                <span className="font-heading font-medium">Filters:</span>
              </div>
              
              <div className="flex items-center gap-xs bg-fog border border-mist rounded-lg px-md py-sm">
                <Calendar size={14} className="text-smoke" />
                <span className="text-body text-graphite font-body">2019 - 2025</span>
              </div>
              
              <div className="flex items-center gap-xs bg-fog border border-mist rounded-lg px-md py-sm">
                <FileType size={14} className="text-smoke" />
                <span className="text-body text-graphite font-body">All Types</span>
              </div>
              
              {selectedQRank && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="flex items-center gap-sm bg-kle-crimson/10 border border-kle-crimson text-kle-crimson rounded-lg px-md py-sm"
                >
                  <span className="text-body font-medium">Q-Rank: {selectedQRank}</span>
                  <button 
                    onClick={() => setSelectedQRank(null)}
                    className="hover:bg-kle-crimson/20 rounded px-xs transition-colors"
                  >
                    ×
                  </button>
                </motion.div>
              )}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-lg">
              <KPICard
                label="Total Publications"
                value={staffKPIs.totalPubs.value}
                delta={staffKPIs.totalPubs.delta}
                icon={BookOpen}
                accentColor="kle-crimson"
                sparklineData={[15, 17, 18, 21, 25, 30, 35]}
              />
              <KPICard
                label="Scopus Citations"
                value={staffKPIs.scopusCitations.value}
                delta={staffKPIs.scopusCitations.delta}
                icon={Quote}
                accentColor="teal"
              />
              <KPICard
                label="H-Index"
                value={staffKPIs.hIndex.value}
                delta={staffKPIs.hIndex.delta}
                deltaLabel={`Top ${100 - staffKPIs.hIndex.percentile}% in dept`}
                icon={Award}
                accentColor="gold"
              />
              <KPICard
                label="Q1+Q2 %"
                value={`${staffKPIs.q1q2Percent.value}%`}
                delta={staffKPIs.q1q2Percent.delta}
                icon={TrendingUp}
                accentColor="teal"
              />
              <KPICard
                label="Avg Impact Factor"
                value={staffKPIs.avgIF.value.toFixed(2)}
                delta={staffKPIs.avgIF.delta}
                deltaLabel={`Dept avg: ${staffKPIs.avgIF.deptAvg}`}
                icon={BarChart3}
                accentColor="indigo"
              />
              <KPICard
                label="i10-Index"
                value={staffKPIs.i10Index.value}
                delta={staffKPIs.i10Index.delta}
                icon={Hash}
                accentColor="gold"
              />
            </div>

            {/* Publications per Year + Q-Rank Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
              <div className="lg:col-span-2">
                <StackedBarChart
                  data={publicationsPerYear}
                  title="Publications per Year by Q-Rank"
                  xKey="year"
                  stackKeys={['Q1', 'Q2', 'Q3', 'Q4']}
                  targetLine={30}
                  height={320}
                />
              </div>
              <div>
                <DonutChart
                  data={qRankDistribution}
                  title="Q-Rank Distribution"
                  centerValue={qRankDistribution.reduce((sum, item) => sum + item.value, 0)}
                  centerLabel="Total"
                  onSegmentClick={handleQRankFilter}
                />
              </div>
            </div>

            {/* Target Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
              <TargetProgressCard
                title="Annual Publications"
                current={7}
                target={10}
                period="Academic Year 2025-26"
                subtitle="Publications target"
                trend={12}
              />
              <TargetProgressCard
                title="Q1+Q2 Publications"
                current={5}
                target={6}
                period="Target for Quality"
                subtitle="High-impact journals"
                trend={8}
              />
              <TargetProgressCard
                title="Citation Growth"
                current={145}
                target={150}
                period="Annual Target"
                subtitle="Total citations"
                trend={23}
              />
            </div>

            {/* AI Insights Panel */}
            <AIInsightsPanel
              role="staff"
              insights={[
                {
                  type: 'trend',
                  title: 'Strong Citation Growth',
                  message: 'Your citations increased by 23% this quarter, outpacing department average of 15%. Continue publishing in high-impact Q1 journals to maintain this momentum.',
                  priority: 'medium',
                },
                {
                  type: 'success',
                  title: 'Target on Track',
                  message: 'You are on track to meet your annual publication target with current pace of 2.3 papers per quarter.',
                  priority: 'low',
                },
                {
                  type: 'info',
                  title: 'Collaboration Opportunity',
                  message: 'Consider collaborating with Dr. Sharma on AI-Healthcare research - complementary expertise identified.',
                  priority: 'low',
                  action: 'View Collaboration Profile →',
                },
              ]}
            />
          </motion.div>
        )}

        {activeTab === 'trends' && (
          <motion.div
            key="trends"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-xl"
          >
            {/* Last 5 Quarters Comparison */}
            <QuarterlyComparison data={quarterlyQRankComparison} />

            {/* Dynamic Year Comparison */}
            <MultiYearComparisonTable data={multiYearComparison} />

            {/* Citation Growth Trends */}
            <MultiLineChart
              data={citationTrend}
              title="Citation Growth Across Databases"
              xKey="year"
              series={[
                { key: 'Scopus', name: 'Scopus' },
                { key: 'WoS', name: 'WoS' },
                { key: 'Google Scholar', name: 'Google Scholar' },
              ]}
              showCAGR={true}
              height={300}
            />
          </motion.div>
        )}

        {activeTab === 'research' && (
          <motion.div
            key="research"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-xl"
          >
            {/* Top Papers + Scatter */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
              <HorizontalBarChart
                data={topPapers}
                title="Top 10 Most Cited Papers"
                subtitle="Sorted by Scopus citations"
                valueKey="value"
                labelKey="name"
                colorKey="qRank"
                showBadge={true}
                badgeKey="hIndex"
                height={400}
              />
              <ScatterPlot
                data={scatterData}
                title="Impact Factor vs Citations"
                xLabel="Impact Factor"
                yLabel="Scopus Citations"
                colorKey="qRank"
                height={400}
              />
            </div>

            {/* Research Parameter Scores */}
            <ParameterScoreTable
              reviewData={facultyParameterScores}
              highlightFaculty={facultyProfile.name}
              title={`Research Parameter Scores – ${facultyProfile.category}`}
            />
          </motion.div>
        )}

        {activeTab === 'phd' && (
          <motion.div
            key="phd"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-xl"
          >
            {/* PhD Tracking Panel */}
            <PhDTrackingPanel role="staff" />

            {/* AI Insights for PhD Progress */}
            <AIInsightsPanel
              role="staff"
              insights={[
                {
                  type: 'info',
                  title: 'PhD Scholar Progress',
                  message: 'All 3 scholars are progressing well. Rahul Verma has published 4 papers and is on track for completion.',
                  priority: 'medium',
                },
                {
                  type: 'warning',
                  title: 'Publication Milestone',
                  message: 'Amit Singh needs 2 more publications to meet the minimum requirement for thesis submission.',
                  priority: 'medium',
                  action: 'View Scholar Profile →',
                },
              ]}
            />
          </motion.div>
        )}

        {activeTab === 'publications' && (
          <motion.div
            key="publications"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-xl"
          >
            {/* Publications Data Table */}
            <DataTable
              data={publicationsTableData}
              columns={tableColumns}
              title="Publications"
              sortable={true}
              filterable={true}
              exportable={true}
              pageSize={10}
              onRowClick={(row) => window.open(`https://doi.org/${row.doi}`, '_blank')}
            />
          </motion.div>
        )}

        {activeTab === 'benchmarking' && (
          <motion.div
            key="benchmarking"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-xl"
          >
            {/* Department Faculty Score List */}
            <DeptFacultyScoreList
              data={departmentFacultyScores}
              currentFaculty={facultyProfile.name}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="flex items-center justify-between text-label text-smoke pt-lg border-t border-mist"
      >
        <span className="font-body">Last updated: March 4, 2026 at 10:30 AM</span>
        <div className="flex items-center gap-lg">
          <button className="hover:text-kle-crimson transition-colors font-heading font-medium">Export CSV</button>
          <button className="hover:text-kle-crimson transition-colors font-heading font-medium">Print Report</button>
        </div>
      </motion.div>
    </div>
  );
}
