import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Linking, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View, useWindowDimensions,
} from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Chip, HelperText, IconButton, List, Searchbar, Text } from "react-native-paper";
import axios from "axios";
import { router, useNavigation } from "expo-router";
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
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

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
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted}
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

  async function load() {
    setLoading(true); setError("");
    try { setTemplates(await fetchTemplates()); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load templates.")); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const parent = navigation.getParent();
    const hideBar = editOpen || sendOpen;
    parent?.setOptions({ tabBarStyle: hideBar ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [editOpen, sendOpen, navigation, insets.bottom]);

  useEffect(() => {
    if (!sendOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!leadQuery.trim()) { setLeadResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try { setLeadResults((await fetchLeads({ search: leadQuery.trim(), limit: 6 })).leads); } catch { /* best-effort */ }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery, sendOpen]);

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
      load();
    } catch (saveError) {
      setFormError(errorMessage(saveError, "Could not save this template."));
    } finally { setSaving(false); }
  }

  function confirmDelete(template: MessageTemplate) {
    Alert.alert("Delete template?", `"${template.name}" will be removed for your whole team.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteTemplate(template.id); load(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  function openSend(template: MessageTemplate) {
    setSendTarget(template); setLeadQuery(""); setLeadResults([]); setSendOpen(true);
  }

  async function sendTo(lead: LeadListItem) {
    if (!sendTarget) return;
    setSending(true);
    try {
      const result = await sendTemplate(sendTarget.id, lead.id);
      setSendOpen(false);
      if (result.whatsappUrl) Linking.openURL(result.whatsappUrl);
      else Alert.alert("Message ready", result.message);
      load();
    } catch (sendError) {
      Alert.alert("Couldn't prepare this message", errorMessage(sendError, "Please try again."));
    } finally { setSending(false); }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Templates" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="plus" color={colors.primary} onPress={openCreate} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={load} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {templates.length ? templates.map((template) => {
            return (
              <Card key={template.id} mode="outlined" style={styles.card} onPress={() => openEdit(template)}>
                <Card.Content>
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardActions}>
                      <IconButton icon="send-outline" size={16} iconColor={colors.primary} style={styles.iconButton} onPress={() => openSend(template)} />
                      <IconButton icon="trash-can-outline" size={16} iconColor={colors.danger} style={styles.iconButton} onPress={() => confirmDelete(template)} />
                    </View>
                  </View>
                  <Text style={styles.cardName}>{template.name}</Text>
                  <Text style={styles.cardMessage} numberOfLines={2}>{template.message}</Text>
                  <Text style={styles.cardMeta}>Used {template.use_count || 0} times · Updated {relativeTime(template.updated_at)}</Text>
                </Card.Content>
              </Card>
            );
          }) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={30} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>No Templates Available</Text>
              <Button mode="outlined" onPress={openCreate} style={styles.emptyButton}>Tap to create your first template</Button>
            </View>
          )}
        </ScrollView>
      )}

      {editOpen ? (
        <Pressable style={styles.sheetBackdrop} onPress={() => !saving && setEditOpen(false)}>
          <Pressable style={[styles.sheet, { maxHeight: windowHeight * 0.88, paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editing ? "Edit Template" : "New Template"}</Text>
            <ScrollView
              style={{ maxHeight: windowHeight * 0.68 }}
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
                    mode={channel === item.key ? "flat" : "outlined"} icon={item.icon}
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
            <Button mode="contained" onPress={save} loading={saving} disabled={saving} style={styles.sheetPrimaryButton} contentStyle={styles.sheetPrimaryButtonContent}>Save</Button>
          </Pressable>
        </Pressable>
      ) : null}

      {sendOpen ? (
        <Pressable style={styles.sheetBackdrop} onPress={() => !sending && setSendOpen(false)}>
          <Pressable style={[styles.sheet, { maxHeight: windowHeight * 0.88, paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Send &quot;{sendTarget?.name}&quot;</Text>
            <Searchbar
              value={leadQuery} onChangeText={setLeadQuery} placeholder="Search & Select Lead"
              autoFocus elevation={0} style={styles.searchInput}
            />
            {sending ? <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 14 }} /> : (
              <View style={styles.suggestions}>
                {leadResults.map((lead) => (
                  <List.Item key={lead.id} title={lead.name} titleNumberOfLines={1} description={lead.phone} onPress={() => sendTo(lead)} />
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 14 },
  content: { padding: 18 },

  card: { marginBottom: 12 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  cardActions: { flexDirection: "row" },
  iconButton: { margin: 0 },
  cardName: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 10 },
  cardMessage: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  cardMeta: { color: colors.textMuted, fontSize: 11, marginTop: 8 },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 14 },
  emptyButton: { marginTop: 12 },

  sheetBackdrop: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  sheetSectionLabel: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 6, borderRadius: 8, backgroundColor: colors.dangerSoft },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 14 },
  required: { color: colors.danger },
  inputBox: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, justifyContent: "center" },
  inputBoxMultiline: { paddingVertical: 12, minHeight: 110 },
  inputBoxText: { color: colors.text, fontSize: 14 },
  inputBoxTextMultiline: { minHeight: 90 },
  inputError: { borderColor: colors.danger },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 6, lineHeight: 16 },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 12 },
  sheetPrimaryButton: { marginTop: 20 },
  sheetPrimaryButtonContent: { height: 48 },

  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  suggestions: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 10, overflow: "hidden" },
});
