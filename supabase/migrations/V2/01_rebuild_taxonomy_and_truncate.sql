-- ============================================================
--  MIGRATION 004 (V2): Rebuild institute/department taxonomy,
--  align publications schema, grant schema permissions, and safely
--  truncate all data tables ahead of a full reload from:
--    - FACULTY COMPARE.xlsx   (739 faculty)
--    - Pub_Mine_export_cleaned_v3.xlsx  (7,061 publications)
--
--  WHY A FULL TAXONOMY REBUILD:
--  The live `ria.institutes` / `ria.departments` tables (18
--  institutes, 36 departments) reflect KLE's OLD structure.
--  The new publication export uses a restructured, consolidated
--  taxonomy: 8 institutes, 42 departments. This migration
--  replaces the old taxonomy with the new one everywhere.
--
--  SAFETY NOTE ON TRUNCATE + FKs:
--  `ria.profiles` has FKs to faculty/departments/institutes.
--  TRUNCATE ... CASCADE would wipe `profiles` too (real user
--  accounts), which we do NOT want. So this script:
--    1. Drops the 3 FK constraints from profiles temporarily
--    2. Nulls out profiles.department_id/institute_id/faculty_id
--       (the old UUIDs are about to stop existing)
--    3. Truncates faculty_publications, publications, faculty,
--       departments, institutes (RESTART IDENTITY)
--    4. Reseeds institutes + departments with the new taxonomy
--    5. Widen limited VARCHAR columns on publications & faculty to TEXT
--    6. Re-adds the FK constraints on profiles
--    7. Grants full API / PostgREST permissions on `ria` schema
-- ============================================================

-- Remove The OpenAlex Cloumns from Faculty Table
ALTER TABLE ria.faculty
    DROP COLUMN IF EXISTS openalex_author_id,
    DROP COLUMN IF EXISTS openalex_hindex,
    DROP COLUMN IF EXISTS openalex_works_count,
    DROP COLUMN IF EXISTS openalex_confidence;
Verification Query
To verify that the columns have been removed:

sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ria' 
  AND table_name = 'faculty';










-- ────────────────────────────────────────────────────────
-- STEP 0: Detach profiles from the tables we're about to wipe
-- ────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE ria.profiles DROP CONSTRAINT IF EXISTS fk_profiles_faculty;
ALTER TABLE ria.profiles DROP CONSTRAINT IF EXISTS profiles_department_id_fkey;
ALTER TABLE ria.profiles DROP CONSTRAINT IF EXISTS profiles_institute_id_fkey;

UPDATE ria.profiles
SET faculty_id = NULL, department_id = NULL, institute_id = NULL;

-- ────────────────────────────────────────────────────────
-- STEP 1: TRUNCATE all data tables (dependency-safe order)
-- ────────────────────────────────────────────────────────
TRUNCATE TABLE
    ria.faculty_publications,
    ria.publications,
    ria.faculty,
    ria.departments,
    ria.institutes
RESTART IDENTITY CASCADE;

-- ────────────────────────────────────────────────────────
-- STEP 2: Reseed INSTITUTES — new 8-institute taxonomy
-- ────────────────────────────────────────────────────────
INSERT INTO ria.institutes (name, short_name) VALUES
  ('Centers',                                             'Centers'),
  ('School of Advanced Sciences',                         'Adv Sciences'),
  ('School of Applied Engineering',                       'Applied Eng'),
  ('School of Architecture',                              'Architecture'),
  ('School of Computer Science and Engineering',          'CSE'),
  ('School of Electrical and Electronics Engineering',    'EEE'),
  ('School of Legal Studies',                             'Legal Studies'),
  ('School of Management Studies and Research',           'Management');

-- ────────────────────────────────────────────────────────
-- STEP 3: Reseed DEPARTMENTS — new 42-department taxonomy
-- ────────────────────────────────────────────────────────
INSERT INTO ria.departments (name, institute_id)
SELECT d.dept_name, i.id
FROM (VALUES
  -- Centers
  ('Centre for Material Science (CMS)',                     'Centers'),
  ('Centre for Engineering Education and Research (CEER)',  'Centers'),
  ('Centre of Excellence in Visual Intelligence (CEVI)',    'Centers'),
  ('Centre for High Performance Computing (CHPC)',          'Centers'),
  ('Centre for Research in Renewable and Energy Systems (CRRE)', 'Centers'),
  ('Centre for Innovation and Product Development (CIPD)',  'Centers'),
  -- School of Advanced Sciences
  ('Chemistry',                          'School of Advanced Sciences'),
  ('Biotechnology',                      'School of Advanced Sciences'),
  ('Physics',                            'School of Advanced Sciences'),
  ('Mathematics',                        'School of Advanced Sciences'),
  ('Advanced Sciences',                  'School of Advanced Sciences'),
  -- School of Applied Engineering
  ('Mechanical Engineering',             'School of Applied Engineering'),
  ('Civil Engineering',                  'School of Applied Engineering'),
  ('Industrial and Production Engineering', 'School of Applied Engineering'),
  ('Automation and Robotics',            'School of Applied Engineering'),
  ('Chemical Engineering',               'School of Applied Engineering'),
  ('Automobile Engineering',             'School of Applied Engineering'),
  ('Design Engineering',                 'School of Applied Engineering'),
  ('Metallurgical and Material Engineering', 'School of Applied Engineering'),
  ('Structural Engineering',             'School of Applied Engineering'),
  -- School of Architecture
  ('Architecture',                       'School of Architecture'),
  -- School of Computer Science and Engineering
  ('Computer Science and Engineering',   'School of Computer Science and Engineering'),
  ('Computer Application',               'School of Computer Science and Engineering'),
  ('Information Science and Engineering','School of Computer Science and Engineering'),
  -- School of Electrical and Electronics Engineering
  ('Electronics and Communication Engineering', 'School of Electrical and Electronics Engineering'),
  ('Electrical and Electronics Engineering',    'School of Electrical and Electronics Engineering'),
  ('Instrumentation Technology',                'School of Electrical and Electronics Engineering'),
  ('BioMedical Engineering',                    'School of Electrical and Electronics Engineering'),
  ('VLSI Design and Embedded Systems',          'School of Electrical and Electronics Engineering'),
  ('Digital Electronics',                       'School of Electrical and Electronics Engineering'),
  -- School of Legal Studies
  ('Law',                                'School of Legal Studies'),
  ('Economics',                          'School of Legal Studies'),
  ('History',                            'School of Legal Studies'),
  ('Management',                         'School of Legal Studies'),
  ('Political Science',                  'School of Legal Studies'),
  ('Commerce',                           'School of Legal Studies'),
  ('English',                            'School of Legal Studies'),
  -- School of Management Studies and Research
  ('Management Studies',                 'School of Management Studies and Research'),
  ('Engineering Science and Humanities', 'School of Management Studies and Research'),
  ('Master of Business Administration',  'School of Management Studies and Research'),
  ('Master of Computer Applications',    'School of Management Studies and Research'),
  ('Humanities and Social Sciences',     'School of Management Studies and Research')
) AS d(dept_name, inst_name)
JOIN ria.institutes i ON i.name = d.inst_name;

-- ────────────────────────────────────────────────────────
-- STEP 4: Schema alignment & Column Type Widening (TEXT)
-- ────────────────────────────────────────────────────────

-- Drop dependent views temporarily to allow column type modification
DROP VIEW IF EXISTS ria.v_pub_faculty;
DROP VIEW IF EXISTS ria.v_faculty_full;
DROP VIEW IF EXISTS ria.v_institute_summary;

-- Widen VARCHAR columns to TEXT to prevent overflow errors on long affiliations/titles/DOIs
ALTER TABLE ria.publications
    ALTER COLUMN home_author_school TYPE TEXT,
    ALTER COLUMN home_author_location TYPE TEXT,
    ALTER COLUMN source_publication TYPE TEXT,
    ALTER COLUMN vol_no TYPE TEXT,
    ALTER COLUMN iss_no TYPE TEXT,
    ALTER COLUMN b_page TYPE TEXT,
    ALTER COLUMN e_page TYPE TEXT,
    ALTER COLUMN doi TYPE TEXT,
    ALTER COLUMN p_issn TYPE TEXT,
    ALTER COLUMN e_issn TYPE TEXT,
    ALTER COLUMN p_isbn TYPE TEXT,
    ALTER COLUMN e_isbn TYPE TEXT,
    ALTER COLUMN matched_institute TYPE TEXT,
    ALTER COLUMN matched_department TYPE TEXT;

ALTER TABLE ria.faculty
    ALTER COLUMN employee_id TYPE TEXT,
    ALTER COLUMN author_name TYPE TEXT;

-- Raw per-author USERID string from AUTHOR ADDRESS regex extraction
ALTER TABLE ria.publications
    ADD COLUMN IF NOT EXISTS home_author_userid TEXT;

-- UUID FKs for matched department/institute
ALTER TABLE ria.publications
    ADD COLUMN IF NOT EXISTS matched_department_id UUID REFERENCES ria.departments(id),
    ADD COLUMN IF NOT EXISTS matched_institute_id  UUID REFERENCES ria.institutes(id);

CREATE INDEX IF NOT EXISTS idx_pubs_matched_dept ON ria.publications(matched_department_id);
CREATE INDEX IF NOT EXISTS idx_pubs_matched_inst ON ria.publications(matched_institute_id);

-- Recreate Views
CREATE OR REPLACE VIEW ria.v_faculty_full AS
 SELECT f.id AS faculty_id,
    f.employee_id,
    f.ria_user_id,
    f.author_name,
    d.id AS department_id,
    d.name AS department,
    i.id AS institute_id,
    i.name AS institute,
    i.short_name,
    p.role_level,
    f.total_pub_count,
    f.scopus_pub_count,
    f.wos_pub_count,
    f.scopus_citation,
    f.scopus_hindex,
    f.wos_hindex,
    f.gs_hindex,
    f.scopus_i10_index,
    f.avg_snip,
    f.avg_citescore,
    f.avg_impfactor,
    f.scopus_q1_count,
    f.wos_q1_count,
    f.journal_count,
    f.conference_count,
    f.book_count,
    f.book_chapter_count
   FROM (((ria.faculty f
     JOIN ria.departments d ON ((d.id = f.department_id)))
     JOIN ria.institutes i ON ((i.id = f.institute_id)))
     LEFT JOIN ria.profiles p ON ((p.faculty_id = f.id)));

CREATE OR REPLACE VIEW ria.v_pub_faculty AS
 SELECT pub.id AS publication_id,
    pub.pub_id,
    pub.title,
    pub.year,
    pub.month,
    pub.pub_date,
    pub.article_type,
    pub.level,
    pub.source_publication,
    pub.impact_factor,
    pub.cite_score,
    pub.q_rank_scopus,
    pub.q_rank_wos,
    pub.scs_citations,
    pub.wos_citations_pub,
    pub.abdc_grade,
    pub.doi,
    pub.naac,
    pub.nirf,
    pub.qs,
    f.id AS faculty_id,
    f.ria_user_id,
    f.author_name,
    fp.is_corresponding,
    d.name AS faculty_department,
    ins.name AS faculty_institute
   FROM ((((ria.publications pub
     JOIN ria.faculty_publications fp ON ((fp.publication_id = pub.id)))
     JOIN ria.faculty f ON ((f.id = fp.faculty_id)))
     JOIN ria.departments d ON ((d.id = f.department_id)))
     JOIN ria.institutes ins ON ((ins.id = f.institute_id)));

CREATE OR REPLACE VIEW ria.v_institute_summary AS
 SELECT i.id AS institute_id,
    i.name,
    i.short_name,
    count(DISTINCT f.id) AS faculty_count,
    COALESCE(sum(f.total_pub_count), (0)::bigint) AS total_publications,
    COALESCE(sum(f.scopus_citation), (0)::bigint) AS total_scopus_citations,
    round(avg(f.scopus_hindex), 1) AS avg_scopus_hindex,
    COALESCE(sum(f.scopus_q1_count), (0)::bigint) AS total_q1_scopus,
    COALESCE(sum(f.journal_count), (0)::bigint) AS total_journals,
    COALESCE(sum(f.conference_count), (0)::bigint) AS total_conferences
   FROM (ria.institutes i
     LEFT JOIN ria.faculty f ON ((f.institute_id = i.id)))
  GROUP BY i.id, i.name, i.short_name
  ORDER BY COALESCE(sum(f.total_pub_count), (0)::bigint) DESC;

-- ────────────────────────────────────────────────────────
-- STEP 5: Re-attach profiles FKs to the freshly rebuilt tables
-- ────────────────────────────────────────────────────────
ALTER TABLE ria.profiles
    ADD CONSTRAINT profiles_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES ria.departments(id) ON DELETE SET NULL;

ALTER TABLE ria.profiles
    ADD CONSTRAINT profiles_institute_id_fkey
    FOREIGN KEY (institute_id) REFERENCES ria.institutes(id) ON DELETE SET NULL;

ALTER TABLE ria.profiles
    ADD CONSTRAINT fk_profiles_faculty
    FOREIGN KEY (faculty_id) REFERENCES ria.faculty(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────
-- STEP 6: Grant schema & table permissions to Supabase roles
-- ────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA ria TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA ria TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA ria TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA ria TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ria GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ria GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

COMMIT;

-- ────────────────────────────────────────────────────────
-- Verify
-- ────────────────────────────────────────────────────────
SELECT 'institutes' AS tbl, COUNT(*) FROM ria.institutes
UNION ALL SELECT 'departments', COUNT(*) FROM ria.departments
UNION ALL SELECT 'faculty', COUNT(*) FROM ria.faculty
UNION ALL SELECT 'publications', COUNT(*) FROM ria.publications
UNION ALL SELECT 'faculty_publications', COUNT(*) FROM ria.faculty_publications
UNION ALL SELECT 'profiles (department_id still set)', COUNT(*) FROM ria.profiles WHERE department_id IS NOT NULL;
-- Expect: institutes=8, departments=42, everything else=0





