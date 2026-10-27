-- ============================================================
--  RIA — Research Intelligence & Analytics
--  MIGRATION 001: Initial schema
--  Schema v3.0  |  Supabase / PostgreSQL 15+
--  KLE Technological University
--
--  Uses the `ria` PostgreSQL schema to coexist with FIA on the
--  same Supabase project without table name conflicts.
-- ============================================================


-- ============================================================
-- 0. SCHEMA + GRANTS
-- ============================================================
CREATE SCHEMA IF NOT EXISTS ria;

-- Allow PostgREST and Supabase roles to use this schema
GRANT USAGE ON SCHEMA ria TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ria
    GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ria
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ria
    GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;


-- ============================================================
-- 1. EXTENSIONS  (in public — shared with FIA)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";


-- ============================================================
-- 2. CUSTOM TYPES
-- ============================================================
DO $$ BEGIN
    CREATE TYPE ria.role_level_t   AS ENUM ('Faculty','HoD','Dean','VC','Admin');
    CREATE TYPE ria.article_type_t AS ENUM (
        'Journal','Conference','Book Chapter','Book','PrePrint','Working Paper'
    );
    CREATE TYPE ria.level_t        AS ENUM ('International','National');
    CREATE TYPE ria.q_rank_t       AS ENUM ('Q1','Q2','Q3','Q4');
    CREATE TYPE ria.abdc_grade_t   AS ENUM ('A*','A','B','C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- 3. INSTITUTES  (18 rows seeded)
-- ============================================================
CREATE TABLE ria.institutes (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(200) NOT NULL,
    short_name  VARCHAR(80),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_institutes_name UNIQUE (name)
);

INSERT INTO ria.institutes (name, short_name) VALUES
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
CREATE TABLE ria.departments (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(200) NOT NULL,
    institute_id UUID         NOT NULL
                     REFERENCES ria.institutes(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_departments_name_institute UNIQUE (name, institute_id)
);

INSERT INTO ria.departments (name, institute_id)
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
JOIN ria.institutes i ON i.name = d.inst_name;


-- ============================================================
-- 5. PROFILES  (Supabase auth bridge)
-- ============================================================
CREATE TABLE ria.profiles (
    id            UUID                PRIMARY KEY
                      REFERENCES auth.users(id) ON DELETE CASCADE,
    ria_user_id   INTEGER             UNIQUE,
    full_name     VARCHAR(200),
    role_level    ria.role_level_t    NOT NULL DEFAULT 'Faculty',
    department_id UUID                REFERENCES ria.departments(id) ON DELETE SET NULL,
    institute_id  UUID                REFERENCES ria.institutes(id)  ON DELETE SET NULL,
    faculty_id    UUID,
    is_active     BOOLEAN             NOT NULL DEFAULT TRUE,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);
COMMENT ON COLUMN ria.profiles.ria_user_id IS
    'Legacy integer RIA login ID. All cross-table links use this integer, not the auth UUID.';


-- ============================================================
-- 6. FACULTY  (739 rows imported separately)
-- ============================================================
CREATE TABLE ria.faculty (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id           VARCHAR(20),
    ria_user_id           INTEGER      NOT NULL UNIQUE,
    author_name           VARCHAR(200) NOT NULL,
    department_id         UUID         NOT NULL
                              REFERENCES ria.departments(id) ON DELETE RESTRICT,
    institute_id          UUID         NOT NULL
                              REFERENCES ria.institutes(id)  ON DELETE RESTRICT,

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

    scopus_citation       INTEGER      NOT NULL DEFAULT 0,
    wos_citations         INTEGER      NOT NULL DEFAULT 0,
    gs_citations          INTEGER      NOT NULL DEFAULT 0,

    scopus_hindex         INTEGER      NOT NULL DEFAULT 0,
    wos_hindex            INTEGER      NOT NULL DEFAULT 0,
    gs_hindex             INTEGER      NOT NULL DEFAULT 0,
    scopus_i10_index      INTEGER      NOT NULL DEFAULT 0,
    wos_i10_index         INTEGER      NOT NULL DEFAULT 0,

    avg_snip              NUMERIC(6,2),
    avg_citescore         NUMERIC(6,2),
    avg_impfactor         NUMERIC(6,2),

    scopus_q1_count       INTEGER      NOT NULL DEFAULT 0,
    scopus_q2_count       INTEGER      NOT NULL DEFAULT 0,
    wos_q1_count          INTEGER      NOT NULL DEFAULT 0,
    wos_q2_count          INTEGER      NOT NULL DEFAULT 0,

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
COMMENT ON COLUMN ria.faculty.ria_user_id IS
    'Unique integer RIA system ID. FK target for publications.staff_ria_user_id.';
COMMENT ON COLUMN ria.faculty.employee_id IS
    'Nullable — 139 of 739 faculty have no employee ID in source data.';

-- Deferred FK: profiles.faculty_id → faculty.id
ALTER TABLE ria.profiles
    ADD CONSTRAINT fk_profiles_faculty
    FOREIGN KEY (faculty_id) REFERENCES ria.faculty(id) ON DELETE SET NULL;


-- ============================================================
-- 7. PUBLICATIONS  (6,516 rows imported separately)
-- ============================================================
CREATE TABLE ria.publications (
    id                     UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    pub_id                 INTEGER            NOT NULL,

    authors                TEXT,
    home_authors           TEXT,
    home_author_department TEXT,
    home_author_institute  TEXT,
    home_author_school     VARCHAR(200),
    home_author_location   VARCHAR(200),
    author_address         TEXT,

    title                  TEXT               NOT NULL,
    source_publication     VARCHAR(500),
    article_type           ria.article_type_t,
    level                  ria.level_t,

    pub_date               VARCHAR(10),
    year                   SMALLINT           GENERATED ALWAYS AS (
                               CASE WHEN pub_date ~ '^\d{2}/\d{2}/\d{4}$'
                               THEN CAST(RIGHT(pub_date, 4) AS SMALLINT)
                               ELSE NULL END
                           ) STORED,
    month                  SMALLINT           GENERATED ALWAYS AS (
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
    technology_areas       TEXT,

    scs_citations          INTEGER,
    wos_citations_pub      INTEGER,
    ieee_citations         INTEGER,
    gs_citations_pub       INTEGER,

    is_sci                 BOOLEAN,
    is_pm                  BOOLEAN,
    is_ugc                 BOOLEAN,
    is_ugc_group1          BOOLEAN,

    abdc_grade             ria.abdc_grade_t,

    snip                   NUMERIC(8,3),
    sjr                    NUMERIC(8,3),
    impact_factor          NUMERIC(8,3),
    cite_score             NUMERIC(8,3),
    q_rank_scopus          ria.q_rank_t,
    q_rank_wos             ria.q_rank_t,

    p_issn                 VARCHAR(20),
    e_issn                 VARCHAR(20),
    p_isbn                 VARCHAR(30),
    e_isbn                 VARCHAR(30),

    nirf                   BOOLEAN            NOT NULL DEFAULT FALSE,
    naac                   BOOLEAN            NOT NULL DEFAULT FALSE,
    qs                     BOOLEAN            NOT NULL DEFAULT FALSE,
    the                    BOOLEAN            NOT NULL DEFAULT FALSE,
    is_indexed             BOOLEAN            NOT NULL DEFAULT FALSE,

    staff_ria_user_id      INTEGER
                               REFERENCES ria.faculty(ria_user_id)
                               ON DELETE SET NULL,
    matched_institute      VARCHAR(200),
    matched_department     VARCHAR(200),

    created_at             TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_publications_pub_id UNIQUE (pub_id),

    CONSTRAINT chk_pub_date_format CHECK (
        pub_date IS NULL
        OR pub_date ~ '^(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[12][0-9]{3}$'
    ),
    CONSTRAINT chk_authors_no_semicolon CHECK (
        authors IS NULL OR authors NOT LIKE '%;%'
    ),
    CONSTRAINT chk_home_authors_no_pipe CHECK (
        home_authors IS NULL OR home_authors NOT LIKE '%|%'
    ),
    CONSTRAINT chk_tech_areas_comma_only CHECK (
        technology_areas IS NULL
        OR technology_areas = 'Not Available'
        OR (technology_areas NOT LIKE '%|%' AND technology_areas NOT LIKE '%;%')
    ),
    CONSTRAINT chk_scs_nonneg    CHECK (scs_citations     IS NULL OR scs_citations     >= 0),
    CONSTRAINT chk_wos_nonneg    CHECK (wos_citations_pub IS NULL OR wos_citations_pub >= 0),
    CONSTRAINT chk_ieee_nonneg   CHECK (ieee_citations    IS NULL OR ieee_citations    >= 0),
    CONSTRAINT chk_gs_nonneg     CHECK (gs_citations_pub  IS NULL OR gs_citations_pub  >= 0),
    CONSTRAINT chk_impact_nonneg CHECK (impact_factor     IS NULL OR impact_factor     >= 0),
    CONSTRAINT chk_snip_nonneg   CHECK (snip              IS NULL OR snip              >= 0)
);

COMMENT ON COLUMN ria.publications.pub_id IS
    'Source integer publication ID. Unique. Used for upserts.';
COMMENT ON COLUMN ria.publications.scs_citations IS
    'Scopus citation count. NULL=not indexed. 0=indexed zero citations. N>0=N citations.';
COMMENT ON COLUMN ria.publications.staff_ria_user_id IS
    'ria_user_id of the primary matched faculty. Integer FK → faculty.ria_user_id.';


-- ============================================================
-- 8. FACULTY_PUBLICATIONS  (M:N junction)
-- ============================================================
CREATE TABLE ria.faculty_publications (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_id       UUID        NOT NULL
                         REFERENCES ria.faculty(id) ON DELETE CASCADE,
    publication_id   UUID        NOT NULL
                         REFERENCES ria.publications(id) ON DELETE CASCADE,
    is_corresponding BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_faculty_publication UNIQUE (faculty_id, publication_id)
);


-- ============================================================
-- 9. AUTO-UPDATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION ria.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'institutes','departments','profiles',
    'faculty','publications','faculty_publications'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON ria.%I;
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON ria.%I
      FOR EACH ROW EXECUTE FUNCTION ria.handle_updated_at();
    ', t, t, t, t);
  END LOOP;
END $$;


-- ============================================================
-- 10. INDEXES
-- ============================================================

CREATE INDEX idx_inst_name        ON ria.institutes(name);

CREATE INDEX idx_dept_institute   ON ria.departments(institute_id);

CREATE INDEX idx_prof_ria_user    ON ria.profiles(ria_user_id);
CREATE INDEX idx_prof_role        ON ria.profiles(role_level);
CREATE INDEX idx_prof_dept        ON ria.profiles(department_id);
CREATE INDEX idx_prof_inst        ON ria.profiles(institute_id);
CREATE INDEX idx_prof_faculty     ON ria.profiles(faculty_id);

CREATE INDEX idx_fac_ria_user     ON ria.faculty(ria_user_id);
CREATE INDEX idx_fac_dept         ON ria.faculty(department_id);
CREATE INDEX idx_fac_inst         ON ria.faculty(institute_id);
CREATE INDEX idx_fac_h_scopus     ON ria.faculty(scopus_hindex DESC);
CREATE INDEX idx_fac_total_pubs   ON ria.faculty(total_pub_count DESC);
CREATE INDEX idx_fac_name_trgm    ON ria.faculty
    USING gin(author_name gin_trgm_ops);

CREATE INDEX idx_pub_pub_id       ON ria.publications(pub_id);
CREATE INDEX idx_pub_year         ON ria.publications(year DESC);
CREATE INDEX idx_pub_article_type ON ria.publications(article_type);
CREATE INDEX idx_pub_level        ON ria.publications(level);
CREATE INDEX idx_pub_q_scs        ON ria.publications(q_rank_scopus);
CREATE INDEX idx_pub_q_wos        ON ria.publications(q_rank_wos);
CREATE INDEX idx_pub_impact       ON ria.publications(impact_factor DESC NULLS LAST);
CREATE INDEX idx_pub_cite_score   ON ria.publications(cite_score DESC NULLS LAST);
CREATE INDEX idx_pub_doi          ON ria.publications(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_pub_staff_uid    ON ria.publications(staff_ria_user_id);
CREATE INDEX idx_pub_naac         ON ria.publications(naac) WHERE naac = TRUE;
CREATE INDEX idx_pub_nirf         ON ria.publications(nirf) WHERE nirf = TRUE;
CREATE INDEX idx_pub_qs           ON ria.publications(qs)   WHERE qs   = TRUE;
CREATE INDEX idx_pub_abdc         ON ria.publications(abdc_grade)
    WHERE abdc_grade IS NOT NULL;
CREATE INDEX idx_pub_scopus_idx   ON ria.publications(scs_citations)
    WHERE scs_citations IS NOT NULL;
CREATE INDEX idx_pub_wos_idx      ON ria.publications(wos_citations_pub)
    WHERE wos_citations_pub IS NOT NULL;
CREATE INDEX idx_pub_title_trgm   ON ria.publications
    USING gin(title gin_trgm_ops);
CREATE INDEX idx_pub_abstract_fts ON ria.publications
    USING gin(to_tsvector('english', coalesce(abstract, '')));

CREATE INDEX idx_fp_faculty       ON ria.faculty_publications(faculty_id);
CREATE INDEX idx_fp_publication   ON ria.faculty_publications(publication_id);
CREATE INDEX idx_fp_corresponding ON ria.faculty_publications(is_corresponding)
    WHERE is_corresponding = TRUE;


-- ============================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE ria.institutes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria.departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria.faculty              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria.publications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria.faculty_publications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION ria.my_role()
RETURNS ria.role_level_t LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role_level FROM ria.profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION ria.my_faculty_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT faculty_id FROM ria.profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION ria.my_ria_user_id()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT ria_user_id FROM ria.profiles WHERE id = auth.uid()
$$;

-- Lookup tables
CREATE POLICY "inst_read"  ON ria.institutes  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_read"  ON ria.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "inst_write" ON ria.institutes  FOR ALL    TO authenticated
    USING (ria.my_role() IN ('Admin','VC')) WITH CHECK (ria.my_role() IN ('Admin','VC'));
CREATE POLICY "dept_write" ON ria.departments FOR ALL    TO authenticated
    USING (ria.my_role() IN ('Admin','VC')) WITH CHECK (ria.my_role() IN ('Admin','VC'));

-- Profiles
CREATE POLICY "prof_read"        ON ria.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "prof_insert_self" ON ria.profiles FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());
CREATE POLICY "prof_update"      ON ria.profiles FOR UPDATE TO authenticated
    USING   (id = auth.uid() OR ria.my_role() IN ('Admin','VC'))
    WITH CHECK (id = auth.uid() OR ria.my_role() IN ('Admin','VC'));
CREATE POLICY "prof_delete"      ON ria.profiles FOR DELETE TO authenticated
    USING (ria.my_role() IN ('Admin','VC'));

-- Faculty
CREATE POLICY "fac_read"   ON ria.faculty FOR SELECT TO authenticated USING (true);
CREATE POLICY "fac_insert" ON ria.faculty FOR INSERT TO authenticated
    WITH CHECK (ria.my_role() IN ('Admin','VC','Dean'));
CREATE POLICY "fac_update" ON ria.faculty FOR UPDATE TO authenticated
    USING   (id = ria.my_faculty_id() OR ria.my_role() IN ('Admin','VC','Dean','HoD'))
    WITH CHECK (id = ria.my_faculty_id() OR ria.my_role() IN ('Admin','VC','Dean','HoD'));
CREATE POLICY "fac_delete" ON ria.faculty FOR DELETE TO authenticated
    USING (ria.my_role() IN ('Admin','VC'));

-- Publications
CREATE POLICY "pub_read"   ON ria.publications FOR SELECT TO authenticated USING (true);
CREATE POLICY "pub_insert" ON ria.publications FOR INSERT TO authenticated
    WITH CHECK (
        staff_ria_user_id = ria.my_ria_user_id()
        OR ria.my_role() IN ('Admin','VC','Dean')
    );
CREATE POLICY "pub_update" ON ria.publications FOR UPDATE TO authenticated
    USING   (staff_ria_user_id = ria.my_ria_user_id() OR ria.my_role() IN ('Admin','VC','Dean'))
    WITH CHECK (staff_ria_user_id = ria.my_ria_user_id() OR ria.my_role() IN ('Admin','VC','Dean'));
CREATE POLICY "pub_delete" ON ria.publications FOR DELETE TO authenticated
    USING (ria.my_role() IN ('Admin','VC'));

-- Junction
CREATE POLICY "fp_read"  ON ria.faculty_publications FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_write" ON ria.faculty_publications FOR ALL    TO authenticated
    USING (ria.my_role() IN ('Admin','VC','Dean'))
    WITH CHECK (ria.my_role() IN ('Admin','VC','Dean'));


-- ============================================================
-- 12. VIEWS
-- ============================================================

CREATE OR REPLACE VIEW ria.v_faculty_full
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
FROM      ria.faculty     f
JOIN      ria.departments d ON d.id = f.department_id
JOIN      ria.institutes  i ON i.id = f.institute_id
LEFT JOIN ria.profiles    p ON p.faculty_id = f.id;

CREATE OR REPLACE VIEW ria.v_pub_faculty
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
FROM      ria.publications        pub
JOIN      ria.faculty_publications fp  ON fp.publication_id = pub.id
JOIN      ria.faculty              f   ON f.id  = fp.faculty_id
JOIN      ria.departments          d   ON d.id  = f.department_id
JOIN      ria.institutes           ins ON ins.id = f.institute_id;

CREATE OR REPLACE VIEW ria.v_institute_summary
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
FROM      ria.institutes i
LEFT JOIN ria.faculty    f ON f.institute_id = i.id
GROUP BY  i.id, i.name, i.short_name
ORDER BY  total_publications DESC;
