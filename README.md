# Willy

Named after [Willy](https://buffy.fandom.com/wiki/Willy), the demon bartender from *Buffy the Vampire Slayer* who runs Willy's Place — the seedy bar where demons, vampires, and the occasional Slayer come to drink.

AI-powered operations dashboard for a 50-seat cocktail bar in Brooklyn, NY. Integrates with Toast POS, Google Workspace, QuickBooks Online, and Sling to automate inventory alerts, sales tracking, document search, bookkeeping, tax filing, and scheduling.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: Supabase (PostgreSQL)
- **UI**: Tailwind CSS + shadcn/ui
- **AI**: Gemini 2.0 Flash (function calling for data queries, document search, reorder suggestions, PDF text extraction)
- **Cron**: GitHub Actions → Vercel API routes
- **Deployment**: Vercel

## Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- A [Supabase](https://supabase.com) account (free tier works)
- A [Vercel](https://vercel.com) account (for production deployment)
- A [Toast POS](https://pos.toasttab.com) developer account (for inventory/sales data)
- A [Google AI Studio](https://aistudio.google.com) account (for the Gemini API key)

## Setup Guide

This guide walks through every step to get a working instance. Steps 1–4 are required for the app to function. Steps 5–9 are optional integrations you can enable later.

---

### Step 1. Clone and install dependencies

```bash
git clone <your-repo-url> willy
cd willy
npm install
```

This installs all runtime and dev dependencies, including `web-push` for push notifications.

---

### Step 2. Create your environment file

```bash
cp .env.local.example .env.local
```

This creates your local config file from the template. You'll fill in values throughout the remaining steps. The file is gitignored and never committed.

Open `.env.local` in your editor — you'll see sections for each integration. Here's a summary of every variable and when you'll set it:

| Variable | Required | Set during |
|----------|----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Step 3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Step 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Step 3 |
| `CRON_SECRET` | Yes | Step 4 |
| `DASHBOARD_PASSWORD` | Yes | Step 4 |
| `TOAST_CLIENT_ID` | Yes | Step 5 |
| `TOAST_CLIENT_SECRET` | Yes | Step 5 |
| `TOAST_RESTAURANT_GUID` | Yes | Step 5 |
| `TOAST_API_BASE_URL` | Yes | Step 5 (default provided) |
| `TOAST_WEBHOOK_SECRET` | No | Step 5 (after deployment) |
| `GEMINI_API_KEY` | Yes | Step 6 |
| `GOOGLE_CLIENT_ID` | No | Step 7 |
| `GOOGLE_CLIENT_SECRET` | No | Step 7 |
| `GOOGLE_REDIRECT_URI` | No | Step 7 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | Step 8 |
| `VAPID_PRIVATE_KEY` | No | Step 8 |
| `VAPID_SUBJECT` | No | Step 8 |
| `XTRACHEF_TENANT_ID` | No | Step 9 |
| `XTRACHEF_LOCATION_ID` | No | Step 9 |
| `XTRACHEF_TOKEN` | No | Step 9 |
| `QBO_CLIENT_ID` | No | Phase 2 (not yet implemented) |
| `QBO_CLIENT_SECRET` | No | Phase 2 |
| `QBO_REALM_ID` | No | Phase 2 |
| `QBO_REDIRECT_URI` | No | Phase 2 |
| `SLING_API_TOKEN` | No | Phase 3 (not yet implemented) |
| `SLING_ORG_ID` | No | Phase 3 |

---

### Step 3. Set up Supabase (database)

The app uses Supabase as its PostgreSQL database. All data — inventory, sales, recipes, alerts, sync logs, push subscriptions — lives here.

#### 3a. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose an organization, name your project (e.g. `willy`), set a database password, and pick a region close to you
4. Wait for the project to finish provisioning (~2 minutes)

#### 3b. Copy your API credentials

1. In the Supabase dashboard, go to **Settings → API**
2. Copy the following values into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...  (the "anon public" key)
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...      (the "service_role" key — keep this secret)
   ```

> **Security:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It is only used server-side in API routes, never exposed to the browser. Do not commit it to version control.

#### 3c. Run database migrations

The app will not start until the database schema is created. There are 14 migration files that must be run **in order**, since later migrations depend on tables created by earlier ones.

**How to run a migration:**

1. In the Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Open the migration file from `supabase/migrations/` in your code editor
4. Copy the entire file contents
5. Paste into the Supabase SQL Editor
6. Click **Run** (or press Ctrl+Enter / Cmd+Enter)
7. Verify you see "Success. No rows returned" (or similar — some migrations return rows)
8. Repeat for the next file

**Run these files in this exact order:**

| # | File | What it creates |
|---|------|-----------------|
| 1 | `001_initial_schema.sql` | Core tables: `inventory_items`, `inventory_alerts`, `order_items`, `sales_summary`, `sync_logs`, `settings`, etc. |
| 2 | `002_google_documents.sql` | `google_documents` table for Drive sync |
| 3 | `003_vector_embeddings.sql` | `document_chunks` table with vector embeddings for semantic search |
| 4 | `003_order_items_category_size.sql` | Adds `category` and `size` columns to `order_items` |
| 5 | `004_recipes.sql` | `recipes`, `recipe_ingredients` tables for xtraCHEF data |
| 6 | `005_inventory_rework.sql` | `ingredients`, `count_history` tables; unit conversion and par-level tracking |
| 7 | `006_recipe_notes_instructions.sql` | Adds `notes`, `images`, `instructions` to recipes |
| 8 | `007_recipe_editable_fields.sql` | Adds `on_menu`, `creator`, `created_at_label` to recipes |
| 9 | `008_recipe_sync_lifecycle.sql` | Sync lifecycle columns for add/update/delete tracking |
| 10 | `009_recipe_metadata_backfill.sql` | Backfills cocktail recipe creator and era metadata |
| 11 | `010_recipe_refrigerate_cocktail_batch.sql` | Adds refrigerate flags to cocktail batch recipes |
| 12 | `011_syrup_metadata_backfill.sql` | Backfills syrup recipe metadata |
| 13 | `012_gift_cards.sql` | `gift_cards` table for gift card tracking |
| 14 | `013_push_subscriptions.sql` | `push_subscriptions` and `notification_preferences` tables for push notifications |

> **Troubleshooting:** If you see errors like `Could not find the table 'public.sync_logs' in the schema cache`, the migrations haven't been applied or were run out of order. Go back and run them sequentially from the beginning.

> **Alternative:** If you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and linked to your project, you can run all migrations at once:
> ```bash
> supabase db push
> ```

---

### Step 4. Set application secrets

These two values are used for authentication and cron job security. Generate random strings for both.

```bash
# Generate random values (or use any password manager)
openssl rand -base64 32   # use output for CRON_SECRET
openssl rand -base64 16   # or pick your own DASHBOARD_PASSWORD
```

Add to `.env.local`:
```
CRON_SECRET=<your-random-string>
DASHBOARD_PASSWORD=<your-chosen-password>
```

- `DASHBOARD_PASSWORD` — the password you'll enter on the login page at `/login`
- `CRON_SECRET` — used to authenticate GitHub Actions cron requests and to sign session cookies (HMAC-SHA256). Must match in Vercel env vars and GitHub repo secrets

---

### Step 5. Configure Toast POS

Toast is the source of sales data, order items, and real-time stock updates.

#### 5a. Get API credentials

1. Apply for a Toast integration partnership at [pos.toasttab.com/partners](https://pos.toasttab.com/partners)
2. Once approved, the Toast integrations team creates your [developer portal](https://developer.toasttab.com) account
3. They'll provide: a client ID, client secret, and your restaurant GUID

Add to `.env.local`:
```
TOAST_CLIENT_ID=your-client-id
TOAST_CLIENT_SECRET=your-client-secret
TOAST_RESTAURANT_GUID=your-restaurant-guid
TOAST_API_BASE_URL=https://ws-api.toasttab.com
```

#### 5b. Set up the Toast webhook (after deployment)

The webhook endpoint at `/api/webhooks/toast` receives `STOCK_UPDATE` events in real time and automatically updates inventory levels and triggers low-stock push notifications. This step requires a public URL, so do it after deploying (Step 10).

1. Contact your Toast integration representative and provide:
   - Your production webhook URL: `https://your-app.vercel.app/api/webhooks/toast`
   - The event category: **Stock**
2. Toast support will create the webhook subscription and provide a signing secret
3. Add the signing secret to `.env.local` (and Vercel env vars):
   ```
   TOAST_WEBHOOK_SECRET=your-webhook-signing-secret
   ```

See the [Toast webhook guide](https://doc.toasttab.com/doc/devguide/apiStockWebhook.html) for details on stock event types and payload formats.

---

### Step 6. Configure Gemini AI

The AI chat assistant and reorder suggestion engine use Google's Gemini 2.0 Flash model.

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **Create API Key**
3. Add to `.env.local`:
   ```
   GEMINI_API_KEY=your-gemini-api-key
   ```

---

### Start the dev server

At this point you have everything needed to run the app locally:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be prompted to log in with the `DASHBOARD_PASSWORD` you set in Step 4.

The following steps (7–9) are optional integrations. You can enable them now or later.

---

### Step 7. Connect Google Workspace (optional)

Connects Google Drive and Gmail so the AI assistant can search bar documents, receipts, and invoices.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (or use an existing one)
2. Enable two APIs:
   - **Google Drive API** — [direct link](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - **Gmail API** — [direct link](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
3. Configure the **OAuth consent screen**:
   - Go to **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Publishing status: **Testing**
   - Add your Google account email as a test user
4. Create OAuth 2.0 credentials:
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: add `http://localhost:3000/api/auth/google/callback` and your production URL (`https://your-app.vercel.app/api/auth/google/callback`)
5. Add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   ```
6. Start the app, go to **Settings**, and click **Connect Google** to complete the OAuth flow
7. Create two folders in your Google Drive named exactly **Finances** and **Operations** — the sync pulls documents from these folders

> **Production:** Update `GOOGLE_REDIRECT_URI` in Vercel env vars to your production callback URL.

---

### Step 8. Enable push notifications (optional)

The app is a Progressive Web App (PWA) that can send push notifications to your phone or desktop even when the browser tab is closed. Notifications fire for:

- **Inventory alerts** — when stock drops below par level or runs out
- **AI chat responses** — when the AI replies while your tab is inactive or the response takes longer than 5 seconds

#### 8a. Generate VAPID keys

VAPID (Voluntary Application Server Identification) keys are a key pair that identifies your server to push notification services. You only need to generate them once.

```bash
npx web-push generate-vapid-keys
```

This outputs a public key and a private key. Copy them into `.env.local`:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BHx8...    (the "Public Key" line)
VAPID_PRIVATE_KEY=4k2j...               (the "Private Key" line)
VAPID_SUBJECT=mailto:you@example.com     (your email — required by the Web Push protocol)
```

> **Important:** The `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is sent to the browser (it's a public key). The `VAPID_PRIVATE_KEY` must be kept secret — it signs push messages. If you regenerate keys, all existing push subscriptions become invalid and users must re-enable notifications.

#### 8b. Verify the migration was applied

Push notifications require the `push_subscriptions` and `notification_preferences` tables. If you ran all 14 migrations in Step 3c, these tables already exist. If not, run migration `013_push_subscriptions.sql` now via the Supabase SQL Editor.

#### 8c. Enable in the app

1. Go to **Settings → Push Notifications**
2. Click **Enable Notifications**
3. Your browser will prompt for notification permission — click **Allow**
4. Use the toggles to choose which notification types you want:
   - **Inventory Alerts** — low stock and out-of-stock notifications
   - **Chat Responses** — notify when AI responds while tab is inactive

> **Notes:**
> - Push notifications require HTTPS in production. `localhost` works in Chrome and Edge during development.
> - If you install the app to your home screen (PWA), notifications work even when the browser is closed.
> - Each browser/device registers its own subscription. Enable notifications on each device you use.
> - If notifications are "Blocked" in the settings card, you previously denied the browser permission prompt. Reset it in your browser's site settings (click the lock icon in the address bar → Notifications → Allow).

#### PWA production checklist

The core PWA push notification infrastructure is in place. These steps ensure it works end-to-end in production:

1. **Generate and deploy VAPID keys** — Run `npx web-push generate-vapid-keys`, add both keys to `.env.local` and Vercel environment variables
2. **Run migration 013** — Apply `supabase/migrations/013_push_subscriptions.sql` if not already applied
3. **Deploy with HTTPS** — Push notifications require a secure context; `localhost` works for dev but production must be HTTPS
4. **Replace placeholder icons** — `public/icon-192.svg` and `public/icon-512.svg` are the demon bartender SVG icons for the PWA install experience
5. **Test PWA install flow** — Install the app from Chrome (desktop and mobile) and verify it launches in standalone mode
6. **Test inventory alert notifications** — Trigger a Toast stock webhook or inventory recalculation that drops an item below par and confirm the push notification arrives
7. **Test chat response notifications** — Send a chat message, switch away from the tab, and verify the notification appears
8. **Test on iOS Safari** — iOS 16.4+ supports Web Push for home-screen PWAs; verify the permission prompt and notification delivery
9. **Add subscription renewal prompts** — Expired subscriptions are cleaned up on send failure but users are not prompted to re-subscribe
10. **Consider notification history** — Sent notifications are ephemeral; adding a `notification_history` table would enable in-app notification center and audit logging

---

### Step 9. Sync xtraCHEF recipes (optional)

Imports recipes, prep recipes, and raw ingredients from xtraCHEF (Toast's recipe management tool). These recipes power the expected inventory calculation — without them, the app can still track manual counts but can't auto-deduct usage from sales.

xtraCHEF does not have a public API. This integration uses the internal API and requires a Bearer token from a logged-in browser session.

#### 9a. Find your tenant and location IDs

1. Log into [app.sa.toasttab.com](https://app.sa.toasttab.com)
2. Open DevTools (`F12` or `Cmd+Option+I`)
3. Go to the **Network** tab
4. Navigate to Recipes in xtraCHEF
5. In the Network tab, find a request to `ecs-api-prod.sa.toasttab.com` containing `recipe-summary`
   - The URL looks like: `.../recipes-v2/tenants/{TENANT_ID}/location/{LOCATION_ID}/recipe-summary`
6. Copy the numeric `TENANT_ID` and `LOCATION_ID` from that URL

Add to `.env.local`:
```
XTRACHEF_TENANT_ID=39494
XTRACHEF_LOCATION_ID=12802
```

#### 9b. Get your Bearer token

1. In the same DevTools Network tab, click the `recipe-summary` request
2. Scroll to **Request Headers**
3. Copy the `Authorization` header value (starts with `Bearer`)

You can paste the token in either location:
- **`.env.local`** as `XTRACHEF_TOKEN=Bearer eyJ...` — for CLI sync
- **Settings page** under "xtraCHEF Recipes → Bearer token" — for UI sync (easier to update)

#### 9c. Run the sync

From the Settings page, click **Sync Recipes**. Or from the CLI:

```bash
npm run sync:xtrachef
```

> **Note:** The Bearer token expires when your Toast session ends. Re-paste it whenever sync returns a 401 error. The Settings page UI is easier for updates since you don't need to restart the dev server.

---

### Step 10. Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com), click **Add New Project**, and import the repo
3. In the Vercel project settings, go to **Settings → Environment Variables**
4. Add every variable from your `.env.local`. Make sure to update:
   - `GOOGLE_REDIRECT_URI` → `https://your-app.vercel.app/api/auth/google/callback`
5. Deploy. Vercel will build and host the app automatically on pushes to `main`

> **After deploying:** Set up the Toast webhook (Step 5b) now that you have a public URL.

---

### Step 11. Enable GitHub Actions cron (optional)

Automated daily syncs run via GitHub Actions, which call your Vercel API routes on a schedule.

#### 11a. Add GitHub repo secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `APP_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `CRON_SECRET` | Same value you set in Step 4 and Vercel env vars |

#### 11b. Cron schedule

The schedule is defined in `.github/workflows/daily-sync.yml`:

| Job | Schedule | API Route |
|-----|----------|-----------|
| Google Drive sync | Daily at 3:00 AM ET | `POST /api/sync/google` |
| Toast sync | Daily at 6:00 AM ET | `POST /api/sync/toast` |

Gmail is searched live by the AI chat agent — there is no scheduled Gmail sync.

A stub workflow for monthly tax prep (`.github/workflows/tax-filing.yml`) also exists and will run on the 1st of each month once Phase 2 is complete.

You can also trigger syncs manually from:
- The GitHub Actions tab (click **Run workflow**)
- The **Settings** page in the app (no secret needed — uses your login session)

---

## Using the App

### Inventory tracking

Inventory is tracked at the **ingredient level** using data from xtraCHEF recipes. After syncing recipes (Step 9), all raw ingredients appear on the **Inventory** page.

#### Configure ingredients

For each ingredient you want to track:

1. Click the **gear icon** to open settings
2. Set the **base unit** (e.g. ml, oz, each, g)
3. Set a **par level** — the minimum quantity you want on hand
4. Optionally set a **purchase unit conversion** (e.g. 1 bottle = 750 ml, 1 case = 200 each)

#### Manual counts

Click **Count** on any ingredient to record a physical count. You can enter quantities in:
- Base units (e.g. `500` for 500 ml)
- Purchase units (e.g. `2 bottles` — auto-converts to 1500 ml if 1 bottle = 750 ml)
- Other compatible units (e.g. `16 oz` when the base unit is ml — auto-converts)

Each count is saved in history with a timestamp and optional note.

#### Expected inventory

After each Toast sync, the app automatically calculates **expected inventory** for every counted ingredient:

1. Starts from the last manual count quantity
2. Looks at all menu items sold (from `order_items`) since the count date
3. Matches each menu item to its xtraCHEF recipe via Toast menu item GUID
4. Calculates total ingredient usage per serving (handles prep recipe expansion and unit conversions)
5. Subtracts usage from the count to get expected remaining stock

When expected inventory drops below par level, the row turns red, an alert is created on the **Alerts** page, and a push notification is sent (if enabled in Step 8).

---

## Environment Variable Reference

All variables live in `.env.local` (local dev) and Vercel environment variables (production). See `.env.local.example` for the full template with inline comments.

```bash
# ── Required ──────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anon (public) key
SUPABASE_SERVICE_ROLE_KEY=        # Supabase service role key (secret)
CRON_SECRET=                      # Signs session cookies + authenticates cron jobs
DASHBOARD_PASSWORD=               # Login password for the web UI
TOAST_CLIENT_ID=                  # Toast API client ID
TOAST_CLIENT_SECRET=              # Toast API client secret
TOAST_RESTAURANT_GUID=            # Toast restaurant GUID
TOAST_API_BASE_URL=               # Toast API base (https://ws-api.toasttab.com)
GEMINI_API_KEY=                   # Google Gemini API key

# ── Optional ──────────────────────────────────────────────────
TOAST_WEBHOOK_SECRET=             # Toast webhook signing secret
GOOGLE_CLIENT_ID=                 # Google OAuth client ID
GOOGLE_CLIENT_SECRET=             # Google OAuth client secret
GOOGLE_REDIRECT_URI=              # Google OAuth redirect URI
NEXT_PUBLIC_VAPID_PUBLIC_KEY=     # Web Push VAPID public key
VAPID_PRIVATE_KEY=                # Web Push VAPID private key (secret)
VAPID_SUBJECT=                    # Web Push contact email (mailto:...)
XTRACHEF_TENANT_ID=               # xtraCHEF tenant ID
XTRACHEF_LOCATION_ID=             # xtraCHEF location ID
XTRACHEF_TOKEN=                   # xtraCHEF Bearer token (expires)

# ── Future (not yet implemented) ──────────────────────────────
QBO_CLIENT_ID=                    # QuickBooks Online OAuth client ID
QBO_CLIENT_SECRET=                # QuickBooks Online OAuth client secret
QBO_REALM_ID=                     # QuickBooks company/realm ID
QBO_REDIRECT_URI=                 # QuickBooks OAuth redirect URI
SLING_API_TOKEN=                  # Sling scheduling API token
SLING_ORG_ID=                     # Sling organization ID
```

---

## Phases

| Phase | Status | Scope |
|-------|--------|-------|
| **1 — Inventory + Toast** | Done | Dashboard, ingredient-based inventory with expected usage tracking, par levels, unit conversions, count history, low-stock alerts, AI reorder suggestions, daily sync, historical backfill, xtraCHEF recipe sync with lifecycle management, recipe editing (on_menu, creator, refrigerate), menu sales analytics, gift card tracking |
| **2 — QBO + Sales Tax** | Partial | NYC ST-100 tax computation works (MCP tool + lib/tax); QBO integration and filing automation not yet implemented |
| **3 — Sling + Payroll** | Not started | AI scheduling, time entry tracking, payroll pre-fill (env vars reserved, no integration code yet) |
| **4 — AI Chat** | Done | Natural language queries against bar data via Gemini function calling, vector-based document search with embedding cache |
| **PWA + Push Notifications** | Done | Installable PWA, push notifications for inventory alerts and AI chat responses, per-user notification preferences, nav alert badge |
| **Google Workspace** | Done | Drive + Gmail sync, document chunking + vector embeddings, semantic document search, AI-powered PDF extraction |

## Project Structure

```
app/
  login/                  Password login page
  dashboard/              Sales KPIs + active alerts overview
  inventory/              Ingredient inventory: counts, expected usage, par levels, unit conversions
  inventory/alerts/       Low-stock alerts + AI reorder suggestions (ingredient + Toast stock)
  recipes/                Recipes + prep recipes from xtraCHEF
  menu/sales/             Menu item sales analytics with date filtering, sorting, and category grouping
  gift-cards/             Gift card balance and liability tracking
  chat/                   Conversational AI interface
  settings/               Integration status, push notifications, Google connect, xtraCHEF token, sync history
  tax/                    Sales tax worksheet (Phase 2)
  bookkeeping/            QBO journal entries (Phase 2)
  schedule/               AI scheduling (Phase 3)
  payroll/                Payroll dashboard (Phase 3)
  api/
    auth/session/         Login/logout (password → signed cookie)
    auth/google/          Google OAuth2 flow (consent + callback + status)
    sync/toast/           Daily Toast sync endpoint
    sync/toast/backfill/  Backfill historical Toast order data for a date range (max 90 days)
    sync/google/          Google Drive sync endpoint
    sync/gmail/           Gmail sync endpoint
    sync/xtrachef/        xtraCHEF recipe sync endpoint
    notifications/        Push subscription management + notification preferences
    inventory/            Inventory CRUD, manual counts, expected recalculation
    menu-sales/           Menu sales aggregation with date filtering + item normalization
    recipes/[id]/         Recipe detail editing (on_menu, creator, created_at_label, refrigerate)
    gift-cards/           Gift card CRUD
    webhooks/toast/       Real-time Toast stock webhook
    ai/chat/              Gemini chat endpoint
    ai/reorder/           AI reorder suggestions endpoint

lib/
  auth/                   Session token (HMAC-SHA256) + request verification
  integrations/           Toast, Google, xtraCHEF, QBO, Sling API clients
  inventory/              Expected inventory calculation engine
  notifications/          Push notification sending (web-push) + client-side SW registration
  sync/                   Toast order sync + xtraCHEF recipe sync logic
  menu-sales/             Date range presets, filtering, item normalization, case computation, and category ordering
  units.ts                Unit conversion (ml/oz/volume/weight + purchase units)
  ai/
    agent.ts              Gemini Flash agent with function-calling tools
    embeddings.ts         Document chunking + vector embeddings + similarity search
    token-cache.ts        LRU caching for embeddings, RAG results, and tool call responses
  tax/                    NYC sales tax calculator
  supabase/               DB clients and TypeScript types

public/
  sw.js                   Service worker for push notifications
  manifest.json           PWA web app manifest
  favicon.svg             Favicon (demon bartender SVG)
  icon-192.svg            PWA icon (192x192 SVG)
  icon-512.svg            PWA icon (512x512 SVG)

scripts/
  sync-xtrachef.ts        CLI script for xtraCHEF recipe sync

supabase/
  migrations/             SQL schema migrations (run in order via Supabase SQL Editor)
```
