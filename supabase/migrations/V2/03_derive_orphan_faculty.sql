-- 03_derive_orphan_faculty.sql
-- Run AFTER 02_populate_ria.py. Idempotent (safe to re-run).
--
-- Problem: some user IDs appear in publications.home_author_userid but are not in the
-- faculty roster (FACULTY COMPARE.xlsx), so their papers get no faculty_publications link.
-- Fix: derive a faculty row for each such ID from the publication data itself:
--   name       = most frequent spelling of that author at that ID's positions
--   department = most frequent department that is not 'Unknown' / 'Not Available'
-- IDs with no known department are skipped (department_id is NOT NULL; nothing is guessed).
-- Derived rows are flagged faculty.source = 'publications'; roster rows keep 'roster'.
-- The three citation/h-index style columns stay 0 (no source for them); the paper counts
-- are computed from the linked publications.

BEGIN;

ALTER TABLE ria.faculty ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'roster';

-- One row per (publication, author position). HOME AUTHORS / USERID / DEPARTMENT are
-- semicolon lists aligned by position.
CREATE TEMP TABLE _pos ON COMMIT DROP AS
SELECT p.id AS publication_id,
       u.ord,
       btrim(u.v) AS uid,
       btrim(n.v) AS author_name,
       btrim(d.v) AS dept
FROM ria.publications p
CROSS JOIN LATERAL regexp_split_to_table(coalesce(p.home_author_userid, ''), ';') WITH ORDINALITY AS u(v, ord)
LEFT JOIN LATERAL regexp_split_to_table(coalesce(p.home_authors, ''), ';')           WITH ORDINALITY AS n(v, ord) ON n.ord = u.ord
LEFT JOIN LATERAL regexp_split_to_table(coalesce(p.home_author_department, ''), ';') WITH ORDINALITY AS d(v, ord) ON d.ord = u.ord
WHERE btrim(u.v) ~ '^\d+$';

CREATE TEMP TABLE _orphan ON COMMIT DROP AS
SELECT uid::int AS ria_user_id,
       mode() WITHIN GROUP (ORDER BY author_name) AS author_name,
       mode() WITHIN GROUP (ORDER BY CASE WHEN dept = 'Centre for Material Science'
                                          THEN 'Centre for Material Science (CMS)' ELSE dept END)
         FILTER (WHERE dept NOT IN ('', 'Unknown', 'Not Available')) AS dept_name
FROM _pos
WHERE NOT EXISTS (SELECT 1 FROM ria.faculty f WHERE f.ria_user_id = _pos.uid::int)
GROUP BY uid;

INSERT INTO ria.faculty (ria_user_id, author_name, department_id, institute_id, source)
SELECT o.ria_user_id, o.author_name, d.id, d.institute_id, 'publications'
FROM _orphan o
JOIN ria.departments d ON d.name = o.dept_name
WHERE o.author_name <> ''
ON CONFLICT (ria_user_id) DO NOTHING;

-- Link every publication to the derived faculty it names.
INSERT INTO ria.faculty_publications (faculty_id, publication_id, is_corresponding)
SELECT DISTINCT f.id, ps.publication_id, false
FROM _pos ps
JOIN ria.faculty f ON f.ria_user_id = ps.uid::int AND f.source = 'publications'
ON CONFLICT (faculty_id, publication_id) DO NOTHING;

-- Same rule as the loader: staff_ria_user_id = first resolvable author. Only fill the gaps.
UPDATE ria.publications p
SET staff_ria_user_id = x.ria_user_id
FROM (
  SELECT DISTINCT ON (ps.publication_id) ps.publication_id, f.ria_user_id
  FROM _pos ps
  JOIN ria.faculty f ON f.ria_user_id = ps.uid::int
  ORDER BY ps.publication_id, ps.ord
) x
WHERE p.id = x.publication_id AND p.staff_ria_user_id IS NULL;

UPDATE ria.faculty_publications fp
SET is_corresponding = true
FROM ria.publications p, ria.faculty f
WHERE fp.publication_id = p.id AND fp.faculty_id = f.id
  AND f.source = 'publications' AND p.staff_ria_user_id = f.ria_user_id
  AND NOT fp.is_corresponding;

-- Paper counts for derived rows only (roster rows keep their reported values).
UPDATE ria.faculty f
SET total_pub_count  = c.total,
    scopus_q1_count  = c.sq1, scopus_q2_count = c.sq2,
    wos_q1_count     = c.wq1, wos_q2_count    = c.wq2,
    journal_count    = c.journals, conference_count = c.confs,
    book_count       = c.books, book_chapter_count = c.chapters
FROM (
  SELECT fp.faculty_id,
         count(*)::int AS total,
         count(*) FILTER (WHERE p.q_rank_scopus = 'Q1')::int AS sq1,
         count(*) FILTER (WHERE p.q_rank_scopus = 'Q2')::int AS sq2,
         count(*) FILTER (WHERE p.q_rank_wos = 'Q1')::int AS wq1,
         count(*) FILTER (WHERE p.q_rank_wos = 'Q2')::int AS wq2,
         count(*) FILTER (WHERE p.article_type = 'Journal')::int AS journals,
         count(*) FILTER (WHERE p.article_type = 'Conference')::int AS confs,
         count(*) FILTER (WHERE p.article_type = 'Book')::int AS books,
         count(*) FILTER (WHERE p.article_type = 'Book Chapter')::int AS chapters
  FROM ria.faculty_publications fp
  JOIN ria.publications p ON p.id = fp.publication_id
  GROUP BY fp.faculty_id
) c
WHERE f.id = c.faculty_id AND f.source = 'publications';

COMMIT;
