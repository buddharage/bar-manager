-- Google Drive + Gmail documents table
-- Stores synced content from both sources for full-text search by the AI agent

create table documents (
  id              bigint generated always as identity primary key,
  source          text not null check (source in ('google_drive', 'gmail')),
  external_id     text not null unique,
  title           text not null,
  mime_type       text,
  content         text,
  metadata        jsonb default '{}',
  content_hash    text,
  last_synced_at  timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Generated tsvector column + GIN index for full-text search
alter table documents add column content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) stored;

create index idx_documents_content_tsv on documents using gin (content_tsv);
create index idx_documents_source on documents (source);
create index idx_documents_external_id on documents (external_id);
