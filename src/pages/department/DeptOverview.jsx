import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  FileText,
  Award,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  BookOpen,
} from 'lucide-react';
import { fadeUp, staggerContainer } from './deptConstants';
import {
  deptResearchOutcomesByYear,
  deptFacultyData,
  rBandDistribution,
  deptFacultyList,
} from '../../data/mockData';

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

export default function DeptOverview() {
  const { selectedYear } = useOutletContext();
  const yearData = deptResearchOutcomesByYear[selectedYear] || deptResearchOutcomesByYear[2023];

  const r4Count = rBandDistribution.find((r) => r.band === 'R4')?.count || 0;
  const pubPct = yearData.publications.target > 0
    ? ((yearData.publications.current / yearData.publications.target) * 100).toFixed(0)
    : 0;
  const citPct = yearData.citations.target > 0
    ? ((yearData.citations.current / yearData.citations.target) * 100).toFixed(0)
    : 0;

  const kpis = [
    {
      label: 'Total Faculty',
      value: deptFacultyData.current.totalFaculty,
      icon: Users,
      accent: '#B91C1C',
      sub: `${deptFacultyData.current.categories.length} categories`,
    },
    {
      label: 'Publications',
      value: `${yearData.publications.current} / ${yearData.publications.target}`,
      icon: FileText,
      accent: '#3730A3',
      sub: `${pubPct}% of target`,
      delta: pubPct >= 50 ? +pubPct : -pubPct,
    },
    {
      label: 'Patents Filed',
      value: yearData.patents.filed,
      icon: Award,
      accent: '#D97706',
      sub: `Granted: ${yearData.patents.granted}`,
    },
    {
      label: 'Citations',
      value: yearData.citations.current,
      icon: TrendingUp,
      accent: '#0F766E',
      sub: `Target: ${yearData.citations.target} (${citPct}%)`,
      delta: citPct >= 50 ? +citPct : -citPct,
    },
  ];

  // Top 5 faculty
  const topFaculty = deptFacultyList.slice(0, 5);

  // Quick stats
  const totalQ1Q2 = yearData.qualityQuartiles
    .filter((q) => q.name === 'Q1' || q.name === 'Q2')
    .reduce((s, q) => s + q.value, 0);
  const totalPubs = yearData.qualityQuartiles.reduce((s, q) => s + q.value, 0);
  const q1q2Pct = totalPubs > 0 ? ((totalQ1Q2 / totalPubs) * 100).toFixed(0) : 0;

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-xl">
      {/* Alert Banner */}
      {r4Count > 0 && (
        <motion.div
          variants={fadeUp}
          className="flex items-center justify-between px-lg py-md rounded-xl bg-gradient-to-r from-red-50 to-orange-50 border border-red-200/60"
        >
          <div className="flex items-center gap-md">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <div>
              <p className="font-heading font-semibold text-sm text-red-800">
                {r4Count} faculty below R4 threshold
              </p>
              <p className="text-xs text-red-600">Immediate attention needed for performance improvement</p>
            </div>
          </div>
          <a href="/department/faculty-list" className="text-xs font-medium text-red-700 underline hover:no-underline">
            View list →
          </a>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-lg">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              variants={fadeUp}
              whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
              className="relative overflow-hidden bg-white rounded-xl border border-mist/60 p-lg transition-shadow cursor-default"
            >
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r" style={{ backgroundColor: kpi.accent }} />
              <div className="flex items-start gap-md">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: kpi.accent + '12' }}
                >
                  <Icon size={18} style={{ color: kpi.accent }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-smoke font-semibold">{kpi.label}</p>
                  <p className="font-mono text-xl font-bold text-kle-dark mt-xs">{kpi.value}</p>
                  {kpi.sub && (
                    <p className="text-[11px] text-smoke mt-xs flex items-center gap-xs">
                      {kpi.delta !== undefined && (
                        kpi.delta >= 50
                          ? <ArrowUpRight size={12} className="text-emerald-600" />
                          : <ArrowDownRight size={12} className="text-red-500" />
                      )}
                      {kpi.sub}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Quick Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* Publication Quality */}
        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-mist/60 p-lg">
          <div className="flex items-center gap-sm mb-lg">
            <BarChart3 size={16} className="text-indigo-600" />
            <h3 className="font-heading font-semibold text-sm text-kle-dark">Publication Quality</h3>
          </div>
          <div className="space-y-md">
            {yearData.qualityQuartiles.map((q) => {
              const pct = totalPubs > 0 ? (q.value / totalPubs) * 100 : 0;
              return (
                <div key={q.name}>
                  <div className="flex items-center justify-between mb-xs">
                    <span className="text-xs font-medium text-graphite">{q.name}</span>
                    <span className="text-xs font-mono text-kle-dark">{q.value} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-fog rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: q.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="pt-sm border-t border-mist/50">
              <p className="text-xs text-smoke">
                Q1+Q2 share: <span className="font-mono font-bold text-kle-dark">{q1q2Pct}%</span>
              </p>
            </div>
          </div>
        </motion.div>

        {/* R-Band Overview */}
        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-mist/60 p-lg">
          <div className="flex items-center gap-sm mb-lg">
            <Award size={16} className="text-teal-600" />
            <h3 className="font-heading font-semibold text-sm text-kle-dark">R-Band Distribution</h3>
          </div>
          <div className="space-y-md">
            {rBandDistribution.map((r) => {
              const total = rBandDistribution.reduce((s, b) => s + b.count, 0);
              const pct = total > 0 ? (r.count / total) * 100 : 0;
              return (
                <div key={r.band}>
                  <div className="flex items-center justify-between mb-xs">
                    <div className="flex items-center gap-sm">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
                      <span className="text-xs font-medium text-graphite">{r.band}</span>
                    </div>
                    <span className="text-xs font-mono text-kle-dark">{r.count}</span>
                  </div>
                  <div className="h-2 bg-fog rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: r.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Top 5 Faculty */}
        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-mist/60 p-lg">
          <div className="flex items-center gap-sm mb-lg">
            <BookOpen size={16} className="text-amber-600" />
            <h3 className="font-heading font-semibold text-sm text-kle-dark">Top Faculty by Score</h3>
          </div>
          <div className="space-y-sm">
            {topFaculty.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="flex items-center gap-md py-sm border-b border-mist/30 last:border-0"
              >
                <div className="w-6 h-6 rounded-full bg-fog flex items-center justify-center text-[10px] font-bold text-graphite">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-kle-dark truncate">{f.name}</p>
                  <p className="text-[10px] text-smoke" title={CATEGORY_LABELS[f.category] ? `${CATEGORY_LABELS[f.category]} (${f.category})` : f.category}>
                    {f.category} · {f.band}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono font-bold text-kle-dark">{f.score}</p>
                  <p className="text-[10px] text-smoke">/{f.maxScore}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recent Publications Trend */}
      <motion.div variants={fadeUp} className="bg-white rounded-xl border border-mist/60 p-lg">
        <div className="flex items-center gap-sm mb-lg">
          <TrendingUp size={16} className="text-blue-600" />
          <h3 className="font-heading font-semibold text-sm text-kle-dark">Publications Trend</h3>
          <span className="text-[10px] bg-blue-50 text-blue-700 px-sm py-xs rounded-md font-medium ml-auto">
            Year {selectedYear}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-md">
          {yearData.pubsLastQuarters.map((q, i) => (
            <motion.div
              key={q.quarter}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="text-center p-md bg-fog/40 rounded-lg"
            >
              <p className="text-[10px] text-smoke uppercase font-semibold mb-xs">Q{q.quarter}</p>
              <p className="font-mono text-lg font-bold text-kle-dark">{q.count}</p>
              <p className="text-[10px] text-smoke">publications</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
