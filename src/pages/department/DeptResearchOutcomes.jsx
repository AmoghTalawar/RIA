import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Eye, EyeOff, Download, Info } from 'lucide-react';
import SemiCircleGauge from '../../components/SemiCircleGauge';
import NestedDonutChart from '../../components/NestedDonutChart';
import SimpleBarChart from '../../components/SimpleBarChart';
import { fadeUp, staggerContainer, AVAILABLE_YEARS } from './deptConstants';
import { deptResearchOutcomesByYear } from '../../data/mockData';

// ─── Section Header ──────────────────────────────
function SectionHeader({ title, subtitle, icon: Icon, action }) {
  return (
    <div className="flex items-center justify-between mb-lg">
      <div className="flex items-center gap-md">
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
      {action}
    </div>
  );
}

// ─── Citation Gauge Card ─────────────────────────
function CitationGaugeCard({ target, current, status }) {
  const pct = target > 0 ? ((current / target) * 100).toFixed(0) : 0;
  const statusColor =
    status === 'Poor' ? '#B91C1C'
    : status === 'Average' ? '#D97706'
    : status === 'Good' ? '#0F766E'
    : '#15803D';

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      className="bg-white rounded-xl border border-mist/60 p-lg flex flex-col items-center transition-shadow"
    >
      <h3 className="font-heading font-medium text-sm text-kle-dark mb-md w-full">
        Citations: Target- {target}, {pct}% Status
      </h3>
      <SemiCircleGauge actual={current} target={target} size={210} />
      <div
        className="mt-sm px-md py-xs rounded-full text-xs font-semibold"
        style={{ backgroundColor: statusColor + '15', color: statusColor }}
      >
        {status} — {pct}% of target
      </div>
    </motion.div>
  );
}

// ─── Quartile Donut (SVG) ────────────────────────
function QuartileDonut({ quartiles }) {
  const total = quartiles.reduce((s, q) => s + q.value, 0);

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      className="bg-white rounded-xl border border-mist/60 p-lg transition-shadow"
    >
      <h3 className="font-heading font-medium text-sm text-kle-dark mb-md">
        Quality of Publications as per Quartiles
      </h3>
      <div style={{ height: 200 }} className="relative">
        <div className="w-full h-full flex items-center justify-center">
          <div className="relative" style={{ width: 160, height: 160 }}>
            <svg width={160} height={160} viewBox="0 0 160 160">
              {(() => {
                let cumAngle = -90;
                return quartiles.map((q) => {
                  const angle = total > 0 ? (q.value / total) * 360 : 0;
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
                      <path d={d} fill={q.color} stroke="white" strokeWidth={2} className="transition-opacity hover:opacity-80 cursor-pointer" />
                      {q.value > 0 && (
                        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={12} fontWeight={700}>
                          {q.value}
                        </text>
                      )}
                    </g>
                  );
                });
              })()}
              {/* Center text */}
              <text x={80} y={76} textAnchor="middle" dominantBaseline="middle" fill="#1C1917" fontSize={18} fontWeight={700}>
                {total}
              </text>
              <text x={80} y={92} textAnchor="middle" dominantBaseline="middle" fill="#78716C" fontSize={9}>
                total
              </text>
            </svg>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-md mt-sm">
        {quartiles.map((q) => (
          <div key={q.name} className="flex items-center gap-xs">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: q.color }} />
            <span className="text-[11px] text-graphite font-medium">{q.name}: {q.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Comparison Selector ─────────────────────────
function CompareSelector({ years, compareYear, setCompareYear }) {
  return (
    <div className="flex items-center gap-sm">
      <span className="text-xs text-smoke font-medium">Compare with:</span>
      <select
        value={compareYear || ''}
        onChange={(e) => setCompareYear(e.target.value ? Number(e.target.value) : null)}
        className="text-xs bg-fog border border-mist rounded-md px-sm py-xs text-kle-dark focus:outline-none focus:ring-1 focus:ring-kle-crimson"
      >
        <option value="">None</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Component ──────────────────────────────
export default function DeptResearchOutcomes() {
  const { selectedYear } = useOutletContext();
  const yearData = deptResearchOutcomesByYear[selectedYear] || deptResearchOutcomesByYear[2023];

  const [compareYear, setCompareYear] = useState(null);
  const [showDetails, setShowDetails] = useState(true);
  const compareData = compareYear ? deptResearchOutcomesByYear[compareYear] : null;

  const compareYears = AVAILABLE_YEARS.filter((y) => y !== selectedYear);

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-xl">
      <SectionHeader
        title="Research Outcomes"
        subtitle={`Year ${selectedYear} · Dynamic view`}
        icon={Target}
        action={
          <div className="flex items-center gap-md">
            <CompareSelector
              years={compareYears}
              compareYear={compareYear}
              setCompareYear={setCompareYear}
            />
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-xs px-md py-xs bg-fog border border-mist rounded-md text-xs text-graphite hover:border-ash transition-colors"
            >
              {showDetails ? <EyeOff size={13} /> : <Eye size={13} />}
              {showDetails ? 'Compact' : 'Detailed'}
            </button>
          </div>
        }
      />

      {/* Row 1: Gauges + h-Index */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
        {/* Publications Gauge */}
        <motion.div
          variants={fadeUp}
          whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
          className="bg-white rounded-xl border border-mist/60 p-lg flex flex-col items-center transition-shadow"
        >
          <h3 className="font-heading font-medium text-sm text-kle-dark mb-md w-full">
            Publications: Target - {yearData.publications.target}, Current: {yearData.publications.current}
          </h3>
          <SemiCircleGauge
            actual={yearData.publications.current}
            target={yearData.publications.target}
            size={210}
          />
          <div className="mt-sm flex items-center gap-md text-xs text-smoke">
            <span>Patents: Filed-{yearData.patents.filed}, Granted-{yearData.patents.granted}</span>
          </div>
          {/* Compare badge */}
          {compareData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-md px-md py-xs bg-blue-50 rounded-md border border-blue-200/60"
            >
              <p className="text-[10px] text-blue-700 font-medium">
                vs {compareYear}: {compareData.publications.current} / {compareData.publications.target}
                <span className="ml-sm font-mono">
                  ({yearData.publications.current - compareData.publications.current >= 0 ? '+' : ''}
                  {yearData.publications.current - compareData.publications.current})
                </span>
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Avg h-Index donut */}
        <motion.div variants={fadeUp} whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} className="transition-shadow">
          <NestedDonutChart
            data={yearData.avgHIndex}
            title="Avg h-Index (Scopus)"
            size={210}
          />
        </motion.div>

        {/* Citations gauge */}
        <CitationGaugeCard
          target={yearData.citations.target}
          current={yearData.citations.current}
          status={yearData.citations.status}
        />
      </div>

      {/* Row 2: Quartiles + Quarter Pubs + Year Pubs */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
              <QuartileDonut quartiles={yearData.qualityQuartiles} />

              <motion.div variants={fadeUp} whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} className="transition-shadow">
                <SimpleBarChart
                  data={yearData.pubsLastQuarters}
                  xKey="quarter"
                  yKey="count"
                  title="Publications in last four quartiles, current"
                  height={220}
                  barColor="#3B82F6"
                />
              </motion.div>

              <motion.div variants={fadeUp} whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} className="transition-shadow">
                <SimpleBarChart
                  data={yearData.pubsLastYears}
                  xKey="year"
                  yKey="count"
                  title="Number of Publications in last 3 years"
                  height={220}
                  barColor="#3B82F6"
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compare summary cards */}
      {compareData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200/50 p-lg"
        >
          <div className="flex items-center gap-sm mb-md">
            <Info size={14} className="text-blue-600" />
            <h4 className="font-heading font-semibold text-sm text-blue-900">
              Year-over-Year Comparison: {selectedYear} vs {compareYear}
            </h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            {[
              {
                label: 'Publications',
                current: yearData.publications.current,
                prev: compareData.publications.current,
              },
              {
                label: 'Citations',
                current: yearData.citations.current,
                prev: compareData.citations.current,
              },
              {
                label: 'Patents Filed',
                current: yearData.patents.filed,
                prev: compareData.patents.filed,
              },
              {
                label: 'Q1 Pubs',
                current: yearData.qualityQuartiles.find((q) => q.name === 'Q1')?.value || 0,
                prev: compareData.qualityQuartiles.find((q) => q.name === 'Q1')?.value || 0,
              },
            ].map((m) => {
              const delta = m.current - m.prev;
              return (
                <div key={m.label} className="text-center">
                  <p className="text-[10px] uppercase text-blue-700 font-semibold mb-xs">{m.label}</p>
                  <p className="font-mono text-lg font-bold text-blue-900">{m.current}</p>
                  <p className={`text-xs font-mono ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {delta >= 0 ? '+' : ''}{delta} from {compareYear}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
