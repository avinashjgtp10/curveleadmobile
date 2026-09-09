import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Card, List, Text } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const SECTIONS: { key: string; title: string; description: string; icon: IconName; iconBg: string; href: string }[] = [
  {
    key: "templates", title: "Templates", description: "Reusable SMS, WhatsApp and email templates for your team.",
    icon: "chatbubbles-outline", iconBg: "#FFB580", href: "/(app)/more/templates",
  },
  {
    key: "brochures", title: "Brochures", description: "Share PDFs, images and product brochures with leads.",
    icon: "document-text-outline", iconBg: "#D2E1FF", href: "/(app)/more/brochures",
  },
  {
    key: "quotations", title: "Quotations", description: "Create, send and track quotations for your leads.",
    icon: "receipt-outline", iconBg: "#ABFCCC", href: "/(app)/more/quotations",
  },
];

export default function ContentScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.Content title="Content Library" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Everything you share with leads, in one place.</Text>

        {SECTIONS.map((section) => (
          <Card key={section.key} mode="outlined" style={styles.card} onPress={() => router.push(section.href)}>
            <Card.Content style={styles.cardContent}>
              <List.Icon icon={() => <Ionicons name={section.icon} size={22} color={colors.text} />} style={[styles.cardIcon, { backgroundColor: section.iconBg }]} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{section.title}</Text>
                <Text style={styles.cardDescription}>{section.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card.Content>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 17, fontWeight: "800" },
  content: { padding: 18 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 18 },
  card: { marginBottom: 12 },
  cardContent: { flexDirection: "row", alignItems: "center", gap: 14 },
  cardIcon: { width: 46, height: 46, borderRadius: 12, margin: 0 },
  cardBody: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
