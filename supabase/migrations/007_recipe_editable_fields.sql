-- Add user-editable fields for recipe management
-- These are NOT synced from xtraCHEF — they are set by the user in the UI.

alter table recipes add column on_menu boolean not null default false;
alter table recipes add column creator text;
alter table recipes add column created_at_label text;
