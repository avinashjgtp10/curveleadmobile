import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function ResetPasswordScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="🔑"
      title="Reset Password"
      description="Wire this to POST /api/auth/reset-password with the token from the deep link/reset email."
    />
  );
}
