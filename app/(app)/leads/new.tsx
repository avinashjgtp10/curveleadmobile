import React, { useEffect, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, TextInput as RNTextInput, View,
} from "react-native";
import { Appbar, Button, Chip, HelperText, IconButton, List, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { usePermission } from "@/hooks/usePermission";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import { createLead, createLeadFollowup } from "@/api/leads";
import { fetchStaff, StaffMember } from "@/api/staff";

const SOURCES = [
  { value: "manual", label: "Manual" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "google_ads", label: "Google Ads" },
  { value: "walkin", label: "Walk-in" },
];

const COUNTRIES = [
  { code: "IN", name: "India", flag: "🇮🇳", dial: "+91" },
  { code: "US", name: "United States", flag: "🇺🇸", dial: "+1" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dial: "+44" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", dial: "+971" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", dial: "+966" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", dial: "+65" },
  { code: "AU", name: "Australia", flag: "🇦🇺", dial: "+61" },
  { code: "CA", name: "Canada", flag: "🇨🇦", dial: "+1" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", dial: "+60" },
  { code: "QA", name: "Qatar", flag: "🇶🇦", dial: "+974" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", dial: "+965" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", dial: "+64" },
] as const;

interface FormState {
  name: string;
  phone: string;
  email: string;
  location: string;
  business_name: string;
  address: string;
  source: string;
  notes: string;
}

const INITIAL_FORM: FormState = {
  name: "", phone: "", email: "", location: "", business_name: "",
  address: "", source: "manual", notes: "",
};

export default function NewLeadScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: "dashboard" | "leads" }>();
  const { isAdmin } = usePermission();
  const insets = useSafeAreaInsets();
  const phoneRef = useRef<RNTextInput>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]>(COUNTRIES[0]);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [scheduleFollowup, setScheduleFollowup] = useState(false);
  const [followupAt, setFollowupAt] = useState(defaultFollowupDate());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignedTo, setAssignedTo] = useState<StaffMember | null>(null);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  useEffect(() => {
    if (!isAdmin) return;
    fetchStaff().then(setStaff).catch(() => {});
  }, [isAdmin]);

  function closeForm() {
    router.navigate(returnTo === "dashboard" ? "/(app)" : "/(app)/leads");
  }

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  }

  function validate() {
    const next: typeof fieldErrors = {};
    if (!form.name.trim()) next.name = "Enter the lead's name";
    const localDigits = form.phone.replace(/\D/g, "").replace(/^0+/, "");
    const internationalDigits = `${country.dial}${localDigits}`.replace(/\D/g, "");
    if (!localDigits) next.phone = "Enter a phone number";
    else if (internationalDigits.length < 7) next.phone = "Enter a valid phone number";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Enter a valid email address";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setError("");
    try {
      const lead = await createLead({
        name: form.name.trim(),
        phone: `${country.dial}${form.phone.replace(/\D/g, "").replace(/^0+/, "")}`,
        source: form.source,
        ...(form.email.trim() && { email: form.email.trim() }),
        ...(form.location.trim() && { location: form.location.trim() }),
        ...(form.business_name.trim() && { business_name: form.business_name.trim() }),
        ...(form.address.trim() && { address: form.address.trim() }),
        ...(form.notes.trim() && { notes: form.notes.trim() }),
        ...(assignedTo && { assigned_to: assignedTo.id }),
      });
      if (scheduleFollowup) {
        try {
          await createLeadFollowup(lead.id, { followup_type: "call", next_followup_at: followupAt.toISOString() });
        } catch { /* lead is already created; a missed follow-up isn't worth blocking navigation */ }
      }
      router.replace(`/(app)/leads/${lead.id}`);
    } catch (saveError) {
      if (axios.isAxiosError(saveError)) {
        const message = typeof saveError.response?.data?.error === "string" ? saveError.response.data.error : "Could not create this lead.";
        const existingId = saveError.response?.data?.existing_id;
        if (saveError.response?.status === 409 && typeof existingId === "string") {
          Alert.alert("Lead already exists", message, [
            { text: "Keep editing", style: "cancel" },
            { text: "Open lead", onPress: () => router.replace(`/(app)/leads/${existingId}`) },
          ]);
        } else if (saveError.response?.status === 403) {
          Alert.alert("Lead limit reached", message, [
            { text: "Not now", style: "cancel" },
            { text: "View billing", onPress: () => router.push("/(app)/more/billing") },
          ]);
        } else setError(message);
      } else setError("Could not create this lead. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={closeForm} />
        <Appbar.Content title="Add lead" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} showsVerticalScrollIndicator={false}
      >
        {error ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{error}</Text></View> : null}

        <TextInput
          mode="outlined" label="Name *" value={form.name} onChangeText={(value) => update("name", value)}
          placeholder="John Doe" autoCapitalize="words" autoComplete="name" returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()} disabled={saving}
          error={!!fieldErrors.name} style={styles.field}
        />
        <HelperText type="error" visible={!!fieldErrors.name}>{fieldErrors.name}</HelperText>

        <Text style={styles.label}>Mobile Number *</Text>
        <View style={[styles.phoneField, fieldErrors.phone && styles.inputError]}>
          <Pressable style={styles.countryButton} onPress={() => setCountryPickerOpen(true)} disabled={saving}>
            <Text style={styles.countryFlag}>{country.flag}</Text>
            <Text style={styles.countryDial}>{country.dial}</Text>
            <IconButton icon="chevron-down" size={13} style={styles.countryChevron} />
          </Pressable>
          <View style={styles.phoneDivider} />
          <RNTextInput
            ref={phoneRef} style={styles.phoneInput} value={form.phone}
            onChangeText={(value) => update("phone", value.replace(/[^\d\s()-]/g, ""))} placeholder="88888 88888"
            placeholderTextColor={colors.textMuted} keyboardType="phone-pad" autoComplete="tel"
            returnKeyType="done" editable={!saving}
          />
        </View>
        <HelperText type="error" visible={!!fieldErrors.phone}>{fieldErrors.phone}</HelperText>

        <TextInput
          mode="outlined" label="Email Address" value={form.email} onChangeText={(value) => update("email", value)}
          placeholder="email@gmail.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          autoComplete="email" disabled={saving} error={!!fieldErrors.email} style={styles.field}
        />
        <HelperText type="error" visible={!!fieldErrors.email}>{fieldErrors.email}</HelperText>

        <Text style={styles.label}>Lead Source *</Text>
        <View style={styles.chipRow}>
          {SOURCES.map((item) => (
            <Chip
              key={item.value} selected={form.source === item.value} onPress={() => update("source", item.value)}
              mode={form.source === item.value ? "flat" : "outlined"} style={styles.chip}
            >
              {item.label}
            </Chip>
          ))}
        </View>

        <TextInput
          mode="outlined" label="Business Name" value={form.business_name} onChangeText={(value) => update("business_name", value)}
          placeholder="Company or organisation" autoCapitalize="words" disabled={saving} style={styles.field}
        />

        <TextInput
          mode="outlined" label="City" value={form.location} onChangeText={(value) => update("location", value)}
          placeholder="Lead location" autoCapitalize="words" disabled={saving} style={styles.field}
        />

        <TextInput
          mode="outlined" label="Address" value={form.address} onChangeText={(value) => update("address", value)}
          placeholder="Street address (optional)" multiline numberOfLines={3} disabled={saving} style={styles.field}
        />

        {isAdmin ? (
          <>
            <Text style={styles.label}>Assign To</Text>
            <Pressable style={styles.assignField} onPress={() => setAssignPickerOpen(true)} disabled={saving}>
              <Text style={assignedTo ? styles.assignFieldText : styles.assignFieldPlaceholder}>{assignedTo ? assignedTo.name : "Assign to yourself (default)"}</Text>
              <IconButton icon="chevron-down" size={16} style={styles.countryChevron} />
            </Pressable>
          </>
        ) : null}

        <List.Item
          title="Schedule a follow-up date & time"
          titleStyle={styles.followupToggleText}
          onPress={() => setScheduleFollowup((value) => !value)}
          style={styles.followupToggle}
          left={() => <List.Icon icon={scheduleFollowup ? "checkbox-marked" : "checkbox-blank-outline"} color={colors.primary} />}
        />

        {scheduleFollowup ? (
          <View style={styles.followupPicker}>
            <DateTimeField value={followupAt} onChange={setFollowupAt} minimumDate={new Date()} />
          </View>
        ) : null}

        <TextInput
          mode="outlined" label="Notes" value={form.notes} onChangeText={(value) => update("notes", value)}
          placeholder="Add context for your team…" multiline numberOfLines={4} disabled={saving} style={styles.field}
        />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button mode="outlined" onPress={closeForm} disabled={saving} style={styles.cancelButton} contentStyle={styles.bottomButtonContent}>Cancel</Button>
        <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={styles.saveButton} contentStyle={styles.bottomButtonContent}>Create lead</Button>
      </View>

      <Modal visible={countryPickerOpen} transparent animationType="slide" onRequestClose={() => setCountryPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCountryPickerOpen(false)}>
          <Pressable style={[styles.countrySheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Country code</Text>
              <IconButton icon="close" size={18} onPress={() => setCountryPickerOpen(false)} />
            </View>
            <ScrollView style={styles.countryList} showsVerticalScrollIndicator={false}>
              {COUNTRIES.map((item) => (
                <List.Item
                  key={item.code}
                  title={`${item.flag}  ${item.name}`}
                  description={item.dial}
                  onPress={() => { setCountry(item); setCountryPickerOpen(false); setFieldErrors((current) => ({ ...current, phone: undefined })); }}
                  right={country.code === item.code ? (props) => <List.Icon {...props} icon="check" color={colors.primary} /> : undefined}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={assignPickerOpen} transparent animationType="slide" onRequestClose={() => setAssignPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAssignPickerOpen(false)}>
          <Pressable style={[styles.countrySheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Assign to</Text>
              <IconButton icon="close" size={18} onPress={() => setAssignPickerOpen(false)} />
            </View>
            <ScrollView style={styles.countryList} showsVerticalScrollIndicator={false}>
              <List.Item
                title="Yourself (default)"
                onPress={() => { setAssignedTo(null); setAssignPickerOpen(false); }}
                right={!assignedTo ? (props) => <List.Icon {...props} icon="check" color={colors.primary} /> : undefined}
              />
              {staff.map((member) => (
                <List.Item
                  key={member.id}
                  title={member.name}
                  description={member.role}
                  onPress={() => { setAssignedTo(member); setAssignPickerOpen(false); }}
                  right={assignedTo?.id === member.id ? (props) => <List.Icon {...props} icon="check" color={colors.primary} /> : undefined}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingTop: 18 },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12, marginBottom: 12 }, errorBannerText: { color: colors.danger, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  field: { marginBottom: 2 },
  label: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 16 },
  inputError: { borderColor: colors.danger },
  phoneField: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" }, countryButton: { height: "100%", flexDirection: "row", alignItems: "center", gap: 0, paddingLeft: 12, paddingRight: 2 }, countryFlag: { fontSize: 17 }, countryDial: { color: colors.text, fontSize: 13, fontWeight: "700", marginLeft: 5 }, countryChevron: { margin: 0 }, phoneDivider: { width: 1, height: 24, backgroundColor: colors.borderSoft }, phoneInput: { flex: 1, height: "100%", paddingHorizontal: 12, color: colors.text, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { marginBottom: 0 },
  assignField: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  assignFieldText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  assignFieldPlaceholder: { color: colors.textMuted, fontSize: 14 },
  followupToggle: { marginTop: 8, paddingHorizontal: 0 }, followupToggleText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  followupPicker: { marginTop: 4, marginBottom: 8 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSoft }, cancelButton: { width: 110 }, saveButton: { flex: 1 }, bottomButtonContent: { height: 46 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" }, countrySheet: { maxHeight: "74%", backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 9 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 13 }, sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.borderSoft }, sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800" }, countryList: { paddingHorizontal: 8 },
});
