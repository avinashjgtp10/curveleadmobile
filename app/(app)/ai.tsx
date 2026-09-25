import { Redirect } from "expo-router";

// Center tab bar button intercepts tabPress and navigates here directly;
// this route only serves as a fallback for deep links.
export default function AiRedirect() {
  return <Redirect href="/(app)/more/ai-tools" />;
}
