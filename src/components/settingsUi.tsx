import React from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

export const PAGE_BG = "#f1f5fb";

/** Pale page with a back arrow + title, shared by the small Settings sub-screens. */
export function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={title} titleStyle={styles.headerTitle} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function StatusPill({ label, tone }: { label: string; tone: "good" | "warn" }) {
  const good = tone === "good";
  return (
    <View style={[styles.pill, { backgroundColor: good ? colors.successSoft : colors.warningSoft }]}>
      <Text style={[styles.pillText, { color: good ? colors.success : colors.warning }]}>{label}</Text>
    </View>
  );
}

export function LabeledInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} {...props} style={styles.input} />
    </View>
  );
}

export function ButtonRow({ secondaryLabel, onSecondary, primaryLabel, onPrimary, busy }: {
  secondaryLabel: string; onSecondary: () => void; primaryLabel: string; onPrimary: () => void; busy?: boolean;
}) {
  return (
    <View style={styles.buttonRow}>
      <Pressable onPress={onSecondary} disabled={busy} accessibilityRole="button" style={[styles.secondary, busy && { opacity: 0.6 }]}>
        <Text style={styles.secondaryText}>{secondaryLabel}</Text>
      </Pressable>
      <Pressable onPress={onPrimary} disabled={busy} accessibilityRole="button" style={[styles.primary, busy && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
      </Pressable>
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  hint: { color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  header: { backgroundColor: PAGE_BG },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 14, gap: 10 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 10, fontWeight: "800" },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 12, color: colors.text, fontSize: 13, backgroundColor: colors.surface },
  buttonRow: { flexDirection: "row", gap: 10 },
  secondary: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#0369a1", fontSize: 13, fontWeight: "700" },
  primary: { flex: 1, height: 48, borderRadius: 24, backgroundColor: "#0369a1", alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
