-- ============================================================
--  RIA — Research Intelligence & Analytics
--  SCHEMA  v3.0  |  Supabase / PostgreSQL 15
--  KLE Technological University
--
--  Design constraints:
--   1. ID-based matching only — no name-string joins
--   2. Multi-value separators enforced by CHECK:
--        AUTHORS          → pipe        |
--        HOME AUTHORS     → semicolon   ;
--        TECHNOLOGY AREAS → comma       ,
--   3. Dates stored as VARCHAR(10) MM/DD/YYYY with CHECK regex;
--      year and month are GENERATED ALWAYS columns
--   4. "Not Available" used only in home_author_department,
--      home_author_institute, technology_areas (source data);
--      all other missing values use true NULL
--   5. match_method and match_source REMOVED
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";


-- ============================================================
-- 1. CUSTOM TYPES
-- ============================================================
DO $$ BEGIN
    CREATE TYPE role_level_t   AS ENUM ('Faculty','HoD','Dean','VC','Admin');
    CREATE TYPE article_type_t AS ENUM (
        'Journal','Conference','Book Chapter','Book','PrePrint','Working Paper'
    );
    CREATE TYPE level_t        AS ENUM ('International','National');
    CREATE TYPE q_rank_t       AS ENUM ('Q1','Q2','Q3','Q4');
    CREATE TYPE abdc_grade_t   AS ENUM ('A*','A','B','C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- 2. DROP (safe re-run order respects FK deps)
-- ============================================================
DROP TABLE IF EXISTS public.faculty_publications CASCADE;
DROP TABLE IF EXISTS public.publications         CASCADE;
DROP TABLE IF EXISTS public.faculty              CASCADE;
DROP TABLE IF EXISTS public.profiles             CASCADE;
DROP TABLE IF EXISTS public.departments          CASCADE;
DROP TABLE IF EXISTS public.institutes           CASCADE;


-- ============================================================
-- 3. INSTITUTES  (18 rows seeded)
-- ============================================================
CREATE TABLE public.institutes (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(200) NOT NULL,
    short_name  VARCHAR(80),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_institutes_name UNIQUE (name)
);

INSERT INTO public.institutes (name, short_name) VALUES
  ('Department of Chemistry',                                 'Chemistry'),
  ('Centres',                                                'Centres'),
  ('School of Mechanical Engineering',                       'Mechanical'),
  ('Department of Electrical and Electronics Engineering',   'EEE'),
  ('Department of Physics',                                  'Physics'),
  ('School of Computer Science and Engineering',             'CSE'),
  ('School of Electronics and Communication Engineering',    'ECE'),
  ('Department of Biotechnology',                            'Biotech'),
  ('School of Sciences',                                     'Sciences'),
  ('Master of Computer Application',                         'MCA'),
  ('Dr. MS Sheshgiri College of Engineering and Technology','Sheshgiri'),
  ('Department of Mathematics',                              'Maths'),
  ('School of Civil Engineering',                            'Civil'),
  ('Department of Automation and Robotics',                  'Automation'),
  ('School of Management Studies and Research',              'Management'),
  ('Department of Humanities',                               'Humanities'),
  ('School of Architecture',                                 'Architecture'),
  ('KLE Law College',                                        'Law');


-- ============================================================
-- 4. DEPARTMENTS  (36 rows seeded)
-- ============================================================
-- UNIQUE(name, institute_id): same dept name is allowed in
-- different institutes (e.g. "Civil Engineering" exists in
-- both Sheshgiri and School of Civil Engineering)
-- ============================================================
CREATE TABLE public.departments (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(200) NOT NULL,
    institute_id UUID         NOT NULL
                     REFERENCES public.institutes(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_departments_name_institute UNIQUE (name, institute_id)
);

INSERT INTO public.departments (name, institute_id)
SELECT d.dept_name, i.id
FROM (VALUES
  ('Centre for Engineering Education and Research (CEER)', 'Centres'),
  ('Centre for Material Science (CMS)',                    'Centres'),
  ('Automation and Robotics',           'Department of Automation and Robotics'),
  ('Biotechnology',                     'Department of Biotechnology'),
  ('Chemistry',                         'Department of Chemistry'),
  ('Electrical and Electronics Engineering',
                                        'Department of Electrical and Electronics Engineering'),
  ('Humanities and Social Sciences',    'Department of Humanities'),
  ('Mathematics',                       'Department of Mathematics'),
  ('Physics',                           'Department of Physics'),
  ('BioMedical Engineering',            'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Centre for Material Science (CMS)', 'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Chemical Engineering',              'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Civil Engineering',                 'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Computer Science and Engineering',  'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Electrical and Electronics Engineering',
                                        'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Electronics and Communication Engineering',
                                        'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Engineering Science and Humanities','Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Master of Business Administration', 'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Computer Application',              'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Mechanical Engineering',            'Dr. MS Sheshgiri College of Engineering and Technology'),
  ('Commerce',   'KLE Law College'),
  ('Economics',  'KLE Law College'),
  ('English',    'KLE Law College'),
  ('History',    'KLE Law College'),
  ('Law',        'KLE Law College'),
  ('Management', 'KLE Law College'),
  ('Political Scince', 'KLE Law College'),
  ('Computer Application',              'Master of Computer Application'),
  ('Architecture',                      'School of Architecture'),
  ('Civil Engineering',                 'School of Civil Engineering'),
  ('Computer Science and Engineering',  'School of Computer Science and Engineering'),
  ('Digital Electronics',               'School of Electronics and Communication Engineering'),
  ('Electronics and Communication Engineering',
                                        'School of Electronics and Communication Engineering'),
  ('Management Studies',                'School of Management Studies and Research'),
  ('Mechanical Engineering',            'School of Mechanical Engineering'),
  ('Advanced Sciences',                 'School of Sciences')
) AS d(dept_name, inst_name)
JOIN public.institutes i ON i.name = d.inst_name;


-- ============================================================
-- 5. PROFILES  (Supabase auth bridge)
-- ============================================================
CREATE TABLE public.profiles (
    id            UUID          PRIMARY KEY
                      REFERENCES auth.users(id) ON DELETE CASCADE,
    ria_user_id   INTEGER       UNIQUE,
    full_name     VARCHAR(200),
    role_level    role_level_t  NOT NULL DEFAULT 'Faculty',
    department_id UUID          REFERENCES public.departments(id) ON DELETE SET NULL,
    institute_id  UUID          REFERENCES public.institutes(id)  ON DELETE SET NULL,
    faculty_id    UUID,                   -- FK wired after faculty table (below)
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON COLUMN public.profiles.ria_user_id IS
    'Legacy integer RIA login ID. All cross-table links use this integer, not the auth UUID.';


-- ============================================================
-- 6. FACULTY  (739 rows)
-- ============================================================
CREATE TABLE public.faculty (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id           VARCHAR(20),                    -- nullable: 139 rows lack this
    ria_user_id           INTEGER      NOT NULL UNIQUE,   -- universal join key
    author_name           VARCHAR(200) NOT NULL,
    department_id         UUID         NOT NULL
                              REFERENCES public.departments(id) ON DELETE RESTRICT,
    institute_id          UUID         NOT NULL
                              REFERENCES public.institutes(id)  ON DELETE RESTRICT,

    -- Publication counts
    total_pub_count       INTEGER      NOT NULL DEFAULT 0,
    scopus_pub_count      INTEGER      NOT NULL DEFAULT 0,
    wos_pub_count         INTEGER      NOT NULL DEFAULT 0,
    sci_pub_count         INTEGER      NOT NULL DEFAULT 0,
    pubmed_pub_count      INTEGER      NOT NULL DEFAULT 0,
    ieee_pub_count        INTEGER      NOT NULL DEFAULT 0,
    abdc_pub_count        INTEGER      NOT NULL DEFAULT 0,
    ugc_care_pub_count    INTEGER      NOT NULL DEFAULT 0,
    ugc_care_gp1_count    INTEGER      NOT NULL DEFAULT 0,
    gs_pub_count          INTEGER      NOT NULL DEFAULT 0,

    -- Citations
    scopus_citation       INTEGER      NOT NULL DEFAULT 0,
    wos_citations         INTEGER      NOT NULL DEFAULT 0,
    gs_citations          INTEGER      NOT NULL DEFAULT 0,

    -- Indices
    scopus_hindex         INTEGER      NOT NULL DEFAULT 0,
    wos_hindex            INTEGER      NOT NULL DEFAULT 0,
    gs_hindex             INTEGER      NOT NULL DEFAULT 0,
    scopus_i10_index      INTEGER      NOT NULL DEFAULT 0,
    wos_i10_index         INTEGER      NOT NULL DEFAULT 0,

    -- Avg journal quality
    avg_snip              NUMERIC(6,2),
    avg_citescore         NUMERIC(6,2),
    avg_impfactor         NUMERIC(6,2),

    -- Quartile counts
    scopus_q1_count       INTEGER      NOT NULL DEFAULT 0,
    scopus_q2_count       INTEGER      NOT NULL DEFAULT 0,
    wos_q1_count          INTEGER      NOT NULL DEFAULT 0,
    wos_q2_count          INTEGER      NOT NULL DEFAULT 0,

    -- Output type counts
    journal_count         INTEGER      NOT NULL DEFAULT 0,
    conference_count      INTEGER      NOT NULL DEFAULT 0,
    book_count            INTEGER      NOT NULL DEFAULT 0,
    book_chapter_count    INTEGER      NOT NULL DEFAULT 0,

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_fac_counts_nonneg CHECK (
        total_pub_count >= 0 AND scopus_pub_count >= 0 AND
        scopus_hindex   >= 0 AND wos_hindex       >= 0
    )
);
COMMENT ON COLUMN public.faculty.ria_user_id IS
    'Unique integer RIA system ID. FK target for publications.staff_ria_user_id.';
COMMENT ON COLUMN public.faculty.employee_id IS
    'Nullable — 139 of 739 faculty have no employee ID in source data.';

-- Deferred FK: profiles.faculty_id → faculty.id
ALTER TABLE public.profiles
    ADD CONSTRAINT fk_profiles_faculty
    FOREIGN KEY (faculty_id) REFERENCES public.faculty(id) ON DELETE SET NULL;


-- ============================================================
-- 7. PUBLICATIONS  (6,516 rows)
-- ============================================================
CREATE TABLE public.publications (
    id                     UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    pub_id                 INTEGER        NOT NULL,          -- source integer e.g. 299101

    -- ── Authorship ───────────────────────────────────────────
    -- CHECK constraints enforce separators on every write
    authors                TEXT,                            -- ALL authors, pipe-sep "A|B|C"
    home_authors           TEXT,                            -- KLE authors, semicolon-sep "A;B;C"
    home_author_department TEXT,                            -- "Not Available" allowed
    home_author_institute  TEXT,                            -- "Not Available" allowed
    home_author_school     VARCHAR(200),
    home_author_location   VARCHAR(200),
    author_address         TEXT,

    -- ── Bibliographic ────────────────────────────────────────
    title                  TEXT           NOT NULL,
    source_publication     VARCHAR(500),
    article_type           article_type_t,
    level                  level_t,

    -- pub_date: MM/DD/YYYY string, validated by CHECK.
    -- year and month are GENERATED ALWAYS from pub_date.
    pub_date               VARCHAR(10),
    year                   SMALLINT       GENERATED ALWAYS AS (
                               CASE WHEN pub_date ~ '^\d{2}/\d{2}/\d{4}$'
                               THEN CAST(RIGHT(pub_date, 4) AS SMALLINT)
                               ELSE NULL END
                           ) STORED,
    month                  SMALLINT       GENERATED ALWAYS AS (
                               CASE WHEN pub_date ~ '^\d{2}/\d{2}/\d{4}$'
                               THEN CAST(LEFT(pub_date, 2) AS SMALLINT)
                               ELSE NULL END
                           ) STORED,

    vol_no                 VARCHAR(20),
    iss_no                 VARCHAR(20),
    b_page                 VARCHAR(20),
    e_page                 VARCHAR(20),
    doi                    VARCHAR(300),
    link                   TEXT,
    abstract               TEXT,
    technology_areas       TEXT,                            -- comma-sep; "Not Available" allowed

    -- ── Indexing (CORRECTED: citation counts, not booleans) ──
    -- NULL = not indexed in that database
    -- 0    = indexed with zero citations
    -- N>0  = indexed with N citations
    scs_citations          INTEGER,                         -- Scopus
    wos_citations_pub      INTEGER,                         -- Web of Science
    ieee_citations         INTEGER,                         -- IEEE
    gs_citations_pub       INTEGER,                         -- Google Scholar

    -- True boolean flags
    is_sci                 BOOLEAN,
    is_pm                  BOOLEAN,
    is_ugc                 BOOLEAN,
    is_ugc_group1          BOOLEAN,

    -- ABDC grade — enum A*|A|B|C (not a boolean)
    abdc_grade             abdc_grade_t,

    -- ── Journal quality ──────────────────────────────────────
    snip                   NUMERIC(8,3),
    sjr                    NUMERIC(8,3),
    impact_factor          NUMERIC(8,3),
    cite_score             NUMERIC(8,3),
    q_rank_scopus          q_rank_t,
    q_rank_wos             q_rank_t,

    -- ── Identifiers ──────────────────────────────────────────
    p_issn                 VARCHAR(20),
    e_issn                 VARCHAR(20),
    p_isbn                 VARCHAR(30),
    e_isbn                 VARCHAR(30),

    -- ── Ranking flags ────────────────────────────────────────
    nirf                   BOOLEAN        NOT NULL DEFAULT FALSE,
    naac                   BOOLEAN        NOT NULL DEFAULT FALSE,
    qs                     BOOLEAN        NOT NULL DEFAULT FALSE,
    the                    BOOLEAN        NOT NULL DEFAULT FALSE,
    is_indexed             BOOLEAN        NOT NULL DEFAULT FALSE,

    -- ── Match reference — ID only, no match_method/match_source
    staff_ria_user_id      INTEGER
                               REFERENCES public.faculty(ria_user_id)
                               ON DELETE SET NULL,
    matched_institute      VARCHAR(200),
    matched_department     VARCHAR(200),

    created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    -- ── All constraints ──────────────────────────────────────

    CONSTRAINT uq_publications_pub_id UNIQUE (pub_id),

    -- Date format: MM/DD/YYYY, month 01-12, day 01-31, year 1xxx or 2xxx
    CONSTRAINT chk_pub_date_format CHECK (
        pub_date IS NULL
        OR pub_date ~ '^(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[12][0-9]{3}$'
    ),

    -- Separator: authors use pipe (no semicolons permitted)
    CONSTRAINT chk_authors_no_semicolon CHECK (
        authors IS NULL OR authors NOT LIKE '%;%'
    ),

    -- Separator: home_authors use semicolon (no pipes permitted)
    CONSTRAINT chk_home_authors_no_pipe CHECK (
        home_authors IS NULL OR home_authors NOT LIKE '%|%'
    ),

    -- Separator: technology_areas use comma (no pipe/semicolon, unless "Not Available")
    CONSTRAINT chk_tech_areas_comma_only CHECK (
        technology_areas IS NULL
        OR technology_areas = 'Not Available'
        OR (technology_areas NOT LIKE '%|%' AND technology_areas NOT LIKE '%;%')
    ),

    -- Non-negative citation counts
    CONSTRAINT chk_scs_nonneg   CHECK (scs_citations     IS NULL OR scs_citations     >= 0),
    CONSTRAINT chk_wos_nonneg   CHECK (wos_citations_pub IS NULL OR wos_citations_pub >= 0),
    CONSTRAINT chk_ieee_nonneg  CHECK (ieee_citations     IS NULL OR ieee_citations    >= 0),
    CONSTRAINT chk_gs_nonneg    CHECK (gs_citations_pub  IS NULL OR gs_citations_pub  >= 0),
    CONSTRAINT chk_impact_nonneg CHECK (impact_factor    IS NULL OR impact_factor     >= 0),
    CONSTRAINT chk_snip_nonneg   CHECK (snip             IS NULL OR snip              >= 0)
);

COMMENT ON COLUMN public.publications.pub_id IS
    'Source integer publication ID (e.g. 299101). Unique. Used for upserts.';
COMMENT ON COLUMN public.publications.authors IS
    'All co-authors pipe-separated: "A|B|C". Display/search only.';
COMMENT ON COLUMN public.publications.home_authors IS
    'KLE faculty names semicolon-separated: "A;B;C". Display only — faculty_publications is authoritative.';
COMMENT ON COLUMN public.publications.pub_date IS
    'Publication date MM/DD/YYYY. year and month columns are auto-derived — do not set manually.';
COMMENT ON COLUMN public.publications.scs_citations IS
    'Scopus citation count. NULL=not indexed. 0=indexed zero citations. N>0=indexed N citations.';
COMMENT ON COLUMN public.publications.staff_ria_user_id IS
    'ria_user_id of the primary matched faculty. Integer FK → faculty.ria_user_id. ID-based, never name-matched.';
COMMENT ON COLUMN public.publications.abdc_grade IS
    'ABDC journal grade: A*, A, B, C. NULL = not ABDC-listed.';


-- ============================================================
-- 8. FACULTY_PUBLICATIONS  (M:N junction)
-- ============================================================
-- Links are built from STAFF USER ID integer FK only.
-- match_method and match_source are REMOVED per spec.
-- ============================================================
CREATE TABLE public.faculty_publications (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id       UUID        NOT NULL
                         REFERENCES public.faculty(id) ON DELETE CASCADE,
    publication_id   UUID        NOT NULL
                         REFERENCES public.publications(id) ON DELETE CASCADE,
    is_corresponding BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_faculty_publication UNIQUE (faculty_id, publication_id)
);
COMMENT ON TABLE  public.faculty_publications IS
    'M:N — one row per faculty-publication pair. Built from STAFF USER ID integer FK only.';
COMMENT ON COLUMN public.faculty_publications.is_corresponding IS
    'TRUE when faculty.ria_user_id = publications.staff_ria_user_id.';


-- ============================================================
-- 9. AUTO-UPDATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'institutes','departments','profiles',
    'faculty','publications','faculty_publications'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    ', t, t, t, t);
  END LOOP;
END $$;


-- ============================================================
-- 10. INDEXES
-- ============================================================

-- institutes
CREATE INDEX idx_inst_name        ON public.institutes(name);

-- departments
CREATE INDEX idx_dept_institute   ON public.departments(institute_id);

-- profiles
CREATE INDEX idx_prof_ria_user    ON public.profiles(ria_user_id);
CREATE INDEX idx_prof_role        ON public.profiles(role_level);
CREATE INDEX idx_prof_dept        ON public.profiles(department_id);
CREATE INDEX idx_prof_inst        ON public.profiles(institute_id);
CREATE INDEX idx_prof_faculty     ON public.profiles(faculty_id);

-- faculty
CREATE INDEX idx_fac_ria_user     ON public.faculty(ria_user_id);          -- primary join key
CREATE INDEX idx_fac_dept         ON public.faculty(department_id);
CREATE INDEX idx_fac_inst         ON public.faculty(institute_id);
CREATE INDEX idx_fac_h_scopus     ON public.faculty(scopus_hindex DESC);
CREATE INDEX idx_fac_total_pubs   ON public.faculty(total_pub_count DESC);
CREATE INDEX idx_fac_name_trgm    ON public.faculty
    USING gin(author_name gin_trgm_ops);                   -- fuzzy search only, NOT joins

-- publications
CREATE INDEX idx_pub_pub_id       ON public.publications(pub_id);          -- external ID lookup
CREATE INDEX idx_pub_year         ON public.publications(year DESC);
CREATE INDEX idx_pub_article_type ON public.publications(article_type);
CREATE INDEX idx_pub_level        ON public.publications(level);
CREATE INDEX idx_pub_q_scs        ON public.publications(q_rank_scopus);
CREATE INDEX idx_pub_q_wos        ON public.publications(q_rank_wos);
CREATE INDEX idx_pub_impact       ON public.publications(impact_factor DESC NULLS LAST);
CREATE INDEX idx_pub_cite_score   ON public.publications(cite_score DESC NULLS LAST);
CREATE INDEX idx_pub_doi          ON public.publications(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_pub_staff_uid    ON public.publications(staff_ria_user_id);
CREATE INDEX idx_pub_naac         ON public.publications(naac) WHERE naac = TRUE;
CREATE INDEX idx_pub_nirf         ON public.publications(nirf) WHERE nirf = TRUE;
CREATE INDEX idx_pub_qs           ON public.publications(qs)   WHERE qs   = TRUE;
CREATE INDEX idx_pub_abdc         ON public.publications(abdc_grade)
    WHERE abdc_grade IS NOT NULL;
CREATE INDEX idx_pub_scopus_idx   ON public.publications(scs_citations)
    WHERE scs_citations IS NOT NULL;                       -- fast "is in Scopus" filter
CREATE INDEX idx_pub_wos_idx      ON public.publications(wos_citations_pub)
    WHERE wos_citations_pub IS NOT NULL;
CREATE INDEX idx_pub_title_trgm   ON public.publications
    USING gin(title gin_trgm_ops);
CREATE INDEX idx_pub_abstract_fts ON public.publications
    USING gin(to_tsvector('english', coalesce(abstract, '')));

-- faculty_publications (both traversal directions)
CREATE INDEX idx_fp_faculty       ON public.faculty_publications(faculty_id);
CREATE INDEX idx_fp_publication   ON public.faculty_publications(publication_id);
CREATE INDEX idx_fp_corresponding ON public.faculty_publications(is_corresponding)
    WHERE is_corresponding = TRUE;


-- ============================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.institutes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_publications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS role_level_t LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role_level FROM public.profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.my_faculty_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT faculty_id FROM public.profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.my_ria_user_id()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT ria_user_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Lookup tables
CREATE POLICY "inst_read"  ON public.institutes  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_read"  ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "inst_write" ON public.institutes  FOR ALL    TO authenticated
    USING (my_role() IN ('Admin','VC')) WITH CHECK (my_role() IN ('Admin','VC'));
CREATE POLICY "dept_write" ON public.departments FOR ALL    TO authenticated
    USING (my_role() IN ('Admin','VC')) WITH CHECK (my_role() IN ('Admin','VC'));

-- Profiles
CREATE POLICY "prof_read"        ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "prof_insert_self" ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());
CREATE POLICY "prof_update"      ON public.profiles FOR UPDATE TO authenticated
    USING   (id = auth.uid() OR my_role() IN ('Admin','VC'))
    WITH CHECK (id = auth.uid() OR my_role() IN ('Admin','VC'));
CREATE POLICY "prof_delete"      ON public.profiles FOR DELETE TO authenticated
    USING (my_role() IN ('Admin','VC'));

-- Faculty
CREATE POLICY "fac_read"   ON public.faculty FOR SELECT TO authenticated USING (true);
CREATE POLICY "fac_insert" ON public.faculty FOR INSERT TO authenticated
    WITH CHECK (my_role() IN ('Admin','VC','Dean'));
CREATE POLICY "fac_update" ON public.faculty FOR UPDATE TO authenticated
    USING   (id = my_faculty_id() OR my_role() IN ('Admin','VC','Dean','HoD'))
    WITH CHECK (id = my_faculty_id() OR my_role() IN ('Admin','VC','Dean','HoD'));
CREATE POLICY "fac_delete" ON public.faculty FOR DELETE TO authenticated
    USING (my_role() IN ('Admin','VC'));

-- Publications
CREATE POLICY "pub_read"   ON public.publications FOR SELECT TO authenticated USING (true);
CREATE POLICY "pub_insert" ON public.publications FOR INSERT TO authenticated
    WITH CHECK (
        staff_ria_user_id = my_ria_user_id()
        OR my_role() IN ('Admin','VC','Dean')
    );
CREATE POLICY "pub_update" ON public.publications FOR UPDATE TO authenticated
    USING   (staff_ria_user_id = my_ria_user_id() OR my_role() IN ('Admin','VC','Dean'))
    WITH CHECK (staff_ria_user_id = my_ria_user_id() OR my_role() IN ('Admin','VC','Dean'));
CREATE POLICY "pub_delete" ON public.publications FOR DELETE TO authenticated
    USING (my_role() IN ('Admin','VC'));

-- Junction
CREATE POLICY "fp_read"  ON public.faculty_publications FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_write" ON public.faculty_publications FOR ALL    TO authenticated
    USING (my_role() IN ('Admin','VC','Dean'))
    WITH CHECK (my_role() IN ('Admin','VC','Dean'));


-- ============================================================
-- 12. VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.v_faculty_full
WITH (security_invoker = true) AS
SELECT
    f.id AS faculty_id, f.employee_id, f.ria_user_id, f.author_name,
    d.id AS department_id, d.name AS department,
    i.id AS institute_id,  i.name AS institute, i.short_name,
    p.role_level,
    f.total_pub_count, f.scopus_pub_count, f.wos_pub_count,
    f.scopus_citation, f.scopus_hindex, f.wos_hindex, f.gs_hindex,
    f.scopus_i10_index, f.avg_snip, f.avg_citescore, f.avg_impfactor,
    f.scopus_q1_count, f.wos_q1_count,
    f.journal_count, f.conference_count, f.book_count, f.book_chapter_count
FROM      public.faculty     f
JOIN      public.departments d ON d.id = f.department_id
JOIN      public.institutes  i ON i.id = f.institute_id
LEFT JOIN public.profiles    p ON p.faculty_id = f.id;

CREATE OR REPLACE VIEW public.v_pub_faculty
WITH (security_invoker = true) AS
SELECT
    pub.id AS publication_id, pub.pub_id, pub.title,
    pub.year, pub.month, pub.pub_date,
    pub.article_type, pub.level, pub.source_publication,
    pub.impact_factor, pub.cite_score, pub.q_rank_scopus, pub.q_rank_wos,
    pub.scs_citations, pub.wos_citations_pub, pub.abdc_grade,
    pub.doi, pub.naac, pub.nirf, pub.qs,
    f.id AS faculty_id, f.ria_user_id, f.author_name,
    fp.is_corresponding,
    d.name AS faculty_department, ins.name AS faculty_institute
FROM      public.publications        pub
JOIN      public.faculty_publications fp  ON fp.publication_id = pub.id
JOIN      public.faculty              f   ON f.id  = fp.faculty_id
JOIN      public.departments          d   ON d.id  = f.department_id
JOIN      public.institutes           ins ON ins.id = f.institute_id;

CREATE OR REPLACE VIEW public.v_institute_summary
WITH (security_invoker = true) AS
SELECT
    i.id AS institute_id, i.name, i.short_name,
    COUNT(DISTINCT f.id)                    AS faculty_count,
    COALESCE(SUM(f.total_pub_count),  0)    AS total_publications,
    COALESCE(SUM(f.scopus_citation),  0)    AS total_scopus_citations,
    ROUND(AVG(f.scopus_hindex)::NUMERIC, 1) AS avg_scopus_hindex,
    COALESCE(SUM(f.scopus_q1_count),  0)    AS total_q1_scopus,
    COALESCE(SUM(f.journal_count),    0)    AS total_journals,
    COALESCE(SUM(f.conference_count), 0)    AS total_conferences
FROM      public.institutes i
LEFT JOIN public.faculty    f ON f.institute_id = i.id
GROUP BY  i.id, i.name, i.short_name
ORDER BY  total_publications DESC;


-- ============================================================
-- 13. SAMPLE INSERT STATEMENTS
-- ============================================================

/*
-- ── S1: Faculty (resolve org by ID, not name in join) ───────
INSERT INTO public.faculty (
    employee_id, ria_user_id, author_name,
    department_id, institute_id,
    total_pub_count, scopus_pub_count, scopus_hindex,
    avg_snip, avg_citescore, avg_impfactor
)
SELECT '10180', 233046, 'Tejraj Malleshappa Aminabhavi',
       d.id, i.id, 293, 286, 55, 0.85, 7.54, 4.17
FROM  public.departments d
JOIN  public.institutes  i ON i.id = d.institute_id
WHERE d.name = 'Chemistry' AND i.name = 'Department of Chemistry'
ON CONFLICT (ria_user_id) DO UPDATE
    SET total_pub_count = EXCLUDED.total_pub_count, updated_at = NOW();


-- ── S2: Publication — all separators and date format ────────
INSERT INTO public.publications (
    pub_id, title,
    authors,          -- pipe-separated  ✓
    home_authors,     -- semicolon-sep   ✓
    home_author_department, home_author_institute,
    technology_areas, -- comma-separated ✓
    source_publication, article_type, level,
    pub_date,         -- MM/DD/YYYY      ✓
    vol_no, doi,
    scs_citations,    -- INTEGER, not boolean ✓
    wos_citations_pub,
    is_sci,
    abdc_grade,       -- enum A*/A/B/C, not boolean ✓
    impact_factor, cite_score, q_rank_scopus, q_rank_wos,
    naac, nirf, qs, is_indexed,
    staff_ria_user_id -- integer FK, ID-based ✓
)
VALUES (
    299101,
    'Next generation hydrogen from sunlight: ZIF-8 nanohybrids',
    'Ujjwal Pal|Sagar Varangane|Deepak S Gavali|Tejraj Malleshappa Aminabhavi',
    'Tejraj Malleshappa Aminabhavi',
    'Chemistry', 'Department of Chemistry',
    'Sustainability,Nanotechnology,Hydrogen,Catalysis',
    'Renewable and Sustainable Energy Reviews',
    'Journal', 'International',
    '11/01/2026',
    '227', '10.1016/j.rser.2025.116565',
    0, 0,               -- indexed, zero citations
    TRUE, 'A',          -- is_sci, abdc_grade (enum)
    16.3, 38.0, 'Q1', 'Q1',
    TRUE, FALSE, TRUE, TRUE,
    233046
)
ON CONFLICT (pub_id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW();


-- ── S3: "Not Available" in technology_areas (valid use) ─────
INSERT INTO public.publications (
    pub_id, title, technology_areas, pub_date, article_type, is_indexed
)
VALUES (
    302030, 'Graphene hydrogel surface modification',
    'Not Available',  -- source data contains this string explicitly
    '12/01/2026', 'Book Chapter', TRUE
)
ON CONFLICT (pub_id) DO UPDATE SET updated_at = NOW();


-- ── S4: Multi-author junction insert (ID-based only) ────────
INSERT INTO public.faculty_publications (faculty_id, publication_id, is_corresponding)
SELECT f.id, p.id, TRUE
FROM  public.faculty      f
JOIN  public.publications p ON p.pub_id = 299101   -- integer lookup
WHERE f.ria_user_id = 233046                       -- integer lookup
ON CONFLICT (faculty_id, publication_id) DO UPDATE
    SET is_corresponding = EXCLUDED.is_corresponding, updated_at = NOW();


-- ── S5: Multi-faculty publication ───────────────────────────
INSERT INTO public.publications (
    pub_id, title,
    authors,
    home_authors,
    home_author_department, home_author_institute,
    technology_areas,
    article_type, level, pub_date,
    scs_citations, is_sci, impact_factor, q_rank_scopus,
    naac, is_indexed, staff_ria_user_id
)
VALUES (
    302058,
    'Electrochemical biosensors for rapid pathogen detection',
    'Banapurmath N R|Ashok Sajjan|K S Nivedhitha|Leena V Hublikar|Bipin Shidaray Chikkatti',
    'Banapurmath N R;Ashok Sajjan;K S Nivedhitha;Leena V Hublikar;Bipin Shidaray Chikkatti',
    'Mechanical Engineering', 'School of Mechanical Engineering',
    'Biosensors,Electrochemistry,Pathogen Detection',
    'Journal', 'International', '12/01/2026',
    3, TRUE, 5.2, 'Q1',
    TRUE, TRUE, 233041
)
ON CONFLICT (pub_id) DO UPDATE SET updated_at = NOW();
*/


-- ============================================================
-- 14. PUBLICATION COUNT QUERY — one faculty member
-- ============================================================

SELECT
    f.author_name, f.ria_user_id,
    d.name AS department, i.name AS institute,
    COUNT(fp.publication_id)                              AS total_linked_pubs,
    COUNT(*) FILTER (WHERE p.article_type = 'Journal')   AS journals,
    COUNT(*) FILTER (WHERE p.article_type = 'Conference')AS conferences,
    COUNT(*) FILTER (WHERE p.article_type = 'Book Chapter') AS book_chapters,
    COUNT(*) FILTER (WHERE p.level = 'International')    AS international,
    COUNT(*) FILTER (WHERE p.level = 'National')         AS national,
    COUNT(*) FILTER (WHERE p.scs_citations IS NOT NULL)  AS scopus_indexed,
    COUNT(*) FILTER (WHERE p.wos_citations_pub IS NOT NULL) AS wos_indexed,
    COUNT(*) FILTER (WHERE p.is_sci = TRUE)              AS sci_indexed,
    COUNT(*) FILTER (WHERE p.abdc_grade IS NOT NULL)     AS abdc_listed,
    COUNT(*) FILTER (WHERE p.q_rank_scopus = 'Q1')       AS q1_scopus,
    COUNT(*) FILTER (WHERE p.q_rank_wos    = 'Q1')       AS q1_wos,
    COUNT(*) FILTER (WHERE fp.is_corresponding = TRUE)   AS as_corresponding,
    MIN(p.year) AS first_pub_year, MAX(p.year) AS latest_pub_year,
    ROUND(AVG(p.impact_factor)::NUMERIC, 2) AS avg_impact_factor,
    ROUND(AVG(p.cite_score)::NUMERIC,    2) AS avg_cite_score
FROM      public.faculty               f
JOIN      public.faculty_publications  fp ON fp.faculty_id    = f.id
JOIN      public.publications          p  ON p.id             = fp.publication_id
JOIN      public.departments           d  ON d.id             = f.department_id
JOIN      public.institutes            i  ON i.id             = f.institute_id
WHERE     f.ria_user_id = 233046          -- ← swap with any ria_user_id
GROUP BY  f.id, f.author_name, f.ria_user_id, d.name, i.name;
