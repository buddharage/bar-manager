-- Add category (menu group) and size columns to order_items
-- so we can group sales by menu category and distinguish item sizes
-- (e.g. "shot", "single", "double").

alter table order_items add column category text;
alter table order_items add column size     text;

create index idx_order_items_category on order_items (category, date);
