import { Platform } from "react-native";
import { isExpoGo } from "./environment";

/**
 * Fallback for when the backend sends no real push: Android wakes the app roughly every 15+ minutes (the OS decides the
 * exact time) and this checks for new leads / notifications, showing a normal system notification for each one.
 * Real pushes sent by the server are still the only way to be instant.
 */
export const BACKGROUND_CHECK_TASK = "curvelead-background-check";

/* eslint-disable @typescript-eslint/no-require-imports */
// Loaded lazily and guarded: these native modules don't exist in Expo Go, on web, or in a build made before they were added.
function modules() {
  if (isExpoGo || Platform.OS === "web") return null;
  try {
    return { TaskManager: require("expo-task-manager"), BackgroundTask: require("expo-background-task") };
  } catch {
    return null;
  }
}

// Must run at app load (not inside a component) so the task exists when Android starts the app in the background.
const mods = modules();
if (mods && !mods.TaskManager.isTaskDefined(BACKGROUND_CHECK_TASK)) {
  mods.TaskManager.defineTask(BACKGROUND_CHECK_TASK, async () => {
    try {
      const { getStoredToken } = require("@/api/client") as typeof import("@/api/client");
      if (!(await getStoredToken())) return mods.BackgroundTask.BackgroundTaskResult.Success; // signed out
      const { alertNewLeads, alertNewServerNotifications, alertOverdueFollowups } = require("@/api/notifications") as typeof import("@/api/notifications");
      await alertNewLeads().catch(() => {});
      await alertNewServerNotifications().catch(() => {});
      await alertOverdueFollowups().catch(() => {});
      return mods.BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return mods.BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Turns the periodic check on (signed in) or off (signed out). Safe to call repeatedly. */
export async function setBackgroundCheck(enabled: boolean) {
  const m = modules();
  if (!m) return;
  try {
    const registered = await m.TaskManager.isTaskRegisteredAsync(BACKGROUND_CHECK_TASK);
    if (enabled && !registered) await m.BackgroundTask.registerTaskAsync(BACKGROUND_CHECK_TASK, { minimumInterval: 15 });
    if (!enabled && registered) await m.BackgroundTask.unregisterTaskAsync(BACKGROUND_CHECK_TASK);
  } catch (error) {
    console.warn("[push] background check not available", error);
  }
}
