import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function SignupScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="🆕"
      title="Create Account"
      description="Wire this form (businessName, name, email, phone, password, businessType) to POST /api/auth/signup — starts a 14-day free trial and seeds default lead stages/statuses."
    />
  );
}
