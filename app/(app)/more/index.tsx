import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Button, List, Text } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { UserRole } from "@/types";
import { colors, radii, shadows } from "@/theme";

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: string;
  roles?: UserRole[]; // undefined = visible to everyone
}

const MENU: MenuItem[] = [
  { icon: "git-network-outline", label: "Pipeline", href: "/(app)/more/pipeline" },
  { icon: "megaphone-outline", label: "Campaigns", href: "/(app)/more/campaigns" },
  { icon: "sparkles-outline", label: "AI Tools", href: "/(app)/more/ai-tools" },
  { icon: "document-text-outline", label: "Quotations", href: "/(app)/more/quotations" },
  { icon: "folder-open-outline", label: "Brochures", href: "/(app)/more/brochures" },
  { icon: "chatbox-ellipses-outline", label: "Message Templates", href: "/(app)/more/templates" },
  { icon: "people-outline", label: "Team", href: "/(app)/more/team", roles: ["admin", "super_admin"] },
  { icon: "extension-puzzle-outline", label: "Integrations", href: "/(app)/more/integrations", roles: ["admin", "super_admin"] },
  { icon: "bar-chart-outline", label: "Reports", href: "/(app)/more/reports" },
  { icon: "card-outline", label: "Billing", href: "/(app)/more/billing", roles: ["admin", "super_admin"] },
  { icon: "settings-outline", label: "Settings", href: "/(app)/more/settings" },
  { icon: "shield-checkmark-outline", label: "Super Admin", href: "/(app)/more/super-admin", roles: ["super_admin"] },
];

export default function MoreScreen() {
  const { user, tenant, logout } = useAuth();
  const { can } = usePermission();
  const insets = useSafeAreaInsets();

  const visibleItems = MENU.filter((item) => !item.roles || can(item.roles));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 105 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>WORKSPACE</Text>
      <Text style={styles.title}>More</Text>
      {user && (
        <Text style={styles.subtitle}>
          {user.name} · {user.role} · {tenant?.name ?? "—"}
        </Text>
      )}

      <View style={styles.list}>
        {visibleItems.map((item, index) => (
          <List.Item
            key={item.href}
            title={item.label}
            titleStyle={styles.rowLabel}
            onPress={() => router.push(item.href as never)}
            style={[styles.row, index === visibleItems.length - 1 && styles.rowLast]}
            left={() => <View style={styles.rowIcon}><Ionicons name={item.icon} size={20} color={colors.primary} /></View>}
            right={(props) => <List.Icon {...props} icon="chevron-right" color={colors.textMuted} />}
          />
        ))}
      </View>

      <Button
        mode="outlined" icon="logout" textColor={colors.danger} style={styles.logout} contentStyle={styles.logoutContent}
        onPress={async () => { await logout(); router.replace("/(auth)/login"); }}
      >
        Log out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { fontSize: 29, fontWeight: "900", letterSpacing: -0.8, color: colors.text, marginTop: 4 },
  subtitle: { color: colors.textSecondary, marginTop: 4, marginBottom: 22, fontSize: 12, textTransform: "capitalize" },
  list: { overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.lg, ...shadows.card },
  row: { borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  rowLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  logout: { marginTop: 24, borderColor: "#FECDD3", backgroundColor: colors.dangerSoft },
  logoutContent: { height: 48 },
});
