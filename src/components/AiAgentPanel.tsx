import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Switch, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import {
  AiAgentState, AiKnowledge, AiReply, draftAiAgent, fetchAiAgent, fetchAiReplies, KNOWLEDGE_FIELDS, saveAiAgent,
} from "@/api/aiAgent";

const BUSINESS_TYPES = ["E-commerce", "Service Business", "Real Estate", "Restaurant", "Education", "Healthcare", "Other"];

type Mode = "overview" | "setup" | "review";

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function whenText(value?: string) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Field({ label, hint, value, onChangeText, lines = 1, placeholder }: {
  label: string; hint?: string; value: string; onChangeText: (value: string) => void; lines?: number; placeholder?: string;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <View style={[styles.inputBox, lines > 1 && { minHeight: 28 + lines * 20 }]}>
        <RNTextInput
          style={styles.inputText} value={value} onChangeText={onChangeText} placeholder={placeholder}
          placeholderTextColor={colors.textMuted} multiline={lines > 1} textAlignVertical={lines > 1 ? "top" : "center"}
          autoCapitalize={lines > 1 ? "sentences" : "none"}
        />
      </View>
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, busy }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={busy && styles.disabled}>
      <LinearGradient colors={["#06b6d4", "#6366f1", "#d946ef"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={icon} size={18} color="#fff" />}
        <Text style={styles.primaryText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function AiAgentPanel() {
  const [state, setState] = useState<AiAgentState | null>(null);
  const [replies, setReplies] = useState<AiReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("overview");
  const [toggling, setToggling] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AiKnowledge>({});
  const [website, setWebsite] = useState("");
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
  const [businessContext, setBusinessContext] = useState("");
  const [groundRules, setGroundRules] = useState("");
  const [agentName, setAgentName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [setupError, setSetupError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setState(await fetchAiAgent());
      fetchAiReplies().then(setReplies).catch(() => {});
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load your AI Agent."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasAgent = !!(state?.knowledge?.about || "").trim();

  async function toggle(enabled: boolean) {
    if (!state) return;
    setToggling(true);
    setState({ ...state, enabled });
    try {
      await saveAiAgent(enabled, state.knowledge);
    } catch (toggleError) {
      setState({ ...state, enabled: !enabled });
      Alert.alert("Couldn't update", errorMessage(toggleError, "Please try again."));
    } finally {
      setToggling(false);
    }
  }

  async function runDraft() {
    if (!website.trim()) { setSetupError("Enter your website so the AI can read it."); return; }
    setDrafting(true);
    setSetupError("");
    try {
      const knowledge = await draftAiAgent({
        website: website.trim(), businessType, businessContext: businessContext.trim(), groundRules: groundRules.trim(),
        agentName: agentName.trim(), greeting: greeting.trim(),
      });
      setDraft(knowledge);
      setMode("review");
    } catch (draftError) {
      setSetupError(errorMessage(draftError, "Could not read that website. Check the address and try again."));
    } finally {
      setDrafting(false);
    }
  }

  async function activate() {
    setSaving(true);
    try {
      // Editing a live agent keeps its on/off state; a brand-new draft goes live.
      const enabled = hasAgent ? !!state?.enabled : true;
      await saveAiAgent(enabled, draft);
      setState({ enabled, knowledge: draft });
      setMode("overview");
      Alert.alert(hasAgent ? "Saved" : "AI Agent is live", hasAgent ? "Your AI Agent's training was updated." : "It will now answer your leads on WhatsApp.");
    } catch (saveError) {
      Alert.alert("Couldn't save", errorMessage(saveError, "Please try again."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  if (error && !state) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} />
        <Text style={styles.centerTitle}>Could not load</Text>
        <Text style={styles.centerText}>{error}</Text>
        <Pressable style={styles.retry} onPress={() => { setLoading(true); load(); }}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  if (mode === "review") {
    return (
      <View style={styles.stack}>
        <Pressable style={styles.backRow} onPress={() => setMode(hasAgent ? "overview" : "setup")} hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backText}>{hasAgent ? "Back" : "Back to setup"}</Text>
        </Pressable>
        <Text style={styles.sectionTitle}>{hasAgent ? "Edit training" : "Review before it goes live"}</Text>
        <Text style={styles.sectionHint}>{hasAgent ? "The AI only knows what you write here." : "Drafted from your website. Fix anything that's off, especially prices."}</Text>
        {KNOWLEDGE_FIELDS.map((field) => (
          <Field
            key={field.key} label={field.label} hint={field.hint} lines={field.lines}
            value={String(draft[field.key] || "")}
            onChangeText={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
        <PrimaryButton label={hasAgent ? "Save training" : "Activate AI Agent"} icon="checkmark" onPress={activate} busy={saving} />
      </View>
    );
  }

  if (mode === "setup" || !hasAgent) {
    return (
      <View style={styles.stack}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}><Ionicons name="hardware-chip-outline" size={26} color="#7c3aed" /></View>
          <Text style={styles.introTitle}>Your WhatsApp AI Agent</Text>
          <Text style={styles.introText}>Give it your website. It learns your business, then answers leads on WhatsApp for you. You review everything before it goes live.</Text>
        </View>

        {setupError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{setupError}</Text>
          </View>
        ) : null}

        <Field label="Website *" value={website} onChangeText={setWebsite} placeholder="https://yourbusiness.com" />

        <Text style={styles.fieldLabel}>Business type</Text>
        <View style={styles.pillRow}>
          {BUSINESS_TYPES.map((item) => {
            const active = businessType === item;
            return (
              <Pressable key={item} onPress={() => setBusinessType(item)} style={[styles.pill, active && styles.pillActive]}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        <Field label="Agent name (optional)" value={agentName} onChangeText={setAgentName} placeholder="e.g. Priya" />
        <Field label="Greeting (optional)" value={greeting} onChangeText={setGreeting} placeholder="e.g. Hi! How can I help?" />
        <Field label="Extra things to know (optional)" hint="Anything your website won't tell it." value={businessContext} onChangeText={setBusinessContext} lines={2} placeholder="e.g. we only serve women" />
        <Field label="Ground rules (optional)" value={groundRules} onChangeText={setGroundRules} lines={2} placeholder="e.g. never discuss competitors" />

        <PrimaryButton label={drafting ? "Reading your website..." : "Draft my AI Agent"} icon="sparkles" onPress={runDraft} busy={drafting} />
        {hasAgent ? (
          <Pressable style={styles.linkButton} onPress={() => setMode("overview")}><Text style={styles.linkText}>Cancel</Text></Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <LinearGradient colors={state?.enabled ? ["#06b6d4", "#6366f1", "#d946ef"] : ["#94a3b8", "#64748b"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statusCard}>
        <View style={styles.statusTop}>
          <View style={styles.statusIcon}><Ionicons name="hardware-chip-outline" size={24} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>AI Agent is {state?.enabled ? "ON" : "OFF"}</Text>
            <Text style={styles.statusSub}>{state?.enabled ? "Answering your leads on WhatsApp" : "Turn on to auto-reply to leads"}</Text>
          </View>
          <Switch value={!!state?.enabled} onValueChange={toggle} disabled={toggling} color="#ffffff" trackColor={{ true: "rgba(255,255,255,0.45)", false: "rgba(255,255,255,0.25)" }} />
        </View>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What it knows</Text>
        <Text style={styles.aboutText} numberOfLines={6}>{state?.knowledge.about}</Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.actionButton} onPress={() => { setDraft({ ...(state?.knowledge || {}) }); setMode("review"); }}>
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>Edit training</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => setMode("setup")}>
            <Ionicons name="refresh-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>Re-read website</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent AI replies</Text>
        <Text style={styles.cardHint}>Check these, then improve the training if something sounds off.</Text>
        {replies.length ? replies.slice(0, 10).map((item) => (
          <View key={item.id} style={styles.replyRow}>
            <Text style={styles.replyMeta}>{item.lead_name} · {whenText(item.sent_at)}</Text>
            {item.lead_message ? <View style={styles.bubbleIn}><Text style={styles.bubbleText}>{item.lead_message}</Text></View> : null}
            <View style={styles.bubbleAi}><Text style={styles.bubbleText}>{item.reply}</Text></View>
          </View>
        )) : <Text style={styles.noneText}>No AI replies yet.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  center: { minHeight: 220, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 6 },
  centerTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  centerText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  retry: { marginTop: 8, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  disabled: { opacity: 0.6 },

  introCard: { alignItems: "center", backgroundColor: "#faf5ff", borderRadius: 22, borderWidth: 1, borderColor: "#ede9fe", padding: 20 },
  introIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" },
  introTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 12 },
  introText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12 },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },

  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 4 },
  fieldHint: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  inputBox: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, paddingVertical: 4, justifyContent: "center" },
  inputText: { color: colors.text, fontSize: 14, paddingVertical: 8 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 2 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f4f9fc", borderWidth: 1, borderColor: "#d7e6f1" },
  pillActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  pillText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  pillTextActive: { color: "#ffffff" },

  primaryButton: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  linkButton: { alignItems: "center", paddingVertical: 6 },
  linkText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },

  backRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  sectionHint: { color: colors.textSecondary, fontSize: 13, marginTop: -8 },

  statusCard: { borderRadius: 22, padding: 16 },
  statusTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  statusTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  statusSub: { color: "rgba(255,255,255,0.88)", fontSize: 12, marginTop: 2 },

  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 8 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardHint: { color: colors.textMuted, fontSize: 12, marginTop: -4 },
  aboutText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 14, backgroundColor: colors.primarySoft },
  actionText: { color: colors.primary, fontSize: 13, fontWeight: "800" },

  replyRow: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#eef4f9" },
  replyMeta: { color: colors.textMuted, fontSize: 11 },
  bubbleIn: { alignSelf: "flex-start", maxWidth: "88%", backgroundColor: "#f1f5f9", borderRadius: 14, borderTopLeftRadius: 4, padding: 10 },
  bubbleAi: { alignSelf: "flex-end", maxWidth: "88%", backgroundColor: "#ede9fe", borderRadius: 14, borderTopRightRadius: 4, padding: 10 },
  bubbleText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  noneText: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 14 },
});
