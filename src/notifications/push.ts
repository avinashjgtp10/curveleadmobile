import type * as NotificationsType from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { isExpoGo } from "./environment";

// iOS asks for each kind separately. Asking for alert, badge and sound explicitly means a TestFlight tester who accepts
// the prompt gets banners and sound, not a half-granted permission.
const IOS_PERMISSIONS = { ios: { allowAlert: true, allowBadge: true, allowSound: true } };

export const ANDROID_CHANNEL_ID = "default";
export const ALERT_CHANNEL_ID = "lead-alerts";

/**
 * expo-notifications' remote-push code throws as soon as it's touched in Expo Go on
 * Android (SDK 53+) — so it must never be statically imported. Every caller in this
 * file checks `isExpoGo` before calling this.
 */
function loadNotifications(): typeof NotificationsType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications");
}

/** Foreground behavior: show an alert/banner and play a sound while the app is open. */
export function configureNotificationHandler() {
  if (isExpoGo) return;
  const Notifications = loadNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const content = notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      // iOS only rings for a push whose payload carries a sound; one sent without it shows a silent banner while the
      // app is open. Swallow that banner and show the same alert again as a local notification that does ring.
      const silentRemotePush =
        Platform.OS === "ios" && (notification.request.trigger as { type?: string } | null)?.type === "push" && !content.sound && data.local !== "1";
      if (silentRemotePush) {
        Notifications.scheduleNotificationAsync({
          content: { title: content.title ?? undefined, body: content.body ?? undefined, sound: "default", data: { ...data, local: "1" } },
          trigger: null,
        }).catch(() => {});
        return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
      }
      return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true };
    },
  });
}

/** Shows how many notifications are unread as the number on the app icon (iPhone and most Android launchers). */
export async function setAppBadge(count: number) {
  if (isExpoGo || Platform.OS === "web") return;
  try {
    await loadNotifications().setBadgeCountAsync(Math.max(0, Math.round(count)));
  } catch {
    // The phone may not allow badges (or the permission was refused) - the number is only a nicety.
  }
}

export async function ensureAndroidChannel() {
  if (isExpoGo || Platform.OS !== "android") return;
  const Notifications = loadNotifications();
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0ea5e9",
  });
  // Android freezes a channel's sound once created, so alerts that must ring use their own channel.
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: "Lead alerts",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0ea5e9",
  });
}

export const NOTIFICATION_PREFS_CACHE_KEY = "curvelead_notification_prefs";

// Local alert types that belong to one of the Notification Settings switches. Other types (deleted,
// message sent, test) are the person's own actions and always show.
const TYPE_TO_GROUP: Record<string, string> = {
  lead_created: "new_leads",
  followup: "followups",
  followup_due: "followups",
};

/** Honors the person's Notification Settings switches (cached on this phone by the settings screen). */
async function isAlertEnabled(type?: string) {
  const group = type ? TYPE_TO_GROUP[type] : undefined;
  if (!group) return true;
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_CACHE_KEY);
    const prefs = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    return prefs[group] !== false;
  } catch {
    return true;
  }
}

/**
 * Shows a real system notification (banner + sound) right now, for events that happen on this
 * device — e.g. a lead was just created. Skips silently in Expo Go, on web, or if the user
 * hasn't granted notification permission. `data.local` marks it so the in-app list doesn't
 * mirror it a second time (it's already saved there by the caller).
 */
export async function presentLocalNotification(title: string, body: string | undefined, data: Record<string, string | undefined> = {}) {
  if (isExpoGo || Platform.OS === "web") {
    console.warn("[push] local alert skipped: not supported in Expo Go / web — use a development build");
    return;
  }
  if (!(await isAlertEnabled(data.type))) return;
  try {
    const Notifications = loadNotifications();
    await ensureAndroidChannel();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync(IOS_PERMISSIONS)).status;
    if (status !== "granted") {
      console.warn("[push] local alert skipped: notification permission is", status, "— enable it in Android Settings > Apps > CurveLead > Notifications");
      return;
    }
    const cleanData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default", data: { ...cleanData, local: "1" } },
      trigger: Platform.OS === "android" ? { channelId: ALERT_CHANNEL_ID } : null,
    });
  } catch (error) {
    // Most likely cause: the installed dev build predates the expo-notifications native module — rebuild it.
    console.warn("[push] could not show local notification (rebuild the dev client if the native module is missing):", error);
  }
}

export type NotificationPermission = "granted" | "denied" | "undetermined" | "unsupported";

/** Current OS-level notification permission. "unsupported" in Expo Go and on web. */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (isExpoGo || Platform.OS === "web") return "unsupported";
  try {
    const { status } = await loadNotifications().getPermissionsAsync();
    return status;
  } catch {
    return "unsupported";
  }
}

/** Asks for permission (the OS only shows its prompt while undecided) and makes sure the Android channels exist. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isExpoGo || Platform.OS === "web") return "unsupported";
  try {
    const Notifications = loadNotifications();
    await ensureAndroidChannel();
    const { status } = await Notifications.requestPermissionsAsync(IOS_PERMISSIONS);
    return status;
  } catch {
    return "unsupported";
  }
}

export type PushPermissionResult =
  | { status: "granted"; token: string }
  | { status: "denied" }
  | { status: "unsupported" }; // simulator/emulator, Expo Go, or web

/**
 * Requests notification permission (if not already decided) and returns an Expo push
 * token. Safe to call multiple times — it won't re-prompt if the user already
 * granted/denied. Returns "unsupported" on Expo Go and simulators, neither of which
 * support remote push.
 */
export async function registerForPushNotificationsAsync(): Promise<PushPermissionResult> {
  if (isExpoGo || !Device.isDevice) {
    return { status: "unsupported" };
  }

  const Notifications = loadNotifications();
  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync(IOS_PERMISSIONS);
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") {
    return { status: "denied" };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    throw new Error("Missing EAS projectId (expo.extra.eas.projectId) — required to fetch an Expo push token.");
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return { status: "granted", token };
}
