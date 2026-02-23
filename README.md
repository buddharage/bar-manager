# Bar Manager

AI-powered operations dashboard for a 50-seat cocktail bar in Brooklyn, NY. Integrates with Toast POS, Google Workspace, QuickBooks Online, and Sling to automate inventory alerts, sales tracking, document search, bookkeeping, tax filing, and scheduling.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
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

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run both migration files in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_google_documents.sql`
3. Copy your credentials from **Settings → API** into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

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
4. Generate a random `CRON_SECRET` and add it to both Vercel env vars and GitHub repo secrets

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

You can also trigger all syncs manually from the GitHub Actions tab or from the **Settings** page in the app.

### 7. Set inventory par levels

After the first Toast sync populates your inventory, set `par_level` for items you want to track. Do this in Supabase's table editor on the `inventory_items` table. Once set, the daily sync will automatically generate low-stock alerts and the AI can suggest reorder quantities.

## Phases

| Phase | Status | Scope |
|-------|--------|-------|
| **1 — Inventory + Toast** | Done | Dashboard, inventory tracking, low-stock alerts, AI reorder suggestions, daily sync |
| **2 — QBO + Sales Tax** | Stubbed | QuickBooks journal entries, NYC ST-100 tax worksheet, monthly filing reminders |
| **3 — Sling + Payroll** | Stubbed | AI scheduling, time entry tracking, payroll pre-fill |
| **4 — AI Chat** | Done | Natural language queries against bar data via Gemini function calling |
| **Google Workspace** | Done | Drive + Gmail sync, full-text document search, AI-powered PDF extraction |

## Project Structure

```
app/
  dashboard/              Sales KPIs + active alerts overview
  inventory/              Inventory list with stock status
  inventory/alerts/       Low-stock alerts + AI reorder suggestions
  chat/                   Conversational AI interface
  settings/               Integration status, Google connect, sync history
  tax/                    Sales tax worksheet (Phase 2)
  bookkeeping/            QBO journal entries (Phase 2)
  schedule/               AI scheduling (Phase 3)
  payroll/                Payroll dashboard (Phase 3)
  api/
    auth/google/          Google OAuth2 flow (consent + callback)
    sync/toast/           Daily Toast sync endpoint
    sync/google/          Google Drive sync endpoint
    sync/gmail/           Gmail sync endpoint
    webhooks/toast/       Real-time Toast stock webhook
    ai/chat/              Gemini chat endpoint
    ai/reorder/           AI reorder suggestions endpoint

lib/
  integrations/           Toast, Google, QBO, Sling API clients
  ai/                     Gemini Flash agent with tool-calling
  tax/                    NYC sales tax calculator
  supabase/               DB clients and TypeScript types

supabase/
  migrations/             SQL schema migrations (run in order)
```
