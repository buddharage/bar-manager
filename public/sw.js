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
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // For chat notifications, suppress if the user is focused on the chat page.
      // We use `focused` instead of `visibilityState === "visible"` because
      // visibilityState stays "visible" even when the user switches to another
      // OS application (e.g. Finder, Slack) — only tab changes or minimizing
      // flip it to "hidden". `focused` correctly reflects whether the user is
      // actively looking at the tab.
      if (payload.type === "chat_response") {
        const chatFocused = clients.some(
          (c) => c.focused && c.url.includes("/chat")
        );
        if (chatFocused) return;
      }

      // For inventory alerts, suppress if the user is focused on the alerts page.
      if (payload.type === "inventory_alert") {
        const alertsFocused = clients.some(
          (c) => c.focused && c.url.includes("/inventory/alerts")
        );
        if (alertsFocused) return;
      }

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
