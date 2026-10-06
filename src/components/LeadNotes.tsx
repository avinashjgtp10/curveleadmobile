import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { LeadNote, NoteType, createLeadNote, deleteLeadNote, fetchLeadNotes, updateLeadNote } from "@/api/notes";

type IconName = keyof typeof Ionicons.glyphMap;

const NOTE_TYPES: { key: NoteType; label: string; icon: IconName; bg: string; text: string }[] = [
  { key: "general", label: "General", icon: "chatbubble-outline", bg: "#f1f5f9", text: "#475569" },
  { key: "meeting", label: "Meeting", icon: "calendar-outline", bg: "#f3e8ff", text: "#7e22ce" },
  { key: "call", label: "Call", icon: "call-outline", bg: "#dbeafe", text: "#1d4ed8" },
  { key: "follow_up", label: "Follow Up", icon: "document-text-outline", bg: "#fef3c7", text: "#b45309" },
];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function LeadNotes({ leadId, onAdded, onFormOpen }: { leadId: string; onAdded?: () => void; onFormOpen?: (form: View | null) => void }) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<NoteType>("general");
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);
  const formRef = useRef<View>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try { setNotes(await fetchLeadNotes(leadId)); }
    catch (error) { setLoadError(errorMessage(error, "Could not load notes.")); }
    finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (formOpen) onFormOpen?.(formRef.current); }, [formOpen, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() { setEditingId(null); setType("general"); setText(""); setFieldError(""); setFormOpen(true); }
  function openEdit(note: LeadNote) { setEditingId(note.id); setType(note.note_type); setText(note.note); setFieldError(""); setFormOpen(true); }

  async function save() {
    if (!text.trim()) { setFieldError("Note content is required."); return; }
    setSaving(true);
    try {
      if (editingId) await updateLeadNote(leadId, editingId, text.trim());
      else { await createLeadNote(leadId, { note: text.trim(), note_type: type }); onAdded?.(); }
      setFormOpen(false); setEditingId(null); setText("");
      await load();
    } catch (error) { setFieldError(errorMessage(error, "Couldn't save the note. Please try again.")); }
    finally { setSaving(false); }
  }

  function remove(note: LeadNote) {
    Alert.alert("Delete this note?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteLeadNote(leadId, note.id); await load(); }
        catch (error) { Alert.alert("Couldn't delete", errorMessage(error, "Please try again.")); }
      } },
    ]);
  }

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.text} />
          <Text style={styles.title}>Discussion Notes</Text>
        </View>
        <Pressable style={styles.addButton} onPress={openNew}>
          <Ionicons name="add" size={15} color={colors.primary} />
          <Text style={styles.addText}>Add Note</Text>
        </Pressable>
      </View>

      {formOpen ? (
        <View ref={formRef} style={styles.form}>
          {!editingId ? (
            <View style={styles.typeRow}>
              {NOTE_TYPES.map((item) => (
                <Pressable key={item.key} onPress={() => setType(item.key)} style={[styles.typeChip, type === item.key && styles.typeChipActive]}>
                  <Text style={[styles.typeChipText, type === item.key && styles.typeChipTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={[styles.inputBox, !!fieldError && styles.inputError]}>
            <RNTextInput
              value={text} onChangeText={(value) => { setText(value); if (fieldError) setFieldError(""); }}
              placeholder="Write your note here..." placeholderTextColor={colors.textMuted}
              multiline textAlignVertical="top" style={styles.inputText} autoFocus
              onFocus={() => onFormOpen?.(formRef.current)}
            />
          </View>
          {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}
          <View style={styles.formActions}>
            <Pressable style={styles.cancelButton} onPress={() => { setFormOpen(false); setEditingId(null); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{editingId ? "Update" : "Save"} Note</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : loadError ? (
        <Pressable onPress={() => { setLoading(true); load(); }}><Text style={styles.empty}>{loadError} Tap to retry.</Text></Pressable>
      ) : notes.length === 0 ? (
        <Text style={styles.empty}>No notes yet. Add discussion notes from meetings or calls.</Text>
      ) : (
        <View style={styles.list}>
          {notes.map((note) => {
            const meta = NOTE_TYPES.find((item) => item.key === note.note_type) || NOTE_TYPES[0];
            return (
              <View key={note.id} style={styles.note}>
                <View style={styles.noteTop}>
                  <View style={[styles.tag, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={11} color={meta.text} />
                    <Text style={[styles.tagText, { color: meta.text }]}>{meta.label}</Text>
                  </View>
                  <View style={styles.noteActions}>
                    <Pressable hitSlop={8} onPress={() => openEdit(note)}><Ionicons name="create-outline" size={16} color={colors.textMuted} /></Pressable>
                    <Pressable hitSlop={8} onPress={() => remove(note)}><Ionicons name="trash-outline" size={16} color={colors.danger} /></Pressable>
                  </View>
                </View>
                <Text style={styles.noteText}>{note.note}</Text>
                <Text style={styles.noteMeta}>{note.created_by_name || "Unknown"} • {dateText(note.created_at)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#e2eef7", padding: 14, marginTop: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: "800" },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.primarySoft },
  addText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  form: { marginTop: 12, padding: 10, borderRadius: 14, backgroundColor: "#f8fbfd", borderWidth: 1, borderColor: "#e2eef7" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e6f1" },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  typeChipTextActive: { color: "#fff" },
  inputBox: { minHeight: 100, borderRadius: 12, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#fff", paddingHorizontal: 12 },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  inputText: { color: colors.text, fontSize: 14, minHeight: 100, paddingVertical: 10 },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: "600", marginTop: 6, marginLeft: 4 },
  formActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#fff" },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  saveButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.primary, minWidth: 96, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  loader: { marginVertical: 18 },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 18 },
  list: { gap: 8, marginTop: 12 },
  note: { padding: 12, borderRadius: 14, backgroundColor: "#f8fbfd" },
  noteTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: "800" },
  noteActions: { flexDirection: "row", gap: 14 },
  noteText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  noteMeta: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
});
