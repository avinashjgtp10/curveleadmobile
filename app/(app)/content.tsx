import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassBackground, glass, GradientIcon } from "@/components/Glass";
import { GlassPressable } from "@/components/GlassPressable";
import { IconChevronRight, SvgTemplate, SvgFileText, SvgReceipt } from "@/components/ReferenceIcons";
import { fetchTemplates } from "@/api/templates";
import { fetchBrochures } from "@/api/brochures";
import { fetchQuotations } from "@/api/quotations";
import { colors } from "@/theme";

const SECTIONS = [
  { title: "Templates", description: "Reusable SMS, WhatsApp and email templates for your team.", Icon: SvgTemplate, tone: "orange", href: "/(app)/more/templates" },
  { title: "Brochures", description: "Share PDFs, images and product brochures with leads.", Icon: SvgFileText, tone: "sky", href: "/(app)/more/brochures" },
  { title: "Quotations", description: "Create, send and track quotations for your leads.", Icon: SvgReceipt, tone: "emerald", href: "/(app)/more/quotations" },
] as const;

export default function ContentScreen() {
  const insets = useSafeAreaInsets();
  const [counts, setCounts] = useState<(number | null)[]>([null, null, null]);
  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.allSettled([fetchTemplates(), fetchBrochures(), fetchQuotations()]).then(results => {
      if (active) setCounts(results.map(result => result.status === "fulfilled" ? result.value.length : null));
    });
    return () => { active = false; };
  }, []));
  return <View style={{ flex: 1 }}><GlassBackground />
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Content Library</Text>
      <Text style={styles.subtitle}>Everything you share with leads, in one place.</Text>
      {SECTIONS.map(({ title, description, Icon, tone, href }) => <GlassPressable key={title} style={styles.card} onPress={() => router.push(href)}>
        <GradientIcon tone={tone} size={56}><Icon color="#fff" /></GradientIcon>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.description}>{description}</Text></View><IconChevronRight />
      </GlassPressable>)}
      <View style={[glass, { padding: 16, marginTop: 4 }]}>
        <Text style={styles.statsTitle}>LIBRARY STATS</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>{SECTIONS.map((item, i) => <View key={item.title} style={{ flex: 1, alignItems: "center" }}><Text accessibilityLabel={`${item.title}: ${counts[i] ?? "unavailable"}`} style={styles.count}>{counts[i] ?? "—"}</Text><Text style={styles.countLabel}>{item.title}</Text></View>)}</View>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontFamily: "DMSans_700Bold", color: colors.text },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 4, marginBottom: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, marginBottom: 12 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text, marginBottom: 2 },
  description: { fontFamily: "Inter_400Regular", color: colors.textSecondary, fontSize: 12, lineHeight: 19.5 },
  statsTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.textMuted, letterSpacing: 1.2, marginBottom: 12 },
  count: { color: colors.primary, fontSize: 20, fontFamily: "Inter_700Bold" },
  countLabel: { fontSize: 10, color: colors.textMuted, fontFamily: "Inter_500Medium" },
});
