import { BlurView, BlurTargetView } from "expo-blur";
import { IconHome, IconUsers, IconCheck, IconBook, IconGrid } from "@/components/ReferenceIcons";
import React from "react";
import { Redirect, router, Tabs } from "expo-router";
// @ts-ignore - AuthContext is a TSX module and this app-level config does not enable JSX for the import check
import { useAuth } from "@/contexts/AuthContext";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NAV_ITEMS = {
  index: { label: "Home", icon: "home-outline", activeIcon: "home" },
  leads: { label: "Leads", icon: "people-outline", activeIcon: "people" },
  followups: { label: "Tasks", icon: "checkmark-circle-outline", activeIcon: "checkmark-circle" },
  content: { label: "Content", icon: "albums-outline", activeIcon: "albums" },
  more: { label: "More", icon: "grid-outline", activeIcon: "grid" },
} as const;

function TabIcon({ icon, activeIcon, focused }: { icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  const Icon = icon === "home-outline" ? IconHome : icon === "people-outline" ? IconUsers : icon === "checkmark-circle-outline" ? IconCheck : icon === "albums-outline" ? IconBook : IconGrid;
  return React.createElement(
    View,
    { style: [styles.icon, focused && styles.iconActive] },
    React.createElement(Icon, { active: focused })
  );
}

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const blurTargets = React.useRef<Record<string, React.RefObject<View | null>>>({});
  const targetFor = (key: string) => blurTargets.current[key] ?? (blurTargets.current[key] = React.createRef<View>());

  if (isLoading) return null;
  if (!user) return React.createElement(Redirect, { href: "/(auth)/login" });

  return React.createElement(
    Tabs,
    {
      screenLayout: ({ children, route }) => React.createElement(BlurTargetView, { ref: targetFor(route.key), style: { flex: 1 } }, children),
      screenOptions: ({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: [styles.bar, { height: 64 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) }],
        tabBarBackground: () => React.createElement(BlurView, { intensity: 60, tint: "light", blurTarget: targetFor(route.key), blurMethod: "dimezisBlurViewSdk31Plus", style: StyleSheet.absoluteFill }),
      }),
    },
    ...Object.entries(NAV_ITEMS).map(([name, item]) =>
      React.createElement(Tabs.Screen, {
        key: name,
        name,
        // The Leads tab has its own nested stack (list -> detail). Left as-is, switching to
        // another tab and back leaves you stranded on whatever lead-detail screen you were on
        // instead of the leads list — so pressing the tab explicitly resets it to the list.
        ...(name === "leads" ? { listeners: { tabPress: () => router.dismissTo("/(app)/leads") } } : null),
        options: {
          title: item.label,
          tabBarIcon: ({ focused }: { focused: boolean }) =>
            React.createElement(TabIcon, {
              icon: item.icon,
              activeIcon: item.activeIcon,
              focused,
            }),
        },
      })
    ),
    React.createElement(Tabs.Screen, {
      name: "notifications",
      options: { href: null },
    })
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    height: Platform.OS === "ios" ? 88 : 70,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 22 : 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.6)",
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 12,
  },
  item: { borderRadius: 16 },
  label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginTop: 2 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { backgroundColor: colors.primarySoft },
});
