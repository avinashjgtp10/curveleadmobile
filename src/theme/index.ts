export const colors = {
  primary: "#1D61E7",
  primaryPressed: "#1748B5",
  primarySoft: "#D2E1FF",
  accent: "#1D61E7",
  background: "#F6F6F6",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F1F1",
  text: "#161616",
  textSecondary: "#666565",
  textMuted: "#8A8A8A",
  border: "#BBBBBB",
  borderSoft: "#E5E5E5",
  danger: "#A01439",
  dangerSoft: "#F4BDC5",
  success: "#0B8464",
  successSoft: "#ABFCCC",
  warning: "#BE4D00",
  warningSoft: "#FFB580",
} as const;

export const radii = { sm: 10, md: 14, lg: 18, xl: 24, round: 999 } as const;
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
