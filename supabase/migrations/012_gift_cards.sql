-- Gift Card Tracking
create table gift_cards (
  id                bigint generated always as identity primary key,
  card_id           text not null unique,
  beginning_balance numeric(10,2) not null default 0,
  current_balance   numeric(10,2) not null default 0,
  status            text not null default 'active' check (status in ('active', 'depleted', 'expired', 'voided')),
  issued_date       date,
  last_used_date    date,
  purchaser_name    text,
  recipient_name    text,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index idx_gift_cards_status on gift_cards (status);
create index idx_gift_cards_card_id on gift_cards (card_id);
