import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Appbar, Card, Text } from "react-native-paper";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

interface PlaceholderScreenProps {
  title: string;
  description: string;
  icon?: string;
  showBack?: boolean;
}

export function PlaceholderScreen({
  title,
  description,
  icon,
  showBack,
}: PlaceholderScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      {showBack ? (
        <Appbar.Header style={styles.header} elevated={false}>
          <Appbar.BackAction onPress={() => router.back()} />
        </Appbar.Header>
      ) : null}
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      >
        <View style={styles.ambientOne} />
        <View style={styles.ambientTwo} />
        <Card mode="elevated" style={styles.card}>
          <Card.Content>
            {icon ? <View style={styles.iconWrap}><Text style={styles.icon}>{icon}</Text></View> : null}
            <Text style={styles.eyebrow}>CURVELEAD</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
            <View style={styles.badge}><View style={styles.badgeDot} /><Text style={styles.badgeText}>Coming soon</Text></View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, overflow: "hidden" },
  ambientOne: { position: "absolute", width: 250, height: 250, borderRadius: 125, backgroundColor: colors.primarySoft, opacity: 0.65, right: -120, top: 20 },
  ambientTwo: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: colors.surfaceMuted, opacity: 0.55, left: -100, bottom: 60 },
  card: { borderRadius: 28 },
  iconWrap: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  icon: { fontSize: 28 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 7 },
  title: { fontSize: 29, lineHeight: 35, letterSpacing: -0.8, fontWeight: "900", color: colors.text, marginBottom: 10 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", marginTop: 24, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.primarySoft },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 7 },
  badgeText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
});
