
-- 1. Clear all notes from every reference (per user request)
UPDATE public."references" SET notes = NULL;

-- 2. Strip trailing " (YYYY)" or " (YYYY)*" from titles, and ensure year is set when present in title
UPDATE public."references"
SET 
  year = COALESCE(year, NULLIF(substring(title FROM '\((\d{4})\)\*?\s*$'), '')::int),
  title = trim(regexp_replace(title, '\s*\(\d{4}\)\*?\s*$', ''))
WHERE title ~ '\(\d{4}\)\*?\s*$';
