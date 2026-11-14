import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchTemplates } from "@/api/templates";
import { fetchBrochures } from "@/api/brochures";
import { fetchQuotations } from "@/api/quotations";

// Pale blue page, white cards with soft blue borders; each section keeps its own tint.
const UI = { bg: "#f3f6fc", line: "#d3def2", ink: "#0f1f3d", sub: "#5a6b85", blue: "#1d4fd8", blueSoft: "#e1ebfc" };

const SECTIONS = [
  { title: "Templates", noun: "templates", description: "Reusable SMS, WhatsApp and email templates for your team.", icon: "grid-outline", color: "#9a4a0a", soft: "#fde9d6", action: "New", href: "/(app)/more/templates", actionHref: "/(app)/more/templates?action=new" },
  { title: "Brochures", noun: "brochures", description: "Share PDFs, images and product brochures with leads.", icon: "document-text-outline", color: "#1d4fd8", soft: "#e1ebfc", action: "Upload", href: "/(app)/more/brochures", actionHref: "/(app)/more/brochures?action=new" },
  { title: "Quotations", noun: "quotations", description: "Create, send and track quotations for your leads.", icon: "receipt-outline", color: "#0f6b57", soft: "#d9efe8", action: "Create", href: "/(app)/more/quotations", actionHref: "/(app)/more/quotations/new" },
] as const;

export default function ContentScreen() {
  const insets = useSafeAreaInsets();
  // undefined = still loading, null = could not be loaded.
  const [counts, setCounts] = useState<(number | null | undefined)[]>([undefined, undefined, undefined]);
  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.allSettled([fetchTemplates(), fetchBrochures(), fetchQuotations()]).then(results => {
      // A failed refresh keeps the last known count instead of blanking it.
      if (active) setCounts(current => results.map((result, i) => result.status === "fulfilled" ? result.value.length : (typeof current[i] === "number" ? current[i] : null)));
    });
    return () => { active = false; };
  }, []));
  const shown = (i: number) => counts[i] === undefined ? "…" : counts[i] ?? "—";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={() => router.canGoBack() ? router.back() : router.replace("/(app)/more")} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.title}>Content Library</Text>
        <Text style={styles.subtitle}>Everything you share with leads, in one place.</Text>

        <View style={styles.stats}>
          {SECTIONS.map((item, i) => (
            <View key={item.title} style={[styles.statCell, i > 0 && styles.statDivider]}>
              <Text accessibilityLabel={`${item.title}: ${counts[i] === undefined ? "loading" : counts[i] ?? "unavailable"}`} style={styles.count}>{shown(i)}</Text>
              <Text style={styles.countLabel}>{item.title}</Text>
            </View>
          ))}
        </View>

        {SECTIONS.map((item, i) => (
          <View key={item.title} style={styles.card}>
            <Pressable style={styles.cardTop} onPress={() => router.push(item.href as never)} accessibilityRole="button">
              <View style={[styles.icon, { backgroundColor: item.soft }]}><Ionicons name={item.icon} size={20} color={item.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={UI.sub} />
            </Pressable>
            <View style={styles.cardBottom}>
              <Text style={styles.cardCount}>{shown(i)} {item.noun}</Text>
              <Pressable style={[styles.action, { backgroundColor: item.soft }]} onPress={() => router.push(item.actionHref as never)} accessibilityRole="button" accessibilityLabel={`${item.action} ${item.title}`}>
                <Ionicons name="add" size={16} color={item.color} />
                <Text style={[styles.actionText, { color: item.color }]}>{item.action}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  back: { alignSelf: "flex-start", marginBottom: 8 },
  title: { fontSize: 22, fontFamily: "DMSans_700Bold", color: UI.ink },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: UI.sub, marginTop: 2, marginBottom: 12 },
  stats: { flexDirection: "row", backgroundColor: UI.blueSoft, borderRadius: 16, borderWidth: 1, borderColor: UI.line, paddingVertical: 10, marginBottom: 12 },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: { borderLeftWidth: 1, borderLeftColor: UI.line },
  count: { color: UI.ink, fontSize: 20, fontFamily: "Inter_700Bold" },
  countLabel: { fontSize: 11, color: UI.sub, fontFamily: "Inter_500Medium", marginTop: 1 },
  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, marginBottom: 10, paddingHorizontal: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, paddingBottom: 10 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: UI.ink },
  description: { fontFamily: "Inter_400Regular", color: UI.sub, fontSize: 11, lineHeight: 16, marginTop: 1 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: UI.line, paddingVertical: 8 },
  cardCount: { fontFamily: "Inter_700Bold", fontSize: 12, color: UI.ink },
  action: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { fontFamily: "Inter_700Bold", fontSize: 12 },
});
