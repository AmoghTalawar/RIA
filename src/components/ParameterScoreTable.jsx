import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Filter, Users, GraduationCap, UserX } from 'lucide-react';
import { categoryParameterLabels } from '../data/mockData';

/**
 * ParameterScoreTable
 * Displays research parameter scores (P1–P7) for faculty in Obt/Max format.
 * Supports Review 1, Review 2, and Previous 2 cycles tabs.
 * ERG variant toggle: "ERG with student" vs "ERG without student" (affects P3 label).
 * Category filter to view scores by SRG, ERG, ERS, IREF, etc.
 */

const paramKeys = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];

const categoryColors = {
  SRG: { light: 'bg-accent-teal/10', text: 'text-accent-teal' },
  ERG: { light: 'bg-accent-indigo/10', text: 'text-accent-indigo' },
  ERGWS: { light: 'bg-accent-gold/10', text: 'text-accent-gold' },
  ERS: { light: 'bg-kle-crimson/10', text: 'text-kle-crimson' },
  IREF: { light: 'bg-accent-teal/10', text: 'text-accent-teal' },
  'pre-IREF': { light: 'bg-smoke/10', text: 'text-smoke' },
  'ERS-prep': { light: 'bg-kle-crimson/10', text: 'text-kle-crimson' },
};

function ScoreCell({ obt, max, delay = 0 }) {
  const pct = max > 0 ? (obt / max) * 100 : 0;
  let barColor = '#B91C1C';
  let textColor = 'text-kle-crimson';
  if (pct >= 80) { barColor = '#16a34a'; textColor = 'text-success'; }
  else if (pct >= 60) { barColor = '#B45309'; textColor = 'text-accent-gold'; }

  return (
    <td className="py-sm px-md text-center">
      <span className={`font-mono text-sm font-medium ${textColor}`}>
        {obt}<span className="text-smoke font-normal">/{max}</span>
      </span>
      <div className="w-full bg-mist rounded-full h-1.5 mt-xs overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: delay * 0.04, ease: 'easeOut' }}
          className="h-1.5 rounded-full"
          style={{ backgroundColor: barColor }}
        />
      </div>
    </td>
  );
}

function CategoryBadge({ category, ergType }) {
  const catStyle = categoryColors[category] || categoryColors.ERG;
  let label = category;
  if (category === 'ERG' && ergType) {
    label = ergType === 'with-student' ? 'ERG (w/ student)' : 'ERG (w/o student)';
  }
  return (
    <span className={`inline-flex items-center gap-xs px-sm py-xs rounded text-micro font-medium ${catStyle.light} ${catStyle.text}`}>
      {category === 'ERG' && ergType === 'with-student' && <GraduationCap size={10} />}
      {category === 'ERG' && ergType === 'without-student' && <UserX size={10} />}
      {label}
    </span>
  );
}

export default function ParameterScoreTable({
  reviewData,
  highlightFaculty,
  title = 'Research Parameter Scores',
}) {
  const tabs = [
    { key: 'review1', label: reviewData.review1?.label || 'Review 1' },
    { key: 'review2', label: reviewData.review2?.label || 'Review 2' },
    { key: 'previous1', label: reviewData.previous1?.label || 'Previous Cycle 1' },
    { key: 'previous2', label: reviewData.previous2?.label || 'Previous Cycle 2' },
  ];

  const [activeTab, setActiveTab] = useState('review1');
  const [expandedRow, setExpandedRow] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ergViewMode, setErgViewMode] = useState('all'); // 'all' | 'with-student' | 'without-student'

  const allScores = reviewData[activeTab]?.scores || [];
  const allCategories = [...new Set(allScores.map(s => s.category))];

  // Filter by category
  let filteredData = categoryFilter === 'all'
    ? allScores
    : allScores.filter(s => s.category === categoryFilter);

  // Filter ERG by student type
  if (ergViewMode !== 'all') {
    filteredData = filteredData.filter(s => {
      if (s.category !== 'ERG') return true;
      return s.ergType === ergViewMode;
    });
  }

  // Determine parameter labels per row
  const getParamLabels = (row) => {
    const cat = row?.category;
    if (cat === 'SRG') return categoryParameterLabels.SRG;
    if (cat === 'ERG') {
      return row.ergType === 'without-student'
        ? categoryParameterLabels['ERG-without-student']
        : categoryParameterLabels['ERG-with-student'];
    }
    if (cat === 'ERGWS') return categoryParameterLabels['ERG-without-student'];
    if (cat === 'ERS' || cat === 'ERS-prep') return categoryParameterLabels.ERS;
    if (cat === 'IREF') return categoryParameterLabels.IREF;
    if (cat === 'pre-IREF') return categoryParameterLabels['pre-IREF'];
    return categoryParameterLabels.SRG;
  };

  // Header labels based on the selected category filter
  const headerLabels = (() => {
    if (categoryFilter === 'ERG') {
      return ergViewMode === 'without-student'
        ? categoryParameterLabels['ERG-without-student']
        : categoryParameterLabels['ERG-with-student'];
    }
    if (categoryFilter !== 'all' && categoryParameterLabels[categoryFilter]) {
      return categoryParameterLabels[categoryFilter];
    }
    return categoryParameterLabels.SRG;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="panel"
    >
      {/* Header */}
      <div className="mb-lg">
        <div className="flex items-center justify-between flex-wrap gap-md mb-md">
          <div>
            <h3 className="font-display text-2xl font-semibold text-kle-dark tracking-tight">{title}</h3>
            <p className="text-label text-smoke mt-xs">Parameter-wise research scores · Obt/Max format</p>
          </div>

          {/* Tab Bar */}
          <div className="flex bg-fog rounded-lg p-xs">
            {tabs.map((tab) => (
              <motion.button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setExpandedRow(null); }}
                className={`px-md py-sm rounded-md text-label transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-white shadow-md text-kle-dark font-semibold'
                    : 'text-smoke hover:text-graphite hover:bg-white/50'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {tab.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Filter Row: Category + ERG student type */}
        <div className="flex items-center gap-md flex-wrap">
          <div className="flex items-center gap-xs text-label text-smoke">
            <Filter size={14} />
            <span className="font-medium">Category:</span>
          </div>

          <div className="flex gap-xs flex-wrap">
            <motion.button
              onClick={() => { setCategoryFilter('all'); setErgViewMode('all'); }}
              className={`px-md py-xs rounded-md text-label transition-all ${
                categoryFilter === 'all'
                  ? 'bg-kle-crimson text-white shadow-sm'
                  : 'bg-fog text-smoke hover:bg-mist'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              All Categories
            </motion.button>
            {allCategories.map(cat => (
              <motion.button
                key={cat}
                onClick={() => { setCategoryFilter(cat); if (cat !== 'ERG') setErgViewMode('all'); }}
                className={`px-md py-xs rounded-md text-label transition-all ${
                  categoryFilter === cat
                    ? 'bg-kle-crimson text-white shadow-sm'
                    : 'bg-fog text-smoke hover:bg-mist'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {cat}
              </motion.button>
            ))}
          </div>

          {/* ERG sub-filter: with/without student */}
          <AnimatePresence>
            {(categoryFilter === 'ERG' || categoryFilter === 'all') && allScores.some(s => s.category === 'ERG') && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-xs ml-md pl-md border-l border-mist"
              >
                <Users size={14} className="text-accent-indigo" />
                <span className="text-label text-smoke font-medium">ERG:</span>
                {[
                  { key: 'all', label: 'All', icon: null },
                  { key: 'with-student', label: 'With Student', icon: GraduationCap },
                  { key: 'without-student', label: 'Without Student', icon: UserX },
                ].map(opt => (
                  <motion.button
                    key={opt.key}
                    onClick={() => setErgViewMode(opt.key)}
                    className={`flex items-center gap-xs px-md py-xs rounded-md text-label transition-all ${
                      ergViewMode === opt.key
                        ? 'bg-accent-indigo text-white shadow-sm'
                        : 'bg-fog text-smoke hover:bg-mist'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {opt.icon && <opt.icon size={12} />}
                    {opt.label}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-mist">
        <table className="w-full">
          <thead>
            <tr className="bg-gradient-to-r from-kle-light/40 to-fog">
              <th className="text-left py-md px-md text-label text-smoke font-normal w-8"></th>
              <th className="text-left py-md px-md text-xs text-smoke font-semibold uppercase tracking-wider">Faculty</th>
              <th className="text-left py-md px-md text-xs text-smoke font-semibold uppercase tracking-wider">Dept</th>
              <th className="text-center py-md px-md text-xs text-smoke font-semibold uppercase tracking-wider">Cat</th>
              <th className="text-center py-md px-md text-xs text-smoke font-semibold uppercase tracking-wider">Score</th>
              {paramKeys.map((pk) => (
                <th key={pk} className="text-center py-md px-md text-label font-normal min-w-[110px]">
                  <div className="font-semibold text-kle-dark text-xs uppercase tracking-wider">{pk}</div>
                  <div className="text-[10px] text-smoke mt-xs leading-tight max-w-[100px] mx-auto">{headerLabels?.[pk] || pk}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="wait">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5 + paramKeys.length} className="py-xl text-center">
                    <div className="text-smoke py-lg">
                      <Users size={32} className="mx-auto mb-md opacity-30" />
                      <p className="font-heading font-medium">No data available</p>
                      <p className="text-label mt-xs">Try selecting a different filter or review period.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const isHighlighted = row.faculty === highlightFaculty;
                  const isExpanded = expandedRow === idx;

                  return (
                    <motion.tr
                      key={`${row.faculty}-${activeTab}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.04 }}
                      className={`border-t border-mist cursor-pointer transition-all group ${
                        isHighlighted ? 'bg-kle-crimson/5 hover:bg-kle-crimson/10' : 'hover:bg-fog/60'
                      }`}
                      onClick={() => setExpandedRow(isExpanded ? null : idx)}
                    >
                      <td className="py-sm px-md text-smoke group-hover:text-kle-dark transition-colors">
                        <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                          <ChevronRight size={14} />
                        </motion.div>
                      </td>
                      <td className="py-sm px-md">
                        <div className="flex items-center gap-sm">
                          <span className={`font-heading text-sm font-medium ${isHighlighted ? 'text-kle-crimson' : 'text-kle-dark'}`}>
                            {row.faculty}
                          </span>
                          {isHighlighted && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                              className="text-micro bg-kle-crimson text-white px-sm py-xs rounded-full font-medium">You</motion.span>
                          )}
                        </div>
                      </td>
                      <td className="py-sm px-md text-sm text-graphite font-body">{row.school}</td>
                      <td className="py-sm px-md text-center">
                        <CategoryBadge category={row.category} ergType={row.ergType} />
                      </td>
                      <td className="py-sm px-md text-center">
                        <span className="font-mono font-bold text-lg text-kle-dark">{row.score}</span>
                      </td>
                      {paramKeys.map((pk, pIdx) => (
                        <ScoreCell key={pk} obt={row[pk]?.obt || 0} max={row[pk]?.max || 0} delay={idx * paramKeys.length + pIdx} />
                      ))}
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Expanded Detail Panel below table */}
      <AnimatePresence>
        {expandedRow !== null && filteredData[expandedRow] && (() => {
          const row = filteredData[expandedRow];
          const totalObt = paramKeys.reduce((s, pk) => s + (row[pk]?.obt || 0), 0);
          const totalMax = paramKeys.reduce((s, pk) => s + (row[pk]?.max || 0), 0);
          const rowLabels = getParamLabels(row);

          return (
            <motion.div
              key={`detail-${expandedRow}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-md overflow-hidden"
            >
              <div className="bg-gradient-to-r from-fog to-white rounded-lg p-lg border border-mist">
                <div className="flex items-center gap-md mb-lg flex-wrap">
                  <h4 className="font-heading font-semibold text-kle-dark">{row.faculty}</h4>
                  <CategoryBadge category={row.category} ergType={row.ergType} />
                  {row.category === 'ERG' && (
                    <span className="text-micro text-smoke italic">
                      P3 = {row.ergType === 'without-student' ? 'proposal submitted/granted' : 'No of PhD Student'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-lg">
                  {[
                    { label: 'Total Obtained', value: totalObt, color: 'text-kle-dark' },
                    { label: 'Total Maximum', value: totalMax, color: 'text-graphite' },
                    { label: 'Achievement', value: `${totalMax > 0 ? ((totalObt / totalMax) * 100).toFixed(1) : 0}%`, color: 'text-accent-teal' },
                    { label: 'Faculty Score', value: row.score, color: 'text-kle-crimson' },
                  ].map((stat, i) => (
                    <motion.div key={stat.label} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.1 + i * 0.05 }} className="bg-white rounded-lg p-md shadow-sm">
                      <p className="text-micro text-smoke uppercase tracking-wider">{stat.label}</p>
                      <p className={`font-mono text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    </motion.div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                  {paramKeys.map((pk, i) => {
                    const obt = row[pk]?.obt || 0;
                    const max = row[pk]?.max || 0;
                    const pct = max > 0 ? (obt / max) * 100 : 0;
                    return (
                      <motion.div key={pk} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 + i * 0.05 }} className="flex items-center gap-md">
                        <span className="w-6 font-mono text-xs font-bold text-kle-dark">{pk}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-micro mb-xs">
                            <span className="text-smoke truncate max-w-[200px]">{rowLabels[pk]}</span>
                            <span className="font-mono text-kle-dark">{obt}/{max}</span>
                          </div>
                          <div className="w-full bg-mist rounded-full h-2 overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, delay: 0.2 + i * 0.05 }} className="h-2 rounded-full"
                              style={{ backgroundColor: pct >= 80 ? '#16a34a' : pct >= 60 ? '#B45309' : '#B91C1C' }} />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
}
