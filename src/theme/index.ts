import { Platform } from "react-native";

export const colors = {
  primary: "#0ea5e9",
  primaryPressed: "#0284c7",
  primarySoft: "#e0f2fe",
  accent: "#0ea5e9",
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#f1f5f9",
  text: "#1e293b",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  border: "#bae6fd",
  borderSoft: "#e0f2fe",
  danger: "#e11d48",
  dangerSoft: "#fff1f2",
  success: "#059669",
  successSoft: "#d1fae5",
  warning: "#d97706",
  warningSoft: "#fef3c7",
} as const;

// The bottom bar floats above the screen's edge as a rounded pill (its white shape, with a dip around the centre
// button, is drawn by the tab layout's background).
export const TAB_BAR_HEIGHT = 64;

export const tabBarBase = {
  position: "absolute" as const,
  left: 14,
  right: 14,
  height: TAB_BAR_HEIGHT,
  paddingTop: 8,
  paddingBottom: 8,
  paddingHorizontal: 4,
  backgroundColor: "transparent",
  borderTopWidth: 0,
  elevation: 0,
};

export function tabBarStyleFor(insetsBottom: number) {
  return { ...tabBarBase, bottom: Math.max(insetsBottom, 8) + 4 };
}

export const radii = { sm: 10, md: 14, lg: 16, xl: 24, round: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const shadows = {
  card: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
} as const;
