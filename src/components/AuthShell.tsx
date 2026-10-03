import React from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

// The shared look of the signed-out screens: soft blue backdrop, logo, and a white card.
export function AuthShell({ title, subtitle, icon, onBack, children }: {
  title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; onBack?: () => void; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <LinearGradient colors={["#bae6fd", "#e0f2fe", "#f8fcff"]} style={styles.backdrop} />
      <View style={styles.circleOne} />
      <View style={styles.circleTwo} />

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack || (() => (router.canGoBack() ? router.back() : router.replace("/(auth)/login")))} hitSlop={10} style={styles.back} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Image source={require("../../assets/curvelead-logo-mark.png")} style={styles.logoMark} />
          </View>
          <Text style={styles.logoText}>curvelead</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.iconTile}><Ionicons name={icon} size={26} color={colors.primary} /></View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fcff" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, height: 380 },
  circleOne: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(14,165,233,0.12)", top: -70, right: -60 },
  circleTwo: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(79,70,229,0.08)", top: 120, left: -60 },
  content: { flexGrow: 1 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center", marginLeft: 16 },
  hero: { alignItems: "center", paddingTop: 6, paddingBottom: 22 },
  logoWrap: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", shadowColor: "#0ea5e9", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  logoMark: { width: 50, height: 50, borderRadius: 13 },
  logoText: { color: "#0369a1", fontSize: 26, fontFamily: "DMSans_700Bold", letterSpacing: -0.6, marginTop: 10 },
  card: { marginHorizontal: 16, backgroundColor: "#ffffff", borderRadius: 28, padding: 22, shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  iconTile: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { color: colors.text, fontSize: 24, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 4, marginBottom: 18 },
});
