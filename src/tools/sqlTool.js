import { supabase } from '../supabaseClient';

/**
 * Metadata about the RIA database schema to help the LLM generate correct SQL.
 */
export const SCHEMA_METADATA = `
TABLES (Postgres, pg_trgm enabled):
- v_faculty_full(author_name, department, institute, short_name, total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count, journal_count, conference_count, wos_pub_count, wos_hindex, avg_citescore, avg_impfactor)
- publications(id, title, authors, year, source_publication, article_type, q_rank_scopus, impact_factor, cite_score)
- faculty_publications(faculty_id, publication_id)
- v_institute_summary(name, short_name, faculty_count, total_publications, total_scopus_citations, avg_scopus_hindex, total_q1_scopus, total_journals, total_conferences)

COLUMN SEMANTICS (critical):
- short_name is the abbreviation: 'CSE', 'ECE', 'EEE', 'Mechanical', 'Civil', 'Biotech', 'Maths', 'Architecture', 'Chemistry', 'MCA', etc.
- department is the long dept name: 'Computer Science and Engineering', 'Mechanical Engineering', 'Electronics and Communication Engineering', etc.
- institute is the school/college: 'School of Computer Science and Engineering', 'School of Mechanical Engineering', etc.
- For ANY department/school term in the user's question, match broadly: WHERE (short_name ILIKE '%X%' OR department ILIKE '%X%' OR institute ILIKE '%X%').
- Year column is lowercase "year" (publications.year). Valid years: 2018..2025.

RULES:
1. Use pre-aggregated columns on v_faculty_full for per-faculty totals (total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count). NEVER COUNT(*) from faculty_publications — join table is incomplete.
2. Name match uses pg_trgm: WHERE similarity(author_name,'X')>0.2 ORDER BY similarity DESC LIMIT 5.
3. Publications by author: WHERE similarity(authors,'X')>0.2.
4. ONE SELECT per user question. Use CTEs/subqueries for multi-part answers.
5. Never SELECT *; name the columns.
6. Each question is independent — do not carry filters from prior turns.

CANONICAL QUERIES (use these exactly, substituting user terms):

(a) Stats on a faculty:
SELECT author_name, department, institute, total_pub_count, scopus_citation, scopus_hindex, scopus_q1_count, journal_count, conference_count
FROM v_faculty_full
WHERE similarity(author_name,'<term>')>0.2
ORDER BY similarity(author_name,'<term>') DESC LIMIT 5;

(b) Top N faculty in a department/school:
SELECT author_name, department, total_pub_count, scopus_citation, scopus_hindex
FROM v_faculty_full
WHERE short_name ILIKE '%<term>%' OR department ILIKE '%<term>%' OR institute ILIKE '%<term>%'
ORDER BY scopus_citation DESC LIMIT <N>;

(c) Q1 / article-type counts in a department:
SELECT COUNT(DISTINCT p.id) AS cnt
FROM publications p JOIN faculty_publications fp ON fp.publication_id=p.id JOIN v_faculty_full f ON f.faculty_id=fp.faculty_id
WHERE p.q_rank_scopus='Q1' AND (f.short_name ILIKE '%<term>%' OR f.department ILIKE '%<term>%' OR f.institute ILIKE '%<term>%');

(d) Publication count by year:
SELECT COUNT(*) AS cnt FROM publications WHERE year=<Y>;

(e) YoY totals + growth for latest 2 years (assume 2024 vs 2025):
WITH y AS (SELECT year, COUNT(*) AS n FROM publications WHERE year IN (2024,2025) GROUP BY year)
SELECT (SELECT SUM(n) FROM y) AS total, (SELECT n FROM y WHERE year=2024) AS prev, (SELECT n FROM y WHERE year=2025) AS curr, ROUND(100.0*((SELECT n FROM y WHERE year=2025)-(SELECT n FROM y WHERE year=2024))/(SELECT n FROM y WHERE year=2024),2) AS yoy_pct;

(f) Dept with highest avg H-index:
SELECT department, ROUND(AVG(scopus_hindex)::numeric,2) AS avg_h FROM v_faculty_full GROUP BY department ORDER BY avg_h DESC LIMIT 1;
`;

/**
 * Tool definition for Groq/OpenAI compatible tool-calling.
 */
export const SQL_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "execute_sql",
    description: "Executes a PostgreSQL SELECT query against the RIA database and returns the result as a JSON array. Use this for complex data aggregation, counts, or listing specific records.",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "The SQL SELECT query to execute. MUST be a valid PostgreSQL query.",
        },
      },
      required: ["sql"],
    },
  },
};

/**
 * Executes a SELECT query using Supabase's internal postgres endpoint (via RPC or direct table query if allowed).
 * Note: Supabase JS client doesn't support raw SQL by default for security. 
 * We recommend using a Supabase function (RPC) named 'exec_sql' if raw SQL is truly needed,
 * or mapping simple queries to Supabase syntax.
 */
export async function executeSql(sql) {
  console.log("Executing SQL:", sql);

  // Security check: Only allow SELECT
  if (!sql.toLowerCase().trim().startsWith("select")) {
    return { error: "Only SELECT queries are allowed for security reasons." };
  }

  try {
    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });

    if (error) {
      if (error.code === 'P0001' || error.message.includes('function rpc.exec_sql(query_text) does not exist')) {
        return {
          error: "database_unavailable",
          reason: "exec_sql RPC is not installed on the Supabase instance.",
          unavailable: true,
        };
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.error("SQL Execution Error:", err);
    const msg = String(err?.message || err);
    // Network failure (local Supabase not running, CORS, DNS, etc.) — surface a
    // stable flag so the chat loop can stop retrying and answer from hints.
    if (/failed to fetch|networkerror|connection refused|err_connection/i.test(msg)) {
      return {
        error: "database_unavailable",
        reason: "Cannot reach the Supabase backend (connection refused / network error).",
        unavailable: true,
      };
    }
    return { error: msg };
  }
}
