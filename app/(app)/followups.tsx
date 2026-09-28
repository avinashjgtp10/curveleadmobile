import { GlassBackground, glass, GradientIcon } from "@/components/Glass";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useWindowDimensions, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View,
} from "react-native";
import { ActivityIndicator, Appbar, Button, IconButton, List, Searchbar, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { router, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import { useStages } from "@/hooks/useStages";
import {
  completeLeadFollowup, createLeadFollowup, fetchLeads, fetchTodayFollowups,
  LeadListItem, TodayFollowup,
} from "@/api/leads";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const DAY_ITEM_WIDTH = 46;
const DAYS_BEFORE_TODAY = 60;
const DAYS_AFTER_TODAY = 90;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ymd(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function pretty(value?: string) {
  if (!value) return "Follow-up";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function FollowupRow({ item, completing, onComplete, onPress, colorFor, findStage }: {
  item: TodayFollowup; completing: boolean; onComplete: () => void; onPress: () => void;
  colorFor: (stage?: string) => { bg: string; text: string };
  findStage: (name?: string) => { name: string } | undefined;
}) {
  const stageColors = colorFor(item.lead_stage);
  const stageLabel = findStage(item.lead_stage)?.name || pretty(item.lead_stage);
  const time = new Date(item.next_followup_at);
  const timeLabel = Number.isNaN(time.getTime()) ? "" : time.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <List.Item
      style={styles.row}
      title={() => (
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowName} numberOfLines={1}>{item.lead_name}</Text>
          <View style={[styles.stagePill, { backgroundColor: stageColors.bg }]}><Text style={[styles.stagePillText, { color: stageColors.text }]}>{stageLabel}</Text></View>
        </View>
      )}
      description={() => (
        <>
          <Text style={styles.rowTime}>Follow-Up Time – {timeLabel}</Text>
          {item.notes ? <Text style={styles.rowNotes} numberOfLines={2}>{item.notes}</Text> : null}
        </>
      )}
      left={() => <List.Icon icon={() => <Text style={styles.avatarText}>{item.lead_name?.charAt(0)?.toUpperCase() || "?"}</Text>} style={styles.avatar} />}
      right={() => completing ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.doneButton} />
      ) : (
        <IconButton icon="check-circle-outline" iconColor={colors.primary} size={24} style={styles.doneButton} onPress={onComplete} />
      )}
      onPress={onPress}
    />
  );
}

export default function FollowupsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colorFor, findStage } = useStages();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const didMountRef = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [followups, setFollowups] = useState<TodayFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: addOpen ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { navigation.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [addOpen, navigation, insets.bottom]);

  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItem[]>([]);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [followupAt, setFollowupAt] = useState(defaultFollowupDate());
  const [followupNotes, setFollowupNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const load = useCallback(async (date: Date, refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const dateStr = ymd(date);
      // On today's date, only bound the upper end so overdue follow-ups from
      // earlier days (e.g. the dashboard's "critical follow-ups" count) still show up.
      // Browsing to a specific past/future day filters to exactly that day.
      const isToday = isSameDay(date, new Date());
      const result = await fetchTodayFollowups(isToday ? { date_to: dateStr } : { date_from: dateStr, date_to: dateStr });
      setFollowups(result);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load follow-ups."));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(selectedDate); }, [selectedDate, load]);

  useEffect(() => {
    if (!addOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!leadQuery.trim()) { setLeadResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchingLeads(true);
      try {
        const result = await fetchLeads({ search: leadQuery.trim(), limit: 6 });
        setLeadResults(result.leads);
      } catch { /* best-effort suggestions */ }
      finally { setSearchingLeads(false); }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery, addOpen]);

  const days = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - DAYS_BEFORE_TODAY);
    return Array.from({ length: DAYS_BEFORE_TODAY + DAYS_AFTER_TODAY + 1 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d;
    });
  }, []);

  function scrollToDate(date: Date, animated: boolean) {
    const index = days.findIndex((d) => isSameDay(d, date));
    if (index < 0) return;
    const x = Math.max(0, index * DAY_ITEM_WIDTH - screenWidth / 2 + DAY_ITEM_WIDTH / 2);
    scrollRef.current?.scrollTo({ x, animated });
  }

  useEffect(() => {
    scrollToDate(selectedDate, didMountRef.current);
    didMountRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  function jumpDays(delta: number) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    setSelectedDate(next);
  }

  async function handleComplete(item: TodayFollowup) {
    setCompletingId(item.id);
    try {
      await completeLeadFollowup(item.id);
      setFollowups((current) => current.filter((f) => f.id !== item.id));
    } catch (completeError) {
      setError(errorMessage(completeError, "Could not update this follow-up."));
    } finally { setCompletingId(null); }
  }

  function openAdd() {
    setLeadQuery(""); setLeadResults([]); setSelectedLead(null);
    setFollowupAt(defaultFollowupDate()); setFollowupNotes(""); setAddError("");
    setAddOpen(true);
  }

  async function saveFollowup() {
    if (!selectedLead) { setAddError("Search and select a lead first."); return; }
    setSaving(true); setAddError("");
    try {
      await createLeadFollowup(selectedLead.id, {
        followup_type: "call",
        next_followup_at: followupAt.toISOString(),
        notes: followupNotes.trim() || undefined,
      });
      setAddOpen(false);
      load(selectedDate, true);
    } catch (saveError) {
      setAddError(errorMessage(saveError, "Could not schedule this follow-up."));
    } finally { setSaving(false); }
  }

  return (
    <View style={styles.screen}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        {router.canGoBack() ? <Appbar.BackAction onPress={() => router.back()} /> : null}
        <Appbar.Content title="Follow-ups" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="plus" color={colors.primary} onPress={openAdd} />
      </Appbar.Header>

      <View style={styles.calendar}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => jumpDays(-7)} hitSlop={8}><Ionicons name="chevron-back" size={18} color={colors.primary} /></Pressable>
          <Text style={styles.monthLabel}>{MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}</Text>
          <Pressable onPress={() => jumpDays(7)} hitSlop={8}><Ionicons name="chevron-forward" size={18} color={colors.primary} /></Pressable>
        </View>
        <ScrollView
          ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekRow} decelerationRate="fast"
        >
          {days.map((day, index) => {
            const active = isSameDay(day, selectedDate);
            return (
              <Pressable key={index} style={styles.dayColumn} onPress={() => setSelectedDate(day)}>
                <Text style={styles.dayLabel}>{WEEKDAYS[day.getDay()]}</Text>
                <View style={[styles.dayNumber, active && styles.dayNumberActive]}>
                  <Text style={[styles.dayNumberText, active && styles.dayNumberTextActive]}>{day.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
        <Pressable style={styles.todayToggle} onPress={() => setExpanded((value) => !value)}>
          <Text style={styles.todayToggleText}>{isSameDay(selectedDate, new Date()) ? "Today" : "Selected day"} ({followups.length})</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
        </Pressable>

      {expanded ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, flexGrow: followups.length ? 0 : 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(selectedDate, true)} tintColor={colors.primary} colors={[colors.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.errorText}>{error}</Text>
              <Button mode="contained" onPress={() => load(selectedDate)} style={styles.retry}>Try again</Button>
            </View>
          ) : followups.length ? (
            followups.map((item) => (
              <FollowupRow
                key={item.id} item={item} completing={completingId === item.id}
                onComplete={() => handleComplete(item)} colorFor={colorFor} findStage={findStage}
                onPress={() => router.push({ pathname: "/(app)/leads/[id]", params: { id: item.lead_id, name: item.lead_name, phone: item.lead_phone, stage: item.lead_stage || "new" } })}
              />
            ))
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="paw-outline" size={32} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>No follow-ups due on this day.</Text>
              <Text style={styles.emptyText}>Start assigning leads and set follow-ups</Text>
            </View>
          )}
        </ScrollView>
      ) : null}

      <Modal visible={addOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !saving && setAddOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !saving && setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Follow-up</Text>
            <ScrollView
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) }}
              keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            >
              {addError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{addError}</Text></View> : null}

              <Text style={styles.sheetSectionLabel}>Lead Name <Text style={styles.required}>*</Text></Text>
              {selectedLead ? (
                <View style={styles.selectedLead}>
                  <Text style={styles.selectedLeadText} numberOfLines={1}>{selectedLead.name} · {selectedLead.phone}</Text>
                  <Pressable onPress={() => setSelectedLead(null)} hitSlop={8}><Ionicons name="close" size={16} color={colors.textSecondary} /></Pressable>
                </View>
              ) : (
                <>
                  <Searchbar
                    style={styles.searchInput} inputStyle={styles.searchInputText}
                    value={leadQuery} onChangeText={setLeadQuery} placeholder="Search & Select Lead"
                    loading={searchingLeads} elevation={0}
                  />
                  {leadResults.length ? (
                    <View style={styles.suggestions}>
                      {leadResults.map((lead) => (
                        <List.Item
                          key={lead.id} title={lead.name} titleNumberOfLines={1}
                          description={lead.phone}
                          onPress={() => { setSelectedLead(lead); setLeadResults([]); }}
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              )}

              <Text style={styles.sheetSectionLabel}>Follow-Up Date &amp; Time</Text>
              <DateTimeField value={followupAt} onChange={setFollowupAt} minimumDate={new Date()} />

              <Text style={styles.sheetSectionLabel}>Follow-Up Note</Text>
              <TextInput mode="outlined" value={followupNotes} onChangeText={setFollowupNotes} placeholder="Add a note (optional)" multiline numberOfLines={3} style={styles.sheetTextarea} />

              <Button mode="contained" onPress={saveFollowup} loading={saving} disabled={saving} style={styles.sheetPrimaryButton} contentStyle={styles.sheetPrimaryButtonContent}>Save</Button>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: "transparent" },
  headerTitle: { fontSize: 20, fontFamily: "DMSans_700Bold" },

  calendar: { ...glass, marginHorizontal: 16, marginBottom: 16, paddingBottom: 12 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14 },
  monthLabel: { color: colors.primary, fontSize: 14, fontFamily: "Inter_700Bold" },
  weekRow: { flexDirection: "row", paddingHorizontal: 8 },
  dayColumn: { width: DAY_ITEM_WIDTH, alignItems: "center", gap: 8 },
  dayLabel: { color: colors.textMuted, fontSize: 10, fontFamily: "Inter_700Bold" },
  dayNumber: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dayNumberActive: { backgroundColor: colors.primary },
  dayNumberText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  dayNumberTextActive: { color: colors.surface },
  todayToggle: { ...glass, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 16 },
  todayToggleText: { color: colors.primary, fontSize: 14, fontWeight: "700" },

  state: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center", paddingHorizontal: 30 },
  retry: { marginTop: 14 },

  empty: { alignItems: "center", justifyContent: "center", flex: 1, paddingVertical: 60, paddingHorizontal: 30 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { color: colors.primary, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyText: { color: colors.primary, fontSize: 14, textAlign: "center", marginTop: 4 },

  row: { ...glass, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  rowTitleLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  rowName: { flexShrink: 1, maxWidth: "100%", color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  stagePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  stagePillText: { fontSize: 10, fontWeight: "800" },
  rowTime: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  rowNotes: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  doneButton: { alignSelf: "center" },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" },
  sheetHandle: { width: 34, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 10 },
  sheetTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  sheetSectionLabel: { color: colors.text, fontSize: 11, fontWeight: "700", marginTop: 10, marginBottom: 5 },
  required: { color: colors.danger },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, marginBottom: 4, borderRadius: 8, backgroundColor: colors.dangerSoft },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 11, fontWeight: "700" },
  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  searchInputText: { fontSize: 13, minHeight: 0 },
  suggestions: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 6, overflow: "hidden" },
  selectedLead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 40, paddingHorizontal: 12, backgroundColor: colors.primarySoft, borderRadius: 8 },
  selectedLeadText: { flex: 1, color: colors.primary, fontSize: 13, fontWeight: "700" },
  sheetTextarea: { minHeight: 56 },
  sheetPrimaryButton: { marginTop: 14, marginBottom: 4 },
  sheetPrimaryButtonContent: { height: 42 },
});
