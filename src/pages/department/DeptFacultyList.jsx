import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList,
  Search,
  ChevronDown,
  SortAsc,
  SortDesc,
  Download,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  BAND_COLORS,
  fadeUp,
  staggerContainer,
} from './deptConstants';
import { deptFacultyList } from '../../data/mockData';

const columns = [
  { key: 'rank', label: '#', width: 'w-10' },
  { key: 'name', label: 'Faculty Name', width: 'flex-1' },
  { key: 'category', label: 'Category', width: 'w-20' },
  { key: 'score', label: 'Score', width: 'w-16', numeric: true },
  { key: 'maxScore', label: 'Max', width: 'w-14', numeric: true },
  { key: 'band', label: 'Band', width: 'w-14' },
  { key: 'pubs', label: 'Pubs', width: 'w-14', numeric: true },
  { key: 'hIndex', label: 'h-Index', width: 'w-16', numeric: true },
  { key: 'citations', label: 'Citations', width: 'w-20', numeric: true },
];

const BAND_FILTER_OPTIONS = ['All', 'R1', 'R2', 'R3', 'R4'];
const CATEGORY_FILTER_OPTIONS = ['All', 'SRG', 'ERG', 'ERGWS', 'ERS', 'IREF', 'Pre-IREF', 'NA'];

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

export default function DeptFacultyList() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');
  const [bandFilter, setBandFilter] = useState('All');
  const [catFilter, setCatFilter] = useState('All');
  const [expandedFaculty, setExpandedFaculty] = useState(null);

  // Filter
  let data = [...deptFacultyList];
  if (search) {
    const q = search.toLowerCase();
    data = data.filter((f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
  }
  if (bandFilter !== 'All') {
    data = data.filter((f) => f.band === bandFilter);
  }
  if (catFilter !== 'All') {
    data = data.filter((f) => f.category === catFilter);
  }

  // Sort
  data.sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const avgScore = data.length > 0 ? (data.reduce((s, f) => s + f.score, 0) / data.length).toFixed(1) : 0;

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-lg">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center gap-md">
        <div className="w-9 h-9 rounded-lg bg-kle-crimson/10 flex items-center justify-center">
          <ClipboardList size={18} className="text-kle-crimson" />
        </div>
        <div>
          <h3 className="font-heading font-semibold text-h2 text-kle-dark">Faculty Research Summary</h3>
          <p className="text-label text-smoke">Ranked by decreasing score · {data.length} faculty shown</p>
        </div>
      </motion.div>

      {/* Summary strip */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-md">
        <div className="bg-white rounded-xl border border-mist/60 p-md text-center">
          <p className="text-[10px] uppercase text-smoke font-semibold">Total</p>
          <p className="font-mono text-xl font-bold text-kle-dark">{data.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-mist/60 p-md text-center">
          <p className="text-[10px] uppercase text-smoke font-semibold">Avg Score</p>
          <p className="font-mono text-xl font-bold text-kle-dark">{avgScore}</p>
        </div>
        <div className="bg-white rounded-xl border border-mist/60 p-md text-center">
          <p className="text-[10px] uppercase text-smoke font-semibold">Top Score</p>
          <p className="font-mono text-xl font-bold text-emerald-700">{data[0]?.score || '-'}</p>
        </div>
        <div className="bg-white rounded-xl border border-mist/60 p-md text-center">
          <p className="text-[10px] uppercase text-smoke font-semibold">Lowest</p>
          <p className="font-mono text-xl font-bold text-red-600">{data[data.length - 1]?.score || '-'}</p>
        </div>
      </motion.div>

      {/* Filters + Search */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-md">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-md top-1/2 -translate-y-1/2 text-smoke" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search faculty..."
            className="w-full pl-[36px] pr-md py-sm text-xs bg-white border border-mist rounded-lg focus:outline-none focus:ring-1 focus:ring-kle-crimson focus:border-kle-crimson transition-colors"
          />
        </div>

        {/* Band filter */}
        <div className="flex items-center gap-xs">
          <span className="text-[10px] text-smoke font-semibold uppercase">Band:</span>
          {BAND_FILTER_OPTIONS.map((b) => (
            <button
              key={b}
              onClick={() => setBandFilter(b)}
              className={`px-sm py-xs rounded-md text-[11px] font-medium transition-all ${
                bandFilter === b
                  ? 'bg-kle-crimson text-white'
                  : 'bg-fog border border-mist text-graphite hover:border-ash'
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="text-xs bg-white border border-mist rounded-lg px-md py-sm text-graphite focus:outline-none focus:ring-1 focus:ring-kle-crimson"
        >
          {CATEGORY_FILTER_OPTIONS.map((c) => {
            const label = c === 'All' ? 'All Categories' : CATEGORY_LABELS[c] ? `${CATEGORY_LABELS[c]} (${c})` : c;
            return <option key={c} value={c}>{label}</option>;
          })}
        </select>
      </motion.div>

      {/* Table */}
      <motion.div variants={fadeUp} className="bg-white rounded-xl border border-mist/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-fog/50 border-b border-mist">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="py-sm px-md text-[10px] text-smoke uppercase tracking-wider cursor-pointer hover:text-kle-dark transition-colors select-none"
                  >
                    <div className="flex items-center gap-xs">
                      <span>{col.label}</span>
                      {sortKey === col.key && (
                        sortDir === 'asc'
                          ? <SortAsc size={11} className="text-kle-crimson" />
                          : <SortDesc size={11} className="text-kle-crimson" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((f, i) => {
                const isExpanded = expandedFaculty === f.name;
                const scorePct = f.maxScore > 0 ? (f.score / f.maxScore) * 100 : 0;
                return (
                  <>
                    <motion.tr
                      key={f.name}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => setExpandedFaculty(isExpanded ? null : f.name)}
                      className="border-b border-mist/30 hover:bg-fog/30 transition-colors cursor-pointer"
                    >
                      <td className="py-sm px-md">
                        <span className="w-6 h-6 rounded-full bg-fog inline-flex items-center justify-center text-[10px] font-bold text-graphite">
                          {f.rank}
                        </span>
                      </td>
                      <td className="py-sm px-md">
                        <span className="text-xs font-medium text-kle-dark">{f.name}</span>
                      </td>
                      <td className="py-sm px-md">
                        <span
                          className="inline-block px-sm py-xs rounded-md text-[10px] font-semibold"
                          style={{
                            backgroundColor: (CATEGORY_COLORS[f.category] || '#78716C') + '15',
                            color: CATEGORY_COLORS[f.category] || '#78716C',
                          }}
                          title={CATEGORY_LABELS[f.category] ? `${CATEGORY_LABELS[f.category]} (${f.category})` : f.category}
                        >
                          {f.category}
                        </span>
                      </td>
                      <td className="py-sm px-md font-mono text-xs font-bold text-kle-dark">{f.score}</td>
                      <td className="py-sm px-md font-mono text-xs text-smoke">{f.maxScore}</td>
                      <td className="py-sm px-md">
                        <span
                          className="inline-block px-sm py-xs rounded-md text-[10px] font-semibold"
                          style={{
                            backgroundColor: (BAND_COLORS[f.band] || '#78716C') + '15',
                            color: BAND_COLORS[f.band] || '#78716C',
                          }}
                        >
                          {f.band}
                        </span>
                      </td>
                      <td className="py-sm px-md font-mono text-xs text-kle-dark">{f.pubs}</td>
                      <td className="py-sm px-md font-mono text-xs text-kle-dark">{f.hIndex}</td>
                      <td className="py-sm px-md font-mono text-xs text-kle-dark">{f.citations}</td>
                    </motion.tr>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.tr
                          key={`${f.name}-exp`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={9} className="p-0">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-md bg-gradient-to-r from-fog/50 to-stone-50/50 border-b border-mist/30">
                                <div className="flex items-center gap-xl">
                                  {/* Score progress */}
                                  <div className="flex-1">
                                    <p className="text-[10px] text-smoke mb-xs font-semibold uppercase">Score Progress</p>
                                    <div className="h-3 bg-fog rounded-full overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${scorePct}%` }}
                                        transition={{ duration: 0.6 }}
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: BAND_COLORS[f.band] || '#78716C' }}
                                      />
                                    </div>
                                    <p className="text-[10px] text-smoke mt-xs font-mono">{scorePct.toFixed(0)}% of max</p>
                                  </div>
                                  {/* Quick stats */}
                                  <div className="grid grid-cols-3 gap-lg text-center">
                                    <div>
                                      <p className="text-[10px] text-smoke uppercase">Pubs</p>
                                      <p className="font-mono text-sm font-bold text-kle-dark">{f.pubs}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-smoke uppercase">h-Index</p>
                                      <p className="font-mono text-sm font-bold text-kle-dark">{f.hIndex}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-smoke uppercase">Citations</p>
                                      <p className="font-mono text-sm font-bold text-kle-dark">{f.citations}</p>
                                    </div>
                                  </div>
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

        {data.length === 0 && (
          <div className="p-xl text-center">
            <p className="text-sm text-smoke">No faculty match the current filters</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
