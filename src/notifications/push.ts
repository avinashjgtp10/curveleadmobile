import type * as NotificationsType from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { isExpoGo } from "./environment";

export const ANDROID_CHANNEL_ID = "default";

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
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
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
    const requested = await Notifications.requestPermissionsAsync();
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
