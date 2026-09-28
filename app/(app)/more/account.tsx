import { GlassBackground, glass } from "@/components/Glass";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Text } from "react-native-paper";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "Not available"}</Text>
    </View>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, tenant } = useAuth();

  return (
    <View style={styles.screen}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Account" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name?.charAt(0) || "?").toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name || "Account"}</Text>
        <Text style={styles.subtitle}>{tenant?.name || "Workspace"}</Text>
        <View style={styles.card}>
          <AccountRow label="Email" value={user?.email || ""} />
          <AccountRow label="Role" value={user?.role?.replace(/_/g, " ") || ""} />
          <AccountRow label="Workspace" value={tenant?.name || ""} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { backgroundColor: "transparent" },
  content: { paddingHorizontal: 16, paddingTop: 24, alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  name: { color: colors.text, fontSize: 22, fontFamily: "DMSans_700Bold", marginTop: 14 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  card: { ...glass, width: "100%", marginTop: 26, paddingHorizontal: 16, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.75)" },
  row: { minHeight: 62, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  label: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  value: { color: colors.text, fontSize: 15, marginTop: 4, textTransform: "capitalize" },
});
