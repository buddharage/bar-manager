# Witching Hour BK — Bar Manager

## Bar Profile
- **Name**: Witching Hour BK
- **Type**: 50-seat cocktail bar
- **Location**: Brooklyn, NY
- **Contact**: thai@witchinghourbk.com

## Data Sources
- **Toast POS**: Sales data, menu items, inventory levels (read-only API, Standard tier). Syncs daily via GitHub Actions cron.
- **xtraCHEF**: Recipes, ingredients, food costs. Manual sync via settings page.
- **Google Drive**: Financial documents, P&Ls, vendor contracts. Synced into Supabase with vector embeddings for semantic search.
- **Gmail**: Vendor receipts, invoices, order confirmations. Searched live via Gmail API (not stored locally).

## MCP Tools (bar-manager server)
When using Claude CLI from this directory, the `bar-manager` MCP server provides these tools:

| Tool | Use For |
|------|---------|
| `query_inventory` | Current stock levels, low-stock items, filter by category |
| `query_sales` | Daily sales data for a date range (gross, net, tax, tips) |
| `query_top_sellers` | Top menu items by quantity or revenue |
| `query_alerts` | Unresolved inventory alerts (low stock, out of stock, overstock) |
| `query_tax_periods` | Tax filing periods and their status |
| `compute_st100` | NYC ST-100 sales tax worksheet computation |
| `query_employees` | Employee list with roles and hourly rates |
| `query_time_entries` | Labor hours and tips for payroll |
| `query_recipes` | Recipe lookup with ingredients and costs |
| `format_recipes_for_xtrachef` | Format recipes with brand preferences for xtraCHEF entry |
| `query_gift_cards` | Gift card balances and status |
| `query_sync_logs` | Recent integration sync status |
| `search_documents` | Semantic search on Google Drive documents |

## NYC Sales Tax (ST-100)
- **Combined rate**: 8.875% (State 4% + City 4.5% + MCTD 0.375%)
- **Filing frequency**: Quarterly (March, June, September, December)
- **Source of truth**: Toast daily sales reports (net_sales = taxable amount)
- **Filing website**: NY Department of Tax and Finance (DTF) Online Services
- **Process**: Use `compute_st100` tool → review numbers with user → file via Playwright on DTF website
- **IMPORTANT**: Always present computed numbers and get explicit user confirmation before filing

## Key Vendors
Recognize these in Gmail searches and vendor discussions:
- **Southern Glazer's Wine & Spirits** — Primary liquor distributor
- **Sysco** — Food and supplies
- **US Foods** — Backup food supplier
- **Brooklyn Ice** — Ice delivery
- **Ecolab** — Cleaning supplies and pest control
- **Toast** — POS system provider

## Sling Scheduling
- **URL**: app.getsling.com
- **Positions**: Bartender, Barback, Server, Manager
- **Access**: Via Playwright MCP with saved browser session
- **IMPORTANT**: Always confirm schedule changes with user before saving

## Bookkeeping Context
- **COGS**: Computed from xtraCHEF recipe costs × menu item sales quantities
- **Revenue**: From Toast daily_sales.net_sales
- **Labor**: From time_entries (regular_hours × hourly_rate + overtime × 1.5 × hourly_rate)
- **Tip distribution**: Tips recorded per time entry; distributed based on bar's policy
- **Gift cards**: Tracked in gift_cards table; liability until redeemed

## Playwright Workflows

### Sling Scheduling
1. Query employees from bar-manager MCP to get names and roles
2. Navigate to `app.getsling.com` via Playwright
3. Authenticate (use saved browser state)
4. Create/modify shifts as instructed
5. **STOP — confirm with user before saving**

### Sales Tax Filing (ST-100)
1. Query `daily_sales` via `compute_st100` tool for the tax period
2. Present computed numbers to user for review
3. Navigate to NY DTF website via Playwright
4. Fill in form fields with computed values
5. **STOP — screenshot and confirm with user before submitting**
6. Screenshot confirmation page after submission

## Safety Rules
**Always confirm with the user before:**
- Submitting any tax form or payment
- Creating, modifying, or deleting schedules on Sling
- Sending any email or external communication
- Making any changes to external systems (Toast, Sling, government websites)
- Deleting or modifying any data

**When using Playwright for supervised tasks:**
1. Navigate to the target site
2. Take a screenshot and describe what you see
3. Explain what you're about to do
4. Wait for explicit user confirmation before each action
5. Screenshot the result after each action
