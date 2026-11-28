import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";

// Pale lavender page, white cards with soft borders, indigo accents.
const UI = { bg: "#f4f5fb", line: "#dfe2f0", ink: "#14172e", sub: "#5b6280", muted: "#8b91ab", accent: "#4b45e0", accentSoft: "#e8e9fb" };

function AccountRow({ icon, label, value, last, capitalize }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean; capitalize?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={18} color={UI.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, capitalize && { textTransform: "capitalize" }]} numberOfLines={1}>{value || "Not available"}</Text>
      </View>
    </View>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, tenant } = useAuth();
  const role = user?.role?.replace(/_/g, " ") || "";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name?.charAt(0) || "?").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{user?.name || "Account"}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{tenant?.name || "Workspace"}</Text>
          </View>
          {role ? <View style={styles.rolePill}><Text style={styles.roleText}>{role}</Text></View> : null}
        </View>

        <View style={styles.card}>
          <AccountRow icon="mail-outline" label="Email" value={user?.email || ""} />
          <AccountRow icon="shield-checkmark-outline" label="Role" value={role} capitalize />
          <AccountRow icon="business-outline" label="Workspace" value={tenant?.name || ""} last />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 24, fontWeight: "800" },
  content: { paddingHorizontal: 14, paddingTop: 6, gap: 10 },

  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: UI.accentSoft, borderRadius: 18, borderWidth: 1, borderColor: UI.line, padding: 14 },
  avatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: UI.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  name: { color: UI.ink, fontSize: 17, fontWeight: "800" },
  subtitle: { color: UI.sub, fontSize: 12, marginTop: 2 },
  rolePill: { backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  roleText: { color: UI.accent, fontSize: 11, fontWeight: "800", textTransform: "capitalize" },

  card: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: UI.line },
  rowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: UI.accentSoft, alignItems: "center", justifyContent: "center" },
  label: { color: UI.muted, fontSize: 11, fontWeight: "700" },
  value: { color: UI.ink, fontSize: 14, fontWeight: "600", marginTop: 2 },
});
