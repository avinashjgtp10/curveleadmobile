import { IconHome, IconUsers, IconCheck, IconBook, IconGrid } from "@/components/ReferenceIcons";
import React from "react";
import { Redirect, router, Tabs } from "expo-router";
// @ts-ignore - AuthContext is a TSX module and this app-level config does not enable JSX for the import check
import { useAuth } from "@/contexts/AuthContext";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, tabBarStyleFor } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NAV_ITEMS = {
  index: { label: "Home", icon: "home-outline", activeIcon: "home" },
  leads: { label: "Leads", icon: "people-outline", activeIcon: "people" },
  followups: { label: "Tasks", icon: "checkmark-circle-outline", activeIcon: "checkmark-circle" },
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

// Floating center action button, raised above the tab bar (mirrors the AI-agent
// shortcut pattern seen in other business apps' bottom nav).
const AiTabButton = React.forwardRef<View, { onPress?: (...args: any[]) => void }>(({ onPress }, ref) =>
  React.createElement(
    Pressable,
    { ref, onPress, style: styles.aiButtonWrap, hitSlop: 12, accessibilityRole: "button", accessibilityLabel: "AI Tools" },
    React.createElement(View, { style: styles.aiButtonGlow }),
    React.createElement(
      LinearGradient,
      { colors: ["#34d399", "#10b981"], start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, style: styles.aiButton },
      React.createElement(Ionicons, { name: "sparkles", size: 22, color: "#fff" })
    )
  )
);

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();

  if (isLoading) return null;
  if (!user) return React.createElement(Redirect, { href: "/(auth)/login" });

  return React.createElement(
    Tabs,
    {
      screenOptions: () => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: tabBarStyleFor(insets.bottom),
      }),
    },
    ...(() => {
      const navScreens = Object.entries(NAV_ITEMS).map(([name, item]) =>
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
            // Default Android ripple isn't clipped to the tab item, so it visibly bleeds
            // outside the bar — suppress it and keep the plain press-in opacity instead.
            // Clipping is scoped to this Pressable only (not tabBarItemStyle globally),
            // so it doesn't cut off the AI button, which pokes above its own item.
            tabBarButton: (props: any) => React.createElement(Pressable, { ...props, style: [props.style, styles.tabItemClip], android_ripple: { color: "transparent" } }),
          },
        })
      );
      // Insert the floating AI button in the center of the bar. It never becomes the active tab — pressing it opens AI
      // Tools directly instead of switching tabs.
      navScreens.splice(
        2,
        0,
        React.createElement(Tabs.Screen, {
          key: "ai",
          name: "ai",
          listeners: {
            tabPress: (event: any) => {
              event.preventDefault();
              router.push("/(app)/more/ai-tools");
            },
          },
          options: {
            title: "AI",
            // Explicitly override the shared tabBarItemStyle — its item wrapper otherwise
            // clips anything (like this button) that pokes above the tab bar's own bounds.
            tabBarItemStyle: styles.aiItem,
            tabBarButton: (props: any) =>
              React.createElement(AiTabButton, { onPress: props.onPress }),
          },
        })
      );
      return navScreens;
    })(),
    React.createElement(Tabs.Screen, {
      name: "notifications",
      options: { href: null },
    }),
    React.createElement(Tabs.Screen, {
      name: "content",
      options: { href: null },
    })
  );
}

const styles = StyleSheet.create({
  item: { borderRadius: 16 },
  tabItemClip: { overflow: "hidden", borderRadius: 16 },
  aiItem: { overflow: "visible" },
  label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginTop: 2 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { backgroundColor: colors.border },
  aiButtonWrap: { flex: 1, top: -14, alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 20 },
  aiButtonGlow: { position: "absolute", top: -5, width: 66, height: 66, borderRadius: 33, backgroundColor: "rgba(16,185,129,0.16)" },
  aiButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 20,
  },
});
