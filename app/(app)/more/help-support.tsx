import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Menu, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

type Tab = "request" | "tickets" | "guide";
type Priority = "low" | "medium" | "high";

const CATEGORIES = ["General", "Billing", "Technical", "Feature Request", "Account"];

const PRIORITIES: { key: Priority; label: string; color: string; soft: string }[] = [
  { key: "low", label: "Low", color: colors.textSecondary, soft: colors.surfaceMuted },
  { key: "medium", label: "Medium", color: colors.warning, soft: colors.warningSoft },
  { key: "high", label: "High", color: colors.danger, soft: colors.dangerSoft },
];

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: Priority;
  message: string;
  createdAt: Date;
}

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("request");

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>("medium");
  const [message, setMessage] = useState("");
  const [subjectError, setSubjectError] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  function handleSubmit() {
    const subjectMissing = !subject.trim();
    const messageMissing = !message.trim();
    setSubjectError(subjectMissing);
    setMessageError(messageMissing);
    if (subjectMissing || messageMissing) return;

    setSubmitting(true);
    setTimeout(() => {
      setTickets((current) => [
        { id: String(Date.now()), subject: subject.trim(), category, priority, message: message.trim(), createdAt: new Date() },
        ...current,
      ]);
      setSubject(""); setMessage(""); setCategory("General"); setPriority("medium");
      setSubmitting(false);
      Alert.alert("Request submitted", "Our team typically responds within 24 hours.");
      setTab("tickets");
    }, 500);
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Help & Support" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.introRow}>
          <View style={styles.introIcon}><Ionicons name="help-buoy-outline" size={20} color={colors.primary} /></View>
          <View style={styles.introBody}>
            <Text style={styles.introTitle}>Help & Support</Text>
            <Text style={styles.introText}>Need assistance? Submit a support request or browse the user guide.</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          <Pressable style={[styles.tabChip, tab === "request" && styles.tabChipActive]} onPress={() => setTab("request")}>
            <Text style={[styles.tabLabel, tab === "request" && styles.tabLabelActive]}>Submit a Request</Text>
          </Pressable>
          <Pressable style={[styles.tabChip, tab === "tickets" && styles.tabChipActive]} onPress={() => setTab("tickets")}>
            <Text style={[styles.tabLabel, tab === "tickets" && styles.tabLabelActive]}>My Tickets{tickets.length ? ` (${tickets.length})` : ""}</Text>
          </Pressable>
          <Pressable style={[styles.tabChip, tab === "guide" && styles.tabChipActive]} onPress={() => setTab("guide")}>
            <Text style={[styles.tabLabel, tab === "guide" && styles.tabLabelActive]}>User Guide</Text>
          </Pressable>
        </View>

        {tab === "request" ? (
          <Card mode="outlined" style={styles.card}>
            <Card.Content>
              <Text style={styles.cardTitle}>New Support Request</Text>
              <Text style={styles.cardSubtitle}>Our team typically responds within 24 hours.</Text>

              <Text style={styles.fieldLabel}>Subject <Text style={styles.required}>*</Text></Text>
              <TextInput
                mode="outlined" value={subject}
                onChangeText={(value) => { setSubject(value); if (value.trim()) setSubjectError(false); }}
                placeholder="Briefly describe your issue…" error={subjectError} dense style={styles.field}
              />
              {subjectError ? <Text style={styles.errorText}>Subject is required.</Text> : null}

              <Text style={styles.fieldLabel}>Category</Text>
              <Menu
                visible={categoryMenuOpen}
                onDismiss={() => setCategoryMenuOpen(false)}
                anchor={
                  <Pressable style={styles.selector} onPress={() => setCategoryMenuOpen(true)}>
                    <Text style={styles.selectorText}>{category}</Text>
                    <Ionicons name={categoryMenuOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                  </Pressable>
                }
              >
                {CATEGORIES.map((item) => (
                  <Menu.Item key={item} title={item} onPress={() => { setCategory(item); setCategoryMenuOpen(false); }} />
                ))}
              </Menu>

              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.priorityRow}>
                {PRIORITIES.map((item) => {
                  const active = priority === item.key;
                  return (
                    <Pressable
                      key={item.key} onPress={() => setPriority(item.key)}
                      style={[styles.priorityChip, { borderColor: active ? item.color : colors.border, backgroundColor: active ? item.soft : colors.surface }]}
                    >
                      <View style={[styles.priorityDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.priorityText, { color: active ? item.color : colors.textSecondary }]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Message <Text style={styles.required}>*</Text></Text>
              <TextInput
                mode="outlined" value={message}
                onChangeText={(value) => { setMessage(value.slice(0, 1000)); if (value.trim()) setMessageError(false); }}
                placeholder="Describe your issue in detail — include any error messages, steps you've already tried, etc."
                error={messageError} multiline numberOfLines={5} style={[styles.field, styles.textarea]}
              />
              {messageError ? <Text style={styles.errorText}>Message is required.</Text> : null}
              <Text style={styles.charCount}>{message.length}/1000</Text>

              <Button mode="contained" onPress={handleSubmit} loading={submitting} disabled={submitting} style={styles.submitButton} contentStyle={styles.submitButtonContent}>
                Submit Request
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        {tab === "tickets" ? (
          tickets.length ? (
            tickets.map((ticket) => {
              const priorityMeta = PRIORITIES.find((item) => item.key === ticket.priority)!;
              return (
                <Card key={ticket.id} mode="outlined" style={styles.card}>
                  <Card.Content>
                    <View style={styles.ticketHeaderRow}>
                      <Text style={styles.cardTitle}>{ticket.subject}</Text>
                      <View style={[styles.priorityBadge, { backgroundColor: priorityMeta.soft }]}>
                        <Text style={[styles.priorityBadgeText, { color: priorityMeta.color }]}>{priorityMeta.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardSubtitle}>{ticket.category} · {ticket.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
                    <Text style={styles.ticketMessage} numberOfLines={3}>{ticket.message}</Text>
                  </Card.Content>
                </Card>
              );
            })
          ) : (
            <Card mode="outlined" style={[styles.card, styles.emptyCard]}>
              <Card.Content style={styles.emptyContent}>
                <View style={styles.emptyIcon}><Ionicons name="file-tray-outline" size={22} color={colors.primary} /></View>
                <Text style={styles.cardTitle}>No tickets yet</Text>
                <Text style={styles.cardSubtitle}>Submit a request and it'll show up here.</Text>
              </Card.Content>
            </Card>
          )
        ) : null}

        {tab === "guide" ? (
          <Card mode="outlined" style={[styles.card, styles.emptyCard]}>
            <Card.Content style={styles.emptyContent}>
              <View style={styles.emptyIcon}><Ionicons name="book-outline" size={22} color={colors.primary} /></View>
              <Text style={styles.cardTitle}>Browse the User Guide</Text>
              <Text style={styles.cardSubtitle}>Step-by-step guides for every part of CurveLead.</Text>
              <Button mode="contained" onPress={() => router.push("/(app)/more/user-guide")} style={styles.guideButton}>
                Open User Guide
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <View style={styles.infoHeaderRow}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={styles.cardTitle}>Support Hours</Text>
            </View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Monday – Friday</Text><Text style={styles.infoValue}>9:00 AM – 8:00 PM</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Saturday</Text><Text style={styles.infoValue}>10:00 AM – 5:00 PM</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Sunday</Text><Text style={styles.infoValue}>Closed</Text></View>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <View style={styles.infoHeaderRow}>
              <Ionicons name="speedometer-outline" size={16} color={colors.primary} />
              <Text style={styles.cardTitle}>Average Response Time</Text>
            </View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>High priority</Text><Text style={styles.infoValue}>~2 hours</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Medium priority</Text><Text style={styles.infoValue}>~8 hours</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Low priority</Text><Text style={styles.infoValue}>~24 hours</Text></View>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Contact Us</Text>
            <View style={styles.contactRow}>
              <Ionicons name="mail-outline" size={15} color={colors.textMuted} />
              <Text style={styles.contactText}>support@curvelead.com</Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  content: { padding: 18, gap: 14 },

  introRow: { flexDirection: "row", gap: 12 },
  introIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  introBody: { flex: 1 },
  introTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  introText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },

  tabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tabChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  tabLabelActive: { color: colors.surface },

  card: {},
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },

  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  required: { color: colors.danger },
  field: {},
  textarea: { minHeight: 100 },
  errorText: { color: colors.danger, fontSize: 11, fontWeight: "600", marginTop: 4 },
  charCount: { color: colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 4 },

  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, backgroundColor: colors.surface },
  selectorText: { color: colors.text, fontSize: 14 },

  priorityRow: { flexDirection: "row", gap: 8 },
  priorityChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 9 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 12, fontWeight: "700" },

  submitButton: { marginTop: 18, borderRadius: 10 },
  submitButtonContent: { height: 46 },

  ticketHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  priorityBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  priorityBadgeText: { fontSize: 10, fontWeight: "800" },
  ticketMessage: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8 },

  emptyCard: {},
  emptyContent: { alignItems: "center", paddingVertical: 16 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  guideButton: { marginTop: 14, borderRadius: 10, alignSelf: "stretch" },

  infoHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  infoLabel: { color: colors.textSecondary, fontSize: 12 },
  infoValue: { color: colors.text, fontSize: 12, fontWeight: "700" },

  contactRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  contactText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
});
