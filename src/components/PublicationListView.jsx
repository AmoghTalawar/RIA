import { useState, useMemo } from 'react';
import { cleanDepartments } from '../lib/signals';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  X,
  BookOpen,
  Calendar,
} from 'lucide-react';

const PAGE_SIZES = [10, 25, 50, 100];
const ALL_YEARS = 'all';

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

// Column key → publication field mapping (Supabase snake_case)
const SORT_KEYS = {
  year: 'year',
  title: 'title',
  source_publication: 'source_publication',
  q_rank_scopus: 'q_rank_scopus',
  cite_score: 'cite_score',
  home_author_department: 'home_author_department',
  home_authors: 'home_authors',
};

/** First KLE author, plus how many more ("Minal Salunke +2"). */
function authorLabel(pub) {
  const names = str(pub.home_authors).split(/[|;]/).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return 'NA';
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}

/** Distinct, real departments of a paper (the raw field repeats one per co-author). */
const departmentLabel = (pub) => cleanDepartments(pub.home_author_department).join(', ') || 'NA';

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
  const [sortKey, setSortKey] = useState('year');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Show every publication by default; the year list narrows it. (The year handed in by the dashboard can be
  // text, which used to match nothing and showed "0 total publications".)
  const [yearSel, setYearSel] = useState(ALL_YEARS);

  /* Filter publications by the chosen year */
  const yearPubs = useMemo(
    () => (yearSel === ALL_YEARS ? publications : publications.filter((p) => num(p.year) === yearSel)),
    [publications, yearSel]
  );

  /* Apply search + Q-rank filters. The search looks in title, journal, KLE authors, department, DOI and year. */
  const filtered = useMemo(() => {
    let result = yearPubs;

    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      result = result.filter((p) => {
        const haystack = [p.title, p.source_publication, p.home_authors, cleanDepartments(p.home_author_department).join(' '), p.doi, p.year]
          .map((v) => str(v).toLowerCase()).join(' | ');
        return terms.every((t) => haystack.includes(t));      // every word must match, in any field
      });
    }

    if (qFilter !== 'All') {
      result = result.filter((p) => {
        const qr = str(p.q_rank_scopus);
        if (qFilter === 'Unranked') return !['Q1', 'Q2', 'Q3', 'Q4'].includes(qr);
        return qr === qFilter;
      });
    }

    return result;
  }, [yearPubs, search, qFilter]);

  /* Sort */
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let va = str(a[sortKey]);
      let vb = str(b[sortKey]);
      if (['cite_score', 'impact_factor', 'year'].includes(sortKey)) {
        va = num(a[sortKey]);
        vb = num(b[sortKey]);
        if (va !== vb) return sortDir === 'asc' ? va - vb : vb - va;
        return str(a.title).localeCompare(str(b.title));
      }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

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
    { key: 'title',                   label: 'Title',       width: 'w-[32%]' },
    { key: 'year',                    label: 'Year',        width: 'w-[6%]' },
    { key: 'source_publication',      label: 'Journal',     width: 'w-[19%]' },
    { key: 'q_rank_scopus',           label: 'Q-Rank',      width: 'w-[7%]' },
    { key: 'cite_score',              label: 'Cite Score',  width: 'w-[8%]' },
    { key: 'home_author_department',  label: 'Department',  width: 'w-[14%]' },
    { key: 'home_authors',            label: 'KLE Authors', width: 'w-[14%]' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
      className="space-y-lg"
    >
      {/* Header */}
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

      {/* Title + Year Selector */}
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
                {publications.length.toLocaleString('en-IN')} publications in total · {filtered.length.toLocaleString('en-IN')} match{yearSel === ALL_YEARS ? '' : ` (${yearSel})`}
              </p>
            </div>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-sm">
            <Calendar size={16} className="text-smoke" />
            <select
              value={yearSel}
              onChange={(e) => {
                const v = e.target.value;
                setYearSel(v === ALL_YEARS ? ALL_YEARS : Number(v));
                setPage(1);
              }}
              className="px-md py-sm bg-fog border border-mist rounded-md text-body text-kle-dark font-mono font-medium cursor-pointer focus:border-kle-crimson focus:ring-1 focus:ring-kle-crimson/20 outline-none transition-colors"
            >
              <option value={ALL_YEARS}>All years</option>
              {[...availableYears].reverse().map((y) => (
                <option key={y} value={Number(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="panel">
        <div className="flex items-center gap-lg flex-wrap">
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

      {/* Table */}
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
                      {(search || qFilter !== 'All' || yearSel !== ALL_YEARS) && (
                        <button
                          onClick={() => { setSearch(''); setQFilter('All'); setYearSel(ALL_YEARS); setPage(1); }}
                          className="ml-sm text-kle-crimson hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paged.map((pub, idx) => {
                    const qr = str(pub.q_rank_scopus);
                    const chipClass = QUARTILE_COLORS[qr] || QUARTILE_COLORS['Unranked'];

                    return (
                      <motion.tr
                        key={pub.pub_id || idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        onClick={() => onSelectPublication(pub)}
                        className="border-b border-mist cursor-pointer hover:bg-kle-crimson/[0.03] transition-colors group"
                      >
                        <td className="py-sm px-md">
                          <span className="text-body text-kle-dark font-medium line-clamp-2 group-hover:text-kle-crimson transition-colors">
                            {str(pub.title) || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="font-mono text-sm text-graphite">{num(pub.year) || 'NA'}</span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="text-label text-graphite line-clamp-1" title={str(pub.source_publication)}>
                            {str(pub.source_publication) || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className={chipClass}>
                            {qr || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="font-mono text-sm text-kle-dark">
                            {num(pub.cite_score) || 'NA'}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="text-label text-graphite line-clamp-1" title={departmentLabel(pub)}>
                            {departmentLabel(pub)}
                          </span>
                        </td>
                        <td className="py-sm px-md">
                          <span className="text-label text-graphite line-clamp-1" title={str(pub.home_authors).replace(/;/g, ', ')}>
                            {authorLabel(pub)}
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

        {/* Pagination */}
        {sorted.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-md pt-md mt-md border-t border-mist">
            <div className="flex items-center gap-md">
              <p className="text-label text-smoke">
                Showing {((safePage - 1) * pageSize + 1).toLocaleString('en-IN')}–
                {Math.min(safePage * pageSize, sorted.length).toLocaleString('en-IN')} of{' '}
                {sorted.length.toLocaleString('en-IN')}
              </p>
              <label className="flex items-center gap-xs text-label text-smoke">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-sm py-xs bg-fog border border-mist rounded-md text-label text-kle-dark outline-none focus:border-kle-crimson"
                >
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-xs">
                <button onClick={() => setPage(1)} disabled={safePage <= 1} aria-label="First page"
                  className="p-xs rounded-md hover:bg-fog disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronsLeft size={18} />
                </button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page"
                  className="p-xs rounded-md hover:bg-fog disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={18} />
                </button>

                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 7) pageNum = i + 1;
                  else if (safePage <= 4) pageNum = i + 1;
                  else if (safePage >= totalPages - 3) pageNum = totalPages - 6 + i;
                  else pageNum = safePage - 3 + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      aria-current={safePage === pageNum ? 'page' : undefined}
                      className={`min-w-[2rem] h-8 px-xs rounded-md text-label font-medium transition-colors ${
                        safePage === pageNum ? 'bg-kle-crimson text-white' : 'text-graphite hover:bg-fog'}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page"
                  className="p-xs rounded-md hover:bg-fog disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={18} />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} aria-label="Last page"
                  className="p-xs rounded-md hover:bg-fog disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronsRight size={18} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
