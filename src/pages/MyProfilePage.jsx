import { useState, useEffect } from 'react';
import { BookOpen, Quote, Award, TrendingUp, BarChart3, Hash, Loader2, UserX, Building2, Filter, MessageCircle, X } from 'lucide-react';
import KPICard from '../components/KPICard';
import DonutChart from '../components/DonutChart';
import StackedBarChart from '../components/StackedBarChart';
import MultiLineChart from '../components/MultiLineChart';
import HorizontalBarChart from '../components/HorizontalBarChart';
import DataTable from '../components/DataTable';
import AIChatbot from '../components/AIChatbot';
import { useAuth, ROLE_LABELS } from '../auth/AuthContext';
import { fetchMyProfileData } from '../lib/supabaseQueries';

const Q_OPTIONS = ['Q1', 'Q2', 'Q3', 'Q4', '—'];
const NO_FILTERS = { year: '', qRank: '', text: '' };

const TABLE_COLUMNS = [
  { key: 'title', label: 'Title', width: '30%' },
  { key: 'year', label: 'Year', type: 'number' },
  { key: 'journal', label: 'Journal' },
  { key: 'qRank', label: 'Q-Rank', type: 'qrank' },
  { key: 'impactFactor', label: 'IF', type: 'number' },
  { key: 'citations', label: 'Citations', type: 'number' },
  { key: 'doi', label: 'DOI', type: 'doi' },
];

/**
 * "My Research Profile" - the signed-in HoD / Dean / VC's own publications and metrics, the same
 * view a Faculty member gets on their dashboard. Every number comes from the database (no placeholders).
 */
export default function MyProfilePage() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [chartFocus, setChartFocus] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchMyProfileData(user)
      .then((data) => { if (!cancelled) setState({ loading: false, error: null, data }); })
      .catch((err) => {
        console.error('Failed to load profile data:', err);
        if (!cancelled) setState({ loading: false, error: err.message, data: null });
      });
    return () => { cancelled = true; };
  }, [user]);

  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-md">
        <Loader2 className="w-10 h-10 text-kle-crimson animate-spin" />
        <p className="text-label text-smoke">Loading your research profile...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-md">
        <p className="text-kle-crimson font-medium">Failed to load your profile</p>
        <p className="text-label text-smoke">{state.error}</p>
      </div>
    );
  }

  const { faculty, pubs, kpis, publicationsPerYear, qRankDistribution, citationTrend, topPapers, table } = state.data;

  if (!faculty) {
    return (
      <div className="panel flex flex-col items-center justify-center h-96 gap-md text-center">
        <UserX className="w-10 h-10 text-smoke" />
        <p className="font-heading font-medium text-kle-dark">No research profile is linked to this account</p>
        <p className="text-label text-smoke max-w-md">
          Ask the R&amp;D office to link {user?.name} to a faculty record so your publications appear here.
        </p>
      </div>
    );
  }

  const yearOptions = [...new Set(table.map((r) => r.year).filter((y) => y !== '—'))].sort((a, b) => b - a);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const filteredTable = table.filter((r) =>
    (!filters.year || String(r.year) === filters.year) &&
    (!filters.qRank || r.qRank === filters.qRank) &&
    (!filters.text || r.journal.toLowerCase().includes(filters.text.toLowerCase())));

  const askAboutPaper = (row) => {
    const prompt = `Tell me about my paper "${row.title}" (${row.year}, ${row.journal}). How is it doing, and how does it compare with my other work?`;
    setChartFocus({
      id: `paper-${row.id}`,
      title: row.title,
      contextSummary: `${row.title}. ${row.year}, ${row.journal}, Scopus ${row.qRank}, ${row.citations} citations, DOI ${row.doi || 'n/a'}.`,
      prompt,
      prefill: prompt,
      questions: [prompt, 'How can I raise the citations of this paper?', 'Which of my other papers are on the same topic?'],
      ts: Date.now(),
    });
  };

  const showIdentity = user?.role !== 'executive-dean' && user?.role !== 'university-dean';
  const q1 = faculty.scopus_q1_count ?? 0;
  const years = pubs.map((p) => p.year).filter(Boolean);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—';

  return (
    <div className="space-y-xl">
      {/* Identity card: not shown for the Executive Dean and VC */}
      {showIdentity && (
      <div className="panel flex flex-wrap items-center gap-lg">
        <div className="w-14 h-14 rounded-full bg-kle-crimson text-white flex items-center justify-center font-heading font-semibold text-xl">
          {(faculty.author_name || user?.name || '?').trim().charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-heading font-semibold text-h2 text-kle-dark">{faculty.author_name || user?.name}</h2>
          <p className="text-label text-smoke">
            {ROLE_LABELS[user?.role]} · {faculty.department}
          </p>
          <p className="text-label text-smoke flex items-center gap-xs">
            <Building2 size={13} /> {faculty.institute}
          </p>
        </div>
        <div className="text-right text-label text-smoke">
          <p>{pubs.length} papers on record · {span}</p>
          <p>Journals {faculty.journal_count ?? 0} · Conferences {faculty.conference_count ?? 0} · Books {faculty.book_count ?? 0}</p>
        </div>
      </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-lg">
        <KPICard label="Total Publications" value={pubs.length} icon={BookOpen} accentColor="kle-crimson" />
        <KPICard label="Scopus Citations" value={kpis.scopusCitations.value} icon={Quote} accentColor="teal" />
        <KPICard label="H-Index" value={kpis.hIndex.value} icon={Award} accentColor="gold" />
        <KPICard label="Q1 Papers" value={q1} icon={TrendingUp} accentColor="teal" />
        <KPICard label="Avg Impact Factor" value={kpis.avgIF.value.toFixed(2)} icon={BarChart3} accentColor="indigo" />
        <KPICard label="i10-Index" value={kpis.i10Index.value} icon={Hash} accentColor="gold" />
      </div>

      {/* Output per year + quartile split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
        <div className="lg:col-span-2">
          <StackedBarChart
            data={publicationsPerYear}
            title="My Publications per Year by Q-Rank"
            xKey="year"
            stackKeys={['Q1', 'Q2', 'Q3', 'Q4']}
            height={320}
          />
        </div>
        <div>
          <DonutChart
            data={qRankDistribution}
            title="Q-Rank Distribution"
            centerValue={qRankDistribution.reduce((sum, item) => sum + item.value, 0)}
            centerLabel="Total"
          />
        </div>
      </div>

      {/* Citations by publication year */}
      <MultiLineChart
        data={citationTrend}
        title="Citations by Publication Year"
        xKey="year"
        series={[
          { key: 'Scopus', name: 'Scopus' },
          { key: 'WoS', name: 'WoS' },
          { key: 'Google Scholar', name: 'Google Scholar' },
        ]}
        height={300}
      />

      {topPapers.length > 0 && (
        <HorizontalBarChart
          data={topPapers}
          title="My Most-Cited Papers"
          subtitle="Sorted by Scopus citations"
          valueKey="value"
          labelKey="name"
          colorKey="qRank"
        />
      )}

      {/* All papers */}
      <DataTable
        data={filteredTable}
        columns={TABLE_COLUMNS}
        title="My Publications"
        sortable
        filterable
        exportable
        pageSize={10}
        onRowClick={(row) => row.doi && window.open(`https://doi.org/${row.doi}`, '_blank')}
        rowAction={{ icon: MessageCircle, title: 'Ask AI about this paper', onClick: askAboutPaper }}
        toolbarExtra={(
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-xs px-md py-sm border rounded-md text-body transition-colors ${
              showFilters || activeFilters ? 'bg-kle-crimson/10 border-kle-crimson text-kle-crimson' : 'bg-fog border-mist text-graphite hover:border-ash'
            }`}
          >
            <Filter size={14} />
            Filter{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        )}
        belowHeader={showFilters && (
          <div className="flex flex-wrap items-end gap-md mb-lg p-md bg-fog border border-mist rounded-lg">
            <label className="text-label text-smoke flex flex-col gap-xs">
              Year
              <select value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                className="px-md py-sm bg-white border border-mist rounded-md text-body text-kle-dark">
                <option value="">All years</option>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="text-label text-smoke flex flex-col gap-xs">
              Q-Rank
              <select value={filters.qRank} onChange={(e) => setFilters({ ...filters, qRank: e.target.value })}
                className="px-md py-sm bg-white border border-mist rounded-md text-body text-kle-dark">
                <option value="">All</option>
                {Q_OPTIONS.map((q) => <option key={q} value={q}>{q === '—' ? 'Unranked' : q}</option>)}
              </select>
            </label>
            <label className="text-label text-smoke flex flex-col gap-xs">
              Journal contains
              <input value={filters.text} onChange={(e) => setFilters({ ...filters, text: e.target.value })}
                placeholder="e.g. Neural"
                className="px-md py-sm bg-white border border-mist rounded-md text-body text-kle-dark w-48" />
            </label>
            {activeFilters > 0 && (
              <button type="button" onClick={() => setFilters(NO_FILTERS)}
                className="flex items-center gap-xs px-md py-sm text-body text-kle-crimson hover:underline">
                <X size={14} /> Clear
              </button>
            )}
          </div>
        )}
      />

      <AIChatbot chartFocus={chartFocus} onChartFocusHandled={() => setChartFocus(null)} />
    </div>
  );
}
