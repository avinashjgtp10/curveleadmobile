export const colors = {
  primary: "#0ea5e9",
  primaryPressed: "#0284c7",
  primarySoft: "#e0f2fe",
  accent: "#0ea5e9",
  background: "#f0f9ff",
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

export function tabBarStyleFor(insetsBottom: number) {
  return {
    position: "absolute" as const,
    height: 64 + Math.max(insetsBottom, 8),
    paddingTop: 8,
    paddingBottom: Math.max(insetsBottom, 8),
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.6)",
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 12,
  };
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
