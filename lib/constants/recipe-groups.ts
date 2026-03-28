/** Canonical recipe_group values from xtraCHEF */
export const RECIPE_GROUPS = {
  HOUSE_COCKTAILS: "House Cocktails",
  COCKTAIL_BATCH: "Cocktail Batch",
  MOCKTAILS: "Mocktails",
  COCKTAIL: "Cocktail",
  BEER: "Beer",
  SYRUPS: "Syrups",
} as const;

/** Groups that should NOT show "Full Specs (from scratch)" in print view */
export const NO_FULL_SPECS_GROUPS: string[] = [
  RECIPE_GROUPS.SYRUPS,
  RECIPE_GROUPS.COCKTAIL_BATCH,
];
