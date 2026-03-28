---
description: "Update recipes in xtraCHEF via Playwright browser automation. Use when the user says 'update recipes', 'update xtrachef recipes', 'sync recipes to xtrachef', '/update-recipes', or wants to add/edit ingredients and instructions in xtraCHEF's recipe editor."
argument-hint: "<recipe-group> [recipe-file.md]"
---

# Update xtraCHEF Recipes via Playwright

Automate updating recipes in the xtraCHEF recipe editor at `https://app.sa.toasttab.com/Recipe/Recipe/NewRecipe`.

xtraCHEF uses React with the **downshift** library for combobox dropdowns. Standard Playwright `click()` calls are intercepted by overlapping UI elements. This guide documents the exact interaction patterns that work.

## Arguments

`$ARGUMENTS` should contain:
- A **recipe group** to filter to (e.g., "House Cocktails", "Cocktail Batch", "Syrups")
- Optionally, a **markdown file path** containing recipe data. If provided, read it for recipe details. If not provided, ask the user for the recipes to update.

## Step 1: Parse Recipe Data

Each recipe needs:
- **Name** — exact name as it appears in xtraCHEF
- **Ingredients** — each with: product name, quantity, UOM (ml, oz, cup, liter, gram, each, etc.)
- **Instructions** — numbered steps (preparation method only, not ingredients)

If the user provides a markdown file, parse it to extract this structured data. If ingredients and instructions are mixed together, separate them.

### Liquor Brand Preferences

When recipes reference generic spirits, use these preferred brands:
- **Gin**: Gary's Good
- **Vodka**: Gary's Good
- **Bourbon**: Old Crow
- **Rum**: Plantation Dark
- **Tequila**: Anza

## Step 2: Create a Progress Tracker

Create or update a progress markdown file in the working directory (e.g., `update-{group}-recipes.md`) with:

```
PROGRESS: 0/N recipes updated
```

Update this after each recipe is saved. Use a single progress counter — do NOT maintain separate "Updated" and "Remaining" sections (they get out of sync).

## Step 3: Navigate to xtraCHEF

1. Open `https://app.sa.toasttab.com/Recipe/Recipe/NewRecipe` via Playwright
2. Filter the recipe group dropdown to the target group
3. Identify all recipes that need updating

## Step 4: Update Each Recipe

Process **one recipe at a time**. Save after each before moving to the next.

### 4a: Add Ingredient Rows

To add a new empty ingredient row, use Playwright's `click()` on the specific snapshot `ref` for the page-level "Add Ingredient" button (e.g., the circle `+` button with a testid like `buttons-1709`).

**DO NOT** use `page.evaluate()` to click the "Add ingredient" button — it matches the wrong button (the one inside dropdown menus, not the page-level one).

### 4b: Search and Select Ingredients

The ingredient search input is a React controlled input using downshift.

**What works**: Use Playwright's `fill()` method on the search input's testid. This properly triggers React state updates and filters the dropdown options.

**What does NOT work**: Using `nativeInputValueSetter` or `page.evaluate()` to set the input value — these bypass React's controlled input and the dropdown won't filter.

After typing the search term with `fill()`, wait for the dropdown to populate, then select the matching option.

### 4c: Select UOM (Unit of Measure)

This is the trickiest interaction in xtraCHEF. The UOM dropdown uses downshift and overlapping elements intercept normal clicks.

**What does NOT work:**
- `page.evaluate()` with `setTimeout` to click options — unreliable because React state updates asynchronously
- Playwright `click()` on option refs — always times out due to overlapping elements intercepting pointer events

**What DOES work — two-step mouse event dispatch:**

1. Open the UOM dropdown via `page.evaluate()`: find the dropdown toggle button and call `button.click()`
2. Wait 500ms for React to render the options
3. Find the target option element in the dropdown and dispatch synthetic mouse events:

```javascript
// Inside page.evaluate():
const option = /* find the option element by text content */;
option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
```

This mimics a real user interaction that downshift's event handlers recognize.

**Note**: This works most reliably on a freshly rendered page (e.g., right after save/reload). On subsequent interactions without a re-render, it can be flaky — if it fails, refresh the page and retry.

### 4d: Create New Products (when ingredient doesn't exist)

If a product doesn't exist in the system:

1. Click the **"Add ingredient" link inside the ingredient search dropdown** — this opens the product creation dialog
2. Fill in: product name + purchase unit type (Weight / Volume / Each)
3. Click "Add" to create the product
4. **CRITICAL**: The product gets created but is NOT automatically assigned to the ingredient row. You must:
   - Close/dismiss the creation dialog
   - Re-open the ingredient search dropdown on the same row
   - Search for the newly created product name
   - Select it from the results

**DO NOT** confuse the "Add ingredient" button inside the dropdown with the page-level "Add Ingredient" circle button. They do different things:
- **Dropdown "Add ingredient"** → opens product creation dialog
- **Page-level circle `+` button** → adds a new empty ingredient row

### 4e: Handle Unit Conversion Modals

When selecting a UOM that doesn't match the product's purchase unit family (e.g., selecting "each" for a volume-based product), a **unit conversion modal** appears. This modal blocks ALL other interactions until dismissed.

- Fill in the conversion values (e.g., "1 each = 14 oz")
- Click "Done"
- Only then can you proceed with other interactions

### 4f: Handle ReactModal Overlays

ReactModal overlays from previous actions sometimes persist and block clicks. Before ANY interaction, check for and dismiss lingering modals:

```javascript
// Dismiss any lingering modals
const overlays = document.querySelectorAll('.ReactModal__Overlay');
overlays.forEach(overlay => overlay.click());
const closeButtons = document.querySelectorAll('.ReactModal__Content button[aria-label="Close"]');
closeButtons.forEach(btn => btn.click());
```

### 4g: Update Instructions

The "Instructions" field is a rich text editor. Enter numbered steps only (not ingredients).

**Throttling workaround**: xtraCHEF throttles rapid input. Do NOT copy-paste large blocks.
- Use `pressSequentially()` to type character by character, OR
- Paste in small sections (3 steps at a time), OR
- Type values manually into the rich text box

Format as a numbered list:
```
1. Step one
2. Step two
3. Step three
```

### 4h: Save the Recipe

1. Click Save
2. **Verify save completed** — check that the "Last saved" timestamp updates AND the Save button becomes disabled/grayed out
3. Do NOT proceed to the next recipe until save is confirmed
4. Update the progress tracker file

## Step 5: Audit

After all recipes are updated, revisit each one and verify:

1. The "Ingredients" section has populated item rows (not empty)
2. The "Instructions" section has numbered steps (not ingredient lists)

Report any recipes that still need work.

## Time Estimates

- 2 ingredients: ~10-15 min per recipe
- 5+ ingredients: ~20-30 min per recipe
- Budget extra time if new products need to be created

## Parallelization

If possible, run subagents for independent recipes to speed up the process. Each subagent handles one recipe end-to-end and reports back when done. Update the progress tracker from the main agent.

## Error Recovery

- If throttled: refresh the page, wait a moment, retry with smaller input chunks
- If a UOM selection fails: refresh the page (freshly rendered dropdowns are more reliable), then retry
- If a modal is stuck: use JavaScript to dismiss it, then retry
- If save fails: refresh and re-enter data for that recipe only
- Always save after each recipe to avoid losing work
