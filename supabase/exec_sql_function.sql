-- ============================================================
--  exec_sql — RPC helper used by the chatbot backend (sql_tool.py)
--
--  Security model:
--    SECURITY DEFINER  → runs as the function owner (postgres),
--    bypassing RLS so the analytics chatbot can read all rows.
--    Only SELECT / WITH queries are permitted; any other SQL
--    raises an exception before execution.
--
--  Usage (from Python supabase client):
--    client.rpc("exec_sql", {"query_text": "SELECT ..."}).execute()
-- ============================================================

CREATE OR REPLACE FUNCTION public.exec_sql(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  trimmed TEXT;
BEGIN
  trimmed := lower(trim(query_text));

  -- Only allow SELECT or WITH (CTE) queries
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

-- Grant execute to both anon and authenticated roles so the
-- backend's anon-key client and any authenticated user can call it.
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO anon, authenticated;
