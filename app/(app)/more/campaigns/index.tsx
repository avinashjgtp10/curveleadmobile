import React, { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { Campaign, deleteCampaign, fetchCampaigns } from "@/api/campaigns";
import { syncAdInsights } from "@/api/integrations";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: colors.successSoft, text: colors.success },
  paused: { bg: colors.warningSoft, text: colors.warning },
  completed: { bg: colors.surfaceMuted, text: colors.textSecondary },
  draft: { bg: colors.primarySoft, text: colors.primary },
};

const VERDICT_COLORS: Record<string, { bg: string; text: string }> = {
  high_quality: { bg: colors.successSoft, text: colors.success },
  high_volume_low_quality: { bg: colors.warningSoft, text: colors.warning },
  underperforming: { bg: colors.surfaceMuted, text: colors.textSecondary },
  average: { bg: colors.surfaceMuted, text: colors.textSecondary },
  too_early: { bg: colors.primarySoft, text: colors.primary },
  no_leads: { bg: colors.surfaceMuted, text: colors.textMuted },
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

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"active" | "inactive">("active");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      setCampaigns(await fetchCampaigns());
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load campaigns."));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Campaigns" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        >
          <Text style={styles.subtitle}>Track ad spend and ROI for your marketing campaigns</Text>

          <View style={styles.actionsRow}>
            <Button mode="outlined" compact icon="sync" onPress={handleSync} loading={syncing} disabled={syncing} style={styles.syncButton}>
              {syncing ? "Syncing…" : "Sync Ad Insights"}
            </Button>
            <Button
              mode="contained" compact icon="plus" style={styles.newButton}
              onPress={() => router.push("/(app)/more/campaigns/new")}
            >
              New Campaign
            </Button>
          </View>

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
                    key={c.id} style={[styles.focusRow, { backgroundColor: isGood ? colors.successSoft : colors.warningSoft }]}
                    onPress={() => router.push(`/(app)/more/campaigns/${c.id}`)}
                  >
                    <Text style={styles.focusEmoji}>{isGood ? "🎯" : "⚠️"}</Text>
                    <View style={styles.focusCopy}>
                      <Text style={[styles.focusName, { color: isGood ? colors.success : colors.warning }]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[styles.focusReason, { color: isGood ? colors.success : colors.warning }]}>{c.verdict_reason}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {campaigns.length ? (
            <View style={styles.tabsRow}>
              <Pressable style={[styles.tab, tab === "active" && styles.tabActive]} onPress={() => setTab("active")}>
                <Text style={[styles.tabText, tab === "active" && styles.tabTextActive]}>Active ({activeCount})</Text>
              </Pressable>
              <Pressable style={[styles.tab, tab === "inactive" && styles.tabActive]} onPress={() => setTab("inactive")}>
                <Text style={[styles.tabText, tab === "inactive" && styles.tabTextActive]}>Inactive ({inactiveCount})</Text>
              </Pressable>
            </View>
          ) : null}

          {!campaigns.length ? (
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No campaigns yet. Create your first campaign to track ROI.</Text>
            </View>
          ) : !visible.length ? (
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No {tab} campaigns.</Text>
            </View>
          ) : visible.map((c) => {
            const statusColors = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
            const verdictColors = c.verdict ? VERDICT_COLORS[c.verdict] : null;
            return (
              <Pressable key={c.id} style={styles.card} onPress={() => router.push(`/(app)/more/campaigns/${c.id}`)}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardNameCol}>
                    <Text style={styles.cardName} numberOfLines={2}>{c.name}</Text>
                    <View style={styles.cardTagsRow}>
                      {c.meta_campaign_id ? <View style={styles.metaTag}><Text style={styles.metaTagText}>Meta Synced</Text></View> : null}
                      <Text style={styles.cardSource}>{pretty(c.source)}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
                    <Text style={[styles.statusPillText, { color: statusColors.text }]}>{c.status?.toUpperCase()}</Text>
                  </View>
                </View>

                {c.verdict_label && verdictColors ? (
                  <View style={[styles.verdictBanner, { backgroundColor: verdictColors.bg }]}>
                    <Text style={[styles.verdictText, { color: verdictColors.text }]}>{c.verdict_label}</Text>
                  </View>
                ) : null}

                <View style={styles.statsBlock}>
                  <StatRow label="Budget" value={money(c.budget)} />
                  <StatRow label="Spent" value={money(c.actual_spend)} />
                  {c.meta_campaign_id && (c.impressions != null || c.clicks != null) ? (
                    <>
                      <StatRow label="Impressions" value={Number(c.impressions || 0).toLocaleString("en-IN")} />
                      <StatRow label="Clicks" value={Number(c.clicks || 0).toLocaleString("en-IN")} />
                    </>
                  ) : null}
                  <StatRow label="Leads" value={String(c.total_leads || 0)} />
                  {c.total_leads ? <StatRow label="Won / Disqualified" value={`${c.won_leads || 0} / ${c.lost_leads || 0}`} /> : null}
                  <View style={styles.cplRow}>
                    <Text style={styles.cplLabel}>CPL</Text>
                    <Text style={styles.cplValue}>₹{Math.round(c.cpl || 0)}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.cardActionButton}
                    onPress={() => router.push({ pathname: "/(app)/more/campaigns/new", params: { id: c.id } })}
                  >
                    <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.cardActionText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.cardActionButton} onPress={() => confirmDelete(c)}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={[styles.cardActionText, { color: colors.danger }]}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.statRow}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { color: colors.text, fontWeight: "700" },
  content: { padding: 16 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
  actionsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  syncButton: { flex: 1 },
  newButton: { flex: 1 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  errorText: { color: colors.textSecondary, textAlign: "center", marginBottom: 12 },
  retry: { marginTop: 4 },

  focusCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 16, marginBottom: 16, gap: 10 },
  focusHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  focusTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  focusRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 10, padding: 10 },
  focusEmoji: { fontSize: 14, marginTop: 1 },
  focusCopy: { flex: 1 },
  focusName: { fontSize: 13, fontWeight: "700" },
  focusReason: { fontSize: 11, marginTop: 2 },

  tabsRow: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: 10, padding: 3, marginBottom: 14, alignSelf: "flex-start" },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: colors.text },

  empty: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", paddingHorizontal: 30 },

  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 16, marginBottom: 14 },
  cardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardNameCol: { flex: 1 },
  cardName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  cardTagsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" },
  metaTag: { backgroundColor: colors.primarySoft, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  metaTagText: { color: colors.primary, fontSize: 9, fontWeight: "800" },
  cardSource: { color: colors.textSecondary, fontSize: 11 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: "800" },

  verdictBanner: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12 },
  verdictText: { fontSize: 11, fontWeight: "700" },

  statsBlock: { marginTop: 12, gap: 8 },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statLabel: { color: colors.textSecondary, fontSize: 13 },
  statValue: { color: colors.text, fontSize: 13, fontWeight: "700" },
  cplRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 8, marginTop: 2 },
  cplLabel: { color: colors.textSecondary, fontSize: 13 },
  cplValue: { color: colors.primary, fontSize: 14, fontWeight: "800" },

  cardActions: { flexDirection: "row", gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  cardActionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  cardActionText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
});
