import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function SettingsScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="⚙️"
      title="Settings"
      description="Profile, change password (POST /api/auth/change-password) for everyone; tenant business info via GET/PUT /api/settings and lead-stage management (admin)."
    />
  );
}
