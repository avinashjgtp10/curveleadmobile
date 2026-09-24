import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
import axios from "axios";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { Campaign, CampaignAd, CampaignLead, fetchCampaign, fetchCampaignAds } from "@/api/campaigns";
import { useStages } from "@/hooks/useStages";

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

const SCORE_COLORS: Record<string, { bg: string; text: string }> = {
  hot: { bg: colors.dangerSoft, text: colors.danger },
  warm: { bg: colors.warningSoft, text: colors.warning },
  cold: { bg: colors.surfaceMuted, text: colors.textSecondary },
};

function Dropdown({ value, options, open, onToggle, onSelect }: {
  value: string; options: { value: string; label: string }[]; open: boolean; onToggle: () => void; onSelect: (value: string) => void;
}) {
  const selected = options.find((item) => item.value === value) || options[0];
  return (
    <View style={styles.dropdownWrap}>
      <Pressable style={styles.dropdownField} onPress={onToggle}>
        <Text style={styles.dropdownFieldText} numberOfLines={1}>{selected?.label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <ScrollView style={styles.dropdownPanel} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {options.map((item) => (
            <Pressable key={item.value || "all"} style={styles.dropdownItem} onPress={() => onSelect(item.value)}>
              <Text style={[styles.dropdownItemText, item.value === value && styles.dropdownItemTextSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

export default function CampaignDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stages } = useStages();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [ads, setAds] = useState<CampaignAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"stage" | "score" | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const params: { stage?: string; lead_score?: string; search?: string } = {};
      if (stageFilter) params.stage = stageFilter;
      if (scoreFilter) params.lead_score = scoreFilter;
      if (search.trim()) params.search = search.trim();
      const { campaign: data, recentLeads } = await fetchCampaign(id, params);
      setCampaign(data);
      setLeads(recentLeads || []);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load this campaign."));
    } finally {
      setLoading(false);
    }
  }, [id, stageFilter, scoreFilter, search]);

  // `load` intentionally excluded below; search changes are debounced separately further down
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id, stageFilter, scoreFilter]);

  useEffect(() => {
    if (!id) return;
    fetchCampaignAds(id).then(setAds).catch(() => {});
  }, [id]);

  const isFirstSearch = React.useRef(true);
  useEffect(() => {
    if (isFirstSearch.current) { isFirstSearch.current = false; return; }
    const timer = setTimeout(() => load(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = !!(stageFilter || scoreFilter || search);

  function clearFilters() {
    setStageFilter(""); setScoreFilter(""); setSearch("");
  }

  const stats = campaign ? [
    { label: "Budget", value: money(campaign.budget), icon: "cash-outline" as const, tone: colors.primary, toneSoft: colors.primarySoft },
    { label: "Spent", value: money(campaign.actual_spend), icon: "trending-up-outline" as const, tone: colors.warning, toneSoft: colors.warningSoft },
    { label: "Leads", value: String(campaign.total_leads || 0), icon: "people-outline" as const, tone: colors.success, toneSoft: colors.successSoft },
    { label: "CPL", value: `₹${Math.round(campaign.cpl || 0)}`, icon: "locate-outline" as const, tone: "#7C3AED", toneSoft: "#EDE9FE" },
    ...(campaign.meta_campaign_id ? [
      { label: "Impressions", value: Number(campaign.impressions || 0).toLocaleString("en-IN"), icon: "eye-outline" as const, tone: "#0891B2", toneSoft: "#CFFAFE" },
      { label: "Clicks", value: Number(campaign.clicks || 0).toLocaleString("en-IN"), icon: "hand-left-outline" as const, tone: "#4F46E5", toneSoft: "#E0E7FF" },
    ] : []),
  ] : [];

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Campaign Detail" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error || !campaign ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error || "Campaign not found."}</Text>
          <Button mode="contained" onPress={() => { setLoading(true); load(); }} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.headerCard}>
            <View style={styles.headerCardTop}>
              <Text style={styles.campaignName}>{campaign.name}</Text>
              {campaign.meta_campaign_id ? <View style={styles.metaTag}><Text style={styles.metaTagText}>Meta Synced</Text></View> : null}
            </View>
            <Text style={styles.campaignSource}>{pretty(campaign.source)}</Text>
          </View>

          <View style={styles.statsGrid}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: stat.toneSoft }]}>
                  <Ionicons name={stat.icon} size={18} color={stat.tone} />
                </View>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            ))}
          </View>

          {ads.length ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="megaphone-outline" size={16} color={colors.primary} />
                <Text style={styles.cardTitle}>Ads in this Campaign</Text>
              </View>
              {ads.map((ad, index) => (
                <View key={ad.id} style={[styles.adRow, index === ads.length - 1 && styles.adRowLast]}>
                  <Text style={styles.adName} numberOfLines={1}>{ad.name || ad.meta_ad_id}</Text>
                  <View style={styles.adStatsRow}>
                    <Text style={styles.adStat}>{money(ad.spend)} spend</Text>
                    <Text style={styles.adStat}>{Number(ad.impressions || 0).toLocaleString("en-IN")} impr.</Text>
                    <Text style={styles.adStat}>{Number(ad.clicks || 0).toLocaleString("en-IN")} clicks</Text>
                    <Text style={[styles.adStat, styles.adLeads]}>{ad.total_leads || 0} leads</Text>
                    <Text style={[styles.adStat, styles.adCpl]}>₹{ad.cpl || 0} CPL</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.leadsHeaderRow}>
              <Text style={styles.cardTitle}>
                Leads from this campaign ({leads.length}{hasFilters ? ` of ${campaign.total_leads || 0}` : ""})
              </Text>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={14} color={colors.textMuted} />
                <RNTextInput
                  style={styles.searchInput} value={search} onChangeText={setSearch}
                  placeholder="Search name or phone…" placeholderTextColor={colors.textMuted}
                />
              </View>
              <Pressable
                style={[styles.filterButton, (filtersOpen || hasFilters) && styles.filterButtonActive]}
                onPress={() => { setFiltersOpen((value) => !value); setOpenDropdown(null); }}
              >
                <Ionicons name="options-outline" size={18} color={filtersOpen || hasFilters ? "#fff" : colors.textSecondary} />
              </Pressable>
            </View>

            {filtersOpen ? (
              <View style={styles.filtersRow}>
                <Dropdown
                  value={stageFilter} options={[{ value: "", label: "All stages" }, ...stages.map((s) => ({ value: s.name, label: s.name }))]}
                  open={openDropdown === "stage"} onToggle={() => setOpenDropdown(openDropdown === "stage" ? null : "stage")}
                  onSelect={(value) => { setStageFilter(value); setOpenDropdown(null); }}
                />
                <Dropdown
                  value={scoreFilter} options={[{ value: "", label: "All scores" }, { value: "hot", label: "Hot" }, { value: "warm", label: "Warm" }, { value: "cold", label: "Cold" }]}
                  open={openDropdown === "score"} onToggle={() => setOpenDropdown(openDropdown === "score" ? null : "score")}
                  onSelect={(value) => { setScoreFilter(value); setOpenDropdown(null); }}
                />
                {hasFilters ? (
                  <Pressable style={styles.clearButton} onPress={clearFilters}>
                    <Ionicons name="close" size={13} color={colors.textMuted} />
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {leads.length ? leads.map((lead) => {
              const scoreColors = lead.lead_score ? SCORE_COLORS[lead.lead_score] : null;
              return (
                <Pressable
                  key={lead.id} style={styles.leadRow}
                  onPress={() => router.push({ pathname: "/(app)/leads/[id]", params: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage || "new" } })}
                >
                  <View style={styles.leadInfo}>
                    <Text style={styles.leadName}>{lead.name}</Text>
                    <Text style={styles.leadMeta}>{lead.phone} • {lead.stage}</Text>
                  </View>
                  <View style={styles.leadRight}>
                    <Text style={styles.leadDate}>
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                    </Text>
                    {scoreColors ? (
                      <View style={[styles.scorePill, { backgroundColor: scoreColors.bg }]}>
                        <Text style={[styles.scorePillText, { color: scoreColors.text }]}>{lead.lead_score?.toUpperCase()}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            }) : (
              <Text style={styles.emptyLeadsText}>{hasFilters ? "No leads match these filters" : "No leads from this campaign yet"}</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { color: colors.text, fontWeight: "700" },
  content: { padding: 16 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  errorText: { color: colors.textSecondary, textAlign: "center", marginBottom: 12 },
  retry: { marginTop: 4 },

  headerCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 16, marginBottom: 14 },
  headerCardTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  campaignName: { color: colors.text, fontSize: 18, fontWeight: "800", flexShrink: 1 },
  metaTag: { backgroundColor: colors.primarySoft, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  metaTagText: { color: colors.primary, fontSize: 9, fontWeight: "800" },
  campaignSource: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  statCard: { width: "47%", backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 14 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statLabel: { color: colors.textSecondary, fontSize: 11 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 2 },

  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 16, marginBottom: 14 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },

  adRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  adRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  adName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  adStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  adStat: { color: colors.textSecondary, fontSize: 11 },
  adLeads: { color: colors.success, fontWeight: "700" },
  adCpl: { color: colors.primary, fontWeight: "700" },

  leadsHeaderRow: { marginBottom: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, height: 38 },
  searchInput: { flex: 1, color: colors.text, fontSize: 12 },
  filterButton: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 },
  dropdownWrap: { minWidth: 130 },
  dropdownField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4, height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10 },
  dropdownFieldText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  dropdownPanel: { position: "absolute", top: 40, left: 0, right: 0, maxHeight: 220, zIndex: 10, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSoft, elevation: 6, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10 },
  dropdownItemText: { color: colors.text, fontSize: 12 },
  dropdownItemTextSelected: { color: colors.primary, fontWeight: "700" },
  clearButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  clearButtonText: { color: colors.textMuted, fontSize: 12 },

  leadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  leadInfo: { flex: 1 },
  leadName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  leadMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  leadRight: { alignItems: "flex-end", gap: 4 },
  leadDate: { color: colors.textMuted, fontSize: 11 },
  scorePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  scorePillText: { fontSize: 9, fontWeight: "800" },
  emptyLeadsText: { color: colors.textMuted, textAlign: "center", paddingVertical: 24, fontSize: 12 },
});
