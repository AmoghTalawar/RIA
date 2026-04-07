
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
WHERE     f.ria_user_id = 232716          -- ← swap with any ria_user_id
GROUP BY  f.id, f.author_name, f.ria_user_id, d.name, i.name;




SELECT
    f.author_name                           AS employee_name,
    f.employee_id,
    f.ria_user_id,
    p.pub_id,
    p.title,
    p.article_type,
    p.level,
    p.year,
    p.source_publication,
    p.doi,
    fp.is_corresponding,

    -- Internal/KLE co-authors linked in faculty_publications
    COALESCE(
        STRING_AGG(DISTINCT co.author_name, ', ' ORDER BY co.author_name)
        FILTER (WHERE co.id IS NOT NULL),
        'No internal co-authors'
    ) AS internal_coauthors,

    -- All authors as stored in publications.authors
    REPLACE(p.authors, '|', ', ') AS all_authors
FROM public.faculty f
JOIN public.faculty_publications fp
    ON fp.faculty_id = f.id
JOIN public.publications p
    ON p.id = fp.publication_id
LEFT JOIN public.faculty_publications fp2
    ON fp2.publication_id = p.id
   AND fp2.faculty_id <> f.id
LEFT JOIN public.faculty co
    ON co.id = fp2.faculty_id
WHERE f.ria_user_id = 232716   -- change this to the employee you want
GROUP BY
    f.author_name,
    f.employee_id,
    f.ria_user_id,
    p.pub_id,
    p.title,
    p.article_type,
    p.level,
    p.year,
    p.source_publication,
    p.doi,
    p.authors,
    fp.is_corresponding
ORDER BY p.year DESC NULLS LAST, p.title;




SELECT
    p.pub_id,
    p.title,
    p.year,
    REPLACE(p.authors, '|', ', ') AS all_authors
FROM public.faculty f
JOIN public.faculty_publications fp
    ON fp.faculty_id = f.id
JOIN public.publications p
    ON p.id = fp.publication_id
WHERE f.ria_user_id = 232716
ORDER BY p.year DESC NULLS LAST, p.title;

select * from
publications where pub_id = 239548;

SELECT COUNT(*) AS faculty_count
FROM public.faculty_publications fp
JOIN public.publications p
  ON p.id = fp.publication_id
WHERE p.pub_id = 239548;


SELECT
  p.pub_id,
  p.title,
  a.ordinality AS author_no,
  btrim(a.author_name) AS home_author_name
FROM public.publications p
CROSS JOIN LATERAL unnest(
  regexp_split_to_array(COALESCE(p.home_authors, ''), '\s*;\s*')
) WITH ORDINALITY AS a(author_name, ordinality)
WHERE p.pub_id = 325005
  AND btrim(a.author_name) <> ''
ORDER BY a.ordinality;


