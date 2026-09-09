import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Linking, Modal, Pressable, RefreshControl, SectionList, StyleSheet,
  Text, View,
} from "react-native";
import {
  ActivityIndicator, Avatar, Button, Card, Checkbox, Chip, FAB, IconButton, List, Searchbar,
} from "react-native-paper";
import axios from "axios";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { usePermission } from "@/hooks/usePermission";
import { useStages } from "@/hooks/useStages";
import {
  bulkDeleteLeads, bulkUpdateLeads, fetchLeads, LeadListItem, trackContactActivity,
} from "@/api/leads";
import { fetchStaff, StaffMember } from "@/api/staff";

const PAGE_SIZE = 25;
const FILTERS = [
  { value: "", label: "All leads" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function pretty(value?: string) {
  if (!value) return "New";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeDate(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const difference = Date.now() - time;
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function dateBucket(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

function LeadRow({ lead, selectMode, selected, onToggleSelect, colorFor, findStage }: {
  lead: LeadListItem; selectMode: boolean; selected: boolean; onToggleSelect: () => void;
  colorFor: (stage?: string) => { bg: string; text: string };
  findStage: (name?: string) => { name: string } | undefined;
}) {
  const stageColors = colorFor(lead.stage);
  const stageLabel = findStage(lead.stage)?.name || pretty(lead.stage);
  return (
    <Card
      mode="outlined" style={styles.leadRow}
      onPress={() => selectMode ? onToggleSelect() : router.push({
        pathname: "/(app)/leads/[id]",
        params: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage || "new", source: lead.source || "" },
      })}
    >
      <Card.Content style={styles.leadRowContent}>
        {selectMode ? (
          <Checkbox status={selected ? "checked" : "unchecked"} onPress={onToggleSelect} />
        ) : (
          <Avatar.Text size={44} label={(lead.name?.charAt(0) || "?").toUpperCase()} style={styles.avatar} labelStyle={styles.avatarText} />
        )}
        <View style={styles.leadContent}>
          <View style={styles.nameRow}>
            <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
            {lead.lead_score === "hot" ? <View style={styles.hotDot} /> : null}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>Assigned to {lead.assigned_to_name || "you"} · {relativeDate(lead.created_at)}</Text>
          <View style={styles.metaRow}>
            {lead.source ? <Chip compact style={styles.sourcePill} textStyle={styles.sourcePillText}>{pretty(lead.source)}</Chip> : null}
            <Chip compact style={[styles.stagePill, { backgroundColor: stageColors.bg }]} textStyle={[styles.stagePillText, { color: stageColors.text }]}>{stageLabel}</Chip>
          </View>
        </View>
        {!selectMode ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </Card.Content>
    </Card>
  );
}

export default function LeadsScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin } = usePermission();
  const { stages, colorFor, findStage } = useStages();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [score, setScore] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [reassignOpen, setReassignOpen] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");

  const [stageSheetOpen, setStageSheetOpen] = useState(false);

  const [callSheetOpen, setCallSheetOpen] = useState(false);
  const [calledIds, setCalledIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (nextPage = 1, append = false) => {
    const id = ++requestId.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const result = await fetchLeads({ page: nextPage, limit: PAGE_SIZE, ...(query && { search: query }), ...(score && { score }) });
      if (id !== requestId.current) return;
      setLeads((current) => append ? [...current, ...result.leads.filter((lead) => !current.some((item) => item.id === lead.id))] : result.leads);
      setPage(result.pagination.page);
      setPages(result.pagination.pages);
      setTotal(result.pagination.total);
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(axios.isAxiosError(loadError) && typeof loadError.response?.data?.error === "string" ? loadError.response.data.error : "Could not load leads.");
    } finally {
      if (id === requestId.current) { setLoading(false); setLoadingMore(false); setRefreshing(false); }
    }
  }, [query, score]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, LeadListItem[]>();
    for (const lead of leads) {
      const label = dateBucket(lead.created_at);
      if (!map.has(label)) { map.set(label, []); order.push(label); }
      map.get(label)!.push(lead);
    }
    return order.map((title) => ({ title, data: map.get(title)! }));
  }, [leads]);

  function updateSearch(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQuery(value.trim()), 350);
  }

  function refresh() {
    setRefreshing(true);
    load(1, false);
  }

  function goToNewLead() {
    router.push({ pathname: "/(app)/leads/new", params: { returnTo: "leads" } });
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedLeads = leads.filter((lead) => selectedIds.has(lead.id));

  async function openReassign() {
    setReassignOpen(true);
    if (staff.length || staffLoading) return;
    setStaffLoading(true); setStaffError("");
    try { setStaff(await fetchStaff()); }
    catch (staffErr) { setStaffError(errorMessage(staffErr, "Could not load your team.")); }
    finally { setStaffLoading(false); }
  }

  async function reassignTo(member: StaffMember) {
    setBulkBusy(true);
    try {
      await bulkUpdateLeads({ ids: Array.from(selectedIds), assigned_to: member.id });
      setReassignOpen(false);
      exitSelectMode();
      load();
    } catch (reassignError) {
      Alert.alert("Couldn't reassign", errorMessage(reassignError, "You may not have permission to do this."));
    } finally { setBulkBusy(false); }
  }

  async function changeStageTo(stage: string) {
    setBulkBusy(true);
    try {
      await bulkUpdateLeads({ ids: Array.from(selectedIds), stage });
      setStageSheetOpen(false);
      exitSelectMode();
      load();
    } catch (stageError) {
      Alert.alert("Couldn't update stage", errorMessage(stageError, "You may not have permission to do this."));
    } finally { setBulkBusy(false); }
  }

  function openCallSheet() {
    setCalledIds(new Set());
    setCallSheetOpen(true);
  }

  function callLead(lead: LeadListItem) {
    trackContactActivity(lead.id, "call").catch(() => {});
    setCalledIds((current) => new Set(current).add(lead.id));
    Linking.openURL(`tel:${lead.phone}`).catch(() => Alert.alert("Unable to call", "Calling is not supported on this device."));
  }

  function confirmBulkDelete() {
    Alert.alert(
      "Delete selected leads?",
      `${selectedIds.size} lead${selectedIds.size === 1 ? "" : "s"} will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          setBulkBusy(true);
          try {
            await bulkDeleteLeads(Array.from(selectedIds));
            exitSelectMode();
            load();
          } catch (deleteError) {
            Alert.alert("Couldn't delete", errorMessage(deleteError, "You may not have permission to do this."));
          } finally { setBulkBusy(false); }
        } },
      ]
    );
  }

  const header = (
    <>
      {selectMode ? (
        <View style={styles.selectHeader}>
          <Button mode="text" onPress={exitSelectMode} compact>Cancel</Button>
          <Text style={styles.selectCount}>{selectedIds.size} selected</Text>
          <Button mode="text" onPress={() => setSelectedIds(new Set(leads.map((lead) => lead.id)))} compact>Select all</Button>
        </View>
      ) : (
        <View style={styles.titleRow}>
          <View><Text style={styles.title}>Leads</Text><Text style={styles.count}>{total.toLocaleString("en-IN")} total contacts</Text></View>
          <View style={styles.titleActions}>
            {isAdmin ? (
              <Button mode="outlined" onPress={enterSelectMode} compact>Select</Button>
            ) : null}
            <Button mode="contained" icon="plus" onPress={goToNewLead} compact>Add lead</Button>
          </View>
        </View>
      )}
      <Searchbar
        style={styles.searchBox} value={search} onChangeText={updateSearch}
        placeholder="Search Name/Number/Keywords…" onClearIconPress={() => updateSearch("")}
      />
      <View style={styles.filtersRow}>
        {FILTERS.map((item) => (
          <Chip key={item.value || "all"} selected={score === item.value} onPress={() => setScore(item.value)} style={[styles.filterChip, score === item.value && styles.filterActive]}>
            {item.label}
          </Chip>
        ))}
      </View>
      {error && leads.length ? <Pressable style={styles.inlineError} onPress={() => load()}><Text style={styles.inlineErrorText}>{error} Tap to retry.</Text></Pressable> : null}
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {loading && !leads.length ? (
        <View style={styles.loadingWrap}>{header}<View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Loading leads…</Text></View></View>
      ) : error && !leads.length ? (
        <View style={styles.loadingWrap}>{header}<View style={styles.center}><Text style={styles.errorTitle}>Couldn&apos;t load leads</Text><Text style={styles.errorMessage}>{error}</Text><Pressable style={styles.retry} onPress={() => load()}><Text style={styles.retryText}>Try again</Text></Pressable></View></View>
      ) : (
        <SectionList
          sections={sections} keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LeadRow lead={item} selectMode={selectMode} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelect(item.id)} colorFor={colorFor} findStage={findStage} />
          )}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + (selectMode ? 140 : 105) }]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          onEndReached={() => { if (!loadingMore && page < pages) load(page + 1, true); }} onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : leads.length ? <Text style={styles.endText}>{page >= pages ? `All ${total} leads loaded` : ""}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="people-outline" size={26} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>{query || score ? "No matching leads" : "No leads yet"}</Text>
              <Text style={styles.emptyText}>{query || score ? "Try changing your search or filter." : "Add your first lead to start building your pipeline."}</Text>
              {!query && !score ? <Pressable style={styles.emptyButton} onPress={goToNewLead}><Text style={styles.emptyButtonText}>＋ Add first lead</Text></Pressable> : null}
            </View>
          }
        />
      )}

      {selectMode ? (
        <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.bulkAction}>
            <IconButton icon="account-outline" size={20} onPress={openReassign} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled]}>Reassign</Text>
          </View>
          <View style={styles.bulkAction}>
            <IconButton icon="tag-outline" size={20} onPress={() => setStageSheetOpen(true)} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled]}>Stage</Text>
          </View>
          <View style={styles.bulkAction}>
            <IconButton icon="phone-outline" size={20} onPress={openCallSheet} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled]}>Call</Text>
          </View>
          <View style={styles.bulkAction}>
            <IconButton icon="trash-can-outline" size={20} iconColor={selectedIds.size ? colors.danger : undefined} onPress={confirmBulkDelete} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled, selectedIds.size ? styles.bulkActionDangerText : null]}>Delete</Text>
          </View>
        </View>
      ) : (
        <FAB icon="plus" style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={goToNewLead} color={colors.surface} />
      )}

      <Modal visible={reassignOpen} transparent animationType="fade" onRequestClose={() => !bulkBusy && setReassignOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !bulkBusy && setReassignOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Reassign {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}</Text>
            {staffLoading ? (
              <ActivityIndicator size="large" style={{ marginVertical: 20 }} />
            ) : staffError ? (
              <Text style={styles.sheetErrorText}>{staffError}</Text>
            ) : (
              <View style={styles.optionsList}>
                {staff.map((member) => (
                  <List.Item
                    key={member.id} title={member.name}
                    description={`${pretty(member.role)}${typeof member.assigned_leads === "number" ? ` · ${member.assigned_leads} leads` : ""}`}
                    onPress={() => reassignTo(member)} disabled={bulkBusy}
                    right={(props) => bulkBusy ? <ActivityIndicator size="small" /> : <List.Icon {...props} icon="chevron-right" />}
                  />
                ))}
              </View>
            )}
            <Button mode="outlined" onPress={() => setReassignOpen(false)} disabled={bulkBusy} style={styles.sheetCancel}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={stageSheetOpen} transparent animationType="fade" onRequestClose={() => !bulkBusy && setStageSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !bulkBusy && setStageSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Move {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} to…</Text>
            <View style={styles.optionsList}>
              {stages.map((stage) => {
                const stageColors = colorFor(stage.color);
                return (
                  <List.Item
                    key={stage.id || stage.name} title={stage.name}
                    onPress={() => changeStageTo(stage.name.toLowerCase())} disabled={bulkBusy}
                    left={() => <View style={[styles.stageDot, { backgroundColor: stageColors.text }]} />}
                    right={(props) => bulkBusy ? <ActivityIndicator size="small" /> : <List.Icon {...props} icon="chevron-right" />}
                  />
                );
              })}
              {!stages.length ? <Text style={styles.sheetHintText}>Loading stages…</Text> : null}
            </View>
            <Button mode="outlined" onPress={() => setStageSheetOpen(false)} disabled={bulkBusy} style={styles.sheetCancel}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={callSheetOpen} transparent animationType="fade" onRequestClose={() => setCallSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCallSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Call {selectedLeads.length} lead{selectedLeads.length === 1 ? "" : "s"}</Text>
            <View style={styles.optionsList}>
              {selectedLeads.map((lead) => {
                const called = calledIds.has(lead.id);
                return (
                  <List.Item
                    key={lead.id} title={lead.name} description={lead.phone} onPress={() => callLead(lead)}
                    right={(props) => <List.Icon {...props} icon={called ? "check-circle" : "phone-outline"} color={called ? colors.success : colors.primary} />}
                  />
                );
              })}
            </View>
            <Button mode="outlined" onPress={() => { setCallSheetOpen(false); exitSelectMode(); }} style={styles.sheetCancel}>Done</Button>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loadingWrap: { flex: 1, paddingHorizontal: 16 }, listContent: { paddingHorizontal: 16 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, marginBottom: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800" }, count: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  titleActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, marginBottom: 16, height: 40 },
  selectCount: { color: colors.text, fontSize: 14, fontWeight: "800" },
  searchBox: { marginBottom: 4 },
  filtersRow: { flexDirection: "row", gap: 8, paddingTop: 13, paddingBottom: 6, flexWrap: "wrap" },
  filterChip: { backgroundColor: colors.surface }, filterActive: { backgroundColor: colors.primarySoft },
  sectionHeader: { color: colors.text, fontSize: 13, fontWeight: "800", backgroundColor: colors.surfaceMuted, paddingVertical: 8, paddingHorizontal: 10, marginTop: 8, marginBottom: 4, borderRadius: 6 },
  leadRow: { borderRadius: 12, borderColor: colors.borderSoft, backgroundColor: colors.surface, marginBottom: 10 }, pressed: { opacity: 0.7 },
  leadRowContent: { flexDirection: "row", alignItems: "center", minHeight: 66 },
  avatar: { backgroundColor: colors.primary, marginRight: 11 }, avatarText: { fontSize: 16, fontWeight: "800" },
  leadContent: { flex: 1 }, nameRow: { flexDirection: "row", alignItems: "center", gap: 6 }, leadName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800" }, hotDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  subtitle: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  sourcePill: { maxWidth: 130, backgroundColor: colors.text, height: 24 }, sourcePillText: { color: colors.surface, fontSize: 10, fontWeight: "700", lineHeight: 12 },
  stagePill: { height: 24 }, stagePillText: { fontSize: 10, fontWeight: "800", lineHeight: 12 },
  inlineError: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginBottom: 12 }, inlineErrorText: { color: colors.danger, fontSize: 10, textAlign: "center" },
  center: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 }, loadingText: { color: colors.textSecondary, fontSize: 12, marginTop: 11 }, errorTitle: { color: colors.text, fontSize: 17, fontWeight: "800" }, errorMessage: { color: colors.textSecondary, fontSize: 12, textAlign: "center", marginTop: 7 }, retry: { backgroundColor: colors.primary, paddingHorizontal: 19, paddingVertical: 10, borderRadius: 10, marginTop: 16 }, retryText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  footerLoader: { paddingVertical: 20 }, endText: { color: colors.textMuted, fontSize: 10, textAlign: "center", paddingVertical: 18 },
  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 55 }, emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 14 }, emptyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 }, emptyButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginTop: 17 }, emptyButtonText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  fab: { position: "absolute", right: 20, backgroundColor: colors.text },

  bulkBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 12 },
  bulkAction: { flex: 1, alignItems: "center" },
  bulkActionText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  bulkActionTextDisabled: { color: colors.textMuted },
  bulkActionDangerText: { color: colors.danger },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  sheetErrorText: { color: colors.danger, fontSize: 12, fontWeight: "600", textAlign: "center", marginVertical: 20 },
  sheetHintText: { color: colors.textSecondary, fontSize: 12, textAlign: "center", paddingVertical: 20 },
  sheetCancel: { marginTop: 10 },

  optionsList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  stageDot: { width: 10, height: 10, borderRadius: 5, alignSelf: "center", marginLeft: 16, marginRight: -8 },
});
