import { GlassBackground, glass } from "@/components/Glass";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Chip, Divider, List, Searchbar, Switch, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { useStages } from "@/hooks/useStages";
import { fetchLeads, LeadListItem } from "@/api/leads";

const PAGE_SIZE = 25;
const STATUS_FILTERS = [
  { value: "", label: "All Status" },
  { value: "in_progress", label: "In Progress" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function stageKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, "_");
}

function pretty(value?: string) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusFor(lead: LeadListItem, wonStages: string[], lostStages: string[]) {
  const stage = (lead.stage || "").toLowerCase();
  if (wonStages.includes(stage)) return "Converted";
  if (lostStages.includes(stage)) return "Lost";
  return "In Progress";
}

function statTone(value: string) {
  if (value === "converted") return { icon: "checkmark-circle-outline" as const, bg: "#d1fae5", color: colors.success };
  if (value === "lost") return { icon: "close-circle-outline" as const, bg: "#ffe4e6", color: colors.danger };
  if (value === "in_progress") return { icon: "time-outline" as const, bg: "#fef3c7", color: colors.warning };
  return { icon: "people-outline" as const, bg: "#e0e7ff", color: "#4f46e5" };
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  const item = statTone(tone);
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon} size={18} color={colors.surface} />
      </View>
      <View style={styles.statGlow} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value.toLocaleString("en-IN")}</Text>
    </View>
  );
}

function AutomationLeadRow({ lead, wonStages, lostStages }: { lead: LeadListItem; wonStages: string[]; lostStages: string[] }) {
  const status = statusFor(lead, wonStages, lostStages);
  const statusColor = status === "Converted" ? colors.success : status === "Lost" ? colors.danger : colors.warning;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: "/(app)/leads/[id]",
        params: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage || "new", source: lead.source || "" },
      })}
      style={({ pressed }) => [styles.leadRow, pressed && styles.pressed]}
    >
      <View style={styles.leadIdentity}>
        <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
        <Text style={styles.leadPhone} numberOfLines={1}>{lead.phone}</Text>
      </View>
      <View style={styles.leadMeta}>
        <Text style={styles.stepText} numberOfLines={1}>{pretty(lead.stage || "new")}</Text>
        <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function SettingRow({ title, description, value, onValueChange }: {
  title: string; description: string; value: boolean; onValueChange: (value: boolean) => void;
}) {
  return (
    <List.Item
      title={title}
      description={description}
      titleStyle={styles.settingTitle}
      descriptionStyle={styles.settingDescription}
      right={() => <Switch value={value} onValueChange={onValueChange} color={colors.primary} />}
      style={styles.settingRow}
    />
  );
}

export default function LeadAutomationScreen() {
  const insets = useSafeAreaInsets();
  const { stages } = useStages();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const [tab, setTab] = useState<"leads" | "settings">("leads");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ inProgress: 0, converted: 0, lost: 0 });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState({
    autoAssign: true,
    followupReminders: true,
    inactiveLeadNudge: true,
    conversionAlerts: true,
  });
  const activeFilterCount = [query, statusFilter, stageFilter].filter(Boolean).length;

  const wonStages = useMemo(() => {
    const configured = stages.filter((stage) => stage.is_won).map((stage) => stage.name.toLowerCase());
    return configured.length ? configured : ["won", "converted", "enrolled"];
  }, [stages]);

  const lostStages = useMemo(() => {
    const configured = stages.filter((stage) => stage.is_lost).map((stage) => stage.name.toLowerCase());
    return configured.length ? configured : ["lost"];
  }, [stages]);

  const availableStages = useMemo(() => stages.length ? stages : [
    { id: "new", name: "New", color: "blue", statuses: [] },
    { id: "contacted", name: "Contacted", color: "yellow", statuses: [] },
    { id: "qualified", name: "Qualified", color: "green", statuses: [] },
  ], [stages]);

  function paramsForStatus() {
    if (stageFilter) return { stage: stageKey(stageFilter) };
    if (statusFilter === "converted") return { stage: wonStages[0] };
    if (statusFilter === "lost") return { stage: lostStages[0] };
    if (statusFilter === "in_progress") return { hide_stages: [...wonStages, ...lostStages].join(",") };
    return {};
  }

  const load = useCallback(async (nextPage = 1, append = false) => {
    const id = ++requestId.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const [leadResult, totalResult, convertedResult, lostResult] = await Promise.all([
        fetchLeads({
          page: nextPage,
          limit: PAGE_SIZE,
          ...(query ? { search: query } : null),
          ...paramsForStatus(),
        }),
        append ? Promise.resolve(null) : fetchLeads({ page: 1, limit: 1 }),
        append ? Promise.resolve(null) : fetchLeads({ page: 1, limit: 1, stage: wonStages[0] }),
        append ? Promise.resolve(null) : fetchLeads({ page: 1, limit: 1, stage: lostStages[0] }),
      ]);
      if (id !== requestId.current) return;
      setLeads((current) => append ? [...current, ...leadResult.leads.filter((lead) => !current.some((item) => item.id === lead.id))] : leadResult.leads);
      setTotal(leadResult.pagination.total);
      setPage(leadResult.pagination.page);
      setPages(leadResult.pagination.pages);
      if (totalResult && convertedResult && lostResult) {
        const converted = convertedResult.pagination.total;
        const lost = lostResult.pagination.total;
        setStats({ converted, lost, inProgress: Math.max(0, totalResult.pagination.total - converted - lost) });
      }
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(errorMessage(loadError, "Could not load automation leads."));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [query, statusFilter, stageFilter, wonStages, lostStages]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  function updateSearch(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQuery(value.trim()), 350);
  }

  function refresh() {
    setRefreshing(true);
    load();
  }

  function setSetting(key: keyof typeof settings, value: boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    updateSearch("");
    setQuery("");
    setStatusFilter("");
    setStageFilter("");
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Lead Automation" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="refresh" onPress={refresh} disabled={loading || refreshing} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 104 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <LinearGradient colors={["#4f46e5", "#4338ca"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="git-network-outline" size={24} color={colors.surface} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Lead Automation</Text>
            <Text style={styles.heroSubtitle}>Automate and track your lead follow-up journey.</Text>
          </View>
          <View style={styles.heroCircleLarge} />
          <View style={styles.heroCircleSmall} />
        </LinearGradient>

        <View style={styles.statsGrid}>
          <StatCard label="Total Leads" value={total || stats.inProgress + stats.converted + stats.lost} tone="total" />
          <StatCard label="In Progress" value={stats.inProgress} tone="in_progress" />
          <StatCard label="Converted" value={stats.converted} tone="converted" />
          <StatCard label="Lost" value={stats.lost} tone="lost" />
        </View>

        <View style={styles.tabs}>
          <Pressable onPress={() => setTab("leads")} style={[styles.tabButton, tab === "leads" && styles.tabActive]}>
            <Text style={[styles.tabText, tab === "leads" && styles.tabTextActive]}>Automation Leads</Text>
          </Pressable>
          <Pressable onPress={() => setTab("settings")} style={[styles.tabButton, tab === "settings" && styles.tabActive]}>
            <Ionicons name="settings-outline" size={14} color={tab === "settings" ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, tab === "settings" && styles.tabTextActive]}>Automation Settings</Text>
          </Pressable>
        </View>

        {tab === "leads" ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Automation Leads</Text>
              <Button
                mode={activeFilterCount ? "contained" : "outlined"}
                icon="filter-variant"
                compact
                onPress={() => setFiltersOpen(true)}
                style={styles.filterButton}
              >
                {activeFilterCount ? `Filters (${activeFilterCount})` : "Filters"}
              </Button>
            </View>
            {activeFilterCount ? (
              <View style={styles.activeFilters}>
                {query ? <Chip compact onClose={() => updateSearch("")} style={styles.activeFilterChip}>Search: {query}</Chip> : null}
                {statusFilter ? <Chip compact onClose={() => setStatusFilter("")} style={styles.activeFilterChip}>{STATUS_FILTERS.find((item) => item.value === statusFilter)?.label}</Chip> : null}
                {stageFilter ? <Chip compact onClose={() => setStageFilter("")} style={styles.activeFilterChip}>Step: {stageFilter}</Chip> : null}
              </View>
            ) : null}

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.nameColumn]}>Lead Name</Text>
              <Text style={[styles.tableHeaderText, styles.stepColumn]}>Current Step</Text>
            </View>

            {loading && !leads.length ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Loading automation leads...</Text>
              </View>
            ) : error && !leads.length ? (
              <View style={styles.center}>
                <Text style={styles.errorTitle}>Could not load leads</Text>
                <Text style={styles.errorText}>{error}</Text>
                <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
              </View>
            ) : leads.length ? (
              <View style={styles.leadsList}>
                {leads.map((lead) => <AutomationLeadRow key={lead.id} lead={lead} wonStages={wonStages} lostStages={lostStages} />)}
                {page < pages ? (
                  <Button mode="outlined" loading={loadingMore} disabled={loadingMore} onPress={() => load(page + 1, true)} style={styles.loadMore}>
                    Load more
                  </Button>
                ) : null}
              </View>
            ) : (
              <View style={styles.center}>
                <Text style={styles.errorTitle}>No automation leads</Text>
                <Text style={styles.errorText}>Try changing the status, step, or search.</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.panel, styles.settingsPanel]}>
            <View style={styles.settingsIntro}>
              <Text style={styles.panelTitle}>Automation Settings</Text>
              <Text style={styles.panelSubtitle}>Configure the same follow-up workflow controls for mobile.</Text>
            </View>
            <View style={styles.settingsList}>
              <SettingRow title="Auto Assign New Leads" description="Route fresh leads to available team members." value={settings.autoAssign} onValueChange={(value) => setSetting("autoAssign", value)} />
              <Divider />
              <SettingRow title="Follow-up Reminders" description="Notify users before pending lead activities." value={settings.followupReminders} onValueChange={(value) => setSetting("followupReminders", value)} />
              <Divider />
              <SettingRow title="Inactive Lead Nudges" description="Surface leads that have not moved recently." value={settings.inactiveLeadNudge} onValueChange={(value) => setSetting("inactiveLeadNudge", value)} />
              <Divider />
              <SettingRow title="Conversion Alerts" description="Alert admins when a lead is converted or lost." value={settings.conversionAlerts} onValueChange={(value) => setSetting("conversionAlerts", value)} />
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.filterBackdrop}>
          <View style={[styles.filterPanel, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.filterTopBar}>
              <Pressable accessibilityRole="button" onPress={() => setFiltersOpen(false)} style={styles.filterBackButton}>
                <Ionicons name="arrow-back" size={30} color={colors.text} />
              </Pressable>
              <Text style={styles.filterTitle}>Filters</Text>
            </View>
            <ScrollView style={styles.filterContent} contentContainerStyle={styles.filterContentInner} showsVerticalScrollIndicator={false}>
            <Searchbar
              value={search}
              onChangeText={updateSearch}
              placeholder="Search Lead"
              style={styles.search}
              inputStyle={styles.searchInput}
            />

            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.sheetChipRow}>
              {STATUS_FILTERS.map((item) => (
                <Chip
                  key={item.value || "all"}
                  selected={statusFilter === item.value}
                  showSelectedCheck={false}
                  onPress={() => setStatusFilter(item.value)}
                  style={[styles.filterChip, statusFilter === item.value && styles.filterChipActive]}
                >
                  {item.label}
                </Chip>
              ))}
            </View>

            <Text style={styles.filterLabel}>Steps</Text>
            <View style={styles.sheetChipRow}>
              <Chip selected={!stageFilter} showSelectedCheck={false} onPress={() => setStageFilter("")} style={[styles.filterChip, !stageFilter && styles.filterChipActive]}>All Steps</Chip>
              {availableStages.map((stage) => (
                <Chip
                  key={stage.id || stage.name}
                  selected={stageFilter === stage.name}
                  showSelectedCheck={false}
                  onPress={() => setStageFilter(stageFilter === stage.name ? "" : stage.name)}
                  style={[styles.filterChip, stageFilter === stage.name && styles.filterChipActive]}
                >
                  {stage.name}
                </Chip>
              ))}
            </View>
            </ScrollView>

            <View style={styles.filterFooter}>
              <Button mode="outlined" onPress={clearFilters} style={styles.sheetActionButton} contentStyle={styles.filterActionContent}>Clear</Button>
              <Button mode="contained" onPress={() => setFiltersOpen(false)} style={styles.sheetActionButton} contentStyle={styles.filterActionContent}>Done</Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: "transparent" },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  hero: { minHeight: 98, borderRadius: 14, padding: 18, flexDirection: "row", alignItems: "center", overflow: "hidden", marginTop: 8 },
  heroIcon: { width: 44, height: 44, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginRight: 14 },
  heroCopy: { flex: 1, zIndex: 2 },
  heroTitle: { color: colors.surface, fontSize: 20, fontWeight: "900" },
  heroSubtitle: { color: "#e0e7ff", fontSize: 13, marginTop: 4 },
  heroCircleLarge: { position: "absolute", width: 126, height: 126, borderRadius: 63, backgroundColor: "rgba(255,255,255,0.12)", right: -30, top: -28 },
  heroCircleSmall: { position: "absolute", width: 78, height: 78, borderRadius: 39, backgroundColor: "rgba(255,255,255,0.13)", right: 44, bottom: -26 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 },
  statCard: { ...glass, width: "48%", minHeight: 118, borderRadius: 12, padding: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.82)" },
  statIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statGlow: { position: "absolute", width: 74, height: 74, borderRadius: 37, right: -14, top: -14, backgroundColor: "rgba(79,70,229,0.09)" },
  statLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 12 },
  statValue: { color: colors.text, fontSize: 26, fontWeight: "900", marginTop: 2 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 20, marginBottom: 14 },
  tabButton: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.48)" },
  tabActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  tabTextActive: { color: colors.primary },
  panel: { ...glass, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.88)", padding: 14 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: "900", lineHeight: 22 },
  panelSubtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 18 },
  settingsPanel: { paddingTop: 28 },
  settingsIntro: { marginBottom: 22 },
  filterButton: { borderRadius: 8 },
  activeFilters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  activeFilterChip: { backgroundColor: colors.primarySoft },
  search: { height: 44, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft },
  searchInput: { fontSize: 13, minHeight: 44 },
  filterChip: { borderRadius: 8, backgroundColor: colors.surface },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tableHeader: { flexDirection: "row", paddingTop: 18, paddingBottom: 8, paddingHorizontal: 2 },
  tableHeaderText: { color: colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  nameColumn: { flex: 1.1 },
  stepColumn: { flex: 0.9, textAlign: "right" },
  leadsList: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface },
  leadRow: { minHeight: 70, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  pressed: { backgroundColor: colors.primarySoft },
  leadIdentity: { flex: 1.1, minWidth: 0 },
  leadName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  leadPhone: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  leadMeta: { flex: 0.9, alignItems: "flex-end", minWidth: 0, marginHorizontal: 8 },
  stepText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", maxWidth: 130 },
  statusPill: { marginTop: 6, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "900" },
  loadMore: { margin: 12, borderRadius: 8 },
  center: { minHeight: 190, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  loadingText: { color: colors.textSecondary, fontSize: 12, marginTop: 10 },
  errorTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  errorText: { color: colors.textSecondary, fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 },
  retry: { marginTop: 14 },
  settingsList: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface },
  settingRow: { paddingVertical: 8 },
  settingTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  settingDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  filterBackdrop: { flex: 1, backgroundColor: colors.background },
  filterPanel: { flex: 1, backgroundColor: colors.background },
  filterTopBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, marginBottom: 24 },
  filterBackButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: 20 },
  filterTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  filterContent: { flex: 1 },
  filterContentInner: { paddingHorizontal: 24, paddingBottom: 24 },
  filterLabel: { color: colors.text, fontSize: 12, fontWeight: "900", marginTop: 18, marginBottom: 10 },
  sheetChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterFooter: { flexDirection: "row", gap: 14, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.background },
  sheetActionButton: { flex: 1 },
  filterActionContent: { height: 50 },
});
