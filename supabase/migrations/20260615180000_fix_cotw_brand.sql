-- Clear mistakenly-assigned COTW brand from references
UPDATE references
SET brand = NULL
WHERE brand = 'COTW';
