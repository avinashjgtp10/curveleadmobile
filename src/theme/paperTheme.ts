import { MD3LightTheme } from "react-native-paper";
import { colors } from "./index";

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 4,
  fonts: Object.fromEntries(Object.entries(MD3LightTheme.fonts).map(([key, font]) => [key, { ...font, fontFamily: "Inter_400Regular" }])) as typeof MD3LightTheme.fonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.surface,
    primaryContainer: colors.primarySoft,
    onPrimaryContainer: colors.primary,
    background: colors.background,
    onBackground: colors.text,
    surface: colors.surface,
    onSurface: colors.text,
    surfaceVariant: colors.surfaceMuted,
    onSurfaceVariant: colors.textSecondary,
    outline: colors.border,
    outlineVariant: colors.borderSoft,
    error: colors.danger,
    onError: colors.surface,
    errorContainer: colors.dangerSoft,
    onErrorContainer: colors.danger,
  },
};
