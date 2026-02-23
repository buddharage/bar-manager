# Bar Manager

AI-powered operations dashboard for a 50-seat cocktail bar in Brooklyn, NY. Integrates with Toast POS, QuickBooks Online, and Sling to automate inventory alerts, sales tracking, bookkeeping, tax filing, and scheduling.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Database**: Supabase (PostgreSQL)
- **UI**: Tailwind CSS + shadcn/ui
- **AI**: Gemini 2.0 Flash (function calling for data queries + reorder suggestions)
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
2. Open **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Copy your credentials from **Settings → API** into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### 2. Configure Toast API

1. Register at the [Toast Developer Portal](https://dev.toasttab.com)
2. Create a client credentials app (Standard tier, read-only)
3. Add to `.env.local`:
   ```
   TOAST_CLIENT_ID=your-client-id
   TOAST_CLIENT_SECRET=your-client-secret
   TOAST_RESTAURANT_GUID=your-restaurant-guid
   TOAST_API_BASE_URL=https://ws-api.toasttab.com
   ```
4. Register a stock webhook → `https://your-domain.vercel.app/api/webhooks/toast`
5. Set `TOAST_WEBHOOK_SECRET` to the signing secret Toast provides

### 3. Configure Gemini AI

1. Get an API key at [Google AI Studio](https://aistudio.google.com/apikey)
2. Add to `.env.local`:
   ```
   GEMINI_API_KEY=your-gemini-api-key
   ```

### 4. Deploy to Vercel

1. Push to GitHub and import the repo in [Vercel](https://vercel.com)
2. Add all `.env.local` variables as Vercel environment variables
3. Generate a random `CRON_SECRET` and add it to both Vercel env vars and GitHub repo secrets

### 5. Enable GitHub Actions cron

Add these secrets to your GitHub repo (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|--------|-------|
| `APP_URL` | `https://your-app.vercel.app` |
| `CRON_SECRET` | Same value as in Vercel |

The daily Toast sync runs at 6 AM ET. You can also trigger it manually from the Actions tab or from the Settings page in the app.

### 6. Set inventory par levels

After the first Toast sync populates your inventory, set `par_level` for items you want to track. Do this in Supabase's table editor on the `inventory_items` table. Once set, the daily sync will automatically generate low-stock alerts and the AI can suggest reorder quantities.

## Phases

| Phase | Status | Scope |
|-------|--------|-------|
| **1 — Inventory + Toast** | Done | Dashboard, inventory tracking, low-stock alerts, AI reorder suggestions, daily sync |
| **2 — QBO + Sales Tax** | Stubbed | QuickBooks journal entries, NYC ST-100 tax worksheet, monthly filing reminders |
| **3 — Sling + Payroll** | Stubbed | AI scheduling, time entry tracking, payroll pre-fill |
| **4 — AI Chat** | Done | Natural language queries against bar data via Gemini function calling |

## Project Structure

```
app/
  dashboard/          Sales KPIs + active alerts overview
  inventory/          Inventory list with stock status
  inventory/alerts/   Low-stock alerts + AI reorder suggestions
  chat/               Conversational AI interface
  settings/           Integration status, manual sync, sync history
  tax/                Sales tax worksheet (Phase 2)
  bookkeeping/        QBO journal entries (Phase 2)
  schedule/           AI scheduling (Phase 3)
  payroll/            Payroll dashboard (Phase 3)
  api/
    sync/toast/       Daily Toast sync endpoint
    webhooks/toast/   Real-time stock webhook
    ai/chat/          Gemini chat endpoint
    ai/reorder/       AI reorder suggestions endpoint

lib/
  integrations/       Toast, QBO, Sling API clients
  ai/                 Gemini Flash agent with tool-calling
  tax/                NYC sales tax calculator
  supabase/           DB clients and TypeScript types
```
