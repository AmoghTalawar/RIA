import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ExternalLink,
  BookOpen,
  Quote,
  Users,
  Calendar,
  Hash,
  FileText,
} from 'lucide-react';

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v, def = 0) => {
  if (v == null || v === '' || Number.isNaN(Number(v))) return def;
  return Number(v);
};
const display = (v) => { const s = str(v); return s || 'NA'; };

const QUARTILE_STYLES = {
  Q1: { bg: 'bg-accent-teal-light', text: 'text-accent-teal', border: 'border-accent-teal/30' },
  Q2: { bg: 'bg-accent-indigo-light', text: 'text-accent-indigo', border: 'border-accent-indigo/30' },
  Q3: { bg: 'bg-accent-gold-light', text: 'text-accent-gold', border: 'border-accent-gold/30' },
  Q4: { bg: 'bg-red-50', text: 'text-kle-crimson', border: 'border-kle-crimson/30' },
};

export default function PublicationDetailView({ publication, onBack }) {
  const pub = publication;

  const title = str(pub['PUBLICATION TITLE']);
  const journal = str(pub['SOURCE PUBLICATION']);
  const year = num(pub['YEAR']);
  const month = str(pub['MONTH']);
  const articleType = str(pub['ARTICLE TYPE']);
  const qRank = str(pub['Q RANK(SCS)']);
  const qRankWos = str(pub['Q RANK(WOS)']);
  const doi = str(pub['DOI']);
  const link = str(pub['LINK']);
  const abstract = str(pub['ABSTRACT']);
  const citeScore = num(pub['CITE SCORE']);
  const impactFactor = num(pub['IF']);
  const snip = num(pub['SNIP']);
  const sjr = num(pub['SJR']);
  const volNo = str(pub['VOL NO']);
  const issNo = str(pub['ISS NO']);
  const bPage = str(pub['B PAGE']);
  const ePage = str(pub['E PAGE']);
  const pIssn = str(pub['P ISSN']);
  const eIssn = str(pub['E ISSN']);

  const allAuthors = str(pub['AUTHORS']).split(/[|;]/).map((a) => a.trim()).filter(Boolean);

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
            </div>
            <p className="text-body text-graphite leading-relaxed">
              {abstract || 'NA'}
            </p>
          </div>

          {/* Authors Section */}
          <div className="panel">
            <div className="flex items-center gap-sm mb-md">
              <Users size={16} className="text-kle-crimson" />
              <h3 className="font-heading font-medium text-h3 text-kle-dark">Authors</h3>
              <span className="text-micro text-smoke">({allAuthors.length || 0} total)</span>
            </div>

            {allAuthors.length === 0 ? (
              <p className="text-body text-smoke">NA</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
                {allAuthors.map((author, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="p-sm bg-fog rounded-lg border border-mist flex items-center gap-sm"
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
              <DetailRow icon={Hash} label="Volume" value={volNo ? `Vol. ${volNo}${issNo ? `, Iss. ${issNo}` : ''}` : 'NA'} />
              <DetailRow icon={FileText} label="Pages" value={bPage || ePage ? `${bPage || ''}${ePage ? `–${ePage}` : ''}` : 'NA'} />
              <DetailRow icon={Hash} label="Print ISSN" value={pIssn || 'NA'} />
              <DetailRow icon={Hash} label="e-ISSN" value={eIssn || 'NA'} />
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

          {/* Indexing info */}
          <div className="panel">
            <h3 className="font-heading font-medium text-h3 text-kle-dark mb-md">Indexing</h3>
            <div className="flex flex-wrap gap-xs">
              {num(pub['SCS']) > 0 && <IndexBadge label="Scopus" />}
              {num(pub['WOS']) > 0 && <IndexBadge label="Web of Science" />}
              {num(pub['SCI']) > 0 && <IndexBadge label="SCI" />}
              {num(pub['PM']) > 0 && <IndexBadge label="PubMed" />}
              {num(pub['IEEE']) > 0 && <IndexBadge label="IEEE" />}
              {num(pub['GS']) > 0 && <IndexBadge label="Google Scholar" />}
              {num(pub['UGC']) > 0 && <IndexBadge label="UGC" />}
              {![num(pub['SCS']), num(pub['WOS']), num(pub['SCI']), num(pub['PM']), num(pub['IEEE']), num(pub['GS']), num(pub['UGC'])].some(v => v > 0) && (
                <span className="text-body text-smoke">NA</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-sm">
      <Icon size={14} className="text-smoke mt-[3px] flex-shrink-0" />
      <div>
        <p className="text-micro text-smoke uppercase tracking-wider">{label}</p>
        <p className={`text-body ${value === 'NA' ? 'text-smoke italic' : 'text-kle-dark'}`}>{value}</p>
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
