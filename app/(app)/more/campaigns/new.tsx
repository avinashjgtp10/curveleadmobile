import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, TextInput as RNTextInput, View,
} from "react-native";
import { Appbar, Button, Checkbox, HelperText, Text } from "react-native-paper";
import axios from "axios";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { DateTimeField } from "@/components/DateTimeField";
import {
  CampaignSource, CampaignStatus, createCampaign, fetchCampaign, SaveCampaignInput, updateCampaign,
} from "@/api/campaigns";

const SOURCES: { value: CampaignSource; label: string }[] = [
  { value: "meta_ads", label: "Meta Ads" },
  { value: "google_ads", label: "Google Ads" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "organic", label: "Organic" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

const STATUSES: { value: CampaignStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function LabeledInput({ label, required, value, onChangeText, placeholder, error, helperText, ...inputProps }: {
  label: string; required?: boolean; value: string; onChangeText: (value: string) => void; placeholder?: string;
  error?: boolean; helperText?: string;
} & Omit<React.ComponentProps<typeof RNTextInput>, "value" | "onChangeText" | "placeholder" | "style">) {
  return (
    <>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <View style={[styles.inputBox, error && styles.inputError]}>
        <RNTextInput
          style={styles.inputBoxText} value={value} onChangeText={onChangeText}
          placeholder={placeholder} placeholderTextColor={colors.textMuted} {...inputProps}
        />
      </View>
      {helperText ? <HelperText type="error" visible={!!error}>{helperText}</HelperText> : null}
    </>
  );
}

function Dropdown({ value, options, open, onToggle, onSelect }: {
  value: string; options: { value: string; label: string }[]; open: boolean; onToggle: () => void; onSelect: (value: string) => void;
}) {
  const selected = options.find((item) => item.value === value) || options[0];
  return (
    <>
      <Pressable style={[styles.dropdownField, open && styles.dropdownFieldActive]} onPress={onToggle}>
        <Text style={styles.dropdownFieldText}>{selected?.label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <View style={styles.dropdownPanel}>
          {options.map((item) => {
            const isSelected = item.value === value;
            return (
              <Pressable key={item.value} style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]} onPress={() => onSelect(item.value)}>
                <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );
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
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [status, setStatus] = useState<CampaignStatus>("active");
  const [isPriority, setIsPriority] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"source" | "status" | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; end_date?: string }>({});

  useEffect(() => {
    if (!id) return;
    fetchCampaign(id).then(({ campaign }) => {
      setName(campaign.name); setSource(campaign.source); setBudget(campaign.budget ? String(campaign.budget) : "");
      setStartDate(campaign.start_date ? new Date(campaign.start_date) : null);
      setEndDate(campaign.end_date ? new Date(campaign.end_date) : null);
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
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) next.end_date = "End date must be after start date";
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    const input: SaveCampaignInput = {
      name: name.trim(), source, budget: budget.trim() || undefined,
      start_date: startDate ? toDateInput(startDate) : undefined,
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={close} />
        <Appbar.Content title={isEditing ? "Edit Campaign" : "New Campaign"} titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.loadingState}><Text style={styles.loadingText}>Loading…</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        >
          {error ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{error}</Text></View> : null}

          <LabeledInput
            label="Campaign Name" required value={name} onChangeText={setName}
            placeholder="e.g. Salon Lead Gen – City Test" error={!!fieldErrors.name} helperText={fieldErrors.name}
          />

          <Text style={styles.label}>Source</Text>
          <Dropdown
            value={source} options={SOURCES}
            open={openDropdown === "source"} onToggle={() => setOpenDropdown(openDropdown === "source" ? null : "source")}
            onSelect={(value) => { setSource(value as CampaignSource); setOpenDropdown(null); }}
          />

          <LabeledInput
            label="Budget (₹)" value={budget} onChangeText={setBudget} placeholder="0" keyboardType="numeric"
          />

          <View style={styles.dateRow}>
            <View style={styles.dateFieldWrap}>
              <Text style={styles.label}>Start Date</Text>
              <DateTimeField value={startDate || new Date()} onChange={setStartDate} mode="date" />
            </View>
            <View style={styles.dateFieldWrap}>
              <Text style={styles.label}>End Date</Text>
              <DateTimeField value={endDate || new Date()} onChange={setEndDate} mode="date" />
            </View>
          </View>
          {fieldErrors.end_date ? <HelperText type="error" visible>{fieldErrors.end_date}</HelperText> : null}

          <Text style={styles.label}>Status</Text>
          <Dropdown
            value={status} options={STATUSES}
            open={openDropdown === "status"} onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
            onSelect={(value) => { setStatus(value as CampaignStatus); setOpenDropdown(null); }}
          />

          <Pressable style={styles.priorityRow} onPress={() => setIsPriority((value) => !value)}>
            <Checkbox status={isPriority ? "checked" : "unchecked"} onPress={() => setIsPriority((value) => !value)} color={colors.primary} />
            <View style={styles.priorityCopy}>
              <Text style={styles.priorityTitle}>Priority campaign</Text>
              <Text style={styles.priorityHint}>Leads from this campaign skip automated messaging entirely and go straight to the assigned salesperson.</Text>
            </View>
          </Pressable>
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button mode="outlined" onPress={close} disabled={saving} style={styles.cancelButton} contentStyle={styles.bottomButtonContent}>Cancel</Button>
        <Button mode="contained" onPress={save} loading={saving} disabled={saving || loading} style={styles.saveButton} contentStyle={styles.bottomButtonContent}>Save</Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingTop: 18 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.textSecondary },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorBannerText: { color: colors.danger, fontSize: 12, fontWeight: "600", lineHeight: 18 },

  label: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 16 },
  required: { color: colors.danger },
  inputBox: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, justifyContent: "center" },
  inputError: { borderColor: colors.danger },
  inputBoxText: { color: colors.text, fontSize: 14 },

  dropdownField: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownFieldActive: { borderColor: colors.primary, borderWidth: 2 },
  dropdownFieldText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  dropdownPanel: { marginTop: 6, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, paddingVertical: 4 },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownItemSelected: { backgroundColor: colors.primarySoft },
  dropdownItemText: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  dropdownItemTextSelected: { color: colors.text, fontWeight: "700" },

  dateRow: { flexDirection: "row", gap: 10 },
  dateFieldWrap: { flex: 1 },

  priorityRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 18 },
  priorityCopy: { flex: 1, paddingTop: 10 },
  priorityTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  priorityHint: { color: colors.textMuted, fontSize: 11, marginTop: 3, lineHeight: 16 },


  bottomBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  cancelButton: { width: 110 },
  saveButton: { flex: 1 },
  bottomButtonContent: { height: 46 },
});
