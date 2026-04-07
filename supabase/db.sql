-- ================================================================
--  RIA — Research Intelligence & Analytics
--  Supabase / PostgreSQL  |  Production Schema
--  KLE Technological University
--
--  HOW TO RUN:
--    Supabase Dashboard → SQL Editor → paste & run in order:
--      1. EXTENSIONS
--      2. SCHEMA SETUP
--      3. TABLES
--      4. SEED DATA
--      5. INDEXES
--      6. ROW LEVEL SECURITY
--      7. FUNCTIONS & TRIGGERS
--      8. VIEWS
--
--  Auth strategy:
--    Supabase Auth (auth.users) is the identity provider.
--    Our public.profiles table links auth.users.id to faculty.
--    role_level drives RLS policies (Faculty < HoD < Dean < VC < Admin).
-- ================================================================


-- ================================================================
-- 0. EXTENSIONS
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- fuzzy name search on faculty/publications
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- accent-insensitive search


-- ================================================================
-- 0b. CUSTOM TYPES
-- ================================================================
DO $$ BEGIN
    CREATE TYPE role_level_t    AS ENUM ('Faculty','HoD','Dean','VC','Admin');
    CREATE TYPE article_type_t  AS ENUM ('Journal','Conference','Book Chapter','Book','PrePrint','Working Paper');
    CREATE TYPE level_t         AS ENUM ('International','National');
    CREATE TYPE match_source_t  AS ENUM ('USERID','NAME','UNMATCHED');
    CREATE TYPE match_method_t  AS ENUM ('USERID','NAME','MANUAL','UNMATCHED');
    CREATE TYPE q_rank_t        AS ENUM ('Q1','Q2','Q3','Q4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ================================================================
-- SAFETY: drop in reverse FK order (idempotent re-runs)
-- ================================================================
DROP TABLE IF EXISTS public.faculty_publications CASCADE;
DROP TABLE IF EXISTS public.publications          CASCADE;
DROP TABLE IF EXISTS public.faculty               CASCADE;
DROP TABLE IF EXISTS public.profiles              CASCADE;
DROP TABLE IF EXISTS public.departments           CASCADE;
DROP TABLE IF EXISTS public.institutes            CASCADE;


-- ================================================================
-- 1. INSTITUTES  (18 rows)
-- ================================================================
CREATE TABLE public.institutes (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(200) NOT NULL,
    short_name  VARCHAR(80),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_institutes_name UNIQUE (name)
);

COMMENT ON TABLE  public.institutes             IS 'Top-level academic institutes / schools / colleges.';
COMMENT ON COLUMN public.institutes.short_name  IS 'Abbreviation used in UI badges, e.g. CSE, ECE, MCA.';

-- ── Seed ──────────────────────────────────────────────────────
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
('Dr. MS Sheshgiri College of Engineering and Technology', 'Sheshgiri'),
('Department of Mathematics',                              'Maths'),
('School of Civil Engineering',                            'Civil'),
('Department of Automation and Robotics',                  'Automation'),
('School of Management Studies and Research',              'Management'),
('Department of Humanities',                               'Humanities'),
('School of Architecture',                                 'Architecture'),
('KLE Law College',                                        'Law');


-- ================================================================
-- 2. DEPARTMENTS  (36 rows)
-- ================================================================
-- Normalisation applied:
--   "Law " (trailing space)             → "Law"
--   "Centre for Material Science"       → "Centre for Material Science (CMS)"
--   "Master of Computer Applications"  → "Computer Application"
--   UNIQUE(name, institute_id): same dept name valid across different institutes
-- ================================================================
CREATE TABLE public.departments (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(200) NOT NULL,
    institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_departments_name_institute UNIQUE (name, institute_id)
);

COMMENT ON TABLE public.departments IS '36 departments, each scoped to one institute. Same name allowed in different institutes.';

-- ── Seed (resolves institute name → UUID at insert time) ──────
INSERT INTO public.departments (name, institute_id)
SELECT d.dept_name, i.id
FROM (VALUES
    -- Centres
    ('Centre for Engineering Education and Research (CEER)', 'Centres'),
    ('Centre for Material Science (CMS)',                    'Centres'),
    -- Standalone depts
    ('Automation and Robotics',                              'Department of Automation and Robotics'),
    ('Biotechnology',                                        'Department of Biotechnology'),
    ('Chemistry',                                            'Department of Chemistry'),
    ('Electrical and Electronics Engineering',               'Department of Electrical and Electronics Engineering'),
    ('Humanities and Social Sciences',                       'Department of Humanities'),
    ('Mathematics',                                          'Department of Mathematics'),
    ('Physics',                                              'Department of Physics'),
    -- Sheshgiri College
    ('BioMedical Engineering',                               'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Centre for Material Science (CMS)',                    'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Chemical Engineering',                                 'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Civil Engineering',                                    'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Computer Science and Engineering',                     'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Electrical and Electronics Engineering',               'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Electronics and Communication Engineering',            'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Engineering Science and Humanities',                   'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Master of Business Administration',                    'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Computer Application',                                 'Dr. MS Sheshgiri College of Engineering and Technology'),
    ('Mechanical Engineering',                               'Dr. MS Sheshgiri College of Engineering and Technology'),
    -- KLE Law College
    ('Commerce',                                             'KLE Law College'),
    ('Economics',                                            'KLE Law College'),
    ('English',                                             'KLE Law College'),
    ('History',                                              'KLE Law College'),
    ('Law',                                                  'KLE Law College'),
    ('Management',                                           'KLE Law College'),
    ('Political Scince',                                     'KLE Law College'),   -- kept as-is from source data
    -- MCA
    ('Computer Application',                                 'Master of Computer Application'),
    -- Schools
    ('Architecture',                                         'School of Architecture'),
    ('Civil Engineering',                                    'School of Civil Engineering'),
    ('Computer Science and Engineering',                     'School of Computer Science and Engineering'),
    ('Digital Electronics',                                  'School of Electronics and Communication Engineering'),
    ('Electronics and Communication Engineering',            'School of Electronics and Communication Engineering'),
    ('Management Studies',                                   'School of Management Studies and Research'),
    ('Mechanical Engineering',                               'School of Mechanical Engineering'),
    ('Advanced Sciences',                                    'School of Sciences')
) AS d(dept_name, inst_name)
JOIN public.institutes i ON i.name = d.inst_name;


-- ================================================================
-- 3. PROFILES  (extends Supabase auth.users)
-- ================================================================
-- auth.users is owned by Supabase Auth — never alter it directly.
-- profiles.id = auth.users.id (UUID, 1-to-1).
-- role_level controls what each user can see via RLS policies.
-- faculty_id is set after the faculty row is created (nullable until then).
-- ================================================================
CREATE TABLE public.profiles (
    id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    ria_user_id   INTEGER     UNIQUE,           -- legacy RIA numeric login ID (e.g. 233046)
    full_name     VARCHAR(200),
    role_level    role_level_t NOT NULL DEFAULT 'Faculty',
    department_id UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
    institute_id  UUID        REFERENCES public.institutes(id)  ON DELETE SET NULL,
    faculty_id    UUID,                         -- set after faculty row created; FK added below
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.profiles              IS 'Extends auth.users. One row per authenticated user. role_level drives RLS.';
COMMENT ON COLUMN public.profiles.ria_user_id  IS 'Legacy numeric RIA system login ID. Unique. Maps to faculty.ria_user_id.';
COMMENT ON COLUMN public.profiles.faculty_id   IS 'FK → faculty.id. Nullable until the faculty record is seeded.';


-- ================================================================
-- 4. FACULTY  (739 rows)
-- ================================================================
-- employee_id is NULLABLE — 139 of 739 records have no employee ID.
-- ria_user_id is the unique numeric identifier from the source system.
-- All 36 metric columns mirror the Excel data model exactly.
-- ================================================================
CREATE TABLE public.faculty (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- ── Identity ────────────────────────────────────────────────
    employee_id           VARCHAR(20),                        -- nullable: 139 rows lack this
    ria_user_id           INTEGER      NOT NULL UNIQUE,       -- e.g. 233046; links to profiles.ria_user_id
    author_name           VARCHAR(200) NOT NULL,

    -- ── Organisation ────────────────────────────────────────────
    department_id         UUID         NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    institute_id          UUID         NOT NULL REFERENCES public.institutes(id)  ON DELETE RESTRICT,

    -- ── Publication Counts ──────────────────────────────────────
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

    -- ── Citations ───────────────────────────────────────────────
    scopus_citation       INTEGER      NOT NULL DEFAULT 0,
    wos_citations         INTEGER      NOT NULL DEFAULT 0,
    gs_citations          INTEGER      NOT NULL DEFAULT 0,

    -- ── H-Index ─────────────────────────────────────────────────
    scopus_hindex         INTEGER      NOT NULL DEFAULT 0,
    wos_hindex            INTEGER      NOT NULL DEFAULT 0,
    gs_hindex             INTEGER      NOT NULL DEFAULT 0,

    -- ── i10-Index ───────────────────────────────────────────────
    scopus_i10_index      INTEGER      NOT NULL DEFAULT 0,
    wos_i10_index         INTEGER      NOT NULL DEFAULT 0,

    -- ── Avg Journal Quality (across all faculty publications) ───
    avg_snip              NUMERIC(6,2),
    avg_citescore         NUMERIC(6,2),
    avg_impfactor         NUMERIC(6,2),

    -- ── Quartile Counts ─────────────────────────────────────────
    scopus_q1_count       INTEGER      NOT NULL DEFAULT 0,
    scopus_q2_count       INTEGER      NOT NULL DEFAULT 0,
    wos_q1_count          INTEGER      NOT NULL DEFAULT 0,
    wos_q2_count          INTEGER      NOT NULL DEFAULT 0,

    -- ── Output Type Counts ──────────────────────────────────────
    journal_count         INTEGER      NOT NULL DEFAULT 0,
    conference_count      INTEGER      NOT NULL DEFAULT 0,
    book_count            INTEGER      NOT NULL DEFAULT 0,
    book_chapter_count    INTEGER      NOT NULL DEFAULT 0,

    -- ── Audit ───────────────────────────────────────────────────
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- ── Constraints ─────────────────────────────────────────────
    CONSTRAINT chk_faculty_pub_counts   CHECK (total_pub_count   >= 0),
    CONSTRAINT chk_faculty_scopus_count CHECK (scopus_pub_count  >= 0),
    CONSTRAINT chk_faculty_hindex       CHECK (scopus_hindex     >= 0)
);

COMMENT ON TABLE  public.faculty             IS '739 KLE Tech faculty members with full bibliometric profile.';
COMMENT ON COLUMN public.faculty.employee_id IS 'Nullable: 139 faculty have no employee ID in source data.';
COMMENT ON COLUMN public.faculty.ria_user_id IS 'Unique numeric RIA system ID. Primary join key to profiles.ria_user_id.';

-- ── Wire the deferred FK: profiles.faculty_id → faculty.id ───
ALTER TABLE public.profiles
    ADD CONSTRAINT fk_profiles_faculty
    FOREIGN KEY (faculty_id) REFERENCES public.faculty(id) ON DELETE SET NULL;


-- ================================================================
-- 5. PUBLICATIONS  (6,516 rows)
-- ================================================================
CREATE TABLE public.publications (
    id                     UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    pub_id                 VARCHAR(20)  NOT NULL,             -- source system PUB ID (e.g. "299101")

    -- ── Authorship (raw strings from import) ────────────────────
    authors                TEXT,                             -- pipe-separated full author list
    home_authors           TEXT,                             -- semicolon-separated home faculty names
    home_author_department TEXT,                             -- semicolon-separated dept names
    home_author_institute  TEXT,                             -- semicolon-separated institute names
    home_author_school     VARCHAR(200),
    home_author_location   VARCHAR(200),
    author_address         TEXT,                             -- full affiliation block

    -- ── Bibliographic ────────────────────────────────────────────
    title                  TEXT         NOT NULL,
    source_publication     VARCHAR(500),
    article_type           article_type_t,
    level                  level_t,
    year                   SMALLINT     CHECK (year BETWEEN 1900 AND 2100),
    month                  SMALLINT     CHECK (month BETWEEN 1 AND 12),
    vol_no                 VARCHAR(20),
    iss_no                 VARCHAR(20),
    b_page                 VARCHAR(20),
    e_page                 VARCHAR(20),
    doi                    VARCHAR(300),
    link                   TEXT,
    abstract               TEXT,
    technology_areas       TEXT,                             -- comma-separated tags

    -- ── Indexing Flags ───────────────────────────────────────────
    -- Using BOOLEAN for clean Supabase queries/filters.
    -- NULL = unknown/not checked. TRUE = indexed.
    is_scs                 BOOLEAN,                          -- Scopus
    is_wos                 BOOLEAN,                          -- Web of Science
    is_sci                 BOOLEAN,                          -- SCI
    is_pm                  BOOLEAN,                          -- PubMed
    is_ieee                BOOLEAN,                          -- IEEE
    is_gs                  BOOLEAN,                          -- Google Scholar
    is_ugc                 BOOLEAN,                          -- UGC CARE
    is_ugc_group1          BOOLEAN,                          -- UGC CARE Group 1
    is_abdc                BOOLEAN,                          -- ABDC
    is_indexed             BOOLEAN,                          -- composite flag

    -- ── Journal Quality Metrics ──────────────────────────────────
    snip                   NUMERIC(8,3),
    sjr                    NUMERIC(8,3),
    impact_factor          NUMERIC(8,3),
    cite_score             NUMERIC(8,3),
    q_rank_scopus          q_rank_t,
    q_rank_wos             q_rank_t,

    -- ── Identifiers ─────────────────────────────────────────────
    p_issn                 VARCHAR(20),
    e_issn                 VARCHAR(20),
    p_isbn                 VARCHAR(30),
    e_isbn                 VARCHAR(30),

    -- ── University Ranking Flags ─────────────────────────────────
    nirf                   BOOLEAN      NOT NULL DEFAULT FALSE,
    naac                   BOOLEAN      NOT NULL DEFAULT FALSE,
    qs                     BOOLEAN      NOT NULL DEFAULT FALSE,
    the                    BOOLEAN      NOT NULL DEFAULT FALSE,

    -- ── Import / Match Metadata ──────────────────────────────────
    staff_ria_user_id      INTEGER,                          -- numeric RIA ID of matched faculty
    matched_institute      VARCHAR(200),
    matched_department     VARCHAR(200),
    match_source           match_source_t,

    -- ── Audit ────────────────────────────────────────────────────
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_publications_pub_id UNIQUE (pub_id),
    CONSTRAINT chk_pub_year           CHECK (year IS NULL OR (year BETWEEN 1900 AND 2100)),
    CONSTRAINT chk_pub_impact_factor  CHECK (impact_factor IS NULL OR impact_factor >= 0)
);

COMMENT ON TABLE  public.publications                   IS '6,516 research publications imported from PubMine.';
COMMENT ON COLUMN public.publications.pub_id            IS 'Source system publication ID. Unique.';
COMMENT ON COLUMN public.publications.home_authors      IS 'Semicolon-separated names of KLE faculty who authored this publication.';
COMMENT ON COLUMN public.publications.staff_ria_user_id IS 'Numeric RIA user ID of the primary matched faculty (STAFF USER ID from import).';
COMMENT ON COLUMN public.publications.is_scs            IS 'TRUE = indexed in Scopus. NULL = not checked.';


-- ================================================================
-- 6. FACULTY_PUBLICATIONS  (many-to-many junction)
-- ================================================================
-- Parsing strategy:
--   HOME AUTHORS (semicolon-separated) → split → match against faculty.author_name
--   is_corresponding = TRUE where faculty.ria_user_id = publications.staff_ria_user_id
--   match_method tracks confidence of the link
-- ================================================================
CREATE TABLE public.faculty_publications (
    id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id       UUID           NOT NULL REFERENCES public.faculty(id)       ON DELETE CASCADE,
    publication_id   UUID           NOT NULL REFERENCES public.publications(id)  ON DELETE CASCADE,
    is_corresponding BOOLEAN        NOT NULL DEFAULT FALSE,
    match_method     match_method_t NOT NULL DEFAULT 'USERID',
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_faculty_publication UNIQUE (faculty_id, publication_id)
);

COMMENT ON TABLE  public.faculty_publications                  IS 'Junction: links faculty to publications (M:N). One row per faculty-publication pair.';
COMMENT ON COLUMN public.faculty_publications.is_corresponding IS 'TRUE when this faculty is the corresponding/primary author (matched via staff_ria_user_id).';
COMMENT ON COLUMN public.faculty_publications.match_method     IS 'How this link was established: USERID | NAME | MANUAL | UNMATCHED.';


-- ================================================================
-- 7. INDEXES  (performance for common RIA queries)
-- ================================================================

-- institutes
CREATE INDEX idx_institutes_name        ON public.institutes(name);

-- departments
CREATE INDEX idx_departments_institute  ON public.departments(institute_id);

-- profiles
CREATE INDEX idx_profiles_ria_user_id   ON public.profiles(ria_user_id);
CREATE INDEX idx_profiles_role          ON public.profiles(role_level);
CREATE INDEX idx_profiles_department    ON public.profiles(department_id);
CREATE INDEX idx_profiles_institute     ON public.profiles(institute_id);

-- faculty
CREATE INDEX idx_faculty_author_name    ON public.faculty USING gin(author_name gin_trgm_ops);  -- fuzzy search
CREATE INDEX idx_faculty_department     ON public.faculty(department_id);
CREATE INDEX idx_faculty_institute      ON public.faculty(institute_id);
CREATE INDEX idx_faculty_ria_user_id    ON public.faculty(ria_user_id);
CREATE INDEX idx_faculty_scopus_hindex  ON public.faculty(scopus_hindex DESC);
CREATE INDEX idx_faculty_total_pubs     ON public.faculty(total_pub_count DESC);

-- publications
CREATE INDEX idx_pub_year               ON public.publications(year DESC);
CREATE INDEX idx_pub_article_type       ON public.publications(article_type);
CREATE INDEX idx_pub_q_rank_scopus      ON public.publications(q_rank_scopus);
CREATE INDEX idx_pub_q_rank_wos         ON public.publications(q_rank_wos);
CREATE INDEX idx_pub_impact_factor      ON public.publications(impact_factor DESC NULLS LAST);
CREATE INDEX idx_pub_doi                ON public.publications(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_pub_staff_uid          ON public.publications(staff_ria_user_id);
CREATE INDEX idx_pub_title_trgm         ON public.publications USING gin(title gin_trgm_ops);      -- full-text fuzzy
CREATE INDEX idx_pub_abstract_fts       ON public.publications USING gin(to_tsvector('english', coalesce(abstract, '')));
CREATE INDEX idx_pub_is_scs             ON public.publications(is_scs) WHERE is_scs = TRUE;
CREATE INDEX idx_pub_is_wos             ON public.publications(is_wos) WHERE is_wos = TRUE;

-- faculty_publications
CREATE INDEX idx_fp_faculty_id          ON public.faculty_publications(faculty_id);
CREATE INDEX idx_fp_publication_id      ON public.faculty_publications(publication_id);
CREATE INDEX idx_fp_corresponding       ON public.faculty_publications(is_corresponding) WHERE is_corresponding = TRUE;


-- ================================================================
-- 8. TRIGGERS  (auto-update updated_at on every table)
-- ================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_institutes_updated_at
    BEFORE UPDATE ON public.institutes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_faculty_updated_at
    BEFORE UPDATE ON public.faculty
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_publications_updated_at
    BEFORE UPDATE ON public.publications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_faculty_publications_updated_at
    BEFORE UPDATE ON public.faculty_publications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ================================================================
-- 9. AUTO-CREATE PROFILE ON SUPABASE SIGNUP
-- ================================================================
-- When a new user signs up via Supabase Auth, automatically
-- insert a profiles row with default role 'Faculty'.
-- ================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role_level)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'Faculty'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ================================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ================================================================
-- Philosophy:
--   READ  : All authenticated users can read all data (research portal).
--   WRITE : Scoped by role_level.
--             Faculty  → own profile + own publications only
--             HoD      → own dept
--             Dean     → own institute
--             VC/Admin → unrestricted
-- ================================================================

ALTER TABLE public.institutes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_publications ENABLE ROW LEVEL SECURITY;

-- ── Helper: get current user's role ─────────────────────────
CREATE OR REPLACE FUNCTION public.current_role_level()
RETURNS role_level_t LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role_level FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Helper: get current user's faculty_id ───────────────────
CREATE OR REPLACE FUNCTION public.current_faculty_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT faculty_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Helper: get current user's institute_id ─────────────────
CREATE OR REPLACE FUNCTION public.current_institute_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT institute_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Helper: get current user's department_id ────────────────
CREATE OR REPLACE FUNCTION public.current_department_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT department_id FROM public.profiles WHERE id = auth.uid();
$$;


-- ────────────────────────────────────────────────────────────────
-- INSTITUTES — lookup table, all authenticated users read
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "institutes: authenticated read"
    ON public.institutes FOR SELECT
    TO authenticated USING (TRUE);

CREATE POLICY "institutes: admin write"
    ON public.institutes FOR ALL
    TO authenticated
    USING (public.current_role_level() IN ('VC','Admin'))
    WITH CHECK (public.current_role_level() IN ('VC','Admin'));


-- ────────────────────────────────────────────────────────────────
-- DEPARTMENTS — lookup table, all authenticated users read
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "departments: authenticated read"
    ON public.departments FOR SELECT
    TO authenticated USING (TRUE);

CREATE POLICY "departments: admin write"
    ON public.departments FOR ALL
    TO authenticated
    USING (public.current_role_level() IN ('VC','Admin'))
    WITH CHECK (public.current_role_level() IN ('VC','Admin'));


-- ────────────────────────────────────────────────────────────────
-- PROFILES — users see all profiles (directory); edit only own
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "profiles: authenticated read all"
    ON public.profiles FOR SELECT
    TO authenticated USING (TRUE);

CREATE POLICY "profiles: user edits own"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "profiles: admin full"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.current_role_level() IN ('VC','Admin'))
    WITH CHECK (public.current_role_level() IN ('VC','Admin'));


-- ────────────────────────────────────────────────────────────────
-- FACULTY — all read; scoped writes
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "faculty: authenticated read"
    ON public.faculty FOR SELECT
    TO authenticated USING (TRUE);

-- Faculty can update their own row (non-metric fields only — enforced in app layer)
CREATE POLICY "faculty: own update"
    ON public.faculty FOR UPDATE
    TO authenticated
    USING (id = public.current_faculty_id())
    WITH CHECK (id = public.current_faculty_id());

-- HoD can update faculty in their department
CREATE POLICY "faculty: hod dept update"
    ON public.faculty FOR UPDATE
    TO authenticated
    USING (
        public.current_role_level() IN ('HoD','Dean','VC','Admin')
        AND (
            public.current_role_level() IN ('VC','Admin')
            OR (public.current_role_level() = 'Dean' AND institute_id = public.current_institute_id())
            OR (public.current_role_level() = 'HoD'  AND department_id = public.current_department_id())
        )
    )
    WITH CHECK (
        public.current_role_level() IN ('HoD','Dean','VC','Admin')
    );

CREATE POLICY "faculty: admin insert delete"
    ON public.faculty FOR INSERT
    TO authenticated
    WITH CHECK (public.current_role_level() IN ('VC','Admin'));


-- ────────────────────────────────────────────────────────────────
-- PUBLICATIONS — all read; scoped writes
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "publications: authenticated read"
    ON public.publications FOR SELECT
    TO authenticated USING (TRUE);

-- Faculty can insert publications (claimed ownership via faculty_publications)
CREATE POLICY "publications: faculty insert"
    ON public.publications FOR INSERT
    TO authenticated
    WITH CHECK (public.current_role_level() IN ('Faculty','HoD','Dean','VC','Admin'));

-- Faculty can update publications where they are an author
CREATE POLICY "publications: faculty own update"
    ON public.publications FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.faculty_publications fp
            WHERE fp.publication_id = id
              AND fp.faculty_id = public.current_faculty_id()
        )
        OR public.current_role_level() IN ('HoD','Dean','VC','Admin')
    )
    WITH CHECK (TRUE);

CREATE POLICY "publications: admin delete"
    ON public.publications FOR DELETE
    TO authenticated
    USING (public.current_role_level() IN ('VC','Admin'));


-- ────────────────────────────────────────────────────────────────
-- FACULTY_PUBLICATIONS — all read; faculty manage own links
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "faculty_publications: authenticated read"
    ON public.faculty_publications FOR SELECT
    TO authenticated USING (TRUE);

CREATE POLICY "faculty_publications: faculty insert own"
    ON public.faculty_publications FOR INSERT
    TO authenticated
    WITH CHECK (
        faculty_id = public.current_faculty_id()
        OR public.current_role_level() IN ('HoD','Dean','VC','Admin')
    );

CREATE POLICY "faculty_publications: faculty delete own"
    ON public.faculty_publications FOR DELETE
    TO authenticated
    USING (
        faculty_id = public.current_faculty_id()
        OR public.current_role_level() IN ('VC','Admin')
    );


-- ================================================================
-- 11. UTILITY FUNCTIONS
-- ================================================================

-- Full-text search on publications
CREATE OR REPLACE FUNCTION public.search_publications(query TEXT)
RETURNS SETOF public.publications LANGUAGE sql STABLE AS $$
    SELECT *
    FROM public.publications
    WHERE
        to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
        @@ plainto_tsquery('english', query)
        OR title ILIKE '%' || query || '%'
    ORDER BY
        ts_rank(
            to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')),
            plainto_tsquery('english', query)
        ) DESC;
$$;

-- Fuzzy author name search (trigram)
CREATE OR REPLACE FUNCTION public.search_faculty_by_name(query TEXT)
RETURNS SETOF public.faculty LANGUAGE sql STABLE AS $$
    SELECT *
    FROM public.faculty
    WHERE author_name ILIKE '%' || query || '%'
       OR similarity(author_name, query) > 0.3
    ORDER BY similarity(author_name, query) DESC;
$$;


-- ================================================================
-- 12. VIEWS  (Supabase exposes these to PostgREST automatically)
-- ================================================================

-- Faculty with resolved org names — used by dashboard/directory
CREATE OR REPLACE VIEW public.v_faculty_full
WITH (security_invoker = TRUE)             -- respects caller's RLS
AS
SELECT
    f.id,
    f.employee_id,
    f.ria_user_id,
    f.author_name,
    d.name            AS department,
    i.name            AS institute,
    i.short_name      AS institute_short,
    f.total_pub_count,
    f.scopus_pub_count,
    f.wos_pub_count,
    f.gs_pub_count,
    f.scopus_citation,
    f.wos_citations,
    f.gs_citations,
    f.scopus_hindex,
    f.wos_hindex,
    f.gs_hindex,
    f.scopus_i10_index,
    f.wos_i10_index,
    f.avg_snip,
    f.avg_citescore,
    f.avg_impfactor,
    f.scopus_q1_count,
    f.scopus_q2_count,
    f.wos_q1_count,
    f.wos_q2_count,
    f.journal_count,
    f.conference_count,
    f.book_count,
    f.book_chapter_count,
    f.created_at,
    f.updated_at
FROM public.faculty      f
JOIN public.departments  d ON d.id = f.department_id
JOIN public.institutes   i ON i.id = f.institute_id;

COMMENT ON VIEW public.v_faculty_full IS 'Faculty with resolved department and institute names. RLS-safe (security_invoker).';


-- Institute-level aggregated metrics — used by admin/VC dashboards
CREATE OR REPLACE VIEW public.v_institute_summary
WITH (security_invoker = TRUE)
AS
SELECT
    i.id                            AS institute_id,
    i.name                          AS institute,
    i.short_name,
    COUNT(DISTINCT f.id)            AS faculty_count,
    SUM(f.total_pub_count)          AS total_publications,
    SUM(f.scopus_citation)          AS total_scopus_citations,
    ROUND(AVG(f.scopus_hindex), 2)  AS avg_scopus_hindex,
    SUM(f.scopus_q1_count)          AS total_q1_count,
    SUM(f.wos_pub_count)            AS total_wos_pubs,
    ROUND(AVG(f.avg_impfactor), 3)  AS avg_impact_factor
FROM public.institutes  i
LEFT JOIN public.faculty f ON p.institute_id = i.id
GROUP BY i.id, i.name, i.short_name
ORDER BY total_publications DESC;

-- Fix typo in view above (p → f)
DROP VIEW IF EXISTS public.v_institute_summary;
CREATE OR REPLACE VIEW public.v_institute_summary
WITH (security_invoker = TRUE)
AS
SELECT
    i.id                            AS institute_id,
    i.name                          AS institute,
    i.short_name,
    COUNT(DISTINCT f.id)            AS faculty_count,
    SUM(f.total_pub_count)          AS total_publications,
    SUM(f.scopus_citation)          AS total_scopus_citations,
    ROUND(AVG(f.scopus_hindex), 2)  AS avg_scopus_hindex,
    SUM(f.scopus_q1_count)          AS total_q1_count,
    SUM(f.wos_pub_count)            AS total_wos_pubs,
    ROUND(AVG(f.avg_impfactor), 3)  AS avg_impact_factor
FROM public.institutes  i
LEFT JOIN public.faculty f ON f.institute_id = i.id
GROUP BY i.id, i.name, i.short_name
ORDER BY total_publications DESC;

COMMENT ON VIEW public.v_institute_summary IS 'Aggregated publication & citation metrics per institute.';


-- Publication list with faculty authors — used by pub explorer
CREATE OR REPLACE VIEW public.v_pub_with_faculty
WITH (security_invoker = TRUE)
AS
SELECT
    p.id                AS publication_id,
    p.pub_id,
    p.title,
    p.year,
    p.month,
    p.article_type,
    p.level,
    p.source_publication,
    p.impact_factor,
    p.cite_score,
    p.q_rank_scopus,
    p.q_rank_wos,
    p.is_scs,
    p.is_wos,
    p.doi,
    p.link,
    f.id                AS faculty_id,
    f.author_name,
    f.ria_user_id,
    fp.is_corresponding,
    d.name              AS faculty_department,
    ins.name            AS faculty_institute
FROM public.publications        p
JOIN public.faculty_publications fp  ON fp.publication_id = p.id
JOIN public.faculty              f   ON f.id              = fp.faculty_id
JOIN public.departments          d   ON d.id              = f.department_id
JOIN public.institutes           ins ON ins.id            = f.institute_id;

COMMENT ON VIEW public.v_pub_with_faculty IS 'Publications with each linked faculty author. One row per faculty-publication pair.';


-- ================================================================
-- END OF SCHEMA
-- ================================================================
-- Next steps (run separately after schema is applied):
--   1. Import 739 faculty rows via Supabase CSV import or Python script
--   2. Import 6,516 publications via batch INSERT / upsert
--   3. Parse HOME AUTHORS field → populate faculty_publications junction
--   4. Create profiles rows for each faculty (ria_user_id linkage)
--   5. Invite faculty via Supabase Auth → they claim their profile
-- ================================================================