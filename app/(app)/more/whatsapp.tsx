import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, IconButton, Searchbar, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { GlassBackground, glass } from "@/components/Glass";
import { fetchLeads, LeadListItem } from "@/api/leads";
import { fetchTemplates, MessageTemplate } from "@/api/templates";
import { notifyMessageSent } from "@/api/notifications";
import { fetchSendableWhatsAppTemplates, SendableWhatsAppTemplate, sendWhatsAppMessage, sendWhatsAppTemplate, WhatsAppMessage } from "@/api/whatsapp";

type Tab = "chats" | "saved";
type Filter = "all" | "unread" | "starred";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "starred", label: "Starred" },
];

function initials(name?: string) {
  return (name?.trim()?.charAt(0) || "?").toUpperCase();
}

function relativeTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} day ago`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function previewFor(lead: LeadListItem) {
  if (lead.last_message) return lead.last_message;
  if (lead.last_incoming_message) return lead.last_incoming_message;
  if (lead.next_followup_at) return `Follow-up due ${formatDate(lead.next_followup_at)}`;
  if (lead.stage) return `${lead.name}, great to hear! Stage: ${lead.stage}`;
  return `${lead.name}, great to hear! How many brochures should I send?`;
}

function canReplyTo(lead?: LeadListItem) {
  return !!(lead?.last_incoming_message || lead?.is_24h_window_active);
}

export default function WhatsAppScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("chats");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [sendableTemplates, setSendableTemplates] = useState<SendableWhatsAppTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [templateLeadId, setTemplateLeadId] = useState("");
  const [sendingTemplateId, setSendingTemplateId] = useState("");
  const [sentMessages, setSentMessages] = useState<Record<string, WhatsAppMessage[]>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [leadPage, savedTemplates, approvedTemplates] = await Promise.all([
        fetchLeads({ limit: 80 }),
        fetchTemplates().catch(() => []),
        fetchSendableWhatsAppTemplates().catch(() => []),
      ]);
      setLeads(leadPage.leads);
      setTemplates(savedTemplates.filter((item) => item.channel === "whatsapp"));
      setSendableTemplates(approvedTemplates);
    } catch {
      setError("Could not load WhatsApp inbox.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setContactInfoOpen(false); }, [selectedId]);

  const filteredLeads = useMemo(() => {
    const text = search.trim().toLowerCase();
    return leads.filter((lead, index) => {
      if (filter === "unread" && index % 5 !== 0) return false;
      if (filter === "starred" && !starredIds.has(lead.id)) return false;
      if (!text) return true;
      return [lead.name, lead.phone, lead.stage, lead.source].some((value) => String(value || "").toLowerCase().includes(text));
    });
  }, [filter, leads, search, starredIds]);

  const selected = selectedId ? leads.find((lead) => lead.id === selectedId) : undefined;
  const templateLead = templateLeadId ? leads.find((lead) => lead.id === templateLeadId) : undefined;
  const totalUnread = leads.filter((_, index) => index % 5 === 0).length;
  const canReply = canReplyTo(selected);
  const manualMode = selected ? manualIds.has(selected.id) : false;
  const composerEnabled = !!selected && canReply;

  function toggleStar(id: string) {
    setStarredIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function takeOver(id: string) {
    setManualIds((current) => new Set(current).add(id));
  }

  function templateTextFor(template: MessageTemplate, lead: LeadListItem) {
    return template.message
      .replace(/\{name\}/gi, lead.name)
      .replace(/\{phone\}/gi, lead.phone);
  }

  function addSentMessage(leadId: string, sent: WhatsAppMessage) {
    setSentMessages((current) => ({
      ...current,
      [leadId]: [...(current[leadId] || []), sent],
    }));
  }

  function openTemplates() {
    if (selected) setTemplateLeadId(selected.id);
    setContactInfoOpen(false);
    setSelectedId("");
    setTab("saved");
  }

  function templateParamsFor(template: SendableWhatsAppTemplate, lead: LeadListItem) {
    return Array.from({ length: template.variable_count }, (_, index) => {
      if (index === 0) return lead.name.trim().split(/\s+/)[0] || lead.name;
      return "";
    });
  }

  function previewSendableTemplate(template: SendableWhatsAppTemplate, lead: LeadListItem) {
    const params = templateParamsFor(template, lead);
    return template.body_text.replace(/\{\{(\d+)\}\}/g, (match, value) => params[Number(value) - 1] || match);
  }

  async function useSendableTemplate(template: SendableWhatsAppTemplate) {
    const templateLead = templateLeadId ? leads.find((lead) => lead.id === templateLeadId) : undefined;
    if (!templateLead || template.unsupported) return;
    setSendingTemplateId(`${template.name}:${template.language}`);
    try {
      const result = await sendWhatsAppTemplate(templateLead.id, {
        template_name: template.name,
        language_code: template.language,
        template_params: templateParamsFor(template, templateLead),
        body_text: template.body_text,
      });
      addSentMessage(templateLead.id, result.message);
      setTemplateLeadId("");
      setSelectedId(templateLead.id);
      setTab("chats");
      if (result.delivery?.success === false) {
        Alert.alert("Message not delivered", result.delivery.error || "WhatsApp rejected this template.");
      } else {
        notifyMessageSent(templateLead).catch(() => {});
      }
    } catch {
      Alert.alert("Template not sent", "Could not send this template. Please check WhatsApp integration and try again.");
    } finally {
      setSendingTemplateId("");
    }
  }

  async function useTemplate(template: MessageTemplate) {
    const templateLead = templateLeadId ? leads.find((lead) => lead.id === templateLeadId) : undefined;
    if (templateLead) {
      const body = templateTextFor(template, templateLead);
      setSendingTemplateId(template.id);
      try {
        const result = await sendWhatsAppMessage(templateLead.id, body);
        addSentMessage(templateLead.id, result.message);
        setTemplateLeadId("");
        setSelectedId(templateLead.id);
        setTab("chats");
        if (result.delivery?.success === false) {
          Alert.alert("Message not delivered", result.delivery.error || "WhatsApp rejected this message.");
        } else {
          notifyMessageSent(templateLead).catch(() => {});
        }
      } catch {
        Alert.alert("Template not sent", "This saved reply could not be sent directly. Use an approved WhatsApp template to start a locked conversation.");
      } finally {
        setSendingTemplateId("");
      }
      return;
    }
    setTab("chats");
    setMessage(template.message);
  }

  async function sendMessage() {
    if (!selected) return;
    if (!canReplyTo(selected)) {
      Alert.alert("Send a template first", "This lead hasn't messaged you yet. Send a template and reply manually after they respond.");
      return;
    }
    const body = message.trim();
    if (!body) {
      Alert.alert("Add message", "Type a message or choose a saved reply.");
      return;
    }
    try {
      const result = await sendWhatsAppMessage(selected.id, body);
      addSentMessage(selected.id, result.message);
      setMessage("");
      if (result.delivery?.success === false) {
        Alert.alert("Message not delivered", result.delivery.error || "WhatsApp rejected this message.");
      } else {
        notifyMessageSent(selected).catch(() => {});
      }
    } catch {
      Alert.alert("Message not sent", "Could not send this message. Please try again.");
    }
  }

  return (
    <View style={styles.screen}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="WhatsApp" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="refresh" color={colors.primary} onPress={load} />
      </Appbar.Header>

      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, tab === "chats" && styles.tabActive]} onPress={() => setTab("chats")}>
          <Text style={[styles.tabText, tab === "chats" && styles.tabTextActive]}>Chats</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "saved" && styles.tabActive]} onPress={() => setTab("saved")}>
          <Text style={[styles.tabText, tab === "saved" && styles.tabTextActive]}>Saved replies</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={load}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : tab === "saved" ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}><Ionicons name="bookmark-outline" size={22} color={colors.success} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Saved replies</Text>
              <Text style={styles.heroSubtitle}>Use your WhatsApp templates in chats</Text>
            </View>
          </View>
          {templateLeadId && sendableTemplates.length ? sendableTemplates.map((template) => {
            const key = `${template.name}:${template.language}`;
            return (
              <Pressable
                key={key}
                style={[styles.replyCard, (sendingTemplateId === key || template.unsupported) && styles.replyCardDisabled]}
                onPress={() => useSendableTemplate(template)}
                disabled={!!sendingTemplateId || !!template.unsupported}
              >
                <View style={styles.replyTop}>
                  <Text style={styles.replyName} numberOfLines={1}>{template.name}</Text>
                  <Text style={styles.replyCount}>{sendingTemplateId === key ? "Sending..." : template.language}</Text>
                </View>
                <Text style={styles.replyMessage} numberOfLines={3}>{templateLead ? previewSendableTemplate(template, templateLead) : template.body_text}</Text>
                {template.unsupported ? <Text style={styles.replyWarning}>{template.unsupported}</Text> : null}
              </Pressable>
            );
          }) : templates.length ? templates.map((template) => (
            <Pressable key={template.id} style={[styles.replyCard, sendingTemplateId === template.id && styles.replyCardDisabled]} onPress={() => useTemplate(template)} disabled={!!sendingTemplateId}>
              <View style={styles.replyTop}>
                <Text style={styles.replyName} numberOfLines={1}>{template.name}</Text>
                <Text style={styles.replyCount}>{sendingTemplateId === template.id ? "Sending..." : `${template.use_count || 0} uses`}</Text>
              </View>
              <Text style={styles.replyMessage} numberOfLines={3}>{template.message}</Text>
            </Pressable>
          )) : (
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubbles-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No saved replies yet</Text>
              <Text style={styles.emptyText}>Create WhatsApp templates from Templates or WhatsApp Templates.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}><Ionicons name="logo-whatsapp" size={22} color={colors.success} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>WhatsApp Inbox</Text>
              <Text style={styles.heroSubtitle}>Manage and respond to customer conversations</Text>
            </View>
          </View>

          <View style={styles.conversationCard}>
            <Text style={styles.sectionTitle}>Conversations</Text>
            <Searchbar value={search} onChangeText={setSearch} placeholder="Search conversations..." elevation={0} inputStyle={styles.searchInput} style={styles.searchBox} />
            <View style={styles.filterRow}>
              {FILTERS.map((item) => {
                const active = filter === item.key;
                const count = item.key === "all" ? leads.length : item.key === "unread" ? totalUnread : starredIds.size;
                return (
                  <Pressable key={item.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(item.key)}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label} ({count})</Text>
                  </Pressable>
                );
              })}
            </View>

            {filteredLeads.length ? filteredLeads.map((lead, index) => {
              const active = selected?.id === lead.id;
              const unread = index % 5 === 0;
              return (
                <Pressable key={lead.id} style={[styles.conversationRow, active && styles.conversationRowActive]} onPress={() => setSelectedId(lead.id)}>
                  <View style={[styles.avatar, unread && styles.avatarUnread]}><Text style={styles.avatarText}>{initials(lead.name)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
                      <Text style={styles.timeText}>{relativeTime(lead.created_at)}</Text>
                    </View>
                    <Text style={styles.previewText} numberOfLines={1}>{previewFor(lead)}</Text>
                  </View>
                  {unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>1</Text></View> : null}
                </Pressable>
              );
            }) : (
              <Text style={styles.emptyText}>No conversations match this filter.</Text>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelectedId("")}>
        {selected ? (
          <View style={styles.chatScreen}>
            <Appbar.Header style={styles.header} elevated={false}>
              <Appbar.BackAction onPress={() => setSelectedId("")} />
              <View style={[styles.avatar, styles.avatarUnread]}><Text style={styles.avatarText}>{initials(selected.name)}</Text></View>
              <Appbar.Content title={selected.name} subtitle={`${selected.phone} - Last message ${relativeTime(selected.created_at)}`} titleStyle={styles.chatName} subtitleStyle={styles.chatMeta} />
              <IconButton icon="information-outline" size={20} iconColor={colors.primary} onPress={() => setContactInfoOpen((open) => !open)} />
              <Pressable style={[styles.takeOverButton, manualMode && styles.takeOverButtonActive]} onPress={() => takeOver(selected.id)}>
                <Text style={[styles.takeOverText, manualMode && styles.takeOverTextActive]}>{manualMode ? "Manual" : "Take Over"}</Text>
              </Pressable>
              <IconButton icon={starredIds.has(selected.id) ? "star" : "star-outline"} size={20} iconColor={starredIds.has(selected.id) ? colors.warning : colors.textMuted} onPress={() => toggleStar(selected.id)} />
            </Appbar.Header>

            {contactInfoOpen ? (
              <View style={styles.headerInfoPopover}>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Name</Text><Text style={styles.infoValue}>{selected.name}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone number</Text><Text style={styles.infoValue}>{selected.phone}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>First message</Text><Text style={styles.infoValue}>{formatDate(selected.created_at)}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Last message</Text><Text style={styles.infoValue}>{relativeTime(selected.created_at)}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Total messages</Text><Text style={styles.infoValue}>{selected.total_messages ?? 3}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Status</Text><Text style={styles.infoStatus}>Active</Text></View>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={[styles.chatContent, { paddingBottom: 24 }]} showsVerticalScrollIndicator={false}>
              <View style={styles.dayPill}><Text style={styles.dayPillText}>Today</Text></View>
              <View style={styles.messageBubbleIn}>
                <Text style={styles.messageText}>Hello! Can I get more info on this?</Text>
                <Text style={styles.messageTime}>02:25 pm</Text>
              </View>
              <View style={styles.messageBubbleOut}>
                <Text style={styles.messageText}>Hi {selected.name.split(" ")[0]}! Salonox helps salons, spas and beauty parlours manage everything from appointments to follow-ups.</Text>
              </View>
              {(sentMessages[selected.id] || []).map((item, index) => (
                <View key={`${selected.id}-${index}`} style={styles.messageBubbleOut}>
                  <Text style={styles.messageText}>{item.message}</Text>
                  <Text style={styles.messageTime}>{item.status || "Sent"}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
              {!canReply ? (
                <View style={styles.templatePrompt}>
                  <Text style={styles.templatePromptText}>This lead hasn't messaged you yet</Text>
                  <Pressable style={styles.templateButton} onPress={openTemplates}>
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                    <Text style={styles.templateButtonText}>Send Template</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.composerRow}>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  mode="outlined"
                  placeholder={canReply ? "Type a message..." : "Waiting for customer message"}
                  style={[styles.messageInput, !composerEnabled && styles.messageInputDisabled]}
                  outlineStyle={[styles.messageInputOutline, !composerEnabled && styles.messageInputOutlineDisabled]}
                  editable={composerEnabled}
                  disabled={!composerEnabled}
                />
                <Pressable style={[styles.sendButton, !composerEnabled && styles.sendButtonDisabled]} onPress={sendMessage} disabled={!composerEnabled}>
                  <Ionicons name="send" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: "transparent" },
  headerTitle: { color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  errorText: { color: colors.danger, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  retryButton: { marginTop: 14, backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  tab: { flex: 1, minHeight: 42, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.74)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.65)" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_700Bold" },
  tabTextActive: { color: "#fff" },
  content: { paddingHorizontal: 16 },
  heroCard: { ...glass, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 14 },
  heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: colors.text, fontSize: 16, fontFamily: "DMSans_700Bold" },
  heroSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  conversationCard: { ...glass, padding: 14, marginBottom: 14 },
  sectionTitle: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 10 },
  searchBox: { backgroundColor: "rgba(255,255,255,0.82)", borderRadius: 12, borderWidth: 1, borderColor: colors.border, height: 44 },
  searchInput: { fontSize: 13, minHeight: 42 },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 8 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.7)" },
  filterChipActive: { backgroundColor: colors.primary },
  filterText: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_700Bold" },
  filterTextActive: { color: "#fff" },
  conversationRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 10 },
  conversationRowActive: { backgroundColor: "rgba(224,242,254,0.86)" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center" },
  avatarUnread: { backgroundColor: colors.successSoft },
  avatarText: { color: colors.text, fontSize: 12, fontFamily: "Inter_700Bold" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  leadName: { flex: 1, color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" },
  timeText: { color: colors.textMuted, fontSize: 10 },
  previewText: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  unreadBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  unreadText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  chatScreen: { flex: 1, backgroundColor: colors.background },
  chatContent: { padding: 16 },
  chatName: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  chatMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  dayPill: { alignSelf: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginVertical: 12 },
  dayPillText: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  messageBubbleIn: { alignSelf: "flex-start", maxWidth: "82%", backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 10 },
  messageBubbleOut: { alignSelf: "flex-end", maxWidth: "82%", backgroundColor: "#dcfce7", borderRadius: 14, padding: 12, marginBottom: 12 },
  messageText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  messageTime: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  composer: { gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.background },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  messageInput: { flex: 1, backgroundColor: colors.surface, minHeight: 48 },
  messageInputDisabled: { backgroundColor: "#f8fafc" },
  messageInputOutline: { borderRadius: 16, borderColor: colors.borderSoft },
  messageInputOutlineDisabled: { borderColor: colors.border },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { backgroundColor: colors.textMuted, opacity: 0.45 },
  headerInfoPopover: { position: "absolute", top: 76, right: 14, zIndex: 10, width: 250, backgroundColor: "#fff", borderRadius: 14, padding: 12, shadowColor: "#0f172a", shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5, borderWidth: 1, borderColor: colors.borderSoft },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  infoLabel: { flex: 0.42, color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  infoValue: { flex: 0.58, color: colors.text, fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "right" },
  infoStatus: { color: colors.success, fontSize: 11, fontFamily: "Inter_700Bold", backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: "hidden" },
  takeOverButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.78)" },
  takeOverButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  takeOverText: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_700Bold" },
  takeOverTextActive: { color: "#fff" },
  templatePrompt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 14, padding: 10 },
  templatePromptText: { flex: 1, color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  templateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  templateButtonText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  replyCard: { ...glass, padding: 14, marginBottom: 12 },
  replyCardDisabled: { opacity: 0.65 },
  replyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  replyName: { flex: 1, color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  replyCount: { color: colors.textMuted, fontSize: 11 },
  replyMessage: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
  replyWarning: { color: colors.warning, fontSize: 11, marginTop: 6, fontFamily: "Inter_600SemiBold" },
  emptyCard: { ...glass, alignItems: "center", padding: 30, marginTop: 20 },
  emptyTitle: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 },
});
