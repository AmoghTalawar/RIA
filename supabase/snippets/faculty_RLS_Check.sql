-- ============================================================
--  FACULTY RLS VERIFICATION
--  User: sunil@faculty.com
--  UUID: 201a3801-c429-423d-a438-b13a049954d4
--  Role: Faculty | Dept: Computer Science and Engineering
--
--  Run each block separately in SQL Editor
-- ============================================================


-- ============================================================
--  SCENARIO 1 — SHOULD PASS
--  OWN faculty row: Faculty sees exactly their own row
--  Expected: 1 row (Sunil Gurlahosur V)
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT id, author_name, department_id, total_pub_count, scopus_hindex
FROM   public.faculty;
-- PASS if: exactly 1 row
-- FAIL if: 0 rows (faculty_id not set) or multiple rows (RLS not applied)


-- ============================================================
--  SCENARIO 2 — SHOULD PASS
--  OWN publications: Faculty sees only their own publications
--  Expected: only pubs linked to ria_user_id = 232727
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT pub_id, title, year, article_type, q_rank_scopus
FROM   public.publications
ORDER  BY year DESC
LIMIT  10;
-- PASS if: only Sunil's publications appear
-- FAIL if: publications from other faculty appear

select * from publications
where pub_id = 115308;

-- ============================================================
--  SCENARIO 3 — SHOULD PASS
--  AGGREGATE dept view: sees dept averages, not individual colleagues
--  Expected: 1 row with aggregated numbers for CSE dept
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT
    department_name,
    faculty_count,
    total_publications,
    avg_scopus_hindex,
    max_scopus_hindex,
    total_q1_scopus
FROM   public.v_dept_aggregate;
-- PASS if: 1 row with aggregated numbers (no colleague names)
-- FAIL if: 0 rows (dept_id missing from profile)


-- ============================================================
--  SCENARIO 4 — SHOULD PASS
--  Self vs dept comparison: own metrics + dept benchmarks
--  Expected: 1 row with my values vs dept averages
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT
    my_total_pubs,
    dept_avg_total_pubs,
    delta_total_pubs,
    my_scopus_h,
    dept_avg_scopus_h,
    delta_scopus_h,
    h_index_percentile_in_dept,
    dept_faculty_count
FROM   public.v_faculty_vs_dept;
-- PASS if: 1 row with own metrics AND dept averages side by side
-- FAIL if: multiple rows (seeing other colleagues' comparisons)


-- ============================================================
--  SCENARIO 5 — SHOULD FAIL (RLS must block this)
--  Try to read a COLLEAGUE's faculty row directly
--  Expected: 0 rows returned
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT id, author_name, total_pub_count, scopus_hindex
FROM   public.faculty
WHERE  id != '46db26c7-69d1-436e-8e6a-3003693dcbb2';
-- RLS WORKING if: 0 rows (cannot see any colleague even with direct filter)
-- RLS BROKEN  if: any rows returned


-- ============================================================
--  SCENARIO 6 — SHOULD FAIL (RLS must block this)
--  Try to read publications of a different faculty member
--  Expected: 0 rows
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT pub_id, title, staff_ria_user_id
FROM   public.publications
WHERE  staff_ria_user_id != 232727;
-- RLS WORKING if: 0 rows returned
-- RLS BROKEN  if: any rows returned (other faculty pubs visible)


-- ============================================================
--  SCENARIO 7 — SHOULD FAIL (RLS must block this)
--  Try to see other profiles in same department
--  Expected: 1 row (own profile only, not HoD or colleagues)
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT id, full_name, role_level, department_id
FROM   public.profiles;
-- RLS WORKING if: 1 row (own profile only)
-- RLS BROKEN  if: multiple rows (seeing HoD or other faculty profiles)


-- ============================================================
--  SCENARIO 8 — SHOULD FAIL (RLS must block this)
--  Try to UPDATE a colleague's faculty row
--  Expected: 0 rows affected
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

UPDATE public.faculty
SET    total_pub_count = 9999
WHERE  id != '46db26c7-69d1-436e-8e6a-3003693dcbb2';
-- RLS WORKING if: UPDATE 0 (nothing modified)
-- RLS BROKEN  if: UPDATE N where N > 0


-- ============================================================
--  SCENARIO 9 — SHOULD FAIL (RLS must block this)
--  Count all faculty with no filter — the classic RLS test
--  Expected: exactly 1
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT COUNT(*) AS total_visible FROM public.faculty;
-- RLS WORKING if: 1
-- RLS BROKEN  if: more than 1


-- ============================================================
--  FULL SUMMARY — run this last
--  Shows everything Faculty can see across all tables at once
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"201a3801-c429-423d-a438-b13a049954d4","role":"authenticated"}';

SELECT
    (SELECT COUNT(*) FROM public.faculty)               AS faculty_rows_visible,
    (SELECT COUNT(*) FROM public.publications)          AS pub_rows_visible,
    (SELECT COUNT(*) FROM public.profiles)              AS profile_rows_visible,
    (SELECT COUNT(*) FROM public.faculty_publications)  AS fp_rows_visible,
    (SELECT COUNT(*) FROM public.departments)           AS dept_rows_visible,
    (SELECT COUNT(*) FROM public.institutes)            AS inst_rows_visible;

-- CORRECT expected result:
--   faculty_rows_visible  = 1        (own row only)
--   pub_rows_visible      = N        (Sunil's publications only)
--   profile_rows_visible  = 1        (own profile only)
--   fp_rows_visible       = N        (own junction rows only)
--   dept_rows_visible     = 1        (own dept only)
--   inst_rows_visible     = 18       (all institutes — needed for navigation)