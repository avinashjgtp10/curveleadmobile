# Push Notifications (Android) — Implementation Notes

## What's done in this repo

- `expo-notifications` + `expo-device` installed, `expo-notifications` config plugin added to `app.json`.
- `src/notifications/push.ts` — notification handler config, Android channel, permission
  request + Expo push token fetch (`registerForPushNotificationsAsync`).
- `src/notifications/usePushNotifications.ts` — the full lifecycle:
  - registers the token after login, skips re-registering an unchanged token (via
    AsyncStorage), retries failed registration 3x with linear backoff
  - listens for token rotation (`addPushTokenListener`) and re-registers
  - unregisters the token on logout (best-effort, 1 retry) and forgets it locally either way
  - handles taps in foreground/background (`addNotificationResponseReceivedListener`) and
    cold start (`getLastNotificationResponseAsync`), routing through the same logic the
    in-app notification list uses
  - mirrors a push received in the foreground into the existing local notification store,
    so it shows up in the Notifications screen too, not just as a banner
- `src/notifications/navigateToNotification.ts` — routing logic shared between the
  Notifications screen and push taps (previously duplicated).
- `src/api/pushTokens.ts` — client calls for the backend contract below.
- Wired into `app/_layout.tsx` via a `PushNotificationsManager` mounted inside
  `AuthProvider`, only once the app's own startup splash has resolved (so `router.push`
  calls from a cold-start tap are safe).
- Existing notification list UI, icons, and splash screen are untouched.

## Blocking items — I could not complete these without more information

**I have not verified push delivery on a device or emulator.** The client-side plumbing is
in place and typechecks/bundles cleanly, but the following are required before it can work
at all, and none of them exist in this repo:

### 1. `google-services.json` is missing
You mentioned it's already in the project root, but it isn't — I checked. I also did not
add `expo.android.googleServicesFile` to `app.json`, because pointing it at a file that
doesn't exist would break every build (`expo prebuild` / EAS Build fails immediately on a
missing file). Once you have the real file:

```json
"android": {
  "package": "com.curvelead.mobile",
  "googleServicesFile": "./google-services.json",
  ...
}
```

### 2. Package name mismatch
You said the Android package is `com.curvelead`. The actual package in `app.json` (and
presumably what's registered with app stores/existing installs) is **`com.curvelead.mobile`**.
`google-services.json` is tied to one specific package name in Firebase — if the file you
get is registered under `com.curvelead` and the app ships as `com.curvelead.mobile` (or vice
versa), the Google Services Gradle plugin will fail the build with "No matching client found
for package name". Please confirm which one is correct before generating/adding the file —
I have not changed `android.package`, since that's a decision with real consequences
(Play Store listing identity, existing installs) that isn't mine to make silently.

### 3. Backend has no push-token storage or send capability
This repository is a pure API client (everything hits `https://curvelead.com/api`) — there
is no backend code here to inspect or modify. `src/api/pushTokens.ts` calls a contract that
**does not exist yet** server-side:

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/notifications/push-tokens` | `{ token, platform: "android" \| "ios", device_id? }` | Upsert this device's Expo push token for the authenticated user |
| `DELETE` | `/notifications/push-tokens` | `{ token }` | Remove one token (e.g. on logout) without touching other devices/users |

Until this exists, `registerPushToken`/`unregisterPushToken` will 404 — the app handles
that gracefully (registration just silently fails and retries later), but **no push will
ever be delivered** until the backend can (a) store tokens per user and (b) actually send
via Expo's Push API (`https://exp.host/--/api/v2/push/send`) or FCM directly, using each
recipient's stored token(s). If you have backend code elsewhere, share it and I can wire
this in properly instead of guessing.

## Configuring FCM (V1) credentials in EAS

Push delivery to Android goes through Firebase Cloud Messaging. Expo's push service needs
a **Firebase service-account key** to send on your behalf — this is separate from
`google-services.json` (which is a client config file) and must never be committed to the
repo or shipped in the app bundle.

1. In the [Firebase console](https://console.firebase.google.com), open your project →
   **Project settings → Service accounts → Generate new private key**. This downloads a
   JSON file — treat it like a password.
2. Upload it to EAS (from this project directory), logged in as an account with access to
   this EAS project:
   ```
   eas credentials
   ```
   Choose **Android** → select the build profile → **Push Notifications: Manage your FCM
   V1 service account key** → **Set up a new key** → point it at the downloaded JSON.
   EAS stores it encrypted server-side; it is never written into this repo.
3. Delete the local copy of the downloaded JSON once it's uploaded, or keep it somewhere
   outside the repo (e.g. a password manager) — do not add it to `git`.

## Build instructions

Because `expo-notifications` adds native config (permissions, the notification icon/color,
the Android channel), a fresh native build is required — this cannot be tested in a
generic Expo Go install if you've been using that, since notification icon/color config
requires a custom dev client:

```
npx expo prebuild --clean       # only if you want to inspect the generated android/ project
eas build --platform android --profile development   # or preview/production per eas.json
```

(We covered EAS login earlier in this conversation — you'll need to be logged in via
`eas login` for this to run.)

## Test checklist (do not consider this "done" until these pass on a real Android build)

- [ ] **Permission prompt** appears on first launch after login (Android 13+ requires
      explicit `POST_NOTIFICATIONS` permission — the plugin adds this automatically).
- [ ] **Permission granted** → an Expo push token is fetched and `POST
      /notifications/push-tokens` is called (check backend logs / DB row).
- [ ] **Permission denied** → app does not crash or loop; no token is sent; user can still
      use the app normally.
- [ ] **Foreground delivery**: send a test push while the app is open → banner appears,
      and the notification also shows up in the in-app Notifications screen.
- [ ] **Background delivery**: background the app (don't kill it), send a push, tap the
      system notification → app comes to foreground and navigates to the right screen
      (lead detail if `lead_id` is present, follow-ups if `type: "followup"`, otherwise the
      Notifications screen).
- [ ] **Closed-app / cold start**: force-stop the app, send a push, tap it → app launches
      and still navigates to the correct screen (this exercises
      `getLastNotificationResponseAsync`, not the live listener).
- [ ] **Logout**: log out, then attempt to send a push to the token that was registered →
      it should no longer be deliverable once the backend honors the `DELETE` call; verify
      the token row is actually removed/deactivated server-side.
- [ ] **Re-login on the same device**: confirms a fresh token registration happens and
      isn't skipped by the "already registered" de-dupe logic from a stale AsyncStorage
      entry.
- [ ] **Token rotation** (harder to force manually): if you can trigger it, confirm
      `addPushTokenListener` re-registers the new token.

I have not run any of these — they require a native Android build, a working backend
endpoint, and valid FCM credentials, none of which exist yet in this environment.
