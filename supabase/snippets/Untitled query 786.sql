-- ============================================================
--  RIA — Drop ALL existing RLS policies (clean slate)
--  Run this FIRST in SQL Editor, then run ria_rls_hierarchy.sql
-- ============================================================

-- institutes
DROP POLICY IF EXISTS "inst_read"          ON public.institutes;
DROP POLICY IF EXISTS "inst_write"         ON public.institutes;
DROP POLICY IF EXISTS "inst_read_all"      ON public.institutes;
DROP POLICY IF EXISTS "inst_write_admin"   ON public.institutes;

-- departments
DROP POLICY IF EXISTS "dept_read"          ON public.departments;
DROP POLICY IF EXISTS "dept_write"         ON public.departments;
DROP POLICY IF EXISTS "dept_read_scoped"   ON public.departments;
DROP POLICY IF EXISTS "dept_write_admin"   ON public.departments;

-- profiles
DROP POLICY IF EXISTS "prof_read"          ON public.profiles;
DROP POLICY IF EXISTS "prof_insert_self"   ON public.profiles;
DROP POLICY IF EXISTS "prof_update"        ON public.profiles;
DROP POLICY IF EXISTS "prof_delete"        ON public.profiles;
DROP POLICY IF EXISTS "prof_read_scoped"   ON public.profiles;
DROP POLICY IF EXISTS "prof_update_scoped" ON public.profiles;
DROP POLICY IF EXISTS "prof_delete_admin"  ON public.profiles;

-- faculty
DROP POLICY IF EXISTS "fac_read"           ON public.faculty;
DROP POLICY IF EXISTS "fac_insert"         ON public.faculty;
DROP POLICY IF EXISTS "fac_update"         ON public.faculty;
DROP POLICY IF EXISTS "fac_delete"         ON public.faculty;
DROP POLICY IF EXISTS "fac_read_scoped"    ON public.faculty;
DROP POLICY IF EXISTS "fac_insert_dean_up" ON public.faculty;
DROP POLICY IF EXISTS "fac_update_scoped"  ON public.faculty;
DROP POLICY IF EXISTS "fac_delete_admin"   ON public.faculty;

-- publications
DROP POLICY IF EXISTS "pub_read"           ON public.publications;
DROP POLICY IF EXISTS "pub_insert"         ON public.publications;
DROP POLICY IF EXISTS "pub_update"         ON public.publications;
DROP POLICY IF EXISTS "pub_delete"         ON public.publications;
DROP POLICY IF EXISTS "pub_read_scoped"    ON public.publications;
DROP POLICY IF EXISTS "pub_insert_scoped"  ON public.publications;
DROP POLICY IF EXISTS "pub_update_scoped"  ON public.publications;
DROP POLICY IF EXISTS "pub_delete_admin"   ON public.publications;

-- faculty_publications
DROP POLICY IF EXISTS "fp_read"            ON public.faculty_publications;
DROP POLICY IF EXISTS "fp_write"           ON public.faculty_publications;
DROP POLICY IF EXISTS "fp_read_scoped"     ON public.faculty_publications;
DROP POLICY IF EXISTS "fp_write_dean_up"   ON public.faculty_publications;

-- Verify: should return 0 rows if all dropped successfully
SELECT tablename, policyname
FROM   pg_policies
WHERE  schemaname = 'public'
ORDER  BY tablename, policyname;