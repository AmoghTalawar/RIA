import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Target,
  TrendingUp,
  Award,
  AlertTriangle,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';

import SemiCircleGauge from '../components/SemiCircleGauge';
import NestedDonutChart from '../components/NestedDonutChart';
import SimpleBarChart from '../components/SimpleBarChart';
import CategoryScoreBand from '../components/CategoryScoreBand';
import DataTable from '../components/DataTable';

import {
  deptResearchOutcomes,
  deptAvgHIndex,
  deptQualityQuartiles,
  deptPubsLastQuarters,
  deptPubsLastYears,
  deptFacultyData,
  deptPerformanceData,
  deptScoreBands,
  deptCategoryScoreBands,
  deptFacultyList,
  rBandDistribution,
} from '../data/mockData';

// ─── Helpers ─────────────────────────────────────────
const CATEGORY_COLORS = {
  SRG: '#B91C1C',
  ERG: '#D97706',
  ERGWS: '#A3A300',
  ERS: '#0F766E',
  IREF: '#3730A3',
  'Pre-IREF': '#78716C',
  NA: '#A8A29E',
};

const BAND_COLORS = { R1: '#0F766E', R2: '#3730A3', R3: '#D97706', R4: '#B91C1C' };

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

// ─── Sub-components ──────────────────────────────────

function SectionHeader({ title, subtitle, icon: Icon }) {
  return (
    <div className="flex items-center gap-md mb-lg">
      {Icon && (
        <div className="w-9 h-9 rounded-lg bg-kle-crimson/10 flex items-center justify-center">
          <Icon size={18} className="text-kle-crimson" />
        </div>
      )}
      <div>
        <h3 className="font-heading font-semibold text-h2 text-kle-dark">{title}</h3>
        {subtitle && <p className="text-label text-smoke">{subtitle}</p>}
      </div>
    </div>
  );
}

// Citation Gauge — reuses SemiCircleGauge with status annotation
function CitationGaugeCard({ target, current, status }) {
  const pct = target > 0 ? ((current / target) * 100).toFixed(0) : 0;
  const statusColor =
    status === 'Poor' ? '#B91C1C'
    : status === 'Average' ? '#D97706'
    : status === 'Good' ? '#0F766E'
    : '#15803D';

  return (
    <div className="panel h-full flex flex-col items-center">
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md w-full">
        Citations: Target- {target}, {pct}% Status
      </h3>
      <SemiCircleGauge actual={current} target={target} size={210} />
      <div
        className="mt-sm px-md py-xs rounded-md text-xs font-semibold"
        style={{ backgroundColor: statusColor + '15', color: statusColor }}
      >
        {status} — {pct}% of target
      </div>
    </div>
  );
}

// Faculty count per category in a compact table-like display
function FacultyByCycleCard({ cycleData, cycleKey }) {
  const d = cycleData[cycleKey];
  return (
    <div className="panel h-full">
      <h4 className="font-heading font-medium text-sm text-kle-dark mb-sm">{d.label}</h4>
      <p className="text-label text-smoke mb-md">Total Faculty: <span className="font-mono font-bold text-kle-dark">{d.totalFaculty}</span></p>
      <div className="space-y-xs">
        {d.categories.map((c) => (
          <div key={c.name} className="flex items-center justify-between py-xs">
            <div className="flex items-center gap-sm">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
              <span className="text-label text-graphite">{c.name}</span>
            </div>
            <span className="font-mono font-medium text-kle-dark">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Avg score comparison (Univ vs Dept) per cycle
function PerformanceByCycleCard({ perfData, cycleKey }) {
  const d = perfData[cycleKey];
  return (
    <div className="panel h-full">
      <h4 className="font-heading font-medium text-sm text-kle-dark mb-sm">{d.label}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-mist">
              <th className="py-sm pr-md text-micro text-smoke uppercase tracking-wider">Category</th>
              <th className="py-sm pr-md text-micro text-smoke uppercase tracking-wider text-right">Univ Avg</th>
              <th className="py-sm text-micro text-smoke uppercase tracking-wider text-right">Dept Avg</th>
              <th className="py-sm text-micro text-smoke uppercase tracking-wider text-right">Delta</th>
            </tr>
          </thead>
          <tbody>
            {d.university.map((u, i) => {
              const deptVal = d.department[i]?.avgScore || 0;
              const delta = deptVal - u.avgScore;
              return (
                <tr key={u.category} className="border-b border-mist/50">
                  <td className="py-xs pr-md">
                    <div className="flex items-center gap-xs">
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[u.category] || '#78716C' }} />
                      <span className="text-graphite" title={CATEGORY_LABELS[u.category] ? `${CATEGORY_LABELS[u.category]} (${u.category})` : u.category}>{u.category}</span>
                    </div>
                  </td>
                  <td className="py-xs pr-md text-right font-mono text-kle-dark">{u.avgScore}</td>
                  <td className="py-xs text-right font-mono text-kle-dark">{deptVal}</td>
                  <td className="py-xs text-right">
                    <span className={`flex items-center justify-end gap-xs font-mono text-xs ${delta >= 0 ? 'text-success' : 'text-kle-crimson'}`}>
                      {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {delta >= 0 ? '+' : ''}{delta}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────

export default function HodDashboard() {
  const [selectedCycle, setSelectedCycle] = useState('current');
  const r4Count = rBandDistribution.find((r) => r.band === 'R4')?.count || 0;

  const cycles = [
    { key: 'current', label: 'Current (2025-26)' },
    { key: 'cycle1', label: 'Cycle 2024-25' },
    { key: 'cycle2', label: 'Cycle 2023-24' },
  ];

  // Quick KPIs
  const kpis = [
    { label: 'Total Faculty', value: deptFacultyData.current.totalFaculty, icon: Users, accent: 'kle-crimson' },
    { label: 'Publications', value: `${deptResearchOutcomes.publications.current} / ${deptResearchOutcomes.publications.target}`, icon: FileText, accent: 'accent-indigo' },
    { label: 'Patents Filed', value: deptResearchOutcomes.patents.filed, sub: `Granted: ${deptResearchOutcomes.patents.granted}`, icon: Award, accent: 'accent-gold' },
    { label: 'Citations', value: deptResearchOutcomes.citations.current, sub: `Target: ${deptResearchOutcomes.citations.target}`, icon: TrendingUp, accent: 'accent-teal' },
  ];

  return (
    <div className="space-y-xl">
      {/* Alert Banner */}
      {r4Count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="alert-banner rounded-md"
        >
          <div className="flex items-center gap-md">
            <AlertTriangle size={20} />
            <span>
              <strong>{r4Count} faculty</strong> below research performance threshold (R4 band)
            </span>
          </div>
          <button className="text-white underline hover:no-underline">View list →</button>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-md">
        <div>
          <h2 className="font-heading font-semibold text-h1 text-kle-dark">
            Dashboard for Department: CSE
          </h2>
          <p className="text-label text-smoke">BVB Campus · Academic Year 2025-26 · Current Year 2023</p>
        </div>
        {/* Cycle selector */}
        <div className="flex items-center gap-sm">
          <Filter size={16} className="text-smoke" />
          {cycles.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelectedCycle(c.key)}
              className={`px-md py-xs rounded-md text-sm font-medium transition-all ${
                selectedCycle === c.key
                  ? 'bg-kle-crimson text-white'
                  : 'bg-fog border border-mist text-graphite hover:border-ash'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="panel relative overflow-hidden"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-${kpi.accent}`} />
              <div className="flex items-start gap-md">
                <div className={`w-10 h-10 rounded-lg bg-${kpi.accent}/10 flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={`text-${kpi.accent}`} />
                </div>
                <div>
                  <p className="text-micro uppercase tracking-wider text-smoke">{kpi.label}</p>
                  <p className="font-mono text-xl font-bold text-kle-dark">{kpi.value}</p>
                  {kpi.sub && <p className="text-label text-smoke mt-xs">{kpi.sub}</p>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 1: Research Outcomes
          ═══════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Research Outcomes" subtitle="Current year 2023" icon={Target} />

        {/* Row 1: Gauges + h-Index */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-xl mb-xl">
          {/* Publications Gauge */}
          <div className="panel h-full flex flex-col items-center">
            <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md w-full">
              Publications: Target - {deptResearchOutcomes.publications.target}, Current:{deptResearchOutcomes.publications.current}
            </h3>
            <SemiCircleGauge
              actual={deptResearchOutcomes.publications.current}
              target={deptResearchOutcomes.publications.target}
              size={210}
            />
            <div className="mt-sm flex items-center gap-md text-xs text-smoke">
              <span>Patents: Filed-{deptResearchOutcomes.patents.filed}, Granted-{deptResearchOutcomes.patents.granted}</span>
            </div>
          </div>

          {/* Avg h-Index donut */}
          <NestedDonutChart
            data={deptAvgHIndex}
            title="Avg h-Index (Scopus)"
            size={210}
          />

          {/* Citations gauge */}
          <CitationGaugeCard
            target={deptResearchOutcomes.citations.target}
            current={deptResearchOutcomes.citations.current}
            status={deptResearchOutcomes.citations.status}
          />
        </div>

        {/* Row 2: Quality of Pubs + Pubs in quarters + Pubs last 3 years */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-xl">
          {/* Quality of Publications by Quartiles (donut) */}
          <div className="panel h-full">
            <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Quality of Publications as per Quartiles</h3>
            <div style={{ height: 200 }} className="relative">
              <div className="w-full h-full flex items-center justify-center">
                <div className="relative" style={{ width: 160, height: 160 }}>
                  <svg width={160} height={160} viewBox="0 0 160 160">
                    {(() => {
                      const total = deptQualityQuartiles.reduce((s, q) => s + q.value, 0);
                      let cumAngle = -90;
                      return deptQualityQuartiles.map((q) => {
                        const angle = (q.value / total) * 360;
                        const startAngle = cumAngle;
                        cumAngle += angle;
                        const endAngle = cumAngle;
                        const startRad = (startAngle * Math.PI) / 180;
                        const endRad = (endAngle * Math.PI) / 180;
                        const cx = 80, cy = 80, r = 60;
                        const x1 = cx + r * Math.cos(startRad);
                        const y1 = cy + r * Math.sin(startRad);
                        const x2 = cx + r * Math.cos(endRad);
                        const y2 = cy + r * Math.sin(endRad);
                        const largeArc = angle > 180 ? 1 : 0;
                        const ir = 35;
                        const ix1 = cx + ir * Math.cos(endRad);
                        const iy1 = cy + ir * Math.sin(endRad);
                        const ix2 = cx + ir * Math.cos(startRad);
                        const iy2 = cy + ir * Math.sin(startRad);
                        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
                        const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
                        const labelR = (r + ir) / 2;
                        const lx = cx + labelR * Math.cos(midAngle);
                        const ly = cy + labelR * Math.sin(midAngle);
                        return (
                          <g key={q.name}>
                            <path d={d} fill={q.color} stroke="white" strokeWidth={2} />
                            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={12} fontWeight={700}>
                              {q.value}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-md mt-sm">
              {deptQualityQuartiles.map((q) => (
                <div key={q.name} className="flex items-center gap-xs">
                  <div className="w-2.5 h-2.5" style={{ backgroundColor: q.color }} />
                  <span className="text-label text-graphite">{q.name}: {q.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pubs in last 4 quartiles */}
          <SimpleBarChart
            data={deptPubsLastQuarters}
            xKey="quarter"
            yKey="count"
            title="Publications in last four quartiles, current"
            height={220}
            barColor="#3B82F6"
          />

          {/* Pubs in last 3 years */}
          <SimpleBarChart
            data={deptPubsLastYears}
            xKey="year"
            yKey="count"
            title="Number of Publications in last 3 years"
            height={220}
            barColor="#3B82F6"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 2: Faculty Data (present + last 2 cycles)
          ═══════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Faculty Data" subtitle="Present and last 2 cycles — Total faculty & category breakdown" icon={Users} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-xl">
          <FacultyByCycleCard cycleData={deptFacultyData} cycleKey="current" />
          <FacultyByCycleCard cycleData={deptFacultyData} cycleKey="cycle1" />
          <FacultyByCycleCard cycleData={deptFacultyData} cycleKey="cycle2" />
        </div>

        {/* Category Legend */}
        <div className="mt-lg p-md bg-fog rounded-md">
          <p className="text-micro text-smoke uppercase tracking-wider font-semibold mb-sm">Category Definitions</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-start gap-xs">
                <div className="w-2.5 h-2.5 rounded-sm mt-1 flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[key] || '#78716C' }} />
                <span className="text-xs text-graphite"><strong>{key}:</strong> {label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 3: Performance Data (present + last 2 cycles)
          ═══════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Performance Data" subtitle="Avg Score by category — University level vs Department" icon={TrendingUp} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-xl">
          <PerformanceByCycleCard perfData={deptPerformanceData} cycleKey="current" />
          <PerformanceByCycleCard perfData={deptPerformanceData} cycleKey="cycle1" />
          <PerformanceByCycleCard perfData={deptPerformanceData} cycleKey="cycle2" />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 4: Research Scores — R-Band Distribution
          ═══════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Department Research Scores" subtitle="Faculty in the score range — R1(81-100), R2(61-80), R3(41-60), R4(<40)" icon={Award} />

        <SimpleBarChart
          data={deptScoreBands.overall.data}
          xKey="band"
          yKey="count"
          title={`${deptScoreBands.overall.label} — Faculty in Score Range`}
          subtitle="% can also be displayed"
          height={280}
          colors={deptScoreBands.overall.data.map((d) => d.color)}
        />
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 5: Faculty Category & Score Breakdown
          ═══════════════════════════════════════════════ */}
      <CategoryScoreBand categories={deptCategoryScoreBands} />

      {/* ═══════════════════════════════════════════════
          SECTION 6: Comparison Table
          ═══════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="Department Comparison" subtitle="Number of Faculty in different categories, Score comparisons, and from previous instances" icon={Target} />

        <div className="panel mb-lg">
          <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">Score Comparison across Categories & Bands</h3>
          <p className="text-label text-smoke mb-lg">Comparison of scores in different faculty categories (SRG, ERG etc.) and bands (R1, R2 etc.)</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-mist">
                  <th className="py-sm pr-lg text-micro text-smoke uppercase tracking-wider">Category</th>
                  <th className="py-sm pr-md text-micro text-smoke uppercase tracking-wider text-center">Total</th>
                  <th className="py-sm pr-md text-micro text-smoke uppercase tracking-wider text-center">R1</th>
                  <th className="py-sm pr-md text-micro text-smoke uppercase tracking-wider text-center">R2</th>
                  <th className="py-sm pr-md text-micro text-smoke uppercase tracking-wider text-center">R3</th>
                  <th className="py-sm text-micro text-smoke uppercase tracking-wider text-center">R4</th>
                </tr>
              </thead>
              <tbody>
                {deptCategoryScoreBands.map((cat) => (
                  <tr key={cat.category} className="border-b border-mist/50 hover:bg-fog/50 transition-colors">
                    <td className="py-sm pr-lg">
                      <div className="flex items-center gap-sm">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat.category] || '#78716C' }} />
                        <span className="font-medium text-kle-dark" title={CATEGORY_LABELS[cat.category] ? `${CATEGORY_LABELS[cat.category]} (${cat.category})` : cat.category}>{cat.category}</span>
                        <span className="text-xs text-smoke">({cat.percentage}%)</span>
                      </div>
                    </td>
                    <td className="py-sm pr-md text-center font-mono font-bold text-kle-dark">{cat.count}</td>
                    {cat.bands.map((b) => (
                      <td key={b.band} className="py-sm pr-md text-center">
                        <span
                          className="inline-block px-sm py-xs rounded-md font-mono text-sm"
                          style={{
                            backgroundColor: b.count > 0 ? BAND_COLORS[b.band] + '15' : 'transparent',
                            color: BAND_COLORS[b.band],
                            fontWeight: b.count > 0 ? 600 : 400,
                          }}
                        >
                          {b.count}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 7: Faculty List (ranked by decreasing score)
          ═══════════════════════════════════════════════ */}
      <DataTable
        data={deptFacultyList}
        columns={[
          { key: 'rank', label: '#', type: 'number' },
          { key: 'name', label: 'Faculty Name' },
          { key: 'category', label: 'Category' },
          { key: 'score', label: 'Score', type: 'number' },
          { key: 'maxScore', label: 'Max', type: 'number' },
          { key: 'band', label: 'R-Band' },
          { key: 'pubs', label: 'Pubs', type: 'number' },
          { key: 'hIndex', label: 'H-Index', type: 'number' },
          { key: 'citations', label: 'Citations', type: 'number' },
        ]}
        title="Faculty Research Summary — Ranked by Decreasing Score"
        sortable={true}
        filterable={true}
        exportable={true}
        pageSize={10}
      />
    </div>
  );
}
