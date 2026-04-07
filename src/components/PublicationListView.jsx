import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  BookOpen,
  Calendar,
} from 'lucide-react';

const ITEMS_PER_PAGE = 25;

const QUARTILE_OPTIONS = ['All', 'Q1', 'Q2', 'Q3', 'Q4', 'Unranked'];
const QUARTILE_COLORS = {
  Q1: 'chip chip-q1',
  Q2: 'chip chip-q2',
  Q3: 'chip chip-q3',
  Q4: 'chip chip-q4',
  Unranked: 'chip bg-gray-100 text-gray-500',
};

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v, def = 0) => {
  if (v == null || v === '' || Number.isNaN(Number(v))) return def;
  return Number(v);
};

export default function PublicationListView({
  publications,
  year,
  availableYears,
  onBack,
  onSelectPublication,
  onYearChange,
}) {
  const [search, setSearch] = useState('');
  const [qFilter, setQFilter] = useState('All');
  const [sortKey, setSortKey] = useState('PUBLICATION TITLE');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  /* ── Filter publications by selected year ── */
  const yearPubs = useMemo(
    () => publications.filter((p) => num(p['YEAR']) === year),
    [publications, year]
  );

  /* ── Apply search + Q-rank filters ── */
  const filtered = useMemo(() => {
    let result = yearPubs;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          str(p['PUBLICATION TITLE']).toLowerCase().includes(q) ||
          str(p['SOURCE PUBLICATION']).toLowerCase().includes(q) ||
          str(p['AUTHORS']).toLowerCase().includes(q)
      );
    }

    if (qFilter !== 'All') {
      result = result.filter((p) => {
        const qr = str(p['Q RANK(SCS)']);
        if (qFilter === 'Unranked') return !['Q1', 'Q2', 'Q3', 'Q4'].includes(qr);
        return qr === qFilter;
      });
    }

    return result;
  }, [yearPubs, search, qFilter]);

  /* ── Sort ── */
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let va = str(a[sortKey]);
      let vb = str(b[sortKey]);
      if (['CITE SCORE', 'IF', 'YEAR'].includes(sortKey)) {
        va = num(a[sortKey]);
        vb = num(b[sortKey]);
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronDown size={12} className="text-ash opacity-40" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} className="text-kle-crimson" />
    ) : (
      <ChevronDown size={12} className="text-kle-crimson" />
    );
  };

  const columns = [
    { key: 'PUBLICATION TITLE', label: 'Title', width: 'w-[35%]' },
    { key: 'SOURCE PUBLICATION', label: 'Journal', width: 'w-[20%]' },
    { key: 'Q RANK(SCS)', label: 'Q-Rank', width: 'w-[8%]' },
    { key: 'CITE SCORE', label: 'Citations', width: 'w-[8%]' },
    { key: 'HOME AUTHOR DEPARTMENT', label: 'Department', width: 'w-[15%]' },
    { key: 'HOME AUTHORS', label: 'Corresponding Author', width: 'w-[14%]' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
      className="space-y-lg"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-md">
        <div className="flex items-center gap-md">
          <button
            onClick={onBack}
            className="flex items-center gap-xs text-smoke hover:text-kle-crimson transition-colors group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-label font-medium">Back to Dashboard</span>
          </button>
        </div>
      </div>

      {/* ── Title + Year Selector ── */}
      <div className="panel">
        <div className="flex items-center justify-between flex-wrap gap-md">
          <div className="flex items-center gap-md">
            <div className="w-10 h-10 bg-kle-crimson/10 rounded-lg flex items-center justify-center">
              <BookOpen size={20} className="text-kle-crimson" />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-h2 text-kle-dark">
                Publications
              </h2>
              <p className="text-label text-smoke">
                {yearPubs.length} total publications · {filtered.length} shown
              </p>
            </div>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-sm">
            <Calendar size={16} className="text-smoke" />
            <select
              value={year}
              onChange={(e) => {
                onYearChange(Number(e.target.value));
                setPage(1);
                setSearch('');
                setQFilter('All');
              }}
              className="px-md py-sm bg-fog border border-mist rounded-md text-body text-kle-dark font-mono font-medium cursor-pointer focus:border-kle-crimson focus:ring-1 focus:ring-kle-crimson/20 outline-none transition-colors"
            >
              {[...availableYears].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="panel">
        <div className="flex items-center gap-lg flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-smoke" />
            <input
              type="text"
              placeholder="Search title, journal, or author…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-8 py-sm bg-fog border border-mist rounded-md text-body text-kle-dark placeholder:text-smoke focus:border-kle-crimson focus:ring-1 focus:ring-kle-crimson/20 outline-none transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-smoke hover:text-kle-crimson"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Q-Rank Filter */}
          <div className="flex items-center gap-xs">
            <Filter size={14} className="text-smoke" />
            <span className="text-label text-smoke mr-xs">Q-Rank:</span>
            {QUARTILE_OPTIONS.map((q) => (
              <button
                key={q}
                onClick={() => { setQFilter(q); setPage(1); }}
                className={`px-md py-xs rounded-md text-micro font-medium transition-all ${
                  qFilter === q
                    ? 'bg-kle-crimson text-white shadow-sm'
                    : 'bg-fog text-graphite hover:bg-mist'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-mist">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`text-left py-sm px-md text-label text-smoke font-semibold uppercase tracking-wider cursor-pointer hover:text-kle-dark transition-colors select-none ${col.width}`}
                  >
                    <span className="inline-flex items-center gap-xs">
                      {col.label}
                      <SortIcon col={col.key} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-3xl text-center text-smoke text-body">
                      No publications found matching your filters.
                    </td>
                  </tr>
                ) : (
                  paged.map((pub, idx) => {
                    const qr = str(pub['Q RANK(SCS)']);
                    const chipClass = QUARTILE_COLORS[qr] || QUARTILE_COLORS['Unranked'];
                    const homeAuthors = str(pub['HOME AUTHORS']);
                    const firstAuthor = homeAuthors ? homeAuthors.split(/[|;]/)[0].trim() : str(pub['AUTHORS']).split(/[|;]/)[0]?.trim() || 'NA';

                    return (
                      <motion.tr
                        key={pub['PUB ID'] || idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        onClick={() => onSelectPublication(pub)}
                        className="border-b border-mist cursor-pointer hover:bg-kle-crimson/[0.03] transition-colors group"
                      >
                        <td className="py-sm px-md">
                          <span className="text-body text-kle-dark font-medium line-clamp-2 group-hover:text-kle-crimson transition-colors">
                            {str(pub['PUBLICATION TITLE']) || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="text-label text-graphite line-clamp-1">
                            {str(pub['SOURCE PUBLICATION']) || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className={chipClass}>
                            {qr || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="font-mono text-sm text-kle-dark">
                            {num(pub['CITE SCORE']) || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="text-label text-graphite line-clamp-1">
                            {str(pub['HOME AUTHOR DEPARTMENT']) || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="text-label text-graphite line-clamp-1">
                            {firstAuthor}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-md mt-md border-t border-mist">
            <p className="text-label text-smoke">
              Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(safePage * ITEMS_PER_PAGE, sorted.length)} of{' '}
              {sorted.length}
            </p>
            <div className="flex items-center gap-xs">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-xs rounded-md hover:bg-fog disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>

              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (safePage <= 4) {
                  pageNum = i + 1;
                } else if (safePage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = safePage - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-md text-label font-medium transition-colors ${
                      safePage === pageNum
                        ? 'bg-kle-crimson text-white'
                        : 'text-graphite hover:bg-fog'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-xs rounded-md hover:bg-fog disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
