import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Download, Loader2, CheckCircle2, X,
  Users, BookOpen, BarChart3, Award, Building2, TrendingUp,
  Quote, Hash, Calendar,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  fetchStaffData,
  aggregateUniversityDataFromSupabase,
} from '../lib/supabaseQueries';

/* ── CSV helper ── */
function csvDownload(filename, rows) {
  if (!rows.length) return;
  const header = Object.keys(rows[0]).join(',');
  const body = rows.map(r =>
    Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Faculty report row builders ── */
function buildFacultyRows(key, staffData) {
  if (!staffData) return [];
  const { publicationsTableData, citationTrend, multiYearComparison, quarterlyQRankComparison } = staffData;

  switch (key) {
    case 'my-publications':
      return (publicationsTableData || []).map((p, i) => ({
        No: i + 1,
        Title: p.title,
        Year: p.year,
        Journal: p.journal,
        QRank: p.qRank,
        ImpactFactor: p.impactFactor,
        Citations: p.citations,
        DOI: p.doi || '—',
      }));

    case 'citation-history':
      return (citationTrend || []).map(row => ({
        Year: row.year,
        Scopus: row.Scopus ?? 0,
        WoS: row.WoS ?? 0,
        GoogleScholar: row['Google Scholar'] ?? 0,
      }));

    case 'research-metrics':
      return (multiYearComparison?.years || []).map((yr, i) => ({
        Year: yr,
        Papers: multiYearComparison.papers[i],
        HIndex: multiYearComparison.hIndex[i],
        Citations: multiYearComparison.citations[i],
        Q1Percent: `${multiYearComparison.q1Percent[i]}%`,
        AvgIF: multiYearComparison.avgIF[i],
        i10Index: multiYearComparison.i10Index[i],
      }));

    case 'qrank-quarterly':
      return (quarterlyQRankComparison || []).map(row => ({
        Quarter: row.quarter,
        Q1: row.Q1 ?? 0,
        Q2: row.Q2 ?? 0,
        Q3: row.Q3 ?? 0,
        Q4: row.Q4 ?? 0,
        Total: (row.Q1 ?? 0) + (row.Q2 ?? 0) + (row.Q3 ?? 0) + (row.Q4 ?? 0),
      }));

    default:
      return [];
  }
}

/* ── University report row builders ── */
function buildUniversityRows(key, data) {
  if (!data) return [];
  const {
    topUniversityFaculty,
    universityQRankDistribution,
    campusTrend,
    universityKPIs,
    universityResearchLandscape,
    campusData,
  } = data;

  switch (key) {
    case 'top-faculty':
      return (topUniversityFaculty || []).map((f, i) => ({
        Rank: i + 1,
        Name: f.name,
        Department: f.dept || f.department || '—',
        Campus: f.campus || '—',
        Citations: f.value,
        HIndex: f.hIndex ?? '—',
        TotalPublications: f.pubs ?? '—',
      }));

    case 'pub-summary':
      return (campusTrend || []).map(row => ({
        Year: row.year,
        BVB: row.BVB ?? 0,
        Belagavi: row.Belagavi ?? 0,
        Bengaluru: row.Bengaluru ?? 0,
        Total: (row.BVB ?? 0) + (row.Belagavi ?? 0) + (row.Bengaluru ?? 0),
      }));

    case 'dept-rankings':
      return (universityResearchLandscape || [])
        .slice()
        .sort((a, b) => (b.pubs ?? 0) - (a.pubs ?? 0))
        .map((d, i) => ({
          Rank: i + 1,
          Department: d.name,
          Campus: d.campus ?? '—',
          Publications: d.pubs ?? 0,
          Citations: d.citations ?? 0,
          HIndex: d.hIndex ?? '—',
        }));

    case 'univ-overview':
      return [
        { Metric: 'Total Publications', Value: universityKPIs?.totalPubs?.value ?? '—', YoYDelta: `+${universityKPIs?.totalPubs?.delta ?? 0}%` },
        { Metric: 'University H-Index', Value: universityKPIs?.univHIndex?.value ?? '—', YoYDelta: `+${universityKPIs?.univHIndex?.delta ?? 0}%` },
        { Metric: 'Total Citations', Value: universityKPIs?.totalCitations?.value?.toLocaleString('en-IN') ?? '—', YoYDelta: `+${universityKPIs?.totalCitations?.delta ?? 0}%` },
        { Metric: 'Q1 Publications %', Value: `${universityKPIs?.q1Percent?.value ?? '—'}%`, YoYDelta: `+${universityKPIs?.q1Percent?.delta ?? 0}%` },
        { Metric: 'YoY Growth', Value: `+${universityKPIs?.yoyGrowth?.value ?? '—'}%`, YoYDelta: '—' },
        { Metric: 'Q-Rank Distribution', Value: (universityQRankDistribution || []).map(q => `${q.name}: ${q.value}`).join(' | '), YoYDelta: '—' },
        ...(campusData || []).map(c => ({
          Metric: `${c.name} Campus`,
          Value: `${c.actual} pubs`,
          YoYDelta: `Target: ${c.target}`,
        })),
      ];

    default:
      return [];
  }
}

function buildFacultyReportDefs(staffData) {
  const kpis = staffData?.staffKPIs || {};
  const profile = staffData?.facultyProfile || {};
  return [
    {
      key: 'my-publications',
      icon: BookOpen,
      title: 'My Publications',
      description: `Full list of ${profile.name || 'faculty'}'s publications with Q-rank, impact factor, and citations.`,
      color: 'text-kle-crimson',
      bg: 'bg-kle-crimson/10',
      stat: `${kpis.totalPubs?.value ?? '—'} papers`,
    },
    {
      key: 'citation-history',
      icon: Quote,
      title: 'Citation History',
      description: 'Year-wise citation counts across Scopus, Web of Science, and Google Scholar.',
      color: 'text-accent-teal',
      bg: 'bg-accent-teal/10',
      stat: `${kpis.scopusCitations?.value ?? '—'} Scopus citations`,
    },
    {
      key: 'research-metrics',
      icon: TrendingUp,
      title: 'Research Metrics (Year-over-Year)',
      description: 'Papers, h-index, citations, Q1%, avg IF, and i10-index across all years.',
      color: 'text-accent-indigo',
      bg: 'bg-accent-indigo/10',
      stat: `H-Index: ${kpis.hIndex?.value ?? '—'}`,
    },
    {
      key: 'qrank-quarterly',
      icon: Calendar,
      title: 'Q-Rank Quarterly Breakdown',
      description: 'Q1/Q2/Q3/Q4 publication counts per quarter over the last 5 quarters.',
      color: 'text-accent-gold',
      bg: 'bg-accent-gold/10',
      stat: `Q1+Q2: ${kpis.q1q2Percent?.value ?? '—'}%`,
    },
  ];
}

const UNIVERSITY_REPORTS = [
  {
    key: 'top-faculty',
    icon: Users,
    title: 'Top Faculty Performance',
    description: 'University-wide top faculty ranked by Scopus citations and h-index.',
    color: 'text-kle-crimson',
    bg: 'bg-kle-crimson/10',
  },
  {
    key: 'pub-summary',
    icon: BarChart3,
    title: 'Publication Summary by Campus',
    description: 'Year-wise publication counts split across BVB, Belagavi, and Bengaluru campuses.',
    color: 'text-accent-teal',
    bg: 'bg-accent-teal/10',
  },
  {
    key: 'dept-rankings',
    icon: Building2,
    title: 'Department Rankings',
    description: 'Departments ranked by total publications, citations, and h-index.',
    color: 'text-accent-indigo',
    bg: 'bg-accent-indigo/10',
  },
  {
    key: 'univ-overview',
    icon: Award,
    title: 'University Overview',
    description: 'High-level KPIs — total publications, citations, Q1%, campus split.',
    color: 'text-accent-gold',
    bg: 'bg-accent-gold/10',
  },
];

/* ── Preview table ── */
function PreviewTable({ rows }) {
  if (!rows.length) return <p className="text-sm text-smoke">No data available.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-lg border border-mist max-h-64 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-fog sticky top-0">
          <tr>
            {cols.map(c => (
              <th key={c} className="px-md py-sm text-left text-label text-smoke font-medium whitespace-nowrap border-b border-mist">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-fog/50'}>
              {cols.map(c => (
                <td key={c} className="px-md py-sm text-graphite whitespace-nowrap max-w-[200px] truncate" title={String(row[c])}>{row[c]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Report card ── */
function ReportCard({ def, rows, isGenerated, onGenerate, onDownload, onCancel }) {
  const Icon = def.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel space-y-md animate-fade-in-up"
    >
      <div className="flex items-start gap-md">
        <div className={`w-10 h-10 rounded-lg ${def.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={20} className={def.color} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-medium text-kle-dark text-h2">{def.title}</h3>
          <p className="text-label text-smoke mt-xs">{def.description}</p>
          {def.stat && <p className={`text-micro font-mono mt-xs ${def.color}`}>{def.stat}</p>}
        </div>
        {isGenerated && (
          <div className="flex items-center gap-xs flex-shrink-0 mt-1">
            <CheckCircle2 size={18} className="text-success" />
            <button
              onClick={onCancel}
              title="Close preview"
              className="p-xs rounded-md text-smoke hover:text-kle-crimson hover:bg-kle-crimson/10 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {isGenerated && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <PreviewTable rows={rows} />
          <p className="text-micro text-smoke mt-xs">{rows.length} rows · Generated {new Date().toLocaleTimeString()}</p>
        </motion.div>
      )}

      <div className="flex items-center gap-sm pt-xs">
        <button onClick={onGenerate} className="btn btn-secondary text-sm flex items-center gap-xs">
          <BarChart3 size={14} />
          {isGenerated ? 'Regenerate' : 'Generate Preview'}
        </button>
        {isGenerated && (
          <button onClick={onDownload} className="btn btn-primary text-sm flex items-center gap-xs">
            <Download size={14} />
            Export CSV
          </button>
        )}
        {isGenerated && (
          <button onClick={onCancel} className="btn btn-secondary text-sm flex items-center gap-xs text-smoke">
            <X size={14} />
            Cancel
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ── Section header ── */
function SectionHeader({ title, subtitle }) {
  return (
    <div className="border-l-4 border-kle-crimson pl-md mt-xl mb-md">
      <h2 className="font-display text-h1 text-kle-dark">{title}</h2>
      <p className="text-label text-smoke mt-xs">{subtitle}</p>
    </div>
  );
}

/* ── Page ── */
export default function ReportsPage() {
  const { user } = useAuth();
  const [staffData, setStaffData] = useState(null);
  const [staffLoading, setStaffLoading] = useState(true);
  const [univLoading, setUnivLoading] = useState(true);
  const [univError, setUnivError] = useState(null);
  const [univData, setUnivData] = useState(null);
  const [generatedKeys, setGeneratedKeys] = useState(new Set());
  const [rowCache, setRowCache] = useState({});

  const isFacultyRole = user?.role === 'staff' || user?.role === 'hod';
  const isUnivRole = user?.role === 'faculty-dean' || user?.role === 'executive-dean' || user?.role === 'university-dean';

  useEffect(() => {
    if (!isFacultyRole) {
      setStaffLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setStaffLoading(true);
        const data = await fetchStaffData(user);
        if (!cancelled) setStaffData(data);
      } catch (err) {
        console.error('Failed to load staff data:', err);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isFacultyRole]);

  useEffect(() => {
    if (!isUnivRole) {
      setUnivLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setUnivLoading(true);
        const data = await aggregateUniversityDataFromSupabase();
        if (!cancelled) { setUnivData(data); setUnivLoading(false); }
      } catch (err) {
        if (!cancelled) { setUnivError(err.message); setUnivLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [isUnivRole]);

  const FACULTY_REPORTS = buildFacultyReportDefs(staffData);

  const cancel = (key) => {
    setGeneratedKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
  };

  const generate = (key, isFaculty) => {
    const rows = isFaculty
      ? buildFacultyRows(key, staffData)
      : buildUniversityRows(key, univData);
    setRowCache(prev => ({ ...prev, [key]: rows }));
    setGeneratedKeys(prev => new Set([...prev, key]));
  };

  const download = (key, title) => {
    const rows = rowCache[key] || [];
    const date = new Date().toISOString().slice(0, 10);
    csvDownload(`KLE_RIA_${title.replace(/\s+/g, '_')}_${date}.csv`, rows);
  };

  const downloadAll = () => {
    if (isFacultyRole && staffData) {
      FACULTY_REPORTS.forEach(d => {
        const rows = buildFacultyRows(d.key, staffData);
        const date = new Date().toISOString().slice(0, 10);
        csvDownload(`KLE_RIA_${d.title.replace(/\s+/g, '_')}_${date}.csv`, rows);
        setRowCache(prev => ({ ...prev, [d.key]: rows }));
      });
      setGeneratedKeys(prev => new Set([...prev, ...FACULTY_REPORTS.map(d => d.key)]));
    }
    if (isUnivRole && univData) {
      UNIVERSITY_REPORTS.forEach(d => {
        const rows = buildUniversityRows(d.key, univData);
        const date = new Date().toISOString().slice(0, 10);
        csvDownload(`KLE_RIA_${d.title.replace(/\s+/g, '_')}_${date}.csv`, rows);
        setRowCache(prev => ({ ...prev, [d.key]: rows }));
      });
      setGeneratedKeys(prev => new Set([...prev, ...UNIVERSITY_REPORTS.map(d => d.key)]));
    }
  };

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-md">
          <div className="w-10 h-10 bg-kle-crimson rounded-lg flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-h1 text-kle-dark">Research Reports</h1>
            <p className="text-label text-smoke">Generate and export research data reports · KLE Technological University</p>
          </div>
        </div>
        <button onClick={downloadAll} className="btn btn-primary flex items-center gap-sm text-sm">
          <Download size={14} />
          Export All Reports
        </button>
      </div>

      {/* ── Faculty KPI strip ── */}
      {isFacultyRole && (
        staffLoading ? (
          <div className="flex items-center gap-md text-smoke p-lg">
            <Loader2 size={18} className="animate-spin text-kle-crimson" />
            <span className="text-label">Loading faculty data…</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md animate-fade-in-up">
            {[
              { label: 'Total Publications', value: staffData?.staffKPIs?.totalPubs?.value ?? '—', icon: BookOpen },
              { label: 'Scopus Citations', value: staffData?.staffKPIs?.scopusCitations?.value ?? '—', icon: Quote },
              { label: 'H-Index', value: staffData?.staffKPIs?.hIndex?.value ?? '—', icon: Award },
              { label: 'Q1+Q2 %', value: staffData?.staffKPIs?.q1q2Percent?.value != null ? `${staffData.staffKPIs.q1q2Percent.value}%` : '—', icon: Hash },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="panel flex items-center gap-md">
                <div className="w-9 h-9 bg-kle-crimson/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className="text-kle-crimson" />
                </div>
                <div>
                  <p className="text-label text-smoke">{label}</p>
                  <p className="font-heading font-semibold text-kle-dark text-lg">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Faculty Reports ── */}
      {isFacultyRole && (
        <>
          <SectionHeader
            title="Faculty Reports"
            subtitle={`Personal research reports for ${staffData?.facultyProfile?.name ?? user?.name ?? 'Faculty'} · ${staffData?.facultyProfile?.department ?? user?.department ?? ''}`}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            {FACULTY_REPORTS.map(def => (
              <ReportCard
                key={def.key}
                def={def}
                rows={rowCache[def.key] || []}
                isGenerated={generatedKeys.has(def.key)}
                onGenerate={() => generate(def.key, true)}
                onDownload={() => download(def.key, def.title)}
                onCancel={() => cancel(def.key)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── University Reports ── */}
      {isUnivRole && (
        <>
          <SectionHeader
            title="University Reports"
            subtitle="Aggregated research analytics across KLE Technological University"
          />
          {univLoading ? (
            <div className="flex items-center gap-md text-smoke p-lg">
              <Loader2 size={18} className="animate-spin text-kle-crimson" />
              <span className="text-label">Loading university data…</span>
            </div>
          ) : univError ? (
            <div className="panel text-kle-crimson text-sm">{univError}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
              {UNIVERSITY_REPORTS.map(def => (
                <ReportCard
                  key={def.key}
                  def={def}
                  rows={rowCache[def.key] || []}
                  isGenerated={generatedKeys.has(def.key)}
                  onGenerate={() => generate(def.key, false)}
                  onDownload={() => download(def.key, def.title)}
                  onCancel={() => cancel(def.key)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div className="text-label text-smoke pt-md border-t border-mist">
        v1.0 · Dean R&D Office · KLE Technological University · Data sourced from RIA Faculty &amp; Publications dataset
      </div>
    </div>
  );
}
