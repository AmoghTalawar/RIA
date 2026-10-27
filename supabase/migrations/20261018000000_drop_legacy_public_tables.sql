-- Drop the legacy copies of the RIA tables in the `public` schema.
-- The app (backend + frontend) reads the `ria` schema only; these were the pre-V2 import
-- (6,513 publications) and made Studio's SQL editor (default schema: public) show stale counts.
-- Idempotent. public.v_faculty_full / v_institute_summary / v_pub_faculty go with them (CASCADE).
BEGIN;
DROP TABLE IF EXISTS public.faculty_publications, public.publications, public.faculty,
                     public.departments, public.institutes, public.profiles CASCADE;
COMMIT;
