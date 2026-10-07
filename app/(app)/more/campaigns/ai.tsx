import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import axios from "axios";
import { colors } from "@/theme";
import {
  activateAiAdDraft, AiAdBrief, AiAdDestination, AiAdDraft, AiAdDraftSummary, AiAdLanguage, AiMetaDraft,
  createAiAdDraft, createAiAdOnMeta, fetchAiAdDraft, fetchAiAdDrafts, updateAiAdDraft, uploadAiAdImage,
} from "@/api/ads";

const EMPTY_AI_BRIEF: AiAdBrief = { offer: "", goal: "", location: "", budget_per_day_inr: 500, duration_days: 14, language: "en", destination: "LEAD_FORM" };
const LANGUAGES: { value: AiAdLanguage; label: string }[] = [{ value: "en", label: "English" }, { value: "hi", label: "Hindi" }, { value: "mr", label: "Marathi" }];
const CTA_OPTIONS: Record<AiAdDestination, string[]> = {
  LEAD_FORM: ["BOOK_NOW", "SIGN_UP", "GET_QUOTE", "LEARN_MORE", "APPLY_NOW", "CONTACT_US", "GET_OFFER", "SUBSCRIBE", "DOWNLOAD"],
  WHATSAPP: ["WHATSAPP_MESSAGE"],
};

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function shortDate(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
}

function money(value?: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function ctaLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AiCampaignScreen() {
  const insets = useSafeAreaInsets();
  const [brief, setBrief] = useState<AiAdBrief>(EMPTY_AI_BRIEF);
  const [drafts, setDrafts] = useState<AiAdDraftSummary[]>([]);
  const [draft, setDraft] = useState<AiAdDraft | null>(null);
  const [form, setForm] = useState<AiMetaDraft | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [activateConfirm, setActivateConfirm] = useState("");

  useEffect(() => {
    fetchAiAdDrafts().then(setDrafts).catch(() => setDrafts([])).finally(() => setLoadingDrafts(false));
  }, []);

  function setBriefField<K extends keyof AiAdBrief>(key: K, value: AiAdBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function createDraft() {
    if (!brief.offer.trim()) { setError("Tell AI what you are advertising."); return; }
    setDrafting(true); setError("");
    try {
      const next = await createAiAdDraft({
        ...brief,
        offer: brief.offer.trim(),
        goal: brief.goal?.trim(),
        location: brief.location?.trim(),
        budget_per_day_inr: Number(brief.budget_per_day_inr) || 500,
        duration_days: Number(brief.duration_days) || 14,
      });
      setDraft(next); setForm(next.draft || null);
      setDrafts((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    } catch (draftError) {
      setError(errorMessage(draftError, "Could not draft the campaign."));
    } finally {
      setDrafting(false);
    }
  }

  async function openDraft(id: string) {
    setBusy("open"); setError("");
    try {
      const next = await fetchAiAdDraft(id);
      setDraft(next); setForm(next.draft || null); setActivateConfirm("");
    } catch (openError) {
      setError(errorMessage(openError, "Could not open the draft."));
    } finally {
      setBusy("");
    }
  }

  function updateField<K extends keyof AiMetaDraft>(key: K, value: AiMetaDraft[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
    setError("");
  }

  function updateArray(key: "primary_texts" | "headlines", index: number, value: string) {
    setForm((current) => {
      if (!current) return current;
      const next = [...(current[key] || [])];
      next[index] = value;
      return { ...current, [key]: next };
    });
  }

  function updatePrivacy(value: string) {
    setForm((current) => current ? { ...current, lead_form: { ...(current.lead_form || {}), privacy_policy_url: value } } : current);
  }

  async function saveDraft() {
    if (!draft || !form) return null;
    setBusy("save"); setError("");
    try {
      const saved = await updateAiAdDraft(draft.id, {
        ...form,
        radius_km: Number(form.radius_km),
        age_min: Number(form.age_min),
        age_max: Number(form.age_max),
        daily_budget_inr: Number(form.daily_budget_inr),
        duration_days: Number(form.duration_days),
      });
      setDraft(saved); setForm(saved.draft || null);
      setDrafts((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      return saved;
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not save this draft."));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function pickImage() {
    if (!draft) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setBusy("image"); setError("");
    try {
      const image = await uploadAiAdImage(draft.id, { uri: asset.uri, name: asset.name || "ad-image.jpg", mimeType: asset.mimeType });
      setDraft((current) => current ? { ...current, image } : current);
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Could not upload the ad image."));
    } finally {
      setBusy("");
    }
  }

  async function createOnMeta() {
    if (!draft) return;
    const saved = await saveDraft();
    if (!saved || saved.errors?.length) { setError(saved?.errors?.length ? `Fix ${saved.errors.length} problem(s) before creating on Meta.` : "Could not save this draft."); return; }
    setBusy("create"); setError("");
    try {
      const created = await createAiAdOnMeta(draft.id);
      setDraft(created); setForm(created.draft || form);
      setDrafts((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    } catch (createError) {
      setError(errorMessage(createError, "Could not create this campaign on Meta."));
    } finally {
      setBusy("");
    }
  }

  async function activate() {
    if (!draft || !form) return;
    setBusy("activate"); setError("");
    try {
      const activated = await activateAiAdDraft(draft.id, activateConfirm.trim());
      setDraft(activated); setForm(activated.draft || form);
      Alert.alert("Campaign is live", "It appears in the campaign list after the next sync.");
    } catch (activateError) {
      setError(errorMessage(activateError, "Could not activate this campaign."));
    } finally {
      setBusy("");
    }
  }

  const locked = !!draft && !["draft", "failed"].includes(draft.status);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={draft ? "Review campaign" : "Create with AI"} titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled">
        {error ? <Banner icon="alert-circle-outline" text={error} danger /> : null}

        {draft && form ? (
          <>
            <View style={styles.reviewTop}>
              <Pressable onPress={() => { setDraft(null); setForm(null); }} style={styles.smallButton}>
                <Ionicons name="arrow-back" size={16} color={colors.primary} />
                <Text style={styles.smallButtonText}>Brief</Text>
              </Pressable>
              <Text style={styles.statusPill}>{draft.status}</Text>
            </View>

            {draft.ai_reasoning ? <Text style={styles.hint}>{draft.ai_reasoning}</Text> : null}
            {draft.warnings?.map((warning, index) => <Banner key={index} icon="warning-outline" text={warning.message} warning />)}
            {draft.errors?.map((item, index) => <Banner key={index} icon="alert-circle-outline" text={`${item.field}: ${item.message}`} danger />)}
            {draft.error ? <Banner icon="alert-circle-outline" text={draft.error} danger /> : null}

            <Field label="Campaign name"><Input value={form.campaign_name} onChangeText={(value) => updateField("campaign_name", value)} editable={!locked} /></Field>

            <Text style={styles.label}>Primary text - pick one, edit freely</Text>
            {(form.primary_texts || []).map((text, index) => (
              <View key={index} style={[styles.choice, form.primary_text_index === index && styles.choiceActive]}>
                <Pressable onPress={() => updateField("primary_text_index", index)} disabled={locked} style={styles.radio}>
                  <Ionicons name={form.primary_text_index === index ? "radio-button-on" : "radio-button-off"} size={20} color={colors.primary} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Input value={text} onChangeText={(value) => updateArray("primary_texts", index, value)} editable={!locked} multiline />
                  <Text style={[styles.hint, text.length > 125 && { color: "#b45309" }]}>{text.length} characters{text.length > 125 ? " - may show See more" : ""}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.label}>Headline</Text>
            {(form.headlines || []).map((headline, index) => (
              <View key={index} style={styles.headlineRow}>
                <Pressable onPress={() => updateField("headline_index", index)} disabled={locked} style={styles.radio}>
                  <Ionicons name={form.headline_index === index ? "radio-button-on" : "radio-button-off"} size={20} color={colors.primary} />
                </Pressable>
                <Input value={headline} onChangeText={(value) => updateArray("headlines", index, value)} editable={!locked} style={{ flex: 1 }} />
              </View>
            ))}

            <Text style={styles.label}>Button</Text>
            <View style={styles.chipRow}>
              {(CTA_OPTIONS[form.destination] || CTA_OPTIONS.LEAD_FORM).slice(0, 4).map((cta) => <Chip key={cta} label={ctaLabel(cta)} active={form.cta === cta} onPress={() => updateField("cta", cta)} disabled={locked} />)}
            </View>

            <View style={styles.grid}><Field label="City"><Input value={form.location} onChangeText={(value) => updateField("location", value)} editable={!locked} /></Field><Field label="Radius (km)"><Input value={String(form.radius_km)} onChangeText={(value) => updateField("radius_km", value)} editable={!locked} keyboardType="number-pad" /></Field></View>
            <View style={styles.grid}><Field label="Age from"><Input value={String(form.age_min)} onChangeText={(value) => updateField("age_min", value)} editable={!locked && !(form.special_ad_categories?.length)} keyboardType="number-pad" /></Field><Field label="Age to"><Input value={String(form.age_max)} onChangeText={(value) => updateField("age_max", value)} editable={!locked && !(form.special_ad_categories?.length)} keyboardType="number-pad" /></Field></View>
            <View style={styles.grid}><Field label="Budget / day (₹)"><Input value={String(form.daily_budget_inr)} onChangeText={(value) => updateField("daily_budget_inr", value)} editable={!locked} keyboardType="number-pad" /></Field><Field label="Days"><Input value={String(form.duration_days)} onChangeText={(value) => updateField("duration_days", value)} editable={!locked} keyboardType="number-pad" /></Field></View>

            {form.destination === "LEAD_FORM" && !form.lead_form?.existing_form_id ? <Field label="Privacy-policy link" hint="Meta requires it on every new lead form."><Input value={form.lead_form?.privacy_policy_url || ""} onChangeText={updatePrivacy} editable={!locked} placeholder="https://yourbusiness.in/privacy" autoCapitalize="none" keyboardType="url" /></Field> : null}

            <View style={styles.imageBox}>
              <View style={styles.imageIcon}><Ionicons name={draft.image ? "image-outline" : "cloud-upload-outline"} size={24} color={colors.textMuted} /></View>
              <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{draft.image?.name || "Ad image"}</Text><Text style={styles.hint}>{draft.image ? "Image uploaded" : "Upload JPG or PNG before creating on Meta."}</Text></View>
              <Pressable onPress={pickImage} disabled={!!busy || locked} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{busy === "image" ? "Uploading" : draft.image ? "Replace" : "Upload"}</Text></Pressable>
            </View>

            {!locked ? <View style={styles.actions}><Pressable onPress={saveDraft} disabled={!!busy} style={styles.secondaryLarge}><Text style={styles.secondaryButtonText}>{busy === "save" ? "Saving..." : "Save draft"}</Text></Pressable><Pressable onPress={createOnMeta} disabled={!!busy || !draft.image} style={[styles.primaryLarge, (!draft.image || !!busy) && { opacity: 0.55 }]}><Text style={styles.primaryText}>{busy === "create" ? "Creating..." : "Create on Meta (paused)"}</Text></Pressable></View> : null}

            {draft.status === "created" ? <View style={styles.activateBox}><Text style={styles.activateTitle}>On Meta and paused - nothing is spending yet.</Text><Text style={styles.hint}>To start spending {money(Number(form.daily_budget_inr))} a day, type the campaign name.</Text><Input value={activateConfirm} onChangeText={setActivateConfirm} placeholder={form.campaign_name} /><Pressable onPress={activate} disabled={busy === "activate" || activateConfirm.trim() !== form.campaign_name.trim()} style={[styles.activateButton, (busy === "activate" || activateConfirm.trim() !== form.campaign_name.trim()) && { opacity: 0.55 }]}><Text style={styles.primaryText}>{busy === "activate" ? "Starting..." : "Activate campaign"}</Text></Pressable></View> : null}
            {draft.status === "activated" ? <Banner icon="checkmark-circle" text="Live on Meta. It appears in the campaign list after the next sync." success /> : null}
          </>
        ) : (
          <>
            <Field label="What are you advertising?" hint="The offer, price and who it's for."><Input value={brief.offer} onChangeText={(value) => setBriefField("offer", value)} multiline placeholder="Diwali hair spa at 999 for women in Baramati, this month only" /></Field>
            <Field label="Goal (optional)"><Input value={brief.goal} onChangeText={(value) => setBriefField("goal", value)} placeholder="e.g. 50 bookings before Diwali" /></Field>
            <View style={styles.grid}><Field label="City"><Input value={brief.location} onChangeText={(value) => setBriefField("location", value)} placeholder="Baramati" /></Field><Field label="Ad language"><View style={styles.chipRow}>{LANGUAGES.map((item) => <Chip key={item.value} label={item.label} active={brief.language === item.value} onPress={() => setBriefField("language", item.value)} />)}</View></Field></View>
            <View style={styles.grid}><Field label="Budget per day (₹)"><Input value={String(brief.budget_per_day_inr)} onChangeText={(value) => setBriefField("budget_per_day_inr", Number(value.replace(/[^\d]/g, "")) || 0)} keyboardType="number-pad" /></Field><Field label="Run for (days)"><Input value={String(brief.duration_days)} onChangeText={(value) => setBriefField("duration_days", Number(value.replace(/[^\d]/g, "")) || 0)} keyboardType="number-pad" /></Field></View>
            <Text style={styles.label}>When someone taps the ad</Text>
            <View style={styles.destinationRow}>{(["LEAD_FORM", "WHATSAPP"] as AiAdDestination[]).map((value) => <Pressable key={value} onPress={() => setBriefField("destination", value)} style={[styles.destinationCard, brief.destination === value && styles.destinationActive]}><Text style={styles.destinationTitle}>{value === "LEAD_FORM" ? "Instant lead form" : "WhatsApp chat"}</Text><Text style={styles.hint}>{value === "LEAD_FORM" ? "Leads land in CurveLead automatically" : "Opens a chat with your business"}</Text></Pressable>)}</View>
            <Pressable onPress={createDraft} disabled={drafting} style={[styles.draftButton, drafting && { opacity: 0.65 }]}>{drafting ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles-outline" size={18} color="#fff" />}<Text style={styles.draftText}>{drafting ? "Writing your ads..." : "Draft the campaign"}</Text></Pressable>
            <View style={styles.draftsHeader}><Text style={styles.sectionTitle}>Earlier drafts</Text>{loadingDrafts ? <ActivityIndicator size="small" color={colors.primary} /> : null}</View>
            {drafts.length ? drafts.slice(0, 8).map((item) => <Pressable key={item.id} style={styles.draftRow} onPress={() => openDraft(item.id)} disabled={busy === "open"}><Text style={styles.draftStatus}>{item.status}</Text><Text style={styles.draftName} numberOfLines={1}>{item.campaign_name || item.brief?.offer || "Untitled draft"}</Text><Text style={styles.draftDate}>{shortDate(item.created_at)}</Text></Pressable>) : !loadingDrafts ? <Text style={styles.emptyText}>No drafts yet.</Text> : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text>{children}{hint ? <Text style={styles.hint}>{hint}</Text> : null}</View>;
}

function Input(props: React.ComponentProps<typeof RNTextInput>) {
  return <View style={[styles.inputBox, props.multiline && styles.textareaBox, props.style as object]}><RNTextInput placeholderTextColor={colors.textMuted} textAlignVertical={props.multiline ? "top" : "center"} {...props} style={[styles.input, props.multiline && styles.textarea]} /></View>;
}

function Chip({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function Banner({ icon, text, danger, warning, success }: { icon: keyof typeof Ionicons.glyphMap; text: string; danger?: boolean; warning?: boolean; success?: boolean }) {
  const color = danger ? colors.danger : warning ? "#b45309" : success ? "#15803d" : colors.textSecondary;
  const bg = danger ? colors.dangerSoft : warning ? "#fef3c7" : success ? "#dcfce7" : "#eef2f6";
  return <View style={[styles.banner, { backgroundColor: bg }]}><Ionicons name={icon} size={16} color={color} /><Text style={[styles.bannerText, { color }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  content: { padding: 16, gap: 10 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "900", marginTop: 8, marginBottom: 6 },
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  inputBox: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#ffffff", paddingHorizontal: 12, justifyContent: "center" },
  textareaBox: { minHeight: 92, paddingVertical: 10 },
  input: { color: colors.text, fontSize: 15, paddingVertical: 0 },
  textarea: { minHeight: 70 },
  grid: { flexDirection: "row", gap: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#fff", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: "#ede9fe", borderColor: "#7c3aed" },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "900" },
  chipTextActive: { color: "#7c3aed" },
  destinationRow: { flexDirection: "row", gap: 10 },
  destinationCard: { flex: 1, minHeight: 74, borderRadius: 16, borderWidth: 1, borderColor: "#d7e6f1", padding: 12, justifyContent: "center" },
  destinationActive: { backgroundColor: "#eef2ff", borderColor: colors.primary },
  destinationTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  draftButton: { height: 52, borderRadius: 16, backgroundColor: "#7c3aed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  draftText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  draftsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  draftRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, borderWidth: 1, borderColor: "#e2eef7", paddingHorizontal: 10 },
  draftStatus: { overflow: "hidden", borderRadius: 999, backgroundColor: "#eef2f6", color: colors.textSecondary, fontSize: 10, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 3 },
  draftName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "800" },
  draftDate: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center", paddingVertical: 12 },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  smallButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, backgroundColor: "#f0f9ff", paddingHorizontal: 10 },
  smallButtonText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  statusPill: { overflow: "hidden", borderRadius: 999, backgroundColor: "#eef2f6", color: colors.textSecondary, fontSize: 11, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 4 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 13, padding: 12 },
  bannerText: { flex: 1, fontSize: 12, fontWeight: "800" },
  choice: { flexDirection: "row", gap: 8, borderRadius: 14, borderWidth: 1, borderColor: "#e2eef7", padding: 8 },
  choiceActive: { borderColor: colors.primary, backgroundColor: "#eef2ff" },
  radio: { paddingTop: 10 },
  headlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  imageBox: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: "#e2eef7", padding: 12 },
  imageIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#eef2f6", alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  secondaryButton: { minHeight: 40, borderRadius: 13, borderWidth: 1, borderColor: "#bae6fd", backgroundColor: "#f0f9ff", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  secondaryLarge: { flex: 1, height: 50, borderRadius: 15, borderWidth: 1, borderColor: "#d7e6f1", alignItems: "center", justifyContent: "center" },
  primaryLarge: { flex: 1.4, height: 50, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  primaryText: { color: "#ffffff", fontSize: 13, fontWeight: "900", textAlign: "center" },
  activateBox: { gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: "#fde68a", backgroundColor: "#fffbeb", padding: 14 },
  activateTitle: { color: "#92400e", fontSize: 13, fontWeight: "900" },
  activateButton: { height: 50, borderRadius: 15, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center" },
});
