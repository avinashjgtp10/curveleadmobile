import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  createStage, createStatus, deleteStage, deleteStatus, fetchPipeline, LeadStage, LeadStatus, SaveStageInput, updateStage, updateStatus,
} from "@/api/stages";

const COLOR_HEX: Record<string, string> = {
  blue: "#60a5fa", green: "#4ade80", yellow: "#facc15", orange: "#fb923c", red: "#f87171",
  purple: "#c084fc", pink: "#f472b6", gray: "#9ca3af", cyan: "#22d3ee", amber: "#fbbf24",
};
const COLORS = Object.keys(COLOR_HEX);
const META_EVENTS = ["", "Lead", "Contact", "Schedule", "SubmitApplication", "Subscribe", "StartTrial", "CompleteRegistration", "Purchase"];

type Mode = { kind: "list" } | { kind: "stage"; stage: LeadStage | null } | { kind: "status"; stage: LeadStage; status: LeadStatus | null };

const EMPTY_STAGE: SaveStageInput = { name: "", color: "blue", is_won: false, is_lost: false, meta_event_name: "" };

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

export function PipelineSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [stageForm, setStageForm] = useState<SaveStageInput>(EMPTY_STAGE);
  const [statusName, setStatusName] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setStages((await fetchPipeline()).filter((stage) => !!stage.id)); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load your pipeline.")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openStage(stage: LeadStage | null) {
    setFormError("");
    setStageForm(stage ? {
      name: stage.name, color: stage.color || "blue", is_won: !!stage.is_won, is_lost: !!stage.is_lost, meta_event_name: stage.meta_event_name || "",
    } : EMPTY_STAGE);
    setMode({ kind: "stage", stage });
  }

  function openStatus(stage: LeadStage, status: LeadStatus | null) {
    setFormError("");
    setStatusName(status?.name || "");
    setMode({ kind: "status", stage, status });
  }

  async function saveStage() {
    if (mode.kind !== "stage") return;
    if (!stageForm.name.trim()) { setFormError("Stage name is required."); return; }
    setSaving(true); setFormError("");
    try {
      const input = { ...stageForm, name: stageForm.name.trim() };
      if (mode.stage?.id) await updateStage(mode.stage.id, input); else await createStage(input);
      setMode({ kind: "list" });
      await load();
    } catch (saveError) { setFormError(errorMessage(saveError, "Failed to save the stage.")); }
    finally { setSaving(false); }
  }

  async function saveStatus() {
    if (mode.kind !== "status") return;
    if (!statusName.trim()) { setFormError("Status name is required."); return; }
    setSaving(true); setFormError("");
    try {
      if (mode.status) await updateStatus(mode.status.id, { name: statusName.trim() });
      else await createStatus({ name: statusName.trim(), stage_id: mode.stage.id as string });
      setMode({ kind: "list" });
      await load();
    } catch (saveError) { setFormError(errorMessage(saveError, "Failed to save the status.")); }
    finally { setSaving(false); }
  }

  function removeStage(stage: LeadStage) {
    if (stage.is_default) { Alert.alert("Can't delete", "Default stages cannot be deleted."); return; }
    Alert.alert(`Delete stage "${stage.name}"?`, "Leads in this stage will keep the stage label.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteStage(stage.id as string); await load(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  function removeStatus(status: LeadStatus) {
    if (status.is_default) { Alert.alert("Can't delete", "Default statuses cannot be deleted."); return; }
    Alert.alert(`Delete status "${status.name}"?`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteStatus(status.id); await load(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (error && !stages.length) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
        <Text style={styles.hint}>{error}</Text>
        <Pressable style={styles.retry} onPress={() => { setLoading(true); load(); }}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  if (mode.kind === "stage") {
    return (
      <View style={styles.stack}>
        <Pressable style={styles.backRow} onPress={() => setMode({ kind: "list" })} hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backText}>Back to pipeline</Text>
        </Pressable>
        <View style={styles.box}>
          <Text style={styles.title}>{mode.stage ? "Edit stage" : "New stage"}</Text>
          {formError ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.errorText}>{formError}</Text></View> : null}
          <Text style={styles.label}>Stage name *</Text>
          <View style={styles.input}>
            <RNTextInput value={stageForm.name} onChangeText={(name) => setStageForm({ ...stageForm, name })} placeholder="e.g. Negotiation" placeholderTextColor={colors.textMuted} style={styles.inputText} />
          </View>
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorRow}>
            {COLORS.map((name) => (
              <Pressable key={name} onPress={() => setStageForm({ ...stageForm, color: name })} style={[styles.swatchWrap, stageForm.color === name && styles.swatchActive]}>
                <View style={[styles.swatch, { backgroundColor: COLOR_HEX[name] }]} />
              </Pressable>
            ))}
          </View>
          <View style={styles.flagRow}>
            <Pressable style={[styles.flag, stageForm.is_won && styles.flagWon]} onPress={() => setStageForm({ ...stageForm, is_won: !stageForm.is_won, is_lost: stageForm.is_won ? stageForm.is_lost : false })}>
              <Ionicons name={stageForm.is_won ? "checkbox" : "square-outline"} size={20} color="#15803d" />
              <Text style={[styles.flagText, { color: "#15803d" }]}>Mark as Won</Text>
            </Pressable>
            <Pressable style={[styles.flag, stageForm.is_lost && styles.flagLost]} onPress={() => setStageForm({ ...stageForm, is_lost: !stageForm.is_lost, is_won: stageForm.is_lost ? stageForm.is_won : false })}>
              <Ionicons name={stageForm.is_lost ? "checkbox" : "square-outline"} size={20} color="#b91c1c" />
              <Text style={[styles.flagText, { color: "#b91c1c" }]}>Mark as Lost</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>Meta conversion event</Text>
          <View style={styles.chipRow}>
            {META_EVENTS.map((event) => {
              const active = stageForm.meta_event_name === event;
              return (
                <Pressable key={event || "none"} onPress={() => setStageForm({ ...stageForm, meta_event_name: event })} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{event || "Don't send"}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>When a Meta-sourced lead moves into this stage, this event is sent to Meta's Conversions API to help optimise your ad campaigns.</Text>
          <PrimaryButton label={mode.stage ? "Update stage" : "Create stage"} onPress={saveStage} busy={saving} />
        </View>
      </View>
    );
  }

  if (mode.kind === "status") {
    return (
      <View style={styles.stack}>
        <Pressable style={styles.backRow} onPress={() => setMode({ kind: "list" })} hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backText}>Back to pipeline</Text>
        </Pressable>
        <View style={styles.box}>
          <Text style={styles.title}>{mode.status ? "Edit status" : "New status"}</Text>
          <Text style={styles.hint}>In stage "{mode.stage.name}"</Text>
          {formError ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.errorText}>{formError}</Text></View> : null}
          <Text style={styles.label}>Status name *</Text>
          <View style={styles.input}>
            <RNTextInput value={statusName} onChangeText={setStatusName} placeholder="e.g. Called, no answer" placeholderTextColor={colors.textMuted} style={styles.inputText} />
          </View>
          <PrimaryButton label={mode.status ? "Update status" : "Create status"} onPress={saveStatus} busy={saving} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.box}>
        <Text style={styles.title}>Pipeline stages & statuses</Text>
        <Text style={styles.hint}>Stages = where a lead is. Statuses = what's happening within that stage.</Text>
        {isAdmin ? (
          <Pressable style={styles.addButton} onPress={() => openStage(null)}>
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addText}>Add stage</Text>
          </Pressable>
        ) : <Text style={styles.noteBox}>Only admins can change the pipeline.</Text>}
        {stages.length ? stages.map((stage) => {
          const open = expanded === stage.id;
          return (
            <View key={stage.id as string} style={styles.stageCard}>
              <Pressable style={styles.stageRow} onPress={() => setExpanded(open ? "" : (stage.id as string))}>
                <View style={[styles.dot, { backgroundColor: COLOR_HEX[stage.color || "gray"] || COLOR_HEX.gray }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stageName} numberOfLines={1}>{stage.name}</Text>
                  <Text style={styles.hint}>{stage.statuses?.length || 0} {stage.statuses?.length === 1 ? "status" : "statuses"}</Text>
                </View>
                {stage.is_won ? <View style={[styles.tag, { backgroundColor: "#dcfce7" }]}><Text style={[styles.tagText, { color: "#15803d" }]}>WON</Text></View> : null}
                {stage.is_lost ? <View style={[styles.tag, { backgroundColor: "#fee2e2" }]}><Text style={[styles.tagText, { color: "#b91c1c" }]}>LOST</Text></View> : null}
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
              </Pressable>
              {open ? (
                <View style={styles.stageBody}>
                  {stage.meta_event_name ? <Text style={styles.hint}>Meta event: {stage.meta_event_name}</Text> : null}
                  {stage.statuses?.length ? stage.statuses.map((status) => (
                    <View key={status.id} style={styles.statusRow}>
                      <Text style={styles.statusName} numberOfLines={1}>{status.name}</Text>
                      {isAdmin ? (
                        <>
                          <Pressable hitSlop={6} style={styles.iconBtn} onPress={() => openStatus(stage, status)}><Ionicons name="create-outline" size={16} color={colors.primary} /></Pressable>
                          <Pressable hitSlop={6} style={styles.iconBtn} onPress={() => removeStatus(status)}><Ionicons name="trash-outline" size={16} color={status.is_default ? colors.border : colors.danger} /></Pressable>
                        </>
                      ) : null}
                    </View>
                  )) : <Text style={styles.hint}>No statuses yet.</Text>}
                  {isAdmin ? (
                    <View style={styles.stageActions}>
                      <Pressable style={styles.smallButton} onPress={() => openStatus(stage, null)}><Ionicons name="pricetag-outline" size={14} color={colors.primary} /><Text style={styles.smallText}>Add status</Text></Pressable>
                      <Pressable style={styles.smallButton} onPress={() => openStage(stage)}><Ionicons name="create-outline" size={14} color={colors.primary} /><Text style={styles.smallText}>Edit stage</Text></Pressable>
                      <Pressable style={[styles.smallButton, { backgroundColor: colors.dangerSoft }]} onPress={() => removeStage(stage)}><Ionicons name="trash-outline" size={14} color={stage.is_default ? colors.border : colors.danger} /><Text style={[styles.smallText, { color: stage.is_default ? colors.border : colors.danger }]}>Delete</Text></Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }) : <Text style={styles.noneText}>No stages yet.</Text>}
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[{ marginTop: 18 }, busy && { opacity: 0.6 }]}>
      <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
        <Text style={styles.primaryText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  center: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20 },
  retry: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  box: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14 },
  title: { color: colors.text, fontSize: 16, fontWeight: "900" },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 14, marginBottom: 6 },
  noteBox: { color: colors.textSecondary, fontSize: 12, backgroundColor: "#fff7ed", borderRadius: 12, padding: 10, marginTop: 8 },
  noneText: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 10, marginTop: 8 },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },

  backRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, justifyContent: "center" },
  inputText: { color: colors.text, fontSize: 14, paddingVertical: 8 },

  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatchWrap: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatchActive: { borderColor: "#4f46e5" },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  flagRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  flag: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#e2eef7", backgroundColor: "#f8fbfd" },
  flagWon: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  flagLost: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  flagText: { fontSize: 13, fontWeight: "800" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f4f9fc", borderWidth: 1, borderColor: "#d7e6f1" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: "#fff" },

  addButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 12, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.primarySoft },
  addText: { color: colors.primary, fontSize: 13, fontWeight: "800" },

  stageCard: { marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: "#e2eef7", backgroundColor: "#ffffff", overflow: "hidden" },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  stageName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 10, fontWeight: "900" },
  stageBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 6, backgroundColor: "#f8fbfd", borderTopWidth: 1, borderTopColor: "#eef4f9" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  statusName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
  iconBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#eef4f9", alignItems: "center", justifyContent: "center" },
  stageActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.primarySoft },
  smallText: { color: colors.primary, fontSize: 12, fontWeight: "800" },

  primary: { height: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
