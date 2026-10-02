import React, { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { Campaign, CampaignMetrics, CampaignPeriod, deleteCampaign, fetchCampaignsPage } from "@/api/campaigns";
import { syncAdInsights } from "@/api/integrations";

const PAGE_SIZE = 20;

const PERIODS: { value: CampaignPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
];

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "#dcfce7", text: "#15803d", label: "Active" },
  paused: { bg: "#fef3c7", text: "#b45309", label: "Paused" },
  completed: { bg: "#eef2f6", text: "#64748b", label: "Completed" },
  draft: { bg: "#e0f2fe", text: "#0369a1", label: "Draft" },
};

const SOURCE_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  meta_ads: { icon: "logo-facebook", color: "#1877f2", bg: "#dbeafe" },
  google_ads: { icon: "logo-google", color: "#ea4335", bg: "#fee2e2" },
  instagram: { icon: "logo-instagram", color: "#c026d3", bg: "#fae8ff" },
  whatsapp: { icon: "logo-whatsapp", color: "#16a34a", bg: "#dcfce7" },
  organic: { icon: "leaf-outline", color: "#15803d", bg: "#dcfce7" },
  referral: { icon: "people-outline", color: "#d97706", bg: "#fef3c7" },
  other: { icon: "megaphone-outline", color: "#4f46e5", bg: "#e0e7ff" },
};

const VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  high_quality: { bg: "#dcfce7", text: "#15803d" },
  high_volume_low_quality: { bg: "#fef3c7", text: "#b45309" },
  underperforming: { bg: "#fee2e2", text: "#b91c1c" },
  average: { bg: "#eef2f6", text: "#64748b" },
  too_early: { bg: "#e0f2fe", text: "#0369a1" },
  no_leads: { bg: "#eef2f6", text: "#94a3b8" },
};

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function pretty(value?: string) {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value?: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function num(value?: number) {
  return Number(value || 0).toLocaleString("en-IN");
}

function shortDate(value?: string) {
  const [y, m, d] = String(value || "").split("T")[0].split("-").map(Number);
  return y ? new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
}

const EMPTY_METRICS: CampaignMetrics = { total_leads: 0, won: 0, conversion_rate: 0, active_campaigns: 0 };

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetrics>(EMPTY_METRICS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<CampaignPeriod>("this_month");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"active" | "inactive">("active");

  const load = useCallback(async (options: { refresh?: boolean; nextPage?: number; period?: CampaignPeriod } = {}) => {
    const nextPage = options.nextPage || 1;
    const append = nextPage > 1;
    if (options.refresh) setRefreshing(true);
    else if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const result = await fetchCampaignsPage({ period: options.period || period, page: nextPage, limit: PAGE_SIZE });
      setCampaigns((current) => append ? [...current, ...result.campaigns.filter((item) => !current.some((existing) => existing.id === item.id))] : result.campaigns);
      setMetrics(result.metrics);
      setTotal(result.total);
      setPage(nextPage);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load campaigns."));
    } finally {
      setLoading(false); setRefreshing(false); setLoadingMore(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function choosePeriod(value: CampaignPeriod) {
    if (value === period) return;
    setPeriod(value);
    load({ period: value });
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncAdInsights();
      Alert.alert("Sync complete", result.message);
      load();
    } catch (syncError) {
      Alert.alert("Sync failed", errorMessage(syncError, "Connect an ad account in Integrations first."));
    } finally {
      setSyncing(false);
    }
  }

  function confirmDelete(campaign: Campaign) {
    Alert.alert("Delete this campaign?", campaign.name, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteCampaign(campaign.id); load(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  const activeCount = campaigns.filter((c) => c.status === "active").length;
  const inactiveCount = campaigns.length - activeCount;
  const visible = campaigns.filter((c) => (tab === "active" ? c.status === "active" : c.status !== "active"));
  const focusCampaigns = campaigns.filter((c) => c.verdict === "high_quality" || c.verdict === "high_volume_low_quality");
  const hasMore = campaigns.length < total;

  const tiles = [
    { label: "Leads", value: num(metrics.total_leads), icon: "people-outline" as const, tint: "#2563eb", bg: "#dbeafe" },
    { label: "Won", value: num(metrics.won), icon: "trophy-outline" as const, tint: "#16a34a", bg: "#dcfce7" },
    { label: "Conversion", value: `${metrics.conversion_rate}%`, icon: "trending-up-outline" as const, tint: "#7c3aed", bg: "#ede9fe" },
    { label: "Active", value: num(metrics.active_campaigns), icon: "megaphone-outline" as const, tint: "#d97706", bg: "#fef3c7" },
  ];

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Campaigns" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="sync" onPress={handleSync} disabled={syncing} />
      </Appbar.Header>

      {loading && !campaigns.length ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error && !campaigns.length ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 170 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
            {PERIODS.map((item) => {
              const active = period === item.value;
              return (
                <Pressable key={item.value} onPress={() => choosePeriod(item.value)} style={[styles.periodChip, active && styles.periodChipActive]}>
                  <Text style={[styles.periodText, active && styles.periodTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.tilesRow}>
            {tiles.map((tile) => (
              <View key={tile.label} style={styles.tile}>
                <View style={[styles.tileIcon, { backgroundColor: tile.bg }]}><Ionicons name={tile.icon} size={17} color={tile.tint} /></View>
                <Text style={styles.tileValue}>{tile.value}</Text>
                <Text style={styles.tileLabel} numberOfLines={1}>{tile.label}</Text>
              </View>
            ))}
          </View>

          {syncing ? <Text style={styles.syncingText}>Syncing ad insights…</Text> : null}

          {focusCampaigns.length ? (
            <View style={styles.focusCard}>
              <View style={styles.focusHeading}>
                <Ionicons name="locate-outline" size={16} color={colors.text} />
                <Text style={styles.focusTitle}>Where to focus</Text>
              </View>
              {focusCampaigns.map((c) => {
                const isGood = c.verdict === "high_quality";
                return (
                  <Pressable
                    key={c.id} style={[styles.focusRow, { backgroundColor: isGood ? "#dcfce7" : "#fef3c7" }]}
                    onPress={() => router.push(`/(app)/more/campaigns/${c.id}`)}
                  >
                    <Text style={styles.focusEmoji}>{isGood ? "🎯" : "⚠️"}</Text>
                    <View style={styles.focusCopy}>
                      <Text style={[styles.focusName, { color: isGood ? "#15803d" : "#b45309" }]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[styles.focusReason, { color: isGood ? "#15803d" : "#b45309" }]}>{c.verdict_reason}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {campaigns.length ? (
            <View style={styles.segment}>
              <Pressable style={[styles.segmentButton, tab === "active" && styles.segmentActive]} onPress={() => setTab("active")}>
                <Text style={[styles.segmentText, tab === "active" && styles.segmentTextActive]}>Active ({activeCount})</Text>
              </Pressable>
              <Pressable style={[styles.segmentButton, tab === "inactive" && styles.segmentActive]} onPress={() => setTab("inactive")}>
                <Text style={[styles.segmentText, tab === "inactive" && styles.segmentTextActive]}>Inactive ({inactiveCount})</Text>
              </Pressable>
            </View>
          ) : null}

          {!campaigns.length ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="megaphone-outline" size={32} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>No campaigns yet</Text>
              <Text style={styles.emptyText}>Tap + to create your first campaign and track what each rupee brings in.</Text>
            </View>
          ) : !visible.length ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="megaphone-outline" size={32} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>No {tab} campaigns</Text>
            </View>
          ) : visible.map((c) => {
            const status = STATUS_STYLE[c.status] || STATUS_STYLE.draft;
            const source = SOURCE_ICON[c.source] || SOURCE_ICON.other;
            const verdict = c.verdict ? VERDICT_STYLE[c.verdict] : null;
            const spend = Number(c.actual_spend) || 0;
            const budget = Number(c.budget) || 0;
            const usedPct = budget > 0 ? Math.min(100, Math.round((spend / budget) * 100)) : null;
            const ctr = Number(c.impressions) > 0 ? ((Number(c.clicks || 0) / Number(c.impressions)) * 100).toFixed(1) : null;
            const start = shortDate(c.start_date);
            const end = shortDate(c.end_date);
            return (
              <Pressable key={c.id} style={styles.card} onPress={() => router.push(`/(app)/more/campaigns/${c.id}`)}>
                <View style={styles.cardTop}>
                  <View style={[styles.sourceIcon, { backgroundColor: source.bg }]}><Ionicons name={source.icon} size={20} color={source.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={2}>{c.name}</Text>
                    <View style={styles.tagsRow}>
                      <Text style={styles.cardSource}>{pretty(c.source)}</Text>
                      {c.meta_campaign_id ? <View style={styles.metaTag}><Text style={styles.metaTagText}>Meta synced</Text></View> : null}
                      {c.is_priority ? <View style={styles.priorityTag}><Ionicons name="star" size={9} color="#7c3aed" /><Text style={styles.priorityTagText}>Priority</Text></View> : null}
                    </View>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>

                {c.verdict_label && verdict ? (
                  <View style={[styles.verdictBanner, { backgroundColor: verdict.bg }]}>
                    <Text style={[styles.verdictText, { color: verdict.text }]}>{c.verdict_label}</Text>
                  </View>
                ) : null}

                {budget > 0 ? (
                  <View>
                    <View style={styles.budgetRow}>
                      <Text style={styles.budgetText}><Text style={styles.budgetSpent}>{money(spend)}</Text> of {money(budget)}</Text>
                      {usedPct != null ? <Text style={styles.budgetPct}>{usedPct}%</Text> : null}
                    </View>
                    <View style={styles.track}><View style={[styles.fill, { width: `${usedPct || 0}%`, backgroundColor: (usedPct || 0) > 90 ? "#ef4444" : colors.primary }]} /></View>
                  </View>
                ) : (
                  <Text style={styles.budgetText}>Spent <Text style={styles.budgetSpent}>{money(spend)}</Text></Text>
                )}

                <View style={styles.statsRow}>
                  <View style={styles.statBox}><Text style={styles.statValue}>{num(c.total_leads)}</Text><Text style={styles.statLabel}>Leads</Text></View>
                  <View style={styles.statBox}><Text style={[styles.statValue, { color: colors.primary }]}>₹{Math.round(c.cpl || 0)}</Text><Text style={styles.statLabel}>Cost / lead</Text></View>
                  <View style={styles.statBox}><Text style={styles.statValue}>{num(c.won_leads)}</Text><Text style={styles.statLabel}>Won</Text></View>
                  {ctr != null ? <View style={styles.statBox}><Text style={styles.statValue}>{ctr}%</Text><Text style={styles.statLabel}>CTR</Text></View> : null}
                </View>

                <View style={styles.cardBottom}>
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.dateText}>{start || end ? `${start || "—"} → ${end || "ongoing"}` : "No dates set"}</Text>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable style={styles.iconAction} hitSlop={6} onPress={() => router.push({ pathname: "/(app)/more/campaigns/new", params: { id: c.id } })}>
                      <Ionicons name="pencil-outline" size={17} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable style={[styles.iconAction, { backgroundColor: colors.dangerSoft }]} hitSlop={6} onPress={() => confirmDelete(c)}>
                      <Ionicons name="trash-outline" size={17} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {hasMore ? (
            <Pressable style={styles.loadMore} onPress={() => load({ nextPage: page + 1 })} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.loadMoreText}>Load more campaigns</Text>}
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {!loading || campaigns.length ? (
        <Pressable accessibilityLabel="New campaign" style={[styles.fabWrap, { bottom: 64 + Math.max(insets.bottom, 8) + 16 }]} onPress={() => router.push("/(app)/more/campaigns/new")}>
          <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
            <Ionicons name="add" size={30} color="#fff" />
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  content: { padding: 14, gap: 12 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },
  errorText: { color: colors.textSecondary, textAlign: "center" },
  retry: { marginTop: 6 },

  periodRow: { gap: 8, paddingVertical: 2 },
  periodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7e6f1" },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  periodTextActive: { color: "#ffffff" },

  tilesRow: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#e2eef7", paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tileValue: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 8 },
  tileLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 1 },
  syncingText: { color: colors.primary, fontSize: 12, fontWeight: "700", textAlign: "center" },

  focusCard: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 10 },
  focusHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  focusTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  focusRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 10 },
  focusEmoji: { fontSize: 14, marginTop: 1 },
  focusCopy: { flex: 1 },
  focusName: { fontSize: 13, fontWeight: "800" },
  focusReason: { fontSize: 11, marginTop: 2 },

  segment: { flexDirection: "row", backgroundColor: "#eaf1f7", borderRadius: 14, padding: 4 },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", height: 38, borderRadius: 11 },
  segmentActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: colors.primary },

  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  sourceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  tagsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  cardSource: { color: colors.textSecondary, fontSize: 11 },
  metaTag: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  metaTagText: { color: colors.primary, fontSize: 9, fontWeight: "800" },
  priorityTag: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#ede9fe", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  priorityTagText: { color: "#7c3aed", fontSize: 9, fontWeight: "800" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "800" },
  verdictBanner: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  verdictText: { fontSize: 12, fontWeight: "700" },

  budgetRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  budgetText: { color: colors.textSecondary, fontSize: 12 },
  budgetSpent: { color: colors.text, fontWeight: "800" },
  budgetPct: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  track: { height: 7, borderRadius: 4, backgroundColor: "#eef4f9", overflow: "hidden" },
  fill: { height: 7, borderRadius: 4 },

  statsRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: "#f8fbfd", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "900" },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2 },

  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  dateText: { color: colors.textMuted, fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 8 },
  iconAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#eef4f9", alignItems: "center", justifyContent: "center" },

  loadMore: { alignItems: "center", justifyContent: "center", height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  loadMoreText: { color: colors.primary, fontSize: 14, fontWeight: "800" },

  fabWrap: { position: "absolute", right: 18 },
  fab: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", shadowColor: "#4f46e5", shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
});
