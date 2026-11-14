import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Button, Chip, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import {
  createWhatsAppTemplate, fetchWhatsAppTemplates, templateComponent, WhatsAppTemplate,
} from "@/api/whatsappTemplates";

// Pale lavender page, white cards with soft borders, indigo actions.
const UI = { bg: "#f4f5fb", line: "#dfe2f0", ink: "#14172e", sub: "#5b6280", muted: "#8b91ab", accent: "#4b45e0", accentSoft: "#e8e9fb", track: "#e8eaf4", chip: "#eceef6" };

// Shows {{1}}-style variables as small highlighted tokens inside the template text.
function BodyText({ text }: { text: string }) {
  const parts = text.split(/(\{\{\d+\}\})/g);
  return (
    <Text style={styles.cardBody} numberOfLines={3}>
      {parts.map((part, index) => /^\{\{\d+\}\}$/.test(part)
        ? <Text key={index} style={styles.variable}>{` ${part} `}</Text>
        : part)}
    </Text>
  );
}

// AUTHENTICATION is left out: Meta requires a fixed one-time-password format for it, which free-text body input can't produce.
const CATEGORIES = ["MARKETING", "UTILITY"];
const MAX_BODY_LENGTH = 1024;
const MAX_NAME_LENGTH = 512;
const LANGUAGES = [
  { value: "en_US", label: "English (US)" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
];

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  APPROVED: { bg: "#d9f3e4", text: "#0f6b3a" },
  PENDING: { bg: "#fdeccd", text: "#8a5a12" },
  REJECTED: { bg: "#fde3e8", text: "#b3173a" },
};

function errorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data;
  const serverMessage = typeof data?.error === "string" ? data.error
    : typeof data?.message === "string" ? data.message
    : Array.isArray(data?.errors) ? data.errors.map((item: any) => item?.message || item).join(", ")
    : undefined;
  if (serverMessage) return serverMessage;
  if (error.response?.status) return `${fallback} (server responded ${error.response.status})`;
  if (error.request) return `${fallback} No response from server — check your connection.`;
  return `${fallback} ${error.message}`;
}

const KNOWN_STATUSES = ["APPROVED", "PENDING", "REJECTED"];

function countVars(text?: string) {
  if (!text) return 0;
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => parseInt(match[1], 10));
  return matches.length ? Math.max(...matches) : 0;
}

// Meta needs variables numbered 1..n with none missing, and a body that doesn't start or end with a variable.
function variableProblem(text: string) {
  const used = new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => parseInt(match[1], 10)));
  for (let n = 1; n <= used.size; n++) {
    if (!used.has(n)) return `Variables must be numbered in order - {{${n}}} is missing.`;
  }
  if (/^\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}$/.test(text)) return "The body can't start or end with a variable - add some text around it.";
  return "";
}

export default function WhatsAppTemplatesScreen() {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0].value);
  const [bodyText, setBodyText] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormErrorState] = useState("");
  const formScroll = useRef<ScrollView>(null);

  // The error banner sits at the top of a long form while Submit is at the bottom, so bring it into view.
  function setFormError(message: string) {
    setFormErrorState(message);
    if (message) formScroll.current?.scrollTo({ y: 0, animated: true });
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      setTemplates(await fetchWhatsAppTemplates());
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load templates."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  // System back closes the create form instead of leaving the screen.
  useEffect(() => {
    if (!creating) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { if (!submitting) setCreating(false); return true; });
    return () => sub.remove();
  }, [creating, submitting]);

  const counts = useMemo(() => ({
    ALL: templates.length,
    APPROVED: templates.filter((item) => item.status === "APPROVED").length,
    PENDING: templates.filter((item) => item.status === "PENDING").length,
    REJECTED: templates.filter((item) => item.status === "REJECTED").length,
    // Meta also returns PAUSED, DISABLED, IN_APPEAL and similar; keep them reachable from a filter.
    OTHER: templates.filter((item) => !KNOWN_STATUSES.includes(item.status)).length,
  }), [templates]);

  // Don't stay on the Other filter once nothing is left in it (its button disappears).
  useEffect(() => { if (statusFilter === "OTHER" && !counts.OTHER) setStatusFilter("ALL"); }, [statusFilter, counts.OTHER]);

  const byStatus = statusFilter === "ALL" ? templates
    : statusFilter === "OTHER" ? templates.filter((item) => !KNOWN_STATUSES.includes(item.status))
    : templates.filter((item) => item.status === statusFilter);
  const needle = query.trim().toLowerCase();
  const visibleTemplates = needle
    ? byStatus.filter((item) => item.name.toLowerCase().includes(needle) || (templateComponent(item, "BODY")?.text || "").toLowerCase().includes(needle))
    : byStatus;

  const varCount = countVars(bodyText);
  useEffect(() => {
    setExamples((current) => Array.from({ length: varCount }, (_, index) => current[index] || ""));
  }, [varCount]);

  function openCreate() {
    setName(""); setCategory(CATEGORIES[0]); setLanguage(LANGUAGES[0].value); setBodyText(""); setExamples([]); setFormError("");
    setCreating(true);
  }

  async function submitTemplate() {
    if (!/^[a-z0-9_]+$/.test(name)) {
      setFormError("Name must be lowercase letters, numbers, and underscores only (e.g. order_update).");
      return;
    }
    if (name.length > MAX_NAME_LENGTH) { setFormError(`Name can be at most ${MAX_NAME_LENGTH} characters.`); return; }
    const body = bodyText.trim();
    if (!body) { setFormError("Body text is required."); return; }
    if (body.length > MAX_BODY_LENGTH) { setFormError(`Body text can be at most ${MAX_BODY_LENGTH} characters (currently ${body.length}).`); return; }
    const problem = variableProblem(body);
    if (problem) { setFormError(problem); return; }
    if (varCount > 0 && examples.some((example) => !example.trim())) {
      setFormError("Provide an example value for every {{n}} variable — Meta requires this for review.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const result = await createWhatsAppTemplate({ name, category, language, body_text: body, examples });
      Alert.alert("Submitted", `Template submitted — status: ${result.status}. Meta usually reviews within a few hours.`);
      setCreating(false);
      load();
    } catch (submitError) {
      setFormError(errorMessage(submitError, "Failed to submit template."));
    } finally {
      setSubmitting(false);
    }
  }

  if (creating) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => setCreating(false)} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={UI.ink} /></Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Create template</Text>
        </View>
        <ScrollView ref={formScroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          <TextInput
            mode="outlined" label="Template Name" value={name}
            onChangeText={(value) => setName(value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="e.g. order_update" style={styles.field}
          />
          <Text style={styles.hint}>Lowercase letters, numbers, underscores only — Meta rejects anything else.</Text>

          <Text style={styles.label}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((item) => (
              <Chip key={item} compact selected={category === item} onPress={() => setCategory(item)} mode={category === item ? "flat" : "outlined"} textStyle={styles.chipText}>{item}</Chip>
            ))}
          </View>

          <Text style={styles.label}>Language</Text>
          <View style={styles.chipRow}>
            {LANGUAGES.map((item) => (
              <Chip key={item.value} compact selected={language === item.value} onPress={() => setLanguage(item.value)} mode={language === item.value ? "flat" : "outlined"} textStyle={styles.chipText}>{item.label}</Chip>
            ))}
          </View>

          <TextInput
            mode="outlined" label="Body Text" value={bodyText} onChangeText={setBodyText}
            placeholder="Hi {{1}}, your order is on its way. Track it here: {{2}}"
            multiline numberOfLines={4} style={[styles.field, styles.textarea]}
          />
          <Text style={styles.hint}>{bodyText.trim().length}/{MAX_BODY_LENGTH} characters</Text>
          <Text style={styles.hint}>Use {"{{1}}"}, {"{{2}}"}... for variables. Header, footer and buttons aren't supported yet.</Text>

          {varCount > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Example values (required by Meta for review)</Text>
              {examples.map((example, index) => (
                <TextInput
                  key={index} mode="outlined" label={`{{${index + 1}}}`} value={example}
                  onChangeText={(value) => setExamples((current) => current.map((item, i) => (i === index ? value : item)))}
                  placeholder="e.g. Priya" style={styles.field}
                />
              ))}
            </View>
          ) : null}

          <Button mode="contained" onPress={submitTemplate} loading={submitting} disabled={submitting} style={styles.submitButton} contentStyle={styles.submitButtonContent}>
            Submit for Approval
          </Button>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={UI.ink} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>WhatsApp Templates</Text>
        <Pressable onPress={openCreate} style={[styles.headerButton, styles.headerAdd]} accessibilityRole="button" accessibilityLabel="New template"><Ionicons name="add" size={22} color="#ffffff" /></Pressable>
      </View>

      <View style={styles.filterRow}>
        <View style={styles.segmented}>
          {[
            { value: "ALL", label: `All ${counts.ALL}` },
            { value: "APPROVED", label: "Approved" },
            { value: "PENDING", label: "Pending" },
            { value: "REJECTED", label: "Rejected" },
            ...(counts.OTHER ? [{ value: "OTHER", label: `Other ${counts.OTHER}` }] : []),
          ].map((item) => {
            const active = statusFilter === item.value;
            return (
              <Pressable key={item.value} onPress={() => setStatusFilter(item.value)} style={[styles.segOption, active && styles.segOptionActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={UI.sub} />
          <RNTextInput value={query} onChangeText={setQuery} placeholder="Search templates" placeholderTextColor={UI.muted} style={styles.searchInput} />
          {query ? <Pressable onPress={() => setQuery("")} hitSlop={8}><Ionicons name="close-circle" size={16} color={UI.muted} /></Pressable> : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={UI.accent} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={load} style={{ marginTop: 14 }}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UI.accent} colors={[UI.accent]} />}
        >
          {visibleTemplates.length ? visibleTemplates.map((template) => {
            const statusStyle = STATUS_COLOR[template.status] || { bg: colors.surfaceMuted, text: colors.textSecondary };
            const body = templateComponent(template, "BODY")?.text;
            return (
              <View key={`${template.name}-${template.language}`} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardName} numberOfLines={1}>{template.name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusPillText, { color: statusStyle.text }]}>{template.status}</Text>
                  </View>
                </View>
                <View style={styles.cardMetaRow}>
                  <Text style={styles.metaChip}>{template.category}</Text>
                  <Text style={styles.metaChip}>{template.language}</Text>
                </View>
                {body ? <BodyText text={body} /> : null}
              </View>
            );
          }) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="logo-whatsapp" size={26} color={UI.accent} /></View>
              <Text style={styles.emptyTitle}>No templates yet</Text>
              <Text style={styles.emptyText}>Create one to submit it for Meta's approval.</Text>
              <Button mode="outlined" onPress={openCreate} style={{ marginTop: 14 }}>Create template</Button>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  headerAdd: { backgroundColor: UI.accent, borderColor: UI.accent },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 16, fontWeight: "800" },
  filterRow: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 8, gap: 8 },
  segmented: { flexDirection: "row", backgroundColor: UI.track, borderRadius: 12, padding: 3 },
  segOption: { flex: 1, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingHorizontal: 2 },
  segOptionActive: { backgroundColor: "#ffffff" },
  segText: { color: UI.sub, fontSize: 12, fontWeight: "600" },
  segTextActive: { color: UI.ink, fontWeight: "800" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  searchInput: { flex: 1, color: UI.ink, fontSize: 13, paddingVertical: 0 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  content: { paddingHorizontal: 14, paddingTop: 4 },

  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 12, marginBottom: 10 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardName: { flex: 1, color: UI.ink, fontSize: 14, fontWeight: "800" },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  cardMetaRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  metaChip: { overflow: "hidden", backgroundColor: UI.chip, color: UI.sub, fontSize: 10, fontWeight: "800", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  variable: { backgroundColor: UI.accentSoft, color: "#3a35b8", fontWeight: "800" },
  cardMeta: { color: UI.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  cardBody: { color: UI.sub, fontSize: 12, lineHeight: 18, marginTop: 8 },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: UI.accentSoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 14 },
  emptyText: { color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: "center" },

  field: { marginBottom: 8, backgroundColor: "#fff", fontSize: 13 },
  textarea: { minHeight: 80 },
  label: { color: colors.text, fontSize: 11, fontWeight: "700", marginTop: 2, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chipText: { fontSize: 11 },
  hint: { color: colors.textMuted, fontSize: 10, marginTop: -2, marginBottom: 10, lineHeight: 14 },
  formError: { color: colors.danger, fontSize: 12, fontWeight: "600", backgroundColor: colors.dangerSoft, borderRadius: 8, padding: 10, marginBottom: 12 },
  submitButton: { marginTop: 10 },
  submitButtonContent: { height: 42 },
});
