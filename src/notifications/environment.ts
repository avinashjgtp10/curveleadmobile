import Constants from "expo-constants";

/**
 * True only in Expo Go (not in a custom dev-client or standalone/production build).
 * expo-notifications' remote-push APIs were removed from Expo Go in SDK 53 and throw
 * as soon as the native module is touched on Android — so every push-notification
 * entry point in this app must check this first and no-op instead of importing/calling
 * into expo-notifications at all.
 */
export const isExpoGo = Constants.appOwnership === "expo";
