-- Vector embeddings for RAG (Retrieval-Augmented Generation)
-- Documents are chunked and embedded for semantic search by the AI agent

create extension if not exists vector;

-- Store document chunks with their vector embeddings
create table document_chunks (
  id            bigint generated always as identity primary key,
  document_id   bigint not null references documents(id) on delete cascade,
  chunk_index   integer not null,
  content       text not null,
  embedding     vector(768),  -- 768-dimension vector embeddings
  created_at    timestamptz default now()
);

create index idx_document_chunks_document_id on document_chunks (document_id);
create index idx_document_chunks_embedding on document_chunks using hnsw (embedding vector_cosine_ops);

-- RPC function: find the most similar document chunks to a query embedding
create or replace function match_document_chunks(
  query_embedding vector(768),
  match_threshold float default 0.3,
  match_count int default 5
) returns table (
  id bigint,
  document_id bigint,
  chunk_index integer,
  content text,
  similarity float
) language sql stable as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
