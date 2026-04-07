import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building,
  Target,
  Users,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
} from 'lucide-react';

import StatGauge from '../components/StatGauge';
import DonutChart from '../components/DonutChart';
import MultiLineChart from '../components/MultiLineChart';
import DataTable from '../components/DataTable';
import AIInsightsPanel from '../components/AIInsightsPanel';
import TargetProgressCard from '../components/TargetProgressCard';

import {
  facultyBoards,
  campusCitationTarget,
  qRankDistribution,
  facultyBoardQRanks,
  execDeanTargets,
  campusCategoryDist,
} from '../data/mockData';

/* ─── Tab Definitions ─── */
const TABS = [
  { key: 'overview',  label: 'Overview',   icon: Building },
  { key: 'analytics', label: 'Analytics',  icon: BarChart3 },
];

/* ─── Status Bar ─── */
function StatusBar({ facultyBoards: fbs }) {
  const getZoneColor = (pct) => {
    if (pct < 60) return 'bg-kle-crimson';
    if (pct < 80) return 'bg-accent-gold';
    return 'bg-accent-teal';
  };

  return (
    <div className="bg-white border-b border-mist px-xl py-sm">
      <div className="flex items-center gap-md overflow-x-auto">
        {fbs.map((fb) => {
          const pct = (fb.actual / fb.target) * 100;
          return (
            <div key={fb.shortName} className="flex-shrink-0 min-w-[110px]">
              <div className="flex items-center justify-between mb-xs">
                <span className="text-micro text-graphite font-medium">{fb.shortName}</span>
                <span className="font-mono text-micro text-kle-dark">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-mist rounded-full overflow-hidden">
                <div
                  className={`h-full ${getZoneColor(pct)} rounded-full transition-all`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Treemap (FIXED – stable colors from data) ─── */
function Treemap({ data, qRanks }) {
  const total = data.reduce((sum, fb) => sum + fb.actual, 0);

  const qRankColors = { 1: '#0F766E', 2: '#3730A3', 3: '#B45309', 4: '#B91C1C' };

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-sm">Research Footprint</h3>
      <p className="text-label text-smoke mb-md">Area = Publication count · Color = Avg Q-rank band</p>

      <div className="grid grid-cols-4 gap-1 h-52">
        {data.map((fb) => {
          const widthPct = (fb.actual / total) * 100;
          const qr = qRanks.find(q => q.shortName === fb.shortName);
          const avgQ = qr ? Math.round(qr.avgQRank) : 2;
          const bgColor = qRankColors[avgQ] || '#3730A3';

          return (
            <div
              key={fb.shortName}
              className="hover:opacity-90 transition-opacity cursor-pointer flex flex-col items-center justify-center text-white rounded-sm p-xs"
              style={{
                gridColumn: widthPct > 20 ? 'span 2' : 'span 1',
                gridRow: widthPct > 25 ? 'span 2' : 'span 1',
                backgroundColor: bgColor,
              }}
              title={`${fb.name}: ${fb.actual} pubs, Avg Q${avgQ}`}
            >
              <span className="font-heading font-semibold text-sm">{fb.shortName}</span>
              <span className="font-mono text-lg font-bold">{fb.actual}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-lg mt-md">
        {Object.entries(qRankColors).map(([q, c]) => (
          <div key={q} className="flex items-center gap-xs">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
            <span className="text-micro text-graphite">Q{q}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Donut Array (FIXED – stable data from qRanks) ─── */
function DonutArray({ facultyBoards: fbs, qRanks }) {
  const donutColors = ['#0F766E', '#3730A3', '#B45309', '#B91C1C'];

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Q-Rank by Faculty Board</h3>

      <div className="flex flex-wrap justify-center gap-lg">
        {fbs.slice(0, 5).map((fb) => {
          const qr = qRanks.find(q => q.shortName === fb.shortName);
          const segs = qr
            ? [
                { name: 'Q1', value: qr.Q1 },
                { name: 'Q2', value: qr.Q2 },
                { name: 'Q3', value: qr.Q3 },
                { name: 'Q4', value: qr.Q4 },
              ]
            : [{ name: 'Q1', value: 1 }];
          const total = segs.reduce((s, d) => s + d.value, 0);

          return (
            <div key={fb.shortName} className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-xs">
                <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
                  {segs.map((seg, idx) => {
                    const prev = segs.slice(0, idx).reduce((s, d) => s + d.value, 0);
                    return (
                      <circle key={seg.name} cx="16" cy="16" r="12" fill="none"
                        stroke={donutColors[idx]} strokeWidth="6"
                        strokeDasharray={`${(seg.value / total) * 100} ${100 - (seg.value / total) * 100}`}
                        strokeDashoffset={-(prev / total) * 100}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-sm font-bold text-kle-dark">{total}</span>
                </div>
              </div>
              <span className="text-label text-graphite font-medium">{fb.shortName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Category Distribution Mini ─── */
function CategoryBreakdown({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Researcher Categories</h3>
      <div className="space-y-sm">
        {data.map((cat) => (
          <div key={cat.name} className="flex items-center gap-sm">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="text-label text-graphite w-16">{cat.name}</span>
            <div className="flex-1 h-2 bg-mist rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(cat.value / total) * 100}%`, backgroundColor: cat.color }} />
            </div>
            <span className="font-mono text-sm text-kle-dark w-6 text-right">{cat.value}</span>
          </div>
        ))}
      </div>
      <p className="text-micro text-smoke mt-sm">{total} total faculty categorised</p>
    </div>
  );
}

/* ═══════════════════════════════════ */
/*         MAIN EXPORT                */
/* ═══════════════════════════════════ */
export default function ExecutiveDeanDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedYear, setSelectedYear] = useState('2025');

  const criticalFBs = useMemo(
    () => facultyBoards.filter(fb => (fb.actual / fb.target) * 100 < 60),
    []
  );

  const citationTrend = [
    { year: '2023', ApplEng: 5200, EE: 3800, CompEng: 4500, CommMgmt: 1200, SciTech: 2100 },
    { year: '2024', ApplEng: 5800, EE: 4200, CompEng: 5100, CommMgmt: 1400, SciTech: 2400 },
    { year: '2025', ApplEng: 6400, EE: 4700, CompEng: 5800, CommMgmt: 1650, SciTech: 2750 },
  ];

  const campusInsights = [
    { type: 'warning', title: 'Comm & Mgmt Below Target', message: 'Faculty board at 71% of publication target. 3 departments have <50% completion.', priority: 'high' },
    { type: 'success', title: 'CompEng Near Target', message: 'Computer Engineering at 97% — on pace to exceed target by cycle end.', priority: 'medium' },
    { type: 'trend',   title: 'Citation Growth +21%', message: 'Campus Scopus citations grew 21% YoY. Active researcher ratio nearing 80% threshold.', priority: 'medium' },
    { type: 'info',    title: 'Q1 Ratio Improvement', message: 'Q1 publications up from 30% to 34%. Target 40% by next cycle.', priority: 'low' },
  ];

  const tabVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.12 } },
  };

  /* Stable table data */
  const tableData = useMemo(() =>
    facultyBoards.map((fb, idx) => {
      const qr = facultyBoardQRanks.find(q => q.shortName === fb.shortName);
      return {
        id: idx,
        facultyBoard: fb.name,
        shortName: fb.shortName,
        target: fb.target,
        actual: fb.actual,
        delta: ((fb.actual - fb.target) / fb.target * 100).toFixed(1) + '%',
        status: (fb.actual / fb.target) >= 0.8 ? 'On Track' : (fb.actual / fb.target) >= 0.6 ? 'At Risk' : 'Critical',
        q1Count: qr ? qr.Q1 : Math.floor(fb.actual * 0.35),
        avgIF: qr ? qr.avgIF : 0,
      };
    }), []
  );

  return (
    <div className="space-y-lg -mt-xl -mx-xl">
      {/* Status Bar */}
      <StatusBar facultyBoards={facultyBoards} />

      <div className="px-xl space-y-lg">
        {/* Alert */}
        {criticalFBs.length > 0 && (
          <div className="alert-banner rounded-md">
            <div className="flex items-center gap-md">
              <AlertTriangle size={18} />
              <span>
                <strong>{criticalFBs.length} Faculty Board(s)</strong> below 60% of publication target
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-semibold text-h1 text-kle-dark">BVB Campus Overview</h2>
            <p className="text-label text-smoke">Strategic Operations View · Cycle {selectedYear}</p>
          </div>
          <div className="flex items-center gap-sm">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-md py-xs bg-fog border border-mist rounded-md text-body text-sm"
            >
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
            <button className="btn btn-primary flex items-center gap-xs text-sm py-xs">
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        {/* Tab Nav */}
        <div className="flex items-center gap-sm border-b border-mist pb-0 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-xs px-lg py-sm text-label whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-kle-crimson text-kle-crimson font-semibold'
                  : 'border-transparent text-smoke hover:text-graphite hover:border-ash'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={tabVariants} initial="initial" animate="animate" exit="exit">

            {/* ═══ OVERVIEW ═══ */}
            {activeTab === 'overview' && (
              <div className="space-y-lg">
                {/* Target Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
                  <TargetProgressCard title="Publications" current={execDeanTargets.publications.current} target={execDeanTargets.publications.target} period={execDeanTargets.publications.period} subtitle="All faculty boards" trend="+14% YoY" />
                  <TargetProgressCard title="Citations" current={execDeanTargets.citations.current} target={execDeanTargets.citations.target} period={execDeanTargets.citations.period} subtitle="Scopus cumulative" trend="+21% YoY" />
                  <TargetProgressCard title="Q1 Publications %" current={execDeanTargets.q1Percent.current} target={execDeanTargets.q1Percent.target} unit="%" period={execDeanTargets.q1Percent.period} subtitle="Top-quartile share" trend="+4% YoY" />
                  <TargetProgressCard title="Active Researchers" current={execDeanTargets.activeResearchers.current} target={execDeanTargets.activeResearchers.target} period={execDeanTargets.activeResearchers.period} subtitle="≥1 pub faculty" trend="+6% YoY" />
                </div>

                {/* AI Insights */}
                <AIInsightsPanel insights={campusInsights} role="executive-dean" />

                {/* Gauges + Category side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg">
                  {/* Gauge Grid */}
                  <div className="lg:col-span-5">
                    <div className="panel">
                      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Faculty Board Progress</h3>
                      <div className="grid grid-cols-2 gap-md">
                        {facultyBoards.slice(0, 6).map((fb) => (
                          <StatGauge
                            key={fb.shortName}
                            actual={fb.actual}
                            target={fb.target}
                            label={fb.shortName}
                            size="sm"
                            showLegend={false}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Campus Citations + Category */}
                  <div className="lg:col-span-7 space-y-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                      <div className="panel">
                        <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Campus Citations</h3>
                        <StatGauge
                          actual={campusCitationTarget.actual}
                          target={campusCitationTarget.target}
                          label="Scopus Citations"
                          size="md"
                        />
                        <p className="text-label text-smoke text-center mt-sm">
                          +{((campusCitationTarget.actual - campusCitationTarget.previousYear) / campusCitationTarget.previousYear * 100).toFixed(0)}% vs last year
                        </p>
                      </div>

                      <CategoryBreakdown data={campusCategoryDist} />
                    </div>

                    {/* Donut Array */}
                    <DonutArray facultyBoards={facultyBoards} qRanks={facultyBoardQRanks} />
                  </div>
                </div>
              </div>
            )}

            {/* ═══ ANALYTICS ═══ */}
            {activeTab === 'analytics' && (
              <div className="space-y-lg">
                {/* Treemap + Citation Trend */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                  <Treemap data={facultyBoards} qRanks={facultyBoardQRanks} />

                  <MultiLineChart
                    data={citationTrend}
                    title="Citation Trends by Faculty Board"
                    xKey="year"
                    series={[
                      { key: 'ApplEng', name: 'Applied Eng' },
                      { key: 'EE', name: 'Electrical' },
                      { key: 'CompEng', name: 'Computer Eng' },
                      { key: 'CommMgmt', name: 'Comm & Mgmt' },
                      { key: 'SciTech', name: 'Sci & Tech' },
                    ]}
                    colors={{
                      ApplEng: '#B91C1C',
                      EE: '#0F766E',
                      CompEng: '#3730A3',
                      CommMgmt: '#B45309',
                      SciTech: '#44403C',
                    }}
                    height={240}
                  />
                </div>

                {/* H-Index + Pub vs Citation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                  <div className="panel">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Avg H-Index by Faculty</h3>
                    <div className="space-y-sm">
                      {[
                        { name: 'Computer Eng', value: 14.2 },
                        { name: 'Applied Eng', value: 12.8 },
                        { name: 'Electrical', value: 11.5 },
                        { name: 'Sci & Tech', value: 9.8 },
                        { name: 'Comm & Mgmt', value: 7.2 },
                      ].map((item) => (
                        <div key={item.name} className="flex items-center gap-sm">
                          <span className="text-label text-graphite w-24 truncate">{item.name}</span>
                          <div className="flex-1 h-3 bg-mist rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-indigo rounded-full"
                              style={{ width: `${(item.value / 16) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm text-kle-dark w-8 text-right">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Publication vs Citation Growth</h3>
                    <div className="flex items-end justify-between h-40 gap-md">
                      {['2023', '2024', '2025'].map((year, idx) => {
                        const pubs = [680, 785, 845][idx];
                        const cits = [18200, 22400, 25600][idx];
                        return (
                          <div key={year} className="flex-1 flex flex-col items-center gap-xs">
                            <div className="w-full flex gap-0.5 h-32">
                              <div
                                className="flex-1 bg-kle-crimson rounded-t-sm"
                                style={{ height: `${(pubs / 900) * 100}%`, marginTop: 'auto' }}
                                title={`Pubs: ${pubs}`}
                              />
                              <div
                                className="flex-1 bg-accent-teal rounded-t-sm"
                                style={{ height: `${(cits / 30000) * 100}%`, marginTop: 'auto' }}
                                title={`Citations: ${cits}`}
                              />
                            </div>
                            <span className="text-label text-smoke">{year}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-center gap-md mt-sm">
                      <div className="flex items-center gap-xs">
                        <div className="w-2.5 h-2.5 bg-kle-crimson rounded-sm" />
                        <span className="text-micro text-graphite">Publications</span>
                      </div>
                      <div className="flex items-center gap-xs">
                        <div className="w-2.5 h-2.5 bg-accent-teal rounded-sm" />
                        <span className="text-micro text-graphite">Citations</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance Table */}
                <DataTable
                  data={tableData}
                  columns={[
                    { key: 'facultyBoard', label: 'Faculty Board' },
                    { key: 'target', label: 'Target', type: 'number' },
                    { key: 'actual', label: 'Actual', type: 'number' },
                    { key: 'delta', label: 'Δ%' },
                    { key: 'status', label: 'Status' },
                    { key: 'q1Count', label: 'Q1 Count', type: 'number' },
                    { key: 'avgIF', label: 'Avg IF', type: 'number' },
                  ]}
                  title="Faculty Board Performance Summary"
                  sortable={true}
                  exportable={true}
                />
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-between text-label text-smoke pt-md border-t border-mist">
          <p>BVB Campus · Dean R&D Office · KLE Technological University</p>
          <button className="flex items-center gap-xs hover:text-kle-crimson transition-colors">
            <FileText size={13} />
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
}
