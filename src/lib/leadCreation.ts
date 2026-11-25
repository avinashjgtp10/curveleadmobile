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

/** A short message that doesn't block the screen (a toast on Android, a plain alert elsewhere). */
export function showToast(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
