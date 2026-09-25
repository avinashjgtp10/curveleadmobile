import { GlassBackground, glass, GradientIcon, GradientName } from "@/components/Glass";
import * as Icons from "@/components/ReferenceIcons";
import React from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
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
  { icon: "git-network-outline", label: "Lead Automation", href: "/(app)/more/lead-automation" },
  { icon: "sparkles-outline", label: "AI Agent", href: "/(app)/more/ai-tools" },
  { icon: "albums-outline", label: "Content Library", href: "/(app)/content" },
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
  { icon: "help-circle-outline", label: "Help & Support", href: "/(app)/more/help-support" },
  { icon: "person-circle-outline", label: "Account", href: "/(app)/more/account" },
  { icon: "shield-checkmark-outline", label: "Super Admin", href: "/(app)/more/super-admin", roles: ["super_admin"] },
];

export default function MoreScreen() {
  const { user, tenant, logout } = useAuth();
  const { can } = usePermission();
  const insets = useSafeAreaInsets();

  const visibleItems = MENU.filter((item) => !item.roles || can(item.roles));

  const referenceIcons = [Icons.SvgGitBranch, undefined, undefined, Icons.SvgMegaphone, Icons.SvgSparkles, Icons.SvgClipboard, Icons.SvgFolder, Icons.SvgMessageCircle, Icons.SvgTeam, Icons.SvgPlug, Icons.SvgBarChart, Icons.SvgCreditCard, Icons.SvgSettings, undefined, undefined, undefined];
  const tones: GradientName[] = ["sky", "emerald", "indigo", "violet", "pink", "sky", "indigo", "teal", "indigo", "sky", "emerald", "sky", "slate", "amber", "emerald", "slate"];
  return (
    <View style={{ flex: 1 }}><GlassBackground />
    <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 105 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>WORKSPACE</Text>
      <Text style={styles.title}>More</Text>
      {user && (
        <Text style={styles.subtitle}>
          {user.name} · {user.role} · {tenant?.name ?? "—"}
        </Text>
      )}

      <View style={styles.list}>
        {visibleItems.map((item, index) => {
          const i = MENU.indexOf(item);
          const Icon = referenceIcons[i];
          return <View key={`${item.href}-${item.label}`}>
            <Pressable accessibilityRole="button" onPress={() => router.push(item.href as never)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "rgba(224,242,254,0.6)" }]}>
              <GradientIcon tone={tones[i] || "slate"}>{Icon ? <Icon color="#fff" /> : <Ionicons name={item.icon} size={20} color="#fff" />}</GradientIcon>
              <Text style={[styles.rowLabel, { flex: 1 }]}>{item.label}</Text><Icons.IconChevronRight />
            </Pressable>
            {index < visibleItems.length - 1 && <View style={{ height: 1, backgroundColor: "rgba(224,242,254,0.6)", marginHorizontal: 16 }} />}
          </View>;
        })}
      </View>

      <Button
        mode="outlined" icon={() => <Icons.IconLogout />} textColor={colors.danger} style={styles.logout} contentStyle={styles.logoutContent}
        onPress={async () => { await logout(); router.replace("/(auth)/login"); }}
      >
        Log out
      </Button>
    </ScrollView></View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { fontSize: 20, fontFamily: "DMSans_700Bold", color: colors.text, marginTop: 4 },
  subtitle: { color: colors.textSecondary, marginTop: 4, marginBottom: 16, fontSize: 12, textTransform: "capitalize" },
  list: { ...glass, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", borderRadius: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14, paddingHorizontal: 16 },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  rowLabel: { color: "#334155", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  logout: { marginTop: 16, borderRadius: 16, borderWidth: 2, borderColor: "#FECDD3", backgroundColor: colors.dangerSoft },
  logoutContent: { height: 56 },
});
