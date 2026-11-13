import React from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

export const AUTH_NAVY = "#1d4ed8";

// The shared look of the signed-out help screens: lavender backdrop, back button, logo, title and a terms footer.
export function AuthShell({ title, subtitle, onBack, children }: {
  title: string; subtitle: string; onBack?: () => void; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.shape} pointerEvents="none" />

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack || (() => (router.canGoBack() ? router.back() : router.replace("/(auth)/login")))} hitSlop={10} style={styles.back} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={18} color="#0f172a" />
        </Pressable>

        <View style={styles.brandRow}>
          <View style={styles.logoTile}>
            <Image source={require("../../assets/curvelead-logo-mark.png")} style={styles.logoMark} />
          </View>
          <Text style={styles.logoText}>curvelead</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.body}>{children}</View>

        <View style={styles.spacer} />
        <Text style={styles.terms}>
          By continuing you agree to our{" "}
          <Text style={styles.termsLink} onPress={() => Linking.openURL("https://curvelead.com/terms-of-service").catch(() => {})} accessibilityRole="link">Terms &amp; Conditions</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const authStyles = StyleSheet.create({
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 10, marginBottom: 12, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },
  label: { color: "#0f172a", fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 5 },
  field: { backgroundColor: "#ffffff", marginBottom: 12, fontSize: 14 },
  fieldOutline: { borderRadius: 10, borderColor: "#dbe3f1" },
  button: { height: 46, borderRadius: 10, backgroundColor: AUTH_NAVY, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  buttonLabel: { color: "#ffffff", fontSize: 15, fontFamily: "Inter_700Bold" },
  linkWrap: { alignItems: "center", marginTop: 18 },
  link: { color: AUTH_NAVY, fontSize: 12, fontWeight: "800" },
  linkMuted: { color: colors.textMuted },
  linkPlain: { color: colors.textSecondary, fontSize: 12 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#eef1fa" },
  shape: { position: "absolute", top: 0, right: 0, width: 190, height: 150, backgroundColor: "#dfe7fb", borderBottomLeftRadius: 90 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  back: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dbe3f1", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  logoTile: { width: 34, height: 34, borderRadius: 9, backgroundColor: "#12286b", alignItems: "center", justifyContent: "center" },
  logoMark: { width: 22, height: 22, borderRadius: 6 },
  logoText: { color: "#0f172a", fontSize: 20, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 },
  title: { color: "#0f172a", fontSize: 24, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 4, marginBottom: 18 },
  body: {},
  spacer: { flexGrow: 1, minHeight: 28 },
  terms: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 20 },
  termsLink: { color: AUTH_NAVY, fontFamily: "Inter_700Bold" },
});
