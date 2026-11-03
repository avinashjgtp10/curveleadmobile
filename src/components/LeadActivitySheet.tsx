import React, { useEffect, useState } from "react";
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { ActivityIndicator, Button, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import { createLeadFollowup, logLeadActivity } from "@/api/leads";
import { NoteType, createLeadNote } from "@/api/notes";

export type ActivitySheetType = "call" | "message" | "meeting" | "note";

type IconName = keyof typeof Ionicons.glyphMap;

const CONFIG: Record<ActivitySheetType, { title: string; icon: IconName; tint: string; bg: string; save: string }> = {
  call: { title: "Log a call", icon: "call", tint: "#0369a1", bg: "#e0f2fe", save: "Save call" },
  message: { title: "Log a message", icon: "chatbubble-ellipses", tint: "#15803d", bg: "#dcfce7", save: "Save message" },
  meeting: { title: "Schedule a meeting", icon: "calendar", tint: "#7e22ce", bg: "#f3e8ff", save: "Schedule meeting" },
  note: { title: "Add a note", icon: "document-text", tint: "#b45309", bg: "#fef3c7", save: "Save note" },
};

const CALL_OUTCOMES: { label: string; icon: IconName }[] = [
  { label: "Answered", icon: "checkmark-circle-outline" },
  { label: "No Answer", icon: "call-outline" },
  { label: "Busy", icon: "remove-circle-outline" },
  { label: "Switched Off", icon: "power-outline" },
  { label: "Not Interested", icon: "close-circle-outline" },
];

const MESSAGE_RESULTS = ["Sent", "Replied", "No reply"];

const MEETING_MODES: { key: "demo" | "visit"; label: string; icon: IconName }[] = [
  { key: "demo", label: "Online / Demo", icon: "videocam-outline" },
  { key: "visit", label: "In person", icon: "location-outline" },
];

const NOTE_TYPES: { key: NoteType; label: string }[] = [
  { key: "general", label: "General" },
  { key: "meeting", label: "Meeting" },
  { key: "call", label: "Call" },
  { key: "follow_up", label: "Follow Up" },
];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function Chip({ label, icon, active, onPress }: { label: string; icon?: IconName; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      {icon ? <Ionicons name={icon} size={15} color={active ? "#ffffff" : colors.textSecondary} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function LeadActivitySheet({ type, leadId, leadName, onClose, onSaved }: {
  type: ActivitySheetType | null;
  leadId: string;
  leadName: string;
  onClose: () => void;
  onSaved: (type: ActivitySheetType) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [when, setWhen] = useState(defaultFollowupDate());
  const [mode, setMode] = useState<"demo" | "visit">("demo");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Modal windows don't resize with the keyboard on Android, so lift the sheet by hand.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Start every open with a clean form.
  useEffect(() => {
    if (!type) return;
    setOutcome(""); setNotes(""); setFollowUp(false); setWhen(defaultFollowupDate());
    setMode("demo"); setMeetingUrl(""); setNoteType("general"); setError(""); setSaving(false);
  }, [type]);

  if (!type) return null;
  const config = CONFIG[type];

  function close() { if (!saving) onClose(); }

  async function save() {
    if (!type) return;
    const text = notes.trim();
    if (type === "call" && !outcome) { setError("Select a call outcome."); return; }
    if (type === "note" && !text) { setError("Write something before saving."); return; }
    if ((type === "meeting" || followUp) && when.getTime() < Date.now() - 60000) {
      setError("Choose a time in the future."); return;
    }
    setSaving(true); setError("");
    try {
      if (type === "call") {
        await logLeadActivity(leadId, {
          notes: text || outcome, followup_type: "call", outcome,
          next_followup_at: followUp ? when.toISOString() : undefined,
        });
      } else if (type === "message") {
        await logLeadActivity(leadId, {
          notes: text ? `${outcome ? `${outcome} — ` : ""}${text}` : `WhatsApp message ${(outcome || "sent").toLowerCase()}`,
          followup_type: "whatsapp",
          next_followup_at: followUp ? when.toISOString() : undefined,
        });
      } else if (type === "meeting") {
        await createLeadFollowup(leadId, {
          followup_type: mode, next_followup_at: when.toISOString(),
          notes: text || undefined,
          meeting_url: mode === "demo" ? meetingUrl.trim() || undefined : undefined,
        });
      } else {
        await createLeadNote(leadId, { note: text, note_type: noteType });
      }
      onSaved(type);
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not save. Please try again."));
    } finally { setSaving(false); }
  }

  const noteLabel = type === "note" ? "Note" : type === "meeting" ? "Agenda (optional)" : "Notes (optional)";
  const notePlaceholder = type === "call" ? "What was discussed?" : type === "message" ? "What did you send or hear back?"
    : type === "meeting" ? "e.g. Walk through pricing" : "Write your note…";

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.sheet, {
          marginBottom: keyboardHeight,
          paddingBottom: keyboardHeight ? 12 : Math.max(insets.bottom, 16),
          maxHeight: windowHeight - keyboardHeight - insets.top - 12,
        }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: config.bg }]}><Ionicons name={config.icon} size={22} color={config.tint} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{config.title}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{leadName}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.form}>
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {type === "call" ? (
              <>
                <Text style={styles.label}>Outcome <Text style={styles.required}>*</Text></Text>
                <View style={styles.chipRow}>
                  {CALL_OUTCOMES.map((item) => <Chip key={item.label} label={item.label} icon={item.icon} active={outcome === item.label} onPress={() => { setOutcome(item.label); setError(""); }} />)}
                </View>
              </>
            ) : null}

            {type === "message" ? (
              <>
                <Text style={styles.label}>Result</Text>
                <View style={styles.chipRow}>
                  {MESSAGE_RESULTS.map((item) => <Chip key={item} label={item} active={outcome === item} onPress={() => setOutcome(outcome === item ? "" : item)} />)}
                </View>
              </>
            ) : null}

            {type === "meeting" ? (
              <>
                <Text style={styles.label}>Meeting type</Text>
                <View style={styles.chipRow}>
                  {MEETING_MODES.map((item) => <Chip key={item.key} label={item.label} icon={item.icon} active={mode === item.key} onPress={() => setMode(item.key)} />)}
                </View>
                <Text style={styles.label}>Date &amp; time</Text>
                <DateTimeField value={when} onChange={setWhen} minimumDate={new Date()} />
                {mode === "demo" ? (
                  <TextInput mode="outlined" label="Meeting link (optional)" value={meetingUrl} onChangeText={setMeetingUrl} placeholder="https://meet.google.com/…" autoCapitalize="none" keyboardType="url" style={styles.field} />
                ) : null}
              </>
            ) : null}

            {type === "note" ? (
              <>
                <Text style={styles.label}>Note type</Text>
                <View style={styles.chipRow}>
                  {NOTE_TYPES.map((item) => <Chip key={item.key} label={item.label} active={noteType === item.key} onPress={() => setNoteType(item.key)} />)}
                </View>
              </>
            ) : null}

            <TextInput
              mode="outlined" label={noteLabel} value={notes}
              onChangeText={(value) => { setNotes(value); setError(""); }}
              placeholder={notePlaceholder} multiline numberOfLines={type === "note" ? 5 : 3}
              style={[styles.field, styles.multiline]}
            />

            {type === "call" || type === "message" ? (
              <>
                <Pressable style={styles.toggleRow} onPress={() => setFollowUp((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: followUp }}>
                  <Ionicons name={followUp ? "checkbox" : "square-outline"} size={22} color={colors.primary} />
                  <Text style={styles.toggleText}>Schedule next follow-up</Text>
                </Pressable>
                {followUp ? <DateTimeField value={when} onChange={setWhen} minimumDate={new Date()} /> : null}
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button mode="text" onPress={close} disabled={saving} style={styles.cancel} contentStyle={styles.buttonContent}>Cancel</Button>
            <Button mode="contained" onPress={save} disabled={saving} style={styles.save} contentStyle={styles.buttonContent}
              icon={saving ? () => <ActivityIndicator size="small" color="#ffffff" /> : undefined}>
              {saving ? "Saving…" : config.save}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  form: { flexGrow: 0 },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  required: { color: colors.danger },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: "#ffffff" },
  field: { marginTop: 14, backgroundColor: colors.surface },
  multiline: { minHeight: 90 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 10 },
  toggleText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginTop: 10, borderRadius: 8, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancel: { flex: 1 },
  save: { flex: 2 },
  buttonContent: { height: 48 },
});
