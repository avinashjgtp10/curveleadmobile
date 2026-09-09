import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function ForgotPasswordScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="🔑"
      title="Forgot Password"
      description="Wire this to POST /api/auth/forgot-password. Reset link uses a web URL (FRONTEND_URL/reset-password?token=...) — confirm it should deep-link back into the app via curvelead:// scheme."
    />
  );
}
