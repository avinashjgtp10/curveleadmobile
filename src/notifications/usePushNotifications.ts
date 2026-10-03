import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import type * as NotificationsType from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { registerPushToken, unregisterPushToken } from "@/api/pushTokens";
import { saveIncomingPushNotification } from "@/api/notifications";
import { configureNotificationHandler, registerForPushNotificationsAsync } from "./push";
import { navigateToNotification, NotificationRouteData } from "./navigateToNotification";
import { withRetry } from "./retry";
import { isExpoGo } from "./environment";

const LAST_REGISTERED_TOKEN_KEY = "curvelead_push_token";
const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

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

async function registerAndPersist(token: string) {
  const lastToken = await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
  if (lastToken === token) return; // already registered this exact token — avoid a redundant call
  const ok = await withRetry(() => registerPushToken(token, PLATFORM));
  if (ok) await AsyncStorage.setItem(LAST_REGISTERED_TOKEN_KEY, token);
  // If registration failed after retries, we deliberately don't persist the token, so the
  // next app foreground/login retries again instead of silently giving up forever.
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

    let cancelled = false;
    (async () => {
      try {
        const result = await registerForPushNotificationsAsync();
        if (cancelled) return;
        if (result.status === "granted") {
          await registerAndPersist(result.token);
        }
        // "denied" and "unsupported" are expected outcomes (user declined, or running on
        // a simulator/emulator without push support) — nothing to do for either.
      } catch (error) {
        console.warn("[push] registration failed", error);
      }
    })();

    // Fires if the underlying push token rotates while the app is running (rare, but
    // documented as possible by Expo — e.g. after a Google Play Services update).
    const tokenSub = loadNotifications().addPushTokenListener((event) => {
      registerAndPersist(event.data).catch(() => {});
    });

    return () => {
      cancelled = true;
      tokenSub.remove();
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
