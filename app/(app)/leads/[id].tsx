import React, { useCallback, useEffect, useRef, useState } from "react";
import { emitLeadChanged } from "@/lib/leadCreation";
import {
  Alert, Keyboard, Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, TextInput as RNTextInput, ToastAndroid, View,
} from "react-native";
import {
  ActivityIndicator, Button, IconButton, List, RadioButton, Text, TextInput,
} from "react-native-paper";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import { LeadNotes, prefetchLeadNotes } from "@/components/LeadNotes";
import { LeadDocuments } from "@/components/LeadDocuments";
import { ActivitySheetType, LeadActivitySheet } from "@/components/LeadActivitySheet";
import { useStages } from "@/hooks/useStages";
import { StaffMember, fetchStaff } from "@/api/staff";
import { telUrl } from "@/api/phone";
import { openLeadWhatsapp } from "@/api/openWhatsapp";
import {
  ContactActivityType, FollowupType, LeadActivity, LeadDetails, LeadFollowup,
  UpdateLeadInput, createLeadFollowup, fetchLeadDetails, trackContactActivity,
  updateLeadDetails, updateLeadStage, updateLeadStatus,
} from "@/api/leads";

type Tab = "overview" | "details" | "activities";

// Palette of the redesigned screen: lavender page, white cards, blue actions, green WhatsApp.
const UI = { bg: "#eef1fa", line: "#e4e9f3", field: "#dbe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", blue: "#2457e6", green: "#0f7b5f" };
type IconName = keyof typeof Ionicons.glyphMap;

const LOST_REASONS = [
  "Not interested", "Budget constraint", "Chose competitor", "Bad timing",
  "No response", "Requirement mismatch", "Other",
];

const FOLLOWUP_TYPES: { key: FollowupType; label: string; icon: string }[] = [
  { key: "call", label: "Call", icon: "phone-outline" },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp" },
  { key: "visit", label: "Visit", icon: "map-marker-outline" },
  { key: "demo", label: "Demo", icon: "video-outline" },
];

// The "Add activity" speed dial. Each choice opens the matching form (Attachment opens the file picker).
const DIAL_OPTIONS: { key: ActivitySheetType | "attachment"; label: string; icon: IconName }[] = [
  { key: "call", label: "Phone Call", icon: "call-outline" },
  { key: "message", label: "Message", icon: "chatbubble-outline" },
  { key: "meeting", label: "Meeting", icon: "calendar-outline" },
  { key: "note", label: "Note", icon: "document-outline" },
  { key: "attachment", label: "Attachment", icon: "attach-outline" },
];

const ACTIVITY_ICON: Record<string, IconName> = {
  call: "call", whatsapp: "logo-whatsapp", visit: "location", email: "mail",
  note: "document-text", followup_scheduled: "calendar", followup_completed: "checkmark-done",
  demo_scheduled: "videocam", demo_completed: "checkmark-done",
};

function pretty(value?: string) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function relativeTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function money(value?: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function FieldGroup({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

function StaticBox({ icon, iconColor, value }: { icon: IconName; iconColor?: string; value: string }) {
  return (
    <View style={styles.inputArea}>
      <Ionicons name={icon} size={16} color={iconColor || colors.textSecondary} style={styles.inputIcon} />
      <Text style={styles.inputAreaText} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionBox({ icon, value, chip, placeholder = "Not set", onPress }: {
  icon: IconName; value?: string; chip?: { bg: string; text: string; label: string }; placeholder?: string; onPress: () => void;
}) {
  return (
    <View style={styles.inputArea}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} style={styles.inputIcon} />
      {chip ? (
        <View style={styles.chipWrap}>
          <View style={[styles.statusChip, { backgroundColor: chip.bg }]}><Text style={[styles.statusChipText, { color: chip.text }]}>{chip.label}</Text></View>
        </View>
      ) : (
        <Text style={styles.inputAreaText} numberOfLines={1}>{value || placeholder}</Text>
      )}
      <IconButton icon="pencil" size={13} style={styles.pencilButton} onPress={onPress} />
    </View>
  );
}

// Hoisted so the field's props stay the same between redraws of the page and the memoized field is skipped.
const validateAmount = (value: string) => value && !/^\d+(\.\d+)?$/.test(value.replace(/[,₹\s]/g, "")) ? "Enter a valid amount." : null;

const SCORE_BADGE = {
  hot: { label: "HOT", color: "#b91c1c", bg: "#fde1e1" },
  warm: { label: "WARM", color: "#b45309", bg: "#fdecc0" },
  cold: { label: "COLD", color: "#2457e6", bg: "#dbe8fb" },
} as const;

type ProfileDraft = { name: string; phone: string; email: string; business_name: string; location: string; source: string; address: string };

// Like the web lead page: a read-only summary where empty fields read "Add … →" (tap to start editing),
// and a pencil that turns the whole card into one form with ✕ / ✓.
const LeadProfileCard = React.memo(function LeadProfileCard({ lead, onSave }: { lead: LeadDetails; onSave: (values: Partial<Record<keyof UpdateLeadInput, string>>) => Promise<void> }) {
  const fromLead = (): ProfileDraft => ({
    name: lead.name || "", phone: lead.phone || "", email: lead.email || "", business_name: lead.business_name || "",
    location: lead.location || "", source: lead.source || "", address: lead.address || "",
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(fromLead);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const score = lead.lead_score ? SCORE_BADGE[lead.lead_score] : null;

  function startEdit() { setDraft(fromLead()); setError(""); setEditing(true); }
  function cancel() { if (!saving) { setError(""); setEditing(false); } }
  const set = (key: keyof ProfileDraft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    const next = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])) as ProfileDraft;
    if (!next.name) { setError("Name is required."); return; }
    if (!next.phone) { setError("Phone number is required."); return; }
    if (next.email && !/^\S+@\S+\.\S+$/.test(next.email)) { setError("Enter a valid email address."); return; }
    const before = fromLead();
    const changed = (Object.keys(next) as (keyof ProfileDraft)[]).filter((key) => next[key] !== before[key]);
    if (!changed.length) { setEditing(false); return; }
    // Close at once (the page already shows the new values); reopen with what was typed and the error if the server refuses.
    setError(""); setEditing(false); setSaving(true);
    try {
      await onSave(Object.fromEntries(changed.map((key) => [key, next[key]])));
    } catch (saveError) {
      setDraft(next); setEditing(true);
      setError(errorMessage(saveError, "Could not save. Please try again."));
    } finally { setSaving(false); }
  }

  const input = (label: string, key: keyof ProfileDraft, extra?: { required?: boolean; keyboardType?: React.ComponentProps<typeof RNTextInput>["keyboardType"]; multiline?: boolean; placeholder?: string }) => (
    <View style={profile.cell}>
      <Text style={profile.label}>{label}{extra?.required ? <Text style={{ color: colors.danger }}> *</Text> : null}</Text>
      <RNTextInput
        style={[profile.input, extra?.multiline && profile.inputMulti]} value={draft[key]} onChangeText={set(key)} editable={!saving}
        keyboardType={extra?.keyboardType} multiline={extra?.multiline} textAlignVertical={extra?.multiline ? "top" : "center"}
        placeholder={extra?.placeholder} placeholderTextColor={colors.textMuted} autoCapitalize={key === "email" ? "none" : undefined}
      />
    </View>
  );

  const row = (icon: React.ComponentProps<typeof Ionicons>["name"], value: string | undefined, addLabel: string) => (
    <Pressable style={profile.row} onPress={value ? undefined : startEdit} accessibilityRole={value ? undefined : "button"}>
      <Ionicons name={icon} size={16} color={UI.muted} />
      {value ? <Text style={profile.rowValue} numberOfLines={3}>{value}</Text> : <Text style={profile.rowAdd}>{addLabel} →</Text>}
    </Pressable>
  );

  return (
    <View style={styles.card}>
      <View style={profile.top}>
        <View style={{ flex: 1 }}>
          {lead.lead_number ? <Text style={profile.code}>{lead.lead_number}</Text> : null}
          {editing ? (
            <RNTextInput style={profile.nameInput} value={draft.name} onChangeText={set("name")} editable={!saving} placeholder="Name" placeholderTextColor={colors.textMuted} />
          ) : (
            <Text style={profile.name} numberOfLines={2}>{lead.name}</Text>
          )}
          {score ? <View style={[profile.badge, { backgroundColor: score.bg }]}><Text style={[profile.badgeText, { color: score.color }]}>{score.label}</Text></View> : null}
        </View>
        {editing ? (
          <View style={profile.actions}>
            <Pressable onPress={cancel} disabled={saving} hitSlop={8} style={profile.actionBtn} accessibilityRole="button" accessibilityLabel="Cancel editing">
              <Ionicons name="close" size={18} color={UI.sub} />
            </Pressable>
            <Pressable onPress={save} disabled={saving} hitSlop={8} style={[profile.actionBtn, profile.actionSave]} accessibilityRole="button" accessibilityLabel="Save lead details">
              {saving ? <ActivityIndicator size="small" color={UI.blue} /> : <Ionicons name="checkmark" size={18} color={UI.blue} />}
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={startEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit lead details">
            <Ionicons name="pencil-outline" size={18} color={UI.ink} />
          </Pressable>
        )}
      </View>

      {error ? <Text style={profile.error}>{error}</Text> : null}

      {editing ? (
        <View style={{ marginTop: 12 }}>
          <View style={profile.pair}>{input("Phone", "phone", { required: true, keyboardType: "phone-pad" })}{input("Email", "email", { keyboardType: "email-address", placeholder: "email@gmail.com" })}</View>
          <View style={profile.pair}>{input("Business Name", "business_name")}{input("Location", "location")}</View>
          <View style={profile.pair}>{input("Lead Source", "source")}</View>
          {input("Address", "address", { multiline: true })}
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          {row("business-outline", lead.business_name, "Add business name")}
          {row("call-outline", lead.phone, "Add phone")}
          {row("mail-outline", lead.email, "Add email")}
          {row("location-outline", lead.location, "Add city")}
          {row("navigate-outline", lead.address, "Add address")}
          {lead.source ? (
            <View style={profile.sourceBlock}>
              <Text style={profile.label}>Source</Text>
              <Text style={profile.rowValue}>{lead.source}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
});

const profile = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  code: { color: UI.muted, fontSize: 11, fontFamily: "monospace", marginBottom: 4 },
  name: { color: UI.ink, fontSize: 20, fontFamily: "Inter_700Bold" },
  nameInput: { color: UI.ink, fontSize: 20, fontFamily: "Inter_700Bold", paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: UI.field },
  badge: { alignSelf: "flex-start", marginTop: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionSave: { backgroundColor: "#eef1fa" },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  rowValue: { flex: 1, color: UI.ink, fontSize: 14 },
  rowAdd: { flex: 1, color: UI.blue, fontSize: 13 },
  sourceBlock: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: UI.line },
  pair: { flexDirection: "row", gap: 12 },
  cell: { flex: 1, marginBottom: 12 },
  label: { color: UI.sub, fontSize: 12, marginBottom: 6 },
  input: { minHeight: 42, borderWidth: 1, borderColor: UI.field, borderRadius: 10, paddingHorizontal: 12, color: UI.ink, fontSize: 14, backgroundColor: "#ffffff" },
  inputMulti: { minHeight: 70, paddingTop: 10 },
});

// The Overview "Lead details" card. The pencil turns the editable fields (notes, expected value, source) into inputs
// all at once; ✓ saves them in one request and ✕ throws the changes away. Typing stays inside this card, so the page behind doesn't redraw.
type DetailsDraft = { notes: string; deal_value: string; source: string };

const LeadDetailsCard = React.memo(function LeadDetailsCard({ lead, onSave, top, middle, bottom }: {
  lead: LeadDetails; onSave: (values: Partial<Record<keyof UpdateLeadInput, string>>) => Promise<void>;
  top: React.ReactNode; middle: React.ReactNode; bottom: React.ReactNode;
}) {
  const fromLead = (): DetailsDraft => ({ notes: lead.notes || "", deal_value: lead.deal_value ? String(lead.deal_value) : "", source: lead.source || "" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DetailsDraft>(fromLead);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() { setDraft(fromLead()); setError(""); setEditing(true); }
  function cancel() { if (!saving) { setError(""); setEditing(false); } }
  const set = (key: keyof DetailsDraft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    const next = { notes: draft.notes.trim(), deal_value: draft.deal_value.trim(), source: draft.source.trim() };
    const amountError = validateAmount(next.deal_value);
    if (amountError) { setError(amountError); return; }
    const before = fromLead();
    const changed = (Object.keys(next) as (keyof DetailsDraft)[]).filter((key) => next[key] !== before[key]);
    if (!changed.length) { setError(""); setEditing(false); return; }
    // Close at once (the page already shows the new values); reopen with what was typed and the error if the server refuses.
    setError(""); setEditing(false); setSaving(true);
    try {
      await onSave(Object.fromEntries(changed.map((key) => [key, next[key]])));
    } catch (saveError) {
      setDraft(next); setEditing(true);
      setError(errorMessage(saveError, "Could not save. Please try again."));
    } finally { setSaving(false); }
  }

  const field = (label: string, icon: IconName, key: keyof DetailsDraft, shown: string, extra?: { multiline?: boolean; placeholder?: string; keyboardType?: React.ComponentProps<typeof RNTextInput>["keyboardType"] }) => (
    <FieldGroup label={label}>
      <View style={[styles.inputArea, extra?.multiline && styles.inputAreaMultiline]}>
        <Ionicons name={icon} size={16} color={colors.textSecondary} style={[styles.inputIcon, extra?.multiline && styles.inputIconTop]} />
        {editing ? (
          <RNTextInput
            style={[styles.inputAreaText, extra?.multiline && styles.inputAreaTextMultiline]} value={draft[key]} onChangeText={set(key)}
            multiline={extra?.multiline} keyboardType={extra?.keyboardType} textAlignVertical={extra?.multiline ? "top" : "center"}
            placeholder={extra?.placeholder} placeholderTextColor={colors.textMuted} editable={!saving}
          />
        ) : (
          <Text style={[styles.inputAreaText, !shown && { color: UI.muted }]} numberOfLines={extra?.multiline ? 4 : 1}>{shown || extra?.placeholder || "Not added"}</Text>
        )}
      </View>
    </FieldGroup>
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderSplit}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="document-text-outline" size={16} color={UI.ink} />
          <Text style={styles.cardTitle}>Lead details</Text>
        </View>
        {editing ? (
          <View style={profile.actions}>
            <Pressable onPress={cancel} disabled={saving} hitSlop={8} style={profile.actionBtn} accessibilityRole="button" accessibilityLabel="Cancel editing">
              <Ionicons name="close" size={18} color={UI.sub} />
            </Pressable>
            <Pressable onPress={save} disabled={saving} hitSlop={8} style={[profile.actionBtn, profile.actionSave]} accessibilityRole="button" accessibilityLabel="Save lead details">
              {saving ? <ActivityIndicator size="small" color={UI.blue} /> : <Ionicons name="checkmark" size={18} color={UI.blue} />}
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={startEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit lead details">
            <Ionicons name="pencil-outline" size={16} color={UI.sub} />
          </Pressable>
        )}
      </View>

      {error ? <Text style={profile.error}>{error}</Text> : null}

      {top}
      {field("Notes", "chatbubble-ellipses-outline", "notes", lead.notes || "", { multiline: true, placeholder: "Add useful context for your team…" })}
      {middle}
      <View style={{ height: 14 }} />
      {field("Expected Value", "wallet-outline", "deal_value", lead.deal_value ? String(lead.deal_value) : "", { keyboardType: "decimal-pad", placeholder: "0" })}
      {!editing && lead.deal_value ? <Text style={styles.moneyHint}>{money(lead.deal_value)}</Text> : null}
      {field("Source", "megaphone-outline", "source", lead.source || "", { placeholder: "Add lead source" })}
      {bottom}
    </View>
  );
});

const ActivityItem = React.memo(function ActivityItem({ item, last }: { item: LeadActivity; last: boolean }) {
  const icon = ACTIVITY_ICON[item.activity_type || ""] || "ellipse";
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={styles.timelineDot}><Ionicons name={icon} size={13} color={colors.surface} /></View>
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={[styles.timelineCopy, last && styles.timelineCopyLast]}>
        <Text style={styles.timelineTitle}>{item.title || pretty(item.activity_type)}</Text>
        <Text style={styles.timelineMeta}>{relativeTime(item.created_at)}{item.created_by_name ? ` · by ${item.created_by_name}` : ""}</Text>
        {item.description ? <Text style={styles.timelineDescription}>{item.description}</Text> : null}
      </View>
    </View>
  );
});

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={22} color={colors.textSecondary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

type FollowupValues = { type: FollowupType; at: Date; notes: string; meetingUrl: string };

// The follow-up form keeps what is being typed in its own state, so each keystroke redraws only this sheet and not the whole
// lead page behind it.
// True while the follow-up sheet is on screen: the page behind it skips keyboard resizing, which it can't be seen doing.
let followupSheetShowing = false;

type FollowupSheetHandle = { open: (initial?: FollowupValues | null) => void };

// It owns whether it is open, so opening and closing it never redraws the lead page behind it.
const FollowupSheet = React.memo(React.forwardRef<FollowupSheetHandle, {
  saving: boolean; bottomInset: number; onSubmit: (values: FollowupValues) => void;
}>(function FollowupSheet({ saving, bottomInset, onSubmit }, ref) {
  const [visible, setVisible] = useState(false);
  const [type, setType] = useState<FollowupType>("call");
  const [at, setAt] = useState(defaultFollowupDate());
  const [notes, setNotes] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const onClose = () => setVisible(false);
  useEffect(() => { followupSheetShowing = visible; return () => { followupSheetShowing = false; }; }, [visible]);

  // Every open starts fresh, or with the values of a save that just failed.
  React.useImperativeHandle(ref, () => ({
    open: (initial) => {
      setType(initial?.type ?? "call"); setAt(initial?.at ?? defaultFollowupDate());
      setNotes(initial?.notes ?? ""); setMeetingUrl(initial?.meetingUrl ?? ""); setTypePickerOpen(false);
      setVisible(true);
    },
  }), []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  function submit() {
    if (at.getTime() < Date.now() - 60000) {
      Alert.alert("Choose a future time", "The follow-up date and time must be in the future.");
      return;
    }
    setVisible(false);
    onSubmit({ type, at, notes, meetingUrl });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !saving && onClose()}>
      <Pressable style={styles.sheetBackdrop} onPress={() => { Keyboard.dismiss(); if (!saving) onClose(); }}>
        <Pressable style={[styles.sheet, { paddingBottom: bottomInset + keyboardHeight }]} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Schedule Follow-up</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            <Text style={styles.fieldLabel}>Date &amp; Time<Text style={styles.required}> *</Text></Text>
            <DateTimeField value={at} onChange={setAt} minimumDate={new Date()} />

            <Text style={[styles.fieldLabel, styles.fieldLabelGap]}>Type</Text>
            <Pressable style={[styles.selectField, typePickerOpen && { borderColor: UI.blue }]} onPress={() => { Keyboard.dismiss(); setTypePickerOpen((open) => !open); }} accessibilityRole="button" accessibilityLabel="Follow-up type" accessibilityState={{ expanded: typePickerOpen }}>
              <Text style={styles.selectText}>{FOLLOWUP_TYPES.find((item) => item.key === type)?.label}</Text>
              <Ionicons name={typePickerOpen ? "chevron-up" : "chevron-down"} size={16} color={UI.sub} />
            </Pressable>
            {typePickerOpen ? (
              <View style={styles.dropdownList}>
                {FOLLOWUP_TYPES.map((item, index) => {
                  const selected = item.key === type;
                  return (
                    <Pressable key={item.key} style={[styles.dropdownItem, index > 0 && styles.dropdownItemDivider, selected && styles.pickerItemSelected]} onPress={() => { setType(item.key); setTypePickerOpen(false); }} accessibilityRole="menuitem">
                      <Text style={[styles.pickerItemText, selected && { color: UI.blue, fontWeight: "800" }]}>{item.label}</Text>
                      {selected ? <Ionicons name="checkmark" size={16} color={UI.blue} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {type === "demo" ? (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelGap]}>Meeting link (optional)</Text>
                <RNTextInput style={styles.textField} value={meetingUrl} onChangeText={setMeetingUrl} placeholder="https://meet.google.com/…" placeholderTextColor={UI.muted} autoCapitalize="none" keyboardType="url" />
              </>
            ) : null}

            <Text style={[styles.fieldLabel, styles.fieldLabelGap]}>Notes (optional)</Text>
            <RNTextInput style={styles.textField} value={notes} onChangeText={setNotes} placeholder="e.g. Discuss pricing" placeholderTextColor={UI.muted} />
          </ScrollView>

          <Pressable style={[styles.primaryButton, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving} accessibilityRole="button">
            {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
            <Text style={styles.primaryButtonText}>Schedule Follow-up</Text>
          </Pressable>
          <Button mode="outlined" onPress={onClose} disabled={saving} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}));

// Details already opened this session, so reopening a lead shows it at once while a fresh copy loads.
const detailCache = new Map<string, Awaited<ReturnType<typeof fetchLeadDetails>>>();

export default function LeadDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string; phone?: string; stage?: string; source?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const storageKey = id && user?.id ? `curvelead_lead_${user.id}_${id}` : null;
  const saved = id ? detailCache.get(id) : undefined;
  const [lead, setLead] = useState<LeadDetails | null>(() => saved ? saved.lead : params.name && params.phone ? {
    id, name: params.name, phone: params.phone, stage: params.stage || "new", source: params.source,
    created_at: "",
  } : null);
  const [activities, setActivities] = useState<LeadActivity[]>(saved?.activities ?? []);
  const [followups, setFollowups] = useState<LeadFollowup[]>(saved?.followups ?? []);
  const [tab, setTab] = useState<Tab>("overview");
  // A long history is drawn 30 at a time, so a lead with hundreds of activities opens fast.
  const [activityLimit, setActivityLimit] = useState(30);
  const [loading, setLoading] = useState(!params.name && !saved);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  // False while only the name/phone/stage passed from the previous screen are known.
  const [detailsLoaded, setDetailsLoaded] = useState(!!saved);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => { if (!followupSheetShowing) setKeyboardHeight(event.endCoordinates.height); });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Bring a form that sits below the keyboard up to just under the header.
  const revealInScroll = useCallback((view: View | null) => {
    setTimeout(() => {
      view?.measureInWindow((_x, y) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - 130), animated: true });
      });
    }, 250);
  }, []);

  const { stages, colorFor, statusesFor, loading: stagesLoading } = useStages();
  const [stageSheetOpen, setStageSheetOpen] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [lostReasonStep, setLostReasonStep] = useState(false);
  const [pendingLostStage, setPendingLostStage] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [customLostReason, setCustomLostReason] = useState("");

  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");

  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const followupSheet = useRef<FollowupSheetHandle>(null);
  const scheduleLatest = useRef<(values: FollowupValues) => void>(() => {});
  const scheduleFollowupStable = useCallback((values: FollowupValues) => scheduleLatest.current(values), []);
  const [schedulingFollowup, setSchedulingFollowup] = useState(false);
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [fabOpen, setFabOpen] = useState(false);
  const [attachSignal, setAttachSignal] = useState(0);
  const [activitySheet, setActivitySheet] = useState<ActivitySheetType | null>(null);
  const [notesSignal, setNotesSignal] = useState(0);

  const notesPrefetchedFor = useRef<string | null>(null);
  const load = useCallback(async (refresh = false) => {
    if (!id) { setError("This lead link is invalid."); setLoading(false); return; }
    if (refresh) setRefreshing(true); else if (!detailCache.has(id)) setLoading(true);
    setError(""); setNotFound(false);
    // Notes load alongside the lead instead of waiting for it, so they're ready when the section appears.
    // Only the first time: the notes section reloads itself after a change, so every later reload of the lead (after a stage,
    // status or note change) asking for the notes again just added more waiting requests.
    if (!refresh && notesPrefetchedFor.current !== id) { notesPrefetchedFor.current = id; prefetchLeadNotes(id); }
    try {
      const result = await fetchLeadDetails(id);
      detailCache.set(id, result);
      if (detailCache.size > 30) detailCache.delete(detailCache.keys().next().value as string);
      if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify({ ...result, activities: result.activities.slice(0, 100) })).catch(() => {});
      setLead(result.lead); setActivities(result.activities); setFollowups(result.followups);
      setDetailsLoaded(true);
    } catch (loadError) {
      // A notification can point at a lead that has since been deleted — say so instead of "tap to retry".
      setNotFound(axios.isAxiosError(loadError) && loadError.response?.status === 404);
      setError(errorMessage(loadError, "Could not load this lead."));
    } finally { setLoading(false); setRefreshing(false); }
  }, [id, storageKey]);

  // After the app was restarted nothing is in memory: show the details saved on the phone while the fresh copy loads.
  useEffect(() => {
    if (!id || !storageKey || detailCache.has(id)) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (cancelled || !raw || detailCache.has(id)) return; // the fresh copy already arrived
      const stored = JSON.parse(raw) as Awaited<ReturnType<typeof fetchLeadDetails>>;
      if (!stored?.lead) return;
      setLead(stored.lead); setActivities(stored.activities ?? []); setFollowups(stored.followups ?? []);
      setDetailsLoaded(true); setLoading(false);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, storageKey]);

  useEffect(() => { load(); }, [load]);
  // Tell the leads list about every change to this lead right away, so going back shows it without waiting for the list to reload.
  // The first value this page shows is not a change (it may be an older saved copy), so only later ones are sent.
  const announcedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!lead) return;
    if (announcedFor.current !== lead.id) { announcedFor.current = lead.id; return; }
    const { id: leadId, name, phone, email, source, stage, lead_status, lead_score, assigned_to_name, next_followup_at } = lead;
    const fields = { name, phone, email, source, stage, lead_status, lead_score, assigned_to_name, next_followup_at };
    emitLeadChanged({ id: leadId, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) });
  }, [lead]);
  // Stable callbacks, so the memoized notes and documents sections don't redraw whenever this screen does.
  const reloadQuietly = useCallback(() => { load(); }, [load]);
  const reloadWithSpinner = useCallback(() => { load(true); }, [load]);

  function openUrl(url: string, fallback: string) {
    Linking.openURL(url).catch(() => Alert.alert("Unable to open", fallback));
  }

  async function contactLead(type: ContactActivityType, url: string, fallback: string) {
    if (!lead) return;
    // The dialer / WhatsApp / mail app opens at once; logging the activity runs alongside instead of making the tap wait for the server.
    openUrl(url, fallback);
    try {
      await trackContactActivity(lead.id, type);
      // Only show the activity once the server has it, so the list never lists something that wasn't saved.
      setActivities((current) => [{
        id: `local-${type}-${Date.now()}`,
        activity_type: type,
        title: type === "call" ? "Call Initiated" : type === "whatsapp" ? "WhatsApp Opened" : "Email Initiated",
        description: "Contact initiated from the CurveLead mobile app.",
        created_at: new Date().toISOString(),
      }, ...current]);
    } catch { /* best-effort: the call or message still goes ahead */ }
  }

  function openEmailAction() {
    if (!lead) return;
    if (lead.email) {
      contactLead("email", `mailto:${lead.email}`, "Email could not be opened.");
      return;
    }
    setEmailDraft("");
    setEmailError("");
    setEmailSheetOpen(true);
  }

  async function saveEmailAndOpen() {
    if (!lead) return;
    const email = emailDraft.trim();
    if (!email) { setEmailError("Enter an email address."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setEmailError("Enter a valid email address."); return; }
    setSavingEmail(true); setEmailError("");
    try {
      const updated = await updateLeadDetails(lead.id, { email });
      setLead((current) => current ? { ...current, ...updated } : updated);
      setEmailSheetOpen(false);
      await contactLead("email", `mailto:${email}`, "Email could not be opened.");
    } catch (saveEmailError) {
      setEmailError(errorMessage(saveEmailError, "Could not save this email. Please try again."));
    } finally { setSavingEmail(false); }
  }

  // Stable callbacks, so the memoized profile card and fields aren't redrawn whenever this page is.
  const saveFieldsLatest = useRef<(values: Partial<Record<keyof UpdateLeadInput, string>>) => Promise<void>>(async () => {});
  const saveFieldsStable = useCallback((values: Partial<Record<keyof UpdateLeadInput, string>>) => saveFieldsLatest.current(values), []);

  // Several fields go in one request (the profile card used to send one per field, one after another).
  async function saveFields(values: Partial<Record<keyof UpdateLeadInput, string>>) {
    if (!lead) return;
    const payload = Object.fromEntries(Object.entries(values).map(([field, value]) => [
      field, field === "deal_value" ? (value ? Number(String(value).replace(/[^\d.]/g, "")) : 0) : value,
    ])) as UpdateLeadInput;
    const previous = lead;
    setLead((current) => current ? { ...current, ...payload } as LeadDetails : current);
    try {
      const updated = await updateLeadDetails(lead.id, payload);
      // The page already shows what was typed; redraw it again only if the server changed any of it.
      const same = (Object.keys(payload) as (keyof UpdateLeadInput)[]).every((key) => (updated as unknown as Record<string, unknown>)[key] === (payload as Record<string, unknown>)[key]);
      if (!same) setLead((current) => current ? { ...current, ...updated } : updated);
      detailCache.delete(lead.id);
      // The copy saved on the phone still has the old values; drop it so a restart doesn't flash them before the fresh copy arrives.
      if (storageKey) AsyncStorage.removeItem(storageKey).catch(() => {});
    } catch (saveError) {
      setLead(previous);
      throw saveError;
    }
  }

  saveFieldsLatest.current = saveFields;

  // Fetch the team list quietly once the lead is on screen, so "Assign lead" opens with names already there.
  useEffect(() => {
    if (!detailsLoaded || staff.length) return;
    let cancelled = false;
    fetchStaff().then((list) => { if (!cancelled) setStaff(list.filter((member) => member.is_active !== false)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [detailsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openAssignSheet() {
    setAssignSheetOpen(true);
    if (staff.length || staffLoading) return;
    setStaffLoading(true); setStaffError("");
    try { setStaff((await fetchStaff()).filter((member) => member.is_active !== false)); }
    catch (staffErr) { setStaffError(errorMessage(staffErr, "Could not load your team.")); }
    finally { setStaffLoading(false); }
  }

  async function assignTo(member: StaffMember | null) {
    if (!lead || assigning) return;
    if ((member?.id || null) === (lead.assigned_to || null)) { setAssignSheetOpen(false); return; }
    const previous = lead;
    setLead({ ...lead, assigned_to: member?.id, assigned_to_name: member?.name });
    setAssignSheetOpen(false);
    setAssigning(true);
    try {
      await updateLeadDetails(lead.id, { assigned_to: member ? member.id : null });
      load();
    } catch (assignError) {
      setLead(previous);
      Alert.alert("Couldn't assign lead", errorMessage(assignError, "You may not have permission to do this."));
    } finally { setAssigning(false); }
  }

  function openStageSheet() {
    setLostReasonStep(false); setPendingLostStage(null);
    setLostReason(""); setCustomLostReason("");
    setStageSheetOpen(true);
  }

  function closeStageSheet() {
    if (updatingStage) return;
    setStageSheetOpen(false); setLostReasonStep(false);
  }

  async function applyStageChange(newStage: string, reason?: string) {
    if (!lead) return;
    // Apply instantly and close the sheet; roll back if the server refuses.
    const previous = lead;
    setLead({ ...lead, stage: newStage, lead_status: "" });
    setStageSheetOpen(false); setLostReasonStep(false);
    setUpdatingStage(true);
    try {
      const updated = await updateLeadStage(lead.id, newStage, reason);
      setLead((current) => current ? { ...current, ...updated, lead_status: "" } : updated);
      load();
    } catch (stageError) {
      setLead(previous);
      Alert.alert("Couldn't update stage", errorMessage(stageError, "Please try again."));
    } finally { setUpdatingStage(false); }
  }

  function selectStage(stageOption: { name: string; is_lost?: boolean }) {
    if (!lead) return;
    const value = stageOption.name.toLowerCase();
    if (value === (lead.stage || "").toLowerCase() || updatingStage) { setStageSheetOpen(false); return; }
    if (stageOption.is_lost) {
      setPendingLostStage(value); setLostReasonStep(true);
      return;
    }
    applyStageChange(value);
  }

  function confirmLostStage() {
    if (!pendingLostStage) return;
    const reason = lostReason === "Other" ? (customLostReason.trim() || "Other") : lostReason;
    if (!reason) return;
    applyStageChange(pendingLostStage, reason);
  }

  async function changeStatus(status: string) {
    if (!lead) return;
    // Apply instantly and close the sheet; roll back if the server refuses.
    const previous = lead;
    setLead({ ...lead, lead_status: status });
    setStatusSheetOpen(false);
    setUpdatingStatus(true);
    try {
      const updated = await updateLeadStatus(lead.id, status);
      setLead((current) => current ? { ...current, ...updated } : updated);
      load();
    } catch (statusError) {
      setLead(previous);
      Alert.alert("Couldn't update status", errorMessage(statusError, "Please try again."));
    } finally { setUpdatingStatus(false); }
  }

  async function scheduleFollowup(values: FollowupValues) {
    if (!lead) return;
    // Close the sheet at once; the server saves in the background and the sheet comes back if it refuses.
    const typeLabel = FOLLOWUP_TYPES.find((item) => item.key === values.type)?.label || "Follow-up";
    const message = `${typeLabel} on ${dateTime(values.at.toISOString())}.`;
    setSchedulingFollowup(true);
    // Show the follow-up on the screen right away; the server's copy replaces it when it answers.
    const tempId = `temp-${Date.now()}`;
    const previous = followups;
    setFollowups((current) => [
      { id: tempId, followup_type: values.type, next_followup_at: values.at.toISOString(), notes: values.notes.trim() || undefined, is_completed: false },
      ...current.map((item) => ({ ...item, is_completed: true })),
    ]);
    // On Android a small toast confirms at once; it doesn't block the screen like an alert would.
    if (Platform.OS === "android") ToastAndroid.show(`Follow-up scheduled: ${message}`, ToastAndroid.SHORT);
    try {
      const created = await createLeadFollowup(lead.id, {
        followup_type: values.type,
        next_followup_at: values.at.toISOString(),
        notes: values.notes.trim() || undefined,
        meeting_url: values.type === "demo" ? values.meetingUrl.trim() || undefined : undefined,
      });
      setFollowups((current) => current.map((item) => item.id === tempId ? created : item));
      if (Platform.OS !== "android") setTimeout(() => Alert.alert("Follow-up scheduled", message), 100);
      load();
    } catch (followupError) {
      setFollowups(previous);
      followupSheet.current?.open(values);
      setTimeout(() => Alert.alert("Couldn't schedule follow-up", errorMessage(followupError, "Please try again.")), 100);
    } finally { setSchedulingFollowup(false); }
  }

  scheduleLatest.current = scheduleFollowup;

  function chooseDialOption(key: ActivitySheetType | "attachment") {
    setFabOpen(false);
    // Wait for the menu to close first: Android drops sheets opened while a Modal is still dismissing.
    if (key === "attachment") { setTimeout(addAttachment, 250); return; }
    setTimeout(() => setActivitySheet(key), 180);
  }

  function addAttachment() {
    setTab("overview");
    // Give the Documents section time to mount before asking it to open the picker.
    setTimeout(() => setAttachSignal((value) => value + 1), 150);
  }

  if (loading && !lead) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Loading lead…</Text></View>;
  }

  if (!lead) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn&apos;t open lead</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
        <Button mode="text" onPress={() => router.back()} style={styles.backLink}>Back to leads</Button>
      </View>
    );
  }

  // The tab bar floats over this screen (see tabBarStyleFor), so the button sits above it.
  const fabBottom = 64 + Math.max(insets.bottom, 8) + 16;
  const stage = lead.stage || "";
  const stageColors = colorFor(stage);
  const currentStage = stages.find((item) => item.name.toLowerCase() === stage.toLowerCase());
  // Chat isn't a tab of this screen: it opens the WhatsApp conversation, so it is the last stop of the arrows.
  const TAB_ORDER = [["overview", "Overview"], ["details", "Details"], ["activities", "Activities"], ["chat", "Chat"]] as const;
  const openTab = (key: (typeof TAB_ORDER)[number][0]) => key === "chat"
    ? router.push({ pathname: "/(app)/more/whatsapp", params: { leadId: lead.id, name: lead.name, phone: lead.phone, openAt: String(Date.now()) } })
    : setTab(key);

  const availableStatuses = statusesFor(stage);
  const pendingFollowups = followups.filter((item) => !item.is_completed);
  const nextFollowup = pendingFollowups.sort((a, b) => new Date(a.next_followup_at).getTime() - new Date(b.next_followup_at).getTime())[0];
  const lastActivity = activities[0];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.navButton, styles.navLeft]} accessibilityRole="button" accessibilityLabel="Back to leads">
          <Ionicons name="chevron-back" size={20} color={UI.ink} />
          <Text style={styles.navName} numberOfLines={1}>Leads</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Lead details</Text>
        <View style={styles.navButton} />
      </View>

      <ScrollView
        ref={scrollRef} keyboardShouldPersistTaps="handled" scrollEventThrottle={16}
        onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
        // Android already resizes the screen for the keyboard; adding the keyboard height again moved everything twice.
        contentContainerStyle={{ paddingBottom: insets.bottom + 150 + (Platform.OS === "ios" ? keyboardHeight : 0) }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={UI.blue} colors={[UI.blue]} />}
      >
        {error ? <Pressable style={styles.warning} onPress={() => notFound ? router.back() : load()}><Text style={styles.warningText}>{notFound ? "This lead no longer exists — it may have been deleted. Tap to go back." : "Some details couldn't be refreshed. Tap to retry."}</Text></Pressable> : null}

        <View style={styles.leadCard}>
          <View style={styles.leadHead}>
            <View style={styles.leadAvatar}><Text style={styles.leadAvatarText}>{(lead.name?.charAt(0) || "?").toUpperCase()}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={2}>{lead.name}</Text>
              <Text style={styles.nameSubtitle} numberOfLines={1}>{lead.lead_number ? `${lead.lead_number} · ` : ""}Assigned to staff: {lead.assigned_to_name || "you"}</Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            {lead.lead_score ? (
              <View style={[styles.badge, { backgroundColor: lead.lead_score === "hot" ? "#fde1e1" : lead.lead_score === "warm" ? "#fde9c9" : "#dbe8fb" }]}>
                <Text style={[styles.badgeText, { color: lead.lead_score === "hot" ? "#b91c1c" : lead.lead_score === "warm" ? "#c2710c" : UI.blue }]}>{lead.lead_score.toUpperCase()}</Text>
              </View>
            ) : null}
            <View style={[styles.badge, { backgroundColor: stageColors.bg }]}>
              <Text style={[styles.badgeText, { color: stageColors.text }]}>{currentStage?.name || pretty(stage)}</Text>
            </View>
          </View>
          <View style={styles.actionsRow}>
            <Pressable style={[styles.actionButton, { backgroundColor: UI.blue }]} onPress={() => contactLead("call", telUrl(lead.phone), "Calling is not supported on this device.")} accessibilityRole="button">
              <Ionicons name="call-outline" size={16} color="#fff" /><Text style={styles.actionLabel}>Call</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, { backgroundColor: UI.green }]} onPress={() => openLeadWhatsapp(lead)} accessibilityRole="button">
              <Ionicons name="logo-whatsapp" size={16} color="#fff" /><Text style={styles.actionLabel}>WhatsApp</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionButtonLight]} onPress={openEmailAction} accessibilityRole="button">
              <Ionicons name="mail-outline" size={16} color={UI.blue} /><Text style={[styles.actionLabel, { color: UI.blue }]}>Email</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabs}>
          {([["overview", "Overview"], ["details", "Details"], ["activities", "Activities"], ["chat", "Chat"]] as const).map(([key, label]) => {
            const active = key === tab;
            return (
              <Pressable
                key={key} style={[styles.tabButton, active && styles.tabButtonActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}
                onPress={() => openTab(key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* The overview stays mounted (just hidden) on the other tabs, so coming back to it doesn't rebuild and reload Notes and Documents. */}
        <View style={[styles.body, tab !== "overview" && { display: "none" }]}>
            {(() => {
              const overdue = !!nextFollowup && new Date(nextFollowup.next_followup_at).getTime() < Date.now();
              const tone = overdue ? colors.danger : UI.blue;
              return (
                <Pressable
                  style={[styles.followupBanner, { borderColor: overdue ? "#f4b4b4" : "#bcd0f5", backgroundColor: overdue ? "#fff0f0" : "#f3f7ff" }]}
                  onPress={() => { Keyboard.dismiss(); followupSheet.current?.open(null); }}
                  accessibilityRole="button" accessibilityLabel="Schedule a follow-up" accessibilityHint="Opens the follow-up form"
                >
                  <Ionicons name={overdue ? "alert-circle-outline" : "calendar-outline"} size={24} color={tone} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.followupBannerTitle, { color: tone }]}>{overdue ? "FOLLOW UP OVERDUE" : nextFollowup ? "NEXT FOLLOW-UP" : "SCHEDULE FOLLOW-UP"}</Text>
                    {nextFollowup ? <Text style={[styles.followupBannerDate, { color: tone }]}>{dateTime(nextFollowup.next_followup_at)}</Text> : <Text style={[styles.followupBannerDate, { color: UI.sub }]}>No follow-up planned yet</Text>}
                  </View>
                  <Ionicons name="chevron-up" size={20} color={UI.sub} />
                </Pressable>
              );
            })()}

            <LeadNotes leadId={lead.id} refreshSignal={notesSignal} onAdded={reloadQuietly} onFormOpen={revealInScroll} />

            <LeadDetailsCard
              lead={lead} onSave={saveFieldsStable}
              top={<>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Lead date</Text>
                  <Text style={styles.detailValue}>{dateTime(lead.lead_date || lead.created_at)}</Text>
                </View>
                <Pressable style={styles.detailRow} onPress={openAssignSheet} accessibilityRole="button" accessibilityLabel="Change assigned staff">
                  <Text style={styles.detailLabel}>Assigned to staff</Text>
                  <Text style={styles.detailValue}>{lead.assigned_to_name || "Unassigned"}</Text>
                </Pressable>
              </>}
              middle={<>
                <Text style={styles.fieldLabel}>Stage</Text>
                <Pressable style={styles.selectField} onPress={openStageSheet} accessibilityRole="button" accessibilityLabel="Change stage">
                  <Text style={styles.selectText}>{currentStage?.name || pretty(stage)}</Text>
                  <Ionicons name="chevron-down" size={16} color={UI.sub} />
                </Pressable>

                <Text style={[styles.fieldLabel, styles.fieldLabelGap]}>Status</Text>
                <Pressable style={styles.selectField} onPress={() => setStatusSheetOpen(true)} accessibilityRole="button" accessibilityLabel="Change status">
                  <Text style={[styles.selectText, !lead.lead_status && { color: UI.muted }]}>{lead.lead_status || "Not set"}</Text>
                  <Ionicons name="chevron-down" size={16} color={UI.sub} />
                </Pressable>
              </>}
              bottom={
                <FieldGroup label="Last Activity">
                  <StaticBox icon="checkmark-circle" iconColor={colors.success} value={lastActivity ? `${relativeTime(lastActivity.created_at)} · ${pretty(lastActivity.activity_type)}` : detailsLoaded ? "No activity yet" : error ? "Couldn't load" : "Loading…"} />
                </FieldGroup>
              }
            />

            <LeadDocuments pickSignal={attachSignal} leadId={lead.id} onChanged={reloadWithSpinner} />
          </View>
        {tab === "details" ? (
          <View style={styles.body}>
           <LeadProfileCard lead={lead} onSave={saveFieldsStable} />
           <View style={styles.card}>
            <FieldGroup label="Date Created">
              <StaticBox icon="calendar-outline" value={dateTime(lead.lead_date || lead.created_at).split(",")[0]} />
            </FieldGroup>
           </View>
          </View>
        ) : tab === "activities" ? (
          <View style={styles.body}>
            <View style={styles.card}>
              {activities.length ? (
                <View style={styles.timeline}>
                  {activities.slice(0, activityLimit).map((item, index, shownList) => <ActivityItem key={item.id} item={item} last={index === shownList.length - 1 && activities.length <= activityLimit} />)}
                  {activities.length > activityLimit ? (
                    <Pressable onPress={() => setActivityLimit((count) => count + 30)} style={styles.showMore} accessibilityRole="button">
                      <Text style={styles.showMoreText}>Show more ({activities.length - activityLimit} older)</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <EmptyState icon="pulse-outline" title="No activity yet" text="Calls, notes and stage changes will appear here." />
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {!keyboardHeight ? (
        <Pressable style={[styles.addActivityFab, { bottom: fabBottom }]} onPress={() => setFabOpen(true)} accessibilityRole="button" accessibilityLabel="Add activity">
          <Text style={styles.addActivityFabText}>Add activity</Text>
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      ) : null}

      <Modal visible={stageSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={closeStageSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={closeStageSheet}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) + keyboardHeight }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            {lostReasonStep ? (
              <>
                <Text style={styles.sheetTitle}>Why is this lead lost?</Text>
                <Text style={styles.sheetHint}>A reason is required to track why deals aren&apos;t converting.</Text>
                <RadioButton.Group value={lostReason} onValueChange={setLostReason}>
                  <View style={styles.radioList}>
                    {LOST_REASONS.map((reason) => (
                      <RadioButton.Item key={reason} label={reason} value={reason} labelStyle={styles.radioLabel} style={styles.radioRow} />
                    ))}
                  </View>
                </RadioButton.Group>
                {lostReason === "Other" ? (
                  <TextInput mode="outlined" value={customLostReason} onChangeText={setCustomLostReason} placeholder="Describe the reason…" style={styles.sheetField} />
                ) : null}
                <Button
                  mode="contained" buttonColor={colors.danger} onPress={confirmLostStage} loading={updatingStage}
                  disabled={updatingStage || !lostReason || (lostReason === "Other" && !customLostReason.trim())}
                  style={styles.sheetPrimaryButton} contentStyle={styles.sheetButtonContent}
                >
                  Mark as Lost
                </Button>
                <Button mode="outlined" onPress={() => setLostReasonStep(false)} disabled={updatingStage} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Back</Button>
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>Stage</Text>
                {!stages.length && stagesLoading ? <ActivityIndicator style={{ marginVertical: 24 }} color={colors.primary} /> : null}
                <View style={styles.stageList}>
                  {stages.map((item) => {
                    const active = item.name.toLowerCase() === stage.toLowerCase();
                    const itemColors = colorFor(item.color);
                    return (
                      <List.Item
                        key={item.id || item.name} title={item.name} titleStyle={styles.stageListText}
                        onPress={() => selectStage(item)} disabled={updatingStage}
                        left={() => <View style={[styles.stageListDot, { backgroundColor: itemColors.text }]} />}
                        right={active ? () => (updatingStage ? <ActivityIndicator size="small" color={colors.primary} /> : <List.Icon icon="check" color={colors.primary} />) : undefined}
                      />
                    );
                  })}
                  {!stages.length ? <Text style={styles.sheetHint}>Loading stages…</Text> : null}
                </View>
                <Button mode="outlined" onPress={closeStageSheet} disabled={updatingStage} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={assignSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !assigning && setAssignSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !assigning && setAssignSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Assign lead</Text>
            {staffLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : staffError ? (
              <Text style={styles.sheetHint}>{staffError}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                <View style={styles.stageList}>
                  {staff.map((member) => {
                    const active = member.id === lead.assigned_to;
                    return (
                      <List.Item
                        key={member.id} title={member.name} titleStyle={styles.stageListText}
                        description={`${pretty(member.role)}${typeof member.assigned_leads === "number" ? ` · ${member.assigned_leads} leads` : ""}`}
                        onPress={() => assignTo(member)} disabled={assigning}
                        right={active ? () => <List.Icon icon="check" color={colors.primary} /> : undefined}
                      />
                    );
                  })}
                  <List.Item
                    title="Unassigned" titleStyle={styles.stageListText} onPress={() => assignTo(null)} disabled={assigning}
                    right={!lead.assigned_to ? () => <List.Icon icon="check" color={colors.primary} /> : undefined}
                  />
                </View>
              </ScrollView>
            )}
            {assigning ? <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} /> : null}
            <Button mode="outlined" onPress={() => setAssignSheetOpen(false)} disabled={assigning} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={statusSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !updatingStatus && setStatusSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !updatingStatus && setStatusSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Status</Text>
            {availableStatuses.length ? (
              <View style={styles.stageList}>
                {availableStatuses.map((item) => {
                  const active = item.name.toLowerCase() === (lead.lead_status || "").toLowerCase();
                  return (
                    <List.Item
                      key={item.id} title={item.name} titleStyle={styles.stageListText}
                      onPress={() => changeStatus(item.name)} disabled={updatingStatus}
                      right={active ? () => (updatingStatus ? <ActivityIndicator size="small" color={colors.primary} /> : <List.Icon icon="check" color={colors.primary} />) : undefined}
                    />
                  );
                })}
              </View>
            ) : stagesLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={colors.primary} />
            ) : (
              <Text style={styles.sheetHint}>No statuses configured for this stage yet — manage them from the web dashboard.</Text>
            )}
            <Button mode="outlined" onPress={() => setStatusSheetOpen(false)} disabled={updatingStatus} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <FollowupSheet ref={followupSheet} saving={schedulingFollowup} bottomInset={Math.max(insets.bottom, 18)} onSubmit={scheduleFollowupStable} />

      <Modal visible={fabOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setFabOpen(false)}>
        <Pressable style={styles.dialBackdrop} onPress={() => setFabOpen(false)}>
          <View style={[styles.dialColumn, { paddingBottom: fabBottom }]}>
            {DIAL_OPTIONS.map((item) => (
              <Pressable key={item.key} style={styles.dialRow} onPress={() => chooseDialOption(item.key)} accessibilityRole="button" accessibilityLabel={item.label}>
                <Text style={styles.dialLabel}>{item.label}</Text>
                <View style={styles.dialCircle}><Ionicons name={item.icon} size={22} color={UI.blue} /></View>
              </Pressable>
            ))}
            <Pressable style={styles.addActivityFabOpen} onPress={() => setFabOpen(false)} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.addActivityFabText}>Add activity</Text>
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={emailSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !savingEmail && setEmailSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !savingEmail && setEmailSheetOpen(false)}>
          <Pressable style={[styles.sheet, styles.emailSheet, { paddingBottom: Math.max(insets.bottom, 18) + keyboardHeight }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Email</Text>
            <Text style={styles.sheetHint}>Save an email address for {lead.name}, then the email composer will open.</Text>
            {emailError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{emailError}</Text></View> : null}
            <Text style={styles.emailLabel}>Email Address</Text>
            <View style={[styles.emailInputBox, !!emailError && { borderColor: colors.danger }]}>
              <RNTextInput
                style={styles.emailInput}
                value={emailDraft}
                onChangeText={(value) => { setEmailDraft(value); setEmailError(""); }}
                placeholder="email@gmail.com"
                placeholderTextColor={UI.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!savingEmail}
              />
            </View>
            <View style={styles.emailActions}>
              <Button mode="outlined" onPress={() => setEmailSheetOpen(false)} disabled={savingEmail} textColor="#0b6b97" style={styles.emailCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
              <Button mode="contained" onPress={saveEmailAndOpen} loading={savingEmail} disabled={savingEmail} buttonColor="#0b6b97" textColor="#ffffff" style={styles.emailSave} contentStyle={styles.sheetButtonContent}>Save & Email</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <LeadActivitySheet
        type={activitySheet}
        leadId={lead.id}
        leadName={lead.name}
        onClose={() => setActivitySheet(null)}
        onSaved={(type) => { if (type === "note") setNotesSignal((value) => value + 1); load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  loadingText: { color: colors.textSecondary, fontSize: 13, marginTop: 10 },
  errorTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  errorMessage: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  retry: { marginTop: 18 },
  backLink: { marginTop: 5 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  navButton: { flex: 1, flexDirection: "row", alignItems: "center", height: 32, gap: 2 },
  navLeft: { justifyContent: "flex-start" },
  navRight: { justifyContent: "flex-end" },
  navName: { flexShrink: 1, color: UI.sub, fontSize: 12, fontWeight: "600" },
  headerTitle: { color: UI.ink, fontSize: 15, fontWeight: "800" },

  leadCard: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, gap: 12 },
  leadHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  leadAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#d98a0b", alignItems: "center", justifyContent: "center" },
  leadAvatarText: { color: "#ffffff", fontSize: 18, fontWeight: "800" },
  name: { color: UI.ink, fontSize: 16, fontWeight: "800" },
  nameSubtitle: { color: UI.sub, fontSize: 11, marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 14, marginBottom: 12 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardHeaderSplit: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: UI.ink, fontSize: 14, fontWeight: "800" },
  cardHint: { color: UI.sub, fontSize: 11, marginTop: -6, marginBottom: 12 },
  fieldLabelGap: { marginTop: 12 },
  selectField: { height: 42, borderRadius: 10, borderWidth: 1, borderColor: UI.field, backgroundColor: "#ffffff", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { color: UI.ink, fontSize: 13, fontWeight: "600" },
  textField: { height: 42, borderRadius: 10, borderWidth: 1, borderColor: UI.field, backgroundColor: "#ffffff", paddingHorizontal: 12, color: UI.ink, fontSize: 13 },
  primaryButton: { height: 44, borderRadius: 10, backgroundColor: UI.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  followupBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  dropdownList: { marginTop: 6, borderWidth: 1, borderColor: UI.line, borderRadius: 10, backgroundColor: "#ffffff", overflow: "hidden" },
  dropdownItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemDivider: { borderTopWidth: 1, borderTopColor: UI.line },
  followupBannerTitle: { fontSize: 13, fontWeight: "800" },
  followupBannerDate: { fontSize: 13, marginTop: 2 },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  detailRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: UI.line, marginBottom: 12 },
  detailLabel: { color: UI.sub, fontSize: 11, marginBottom: 3 },
  detailValue: { color: UI.ink, fontSize: 14, fontWeight: "800" },
  pickerBackdrop: { flex: 1, justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(15,23,42,0.45)" },
  pickerCard: { backgroundColor: "#ffffff", borderRadius: 16, paddingVertical: 10 },
  pickerTitle: { color: UI.sub, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 16, paddingVertical: 8 },
  pickerItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  pickerItemSelected: { backgroundColor: "#eef2fd" },
  pickerItemText: { color: UI.ink, fontSize: 14, fontWeight: "600" },

  warning: { marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10 },
  warningText: { color: colors.danger, textAlign: "center", fontSize: 12, fontWeight: "600" },

  actionsRow: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1, height: 40, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionButtonLight: { backgroundColor: "#eef2fd", borderWidth: 1, borderColor: "#c9d6f5" },
  actionLabel: { color: "#ffffff", fontSize: 12, fontWeight: "800" },

  tabs: { flexDirection: "row", marginHorizontal: 16, padding: 3, borderRadius: 12, backgroundColor: "#e0e6f4", gap: 2 },
  tabButton: { flex: 1, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabButtonActive: { backgroundColor: "#ffffff" },
  tabText: { color: UI.sub, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: UI.ink },

  body: { paddingHorizontal: 16, paddingTop: 12 },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { color: UI.sub, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  required: { color: colors.danger },
  fieldErrorText: { color: colors.danger, fontSize: 11, fontWeight: "600", marginTop: 5 },

  inputArea: { minHeight: 42, flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.field, borderRadius: 10, paddingHorizontal: 12 },
  inputAreaMultiline: { alignItems: "flex-start", paddingVertical: 12, minHeight: 84 },
  inputIcon: { marginRight: 10 },
  inputIconTop: { marginTop: 2 },
  inputAreaText: { flex: 1, color: UI.ink, fontSize: 13, fontWeight: "500", paddingVertical: 10 },
  inputAreaTextMultiline: { paddingVertical: 0, minHeight: 60 },
  pencilButton: { margin: 0, marginLeft: 8 },
  inputActions: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
  inputActionButton: { margin: 0 },

  chipWrap: { flex: 1, alignItems: "flex-start" },
  statusChip: { borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  statusChipText: { fontSize: 13, fontWeight: "700" },
  moneyHint: { color: UI.sub, fontSize: 12, fontWeight: "700", marginTop: -6, marginBottom: 12 },

  twoUp: { flexDirection: "row", gap: 12 },
  twoUpItem: { flex: 1 },

  addActivityButton: { marginTop: 0, marginBottom: 12 },
  addActivityFab: { position: "absolute", right: 16, height: 46, borderRadius: 23, paddingHorizontal: 20, backgroundColor: UI.blue, flexDirection: "row", alignItems: "center", gap: 8, shadowColor: UI.blue, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  addActivityFabOpen: { height: 46, borderRadius: 23, paddingHorizontal: 20, backgroundColor: UI.blue, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  addActivityFabText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  dialBackdrop: { flex: 1, justifyContent: "flex-end", alignItems: "flex-end", backgroundColor: "rgba(51,60,82,0.82)" },
  dialColumn: { alignItems: "flex-end", paddingRight: 16, gap: 14 },
  dialRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dialLabel: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  dialCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  addActivityButtonContent: { height: 46 },

  timeline: {},
  showMore: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16 },
  showMoreText: { color: UI.blue, fontSize: 13, fontFamily: "Inter_700Bold" },
  timelineRow: { flexDirection: "row" },
  timelineRail: { width: 34, alignItems: "center" },
  timelineDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.text, alignItems: "center", justifyContent: "center", zIndex: 1 },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: colors.text, marginTop: 2 },
  timelineCopy: { flex: 1, paddingBottom: 22 },
  timelineCopyLast: { paddingBottom: 0 },
  timelineTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
  timelineMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  timelineDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },

  empty: { alignItems: "center", paddingVertical: 40 },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 4, paddingHorizontal: 30 },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  fullSheet: { height: "100%", maxHeight: "100%", borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  sheetSectionLabel: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  sheetHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  sheetField: { marginBottom: 12 },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 6, borderRadius: 8, backgroundColor: colors.dangerSoft },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  sheetPrimaryButton: { marginTop: 20 },
  sheetButtonContent: { height: 48 },
  sheetCancel: { marginTop: 10 },
  // The Add Email form uses the same pale blue page, white field and teal buttons as the Add lead screen.
  emailSheet: { backgroundColor: "#f0f6fa" },
  emailLabel: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 6 },
  emailInputBox: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: "#cfe3f1", backgroundColor: "#ffffff", paddingHorizontal: 14, justifyContent: "center" },
  emailInput: { color: UI.ink, fontSize: 13 },
  emailActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  emailCancel: { flex: 1, borderColor: "#cfe3f1", borderRadius: 999, backgroundColor: "#ffffff" },
  emailSave: { flex: 1.4, borderRadius: 999 },

  stageList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  stageListDot: { width: 10, height: 10, borderRadius: 5, alignSelf: "center", marginLeft: 4 },
  stageListText: { color: colors.text, fontSize: 14, fontWeight: "600" },

  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },


  radioList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  radioRow: { paddingVertical: 0 },
  radioLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },


});
