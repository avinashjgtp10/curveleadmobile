import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function NotificationsScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="🔔"
      title="Notifications"
      description="Wire to GET /api/notifications, GET /count, PUT /read-all, PUT /:id/read. Push notifications need a new backend device_tokens endpoint (see mobile-app-requirements.md §8) — register the Expo push token after login."
    />
  );
}
