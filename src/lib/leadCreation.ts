import { Alert, Platform, ToastAndroid } from "react-native";

// The Add lead form saves in the background after it closes. Screens that show leads listen here to refresh once the lead exists.
const listeners = new Set<() => void>();

export function onLeadCreated(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitLeadCreated() {
  listeners.forEach((listener) => listener());
}

// Scheduling a follow-up completes the lead's older pending ones on the server. The Tasks screen normally refreshes only the days
// around today when it is shown again, so it is told here to also re-read the older overdue history once.
let followupsChanged = false;
export function markFollowupsChanged() { followupsChanged = true; }
export function consumeFollowupsChanged() { const changed = followupsChanged; followupsChanged = false; return changed; }

// The lead's page tells the list about an edit the moment it happens, so the list shows it at once instead of after its own refresh.
export type LeadPatch = { id: string } & Record<string, unknown>;
const changeListeners = new Set<(patch: LeadPatch) => void>();

export function onLeadChanged(listener: (patch: LeadPatch) => void) {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

export function emitLeadChanged(patch: LeadPatch) {
  changeListeners.forEach((listener) => listener(patch));
}

/** A short message that doesn't block the screen (a toast on Android, a plain alert elsewhere). */
export function showToast(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
