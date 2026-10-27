import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  fadeUp,
  staggerContainer,
} from './deptConstants';
import { deptFacultyData, deptPerformanceData } from '../../data/mockData';

// ─── Section Header ──────────────────────────────
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

// ─── Faculty By Cycle Card ───────────────────────
function FacultyByCycleCard({ cycleData, cycleKey, isActive }) {
  const d = cycleData[cycleKey];
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      className={`bg-white rounded-xl border p-lg transition-all ${
        isActive ? 'border-kle-crimson/40 ring-1 ring-kle-crimson/10' : 'border-mist/60'
      }`}
    >
      <div className="flex items-center justify-between mb-md">
        <h4 className="font-heading font-medium text-sm text-kle-dark">{d.label}</h4>
        {isActive && (
          <span className="text-[10px] bg-kle-crimson/10 text-kle-crimson px-sm py-xs rounded-full font-semibold">
            Active
          </span>
        )}
      </div>
      <p className="text-label text-smoke mb-md">
        Total Faculty: <span className="font-mono font-bold text-kle-dark">{d.totalFaculty}</span>
      </p>
      <div className="space-y-xs">
        {d.categories.map((c) => {
          const pct = d.totalFaculty > 0 ? (c.count / d.totalFaculty) * 100 : 0;
          return (
            <div key={c.name} className="group">
              <div className="flex items-center justify-between py-xs">
                <div className="flex items-center gap-sm">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                  <span className="text-label text-graphite group-hover:text-kle-dark transition-colors">{c.name}</span>
                </div>
                <div className="flex items-center gap-sm">
                  <span className="font-mono font-medium text-kle-dark">{c.count}</span>
                  <span className="text-[10px] text-smoke font-mono">({pct.toFixed(0)}%)</span>
                </div>
              </div>
              <div className="h-1 bg-fog rounded-full overflow-hidden ml-5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: c.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Performance By Cycle Card ───────────────────
function PerformanceByCycleCard({ perfData, cycleKey, isActive }) {
  const d = perfData[cycleKey];
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      className={`bg-white rounded-xl border p-lg transition-all ${
        isActive ? 'border-kle-crimson/40 ring-1 ring-kle-crimson/10' : 'border-mist/60'
      }`}
    >
      <div className="flex items-center justify-between mb-sm">
        <h4 className="font-heading font-medium text-sm text-kle-dark">{d.label}</h4>
        {isActive && (
          <span className="text-[10px] bg-kle-crimson/10 text-kle-crimson px-sm py-xs rounded-full font-semibold">
            Active
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-mist">
              <th className="py-sm pr-md text-[10px] text-smoke uppercase tracking-wider">Category</th>
              <th className="py-sm pr-md text-[10px] text-smoke uppercase tracking-wider text-right">Univ</th>
              <th className="py-sm text-[10px] text-smoke uppercase tracking-wider text-right">Dept</th>
              <th className="py-sm text-[10px] text-smoke uppercase tracking-wider text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {d.university.map((u, i) => {
              const deptVal = d.department[i]?.avgScore || 0;
              const delta = deptVal - u.avgScore;
              return (
                <tr key={u.category} className="border-b border-mist/30 hover:bg-fog/30 transition-colors">
                  <td className="py-xs pr-md">
                    <div className="flex items-center gap-xs">
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[u.category] || '#78716C' }} />
                      <span className="text-xs text-graphite">{u.category}</span>
                    </div>
                  </td>
                  <td className="py-xs pr-md text-right font-mono text-xs text-kle-dark">{u.avgScore}</td>
                  <td className="py-xs text-right font-mono text-xs text-kle-dark">{deptVal}</td>
                  <td className="py-xs text-right">
                    <span className={`flex items-center justify-end gap-xs font-mono text-[11px] ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {delta >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {delta >= 0 ? '+' : ''}{delta}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────
export default function DeptFacultyData() {
  const [selectedCycle, setSelectedCycle] = useState('current');

  const cycles = [
    { key: 'current', label: 'Current (2025-26)' },
    { key: 'cycle1', label: 'Cycle 2024-25' },
    { key: 'cycle2', label: 'Cycle 2023-24' },
  ];

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-xl">
      {/* Cycle Selector */}
      <motion.div variants={fadeUp} className="flex items-center justify-between flex-wrap gap-md">
        <div className="flex items-center gap-sm">
          <Filter size={16} className="text-smoke" />
          <span className="text-xs text-smoke font-medium">Select cycle:</span>
        </div>
        <div className="flex items-center gap-xs">
          {cycles.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelectedCycle(c.key)}
              className={`px-md py-sm rounded-lg text-xs font-medium transition-all ${
                selectedCycle === c.key
                  ? 'bg-kle-crimson text-white shadow-sm'
                  : 'bg-white border border-mist text-graphite hover:border-ash hover:bg-fog/50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Faculty Data Section */}
      <div>
        <SectionHeader
          title="Faculty Data"
          subtitle="Present and last 2 cycles — Total faculty & category breakdown"
          icon={Users}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
          {cycles.map((c) => (
            <FacultyByCycleCard
              key={c.key}
              cycleData={deptFacultyData}
              cycleKey={c.key}
              isActive={selectedCycle === c.key}
            />
          ))}
        </div>

        {/* Category Legend */}
        <motion.div variants={fadeUp} className="mt-lg p-lg bg-gradient-to-r from-gray-50 to-stone-50 rounded-xl border border-mist/40">
          <p className="text-[10px] text-smoke uppercase tracking-wider font-semibold mb-sm">Category Definitions</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-start gap-xs group">
                <div className="w-2.5 h-2.5 rounded-sm mt-1 flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[key] || '#78716C' }} />
                <span className="text-[11px] text-graphite group-hover:text-kle-dark transition-colors">
                  <strong>{key}:</strong> {label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Performance Data Section */}
      <div>
        <SectionHeader
          title="Performance Data"
          subtitle="Avg Score by category — University level vs Department"
          icon={TrendingUp}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
          {cycles.map((c) => (
            <PerformanceByCycleCard
              key={c.key}
              perfData={deptPerformanceData}
              cycleKey={c.key}
              isActive={selectedCycle === c.key}
            />
          ))}
        </div>
      </div>

      {/* Cross-cycle summary */}
      <motion.div variants={fadeUp} className="bg-white rounded-xl border border-mist/60 p-lg">
        <h4 className="font-heading font-semibold text-sm text-kle-dark mb-md">Faculty Growth Summary</h4>
        <div className="grid grid-cols-3 gap-lg text-center">
          {cycles.map((c) => {
            const d = deptFacultyData[c.key];
            return (
              <div key={c.key} className={`p-md rounded-lg ${selectedCycle === c.key ? 'bg-kle-crimson/5 border border-kle-crimson/20' : 'bg-fog/40'}`}>
                <p className="text-[10px] uppercase text-smoke font-semibold mb-xs">{c.label}</p>
                <p className="font-mono text-2xl font-bold text-kle-dark">{d.totalFaculty}</p>
                <p className="text-[10px] text-smoke">faculty</p>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
