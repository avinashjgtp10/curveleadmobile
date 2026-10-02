import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { GlassBackground, glass } from "@/components/Glass";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, IconButton, List, Searchbar, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { completeLeadFollowup, createLeadFollowup, fetchLeads, fetchTodayFollowups, FollowupType, LeadListItem, TodayFollowup } from "@/api/leads";

type AppointmentTab = "all" | "upcoming" | "today" | "overdue" | "completed";
type TypeOption = { key: FollowupType; label: string; icon: keyof typeof Ionicons.glyphMap };

const TABS: { key: AppointmentTab; label: string }[] = [
  { key: "all", label: "All Appointments" },
  { key: "upcoming", label: "Upcoming" },
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

const TYPES: TypeOption[] = [
  { key: "call", label: "Follow-up", icon: "call-outline" },
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
  { key: "visit", label: "Consultation", icon: "people-outline" },
  { key: "demo", label: "Product Demo", icon: "videocam-outline" },
];

function ymd(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function typeMeta(type?: string) {
  return TYPES.find((item) => item.key === type) || TYPES[0];
}

function followupTypeOrDefault(type?: string): FollowupType {
  return typeMeta(type).key;
}

function statusFor(item: TodayFollowup) {
  const when = new Date(item.next_followup_at);
  const now = new Date();
  if (Number.isNaN(when.getTime())) return "upcoming";
  if (when < now && !isSameDay(when, now)) return "overdue";
  if (isSameDay(when, now)) return "today";
  return "upcoming";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "-", time: "-" };
  return {
    date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

function initials(name?: string) {
  const words = (name || "?").trim().split(/\s+/);
  return words.length > 1 ? `${words[0][0]}${words[1][0]}`.toUpperCase() : words[0][0].toUpperCase();
}

function AppointmentRow({ item, completing, onView, onComplete, onReschedule, onCancel }: {
  item: TodayFollowup;
  completing: boolean;
  onView: () => void;
  onComplete: () => void;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ y: 0, right: 16 });
  const anchorRef = useRef<View>(null);
  const meta = typeMeta(item.followup_type);
  const date = formatDate(item.next_followup_at);
  const status = statusFor(item);

  function openMenu() {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPos({ y: y + height + 2, right: Math.max(8, Dimensions.get("window").width - (x + width)) });
      setMenuOpen(true);
    });
  }

  function runAfterClose(action: () => void) {
    setMenuOpen(false);
    setTimeout(action, 250);
  }

  return (
    <Pressable style={styles.row} onPress={onView}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item.lead_name)}</Text></View>
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>{item.lead_name}</Text>
        <Text style={styles.rowPhone}>{item.lead_phone}</Text>
        <View style={styles.rowType}>
          <Ionicons name={meta.icon} size={13} color={status === "overdue" ? colors.danger : colors.primary} />
          <Text style={styles.rowTypeText}>{meta.label}</Text>
        </View>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.rowDate}>{date.date}</Text>
        <Text style={styles.rowTime}>{date.time}</Text>
        <Text style={[styles.statusPill, status === "overdue" ? styles.statusOverdue : status === "today" ? styles.statusToday : styles.statusUpcoming]}>{status === "overdue" ? "Overdue" : status === "today" ? "Today" : "Upcoming"}</Text>
      </View>
      {completing ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.actionButton} />
      ) : (
        <View ref={anchorRef} collapsable={false}>
          <IconButton
            icon="dots-vertical"
            iconColor={colors.textSecondary}
            size={20}
            style={styles.actionButton}
            onPress={(event) => { event.stopPropagation(); openMenu(); }}
            accessibilityLabel="Appointment actions"
          />
        </View>
      )}
      <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)}>
          <View style={[styles.popover, { top: menuPos.y, right: menuPos.right }]}>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onView)}>
              <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.popoverText}>View Details</Text>
            </Pressable>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onReschedule)}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.popoverText}>Reschedule</Text>
            </Pressable>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onComplete)}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={[styles.popoverText, styles.popoverSuccessText]}>Mark Completed</Text>
            </Pressable>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onCancel)}>
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.popoverText, styles.popoverDangerText]}>Cancel Appointment</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Pressable>
  );
}

function AppointmentsContent() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [appointments, setAppointments] = useState<TodayFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<AppointmentTab>("all");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FollowupType | "">("");
  const [completingId, setCompletingId] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItem[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [appointmentAt, setAppointmentAt] = useState(defaultFollowupDate());
  const [appointmentType, setAppointmentType] = useState<FollowupType>("call");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [reschedulingAppointment, setReschedulingAppointment] = useState<TodayFollowup | null>(null);

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: sheetOpen ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [sheetOpen, navigation, insets.bottom]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const today = new Date();
      const future = new Date(); future.setDate(future.getDate() + 180);
      const rows = await fetchTodayFollowups({ date_from: "1970-01-01", date_to: ymd(future) });
      setAppointments(rows);
    } catch {
      setError("Could not load appointments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sheetOpen || selectedLead) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const searchText = leadQuery.trim();
        setLeadResults((await fetchLeads({ search: searchText || undefined, limit: 8 })).leads);
      }
      catch { setLeadResults([]); }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery, selectedLead, sheetOpen]);

  const counts = useMemo(() => {
    const upcoming = appointments.filter((item) => statusFor(item) === "upcoming").length;
    const today = appointments.filter((item) => statusFor(item) === "today").length;
    const overdue = appointments.filter((item) => statusFor(item) === "overdue").length;
    return { upcoming, today, overdue };
  }, [appointments]);

  const visibleAppointments = useMemo(() => {
    const text = query.trim().toLowerCase();
    return appointments.filter((item) => {
      const status = statusFor(item);
      if (activeTab !== "all" && activeTab !== "completed" && status !== activeTab) return false;
      if (activeTab === "completed") return false;
      if (typeFilter && item.followup_type !== typeFilter) return false;
      if (!text) return true;
      return [item.lead_name, item.lead_phone, item.followup_type, item.notes].some((value) => String(value || "").toLowerCase().includes(text));
    });
  }, [activeTab, appointments, query, typeFilter]);

  function openCreate() {
    setLeadQuery(""); setLeadResults([]); setSelectedLead(null);
    setAppointmentAt(defaultFollowupDate()); setAppointmentType("call"); setNotes(""); setFormError("");
    setReschedulingAppointment(null);
    setSheetOpen(true);
    fetchLeads({ limit: 8 }).then((result) => setLeadResults(result.leads)).catch(() => setLeadResults([]));
  }

  function closeSheet() {
    if (saving) return;
    setSheetOpen(false);
    setReschedulingAppointment(null);
  }

  async function schedule() {
    if (!selectedLead) { setFormError("Select a lead first."); return; }
    setSaving(true); setFormError("");
    try {
      const created = await createLeadFollowup(selectedLead.id, {
        followup_type: appointmentType,
        next_followup_at: appointmentAt.toISOString(),
        notes: notes.trim() || undefined,
      });
      const newAppointment: TodayFollowup = {
        id: created.id,
        lead_id: selectedLead.id,
        lead_name: selectedLead.name,
        lead_phone: selectedLead.phone,
        lead_stage: selectedLead.stage,
        followup_type: created.followup_type || appointmentType,
        next_followup_at: created.next_followup_at || appointmentAt.toISOString(),
        notes: created.notes || notes.trim() || undefined,
      };
      if (reschedulingAppointment) {
        await completeLeadFollowup(reschedulingAppointment.id, "Rescheduled");
      }
      setAppointments((current) => [
        newAppointment,
        ...current.filter((item) => item.id !== newAppointment.id && item.id !== reschedulingAppointment?.id),
      ]);
      setActiveTab("all");
      setQuery("");
      setTypeFilter("");
      setFilterOpen(false);
      setSheetOpen(false);
      setReschedulingAppointment(null);
      load(true);
    } catch {
      setFormError(reschedulingAppointment ? "Could not reschedule this appointment." : "Could not schedule this appointment.");
    } finally {
      setSaving(false);
    }
  }

  function viewAppointment(item: TodayFollowup) {
    router.push({ pathname: "/(app)/leads/[id]", params: { id: item.lead_id, name: item.lead_name, phone: item.lead_phone, stage: item.lead_stage || "new" } });
  }

  async function markCompleted(item: TodayFollowup) {
    setCompletingId(item.id);
    try {
      await completeLeadFollowup(item.id);
      setAppointments((current) => current.filter((appointment) => appointment.id !== item.id));
    } catch {
      Alert.alert("Couldn't update appointment", "Please try again.");
    } finally {
      setCompletingId(null);
    }
  }

  function openReschedule(item: TodayFollowup) {
    const existingDate = new Date(item.next_followup_at);
    setReschedulingAppointment(item);
    setLeadQuery("");
    setLeadResults([]);
    setSelectedLead({
      id: item.lead_id,
      name: item.lead_name,
      phone: item.lead_phone,
      stage: item.lead_stage,
      created_at: new Date().toISOString(),
    });
    setAppointmentAt(Number.isNaN(existingDate.getTime()) ? defaultFollowupDate() : existingDate);
    setAppointmentType(followupTypeOrDefault(item.followup_type));
    setNotes(item.notes || "");
    setFormError("");
    setSheetOpen(true);
  }

  function showCancelUnavailable() {
    Alert.alert("Cancel appointment", "Cancelling appointments will be available when the cancel endpoint is connected.");
  }

  // Going back to Home (when opened from a Home tile) is handled for every More screen in more/_layout.tsx.
  function goBack() {
    router.back();
  }

  return (
    <View style={styles.screen}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={goBack} />
        <Appbar.Content title="Appointments" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="refresh" color={colors.primary} onPress={() => load(true)} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Appointments</Text>
            <Text style={styles.subtitle}>All scheduled sales appointments</Text>
          </View>
          <Pressable style={styles.newButton} onPress={openCreate}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newButtonText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, styles.upcomingCard]}>
            <View style={styles.summaryIcon}><Ionicons name="calendar-outline" size={18} color="#7c3aed" /></View>
            <Text style={styles.summaryLabel}>UPCOMING</Text>
            <Text style={styles.summaryValue}>{counts.upcoming}</Text>
            <Text style={styles.summaryText}>appointments</Text>
          </View>
          <View style={[styles.summaryCard, styles.todayCard]}>
            <View style={styles.summaryIconAmber}><Ionicons name="time-outline" size={18} color={colors.warning} /></View>
            <Text style={[styles.summaryLabel, { color: colors.warning }]}>TODAY</Text>
            <Text style={[styles.summaryValue, { color: colors.warning }]}>{counts.today}</Text>
            <Text style={styles.summaryText}>scheduled</Text>
          </View>
          <View style={[styles.summaryCard, styles.overdueCard]}>
            <View style={styles.summaryIconRed}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /></View>
            <Text style={[styles.summaryLabel, { color: colors.danger }]}>OVERDUE</Text>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>{counts.overdue}</Text>
            <Text style={styles.summaryText}>need follow-up</Text>
          </View>
        </View>

        <View style={styles.listCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
            {TABS.map((tab) => (
              <Pressable key={tab.key} style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]} onPress={() => setActiveTab(tab.key)}>
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.toolbar}>
            <Searchbar value={query} onChangeText={setQuery} placeholder="Search by lead, type..." elevation={0} inputStyle={styles.searchInput} style={styles.searchBox} />
            <Pressable style={styles.filterButton} onPress={() => setFilterOpen((value) => !value)}>
              <Ionicons name="options-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.filterButtonText}>{typeFilter ? typeMeta(typeFilter).label : "Filters"}</Text>
            </Pressable>
          </View>
          {filterOpen ? (
            <View style={styles.typeFilterRow}>
              <Pressable style={[styles.typeFilterChip, !typeFilter && styles.typeFilterChipActive]} onPress={() => setTypeFilter("")}>
                <Text style={[styles.typeFilterText, !typeFilter && styles.typeFilterTextActive]}>Show All</Text>
              </Pressable>
              {TYPES.map((item) => (
                <Pressable key={item.key} style={[styles.typeFilterChip, typeFilter === item.key && styles.typeFilterChipActive]} onPress={() => setTypeFilter(item.key)}>
                  <Text style={[styles.typeFilterText, typeFilter === item.key && styles.typeFilterTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {loading ? (
            <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : error ? (
            <View style={styles.state}><Text style={styles.errorText}>{error}</Text><Button mode="contained" onPress={() => load()}>Try again</Button></View>
          ) : visibleAppointments.length ? visibleAppointments.map((item) => (
            <AppointmentRow
              key={item.id}
              item={item}
              completing={completingId === item.id}
              onView={() => viewAppointment(item)}
              onComplete={() => markCompleted(item)}
              onReschedule={() => openReschedule(item)}
              onCancel={showCancelUnavailable}
            />
          )) : (
            <View style={styles.empty}>
              <Ionicons name="calendar-clear-outline" size={34} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No appointments found</Text>
              <Text style={styles.emptyText}>Create a new appointment or change the filters.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={sheetOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetKeyboard}>
          <View style={[styles.fullSheet, { paddingTop: insets.top }]}>
            <View style={styles.fullSheetHeader}>
              <Pressable onPress={closeSheet} hitSlop={10} style={styles.fullSheetBack}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>
              <Text style={styles.fullSheetTitle}>{reschedulingAppointment ? "Reschedule Appointment" : "New Appointment"}</Text>
            </View>
            {formError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{formError}</Text></View> : null}

            <ScrollView contentContainerStyle={styles.fullSheetBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetLabel}>Lead <Text style={styles.required}>*</Text></Text>
              {selectedLead ? (
                <View style={styles.selectedLead}>
                  <Text style={styles.selectedLeadText} numberOfLines={1}>{selectedLead.name}</Text>
                  {reschedulingAppointment ? null : (
                    <Pressable onPress={() => setSelectedLead(null)}><Text style={styles.changeLeadText}>Change</Text></Pressable>
                  )}
                </View>
              ) : (
                <>
                  <Searchbar style={styles.sheetSearch} value={leadQuery} onChangeText={setLeadQuery} placeholder="Search leads by name or phone..." elevation={0} />
                  {leadResults.length ? (
                    <ScrollView style={styles.suggestions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {leadResults.map((lead) => (
                        <List.Item key={lead.id} title={lead.name} description={lead.phone} onPress={() => { setSelectedLead(lead); setLeadResults([]); }} />
                      ))}
                    </ScrollView>
                  ) : null}
                </>
              )}

              <Text style={styles.sheetLabel}>Date & Time <Text style={styles.required}>*</Text></Text>
              <DateTimeField value={appointmentAt} onChange={setAppointmentAt} minimumDate={new Date()} />

              <Text style={styles.sheetLabel}>Type</Text>
              <View style={styles.typeRow}>
                {TYPES.map((item) => (
                  <Pressable key={item.key} style={[styles.typeChip, appointmentType === item.key && styles.typeChipActive]} onPress={() => setAppointmentType(item.key)}>
                    <Text style={[styles.typeChipText, appointmentType === item.key && styles.typeChipTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sheetLabel}>Notes (optional)</Text>
              <TextInput mode="outlined" value={notes} onChangeText={setNotes} placeholder="e.g. Discuss pricing" style={styles.notesInput} />
            </ScrollView>

            <View style={[styles.sheetActions, styles.fullSheetActions, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <Button mode="outlined" onPress={closeSheet} style={styles.sheetAction}>Cancel</Button>
              <Button mode="contained" onPress={schedule} loading={saving} disabled={saving} style={styles.sheetAction}>
                {reschedulingAppointment ? "Reschedule" : "Schedule"}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: "transparent" },
  headerTitle: { color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  title: { color: colors.text, fontSize: 20, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  newButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#4f46e5", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  newButtonText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  summaryGrid: { gap: 12, marginBottom: 14 },
  summaryCard: { ...glass, minHeight: 94, padding: 14 },
  upcomingCard: { backgroundColor: "rgba(245,243,255,0.78)", borderColor: "rgba(221,214,254,0.9)" },
  todayCard: { backgroundColor: "rgba(255,251,235,0.82)", borderColor: "rgba(253,230,138,0.9)" },
  overdueCard: { backgroundColor: "rgba(255,241,242,0.82)", borderColor: "rgba(254,205,211,0.9)" },
  summaryIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center", position: "absolute", left: 14, top: 24 },
  summaryIconAmber: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.warningSoft, alignItems: "center", justifyContent: "center", position: "absolute", left: 14, top: 24 },
  summaryIconRed: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center", position: "absolute", left: 14, top: 24 },
  summaryLabel: { marginLeft: 58, color: "#7c3aed", fontSize: 10, fontFamily: "Inter_700Bold" },
  summaryValue: { marginLeft: 58, color: "#7c3aed", fontSize: 26, fontFamily: "Inter_700Bold", marginTop: 3 },
  summaryText: { marginLeft: 58, color: colors.textSecondary, fontSize: 11, marginTop: -2 },
  listCard: { ...glass, padding: 14 },
  tabRow: { gap: 8, paddingBottom: 12 },
  tabChip: { minHeight: 38, paddingHorizontal: 13, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.75)" },
  tabChipActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_700Bold" },
  tabTextActive: { color: "#fff" },
  toolbar: { flexDirection: "row", gap: 8, marginBottom: 10 },
  searchBox: { flex: 1, height: 42, backgroundColor: "rgba(255,255,255,0.82)", borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { fontSize: 12, minHeight: 40 },
  filterButton: { minWidth: 92, height: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.82)" },
  filterButtonText: { color: colors.text, fontSize: 12, fontFamily: "Inter_700Bold" },
  typeFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  typeFilterChip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface },
  typeFilterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeFilterText: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_700Bold" },
  typeFilterTextActive: { color: "#fff" },
  state: { alignItems: "center", justifyContent: "center", paddingVertical: 46, gap: 12 },
  errorText: { color: colors.danger, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#2563eb", fontSize: 12, fontFamily: "Inter_700Bold" },
  rowMain: { flex: 1 },
  rowName: { color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" },
  rowPhone: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  rowType: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  rowTypeText: { color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  rowSide: { alignItems: "flex-end" },
  rowDate: { color: colors.text, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  rowTime: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  statusPill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontFamily: "Inter_700Bold", marginTop: 7 },
  statusOverdue: { color: colors.danger, backgroundColor: colors.dangerSoft },
  statusToday: { color: colors.warning, backgroundColor: colors.warningSoft },
  statusUpcoming: { color: colors.primary, backgroundColor: colors.primarySoft },
  actionButton: { width: 34, height: 34, borderRadius: 9, margin: 0, alignSelf: "center", borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface },
  popover: {
    position: "absolute", minWidth: 190, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSoft, shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 9,
  },
  popoverItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  popoverText: { color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  popoverSuccessText: { color: colors.success },
  popoverDangerText: { color: colors.danger },
  empty: { alignItems: "center", paddingVertical: 42 },
  emptyTitle: { color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 10 },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 4 },
  sheetKeyboard: { flex: 1 },
  fullSheet: { flex: 1, backgroundColor: colors.surface },
  fullSheetHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  fullSheetBack: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  fullSheetTitle: { flex: 1, color: colors.text, fontSize: 22, fontFamily: "Inter_700Bold" },
  fullSheetBody: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  fullSheetActions: { paddingHorizontal: 18, paddingTop: 12, marginTop: 0, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.surface },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.38)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: "86%" },
  sheetBody: { maxHeight: 500 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginBottom: 8 },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontFamily: "Inter_700Bold" },
  sheetLabel: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 10, marginBottom: 7 },
  required: { color: colors.danger },
  selectedLead: { height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.surfaceMuted },
  selectedLeadText: { flex: 1, color: colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  changeLeadText: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_700Bold" },
  sheetSearch: { minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  suggestions: { maxHeight: 178, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, marginTop: 6, backgroundColor: colors.surface },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.surface },
  typeChipActive: { backgroundColor: "#4f46e5", borderColor: "#4f46e5" },
  typeChipText: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_700Bold" },
  typeChipTextActive: { color: "#fff" },
  notesInput: { backgroundColor: colors.surface },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  sheetAction: { flex: 1 },
});

export default function AppointmentsScreen() {
  return <AppointmentsContent />;
  return (
    <PlaceholderScreen
      showBack
      icon="📅"
      title="Appointments"
      description="Book and manage customer appointments."
    />
  );
}
