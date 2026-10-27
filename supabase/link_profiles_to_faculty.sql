-- ============================================================
--  RIA — link login profiles to faculty rows  (REVIEW FIRST)
--
--  The backend scopes Faculty and HoD users by profiles.ria_user_id /
--  faculty_id / department_id. The demo-user migration never set them, and
--  the V2 reload nulls faculty_id / department_id / institute_id on every
--  profile. Until they are set, the chatbot answers 403 "profile incomplete"
--  for Faculty, HoD and Faculty Dean users (by design: fail closed).
--
--  A wrong link gives a user someone else's data, so this is NOT a
--  migration. Run STEP 1, read the result, then run STEP 2.
--  Run in the Supabase SQL editor (service role / postgres).
-- ============================================================


-- ── STEP 1: preview — one row per Faculty / HoD profile ─────
-- matches = how many faculty rows have exactly this name (case-insensitive).
-- Only rows with matches = 1 are updated by STEP 2.
SELECT
    p.id                                   AS profile_id,
    p.full_name,
    p.role_level,
    p.faculty_id                           AS current_faculty_id,
    p.ria_user_id                          AS current_ria_user_id,
    COUNT(f.id)                            AS matches,
    MIN(f.author_name)                     AS matched_name,
    MIN(f.ria_user_id)                     AS ria_user_id,
    MIN(d.name)                            AS department,
    MIN(i.name)                            AS institute
FROM ria.profiles p
LEFT JOIN ria.faculty     f ON lower(btrim(f.author_name)) = lower(btrim(p.full_name))
LEFT JOIN ria.departments d ON d.id = f.department_id
LEFT JOIN ria.institutes  i ON i.id = f.institute_id
WHERE p.role_level IN ('Faculty', 'HoD')
GROUP BY p.id, p.full_name, p.role_level, p.faculty_id, p.ria_user_id
ORDER BY p.role_level, p.full_name;


-- ── STEP 2: apply — unique exact-name matches only ──────────
-- Uncomment after reviewing STEP 1.
--
-- WITH unique_match AS (
--     SELECT p.id AS profile_id, (array_agg(f.id))[1] AS faculty_id
--     FROM ria.profiles p
--     JOIN ria.faculty f ON lower(btrim(f.author_name)) = lower(btrim(p.full_name))
--     WHERE p.role_level IN ('Faculty', 'HoD')
--     GROUP BY p.id
--     HAVING COUNT(*) = 1
-- )
-- UPDATE ria.profiles p
--    SET faculty_id    = f.id,
--        ria_user_id   = f.ria_user_id,
--        department_id = f.department_id,
--        institute_id  = f.institute_id
--   FROM unique_match u
--   JOIN ria.faculty f ON f.id = u.faculty_id
--  WHERE p.id = u.profile_id;


-- ── STEP 3: Faculty Dean needs an institute ─────────────────
-- Dean profiles have no faculty row. Set the institute by hand, e.g.:
--
-- UPDATE ria.profiles
--    SET institute_id = (SELECT id FROM ria.institutes WHERE name = 'School of Computer Science and Engineering')
--  WHERE full_name = 'Vijayalaxmi M' AND role_level = 'Dean';
--
-- Executive Dean, VC and Admin need no institute or department.
-- Every Dean profile also needs dean_type ('faculty_dean' | 'executive_dean').


-- ── STEP 4: check the result ────────────────────────────────
-- SELECT p.full_name, p.role_level, p.dean_type, p.ria_user_id, p.faculty_id,
--        d.name AS department, i.name AS institute
--   FROM ria.profiles p
--   LEFT JOIN ria.departments d ON d.id = p.department_id
--   LEFT JOIN ria.institutes  i ON i.id = p.institute_id
--  ORDER BY p.role_level, p.full_name;
