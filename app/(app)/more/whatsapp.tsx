import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, BackHandler, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Appbar, Searchbar, Text } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { GlassBackground, glass } from "@/components/Glass";
import { fetchLeads, LeadListItem } from "@/api/leads";
import { fetchTemplates, MessageTemplate } from "@/api/templates";
import { notifyMessageSent } from "@/api/notifications";
import {
  fetchConversation, fetchInbox, fetchSendableWhatsAppTemplates, InboxConversation, markConversationsRead, replyWindowLeftMs,
  SendableWhatsAppTemplate, sendWhatsAppMessage, sendWhatsAppTemplate, setConversationAiPaused, WhatsAppMessage,
} from "@/api/whatsapp";

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

const INBOX_CACHE_KEY = "whatsapp_inbox_cache_v1";
const MAX_RENDERED_MESSAGES = 100;

function indexInbox(conversations: InboxConversation[]) {
  return Object.fromEntries(conversations.map((item) => [item.lead_id, item]));
}

// Cheap fingerprint so a poll that found nothing new doesn't re-render the whole screen.
function sameMessages(a: WhatsAppMessage[], b: WhatsAppMessage[]) {
  if (a.length !== b.length) return false;
  const x = a[a.length - 1];
  const y = b[b.length - 1];
  return !x || (x.id === y.id && x.status === y.status);
}

function previewFor(lead: LeadListItem, conversation?: InboxConversation) {
  if (conversation?.message) return conversation.message;
  return "No messages yet - tap to start chatting";
}

function clock(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
}

function dayLabel(value?: string) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (key(date) === key(today)) return "Today";
  if (key(date) === key(yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function windowText(ms: number) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function WhatsAppScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [tab, setTab] = useState<Tab>("chats");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [sendableTemplates, setSendableTemplates] = useState<SendableWhatsAppTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [inbox, setInbox] = useState<Record<string, InboxConversation>>({});
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [templateLeadId, setTemplateLeadId] = useState("");
  const [sendingTemplateId, setSendingTemplateId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const chatScrollRef = useRef<ScrollView>(null);

  async function load() {
    setError("");
    // Paint the last known list straight away, then refresh it from the server.
    AsyncStorage.getItem(INBOX_CACHE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const cached = JSON.parse(raw) as { leads: LeadListItem[]; inbox: Record<string, InboxConversation> };
        setLeads((current) => current.length ? current : cached.leads);
        setInbox((current) => Object.keys(current).length ? current : cached.inbox);
        setLoading(false);
      } catch {
        // Ignore a corrupt cache.
      }
    }).catch(() => {});
    try {
      const [leadPage, conversations] = await Promise.all([
        fetchLeads({ limit: 80 }),
        fetchInbox().catch(() => [] as InboxConversation[]),
      ]);
      const indexed = indexInbox(conversations);
      setLeads(leadPage.leads);
      setInbox(indexed);
      AsyncStorage.setItem(INBOX_CACHE_KEY, JSON.stringify({ leads: leadPage.leads, inbox: indexed })).catch(() => {});
    } catch {
      setLeads((current) => { if (!current.length) setError("Could not load WhatsApp inbox."); return current; });
    } finally {
      setLoading(false);
    }
    // Templates aren't needed to show the list, so they load in the background.
    fetchTemplates().then((saved) => setTemplates(saved.filter((item) => item.channel === "whatsapp"))).catch(() => {});
    fetchSendableWhatsAppTemplates().then(setSendableTemplates).catch(() => {});
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setContactInfoOpen(false); }, [selectedId]);

  // The open chat is an in-page overlay (a Modal stops short of the bottom edge on some phones), so hide the tab bar and own the back button.
  useEffect(() => {
    const tabs = navigation.getParent();
    tabs?.setOptions({ tabBarStyle: selectedId ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { tabs?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [!!selectedId, navigation, insets.bottom]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { setSelectedId(""); return true; });
    return () => sub.remove();
  }, [selectedId]);

  const inboxBusy = useRef(false);
  const chatBusy = useRef(false);

  async function refreshInbox() {
    if (inboxBusy.current) return;
    inboxBusy.current = true;
    try {
      setInbox(indexInbox(await fetchInbox()));
    } catch {
      // Keep showing what we have; the next poll will try again.
    } finally {
      inboxBusy.current = false;
    }
  }

  async function loadConversation(leadId: string) {
    if (chatBusy.current) return;
    chatBusy.current = true;
    try {
      const list = await fetchConversation(leadId);
      setMessages((current) => (sameMessages(current, list) ? current : list));
    } catch {
      // Keep the current messages on a failed poll.
    } finally {
      chatBusy.current = false;
      setMessagesLoaded(true);
    }
  }

  // The open chat refreshes every 8s so customer replies show up without a manual refresh.
  // Polling stops while the app is in the background so it doesn't burn battery and data.
  useEffect(() => {
    setMessages([]);
    setMessagesLoaded(false);
    chatBusy.current = false;
    if (!selectedId) return undefined;
    loadConversation(selectedId);
    markConversationsRead([selectedId])
      .then(() => setInbox((current) => current[selectedId] ? { ...current, [selectedId]: { ...current[selectedId], unread_count: 0 } } : current))
      .catch(() => {});
    const timer = setInterval(() => { if (AppState.currentState === "active") loadConversation(selectedId); }, 8000);
    return () => clearInterval(timer);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) return undefined;
    const timer = setInterval(() => { if (AppState.currentState === "active") refreshInbox(); }, 20000);
    return () => clearInterval(timer);
  }, [selectedId]);

  // Jump to the newest message only when one actually arrives, not on every re-render.
  useEffect(() => {
    if (messages.length) requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({ animated: false }));
  }, [messages.length]);

  const filteredLeads = useMemo(() => {
    const text = search.trim().toLowerCase();
    return leads
      .filter((lead) => {
        if (filter === "unread" && !(inbox[lead.id]?.unread_count > 0)) return false;
        if (filter === "starred" && !starredIds.has(lead.id)) return false;
        if (!text) return true;
        return [lead.name, lead.phone, lead.stage, lead.source].some((value) => String(value || "").toLowerCase().includes(text));
      })
      // Newest conversation first, leads with no chat yet at the bottom.
      .sort((a, b) => new Date(inbox[b.id]?.sent_at || 0).getTime() - new Date(inbox[a.id]?.sent_at || 0).getTime());
  }, [filter, inbox, leads, search, starredIds]);

  const selected = selectedId ? leads.find((lead) => lead.id === selectedId) : undefined;
  const selectedConversation = selectedId ? inbox[selectedId] : undefined;
  const templateLead = templateLeadId ? leads.find((lead) => lead.id === templateLeadId) : undefined;
  const totalUnread = Object.values(inbox).filter((item) => item.unread_count > 0).length;
  const windowLeft = replyWindowLeftMs(messages);
  // Until the messages load, fall back to the lead's own flags so the composer doesn't flash locked.
  const canReply = messagesLoaded ? windowLeft > 0 : !!(selected?.last_incoming_message || selected?.is_24h_window_active);
  const manualMode = !!selectedConversation?.ai_paused;
  const composerEnabled = !!selected && canReply;

  function toggleStar(id: string) {
    setStarredIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleTakeOver(id: string) {
    const paused = !inbox[id]?.ai_paused;
    setInbox((current) => ({ ...current, [id]: { ...(current[id] || { lead_id: id, lead_name: "", lead_phone: "", message: null, sent_at: null, unread_count: 0 }), ai_paused: paused } }));
    try {
      await setConversationAiPaused(id, paused);
    } catch {
      setInbox((current) => current[id] ? { ...current, [id]: { ...current[id], ai_paused: !paused } } : current);
      Alert.alert("Couldn't update", "Could not change take-over. Please try again.");
    }
  }

  function templateTextFor(template: MessageTemplate, lead: LeadListItem) {
    return template.message
      .replace(/\{name\}/gi, lead.name)
      .replace(/\{phone\}/gi, lead.phone);
  }

  function addSentMessage(leadId: string, sent: WhatsAppMessage) {
    if (leadId === selectedId) setMessages((current) => [...current, sent]);
    refreshInbox();
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
    if (!selected || sending) return;
    if (!canReply) {
      Alert.alert("Send a template first", "The 24-hour reply window is closed. Send an approved template and reply after they respond.");
      return;
    }
    const body = message.trim();
    if (!body) {
      Alert.alert("Add message", "Type a message or choose a saved reply.");
      return;
    }
    setSending(true);
    try {
      const result = await sendWhatsAppMessage(selected.id, body);
      addSentMessage(selected.id, result.message);
      setMessage("");
      loadConversation(selected.id);
      if (result.delivery?.success === false) {
        Alert.alert("Message not delivered", result.delivery.error || "WhatsApp rejected this message.");
      } else {
        notifyMessageSent(selected).catch(() => {});
      }
    } catch {
      Alert.alert("Message not sent", "Could not send this message. Please try again.");
    } finally {
      setSending(false);
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

            {filteredLeads.length ? filteredLeads.map((lead) => {
              const active = selected?.id === lead.id;
              const conversation = inbox[lead.id];
              const unread = (conversation?.unread_count || 0) > 0;
              return (
                <Pressable key={lead.id} style={[styles.conversationRow, active && styles.conversationRowActive]} onPress={() => setSelectedId(lead.id)}>
                  <View style={[styles.avatar, unread && styles.avatarUnread]}><Text style={styles.avatarText}>{initials(lead.name)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
                      <Text style={styles.timeText}>{relativeTime(conversation?.sent_at || undefined)}</Text>
                    </View>
                    <Text style={[styles.previewText, !conversation?.message && styles.previewEmpty]} numberOfLines={1}>{previewFor(lead, conversation)}</Text>
                  </View>
                  {unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{conversation.unread_count}</Text></View> : null}
                </Pressable>
              );
            }) : (
              <Text style={styles.emptyText}>No conversations match this filter.</Text>
            )}
          </View>
        </ScrollView>
      )}

      <View style={selected ? styles.chatOverlay : styles.chatHidden}>
        {selected ? (
          <KeyboardAvoidingView style={styles.chatScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
              <Pressable onPress={() => setSelectedId("")} hitSlop={10} style={styles.chatBack}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>
              <View style={styles.chatAvatar}>
                <Text style={styles.chatAvatarText}>{initials(selected.name)}</Text>
                <View style={styles.onlineDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatName} numberOfLines={1}>{selected.name}</Text>
                <Text style={styles.chatMeta} numberOfLines={1}>{selected.phone}{selectedConversation?.sent_at ? ` - ${relativeTime(selectedConversation.sent_at)}` : ""}</Text>
              </View>
              <Pressable style={[styles.takeOverButton, manualMode && styles.takeOverButtonActive]} onPress={() => toggleTakeOver(selected.id)}>
                <Ionicons name={manualMode ? "hand-left" : "hand-left-outline"} size={13} color={manualMode ? "#fff" : colors.textSecondary} />
                <Text style={[styles.takeOverText, manualMode && styles.takeOverTextActive]}>{manualMode ? "Resume AI" : "Take over"}</Text>
              </Pressable>
              <Pressable hitSlop={8} style={styles.headerIcon} onPress={() => setContactInfoOpen((open) => !open)}>
                <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
              </Pressable>
              <Pressable hitSlop={8} style={styles.headerIcon} onPress={() => toggleStar(selected.id)}>
                <Ionicons name={starredIds.has(selected.id) ? "star" : "star-outline"} size={22} color={starredIds.has(selected.id) ? colors.warning : colors.textMuted} />
              </Pressable>
            </View>

            {contactInfoOpen ? (
              <View style={[styles.headerInfoPopover, { top: insets.top + 64 }]}>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Name</Text><Text style={styles.infoValue}>{selected.name}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone number</Text><Text style={styles.infoValue}>{selected.phone}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>First message</Text><Text style={styles.infoValue}>{messages.length ? formatDate(messages[0].sent_at) : "-"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Last message</Text><Text style={styles.infoValue}>{selectedConversation?.sent_at ? relativeTime(selectedConversation.sent_at) : "-"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Total messages</Text><Text style={styles.infoValue}>{messages.length}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Reply window</Text><Text style={styles.infoValue}>{windowLeft > 0 ? `Open - ${windowText(windowLeft)} left` : "Closed - template only"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>AI replies</Text><Text style={styles.infoStatus}>{manualMode ? "Paused" : "Active"}</Text></View>
              </View>
            ) : null}

            <ScrollView
              ref={chatScrollRef}
              style={styles.chatBody}
              contentContainerStyle={styles.chatContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {!messagesLoaded ? (
                <View style={styles.emptyChat}><ActivityIndicator color={colors.primary} /></View>
              ) : !messages.length ? (
                <View style={styles.emptyChat}>
                  <Ionicons name="chatbubbles-outline" size={30} color={colors.textMuted} />
                  <Text style={styles.emptyChatText}>No messages yet. Send a template to start the conversation.</Text>
                </View>
              ) : null}
              {messages.slice(-MAX_RENDERED_MESSAGES).map((item, index, shown) => {
                const outbound = item.direction === "outbound";
                const showDay = index === 0 || dayLabel(item.sent_at) !== dayLabel(shown[index - 1].sent_at);
                const isMedia = !!item.media_url && !!item.message_type && item.message_type !== "text" && item.message_type !== "template";
                const caption = item.message && !/^\[.*\]$/.test(item.message) ? item.message : "";
                return (
                  <React.Fragment key={item.id || `${index}-${item.sent_at}`}>
                    {showDay ? <View style={styles.dayPill}><Text style={styles.dayPillText}>{dayLabel(item.sent_at)}</Text></View> : null}
                    <View style={outbound ? styles.messageBubbleOut : styles.messageBubbleIn}>
                      {isMedia && item.message_type === "image" ? (
                        <Image source={{ uri: item.media_url as string }} style={styles.mediaImage} resizeMode="cover" />
                      ) : null}
                      {isMedia && item.message_type !== "image" ? (
                        <Pressable style={styles.docRow} onPress={() => Linking.openURL(item.media_url as string).catch(() => {})}>
                          <Ionicons name={item.message_type === "audio" ? "musical-notes-outline" : item.message_type === "video" ? "videocam-outline" : "document-text-outline"} size={20} color={colors.primary} />
                          <Text style={styles.docText} numberOfLines={1}>{caption || (item.message_type === "audio" ? "Voice message" : item.message_type === "video" ? "Video" : "Document")}</Text>
                        </Pressable>
                      ) : null}
                      {!isMedia || (item.message_type === "image" && caption) ? <Text style={styles.messageText}>{isMedia ? caption : item.message}</Text> : null}
                      <View style={styles.sentMeta}>
                        <Text style={styles.messageTime}>{clock(item.sent_at)}</Text>
                        {outbound ? (
                          <Ionicons
                            name={item.status === "failed" ? "alert-circle" : item.status === "sent" || !item.status ? "checkmark" : "checkmark-done"}
                            size={14}
                            color={item.status === "failed" ? colors.danger : item.status === "read" ? colors.primary : colors.textMuted}
                          />
                        ) : null}
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}
            </ScrollView>

            <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              {!canReply ? (
                <View style={styles.templatePrompt}>
                  <View style={styles.templatePromptIcon}><Ionicons name="lock-closed" size={16} color="#ea580c" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templatePromptText}>Conversation not started</Text>
                    <Text style={styles.templatePromptHint}>Send an approved template to start chatting.</Text>
                  </View>
                  <Pressable style={styles.templateButton} onPress={openTemplates}>
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                    <Text style={styles.templateButtonText}>Template</Text>
                  </Pressable>
                </View>
              ) : templates.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quickReplies}>
                  {templates.map((template) => (
                    <Pressable key={template.id} style={styles.quickChip} onPress={() => setMessage(templateTextFor(template, selected))}>
                      <Ionicons name="flash-outline" size={13} color={colors.primary} />
                      <Text style={styles.quickChipText} numberOfLines={1}>{template.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.composerRow}>
                <View style={[styles.inputPill, !composerEnabled && styles.inputPillDisabled]}>
                  <RNTextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder={canReply ? "Type a message..." : "Waiting for customer message"}
                    placeholderTextColor={colors.textMuted}
                    style={styles.inputText}
                    editable={composerEnabled}
                    multiline
                  />
                </View>
                <Pressable onPress={sendMessage} disabled={!composerEnabled || !message.trim() || sending}>
                  <LinearGradient
                    colors={composerEnabled && message.trim() ? ["#22c55e", "#0ea5e9"] : ["#cbd5e1", "#cbd5e1"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendButton}
                  >
                    <Ionicons name="send" size={20} color="#fff" />
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>
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
  previewEmpty: { fontStyle: "italic", color: colors.textMuted },
  mediaImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 6 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  docText: { flex: 1, color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyChat: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyChatText: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  unreadBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  unreadText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  chatOverlay: { ...StyleSheet.absoluteFill, zIndex: 50, elevation: 50, backgroundColor: "#f4f9fc" },
  chatHidden: { display: "none" },
  chatScreen: { flex: 1, backgroundColor: "#f4f9fc" },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  chatBack: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  chatAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  chatAvatarText: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  onlineDot: { position: "absolute", right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#fff" },
  headerIcon: { width: 28, alignItems: "center", justifyContent: "center" },
  chatBody: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 24 },
  chatName: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  chatMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  dayPill: { alignSelf: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginVertical: 12 },
  dayPillText: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  messageBubbleIn: { alignSelf: "flex-start", maxWidth: "82%", backgroundColor: "#ffffff", borderRadius: 18, borderTopLeftRadius: 4, padding: 12, marginBottom: 10, shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  messageBubbleOut: { alignSelf: "flex-end", maxWidth: "82%", backgroundColor: "#d9f7e6", borderRadius: 18, borderTopRightRadius: 4, padding: 12, marginBottom: 12 },
  sentMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  messageText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  messageTime: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  composer: { gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: "#ffffff" },
  quickReplies: { gap: 8, paddingRight: 8 },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 180, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  quickChipText: { color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  inputPill: { flex: 1, minHeight: 48, maxHeight: 120, justifyContent: "center", backgroundColor: "#f4f9fc", borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  inputPillDisabled: { backgroundColor: "#f1f5f9" },
  inputText: { color: colors.text, fontSize: 14, paddingVertical: 10 },
  sendButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  headerInfoPopover: { position: "absolute", top: 76, right: 14, zIndex: 10, width: 250, backgroundColor: "#fff", borderRadius: 14, padding: 12, shadowColor: "#0f172a", shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5, borderWidth: 1, borderColor: colors.borderSoft },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  infoLabel: { flex: 0.42, color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  infoValue: { flex: 0.58, color: colors.text, fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "right" },
  infoStatus: { color: colors.success, fontSize: 11, fontFamily: "Inter_700Bold", backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: "hidden" },
  takeOverButton: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#ffffff" },
  takeOverButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  takeOverText: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_700Bold" },
  takeOverTextActive: { color: "#fff" },
  templatePrompt: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 16, padding: 10 },
  templatePromptIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#ffedd5", alignItems: "center", justifyContent: "center" },
  templatePromptHint: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  templatePromptText: { color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" },
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
