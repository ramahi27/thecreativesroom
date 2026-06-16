-- Delete draft video entries that are clearly broken scrape artifacts:
-- no thumbnail OR generic placeholder title
DELETE FROM references
WHERE published = false
  AND type = 'video'
  AND (
    thumbnail_url IS NULL
    OR thumbnail_url = ''
    OR title ILIKE 'video'
    OR title ILIKE 'youtube video'
    OR title ILIKE 'untitled'
  );
