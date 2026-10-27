-- ============================================================
--  RIA — MIGRATION: scope hardening (design A prerequisites)
--
--  Why: chatbot/persona scope is enforced in the FastAPI backend from a
--  verified JWT (backend/auth_scope.py). That only holds if the database
--  cannot be used to go around the backend or to change one's own role.
--
--  What this does
--    1. exec_sql (SECURITY DEFINER, bypasses RLS) is executable by
--       service_role only. It was granted to anon + authenticated, so
--       anyone holding the public anon key could run arbitrary SELECTs.
--    2. Users can no longer change their own privileged profile columns
--       (role_level, dean_type, department_id, institute_id, faculty_id,
--       ria_user_id, is_active) and can no longer insert profiles.
--    3. The three reporting views run with the caller's rights
--       (security_invoker = true) again. The V2 rebuild recreated them
--       without it, so they bypassed RLS.
--    4. Adds ria.my_department_id(), my_institute_id(), my_dean_type()
--       helpers next to the existing my_role() / my_faculty_id() /
--       my_ria_user_id().
--
--  PREREQUISITE: the backend must use SUPABASE_SERVICE_ROLE_KEY. If it
--  falls back to the anon key, every chatbot query fails after step 1.
--
--  Safe to re-run. Does NOT link profiles to faculty rows — that is a
--  reviewed data fix: see supabase/link_profiles_to_faculty.sql.
-- ============================================================


-- ── 1. exec_sql: service_role only ──────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.exec_sql(text)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
        REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
    ELSE
        RAISE NOTICE 'public.exec_sql(text) not found — nothing to revoke';
    END IF;
END $$;


-- ── 2. profiles: protect privileged columns ─────────────────
-- Server-side callers (service role key, SQL editor, migrations) have no
-- auth.uid() and are unaffected. Admin / VC keep full control, matching
-- the existing prof_update / prof_delete policies.
CREATE OR REPLACE FUNCTION ria.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ria, public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF ria.my_role() IN ('Admin', 'VC') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'profiles can only be created by an administrator'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.id            IS DISTINCT FROM OLD.id
    OR NEW.role_level    IS DISTINCT FROM OLD.role_level
    OR NEW.dean_type     IS DISTINCT FROM OLD.dean_type
    OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.institute_id  IS DISTINCT FROM OLD.institute_id
    OR NEW.faculty_id    IS DISTINCT FROM OLD.faculty_id
    OR NEW.ria_user_id   IS DISTINCT FROM OLD.ria_user_id
    OR NEW.is_active     IS DISTINCT FROM OLD.is_active
    THEN
        RAISE EXCEPTION 'role, scope and status columns of a profile can only be changed by an administrator'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged ON ria.profiles;
CREATE TRIGGER trg_profiles_protect_privileged
    BEFORE INSERT OR UPDATE ON ria.profiles
    FOR EACH ROW EXECUTE FUNCTION ria.protect_profile_privileged_columns();

-- Nothing in the frontend inserts profiles (AuthContext only SELECTs;
-- users are created by scripts/create_auth_users.mjs with the service role).
DROP POLICY IF EXISTS "prof_insert_self" ON ria.profiles;


-- ── 3. views: run with the caller's rights ──────────────────
DO $$
DECLARE
    v TEXT;
BEGIN
    FOREACH v IN ARRAY ARRAY['v_faculty_full', 'v_pub_faculty', 'v_institute_summary'] LOOP
        IF to_regclass('ria.' || v) IS NOT NULL THEN
            EXECUTE format('ALTER VIEW ria.%I SET (security_invoker = true)', v);
        END IF;
    END LOOP;
END $$;


-- ── 4. scope helper functions ───────────────────────────────
CREATE OR REPLACE FUNCTION ria.my_department_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ria, public AS $$
    SELECT department_id FROM ria.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION ria.my_institute_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ria, public AS $$
    SELECT institute_id FROM ria.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION ria.my_dean_type()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ria, public AS $$
    SELECT dean_type FROM ria.profiles WHERE id = auth.uid()
$$;


-- ============================================================
--  VERIFY (run manually after applying)
--
--  a) exec_sql is no longer callable with the anon key:
--       curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
--         -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
--         -d '{"query_text":"select 1"}'          -- expect 401/403 / permission denied
--     and still works with the service role key.
--
--  b) a signed-in user cannot promote themselves (use their JWT):
--       PATCH /rest/v1/profiles?id=eq.<their id>   {"role_level":"VC"}
--       with header  Accept-Profile: ria / Content-Profile: ria
--                                                   -- expect error 42501
--     but can still update full_name / avatar_url.
--
--  c) SELECT reloptions FROM pg_class
--       WHERE oid IN ('ria.v_faculty_full'::regclass,
--                     'ria.v_pub_faculty'::regclass,
--                     'ria.v_institute_summary'::regclass);
--                                                   -- expect {security_invoker=true}
--
--  d) the five demo users can still sign in and reach their dashboards.
-- ============================================================
