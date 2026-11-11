import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { authedFetch } from '../lib/chatApi';
import {
  ArrowLeft,
  ExternalLink,
  BookOpen,
  Quote,
  Users,
  Calendar,
  Hash,
  FileText,
  Loader2,
  Tag,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_RIA_BACKEND_URL || import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:5002';

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v, def = 0) => {
  if (v == null || v === '' || Number.isNaN(Number(v))) return def;
  return Number(v);
};
// The database keeps some numbers as text with a trailing ".0" ("29.0"); show them as plain numbers.
const plain = (v) => str(v).replace(/\.0+$/, '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const display = (v) => { const s = str(v); return s || 'NA'; };

const QUARTILE_STYLES = {
  Q1: { bg: 'bg-accent-teal-light', text: 'text-accent-teal', border: 'border-accent-teal/30' },
  Q2: { bg: 'bg-accent-indigo-light', text: 'text-accent-indigo', border: 'border-accent-indigo/30' },
  Q3: { bg: 'bg-accent-gold-light', text: 'text-accent-gold', border: 'border-accent-gold/30' },
  Q4: { bg: 'bg-red-50', text: 'text-kle-crimson', border: 'border-kle-crimson/30' },
};

/** Little tag shown on a value that did not come from the database (it came from OpenAlex / Crossref). */
function SourceTag({ source }) {
  if (!source || source === 'database') return null;
  return (
    <span
      className="ml-xs px-xs py-0.5 rounded bg-accent-indigo-light text-accent-indigo text-micro font-medium align-middle"
      title={`Not in the publications database; looked up from ${source} using the DOI. It may differ from the Scopus record.`}
    >
      from {source}
    </span>
  );
}

export default function PublicationDetailView({ publication, onBack }) {
  // The list only carries a slim record; the full one (abstract, authors, volume, pages, ISSN...) is fetched when a
  // paper is opened. Fields the database lacks are filled from OpenAlex / Crossref by the backend and labelled.
  const [full, setFull] = useState(null);
  const [sources, setSources] = useState({});
  const [live, setLive] = useState({});            // current citation counts from OpenAlex / Crossref
  const [outsideStatus, setOutsideStatus] = useState('loading');   // the slower OpenAlex / Crossref step
  const [status, setStatus] = useState('loading');   // 'loading' | 'ok' | 'error'

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setFull(null);
    setSources({});
    setLive({});
    setOutsideStatus('loading');
    const get = (path) => authedFetch(`${API_URL}/api/publications/${publication.pub_id}${path}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

    // 1) the database record, straight away
    get('')
      .then((data) => {
        if (cancelled) return;
        setFull(data.paper);
        setSources(data.sources || {});
        setStatus('ok');
      })
      .catch((err) => {
        console.warn('Could not load full publication details:', err);
        if (!cancelled) setStatus('error');
      });

    // 2) then whatever OpenAlex / Crossref add (missing fields, current citation counts)
    get('/outside')
      .then((data) => {
        if (cancelled) return;
        setFull(data.paper);
        setSources(data.sources || {});
        setLive(data.live_citations || {});
        setOutsideStatus('done');
      })
      .catch(() => { if (!cancelled) setOutsideStatus('failed'); });
    return () => { cancelled = true; };
  }, [publication.pub_id]);

  const pub = full ? { ...publication, ...full } : publication;
  const loading = status === 'loading';

  const title = str(pub.title);
  const journal = str(pub.source_publication);
  const year = num(pub.year);
  const month = MONTHS[Number(pub.month) - 1] || '';
  const articleType = str(pub.article_type);
  const qRank = str(pub.q_rank_scopus);
  const qRankWos = str(pub.q_rank_wos);
  const doi = str(pub.doi);
  const link = str(pub.link);
  const abstract = str(pub.abstract);
  const citeScore = num(pub.cite_score);
  const impactFactor = num(pub.impact_factor);
  const snip = num(pub.snip);
  const sjr = num(pub.sjr);
  const volNo = plain(pub.vol_no);
  const issNo = plain(pub.iss_no);
  const bPage = plain(pub.b_page);
  const ePage = plain(pub.e_page);
  const pIssn = str(pub.p_issn);
  const eIssn = str(pub.e_issn);

  // Author lists use "|" or ";" between names; only fall back to commas when neither is present.
  const splitNames = (v) => {
    const text = str(v);
    return text.split(/[|;]/).length > 1 || !text.includes(',') ? text.split(/[|;]/) : text.split(',');
  };
  const allAuthors = splitNames(pub.authors).map((a) => a.trim()).filter(Boolean);
  const kleAuthors = new Set(splitNames(pub.home_authors).map((a) => a.trim().toLowerCase()).filter(Boolean));
  const techAreas = str(pub.technology_areas).split(/[|;,]/).map((t) => t.trim())
    .filter((t) => t && !['not available', 'na', 'n/a', 'unknown', 'none'].includes(t.toLowerCase()));

  const qStyle = QUARTILE_STYLES[qRank] || { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' };

  const doiLink = doi ? (doi.startsWith('http') ? doi : `https://doi.org/${doi}`) : '';
  const externalUrl = link || doiLink;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
      className="space-y-lg"
    >
      {/* ── Back button ── */}
      <button
        onClick={onBack}
        className="flex items-center gap-xs text-smoke hover:text-kle-crimson transition-colors group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-label font-medium">Back to Publications List</span>
      </button>

      {/* ── Header Card ── */}
      <div className="panel">
        <div className="flex items-start gap-md mb-md">
          <div className="w-10 h-10 bg-kle-crimson/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-xs">
            <FileText size={20} className="text-kle-crimson" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading font-semibold text-h2 text-kle-dark leading-tight mb-sm">
              {title || 'NA'}
            </h2>
            <div className="flex items-center flex-wrap gap-sm">
              <span className="text-body text-graphite">{journal || 'NA'}</span>
              {articleType && (
                <span className="chip bg-fog text-graphite">
                  {articleType}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Metrics Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-md">
          {/* Q-Rank */}
          <div className={`flex flex-col items-center p-sm rounded-lg border ${qStyle.bg} ${qStyle.border}`}>
            <span className="text-micro text-smoke uppercase tracking-wider mb-xs">Q-Rank (Scopus)</span>
            <span className={`font-mono text-lg font-bold ${qStyle.text}`}>{qRank || 'NA'}</span>
          </div>

          {/* Q-Rank WoS */}
          <div className="flex flex-col items-center p-sm rounded-lg border bg-fog border-mist">
            <span className="text-micro text-smoke uppercase tracking-wider mb-xs">Q-Rank (WoS)</span>
            <span className="font-mono text-lg font-bold text-kle-dark">{qRankWos || 'NA'}</span>
          </div>

          {/* Impact Factor */}
          <div className="flex flex-col items-center p-sm rounded-lg border bg-fog border-mist">
            <span className="text-micro text-smoke uppercase tracking-wider mb-xs">Impact Factor</span>
            <span className="font-mono text-lg font-bold text-kle-dark">{impactFactor || 'NA'}</span>
          </div>

          {/* Cite Score */}
          <div className="flex flex-col items-center p-sm rounded-lg border bg-fog border-mist">
            <span className="text-micro text-smoke uppercase tracking-wider mb-xs">Cite Score</span>
            <span className="font-mono text-lg font-bold text-kle-dark">{citeScore || 'NA'}</span>
          </div>

          {/* SNIP */}
          <div className="flex flex-col items-center p-sm rounded-lg border bg-fog border-mist">
            <span className="text-micro text-smoke uppercase tracking-wider mb-xs">SNIP</span>
            <span className="font-mono text-lg font-bold text-kle-dark">{snip || 'NA'}</span>
          </div>

          {/* SJR */}
          <div className="flex flex-col items-center p-sm rounded-lg border bg-fog border-mist">
            <span className="text-micro text-smoke uppercase tracking-wider mb-xs">SJR</span>
            <span className="font-mono text-lg font-bold text-kle-dark">{sjr || 'NA'}</span>
          </div>
        </div>
      </div>

      {/* ── Publication Info ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* Left — Details */}
        <div className="lg:col-span-2 space-y-lg">
          {/* Abstract */}
          <div className="panel">
            <div className="flex items-center gap-sm mb-md">
              <Quote size={16} className="text-kle-crimson" />
              <h3 className="font-heading font-medium text-h3 text-kle-dark">Abstract</h3>
              <SourceTag source={sources.abstract} />
            </div>
            {loading ? (
              <p className="text-body text-smoke flex items-center gap-xs"><Loader2 size={14} className="animate-spin" /> Loading abstract...</p>
            ) : abstract ? (
              <p className="text-body text-graphite leading-relaxed whitespace-pre-line">{abstract}</p>
            ) : outsideStatus === 'loading' ? (
              <p className="text-body text-smoke flex items-center gap-xs"><Loader2 size={14} className="animate-spin" /> Not in the database; looking for it online...</p>
            ) : (
              <p className="text-body text-smoke italic">
                No abstract is available for this paper{status === 'error' ? ' (the full record could not be loaded)' : ''}.
              </p>
            )}
          </div>

          {/* Topics */}
          {techAreas.length > 0 && (
            <div className="panel">
              <div className="flex items-center gap-sm mb-md">
                <Tag size={16} className="text-kle-crimson" />
                <h3 className="font-heading font-medium text-h3 text-kle-dark">Topics</h3>
              </div>
              <div className="flex flex-wrap gap-xs">
                {techAreas.map((t) => (
                  <span key={t} className="px-sm py-xs bg-fog border border-mist rounded-md text-label text-graphite">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Authors Section */}
          <div className="panel">
            <div className="flex items-center gap-sm mb-md">
              <Users size={16} className="text-kle-crimson" />
              <h3 className="font-heading font-medium text-h3 text-kle-dark">Authors</h3>
              <span className="text-micro text-smoke">({loading ? '...' : allAuthors.length} total{kleAuthors.size ? `, ${kleAuthors.size} from KLE Tech` : ''})</span>
            </div>

            {loading ? (
              <p className="text-body text-smoke flex items-center gap-xs"><Loader2 size={14} className="animate-spin" /> Loading authors...</p>
            ) : allAuthors.length === 0 ? (
              <p className="text-body text-smoke italic">No author list is available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
                {allAuthors.map((author, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`p-sm rounded-lg border flex items-center gap-sm ${kleAuthors.has(author.toLowerCase()) ? 'bg-kle-crimson/5 border-kle-crimson/30' : 'bg-fog border-mist'}`}
                    title={kleAuthors.has(author.toLowerCase()) ? 'KLE Tech author' : undefined}
                  >
                    <div className="w-8 h-8 rounded-full bg-kle-crimson/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-micro font-bold text-kle-crimson">
                        {author.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="font-heading font-medium text-body text-kle-dark">{author}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — Sidebar info */}
        <div className="space-y-lg">
          {/* Publication Details */}
          <div className="panel">
            <h3 className="font-heading font-medium text-h3 text-kle-dark mb-md">Details</h3>
            <div className="space-y-sm">
              <DetailRow icon={Calendar} label="Year" value={year ? `${year}${month ? ` · ${month}` : ''}` : 'NA'} />
              <DetailRow icon={BookOpen} label="Journal" value={journal || 'NA'} />
              <DetailRow icon={Hash} label="Volume" value={volNo ? `Vol. ${volNo}${issNo ? `, Iss. ${issNo}` : ''}` : 'NA'} source={sources.vol_no || sources.iss_no} />
              <DetailRow icon={FileText} label="Pages" value={bPage || ePage ? `${bPage || ''}${ePage && ePage !== bPage ? `–${ePage}` : ''}` : 'NA'} source={sources.b_page || sources.e_page} />
              <DetailRow icon={Hash} label="Print ISSN" value={pIssn || 'NA'} source={sources.p_issn} />
              <DetailRow icon={Hash} label="e-ISSN" value={eIssn || 'NA'} source={sources.e_issn} />
            </div>
          </div>

          {/* DOI / Link */}
          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="panel flex items-center gap-md group hover:border-kle-crimson transition-colors cursor-pointer block"
            >
              <div className="w-10 h-10 bg-kle-crimson/10 rounded-lg flex items-center justify-center group-hover:bg-kle-crimson/20 transition-colors">
                <ExternalLink size={18} className="text-kle-crimson" />
              </div>
              <div className="flex-1">
                <p className="text-label font-medium text-kle-dark group-hover:text-kle-crimson transition-colors">View Publication</p>
                <p className="text-micro text-smoke truncate">{doi || link}</p>
              </div>
            </a>
          ) : (
            <div className="panel flex items-center gap-md">
              <div className="w-10 h-10 bg-fog rounded-lg flex items-center justify-center">
                <ExternalLink size={18} className="text-smoke" />
              </div>
              <div className="flex-1">
                <p className="text-label font-medium text-kle-dark">DOI / Link</p>
                <p className="text-micro text-smoke">NA</p>
              </div>
            </div>
          )}

          {/* Citations */}
          <div className="panel">
            <h3 className="font-heading font-medium text-h3 text-kle-dark mb-md flex items-center gap-sm">
              <Quote size={14} className="text-kle-crimson" /> Citations
            </h3>
            <div className="grid grid-cols-2 gap-sm">
              {[['Scopus', pub.scs_citations], ['Web of Science', pub.wos_citations_pub], ['IEEE', pub.ieee_citations], ['Google Scholar', pub.gs_citations_pub]].map(([label, v]) => (
                <div key={label} className="p-sm bg-fog rounded-lg border border-mist">
                  <p className="text-micro text-smoke uppercase tracking-wider">{label}</p>
                  <p className="font-mono text-lg font-bold text-kle-dark">{v == null ? 'NA' : Number(v).toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>

            {/* Current counts, looked up by DOI: the stored ones come from an export and can be out of date. */}
            {/* Shown only while checking or when there is something to show; nothing at all otherwise. */}
            {doi && (outsideStatus === 'loading' || Object.keys(live).length > 0) && (
            <div className="mt-md pt-md border-t border-mist">
              <p className="text-micro text-smoke uppercase tracking-wider mb-sm">Current counts (looked up by DOI)</p>
              {outsideStatus === 'loading' ? (
                <p className="text-label text-smoke flex items-center gap-xs"><Loader2 size={14} className="animate-spin" /> Checking...</p>
              ) : (
                <div className="grid grid-cols-2 gap-sm">
                  {Object.entries(live).map(([name, info]) => (
                    <div key={name} className="p-sm bg-accent-indigo-light/40 rounded-lg border border-accent-indigo/20">
                      <p className="text-micro text-smoke uppercase tracking-wider">{name}</p>
                      <p className="font-mono text-lg font-bold text-kle-dark">{Number(info.count).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              )}
              {live.OpenAlex?.url && (
                <a href={live.OpenAlex.url} target="_blank" rel="noopener noreferrer"
                  className="mt-sm inline-flex items-center gap-xs text-label font-medium text-kle-crimson hover:underline">
                  View the papers that cite this one <ExternalLink size={13} />
                </a>
              )}
              {outsideStatus !== 'loading' && (
                <p className="mt-sm text-micro text-smoke">
                  Each service counts differently, so the numbers can disagree with each other and with Scopus.
                </p>
              )}
            </div>
            )}
          </div>

          {/* Indexing info */}
          <div className="panel">
            <h3 className="font-heading font-medium text-h3 text-kle-dark mb-md">Indexing</h3>
            <div className="flex flex-wrap gap-xs">
              {pub.scs_citations != null && <IndexBadge label="Scopus" />}
              {pub.wos_citations_pub != null && <IndexBadge label="Web of Science" />}
              {pub.is_sci === true && <IndexBadge label="SCI" />}
              {pub.is_pm === true && <IndexBadge label="PubMed" />}
              {pub.gs_citations_pub != null && <IndexBadge label="Google Scholar" />}
              {pub.is_ugc === true && <IndexBadge label="UGC" />}
              {pub.scs_citations == null && pub.wos_citations_pub == null && !pub.is_sci && !pub.is_pm && pub.gs_citations_pub == null && !pub.is_ugc && (
                <span className="text-body text-smoke">NA</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DetailRow({ icon: Icon, label, value, source }) {
  return (
    <div className="flex items-start gap-sm">
      <Icon size={14} className="text-smoke mt-[3px] flex-shrink-0" />
      <div>
        <p className="text-micro text-smoke uppercase tracking-wider">{label}</p>
        <p className={`text-body ${value === 'NA' ? 'text-smoke italic' : 'text-kle-dark'}`}>{value}<SourceTag source={source} /></p>
      </div>
    </div>
  );
}

function IndexBadge({ label }) {
  return (
    <span className="px-sm py-xs bg-fog border border-mist rounded-md text-micro text-graphite font-medium">
      {label}
    </span>
  );
}
