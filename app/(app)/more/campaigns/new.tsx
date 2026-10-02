import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, TextInput as RNTextInput, View,
} from "react-native";
import { ActivityIndicator, Appbar, Switch, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { DateTimeField } from "@/components/DateTimeField";
import {
  CampaignSource, CampaignStatus, createCampaign, fetchCampaign, SaveCampaignInput, updateCampaign,
} from "@/api/campaigns";

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

  const [name, setName] = useState("");
  const [source, setSource] = useState<CampaignSource>("meta_ads");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [status, setStatus] = useState<CampaignStatus>("active");
  const [isPriority, setIsPriority] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; end_date?: string }>({});

  useEffect(() => {
    if (!id) return;
    fetchCampaign(id).then(({ campaign }) => {
      setName(campaign.name); setSource(campaign.source); setBudget(campaign.budget ? String(campaign.budget) : "");
      setStartDate(campaign.start_date ? fromDateInput(campaign.start_date) : new Date());
      setEndDate(campaign.end_date ? fromDateInput(campaign.end_date) : null);
      setStatus(campaign.status); setIsPriority(!!campaign.is_priority);
    }).catch((loadError) => {
      setError(errorMessage(loadError, "Could not load this campaign."));
    }).finally(() => setLoading(false));
  }, [id]);

  function close() {
    router.back();
  }

  async function save() {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = "Campaign name is required";
    if (endDate && endDate.getTime() < startDate.getTime()) next.end_date = "End date must be after the start date";
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    const input: SaveCampaignInput = {
      name: name.trim(), source, budget: budget.trim() || undefined,
      start_date: toDateInput(startDate),
      end_date: endDate ? toDateInput(endDate) : undefined,
      status, is_priority: isPriority,
    };
    setSaving(true); setError("");
    try {
      if (isEditing && id) await updateCampaign(id, input);
      else await createCampaign(input);
      router.back();
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not save this campaign."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={close} />
        <Appbar.Content title={isEditing ? "Edit Campaign" : "New Campaign"} titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /></View>
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
              placeholder="e.g. Salon lead gen - city test" placeholderTextColor={colors.textMuted}
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

          <Text style={styles.label}>Budget</Text>
          <View style={styles.inputBox}>
            <View style={styles.budgetRow}>
              <Text style={styles.currency}>₹</Text>
              <RNTextInput
                style={[styles.inputText, { flex: 1 }]} value={budget}
                onChangeText={(value) => setBudget(value.replace(/[^\d.]/g, ""))}
                placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Dates</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateFieldWrap}>
              <Text style={styles.miniLabel}>Starts</Text>
              <DateTimeField value={startDate} onChange={setStartDate} mode="date" />
            </View>
            <View style={styles.dateFieldWrap}>
              <Text style={styles.miniLabel}>Ends</Text>
              {endDate ? (
                <DateTimeField value={endDate} onChange={setEndDate} mode="date" />
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

          <View style={styles.priorityCard}>
            <View style={styles.priorityIcon}><Ionicons name="star" size={18} color="#7c3aed" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.priorityTitle}>Priority campaign</Text>
              <Text style={styles.priorityHint}>Leads skip automated messages and go straight to your salesperson.</Text>
            </View>
            <Switch value={isPriority} onValueChange={setIsPriority} color={colors.primary} />
          </View>
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable onPress={close} disabled={saving} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving || loading} style={[styles.saveWrap, (saving || loading) && styles.disabled]}>
          <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveButton}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
            <Text style={styles.saveText}>{isEditing ? "Save changes" : "Create campaign"}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.6 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginTop: 8 },
  errorBannerText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },

  label: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 20, marginBottom: 8 },
  miniLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  required: { color: colors.danger },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  inputBox: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, justifyContent: "center" },
  inputError: { borderColor: colors.danger },
  inputText: { color: colors.text, fontSize: 15 },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  currency: { color: colors.textSecondary, fontSize: 16, fontWeight: "800" },

  sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sourceTile: { width: "30.5%", alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: "#e2eef7", backgroundColor: "#ffffff" },
  sourceText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },

  dateRow: { flexDirection: "row", gap: 10 },
  dateFieldWrap: { flex: 1 },
  noEnd: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  noEndText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  clearEnd: { color: colors.primary, fontSize: 12, fontWeight: "800", marginTop: 8 },

  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: "#d7e6f1", backgroundColor: "#ffffff" },
  statusText: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },

  priorityCard: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22, padding: 14, borderRadius: 18, backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#ede9fe" },
  priorityIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" },
  priorityTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  priorityHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },

  bottomBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#e2eef7" },
  cancelButton: { height: 52, paddingHorizontal: 22, borderRadius: 16, borderWidth: 1.5, borderColor: "#d7e6f1", alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "800" },
  saveWrap: { flex: 1 },
  saveButton: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
});
