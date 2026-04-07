import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Target, BarChart3, ChevronRight } from 'lucide-react';
import SimpleBarChart from '../../components/SimpleBarChart';
import CategoryScoreBand from '../../components/CategoryScoreBand';
import {
  CATEGORY_COLORS,
  BAND_COLORS,
  fadeUp,
  staggerContainer,
} from './deptConstants';
import {
  deptScoreBands,
  deptCategoryScoreBands,
} from '../../data/mockData';

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

export default function DeptScores() {
  const [expandedRow, setExpandedRow] = useState(null);

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-xl">
      {/* R-Band Distribution */}
      <div>
        <SectionHeader
          title="Department Research Scores"
          subtitle="Faculty in the score range — R1(81-100), R2(61-80), R3(41-60), R4(<40)"
          icon={Award}
        />

        <motion.div
          variants={fadeUp}
          whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
          className="transition-shadow"
        >
          <SimpleBarChart
            data={deptScoreBands.overall.data}
            xKey="band"
            yKey="count"
            title={`${deptScoreBands.overall.label} — Faculty in Score Range`}
            subtitle="% can also be displayed"
            height={280}
            colors={deptScoreBands.overall.data.map((d) => d.color)}
          />
        </motion.div>

        {/* Score band legend cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md mt-lg">
          {deptScoreBands.overall.data.map((b, i) => (
            <motion.div
              key={b.band}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              whileHover={{ y: -2, boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}
              className="bg-white rounded-xl border border-mist/60 p-md flex items-center gap-md transition-shadow cursor-default"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-mono font-bold text-sm"
                style={{ backgroundColor: b.color }}
              >
                {b.band}
              </div>
              <div>
                <p className="font-mono text-lg font-bold text-kle-dark">{b.count}</p>
                <p className="text-[10px] text-smoke">{b.range}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Category & Score Breakdown (interactive) */}
      <motion.div variants={fadeUp}>
        <CategoryScoreBand categories={deptCategoryScoreBands} />
      </motion.div>

      {/* Comparison Table */}
      <div>
        <SectionHeader
          title="Department Comparison"
          subtitle="Number of Faculty in different categories, Score comparisons"
          icon={Target}
        />

        <motion.div
          variants={fadeUp}
          className="bg-white rounded-xl border border-mist/60 p-lg"
        >
          <div className="flex items-center justify-between mb-lg">
            <div>
              <h3 className="font-heading font-medium text-sm text-kle-dark">Score Comparison across Categories & Bands</h3>
              <p className="text-[11px] text-smoke mt-xs">Click a row to see details</p>
            </div>
            <div className="flex items-center gap-sm">
              {Object.entries(BAND_COLORS).map(([band, color]) => (
                <div key={band} className="flex items-center gap-xs">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-graphite font-medium">{band}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-mist">
                  <th className="py-sm pr-lg text-[10px] text-smoke uppercase tracking-wider">Category</th>
                  <th className="py-sm pr-md text-[10px] text-smoke uppercase tracking-wider text-center">Total</th>
                  <th className="py-sm pr-md text-[10px] text-smoke uppercase tracking-wider text-center">R1</th>
                  <th className="py-sm pr-md text-[10px] text-smoke uppercase tracking-wider text-center">R2</th>
                  <th className="py-sm pr-md text-[10px] text-smoke uppercase tracking-wider text-center">R3</th>
                  <th className="py-sm text-[10px] text-smoke uppercase tracking-wider text-center">R4</th>
                  <th className="py-sm text-[10px] text-smoke uppercase tracking-wider text-center w-8"></th>
                </tr>
              </thead>
              <tbody>
                {deptCategoryScoreBands.map((cat) => {
                  const isExpanded = expandedRow === cat.category;
                  const total = cat.bands.reduce((s, b) => s + b.count, 0);
                  return (
                    <>
                      <tr
                        key={cat.category}
                        onClick={() => setExpandedRow(isExpanded ? null : cat.category)}
                        className="border-b border-mist/50 hover:bg-fog/50 transition-colors cursor-pointer group"
                      >
                        <td className="py-sm pr-lg">
                          <div className="flex items-center gap-sm">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat.category] || '#78716C' }} />
                            <span className="font-medium text-kle-dark text-xs">{cat.category}</span>
                            <span className="text-[10px] text-smoke">({cat.percentage}%)</span>
                          </div>
                        </td>
                        <td className="py-sm pr-md text-center font-mono font-bold text-kle-dark text-xs">{cat.count}</td>
                        {cat.bands.map((b) => (
                          <td key={b.band} className="py-sm pr-md text-center">
                            <span
                              className="inline-block px-sm py-xs rounded-md font-mono text-xs"
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
                        <td className="py-sm text-center">
                          <ChevronRight
                            size={14}
                            className={`text-smoke transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        </td>
                      </tr>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.tr
                            key={`${cat.category}-detail`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <td colSpan={7} className="p-0">
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-md bg-fog/30 border-b border-mist/40">
                                  <div className="grid grid-cols-4 gap-sm">
                                    {cat.bands.map((b) => {
                                      const pct = total > 0 ? (b.count / total) * 100 : 0;
                                      return (
                                        <div key={b.band} className="text-center">
                                          <div className="h-16 flex items-end justify-center mb-xs">
                                            <motion.div
                                              initial={{ height: 0 }}
                                              animate={{ height: `${Math.max(pct, 5)}%` }}
                                              transition={{ duration: 0.5 }}
                                              className="w-8 rounded-t"
                                              style={{ backgroundColor: BAND_COLORS[b.band] }}
                                            />
                                          </div>
                                          <p className="text-[10px] font-mono text-graphite">{b.band}: {b.count}</p>
                                          <p className="text-[10px] text-smoke">{pct.toFixed(0)}%</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </motion.div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
