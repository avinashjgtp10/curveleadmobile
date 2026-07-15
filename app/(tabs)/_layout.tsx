import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Text } from "react-native";

export default function TabsLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#6366F1" }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Dashboard", tabBarIcon: () => <Text>🏠</Text> }}
      />
      <Tabs.Screen
        name="leads/index"
        options={{ title: "Leads", tabBarIcon: () => <Text>📋</Text> }}
      />
      <Tabs.Screen
        name="followups"
        options={{ title: "Follow-ups", tabBarIcon: () => <Text>⏰</Text> }}
      />
    </Tabs>
  );
}
