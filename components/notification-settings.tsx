"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
  saveSubscription,
  removeSubscription,
} from "@/lib/notifications/sw-registration";

interface Preferences {
  inventory_alerts: boolean;
  chat_responses: boolean;
  whiteboard_updates: boolean;
}

export function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({ inventory_alerts: true, chat_responses: true, whiteboard_updates: true });
  const [supported, setSupported] = useState(true);

  const checkSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    const sub = await getExistingSubscription();
    setSubscribed(!!sub);
  }, []);

  useEffect(() => {
    checkSubscription();
    loadPreferences();
  }, [checkSubscription]);

  async function loadPreferences() {
    try {
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        setPrefs(data);
      }
    } catch {
      // Use defaults
    }
  }

  async function handleEnable() {
    setLoading(true);
    try {
      const subscription = await subscribeToPush();
      if (subscription) {
        await saveSubscription(subscription);
        setSubscribed(true);
        setPermission(Notification.permission);
      }
    } catch (err) {
      console.error("Failed to enable notifications:", err);
    }
    setLoading(false);
  }

  async function handleDisable() {
    setLoading(true);
    try {
      const sub = await getExistingSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await unsubscribeFromPush();
      }
      setSubscribed(false);
    } catch (err) {
      console.error("Failed to disable notifications:", err);
    }
    setLoading(false);
  }

  async function togglePref(key: keyof Preferences) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);

    await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  }

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Push notifications are not supported in this browser.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Push Notifications</CardTitle>
          <Badge variant={subscribed ? "default" : "secondary"}>
            {subscribed ? "Enabled" : permission === "denied" ? "Blocked" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Get notified about inventory alerts, AI chat responses, and whiteboard
          updates.
        </p>

        {permission === "denied" ? (
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Notifications are blocked. Please enable them in your browser settings.
          </p>
        ) : subscribed ? (
          <Button variant="outline" onClick={handleDisable} disabled={loading}>
            {loading ? "Disabling..." : "Disable Notifications"}
          </Button>
        ) : (
          <Button onClick={handleEnable} disabled={loading}>
            {loading ? "Enabling..." : "Enable Notifications"}
          </Button>
        )}

        {subscribed && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Inventory Alerts</div>
                  <div className="text-xs text-muted-foreground">
                    Low stock and out-of-stock notifications
                  </div>
                </div>
                <button
                  onClick={() => togglePref("inventory_alerts")}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    prefs.inventory_alerts ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      prefs.inventory_alerts ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Chat Responses</div>
                  <div className="text-xs text-muted-foreground">
                    Notify when AI responds while tab is inactive
                  </div>
                </div>
                <button
                  onClick={() => togglePref("chat_responses")}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    prefs.chat_responses ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      prefs.chat_responses ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Whiteboard Updates</div>
                  <div className="text-xs text-muted-foreground">
                    Notify when whiteboard content changes
                  </div>
                </div>
                <button
                  onClick={() => togglePref("whiteboard_updates")}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    prefs.whiteboard_updates ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      prefs.whiteboard_updates ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
