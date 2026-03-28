// Service worker for Willy push notifications.
// No offline caching — this SW exists solely for push notification support.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Willy",
      body: event.data.text(),
      url: "/dashboard",
    };
  }

  const options = {
    body: payload.body,
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(
    (async () => {
      // For chat notifications, suppress only if the user is focused on the
      // chat page (they'll see the response appear in the UI).
      // We use `focused` instead of `visibilityState === "visible"` because
      // visibilityState stays "visible" even when the user switches to another
      // OS application (e.g. Finder, Slack) — only tab switches or minimizing
      // flip it to "hidden". `focused` correctly goes false when the browser
      // loses focus, so the notification fires when the user is in another app.
      if (payload.type === "chat_response") {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const chatFocused = clients.some(
          (c) => c.focused && c.url.includes("/chat")
        );
        if (chatFocused) return;
      }

      // Suppress whiteboard notifications if user is viewing the whiteboard page.
      if (payload.type === "whiteboard_update") {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const wbFocused = clients.some(
          (c) => c.focused && c.url.includes("/whiteboard")
        );
        if (wbFocused) return;
      }

      // Inventory alerts always show — no suppression.

      await self.registration.showNotification(payload.title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if one is open
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(url);
      })
  );
});
