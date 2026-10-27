/**
 * Data loader for University Dean Dashboard.
 * Fetches from self-hosted Supabase (ria schema).
 * Keeps the same loadExcelData / aggregateUniversityData API
 * so existing callers need no changes.
 */
import { fetchAllPublications, fetchAllFaculty, fetchInstituteSummary } from '../lib/supabaseQueries';
import {
  campusFacultyHeatmapData,
  universityResearchLandscape,
  universityHIndexTrend,
  campusTrend,
  nirfTrajectory,
  universityFundingPortfolio,
  universityPhDPipeline,
  peerComparison,
  universityTargets as mockTargets,
} from './mockData';

// Module-level cache — avoids re-fetching when aggregateUniversityData() is
// called synchronously right after loadExcelData().
let _publications = [];
let _faculty = [];
let _instituteSummary = [];

function getCampus(location) {
  const loc = (location || '').toLowerCase();
  if (loc.includes('hubballi') || loc.includes('hubli') || loc.includes('dharwad')) return 'BVB';
  if (loc.includes('belagavi') || loc.includes('belgaum')) return 'Belagavi';
  if (loc.includes('bengaluru') || loc.includes('bangalore')) return 'Bengaluru';
  return 'BVB';
}

/**
 * Fetches all publications + faculty from Supabase and caches them.
 * Returns { publications, allFaculty, instituteSummary }.
 */
export async function loadExcelData() {
  [_publications, _faculty, _instituteSummary] = await Promise.all([
    fetchAllPublications(),
    fetchAllFaculty(),
    fetchInstituteSummary(),
  ]);
  return {
    publications: _publications,
    allFaculty: _faculty,
    instituteSummary: _instituteSummary,
  };
}

/**
 * Computes all aggregated data from the Supabase cache.
 * Must be called after loadExcelData() resolves.
 * Static-only data (NIRF, PhD pipeline, funding) comes from mockData.
 */
export function aggregateUniversityData() {
  const pubs = _publications;
  const faculty = _faculty;

  const qCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
  const artTypeCounts = {};
  const yearCounts = {};
  const campusPubs = { BVB: 0, Belagavi: 0, Bengaluru: 0 };

  pubs.forEach((p) => {
    const qr = p.q_rank_scopus || 'Unranked';
    if (qr in qCounts) qCounts[qr]++;
    else qCounts.Unranked++;

    const at = p.article_type || 'Unknown';
    artTypeCounts[at] = (artTypeCounts[at] || 0) + 1;

    if (p.year) {
      const yr = String(p.year);
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    }

    campusPubs[getCampus(p.home_author_location)]++;
  });

  const totalPubs = pubs.length;
  const q1Pct = totalPubs > 0 ? Math.round((qCounts.Q1 / totalPubs) * 100) : 0;

  const totalCitations = faculty.reduce((s, f) => s + (f.scopus_citation || 0), 0);
  const maxHIndex = faculty.reduce((m, f) => Math.max(m, f.scopus_hindex || 0), 0);

  const sortedYears = Object.keys(yearCounts).sort();
  const lastYr = sortedYears[sortedYears.length - 1];
  const prevYr = sortedYears[sortedYears.length - 2];
  const yoyGrowth =
    lastYr && prevYr && yearCounts[prevYr] > 0
      ? Math.round(((yearCounts[lastYr] - yearCounts[prevYr]) / yearCounts[prevYr]) * 100)
      : 0;

  const availableYears = sortedYears.filter(
    (y) => Number(y) >= 2015 && Number(y) <= 2030
  );

  const topUniversityFaculty = [...faculty]
    .sort((a, b) => (b.scopus_citation || 0) - (a.scopus_citation || 0))
    .slice(0, 10)
    .map((f) => ({
      name: f.author_name,
      value: f.scopus_citation || 0,
      campus: f.short_name || 'BVB',
    }));

  const campusData = [
    { name: 'BVB Hubli',  actual: campusPubs.BVB,      target: 900, color: '#B91C1C' },
    { name: 'Belagavi',   actual: campusPubs.Belagavi,  target: 300, color: '#3730A3' },
    { name: 'Bengaluru',  actual: campusPubs.Bengaluru, target: 150, color: '#0F766E' },
  ];

  const universityKPIs = {
    totalPubs:      { value: totalPubs,      delta: yoyGrowth },
    univHIndex:     { value: maxHIndex,      delta: 8 },
    totalCitations: { value: totalCitations, delta: 22 },
    q1Percent:      { value: q1Pct,          delta: 5 },
    campusSplit: {
      bvb:       totalPubs > 0 ? Math.round((campusPubs.BVB      / totalPubs) * 100) : 0,
      belagavi:  totalPubs > 0 ? Math.round((campusPubs.Belagavi  / totalPubs) * 100) : 0,
      bengaluru: totalPubs > 0 ? Math.round((campusPubs.Bengaluru / totalPubs) * 100) : 0,
    },
    yoyGrowth:   { value: yoyGrowth },
    srgDensity:  { value: 18 },
    cagr5y:      { value: 14.2 },
  };

  const universityTargets = {
    ...mockTargets,
    publications: { ...mockTargets?.publications, current: totalPubs },
    citations:    { ...mockTargets?.citations,    current: totalCitations },
    hIndex:       { ...mockTargets?.hIndex,       current: maxHIndex },
    q1Percent:    { ...mockTargets?.q1Percent,    current: q1Pct },
  };

  const universityQRankDistribution = [
    { name: 'Q1',       value: qCounts.Q1 },
    { name: 'Q2',       value: qCounts.Q2 },
    { name: 'Q3',       value: qCounts.Q3 },
    { name: 'Q4',       value: qCounts.Q4 },
    { name: 'Unranked', value: qCounts.Unranked },
  ].filter((d) => d.value > 0);

  const universityArticleTypes = Object.entries(artTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  return {
    universityKPIs,
    universityTargets,
    universityQRankDistribution,
    topUniversityFaculty,
    campusData,
    campusFacultyHeatmapData,
    universityResearchLandscape,
    universityHIndexTrend,
    campusTrend,
    universityArticleTypes,
    nirfTrajectory,
    universityFundingPortfolio,
    universityPhDPipeline,
    peerComparison,
    rawPublications: pubs,
    publicationsByYearSummary: yearCounts,
    availableYears,
  };
}
