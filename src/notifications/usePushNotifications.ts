import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import type * as NotificationsType from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { unregisterPushToken } from "@/api/pushTokens";
import { rateLimitRemainingMs } from "@/api/client";
import { saveIncomingPushNotification } from "@/api/notifications";
import { configureNotificationHandler, getNotificationPermission } from "./push";
import { LAST_REGISTERED_TOKEN_KEY, getPushStatus, registerDevice } from "./pushStatus";
import { navigateToNotification, NotificationRouteData } from "./navigateToNotification";
import { withRetry } from "./retry";
import { isExpoGo } from "./environment";

// Register the foreground handler as soon as the app loads, not after the first screen mounts: a push that arrives
// during start-up would otherwise fall back to iOS's default and show no banner.
configureNotificationHandler();

/** Must stay lazy — see push.ts: importing expo-notifications statically crashes Expo Go on Android. */
function loadNotifications(): typeof NotificationsType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications");
}

function parseNotificationData(raw: unknown): NotificationRouteData {
  if (!raw || typeof raw !== "object") return {};
  const data = raw as Record<string, unknown>;
  // Backends often send ids/phones as numbers — accept both instead of silently dropping them.
  const text = (value: unknown) =>
    typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
  return {
    type: text(data.type),
    lead_id: text(data.lead_id),
    lead_name: text(data.lead_name),
    lead_phone: text(data.lead_phone),
    lead_stage: text(data.lead_stage),
  };
}

/** Routes a tapped push; pushes with no known destination open the Notifications list. */
function handleNotificationTap(data: NotificationRouteData) {
  if (!navigateToNotification(data)) router.push("/(app)/notifications");
}

/**
 * Owns the whole push-notification lifecycle: permission + token registration on login,
 * token-refresh handling, unregistration on logout, and tap navigation for
 * foreground/background/cold-start notifications.
 *
 * No-ops entirely in Expo Go (remote push isn't supported there as of SDK 53) — every
 * effect below checks `isExpoGo` before touching expo-notifications.
 *
 * Mount this once, inside the authenticated navigation tree, only once the app's router
 * is actually ready to navigate (e.g. after your splash/startup gate has resolved) —
 * navigating before that can silently no-op or throw in expo-router.
 */
export function usePushNotifications(navigationReady: boolean) {
  const { user, isLoading } = useAuth();
  const coldStartHandled = useRef(false);

  // Foreground handler + Android channel: configure once, independent of auth state.
  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // Registration lifecycle, tied to login/logout.
  useEffect(() => {
    if (isExpoGo || isLoading) return;

    if (!user) {
      // Logged out: best-effort unregister this device's token so the backend stops
      // sending pushes to a session that's no longer signed in, then forget it locally
      // regardless of whether the network call succeeded (don't get stuck retrying
      // a token tied to a user who's no longer logged in on this device).
      (async () => {
        const lastToken = await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
        if (lastToken) {
          await withRetry(() => unregisterPushToken(lastToken), 1).catch(() => {});
          await AsyncStorage.removeItem(LAST_REGISTERED_TOKEN_KEY);
        }
      })();
      return;
    }

    // The outcome (registered / denied / failed and why) is recorded for the Notification Settings screen.
    // Started a few seconds late, and again after a rate-limit wait, so it doesn't join the burst of calls Home makes on
    // opening (the server answers a burst with "Too many requests").
    let cancelled = false;
    const start = (delay: number) => setTimeout(() => {
      if (cancelled) return;
      const blocked = rateLimitRemainingMs();
      if (blocked) { timer = start(blocked + 500); return; }
      registerDevice().catch((error) => console.warn("[push] registration failed", error));
    }, delay);
    let timer = start(4000);

    // Fires if the underlying push token rotates while the app is running (rare, but
    // documented as possible by Expo — e.g. after a Google Play Services update).
    const tokenSub = loadNotifications().addPushTokenListener(() => {
      registerDevice().catch(() => {});
    });

    // Registration otherwise runs only at login / app start. If it failed then (server briefly down, rate limit) or the
    // person turned notifications on later in the phone's settings, this phone would stay unregistered until a restart.
    const appSub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || cancelled || rateLimitRemainingMs()) return;
      const status = await getPushStatus();
      if (!status || status.state === "registered" || status.state === "unsupported") return;
      // Only when the permission is now on: asking again while it's off would just nag.
      if ((await getNotificationPermission()) !== "granted") return;
      registerDevice().catch(() => {});
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      tokenSub.remove();
      appSub.remove();
    };
  }, [user, isLoading]);

  // Tap handling: foreground taps and background taps both fire this listener.
  useEffect(() => {
    if (isExpoGo || !navigationReady) return;
    const sub = loadNotifications().addNotificationResponseReceivedListener((response) => {
      const data = parseNotificationData(response.notification.request.content.data);
      handleNotificationTap(data);
    });
    return () => sub.remove();
  }, [navigationReady]);

  // Cold start: the app was launched BY tapping a notification (it wasn't already running).
  useEffect(() => {
    // Wait for a signed-in user: routing into the app before login just gets bounced to the login screen.
    if (isExpoGo || !navigationReady || isLoading || !user || coldStartHandled.current) return;
    coldStartHandled.current = true;
    loadNotifications().getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = parseNotificationData(response.notification.request.content.data);
      handleNotificationTap(data);
    });
  }, [navigationReady, isLoading, user]);

  // Foreground delivery: mirror it into the same local list the Notifications screen reads,
  // so a push that arrives while the app is open shows up there too, not just as a banner.
  useEffect(() => {
    if (isExpoGo) return;
    const sub = loadNotifications().addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      // Shown by this app itself (see presentLocalNotification) — the caller already saved it.
      if ((content.data as Record<string, unknown> | undefined)?.local === "1") return;
      const data = parseNotificationData(content.data);
      saveIncomingPushNotification({
        title: content.title || "Notification",
        message: content.body || undefined,
        type: data.type,
        lead_id: data.lead_id,
        lead_name: data.lead_name,
        lead_phone: data.lead_phone,
        lead_stage: data.lead_stage,
      }).catch(() => {});
    });
    return () => sub.remove();
  }, []);
}
