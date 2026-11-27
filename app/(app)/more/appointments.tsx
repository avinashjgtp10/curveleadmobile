import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, IconButton, List, Searchbar, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { useAuth } from "@/contexts/AuthContext";
import { completeLeadFollowup, createLeadFollowup, fetchLeads, fetchTodayFollowups, FollowupType, LeadListItem, TodayFollowup } from "@/api/leads";


// The add forms' palette: pale blue page, white cards with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", red: "#b3173a", redSoft: "#fde3e8", amber: "#8a4a08", amberSoft: "#fde9d6", green: "#0f7b5f" };
const CARD = { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 16 } as const;
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

// Four menu items (~40 each) plus padding.
const POPOVER_HEIGHT = 172;

function ymd(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Cheap "did this row change" check; stringifying every row of a long history on each refresh was a visible cost.
function sameRow(a: TodayFollowup, b: TodayFollowup) {
  return a.id === b.id && a.next_followup_at === b.next_followup_at && a.followup_type === b.followup_type && a.notes === b.notes
    && a.lead_name === b.lead_name && a.lead_phone === b.lead_phone && a.lead_stage === b.lead_stage;
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
  // Overdue as on the web: the time has passed, even earlier today.
  if (when < now) return "overdue";
  if (isSameDay(when, now)) return "today";
  return "upcoming";
}

// Which tab an appointment is listed under. "Today" counts every appointment on today's date (including ones whose time has
// passed, which are also Overdue), like the web.
function inTab(item: TodayFollowup, tab: "upcoming" | "today" | "overdue") {
  const when = new Date(item.next_followup_at);
  if (Number.isNaN(when.getTime())) return tab === "upcoming";
  const now = new Date();
  if (tab === "overdue") return when < now;
  if (tab === "today") return isSameDay(when, now);
  return when >= now && !isSameDay(when, now);
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
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.length > 1 ? `${words[0][0]}${words[1][0]}`.toUpperCase() : words[0][0].toUpperCase();
}

// Memoized, so typing in the form or a background refresh doesn't redraw every row of a long list.
const AppointmentRow = React.memo(function AppointmentRow({ item, completing, done, onView: viewItem, onComplete: completeItem, onReschedule: rescheduleItem, onCancel: cancelItem }: {
  item: TodayFollowup;
  completing: boolean;
  done?: boolean;
  onView: (item: TodayFollowup) => void;
  onComplete: (item: TodayFollowup) => void;
  onReschedule: (item: TodayFollowup) => void;
  onCancel: (item: TodayFollowup) => void;
}) {
  const onView = () => viewItem(item);
  const onComplete = () => completeItem(item);
  const onReschedule = () => rescheduleItem(item);
  const onCancel = () => cancelItem(item);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ y: 0, right: 16 });
  const anchorRef = useRef<View>(null);
  const meta = typeMeta(item.followup_type);
  const date = formatDate(item.next_followup_at);
  const status = done ? "completed" : statusFor(item);

  function openMenu() {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const { width: windowWidth, height: windowHeight } = Dimensions.get("window");
      // Rows near the bottom would push the menu off-screen (Cancel unreachable), so open it upwards there.
      const below = y + height + 2;
      const top = below + POPOVER_HEIGHT > windowHeight - 8 ? Math.max(8, y - POPOVER_HEIGHT - 2) : below;
      setMenuPos({ y: top, right: Math.max(8, windowWidth - (x + width)) });
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
          <Ionicons name={meta.icon} size={13} color={status === "overdue" ? UI.red : UI.teal} />
          <Text style={styles.rowTypeText}>{meta.label}</Text>
        </View>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.rowDate}>{date.date}</Text>
        <Text style={styles.rowTime}>{date.time}</Text>
        <Text style={[styles.statusPill, status === "overdue" ? styles.statusOverdue : status === "today" ? styles.statusToday : styles.statusUpcoming]}>{status === "overdue" ? "Overdue" : status === "today" ? "Today" : status === "completed" ? "Completed" : "Upcoming"}</Text>
      </View>
      {done ? null : completing || item.id.startsWith("temp-") ? (
        <ActivityIndicator size="small" color={UI.teal} style={styles.actionButton} />
      ) : (
        <View ref={anchorRef} collapsable={false}>
          <IconButton
            icon="dots-vertical"
            iconColor={UI.sub}
            size={20}
            style={styles.actionButton}
            onPress={(event) => { event.stopPropagation(); openMenu(); }}
            accessibilityLabel="Appointment actions"
          />
        </View>
      )}
      {menuOpen ? <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)}>
          <View style={[styles.popover, { top: menuPos.y, right: menuPos.right }]}>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onView)}>
              <Ionicons name="eye-outline" size={16} color={UI.sub} />
              <Text style={styles.popoverText}>View Details</Text>
            </Pressable>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onReschedule)}>
              <Ionicons name="calendar-outline" size={16} color={UI.sub} />
              <Text style={styles.popoverText}>Reschedule</Text>
            </Pressable>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onComplete)}>
              <Ionicons name="checkmark-circle-outline" size={16} color={UI.green} />
              <Text style={[styles.popoverText, styles.popoverSuccessText]}>Mark Completed</Text>
            </Pressable>
            <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onCancel)}>
              <Ionicons name="close-circle-outline" size={16} color={UI.red} />
              <Text style={[styles.popoverText, styles.popoverDangerText]}>Cancel Appointment</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal> : null}
    </Pressable>
  );
});

type AppointmentValues = { lead: LeadListItem; type: FollowupType; at: Date; notes: string; replacing: TodayFollowup | null };
type AppointmentSheetHandle = {
  openCreate: () => void;
  openReschedule: (item: TodayFollowup) => void;
  reopen: (values: AppointmentValues, error: string) => void;
};

// The form keeps what is typed in its own state, so each keystroke redraws only this form and not the appointments list
// behind it.
const AppointmentSheet = React.memo(React.forwardRef<AppointmentSheetHandle, { onSubmit: (values: AppointmentValues) => void }>(
function AppointmentSheet({ onSubmit }, ref) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItem[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [appointmentAt, setAppointmentAt] = useState(defaultFollowupDate());
  const [appointmentType, setAppointmentType] = useState<FollowupType>("call");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [reschedulingAppointment, setReschedulingAppointment] = useState<TodayFollowup | null>(null);

  React.useImperativeHandle(ref, () => ({
    openCreate: () => {
      setLeadQuery(""); setLeadResults([]); setSelectedLead(null);
      setAppointmentAt(defaultFollowupDate()); setAppointmentType("call"); setNotes(""); setFormError("");
      setReschedulingAppointment(null);
      setSheetOpen(true);
      fetchLeads({ limit: 8 }).then((result) => setLeadResults(result.leads)).catch(() => setLeadResults([]));
    },
    openReschedule: (item) => {
      const existingDate = new Date(item.next_followup_at);
      setReschedulingAppointment(item);
      setLeadQuery(""); setLeadResults([]);
      setSelectedLead({ id: item.lead_id, name: item.lead_name, phone: item.lead_phone, stage: item.lead_stage, created_at: new Date().toISOString() });
      // An overdue appointment's old time can't be saved again, so start from a fresh future time.
      setAppointmentAt(Number.isNaN(existingDate.getTime()) || existingDate.getTime() < Date.now() ? defaultFollowupDate() : existingDate);
      setAppointmentType(followupTypeOrDefault(item.followup_type));
      setNotes(item.notes || ""); setFormError("");
      setSheetOpen(true);
    },
    reopen: (values, error) => {
      setReschedulingAppointment(values.replacing);
      setLeadQuery(""); setLeadResults([]); setSelectedLead(values.lead);
      setAppointmentAt(values.at); setAppointmentType(values.type); setNotes(values.notes); setFormError(error);
      setSheetOpen(true);
    },
  }), []);

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: sheetOpen ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [sheetOpen, navigation, insets.bottom]);

  useEffect(() => {
    if (!sheetOpen || selectedLead) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    let cancelled = false;
    searchTimer.current = setTimeout(async () => {
      try {
        const searchText = leadQuery.trim();
        const { leads } = await fetchLeads({ search: searchText || undefined, limit: 8 });
        // Ignore a slower response for an older query.
        if (!cancelled) setLeadResults(leads);
      }
      catch { if (!cancelled) setLeadResults([]); }
    }, 300);
    return () => { cancelled = true; if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery, selectedLead, sheetOpen]);

  function closeSheet() {
    setSheetOpen(false);
    setReschedulingAppointment(null);
  }

  function submit() {
    if (!selectedLead) { setFormError("Select a lead first."); return; }
    if (appointmentAt.getTime() < Date.now() - 60000) { setFormError("Choose a date and time in the future."); return; }
    setFormError(""); setSheetOpen(false);
    const values = { lead: selectedLead, type: appointmentType, at: appointmentAt, notes, replacing: reschedulingAppointment };
    // Let the form start closing first; redrawing a long appointment list in the same frame made the Save tap feel stuck.
    requestAnimationFrame(() => onSubmit(values));
  }

  return (
      <Modal visible={sheetOpen} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={closeSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetKeyboard}>
          <View style={[styles.fullSheet, { paddingTop: insets.top }]}>
            <View style={styles.fullSheetHeader}>
              <Pressable onPress={closeSheet} hitSlop={10} style={styles.fullSheetBack}>
                <Ionicons name="arrow-back" size={24} color={UI.ink} />
              </Pressable>
              <Text style={styles.fullSheetTitle}>{reschedulingAppointment ? "Reschedule Appointment" : "New Appointment"}</Text>
            </View>
            {formError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={UI.red} /><Text style={styles.sheetErrorText}>{formError}</Text></View> : null}

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
              <Button mode="outlined" textColor={UI.teal} onPress={closeSheet} style={styles.sheetAction}>Cancel</Button>
              <Button mode="contained" buttonColor={UI.teal} onPress={submit} style={styles.sheetAction}>
                {reschedulingAppointment ? "Reschedule" : "Schedule"}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
  );
}));

// The last list loaded, so reopening the screen shows it at once while a fresh copy loads.
let appointmentsCache: { userId: string; list: TodayFollowup[] } | null = null;
// The whole history is big; it is downloaded again only after this long. In between, reopening re-checks just the days around today.
const FULL_REFRESH_MS = 5 * 60_000;
let appointmentsFullAt = 0;

function AppointmentsContent() {
  const { user } = useAuth();
  const cachedList = appointmentsCache && appointmentsCache.userId === user?.id ? appointmentsCache.list : null;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [appointments, setAppointments] = useState<TodayFollowup[]>(cachedList ?? []);
  const [loading, setLoading] = useState(!cachedList);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<AppointmentTab>("all");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftTab, setDraftTab] = useState<AppointmentTab>("all");
  const [draftType, setDraftType] = useState<FollowupType | "">("");
  const [typeFilter, setTypeFilter] = useState<FollowupType | "">("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  // The server only returns open appointments, so the Completed tab lists the ones finished in this session.
  const [completedItems, setCompletedItems] = useState<TodayFollowup[]>([]);
  const hasData = useRef(!!cachedList);
  // Counts changes made on this screen, so a slower background load can tell its answer is out of date.
  const localChanges = useRef(0);
  // Keep the reopen cache in step with every change, not only with loads.
  useEffect(() => {
    if (user?.id && hasData.current) appointmentsCache = { userId: user.id, list: appointments.filter((row) => !row.id.startsWith("temp-")) };
  }, [appointments, user?.id]);
  // Rows are drawn 30 at a time, so a long history doesn't make the screen heavy.
  const [shown, setShown] = useState(30);
  useEffect(() => { setShown(30); }, [activeTab, query, typeFilter]);

  const sheetRef = useRef<AppointmentSheetHandle>(null);

  // After a save the list already shows the new time, so only the days around today are re-checked (a small request)
  // instead of downloading the whole history again.
  const refreshNear = useCallback(async () => {
    try {
      const from = new Date(); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
      const to = new Date(); to.setDate(to.getDate() + 60);
      const near = await fetchTodayFollowups({ date_from: ymd(from), date_to: ymd(to) });
      setAppointments((current) => {
        const old = new Map(current.map((row) => [row.id, row]));
        const kept = current.filter((row) => row.id.startsWith("temp-") || new Date(row.next_followup_at) < from || new Date(row.next_followup_at) > to);
        const fresh = near.map((row) => { const before = old.get(row.id); return before && sameRow(before, row) ? before : row; });
        const ids = new Set(fresh.map((row) => row.id));
        return [...fresh, ...kept.filter((row) => !ids.has(row.id))];
      });
    } catch { /* the list on screen is already right; the next open re-syncs */ }
  }, []);

  // `silent` re-syncs in the background: no spinner, and a failure keeps the list on screen without an alert.
  const load = useCallback(async (refresh = false, silent = false) => {
    // A list is already on screen and the full history was downloaded recently: only re-check the days around today.
    if (silent && !refresh && hasData.current && Date.now() - appointmentsFullAt < FULL_REFRESH_MS) { await refreshNear(); return; }
    if (!silent) {
      refresh ? setRefreshing(true) : setLoading(true);
      setError("");
    }
    const changesAtStart = localChanges.current;
    try {
      const future = new Date(); future.setDate(future.getDate() + 730);
      // On the first load, the days around today come first so the list appears fast; the full history follows.
      if (!hasData.current) {
        const from = new Date(); from.setDate(from.getDate() - 7);
        const to = new Date(); to.setDate(to.getDate() + 60);
        const near = await fetchTodayFollowups({ date_from: ymd(from), date_to: ymd(to) }).catch(() => null);
        if (near && !hasData.current) { setAppointments(near); hasData.current = true; setLoading(false); }
      }
      const rows = await fetchTodayFollowups({ date_from: "1970-01-01", date_to: ymd(future) });
      hasData.current = true;
      appointmentsFullAt = Date.now();
      // The list was changed here (scheduled, completed, cancelled) while this was loading, so this answer is out of date
      // and would wipe the change; the next load picks everything up.
      if (localChanges.current !== changesAtStart) return;
      // Keep the old objects for rows that didn't change, so their memoized rows aren't redrawn. Rows still being saved stay.
      setAppointments((current) => {
        const old = new Map(current.map((row) => [row.id, row]));
        const fresh = rows.map((row) => { const before = old.get(row.id); return before && sameRow(before, row) ? before : row; });
        return [...current.filter((row) => row.id.startsWith("temp-")), ...fresh];
      });
    } catch {
      // A failed refresh must not hide a list that is already on screen.
      if (silent) return;
      if (refresh && hasData.current) Alert.alert("Couldn't refresh", "Showing the last loaded appointments.");
      else if (!hasData.current) setError("Could not load appointments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, refreshNear]);

  useEffect(() => { load(false, !!cachedList); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const upcoming = appointments.filter((item) => inTab(item, "upcoming")).length;
    const today = appointments.filter((item) => inTab(item, "today")).length;
    const overdue = appointments.filter((item) => inTab(item, "overdue")).length;
    return { upcoming, today, overdue };
  }, [appointments]);

  const visibleAppointments = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (activeTab === "completed" ? completedItems : appointments).filter((item) => {
      if (activeTab !== "all" && activeTab !== "completed" && !inTab(item, activeTab)) return false;
      if (typeFilter && followupTypeOrDefault(item.followup_type) !== typeFilter) return false;
      if (!text) return true;
      return [item.lead_name, item.lead_phone, item.followup_type, typeMeta(item.followup_type).label, item.notes].some((value) => String(value || "").toLowerCase().includes(text));
    });
  }, [activeTab, appointments, completedItems, query, typeFilter]);

  function openCreate() { sheetRef.current?.openCreate(); }

  async function schedule(form: AppointmentValues) {
    const { lead, type, at, notes, replacing } = form;
    // The form is already closed; show the new time at once and save in the background. The form comes back if the server refuses.
    localChanges.current++;
    const tempId = `temp-${Date.now()}`;
    const placeholder: TodayFollowup = {
      id: tempId, lead_id: lead.id, lead_name: lead.name, lead_phone: lead.phone, lead_stage: lead.stage,
      followup_type: type, next_followup_at: at.toISOString(), notes: notes.trim() || undefined,
    };
    setAppointments((current) => [placeholder, ...current.filter((item) => item.id !== replacing?.id)]);
    setActiveTab("all"); setQuery(""); setTypeFilter(""); setFilterOpen(false);
    try {
      const created = await createLeadFollowup(lead.id, { followup_type: type, next_followup_at: at.toISOString(), notes: notes.trim() || undefined });
      setAppointments((current) => current.map((item) => item.id === tempId ? {
        ...placeholder, id: created.id,
        followup_type: created.followup_type || placeholder.followup_type,
        next_followup_at: created.next_followup_at || placeholder.next_followup_at,
        notes: created.notes || placeholder.notes,
      } : item));
      if (replacing) {
        // The new appointment already exists, so a failure here must not look like the whole reschedule failed
        // (retrying would create a duplicate).
        try { await completeLeadFollowup(replacing.id, "Rescheduled"); }
        catch { Alert.alert("Rescheduled", "The new time was saved, but the old appointment could not be closed. Mark it completed manually."); }
      }
      refreshNear();
    } catch {
      // Put the list back and give the form back with what was typed, so nothing is lost.
      setAppointments((current) => {
        const without = current.filter((item) => item.id !== tempId);
        return replacing && !without.some((item) => item.id === replacing.id) ? [replacing, ...without] : without;
      });
      sheetRef.current?.reopen(form, replacing ? "Could not reschedule this appointment." : "Could not schedule this appointment.");
    }
  }

  const viewAppointment = useCallback((item: TodayFollowup) => {
    router.push({ pathname: "/(app)/leads/[id]", params: { id: item.lead_id, name: item.lead_name, phone: item.lead_phone, stage: item.lead_stage || "new" } });
  }, []);

  const markCompleted = useCallback(async (item: TodayFollowup) => {
    // Move it at once and tell the server in the background; put it back if the server refuses.
    localChanges.current++;
    setCompletingId(item.id);
    setAppointments((current) => current.filter((appointment) => appointment.id !== item.id));
    setCompletedItems((current) => [item, ...current]);
    try {
      await completeLeadFollowup(item.id);
    } catch {
      localChanges.current++;
      setCompletedItems((current) => current.filter((done) => done.id !== item.id));
      setAppointments((current) => current.some((appointment) => appointment.id === item.id) ? current : [item, ...current]);
      Alert.alert("Couldn't update appointment", "Please try again.");
    } finally {
      setCompletingId(null);
    }
  }, []);

  const openReschedule = useCallback((item: TodayFollowup) => { sheetRef.current?.openReschedule(item); }, []);

  const confirmCancel = useCallback((item: TodayFollowup) => {
    Alert.alert("Cancel appointment?", `Cancel the appointment with ${item.lead_name}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel appointment", style: "destructive",
        onPress: async () => {
          localChanges.current++;
          setCompletingId(item.id);
          setAppointments((current) => current.filter((appointment) => appointment.id !== item.id));
          try {
            await completeLeadFollowup(item.id, "Cancelled");
          } catch {
            localChanges.current++;
            setAppointments((current) => current.some((appointment) => appointment.id === item.id) ? current : [item, ...current]);
            Alert.alert("Couldn't cancel appointment", "Please try again.");
          } finally {
            setCompletingId(null);
          }
        },
      },
    ]);
  }, []);

  function openFilters() {
    setDraftTab(activeTab);
    setDraftType(typeFilter);
    setFilterOpen(true);
  }

  // Going back to Home (when opened from a Home tile) is handled for every More screen in more/_layout.tsx.
  function goBack() {
    router.back();
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Appointments</Text>
        <Pressable onPress={() => load(true)} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Refresh">
          <Ionicons name="refresh" size={20} color={UI.teal} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={UI.teal} colors={[UI.teal]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.subtitle}>All scheduled sales appointments</Text>
          </View>
          <Pressable style={styles.newButton} onPress={openCreate}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newButtonText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: UI.tealSoft }]}><Ionicons name="calendar-outline" size={16} color={UI.teal} /></View>
            <Text style={[styles.summaryValue, { color: UI.teal }]}>{counts.upcoming}</Text>
            <Text style={styles.summaryLabel}>Upcoming</Text>
            <Text style={styles.summaryText}>appointments</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: UI.amberSoft }]}><Ionicons name="time-outline" size={16} color={UI.amber} /></View>
            <Text style={[styles.summaryValue, { color: UI.amber }]}>{counts.today}</Text>
            <Text style={styles.summaryLabel}>Today</Text>
            <Text style={styles.summaryText}>scheduled</Text>
          </View>
          <View style={[styles.summaryCard, styles.overdueCard]}>
            <View style={[styles.summaryIcon, { backgroundColor: UI.redSoft }]}><Ionicons name="alert-circle-outline" size={16} color={UI.red} /></View>
            <Text style={[styles.summaryValue, { color: UI.red }]}>{counts.overdue}</Text>
            <Text style={styles.summaryLabel}>Overdue</Text>
            <Text style={styles.summaryText}>need follow-up</Text>
          </View>
        </View>

        <View style={styles.listCard}>
          <View style={styles.toolbar}>
            <Searchbar value={query} onChangeText={setQuery} placeholder="Search by lead name..." elevation={0} inputStyle={styles.searchInput} style={styles.searchBox} />
            <Pressable style={styles.filterButton} onPress={openFilters} accessibilityRole="button" accessibilityLabel="Filters">
              <Ionicons name="options-outline" size={16} color={UI.teal} />
              <Text style={styles.filterButtonText}>Filters</Text>
            </Pressable>
          </View>

          <View style={styles.showingRow}>
            <Text style={styles.showingLabel}>Showing</Text>
            <View style={styles.showingPill}><Text style={styles.showingPillText}>{TABS.find((tab) => tab.key === activeTab)?.label}</Text></View>
            {typeFilter ? <View style={styles.showingPill}><Text style={styles.showingPillText}>{typeMeta(typeFilter).label}</Text></View> : null}
          </View>

          {loading ? (
            <View style={styles.state}><ActivityIndicator size="large" color={UI.teal} /></View>
          ) : error ? (
            <View style={styles.state}><Text style={styles.errorText}>{error}</Text><Button mode="contained" buttonColor={UI.teal} onPress={() => load()}>Try again</Button></View>
          ) : visibleAppointments.length ? visibleAppointments.slice(0, shown).map((item) => (
            <AppointmentRow
              key={item.id}
              item={item}
              completing={completingId === item.id}
              done={activeTab === "completed"}
              onView={viewAppointment}
              onComplete={markCompleted}
              onReschedule={openReschedule}
              onCancel={confirmCancel}
            />
          )) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="calendar-outline" size={24} color={UI.teal} /></View>
              <Text style={styles.emptyTitle}>{query || typeFilter || activeTab !== "all" ? "No appointments found" : "No appointments yet"}</Text>
              <Text style={styles.emptyText}>{activeTab === "completed" ? "Appointments you mark completed will show up here." : query || typeFilter || activeTab !== "all" ? "Change the filters or search to see more." : "Schedule your first sales appointment with a lead and it will show up here."}</Text>
              <Pressable style={styles.emptyButton} onPress={openCreate}>
                <Ionicons name="add" size={18} color={UI.teal} />
                <Text style={styles.emptyButtonText}>New appointment</Text>
              </Pressable>
            </View>
          )}
          {!loading && !error && visibleAppointments.length > shown ? (
            <Button mode="outlined" textColor={UI.teal} onPress={() => setShown((count) => count + 30)} style={{ marginTop: 10 }}>
              Show more ({visibleAppointments.length - shown} left)
            </Button>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={filterOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setFilterOpen(false)}>
          <Pressable style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.filterHead}>
              <Text style={styles.filterTitle}>Filters</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8} style={styles.filterClose} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={18} color={UI.ink} /></Pressable>
            </View>

            <Text style={styles.filterSection}>APPOINTMENTS</Text>
            <View style={styles.filterChips}>
              {TABS.map((tab) => {
                const active = draftTab === tab.key;
                return (
                  <Pressable key={tab.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setDraftTab(tab.key)}>
                    {active ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.filterDivider} />
            <Text style={styles.filterSection}>TYPE</Text>
            <View style={styles.filterChips}>
              {[{ key: "" as const, label: "Show All" }, ...TYPES].map((item) => {
                const active = draftType === item.key;
                return (
                  <Pressable key={item.label} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setDraftType(item.key)}>
                    {active ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.filterActions}>
              <Pressable style={styles.resetButton} onPress={() => { setDraftTab("all"); setDraftType(""); }}><Text style={styles.resetText}>Reset</Text></Pressable>
              <Pressable style={styles.applyButton} onPress={() => { setActiveTab(draftTab); setTypeFilter(draftType); setFilterOpen(false); }}><Text style={styles.applyText}>Apply filters</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <AppointmentSheet ref={sheetRef} onSubmit={schedule} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  content: { paddingHorizontal: 14, paddingTop: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  title: { color: UI.ink, fontSize: 20, fontFamily: "DMSans_700Bold" },
  subtitle: { color: UI.sub, fontSize: 12 },
  newButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: UI.teal, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  newButtonText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  summaryGrid: { flexDirection: "row", gap: 8, marginBottom: 10 },
  summaryCard: { flex: 1, ...CARD, borderRadius: 14, padding: 9 },
  overdueCard: { borderColor: "#f6c8d0" },
  summaryIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  summaryLabel: { color: UI.ink, fontSize: 11, fontFamily: "Inter_700Bold" },
  summaryValue: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 4 },
  summaryText: { color: UI.sub, fontSize: 10, marginTop: 0 },
  listCard: { gap: 0 },
  toolbar: { flexDirection: "row", gap: 8, marginBottom: 8 },
  searchBox: { flex: 1, height: 38, backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: UI.line },
  searchInput: { fontSize: 13, minHeight: 36 },
  filterButton: { height: 38, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  filterButtonText: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold" },
  showingRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  showingLabel: { color: UI.sub, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  showingPill: { backgroundColor: "#e1eef7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  showingPillText: { color: UI.teal, fontSize: 12, fontFamily: "Inter_700Bold" },
  filterSheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8 },
  filterHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 0, marginBottom: 8 },
  filterTitle: { color: UI.ink, fontSize: 17, fontFamily: "Inter_700Bold" },
  filterClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#e8f1f7", alignItems: "center", justifyContent: "center" },
  filterSection: { color: UI.sub, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 6 },
  filterChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  filterChipActive: { backgroundColor: UI.teal, borderColor: UI.teal },
  filterChipText: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold" },
  filterChipTextActive: { color: "#ffffff" },
  filterDivider: { height: 1, backgroundColor: UI.line, marginVertical: 12 },
  filterActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  resetButton: { flex: 1, height: 42, borderRadius: 14, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  resetText: { color: UI.teal, fontSize: 14, fontFamily: "Inter_700Bold" },
  applyButton: { flex: 1.4, height: 42, borderRadius: 14, backgroundColor: UI.teal, alignItems: "center", justifyContent: "center" },
  applyText: { color: "#ffffff", fontSize: 14, fontFamily: "Inter_700Bold" },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center" },
  emptyButton: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12, backgroundColor: "#e1eef7", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  emptyButtonText: { color: UI.teal, fontSize: 13, fontFamily: "Inter_700Bold" },
  state: { alignItems: "center", justifyContent: "center", paddingVertical: 46, gap: 12 },
  errorText: { color: UI.red, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: UI.line },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#e1eef7", alignItems: "center", justifyContent: "center" },
  avatarText: { color: UI.teal, fontSize: 12, fontFamily: "Inter_700Bold" },
  rowMain: { flex: 1 },
  rowName: { color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold" },
  rowPhone: { color: UI.muted, fontSize: 11, marginTop: 2 },
  rowType: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  rowTypeText: { color: UI.ink, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  rowSide: { alignItems: "flex-end" },
  rowDate: { color: UI.ink, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  rowTime: { color: UI.muted, fontSize: 11, marginTop: 2 },
  statusPill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontFamily: "Inter_700Bold", marginTop: 7 },
  statusOverdue: { color: UI.red, backgroundColor: UI.redSoft },
  statusToday: { color: UI.amber, backgroundColor: UI.amberSoft },
  statusUpcoming: { color: UI.teal, backgroundColor: UI.tealSoft },
  actionButton: { width: 34, height: 34, borderRadius: 9, margin: 0, alignSelf: "center", borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  popover: {
    position: "absolute", minWidth: 190, paddingVertical: 6, borderRadius: 10, backgroundColor: "#ffffff",
    borderWidth: 1, borderColor: UI.line, shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 9,
  },
  popoverItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  popoverText: { color: UI.sub, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  popoverSuccessText: { color: UI.green },
  popoverDangerText: { color: UI.red },
  empty: { alignItems: "center", paddingVertical: 22, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: "#cfe3f1", backgroundColor: "#ffffff" },
  emptyTitle: { color: UI.ink, fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 10 },
  emptyText: { color: UI.sub, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 4 },
  sheetKeyboard: { flex: 1 },
  fullSheet: { flex: 1, backgroundColor: UI.bg },
  fullSheetHeader: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.line },
  fullSheetBack: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  fullSheetTitle: { flex: 1, color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  fullSheetBody: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  fullSheetActions: { paddingHorizontal: 18, paddingTop: 12, marginTop: 0, borderTopWidth: 1, borderTopColor: UI.line, backgroundColor: UI.bg },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,31,61,0.45)" },
  sheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: "86%" },
  sheetBody: { maxHeight: 500 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: UI.line, marginBottom: 14 },
  sheetTitle: { color: UI.ink, fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: UI.redSoft, borderRadius: 10, padding: 10, marginBottom: 8 },
  sheetErrorText: { flex: 1, color: UI.red, fontSize: 12, fontFamily: "Inter_700Bold" },
  sheetLabel: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 12, marginBottom: 6 },
  required: { color: UI.red },
  selectedLead: { height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: UI.line, borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#f3f7fb" },
  selectedLeadText: { flex: 1, color: UI.ink, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  changeLeadText: { color: UI.muted, fontSize: 11, fontFamily: "Inter_700Bold" },
  sheetSearch: { minHeight: 48, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 12 },
  suggestions: { maxHeight: 178, borderWidth: 1, borderColor: UI.line, borderRadius: 10, marginTop: 6, backgroundColor: "#ffffff" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { borderWidth: 1, borderColor: UI.line, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#ffffff" },
  typeChipActive: { backgroundColor: UI.teal, borderColor: UI.teal },
  typeChipText: { color: UI.sub, fontSize: 12, fontFamily: "Inter_700Bold" },
  typeChipTextActive: { color: "#fff" },
  notesInput: { backgroundColor: "#ffffff" },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  sheetAction: { flex: 1, borderRadius: 999 },
});

export default function AppointmentsScreen() {
  return <AppointmentsContent />;
}
