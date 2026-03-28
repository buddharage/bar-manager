-- Whiteboard camera snapshots and OCR results
create table whiteboard_snapshots (
  id             bigint generated always as identity primary key,
  captured_at    timestamptz not null default now(),
  image_url      text,
  extracted_text text,
  summary        text,
  schedule_label text check (schedule_label in ('morning', 'evening', 'night')),
  status         text not null default 'pending'
                   check (status in ('pending', 'success', 'error', 'no_change')),
  error          text,
  created_at     timestamptz default now()
);

create index idx_whiteboard_snapshots_captured
  on whiteboard_snapshots (captured_at desc);

-- Add whiteboard notification preference
alter table notification_preferences
  add column whiteboard_updates boolean default true;
