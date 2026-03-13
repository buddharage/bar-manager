-- Push notification subscriptions for Web Push API
create table push_subscriptions (
  id bigint generated always as identity primary key,
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_push_subscriptions_user on push_subscriptions(user_id);

-- Notification preferences per user
create table notification_preferences (
  id bigint generated always as identity primary key,
  user_id text not null unique,
  inventory_alerts boolean default true,
  chat_responses boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
