import React, { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, IconButton, Searchbar, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { GlassBackground, glass } from "@/components/Glass";
import { fetchLeads, LeadListItem, trackContactActivity } from "@/api/leads";
import { fetchTemplates, MessageTemplate } from "@/api/templates";

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
  if (lead.next_followup_at) return `Follow-up due ${formatDate(lead.next_followup_at)}`;
  if (lead.stage) return `${lead.name}, great to hear! Stage: ${lead.stage}`;
  return `${lead.name}, great to hear! How many brochures should I send?`;
}

export default function WhatsAppScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("chats");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [leadPage, savedTemplates] = await Promise.all([
        fetchLeads({ limit: 80 }),
        fetchTemplates().catch(() => []),
      ]);
      setLeads(leadPage.leads);
      setTemplates(savedTemplates.filter((item) => item.channel === "whatsapp"));
      setSelectedId((current) => current || leadPage.leads[0]?.id || "");
    } catch {
      setError("Could not load WhatsApp inbox.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredLeads = useMemo(() => {
    const text = search.trim().toLowerCase();
    return leads.filter((lead, index) => {
      if (filter === "unread" && index % 5 !== 0) return false;
      if (filter === "starred" && !starredIds.has(lead.id)) return false;
      if (!text) return true;
      return [lead.name, lead.phone, lead.stage, lead.source].some((value) => String(value || "").toLowerCase().includes(text));
    });
  }, [filter, leads, search, starredIds]);

  const selected = leads.find((lead) => lead.id === selectedId) || filteredLeads[0] || leads[0];
  const totalUnread = leads.filter((_, index) => index % 5 === 0).length;

  function toggleStar(id: string) {
    setStarredIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function useTemplate(template: MessageTemplate) {
    setTab("chats");
    setMessage(template.message);
  }

  async function sendMessage() {
    if (!selected) return;
    const body = message.trim();
    if (!body) {
      Alert.alert("Add message", "Type a message or choose a saved reply.");
      return;
    }
    trackContactActivity(selected.id, "whatsapp").catch(() => {});
    const phone = selected.phone.replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() => Alert.alert("Could not open WhatsApp", "Please check this device has WhatsApp installed."));
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
          {templates.length ? templates.map((template) => (
            <Pressable key={template.id} style={styles.replyCard} onPress={() => useTemplate(template)}>
              <View style={styles.replyTop}>
                <Text style={styles.replyName} numberOfLines={1}>{template.name}</Text>
                <Text style={styles.replyCount}>{template.use_count || 0} uses</Text>
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

          {selected ? (
            <View style={styles.chatCard}>
              <View style={styles.chatHeader}>
                <View style={[styles.avatar, styles.avatarUnread]}><Text style={styles.avatarText}>{initials(selected.name)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chatName}>{selected.name}</Text>
                  <Text style={styles.chatMeta}>{selected.phone} - Last message {relativeTime(selected.created_at)}</Text>
                </View>
                <IconButton icon={starredIds.has(selected.id) ? "star" : "star-outline"} size={20} iconColor={starredIds.has(selected.id) ? colors.warning : colors.textMuted} onPress={() => toggleStar(selected.id)} />
              </View>

              <View style={styles.dayPill}><Text style={styles.dayPillText}>Today</Text></View>
              <View style={styles.messageBubbleIn}>
                <Text style={styles.messageText}>Hello! Can I get more info on this?</Text>
                <Text style={styles.messageTime}>02:25 pm</Text>
              </View>
              <View style={styles.messageBubbleOut}>
                <Text style={styles.messageText}>Hi {selected.name.split(" ")[0]}! Salonox helps salons, spas and beauty parlours manage everything from appointments to follow-ups.</Text>
              </View>

              <View style={styles.composer}>
                <TextInput value={message} onChangeText={setMessage} mode="outlined" placeholder="Type a message..." style={styles.messageInput} outlineStyle={styles.messageInputOutline} />
                <Pressable style={styles.sendButton} onPress={sendMessage}>
                  <Ionicons name="send" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          ) : null}

          {selected ? (
            <View style={styles.aboutCard}>
              <Pressable style={styles.viewContactButton} onPress={() => router.push(`/(app)/leads/${selected.id}`)}>
                <Ionicons name="person-circle-outline" size={15} color={colors.primary} />
                <Text style={styles.viewContactText}>View Contact</Text>
              </Pressable>
              <Text style={styles.aboutTitle}>ABOUT</Text>
              <View style={styles.aboutRow}><Text style={styles.aboutLabel}>First Message</Text><Text style={styles.aboutValue}>{formatDate(selected.created_at)}</Text></View>
              <View style={styles.aboutRow}><Text style={styles.aboutLabel}>Last Message</Text><Text style={styles.aboutValue}>{relativeTime(selected.created_at)}</Text></View>
              <View style={styles.aboutRow}><Text style={styles.aboutLabel}>Total Messages</Text><Text style={styles.aboutValue}>3</Text></View>
              <View style={styles.aboutRow}><Text style={styles.aboutLabel}>Status</Text><Text style={styles.statusPill}>Active</Text></View>
              <Text style={styles.aboutTitle}>LABELS</Text>
              <Text style={styles.addLabel}>+ Add Label</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
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
  chatCard: { ...glass, padding: 14, marginBottom: 14 },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  chatName: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  chatMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  dayPill: { alignSelf: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginVertical: 12 },
  dayPillText: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  messageBubbleIn: { alignSelf: "flex-start", maxWidth: "82%", backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 10 },
  messageBubbleOut: { alignSelf: "flex-end", maxWidth: "82%", backgroundColor: "#dcfce7", borderRadius: 14, padding: 12, marginBottom: 12 },
  messageText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  messageTime: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  composer: { flexDirection: "row", alignItems: "center", gap: 8 },
  messageInput: { flex: 1, backgroundColor: colors.surface, minHeight: 44 },
  messageInputOutline: { borderRadius: 14, borderColor: colors.borderSoft },
  sendButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  aboutCard: { ...glass, padding: 14, marginBottom: 14 },
  viewContactButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, marginBottom: 14, backgroundColor: "rgba(255,255,255,0.75)" },
  viewContactText: { color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" },
  aboutTitle: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 6, marginBottom: 8 },
  aboutRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  aboutLabel: { color: colors.textMuted, fontSize: 12 },
  aboutValue: { color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statusPill: { color: colors.success, fontSize: 11, fontFamily: "Inter_700Bold", backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  addLabel: { color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" },
  replyCard: { ...glass, padding: 14, marginBottom: 12 },
  replyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  replyName: { flex: 1, color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  replyCount: { color: colors.textMuted, fontSize: 11 },
  replyMessage: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
  emptyCard: { ...glass, alignItems: "center", padding: 30, marginTop: 20 },
  emptyTitle: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 },
});
