-- ============================================================
--  MIGRATION: Populate matched_department_id / matched_institute_id
--
--  Prereq: You've already run:
--    ALTER TABLE publications
--      ADD COLUMN matched_department_id UUID REFERENCES departments(id),
--      ADD COLUMN matched_institute_id  UUID REFERENCES institutes(id);
--    CREATE INDEX idx_pubs_matched_dept ON publications(matched_department_id);
--    CREATE INDEX idx_pubs_matched_inst ON publications(matched_institute_id);
--
--  This script resolves the TEXT columns (matched_department,
--  matched_institute) to proper UUID FKs.
--
--  Strategy:
--    1. Resolve via staff_ria_user_id → faculty → department_id (most reliable)
--    2. Fallback: match text matched_department against departments.name
--    3. Fallback: match text matched_institute against institutes.name
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────
-- STEP 1: Populate from staff_ria_user_id (84.8% of rows)
-- This is the most accurate: uses the already-matched
-- faculty link to get the department/institute UUID.
-- ────────────────────────────────────────────────────────
UPDATE public.publications p
SET
    matched_department_id = f.department_id,
    matched_institute_id  = f.institute_id
FROM public.faculty f
WHERE p.staff_ria_user_id = f.ria_user_id
  AND p.staff_ria_user_id IS NOT NULL
  AND p.matched_department_id IS NULL;

-- Report step 1
DO $$
DECLARE cnt INTEGER;
BEGIN
    SELECT COUNT(*) INTO cnt FROM publications WHERE matched_department_id IS NOT NULL;
    RAISE NOTICE 'Step 1 (staff_ria_user_id): % publications resolved', cnt;
END $$;

-- ────────────────────────────────────────────────────────
-- STEP 2: Fallback for unmatched rows —
-- Match text matched_department against departments.name
-- ────────────────────────────────────────────────────────
UPDATE public.publications p
SET
    matched_department_id = d.id,
    matched_institute_id  = d.institute_id
FROM public.departments d
WHERE p.matched_department_id IS NULL
  AND p.matched_department IS NOT NULL
  AND p.matched_department <> ''
  AND d.name = p.matched_department;

-- Report step 2
DO $$
DECLARE cnt INTEGER;
BEGIN
    SELECT COUNT(*) INTO cnt FROM publications WHERE matched_department_id IS NOT NULL;
    RAISE NOTICE 'Step 2 (text dept match): % publications resolved total', cnt;
END $$;

-- ────────────────────────────────────────────────────────
-- STEP 3: For remaining unmatched rows, try fuzzy match
-- on matched_department text (handles slight variations)
-- ────────────────────────────────────────────────────────
UPDATE public.publications p
SET
    matched_department_id = sub.dept_id,
    matched_institute_id  = sub.inst_id
FROM (
    SELECT DISTINCT ON (p2.id)
        p2.id AS pub_id,
        d.id  AS dept_id,
        d.institute_id AS inst_id
    FROM public.publications p2
    JOIN public.departments d
        ON d.name ILIKE '%' || p2.matched_department || '%'
        OR p2.matched_department ILIKE '%' || d.name || '%'
    WHERE p2.matched_department_id IS NULL
      AND p2.matched_department IS NOT NULL
      AND p2.matched_department <> ''
    ORDER BY p2.id, length(d.name) DESC  -- prefer longest match
) sub
WHERE p.id = sub.pub_id;

-- Report step 3
DO $$
DECLARE cnt INTEGER; total INTEGER;
BEGIN
    SELECT COUNT(*) INTO cnt FROM publications WHERE matched_department_id IS NOT NULL;
    SELECT COUNT(*) INTO total FROM publications;
    RAISE NOTICE 'Step 3 (fuzzy match): % of % publications resolved (%.1f%%)',
        cnt, total, (cnt::numeric / total * 100);
END $$;

-- ────────────────────────────────────────────────────────
-- STEP 4: For rows with matched_institute text but still
-- no department, at least set the institute FK
-- ────────────────────────────────────────────────────────
UPDATE public.publications p
SET matched_institute_id = i.id
FROM public.institutes i
WHERE p.matched_institute_id IS NULL
  AND p.matched_institute IS NOT NULL
  AND p.matched_institute <> ''
  AND i.name = p.matched_institute;

-- ────────────────────────────────────────────────────────
-- STEP 5: Report unresolved rows
-- ────────────────────────────────────────────────────────
DO $$
DECLARE
    resolved INTEGER;
    unresolved INTEGER;
    total INTEGER;
BEGIN
    SELECT COUNT(*) INTO total FROM publications;
    SELECT COUNT(*) INTO resolved FROM publications WHERE matched_department_id IS NOT NULL;
    unresolved := total - resolved;
    RAISE NOTICE '════════════════════════════════════════';
    RAISE NOTICE 'FINAL: % / % resolved (%.1f%%), % unresolved',
        resolved, total, (resolved::numeric / total * 100), unresolved;
    RAISE NOTICE '════════════════════════════════════════';
END $$;

-- Show sample of unresolved rows for debugging
SELECT matched_department, matched_institute, COUNT(*) AS cnt
FROM publications
WHERE matched_department_id IS NULL
GROUP BY matched_department, matched_institute
ORDER BY cnt DESC
LIMIT 20;

COMMIT;
