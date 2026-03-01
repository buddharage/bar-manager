-- Backfill refrigerate and created_at_label for Syrups group recipes.
--
-- Note: This migration was created from a partial list. Additional entries
-- may need to be appended if recipes were cut off.

update recipes set refrigerate = true, created_at_label = '2025 Fall' where name = 'Agave Wine Infusion' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Agave Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = true, created_at_label = '2025 Fall' where name = 'Basil Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Black Rice Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Celosa Luna Coffee Liqueur' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Cacao Espresso' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Cane' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Fall' where name = 'Chai Concentrate' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Fall' where name = 'Chai Mix' and recipe_group = 'Syrups';
update recipes set refrigerate = true, created_at_label = '2024 Fall' where name = 'Cinnamon Oat Milk Orgeat' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2024 Spring' where name = 'Cinnamon Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2024 Spring' where name = 'Coconut Fatwashed Vodka' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Spring' where name = 'Corn Butter Fat Washed Mezcal' and recipe_group = 'Syrups';
update recipes set refrigerate = true, created_at_label = '2025 Summer' where name = 'Cucumber Rosemary Shrub' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Fall' where name = 'Dark Chocolate Demerara Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2024 Spring' where name = 'House Coffee Liqueur' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Spring' where name = 'Cucumber Shrub' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Spring' where name = 'Cucumber Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2024 Spring' where name = 'Dehydration (Limes, etc)' and recipe_group = 'Syrups';
update recipes set refrigerate = true where name = 'Foam (Bruja''s Brew)' and recipe_group = 'Syrups';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Foam (Practical Magic)' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Foam (Smoke Screen)' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Ginger Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Honey Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Spring' where name = 'Jalapeno Infused Honey' and recipe_group = 'Syrups';
update recipes set refrigerate = true, created_at_label = '2023 Fall' where name = 'Lapsang Tincture' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Lavender Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = true, created_at_label = '2024 Spring' where name = 'Lemon Super Juice' and recipe_group = 'Syrups';
update recipes set refrigerate = true, created_at_label = '2024 Spring' where name = 'Lime Super Juice' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Lemongrass Tamarind Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Michelada' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Orgeat' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Spring' where name = 'Poblano Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2024 Summer' where name = 'Pickled Shallot Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'POC' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Raspberry Infused Vodka' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Fall' where name = 'Root Beer Infusion' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Fall' where name = 'Root Beer Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Rosemary Infused Honey Syrup' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2025 Spring' where name = 'Saline' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2023 Fall' where name = 'Shisho Infused Gin' and recipe_group = 'Syrups';
update recipes set refrigerate = false, created_at_label = '2022 Fall' where name = 'Spicy Bitters' and recipe_group = 'Syrups';
-- NOTE: List was truncated at "Strawberry Infused" — add remaining entries below.
