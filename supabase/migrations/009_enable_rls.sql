-- Enable Row Level Security on all public tables
-- This app is single-tenant and uses its own session-based auth (not Supabase Auth).
-- Server-side code uses the service role key which bypasses RLS entirely.
-- Client-side code uses the anon key, so we add permissive policies for anon access.

-- Enable RLS
alter table public.inventory_items enable row level security;
alter table public.daily_sales enable row level security;
alter table public.order_items enable row level security;
alter table public.tax_periods enable row level security;
alter table public.employees enable row level security;
alter table public.time_entries enable row level security;
alter table public.sync_logs enable row level security;
alter table public.settings enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_alerts enable row level security;

-- Allow anon full access (single-tenant app with its own auth layer)
create policy "Allow anon full access" on public.inventory_items for all using (true) with check (true);
create policy "Allow anon full access" on public.daily_sales for all using (true) with check (true);
create policy "Allow anon full access" on public.order_items for all using (true) with check (true);
create policy "Allow anon full access" on public.tax_periods for all using (true) with check (true);
create policy "Allow anon full access" on public.employees for all using (true) with check (true);
create policy "Allow anon full access" on public.time_entries for all using (true) with check (true);
create policy "Allow anon full access" on public.sync_logs for all using (true) with check (true);
create policy "Allow anon full access" on public.settings for all using (true) with check (true);
create policy "Allow anon full access" on public.documents for all using (true) with check (true);
create policy "Allow anon full access" on public.document_chunks for all using (true) with check (true);
create policy "Allow anon full access" on public.recipe_ingredients for all using (true) with check (true);
create policy "Allow anon full access" on public.recipes for all using (true) with check (true);
create policy "Allow anon full access" on public.ingredients for all using (true) with check (true);
create policy "Allow anon full access" on public.inventory_counts for all using (true) with check (true);
create policy "Allow anon full access" on public.inventory_alerts for all using (true) with check (true);
