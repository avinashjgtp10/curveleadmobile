import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

const NAV_ITEMS = {
  index: { label: "Home", icon: "home-outline", activeIcon: "home" },
  leads: { label: "Leads", icon: "people-outline", activeIcon: "people" },
  followups: { label: "Tasks", icon: "checkmark-circle-outline", activeIcon: "checkmark-circle" },
  content: { label: "Content", icon: "albums-outline", activeIcon: "albums" },
  more: { label: "More", icon: "grid-outline", activeIcon: "grid" },
} as const;

function TabIcon({ icon, activeIcon, focused }: { icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  return (
    <View style={[styles.icon, focused && styles.iconActive]}>
      <Ionicons name={focused ? activeIcon : icon} size={21} color={focused ? colors.primary : colors.textMuted} />
    </View>
  );
}

export default function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: styles.bar,
      }}
    >
      {Object.entries(NAV_ITEMS).map(([name, item]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: item.label,
            tabBarIcon: ({ focused }) => <TabIcon icon={item.icon} activeIcon={item.activeIcon} focused={focused} />,
          }}
        />
      ))}
      {/* Reachable via header bell icon, not a tab */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    height: Platform.OS === "ios" ? 88 : 70,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 22 : 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 12,
  },
  item: { borderRadius: 16 },
  label: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  icon: {
    width: 34,
    height: 28,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { backgroundColor: colors.primarySoft },
});
