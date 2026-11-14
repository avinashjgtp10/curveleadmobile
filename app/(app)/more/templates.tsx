import React, { useEffect, useRef, useState } from "react";
import {
  Alert, BackHandler, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInput as RNTextInput, View, useWindowDimensions,
} from "react-native";
import { ActivityIndicator, Button, Chip, HelperText, List, Searchbar, Text } from "react-native-paper";
import axios from "axios";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import {
  createTemplate, deleteTemplate, fetchTemplates, MessageTemplate, sendTemplate,
  TemplateChannel, updateTemplate,
} from "@/api/templates";
import { fetchLeads, LeadListItem } from "@/api/leads";

const CHANNELS: { key: TemplateChannel; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp", color: "#0B8464" },
  { key: "sms", label: "SMS", icon: "chatbubble-outline", color: "#A01439" },
  { key: "email", label: "Email", icon: "mail-outline", color: "#1D61E7" },
];

function relativeTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

// The list screen: pale lavender page, white cards with soft borders, indigo actions.
const LIST = { bg: "#f4f5fb", line: "#dfe2f0", ink: "#14172e", sub: "#5b6280", muted: "#8b91ab", accent: "#4b45e0", accentSoft: "#e8e9fb", track: "#e8eaf4", chip: "#eceef6", red: "#b3173a", redSoft: "#fde3e8" };

// Shows {name}-style variables as small highlighted tokens inside the message preview.
function MessagePreview({ text }: { text: string }) {
  const parts = text.split(/(\{\{\w+\}\}|\{\w+\})/g);
  return (
    <Text style={styles.cardMessage} numberOfLines={2}>
      {parts.map((part, index) => /^\{\{?\w+\}?\}$/.test(part)
        ? <Text key={index} style={styles.variable}>{` ${part.replace(/^\{\{/, "{").replace(/\}\}$/, "}")} `}</Text>
        : part)}
    </Text>
  );
}

// The add-lead form palette: pale blue page, white fields with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", red: "#d6334f" };

function LabeledInput({ label, required, value, onChangeText, placeholder, error, helperText, multiline, numberOfLines, ...inputProps }: {
  label: string; required?: boolean; value: string; onChangeText: (value: string) => void; placeholder?: string;
  error?: boolean; helperText?: string; multiline?: boolean; numberOfLines?: number;
} & Omit<React.ComponentProps<typeof RNTextInput>, "value" | "onChangeText" | "placeholder" | "multiline" | "numberOfLines" | "style">) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <View style={[styles.inputBox, multiline && styles.inputBoxMultiline, error && styles.inputError]}>
        <RNTextInput
          style={[styles.inputBoxText, multiline && styles.inputBoxTextMultiline]}
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={UI.muted}
          multiline={multiline} numberOfLines={numberOfLines} textAlignVertical={multiline ? "top" : "center"}
          {...inputProps}
        />
      </View>
      {helperText ? <HelperText type="error" visible={!!error}>{helperText}</HelperText> : null}
    </>
  );
}

export default function TemplatesScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [channel, setChannel] = useState<TemplateChannel>("whatsapp");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; message?: string }>({});

  const [sendOpen, setSendOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<MessageTemplate | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItem[]>([]);
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [channelFilter, setChannelFilter] = useState<"all" | TemplateChannel>("all");
  const [listQuery, setListQuery] = useState("");

  // `silent` refreshes the list in place (after save/delete/send) so the list keeps its scroll position.
  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try { setTemplates(await fetchTemplates()); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load templates.")); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const parent = navigation.getParent();
    const hideBar = editOpen || sendOpen;
    parent?.setOptions({ tabBarStyle: hideBar ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [editOpen, sendOpen, navigation, insets.bottom]);

  // The edit and send panels are overlays, so the system back button should close them instead of leaving the screen.
  useEffect(() => {
    if (!editOpen && !sendOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (saving || sending) return true;
      setEditOpen(false); setSendOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [editOpen, sendOpen, saving, sending]);

  useEffect(() => {
    if (!sendOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchError("");
    if (!leadQuery.trim()) { setLeadResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { leads } = await fetchLeads({ search: leadQuery.trim(), limit: 6 });
        // A slower response for an older query must not replace the results of the current one.
        if (!cancelled) setLeadResults(leads);
      } catch (searchFailure) {
        if (!cancelled) { setLeadResults([]); setSearchError(errorMessage(searchFailure, "Could not search leads.")); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery, sendOpen]);

  // The Content Library's "New" shortcut opens the creator straight away.
  const { action } = useLocalSearchParams<{ action?: string }>();
  useEffect(() => { if (action === "new") { router.setParams({ action: undefined }); openCreate(); } }, [action]);

  function openCreate() {
    setEditing(null); setName(""); setCategory(""); setChannel("whatsapp"); setMessage(""); setFormError(""); setFieldErrors({});
    setEditOpen(true);
  }

  function openEdit(template: MessageTemplate) {
    setEditing(template); setName(template.name); setCategory(template.category); setChannel(template.channel); setMessage(template.message); setFormError(""); setFieldErrors({});
    setEditOpen(true);
  }

  function errorFor(field: "name" | "message"): string | undefined {
    if (field === "name") return !name.trim() ? "Enter a template name" : undefined;
    return !message.trim() ? "Enter a message" : undefined;
  }

  function validateField(field: "name" | "message") {
    setFieldErrors((current) => ({ ...current, [field]: errorFor(field) }));
  }

  function validate() {
    const next = { name: errorFor("name"), message: errorFor("message") };
    setFieldErrors(next);
    return !next.name && !next.message;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true); setFormError("");
    try {
      const input = { name: name.trim(), category: category.trim() || "general", channel, message: message.trim() };
      if (editing) await updateTemplate(editing.id, input);
      else await createTemplate(input);
      setEditOpen(false);
      load(true);
    } catch (saveError) {
      setFormError(errorMessage(saveError, "Could not save this template."));
    } finally { setSaving(false); }
  }

  function confirmDelete(template: MessageTemplate) {
    Alert.alert("Delete template?", `"${template.name}" will be removed for your whole team.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteTemplate(template.id); load(true); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  function openSend(template: MessageTemplate) {
    setSendTarget(template); setLeadQuery(""); setLeadResults([]); setSearchError(""); setSendOpen(true);
  }

  async function sendTo(lead: LeadListItem) {
    if (!sendTarget) return;
    setSending(true);
    try {
      const result = await sendTemplate(sendTarget.id, lead.id);
      setSendOpen(false);
      if (result.whatsappUrl) {
        Linking.openURL(result.whatsappUrl).catch(() => {
          Alert.alert("Couldn't open WhatsApp", "Make sure WhatsApp is installed. You can share the message instead.", [
            { text: "Cancel", style: "cancel" },
            { text: "Share", onPress: () => { Share.share({ message: result.message }); } },
          ]);
        });
      } else {
        Alert.alert("Message ready", result.message, [
          { text: "Close", style: "cancel" },
          { text: "Share", onPress: () => { Share.share({ message: result.message }); } },
        ]);
      }
      load(true);
    } catch (sendError) {
      Alert.alert("Couldn't prepare this message", errorMessage(sendError, "Please try again."));
    } finally { setSending(false); }
  }

  const needle = listQuery.trim().toLowerCase();
  const visibleTemplates = templates.filter((item) =>
    (channelFilter === "all" || item.channel === channelFilter)
    && (!needle || item.name.toLowerCase().includes(needle) || (item.message || "").toLowerCase().includes(needle) || (item.category || "").toLowerCase().includes(needle)));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={LIST.ink} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Templates</Text>
        <Pressable onPress={openCreate} style={[styles.headerButton, styles.headerAdd]} accessibilityRole="button" accessibilityLabel="New template"><Ionicons name="add" size={22} color="#ffffff" /></Pressable>
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={LIST.accent} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" buttonColor={LIST.accent} onPress={() => load()} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={LIST.accent} colors={[LIST.accent]} />}
        >
          <View style={styles.segmented}>
            {[{ key: "all" as const, label: "All" }, ...CHANNELS.map((item) => ({ key: item.key, label: item.label }))].map((item) => {
              const active = channelFilter === item.key;
              return (
                <Pressable key={item.key} onPress={() => setChannelFilter(item.key)} style={[styles.segOption, active && styles.segOptionActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                  <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={LIST.sub} />
            <RNTextInput value={listQuery} onChangeText={setListQuery} placeholder="Search templates" placeholderTextColor={LIST.muted} style={styles.listSearchInput} />
            {listQuery ? <Pressable onPress={() => setListQuery("")} hitSlop={8}><Ionicons name="close-circle" size={16} color={LIST.muted} /></Pressable> : null}
          </View>

          {visibleTemplates.length ? visibleTemplates.map((template) => {
            const channel = CHANNELS.find((item) => item.key === template.channel) || CHANNELS[0];
            return (
              <Pressable key={template.id} style={styles.card} onPress={() => openEdit(template)}>
                <View style={styles.cardTags}>
                  <View style={[styles.channelTag, { backgroundColor: `${channel.color}1A` }]}>
                    <Ionicons name={channel.icon} size={12} color={channel.color} />
                    <Text style={[styles.channelTagText, { color: channel.color }]}>{channel.label}</Text>
                  </View>
                  {template.category ? <Text style={styles.categoryTag} numberOfLines={1}>{template.category}</Text> : null}
                </View>
                <Text style={styles.cardName} numberOfLines={1}>{template.name}</Text>
                <MessagePreview text={template.message} />
                <View style={styles.cardFooter}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardMeta}>Used {template.use_count || 0} times</Text>
                    <Text style={styles.cardMeta}>Updated {relativeTime(template.updated_at)}</Text>
                  </View>
                  <Pressable style={styles.sendButton} onPress={() => openSend(template)} accessibilityRole="button" accessibilityLabel={`Send ${template.name}`}>
                    <Ionicons name="paper-plane-outline" size={15} color={LIST.accent} />
                    <Text style={styles.sendText}>Send</Text>
                  </Pressable>
                  <Pressable style={styles.deleteButton} onPress={() => confirmDelete(template)} accessibilityRole="button" accessibilityLabel={`Delete ${template.name}`}>
                    <Ionicons name="trash-outline" size={16} color={LIST.red} />
                  </Pressable>
                </View>
              </Pressable>
            );
          }) : templates.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No templates match</Text>
              <Button mode="outlined" onPress={() => { setChannelFilter("all"); setListQuery(""); }} style={styles.emptyButton}>Clear filters</Button>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={30} color={LIST.accent} /></View>
              <Text style={styles.emptyTitle}>No Templates Available</Text>
              <Button mode="outlined" onPress={openCreate} style={styles.emptyButton}>Tap to create your first template</Button>
            </View>
          )}
        </ScrollView>
      )}

      {editOpen ? (
        <Pressable style={styles.sheetBackdrop} onPress={() => !saving && setEditOpen(false)}>
          <Pressable style={[styles.sheet, styles.fullSheet, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Pressable onPress={() => !saving && setEditOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.sheetBackButton}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>
              <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>{editing ? "Edit Template" : "New Template"}</Text>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            >
              {formError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{formError}</Text></View> : null}

              <LabeledInput
                label="Name" required value={name} onChangeText={setName} placeholder="e.g. First Follow-up"
                onBlur={() => validateField("name")} error={!!fieldErrors.name} helperText={fieldErrors.name}
              />
              <LabeledInput label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Follow-up, Greeting, Offer" />

              <Text style={styles.sheetSectionLabel}>Channel</Text>
              <View style={styles.chipRow}>
                {CHANNELS.map((item) => (
                  <Chip
                    key={item.key} selected={channel === item.key} onPress={() => setChannel(item.key)}
                    mode={channel === item.key ? "flat" : "outlined"}
                    showSelectedCheck={false}
                    style={[styles.channelChip, channel === item.key && styles.channelChipActive]}
                    textStyle={{ color: channel === item.key ? UI.teal : UI.sub, fontWeight: channel === item.key ? "800" : "600" }}
                    // Paper's Chip expects Material icon names, so draw the Ionicons glyph ourselves (the names showed as "?").
                    icon={({ size }) => <Ionicons name={item.icon} size={size} color={channel === item.key ? UI.teal : UI.sub} />}
                  >
                    {item.label}
                  </Chip>
                ))}
              </View>

              <LabeledInput
                label="Message" required value={message} onChangeText={setMessage} placeholder="Hi {{name}}, ..."
                multiline numberOfLines={4} onBlur={() => validateField("message")} error={!!fieldErrors.message} helperText={fieldErrors.message}
              />
              <Text style={styles.hint}>Use {"{{name}}"}, {"{{phone}}"}, {"{{email}}"}, {"{{city}}"} or {"{{source}}"} — filled in automatically when you send.</Text>
            </ScrollView>
            <Button mode="contained" buttonColor={UI.teal} onPress={save} loading={saving} disabled={saving} style={styles.sheetPrimaryButton} contentStyle={styles.sheetPrimaryButtonContent}>Save</Button>
          </Pressable>
        </Pressable>
      ) : null}

      {sendOpen ? (
        <Pressable style={styles.sheetBackdrop} onPress={() => !sending && setSendOpen(false)}>
          <Pressable style={[styles.sheet, styles.fullSheet, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Send &quot;{sendTarget?.name}&quot;</Text>
            <Searchbar
              value={leadQuery} onChangeText={setLeadQuery} placeholder="Search & Select Lead"
              autoFocus elevation={0} style={styles.searchInput}
            />
            {sending || searching ? <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 14 }} /> : searchError ? (
              <Text style={styles.searchMessageError}>{searchError}</Text>
            ) : leadResults.length ? (
              <View style={styles.suggestions}>
                {leadResults.map((lead) => (
                  <List.Item key={lead.id} title={lead.name} titleNumberOfLines={1} description={lead.phone} onPress={() => sendTo(lead)} />
                ))}
              </View>
            ) : leadQuery.trim() ? (
              <Text style={styles.searchMessage}>No leads found for &quot;{leadQuery.trim()}&quot;.</Text>
            ) : null}
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: LIST.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: LIST.bg },
  headerButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: LIST.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  headerAdd: { backgroundColor: LIST.accent, borderColor: LIST.accent },
  headerTitle: { flex: 1, color: LIST.ink, fontSize: 24, fontWeight: "800" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  errorText: { color: LIST.red, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 14 },
  content: { paddingHorizontal: 14, paddingTop: 2, gap: 10 },
  segmented: { flexDirection: "row", backgroundColor: LIST.track, borderRadius: 12, padding: 3 },
  segOption: { flex: 1, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  segOptionActive: { backgroundColor: "#ffffff" },
  segText: { color: LIST.sub, fontSize: 12, fontWeight: "600" },
  segTextActive: { color: LIST.ink, fontWeight: "800" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: LIST.line, backgroundColor: "#ffffff" },
  listSearchInput: { flex: 1, color: LIST.ink, fontSize: 13, paddingVertical: 0 },

  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: LIST.line, padding: 12 },
  cardTags: { flexDirection: "row", alignItems: "center", gap: 8 },
  channelTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  channelTagText: { fontSize: 11, fontWeight: "800" },
  categoryTag: { flexShrink: 1, overflow: "hidden", backgroundColor: LIST.chip, color: LIST.sub, fontSize: 10, fontWeight: "800", textTransform: "uppercase", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cardName: { color: LIST.ink, fontSize: 15, fontWeight: "800", marginTop: 8 },
  cardMessage: { color: LIST.sub, fontSize: 12, lineHeight: 18, marginTop: 4 },
  variable: { backgroundColor: LIST.accentSoft, color: "#3a35b8", fontWeight: "800" },
  cardMeta: { color: LIST.sub, fontSize: 11, lineHeight: 16 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  sendButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 36, paddingHorizontal: 16, borderRadius: 12, backgroundColor: LIST.accentSoft },
  sendText: { color: LIST.accent, fontSize: 13, fontWeight: "800" },
  deleteButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: LIST.redSoft, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: LIST.accentSoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 14 },
  emptyButton: { marginTop: 12 },

  sheetBackdrop: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: UI.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  fullSheet: { flex: 1 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: UI.line, marginBottom: 14 },
  sheetTitle: { color: UI.ink, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  sheetHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  sheetBackButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  sheetSectionLabel: { color: UI.ink, fontSize: 13, fontWeight: "800", marginTop: 14, marginBottom: 8 },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 6, borderRadius: 8, backgroundColor: colors.dangerSoft },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  fieldLabel: { color: UI.ink, fontSize: 13, fontWeight: "800", marginBottom: 7, marginTop: 14 },
  required: { color: UI.red },
  inputBox: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 14, justifyContent: "center" },
  inputBoxMultiline: { paddingVertical: 12, minHeight: 110 },
  inputBoxText: { color: UI.ink, fontSize: 14 },
  inputBoxTextMultiline: { minHeight: 90 },
  inputError: { borderColor: UI.red },
  hint: { color: UI.muted, fontSize: 11, marginTop: 6, lineHeight: 16 },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 12 },
  channelChip: { backgroundColor: "#ffffff", borderColor: UI.line, borderWidth: 1.5 },
  channelChipActive: { backgroundColor: UI.tealSoft, borderColor: UI.teal },
  sheetPrimaryButton: { marginTop: 20, borderRadius: 12 },
  sheetPrimaryButtonContent: { height: 48 },

  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  searchMessage: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 16 },
  searchMessageError: { color: colors.danger, fontSize: 13, textAlign: "center", marginTop: 16 },
  suggestions: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 10, overflow: "hidden" },
});
