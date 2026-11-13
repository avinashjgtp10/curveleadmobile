import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { homeOrigin } from "@/navigation/homeOrigin";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { fetchStaff } from "@/api/staff";
import { fetchPlans } from "@/api/billing";
import { UserRole } from "@/types";

type IconName = keyof typeof Ionicons.glyphMap;

// Palette of the redesigned More screen: lavender page, white cards, blue accents.
const UI = { bg: "#eef1fa", line: "#e4e9f3", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", blue: "#2457e6", navy: "#1d4ed8", green: "#0f7b5f", red: "#d6334f" };

interface Tint { bg: string; fg: string }
const TINT = {
  blue: { bg: "#dbe5fb", fg: "#2457e6" },
  purple: { bg: "#e7dffb", fg: "#6d4fd6" },
  pink: { bg: "#fde1ea", fg: "#d6336c" },
  orange: { bg: "#fde9c9", fg: "#c2710c" },
  green: { bg: "#d8f0e5", fg: "#0f7b5f" },
  gray: { bg: "#e5e9f2", fg: "#475569" },
} satisfies Record<string, Tint>;

interface Item {
  icon: IconName;
  label: string;
  href: string;
  tint: Tint;
  roles?: UserRole[]; // undefined = visible to everyone
}

// Same destinations as before, grouped like the design.
const TOOLS: Item[] = [
  { icon: "git-network-outline", label: "Lead Automation", href: "/(app)/more/lead-automation", tint: TINT.blue },
  { icon: "albums-outline", label: "Content Library", href: "/(app)/content", tint: TINT.purple },
  { icon: "trending-up-outline", label: "Ads Manager", href: "/(app)/more/campaigns", tint: TINT.pink },
  { icon: "star-outline", label: "AI Tools", href: "/(app)/more/market-ai", tint: TINT.orange },
  { icon: "document-text-outline", label: "Quotations", href: "/(app)/more/quotations", tint: TINT.green },
  { icon: "folder-open-outline", label: "Brochures", href: "/(app)/more/brochures", tint: TINT.green },
];

const MANAGE: Item[] = [
  { icon: "chatbox-ellipses-outline", label: "Message Templates", href: "/(app)/more/templates", tint: TINT.green },
  { icon: "person-add-outline", label: "Team", href: "/(app)/more/team", tint: TINT.purple, roles: ["admin", "super_admin"] },
  { icon: "power-outline", label: "Integrations", href: "/(app)/more/integrations", tint: TINT.blue, roles: ["admin", "super_admin"] },
  { icon: "bar-chart-outline", label: "Reports", href: "/(app)/more/reports", tint: TINT.green },
  { icon: "card-outline", label: "Billing", href: "/(app)/more/billing", tint: TINT.blue, roles: ["admin", "super_admin"] },
  { icon: "shield-checkmark-outline", label: "Super Admin", href: "/(app)/more/super-admin", tint: TINT.gray, roles: ["super_admin"] },
];

const PREFERENCES: Item[] = [
  { icon: "settings-outline", label: "Settings", href: "/(app)/more/settings", tint: TINT.gray },
  { icon: "notifications-outline", label: "Notification Settings", href: "/(app)/more/notification-settings", tint: TINT.orange },
  { icon: "language-outline", label: "Language", href: "/(app)/more/language", tint: TINT.orange },
  { icon: "bulb-outline", label: "Submit Feedback", href: "/(app)/more/feedback", tint: TINT.pink },
  { icon: "help-circle-outline", label: "Help & Support", href: "/(app)/more/help-support", tint: TINT.green },
  { icon: "person-outline", label: "Account", href: "/(app)/more/account", tint: TINT.gray },
];

function dateText(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function ToolTile({ item, onPress }: { item: Item; onPress: () => void }) {
  const { t } = useT();
  return (
    <Pressable style={styles.toolTile} onPress={onPress} accessibilityRole="button" accessibilityLabel={t(item.label)}>
      <View style={[styles.toolIcon, { backgroundColor: item.tint.bg }]}><Ionicons name={item.icon} size={20} color={item.tint.fg} /></View>
      <Text style={styles.toolLabel} numberOfLines={2}>{t(item.label)}</Text>
    </Pressable>
  );
}

function RowList({ items, onOpen }: { items: Item[]; onOpen: (item: Item) => void }) {
  const { t } = useT();
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={`${item.href}-${item.label}`}>
          <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#f5f7fd" }]}>
            <View style={[styles.rowIcon, { backgroundColor: item.tint.bg }]}><Ionicons name={item.icon} size={16} color={item.tint.fg} /></View>
            <Text style={styles.rowLabel}>{t(item.label)}</Text>
            <Ionicons name="chevron-forward" size={16} color={UI.muted} />
          </Pressable>
          {index < items.length - 1 ? <View style={styles.divider} /> : null}
        </View>
      ))}
    </View>
  );
}

export default function MoreScreen() {
  const { user, tenant, logout } = useAuth();
  const { t } = useT();
  const { can } = usePermission();
  const insets = useSafeAreaInsets();
  const isAdmin = can(["admin", "super_admin"]);

  // Team seats: people on the team vs. what the plan allows (admins only, same sources as Team and Billing).
  const [seatsUsed, setSeatsUsed] = useState<number | null>(null);
  const [seatLimit, setSeatLimit] = useState<number | null | undefined>(undefined);

  const status = (tenant?.subscriptionStatus || "trial").toLowerCase();
  // Like Billing: a trial counts as the Free plan, otherwise the plan that was paid for.
  const planName = status === "trial" ? "Free" : tenant?.planName || "—";

  // Showing the More menu means features opened from here go Back to here, not to Home.
  useFocusEffect(useCallback(() => {
    homeOrigin.current = false;
    if (!isAdmin) return undefined;
    let cancelled = false;
    fetchStaff().then((members) => { if (!cancelled) setSeatsUsed(members.filter((member) => member.is_active !== false).length); }).catch(() => {});
    fetchPlans().then((plans) => {
      if (cancelled) return;
      const plan = plans.find((item) => item.name === planName);
      setSeatLimit(plan ? plan.max_users ?? null : undefined);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin, planName]));

  function open(item: Item) { router.push(item.href as never); }
  const visible = (items: Item[]) => items.filter((item) => !item.roles || can(item.roles));

  const businessName = tenant?.name || user?.name || "Account";
  const roleLabel = user ? (user.role === "super_admin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Staff") : "";
  const active = status === "active";
  const statusPill = active ? { label: "Active", bg: "#d8f0e5", fg: UI.green }
    : status === "trial" ? { label: "Trial", bg: "#fde9c9", fg: "#c2710c" }
    : { label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), bg: "#fdecef", fg: UI.red };
  const renewal = status === "trial"
    ? (tenant?.trialEndsAt ? `${t("Trial ends")} ${dateText(tenant.trialEndsAt)}` : "")
    : (tenant?.subscriptionEnd ? `${active ? t("Renews on") : t("Ended on")} ${dateText(tenant.subscriptionEnd)}` : "");
  const unlimited = seatLimit === null || (typeof seatLimit === "number" && seatLimit < 0);
  const seatFill = seatsUsed !== null && typeof seatLimit === "number" && seatLimit > 0 ? Math.min(1, seatsUsed / seatLimit) : 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 105 }} showsVerticalScrollIndicator={false}>
        <Pressable
          style={styles.backButton} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back"
          // More is a tab, so there may be nothing to go back to: fall back to Home.
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)"))}
        >
          <Ionicons name="arrow-back" size={20} color={UI.ink} />
        </Pressable>
        <Text style={styles.eyebrow}>{t("WORKSPACE")}</Text>
        <Text style={styles.title}>{t("More")}</Text>

        <Pressable style={styles.profileCard} onPress={() => router.push("/(app)/more/account" as never)} accessibilityRole="button" accessibilityLabel="Open account">
          <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{(businessName.charAt(0) || "?").toUpperCase()}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.profileName} numberOfLines={1}>{businessName}</Text>
            <Text style={styles.profileSub} numberOfLines={1}>{user?.name ? `${user.name} · ` : ""}{t(roleLabel)}</Text>
          </View>
          {roleLabel ? <View style={styles.rolePill}><Text style={styles.rolePillText}>{t(roleLabel)}</Text></View> : null}
        </Pressable>

        {isAdmin ? (
          <>
            <Text style={styles.section}>{t("SUBSCRIPTION")}</Text>
            <Pressable style={styles.planCard} onPress={() => router.push("/(app)/more/billing" as never)} accessibilityRole="button" accessibilityLabel="Open billing">
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{t("Current plan")}</Text>
                <Text style={styles.planName}>{planName}</Text>
                {renewal ? <Text style={styles.cardSub}>{renewal}</Text> : null}
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusPill.bg }]}><Text style={[styles.statusPillText, { color: statusPill.fg }]}>{t(statusPill.label)}</Text></View>
            </Pressable>

            {seatsUsed !== null ? (
              <Pressable style={styles.seatsCard} onPress={() => router.push("/(app)/more/team" as never)} accessibilityRole="button" accessibilityLabel="Open team">
                <Text style={styles.cardLabel}>{t("Team seats")}</Text>
                <Text style={styles.planName}>{seatsUsed} {t("of")} {seatLimit === undefined ? "—" : unlimited ? t("Unlimited") : seatLimit}</Text>
                <Text style={styles.cardSub}>{t("seats in use")}</Text>
                {seatLimit !== undefined && !unlimited ? (
                  <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(3, seatFill * 100)}%` }]} /></View>
                ) : null}
                <Text style={styles.cardLink}>{t("Manage team")}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <Text style={styles.section}>{t("TOOLS")}</Text>
        <Pressable style={styles.agentBanner} onPress={() => router.push("/(app)/more/ai-tools" as never)} accessibilityRole="button" accessibilityLabel="AI Agent">
          <View style={styles.agentIcon}><Ionicons name="sparkles-outline" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.agentTitle}>{t("AI Agent")}</Text>
            <Text style={styles.agentSub}>{t("Answering your leads on WhatsApp")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
        <View style={styles.toolGrid}>
          {visible(TOOLS).map((item) => <ToolTile key={item.label} item={item} onPress={() => open(item)} />)}
        </View>

        <Text style={styles.section}>{t("MANAGE")}</Text>
        <RowList items={visible(MANAGE)} onOpen={open} />

        <Text style={styles.section}>{t("PREFERENCES")}</Text>
        <RowList items={visible(PREFERENCES)} onOpen={open} />

        <Pressable
          style={styles.logout} accessibilityRole="button" accessibilityLabel="Log out"
          onPress={async () => { try { await logout(); } catch { /* leave the session screen either way */ } router.replace("/(auth)/login"); }}
        >
          <Ionicons name="log-out-outline" size={18} color={UI.red} />
          <Text style={styles.logoutText}>{t("Log out")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  backButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  eyebrow: { color: "#5b6a8c", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.4 },
  title: { fontSize: 28, fontFamily: "DMSans_700Bold", color: UI.ink, marginTop: 2, marginBottom: 14 },

  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: "#dbe5fb", borderWidth: 1, borderColor: "#c9d6f5" },
  profileAvatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: UI.navy, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#ffffff", fontSize: 18, fontFamily: "Inter_700Bold" },
  profileName: { color: UI.ink, fontSize: 15, fontFamily: "Inter_700Bold" },
  profileSub: { color: UI.sub, fontSize: 11, marginTop: 2 },
  rolePill: { backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  rolePillText: { color: UI.navy, fontSize: 11, fontFamily: "Inter_700Bold" },

  section: { color: "#5b6a8c", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginTop: 20, marginBottom: 8, marginLeft: 2 },

  planCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, marginBottom: 10 },
  seatsCard: { padding: 14, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line },
  cardLabel: { color: UI.sub, fontSize: 11, fontFamily: "Inter_500Medium" },
  planName: { color: UI.ink, fontSize: 17, fontFamily: "DMSans_700Bold", marginTop: 2 },
  cardSub: { color: UI.sub, fontSize: 11, marginTop: 2 },
  cardLink: { color: UI.blue, fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 10 },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  statusPillText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  track: { height: 5, borderRadius: 3, backgroundColor: "#e3e8f4", overflow: "hidden", marginTop: 10 },
  fill: { height: 5, borderRadius: 3, backgroundColor: UI.blue },

  agentBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: UI.navy, marginBottom: 10 },
  agentIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  agentTitle: { color: "#ffffff", fontSize: 15, fontFamily: "Inter_700Bold" },
  agentSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolTile: { width: "31.6%", alignItems: "center", paddingVertical: 14, paddingHorizontal: 6, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line },
  toolIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  toolLabel: { color: UI.ink, fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center", minHeight: 28 },

  list: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, color: UI.ink, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, backgroundColor: UI.line, marginLeft: 56 },

  logout: { marginTop: 22, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: "#f6c8d0", backgroundColor: "#fdecef", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  logoutText: { color: UI.red, fontSize: 14, fontFamily: "Inter_700Bold" },
});
