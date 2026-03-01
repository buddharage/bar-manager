#!/usr/bin/env npx tsx
/**
 * xtraCHEF Recipe Sync — CLI Script
 *
 * Fetches recipes from xtraCHEF's internal API and stores them in Supabase.
 * Can be used instead of (or in addition to) the Settings page sync button.
 *
 * Usage:
 *   npx tsx scripts/sync-xtrachef.ts
 *   # or
 *   npm run sync:xtrachef
 *
 * Requires env vars (set in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key (not anon key)
 *   XTRACHEF_TENANT_ID         — Your xtraCHEF tenant ID (see below)
 *   XTRACHEF_LOCATION_ID       — Your xtraCHEF location ID (see below)
 *   XTRACHEF_TOKEN             — Bearer token (or stored via Settings page)
 *
 * How to find your Tenant ID and Location ID:
 *   1. Log into https://app.sa.toasttab.com
 *   2. Open DevTools (F12) → Network tab
 *   3. Navigate to Recipes (app.sa.toasttab.com/Recipe/Recipe/NewRecipe)
 *   4. In Network, look for a request to ecs-api-prod.sa.toasttab.com
 *      containing "recipe-summary". The URL looks like:
 *      .../recipes-v2/tenants/{TENANT_ID}/location/{LOCATION_ID}/recipe-summary
 *   5. Copy the numeric values from that URL
 *
 * How to get your Bearer token:
 *   1. In the same DevTools Network tab, click the recipe-summary request
 *   2. Under "Request Headers", find the "Authorization:" header
 *   3. Copy the value (starts with "Bearer ...")
 *   4. Set it as XTRACHEF_TOKEN in .env.local, or paste it in the
 *      Settings page under "xtraCHEF Recipes → Bearer token"
 *   Note: The token expires when your Toast session ends.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { XtrachefClient } from "../lib/integrations/xtrachef-client";
import { syncXtrachefRecipes } from "../lib/sync/xtrachef-recipes";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const tenantId = process.env.XTRACHEF_TENANT_ID;
const locationId = process.env.XTRACHEF_LOCATION_ID;

if (!tenantId || !locationId) {
  console.error(
    "Missing XTRACHEF_TENANT_ID or XTRACHEF_LOCATION_ID in .env.local\n\n" +
    "To find these values:\n" +
    "  1. Log into https://app.sa.toasttab.com\n" +
    "  2. Open DevTools (F12) > Network tab\n" +
    "  3. Navigate to Recipes\n" +
    "  4. Find a request to ecs-api-prod.sa.toasttab.com with 'recipe-summary'\n" +
    "  5. The URL contains: .../tenants/{TENANT_ID}/location/{LOCATION_ID}/...\n" +
    "  6. Copy the numeric IDs into .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getToken(): Promise<string> {
  // Try env var first
  if (process.env.XTRACHEF_TOKEN) {
    return process.env.XTRACHEF_TOKEN;
  }

  // Fall back to settings table
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "xtrachef_token")
    .single();

  if (data?.value) return data.value;

  console.error(
    "No xtraCHEF Bearer token found.\n" +
    "Set XTRACHEF_TOKEN in .env.local or paste it in the Settings page.\n\n" +
    "To get your token:\n" +
    "  1. Log into app.sa.toasttab.com\n" +
    "  2. Open DevTools > Network tab\n" +
    "  3. Navigate to Recipes\n" +
    "  4. Find a request to ecs-api-prod.sa.toasttab.com\n" +
    "  5. Copy the Authorization header value (starts with 'Bearer ...')",
  );
  process.exit(1);
}

async function main() {
  console.log("Starting xtraCHEF recipe sync...\n");

  const token = await getToken();

  // Create sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "xtrachef", status: "started" })
    .select("id")
    .single();

  try {
    const client = new XtrachefClient({ tenantId: tenantId!, locationId: locationId!, token });

    const result = await syncXtrachefRecipes(supabase, client, {
      onProgress: (done, total) => {
        process.stdout.write(`\r  Fetching recipes... ${done}/${total}`);
      },
    });

    console.log("\n");

    if (result.errors.length > 0) {
      console.warn("Errors:");
      result.errors.forEach((e) => console.warn(`  ${e}`));
      console.log();
    }

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: result.errors.length > 0 ? "error" : "success",
          records_synced: result.recipesUpserted,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    console.log(`Done! ${result.recipesUpserted} recipes synced, ${result.recipesDeleted} deleted, ${result.ingredientLinesInserted} ingredient lines, ${result.rawIngredientsUpserted} raw ingredients.\n`);
  } catch (error) {
    console.error("\nSync failed:", error);

    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "error",
          error: String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    process.exit(1);
  }
}

main();
