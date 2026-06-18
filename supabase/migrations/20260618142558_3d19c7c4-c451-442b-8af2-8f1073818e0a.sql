
UPDATE public.references
SET tags = COALESCE((
  SELECT array_agg(t)
  FROM unnest(tags) AS t
  WHERE t NOT LIKE 'brief_reason:%' AND t NOT LIKE 'brief:%'
), ARRAY[]::text[])
WHERE EXISTS (
  SELECT 1 FROM unnest(tags) AS t
  WHERE t LIKE 'brief_reason:%' OR t LIKE 'brief:%'
);

UPDATE public.references
SET notes = trim(both E'\n' FROM regexp_replace(notes, E'\\n*\\[brief match\\][^\\n]*', '', 'g'))
WHERE notes LIKE '%[brief match]%';
