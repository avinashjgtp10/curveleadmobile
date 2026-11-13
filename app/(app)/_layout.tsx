import { IconHome, IconUsers, IconCheck, IconBook, IconGrid } from "@/components/ReferenceIcons";
import React, { useRef } from "react";
import { Redirect, router, Tabs } from "expo-router";
// @ts-ignore - AuthContext is a TSX module and this app-level config does not enable JSX for the import check
import { useAuth } from "@/contexts/AuthContext";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { colors, tabBarStyleFor, TAB_BAR_HEIGHT } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/i18n/LanguageContext";
import { homeOrigin } from "@/navigation/homeOrigin";

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

// The bar's shape: a white rounded pill with a smooth dip at the centre for the raised Add lead button.
function NotchedBackground() {
  const [width, setWidth] = React.useState(0);
  const H = TAB_BAR_HEIGHT;
  const R = 26;
  const cx = width / 2;
  const shape = width
    ? `M ${R} 0 H ${cx - 54} C ${cx - 32} 0 ${cx - 38} 34 ${cx} 34 C ${cx + 38} 34 ${cx + 32} 0 ${cx + 54} 0 H ${width - R} Q ${width} 0 ${width} ${R} V ${H - R} Q ${width} ${H} ${width - R} ${H} H ${R} Q 0 ${H} 0 ${H - R} V ${R} Q 0 0 ${R} 0 Z`
    : "";
  return React.createElement(
    View,
    { style: StyleSheet.absoluteFill, pointerEvents: "none", onLayout: (event: any) => setWidth(event.nativeEvent.layout.width) },
    width
      ? React.createElement(
          Svg,
          { width, height: H + 8 },
          // A soft shadow: the same shape, nudged down and tinted.
          React.createElement(Path, { d: shape, fill: "rgba(15,23,42,0.08)", transform: "translate(0 4)" }),
          React.createElement(Path, { d: shape, fill: "#ffffff", stroke: "#e4e9f3", strokeWidth: 1 })
        )
      : null
  );
}

// Tab label with a short line under the active tab.
function TabLabel({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  return React.createElement(
    View,
    { style: styles.labelWrap },
    React.createElement(Text, { style: [styles.label, { color }] }, label),
    React.createElement(View, { style: [styles.activeLine, focused && styles.activeLineOn] })
  );
}

// Floating center action button, raised above the tab bar (mirrors the AI-agent
// shortcut pattern seen in other business apps' bottom nav).
const AiTabButton = React.forwardRef<View, { onPress?: (...args: any[]) => void }>(({ onPress }, ref) => {
  const press = useRef(new Animated.Value(1)).current;

  const springTo = (toValue: number) => Animated.spring(press, { toValue, useNativeDriver: true, speed: 30, bounciness: 8 }).start();

  return React.createElement(
    Pressable,
    {
      ref, onPress, style: styles.aiButtonWrap, hitSlop: 12, accessibilityRole: "button", accessibilityLabel: "Add lead",
      onPressIn: () => springTo(0.88), onPressOut: () => springTo(1),
    },
    React.createElement(
      Animated.View,
      { style: { transform: [{ scale: press }] } },
      React.createElement(
        View,
        { style: styles.aiButton },
        React.createElement(Ionicons, { name: "person-add", size: 24, color: "#fff" })
      )
    ),
    React.createElement(Text, { style: styles.aiLabel }, "Add lead")
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
        tabBarActiveTintColor: "#0e8a9b",
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarBackground: () => React.createElement(NotchedBackground),
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
                // Tapping More is not a Back press: without this the feature screen being replaced would send the user Home.
                homeOrigin.current = false;
                router.replace("/(app)/more");
              },
            },
          } : null),
          options: {
            title: t(item.label),
            tabBarLabel: ({ focused, color }: { focused: boolean; color: unknown }) => React.createElement(TabLabel, { label: t(item.label), focused, color: String(color) }),
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
              router.push("/(app)/leads/new");
            },
          },
          options: {
            title: "Add lead",
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
  label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  labelWrap: { alignItems: "center", marginTop: 1 },
  activeLine: { width: 22, height: 3, borderRadius: 2, marginTop: 3, backgroundColor: "transparent" },
  activeLineOn: { backgroundColor: "#0e8a9b" },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: {},
  aiButtonWrap: { flex: 1, top: -30, alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 20 },
  aiLabel: { color: "#2457e6", fontSize: 10, fontFamily: "Inter_700Bold", marginTop: 3 },
  aiButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
    backgroundColor: "#2457e6",
    shadowColor: "#2457e6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 20,
  },
});
