import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Dimensions, Linking, useWindowDimensions, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View,
} from "react-native";
import { ActivityIndicator, Button, List, Searchbar, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import { useStages } from "@/hooks/useStages";
import { telUrl } from "@/api/phone";
import {
  completeLeadFollowup, createLeadFollowup, fetchLeads, fetchTodayFollowups, trackContactActivity,
  FollowupType, LeadListItem, TodayFollowup,
} from "@/api/leads";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const FOLLOWUP_TYPES: { key: FollowupType; label: string }[] = [
  { key: "call", label: "Call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "visit", label: "Visit" },
  { key: "demo", label: "Demo" },
];

// Palette: soft grey-green page, white cards, deep green accent, red for overdue.
const UI = { bg: "#f1f4f2", line: "#e4e9e6", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", green: "#0f7b5f", blue: "#2457e6", teal: "#0b6b97", formBg: "#f0f6fa", formLine: "#cfe3f1", red: "#d6334f", redSoft: "#fdecef", redLine: "#f6c8d0" };
const AVATAR_COLORS = ["#c8294a", "#d98a0b", "#2457e6", "#0f7b5f", "#7c3aed", "#0f2a5c"];

// Two menu items (~44 each) plus padding.
const POPOVER_HEIGHT = 96;
const DAYS_BEFORE_TODAY = 60;
const DAYS_AFTER_TODAY = 90;
// One request covers everything the screen groups: overdue (earlier days), today and what's coming up.
const OVERDUE_LOOKBACK_DAYS = 60;

type Filter = "all" | "overdue" | "day" | "upcoming";

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
}

function ymd(date: Date) {
  const d = startOfDay(date);
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

// "30 Oct · 4:00 PM", from the follow-up's real date.
function whenLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()}`;
}

function FollowupCard({ item, overdue, completing, onComplete, onPress, colorFor, findStage }: {
  item: TodayFollowup; overdue: boolean; completing: boolean; onComplete: () => void; onPress: () => void;
  colorFor: (stage?: string) => { bg: string; text: string };
  findStage: (name?: string) => { name: string } | undefined;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ y: 0, right: 16 });
  const anchorRef = useRef<View>(null);
  function openMenu() {
    // Open the popover just under the ⋮ button, right-aligned with it.
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const { width: windowWidth, height: windowHeight } = Dimensions.get("window");
      // Rows near the bottom would push the menu off-screen, so open it upwards there.
      const top = y + height + POPOVER_HEIGHT > windowHeight - 8 ? Math.max(8, y - POPOVER_HEIGHT) : y + height;
      setMenuPos({ y: top, right: Math.max(8, windowWidth - (x + width)) });
      setMenuOpen(true);
    });
  }
  // Actions run after the popover closes: Android drops navigation/Alerts fired while a Modal is still dismissing.
  function runAfterClose(action: () => void) {
    setMenuOpen(false);
    setTimeout(action, 300);
  }
  function callNow() {
    trackContactActivity(item.lead_id, "call").catch(() => {});
    Linking.openURL(telUrl(item.lead_phone)).catch(() => Alert.alert("Unable to call", "Calling is not supported on this device."));
  }
  function openWhatsapp() {
    Linking.openURL(`https://wa.me/${(item.lead_phone || "").replace(/\D/g, "")}`).catch(() => Alert.alert("Couldn't open WhatsApp", "Make sure WhatsApp is installed on this phone."));
  }
  const stageColors = colorFor(item.lead_stage);
  const stageLabel = findStage(item.lead_stage)?.name || pretty(item.lead_stage);
  const avatarColor = AVATAR_COLORS[(item.lead_name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  return (
    <Pressable style={[styles.card, overdue && styles.cardOverdue]} onPress={onPress} accessibilityRole="button">
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}><Text style={styles.avatarText}>{item.lead_name?.charAt(0)?.toUpperCase() || "?"}</Text></View>
        <View style={styles.cardCopy}>
          <Text style={styles.rowName} numberOfLines={1}>{item.lead_name}</Text>
          <View style={[styles.stagePill, { backgroundColor: stageColors.bg }]}><Text style={[styles.stagePillText, { color: stageColors.text }]} numberOfLines={1}>{stageLabel}</Text></View>
        </View>
      </View>
      {item.notes ? <Text style={styles.rowNotes} numberOfLines={2}>{item.notes}</Text> : null}
      <View style={[styles.cardBottom, overdue && styles.cardBottomOverdue]}>
        <View style={styles.whenWrap}>
          <Ionicons name="time-outline" size={16} color={overdue ? UI.red : UI.sub} />
          <View>
            <Text style={[styles.whenLabel, overdue && { color: UI.red }]}>{overdue ? "Overdue since" : `${pretty(item.followup_type)} follow-up`}</Text>
            <Text style={[styles.whenValue, overdue && { color: UI.red }]}>{whenLabel(item.next_followup_at)}</Text>
          </View>
        </View>
        {completing ? (
          <ActivityIndicator size="small" color={UI.green} />
        ) : (
          <View style={styles.actions}>
            <Pressable style={[styles.actionSquare, { backgroundColor: UI.blue }]} onPress={callNow} accessibilityRole="button" accessibilityLabel="Call">
              <Ionicons name="call-outline" size={16} color="#fff" />
            </Pressable>
            <Pressable style={[styles.actionSquare, { backgroundColor: UI.green }]} onPress={openWhatsapp} accessibilityRole="button" accessibilityLabel="WhatsApp">
              <Ionicons name="logo-whatsapp" size={16} color="#fff" />
            </Pressable>
            <View ref={anchorRef} collapsable={false}>
              <Pressable style={[styles.actionSquare, styles.actionSquareLight]} onPress={openMenu} accessibilityRole="button" accessibilityLabel="Follow-up actions">
                <Ionicons name="ellipsis-vertical" size={16} color={UI.sub} />
              </Pressable>
            </View>
            <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)}>
                <View style={[styles.popover, { top: menuPos.y, right: menuPos.right }]}>
                  <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onPress)}>
                    <Ionicons name="eye-outline" size={16} color={colors.text} />
                    <Text style={styles.popoverText}>View Details</Text>
                  </Pressable>
                  <Pressable style={styles.popoverItem} onPress={() => runAfterClose(onComplete)}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                    <Text style={[styles.popoverText, { color: colors.success }]}>Mark Completed</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Modal>
          </View>
        )}
      </View>
    </Pressable>
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
  // Seven days fit across the card.
  const dayWidth = Math.floor((screenWidth - 32 - 16) / 7);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [followups, setFollowups] = useState<TodayFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Opened from a dashboard tile (Follow-ups, Overdue): start on that group.
  const { filter: startFilter, filterAt } = useLocalSearchParams<{ filter?: string; filterAt?: string }>();
  useEffect(() => {
    if (startFilter === "overdue" || startFilter === "day" || startFilter === "upcoming") {
      setFilter(startFilter);
      if (startFilter === "day") setSelectedDate(startOfDay(new Date()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFilter, filterAt]);

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
  const [followupType, setFollowupType] = useState<FollowupType>("call");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Only the newest request may update the screen, so a slow reply can't overwrite a later one.
  const requestId = useRef(0);
  // `silent` re-fetches in the background (no spinner, and a failure keeps the list on screen).
  const load = useCallback(async (refresh = false, silent = false) => {
    const id = ++requestId.current;
    if (!silent) {
      refresh ? setRefreshing(true) : setLoading(true);
      setError("");
    }
    try {
      const from = startOfDay(new Date()); from.setDate(from.getDate() - OVERDUE_LOOKBACK_DAYS);
      const to = startOfDay(new Date()); to.setDate(to.getDate() + DAYS_AFTER_TODAY);
      const result = await fetchTodayFollowups({ date_from: ymd(from), date_to: ymd(to) });
      if (id !== requestId.current) return;
      setFollowups(result);
    } catch (loadError) {
      if (id !== requestId.current) return;
      if (!silent) setError(errorMessage(loadError, "Could not load follow-ups."));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The tab stays mounted, so follow-ups completed or added elsewhere (a lead's page, Appointments) would stay stale.
  // Refresh quietly whenever the tab is shown again.
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; } // the first load is handled above
    load(false, true);
  }, [load]));

  useEffect(() => {
    if (!addOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!leadQuery.trim()) { setLeadResults([]); return; }
    let cancelled = false;
    searchTimer.current = setTimeout(async () => {
      setSearchingLeads(true);
      try {
        const result = await fetchLeads({ search: leadQuery.trim(), limit: 6 });
        // Ignore a slower response for an older query.
        if (!cancelled) setLeadResults(result.leads);
      } catch { /* best-effort suggestions */ }
      finally { if (!cancelled) setSearchingLeads(false); }
    }, 300);
    return () => { cancelled = true; if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery, addOpen]);

  const days = useMemo(() => {
    const start = startOfDay(new Date()); start.setDate(start.getDate() - DAYS_BEFORE_TODAY);
    return Array.from({ length: DAYS_BEFORE_TODAY + DAYS_AFTER_TODAY + 1 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d;
    });
  }, []);

  function scrollToDate(date: Date, animated: boolean) {
    const index = days.findIndex((d) => isSameDay(d, date));
    if (index < 0) return;
    const x = Math.max(0, 8 + index * dayWidth - (screenWidth - 32) / 2 + dayWidth / 2);
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
    // Stay inside the days the strip can show, so a day is always highlighted.
    const first = days[0];
    const last = days[days.length - 1];
    setSelectedDate(next < first ? first : next > last ? last : next);
  }

  async function handleComplete(item: TodayFollowup) {
    setCompletingId(item.id);
    try {
      await completeLeadFollowup(item.id);
      setFollowups((current) => current.filter((f) => f.id !== item.id));
    } catch (completeError) {
      // An alert, not the screen-level error, so one failed tap doesn't replace the whole list.
      Alert.alert("Couldn't complete follow-up", errorMessage(completeError, "Could not update this follow-up."));
    } finally { setCompletingId(null); }
  }

  function openAdd() {
    setLeadQuery(""); setLeadResults([]); setSelectedLead(null);
    setFollowupAt(defaultFollowupDate()); setFollowupNotes(""); setAddError(""); setFollowupType("call");
    setAddOpen(true);
  }

  function closeAdd() {
    if (!saving) setAddOpen(false);
  }

  async function saveFollowup() {
    if (!selectedLead) { setAddError("Search and select a lead first."); return; }
    if (followupAt.getTime() < Date.now() - 60000) { setAddError("Choose a date and time in the future."); return; }
    setSaving(true); setAddError("");
    try {
      await createLeadFollowup(selectedLead.id, {
        followup_type: followupType,
        next_followup_at: followupAt.toISOString(),
        notes: followupNotes.trim() || undefined,
      });
      setAddOpen(false);
      const when = followupAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      // Android drops Alerts fired while a Modal is still dismissing.
      const leadName = selectedLead.name;
      setTimeout(() => Alert.alert("Follow-up scheduled", `${leadName} - ${when}`), 300);
      // Show the day it was booked for; if that's already the day on screen, just refresh it.
      load(true);
      // Days outside the date strip can't be highlighted, so stay on the current day for those.
      const bookedDay = startOfDay(followupAt);
      if (!isSameDay(followupAt, selectedDate) && bookedDay >= days[0] && bookedDay <= days[days.length - 1]) setSelectedDate(bookedDay);
    } catch (saveError) {
      setAddError(errorMessage(saveError, "Could not schedule this follow-up."));
    } finally { setSaving(false); }
  }

  // Grouping is by the phone's real "today": earlier days are overdue, the picked day is its own group,
  // and later days are upcoming.
  const todayStart = startOfDay(new Date());
  const byTime = (a: TodayFollowup, b: TodayFollowup) => new Date(a.next_followup_at).getTime() - new Date(b.next_followup_at).getTime();
  const overdueList = followups.filter((item) => new Date(item.next_followup_at) < todayStart).sort(byTime);
  const dayList = followups.filter((item) => isSameDay(new Date(item.next_followup_at), selectedDate)).sort(byTime);
  const upcomingList = followups.filter((item) => {
    const due = new Date(item.next_followup_at);
    return due >= todayStart && !isSameDay(due, selectedDate) && due > selectedDate;
  }).sort(byTime);
  const selectedIsToday = isSameDay(selectedDate, new Date());
  const dayTitle = selectedIsToday ? "Today" : selectedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const dayDateLabel = selectedDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const sections: { key: Filter; title: string; right: string; items: TodayFollowup[]; overdue: boolean }[] = [
    { key: "overdue", title: "Overdue", right: "Needs action", items: overdueList, overdue: true },
    { key: "day", title: dayTitle, right: dayDateLabel, items: dayList, overdue: false },
    { key: "upcoming", title: "Upcoming", right: "", items: upcomingList, overdue: false },
  ];
  const visibleSections = sections.filter((section) => (filter === "all" || filter === section.key) && section.items.length > 0);

  const chips: { key: Filter; label: string; count?: number }[] = [
    { key: "overdue", label: "Overdue", count: overdueList.length },
    { key: "day", label: dayTitle, count: dayList.length },
    { key: "upcoming", label: "Upcoming", count: upcomingList.length },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {router.canGoBack() ? (
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={UI.ink} />
          </Pressable>
        ) : null}
        <Text style={styles.headerTitle}>Follow-ups</Text>
      </View>

      <View style={styles.calendar}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => jumpDays(-7)} hitSlop={8} accessibilityLabel="Previous week"><Ionicons name="chevron-back" size={18} color={UI.green} /></Pressable>
          <Text style={styles.monthLabel}>{MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}</Text>
          <Pressable onPress={() => jumpDays(7)} hitSlop={8} accessibilityLabel="Next week"><Ionicons name="chevron-forward" size={18} color={UI.green} /></Pressable>
        </View>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow} decelerationRate="fast">
          {days.map((day, index) => {
            const active = isSameDay(day, selectedDate);
            return (
              <Pressable key={index} style={[styles.dayColumn, { width: dayWidth }]} onPress={() => setSelectedDate(day)}>
                <Text style={styles.dayLabel}>{WEEKDAYS[day.getDay()]}</Text>
                <View style={[styles.dayNumber, active && styles.dayNumberActive]}>
                  <Text style={[styles.dayNumberText, active && styles.dayNumberTextActive]}>{day.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {chips.map((chip) => {
            const active = filter === chip.key;
            const isOverdueChip = chip.key === "overdue";
            return (
              <Pressable
                key={chip.key} onPress={() => setFilter(active ? "all" : chip.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}
                style={[styles.chip, isOverdueChip && styles.chipOverdue, active && (isOverdueChip ? styles.chipOverdueActive : styles.chipActive)]}
              >
                <Text style={[styles.chipText, isOverdueChip && { color: UI.red }, active && !isOverdueChip && styles.chipTextActive, active && isOverdueChip && { color: "#fff" }]}>{chip.label}</Text>
                {chip.count !== undefined ? (
                  <View style={[styles.chipCount, isOverdueChip && { backgroundColor: UI.redSoft }, active && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                    <Text style={[styles.chipCountText, isOverdueChip && { color: UI.red }, active && { color: "#fff" }]}>{chip.count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={UI.green} colors={[UI.green]} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.state}><ActivityIndicator size="large" color={UI.green} /></View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.errorText}>{error}</Text>
            <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
          </View>
        ) : visibleSections.length ? (
          visibleSections.map((section) => (
            <View key={section.key}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, section.overdue && { color: UI.red }]}>{section.title}</Text>
                <View style={[styles.sectionCount, section.overdue && { backgroundColor: UI.redSoft }]}>
                  <Text style={[styles.sectionCountText, section.overdue && { color: UI.red }]}>{section.items.length}</Text>
                </View>
                <View style={{ flex: 1 }} />
                {section.right ? <Text style={styles.sectionRight}>{section.right}</Text> : null}
              </View>
              {section.items.map((item) => (
                <FollowupCard
                  key={item.id} item={item} overdue={section.overdue} completing={completingId === item.id}
                  onComplete={() => handleComplete(item)} colorFor={colorFor} findStage={findStage}
                  onPress={() => router.push({ pathname: "/(app)/leads/[id]", params: { id: item.lead_id, name: item.lead_name, phone: item.lead_phone, stage: item.lead_stage || "new" } })}
                />
              ))}
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="calendar-outline" size={30} color={UI.green} /></View>
            <Text style={styles.emptyTitle}>{filter === "all" ? "No follow-ups to show." : "Nothing in this group."}</Text>
            <Text style={styles.emptyText}>Start assigning leads and set follow-ups</Text>
          </View>
        )}
      </ScrollView>

      <Pressable accessibilityLabel="Add follow-up" accessibilityRole="button" style={[styles.fab, { bottom: insets.bottom + 86 }]} onPress={openAdd}>
        <Ionicons name="add" size={24} color="#fff" />
      </Pressable>

      <Modal visible={addOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={closeAdd}>
        <Pressable style={styles.sheetBackdrop} onPress={closeAdd}>
          <Pressable style={[styles.sheet, styles.fullSheet, { paddingTop: insets.top }]} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add follow-up</Text>
              <Pressable accessibilityLabel="Close" disabled={saving} hitSlop={10} onPress={closeAdd}>
                <Ionicons name="close" size={22} color={saving ? colors.textMuted : UI.ink} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 18) }}
              keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            >
              {addError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{addError}</Text></View> : null}

              <Text style={[styles.sheetSectionLabel, { marginTop: 0 }]}>Lead name <Text style={styles.required}>*</Text></Text>
              {selectedLead ? (
                <View style={styles.selectedLead}>
                  <Text style={styles.selectedLeadText} numberOfLines={1}>{selectedLead.name} · {selectedLead.phone}</Text>
                  <Pressable onPress={() => { setSelectedLead(null); setLeadQuery(""); }} hitSlop={8}><Ionicons name="close" size={16} color={colors.textSecondary} /></Pressable>
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

              <Text style={styles.sheetSectionLabel}>Follow-up type</Text>
              <View style={styles.typeRow}>
                {FOLLOWUP_TYPES.map((item) => {
                  const active = followupType === item.key;
                  return (
                    <Pressable key={item.key} onPress={() => setFollowupType(item.key)} style={[styles.typeChip, active && styles.typeChipActive]}>
                      <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sheetSectionLabel}>Follow-up date &amp; time</Text>
              <DateTimeField value={followupAt} onChange={setFollowupAt} minimumDate={new Date()} />

              <Text style={styles.sheetSectionLabel}>Follow-up note</Text>
              <TextInput mode="outlined" value={followupNotes} onChangeText={setFollowupNotes} placeholder="Add a note (optional)" multiline numberOfLines={3} style={styles.sheetTextarea} outlineStyle={styles.sheetOutline} outlineColor={UI.formLine} activeOutlineColor={UI.teal} />

              <View style={styles.sheetActions}>
                <Button mode="outlined" textColor={UI.teal} onPress={closeAdd} disabled={saving} style={styles.sheetCancelButton} contentStyle={styles.sheetPrimaryButtonContent}>Cancel</Button>
                <Button mode="contained" buttonColor={UI.teal} onPress={saveFollowup} loading={saving} disabled={saving} style={styles.sheetSaveButton} contentStyle={styles.sheetPrimaryButtonContent}>Save</Button>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: UI.formLine, backgroundColor: "#ffffff" },
  typeChipActive: { backgroundColor: UI.teal, borderColor: UI.teal },
  typeChipText: { color: UI.ink, fontSize: 13, fontWeight: "700" },
  typeChipTextActive: { color: "#ffffff" },
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  headerTitle: { color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  fab: { position: "absolute", right: 20, width: 46, height: 46, borderRadius: 23, backgroundColor: UI.green, alignItems: "center", justifyContent: "center", shadowColor: UI.green, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },

  calendar: { marginHorizontal: 16, marginBottom: 12, paddingBottom: 10, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 16 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  monthLabel: { color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold" },
  weekRow: { flexDirection: "row", paddingHorizontal: 8 },
  dayColumn: { alignItems: "center", gap: 6 },
  dayLabel: { color: UI.muted, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  dayNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dayNumberActive: { backgroundColor: UI.green },
  dayNumberText: { color: UI.ink, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dayNumberTextActive: { color: "#ffffff" },

  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line },
  chipActive: { backgroundColor: UI.green, borderColor: UI.green },
  chipOverdue: { borderColor: UI.redLine },
  chipOverdueActive: { backgroundColor: UI.red, borderColor: UI.red },
  chipText: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold" },
  chipTextActive: { color: "#ffffff" },
  chipCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: "#e6ece9", alignItems: "center", justifyContent: "center" },
  chipCountText: { color: UI.sub, fontSize: 10, fontFamily: "Inter_700Bold" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginTop: 6, marginBottom: 8 },
  sectionTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  sectionCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: "#d8f0e5", alignItems: "center", justifyContent: "center" },
  sectionCountText: { color: UI.green, fontSize: 11, fontFamily: "Inter_700Bold" },
  sectionRight: { color: UI.sub, fontSize: 11, fontFamily: "Inter_500Medium" },

  state: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center", paddingHorizontal: 30 },
  retry: { marginTop: 14 },

  empty: { alignItems: "center", justifyContent: "center", flex: 1, paddingVertical: 60, paddingHorizontal: 30 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#d8f0e5", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { color: UI.ink, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyText: { color: UI.sub, fontSize: 13, textAlign: "center", marginTop: 4 },

  card: { marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, gap: 10 },
  cardOverdue: { borderColor: UI.redLine },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#ffffff", fontSize: 16, fontFamily: "Inter_700Bold" },
  cardCopy: { flex: 1, minWidth: 0, gap: 4, alignItems: "flex-start" },
  rowName: { color: UI.ink, fontSize: 14, fontFamily: "Inter_700Bold", maxWidth: "100%" },
  stagePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, maxWidth: "100%" },
  stagePillText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  rowNotes: { color: UI.sub, fontSize: 12 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: UI.line },
  cardBottomOverdue: { borderTopColor: UI.redLine },
  whenWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  whenLabel: { color: UI.sub, fontSize: 10, fontFamily: "Inter_500Medium" },
  whenValue: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 1 },
  actions: { flexDirection: "row", gap: 8 },
  actionSquare: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionSquareLight: { backgroundColor: "#eef1f0" },
  popover: {
    position: "absolute", minWidth: 190, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSoft, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  popoverItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  popoverText: { color: colors.text, fontSize: 14, fontWeight: "600" },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  fullSheet: { height: "100%", maxHeight: "100%", borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  sheet: { backgroundColor: UI.formBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" },
  sheetBody: { flex: 1 },
  sheetHandle: { width: 34, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 10 },
  sheetHeader: { minHeight: 56, paddingHorizontal: 16, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.formLine, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetBackButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  sheetHeaderSpacer: { width: 32 },
  sheetTitle: { flex: 1, color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  sheetSectionLabel: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 14, marginBottom: 6 },
  required: { color: colors.danger },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, marginBottom: 4, borderRadius: 8, backgroundColor: colors.dangerSoft },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 11, fontWeight: "700" },
  searchInput: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.formLine, borderRadius: 10 },
  searchInputText: { fontSize: 13, minHeight: 0 },
  suggestions: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.formLine, borderRadius: 10, marginTop: 6, overflow: "hidden" },
  selectedLead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 40, paddingHorizontal: 12, backgroundColor: "#e1eef7", borderRadius: 10 },
  selectedLeadText: { flex: 1, color: UI.teal, fontSize: 13, fontWeight: "700" },
  sheetTextarea: { minHeight: 56, backgroundColor: "#ffffff" },
  sheetOutline: { borderRadius: 10 },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  sheetCancelButton: { flex: 1, borderColor: UI.formLine, borderRadius: 999, backgroundColor: "#ffffff" },
  sheetSaveButton: { flex: 1, borderRadius: 999 },
  sheetPrimaryButtonContent: { height: 44 },
});
