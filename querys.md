# Sample SQL Queries for RIA Dashboard Database

This file contains example queries based on the `supabase/db.sql` schema. These queries are specifically tailored for your AI Text-to-SQL logic (e.g., groq_client/intent_router).

## 1. Faculty Profiles & Metrics

**Get the top 10 faculty members with the highest number of total publications:**
```sql
SELECT author_name, total_pub_count, scopus_hindex
FROM faculty
ORDER BY total_pub_count DESC
LIMIT 10;
```

**Find a specific faculty member by name (using fuzzy search logic):**
```sql
SELECT author_name, department_id, total_pub_count, scopus_hindex
FROM faculty
WHERE author_name ILIKE '%john doe%';
```

**Get a full profile of a faculty member including their department and institute names using the view:**
```sql
SELECT author_name, department, institute, total_pub_count, scopus_hindex
FROM v_faculty_full
WHERE ria_user_id = 123456;
```

## 2. Department & Institute Analytics

**Get the total publications and average Scopus citations for each institute:**
```sql
SELECT i.name AS institute_name, 
       SUM(f.total_pub_count) AS total_publications, 
       AVG(f.scopus_citation) AS avg_scopus_citations
FROM institutes i
JOIN faculty f ON i.id = f.institute_id
GROUP BY i.name
ORDER BY total_publications DESC;
```
*(Alternatively, you can just query the `v_institute_summary` view)*
```sql
SELECT institute, faculty_count, total_publications, avg_scopus_hindex
FROM v_institute_summary
ORDER BY total_publications DESC;
```

**Get the total number of faculty members in each department within a specific institute:**
```sql
SELECT d.name AS department_name, COUNT(f.id) AS faculty_count
FROM departments d
JOIN faculty f ON d.id = f.department_id
JOIN institutes i ON d.institute_id = i.id
WHERE i.name ILIKE '%Computer Science%'
GROUP BY d.name;
```

## 3. Publication Queries

**Get the most recent Q1 Scopus indexed publications:**
```sql
SELECT title, source_publication, year, q_rank_scopus
FROM publications
WHERE q_rank_scopus = 'Q1' AND is_scs = TRUE AND year >= 2023
ORDER BY year DESC
LIMIT 20;
```

**Count the number of publications by year:**
```sql
SELECT year, COUNT(*) AS publication_count
FROM publications
WHERE year IS NOT NULL
GROUP BY year
ORDER BY year DESC;
```

**Find all journal publications containing a specific keyword in the title:**
```sql
SELECT title, year, source_publication
FROM publications
WHERE article_type = 'Journal'
  AND title ILIKE '%artificial intelligence%';
```

## 4. Cross-Reference (Faculty <-> Publications)

**List all publications for a specific faculty member by their name:**
```sql
SELECT p.title, p.year, p.source_publication, fp.is_corresponding
FROM publications p
JOIN faculty_publications fp ON p.id = fp.publication_id
JOIN faculty f ON fp.faculty_id = f.id
WHERE f.author_name ILIKE '%smith%'
ORDER BY p.year DESC;
```

**Find all faculty members who contributed to a specific publication (by title):**
```sql
SELECT f.author_name, d.name AS department
FROM faculty f
JOIN faculty_publications fp ON f.id = fp.faculty_id
JOIN publications p ON fp.publication_id = p.id
JOIN departments d ON f.department_id = d.id
WHERE p.title ILIKE '%quantum computing%';
```

## 5. Identifying Top Quality Work

**Find all faculty members who have published at least one Q1 journal:**
```sql
SELECT DISTINCT f.author_name, d.name AS department
FROM faculty f
JOIN departments d ON f.department_id = d.id
JOIN faculty_publications fp ON f.id = fp.faculty_id
JOIN publications p ON fp.publication_id = p.id
WHERE p.q_rank_scopus = 'Q1';
```

**Count how many Scopus, Web of Science, and IEEE publications exist in the database:**
```sql
SELECT 
    COUNT(*) FILTER (WHERE is_scs = TRUE) AS scopus_publications,
    COUNT(*) FILTER (WHERE is_wos = TRUE) AS wos_publications,
    COUNT(*) FILTER (WHERE is_ieee = TRUE) AS ieee_publications
FROM publications;
```
