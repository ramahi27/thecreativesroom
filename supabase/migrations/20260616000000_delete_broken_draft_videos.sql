-- Delete draft video entries with no thumbnail (broken/dead video links)
DELETE FROM references
WHERE published = false
  AND type = 'video'
  AND (thumbnail_url IS NULL OR thumbnail_url = '');
