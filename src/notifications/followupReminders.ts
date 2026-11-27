import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { isExpoGo } from "./environment";
import { ALERT_CHANNEL_ID, ensureAndroidChannel, getNotificationPermission, isAlertEnabled } from "./push";

/**
 * A reminder the phone itself rings at the follow-up's time, so it shows even when the app is closed and the server sends no
 * push. The notification id is remembered per follow-up so completing, cancelling or rescheduling it can take the reminder away.
 */
const KEY = "curvelead_followup_reminders";

/* eslint-disable @typescript-eslint/no-require-imports */
function notifications(): typeof import("expo-notifications") {
  return require("expo-notifications");
}

async function readMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Reads and writes of the map run one after another, so two follow-ups saved together can't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

export interface FollowupReminder {
  followupId: string;
  leadId: string;
  leadName: string;
  leadPhone?: string;
  leadStage?: string;
  at: Date;
  type?: string;
}

export async function cancelFollowupReminder(followupId: string) {
  if (isExpoGo || Platform.OS === "web" || !followupId) return;
  await serialized(async () => {
    const map = await readMap();
    const notificationId = map[followupId];
    if (!notificationId) return;
    try { await notifications().cancelScheduledNotificationAsync(notificationId); } catch { /* already gone */ }
    delete map[followupId];
    await AsyncStorage.setItem(KEY, JSON.stringify(map)).catch(() => {});
  }).catch(() => {});
}

export async function scheduleFollowupReminder(input: FollowupReminder) {
  if (isExpoGo || Platform.OS === "web" || !input.followupId || input.followupId.startsWith("temp-")) return;
  if (input.at.getTime() <= Date.now() + 5_000) return; // already due: nothing to wait for
  try {
    if (!(await isAlertEnabled("followup_due"))) return;
    if ((await getNotificationPermission()) !== "granted") return;
    await ensureAndroidChannel();
    await cancelFollowupReminder(input.followupId); // rescheduling replaces the old reminder
    const Notifications = notifications();
    const kind = input.type ? `${input.type.charAt(0).toUpperCase()}${input.type.slice(1)} ` : "";
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Follow-up due - ${input.leadName}`,
        body: `${kind}follow-up is due now.`,
        sound: "default",
        data: {
          type: "followup_due", lead_id: input.leadId, lead_name: input.leadName,
          ...(input.leadPhone ? { lead_phone: input.leadPhone } : {}), ...(input.leadStage ? { lead_stage: input.leadStage } : {}),
        },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: input.at, ...(Platform.OS === "android" ? { channelId: ALERT_CHANNEL_ID } : {}) },
    });
    await serialized(async () => {
      const map = await readMap();
      map[input.followupId] = notificationId;
      await AsyncStorage.setItem(KEY, JSON.stringify(map)).catch(() => {});
    });
  } catch (error) {
    console.warn("[push] could not schedule the follow-up reminder", error);
  }
}

/** Signing out: the next person on this phone must not get reminders for the previous person's follow-ups. */
export async function clearFollowupReminders() {
  if (isExpoGo || Platform.OS === "web") return;
  await serialized(async () => {
    const map = await readMap();
    for (const notificationId of Object.values(map)) {
      try { await notifications().cancelScheduledNotificationAsync(notificationId); } catch { /* already gone */ }
    }
    await AsyncStorage.removeItem(KEY).catch(() => {});
  }).catch(() => {});
}
