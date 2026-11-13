import React, { useEffect, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, TextInput as RNTextInput, View,
} from "react-native";
import { ActivityIndicator, Switch, Text } from "react-native-paper";
import axios from "axios";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { DateTimeField } from "@/components/DateTimeField";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import {
  CampaignSource, CampaignStatus, createCampaign, fetchCampaign, SaveCampaignInput, updateCampaign,
} from "@/api/campaigns";

// The Add lead form's palette: pale blue page, white fields with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", red: "#d6334f" };

const SOURCES: { value: CampaignSource; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { value: "meta_ads", label: "Meta Ads", icon: "logo-facebook", color: "#1877f2", bg: "#dbeafe" },
  { value: "google_ads", label: "Google Ads", icon: "logo-google", color: "#ea4335", bg: "#fee2e2" },
  { value: "instagram", label: "Instagram", icon: "logo-instagram", color: "#c026d3", bg: "#fae8ff" },
  { value: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp", color: "#16a34a", bg: "#dcfce7" },
  { value: "organic", label: "Organic", icon: "leaf-outline", color: "#15803d", bg: "#dcfce7" },
  { value: "referral", label: "Referral", icon: "people-outline", color: "#d97706", bg: "#fef3c7" },
  { value: "other", label: "Other", icon: "megaphone-outline", color: "#4f46e5", bg: "#e0e7ff" },
];

const STATUSES: { value: CampaignStatus; label: string; color: string; bg: string }[] = [
  { value: "active", label: "Active", color: "#15803d", bg: "#dcfce7" },
  { value: "draft", label: "Draft", color: "#0369a1", bg: "#e0f2fe" },
  { value: "paused", label: "Paused", color: "#b45309", bg: "#fef3c7" },
  { value: "completed", label: "Completed", color: "#64748b", bg: "#eef2f6" },
];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

// Campaign dates are plain dates; build them in local time so they never shift a day.
function fromDateInput(value: string) {
  const [y, m, d] = value.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function NewCampaignScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: "none" } });
    return () => parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) });
  }, [navigation, insets.bottom]);

  const keyboardHeight = useKeyboardHeight();
  const [name, setName] = useState("");
  const [source, setSource] = useState<CampaignSource>("meta_ads");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [status, setStatus] = useState<CampaignStatus>("active");
  const [isPriority, setIsPriority] = useState(false);
  // A campaign synced from Meta gets its budget, dates and status from Meta, so those can't be changed here.
  const [metaManaged, setMetaManaged] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // If the saved campaign could not be loaded the form only holds defaults, so saving must stay disabled.
  const [loadFailed, setLoadFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; end_date?: string }>({});

  useEffect(() => {
    if (!id) return;
    fetchCampaign(id).then(({ campaign }) => {
      setName(campaign.name); setSource(campaign.source); setBudget(campaign.budget ? String(campaign.budget) : "");
      setStartDate(campaign.start_date ? fromDateInput(campaign.start_date) : new Date());
      setEndDate(campaign.end_date ? fromDateInput(campaign.end_date) : null);
      setStatus(campaign.status); setIsPriority(!!campaign.is_priority);
      setMetaManaged(!!campaign.meta_campaign_id);
    }).catch((loadError) => {
      setLoadFailed(true);
      setError(errorMessage(loadError, "Could not load this campaign."));
    }).finally(() => setLoading(false));
  }, [id]);

  function close() {
    router.back();
  }

  async function save() {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = "Campaign name is required";
    // Compare calendar days: the start defaults to "now", so exact times would reject ending on the start day.
    if (!metaManaged && endDate && toDateInput(endDate) < toDateInput(startDate)) next.end_date = "End date must be after the start date";
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    // On an existing campaign an emptied budget or a removed end date must be sent as a clear value - leaving the
    // field out would keep the old one. A Meta-managed campaign only sends what the server lets this app change.
    const input: SaveCampaignInput = metaManaged
      ? { name: name.trim(), source, is_priority: isPriority }
      : {
        name: name.trim(), source,
        budget: budget.trim() || (isEditing ? "0" : undefined),
        start_date: toDateInput(startDate),
        end_date: endDate ? toDateInput(endDate) : (isEditing ? null : undefined),
        status, is_priority: isPriority,
      };
    setSaving(true); setError("");
    try {
      if (isEditing && id) await updateCampaign(id, input);
      else {
        const created = await createCampaign(input);
        // The server starts every new campaign as Active whatever was chosen, so set the chosen status right after.
        if (status !== "active" && created?.id) {
          try { await updateCampaign(created.id, input); }
          catch { Alert.alert("Campaign created", `It was created, but could not be set to ${status}. Open it and change the status.`); }
        }
      }
      router.back();
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not save this campaign."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingBottom: keyboardHeight }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={close} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? "Edit campaign" : "New campaign"}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingState}><ActivityIndicator color={UI.teal} /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Campaign name <Text style={styles.required}>*</Text></Text>
          <View style={[styles.inputBox, !!fieldErrors.name && styles.inputError]}>
            <RNTextInput
              style={styles.inputText} value={name}
              onChangeText={(value) => { setName(value); if (value.trim()) setFieldErrors((c) => ({ ...c, name: undefined })); }}
              placeholder="e.g. Salon lead gen - city test" placeholderTextColor={UI.muted}
            />
          </View>
          {fieldErrors.name ? <Text style={styles.fieldError}>{fieldErrors.name}</Text> : null}

          <Text style={styles.label}>Where do the leads come from?</Text>
          <View style={styles.sourceGrid}>
            {SOURCES.map((item) => {
              const active = source === item.value;
              return (
                <Pressable key={item.value} onPress={() => setSource(item.value)} style={[styles.sourceTile, active && { borderColor: item.color, backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={22} color={active ? item.color : colors.textMuted} />
                  <Text style={[styles.sourceText, active && { color: item.color }]} numberOfLines={1}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {metaManaged ? (
            <View style={styles.metaNote}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.metaNoteText}>This campaign is synced from Meta. Its budget, dates and status are managed in Meta Ads Manager.</Text>
            </View>
          ) : null}

          <View pointerEvents={metaManaged ? "none" : "auto"} style={metaManaged ? styles.lockedSection : undefined}>
          <Text style={styles.label}>Budget</Text>
          <View style={styles.inputBox}>
            <View style={styles.budgetRow}>
              <Text style={styles.currency}>₹</Text>
              <RNTextInput
                style={[styles.inputText, { flex: 1 }]} value={budget}
                onChangeText={(value) => {
                  const [whole, ...decimals] = value.replace(/[^\d.]/g, "").split(".");
                  setBudget(decimals.length ? `${whole}.${decimals.join("")}` : whole);
                }}
                placeholder="0" placeholderTextColor={UI.muted} keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Dates</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateFieldWrap}>
              <Text style={styles.miniLabel}>Starts</Text>
              <DateTimeField value={startDate} onChange={(date) => { setStartDate(date); setFieldErrors((c) => ({ ...c, end_date: undefined })); }} mode="date" />
            </View>
            <View style={styles.dateFieldWrap}>
              <Text style={styles.miniLabel}>Ends</Text>
              {endDate ? (
                <DateTimeField value={endDate} onChange={(date) => { setEndDate(date); setFieldErrors((c) => ({ ...c, end_date: undefined })); }} mode="date" />
              ) : (
                <Pressable style={styles.noEnd} onPress={() => setEndDate(new Date(startDate.getTime() + 30 * 86400000))}>
                  <Ionicons name="infinite-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.noEndText}>No end date</Text>
                </Pressable>
              )}
            </View>
          </View>
          {endDate ? (
            <Pressable onPress={() => { setEndDate(null); setFieldErrors((c) => ({ ...c, end_date: undefined })); }} hitSlop={6}>
              <Text style={styles.clearEnd}>Remove end date</Text>
            </Pressable>
          ) : null}
          {fieldErrors.end_date ? <Text style={styles.fieldError}>{fieldErrors.end_date}</Text> : null}

          <Text style={styles.label}>Status</Text>
          <View style={styles.statusRow}>
            {STATUSES.map((item) => {
              const active = status === item.value;
              return (
                <Pressable key={item.value} onPress={() => setStatus(item.value)} style={[styles.statusChip, active && { backgroundColor: item.bg, borderColor: item.color }]}>
                  <Text style={[styles.statusText, active && { color: item.color }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          </View>

          <View style={styles.priorityCard}>
            <View style={styles.priorityIcon}><Ionicons name="star" size={18} color={UI.teal} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.priorityTitle}>Priority campaign</Text>
              <Text style={styles.priorityHint}>Leads skip automated messages and go straight to your salesperson.</Text>
            </View>
            <Switch value={isPriority} onValueChange={setIsPriority} color={UI.teal} />
          </View>
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: keyboardHeight ? 12 : Math.max(insets.bottom, 12) }]}>
        <Pressable onPress={close} disabled={saving} style={styles.cancelButton} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving || loading || loadFailed} style={[styles.saveButton, (saving || loading || loadFailed) && styles.disabled]} accessibilityRole="button">
          {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text style={styles.saveText}>{isEditing ? "Save changes" : "Create campaign"}</Text>
        </Pressable>
      </View>

      {saving ? (
        <View style={styles.savingOverlay} pointerEvents="auto">
          <View style={styles.savingCard}>
            <ActivityIndicator size="large" color={UI.teal} />
            <Text style={styles.savingText}>{isEditing ? "Saving changes..." : "Creating campaign..."}</Text>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.line },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.6 },
  lockedSection: { opacity: 0.5 },
  metaNote: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: UI.tealSoft, borderRadius: 12, padding: 12, marginTop: 16 },
  metaNoteText: { flex: 1, color: UI.sub, fontSize: 12, lineHeight: 17 },
  savingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(240,246,250,0.75)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  savingCard: { alignItems: "center", gap: 12, paddingHorizontal: 28, paddingVertical: 22, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, elevation: 6, shadowColor: "#0f172a", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  savingText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginTop: 8 },
  errorBannerText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },

  label: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 16, marginBottom: 6 },
  miniLabel: { color: UI.sub, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  required: { color: UI.red },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  inputBox: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 14, justifyContent: "center" },
  inputError: { borderColor: UI.red },
  inputText: { color: UI.ink, fontSize: 13 },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  currency: { color: UI.sub, fontSize: 15, fontWeight: "800" },

  sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sourceTile: { width: "30.5%", alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: UI.line, backgroundColor: "#ffffff" },
  sourceText: { color: UI.sub, fontSize: 12, fontWeight: "800" },

  dateRow: { flexDirection: "row", gap: 10 },
  dateFieldWrap: { flex: 1 },
  noEnd: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: UI.line, backgroundColor: "#ffffff" },
  noEndText: { color: UI.sub, fontSize: 13, fontWeight: "700" },
  clearEnd: { color: UI.teal, fontSize: 12, fontWeight: "800", marginTop: 8 },

  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: UI.line, backgroundColor: "#ffffff" },
  statusText: { color: UI.ink, fontSize: 13, fontWeight: "800" },

  priorityCard: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22, padding: 14, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line },
  priorityIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center" },
  priorityTitle: { color: UI.ink, fontSize: 13, fontWeight: "800" },
  priorityHint: { color: UI.sub, fontSize: 12, lineHeight: 17, marginTop: 2 },

  bottomBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: UI.bg, borderTopWidth: 1, borderTopColor: UI.line },
  cancelButton: { width: 110, height: 44, borderRadius: 999, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  cancelText: { color: UI.teal, fontSize: 14, fontWeight: "800" },
  saveButton: { flex: 1, height: 44, borderRadius: 999, backgroundColor: UI.teal, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
});
