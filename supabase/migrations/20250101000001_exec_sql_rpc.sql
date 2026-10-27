-- ============================================================
--  MIGRATION 002: exec_sql RPC
--
--  Lives in public schema so client.rpc("exec_sql", ...) works
--  without schema headers in the Python/JS clients.
--
--  SET search_path = ria, public means dynamic SQL inside can
--  reference ria tables without schema-qualifying every name
--  (e.g. "SELECT ... FROM v_faculty_full" just works).
--
--  SECURITY DEFINER bypasses RLS — chatbot reads all rows.
--  Only SELECT / WITH queries are permitted.
-- ============================================================

CREATE OR REPLACE FUNCTION public.exec_sql(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ria, public
AS $$
DECLARE
  result JSONB;
  trimmed TEXT;
BEGIN
  trimmed := lower(trim(query_text));

  IF NOT (trimmed LIKE 'select%' OR trimmed LIKE 'with%') THEN
    RAISE EXCEPTION 'exec_sql: only SELECT queries are permitted (got: %)',
      left(query_text, 60);
  END IF;

  EXECUTE format(
    'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json)::jsonb'
    ' FROM (%s) t',
    query_text
  ) INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO anon, authenticated;
