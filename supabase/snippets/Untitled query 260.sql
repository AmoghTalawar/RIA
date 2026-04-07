-- ============================================================
--  RIA — 4-Level Hierarchical RLS  (idempotent — safe to re-run)
--  Each policy is dropped immediately before being created.
--  Will never error with "policy already exists".
-- ============================================================


-- ============================================================
-- 1. HELPER FUNCTIONS
-- ============================================================

DROP FUNCTION IF EXISTS public.my_role()          CASCADE;
DROP FUNCTION IF EXISTS public.my_faculty_id()    CASCADE;
DROP FUNCTION IF EXISTS public.my_ria_user_id()   CASCADE;
DROP FUNCTION IF EXISTS public.my_department_id() CASCADE;
DROP FUNCTION IF EXISTS public.my_institute_id()  CASCADE;
DROP FUNCTION IF EXISTS public.is_vc_or_admin()   CASCADE;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS role_level_t LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT role_level FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_faculty_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT faculty_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_ria_user_id()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT ria_user_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_department_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT department_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_institute_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT institute_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_vc_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT my_role() IN ('VC','Admin')
$$;


-- ============================================================
-- 2. ENABLE RLS (safe even if already enabled)
-- ============================================================

ALTER TABLE public.institutes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_publications ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3. INSTITUTES
-- ============================================================

DROP POLICY IF EXISTS "inst_read_all"    ON public.institutes;
DROP POLICY IF EXISTS "inst_write_admin" ON public.institutes;

CREATE POLICY "inst_read_all"
ON public.institutes FOR SELECT TO authenticated
USING (true);

CREATE POLICY "inst_write_admin"
ON public.institutes FOR ALL TO authenticated
USING   (is_vc_or_admin())
WITH CHECK (is_vc_or_admin());


-- ============================================================
-- 4. DEPARTMENTS
-- ============================================================

DROP POLICY IF EXISTS "dept_read_scoped"  ON public.departments;
DROP POLICY IF EXISTS "dept_write_admin"  ON public.departments;

CREATE POLICY "dept_read_scoped"
ON public.departments FOR SELECT TO authenticated
USING (
    is_vc_or_admin()
    OR (my_role() = 'Dean'    AND institute_id = my_institute_id())
    OR id = my_department_id()
);

CREATE POLICY "dept_write_admin"
ON public.departments FOR ALL TO authenticated
USING   (is_vc_or_admin())
WITH CHECK (is_vc_or_admin());


-- ============================================================
-- 5. PROFILES
-- ============================================================

DROP POLICY IF EXISTS "prof_read_scoped"   ON public.profiles;
DROP POLICY IF EXISTS "prof_insert_self"   ON public.profiles;
DROP POLICY IF EXISTS "prof_update_scoped" ON public.profiles;
DROP POLICY IF EXISTS "prof_delete_admin"  ON public.profiles;

CREATE POLICY "prof_read_scoped"
ON public.profiles FOR SELECT TO authenticated
USING (
    id = auth.uid()
    OR is_vc_or_admin()
    OR (my_role() = 'Dean' AND institute_id  = my_institute_id())
    OR (my_role() = 'HoD'  AND department_id = my_department_id())
);

CREATE POLICY "prof_insert_self"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "prof_update_scoped"
ON public.profiles FOR UPDATE TO authenticated
USING   (id = auth.uid() OR is_vc_or_admin())
WITH CHECK (id = auth.uid() OR is_vc_or_admin());

CREATE POLICY "prof_delete_admin"
ON public.profiles FOR DELETE TO authenticated
USING (is_vc_or_admin());


-- ============================================================
-- 6. FACULTY
-- ============================================================

DROP POLICY IF EXISTS "fac_read_scoped"    ON public.faculty;
DROP POLICY IF EXISTS "fac_insert_dean_up" ON public.faculty;
DROP POLICY IF EXISTS "fac_update_scoped"  ON public.faculty;
DROP POLICY IF EXISTS "fac_delete_admin"   ON public.faculty;

CREATE POLICY "fac_read_scoped"
ON public.faculty FOR SELECT TO authenticated
USING (
    is_vc_or_admin()
    OR (my_role() = 'Dean' AND institute_id  = my_institute_id())
    OR (my_role() = 'HoD'  AND department_id = my_department_id())
    OR id = my_faculty_id()
);

CREATE POLICY "fac_insert_dean_up"
ON public.faculty FOR INSERT TO authenticated
WITH CHECK (
    is_vc_or_admin()
    OR my_role() = 'Dean'
);

CREATE POLICY "fac_update_scoped"
ON public.faculty FOR UPDATE TO authenticated
USING (
    is_vc_or_admin()
    OR my_role() = 'Dean'
    OR (my_role() = 'HoD' AND department_id = my_department_id())
    OR id = my_faculty_id()
)
WITH CHECK (
    is_vc_or_admin()
    OR my_role() = 'Dean'
    OR (my_role() = 'HoD' AND department_id = my_department_id())
    OR id = my_faculty_id()
);

CREATE POLICY "fac_delete_admin"
ON public.faculty FOR DELETE TO authenticated
USING (is_vc_or_admin());


-- ============================================================
-- 7. PUBLICATIONS
-- ============================================================

DROP POLICY IF EXISTS "pub_read_scoped"   ON public.publications;
DROP POLICY IF EXISTS "pub_insert_scoped" ON public.publications;
DROP POLICY IF EXISTS "pub_update_scoped" ON public.publications;
DROP POLICY IF EXISTS "pub_delete_admin"  ON public.publications;

CREATE POLICY "pub_read_scoped"
ON public.publications FOR SELECT TO authenticated
USING (
    is_vc_or_admin()
    OR
    (my_role() = 'Dean' AND EXISTS (
        SELECT 1
        FROM   public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        WHERE  fp.publication_id = public.publications.id
          AND  f.institute_id    = my_institute_id()
    ))
    OR
    (my_role() = 'HoD' AND EXISTS (
        SELECT 1
        FROM   public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        WHERE  fp.publication_id = public.publications.id
          AND  f.department_id   = my_department_id()
    ))
    OR
    (my_role() = 'Faculty' AND (
        staff_ria_user_id = my_ria_user_id()
        OR EXISTS (
            SELECT 1 FROM public.faculty_publications fp
            WHERE  fp.publication_id = public.publications.id
              AND  fp.faculty_id     = my_faculty_id()
        )
    ))
);

CREATE POLICY "pub_insert_scoped"
ON public.publications FOR INSERT TO authenticated
WITH CHECK (
    is_vc_or_admin()
    OR my_role() = 'Dean'
    OR staff_ria_user_id = my_ria_user_id()
);

CREATE POLICY "pub_update_scoped"
ON public.publications FOR UPDATE TO authenticated
USING (
    is_vc_or_admin()
    OR (my_role() = 'Dean' AND EXISTS (
        SELECT 1 FROM public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        WHERE  fp.publication_id = public.publications.id
          AND  f.institute_id    = my_institute_id()
    ))
    OR (my_role() = 'HoD' AND EXISTS (
        SELECT 1 FROM public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        WHERE  fp.publication_id = public.publications.id
          AND  f.department_id   = my_department_id()
    ))
    OR staff_ria_user_id = my_ria_user_id()
)
WITH CHECK (
    is_vc_or_admin()
    OR (my_role() = 'Dean' AND EXISTS (
        SELECT 1 FROM public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        WHERE  fp.publication_id = public.publications.id
          AND  f.institute_id    = my_institute_id()
    ))
    OR (my_role() = 'HoD' AND EXISTS (
        SELECT 1 FROM public.faculty_publications fp
        JOIN   public.faculty f ON f.id = fp.faculty_id
        WHERE  fp.publication_id = public.publications.id
          AND  f.department_id   = my_department_id()
    ))
    OR staff_ria_user_id = my_ria_user_id()
);

CREATE POLICY "pub_delete_admin"
ON public.publications FOR DELETE TO authenticated
USING (is_vc_or_admin());


-- ============================================================
-- 8. FACULTY_PUBLICATIONS
-- ============================================================

DROP POLICY IF EXISTS "fp_read_scoped"  ON public.faculty_publications;
DROP POLICY IF EXISTS "fp_write_dean_up" ON public.faculty_publications;

CREATE POLICY "fp_read_scoped"
ON public.faculty_publications FOR SELECT TO authenticated
USING (
    is_vc_or_admin()
    OR (my_role() = 'Dean' AND EXISTS (
        SELECT 1 FROM public.faculty f
        WHERE  f.id = public.faculty_publications.faculty_id
          AND  f.institute_id = my_institute_id()
    ))
    OR (my_role() = 'HoD' AND EXISTS (
        SELECT 1 FROM public.faculty f
        WHERE  f.id = public.faculty_publications.faculty_id
          AND  f.department_id = my_department_id()
    ))
    OR faculty_id = my_faculty_id()
);

CREATE POLICY "fp_write_dean_up"
ON public.faculty_publications FOR ALL TO authenticated
USING   (is_vc_or_admin() OR my_role() = 'Dean')
WITH CHECK (is_vc_or_admin() OR my_role() = 'Dean');


-- ============================================================
-- 9. AUTH SYNC TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_meta    JSONB;
    v_role    role_level_t;
    v_dept_id UUID;
    v_inst_id UUID;
BEGIN
    v_meta := NEW.raw_app_meta_data;

    BEGIN
        v_role := (v_meta->>'role')::role_level_t;
    EXCEPTION WHEN invalid_text_representation THEN
        v_role := 'Faculty';
    END;
    IF v_role IS NULL THEN v_role := 'Faculty'; END IF;

    BEGIN v_dept_id := (v_meta->>'department_id')::UUID;
    EXCEPTION WHEN others THEN v_dept_id := NULL; END;

    BEGIN v_inst_id := (v_meta->>'institute_id')::UUID;
    EXCEPTION WHEN others THEN v_inst_id := NULL; END;

    INSERT INTO public.profiles (id, ria_user_id, role_level, department_id, institute_id)
    VALUES (
        NEW.id,
        (v_meta->>'ria_user_id')::INTEGER,
        v_role,
        v_dept_id,
        v_inst_id
    )
    ON CONFLICT (id) DO UPDATE
        SET role_level    = EXCLUDED.role_level,
            department_id = EXCLUDED.department_id,
            institute_id  = EXCLUDED.institute_id,
            updated_at    = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile ON auth.users;
CREATE TRIGGER trg_sync_profile
AFTER INSERT OR UPDATE OF raw_app_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_auth();


-- ============================================================
-- 10. DEPT AGGREGATE VIEW
-- ============================================================

DROP VIEW IF EXISTS public.v_dept_aggregate;
CREATE OR REPLACE VIEW public.v_dept_aggregate
WITH (security_invoker = true) AS
SELECT
    d.id                                        AS department_id,
    d.name                                      AS department_name,
    i.name                                      AS institute_name,
    COUNT(DISTINCT f.id)                        AS faculty_count,
    COALESCE(SUM(f.total_pub_count),  0)        AS total_publications,
    COALESCE(SUM(f.scopus_pub_count), 0)        AS scopus_publications,
    COALESCE(SUM(f.scopus_citation),  0)        AS total_scopus_citations,
    ROUND(AVG(f.scopus_hindex)::NUMERIC, 1)     AS avg_scopus_hindex,
    MAX(f.scopus_hindex)                        AS max_scopus_hindex,
    COALESCE(SUM(f.scopus_q1_count),  0)        AS total_q1_scopus,
    COALESCE(SUM(f.journal_count),    0)        AS total_journals,
    COALESCE(SUM(f.conference_count), 0)        AS total_conferences
FROM      public.departments d
JOIN      public.institutes  i ON i.id = d.institute_id
JOIN      public.faculty     f ON f.department_id = d.id
GROUP BY  d.id, d.name, i.name;


-- ============================================================
-- 11. VERIFY — run this to confirm all 18 policies exist
-- ============================================================

SELECT tablename, policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public'
ORDER  BY tablename, policyname;