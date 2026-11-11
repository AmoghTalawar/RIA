import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building,
  Users,
  TrendingUp,
  BarChart3,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';

import KPICard from '../components/KPICard';
import DonutChart from '../components/DonutChart';
import MultiLineChart from '../components/MultiLineChart';
import DataTable from '../components/DataTable';
import AIInsightsPanel from '../components/AIInsightsPanel';
import AIChatbot from '../components/AIChatbot';
import SignalsPanel from '../components/SignalsPanel';
import { detectSignals, askFocusFromSignal } from '../lib/signals';
import { fetchAllPublications, fetchAllFaculty, fetchInstituteSummary } from '../lib/supabaseQueries';
import { buildExecutiveDeanData } from '../lib/executiveDeanData';

/* ─── Tab Definitions ─── */
const TABS = [
  { key: 'overview',  label: 'Overview',   icon: Building },
  { key: 'analytics', label: 'Analytics',  icon: BarChart3 },
];



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
          const avgQ = qr && qr.avgQRank ? Math.round(qr.avgQRank) : null;
          const bgColor = qRankColors[avgQ] || '#78716C';

          return (
            <div
              key={fb.shortName}
              className="hover:opacity-90 transition-opacity cursor-pointer flex flex-col items-center justify-center text-white rounded-sm p-xs"
              style={{
                gridColumn: widthPct > 20 ? 'span 2' : 'span 1',
                gridRow: widthPct > 25 ? 'span 2' : 'span 1',
                backgroundColor: bgColor,
              }}
              title={`${fb.name}: ${fb.actual} pubs${avgQ ? `, Avg Q${avgQ}` : ''}`}
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
            : [];
          const total = segs.reduce((s, d) => s + d.value, 0);
          if (!total) return null;

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
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Researcher Activity</h3>
      <div className="space-y-sm">
        {data.map((cat) => (
          <div key={cat.name} className="flex items-center gap-sm">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="text-label text-graphite w-12">{cat.name}</span>
            <div className="flex-1 h-2 bg-mist rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${total ? (cat.value / total) * 100 : 0}%`, backgroundColor: cat.color }} />
            </div>
            <span className="font-mono text-sm text-kle-dark w-10 text-right">{cat.value}</span>
          </div>
        ))}
      </div>
      <p className="text-micro text-smoke mt-sm">{total} faculty, grouped by their total publications</p>
    </div>
  );
}

/* ═══════════════════════════════════ */
/*         MAIN EXPORT                */
/* ═══════════════════════════════════ */
export default function ExecutiveDeanDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  /* Live data: everything on this page is computed from the database. */
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [chartFocus, setChartFocus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllPublications(), fetchAllFaculty(), fetchInstituteSummary()])
      .then(([pubs, faculty, institutes]) => { if (!cancelled) setRows({ pubs, faculty, institutes }); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || String(err)); });
    return () => { cancelled = true; };
  }, []);

  const data = useMemo(() => (rows ? buildExecutiveDeanData(rows) : null), [rows]);
  const signals = useMemo(() => (rows ? detectSignals({ pubs: rows.pubs, faculty: rows.faculty }) : []), [rows]);

  const tabVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.12 } },
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-md">
        <p className="text-kle-crimson font-medium">Failed to load data</p>
        <p className="text-label text-smoke">{loadError}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-md">
        <Loader2 className="w-10 h-10 text-kle-crimson animate-spin" />
        <p className="text-label text-smoke">Loading research data…</p>
      </div>
    );
  }

  const {
    kpis, facultyBoards, facultyBoardQRanks, tableRows, citationTrend, citationSeries, citationColors,
    avgHIndex, growth, citationCard, researcherActivity, insights, latestYear,
  } = data;

  return (
    <div className="space-y-lg">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-semibold text-h1 text-kle-dark">University Research Overview</h2>
            <p className="text-label text-smoke">Strategic Operations View{latestYear ? ` · Complete data through ${latestYear}` : ''}</p>
          </div>
          <div className="flex items-center gap-sm">
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
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
                  <KPICard label="Publications" value={kpis.publications.value} delta={kpis.publications.delta} deltaLabel={`in ${latestYear} vs ${latestYear - 1}`} icon={Building} accentColor="gold" />
                  <KPICard label="Scopus Citations" value={kpis.citations.value} icon={TrendingUp} accentColor="teal" />
                  <KPICard label="Q1 Publications" value={kpis.q1Percent.value} unit="%" icon={BarChart3} accentColor="indigo" />
                  <KPICard label="Active Researchers" value={kpis.activeResearchers.value} unit={`of ${kpis.activeResearchers.of}`} icon={Users} accentColor="teal" />
                </div>

                <SignalsPanel signals={signals} onAsk={(sig) => setChartFocus(askFocusFromSignal(sig))} />

                {/* AI Insights */}
                <AIInsightsPanel insights={insights} role="executive-dean" />

                {/* Visualizations Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg">
                  {/* Faculty Board Publications */}
                  <div className="lg:col-span-5">
                    <div className="panel">
                      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Faculty Board Publications</h3>
                      <div className="space-y-md">
                        {(() => {
                          const maxActual = Math.max(...facultyBoards.map(fb => fb.actual), 1);
                          return facultyBoards.map((fb) => {
                            const barWidth = (fb.actual / maxActual) * 100;
                            return (
                              <div key={fb.shortName} className="space-y-xs">
                                <div className="flex justify-between text-label">
                                  <span className="text-graphite font-medium">{fb.name}</span>
                                  <span className="font-mono text-kle-dark font-semibold">{fb.actual}</span>
                                </div>
                                <div className="h-2 bg-mist rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-kle-crimson rounded-full transition-all"
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Right: Campus Citations + Category */}
                  <div className="lg:col-span-7 space-y-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                      <div className="panel flex flex-col justify-between">
                        <div>
                          <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">University Citations</h3>
                          <div className="text-center py-md">
                            <span className="font-mono text-5xl font-bold text-kle-dark block">
                              {citationCard.total.toLocaleString('en-IN')}
                            </span>
                            <span className="text-label text-smoke mt-xs block">Scopus Citations</span>
                          </div>
                        </div>
                        {citationCard.latestYear && citationCard.prevYear && (
                          <div className="border-t border-mist pt-md mt-sm flex items-center justify-between">
                            <div>
                              <span className="text-micro text-smoke block">Papers in {citationCard.prevYear}</span>
                              <span className="font-mono text-lg font-semibold text-graphite">
                                {citationCard.prevPubs.toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-micro text-smoke block">Papers in {citationCard.latestYear}</span>
                              <span className="font-mono text-lg font-semibold text-graphite flex items-center gap-xs justify-end">
                                {citationCard.latestPubs.toLocaleString('en-IN')}
                                {citationCard.pubGrowthPct !== null && (
                                  <span className={`text-label font-medium ${citationCard.pubGrowthPct >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {citationCard.pubGrowthPct >= 0 ? '+' : ''}{citationCard.pubGrowthPct}%
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <CategoryBreakdown data={researcherActivity} />
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
                    title="Citations on Papers Published Each Year, by Faculty Board"
                    xKey="year"
                    series={citationSeries}
                    colors={citationColors}
                    height={240}
                  />
                </div>

                {/* H-Index + Pub vs Citation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                  <div className="panel">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Avg H-Index by Faculty</h3>
                    <div className="space-y-sm">
                      {avgHIndex.map((item) => (
                        <div key={item.name} className="flex items-center gap-sm">
                          <span className="text-label text-graphite w-24 truncate" title={item.name}>{item.name}</span>
                          <div className="flex-1 h-3 bg-mist rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-indigo rounded-full"
                              style={{ width: `${(item.value / Math.max(...avgHIndex.map((h) => h.value))) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm text-kle-dark w-10 text-right">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel">
                    <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Papers vs Citations on Those Papers</h3>
                    <div className="flex items-end justify-between h-40 gap-md">
                      {(() => {
                        const maxPubs = Math.max(...growth.map((g) => g.pubs), 1);
                        const maxCites = Math.max(...growth.map((g) => g.cites), 1);
                        return growth.map(({ year, pubs, cites }) => (
                          <div key={year} className="flex-1 flex flex-col items-center gap-xs">
                            <div className="w-full flex gap-0.5 h-32">
                              <div
                                className="flex-1 bg-kle-crimson rounded-t-sm"
                                style={{ height: `${(pubs / maxPubs) * 100}%`, marginTop: 'auto' }}
                                title={`Papers: ${pubs.toLocaleString('en-IN')}`}
                              />
                              <div
                                className="flex-1 bg-accent-teal rounded-t-sm"
                                style={{ height: `${(cites / maxCites) * 100}%`, marginTop: 'auto' }}
                                title={`Citations on papers from this year: ${cites.toLocaleString('en-IN')}`}
                              />
                            </div>
                            <span className="text-label text-smoke">{year}</span>
                          </div>
                        ));
                      })()}
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
                    <p className="text-micro text-smoke mt-sm text-center">Newer papers have had less time to be cited, so recent years read low.</p>
                  </div>
                </div>

                {/* Performance Table */}
                <DataTable
                  data={tableRows}
                  columns={[
                    { key: 'facultyBoard', label: 'Faculty Board' },
                    { key: 'actual', label: 'Publications', type: 'number' },
                    { key: 'q1Count', label: 'Q1 Count', type: 'number' },
                    { key: 'q1Ratio', label: 'Q1 Ratio' },
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
          <p>Executive Dean R&D Office · KLE Technological University</p>
          <button className="flex items-center gap-xs hover:text-kle-crimson transition-colors">
            <FileText size={13} />
            Export Report
          </button>
        </div>

        <AIChatbot chartFocus={chartFocus} onChartFocusHandled={() => setChartFocus(null)} />
      </div>
  );
}
