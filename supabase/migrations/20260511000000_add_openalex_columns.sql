-- Migration: add OpenAlex author mapping columns to ria.faculty
-- Run: paste into Supabase SQL Editor
-- Safe to re-run (IF NOT EXISTS guards)

ALTER TABLE ria.faculty
  ADD COLUMN IF NOT EXISTS openalex_author_id   TEXT,
  ADD COLUMN IF NOT EXISTS openalex_hindex      INTEGER,
  ADD COLUMN IF NOT EXISTS openalex_works_count INTEGER,
  ADD COLUMN IF NOT EXISTS openalex_confidence  TEXT;  -- HIGH / LOW / NOT_FOUND

COMMENT ON COLUMN ria.faculty.openalex_author_id   IS 'OpenAlex author ID (e.g. A1234567890) — mapped via map_faculty_openalex.py';
COMMENT ON COLUMN ria.faculty.openalex_hindex      IS 'Live h-index from OpenAlex (may differ from Scopus)';
COMMENT ON COLUMN ria.faculty.openalex_works_count IS 'Total works count on OpenAlex profile';
COMMENT ON COLUMN ria.faculty.openalex_confidence  IS 'Mapping confidence: HIGH (exact institution match), LOW (fallback name match), NOT_FOUND';
