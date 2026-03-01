-- Add notes, image_url, and instructions fields to recipes
-- Synced from xtraCHEF recipe detail API:
--   notes        ← basicDetail.notes
--   image_url    ← procedure.imageUrl
--   instructions ← procedure.instructions (English type)

alter table recipes add column notes text;
alter table recipes add column image_url text;
alter table recipes add column instructions text;
