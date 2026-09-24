import React, { useEffect, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, TextInput as RNTextInput, View,
} from "react-native";
import { Appbar, Button, HelperText, IconButton, List, Text } from "react-native-paper";
import axios from "axios";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { usePermission } from "@/hooks/usePermission";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import { createLead, createLeadFollowup } from "@/api/leads";
import { fetchStaff, StaffMember } from "@/api/staff";
import { notifyLeadCreated } from "@/api/notifications";

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

function LabeledInput({ label, required, value, onChangeText, placeholder, error, helperText, multiline, numberOfLines, ...inputProps }: {
  label: string; required?: boolean; value: string; onChangeText: (value: string) => void; placeholder?: string;
  error?: boolean; helperText?: string; multiline?: boolean; numberOfLines?: number;
} & Omit<React.ComponentProps<typeof RNTextInput>, "value" | "onChangeText" | "placeholder" | "multiline" | "numberOfLines" | "style">) {
  return (
    <>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
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

export default function NewLeadScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: "dashboard" | "leads" }>();
  const { isAdmin } = usePermission();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const phoneRef = useRef<RNTextInput>(null);

  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent();
      parent?.setOptions({ tabBarStyle: { display: "none" } });
      return () => parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) });
    }, [navigation, insets.bottom])
  );
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]>(COUNTRIES[0]);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [scheduleFollowup, setScheduleFollowup] = useState(false);
  const [followupAt, setFollowupAt] = useState(defaultFollowupDate());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignedTo, setAssignedTo] = useState<StaffMember | null>(null);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; email?: string }>({});
  const selectedSource = SOURCES.find((item) => item.value === form.source);

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

  function errorFor(field: "name" | "phone" | "email"): string | undefined {
    if (field === "name") return !form.name.trim() ? "Enter the lead's name" : undefined;
    if (field === "phone") {
      const localDigits = form.phone.replace(/\D/g, "").replace(/^0+/, "");
      const internationalDigits = `${country.dial}${localDigits}`.replace(/\D/g, "");
      if (!localDigits) return "Enter a phone number";
      if (internationalDigits.length < 7) return "Enter a valid phone number";
      return undefined;
    }
    if (field === "email") {
      return form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? "Enter a valid email address" : undefined;
    }
    return undefined;
  }

  function validateField(field: "name" | "phone" | "email") {
    setFieldErrors((current) => ({ ...current, [field]: errorFor(field) }));
  }

  function validate() {
    const next: typeof fieldErrors = { name: errorFor("name"), phone: errorFor("phone"), email: errorFor("email") };
    setFieldErrors(next);
    return !next.name && !next.phone && !next.email;
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
      notifyLeadCreated({
        id: lead.id,
        name: form.name.trim(),
        phone: `${country.dial}${form.phone.replace(/\D/g, "").replace(/^0+/, "")}`,
        source: form.source,
      }).catch(() => {});
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

        <LabeledInput
          label="Name" required value={form.name} onChangeText={(value) => update("name", value)}
          placeholder="John Doe" autoCapitalize="words" autoComplete="name" returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()} onBlur={() => validateField("name")} editable={!saving}
          error={!!fieldErrors.name} helperText={fieldErrors.name}
        />

        <Text style={styles.label}>Mobile Number <Text style={styles.required}>*</Text></Text>
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
            returnKeyType="done" onBlur={() => validateField("phone")} editable={!saving}
          />
        </View>
        <HelperText type="error" visible={!!fieldErrors.phone}>{fieldErrors.phone}</HelperText>

        <LabeledInput
          label="Email Address" value={form.email} onChangeText={(value) => update("email", value)}
          placeholder="email@gmail.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          autoComplete="email" onBlur={() => validateField("email")} editable={!saving} error={!!fieldErrors.email} helperText={fieldErrors.email}
        />

        <Text style={styles.label}>Lead Source <Text style={styles.required}>*</Text></Text>
        <Pressable
          style={[styles.assignField, sourcePickerOpen && styles.dropdownFieldActive]}
          onPress={() => setSourcePickerOpen((value) => !value)} disabled={saving}
        >
          <Text style={styles.assignFieldText}>{selectedSource?.label || "Select a source"}</Text>
          <IconButton icon={sourcePickerOpen ? "chevron-up" : "chevron-down"} size={16} style={styles.countryChevron} />
        </Pressable>
        {sourcePickerOpen ? (
          <View style={styles.dropdownPanel}>
            {SOURCES.map((item) => {
              const selected = form.source === item.value;
              return (
                <Pressable
                  key={item.value}
                  style={[styles.dropdownItem, selected && styles.dropdownItemSelected]}
                  onPress={() => { update("source", item.value); setSourcePickerOpen(false); }}
                >
                  <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <LabeledInput
          label="Business Name" value={form.business_name} onChangeText={(value) => update("business_name", value)}
          placeholder="Company or organisation" autoCapitalize="words" editable={!saving}
        />

        <LabeledInput
          label="City" value={form.location} onChangeText={(value) => update("location", value)}
          placeholder="Lead location" autoCapitalize="words" editable={!saving}
        />

        <LabeledInput
          label="Address" value={form.address} onChangeText={(value) => update("address", value)}
          placeholder="Street address (optional)" multiline numberOfLines={3} editable={!saving}
        />

        {isAdmin ? (
          <>
            <Text style={styles.label}>Assign To</Text>
            <Pressable
              style={[styles.assignField, assignPickerOpen && styles.dropdownFieldActive]}
              onPress={() => setAssignPickerOpen((value) => !value)} disabled={saving}
            >
              <Text style={assignedTo ? styles.assignFieldText : styles.assignFieldPlaceholder}>{assignedTo ? assignedTo.name : "Assign to yourself (default)"}</Text>
              <IconButton icon={assignPickerOpen ? "chevron-up" : "chevron-down"} size={16} style={styles.countryChevron} />
            </Pressable>
            {assignPickerOpen ? (
              <View style={styles.dropdownPanel}>
                <Pressable
                  style={[styles.dropdownItem, !assignedTo && styles.dropdownItemSelected]}
                  onPress={() => { setAssignedTo(null); setAssignPickerOpen(false); }}
                >
                  <Text style={[styles.dropdownItemText, !assignedTo && styles.dropdownItemTextSelected]}>Yourself (default)</Text>
                </Pressable>
                {staff.map((member) => {
                  const selected = assignedTo?.id === member.id;
                  return (
                    <Pressable
                      key={member.id}
                      style={[styles.dropdownItem, selected && styles.dropdownItemSelected]}
                      onPress={() => { setAssignedTo(member); setAssignPickerOpen(false); }}
                    >
                      <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>{member.name}</Text>
                      <Text style={styles.dropdownItemSubtext}>{member.role}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
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

        <LabeledInput
          label="Notes" value={form.notes} onChangeText={(value) => update("notes", value)}
          placeholder="Add context for your team…" multiline numberOfLines={4} editable={!saving}
        />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button mode="outlined" onPress={closeForm} disabled={saving} style={styles.cancelButton} contentStyle={styles.bottomButtonContent}>Cancel</Button>
        <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={styles.saveButton} contentStyle={styles.bottomButtonContent}>Create lead</Button>
      </View>

      <Modal visible={countryPickerOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setCountryPickerOpen(false)}>
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

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingTop: 18 },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12, marginBottom: 12 }, errorBannerText: { color: colors.danger, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  label: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 16 },
  required: { color: colors.danger },
  inputError: { borderColor: colors.danger },
  inputBox: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, justifyContent: "center" },
  inputBoxMultiline: { paddingVertical: 12, minHeight: 84 },
  inputBoxText: { color: colors.text, fontSize: 14 },
  inputBoxTextMultiline: { minHeight: 60 },
  phoneField: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" }, countryButton: { height: "100%", flexDirection: "row", alignItems: "center", gap: 0, paddingLeft: 12, paddingRight: 2 }, countryFlag: { fontSize: 17 }, countryDial: { color: colors.text, fontSize: 13, fontWeight: "700", marginLeft: 5 }, countryChevron: { margin: 0 }, phoneDivider: { width: 1, height: 24, backgroundColor: colors.borderSoft }, phoneInput: { flex: 1, height: "100%", paddingHorizontal: 12, color: colors.text, fontSize: 14 },
  assignField: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  assignFieldText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  assignFieldPlaceholder: { color: colors.textMuted, fontSize: 14 },
  dropdownFieldActive: { borderColor: colors.primary, borderWidth: 2 },
  dropdownPanel: {
    marginTop: 6, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft,
    paddingVertical: 4, elevation: 4, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownItemSelected: { backgroundColor: colors.primarySoft },
  dropdownItemText: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  dropdownItemTextSelected: { color: colors.text, fontWeight: "700" },
  dropdownItemSubtext: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  followupToggle: { marginTop: 8, paddingHorizontal: 0 }, followupToggleText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  followupPicker: { marginTop: 4, marginBottom: 8 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSoft }, cancelButton: { width: 110 }, saveButton: { flex: 1 }, bottomButtonContent: { height: 46 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" }, countrySheet: { maxHeight: "74%", backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 9 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 13 }, sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.borderSoft }, sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800" }, countryList: { paddingHorizontal: 8 },
});
