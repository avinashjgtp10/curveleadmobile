import React, { useCallback, useEffect, useState } from "react";
import {
  Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { ActivityIndicator, Appbar, Avatar, Button, Card, List } from "react-native-paper";
import axios from "axios";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { DashboardPeriod, DashboardSummary, fetchDashboard } from "@/api/dashboard";
import { fetchTodayFollowups, TodayFollowup } from "@/api/leads";

type IconName = keyof typeof Ionicons.glyphMap;

const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  today: "Today", last_7_days: "Past 7 Days", last_30_days: "Past 30 Days",
};

const fmt = (value?: number) => Number(value || 0).toLocaleString("en-IN");
const money = (value?: number) => {
  const amount = Number(value || 0);
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${fmt(amount)}`;
};

function pretty(value?: string) {
  if (!value) return "New";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timeOf(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function QuickTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Card mode="contained" style={styles.quickTile} onPress={onPress}>
      <Card.Content style={styles.quickTileContent}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <Text style={styles.quickLabel}>{label}</Text>
      </Card.Content>
    </Card>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<DashboardPeriod>("last_7_days");
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [followups, setFollowups] = useState<TodayFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [summary, todayFollowups] = await Promise.all([
        fetchDashboard(period),
        fetchTodayFollowups().catch(() => []),
      ]);
      setData(summary);
      setFollowups(todayFollowups);
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) && typeof loadError.response?.data?.error === "string"
        ? loadError.response.data.error : "Could not load your dashboard.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.Content title="Dashboard Overview" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="bell-outline" color={colors.text} onPress={() => router.push("/(app)/notifications")} />
      </Appbar.Header>

      <Pressable style={styles.periodRow} onPress={() => setPeriodPickerOpen(true)}>
        <Text style={styles.periodText}>{PERIOD_LABEL[period]}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && !data ? (
          <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.stateText}>Getting your latest numbers…</Text></View>
        ) : error && !data ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>Couldn&apos;t load dashboard</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
          </View>
        ) : data ? (
          <>
            <View style={styles.statGrid}>
              <StatTile label="Total Leads" value={fmt(data.leads_in_period)} />
              <StatTile label="Total Converted" value={fmt(data.won_in_period)} />
              <StatTile label="New Leads Today" value={fmt(data.leads_today)} />
              <StatTile label="Follow-ups Due Today" value={fmt(data.followups_today)} />
            </View>

            <View style={styles.stageSection}>
              <Text style={styles.stageSectionTitle}>Leads by Stage</Text>
              <View style={styles.stageRow}>
                {(data.pipeline.length ? data.pipeline.slice(0, 4) : []).map((stage) => (
                  <View key={stage.name} style={styles.stageColumn}>
                    <Text style={styles.stageColumnLabel} numberOfLines={1}>{pretty(stage.name).toUpperCase()}</Text>
                    <Text style={styles.stageColumnValue}>{fmt(stage.count)}</Text>
                  </View>
                ))}
                {!data.pipeline.length ? <Text style={styles.empty}>No pipeline stages yet.</Text> : null}
              </View>
            </View>

            {data.critical_followups > 0 || data.unassigned_leads > 0 ? (
              <Pressable style={styles.alert} onPress={() => router.push(data.critical_followups > 0 ? "/(app)/followups" : "/(app)/leads")}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <View style={styles.alertCopy}>
                  <Text style={styles.alertTitle}>{data.critical_followups > 0 ? `${data.critical_followups} follow-ups need urgent attention` : `${data.unassigned_leads} leads are still unassigned`}</Text>
                  <Text style={styles.alertSubtitle}>Open the list and take action now</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.danger} />
              </Pressable>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <View style={styles.quickGrid}>
                <QuickTile icon="add-circle-outline" label="Add New Lead" onPress={() => router.push({ pathname: "/(app)/leads/new", params: { returnTo: "dashboard" } })} />
                <QuickTile icon="calendar-outline" label="Schedule Follow-up" onPress={() => router.push("/(app)/followups")} />
                <QuickTile icon="search-outline" label="Search Leads" onPress={() => router.push("/(app)/leads")} />
                <QuickTile icon="download-outline" label="Import Contacts" onPress={() => router.push("/(app)/leads/import")} />
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming Follow Ups</Text>
                <Text style={styles.sectionCount}>{followups.length}</Text>
              </View>
              <View style={styles.listCard}>
                {followups.slice(0, 4).map((item) => (
                  <List.Item
                    key={item.id} title={item.lead_name} description={`${pretty(item.followup_type)} follow-up`}
                    onPress={() => router.push({ pathname: "/(app)/leads/[id]", params: { id: item.lead_id, name: item.lead_name, phone: item.lead_phone, stage: item.lead_stage || "new" } })}
                    right={() => (
                      <View style={styles.followupTime}>
                        <Ionicons name="call-outline" size={15} color={colors.textSecondary} />
                        <Text style={styles.followupTimeText}>{timeOf(item.next_followup_at)}</Text>
                      </View>
                    )}
                  />
                ))}
                {!followups.length ? <Text style={styles.empty}>No follow-ups due right now.</Text> : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Insights</Text>
              <View style={styles.insightsRow}>
                <Card mode="outlined" style={styles.insightCard}><Card.Content><Text style={styles.insightLabel}>Revenue</Text><Text style={styles.insightValue}>{money(data.revenue_in_period)}</Text></Card.Content></Card>
                <Card mode="outlined" style={styles.insightCard}><Card.Content><Text style={styles.insightLabel}>Avg. deal</Text><Text style={styles.insightValue}>{money(data.avg_deal_value)}</Text></Card.Content></Card>
                <Card mode="outlined" style={styles.insightCard}><Card.Content><Text style={styles.insightLabel}>Balance due</Text><Text style={styles.insightValue}>{money(data.balance_due_in_period)}</Text></Card.Content></Card>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recently added</Text>
                <Button mode="text" compact onPress={() => router.push("/(app)/leads")}>See all</Button>
              </View>
              <View style={styles.listCard}>
                {data.recentLeads.slice(0, 4).map((lead) => (
                  <List.Item
                    key={lead.id} title={lead.name} description={pretty(lead.stage || lead.source)}
                    onPress={() => router.push(`/(app)/leads/${lead.id}`)}
                    left={() => <Avatar.Text size={38} label={(lead.name?.charAt(0) || "?").toUpperCase()} style={styles.avatar} labelStyle={styles.avatarText} />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                  />
                ))}
                {!data.recentLeads.length ? <Text style={styles.empty}>No leads added yet.</Text> : null}
              </View>
            </View>

            {data.is_fallback ? <Text style={styles.fallback}>Some advanced insights are temporarily unavailable.</Text> : null}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={periodPickerOpen} transparent animationType="fade" onRequestClose={() => setPeriodPickerOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPeriodPickerOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            {(Object.keys(PERIOD_LABEL) as DashboardPeriod[]).map((item) => (
              <List.Item
                key={item} title={PERIOD_LABEL[item]} onPress={() => { setPeriod(item); setPeriodPickerOpen(false); }}
                right={(props) => period === item ? <List.Icon {...props} icon="check" color={colors.primary} /> : null}
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.text },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  periodRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  periodText: { color: colors.text, fontSize: 14, fontWeight: "700" },

  state: { minHeight: 350, padding: 30, alignItems: "center", justifyContent: "center" },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stateText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 9 },
  retry: { marginTop: 16 },

  statGrid: { flexDirection: "row", flexWrap: "wrap" },
  statTile: { width: "50%", paddingVertical: 20, paddingHorizontal: 18, borderWidth: 0.5, borderColor: colors.borderSoft, alignItems: "center" },
  statLabel: { color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "center" },
  statValue: { color: colors.text, fontSize: 30, fontWeight: "800", marginTop: 8 },

  stageSection: { backgroundColor: colors.surfaceMuted, paddingVertical: 16 },
  stageSectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center", marginBottom: 14 },
  stageRow: { flexDirection: "row", paddingHorizontal: 18 },
  stageColumn: { flex: 1, alignItems: "center" },
  stageColumnLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  stageColumnValue: { color: colors.text, fontSize: 26, fontWeight: "800", marginTop: 6 },

  alert: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 14, marginHorizontal: 18, marginTop: 18 },
  alertCopy: { flex: 1 }, alertTitle: { color: colors.danger, fontSize: 12, fontWeight: "800" }, alertSubtitle: { color: colors.danger, fontSize: 10, marginTop: 3, opacity: 0.8 },

  section: { marginTop: 24, paddingHorizontal: 18 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  sectionCount: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickTile: { width: "47%", height: 88, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  quickTileContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  quickLabel: { color: colors.primary, fontSize: 12, fontWeight: "700", textAlign: "center" },

  listCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden" },
  empty: { color: colors.textMuted, textAlign: "center", paddingVertical: 22, fontSize: 12 },

  followupTime: { alignItems: "center", gap: 3 }, followupTimeText: { color: colors.text, fontSize: 12, fontWeight: "700" },

  insightsRow: { flexDirection: "row", gap: 10 },
  insightCard: { flex: 1 },
  insightLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" }, insightValue: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 5 },

  avatar: { backgroundColor: colors.primary },
  avatarText: { fontWeight: "800" },
  fallback: { color: colors.textMuted, fontSize: 10, textAlign: "center", marginTop: 18, paddingHorizontal: 30 },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 10 },
});
