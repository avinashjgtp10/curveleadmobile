import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import axios from "axios";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { useAuth } from "@/contexts/AuthContext";
import { createTicket, fetchMyTickets, SupportTicket, TicketPriority, TicketStatus } from "@/api/support";

// Palette of the redesigned screen: pale blue page, white cards, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", red: "#d6334f" };

type Tab = "request" | "tickets" | "info";

const SUPPORT_EMAIL = "support@curvelead.com";
const MAX_MESSAGE = 1000;
const CATEGORIES = ["General", "Technical", "Billing", "Feature Request", "Bug Report"];

const PRIORITIES: { key: TicketPriority; label: string; reply: string; color: string; soft: string }[] = [
  { key: "low", label: "Low", reply: "~24 hours", color: "#64748b", soft: "#e1eef7" },
  { key: "medium", label: "Medium", reply: "~8 hours", color: "#d97706", soft: "#e1eef7" },
  { key: "high", label: "High", reply: "~2 hours", color: "#dc2626", soft: "#e1eef7" },
];

const STATUS_STYLE: Record<TicketStatus, { bg: string; text: string; label: string }> = {
  open: { bg: "#dbeafe", text: "#1d4ed8", label: "Open" },
  in_progress: { bg: "#fef3c7", text: "#b45309", label: "In progress" },
  resolved: { bg: "#dcfce7", text: "#15803d", label: "Resolved" },
  closed: { bg: "#eef2f6", text: "#64748b", label: "Closed" },
};

const RECENT_UPDATES = [
  { title: "Lead Intent Index launched", time: "2 days ago" },
  { title: "WhatsApp inbox performance improvements", time: "1 week ago" },
  { title: "New quotation templates added", time: "2 weeks ago" },
];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("request");

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [message, setMessage] = useState("");
  const [subjectError, setSubjectError] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [openTicket, setOpenTicket] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setTicketsLoading(true);
    setTicketsError("");
    try { setTickets(await fetchMyTickets()); }
    catch (loadError) { setTicketsError(errorMessage(loadError, "Could not load your tickets.")); }
    finally { setTicketsLoading(false); setRefreshing(false); }
  }, []);

  // Load once on arrival so the "My tickets" count is right before the tab is opened.
  useFocusEffect(useCallback(() => { loadTickets(true); }, [loadTickets]));

  async function handleSubmit() {
    const subjectMissing = !subject.trim();
    const messageMissing = !message.trim();
    setSubjectError(subjectMissing);
    setMessageError(messageMissing);
    if (subjectMissing || messageMissing) return;

    setSubmitting(true);
    try {
      await createTicket({ name: user?.name, email: user?.email, subject: subject.trim(), category, priority, message: message.trim() });
      setSubject(""); setMessage(""); setCategory("General"); setPriority("medium");
      await loadTickets(true);
      setTab("tickets");
      Alert.alert("Request submitted", "Our team typically responds within 24 hours.");
    } catch (submitError) {
      Alert.alert("Couldn't submit", errorMessage(submitError, "Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  function emailSupport() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => Alert.alert("No email app", `Write to us at ${SUPPORT_EMAIL}`));
  }

  const selectedPriority = PRIORITIES.find((item) => item.key === priority) || PRIORITIES[1];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (tab === "info" ? setTab("request") : router.back())} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{tab === "info" ? "Support hours" : "Help & support"}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={tab === "tickets" ? <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTickets(true); }} tintColor={UI.teal} colors={[UI.teal]} /> : undefined}
      >
        {tab !== "info" ? <Text style={styles.subtitle}>Need help? Send a request or track your tickets.</Text> : null}

        {tab !== "info" ? <View style={styles.tabRow}>
          <Pressable onPress={() => setTab("request")} style={[styles.tabPill, tab === "request" && styles.tabPillActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "request" }}>
            <Text style={[styles.tabText, tab === "request" && styles.tabTextActive]}>Submit a request</Text>
          </Pressable>
          <Pressable onPress={() => setTab("tickets")} style={[styles.tabPill, tab === "tickets" && styles.tabPillActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "tickets" }}>
            <Text style={[styles.tabText, tab === "tickets" && styles.tabTextActive]}>{`My tickets${tickets.length ? ` (${tickets.length})` : ""}`}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(app)/more/user-guide")} style={styles.tabPill} accessibilityRole="button">
            <Text style={styles.tabText}>User guide</Text>
          </Pressable>
        </View> : null}

        {tab === "request" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>New support request</Text>
              <Text style={styles.cardHint}>Our team usually replies within 24 hours.</Text>

              <Text style={styles.label}>Subject <Text style={styles.required}>*</Text></Text>
              <View style={[styles.input, subjectError && styles.inputError]}>
                <RNTextInput
                  value={subject} onChangeText={(value) => { setSubject(value); if (value.trim()) setSubjectError(false); }}
                  placeholder="Briefly describe your issue" placeholderTextColor={UI.muted} style={styles.inputText} maxLength={120}
                />
              </View>
              {subjectError ? <Text style={styles.fieldError}>Subject is required.</Text> : null}

              <Text style={styles.label}>Category</Text>
              <Pressable style={[styles.input, styles.select]} onPress={() => setCategoryOpen((open) => !open)} accessibilityRole="button" accessibilityLabel="Category">
                <Text style={styles.inputText}>{category}</Text>
                <Ionicons name={categoryOpen ? "chevron-up" : "chevron-down"} size={18} color={UI.ink} />
              </Pressable>
              {categoryOpen ? (
                <View style={styles.options}>
                  {CATEGORIES.map((item) => (
                    <Pressable key={item} style={[styles.option, category === item && styles.optionActive]} onPress={() => { setCategory(item); setCategoryOpen(false); }}>
                      <Text style={[styles.optionText, category === item && styles.optionTextActive]}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Text style={styles.label}>Priority</Text>
              <View style={styles.priorityRow}>
                {PRIORITIES.map((item) => {
                  const active = priority === item.key;
                  return (
                    <Pressable key={item.key} onPress={() => setPriority(item.key)} style={[styles.priorityTile, active && styles.priorityTileActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                      <View style={[styles.priorityDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.priorityLabel, active && { color: UI.ink }]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>We reply to {selectedPriority.label.toLowerCase()} priority requests in {selectedPriority.reply}.</Text>

              <Text style={styles.label}>Message <Text style={styles.required}>*</Text></Text>
              <View style={[styles.input, styles.inputMulti, messageError && styles.inputError]}>
                <RNTextInput
                  value={message} onChangeText={(value) => { setMessage(value.slice(0, MAX_MESSAGE)); if (value.trim()) setMessageError(false); }}
                  placeholder="Describe the issue. Include any error messages and what you've already tried."
                  placeholderTextColor={UI.muted} style={[styles.inputText, { minHeight: 110 }]} multiline textAlignVertical="top"
                />
              </View>
              <View style={styles.counterRow}>
                {messageError ? <Text style={styles.fieldError}>Please describe your issue.</Text> : <View />}
                <Text style={styles.counter}>{message.length} / {MAX_MESSAGE}</Text>
              </View>

              <Pressable onPress={handleSubmit} disabled={submitting} style={[styles.submitButton, submitting && { opacity: 0.6 }]} accessibilityRole="button">
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.submitText}>Send request</Text>
              </Pressable>
            </View>

            <Pressable style={styles.linkCard} onPress={() => setTab("info")} accessibilityRole="button">
              <Text style={styles.linkCardText}>Support hours and contact</Text>
              <Ionicons name="chevron-forward" size={18} color={UI.teal} />
            </Pressable>
          </>
        ) : null}

        {tab === "tickets" ? (
          <View style={styles.card}>
            <View style={styles.ticketsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Your support tickets</Text>
                <Text style={styles.cardHint}>{tickets.length} {tickets.length === 1 ? "ticket" : "tickets"} found</Text>
              </View>
              <Pressable style={styles.refreshButton} onPress={() => loadTickets()} accessibilityRole="button">
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>

            {ticketsLoading && !tickets.length ? (
              <View style={styles.center}><ActivityIndicator color={UI.teal} /></View>
            ) : ticketsError && !tickets.length ? (
              <View style={styles.center}>
                <Ionicons name="cloud-offline-outline" size={30} color={UI.muted} />
                <Text style={styles.emptyTitle}>Could not load tickets</Text>
                <Text style={styles.emptyText}>{ticketsError}</Text>
                <Pressable style={styles.primaryPill} onPress={() => loadTickets()}><Text style={styles.primaryPillText}>Try again</Text></Pressable>
              </View>
            ) : tickets.length ? (
              <View style={{ gap: 10, marginTop: 12 }}>
                {tickets.map((ticket) => {
                  const status = STATUS_STYLE[ticket.status || "open"] || STATUS_STYLE.open;
                  const open = openTicket === ticket.id;
                  return (
                    <Pressable key={ticket.id} style={styles.ticketCard} onPress={() => setOpenTicket(open ? "" : ticket.id)}>
                      <View style={styles.ticketTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ticketSubject} numberOfLines={open ? undefined : 1}>{ticket.subject}</Text>
                          <Text style={styles.hint}>{ticket.category} · {dateText(ticket.created_at)}</Text>
                        </View>
                        <View style={[styles.statusPill, { backgroundColor: status.bg }]}><Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text></View>
                      </View>
                      {open && ticket.message ? <Text style={styles.ticketMessage}>{ticket.message}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}><Ionicons name="file-tray-outline" size={26} color={UI.teal} /></View>
                <Text style={styles.emptyTitle}>No tickets yet</Text>
                <Pressable style={[styles.primaryPill, { alignSelf: "stretch" }]} onPress={() => setTab("request")} accessibilityRole="button">
                  <Text style={styles.primaryPillText}>Submit your first request</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        {tab === "info" ? (
          <View style={{ gap: 12 }}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Support hours <Text style={styles.cardTitleLight}>(IST)</Text></Text>
              {[["Monday to Friday", "9:00 AM – 8:00 PM"], ["Saturday", "10:00 AM – 5:00 PM"], ["Sunday", "Closed"]].map(([day, hours], index) => (
                <View key={day} style={[styles.infoRow, index === 0 && styles.infoRowFirst]}><Text style={styles.infoLabel}>{day}</Text><Text style={styles.infoValue}>{hours}</Text></View>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Average response time</Text>
              {PRIORITIES.slice().reverse().map((item, index) => (
                <View key={item.key} style={[styles.infoRow, index === 0 && styles.infoRowFirst]}><Text style={styles.infoLabel}>{item.label} priority</Text><Text style={styles.infoValue}>{item.reply.replace("~", "About ")}</Text></View>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Contact us</Text>
              <Text style={[styles.hint, { marginTop: 10 }]}>Email</Text>
              <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
              <Pressable style={styles.emailButton} onPress={emailSupport} accessibilityRole="button">
                <Text style={styles.emailButtonText}>Email support</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  subtitle: { color: UI.sub, fontSize: 12 },

  tabRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tabPill: { paddingHorizontal: 14, height: 34, borderRadius: 999, backgroundColor: "#e4ecf3", alignItems: "center", justifyContent: "center" },
  tabPillActive: { backgroundColor: UI.teal },
  tabText: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold" },
  tabTextActive: { color: "#ffffff" },

  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 14 },
  cardTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  cardHint: { color: UI.sub, fontSize: 11, marginTop: 2 },
  label: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 14, marginBottom: 6 },
  required: { color: UI.red },
  hint: { color: UI.sub, fontSize: 11, marginTop: 2 },
  fieldError: { color: UI.red, fontSize: 12, marginTop: 4 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 12, justifyContent: "center" },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  options: { borderWidth: 1, borderColor: UI.line, borderRadius: 10, marginTop: 6, overflow: "hidden", backgroundColor: "#ffffff" },
  option: { paddingHorizontal: 14, paddingVertical: 12 },
  optionActive: { backgroundColor: UI.tealSoft },
  optionText: { color: UI.ink, fontSize: 13 },
  optionTextActive: { color: UI.teal, fontFamily: "Inter_700Bold" },
  inputMulti: { paddingVertical: 6 },
  inputError: { borderColor: UI.red },
  inputText: { color: UI.ink, fontSize: 13, paddingVertical: 8 },
  counterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  counter: { color: UI.muted, fontSize: 11 },

  priorityRow: { flexDirection: "row", gap: 8 },
  priorityTile: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 10, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  priorityTileActive: { backgroundColor: UI.tealSoft, borderColor: UI.teal, borderWidth: 1.5 },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  priorityLabel: { color: UI.sub, fontSize: 12, fontFamily: "Inter_600SemiBold" },

  submitButton: { marginTop: 18, height: 46, borderRadius: 999, backgroundColor: UI.teal, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: "#ffffff", fontSize: 14, fontFamily: "Inter_700Bold" },
  linkCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 14, minHeight: 52 },
  linkCardText: { color: UI.teal, fontSize: 13, fontFamily: "Inter_700Bold" },

  ticketsHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  refreshButton: { height: 36, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  refreshText: { color: UI.teal, fontSize: 12, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", gap: 10, paddingTop: 22, paddingBottom: 6 },
  emptyIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center" },
  center: { minHeight: 160, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, gap: 6 },
  emptyTitle: { color: UI.ink, fontSize: 14, fontFamily: "Inter_700Bold" },
  emptyText: { color: UI.sub, fontSize: 12, textAlign: "center", lineHeight: 18 },
  primaryPill: { marginTop: 6, height: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: UI.teal, alignItems: "center", justifyContent: "center" },
  primaryPillText: { color: "#ffffff", fontSize: 13, fontFamily: "Inter_700Bold" },

  ticketCard: { backgroundColor: "#f7fafc", borderRadius: 12, borderWidth: 1, borderColor: UI.line, padding: 12, gap: 10 },
  ticketTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  ticketSubject: { color: UI.ink, fontSize: 14, fontFamily: "Inter_700Bold" },
  ticketMessage: { color: UI.sub, fontSize: 12, lineHeight: 18, backgroundColor: "#ffffff", borderRadius: 10, padding: 10 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "800" },

  cardTitleLight: { color: UI.sub, fontFamily: "Inter_500Medium", fontSize: 13 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11, borderTopWidth: 1, borderTopColor: UI.line },
  infoRowFirst: { marginTop: 10 },
  contactEmail: { color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold", marginTop: 4 },
  emailButton: { marginTop: 14, height: 44, borderRadius: 999, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  emailButtonText: { color: UI.teal, fontSize: 13, fontFamily: "Inter_700Bold" },
  infoLabel: { color: UI.sub, fontSize: 13 },
  infoValue: { color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold" },
  updateRow: { flexDirection: "row", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: UI.line },
  updateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: UI.teal, marginTop: 5 },
  updateTitle: { color: UI.ink, fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
