import { IconHome, IconUsers, IconCheck, IconBook, IconGrid } from "@/components/ReferenceIcons";
import React, { useEffect, useRef } from "react";
import { Redirect, router, Tabs } from "expo-router";
// @ts-ignore - AuthContext is a TSX module and this app-level config does not enable JSX for the import check
import { useAuth } from "@/contexts/AuthContext";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, tabBarStyleFor } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/i18n/LanguageContext";

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
const AiTabButton = React.forwardRef<View, { onPress?: (...args: any[]) => void }>(({ onPress }, ref) => {
  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  // Slow breathing glow so the button invites a tap without being distracting.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const springTo = (toValue: number) => Animated.spring(press, { toValue, useNativeDriver: true, speed: 30, bounciness: 8 }).start();

  return React.createElement(
    Pressable,
    {
      ref, onPress, style: styles.aiButtonWrap, hitSlop: 12, accessibilityRole: "button", accessibilityLabel: "AI Tools",
      onPressIn: () => springTo(0.88), onPressOut: () => springTo(1),
    },
    React.createElement(Animated.View, {
      style: [styles.aiButtonGlow, {
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.15] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
      }],
    }),
    React.createElement(
      Animated.View,
      { style: { transform: [{ scale: press }] } },
      React.createElement(
        LinearGradient,
        { colors: ["#06b6d4", "#6366f1", "#d946ef"], start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, style: styles.aiButton },
        React.createElement(Ionicons, { name: "sparkles", size: 24, color: "#fff" })
      )
    )
  );
});

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  if (isLoading) return null;
  if (!user) return React.createElement(Redirect, { href: "/(auth)/login" });

  return React.createElement(
    Tabs,
    {
      // Back from a tab's first screen returns to the tab the user came from (e.g. Home), not the first tab by default.
      backBehavior: "history",
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
          ...(name === "more" ? {
            listeners: {
              tabPress: (event: any) => {
                event.preventDefault();
                router.replace("/(app)/more");
              },
            },
          } : null),
          options: {
            title: t(item.label),
            // Leaving the More tab resets it to the menu, so tapping More never reopens the last feature.
            ...(name === "more" ? { popToTopOnBlur: true } : null),
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
  iconActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  aiButtonWrap: { flex: 1, top: -14, alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 20 },
  aiButtonGlow: { position: "absolute", top: -6, width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(139,92,246,0.18)" },
  aiButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
    shadowColor: "#8b5cf6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 20,
  },
});
