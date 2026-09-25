import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function SecurityScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="🔒"
      title="Security"
      description="Change your password and manage two-factor authentication. Wire to POST /api/auth/change-password."
    />
  );
}
