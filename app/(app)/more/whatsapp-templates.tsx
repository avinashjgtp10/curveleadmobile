import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Chip, SegmentedButtons, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import {
  createWhatsAppTemplate, fetchWhatsAppTemplates, templateComponent, WhatsAppTemplate,
} from "@/api/whatsappTemplates";

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const LANGUAGES = [
  { value: "en_US", label: "English (US)" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
];

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  APPROVED: { bg: colors.successSoft, text: colors.success },
  PENDING: { bg: colors.warningSoft, text: colors.warning },
  REJECTED: { bg: colors.dangerSoft, text: colors.danger },
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

function countVars(text?: string) {
  if (!text) return 0;
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => parseInt(match[1], 10));
  return matches.length ? Math.max(...matches) : 0;
}

export default function WhatsAppTemplatesScreen() {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0].value);
  const [bodyText, setBodyText] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setTemplates(await fetchWhatsAppTemplates());
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load templates."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    ALL: templates.length,
    APPROVED: templates.filter((item) => item.status === "APPROVED").length,
    PENDING: templates.filter((item) => item.status === "PENDING").length,
    REJECTED: templates.filter((item) => item.status === "REJECTED").length,
  }), [templates]);

  const visibleTemplates = statusFilter === "ALL" ? templates : templates.filter((item) => item.status === statusFilter);

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
    if (!bodyText.trim()) { setFormError("Body text is required."); return; }
    if (varCount > 0 && examples.some((example) => !example.trim())) {
      setFormError("Provide an example value for every {{n}} variable — Meta requires this for review.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const result = await createWhatsAppTemplate({ name, category, language, body_text: bodyText, examples });
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
        <Appbar.Header style={styles.header} elevated={false}>
          <Appbar.BackAction onPress={() => setCreating(false)} />
          <Appbar.Content title="Create template" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
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
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="WhatsApp Templates" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="plus" color={colors.primary} onPress={openCreate} />
      </Appbar.Header>

      <View style={styles.filterRow}>
        <SegmentedButtons
          value={statusFilter}
          onValueChange={setStatusFilter}
          buttons={[
            { value: "ALL", label: `All ${counts.ALL}` },
            { value: "APPROVED", label: `Approved ${counts.APPROVED}` },
            { value: "PENDING", label: `Pending ${counts.PENDING}` },
            { value: "REJECTED", label: `Rejected ${counts.REJECTED}` },
          ]}
        />
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={load} style={{ marginTop: 14 }}>Try again</Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {visibleTemplates.length ? visibleTemplates.map((template) => {
            const statusStyle = STATUS_COLOR[template.status] || STATUS_COLOR.PENDING;
            const body = templateComponent(template, "BODY")?.text;
            return (
              <Card key={`${template.name}-${template.language}`} mode="outlined" style={styles.card}>
                <Card.Content>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardName} numberOfLines={1}>{template.name}</Text>
                    <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                      <Text style={[styles.statusPillText, { color: statusStyle.text }]}>{template.status}</Text>
                    </View>
                  </View>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardMeta}>{template.category}</Text>
                    <Text style={styles.cardMeta}>{template.language}</Text>
                  </View>
                  {body ? <Text style={styles.cardBody} numberOfLines={3}>{body}</Text> : null}
                </Card.Content>
              </Card>
            );
          }) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="logo-whatsapp" size={28} color={colors.primary} /></View>
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
  screen: { flex: 1, backgroundColor: "#fff" },
  header: { backgroundColor: "#fff" },
  headerTitle: { fontSize: 15, fontWeight: "700" },
  filterRow: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: "#fff", paddingBottom: 10 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  content: { padding: 14 },

  card: { marginBottom: 12 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800" },
  statusPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  cardMetaRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  cardMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  cardBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8 },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
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
