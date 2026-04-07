-- ============================================================
--  FACULTY LEVEL — COMPLETE VERIFICATION QUERIES
--  Based on RIA Specification v2  Section 3.3.4 + Section 4.1
--
--  User    : sunil@faculty.com
--  UUID    : 201a3801-c429-423d-a438-b13a049954d4
--  Faculty : Sunil Gurlahosur V  (ria_user_id = 232727)
--  Dept    : Computer Science and Engineering
--  Institute: School of Computer Science and Engineering
--
--  Known facts from source data (ground truth):
--    Total publications    : 34
--    Scopus publications   : 26
--    Scopus citations      : 268
--    Scopus h-index        : 7
--    Scopus Q1 count       : 1
--    Journal count         : 10
--    Conference count      : 20
--    Book chapters         : 4
--    Dept faculty count    : 132
--    Dept avg h-index      : 2.8
--    Dept avg total pubs   : 15.2
--    Dept avg citations    : 88.7
--    Dept max h-index      : 17
--
--  PASTE THESE SET LOCAL LINES AT THE TOP OF EVERY QUERY WINDOW
-- ============================================================

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{
    "sub":  "201a3801-c429-423d-a438-b13a049954d4",
    "role": "authenticated"
}';


-- ============================================================
-- ── BASIC QUERIES (what Faculty should be able to see) ──────
-- ============================================================


-- ── B1: My complete profile card ────────────────────────────
-- Spec: "Personal research profile, citation impact, h-index"
-- Expected: 1 row with all of Sunil's bibliometric metrics

SELECT
    author_name,
    total_pub_count,       -- expected: 34
    scopus_pub_count,      -- expected: 26
    wos_pub_count,         -- expected: 7
    scopus_citation,       -- expected: 268
    scopus_hindex,         -- expected: 7
    wos_hindex,            -- expected: 4
    gs_hindex,             -- expected: 3
    scopus_i10_index,      -- expected: 7
    scopus_q1_count,       -- expected: 1
    journal_count,         -- expected: 10
    conference_count,      -- expected: 20
    book_chapter_count,    -- expected: 4
    avg_snip,              -- expected: 0.33
    avg_citescore,         -- expected: 1.67
    avg_impfactor          -- expected: 0.65
FROM public.faculty;

-- ✔ PASS: 1 row, numbers match above
-- ✗ FAIL: more than 1 row or wrong numbers


-- ── B2: Total publication count ──────────────────────────────
-- Spec: "Publication count" at Faculty level
-- Expected: matches 34 (Sunil's total from faculty table)

SELECT
    COUNT(*)                                             AS total_publications,
    COUNT(*) FILTER (WHERE article_type = 'Journal')    AS journals,
    COUNT(*) FILTER (WHERE article_type = 'Conference') AS conferences,
    COUNT(*) FILTER (WHERE article_type = 'Book Chapter') AS book_chapters,
    COUNT(*) FILTER (WHERE article_type = 'PrePrint')   AS preprints
FROM public.publications;

-- ✔ PASS: total <= 34  (junction table may have slightly less than faculty.total_pub_count)
-- ✗ FAIL: total = 6516 (all publications visible — RLS broken)


-- ── B3: All my publications — full list ──────────────────────
-- Spec: "Publication trajectory"
-- Expected: only Sunil's publications, newest first

SELECT
    pub_id,
    year,
    title,
    article_type,
    level,
    source_publication,
    q_rank_scopus,
    q_rank_wos,
    impact_factor,
    scs_citations,
    wos_citations_pub,
    abdc_grade,
    naac,
    nirf,
    is_indexed,
    fp.is_corresponding
FROM      public.publications         p
JOIN      public.faculty_publications fp ON fp.publication_id = p.id
ORDER BY  year DESC, month DESC NULLS LAST;

-- ✔ PASS: all rows are Sunil's publications only
-- ✗ FAIL: publications from other faculty appear


-- ── B4: Past 1 year publications ────────────────────────────
-- Spec: "Publication trajectory" — recent output
-- Expected: Sunil's publications from 2025 onwards

SELECT
    pub_id,
    year,
    month,
    title,
    article_type,
    source_publication,
    q_rank_scopus,
    impact_factor,
    scs_citations,
    fp.is_corresponding
FROM      public.publications         p
JOIN      public.faculty_publications fp ON fp.publication_id = p.id
WHERE     year >= EXTRACT(YEAR FROM NOW()) - 1
ORDER BY  year DESC, month DESC NULLS LAST;

-- ✔ PASS: only Sunil's recent publications (year >= 2025)
-- ✗ FAIL: shows other faculty recent publications


-- ── B5: Year-wise publication trend ─────────────────────────
-- Spec: "Publication trajectory" chart data
-- Expected: Sunil's output grouped by year

SELECT
    year,
    COUNT(*)                                             AS total,
    COUNT(*) FILTER (WHERE article_type = 'Journal')    AS journals,
    COUNT(*) FILTER (WHERE article_type = 'Conference') AS conferences,
    COUNT(*) FILTER (WHERE q_rank_scopus = 'Q1')        AS q1_pubs,
    SUM(scs_citations)                                   AS total_scopus_cites
FROM      public.publications         p
JOIN      public.faculty_publications fp ON fp.publication_id = p.id
WHERE     year IS NOT NULL
GROUP BY  year
ORDER BY  year DESC;

-- ✔ PASS: shows Sunil's year-wise breakdown
-- ✗ FAIL: inflated numbers from other faculty mixed in


-- ── B6: Department aggregate — benchmark comparison ──────────
-- Spec: "Self-assessment against department averages"
-- Expected: 1 aggregate row for CSE dept
--   faculty_count      ≈ 132
--   avg_scopus_hindex  ≈ 2.8
--   avg total_pubs     ≈ 15.2

SELECT
    department_name,
    institute_name,
    faculty_count,          -- expected ≈ 132
    total_publications,     -- expected: CSE dept total
    avg_scopus_hindex,      -- expected ≈ 2.8
    max_scopus_hindex,      -- expected: 17
    total_q1_scopus,
    total_journals,
    total_conferences
FROM public.v_dept_aggregate;

-- ✔ PASS: 1 row showing CSE dept aggregates
-- ✗ FAIL: 0 rows (profile dept_id not set) or multiple dept rows


-- ── B7: Self-assessment — my metrics vs department average ───
-- Spec: "How do I compare with my department average?"
-- Expected: Sunil's own numbers alongside dept averages + delta

-- ✔ PASS: 1 row, delta values positive (Sunil is above dept avg)
-- ✗ FAIL: 0 rows or NULL dept averages


-- ── B8: My Scopus-indexed publications only ──────────────────
-- Spec: "Journal quality, citation impact"

SELECT
    pub_id,
    year,
    title,
    source_publication,
    q_rank_scopus,
    scs_citations,
    impact_factor,
    cite_score,
    snip
FROM      public.publications         p
JOIN      public.faculty_publications fp ON fp.publication_id = p.id
WHERE     scs_citations IS NOT NULL       -- only Scopus-indexed
ORDER BY  scs_citations DESC;

-- ✔ PASS: only Scopus-indexed pubs from Sunil
-- ✗ FAIL: other faculty publications included


-- ============================================================
-- ── RLS QUERIES (what Faculty must NOT be able to see) ──────
-- ============================================================


-- ── R1: Try to see ALL faculty rows ─────────────────────────
-- Expected: 1 row only (own). Must NOT return 739.

SELECT COUNT(*) AS visible_faculty_rows FROM public.faculty;

-- ✔ RLS WORKING : returns 1
-- ✗ RLS BROKEN  : returns 739


-- ── R2: Try to read a specific colleague directly ────────────
-- Querying Tejraj Aminabhavi (ria_user_id = 233046)
-- Expected: 0 rows — Sunil must not see Tejraj's data

SELECT
    author_name,
    total_pub_count,
    scopus_hindex,
    scopus_citation
FROM public.faculty
WHERE ria_user_id = 233046;

-- ✔ RLS WORKING : 0 rows
-- ✗ RLS BROKEN  : Tejraj's row returned (privacy breach)


-- ── R3: Try to read ALL publications ────────────────────────
-- Expected: only Sunil's count. Must NOT return 6516.

SELECT COUNT(*) AS visible_pub_rows FROM public.publications;

-- ✔ RLS WORKING : small number (Sunil's own pubs only)
-- ✗ RLS BROKEN  : 6516


-- ── R4: Try to read a colleague's publications ───────────────
-- Querying publications belonging to Tejraj (ria_user_id = 233046)
-- Expected: 0 rows

SELECT pub_id, title, year
FROM   public.publications
WHERE  staff_ria_user_id = 233046;

-- ✔ RLS WORKING : 0 rows
-- ✗ RLS BROKEN  : Tejraj's publications visible


-- ── R5: Try to see other departments ────────────────────────
-- Faculty must see only their own department (1 row)
-- Expected: 1 row — Computer Science and Engineering

SELECT id, name FROM public.departments;

-- ✔ RLS WORKING : 1 row (own dept)
-- ✗ RLS BROKEN  : all 36 departments visible


-- ── R6: Try to UPDATE a colleague's h-index ─────────────────
-- Expected: 0 rows affected — blocked by fac_update_scoped

UPDATE public.faculty
SET    scopus_hindex = 99
WHERE  ria_user_id = 233046;

-- ✔ RLS WORKING : UPDATE 0 (blocked)
-- ✗ RLS BROKEN  : UPDATE 1 (Tejraj's record modified — critical breach)


-- ── R7: Try to DELETE a publication ─────────────────────────
-- Expected: 0 rows affected — Faculty cannot delete

DELETE FROM public.publications
WHERE  pub_id = 119154;

-- ✔ RLS WORKING : DELETE 0 (blocked)
-- ✗ RLS BROKEN  : DELETE 1 (publication removed)


-- ── R8: Try to see other faculty profiles ───────────────────
-- Expected: only own profile row

SELECT id, full_name, role_level, department_id
FROM   public.profiles;

-- ✔ RLS WORKING : 1 row (own profile)
-- ✗ RLS BROKEN  : all 4 profiles visible


-- ============================================================
-- EXPECTED RESULTS SUMMARY
-- ============================================================
/*
  Query | Type  | Expected                          | Confirms
  ------|-------|-----------------------------------|---------------------------
  B1    | Basic | 1 row, h-index=7, pubs=34         | Own profile card
  B2    | Basic | total ≤ 34                        | Own pub count
  B3    | Basic | all rows = Sunil's pubs           | Own pub list
  B4    | Basic | pubs from 2025 onwards only       | Recent pubs filter
  B5    | Basic | year-wise count for Sunil         | Publication trajectory
  B6    | Basic | 1 row, faculty_count=132, avg_h=2.8 | Dept aggregate
  B7    | Basic | delta_scopus_h = +4.2 (above avg) | Self-assessment
  B8    | Basic | Scopus-indexed pubs of Sunil      | Citation impact
  R1    | RLS   | COUNT = 1                         | Colleague rows blocked
  R2    | RLS   | 0 rows                            | Direct colleague blocked
  R3    | RLS   | COUNT = Sunil's pubs only         | All pub isolation
  R4    | RLS   | 0 rows                            | Colleague pubs blocked
  R5    | RLS   | 1 row (own dept)                  | Dept isolation
  R6    | RLS   | UPDATE 0                          | Colleague update blocked
  R7    | RLS   | DELETE 0                          | Delete blocked
  R8    | RLS   | 1 row (own profile)               | Profile isolation
*/





-- All publications of Sunil
SELECT
    p.pub_id,
    p.year,
    p.title,
    p.article_type,
    p.source_publication,
    p.q_rank_scopus,
    p.q_rank_wos,
    p.impact_factor,
    p.scs_citations,
    p.abdc_grade,
    p.naac,
    p.nirf,
    fp.is_corresponding
FROM      public.publications         p
JOIN      public.faculty_publications fp ON fp.publication_id = p.id
ORDER BY  p.year DESC, p.month DESC NULLS LAST;

