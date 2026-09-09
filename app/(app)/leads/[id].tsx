import React, { useCallback, useEffect, useState } from "react";
import {
  Alert, Linking, Modal, Pressable,
  RefreshControl, ScrollView, StyleSheet, TextInput as RNTextInput, View,
} from "react-native";
import {
  ActivityIndicator, Appbar, Button, Chip, IconButton, List, RadioButton,
  SegmentedButtons, Text, TextInput,
} from "react-native-paper";
import axios from "axios";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { DateTimeField, defaultFollowupDate } from "@/components/DateTimeField";
import { useStages } from "@/hooks/useStages";
import {
  ActivityLogType, ContactActivityType, FollowupType, LeadActivity, LeadDetails, LeadFollowup,
  UpdateLeadInput, createLeadFollowup, fetchLeadDetails, logLeadActivity, trackContactActivity,
  updateLeadDetails, updateLeadStage, updateLeadStatus,
} from "@/api/leads";

type Tab = "overview" | "details" | "activities";
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

const ACTIVITY_TYPES: { key: ActivityLogType; label: string; icon: IconName }[] = [
  { key: "call", label: "Call", icon: "call-outline" },
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
  { key: "visit", label: "Visit", icon: "location-outline" },
  { key: "other", label: "Note", icon: "document-text-outline" },
];

const ACTIVITY_TYPE_LABEL: Record<ActivityLogType, string> = {
  call: "Call", whatsapp: "WhatsApp", visit: "Visit", other: "Note",
};

const CALL_OUTCOMES = ["Answered", "No Answer", "Busy", "Switched Off", "Not Interested"];

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
        <View style={[styles.statusChip, { backgroundColor: chip.bg }]}><Text style={[styles.statusChipText, { color: chip.text }]}>{chip.label}</Text></View>
      ) : (
        <Text style={styles.inputAreaText} numberOfLines={1}>{value || placeholder}</Text>
      )}
      <IconButton icon="pencil" size={13} style={styles.pencilButton} onPress={onPress} />
    </View>
  );
}

function EditableField({ icon, label, value, required, multiline, keyboardType, placeholder, validate, onSave }: {
  icon: IconName; label: string; value: string; required?: boolean; multiline?: boolean;
  keyboardType?: React.ComponentProps<typeof RNTextInput>["keyboardType"]; placeholder?: string;
  validate?: (value: string) => string | null; onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  function startEdit() { setDraft(value); setError(""); setEditing(true); }
  function cancelEdit() { setDraft(value); setError(""); setEditing(false); }

  async function save() {
    const trimmed = draft.trim();
    if (required && !trimmed) { setError("This field is required."); return; }
    const validationError = validate?.(trimmed);
    if (validationError) { setError(validationError); return; }
    setSaving(true); setError("");
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not save. Please try again."));
    } finally { setSaving(false); }
  }

  return (
    <FieldGroup label={label} required={required}>
      <View style={[styles.inputArea, multiline && styles.inputAreaMultiline]}>
        <Ionicons name={icon} size={16} color={colors.textSecondary} style={[styles.inputIcon, multiline && styles.inputIconTop]} />
        {editing ? (
          <RNTextInput
            style={[styles.inputAreaText, multiline && styles.inputAreaTextMultiline]}
            value={draft} onChangeText={setDraft} autoFocus keyboardType={keyboardType}
            multiline={multiline} textAlignVertical={multiline ? "top" : "center"}
            placeholder={placeholder} placeholderTextColor={colors.textMuted} editable={!saving}
          />
        ) : (
          <Text style={styles.inputAreaText} numberOfLines={multiline ? 4 : 1}>{value || placeholder || "Not added"}</Text>
        )}
        {editing ? (
          <View style={styles.inputActions}>
            <IconButton icon="close" size={15} style={styles.inputActionButton} onPress={cancelEdit} disabled={saving} />
            {saving ? <ActivityIndicator size="small" color={colors.primary} style={styles.inputActionButton} /> : (
              <IconButton icon="check" size={16} style={styles.inputActionButton} onPress={save} disabled={saving} />
            )}
          </View>
        ) : (
          <IconButton icon="pencil" size={13} style={styles.pencilButton} onPress={startEdit} />
        )}
      </View>
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </FieldGroup>
  );
}

function ActivityItem({ item, last }: { item: LeadActivity; last: boolean }) {
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
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={22} color={colors.textSecondary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export default function LeadDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string; phone?: string; stage?: string; source?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [lead, setLead] = useState<LeadDetails | null>(() => params.name && params.phone ? {
    id, name: params.name, phone: params.phone, stage: params.stage || "new", source: params.source,
    created_at: "",
  } : null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [followups, setFollowups] = useState<LeadFollowup[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(!params.name);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const { stages, colorFor, statusesFor } = useStages();
  const [stageSheetOpen, setStageSheetOpen] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [lostReasonStep, setLostReasonStep] = useState(false);
  const [pendingLostStage, setPendingLostStage] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [customLostReason, setCustomLostReason] = useState("");

  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [followupSheetOpen, setFollowupSheetOpen] = useState(false);
  const [followupType, setFollowupType] = useState<FollowupType>("call");
  const [followupAt, setFollowupAt] = useState(defaultFollowupDate());
  const [followupNotes, setFollowupNotes] = useState("");
  const [followupMeetingUrl, setFollowupMeetingUrl] = useState("");
  const [schedulingFollowup, setSchedulingFollowup] = useState(false);

  const [activityOptionsOpen, setActivityOptionsOpen] = useState(false);
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [logType, setLogType] = useState<ActivityLogType>("call");
  const [logOutcome, setLogOutcome] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logShowFollowup, setLogShowFollowup] = useState(false);
  const [logFollowupAt, setLogFollowupAt] = useState(defaultFollowupDate());
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [logError, setLogError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!id) { setError("This lead link is invalid."); setLoading(false); return; }
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const result = await fetchLeadDetails(id);
      setLead(result.lead); setActivities(result.activities); setFollowups(result.followups);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load this lead."));
    } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function openUrl(url: string, fallback: string) {
    Linking.openURL(url).catch(() => Alert.alert("Unable to open", fallback));
  }

  async function contactLead(type: ContactActivityType, url: string, fallback: string) {
    if (!lead) return;
    try { await trackContactActivity(lead.id, type); } catch { /* best-effort */ }
    const now = new Date().toISOString();
    setActivities((current) => [{
      id: `local-${type}-${Date.now()}`,
      activity_type: type,
      title: type === "call" ? "Call Initiated" : type === "whatsapp" ? "WhatsApp Opened" : "Email Initiated",
      description: "Contact initiated from the CurveLead mobile app.",
      created_at: now,
    }, ...current]);
    openUrl(url, fallback);
  }

  async function saveField(field: keyof UpdateLeadInput, value: string) {
    if (!lead) return;
    const payload = (field === "deal_value" ? { deal_value: value ? Number(value.replace(/[^\d.]/g, "")) : 0 } : { [field]: value }) as UpdateLeadInput;
    const updated = await updateLeadDetails(lead.id, payload);
    setLead((current) => current ? { ...current, ...updated } : updated);
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
    setUpdatingStage(true);
    try {
      const updated = await updateLeadStage(lead.id, newStage, reason);
      setLead((current) => current ? { ...current, ...updated, lead_status: "" } : updated);
      setStageSheetOpen(false); setLostReasonStep(false);
    } catch (stageError) {
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
    setUpdatingStatus(true);
    try {
      const updated = await updateLeadStatus(lead.id, status);
      setLead((current) => current ? { ...current, ...updated } : updated);
      setStatusSheetOpen(false);
    } catch (statusError) {
      Alert.alert("Couldn't update status", errorMessage(statusError, "Please try again."));
    } finally { setUpdatingStatus(false); }
  }

  function openFollowupSheet() {
    setFollowupType("call"); setFollowupAt(defaultFollowupDate());
    setFollowupNotes(""); setFollowupMeetingUrl("");
    setFollowupSheetOpen(true);
  }

  async function scheduleFollowup() {
    if (!lead) return;
    setSchedulingFollowup(true);
    try {
      const created = await createLeadFollowup(lead.id, {
        followup_type: followupType,
        next_followup_at: followupAt.toISOString(),
        notes: followupNotes.trim() || undefined,
        meeting_url: followupType === "demo" ? followupMeetingUrl.trim() || undefined : undefined,
      });
      setFollowups((current) => [created, ...current.map((item) => ({ ...item, is_completed: true }))]);
      setFollowupSheetOpen(false);
    } catch (followupError) {
      Alert.alert("Couldn't schedule follow-up", errorMessage(followupError, "Please try again."));
    } finally { setSchedulingFollowup(false); }
  }

  function chooseActivityType(type: ActivityLogType) {
    setActivityOptionsOpen(false);
    setLogType(type); setLogOutcome(""); setLogNotes("");
    setLogShowFollowup(false); setLogFollowupAt(defaultFollowupDate());
    setLogError("");
    setTimeout(() => setLogSheetOpen(true), 180);
  }

  async function saveActivityLog() {
    if (!lead) return;
    if (logType === "call" && !logOutcome) { setLogError("Select a call outcome."); return; }
    setLoggingActivity(true); setLogError("");
    try {
      const defaultNotes = logType === "call" ? logOutcome : `${ACTIVITY_TYPE_LABEL[logType]} logged`;
      await logLeadActivity(lead.id, {
        notes: logNotes.trim() || defaultNotes,
        followup_type: logType,
        outcome: logType === "call" ? logOutcome : undefined,
        next_followup_at: logShowFollowup ? logFollowupAt.toISOString() : undefined,
      });
      setLogSheetOpen(false);
      load(true);
    } catch (logActivityError) {
      setLogError(errorMessage(logActivityError, "Could not log this activity."));
    } finally { setLoggingActivity(false); }
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

  const stage = lead.stage || "";
  const stageColors = colorFor(stage);
  const currentStage = stages.find((item) => item.name.toLowerCase() === stage.toLowerCase());
  const availableStatuses = statusesFor(stage);
  const pendingFollowups = followups.filter((item) => !item.is_completed);
  const nextFollowup = pendingFollowups.sort((a, b) => new Date(a.next_followup_at).getTime() - new Date(b.next_followup_at).getTime())[0];
  const lastActivity = activities[0];

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Lead details" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={2}>{lead.name}</Text>
          <Text style={styles.nameSubtitle}>Assigned to {lead.assigned_to_name || "you"} · {relativeTime(lead.updated_at || lead.created_at) || "just now"}</Text>
        </View>

        {error ? <Pressable style={styles.warning} onPress={() => load()}><Text style={styles.warningText}>Some details couldn&apos;t be refreshed. Tap to retry.</Text></Pressable> : null}

        <View style={styles.actionsRow}>
          <Button mode="contained" icon="phone" style={styles.actionButton} contentStyle={styles.actionButtonContent} labelStyle={styles.actionButtonLabel} onPress={() => contactLead("call", `tel:${lead.phone}`, "Calling is not supported on this device.")}>Call</Button>
          <Button mode="outlined" icon="whatsapp" style={styles.actionButton} contentStyle={styles.actionButtonContent} labelStyle={styles.actionButtonLabel} onPress={() => contactLead("whatsapp", `https://wa.me/${lead.phone.replace(/\D/g, "")}`, "WhatsApp could not be opened.")}>WhatsApp</Button>
          <Button mode="outlined" icon="email-outline" style={styles.actionButton} contentStyle={styles.actionButtonContent} labelStyle={styles.actionButtonLabel} onPress={() => lead.email ? contactLead("email", `mailto:${lead.email}`, "Email could not be opened.") : Alert.alert("No email", "Add an email address to this lead first.")}>Email</Button>
        </View>

        <SegmentedButtons
          style={styles.tabs}
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          buttons={[
            { value: "overview", label: "Overview" },
            { value: "details", label: "Details" },
            { value: "activities", label: "Activities" },
          ]}
        />

        {tab === "overview" ? (
          <View style={styles.body}>
            <FieldGroup label="Next Follow-up" required>
              <ActionBox icon="calendar-outline" value={nextFollowup ? dateTime(nextFollowup.next_followup_at) : undefined} placeholder="Not scheduled" onPress={openFollowupSheet} />
            </FieldGroup>

            <FieldGroup label="Last Activity">
              <StaticBox icon="checkmark-circle" iconColor={colors.success} value={lastActivity ? `${relativeTime(lastActivity.created_at)} · ${pretty(lastActivity.activity_type)}` : "No activity yet"} />
            </FieldGroup>

            <FieldGroup label="Stage">
              <ActionBox icon="pricetag-outline" chip={{ bg: stageColors.bg, text: stageColors.text, label: currentStage?.name || pretty(stage) }} onPress={openStageSheet} />
            </FieldGroup>

            <FieldGroup label="Status">
              <ActionBox icon="flag-outline" value={lead.lead_status || undefined} placeholder="Not set" onPress={() => setStatusSheetOpen(true)} />
            </FieldGroup>

            <EditableField
              icon="wallet-outline" label="Expected Value" value={lead.deal_value ? String(lead.deal_value) : ""}
              keyboardType="decimal-pad" placeholder="0"
              onSave={(value) => saveField("deal_value", value)}
            />
            {lead.deal_value ? <Text style={styles.moneyHint}>{money(lead.deal_value)}</Text> : null}

            <EditableField
              icon="chatbubble-ellipses-outline" label="Interaction Notes" value={lead.notes || ""} multiline
              placeholder="Add useful context for your team…" onSave={(value) => saveField("notes", value)}
            />
          </View>
        ) : tab === "details" ? (
          <View style={styles.body}>
            <EditableField icon="person-outline" label="Name" value={lead.name} required onSave={(value) => saveField("name", value)} />
            <EditableField icon="call-outline" label="Mobile Number" value={lead.phone} required keyboardType="phone-pad" onSave={(value) => saveField("phone", value)} />
            <EditableField
              icon="mail-outline" label="Email Address" value={lead.email || ""} keyboardType="email-address" placeholder="email@gmail.com"
              validate={(value) => value && !/^\S+@\S+\.\S+$/.test(value) ? "Enter a valid email address." : null}
              onSave={(value) => saveField("email", value)}
            />
            <EditableField icon="business-outline" label="Business Name" value={lead.business_name || ""} onSave={(value) => saveField("business_name", value)} />
            <EditableField icon="location-outline" label="Location" value={lead.location || ""} onSave={(value) => saveField("location", value)} />

            <View style={styles.twoUp}>
              <View style={styles.twoUpItem}>
                <FieldGroup label="Date Created">
                  <StaticBox icon="calendar-outline" value={dateTime(lead.lead_date || lead.created_at).split(",")[0]} />
                </FieldGroup>
              </View>
              <View style={styles.twoUpItem}>
                <EditableField icon="navigate-outline" label="Lead Source" value={lead.source || ""} onSave={(value) => saveField("source", value)} />
              </View>
            </View>

            <EditableField icon="map-outline" label="Address" value={lead.address || ""} multiline onSave={(value) => saveField("address", value)} />
          </View>
        ) : (
          <View style={styles.body}>
            <Button mode="contained" icon="plus-circle" onPress={() => setActivityOptionsOpen(true)} style={styles.addActivityButton} contentStyle={styles.addActivityButtonContent}>Add Activity</Button>
            {activities.length ? (
              <View style={styles.timeline}>
                {activities.map((item, index) => <ActivityItem key={item.id} item={item} last={index === activities.length - 1} />)}
              </View>
            ) : (
              <EmptyState icon="pulse-outline" title="No activity yet" text="Calls, notes and stage changes will appear here." />
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={stageSheetOpen} transparent animationType="fade" onRequestClose={closeStageSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={closeStageSheet}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
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

      <Modal visible={statusSheetOpen} transparent animationType="fade" onRequestClose={() => !updatingStatus && setStatusSheetOpen(false)}>
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
            ) : (
              <Text style={styles.sheetHint}>No statuses configured for this stage yet — manage them from the web dashboard.</Text>
            )}
            <Button mode="outlined" onPress={() => setStatusSheetOpen(false)} disabled={updatingStatus} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={followupSheetOpen} transparent animationType="fade" onRequestClose={() => !schedulingFollowup && setFollowupSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !schedulingFollowup && setFollowupSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Schedule Follow-up</Text>

            <Text style={styles.sheetSectionLabel}>Type</Text>
            <View style={styles.chipRow}>
              {FOLLOWUP_TYPES.map((item) => (
                <Chip key={item.key} selected={followupType === item.key} onPress={() => setFollowupType(item.key)} mode={followupType === item.key ? "flat" : "outlined"} icon={item.icon}>
                  {item.label}
                </Chip>
              ))}
            </View>

            <Text style={styles.sheetSectionLabel}>Follow-Up Date &amp; Time</Text>
            <DateTimeField value={followupAt} onChange={setFollowupAt} minimumDate={new Date()} />

            {followupType === "demo" ? (
              <TextInput mode="outlined" label="Meeting link (optional)" value={followupMeetingUrl} onChangeText={setFollowupMeetingUrl} placeholder="https://meet.google.com/…" autoCapitalize="none" keyboardType="url" style={styles.sheetField} />
            ) : null}

            <TextInput mode="outlined" label="Notes (optional)" value={followupNotes} onChangeText={setFollowupNotes} placeholder="e.g. Discuss pricing" style={styles.sheetField} />

            <Button mode="contained" onPress={scheduleFollowup} loading={schedulingFollowup} disabled={schedulingFollowup} style={styles.sheetPrimaryButton} contentStyle={styles.sheetButtonContent}>Schedule follow-up</Button>
            <Button mode="outlined" onPress={() => setFollowupSheetOpen(false)} disabled={schedulingFollowup} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={activityOptionsOpen} transparent animationType="fade" onRequestClose={() => setActivityOptionsOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setActivityOptionsOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Log an activity</Text>
            <View style={styles.optionsList}>
              {ACTIVITY_TYPES.map((item) => (
                <List.Item
                  key={item.key} title={item.label} titleStyle={styles.optionLabel}
                  onPress={() => chooseActivityType(item.key)}
                  right={() => <Ionicons name={item.icon} size={19} color={colors.textSecondary} />}
                />
              ))}
            </View>
            <Button mode="outlined" onPress={() => setActivityOptionsOpen(false)} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={logSheetOpen} transparent animationType="fade" onRequestClose={() => !loggingActivity && setLogSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !loggingActivity && setLogSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Log {ACTIVITY_TYPE_LABEL[logType]} Activity</Text>

            {logError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{logError}</Text></View> : null}

            {logType === "call" ? (
              <>
                <Text style={styles.sheetSectionLabel}>Call Outcome <Text style={styles.required}>*</Text></Text>
                <RadioButton.Group value={logOutcome} onValueChange={setLogOutcome}>
                  <View style={styles.radioList}>
                    {CALL_OUTCOMES.map((option) => (
                      <RadioButton.Item key={option} label={option} value={option} labelStyle={styles.radioLabel} style={styles.radioRow} />
                    ))}
                  </View>
                </RadioButton.Group>
              </>
            ) : null}

            <TextInput mode="outlined" label="Note" value={logNotes} onChangeText={setLogNotes} placeholder="Type a summary here…" style={styles.sheetField} />

            <List.Item
              title="Schedule next follow-up" titleStyle={styles.followupToggleText}
              onPress={() => setLogShowFollowup((value) => !value)} style={styles.followupToggle}
              left={() => <List.Icon icon={logShowFollowup ? "checkbox-marked" : "checkbox-blank-outline"} color={colors.primary} />}
            />

            {logShowFollowup ? (
              <>
                <Text style={styles.sheetSectionLabel}>Follow-Up Date &amp; Time</Text>
                <DateTimeField value={logFollowupAt} onChange={setLogFollowupAt} minimumDate={new Date()} />
              </>
            ) : null}

            <View style={styles.logActions}>
              <Button mode="contained" onPress={saveActivityLog} loading={loggingActivity} disabled={loggingActivity} style={styles.logSaveButton} contentStyle={styles.sheetButtonContent}>Save Activity</Button>
              <Button mode="text" onPress={() => setLogSheetOpen(false)} disabled={loggingActivity} style={styles.logCancelButton} contentStyle={styles.sheetButtonContent}>Cancel</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  loadingText: { color: colors.textSecondary, fontSize: 13, marginTop: 10 },
  errorTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  errorMessage: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  retry: { marginTop: 18 },
  backLink: { marginTop: 5 },

  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },

  nameBlock: { alignItems: "center", paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16 },
  name: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
  nameSubtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 6, textAlign: "center" },

  warning: { marginHorizontal: 18, marginBottom: 12, backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10 },
  warningText: { color: colors.danger, textAlign: "center", fontSize: 12, fontWeight: "600" },

  actionsRow: { flexDirection: "row", paddingHorizontal: 18, gap: 8 },
  actionButton: { flex: 1 },
  actionButtonContent: { height: 42 },
  actionButtonLabel: { fontSize: 12 },

  tabs: { marginTop: 22, marginHorizontal: 18 },

  body: { paddingHorizontal: 20, paddingTop: 20 },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 7 },
  required: { color: colors.danger },
  fieldErrorText: { color: colors.danger, fontSize: 11, fontWeight: "600", marginTop: 5 },

  inputArea: { minHeight: 46, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12 },
  inputAreaMultiline: { alignItems: "flex-start", paddingVertical: 12, minHeight: 84 },
  inputIcon: { marginRight: 10 },
  inputIconTop: { marginTop: 2 },
  inputAreaText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "500", paddingVertical: 12 },
  inputAreaTextMultiline: { paddingVertical: 0, minHeight: 60 },
  pencilButton: { margin: 0, marginLeft: 8 },
  inputActions: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
  inputActionButton: { margin: 0 },

  statusChip: { flex: 1, alignSelf: "flex-start", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  statusChipText: { fontSize: 13, fontWeight: "700" },
  moneyHint: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: -12, marginBottom: 18 },

  twoUp: { flexDirection: "row", gap: 12 },
  twoUpItem: { flex: 1 },

  addActivityButton: { marginBottom: 20 },
  addActivityButtonContent: { height: 46 },

  timeline: {},
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

  stageList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  stageListDot: { width: 10, height: 10, borderRadius: 5, alignSelf: "center", marginLeft: 4 },
  stageListText: { color: colors.text, fontSize: 14, fontWeight: "600" },

  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },

  optionsList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  optionLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },

  radioList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  radioRow: { paddingVertical: 0 },
  radioLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },

  followupToggle: { marginTop: 16, paddingHorizontal: 0 },
  followupToggleText: { color: colors.text, fontSize: 13, fontWeight: "700" },

  logActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  logSaveButton: { flex: 1 },
  logCancelButton: { flex: 1 },
});
