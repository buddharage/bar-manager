-- Seed sample data for preview / development environments.
-- Covers the full menu with realistic quantities and revenue.
-- Includes beer and wine variants (regular, Happy Hour, and a Shot)
-- so the aggregation logic in /api/menu-sales can be verified.

-- ============================================================
-- Inventory items (category is used by the aggregation logic)
-- ============================================================
INSERT INTO inventory_items (toast_guid, name, category, current_stock, par_level, unit, cost_per_unit)
VALUES
  -- Beer
  ('guid-mhl',      'Miller High Life',                'beer',    48, 72, 'can',    1.25),
  ('guid-mhl-hh',   'Miller High Life (Happy Hour)',    'beer',    null, null, 'can', 1.25),
  ('guid-mhl-shot', 'Miller High Life and a Shot',      'beer',    null, null, 'each', 3.00),
  ('guid-tecate',      'Tecate',                        'beer',    36, 48, 'can',    1.50),
  ('guid-tecate-hh',   'Tecate (Happy Hour)',            'beer',    null, null, 'can', 1.50),
  ('guid-tecate-shot', 'Tecate and a Shot',              'beer',    null, null, 'each', 3.25),
  ('guid-corona',      'Corona',                        'beer',    30, 48, 'bottle', 1.75),
  ('guid-corona-hh',   'Corona (Happy Hour)',            'beer',    null, null, 'bottle', 1.75),
  ('guid-corona-shot', 'Corona and a Shot',              'beer',    null, null, 'each', 3.50),
  ('guid-pbr',         'PBR',                           'beer',    60, 72, 'can',    0.90),
  ('guid-modelo',      'Modelo Especial',               'beer',    24, 36, 'bottle', 2.00),
  -- Wine
  ('guid-pg',      'Pinot Grigio',                'wine',  12, 18, 'glass', 4.00),
  ('guid-pg-hh',   'Pinot Grigio (Happy Hour)',    'wine',  null, null, 'glass', 4.00),
  ('guid-pg-shot', 'Pinot Grigio and a Shot',      'wine',  null, null, 'each', 5.50),
  ('guid-cs',      'Cabernet Sauvignon',           'wine',  10, 18, 'glass', 5.00),
  ('guid-cs-hh',   'Cabernet Sauvignon (Happy Hour)','wine', null, null, 'glass', 5.00),
  ('guid-cs-shot', 'Cabernet Sauvignon and a Shot', 'wine',  null, null, 'each', 6.50),
  ('guid-rose',    'Rosé',                         'wine',  8, 12, 'glass', 4.50),
  ('guid-rose-hh', 'Rosé (Happy Hour)',             'wine',  null, null, 'glass', 4.50),
  -- Spirits
  ('guid-margarita',  'House Margarita',   'spirits', 30, 40, 'each', 2.50),
  ('guid-whiskey',    'Whiskey Sour',      'spirits', 20, 30, 'each', 3.00),
  ('guid-gin-tonic',  'Gin & Tonic',       'spirits', 18, 24, 'each', 2.75),
  ('guid-old-fash',   'Old Fashioned',     'spirits', 15, 24, 'each', 3.50);

-- ============================================================
-- Order items — past 7 days of sales
-- Uses CURRENT_DATE so the data is always "recent" in any env.
-- ============================================================
INSERT INTO order_items (date, menu_item_guid, name, quantity, revenue) VALUES
  -- === Today ===
  (CURRENT_DATE, 'guid-mhl',        'Miller High Life',              8,  40.00),
  (CURRENT_DATE, 'guid-mhl-hh',     'Miller High Life (Happy Hour)', 5,  17.50),
  (CURRENT_DATE, 'guid-mhl-shot',   'Miller High Life and a Shot',   3,  21.00),
  (CURRENT_DATE, 'guid-tecate',     'Tecate',                        6,  36.00),
  (CURRENT_DATE, 'guid-tecate-hh',  'Tecate (Happy Hour)',           4,  16.00),
  (CURRENT_DATE, 'guid-tecate-shot','Tecate and a Shot',             2,  16.00),
  (CURRENT_DATE, 'guid-corona',     'Corona',                        5,  35.00),
  (CURRENT_DATE, 'guid-corona-hh',  'Corona (Happy Hour)',           3,  15.00),
  (CURRENT_DATE, 'guid-corona-shot','Corona and a Shot',             2,  17.00),
  (CURRENT_DATE, 'guid-pbr',        'PBR',                           12, 48.00),
  (CURRENT_DATE, 'guid-modelo',     'Modelo Especial',               4,  32.00),
  (CURRENT_DATE, 'guid-pg',         'Pinot Grigio',                  3,  27.00),
  (CURRENT_DATE, 'guid-pg-hh',      'Pinot Grigio (Happy Hour)',     2,  12.00),
  (CURRENT_DATE, 'guid-pg-shot',    'Pinot Grigio and a Shot',       1,  10.00),
  (CURRENT_DATE, 'guid-cs',         'Cabernet Sauvignon',            2,  22.00),
  (CURRENT_DATE, 'guid-cs-hh',      'Cabernet Sauvignon (Happy Hour)',1, 7.00),
  (CURRENT_DATE, 'guid-rose',       'Rosé',                          2,  18.00),
  (CURRENT_DATE, 'guid-rose-hh',    'Rosé (Happy Hour)',             1,  6.00),
  (CURRENT_DATE, 'guid-margarita',  'House Margarita',               6,  66.00),
  (CURRENT_DATE, 'guid-whiskey',    'Whiskey Sour',                  4,  48.00),
  (CURRENT_DATE, 'guid-gin-tonic',  'Gin & Tonic',                   3,  33.00),
  (CURRENT_DATE, 'guid-old-fash',   'Old Fashioned',                 5,  65.00),

  -- === Yesterday ===
  (CURRENT_DATE - 1, 'guid-mhl',        'Miller High Life',              10, 50.00),
  (CURRENT_DATE - 1, 'guid-mhl-hh',     'Miller High Life (Happy Hour)', 7,  24.50),
  (CURRENT_DATE - 1, 'guid-mhl-shot',   'Miller High Life and a Shot',   4,  28.00),
  (CURRENT_DATE - 1, 'guid-tecate',     'Tecate',                        8,  48.00),
  (CURRENT_DATE - 1, 'guid-tecate-hh',  'Tecate (Happy Hour)',           5,  20.00),
  (CURRENT_DATE - 1, 'guid-corona',     'Corona',                        7,  49.00),
  (CURRENT_DATE - 1, 'guid-corona-hh',  'Corona (Happy Hour)',           4,  20.00),
  (CURRENT_DATE - 1, 'guid-corona-shot','Corona and a Shot',             3,  25.50),
  (CURRENT_DATE - 1, 'guid-pbr',        'PBR',                           15, 60.00),
  (CURRENT_DATE - 1, 'guid-modelo',     'Modelo Especial',               5,  40.00),
  (CURRENT_DATE - 1, 'guid-pg',         'Pinot Grigio',                  4,  36.00),
  (CURRENT_DATE - 1, 'guid-pg-hh',      'Pinot Grigio (Happy Hour)',     3,  18.00),
  (CURRENT_DATE - 1, 'guid-cs',         'Cabernet Sauvignon',            3,  33.00),
  (CURRENT_DATE - 1, 'guid-cs-hh',      'Cabernet Sauvignon (Happy Hour)',2, 14.00),
  (CURRENT_DATE - 1, 'guid-cs-shot',    'Cabernet Sauvignon and a Shot', 1,  13.00),
  (CURRENT_DATE - 1, 'guid-rose',       'Rosé',                          3,  27.00),
  (CURRENT_DATE - 1, 'guid-margarita',  'House Margarita',               8,  88.00),
  (CURRENT_DATE - 1, 'guid-whiskey',    'Whiskey Sour',                  5,  60.00),
  (CURRENT_DATE - 1, 'guid-gin-tonic',  'Gin & Tonic',                   4,  44.00),
  (CURRENT_DATE - 1, 'guid-old-fash',   'Old Fashioned',                 6,  78.00),

  -- === 3 days ago ===
  (CURRENT_DATE - 3, 'guid-mhl',        'Miller High Life',              12, 60.00),
  (CURRENT_DATE - 3, 'guid-mhl-hh',     'Miller High Life (Happy Hour)', 8,  28.00),
  (CURRENT_DATE - 3, 'guid-mhl-shot',   'Miller High Life and a Shot',   5,  35.00),
  (CURRENT_DATE - 3, 'guid-tecate',     'Tecate',                        9,  54.00),
  (CURRENT_DATE - 3, 'guid-tecate-hh',  'Tecate (Happy Hour)',           6,  24.00),
  (CURRENT_DATE - 3, 'guid-tecate-shot','Tecate and a Shot',             3,  24.00),
  (CURRENT_DATE - 3, 'guid-corona',     'Corona',                        6,  42.00),
  (CURRENT_DATE - 3, 'guid-corona-hh',  'Corona (Happy Hour)',           5,  25.00),
  (CURRENT_DATE - 3, 'guid-pbr',        'PBR',                           18, 72.00),
  (CURRENT_DATE - 3, 'guid-modelo',     'Modelo Especial',               6,  48.00),
  (CURRENT_DATE - 3, 'guid-pg',         'Pinot Grigio',                  5,  45.00),
  (CURRENT_DATE - 3, 'guid-pg-hh',      'Pinot Grigio (Happy Hour)',     3,  18.00),
  (CURRENT_DATE - 3, 'guid-pg-shot',    'Pinot Grigio and a Shot',       2,  20.00),
  (CURRENT_DATE - 3, 'guid-cs',         'Cabernet Sauvignon',            4,  44.00),
  (CURRENT_DATE - 3, 'guid-rose',       'Rosé',                          4,  36.00),
  (CURRENT_DATE - 3, 'guid-rose-hh',    'Rosé (Happy Hour)',             2,  12.00),
  (CURRENT_DATE - 3, 'guid-margarita',  'House Margarita',               10, 110.00),
  (CURRENT_DATE - 3, 'guid-whiskey',    'Whiskey Sour',                  7,  84.00),
  (CURRENT_DATE - 3, 'guid-gin-tonic',  'Gin & Tonic',                   5,  55.00),
  (CURRENT_DATE - 3, 'guid-old-fash',   'Old Fashioned',                 8,  104.00),

  -- === 5 days ago ===
  (CURRENT_DATE - 5, 'guid-mhl',        'Miller High Life',              9,  45.00),
  (CURRENT_DATE - 5, 'guid-mhl-hh',     'Miller High Life (Happy Hour)', 6,  21.00),
  (CURRENT_DATE - 5, 'guid-tecate',     'Tecate',                        7,  42.00),
  (CURRENT_DATE - 5, 'guid-tecate-shot','Tecate and a Shot',             2,  16.00),
  (CURRENT_DATE - 5, 'guid-corona',     'Corona',                        8,  56.00),
  (CURRENT_DATE - 5, 'guid-corona-hh',  'Corona (Happy Hour)',           3,  15.00),
  (CURRENT_DATE - 5, 'guid-pbr',        'PBR',                           14, 56.00),
  (CURRENT_DATE - 5, 'guid-modelo',     'Modelo Especial',               3,  24.00),
  (CURRENT_DATE - 5, 'guid-pg',         'Pinot Grigio',                  3,  27.00),
  (CURRENT_DATE - 5, 'guid-cs',         'Cabernet Sauvignon',            2,  22.00),
  (CURRENT_DATE - 5, 'guid-cs-hh',      'Cabernet Sauvignon (Happy Hour)',1, 7.00),
  (CURRENT_DATE - 5, 'guid-rose',       'Rosé',                          2,  18.00),
  (CURRENT_DATE - 5, 'guid-margarita',  'House Margarita',               7,  77.00),
  (CURRENT_DATE - 5, 'guid-whiskey',    'Whiskey Sour',                  3,  36.00),
  (CURRENT_DATE - 5, 'guid-gin-tonic',  'Gin & Tonic',                   4,  44.00),
  (CURRENT_DATE - 5, 'guid-old-fash',   'Old Fashioned',                 5,  65.00);

-- ============================================================
-- Daily sales summaries for the seeded days
-- ============================================================
INSERT INTO daily_sales (date, gross_sales, net_sales, tax_collected, tips, discounts) VALUES
  (CURRENT_DATE,     543.50, 488.50, 48.27, 108.70, 55.00),
  (CURRENT_DATE - 1, 740.00, 666.00, 65.78, 148.00, 74.00),
  (CURRENT_DATE - 3, 960.00, 864.00, 85.39, 192.00, 96.00),
  (CURRENT_DATE - 5, 571.00, 513.90, 50.81, 114.20, 57.10);
