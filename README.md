# CurveLead Mobile (Expo SDK 54)

Fresh start, built as requested on **Expo SDK 54** (React Native 0.81, React 19.1, New
Architecture on by default). This SDK was chosen deliberately over 55/56-beta since it's the
version Expo Go on the App Store / Play Store currently targets — best for fast iteration
before you move to a dev build for release.

## What's here

- **expo-router** (file-based routing) — `app/(auth)/login.tsx`, `app/(tabs)/*`
- **Auth** — token stored in `expo-secure-store`, `AuthContext` gates the tabs, redirects to
  login on 401
- **Leads** — list screen (status pills, pull to refresh), detail screen (status update,
  one-tap call / WhatsApp using the lead's phone number)
- **Follow-ups** — stub screen, ready to wire once you have an aggregated endpoint
- **API client** — `src/api/client.ts` (axios, auto-attaches bearer token), `src/api/leads.ts`
  (typed calls matching your web app's `LeadsPage.jsx` shape)

## Before you run it

1. `npm install`
2. In `app.json` → `extra.apiUrlDev`, replace `CHANGE_ME` with the actual port your
   `curveleadbackend` Express API listens on (I didn't want to guess and point this at the
   wrong service).
3. Confirm the route paths in `src/api/leads.ts` and `AuthContext.tsx`
   (`/auth/login`, `/auth/me`, `/leads`, `/leads/:id/followups`) actually match your Express
   routes — adjust if your backend uses different naming.
4. `npx expo start` → scan the QR with Expo Go (SDK 54 build) or run `npm run ios` / `npm run
   android` with a simulator.

## Deliberate choices for V1

- **No offline cache yet** — added zustand as a dependency since state will grow past what
  local component state can handle once follow-ups, staff assignment, and campaign data land,
  but I didn't wire a store yet to keep this reviewable.
- **Dark theme only** — matches a CRM-for-fieldwork feel (sales reps checking leads between
  calls, often outdoors). Easy to add light mode later via `useColorScheme`.
- **No WhatsApp inbox screen yet** — that's a bigger feature (needs real-time updates,
  probably via WebSocket or polling) and deserves its own design pass rather than a stub.

## Suggested next steps, in order

1. Point the API client at the real backend, confirm login works end-to-end.
2. Build the aggregated follow-ups endpoint on the backend, then wire the Follow-ups tab.
3. Add push notifications (`expo-notifications`) for follow-up reminders — this is the single
   highest-leverage mobile-specific feature for a sales CRM.
4. Staff/assignment screen once you're ready for multi-user teams to use this in the field.
