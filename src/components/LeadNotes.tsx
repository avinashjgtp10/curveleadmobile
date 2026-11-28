import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
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

// Notes already loaded this session, so reopening a lead shows them at once while a fresh copy loads.
const notesCache = new Map<string, LeadNote[]>();
const inFlight = new Map<string, Promise<LeadNote[]>>();

// One shared request per lead, so the screen can start it early and the section joins it instead of asking again.
// `fresh` skips any request that may have started before a change was saved.
function loadNotes(leadId: string, fresh = false): Promise<LeadNote[]> {
  const existing = inFlight.get(leadId);
  if (existing && !fresh) return existing;
  const request = fetchLeadNotes(leadId).then((notes) => {
    notesCache.set(leadId, notes);
    if (notesCache.size > 30) notesCache.delete(notesCache.keys().next().value as string);
    return notes;
  }).finally(() => { if (inFlight.get(leadId) === request) inFlight.delete(leadId); });
  inFlight.set(leadId, request);
  return request;
}

/** Start loading a lead's notes in the background, alongside the lead details. */
export function prefetchLeadNotes(leadId: string) { loadNotes(leadId).catch(() => {}); }

export const LeadNotes = React.memo(function LeadNotes({ leadId, onAdded, onFormOpen, refreshSignal = 0 }: { leadId: string; onAdded?: () => void; onFormOpen?: (form: View | null) => void; refreshSignal?: number }) {
  const { user } = useAuth();
  const storageKey = user?.id ? `curvelead_notes_${user.id}_${leadId}` : null;
  const [notes, setNotes] = useState<LeadNote[]>(() => notesCache.get(leadId) ?? []);
  const [loading, setLoading] = useState(() => !notesCache.has(leadId));
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<NoteType>("general");
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);
  const formRef = useRef<View>(null);

  // Each load gets a number; an answer that is no longer the newest is dropped. Without this, a slow request started before a
  // save could arrive afterwards and wipe the note that was just added from the screen.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const loadSeq = useRef(0);
  const load = useCallback(async (fresh = false) => {
    const mine = ++loadSeq.current;
    setLoadError("");
    try {
      const loaded = await loadNotes(leadId, fresh);
      if (mine !== loadSeq.current) return;
      setNotes(loaded);
      if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(loaded)).catch(() => {});
    }
    catch (error) { if (mine === loadSeq.current) setLoadError(errorMessage(error, "Could not load notes.")); }
    finally { if (mine === loadSeq.current) setLoading(false); }
  }, [leadId, storageKey]);

  // Keeps what the screen shows, the in-memory copy and the saved copy the same, so reopening the lead never shows an older list.
  const showNotes = useCallback((next: LeadNote[]) => {
    loadSeq.current++; // any request still on its way is older than this change
    setNotes(next);
    notesCache.set(leadId, next);
    if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(next.filter((item) => !item.id.startsWith("temp-")))).catch(() => {});
  }, [leadId, storageKey]);

  // After the app was restarted nothing is in memory: show the notes saved on the phone while the fresh copy loads.
  useEffect(() => {
    if (!storageKey || notesCache.has(leadId)) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (cancelled || !raw || notesCache.has(leadId)) return; // the fresh copy already arrived
      const saved = JSON.parse(raw) as LeadNote[];
      if (Array.isArray(saved)) { setNotes(saved); setLoading(false); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [leadId, storageKey]);

  useEffect(() => { load(); }, [load, refreshSignal]);
  useEffect(() => { if (formOpen) onFormOpen?.(formRef.current); }, [formOpen, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() { setEditingId(null); setType("general"); setText(""); setFieldError(""); setFormOpen(true); }
  function openEdit(note: LeadNote) { setEditingId(note.id); setType(note.note_type); setText(note.note); setFieldError(""); setFormOpen(true); }

  async function save() {
    if (!text.trim()) { setFieldError("Note content is required."); return; }
    // Show the note at once and close the form; the server catches up in the background.
    const content = text.trim();
    const previous = notes;
    const wasEditing = editingId;
    const tempId = `temp-${Date.now()}`;
    showNotes(wasEditing
      ? notes.map((item) => item.id === wasEditing ? { ...item, note: content } : item)
      : [{ id: tempId, note: content, note_type: type, created_by_name: "You", created_at: new Date().toISOString() }, ...notes]);
    setFormOpen(false); setEditingId(null); setText("");
    setSaving(true);
    try {
      if (wasEditing) await updateLeadNote(leadId, wasEditing, content);
      else {
        const created = await createLeadNote(leadId, { note: content, note_type: type });
        // The server's copy replaces the temporary one; asking for the whole list again was a second wait for nothing.
        if (created?.id) {
          showNotes(notesRef.current.map((item) => item.id === tempId ? { ...created, created_by_name: created.created_by_name || "You" } : item));
        } else load(true);
        // Refreshing the lead's activity list is not urgent: it waits a moment so it doesn't compete with the note being saved.
        setTimeout(() => onAdded?.(), 1500);
        return;
      }
      load(true);
    } catch (error) {
      // Put things back so nothing the person typed is lost.
      showNotes(previous); setText(content); setEditingId(wasEditing); setFormOpen(true);
      setFieldError(errorMessage(error, "Couldn't save the note. Please try again."));
    } finally { setSaving(false); }
  }

  function remove(note: LeadNote) {
    Alert.alert("Delete this note?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const previous = notes;
        showNotes(previous.filter((item) => item.id !== note.id));
        try { await deleteLeadNote(leadId, note.id); load(true); }
        catch (error) { showNotes(previous); Alert.alert("Couldn't delete", errorMessage(error, "Please try again.")); }
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
          <Ionicons name="add" size={15} color="#6d4fd6" />
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

      {loading ? <View style={styles.loadingRow}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.empty}>Loading notes…</Text></View> : loadError ? (
        <Pressable onPress={() => { setLoading(true); load(true); }}><Text style={styles.empty}>{loadError} Tap to retry.</Text></Pressable>
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
});

const styles = StyleSheet.create({
  box: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#e4e9f3", padding: 14, marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#0f172a", fontSize: 14, fontWeight: "800" },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#e9e2fb" },
  addText: { color: "#6d4fd6", fontSize: 12, fontWeight: "800" },
  form: { marginTop: 12, padding: 10, borderRadius: 14, backgroundColor: "#f8fbfd", borderWidth: 1, borderColor: "#e2eef7" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e6f1" },
  typeChipActive: { backgroundColor: "#2457e6", borderColor: "#2457e6" },
  typeChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  typeChipTextActive: { color: "#fff" },
  inputBox: { minHeight: 100, borderRadius: 12, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#fff", paddingHorizontal: 12 },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  inputText: { color: colors.text, fontSize: 14, minHeight: 100, paddingVertical: 10 },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: "600", marginTop: 6, marginLeft: 4 },
  formActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#fff" },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  saveButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: "#2457e6", minWidth: 96, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  loader: { marginVertical: 18 },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 8 },
  empty: { color: "#94a3b8", fontSize: 12, textAlign: "center", paddingVertical: 18 },
  list: { gap: 8, marginTop: 12 },
  note: { padding: 12, borderRadius: 14, backgroundColor: "#f8fbfd" },
  noteTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: "800" },
  noteActions: { flexDirection: "row", gap: 14 },
  noteText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  noteMeta: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
});
