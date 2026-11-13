import { IconChevronRight, IconSearch } from "@/components/ReferenceIcons";
import { glass } from "@/components/Glass";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Dimensions, Linking, Modal, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet,
  Text, View,
} from "react-native";
import {
  ActivityIndicator, Avatar, Button, Card, Checkbox, Chip, FAB, IconButton, List, Menu, Searchbar,
} from "react-native-paper";
import { rateLimitRemainingMs } from "@/api/client";
import axios from "axios";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { usePermission } from "@/hooks/usePermission";
import { useStages } from "@/hooks/useStages";
import { useT } from "@/i18n/LanguageContext";
import { telUrl } from "@/api/phone";
import { openPhoneWhatsapp } from "@/api/openWhatsapp";
import {
  bulkDeleteLeads, bulkUpdateLeads, fetchLeads, LeadListItem, trackContactActivity,
} from "@/api/leads";
import { fetchStaff, StaffMember } from "@/api/staff";
import { fetchPreferences, updatePreferences } from "@/api/preferences";
import { notifyLeadsDeleted } from "@/api/notifications";
import { FilterDateField, formatYmd } from "@/components/FilterDateField";

const PAGE_SIZE = 25;
// With a status, follow-up or reply-window filter on, this many leads are fetched at once and filtered on the phone.
const LOCAL_FILTER_LIMIT = 500;
const FILTERS = [
  { value: "", label: "All leads" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];
const SOURCES = [
  { value: "meta_ads", label: "Meta Ads" },
  { value: "google_ads", label: "Google Ads" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "Referral" },
  { value: "manual", label: "Manual" },
  { value: "website", label: "Website" },
  { value: "walkin", label: "Walk-in" },
  { value: "instagram", label: "Instagram" },
  { value: "organic", label: "Organic" },
  { value: "import", label: "Imported" },
  { value: "api", label: "API" },
];

// Android clips emoji drawn inside a custom-font Text: it measures them narrower than it paints them, so the last
// emoji of a name came out cut in half. Each emoji is drawn in its own fixed-width box instead; the plain text
// around it keeps the normal font and is the only part that truncates.
const EMOJI_RUN = /(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|️|\p{Emoji_Modifier})*)/u;

function LeadName({ name }: { name: string }) {
  let parts: string[] = [name];
  try { if (/\p{Extended_Pictographic}/u.test(name)) parts = name.split(EMOJI_RUN).filter(Boolean); } catch { /* plain name */ }
  if (parts.length === 1 && !EMOJI_RUN.test(parts[0])) {
    return <Text style={styles.leadName} numberOfLines={1} ellipsizeMode="tail">{name}</Text>;
  }
  return (
    <View style={styles.leadNameRow}>
      {parts.map((part, index) => (EMOJI_RUN.test(part)
        ? <Text key={index} style={styles.leadNameEmoji}>{part}</Text>
        : <Text key={index} style={styles.leadName} numberOfLines={1} ellipsizeMode="tail">{part}</Text>))}
    </View>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

type PickerKey = "stage" | "status" | "score" | "health" | "sla" | "source" | "assigned" | "dateField";

const HEALTH_OPTIONS = [
  { value: "", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "none", label: "No follow-up" },
];
const SLA_OPTIONS = [
  { value: "", label: "All" },
  { value: "open", label: "Reply window open" },
  { value: "closed", label: "Reply window closed" },
  { value: "none", label: "No customer message" },
];

// These three filters are worked out on the phone from each lead's own fields.
function followupHealthOf(lead: LeadListItem) {
  if (!lead.next_followup_at) return "none";
  const due = new Date(lead.next_followup_at);
  if (Number.isNaN(due.getTime())) return "none";
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
  if (due < startOfToday) return "overdue";
  if (due < endOfToday) return "today";
  return "upcoming";
}
function replyWindowOf(lead: LeadListItem) {
  if (!lead.last_incoming_message) return "none";
  return lead.is_24h_window_active ? "open" : "closed";
}
function matchesLocalFilters(lead: LeadListItem, filters: { status: string; health: string; sla: string }) {
  if (filters.status && (lead.lead_status || "").toLowerCase() !== filters.status.toLowerCase()) return false;
  if (filters.health && followupHealthOf(lead) !== filters.health) return false;
  if (filters.sla && replyWindowOf(lead) !== filters.sla) return false;
  return true;
}

// One dropdown-looking field; tapping it opens the option list.
function FilterField({ label, value, onPress, disabled }: { label: string; value: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.filterField, disabled && { opacity: 0.6 }]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.filterFieldText} numberOfLines={1}>{value}</Text>
      <Ionicons name="chevron-down" size={15} color="#64748b" />
    </Pressable>
  );
}

function pretty(value?: string) {
  if (!value) return "New";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeDate(value: string, t: (text: string, vars?: Record<string, string | number>) => string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const difference = Date.now() - time;
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return t("Just now");
  if (minutes < 60) return t("{n}m ago", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("{n}h ago", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("{n}d ago", { n: days });
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

function LeadRow({ lead, selectMode, selected, onToggleSelect, onLongPress, onDelete, colorFor, findStage }: {
  lead: LeadListItem; selectMode: boolean; selected: boolean; onToggleSelect: () => void; onLongPress: () => void;
  /** Omitted for users who can't delete, which hides the Delete item. */
  onDelete?: () => void;
  colorFor: (stage?: string) => { bg: string; text: string };
  findStage: (name?: string) => { name: string } | undefined;
}) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ y: 0, right: 16 });
  const anchorRef = useRef<View>(null);
  function openMenu() {
    // Open the popover just under the ⋮ button, right-aligned with it.
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPos({ y: y + height, right: Math.max(8, Dimensions.get("window").width - (x + width)) });
      setMenuOpen(true);
    });
  }
  function closeMenu() { setMenuOpen(false); }
  function runAfterClose(action: () => void) {
    setMenuOpen(false);
    setTimeout(action, 300);
  }
  const stageColors = colorFor(lead.stage);
  const stageLabel = findStage(lead.stage)?.name || pretty(lead.stage);
  const openLead = () => router.push({
    pathname: "/(app)/leads/[id]",
    params: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage || "new", source: lead.source || "" },
  });
  const avatarColor = ["#c8294a", "#d98a0b", "#0f7b5f", "#2457e6", "#7c3aed"][(lead.name?.charCodeAt(0) || 0) % 5];
  const score = lead.lead_score === "hot" ? { label: "Hot", color: "#b91c1c", bg: "#fde1e1" }
    : lead.lead_score === "warm" ? { label: "Warm", color: "#c2710c", bg: "#fde9c9" }
    : lead.lead_score === "cold" ? { label: "Cold", color: "#2457e6", bg: "#dbe8fb" }
    : null;
  const sourceLabel = lead.source ? (SOURCES.find((item) => item.value === lead.source)?.label || pretty(lead.source)) : "";
  function callNow() {
    trackContactActivity(lead.id, "call").catch(() => {});
    Linking.openURL(telUrl(lead.phone)).catch(() => Alert.alert("Unable to call", "Calling is not supported on this device."));
  }
  function openWhatsapp() {
    openPhoneWhatsapp(lead);
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.leadCard, selected && styles.leadCardSelected, pressed && styles.pressed]}
      onPress={() => selectMode ? onToggleSelect() : openLead()}
      onLongPress={() => { if (!selectMode) onLongPress(); }}
    >
      <View style={styles.leadTop}>
        {selectMode ? (
          <Checkbox status={selected ? "checked" : "unchecked"} onPress={onToggleSelect} />
        ) : (
          <View style={[styles.avatarCircle, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarLetter}>{(lead.name?.charAt(0) || "?").toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.leadContent}>
          <View style={styles.nameRow}>
            <LeadName name={lead.name || ""} />
            {score ? (
              <View style={[styles.scoreBadge, { backgroundColor: score.bg }]}>
                <Text style={[styles.scoreText, { color: score.color }]}>{t(score.label)}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.sourceLine}>
            <Ionicons name="chatbubble-outline" size={12} color="#64748b" />
            <Text style={styles.subtitle} numberOfLines={1}>
              {sourceLabel ? `${t("Source")}: ` : ""}<Text style={styles.sourceStrong}>{sourceLabel || lead.phone}</Text>
            </Text>
          </View>
        </View>
        <View style={styles.timeCol}>
          <Text style={styles.timeText}>{relativeDate(lead.created_at, t)}</Text>
          {!selectMode ? (
            <View ref={anchorRef} collapsable={false}>
              <Pressable onPress={openMenu} hitSlop={10} accessibilityRole="button" accessibilityLabel="Lead actions" style={styles.moreButton}>
                <Ionicons name="ellipsis-horizontal" size={16} color="#94a3b8" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.stageTag, { backgroundColor: stageColors.bg }]}>
          <Text style={[styles.stageTagText, { color: stageColors.text }]} numberOfLines={1}>{stageLabel}</Text>
        </View>
        <Text style={styles.assignedText} numberOfLines={1}>
          {lead.assigned_to_name ? `${t("Assigned to staff")}: ` : ""}<Text style={styles.sourceStrong}>{lead.assigned_to_name || t("Unassigned")}</Text>
        </Text>
      </View>

      {!selectMode ? (
        <View style={styles.leadActions}>
          <Pressable style={[styles.quickAction, { backgroundColor: "#dbe8fb" }]} onPress={callNow} hitSlop={4}>
            <Ionicons name="call-outline" size={16} color="#2457e6" />
            <Text style={[styles.quickActionText, { color: "#2457e6" }]}>{t("Call")}</Text>
          </Pressable>
          <Pressable style={[styles.quickAction, { backgroundColor: "#0f7b5f" }]} onPress={openWhatsapp} hitSlop={4}>
            <Ionicons name="logo-whatsapp" size={16} color="#ffffff" />
            <Text style={[styles.quickActionText, { color: "#ffffff" }]}>{t("WhatsApp")}</Text>
          </Pressable>
          {/* A plain Modal popover: Paper's Menu swallowed taps here. Actions run after it closes,
              because Android drops navigation/Alerts fired while a Modal is still dismissing. */}
          <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={closeMenu}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
              <View style={[styles.popover, { top: menuPos.y, right: menuPos.right }]}>
                <Pressable style={styles.popoverItem} onPress={() => runAfterClose(openLead)}>
                  <Ionicons name="pencil-outline" size={16} color={colors.text} />
                  <Text style={styles.popoverText}>{t("Edit")}</Text>
                </Pressable>
                {onDelete ? (
                  <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onDelete)}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={[styles.popoverText, { color: colors.danger }]}>{t("Delete")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          </Modal>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function LeadsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isAdmin } = usePermission();
  const { t } = useT();
  const { stages, colorFor, findStage } = useStages();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const [prefsReady, setPrefsReady] = useState(false);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [score, setScore] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [failedLoads, setFailedLoads] = useState(0);

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

  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [filterStage, setFilterStage] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  // Changes inside the sheet are held as a draft until "Apply filters".
  const [filterStatus, setFilterStatus] = useState("");
  const [filterHealth, setFilterHealth] = useState("");
  const [filterSla, setFilterSla] = useState("");
  const [draft, setDraft] = useState({ score: "", stage: "", status: "", health: "", sla: "", source: "", assigned: "", from: "", to: "" });
  const [picker, setPicker] = useState<PickerKey | null>(null);

  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [hiddenStages, setHiddenStages] = useState<string[]>([]);

  useEffect(() => {
    const parent = navigation.getParent();
    // The tab bar floats over the screen, so in select mode it would cover the Delete/Stage action bar.
    const hideBar = filtersSheetOpen || settingsSheetOpen || selectMode;
    parent?.setOptions({ tabBarStyle: hideBar ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [filtersSheetOpen, settingsSheetOpen, selectMode, navigation, insets.bottom]);

  const activeFilterCount = [score, filterStage, filterStatus, filterHealth, filterSla, filterSource, filterAssignedTo, filterDateFrom || filterDateTo].filter(Boolean).length;

  // `silent` re-fetches everything already on screen in one request without a spinner or losing the scroll depth.
  const load = useCallback(async (nextPage = 1, append = false, silent = false) => {
    const id = ++requestId.current;
    if (append) setLoadingMore(true);
    else if (!silent) setLoading(true);
    setError("");
    try {
      const localFilters = { status: filterStatus, health: filterHealth, sla: filterSla };
      const localActive = !!(filterStatus || filterHealth || filterSla);
      const loadedPages = silent ? Math.max(1, pageRef.current) : 1;
      const result = await fetchLeads({
        page: localActive ? 1 : nextPage, limit: localActive ? LOCAL_FILTER_LIMIT : PAGE_SIZE * loadedPages,
        ...(query && { search: query }),
        ...(score && { score }),
        ...(filterStage && { stage: filterStage }),
        ...(filterSource && { source: filterSource }),
        ...(filterAssignedTo && { assigned_to: filterAssignedTo }),
        ...((filterDateFrom || filterDateTo) && { date_field: "created_at" }),
        ...(filterDateFrom && { date_from: filterDateFrom }),
        ...(filterDateTo && { date_to: filterDateTo }),
        ...(hiddenStages.length && { hide_stages: hiddenStages.join(",") }),
      });
      if (id !== requestId.current) return;
      if (localActive) {
        const matching = result.leads.filter((lead) => matchesLocalFilters(lead, localFilters));
        setLeads(matching);
        pageRef.current = 1; setPage(1); setPages(1); setTotal(matching.length);
        return;
      }
      setLeads((current) => append ? [...current, ...result.leads.filter((lead) => !current.some((item) => item.id === lead.id))] : result.leads);
      // A silent refresh asks for several pages at once, so page numbers are worked out in PAGE_SIZE units.
      const shownPages = silent ? Math.max(1, Math.ceil(result.leads.length / PAGE_SIZE)) : result.pagination.page;
      pageRef.current = shownPages;
      setPage(shownPages);
      setPages(silent ? Math.max(1, Math.ceil(result.pagination.total / PAGE_SIZE)) : result.pagination.pages);
      setTotal(result.pagination.total);
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(axios.isAxiosError(loadError) && typeof loadError.response?.data?.error === "string" ? loadError.response.data.error : "Could not load leads.");
      setFailedLoads((count) => count + 1);
    } finally {
      if (id === requestId.current) { setLoading(false); setLoadingMore(false); setRefreshing(false); }
    }
  }, [query, score, filterStage, filterStatus, filterHealth, filterSla, filterSource, filterAssignedTo, filterDateFrom, filterDateTo, hiddenStages]);

  // First load and any filter/search change. It waits for the hidden-stages preference so those stages never flash.
  useEffect(() => { if (prefsReady) load(); }, [load, prefsReady]);

  // If the list couldn't load because the server is rate limiting, try again by itself once the wait is over.
  useEffect(() => {
    if (!error || leads.length) return;
    const wait = rateLimitRemainingMs();
    if (!wait) return;
    const timer = setTimeout(() => loadRef.current(), wait + 500);
    return () => clearTimeout(timer);
  }, [error, failedLoads, leads.length]);

  // Coming back to this screen (e.g. from a lead's page): refresh in place instead of jumping back to page 1.
  const loadRef = useRef(load);
  loadRef.current = load;
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; } // the effect above handles the first load
    loadRef.current(1, false, true);
  }, []));
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  useEffect(() => {
    fetchPreferences()
      .then((prefs) => setHiddenStages(prefs.hidden_lead_stages || []))
      .catch(() => {})
      .finally(() => setPrefsReady(true));
  }, []);

  function toggleHiddenStage(stageName: string) {
    const key = stageName.toLowerCase();
    const next = hiddenStages.includes(key) ? hiddenStages.filter((s) => s !== key) : [...hiddenStages, key];
    setHiddenStages(next);
    updatePreferences({ hidden_lead_stages: next }).catch(() => setHiddenStages(hiddenStages));
  }

  function openFiltersSheet() {
    setDraft({ score, stage: filterStage, status: filterStatus, health: filterHealth, sla: filterSla, source: filterSource, assigned: filterAssignedTo, from: filterDateFrom, to: filterDateTo });
    setPicker(null);
    setFiltersSheetOpen(true);
    if (staff.length || staffLoading) return;
    setStaffLoading(true); setStaffError("");
    fetchStaff().then(setStaff).catch((staffErr) => setStaffError(errorMessage(staffErr, "Could not load your team."))).finally(() => setStaffLoading(false));
  }

  function clearFilters() {
    setScore(""); setFilterStage(""); setFilterStatus(""); setFilterHealth(""); setFilterSla(""); setFilterSource(""); setFilterAssignedTo(""); setFilterDateFrom(""); setFilterDateTo("");
  }

  function applyFilters() {
    setScore(draft.score); setFilterStage(draft.stage); setFilterStatus(draft.status); setFilterHealth(draft.health); setFilterSla(draft.sla); setFilterSource(draft.source); setFilterAssignedTo(draft.assigned);
    // A range typed back to front is put the right way round instead of silently returning nothing.
    const [from, to] = draft.from && draft.to && draft.from > draft.to ? [draft.to, draft.from] : [draft.from, draft.to];
    setFilterDateFrom(from); setFilterDateTo(to);
    setFiltersSheetOpen(false);
  }

  const pickerOptions: Record<PickerKey, { value: string; label: string }[]> = {
    stage: [{ value: "", label: "All stages" }, ...stages.map((item) => ({ value: item.name, label: item.name }))],
    status: [{ value: "", label: "All statuses" }, ...Array.from(new Set(stages.flatMap((stage) => (stage.statuses || []).map((status) => status.name)))).map((name) => ({ value: name, label: name }))],
    score: FILTERS.map((item) => ({ value: item.value, label: item.value ? item.label : "All scores" })),
    health: HEALTH_OPTIONS,
    sla: SLA_OPTIONS,
    source: [{ value: "", label: "All sources" }, ...SOURCES],
    assigned: [{ value: "", label: "All staff" }, { value: "unassigned", label: "Unassigned" }, ...staff.map((member) => ({ value: member.id, label: member.name }))],
    dateField: [{ value: "created_at", label: "Lead date" }],
  };
  const pickerTitle: Record<PickerKey, string> = { stage: "Stage", status: "Status", score: "Score", health: "Follow-up health", sla: "Response SLA", source: "Source", assigned: "Assigned to", dateField: "Date" };
  const pickerValue: Record<PickerKey, string> = { stage: draft.stage, status: draft.status, score: draft.score, health: draft.health, sla: draft.sla, source: draft.source, assigned: draft.assigned, dateField: "created_at" };
  function labelOf(key: PickerKey) {
    return pickerOptions[key].find((item) => item.value === pickerValue[key])?.label || pickerOptions[key][0].label;
  }
  function choose(key: PickerKey, value: string) {
    if (key === "stage") setDraft((d) => ({ ...d, stage: value }));
    else if (key === "status") setDraft((d) => ({ ...d, status: value }));
    else if (key === "score") setDraft((d) => ({ ...d, score: value }));
    else if (key === "health") setDraft((d) => ({ ...d, health: value }));
    else if (key === "sla") setDraft((d) => ({ ...d, sla: value }));
    else if (key === "source") setDraft((d) => ({ ...d, source: value }));
    else if (key === "assigned") setDraft((d) => ({ ...d, assigned: value }));
    setPicker(null);
  }

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

  function enterSelectMode(id: string) {
    if (!isAdmin) return;
    setSelectMode(true);
    setSelectedIds(new Set([id]));
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
    Linking.openURL(telUrl(lead.phone)).catch(() => Alert.alert("Unable to call", "Calling is not supported on this device."));
  }

  function confirmDeleteOne(lead: LeadListItem) {
    Alert.alert("Delete this lead?", `${lead.name} will be permanently deleted.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await bulkDeleteLeads([lead.id]);
          notifyLeadsDeleted([{ id: lead.id, name: lead.name }]).catch(() => {});
          load();
        } catch (deleteError) {
          Alert.alert("Couldn't delete", errorMessage(deleteError, "You may not have permission to do this."));
        }
      } },
    ]);
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
            const deletedLeads = leads.filter((lead) => selectedIds.has(lead.id)).map((lead) => ({ id: lead.id, name: lead.name }));
            await bulkDeleteLeads(Array.from(selectedIds));
            notifyLeadsDeleted(deletedLeads).catch(() => {});
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
          <Button mode="text" onPress={exitSelectMode} compact>{t("Cancel")}</Button>
          <Text style={styles.selectCount}>{t("{n} selected", { n: selectedIds.size })}</Text>
          <Button mode="text" onPress={() => setSelectedIds(new Set(leads.map((lead) => lead.id)))} compact>{t("Select all")}</Button>
        </View>
      ) : (
        <View style={styles.titleRow}>
          <View style={styles.titleRowMain}>
            {router.canGoBack() ? <IconButton icon="arrow-left" size={22} onPress={() => router.back()} style={styles.backButton} /> : null}
            <View>
              <Text style={styles.title}>{t("Leads")}</Text>
              <Text style={styles.count}>{total.toLocaleString("en-IN")} {t("total contacts")}</Text>
            </View>
          </View>
          <Pressable style={styles.settingsSquare} onPress={() => setSettingsSheetOpen(true)} accessibilityRole="button" accessibilityLabel="Lead settings">
            <Ionicons name="settings-outline" size={18} color="#334155" />
          </Pressable>
        </View>
      )}
      <View style={styles.searchRow}>
        <Searchbar
          icon={() => <IconSearch />} inputStyle={{ fontFamily: "Inter_400Regular", fontSize: 13, minHeight: 44 }} style={styles.searchBox} value={search} onChangeText={updateSearch}
          placeholder={t("Search by name or phone…")} placeholderTextColor={colors.textMuted} onClearIconPress={() => updateSearch("")}
        />
        <Pressable
          style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]} onPress={openFiltersSheet}
          accessibilityLabel={activeFilterCount ? `Filters (${activeFilterCount} active)` : "Filters"}
        >
          <Ionicons name="options-outline" size={20} color={activeFilterCount ? "#fff" : "#334155"} />
        </Pressable>
      </View>
      {activeFilterCount > 0 ? (
        <View style={styles.activeChipsRow}>
          {score ? <Chip compact onClose={() => setScore("")} style={styles.activeChip}>Score: {FILTERS.find((f) => f.value === score)?.label || score}</Chip> : null}
          {filterStage ? <Chip compact onClose={() => setFilterStage("")} style={styles.activeChip}>Stage: {filterStage}</Chip> : null}
          {filterStatus ? <Chip compact onClose={() => setFilterStatus("")} style={styles.activeChip}>Status: {filterStatus}</Chip> : null}
          {filterHealth ? <Chip compact onClose={() => setFilterHealth("")} style={styles.activeChip}>Follow-up: {HEALTH_OPTIONS.find((o) => o.value === filterHealth)?.label || filterHealth}</Chip> : null}
          {filterSla ? <Chip compact onClose={() => setFilterSla("")} style={styles.activeChip}>Reply: {SLA_OPTIONS.find((o) => o.value === filterSla)?.label || filterSla}</Chip> : null}
          {filterSource ? <Chip compact onClose={() => setFilterSource("")} style={styles.activeChip}>Source: {SOURCES.find((s) => s.value === filterSource)?.label || filterSource}</Chip> : null}
          {filterDateFrom || filterDateTo ? (
            <Chip compact onClose={() => { setFilterDateFrom(""); setFilterDateTo(""); }} style={styles.activeChip}>
              Date: {filterDateFrom ? formatYmd(filterDateFrom) : "…"} – {filterDateTo ? formatYmd(filterDateTo) : "…"}
            </Chip>
          ) : null}
          {filterAssignedTo ? (
            <Chip compact onClose={() => setFilterAssignedTo("")} style={styles.activeChip}>
              {filterAssignedTo === "unassigned" ? "Unassigned" : `Assigned: ${staff.find((s) => s.id === filterAssignedTo)?.name || filterAssignedTo}`}
            </Chip>
          ) : null}
        </View>
      ) : null}
      {error && leads.length ? <Pressable style={styles.inlineError} onPress={() => load()}><Text style={styles.inlineErrorText}>{error} Tap to retry.</Text></Pressable> : null}
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {loading && !leads.length ? (
        <View style={styles.loadingWrap}>{header}<View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>{t("Loading leads…")}</Text></View></View>
      ) : error && !leads.length ? (
        <View style={styles.loadingWrap}>{header}<View style={styles.center}><Text style={styles.errorTitle}>{t("Couldn't load leads")}</Text><Text style={styles.errorMessage}>{error}</Text><Pressable style={styles.retry} onPress={() => load()}><Text style={styles.retryText}>{t("Try again")}</Text></Pressable></View></View>
      ) : (
        <SectionList
          sections={sections} keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LeadRow lead={item} selectMode={selectMode} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelect(item.id)} onLongPress={() => enterSelectMode(item.id)} onDelete={isAdmin ? () => confirmDeleteOne(item) : undefined} colorFor={colorFor} findStage={findStage} />
          )}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{t(section.title)}</Text>}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + (selectMode ? 140 : 105) }]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          onEndReached={() => { if (!loadingMore && page < pages) load(page + 1, true); }} onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : leads.length ? <Text style={styles.endText}>{page >= pages ? t("All {n} leads loaded", { n: total }) : ""}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="people-outline" size={26} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>{query || activeFilterCount ? t("No matching leads") : t("No leads yet")}</Text>
              <Text style={styles.emptyText}>{query || activeFilterCount ? t("Try changing your search or filter.") : t("Add your first lead to start building your pipeline.")}</Text>
              {!query && !activeFilterCount ? <Pressable style={styles.emptyButton} onPress={goToNewLead}><Text style={styles.emptyButtonText}>{t("＋ Add first lead")}</Text></Pressable> : null}
            </View>
          }
        />
      )}

      {selectMode ? (
        <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.bulkAction}>
            <IconButton icon="account-outline" size={20} onPress={openReassign} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled]}>{t("Reassign")}</Text>
          </View>
          <View style={styles.bulkAction}>
            <IconButton icon="tag-outline" size={20} onPress={() => setStageSheetOpen(true)} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled]}>{t("Stage")}</Text>
          </View>
          <View style={styles.bulkAction}>
            <IconButton icon="phone-outline" size={20} onPress={openCallSheet} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled]}>{t("Call")}</Text>
          </View>
          <View style={styles.bulkAction}>
            <IconButton icon="trash-can-outline" size={20} iconColor={selectedIds.size ? colors.danger : undefined} onPress={confirmBulkDelete} disabled={!selectedIds.size || bulkBusy} />
            <Text style={[styles.bulkActionText, !selectedIds.size && styles.bulkActionTextDisabled, selectedIds.size ? styles.bulkActionDangerText : null]}>{t("Delete")}</Text>
          </View>
        </View>
      ) : (
        <Pressable accessibilityLabel="Add lead" style={[styles.fab, { bottom: insets.bottom + 86 }]} onPress={goToNewLead}>
          <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
            <Ionicons name="person-add" size={24} color="#fff" />
          </LinearGradient>
        </Pressable>
      )}

      <Modal visible={reassignOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !bulkBusy && setReassignOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !bulkBusy && setReassignOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Reassign {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}</Text>
            {staffLoading ? (
              <ActivityIndicator size="large" style={{ marginVertical: 20 }} />
            ) : staffError ? (
              <Text style={styles.sheetErrorText}>{staffError}</Text>
            ) : (
              <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
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
              </ScrollView>
            )}
            <Button mode="outlined" onPress={() => setReassignOpen(false)} disabled={bulkBusy} style={styles.sheetCancel}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={stageSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !bulkBusy && setStageSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !bulkBusy && setStageSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Move {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} to…</Text>
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
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
            </ScrollView>
            <Button mode="outlined" onPress={() => setStageSheetOpen(false)} disabled={bulkBusy} style={styles.sheetCancel}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={callSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setCallSheetOpen(false)}>
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

      <Modal visible={filtersSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setFiltersSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setFiltersSheetOpen(false)}>
          <Pressable style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.filterHandle} />
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <Pressable onPress={() => setDraft({ score: "", stage: "", status: "", health: "", sla: "", source: "", assigned: "", from: "", to: "" })} hitSlop={10} accessibilityRole="button">
                <Text style={styles.clearAll}>Clear all</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.filterScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.filterGrid}>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>STAGE</Text>
                  <FilterField label="Stage" value={labelOf("stage")} onPress={() => setPicker("stage")} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>STATUS</Text>
                  <FilterField label="Status" value={labelOf("status")} onPress={() => setPicker("status")} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>SCORE</Text>
                  <FilterField label="Score" value={labelOf("score")} onPress={() => setPicker("score")} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>FOLLOW-UP HEALTH</Text>
                  <FilterField label="Follow-up health" value={labelOf("health")} onPress={() => setPicker("health")} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>RESPONSE SLA</Text>
                  <FilterField label="Response SLA" value={labelOf("sla")} onPress={() => setPicker("sla")} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>SOURCE</Text>
                  <FilterField label="Source" value={labelOf("source")} onPress={() => setPicker("source")} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>ASSIGNED TO</Text>
                  <FilterField label="Assigned to" value={staffLoading ? "Loading…" : labelOf("assigned")} onPress={() => setPicker("assigned")} disabled={staffLoading} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabel}>DATE</Text>
                  <FilterField label="Date" value={labelOf("dateField")} onPress={() => setPicker("dateField")} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabelPlain}>From</Text>
                  <FilterDateField value={draft.from} onChange={(value) => setDraft((d) => ({ ...d, from: value }))} />
                </View>
                <View style={styles.filterCell}>
                  <Text style={styles.filterLabelPlain}>To</Text>
                  <FilterDateField value={draft.to} onChange={(value) => setDraft((d) => ({ ...d, to: value }))} />
                </View>
              </View>
              {staffError ? <Text style={styles.sheetErrorText}>{staffError}</Text> : null}
            </ScrollView>
            <View style={styles.filterSheetActions}>
              <Pressable style={styles.resetButton} onPress={() => { clearFilters(); setFiltersSheetOpen(false); }} accessibilityRole="button">
                <Text style={styles.resetButtonText}>Reset</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={applyFilters} accessibilityRole="button">
                <Text style={styles.applyButtonText}>Apply filters</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>

        {/* The option list for whichever field was tapped. */}
        <Modal visible={picker !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPicker(null)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
            <Pressable style={styles.pickerCard} onPress={() => {}}>
              {picker ? (
                <>
                  <Text style={styles.pickerTitle}>{pickerTitle[picker]}</Text>
                  <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                    {pickerOptions[picker].map((item) => {
                      const selected = item.value === pickerValue[picker];
                      return (
                        <Pressable key={item.value || "all"} style={[styles.pickerItem, selected && styles.pickerItemSelected]} onPress={() => choose(picker, item.value)}>
                          <Text style={[styles.pickerItemText, selected && styles.pickerItemTextSelected]}>{item.label}</Text>
                          {selected ? <Ionicons name="checkmark" size={16} color="#2457e6" /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </Modal>

      <Modal visible={settingsSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSettingsSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSettingsSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Hide stages</Text>
            <Text style={styles.sheetHintText}>Hidden stages won&apos;t show up in your leads list. Synced across web and mobile.</Text>
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.optionsList}>
                {stages.map((item, index) => {
                  const itemColors = colorFor(item.color);
                  const hidden = hiddenStages.includes(item.name.toLowerCase());
                  return (
                    <List.Item
                      key={item.id || item.name} title={item.name} titleStyle={styles.stageListText}
                      onPress={() => toggleHiddenStage(item.name)}
                      style={[styles.hideStageRow, index === stages.length - 1 && styles.hideStageRowLast]}
                      left={() => <View style={[styles.stageDot, { backgroundColor: itemColors.text }]} />}
                      right={(props) => <List.Icon {...props} icon={hidden ? "eye-off-outline" : "eye-outline"} color={hidden ? colors.textMuted : colors.primary} />}
                    />
                  );
                })}
                {!stages.length ? <Text style={styles.sheetHintText}>Loading stages…</Text> : null}
              </View>
            </ScrollView>
            <Button mode="outlined" onPress={() => setSettingsSheetOpen(false)} style={styles.sheetCancel}>Done</Button>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f1f4f2" },
  loadingWrap: { flex: 1, paddingHorizontal: 16 }, listContent: { paddingHorizontal: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, marginBottom: 12 },
  titleRowMain: { flexDirection: "row", alignItems: "center" },
  backButton: { margin: 0, marginRight: 4 },
  title: { color: "#0f172a", fontSize: 24, lineHeight: 30, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }, count: { color: "#64748b", fontSize: 11, marginTop: 1 },
  selectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, marginBottom: 16, minHeight: 52 },
  selectCount: { color: colors.text, fontSize: 14, fontWeight: "800" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  searchBox: { flex: 1, height: 44, backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e4e9e6", elevation: 0, shadowOpacity: 0 },
  filterButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e4e9e6", alignItems: "center", justifyContent: "center" },
  filterButtonActive: { backgroundColor: "#2457e6", borderColor: "#2457e6" },
  settingsButton: { margin: 0 },
  settingsSquare: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e4e9e6", alignItems: "center", justifyContent: "center" },
  activeChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  activeChip: {},
  filterScroll: { maxHeight: "70%" },
  filterSheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" },
  filterHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: "#d5dbe5", marginBottom: 14 },
  filterTitle: { color: "#0f172a", fontSize: 18, fontFamily: "DMSans_700Bold" },
  clearAll: { color: "#2457e6", fontSize: 12, fontFamily: "Inter_700Bold" },
  filterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  filterCell: { width: "47.8%" },
  filterLabel: { color: "#475569", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6, marginBottom: 5 },
  filterLabelPlain: { color: "#64748b", fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 5 },
  filterField: { height: 40, borderRadius: 10, borderWidth: 1, borderColor: "#dbe3f1", backgroundColor: "#ffffff", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  filterFieldText: { flex: 1, color: "#0f172a", fontSize: 13, fontFamily: "Inter_500Medium" },
  resetButton: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: "#dbe3f1", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  resetButtonText: { color: "#0f172a", fontSize: 14, fontFamily: "Inter_700Bold" },
  applyButton: { flex: 2, height: 44, borderRadius: 10, backgroundColor: "#2457e6", alignItems: "center", justifyContent: "center" },
  applyButtonText: { color: "#ffffff", fontSize: 14, fontFamily: "Inter_700Bold" },
  pickerBackdrop: { flex: 1, justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(15,23,42,0.45)" },
  pickerCard: { backgroundColor: "#ffffff", borderRadius: 16, paddingVertical: 10, maxHeight: "65%" },
  pickerTitle: { color: "#475569", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 16, paddingVertical: 8 },
  pickerScroll: { flexGrow: 0 },
  pickerItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  pickerItemSelected: { backgroundColor: "#eef2fd" },
  pickerItemText: { color: "#0f172a", fontSize: 14, fontFamily: "Inter_500Medium" },
  pickerItemTextSelected: { color: "#2457e6", fontFamily: "Inter_700Bold" },
  sheetScroll: { maxHeight: "55%" },
  filterSheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  // A horizontal ScrollView inside a list header otherwise grows to fill the screen height.
  quickScroll: { flexGrow: 0, flexShrink: 0 },
  quickRow: { gap: 8, paddingVertical: 10, alignItems: "center" },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7e6f1" },
  quickChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  quickChipTextActive: { color: "#ffffff" },
  sectionHeader: { color: "#5f7a6f", fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, paddingVertical: 6, paddingHorizontal: 2, marginTop: 8, marginBottom: 2 },
  leadCard: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#e4e9e6", padding: 12, marginBottom: 10, gap: 10 },
  leadCardSelected: { borderColor: "#2457e6", backgroundColor: "#f3f6ff" },
  pressed: { opacity: 0.85 },
  leadTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  avatarCircle: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#ffffff", fontSize: 16, fontFamily: "Inter_700Bold" },
  timeCol: { alignItems: "flex-end", gap: 4 },
  moreButton: { padding: 2 },
  sourceLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  sourceStrong: { color: "#0f172a", fontFamily: "Inter_700Bold" },
  timeText: { flexShrink: 0, color: "#64748b", fontSize: 11, fontFamily: "Inter_500Medium" },
  scoreBadge: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  scoreText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  stageTag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, maxWidth: "48%" },
  stageTagDot: { width: 6, height: 6, borderRadius: 3 },
  stageTagText: { fontSize: 10, fontFamily: "Inter_700Bold", flexShrink: 1 },
  sourceTag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: "#eef2f6", maxWidth: 110 },
  sourceTagText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  assignedText: { flex: 1, color: "#64748b", fontSize: 10.5, textAlign: "right" },
  leadActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  quickAction: { flex: 1, height: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10 },
  quickActionText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  leadRowContent: { flexDirection: "row", alignItems: "center", minHeight: 66 },
  avatar: { backgroundColor: colors.primary, marginRight: 11 }, avatarText: { fontSize: 16, fontWeight: "800" },
  rowMenuButton: { margin: 0 },
  popover: {
    position: "absolute", minWidth: 150, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSoft, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  popoverItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  popoverText: { color: colors.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  leadContent: { flex: 1, minWidth: 0 }, nameRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }, leadName: { flexShrink: 1, minWidth: 0, color: "#0f172a", fontSize: 14, lineHeight: 22, paddingRight: 2, fontFamily: "Inter_700Bold" },
  leadNameRow: { flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  leadNameEmoji: { flexShrink: 0, width: 26, fontSize: 16, lineHeight: 22, textAlign: "left" },
  subtitle: { flexShrink: 1, color: "#64748b", fontSize: 11 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sourcePill: { maxWidth: 130, backgroundColor: colors.text, height: 24, borderRadius: 6 }, sourcePillText: { color: colors.surface, fontSize: 10, fontWeight: "700", lineHeight: 12 },
  stagePill: { height: 24, borderRadius: 6 }, stagePillText: { fontSize: 10, fontWeight: "800", lineHeight: 12 },
  inlineError: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginBottom: 12 }, inlineErrorText: { color: colors.danger, fontSize: 10, textAlign: "center" },
  center: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 }, loadingText: { color: colors.textSecondary, fontSize: 12, marginTop: 11 }, errorTitle: { color: colors.text, fontSize: 17, fontWeight: "800" }, errorMessage: { color: colors.textSecondary, fontSize: 12, textAlign: "center", marginTop: 7 }, retry: { backgroundColor: colors.primary, paddingHorizontal: 19, paddingVertical: 10, borderRadius: 10, marginTop: 16 }, retryText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  footerLoader: { paddingVertical: 20 }, endText: { color: colors.textMuted, fontSize: 10, textAlign: "center", paddingVertical: 18 },
  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 55 }, emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 14 }, emptyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 }, emptyButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginTop: 17 }, emptyButtonText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  fab: { position: "absolute", right: 20 },
  fabGradient: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", shadowColor: "#4f46e5", shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },

  bulkBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 12 },
  bulkAction: { flex: 1, alignItems: "center" },
  bulkActionText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  bulkActionTextDisabled: { color: colors.textMuted },
  bulkActionDangerText: { color: colors.danger },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  filterSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sheetErrorText: { color: colors.danger, fontSize: 12, fontWeight: "600", textAlign: "center", marginVertical: 20 },
  sheetHintText: { color: colors.textSecondary, fontSize: 12, textAlign: "center", paddingVertical: 20 },
  sheetCancel: { marginTop: 10 },

  optionsList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  stageDot: { width: 10, height: 10, borderRadius: 5, alignSelf: "center", marginLeft: 16, marginRight: -8 },
  stageListText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  hideStageRow: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  hideStageRowLast: { borderBottomWidth: 0 },
});
