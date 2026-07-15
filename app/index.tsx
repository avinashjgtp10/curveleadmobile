import { Redirect } from "expo-router";

// expo-router needs a root index; auth gating happens inside (tabs)/_layout.tsx
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
