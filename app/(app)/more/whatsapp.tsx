import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, BackHandler, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Searchbar, Text } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { fetchLeadDetails, fetchLeads, LeadListItem } from "@/api/leads";
import { fetchTemplates, MessageTemplate } from "@/api/templates";
import { notifyMessageSent } from "@/api/notifications";
import { MAX_ATTACHMENT_BYTES, uploadLeadAttachment } from "@/api/attachments";
import {
  deleteConversation, fetchConversation, fetchInbox, fetchSendableWhatsAppTemplates, InboxConversation, markConversationsRead, replyWindowLeftMs,
  SendableWhatsAppTemplate, sendWhatsAppAttachment, sendWhatsAppMessage, sendWhatsAppTemplate, setConversationAiPaused, WhatsAppMessage,
} from "@/api/whatsapp";

// Palette of the redesigned screen: pale blue page, white cards, deep teal-blue accent, green for unread/send.
const UI = { bg: "#edf3f7", line: "#d6e6f0", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", green: "#0f7b5f", greenSoft: "#d8f0e5" };

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
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const INBOX_CACHE_KEY = "whatsapp_inbox_cache_v1";
const MAX_RENDERED_MESSAGES = 100;
// Last messages seen per chat, so reopening a chat shows them at once while the fresh copy loads.
const conversationCache = new Map<string, WhatsAppMessage[]>();

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
  // Set when opened from a lead's details screen: go straight into that lead's conversation.
  const { leadId: openLeadId, openAt, name: openLeadName, phone: openLeadPhone } = useLocalSearchParams<{ leadId?: string; openAt?: string; name?: string; phone?: string }>();
  const [pinnedLead, setPinnedLead] = useState<LeadListItem | null>(null);
  const [tab, setTab] = useState<Tab>("chats");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [savedSearch, setSavedSearch] = useState("");
  // "Send to which customer?": the saved reply waiting for someone to send it to.
  const [pickTemplate, setPickTemplate] = useState<MessageTemplate | null>(null);
  const [pickSearch, setPickSearch] = useState("");
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [templateSheetSearch, setTemplateSheetSearch] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [savedCategory, setSavedCategory] = useState("all");
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [sendableTemplates, setSendableTemplates] = useState<SendableWhatsAppTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [inbox, setInbox] = useState<Record<string, InboxConversation>>({});
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [templateLeadId, setTemplateLeadId] = useState("");
  const [sendingTemplateId, setSendingTemplateId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inboxFailed, setInboxFailed] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // Android doesn't reliably resize the in-page chat overlay for the keyboard, so lift the composer by hand.
  // The lift is how far the overlay's bottom edge reaches below the top of the keyboard (measured, not the keyboard's
  // own height), so it stays right whether or not Android already shrank the window or draws under the nav bar.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const chatOverlayRef = useRef<View>(null);
  const topInset = useRef(insets.top);
  topInset.current = insets.top;
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      const keyboardTop = event.endCoordinates.screenY;
      const overlay = chatOverlayRef.current;
      if (overlay && keyboardTop) {
        // The keyboard's top is in screen coordinates (status bar included). When the app sits below the status bar
        // (no top inset) the overlay's position is in window coordinates that start under it, so add its height back.
        // When the app draws behind the status bar (top inset > 0) both already agree, so add nothing.
        const statusBar = topInset.current > 0 ? 0 : (StatusBar.currentHeight ?? 0);
        overlay.measureInWindow((_x, y, _width, height) => setKeyboardHeight(Math.max(0, Math.round(y + height + statusBar - keyboardTop))));
      } else {
        setKeyboardHeight(event.endCoordinates.height);
      }
      requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({ animated: false }));
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
        fetchInbox().catch(() => null),
      ]);
      setLeads(leadPage.leads);
      if (conversations) {
        const indexed = indexInbox(conversations);
        setInbox(indexed);
        setInboxFailed(false);
        AsyncStorage.setItem(INBOX_CACHE_KEY, JSON.stringify({ leads: leadPage.leads, inbox: indexed })).catch(() => {});
      } else {
        // Don't treat a failed fetch as "no chats": keep the last known conversations and say so.
        setInboxFailed(true);
      }
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

  // Open the requested lead's chat right away - without waiting for the inbox list - every time Chat is tapped.
  // `openAt` changes on each tap, so opening the same lead again works too.
  useEffect(() => {
    if (!openLeadId) return;
    let cancelled = false;
    setTab("chats");
    setSelectedId(openLeadId);
    // The caller already knows the lead's name and phone, so show the chat at once instead of letting the inbox list
    // flash while the full details load. The fetch below replaces this with the complete lead.
    if (openLeadName && openLeadPhone) {
      setPinnedLead((current) => current?.id === openLeadId ? current : { id: openLeadId, name: openLeadName, phone: openLeadPhone, created_at: new Date().toISOString() });
    }
    fetchLeadDetails(openLeadId)
      .then(({ lead }) => { if (!cancelled) setPinnedLead(lead); })
      .catch(() => {
        if (cancelled) return;
        setSelectedId("");
        Alert.alert("Couldn't open chat", "Could not load this lead's conversation.");
      });
    return () => { cancelled = true; };
  }, [openLeadId, openAt]);
  useEffect(() => { setContactInfoOpen(false); }, [selectedId]);
  // Picking a template targets one lead. Leaving that flow must forget the lead, or a later visit to Saved replies
  // would send a template straight to someone the person is no longer looking at.
  useEffect(() => { if (tab === "chats") setTemplateLeadId(""); }, [tab]);

  // The open chat is an in-page overlay (a Modal stops short of the bottom edge on some phones), so hide the tab bar and own the back button.
  useEffect(() => {
    const tabs = navigation.getParent();
    tabs?.setOptions({ tabBarStyle: selectedId ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { tabs?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [!!selectedId, navigation, insets.bottom]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { closeChat(); return true; });
    return () => sub.remove();
  }, [selectedId, openLeadId]);

  // A chat opened from a lead's details goes back to that lead; one opened from the inbox goes back to the list.
  function closeChat() {
    if (openLeadId && selectedId === openLeadId && router.canGoBack()) router.back();
    else setSelectedId("");
  }

  const inboxBusy = useRef(false);
  const chatBusy = useRef(false);
  const activeChatId = useRef("");
  // Ids of messages this phone just sent: a poll that started before the send must not make them vanish.
  const localSentIds = useRef(new Set<string>());

  async function refreshInbox() {
    if (inboxBusy.current) return;
    inboxBusy.current = true;
    try {
      setInbox(indexInbox(await fetchInbox()));
      setInboxFailed(false);
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
      const list = await fetchConversation(leadId, MAX_RENDERED_MESSAGES);
      conversationCache.set(leadId, list);
      // The person may have opened another chat while this one was loading - don't paint it over the new one.
      if (activeChatId.current !== leadId) return;
      // Keep messages still being sent so a poll doesn't make them vanish.
      setMessages((current) => {
        // Drop a pending copy once the server's list already contains that message, so it never shows twice.
        // A message sent while this poll was in flight is missing from `list` too, so it is kept until the server returns it.
        const pending = current.filter((item) => {
          if (list.some((saved) => saved.id === item.id)) { localSentIds.current.delete(item.id); return false; }
          if (localSentIds.current.has(item.id)) return true;
          return item.id.startsWith("pending-") && !list.some((saved) => (
            saved.direction === "outbound" && saved.message === item.message && new Date(saved.sent_at).getTime() >= new Date(item.sent_at).getTime() - 10000
          ));
        });
        if (!pending.length && sameMessages(current, list)) return current;
        return [...list, ...pending];
      });
    } catch {
      // Keep the current messages on a failed poll.
    } finally {
      chatBusy.current = false;
      if (activeChatId.current === leadId) setMessagesLoaded(true);
    }
  }

  // The open chat refreshes every 8s so customer replies show up without a manual refresh.
  // Polling stops while the app is in the background so it doesn't burn battery and data.
  useEffect(() => {
    activeChatId.current = selectedId;
    const cached = selectedId ? conversationCache.get(selectedId) : undefined;
    setMessages(cached ?? []);
    setMessagesLoaded(!!cached);
    // A half-typed message or open attach menu belongs to the previous chat and must not carry over to this one.
    setMessage("");
    setAttachOpen(false);
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

  // The lead list only holds the newest 80 leads; a customer who messaged from an older lead still has a chat and must show up.
  const allLeads = useMemo(() => {
    const known = new Set(leads.map((lead) => lead.id));
    const extra: LeadListItem[] = Object.values(inbox)
      .filter((item) => !known.has(item.lead_id) && item.lead_name)
      .map((item) => ({ id: item.lead_id, name: item.lead_name, phone: item.lead_phone, created_at: item.sent_at || new Date(0).toISOString() }));
    return extra.length ? [...leads, ...extra] : leads;
  }, [leads, inbox]);

  const filteredLeads = useMemo(() => {
    const text = search.trim().toLowerCase();
    return allLeads
      .filter((lead) => {
        if (filter === "unread" && !(inbox[lead.id]?.unread_count > 0)) return false;
        if (filter === "starred" && !starredIds.has(lead.id)) return false;
        if (!text) return true;
        return [lead.name, lead.phone, lead.stage, lead.source].some((value) => String(value || "").toLowerCase().includes(text));
      })
      // Newest conversation first, leads with no chat yet at the bottom.
      .sort((a, b) => new Date(inbox[b.id]?.sent_at || 0).getTime() - new Date(inbox[a.id]?.sent_at || 0).getTime());
  }, [filter, inbox, allLeads, search, starredIds]);

  const selected = selectedId ? (pinnedLead?.id === selectedId ? pinnedLead : undefined) ?? allLeads.find((lead) => lead.id === selectedId) : undefined;
  const selectedConversation = selectedId ? inbox[selectedId] : undefined;
  const templateLead = templateLeadId ? allLeads.find((lead) => lead.id === templateLeadId) : undefined;
  function categoryLabel(value?: string) {
    return (value || "general").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  const savedCategories = [{ key: "all", label: "All" }, ...Array.from(new Set(templates.map((item) => (item.category || "general").toLowerCase()))).map((key) => ({ key, label: categoryLabel(key) }))];
  const visibleSaved = templates.filter((item) => {
    if (savedCategory !== "all" && (item.category || "general").toLowerCase() !== savedCategory) return false;
    const text = savedSearch.trim().toLowerCase();
    return !text || item.name.toLowerCase().includes(text) || item.message.toLowerCase().includes(text);
  });
  const totalUnread = Object.values(inbox).filter((item) => item.unread_count > 0).length;
  const windowLeft = replyWindowLeftMs(messages);
  // Until the messages load, fall back to the lead's own flags so the composer doesn't flash locked.
  const canReply = messagesLoaded ? windowLeft > 0
    : selected?.is_24h_window_active !== undefined ? !!selected.is_24h_window_active : !!selected?.last_incoming_message;
  const manualMode = !!selectedConversation?.ai_paused;
  const composerEnabled = !!selected && canReply;
  // Until the messages (or the lead's own window flags) are known, don't claim the chat is locked.
  const windowKnown = messagesLoaded || selected?.is_24h_window_active !== undefined || selected?.last_incoming_message !== undefined;

  function toggleStar(id: string) {
    setStarredIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmDeleteChat(lead: LeadListItem) {
    Alert.alert("Delete chat?", `Delete the whole conversation with ${lead.name}? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteConversation(lead.id);
            conversationCache.delete(lead.id);
            setInbox((current) => {
              const { [lead.id]: _removed, ...rest } = current;
              return rest;
            });
            if (selectedId === lead.id) setSelectedId("");
            refreshInbox();
          } catch {
            Alert.alert("Couldn't delete", "Could not delete this chat. Please try again.");
          }
        },
      },
    ]);
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
    // Accept both {{name}} (what the Templates screen documents) and {name}.
    const fill = (text: string, key: string, value?: string) => (
      value ? text.replace(new RegExp(String.raw`\{\{\s*${key}\s*\}\}|\{\s*${key}\s*\}`, "gi"), () => value) : text
    );
    let text = fill(template.message, "name", lead.name);
    text = fill(text, "phone", lead.phone);
    text = fill(text, "email", lead.email);
    return fill(text, "source", lead.source);
  }

  function addSentMessage(leadId: string, sent: WhatsAppMessage) {
    localSentIds.current.add(sent.id);
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
    const templateLead = templateLeadId ? allLeads.find((lead) => lead.id === templateLeadId) : selected;
    if (!templateLead || template.unsupported) return;
    // Only the first variable (the lead's name) can be filled automatically; Meta rejects a blank value.
    if (template.variable_count > 1) {
      Alert.alert("Can't send this template here", `It has ${template.variable_count} variables and only the first can be filled in automatically. Send it from the web app instead.`);
      return;
    }
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
      setTemplateSheetOpen(false);
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
    const templateLead = templateLeadId ? allLeads.find((lead) => lead.id === templateLeadId) : undefined;
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
    setPickSearch("");
    setPickTemplate(template);
  }

  // Customer chosen for a saved reply: open their chat with the reply written in (still to be sent by hand).
  function chooseCustomerForReply(lead: LeadListItem) {
    if (!pickTemplate) return;
    const text = templateTextFor(pickTemplate, lead);
    setPickTemplate(null);
    setTab("chats");
    setSelectedId(lead.id);
    setMessage(text);
  }

  // Pick a photo, video or file, upload it to the lead and send it on WhatsApp (same flow as the web inbox).
  async function sendMedia(requested: "image" | "video" | "document" | "media") {
    setAttachOpen(false);
    if (!selected || sending) return;
    if (!canReply) {
      Alert.alert("Send a template first", "The 24-hour reply window is closed. Send an approved template and reply after they respond.");
      return;
    }
    let picked: DocumentPicker.DocumentPickerAsset | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: requested === "media" ? ["image/*", "video/*"] : requested === "image" ? "image/*" : requested === "video" ? "video/*" : "*/*",
        copyToCacheDirectory: true, multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      picked = result.assets[0];
    } catch {
      Alert.alert("Couldn't open files", "Please try again.");
      return;
    }
    if (picked.size && picked.size > MAX_ATTACHMENT_BYTES) {
      Alert.alert("File too large", "Files can be up to 5 MB.");
      return;
    }
    const kind: "image" | "video" | "document" = requested !== "media" ? requested : picked.mimeType?.startsWith("video") ? "video" : "image";
    const leadId = selected.id;
    const pendingId = `pending-${Date.now()}`;
    const pending: WhatsAppMessage = {
      id: pendingId, direction: "outbound", message: picked.name, sent_at: new Date().toISOString(), status: "sending",
      message_type: kind, media_url: picked.uri,
    };
    setMessages((current) => [...current, pending]);
    setSending(true);
    try {
      const uploaded = await uploadLeadAttachment(leadId, { uri: picked.uri, name: picked.name, mimeType: picked.mimeType });
      const result = await sendWhatsAppAttachment(leadId, uploaded.id);
      localSentIds.current.add(result.message.id);
      setMessages((current) => current.map((item) => (item.id === pendingId ? result.message : item)));
      refreshInbox();
      loadConversation(leadId);
      if (result.delivery?.success === false) Alert.alert("File not delivered", result.delivery.error || "WhatsApp rejected this file.");
      else notifyMessageSent(selected).catch(() => {});
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== pendingId));
      const detail = (sendError as { response?: { data?: { error?: string } } })?.response?.data?.error;
      Alert.alert("File not sent", detail || "Could not send this file. Please try again.");
    } finally {
      setSending(false);
    }
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
    // Show the message in the chat right away; swap in the saved one once the server confirms.
    const leadId = selected.id;
    const pendingId = `pending-${Date.now()}`;
    const pending: WhatsAppMessage = { id: pendingId, direction: "outbound", message: body, sent_at: new Date().toISOString(), status: "sending" };
    setMessages((current) => [...current, pending]);
    setMessage("");
    setSending(true);
    try {
      const result = await sendWhatsAppMessage(leadId, body);
      localSentIds.current.add(result.message.id);
      setMessages((current) => current.map((item) => (item.id === pendingId ? result.message : item)));
      refreshInbox();
      loadConversation(leadId);
      if (result.delivery?.success === false) {
        Alert.alert("Message not delivered", result.delivery.error || "WhatsApp rejected this message.");
      } else {
        notifyMessageSent(selected).catch(() => {});
      }
    } catch {
      setMessages((current) => current.filter((item) => item.id !== pendingId));
      setMessage(body);
      Alert.alert("Message not sent", "Could not send this message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>WhatsApp</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={load} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Refresh">
          <Ionicons name="refresh" size={20} color={UI.teal} />
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, tab === "chats" && styles.tabActive]} onPress={() => setTab("chats")} accessibilityRole="tab" accessibilityState={{ selected: tab === "chats" }}>
          <Text style={[styles.tabText, tab === "chats" && styles.tabTextActive]}>Chats</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "saved" && styles.tabActive]} onPress={() => setTab("saved")} accessibilityRole="tab" accessibilityState={{ selected: tab === "saved" }}>
          <Text style={[styles.tabText, tab === "saved" && styles.tabTextActive]}>Saved replies</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={UI.teal} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={load}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : tab === "saved" ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {templateLeadId && sendableTemplates.length ? (
            <Text style={styles.pickingHint}>Choose a template to send to {templateLead?.name || "this lead"}.</Text>
          ) : (
            <>
              <Searchbar value={savedSearch} onChangeText={setSavedSearch} placeholder="Search saved replies..." elevation={0} inputStyle={styles.searchInput} style={styles.searchBox} iconColor={UI.sub} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.filterRow}>
                {savedCategories.map((item) => {
                  const active = savedCategory === item.key;
                  return (
                    <Pressable key={item.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setSavedCategory(item.key)} accessibilityRole="button">
                      <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
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
                  <View style={styles.replyPill}><Text style={styles.replyPillText}>{template.language}</Text></View>
                </View>
                <Text style={styles.replyMessage} numberOfLines={3}>{templateLead ? previewSendableTemplate(template, templateLead) : template.body_text}</Text>
                {template.unsupported ? <Text style={styles.replyWarning}>{template.unsupported}</Text> : null}
                <Text style={styles.replySend}>{sendingTemplateId === key ? "Sending..." : "Send to a customer"}</Text>
              </Pressable>
            );
          }) : visibleSaved.length ? visibleSaved.map((template) => (
            <Pressable key={template.id} style={[styles.replyCard, sendingTemplateId === template.id && styles.replyCardDisabled]} onPress={() => useTemplate(template)} disabled={!!sendingTemplateId}>
              <View style={styles.replyTop}>
                <Text style={styles.replyName} numberOfLines={1}>{template.name}</Text>
                {template.category ? <View style={styles.replyPill}><Text style={styles.replyPillText}>{categoryLabel(template.category)}</Text></View> : null}
              </View>
              <Text style={styles.replyMessage} numberOfLines={3}>{template.message}</Text>
              <Text style={styles.replySend}>{sendingTemplateId === template.id ? "Sending..." : "Send to a customer"}</Text>
            </Pressable>
          )) : (
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubbles-outline" size={30} color={UI.muted} />
              <Text style={styles.emptyTitle}>{templates.length ? "No saved replies match" : "No saved replies yet"}</Text>
              <Text style={styles.emptyText}>{templates.length ? "Try another search or category." : "Create WhatsApp templates from Templates or WhatsApp Templates."}</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}><Text style={styles.heroIconText}>WA</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>WhatsApp Inbox</Text>
              <Text style={styles.heroSubtitle}>Manage and respond to customer conversations</Text>
            </View>
          </View>

          <View style={styles.conversationCard}>
            <Text style={styles.sectionTitle}>Conversations</Text>
            {inboxFailed ? (
              <Pressable onPress={load} style={styles.inboxWarning}>
                <Text style={styles.inboxWarningText}>Couldn't load your chats. Tap to retry.</Text>
              </Pressable>
            ) : null}
            <Searchbar value={search} onChangeText={setSearch} placeholder="Search conversations..." elevation={0} inputStyle={styles.searchInput} style={styles.searchBox} iconColor={UI.sub} />
            <View style={styles.filterRow}>
              {FILTERS.map((item) => {
                const active = filter === item.key;
                const count = item.key === "all" ? allLeads.length : item.key === "unread" ? totalUnread : starredIds.size;
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
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.leadName, unread && styles.leadNameUnread]} numberOfLines={1}>{lead.name}</Text>
                      <Text style={[styles.timeText, unread && styles.timeTextUnread]}>{relativeTime(conversation?.sent_at || undefined)}</Text>
                    </View>
                    <View style={styles.rowBottom}>
                      <Text style={[styles.previewText, !conversation?.message && styles.previewEmpty]} numberOfLines={1}>{previewFor(lead, conversation)}</Text>
                      {unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{conversation.unread_count}</Text></View> : null}
                      {conversation?.message ? (
                        <Pressable hitSlop={8} onPress={() => confirmDeleteChat(lead)} style={styles.deleteChatButton}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }) : (
              <Text style={styles.emptyText}>No conversations match this filter.</Text>
            )}
          </View>
        </ScrollView>
      )}

      {pickTemplate ? (
        <View style={styles.pickOverlay}>
          <View style={[styles.pickHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => setPickTemplate(null)} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={22} color={UI.ink} />
            </Pressable>
            <Text style={styles.pickTitle}>Send to which customer?</Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.pickPreview}>
              <Text style={styles.pickPreviewName}>{pickTemplate.name}</Text>
              <Text style={styles.pickPreviewText}>{pickTemplate.message}</Text>
            </View>
            <Text style={styles.pickLabel}>Choose a customer</Text>
            <Searchbar value={pickSearch} onChangeText={setPickSearch} placeholder="Search by name or number" elevation={0} inputStyle={styles.searchInput} style={styles.searchBox} iconColor={UI.sub} />
            <View style={{ marginTop: 6 }}>
              {allLeads.filter((lead) => {
                const text = pickSearch.trim().toLowerCase();
                return !text || lead.name.toLowerCase().includes(text) || String(lead.phone || "").toLowerCase().includes(text);
              }).slice(0, 40).map((lead) => (
                <Pressable key={lead.id} style={styles.pickRow} onPress={() => chooseCustomerForReply(lead)} accessibilityRole="button">
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials(lead.name)}</Text></View>
                  <View style={styles.rowBody}>
                    <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
                    <Text style={styles.previewText} numberOfLines={1}>{lead.phone}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <Modal visible={templateSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setTemplateSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !sendingTemplateId && setTemplateSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Ionicons name="layers-outline" size={20} color="#5b4fd6" />
              <Text style={styles.sheetTitle}>Send a template</Text>
              <Pressable onPress={() => setTemplateSheetOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={UI.ink} />
              </Pressable>
            </View>
            <Searchbar value={templateSheetSearch} onChangeText={setTemplateSheetSearch} placeholder="Search templates..." elevation={0} inputStyle={styles.searchInput} style={[styles.searchBox, { borderColor: "#b9d6ea" }]} iconColor={UI.sub} />
            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {sendableTemplates.filter((template) => {
                const text = templateSheetSearch.trim().toLowerCase();
                return !text || template.name.toLowerCase().includes(text) || template.body_text.toLowerCase().includes(text);
              }).map((template) => {
                const key = `${template.name}:${template.language}`;
                const sending = sendingTemplateId === key;
                return (
                  <Pressable
                    key={key} disabled={!!sendingTemplateId || !!template.unsupported} onPress={() => useSendableTemplate(template)}
                    style={[styles.sheetCard, sending && { borderColor: UI.teal, borderWidth: 2 }, (!!template.unsupported) && styles.replyCardDisabled]}
                    accessibilityRole="button"
                  >
                    <View style={styles.replyTop}>
                      <Text style={styles.sheetCardName} numberOfLines={1}>{template.name}</Text>
                      {template.category ? <Text style={styles.sheetCardCategory}>{categoryLabel(template.category)}</Text> : null}
                    </View>
                    <Text style={styles.replyMessage} numberOfLines={2}>{selected ? previewSendableTemplate(template, selected) : template.body_text}</Text>
                    {template.unsupported ? <Text style={styles.replyWarning}>{template.unsupported}</Text> : null}
                    {sending ? <Text style={styles.replySend}>Sending...</Text> : null}
                  </Pressable>
                );
              })}
              {!sendableTemplates.length ? <Text style={styles.emptyText}>No approved templates yet. Create them from WhatsApp Templates.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <View ref={chatOverlayRef} collapsable={false} style={selected ? styles.chatOverlay : styles.chatHidden}>
        {selected ? (
          <KeyboardAvoidingView style={[styles.chatScreen, { paddingBottom: keyboardHeight }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
              <Pressable onPress={closeChat} hitSlop={10} style={styles.chatBack} accessibilityRole="button" accessibilityLabel="Back">
                <Ionicons name="arrow-back" size={22} color={UI.ink} />
              </Pressable>
              <View style={styles.chatAvatar}>
                <Text style={styles.chatAvatarText}>{initials(selected.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatName} numberOfLines={1}>{selected.name}</Text>
                <Text style={styles.chatMeta} numberOfLines={1}>{selected.phone}</Text>
              </View>
              <Pressable hitSlop={8} style={styles.headerIcon} onPress={() => setContactInfoOpen((open) => !open)} accessibilityLabel="Contact info">
                <Ionicons name="information-circle-outline" size={22} color={UI.teal} />
              </Pressable>
              <Pressable hitSlop={8} style={styles.headerIcon} onPress={() => toggleStar(selected.id)} accessibilityLabel="Star chat">
                <Ionicons name={starredIds.has(selected.id) ? "star" : "star-outline"} size={20} color={starredIds.has(selected.id) ? colors.warning : UI.muted} />
              </Pressable>
            </View>

            <View style={styles.modeRow}>
              <View style={styles.modePill}><Text style={styles.modePillText}>{manualMode ? "Human took over" : "AI is replying"}</Text></View>
              <Pressable onPress={() => toggleTakeOver(selected.id)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.modeLink}>{manualMode ? "Resume" : "Take over"}</Text>
              </Pressable>
            </View>

            {contactInfoOpen ? (
              <View style={[styles.headerInfoPopover, { top: insets.top + 64 }]}>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Name</Text><Text style={styles.infoValue}>{selected.name}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone number</Text><Text style={styles.infoValue}>{selected.phone}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>First message</Text><Text style={styles.infoValue}>{messages.length && messages.length < MAX_RENDERED_MESSAGES ? formatDate(messages[0].sent_at) : "-"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Last message</Text><Text style={styles.infoValue}>{selectedConversation?.sent_at ? relativeTime(selectedConversation.sent_at) : "-"}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Total messages</Text><Text style={styles.infoValue}>{Math.max(messages.length, selected.total_messages || 0)}</Text></View>
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

            <View style={[styles.composer, { paddingBottom: keyboardHeight ? 10 : Math.max(insets.bottom, 10) }]}>
              {canReply && windowLeft > 0 ? <Text style={styles.windowText}>Reply window open · {windowText(windowLeft)} left</Text> : null}
              {!canReply && windowKnown ? (
                <View style={styles.templatePrompt}>
                  <View style={styles.templatePromptIcon}><Ionicons name="lock-closed" size={16} color="#ea580c" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templatePromptText}>Conversation not started</Text>
                    <Text style={styles.templatePromptHint}>Send an approved template to start chatting.</Text>
                  </View>
                  <Pressable style={styles.templateButton} onPress={() => { setTemplateSheetSearch(""); setTemplateSheetOpen(true); }}>
                    <Ionicons name="layers-outline" size={16} color="#fff" />
                    <Text style={styles.templateButtonText}>Template</Text>
                  </Pressable>
                </View>
              ) : quickOpen && templates.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quickReplies}>
                  {templates.map((template) => (
                    <Pressable key={template.id} style={styles.quickChip} onPress={() => { setMessage(templateTextFor(template, selected)); setQuickOpen(false); }}>
                      <Ionicons name="flash-outline" size={13} color={UI.teal} />
                      <Text style={styles.quickChipText} numberOfLines={1}>{template.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.composerBoxWrap}>
                {attachOpen && composerEnabled ? (
                  <View style={styles.attachPopup}>
                    {([
                      { kind: "document", label: "Document", icon: "document-outline", color: "#4f46e5" },
                      { kind: "media", label: "Photos & videos", icon: "image-outline", color: "#2563eb" },
                    ] as const).map((option) => (
                      <Pressable key={option.kind} style={styles.attachRow} onPress={() => sendMedia(option.kind)} accessibilityRole="button">
                        <Ionicons name={option.icon} size={18} color={option.color} />
                        <Text style={styles.attachRowText}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={[styles.composerBox, !composerEnabled && styles.composerBoxDisabled]}>
                  <RNTextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder={canReply || !windowKnown ? "Type a message..." : "Waiting for customer message"}
                    placeholderTextColor={UI.muted}
                    style={styles.composerInput}
                    editable={composerEnabled}
                    multiline
                  />
                  <View style={styles.composerIcons}>
                    <Pressable onPress={() => setQuickOpen((open) => !open)} disabled={!composerEnabled || !templates.length} hitSlop={8} style={(!composerEnabled || !templates.length) && { opacity: 0.4 }} accessibilityRole="button" accessibilityLabel="Saved replies">
                      <Ionicons name="flash-outline" size={20} color={quickOpen ? UI.teal : UI.sub} />
                    </Pressable>
                    <Pressable onPress={() => { setTemplateSheetSearch(""); setTemplateSheetOpen(true); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Send a template">
                      <Ionicons name="layers-outline" size={20} color={UI.sub} />
                    </Pressable>
                    <Pressable onPress={() => setAttachOpen((open) => !open)} disabled={!composerEnabled || sending} hitSlop={8} style={(!composerEnabled || sending) && { opacity: 0.4 }} accessibilityRole="button" accessibilityLabel="Attach a file">
                      <Ionicons name="attach-outline" size={22} color={attachOpen ? UI.teal : UI.sub} />
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={sendMessage} disabled={!composerEnabled || !message.trim() || sending} style={[styles.sendButton, (!composerEnabled || !message.trim() || sending) && styles.sendButtonOff]} accessibilityRole="button" accessibilityLabel="Send">
                      {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  errorText: { color: colors.danger, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  retryButton: { marginTop: 14, backgroundColor: UI.teal, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", marginHorizontal: 16, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: UI.line },
  tab: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  tabActive: { borderBottomColor: UI.teal },
  tabText: { color: UI.sub, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: UI.teal, fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 16 },
  heroCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 14 },
  heroIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: UI.greenSoft, alignItems: "center", justifyContent: "center" },
  heroIconText: { color: UI.green, fontSize: 13, fontFamily: "Inter_700Bold" },
  heroTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  heroSubtitle: { color: UI.sub, fontSize: 11, marginTop: 2 },
  conversationCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 14, padding: 14, marginBottom: 14 },
  sectionTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold", marginBottom: 10 },
  searchBox: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: UI.line, height: 44 },
  searchInput: { fontSize: 13, minHeight: 42 },
  inboxWarning: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginBottom: 10 },
  inboxWarningText: { color: colors.danger, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  deleteChatButton: { padding: 6, marginLeft: 4 },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 8, alignItems: "center" },
  categoryScroll: { flexGrow: 0 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "transparent" },
  filterChipActive: { backgroundColor: UI.teal },
  filterText: { color: UI.ink, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterTextActive: { color: "#fff" },
  conversationRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  conversationRowActive: { backgroundColor: "#eef5fa" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#d7e9f5", alignItems: "center", justifyContent: "center" },
  avatarUnread: { backgroundColor: "#d7e9f5" },
  avatarText: { color: UI.teal, fontSize: 13, fontFamily: "Inter_700Bold" },
  rowBody: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: UI.line, paddingBottom: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  leadName: { flex: 1, color: UI.ink, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  leadNameUnread: { fontFamily: "Inter_700Bold" },
  timeText: { color: UI.muted, fontSize: 11 },
  timeTextUnread: { color: UI.green },
  previewText: { flex: 1, color: UI.sub, fontSize: 12 },
  previewEmpty: { fontStyle: "italic", color: colors.textMuted },
  mediaImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 6 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  docText: { flex: 1, color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyChat: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyChatText: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  unreadBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: UI.green, alignItems: "center", justifyContent: "center" },
  unreadText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  chatOverlay: { ...StyleSheet.absoluteFill, zIndex: 50, elevation: 50, backgroundColor: "#ffffff" },
  chatHidden: { display: "none" },
  chatScreen: { flex: 1, backgroundColor: "#ffffff" },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10, backgroundColor: "#ffffff" },
  chatBack: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  chatAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#d7e9f5", alignItems: "center", justifyContent: "center" },
  chatAvatarText: { color: UI.teal, fontSize: 13, fontFamily: "Inter_700Bold" },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: UI.line, backgroundColor: "#ffffff" },
  modePill: { backgroundColor: UI.tealSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  modePillText: { color: UI.ink, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  modeLink: { color: UI.teal, fontSize: 12, fontFamily: "Inter_700Bold" },
  windowText: { color: UI.sub, fontSize: 11, textAlign: "center" },
  composerBoxWrap: { position: "relative" },
  composerBox: { backgroundColor: "#f3f8fc", borderWidth: 1, borderColor: "#cfe3f1", borderRadius: 16, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  composerBoxDisabled: { backgroundColor: "#f1f5f9" },
  composerInput: { color: UI.ink, fontSize: 13, lineHeight: 19, minHeight: 44, maxHeight: 120, paddingVertical: 8, textAlignVertical: "top" },
  composerIcons: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 4 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.green, alignItems: "center", justifyContent: "center" },
  sendButtonOff: { backgroundColor: "#b6c2cc" },
  attachPopup: { position: "absolute", right: 8, bottom: "100%", marginBottom: 8, minWidth: 190, paddingVertical: 6, borderRadius: 14, backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8, zIndex: 20 },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  attachRowText: { color: UI.ink, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pickOverlay: { ...StyleSheet.absoluteFill, zIndex: 60, elevation: 60, backgroundColor: UI.bg },
  pickHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  pickTitle: { color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  pickPreview: { backgroundColor: "#d8f0e5", borderWidth: 1, borderColor: "#b7e0cb", borderRadius: 14, padding: 14, marginBottom: 18 },
  pickPreviewName: { color: UI.sub, fontSize: 10, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  pickPreviewText: { color: UI.ink, fontSize: 13, lineHeight: 19 },
  pickLabel: { color: UI.sub, fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 18, maxHeight: "86%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sheetTitle: { flex: 1, color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  sheetList: { marginTop: 12, flexGrow: 0 },
  sheetCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cfe3f1", borderRadius: 12, padding: 12, marginBottom: 10 },
  sheetCardName: { flex: 1, color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold" },
  sheetCardCategory: { color: UI.sub, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  headerIcon: { width: 28, alignItems: "center", justifyContent: "center" },
  chatBody: { flex: 1, backgroundColor: "#edf2f0", marginHorizontal: 0 },
  chatContent: { padding: 16, paddingBottom: 24 },
  chatName: { color: UI.ink, fontSize: 14, fontFamily: "Inter_700Bold" },
  chatMeta: { color: UI.green, fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 1 },
  dayPill: { alignSelf: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginVertical: 12 },
  dayPillText: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  messageBubbleIn: { alignSelf: "flex-start", maxWidth: "82%", backgroundColor: "#ffffff", borderRadius: 12, padding: 11, marginBottom: 8 },
  messageBubbleOut: { alignSelf: "flex-end", maxWidth: "82%", backgroundColor: "#d9f7e6", borderRadius: 12, padding: 11, marginBottom: 8 },
  sentMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  messageText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  messageTime: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  composer: { gap: 8, paddingHorizontal: 14, paddingTop: 10, backgroundColor: "#ffffff" },
  quickReplies: { gap: 8, paddingRight: 8 },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 180, backgroundColor: UI.tealSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  quickChipText: { color: UI.teal, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  inputPill: { flex: 1, minHeight: 48, maxHeight: 120, justifyContent: "center", backgroundColor: "#f4f9fc", borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  attachButton: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  attachMenu: { flexDirection: "row", gap: 22, paddingHorizontal: 8, paddingVertical: 6 },
  attachOption: { alignItems: "center", gap: 6 },
  attachIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  attachLabel: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  inputPillDisabled: { backgroundColor: "#f1f5f9" },
  inputText: { color: colors.text, fontSize: 14, paddingVertical: 10 },
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
  templateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: UI.teal, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  templateButtonText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  replyCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  pickingHint: { color: UI.sub, fontSize: 12, marginBottom: 12 },
  replyPill: { backgroundColor: UI.tealSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  replyPillText: { color: UI.teal, fontSize: 10, fontFamily: "Inter_700Bold" },
  replySend: { color: UI.green, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 10 },
  replyCardDisabled: { opacity: 0.65 },
  replyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  replyName: { flex: 1, color: UI.ink, fontSize: 14, fontFamily: "Inter_700Bold" },
  replyCount: { color: colors.textMuted, fontSize: 11 },
  replyMessage: { color: UI.sub, fontSize: 12, lineHeight: 18, marginTop: 8 },
  replyWarning: { color: colors.warning, fontSize: 11, marginTop: 6, fontFamily: "Inter_600SemiBold" },
  emptyCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 14, alignItems: "center", padding: 30, marginTop: 20 },
  emptyTitle: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 },
});
