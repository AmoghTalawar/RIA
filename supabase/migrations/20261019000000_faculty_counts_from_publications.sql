-- v_faculty_full: serve paper counts computed from the linked publications
-- (ria.faculty_publications -> ria.publications) instead of the stored roster counts, so faculty
-- lists, department/school totals and the chatbot agree with the publication data.
-- Q1 follows the Excel columns: scopus_q1_count = Q RANK(SCS), wos_q1_count = Q RANK(WOS).
-- The roster (FACULTY COMPARE.xlsx) values are kept in the reported_* columns at the end.
-- Citations / h-index / i10 / avg scores are Scopus-profile figures and stay as stored.

CREATE OR REPLACE VIEW ria.v_faculty_full WITH (security_invoker = true) AS
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
    COALESCE(c.total, 0)::integer AS total_pub_count,
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
    COALESCE(c.scopus_q1, 0)::integer AS scopus_q1_count,
    COALESCE(c.wos_q1, 0)::integer AS wos_q1_count,
    COALESCE(c.journals, 0)::integer AS journal_count,
    COALESCE(c.conferences, 0)::integer AS conference_count,
    COALESCE(c.books, 0)::integer AS book_count,
    COALESCE(c.chapters, 0)::integer AS book_chapter_count,
    f.total_pub_count AS reported_total_pub_count,
    f.scopus_q1_count AS reported_scopus_q1_count,
    f.wos_q1_count AS reported_wos_q1_count,
    f.journal_count AS reported_journal_count,
    f.conference_count AS reported_conference_count
   FROM ria.faculty f
     JOIN ria.departments d ON d.id = f.department_id
     JOIN ria.institutes i ON i.id = f.institute_id
     LEFT JOIN ria.profiles p ON p.faculty_id = f.id
     LEFT JOIN (
       SELECT fp.faculty_id,
              count(*) AS total,
              count(*) FILTER (WHERE pub.q_rank_scopus = 'Q1') AS scopus_q1,
              count(*) FILTER (WHERE pub.q_rank_wos = 'Q1') AS wos_q1,
              count(*) FILTER (WHERE pub.article_type = 'Journal') AS journals,
              count(*) FILTER (WHERE pub.article_type = 'Conference') AS conferences,
              count(*) FILTER (WHERE pub.article_type = 'Book') AS books,
              count(*) FILTER (WHERE pub.article_type = 'Book Chapter') AS chapters
       FROM ria.faculty_publications fp
       JOIN ria.publications pub ON pub.id = fp.publication_id
       GROUP BY fp.faculty_id
     ) c ON c.faculty_id = f.id;

-- v_institute_summary: same change, so school totals agree with the faculty lists.
-- Same columns/order/types as before; only the counts now come from v_faculty_full.
CREATE OR REPLACE VIEW ria.v_institute_summary WITH (security_invoker = true) AS
 SELECT i.id AS institute_id,
    i.name,
    i.short_name,
    count(DISTINCT f.faculty_id) AS faculty_count,
    COALESCE(sum(f.total_pub_count), 0::bigint) AS total_publications,
    COALESCE(sum(f.scopus_citation), 0::bigint) AS total_scopus_citations,
    round(avg(f.scopus_hindex), 1) AS avg_scopus_hindex,
    COALESCE(sum(f.scopus_q1_count), 0::bigint) AS total_q1_scopus,
    COALESCE(sum(f.journal_count), 0::bigint) AS total_journals,
    COALESCE(sum(f.conference_count), 0::bigint) AS total_conferences
   FROM ria.institutes i
     LEFT JOIN ria.v_faculty_full f ON f.institute_id = i.id
  GROUP BY i.id, i.name, i.short_name
  ORDER BY COALESCE(sum(f.total_pub_count), 0::bigint) DESC;
