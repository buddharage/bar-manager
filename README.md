# Bar Manager

AI-powered operations dashboard for a 50-seat cocktail bar in Brooklyn, NY. Integrates with Toast POS, Google Workspace, QuickBooks Online, and Sling to automate inventory alerts, sales tracking, document search, bookkeeping, tax filing, and scheduling.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: Supabase (PostgreSQL)
- **UI**: Tailwind CSS + shadcn/ui
- **AI**: Gemini 2.0 Flash (function calling for data queries, document search, reorder suggestions, PDF text extraction)
- **Cron**: GitHub Actions → Vercel API routes
- **Deployment**: Vercel

## Quick Setup

```bash
npm install
cp .env.local.example .env.local
# Fill in your credentials (see steps below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be prompted to log in with the `DASHBOARD_PASSWORD` you set in `.env.local`.

### 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Copy your credentials from **Settings → API** into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

#### Seed the database

The app will not work until the database tables are created. Run each migration file **in order** via the Supabase SQL Editor (**Dashboard → SQL Editor → New query**):

1. `supabase/migrations/001_initial_schema.sql` — core tables (inventory, sales, sync logs, settings, etc.)
2. `supabase/migrations/002_google_documents.sql` — Google Workspace document storage
3. `supabase/migrations/003_vector_embeddings.sql` — Vector embeddings for document search
4. `supabase/migrations/003_order_items_category_size.sql` — Order items category/size fields
5. `supabase/migrations/004_recipes.sql` — xtraCHEF recipes, recipe ingredients, and raw ingredients

For each file: copy the full contents, paste into the SQL Editor, and click **Run**. You must run them in order because later migrations may depend on earlier ones.

> **Troubleshooting:** If you see errors like `Could not find the table 'public.sync_logs' in the schema cache`, the migrations haven't been applied. Go back and run them in the SQL Editor.

### 2. Configure Toast API

1. Apply for a Toast integration partnership at [pos.toasttab.com/partners](https://pos.toasttab.com/partners). Once approved, the Toast integrations team will create your [developer portal](https://developer.toasttab.com) account and assign client credentials.
2. Add your credentials to `.env.local`:
   ```
   TOAST_CLIENT_ID=your-client-id
   TOAST_CLIENT_SECRET=your-client-secret
   TOAST_RESTAURANT_GUID=your-restaurant-guid
   TOAST_API_BASE_URL=https://ws-api.toasttab.com
   ```

#### Toast Webhook (real-time stock updates)

The webhook endpoint at `/api/webhooks/toast` receives `STOCK_UPDATE` events and automatically updates inventory levels and triggers low-stock alerts. To set it up:

1. Deploy the app first (see step 5 below) so you have a public URL
2. Contact your Toast integration representative and provide:
   - Your production webhook URL: `https://your-app.vercel.app/api/webhooks/toast`
   - The event category: **Stock**
3. Toast support will create the webhook subscription and provide a signing secret
4. Add the signing secret to `.env.local`:
   ```
   TOAST_WEBHOOK_SECRET=your-webhook-signing-secret
   ```

See the [Toast webhook guide](https://doc.toasttab.com/doc/devguide/apiStockWebhook.html) for details on stock event types and payload formats.

### 3. Configure Gemini AI

1. Get an API key at [Google AI Studio](https://aistudio.google.com/apikey)
2. Add to `.env.local`:
   ```
   GEMINI_API_KEY=your-gemini-api-key
   ```

### 4. Connect Google Workspace (optional)

Connects Google Drive and Gmail so the AI assistant can search bar documents, receipts, and invoices.

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com/)
2. Enable the **Google Drive API** and **Gmail API**
3. Configure **OAuth consent screen** → External → Testing mode → add your Google account as a test user
4. Under **Credentials**, create an **OAuth 2.0 Web Application** client
   - Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback` (and your production Vercel URL)
5. Add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   ```
6. Go to **Settings** in the app and click **Connect Google** to complete the OAuth flow
7. Create two folders in your Google Drive named **Finances** and **Operations** — the sync pulls documents from these folders

### 5. Deploy to Vercel

1. Push to GitHub and import the repo in [Vercel](https://vercel.com)
2. Add all `.env.local` variables as Vercel environment variables
3. Update `GOOGLE_REDIRECT_URI` to your production callback URL
4. Generate a random `CRON_SECRET` and `DASHBOARD_PASSWORD` and add both to Vercel env vars. Add `CRON_SECRET` to GitHub repo secrets too

### 6. Enable GitHub Actions cron

Add these secrets to your GitHub repo (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|--------|-------|
| `APP_URL` | `https://your-app.vercel.app` |
| `CRON_SECRET` | Same value as in Vercel |

The cron schedule:

| Job | Schedule | Route |
|-----|----------|-------|
| Google Drive sync | Daily at 3 AM ET | `/api/sync/google` |
| Gmail sync | Every 6 hours | `/api/sync/gmail` |
| Toast sync | Daily at 6 AM ET | `/api/sync/toast` |

You can also trigger all syncs manually from the GitHub Actions tab or from the **Settings** page in the app (no secret prompt needed — uses your login session).

### 7. Set inventory par levels

After the first Toast sync populates your inventory, set `par_level` for items you want to track. Do this in Supabase's table editor on the `inventory_items` table. Once set, the daily sync will automatically generate low-stock alerts and the AI can suggest reorder quantities.

### 8. Sync xtraCHEF recipes (optional)

Imports recipes, prep recipes, and ingredients from xtraCHEF (Toast's recipe management tool). This uses xtraCHEF's internal API — there's no public API, so you need a Bearer token from a logged-in browser session.

1. Add your tenant and location IDs to `.env.local` (see `.env.local.example` for instructions on finding them in DevTools):
   ```
   XTRACHEF_TENANT_ID=39494
   XTRACHEF_LOCATION_ID=12802
   ```
2. Get your Bearer token:
   - Log into [app.sa.toasttab.com](https://app.sa.toasttab.com)
   - Open DevTools (F12) → Network tab
   - Navigate to Recipes
   - Find a request to `ecs-api-prod.sa.toasttab.com`
   - Copy the `Authorization` header value (starts with `Bearer`)
3. Paste the token either:
   - In `.env.local` as `XTRACHEF_TOKEN` (for CLI sync), or
   - In the **Settings** page under "xtraCHEF Recipes → Bearer token" (for UI sync)
4. Sync via the Settings page "Sync Recipes" button, or from the CLI:
   ```bash
   npm run sync:xtrachef
   ```

> **Note:** The Bearer token expires when your Toast session ends. Re-paste it whenever sync returns a 401 error.

## Phases

| Phase | Status | Scope |
|-------|--------|-------|
| **1 — Inventory + Toast** | Done | Dashboard, inventory tracking, low-stock alerts, AI reorder suggestions, daily sync, xtraCHEF recipe sync |
| **2 — QBO + Sales Tax** | Stubbed | QuickBooks journal entries, NYC ST-100 tax worksheet, monthly filing reminders |
| **3 — Sling + Payroll** | Stubbed | AI scheduling, time entry tracking, payroll pre-fill |
| **4 — AI Chat** | Done | Natural language queries against bar data via Gemini function calling |
| **Google Workspace** | Done | Drive + Gmail sync, full-text document search, AI-powered PDF extraction |

## Project Structure

```
app/
  login/                  Password login page
  dashboard/              Sales KPIs + active alerts overview
  inventory/              Inventory list with stock status
  inventory/alerts/       Low-stock alerts + AI reorder suggestions
  recipes/                Recipes + prep recipes from xtraCHEF
  chat/                   Conversational AI interface
  settings/               Integration status, Google connect, xtraCHEF token, sync history
  tax/                    Sales tax worksheet (Phase 2)
  bookkeeping/            QBO journal entries (Phase 2)
  schedule/               AI scheduling (Phase 3)
  payroll/                Payroll dashboard (Phase 3)
  api/
    auth/session/         Login/logout (password → signed cookie)
    auth/google/          Google OAuth2 flow (consent + callback)
    sync/toast/           Daily Toast sync endpoint
    sync/google/          Google Drive sync endpoint
    sync/gmail/           Gmail sync endpoint
    sync/xtrachef/        xtraCHEF recipe sync endpoint
    webhooks/toast/       Real-time Toast stock webhook
    ai/chat/              Gemini chat endpoint
    ai/reorder/           AI reorder suggestions endpoint

lib/
  auth/                   Session token (HMAC-SHA256) + request verification
  integrations/           Toast, Google, xtraCHEF, QBO, Sling API clients
  sync/                   Shared sync logic (xtraCHEF recipes)
  ai/                     Gemini Flash agent with tool-calling
  tax/                    NYC sales tax calculator
  supabase/               DB clients and TypeScript types

scripts/
  sync-xtrachef.ts        CLI script for xtraCHEF recipe sync

supabase/
  migrations/             SQL schema migrations (run in order)
```
