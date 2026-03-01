#!/usr/bin/env npx tsx
/**
 * xtraCHEF Recipe Sync — CLI Script
 *
 * Fetches recipes from xtraCHEF's internal API and stores them in Supabase.
 *
 * Usage:
 *   npx tsx scripts/sync-xtrachef.ts
 *
 * Requires env vars (set in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   XTRACHEF_TENANT_ID
 *   XTRACHEF_LOCATION_ID
 *   XTRACHEF_COOKIE          (or stored in settings table)
 *
 * To get your session cookie:
 *   1. Log into app.sa.toasttab.com in your browser
 *   2. Open DevTools → Network tab
 *   3. Navigate to Recipes
 *   4. Find any request to ecs-api-prod.sa.toasttab.com
 *   5. Copy the full Cookie header value
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
  console.error("Missing XTRACHEF_TENANT_ID or XTRACHEF_LOCATION_ID in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getCookie(): Promise<string> {
  // Try env var first
  if (process.env.XTRACHEF_COOKIE) {
    return process.env.XTRACHEF_COOKIE;
  }

  // Fall back to settings table
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "xtrachef_cookie")
    .single();

  if (data?.value) return data.value;

  console.error(
    "No xtraCHEF session cookie found.\n" +
    "Set XTRACHEF_COOKIE in .env.local or paste it in the Settings page.\n\n" +
    "To get your cookie:\n" +
    "  1. Log into app.sa.toasttab.com\n" +
    "  2. Open DevTools > Network tab\n" +
    "  3. Navigate to Recipes\n" +
    "  4. Find a request to ecs-api-prod.sa.toasttab.com\n" +
    "  5. Copy the full Cookie header value",
  );
  process.exit(1);
}

async function main() {
  console.log("Starting xtraCHEF recipe sync...\n");

  const cookie = await getCookie();

  // Create sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "xtrachef", status: "started" })
    .select("id")
    .single();

  try {
    const client = new XtrachefClient({ tenantId: tenantId!, locationId: locationId!, cookie });

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
          status: result.errors.length > 0 ? "partial" : "success",
          records_synced: result.recipesUpserted,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    console.log(`Done! ${result.recipesUpserted} recipes, ${result.ingredientLinesInserted} ingredient lines, ${result.rawIngredientsUpserted} raw ingredients.\n`);
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
