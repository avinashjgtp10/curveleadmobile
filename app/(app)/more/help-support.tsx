import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { createTicket, fetchMyTickets, SupportTicket, TicketPriority, TicketStatus } from "@/api/support";

type Tab = "request" | "tickets" | "info";

const SUPPORT_EMAIL = "support@curvelead.com";
const MAX_MESSAGE = 1000;
const CATEGORIES = ["General", "Technical", "Billing", "Feature Request", "Bug Report"];

const PRIORITIES: { key: TicketPriority; label: string; reply: string; color: string; soft: string }[] = [
  { key: "low", label: "Low", reply: "~24 hours", color: "#64748b", soft: "#eef2f6" },
  { key: "medium", label: "Medium", reply: "~8 hours", color: "#b45309", soft: "#fef3c7" },
  { key: "high", label: "High", reply: "~2 hours", color: "#b91c1c", soft: "#fee2e2" },
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
      await createTicket({ subject: subject.trim(), category, priority, message: message.trim() });
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
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Help & Support" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={tab === "tickets" ? <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTickets(true); }} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
      >
        <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="help-buoy" size={26} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>How can we help?</Text>
            <Text style={styles.heroSub}>Send us a request or browse the guide. We usually reply within 24 hours.</Text>
          </View>
          <View style={styles.heroCircle} />
        </LinearGradient>

        <View style={styles.quickRow}>
          <Pressable style={styles.quickCard} onPress={() => router.push("/(app)/more/user-guide")}>
            <View style={[styles.quickIcon, { backgroundColor: "#e0e7ff" }]}><Ionicons name="book-outline" size={20} color="#4f46e5" /></View>
            <Text style={styles.quickTitle}>User guide</Text>
            <Text style={styles.quickSub}>Step-by-step help</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={emailSupport}>
            <View style={[styles.quickIcon, { backgroundColor: "#dcfce7" }]}><Ionicons name="mail-outline" size={20} color="#16a34a" /></View>
            <Text style={styles.quickTitle}>Email us</Text>
            <Text style={styles.quickSub} numberOfLines={1}>{SUPPORT_EMAIL}</Text>
          </Pressable>
        </View>

        <View style={styles.segment}>
          {([["request", "New request"], ["tickets", `My tickets${tickets.length ? ` (${tickets.length})` : ""}`], ["info", "Support info"]] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.segmentButton, tab === key && styles.segmentActive]}>
              <Text style={[styles.segmentText, tab === key && styles.segmentTextActive]} numberOfLines={1}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "request" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tell us what's wrong</Text>

            <Text style={styles.label}>Subject <Text style={styles.required}>*</Text></Text>
            <View style={[styles.input, subjectError && styles.inputError]}>
              <RNTextInput
                value={subject} onChangeText={(value) => { setSubject(value); if (value.trim()) setSubjectError(false); }}
                placeholder="Brief summary of your issue" placeholderTextColor={colors.textMuted} style={styles.inputText} maxLength={120}
              />
            </View>
            {subjectError ? <Text style={styles.fieldError}>Subject is required.</Text> : null}

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((item) => (
                <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}>
                  <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>How urgent is it?</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((item) => {
                const active = priority === item.key;
                return (
                  <Pressable key={item.key} onPress={() => setPriority(item.key)} style={[styles.priorityTile, active && { backgroundColor: item.soft, borderColor: item.color }]}>
                    <Text style={[styles.priorityLabel, active && { color: item.color }]}>{item.label}</Text>
                    <Text style={[styles.priorityReply, active && { color: item.color }]}>{item.reply}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>We reply to {selectedPriority.label.toLowerCase()} priority requests in {selectedPriority.reply}.</Text>

            <Text style={styles.label}>Message <Text style={styles.required}>*</Text></Text>
            <View style={[styles.input, styles.inputMulti, messageError && styles.inputError]}>
              <RNTextInput
                value={message} onChangeText={(value) => { setMessage(value.slice(0, MAX_MESSAGE)); if (value.trim()) setMessageError(false); }}
                placeholder="Describe the issue. Include any error message and what you already tried."
                placeholderTextColor={colors.textMuted} style={[styles.inputText, { minHeight: 110 }]} multiline textAlignVertical="top"
              />
            </View>
            <View style={styles.counterRow}>
              {messageError ? <Text style={styles.fieldError}>Please describe your issue.</Text> : <View />}
              <Text style={styles.counter}>{message.length} / {MAX_MESSAGE}</Text>
            </View>

            <Pressable onPress={handleSubmit} disabled={submitting} style={submitting && { opacity: 0.6 }}>
              <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submitButton}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
                <Text style={styles.submitText}>Send request</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {tab === "tickets" ? (
          ticketsLoading && !tickets.length ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : ticketsError && !tickets.length ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Could not load tickets</Text>
              <Text style={styles.emptyText}>{ticketsError}</Text>
              <Pressable style={styles.retry} onPress={() => loadTickets()}><Text style={styles.retryText}>Try again</Text></Pressable>
            </View>
          ) : tickets.length ? (
            <View style={{ gap: 10 }}>
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
            <View style={styles.center}>
              <View style={styles.emptyIcon}><Ionicons name="ticket-outline" size={28} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>No tickets yet</Text>
              <Text style={styles.emptyText}>Send a request and it will show up here with its status.</Text>
            </View>
          )
        ) : null}

        {tab === "info" ? (
          <View style={{ gap: 12 }}>
            <View style={styles.card}>
              <View style={styles.infoHeader}><Ionicons name="time-outline" size={17} color={colors.primary} /><Text style={styles.cardTitle}>Support hours</Text></View>
              {[["Monday – Friday", "9:00 AM – 8:00 PM"], ["Saturday", "10:00 AM – 5:00 PM"], ["Sunday", "Closed"]].map(([day, hours]) => (
                <View key={day} style={styles.infoRow}><Text style={styles.infoLabel}>{day}</Text><Text style={styles.infoValue}>{hours}</Text></View>
              ))}
            </View>
            <View style={styles.card}>
              <View style={styles.infoHeader}><Ionicons name="speedometer-outline" size={17} color={colors.primary} /><Text style={styles.cardTitle}>Average response time</Text></View>
              {PRIORITIES.slice().reverse().map((item) => (
                <View key={item.key} style={styles.infoRow}><Text style={styles.infoLabel}>{item.label} priority</Text><Text style={styles.infoValue}>{item.reply}</Text></View>
              ))}
            </View>
            <View style={styles.card}>
              <View style={styles.infoHeader}><Ionicons name="notifications-outline" size={17} color={colors.primary} /><Text style={styles.cardTitle}>Recent updates</Text></View>
              {RECENT_UPDATES.map((item) => (
                <View key={item.title} style={styles.updateRow}>
                  <View style={styles.updateDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.updateTitle}>{item.title}</Text>
                    <Text style={styles.hint}>{item.time}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  content: { padding: 14, gap: 14 },

  hero: { borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden" },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 19, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, lineHeight: 17, marginTop: 3 },
  heroCircle: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.12)", right: -30, top: -36 },

  quickRow: { flexDirection: "row", gap: 12 },
  quickCard: { flex: 1, backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 4 },
  quickIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  quickTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  quickSub: { color: colors.textMuted, fontSize: 12 },

  segment: { flexDirection: "row", backgroundColor: "#eaf1f7", borderRadius: 14, padding: 4 },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", height: 38, borderRadius: 11, paddingHorizontal: 4 },
  segmentActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: colors.primary },

  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 16, marginBottom: 8 },
  required: { color: colors.danger },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, justifyContent: "center" },
  inputMulti: { paddingVertical: 6 },
  inputError: { borderColor: colors.danger },
  inputText: { color: colors.text, fontSize: 14, paddingVertical: 8 },
  counterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  counter: { color: colors.textMuted, fontSize: 11 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f4f9fc", borderWidth: 1, borderColor: "#d7e6f1" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: "#fff" },

  priorityRow: { flexDirection: "row", gap: 10 },
  priorityTile: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: "#e2eef7", backgroundColor: "#ffffff" },
  priorityLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  priorityReply: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  submitButton: { marginTop: 18, height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  center: { minHeight: 220, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  retry: { marginTop: 8, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  ticketCard: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 10 },
  ticketTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  ticketSubject: { color: colors.text, fontSize: 15, fontWeight: "800" },
  ticketMessage: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, backgroundColor: "#f8fbfd", borderRadius: 12, padding: 10 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "800" },

  infoHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eef4f9" },
  infoLabel: { color: colors.textSecondary, fontSize: 13 },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: "800" },
  updateRow: { flexDirection: "row", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eef4f9" },
  updateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 5 },
  updateTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
});
