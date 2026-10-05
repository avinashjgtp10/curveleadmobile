import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Switch, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  AutomationLead, AutomationRule, AutomationSequence, AutomationStatus, AutomationSummary,
  fetchAutomationLeads, fetchRules, fetchSequences, setRuleActive, setSequenceActive, triggerLabel,
} from "@/api/automations";

const PAGE_SIZE = 25;

type StatusKey = "" | "In Progress" | "Converted" | "Lost";

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

const STATUS_STYLE: Record<AutomationStatus, { color: string; bg: string }> = {
  "Not Enrolled": { color: "#64748b", bg: "#eef2f6" },
  "In Progress": { color: "#1d4ed8", bg: "#dbeafe" },
  Completed: { color: "#0f766e", bg: "#ccfbf1" },
  Cancelled: { color: "#6b7280", bg: "#f3f4f6" },
  Converted: { color: "#15803d", bg: "#dcfce7" },
  Lost: { color: "#b91c1c", bg: "#fee2e2" },
};

function StatTile({ label, value, icon, tint, bg, active, onPress }: {
  label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.statTile, active && { borderColor: tint, backgroundColor: bg }]}>
      <View style={[styles.statIcon, { backgroundColor: active ? "#ffffff" : bg }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.statValue}>{value.toLocaleString("en-IN")}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function LeadCard({ lead }: { lead: AutomationLead }) {
  const tone = STATUS_STYLE[lead.status] || STATUS_STYLE["Not Enrolled"];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: "/(app)/leads/[id]",
        params: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage || "new", source: lead.source || "" },
      })}
      style={({ pressed }) => [styles.leadCard, pressed && styles.pressed]}
    >
      <View style={[styles.leadAvatar, { backgroundColor: tone.bg }]}>
        <Text style={[styles.leadAvatarText, { color: tone.color }]}>{(lead.name?.charAt(0) || "?").toUpperCase()}</Text>
      </View>
      <View style={styles.leadBody}>
        <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
        <Text style={styles.leadPhone} numberOfLines={1}>{lead.phone}</Text>
        <View style={styles.leadTags}>
          <View style={styles.stepTag}>
            <Ionicons name="git-branch-outline" size={11} color={colors.primary} />
            <Text style={styles.stepTagText} numberOfLines={1}>{lead.step || "-"}</Text>
          </View>
          {lead.opted_out ? (
            <View style={styles.optOutTag}><Text style={styles.optOutText}>Opted out</Text></View>
          ) : null}
        </View>
      </View>
      <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.statusText, { color: tone.color }]}>{lead.status}</Text>
      </View>
    </Pressable>
  );
}

export default function LeadAutomationScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const [tab, setTab] = useState<"leads" | "automations">("leads");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey>("");
  const [stepFilter, setStepFilter] = useState("");
  const [leads, setLeads] = useState<AutomationLead[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [summary, setSummary] = useState<AutomationSummary>({ total: 0, inProgress: 0, converted: 0, lost: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [sequences, setSequences] = useState<AutomationSequence[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  const [automationsError, setAutomationsError] = useState("");
  const hasFilters = !!(query || statusFilter || stepFilter);

  const load = useCallback(async (nextPage = 1, append = false) => {
    const id = ++requestId.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const result = await fetchAutomationLeads({
        page: nextPage,
        limit: PAGE_SIZE,
        ...(query ? { search: query } : null),
        ...(statusFilter ? { status: statusFilter } : null),
        ...(stepFilter ? { step: stepFilter } : null),
      });
      if (id !== requestId.current) return;
      setLeads((current) => append ? [...current, ...result.leads.filter((lead) => !current.some((item) => item.id === lead.id))] : result.leads);
      setTotal(result.pagination.total);
      setPage(result.pagination.page);
      setPages(result.pagination.pages);
      setSummary(result.summary);
      setSteps(result.steps);
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
  }, [query, statusFilter, stepFilter]);

  const loadAutomations = useCallback(async () => {
    setAutomationsLoading(true);
    setAutomationsError("");
    try {
      const [sequenceList, ruleList] = await Promise.all([fetchSequences(), fetchRules()]);
      setSequences(sequenceList);
      setRules(ruleList);
    } catch (loadError) {
      setAutomationsError(errorMessage(loadError, "Could not load your automations."));
    } finally {
      setAutomationsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => { loadAutomations(); }, [loadAutomations]));

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
    if (tab === "leads") load(); else loadAutomations();
  }

  function clearFilters() {
    setSearch("");
    setQuery("");
    setStatusFilter("");
    setStepFilter("");
  }

  async function toggleSequence(item: AutomationSequence) {
    const next = !item.is_active;
    setSequences((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_active: next } : entry));
    try {
      await setSequenceActive(item.id, next);
    } catch (toggleError) {
      setSequences((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_active: !next } : entry));
      Alert.alert("Couldn't update", errorMessage(toggleError, "Please try again."));
    }
  }

  async function toggleRule(item: AutomationRule) {
    const next = !item.is_active;
    setRules((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_active: next } : entry));
    try {
      await setRuleActive(item.id, next);
    } catch (toggleError) {
      setRules((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_active: !next } : entry));
      Alert.alert("Couldn't update", errorMessage(toggleError, "Please try again."));
    }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Lead Automation" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="refresh" onPress={refresh} disabled={loading || refreshing} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <LinearGradient colors={["#4f46e5", "#0ea5e9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="git-network-outline" size={24} color="#ffffff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Follow-up on autopilot</Text>
            <Text style={styles.heroSubtitle}>Track every lead's journey and let the follow-ups run themselves.</Text>
          </View>
          <View style={styles.heroCircleLarge} />
          <View style={styles.heroCircleSmall} />
        </LinearGradient>

        <View style={styles.segment}>
          <Pressable onPress={() => setTab("leads")} style={[styles.segmentButton, tab === "leads" && styles.segmentActive]}>
            <Ionicons name="people-outline" size={16} color={tab === "leads" ? colors.primary : colors.textSecondary} />
            <Text style={[styles.segmentText, tab === "leads" && styles.segmentTextActive]}>Leads</Text>
          </Pressable>
          <Pressable onPress={() => setTab("automations")} style={[styles.segmentButton, tab === "automations" && styles.segmentActive]}>
            <Ionicons name="flash-outline" size={16} color={tab === "automations" ? colors.primary : colors.textSecondary} />
            <Text style={[styles.segmentText, tab === "automations" && styles.segmentTextActive]}>Automations</Text>
          </Pressable>
        </View>

        {tab === "leads" ? (
          <>
            <View style={styles.statsRow}>
              <StatTile label="All" value={summary.total} icon="people-outline" tint="#4f46e5" bg="#e0e7ff" active={statusFilter === ""} onPress={() => setStatusFilter("")} />
              <StatTile label="Active" value={summary.inProgress} icon="time-outline" tint="#2563eb" bg="#dbeafe" active={statusFilter === "In Progress"} onPress={() => setStatusFilter("In Progress")} />
              <StatTile label="Won" value={summary.converted} icon="checkmark-circle-outline" tint="#16a34a" bg="#dcfce7" active={statusFilter === "Converted"} onPress={() => setStatusFilter("Converted")} />
              <StatTile label="Lost" value={summary.lost} icon="close-circle-outline" tint="#dc2626" bg="#fee2e2" active={statusFilter === "Lost"} onPress={() => setStatusFilter("Lost")} />
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                mode="flat"
                value={search}
                onChangeText={updateSearch}
                placeholder="Search by name or phone"
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                style={styles.searchField}
                dense
              />
              {search ? (
                <Pressable onPress={() => updateSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable>
              ) : null}
            </View>

            {steps.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepRow}>
                <Pressable onPress={() => setStepFilter("")} style={[styles.stepChip, !stepFilter && styles.stepChipActive]}>
                  <Text style={[styles.stepChipText, !stepFilter && styles.stepChipTextActive]}>All steps</Text>
                </Pressable>
                {steps.map((step) => {
                  const active = stepFilter === step;
                  return (
                    <Pressable key={step} onPress={() => setStepFilter(active ? "" : step)} style={[styles.stepChip, active && styles.stepChipActive]}>
                      <Text style={[styles.stepChipText, active && styles.stepChipTextActive]}>{step}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : <View style={{ height: 12 }} />}

            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{loading && !leads.length ? "Loading..." : `${total.toLocaleString("en-IN")} ${total === 1 ? "lead" : "leads"}`}</Text>
              {hasFilters ? (
                <Pressable onPress={clearFilters} hitSlop={8} style={styles.clearButton}>
                  <Ionicons name="close" size={14} color={colors.primary} />
                  <Text style={styles.clearText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>

            {loading && !leads.length ? (
              <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : error && !leads.length ? (
              <View style={styles.center}>
                <Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Could not load leads</Text>
                <Text style={styles.emptyText}>{error}</Text>
                <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
              </View>
            ) : leads.length ? (
              <View style={styles.leadsList}>
                {leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
                {page < pages ? (
                  <Pressable style={styles.loadMore} onPress={() => load(page + 1, true)} disabled={loadingMore}>
                    {loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.loadMoreText}>Load more</Text>}
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.center}>
                <View style={styles.emptyIcon}><Ionicons name="funnel-outline" size={28} color={colors.primary} /></View>
                <Text style={styles.emptyTitle}>No leads found</Text>
                <Text style={styles.emptyText}>Try a different status, step or search.</Text>
              </View>
            )}
          </>
        ) : automationsLoading && !sequences.length && !rules.length ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : automationsError && !sequences.length && !rules.length ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Could not load automations</Text>
            <Text style={styles.emptyText}>{automationsError}</Text>
            <Button mode="contained" onPress={loadAutomations} style={styles.retry}>Try again</Button>
          </View>
        ) : (
          <View style={styles.settingsList}>
            {!isAdmin ? <Text style={styles.settingsHint}>Only admins can switch automations on or off.</Text> : null}

            <Text style={styles.groupTitle}>Sequences</Text>
            <Text style={styles.groupHint}>Message series sent to a lead over time.</Text>
            {sequences.length ? sequences.map((item) => (
              <View key={item.id} style={styles.settingCard}>
                <View style={[styles.settingIcon, { backgroundColor: "#e0e7ff" }]}>
                  <Ionicons name="layers-outline" size={20} color="#4f46e5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.settingDescription} numberOfLines={2}>
                    {item.steps?.length || 0} {item.steps?.length === 1 ? "step" : "steps"}{item.description ? ` · ${item.description}` : ""}
                  </Text>
                </View>
                <Switch value={!!item.is_active} onValueChange={() => toggleSequence(item)} disabled={!isAdmin} color={colors.primary} />
              </View>
            )) : <Text style={styles.noneText}>No sequences yet. Create one on the web.</Text>}

            <Text style={[styles.groupTitle, { marginTop: 10 }]}>Trigger rules</Text>
            <Text style={styles.groupHint}>When a rule matches, the lead joins a sequence automatically.</Text>
            {rules.length ? rules.map((item) => (
              <View key={item.id} style={styles.settingCard}>
                <View style={[styles.settingIcon, { backgroundColor: "#fef3c7" }]}>
                  <Ionicons name="flash-outline" size={20} color="#d97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.settingDescription} numberOfLines={2}>
                    {triggerLabel(item)}{item.sequence_name ? ` → ${item.sequence_name}` : ""}
                  </Text>
                </View>
                <Switch value={!!item.is_active} onValueChange={() => toggleRule(item)} disabled={!isAdmin} color={colors.primary} />
              </View>
            )) : <Text style={styles.noneText}>No trigger rules yet. Create one on the web.</Text>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },

  hero: { borderRadius: 20, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden", marginTop: 4 },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  heroSubtitle: { color: "rgba(255,255,255,0.88)", fontSize: 12, lineHeight: 17, marginTop: 3 },
  heroCircleLarge: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.1)", right: -30, top: -34 },
  heroCircleSmall: { position: "absolute", width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(255,255,255,0.1)", right: 50, bottom: -28 },

  segment: { flexDirection: "row", backgroundColor: "#f1f6fa", borderRadius: 14, padding: 4, marginTop: 16 },
  segmentButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 11 },
  segmentActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  segmentTextActive: { color: colors.primary },

  statsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  statTile: { flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: "#e2eef7", backgroundColor: "#ffffff", paddingVertical: 12, paddingHorizontal: 8, alignItems: "center" },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 8 },
  statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 1 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f4f9fc", borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", paddingLeft: 12, paddingRight: 12, minHeight: 48, marginTop: 14 },
  searchField: { flex: 1, backgroundColor: "transparent", fontSize: 14 },

  stepRow: { gap: 8, paddingVertical: 12 },
  stepChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7e6f1" },
  stepChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  stepChipTextActive: { color: "#ffffff" },

  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  listTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  clearButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  clearText: { color: colors.primary, fontSize: 12, fontWeight: "800" },

  leadsList: { gap: 10 },
  leadCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#e2eef7", padding: 12 },
  pressed: { backgroundColor: "#f4f9fc" },
  leadAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  leadAvatarText: { fontSize: 18, fontWeight: "900" },
  leadBody: { flex: 1, minWidth: 0 },
  leadName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  leadPhone: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  leadTags: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  stepTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1 },
  stepTagText: { color: colors.primary, fontSize: 11, fontWeight: "800", flexShrink: 1 },
  optOutTag: { backgroundColor: "#fee2e2", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  optOutText: { color: "#b91c1c", fontSize: 10, fontWeight: "800" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: "800" },
  loadMore: { alignItems: "center", justifyContent: "center", height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  loadMoreText: { color: colors.primary, fontSize: 14, fontWeight: "800" },

  center: { minHeight: 200, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  emptyText: { color: colors.textSecondary, fontSize: 12, textAlign: "center", lineHeight: 18 },
  retry: { marginTop: 10 },

  settingsList: { gap: 10, marginTop: 14 },
  settingsHint: { color: colors.textSecondary, fontSize: 12, backgroundColor: "#fff7ed", borderRadius: 12, padding: 10 },
  groupTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  groupHint: { color: colors.textSecondary, fontSize: 12, marginTop: -6 },
  noneText: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 14, backgroundColor: "#f8fbfd", borderRadius: 14 },
  settingCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#e2eef7", padding: 14 },
  settingIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  settingTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  settingDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
