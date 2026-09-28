import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

export const ANDROID_CHANNEL_ID = "default";

/** Foreground behavior: show an alert/banner and play a sound while the app is open. */
export function configureNotificationHandler() {
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
  if (Platform.OS !== "android") return;
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
  | { status: "unsupported" }; // simulator/emulator without Google Play services, or web

/**
 * Requests notification permission (if not already decided) and returns an Expo push
 * token. Safe to call multiple times — it won't re-prompt if the user already
 * granted/denied. Returns "unsupported" on simulators, which don't support push.
 */
export async function registerForPushNotificationsAsync(): Promise<PushPermissionResult> {
  if (!Device.isDevice) {
    return { status: "unsupported" };
  }

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
