-- Add refrigerate column to recipes and backfill Cocktail Batch metadata.
--
-- The refrigerate boolean indicates whether a batch recipe needs
-- refrigeration. Defaults to false for all existing recipes.
-- This migration also sets created_at_label for Cocktail Batch recipes,
-- which may differ from the Cocktails group values set in migration 009.

-- ============================================================
-- Add refrigerate column
-- ============================================================
alter table recipes add column refrigerate boolean not null default false;

-- ============================================================
-- Backfill Cocktail Batch recipes (refrigerate + created_at_label)
-- ============================================================
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'A Shade of Jade' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Ace of Coins' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2025 Spring' where name = 'Amulet' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2022 Fall' where name = 'Bishop''s Absolution' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Blood Moon (aka Blood Shot)' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Bruja''s Brew' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Spring' where name = 'Calypso''s Secret' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Celosa Luna' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Spring' where name = 'Cryptide' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2025 Spring' where name = 'Devil Fruit' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Spring' where name = 'Dia de Sandia' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'E.S.P. (Espresso Spirit Potion)' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2024 Fall' where name = 'E.S.P. (Espresso Spirit Potion)' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Spring' where name = 'Empress' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2025 Fall' where name = 'Falling Leaves' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Spring' where name = 'Glinda' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2024 Summer' where name = 'Golden Hour' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2025 Fall' where name = 'Holy Molé' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'King Ink' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'L''affaire des Poisons' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2022 Fall' where name = 'La Limpieza' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2025 Fall' where name = 'Lovespell' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Magic Mirror' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2024 Summer' where name = 'Mary Sol' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Midnight Silk' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Misty Morning' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Mother Goddess' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Nightingale' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2024 Spring' where name = 'Peaceful Reverie' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Personal Legend' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Spring' where name = 'Power of Manon' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Practical Magic' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2025 Fall' where name = 'Preacher''s Daughter' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2025 Spring' where name = 'Reina' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2025 Fall' where name = 'Root 666' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2025 Spring' where name = 'Rose Lane' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Ruby River' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Santa Muerte' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Shinto Priestess' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2024 Fall' where name = 'Siren''s Song' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2025 Spring' where name = 'Snake Shot' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Spiced Rum' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Star Crossed Lovers' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2025 Summer' where name = 'Starling' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'The Fantastic Mystic Fox' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2024 Fall' where name = 'The Occult Fashioned' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'The Oracle' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2024 Summer' where name = 'Tiki Dream' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Venus in Scorpio' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = false, created_at_label = '2023 Summer' where name = 'Wildcat' and recipe_group = 'Cocktail Batch';
update recipes set refrigerate = true, created_at_label = '2024 Fall' where name = 'Willow' and recipe_group = 'Cocktail Batch';
