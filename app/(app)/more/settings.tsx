import { GlassBackground, glass } from "@/components/Glass";
import * as Icons from "@/components/ReferenceIcons";
import React from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Appbar, Text } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

interface SettingsRow {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  href: string;
}

const SETTINGS_ROWS: SettingsRow[] = [
  { icon: "card-outline", bg: colors.successSoft, iconColor: colors.success, title: "Billing & Usage", subtitle: "Plan, credits and invoices", href: "/(app)/more/billing" },
  { icon: "notifications-outline", bg: colors.primarySoft, iconColor: colors.primary, title: "Notifications", subtitle: "Campaign and chat alerts", href: "/(app)/notifications" },
  { icon: "lock-closed-outline", bg: "#ede9fe", iconColor: "#7c3aed", title: "Security", subtitle: "2-factor authentication", href: "/(app)/more/security" },
  { icon: "language-outline", bg: colors.warningSoft, iconColor: colors.warning, title: "Language", subtitle: "English", href: "/(app)/more/language" },
];

const HELP_ROWS: SettingsRow[] = [
  { icon: "bulb-outline", bg: colors.primarySoft, iconColor: colors.primary, title: "Submit Feedback", subtitle: "Share ideas and report issues", href: "/(app)/more/feedback" },
  { icon: "call-outline", bg: colors.successSoft, iconColor: colors.success, title: "Help & Support", subtitle: "Chat with our support team", href: "/(app)/more/help-support" },
];

function SettingsGroup({ title, subtitle, rows }: { title: string; subtitle: string; rows: SettingsRow[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      <View style={styles.list}>
        {rows.map((row, index) => (
          <View key={row.href}>
            <Pressable accessibilityRole="button" onPress={() => router.push(row.href as never)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "rgba(224,242,254,0.6)" }]}>
              <View style={[styles.iconWrap, { backgroundColor: row.bg }]}>
                <Ionicons name={row.icon} size={20} color={row.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
              </View>
              <Icons.IconChevronRight />
            </Pressable>
            {index < rows.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Settings" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <SettingsGroup title="Settings" subtitle="Account, preferences and security" rows={SETTINGS_ROWS} />
        <SettingsGroup title="Help & account" subtitle="Support, feedback and session" rows={HELP_ROWS} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: "transparent" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontFamily: "DMSans_700Bold", color: colors.text },
  sectionSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 14 },
  list: { ...glass, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", borderRadius: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  rowSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: "rgba(224,242,254,0.6)", marginHorizontal: 16 },
});
