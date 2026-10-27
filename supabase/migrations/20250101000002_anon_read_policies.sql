-- ============================================================
--  MIGRATION 003: anon read policies for dashboard access
--
--  The dashboard uses custom localStorage auth (not Supabase
--  Auth), so all Supabase JS client calls run as the `anon`
--  role.  These policies let the anon role SELECT from the
--  read-only dashboard tables and views without requiring a
--  Supabase JWT.
--
--  Publications, faculty, departments, and institutes are
--  university research data intended to be visible to all
--  authenticated dashboard users — there is no sensitive PII
--  in these tables beyond faculty names.
-- ============================================================

-- Lookup tables
CREATE POLICY "inst_anon_read" ON ria.institutes
    FOR SELECT TO anon USING (true);

CREATE POLICY "dept_anon_read" ON ria.departments
    FOR SELECT TO anon USING (true);

-- Faculty
CREATE POLICY "fac_anon_read" ON ria.faculty
    FOR SELECT TO anon USING (true);

-- Publications
CREATE POLICY "pub_anon_read" ON ria.publications
    FOR SELECT TO anon USING (true);

-- Faculty-publications junction
CREATE POLICY "fp_anon_read" ON ria.faculty_publications
    FOR SELECT TO anon USING (true);

-- Views inherit policies from base tables (security_invoker = true),
-- so granting SELECT on the view itself is also required.
GRANT SELECT ON ria.v_faculty_full      TO anon;
GRANT SELECT ON ria.v_pub_faculty       TO anon;
GRANT SELECT ON ria.v_institute_summary TO anon;
