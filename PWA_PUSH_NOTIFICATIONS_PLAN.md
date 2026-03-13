# PWA + Push Notifications Implementation Plan

## Overview

Convert Bar Manager into a Progressive Web App (PWA) with push notification support for two key scenarios:
1. **Inventory par alerts** — notify when ingredients drop below par level
2. **Chatbot responses** — notify when an AI chat response is ready (useful for long-running queries or background tabs)

---

## Current State

| Aspect | Status |
|--------|--------|
| PWA manifest | None |
| Service worker | None |
| Push notifications | None |
| Inventory alerts | DB-only (`inventory_alerts` table), no real-time delivery |
| Chat notifications | None — response is inline only |
| Notification preferences | None |

---

## Phase 1: PWA Foundation

### 1.1 Web App Manifest

**File:** `public/manifest.json`

Create the manifest with app metadata:
- `name`: "Bar Manager"
- `short_name`: "Bar Mgr"
- `start_url`: "/dashboard"
- `display`: "standalone"
- `theme_color` / `background_color`: match the dark theme (`hsl(240 10% 3.9%)`)
- `icons`: Generate PWA icon set (192x192, 512x512) from existing `favicon.png`

**File:** `app/layout.tsx`

Add to `<head>` metadata:
- Link to `manifest.json`
- `theme-color` meta tag
- `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` meta tags

### 1.2 Service Worker

**File:** `public/sw.js`

Create a service worker that handles:
- **Push event listener** — receive and display push notifications
- **Notification click handler** — open/focus the app and navigate to the relevant page
- **Basic install/activate** lifecycle events

> **Note:** We are NOT implementing offline caching or advanced SW strategies. The app requires live data (inventory, sales, chat) so offline support adds complexity with little value. The SW exists solely to enable push notifications.

### 1.3 Service Worker Registration

**File:** `lib/notifications/sw-registration.ts`

Client-side utility to:
- Check for service worker + push API support
- Register the service worker
- Request notification permission from the user
- Subscribe to push notifications using VAPID public key
- Send the `PushSubscription` to the backend for storage

---

## Phase 2: Backend Push Infrastructure

### 2.1 VAPID Keys

Generate a VAPID key pair for Web Push:
- Store as environment variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto: URL)
- Add to `.env.local.example`

### 2.2 Database: Push Subscriptions Table

**Migration:** `supabase/migrations/013_push_subscriptions.sql`

```sql
create table push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null,              -- from auth session
  endpoint text not null unique,      -- push service endpoint URL
  p256dh text not null,               -- client public key
  auth text not null,                 -- auth secret
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_push_subscriptions_user on push_subscriptions(user_id);
```

### 2.3 Database: Notification Preferences Table

**Migration:** `supabase/migrations/014_notification_preferences.sql`

```sql
create table notification_preferences (
  id bigint generated always as identity primary key,
  user_id uuid not null unique,
  inventory_alerts boolean default true,
  chat_responses boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 2.4 Push Subscription API

**File:** `app/api/notifications/subscribe/route.ts`

- `POST` — Save a push subscription (endpoint, keys) for the authenticated user
- `DELETE` — Remove a subscription (unsubscribe)

### 2.5 Notification Preferences API

**File:** `app/api/notifications/preferences/route.ts`

- `GET` — Fetch current user's notification preferences
- `PUT` — Update preferences (toggle inventory alerts, chat responses)

### 2.6 Push Sending Utility

**File:** `lib/notifications/push.ts`

- Install `web-push` npm package
- Utility function: `sendPushNotification(userId, payload)` that:
  1. Looks up all subscriptions for the user
  2. Checks user's notification preferences
  3. Sends via `web-push` library with VAPID credentials
  4. Handles expired/invalid subscriptions (delete on 410 Gone)

**Payload format:**
```typescript
interface PushPayload {
  type: "inventory_alert" | "chat_response";
  title: string;
  body: string;
  url: string;        // where to navigate on click
  tag?: string;       // for notification grouping/replacement
}
```

---

## Phase 3: Inventory Par Alert Notifications

### 3.1 Trigger Points

Inventory alerts are created in two places — both need push notification hooks:

**A. Expected inventory recalculation** (`lib/inventory/expected.ts`)

After an alert is inserted into `inventory_alerts`, call `sendPushNotification()`:
- Title: "Low Stock Alert" or "Out of Stock"
- Body: `"{ingredient name} is below par level ({expected_qty}/{par_level})"`
- URL: `/inventory/alerts`
- Tag: `inventory-alert-{ingredient_id}` (prevents duplicate notifications for same item)

**B. Toast webhook** (`app/api/webhooks/toast/route.ts`)

After processing a `STOCK_UPDATE` event that creates an alert, send a push notification with the same format.

### 3.2 Deduplication

- Use the notification `tag` field so the browser replaces (not stacks) alerts for the same ingredient
- Only send push if the alert was newly created (not if it already existed in the DB)

---

## Phase 4: Chat Response Notifications

### 4.1 Strategy

Push notifications for chat responses are valuable when:
- The user has navigated away from the chat tab
- The AI response takes time (multi-tool calls)

**File:** `app/api/ai/chat/route.ts`

After generating the response, check if the user's tab is likely inactive:
- The frontend includes a header like `X-Tab-Active: false` when sending the chat request while the document is hidden (`document.hidden`)
- If tab is inactive **or** the response took longer than a configurable threshold (e.g., 5 seconds), send a push notification

**Notification format:**
- Title: "Bar Manager — Chat Reply"
- Body: First ~100 characters of the AI response
- URL: `/chat`
- Tag: `chat-response` (replaces previous chat notification)

### 4.2 Frontend Changes

**File:** `app/chat/page.tsx`

- Track `document.visibilityState` via a `visibilitychange` event listener
- Pass `X-Tab-Active` header with chat API requests
- When a push notification brings the user back, the chat is already rendered (response arrived via the fetch)

---

## Phase 5: Settings UI

### 5.1 Notification Settings Component

**File:** `components/notification-settings.tsx`

A component (usable in a settings page or dialog) that:
1. Shows current permission state (granted / denied / default)
2. "Enable Notifications" button → triggers permission request + SW registration + subscription
3. Toggle switches for:
   - Inventory par alerts (on/off)
   - Chat response alerts (on/off)
4. "Disable Notifications" → unsubscribe and remove subscription from DB

### 5.2 Notification Bell in Nav

**File:** `components/nav.tsx`

- Add a bell icon (from lucide-react) in the navigation bar
- Show a dot/badge if there are unresolved inventory alerts
- Clicking opens a dropdown or navigates to `/inventory/alerts`
- Include a link to notification settings

---

## Phase 6: Next.js Configuration

### 6.1 Update next.config.ts

Add headers to serve the service worker from the root scope:
```typescript
async headers() {
  return [
    {
      source: "/sw.js",
      headers: [
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Cache-Control", value: "no-cache" },
      ],
    },
  ];
},
```

---

## Implementation Order

| Step | Task | Dependencies |
|------|------|-------------|
| 1 | Generate VAPID keys, add env vars | None |
| 2 | Create `public/manifest.json` + icons | None |
| 3 | Update `app/layout.tsx` with PWA metadata | Step 2 |
| 4 | Create `public/sw.js` (push listener + click handler) | None |
| 5 | Update `next.config.ts` with SW headers | None |
| 6 | Run DB migrations (013, 014) | None |
| 7 | Install `web-push` package | None |
| 8 | Create `lib/notifications/push.ts` (send utility) | Steps 6, 7 |
| 9 | Create `lib/notifications/sw-registration.ts` | Step 4 |
| 10 | Create `app/api/notifications/subscribe/route.ts` | Steps 6, 8 |
| 11 | Create `app/api/notifications/preferences/route.ts` | Step 6 |
| 12 | Hook inventory alert creation → push | Step 8 |
| 13 | Hook chat response → push | Step 8 |
| 14 | Create `components/notification-settings.tsx` | Steps 9, 10, 11 |
| 15 | Add notification bell to nav | Step 14 |
| 16 | Test end-to-end on mobile + desktop | All |

---

## New Dependencies

| Package | Purpose |
|---------|---------|
| `web-push` | Server-side Web Push protocol (VAPID auth, payload encryption) |
| `@types/web-push` | TypeScript types (dev) |

---

## New Files Summary

| File | Type |
|------|------|
| `public/manifest.json` | PWA manifest |
| `public/sw.js` | Service worker |
| `public/icon-192.png` | PWA icon (192x192) |
| `public/icon-512.png` | PWA icon (512x512) |
| `lib/notifications/push.ts` | Server-side push sending |
| `lib/notifications/sw-registration.ts` | Client-side SW + subscription |
| `app/api/notifications/subscribe/route.ts` | Subscription CRUD |
| `app/api/notifications/preferences/route.ts` | Preferences CRUD |
| `components/notification-settings.tsx` | Settings UI |
| `supabase/migrations/013_push_subscriptions.sql` | Subscriptions table |
| `supabase/migrations/014_notification_preferences.sql` | Preferences table |

---

## Modified Files Summary

| File | Changes |
|------|---------|
| `app/layout.tsx` | Add manifest link, theme-color, apple PWA meta tags |
| `next.config.ts` | Add SW headers |
| `lib/inventory/expected.ts` | Send push after alert creation |
| `app/api/webhooks/toast/route.ts` | Send push after webhook-triggered alert |
| `app/api/ai/chat/route.ts` | Send push for chat responses when tab inactive |
| `app/chat/page.tsx` | Track visibility state, pass header |
| `components/nav.tsx` | Add notification bell |
| `package.json` | Add `web-push` dependency |
| `.env.local.example` | Add VAPID env vars |

---

## Security Considerations

- VAPID private key must stay server-side only (never expose to client)
- Push subscription endpoints are user-specific — validate ownership via session
- Rate-limit push notifications (max ~1 per ingredient per hour for par alerts)
- Sanitize notification body content to prevent injection
- Handle subscription expiry gracefully (clean up on 410 responses)

---

## Testing Strategy

- **Unit tests**: `lib/notifications/push.ts` — mock `web-push` and verify correct payloads
- **Integration tests**: Subscription API routes — verify CRUD with mock Supabase
- **Manual E2E**: Test on Chrome (desktop + Android) and Safari (iOS 16.4+) for push support
- **Vitest**: Add tests alongside existing test infrastructure
