-- ============================================================
--  FACULTY RLS TEST QUERIES
--  User : sunil@faculty.com
--  UUID : 201a3801-c429-423d-a438-b13a049954d4
--  Role : Faculty  |  ria_user_id = 232727
--
--  IMPORTANT: Paste the SET LOCAL lines at the top of EVERY
--  query window before running. Each window needs them.
-- ============================================================

-- ── Set Faculty user context (paste this in EVERY window) ───
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{
    "sub":  "201a3801-c429-423d-a438-b13a049954d4",
    "role": "authenticated"
}';


-- ============================================================
-- QUERY 1: Total number of publications for this faculty
-- ============================================================
-- Expected: count of only Sunil's own publications
-- RLS blocks all other faculty publications automatically

SELECT
    COUNT(*)                                        AS total_publications,
    COUNT(*) FILTER (WHERE p.article_type = 'Journal')      AS journals,
    COUNT(*) FILTER (WHERE p.article_type = 'Conference')   AS conferences,
    COUNT(*) FILTER (WHERE p.article_type = 'Book Chapter') AS book_chapters,
    COUNT(*) FILTER (WHERE p.q_rank_scopus = 'Q1')          AS q1_scopus,
    COUNT(*) FILTER (WHERE p.scs_citations IS NOT NULL)      AS scopus_indexed
FROM public.publications p;

-- ✔ PASS : returns Sunil's own publication count (not 6516)
-- ✗ FAIL : returns 6516 — means RLS is not applied


-- ============================================================
-- QUERY 2: Publications from the past 1 year (2025 onwards)
-- ============================================================
-- Expected: only Sunil's publications from year >= 2025

SELECT
    p.pub_id,
    p.title,
    p.year,
    p.month,
    p.pub_date,
    p.article_type,
    p.source_publication,
    p.q_rank_scopus,
    p.impact_factor,
    p.scs_citations,
    fp.is_corresponding
FROM      public.publications        p
JOIN      public.faculty_publications fp ON fp.publication_id = p.id
WHERE     p.year >= EXTRACT(YEAR FROM NOW()) - 3   -- last 1 year
ORDER BY  p.year DESC, p.month DESC NULLS LAST;

-- ✔ PASS : returns only Sunil's recent publications
-- ✗ FAIL : returns publications from other faculty


-- ============================================================
-- QUERY 3: Faculty trying to access ANOTHER faculty's data
-- ============================================================
-- Sunil (Faculty) tries to read Tejraj Aminabhavi's row
-- ria_user_id 233046 is a DIFFERENT faculty member
-- RLS must block this completely

-- 3A: Try to read a specific colleague by ria_user_id
SELECT
    author_name,
    total_pub_count,
    scopus_hindex,
    scopus_citation
FROM public.faculty
WHERE ria_user_id = 233046;   -- Tejraj Aminabhavi (not Sunil)

-- ✔ RLS WORKING : 0 rows returned (colleague blocked)
-- ✗ RLS BROKEN  : row returned (serious security gap)


-- 3B: Try to read ALL faculty rows
SELECT
    author_name,
    department_id,
    total_pub_count
FROM public.faculty
ORDER BY total_pub_count DESC;

-- ✔ RLS WORKING : 1 row only (Sunil's own row)
-- ✗ RLS BROKEN  : multiple rows (all colleagues visible)


-- 3C: Try to read a colleague's publications directly
SELECT
    p.pub_id,
    p.title,
    p.year,
    p.staff_ria_user_id
FROM public.publications p
WHERE p.staff_ria_user_id = 233046;   -- Tejraj's publications

-- ✔ RLS WORKING : 0 rows returned
-- ✗ RLS BROKEN  : Tejraj's publications visible to Sunil


-- 3D: Try to count all faculty in the system
SELECT COUNT(*) AS can_i_see_all_faculty FROM public.faculty;

-- ✔ RLS WORKING : returns 1  (own row only)
-- ✗ RLS BROKEN  : returns 739 (all faculty visible)


-- Set Faculty user context
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{
    "sub":  "201a3801-c429-423d-a438-b13a049954d4",
    "role": "authenticated"
}';

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