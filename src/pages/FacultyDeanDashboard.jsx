import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Award,
  Users,
  BarChart3,
  Download,
  FileText,
} from 'lucide-react';

import KPICard from '../components/KPICard';
import RadarChart from '../components/RadarChart';
import MultiLineChart from '../components/MultiLineChart';
import DataTable from '../components/DataTable';
import AIInsightsPanel from '../components/AIInsightsPanel';
import TargetProgressCard from '../components/TargetProgressCard';

import {
  facultyBoardDepartments,
  radarChartData,
  departmentComparison,
  fdDeptRScoreBands,
  fdDeptScatterData,
  fdDeptCategoryMix,
  fdTargets,
} from '../data/mockData';

/* ─── Tab Definitions ─── */
const TABS = [
  { key: 'overview',  label: 'Overview',   icon: Building2 },
  { key: 'analytics', label: 'Analytics',  icon: BarChart3 },
];

const CATEGORY_LABELS = {
  SRG: 'Sustainable Research Group',
  ERG: 'Established Research Group',
  ERGWS: 'ERG with Supervision',
  ERS: 'Early Research Stage',
  IREF: 'Independent Research Fellow',
  'Pre-IREF': 'Pre-IREF Stage',
  NA: 'Not Assigned',
};

const CATEGORY_COLORS = {
  SRG: '#0F766E',
  ERG: '#3730A3',
  ERGWS: '#B45309',
  ERS: '#B91C1C',
  IREF: '#7C3AED',
  'Pre-IREF': '#0369A1',
  NA: '#6B7280',
};

/* ─── R-Score Heatmap (FIXED – stable data) ─── */
function RScoreHeatmap({ data }) {
  const bands = ['R1', 'R2', 'R3', 'R4'];
  const colors = {
    R1: { bg: 'bg-accent-teal', text: 'text-white' },
    R2: { bg: 'bg-accent-gold', text: 'text-white' },
    R3: { bg: 'bg-amber-500', text: 'text-white' },
    R4: { bg: 'bg-kle-crimson', text: 'text-white' },
  };

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">R-Score Band Distribution</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left py-xs px-md text-label text-smoke font-normal">Department</th>
              {bands.map(b => (
                <th key={b} className="text-center py-xs px-md text-label text-smoke font-normal w-16">{b}</th>
              ))}
              <th className="text-center py-xs px-md text-label text-smoke font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const total = row.R1 + row.R2 + row.R3 + row.R4;
              return (
                <tr key={row.dept} className="border-t border-mist">
                  <td className="py-xs px-md text-body font-medium text-kle-dark">{row.dept}</td>
                  {bands.map(b => (
                    <td key={b} className="py-xs px-md text-center">
                      <div
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-md ${colors[b].bg} ${colors[b].text} font-mono text-sm font-medium`}
                        style={{ opacity: 0.4 + (row[b] / 12) * 0.6 }}
                      >
                        {row[b]}
                      </div>
                    </td>
                  ))}
                  <td className="py-xs px-md text-center font-mono text-kle-dark">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Department Scatter (FIXED – stable data) ─── */
function DepartmentScatter({ data }) {
  const maxPubs = Math.max(...data.map(d => d.totalPubs));
  const bubbleColors = ['#B91C1C', '#0F766E', '#B45309', '#3730A3', '#44403C'];

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-sm">Department Positioning</h3>
      <p className="text-label text-smoke mb-md">Avg Impact Factor vs Avg Citations (bubble = total pubs)</p>

      <div className="relative h-52 border-l border-b border-mist ml-8 mb-6">
        <span className="absolute -left-8 top-1/2 -rotate-90 text-label text-smoke whitespace-nowrap">Avg Citations</span>
        <span className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 text-label text-smoke">Avg Impact Factor</span>

        {data.map((dept, idx) => {
          const x = (dept.avgIF / 5.5) * 100;
          const y = (dept.avgCitations / 400) * 100;
          const size = 20 + (dept.totalPubs / maxPubs) * 36;

          return (
            <div
              key={dept.dept}
              className="absolute rounded-full flex items-center justify-center text-white text-micro font-bold cursor-pointer hover:scale-110 transition-transform"
              style={{
                left: `${x}%`,
                bottom: `${y}%`,
                width: size,
                height: size,
                backgroundColor: bubbleColors[idx % bubbleColors.length],
                transform: 'translate(-50%, 50%)',
              }}
              title={`${dept.dept}: IF ${dept.avgIF}, Cit ${dept.avgCitations}, Pubs ${dept.totalPubs}`}
            >
              {dept.dept.substring(0, 2)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Faculty Category Mix (FIXED – stable data, all 7 categories) ─── */
function CategoryMix({ data }) {
  const categories = Object.keys(CATEGORY_COLORS);

  return (
    <div className="panel">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Faculty Category Mix by Department</h3>
      <div className="space-y-md">
        {data.map((row) => {
          const total = categories.reduce((s, c) => s + (row[c] || 0), 0);
          return (
            <div key={row.dept} className="space-y-xs">
              <div className="flex justify-between text-label">
                <span className="text-graphite font-medium">{row.dept}</span>
                <span className="font-mono text-smoke">{total} faculty</span>
              </div>
              <div className="flex h-4 rounded-md overflow-hidden">
                {categories.map((cat) => (
                  row[cat] > 0 && (
                    <div
                      key={cat}
                      style={{ width: `${(row[cat] / total) * 100}%`, backgroundColor: CATEGORY_COLORS[cat] }}
                      title={`${CATEGORY_LABELS[cat]} (${cat}): ${row[cat]}`}
                    />
                  )
                ))}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex flex-wrap gap-md pt-sm border-t border-mist">
          {categories.map(cat => (
            <div key={cat} className="flex items-center gap-xs">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              <span className="text-micro text-graphite" title={CATEGORY_LABELS[cat]}>{cat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════ */
/*         MAIN EXPORT                */
/* ═══════════════════════════════════ */
export default function FacultyDeanDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDepts, setSelectedDepts] = useState(facultyBoardDepartments.map(d => d.name));

  /* ─── Stable aggregates ─── */
  const totalPubs = 419;
  const bestDept = 'CSE';
  const weakestDept = 'CE';
  const avgHIndex = 11.8;
  const srgCount = 28;
  const citations3Y = 12450;

  const deptTrend = [
    { year: '2021', ECE: 62, CSE: 68, ME: 38, CE: 28, EE: 45 },
    { year: '2022', ECE: 72, CSE: 78, ME: 45, CE: 32, EE: 52 },
    { year: '2023', ECE: 85, CSE: 92, ME: 52, CE: 38, EE: 62 },
    { year: '2024', ECE: 95, CSE: 105, ME: 58, CE: 42, EE: 70 },
    { year: '2025', ECE: 110, CSE: 118, ME: 65, CE: 48, EE: 78 },
  ];

  const facultyInsights = [
    { type: 'warning', title: 'Civil Eng Below Target', message: 'CE dept at 38% Q1+Q2 ratio — lowest across the faculty board. Needs mentoring support.', priority: 'high' },
    { type: 'success', title: 'CSE Exceeding Pace', message: 'CSE publications at 118 with 72% Q1+Q2 — on track to reach 140 by cycle end.', priority: 'medium' },
    { type: 'trend',   title: 'H-Index Rising', message: 'Faculty board avg h-index grew from 10.2 to 11.8 (+16%). 3 depts above national median.', priority: 'medium' },
    { type: 'info',    title: '6 Faculty Near Category Upgrade', message: '4 ERS→IREF and 2 IREF→ERG promotions feasible with 1-2 more Q1 publications.', priority: 'low' },
  ];

  const tabVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.12 } },
  };

  const tableData = useMemo(() =>
    facultyBoardDepartments.map((dept, idx) => ({
      id: idx,
      department: dept.name,
      fullName: dept.fullName,
      publications: departmentComparison[idx]?.['2025'] || 0,
      q1q2Percent: [72, 68, 48, 38, 55][idx],
      avgHIndex: [13.2, 12.8, 10.5, 9.2, 11.4][idx],
      srgCount: [8, 6, 4, 2, 5][idx],
      citations: [3200, 2850, 1890, 1245, 2180][idx],
    })), []
  );

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-md">
        <div>
          <h2 className="font-heading font-semibold text-h1 text-kle-dark">Applied Engineering Faculty</h2>
          <p className="text-label text-smoke">Cross-Department Research Analysis · FY 2025-26</p>
        </div>
        <div className="flex items-center gap-sm">
          <span className="text-label text-smoke">Depts:</span>
          {facultyBoardDepartments.map(dept => (
            <button
              key={dept.name}
              onClick={() => {
                setSelectedDepts(prev =>
                  prev.includes(dept.name)
                    ? prev.filter(d => d !== dept.name)
                    : [...prev, dept.name]
                );
              }}
              className={`px-md py-xs rounded-md text-label transition-colors ${
                selectedDepts.includes(dept.name)
                  ? 'bg-kle-crimson text-white'
                  : 'bg-fog border border-mist text-graphite hover:border-ash'
              }`}
            >
              {dept.name}
            </button>
          ))}
          <button className="btn btn-primary flex items-center gap-xs text-sm py-xs ml-sm">
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

          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === 'overview' && (
            <div className="space-y-lg">
              {/* Target Progress Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
                <TargetProgressCard title="Publications" current={fdTargets.publications.current} target={fdTargets.publications.target} period={fdTargets.publications.period} subtitle="All departments" trend="+15% YoY" />
                <TargetProgressCard title="Q1+Q2 %" current={fdTargets.q1q2Percent.current} target={fdTargets.q1q2Percent.target} unit="%" period={fdTargets.q1q2Percent.period} subtitle="Journal quality" trend="+5% YoY" />
                <TargetProgressCard title="Avg H-Index" current={fdTargets.avgHIndex.current} target={fdTargets.avgHIndex.target} period={fdTargets.avgHIndex.period} subtitle="Faculty board avg" trend="+8% YoY" />
                <TargetProgressCard title="Active Faculty" current={fdTargets.activeFaculty.current} target={fdTargets.activeFaculty.target} period={fdTargets.activeFaculty.period} subtitle="≥1 pub per year" trend="+6% YoY" />
              </div>

              {/* AI Insights */}
              <AIInsightsPanel insights={facultyInsights} role="faculty-dean" />

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-md">
                <KPICard label="Total Publications" value={totalPubs} delta={15} icon={Building2} accentColor="gold" />
                <KPICard label="Best Dept (Q1%)" value={bestDept} deltaLabel="72% Q1+Q2" icon={TrendingUp} accentColor="teal" />
                <KPICard label="Needs Support" value={weakestDept} deltaLabel="38% Q1+Q2" icon={TrendingDown} accentColor="kle-crimson" />
                <KPICard label="Avg H-Index" value={avgHIndex} delta={8} icon={Award} accentColor="indigo" />
                <KPICard label="SRG Faculty" value={srgCount} delta={12} icon={Users} accentColor="teal" />
                <KPICard label="3Y Citations" value={citations3Y} delta={22} icon={BarChart3} accentColor="gold" />
              </div>

              {/* Radar + Dept Comparison side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                <RadarChart
                  data={radarChartData}
                  departments={facultyBoardDepartments.filter(d => selectedDepts.includes(d.name))}
                  title="Department Research Profile"
                  height={340}
                />

                <div className="panel">
                  <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Dept Publication Comparison</h3>
                  <div className="space-y-md">
                    {departmentComparison.map((dept) => (
                      <div key={dept.dept} className="space-y-xs">
                        <div className="flex justify-between text-label">
                          <span className="text-graphite font-medium">{dept.dept}</span>
                          <span className="font-mono text-kle-dark">{dept['2025']}</span>
                        </div>
                        <div className="flex h-5 gap-0.5 rounded-md overflow-hidden">
                          <div className="bg-kle-crimson/40" style={{ width: `${(dept['2023'] / 130) * 100}%` }} title={`2023: ${dept['2023']}`} />
                          <div className="bg-kle-crimson/70" style={{ width: `${((dept['2024'] - dept['2023']) / 130) * 100}%` }} title={`2024: ${dept['2024']}`} />
                          <div className="bg-kle-crimson" style={{ width: `${((dept['2025'] - dept['2024']) / 130) * 100}%` }} title={`2025: ${dept['2025']}`} />
                        </div>
                        <div className="flex gap-md text-micro text-smoke">
                          <span>2023: {dept['2023']}</span>
                          <span>2024: {dept['2024']}</span>
                          <span className="text-kle-crimson font-medium">2025: {dept['2025']}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ ANALYTICS TAB ═══ */}
          {activeTab === 'analytics' && (
            <div className="space-y-lg">
              {/* Trend Lines */}
              <MultiLineChart
                data={deptTrend}
                title="Department Publication Trends (5 Years)"
                xKey="year"
                series={facultyBoardDepartments
                  .filter(d => selectedDepts.includes(d.name))
                  .map(d => ({ key: d.name, name: d.name }))
                }
                colors={{ ECE: '#B91C1C', CSE: '#0F766E', ME: '#B45309', CE: '#3730A3', EE: '#44403C' }}
                showCAGR={true}
                height={260}
              />

              {/* Category Mix + Scatter */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                <CategoryMix data={fdDeptCategoryMix} />
                <DepartmentScatter data={fdDeptScatterData} />
              </div>

              {/* R-Score Heatmap */}
              <RScoreHeatmap data={fdDeptRScoreBands} />

              {/* Summary Table */}
              <DataTable
                data={tableData}
                columns={[
                  { key: 'department', label: 'Dept' },
                  { key: 'fullName', label: 'Full Name' },
                  { key: 'publications', label: 'Publications', type: 'number' },
                  { key: 'q1q2Percent', label: 'Q1+Q2 %', type: 'number' },
                  { key: 'avgHIndex', label: 'Avg H-Index', type: 'number' },
                  { key: 'srgCount', label: 'SRG Count', type: 'number' },
                  { key: 'citations', label: 'Citations', type: 'number' },
                ]}
                title="Department Summary"
                sortable={true}
                exportable={true}
              />
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* Footer */}
      <div className="flex items-center justify-between text-label text-smoke pt-md border-t border-mist">
        <p>Applied Engineering Faculty Board · Dean R&D Office</p>
        <button className="flex items-center gap-xs hover:text-kle-crimson transition-colors">
          <FileText size={13} />
          Export Report
        </button>
      </div>
    </div>
  );
}
