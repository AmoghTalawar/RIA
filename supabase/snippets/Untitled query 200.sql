WITH parsed_authors AS (
    SELECT
        p.id AS publication_id,
        p.pub_id,
        p.title,
        a.ordinality AS author_no,
        btrim(a.author_name) AS author_name
    FROM public.publications p
    CROSS JOIN LATERAL unnest(
        regexp_split_to_array(COALESCE(p.authors, ''), '\s*\|\s*')
    ) WITH ORDINALITY AS a(author_name, ordinality)
    WHERE p.pub_id = 325005
      AND btrim(a.author_name) <> ''
),
mapped AS (
    SELECT
        pa.*,
        f.id AS faculty_id,
        f.ria_user_id,
        fp.is_corresponding
    FROM parsed_authors pa
    LEFT JOIN public.faculty f
      ON lower(regexp_replace(f.author_name, '\s+', ' ', 'g')) =
         lower(regexp_replace(pa.author_name, '\s+', ' ', 'g'))
    LEFT JOIN public.faculty_publications fp
      ON fp.publication_id = pa.publication_id
     AND fp.faculty_id = f.id
)
SELECT
    pub_id,
    title,
    author_no,
    author_name,
    faculty_id,
    ria_user_id,
    CASE
        WHEN faculty_id IS NULL THEN 'External Co-Author'
        WHEN is_corresponding IS TRUE THEN 'Corresponding Author'
        ELSE 'Co-Author'
    END AS author_role,
    CASE WHEN faculty_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_faculty
FROM mapped
ORDER BY author_no;