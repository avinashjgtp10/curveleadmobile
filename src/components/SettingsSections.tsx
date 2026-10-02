import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Switch, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { useAuth } from "@/contexts/AuthContext";
import { fetchStaff, StaffMember } from "@/api/staff";
import { fetchCampaigns, Campaign } from "@/api/campaigns";
import { generateApiKey } from "@/api/integrations";
import {
  AssignmentRule, CannedReply, AutomationSequence, fetchSequences, createAssignmentRule, createWebhook, deleteAssignmentRule, disableWebhook, FeatureConfig,
  fetchAssignmentRules, fetchCapiEvents, fetchDeliveries, fetchFeatureConfig, fetchTeams, fetchWebhooks, InboundReplyRule,
  LEAD_SOURCES, LogEntry, reorderAssignmentRules, saveFeatureConfig, Team, updateAssignmentRule, Webhook,
} from "@/api/workspaceSettings";

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function pretty(value: string) {
  return value.replace(/_/g, " ");
}

function when(value?: string) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---- small shared pieces ----------------------------------------------------------------------

function Box({ children }: { children: React.ReactNode }) {
  return <View style={styles.box}>{children}</View>;
}

function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={{ marginTop: 12, marginBottom: 6 }}>
      <Text style={styles.label}>{children}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Input({ value, onChangeText, placeholder, keyboardType, secure, multiline }: {
  value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: "default" | "number-pad" | "url"; secure?: boolean; multiline?: boolean;
}) {
  return (
    <View style={[styles.input, multiline && { minHeight: 80 }]}>
      <RNTextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} style={styles.inputText}
        keyboardType={keyboardType} secureTextEntry={secure} multiline={multiline} autoCapitalize="none" textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function Chips({ options, value, onToggle, labelOf }: { options: string[]; value: string[]; onToggle: (option: string) => void; labelOf?: (option: string) => string }) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = value.includes(option);
        return (
          <Pressable key={option} onPress={() => onToggle(option)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{labelOf ? labelOf(option) : pretty(option)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, busy }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[{ marginTop: 16 }, busy && { opacity: 0.6 }]}>
      <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={icon} size={18} color="#fff" />}
        <Text style={styles.primaryText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function Loading({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (!error) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
      <Text style={styles.errorText}>{error}</Text>
      <Pressable style={styles.retry} onPress={onRetry}><Text style={styles.retryText}>Try again</Text></Pressable>
    </View>
  );
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
      <Text style={styles.errorBoxText}>{message}</Text>
    </View>
  );
}

function LogList({ title, items }: { title: string; items: LogEntry[] }) {
  return (
    <Box>
      <Text style={styles.cardTitle}>{title}</Text>
      {items.length ? items.slice(0, 15).map((item) => {
        const ok = ["sent", "success", "delivered", "ok"].includes(String(item.status).toLowerCase());
        return (
          <View key={item.id} style={styles.logRow}>
            <View style={[styles.logDot, { backgroundColor: ok ? "#22c55e" : "#ef4444" }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.logTitle}>{item.event || item.event_name} · {item.status}</Text>
              <Text style={styles.hint}>{when(item.created_at)}</Text>
              {item.error ? <Text style={styles.logError}>{item.error}</Text> : null}
            </View>
          </View>
        );
      }) : <Text style={styles.hint}>No events yet.</Text>}
    </Box>
  );
}

// ---- Assignment -------------------------------------------------------------------------------

type RuleForm = {
  name: string; sources: string[]; campaign_ids: string[]; location: string;
  target: "user" | "team" | "selected"; userId: string; teamId: string; staffIds: string[]; sequenceId: string;
};

const EMPTY_RULE: RuleForm = { name: "", sources: [], campaign_ids: [], location: "", target: "user", userId: "", teamId: "", staffIds: [], sequenceId: "" };

function toggle(list: string[], item: string) {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

export function AssignmentSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sequences, setSequences] = useState<AutomationSequence[]>([]);
  const [config, setConfig] = useState<FeatureConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<AssignmentRule | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_RULE);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingFallback, setSavingFallback] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [ruleList, staffList, teamList, campaignList, sequenceList, featureConfig] = await Promise.all([
        fetchAssignmentRules(),
        fetchStaff().catch(() => [] as StaffMember[]),
        fetchTeams().catch(() => [] as Team[]),
        fetchCampaigns().catch(() => [] as Campaign[]),
        fetchSequences().catch(() => [] as AutomationSequence[]),
        fetchFeatureConfig().catch(() => null),
      ]);
      setRules(ruleList); setStaff(staffList); setTeams(teamList); setCampaigns(campaignList); setSequences(sequenceList); setConfig(featureConfig);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load assignment rules."));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const staffName = (id: string) => staff.find((member) => member.id === id)?.name || "Unavailable staff";

  function describe(rule: AssignmentRule) {
    const source = rule.sources?.length ? `source: ${rule.sources.map(pretty).join(", ")}` : "any source";
    const city = rule.location_contains ? ` · city: "${rule.location_contains}"` : "";
    const target = rule.staff_ids?.length ? rule.staff_ids.map(staffName).join(", ") : rule.assign_to_user_name || rule.assign_to_team_name || "-";
    const sequence = rule.sequence_name ? ` · starts "${rule.sequence_name}"` : "";
    return `${source}${city} → ${target}${sequence}`;
  }

  function openForm(rule?: AssignmentRule) {
    setEditing(rule || null);
    setFormError("");
    setForm(rule ? {
      name: rule.name, sources: rule.sources || [], campaign_ids: rule.campaign_ids || [], location: rule.location_contains || "",
      target: rule.staff_ids?.length ? "selected" : rule.assign_to_team_id ? "team" : "user",
      userId: rule.assign_to_user_id || "", teamId: rule.assign_to_team_id || "", staffIds: rule.staff_ids || [], sequenceId: rule.sequence_id || "",
    } : EMPTY_RULE);
    setMode("form");
  }

  async function saveRule() {
    if (!form.name.trim()) { setFormError("Rule name is required."); return; }
    if (form.target === "user" && !form.userId) { setFormError("Pick a team member to assign to."); return; }
    if (form.target === "team" && !form.teamId) { setFormError("Pick a team to assign to."); return; }
    if (form.target === "selected" && !form.staffIds.length) { setFormError("Select at least one staff member."); return; }
    setSaving(true); setFormError("");
    const payload = {
      name: form.name.trim(), sources: form.sources, campaign_ids: form.campaign_ids, location_contains: form.location.trim(),
      staff_ids: form.target === "selected" ? form.staffIds : undefined,
      assign_to_user_id: form.target === "user" ? form.userId : undefined,
      assign_to_team_id: form.target === "team" ? form.teamId : undefined,
      sequence_id: form.sequenceId || undefined,
    };
    try {
      if (editing) await updateAssignmentRule(editing.id, payload); else await createAssignmentRule(payload);
      setMode("list");
      await load();
    } catch (saveError) {
      setFormError(errorMessage(saveError, "Could not save this rule."));
    } finally { setSaving(false); }
  }

  function confirmDelete(rule: AssignmentRule) {
    Alert.alert("Delete this assignment rule?", rule.name, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteAssignmentRule(rule.id); await load(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  async function toggleRule(rule: AssignmentRule) {
    const next = !rule.is_active;
    setRules((current) => current.map((item) => item.id === rule.id ? { ...item, is_active: next } : item));
    try { await updateAssignmentRule(rule.id, { is_active: next }); }
    catch (toggleError) {
      setRules((current) => current.map((item) => item.id === rule.id ? { ...item, is_active: !next } : item));
      Alert.alert("Couldn't update", errorMessage(toggleError, "Please try again."));
    }
  }

  async function move(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    setRules(next);
    try { await reorderAssignmentRules(next.map((rule) => rule.id)); }
    catch { Alert.alert("Couldn't reorder", "Please try again."); load(); }
  }

  async function saveFallback(id: string | null) {
    if (!config) return;
    const next = { ...config, assignment_fallback_id: id };
    setConfig(next);
    setSavingFallback(true);
    try { await saveFeatureConfig(next); }
    catch (saveError) { Alert.alert("Couldn't save", errorMessage(saveError, "Please try again.")); load(); }
    finally { setSavingFallback(false); }
  }

  if (loading || (error && !rules.length)) return <Loading error={error} onRetry={() => { setLoading(true); load(); }} />;

  if (mode === "form") {
    return (
      <View style={styles.stack}>
        <Pressable style={styles.backRow} onPress={() => setMode("list")} hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backText}>Back to rules</Text>
        </Pressable>
        <Box>
          <Text style={styles.cardTitle}>{editing ? "Edit rule" : "New assignment rule"}</Text>
          <ErrorLine message={formError} />
          <Label>Rule name *</Label>
          <Input value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="e.g. Meta leads → Priya" />
          <Label hint="Leave empty to match any source.">Match source</Label>
          <Chips options={LEAD_SOURCES} value={form.sources} onToggle={(item) => setForm({ ...form, sources: toggle(form.sources, item) })} />
          {campaigns.length ? (
            <>
              <Label hint="Leave empty to match any campaign.">Campaigns</Label>
              <Chips options={campaigns.map((c) => c.id)} value={form.campaign_ids} onToggle={(item) => setForm({ ...form, campaign_ids: toggle(form.campaign_ids, item) })} labelOf={(id) => campaigns.find((c) => c.id === id)?.name || id} />
            </>
          ) : null}
          <Label>Location</Label>
          <Input value={form.location} onChangeText={(location) => setForm({ ...form, location })} placeholder="City contains (e.g. Mumbai)" />
          <Label>Assign to *</Label>
          <View style={styles.segment}>
            {([["user", "Person"], ["team", "Team"], ["selected", "Round-robin"]] as const).map(([key, text]) => (
              <Pressable key={key} onPress={() => setForm({ ...form, target: key })} style={[styles.segmentButton, form.target === key && styles.segmentActive]}>
                <Text style={[styles.segmentText, form.target === key && styles.segmentTextActive]}>{text}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: 10 }}>
            {form.target === "user" ? (
              <Chips options={staff.map((s) => s.id)} value={form.userId ? [form.userId] : []} onToggle={(id) => setForm({ ...form, userId: id })} labelOf={(id) => staffName(id)} />
            ) : form.target === "team" ? (
              teams.length ? <Chips options={teams.map((t) => t.id)} value={form.teamId ? [form.teamId] : []} onToggle={(id) => setForm({ ...form, teamId: id })} labelOf={(id) => teams.find((t) => t.id === id)?.name || id} /> : <Text style={styles.hint}>No teams yet. Create one in Team.</Text>
            ) : (
              <Chips options={staff.map((s) => s.id)} value={form.staffIds} onToggle={(id) => setForm({ ...form, staffIds: toggle(form.staffIds, id) })} labelOf={(id) => staffName(id)} />
            )}
          </View>
          <Label hint="Optionally start a follow-up sequence for matched leads.">Follow-up sequence</Label>
          <Chips options={["", ...sequences.map((s) => s.id)]} value={[form.sequenceId]} onToggle={(id) => setForm({ ...form, sequenceId: id })} labelOf={(id) => id ? sequences.find((s) => s.id === id)?.name || id : "None"} />
          <PrimaryButton label={editing ? "Save changes" : "Create rule"} icon="checkmark" onPress={saveRule} busy={saving} />
        </Box>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Box>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Lead assignment rules</Text>
            <Text style={styles.hint}>Auto-assign new leads to a person or team by source, campaign or city. The first matching rule wins.</Text>
          </View>
        </View>
        {isAdmin ? (
          <Pressable style={styles.addButton} onPress={() => openForm()}>
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addText}>New rule</Text>
          </Pressable>
        ) : <Text style={styles.noteBox}>Only admins can change assignment rules.</Text>}
        {rules.length ? rules.map((rule, index) => (
          <View key={rule.id} style={[styles.ruleCard, !rule.is_active && { opacity: 0.55 }]}>
            <View style={styles.ruleTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ruleName}>{rule.name}</Text>
                <Text style={styles.hint}>{describe(rule)}</Text>
              </View>
              <Switch value={rule.is_active} onValueChange={() => toggleRule(rule)} disabled={!isAdmin} color={colors.primary} />
            </View>
            {isAdmin ? (
              <View style={styles.ruleActions}>
                <Pressable style={styles.iconBtn} onPress={() => move(index, -1)} disabled={index === 0}><Ionicons name="arrow-up" size={16} color={index === 0 ? colors.border : colors.textSecondary} /></Pressable>
                <Pressable style={styles.iconBtn} onPress={() => move(index, 1)} disabled={index === rules.length - 1}><Ionicons name="arrow-down" size={16} color={index === rules.length - 1 ? colors.border : colors.textSecondary} /></Pressable>
                <View style={{ flex: 1 }} />
                <Pressable style={styles.iconBtn} onPress={() => openForm(rule)}><Ionicons name="create-outline" size={17} color={colors.primary} /></Pressable>
                <Pressable style={[styles.iconBtn, { backgroundColor: colors.dangerSoft }]} onPress={() => confirmDelete(rule)}><Ionicons name="trash-outline" size={17} color={colors.danger} /></Pressable>
              </View>
            ) : null}
          </View>
        )) : <Text style={styles.noneText}>No assignment rules yet.</Text>}
      </Box>

      {config ? (
        <Box>
          <Text style={styles.cardTitle}>Fallback assignee</Text>
          <Text style={styles.hint}>Who gets a lead when no rule matches.</Text>
          <View style={{ marginTop: 10 }}>
            <Chips
              options={["", ...staff.map((s) => s.id)]} value={[config.assignment_fallback_id || ""]}
              onToggle={(id) => isAdmin && saveFallback(id || null)} labelOf={(id) => id ? staffName(id) : "Leave unassigned"}
            />
          </View>
          {savingFallback ? <Text style={styles.hint}>Saving...</Text> : null}
        </Box>
      ) : null}
    </View>
  );
}

// ---- Messaging --------------------------------------------------------------------------------

export function MessagingSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [config, setConfig] = useState<FeatureConfig | null>(null);
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setConfig(await fetchFeatureConfig());
      fetchCapiEvents().then(setEvents).catch(() => {});
    } catch (loadError) { setError(errorMessage(loadError, "Could not load messaging settings.")); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!config) return <Loading error={error} onRetry={load} />;

  const change = <K extends keyof FeatureConfig>(key: K, value: FeatureConfig[K]) => { setConfig((current) => current && { ...current, [key]: value }); setSaved(false); };
  const setRule = (index: number, patch: Partial<InboundReplyRule>) => change("inbound_reply_rules", config.inbound_reply_rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  const setReply = (index: number, patch: Partial<CannedReply>) => change("canned_replies", config.canned_replies.map((reply, i) => i === index ? { ...reply, ...patch } : reply));

  async function save() {
    if (!config) return;
    setSaving(true); setSaveError(""); setSaved(false);
    try { await saveFeatureConfig(config); setSaved(true); }
    catch (saveFailure) { setSaveError(errorMessage(saveFailure, "Save failed.")); }
    finally { setSaving(false); }
  }

  return (
    <View style={styles.stack}>
      {!isAdmin ? <Text style={styles.noteBox}>Only admins can save changes here.</Text> : null}
      <Box>
        <Text style={styles.cardTitle}>Messaging & integrations</Text>
        <Label>Alert after hours without leads</Label>
        <Input value={String(config.integration_alert_hours ?? "")} onChangeText={(v) => change("integration_alert_hours", Number(v.replace(/\D/g, "")) || 0)} keyboardType="number-pad" />
        <Label hint="Use the limit shown in WhatsApp Manager. The stricter of this and Meta's live tier applies.">WhatsApp messaging limit (unique recipients / 24h)</Label>
        <Input value={config.whatsapp_messaging_limit ? String(config.whatsapp_messaging_limit) : ""} onChangeText={(v) => change("whatsapp_messaging_limit", Number(v.replace(/\D/g, "")) || null)} keyboardType="number-pad" />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ruleName}>Send qualified / won conversions to Meta</Text>
            <Text style={styles.hint}>Helps Meta find better leads. Set the dataset and token in Integrations.</Text>
          </View>
          <Switch value={!!config.meta_capi_enabled} onValueChange={(v) => change("meta_capi_enabled", v)} color={colors.primary} />
        </View>
        <Label>Qualified event</Label>
        <Input value={config.meta_qualified_event || ""} onChangeText={(v) => change("meta_qualified_event", v)} />
        <Label>Won event</Label>
        <Input value={config.meta_won_event || ""} onChangeText={(v) => change("meta_won_event", v)} />
      </Box>

      <Box>
        <Text style={styles.cardTitle}>Inbound replies</Text>
        <Text style={styles.hint}>First matching rule wins. Text replies need an open 24-hour session. Templates must be approved, body-only and without variables.</Text>
        {config.inbound_reply_rules.map((rule, index) => (
          <View key={index} style={styles.ruleCard}>
            <Text style={styles.label}>When</Text>
            <Chips options={["keyword", "outside_hours", "first_message"]} value={[rule.trigger]} onToggle={(v) => setRule(index, { trigger: v as InboundReplyRule["trigger"] })} />
            {rule.trigger === "keyword" ? (<><Label>Keyword</Label><Input value={rule.keyword || ""} onChangeText={(v) => setRule(index, { keyword: v })} /></>) : null}
            <Label>Reply type</Label>
            <Chips options={["text", "template"]} value={[rule.type]} onToggle={(v) => setRule(index, { type: v as InboundReplyRule["type"] })} />
            <Label>{rule.type === "template" ? "Approved template name" : "Reply text"}</Label>
            <Input value={rule.value || ""} onChangeText={(v) => setRule(index, { value: v })} multiline={rule.type === "text"} />
            {rule.type === "template" ? (<><Label>Template language</Label><Input value={rule.language || ""} onChangeText={(v) => setRule(index, { language: v })} /></>) : null}
            <Pressable onPress={() => change("inbound_reply_rules", config.inbound_reply_rules.filter((_, i) => i !== index))}><Text style={styles.removeText}>Remove</Text></Pressable>
          </View>
        ))}
        <Pressable style={styles.addButton} onPress={() => change("inbound_reply_rules", [...config.inbound_reply_rules, { trigger: "keyword", keyword: "", type: "text", value: "", language: "en_US" }])}>
          <Ionicons name="add" size={18} color={colors.primary} /><Text style={styles.addText}>Add rule</Text>
        </Pressable>
      </Box>

      <Box>
        <Text style={styles.cardTitle}>Canned replies</Text>
        <Text style={styles.hint}>Quick answers your team can insert while chatting.</Text>
        {config.canned_replies.map((reply, index) => (
          <View key={index} style={styles.ruleCard}>
            <Label>Shortcut name</Label>
            <Input value={reply.name} onChangeText={(v) => setReply(index, { name: v })} />
            <Label>Reply</Label>
            <Input value={reply.text} onChangeText={(v) => setReply(index, { text: v })} multiline />
            <Pressable onPress={() => change("canned_replies", config.canned_replies.filter((_, i) => i !== index))}><Text style={styles.removeText}>Remove</Text></Pressable>
          </View>
        ))}
        <Pressable style={styles.addButton} onPress={() => change("canned_replies", [...config.canned_replies, { name: "", text: "" }])}>
          <Ionicons name="add" size={18} color={colors.primary} /><Text style={styles.addText}>Add reply</Text>
        </Pressable>
      </Box>

      <ErrorLine message={saveError} />
      {saved ? <Text style={styles.savedText}>Saved</Text> : null}
      {isAdmin ? <PrimaryButton label="Save settings" icon="checkmark" onPress={save} busy={saving} /> : null}

      <LogList title="CAPI event log" items={events} />
    </View>
  );
}

// ---- Developer --------------------------------------------------------------------------------

export function DeveloperSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [hookList, deliveryList] = await Promise.all([fetchWebhooks(), fetchDeliveries().catch(() => [] as LogEntry[])]);
      setHooks(hookList); setDeliveries(deliveryList);
    } catch (loadError) { setError(errorMessage(loadError, "Could not load developer settings.")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function share(message: string) {
    try { await Share.share({ message }); } catch { /* closed */ }
  }

  function makeKey() {
    Alert.alert("Generate a new API key?", "Any existing key stops working immediately.", [
      { text: "Cancel", style: "cancel" },
      { text: "Generate", onPress: async () => {
        setBusy("key");
        try { setApiKey(await generateApiKey()); }
        catch (keyError) { Alert.alert("Couldn't generate a key", errorMessage(keyError, "Please try again.")); }
        finally { setBusy(""); }
      } },
    ]);
  }

  async function addHook() {
    if (!/^https:\/\//i.test(url.trim())) { Alert.alert("Use a secure address", "The webhook URL must start with https://"); return; }
    setBusy("hook");
    try { setSecret(await createWebhook(url.trim())); setUrl(""); await load(); }
    catch (hookError) { Alert.alert("Couldn't add the webhook", errorMessage(hookError, "Please try again.")); }
    finally { setBusy(""); }
  }

  function disable(hook: Webhook) {
    Alert.alert("Disable this webhook?", hook.url, [
      { text: "Cancel", style: "cancel" },
      { text: "Disable", style: "destructive", onPress: async () => {
        try { await disableWebhook(hook.id); await load(); }
        catch (disableError) { Alert.alert("Couldn't disable", errorMessage(disableError, "Please try again.")); }
      } },
    ]);
  }

  if (loading || (error && !hooks.length)) return <Loading error={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.stack}>
      {!isAdmin ? <Text style={styles.noteBox}>Only admins can create keys and webhooks.</Text> : null}
      <Box>
        <Text style={styles.cardTitle}>API key</Text>
        <Text style={styles.hint}>A key appears once. Save it somewhere safe before leaving this screen.</Text>
        {apiKey ? <Text selectable style={styles.code}>{apiKey}</Text> : null}
        <View style={styles.ruleActions}>
          {isAdmin ? <Pressable style={styles.addButton} onPress={makeKey} disabled={busy === "key"}>{busy === "key" ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="key-outline" size={16} color={colors.primary} />}<Text style={styles.addText}>Generate / regenerate</Text></Pressable> : null}
          {apiKey ? <Pressable style={styles.addButton} onPress={() => share(apiKey)}><Ionicons name="share-outline" size={16} color={colors.primary} /><Text style={styles.addText}>Share</Text></Pressable> : null}
        </View>
      </Box>

      <Box>
        <Text style={styles.cardTitle}>Outgoing webhooks</Text>
        <Text style={styles.hint}>Sends lead.created, lead.stage_changed and lead.won. Verify the X-CurveLead-Signature header (HMAC-SHA256 over timestamp + "." + the raw body) and de-duplicate using the delivery ID.</Text>
        {isAdmin ? (
          <>
            <Label>Webhook URL</Label>
            <Input value={url} onChangeText={setUrl} placeholder="https://example.com/webhook" keyboardType="url" />
            <PrimaryButton label="Add webhook" icon="add" onPress={addHook} busy={busy === "hook"} />
          </>
        ) : null}
        {secret ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Signing secret (shown once)</Text>
            <Text selectable style={styles.code}>{secret}</Text>
            <Pressable style={styles.addButton} onPress={() => share(secret)}><Ionicons name="share-outline" size={16} color={colors.primary} /><Text style={styles.addText}>Share secret</Text></Pressable>
          </View>
        ) : null}
        {hooks.length ? hooks.map((hook) => (
          <View key={hook.id} style={styles.ruleCard}>
            <Text style={styles.ruleName} numberOfLines={2}>{hook.url}</Text>
            <View style={styles.ruleActions}>
              <View style={[styles.statusPill, { backgroundColor: hook.active ? "#dcfce7" : "#eef2f6" }]}><Text style={[styles.statusText, { color: hook.active ? "#15803d" : "#64748b" }]}>{hook.active ? "Active" : "Disabled"}</Text></View>
              <View style={{ flex: 1 }} />
              {hook.active && isAdmin ? <Pressable onPress={() => disable(hook)}><Text style={styles.removeText}>Disable</Text></Pressable> : null}
            </View>
          </View>
        )) : <Text style={styles.noneText}>No webhooks yet.</Text>}
      </Box>

      <LogList title="Delivery log" items={deliveries} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  center: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20 },
  errorText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  retry: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 10, marginTop: 8 },
  errorBoxText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },
  noteBox: { color: colors.textSecondary, fontSize: 12, backgroundColor: "#fff7ed", borderRadius: 12, padding: 10, marginTop: 8 },
  savedText: { color: "#15803d", fontSize: 13, fontWeight: "800", textAlign: "center" },

  box: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, justifyContent: "center" },
  inputText: { color: colors.text, fontSize: 14, paddingVertical: 8 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f4f9fc", borderWidth: 1, borderColor: "#d7e6f1", maxWidth: "100%" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },

  segment: { flexDirection: "row", backgroundColor: "#eaf1f7", borderRadius: 12, padding: 3 },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", height: 36, borderRadius: 10 },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: colors.primary },

  primary: { height: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: colors.primary, fontSize: 13, fontWeight: "800" },

  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.primarySoft },
  addText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  ruleCard: { marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#e2eef7", backgroundColor: "#f8fbfd" },
  ruleTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  ruleName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  ruleActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#eef4f9", alignItems: "center", justifyContent: "center" },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: "800", marginTop: 10 },
  noneText: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 16 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },

  code: { color: colors.text, fontSize: 12, backgroundColor: "#f4f9fc", borderRadius: 10, padding: 10, marginTop: 8, overflow: "hidden" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "800" },

  logRow: { flexDirection: "row", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eef4f9", marginTop: 4 },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  logTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  logError: { color: colors.danger, fontSize: 12, marginTop: 2 },
});
