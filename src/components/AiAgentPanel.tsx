import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Switch, Text } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import {
  AiAgentState, AiKnowledge, AiReply, draftAiAgent, fetchAiAgent, fetchAiReplies, KNOWLEDGE_FIELDS, saveAiAgent,
} from "@/api/aiAgent";

// Palette of the redesigned screen: lavender page, white cards, blue actions, green "live" status.
const UI = { bg: "#eef1fa", line: "#e4e9f3", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", blue: "#2457e6", green: "#0f7b5f", greenSoft: "#d8f0e5", red: "#d6334f" };

const BUSINESS_TYPES = ["E-commerce", "Service Business", "Real Estate", "Restaurant", "Education", "Healthcare", "Other"];

type Mode = "overview" | "setup" | "review";

const KNOWS_TAGS: Record<string, string> = {
  about: "About us", services_prices: "Services & prices", faqs: "FAQs", tone: "Tone", goal: "Main goal", never_say: "Boundaries", handoff_rules: "Hand-off rules",
};
const MAX_TAGS = 5;

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
      <View style={styles.primaryButton}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={icon} size={18} color="#fff" />}
        <Text style={styles.primaryText}>{label}</Text>
      </View>
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
  const [showAllReplies, setShowAllReplies] = useState(false);
  // "Looks good" is remembered for this visit only; there is no server call for it.
  const [reviewed, setReviewed] = useState<string[]>([]);

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
    // Without "About the business" the agent would go live knowing nothing, and the screen would treat it as not set up.
    if (!String(draft.about || "").trim()) {
      Alert.alert("Add a description", "Fill in \"About the business\" so the AI knows what to say to your leads.");
      return;
    }
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

  if (loading) return <View style={styles.center}><ActivityIndicator color={UI.blue} /></View>;

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
          <Ionicons name="arrow-back" size={18} color={UI.blue} />
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
          <View style={styles.introIcon}><Ionicons name="hardware-chip-outline" size={24} color="#2457e6" /></View>
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

  const enabled = !!state?.enabled;
  const knowledge = state?.knowledge || {};
  const filledTags = KNOWLEDGE_FIELDS.filter((field) => String(knowledge[field.key] || "").trim()).map((field) => KNOWS_TAGS[field.key] || field.label);
  const shownTags = filledTags.slice(0, MAX_TAGS);
  const moreTags = filledTags.length - shownTags.length;
  const visibleReplies = showAllReplies ? replies.slice(0, 20) : replies.slice(0, 3);
  const avatarColors = ["#c8294a", "#d98a0b", "#2457e6", "#0f7b5f", "#7c3aed"];
  function editTraining() { setDraft({ ...(state?.knowledge || {}) }); setMode("review"); }

  return (
    <View style={styles.stack}>
      <View style={[styles.statusCard, !enabled && styles.statusCardOff]}>
        <View style={styles.statusTop}>
          <View style={[styles.statusIcon, !enabled && { backgroundColor: UI.muted }]}><Ionicons name="sparkles" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>AI Agent is {enabled ? "ON" : "OFF"}</Text>
            <Text style={styles.statusSub}>{enabled ? "Answering your leads on WhatsApp" : "Turn on to auto-reply to leads"}</Text>
          </View>
          <Switch value={enabled} onValueChange={toggle} disabled={toggling} color={UI.green} />
        </View>
        <View style={styles.statusPills}>
          <View style={styles.statusPill}>
            <View style={[styles.liveDot, !enabled && { backgroundColor: UI.muted }]} />
            <Text style={styles.statusPillText}>{enabled ? "Live on WhatsApp" : "Not live"}</Text>
          </View>
          <View style={styles.statusPill}><Text style={styles.statusPillText}>{enabled ? "Auto-replies enabled" : "Auto-replies paused"}</Text></View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardIcon}><Ionicons name="bulb-outline" size={16} color={UI.blue} /></View>
          <Text style={styles.cardTitle}>What it knows</Text>
        </View>
        <Text style={styles.aboutText} numberOfLines={6}>{state?.knowledge.about}</Text>
        {shownTags.length ? (
          <View style={styles.tagRow}>
            {shownTags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}
            {moreTags > 0 ? <View style={styles.tag}><Text style={styles.tagText}>+{moreTags} more</Text></View> : null}
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionButton, styles.actionPrimary]} onPress={editTraining} accessibilityRole="button">
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={[styles.actionText, { color: "#fff" }]}>Edit training</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.actionLight]} onPress={() => setMode("setup")} accessibilityRole="button">
            <Ionicons name="refresh-outline" size={16} color={UI.blue} />
            <Text style={styles.actionText}>Re-read website</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.repliesHeader}>
          <Text style={styles.cardTitle}>Recent AI replies</Text>
          {replies.length > 3 ? (
            <Pressable onPress={() => setShowAllReplies((value) => !value)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.viewAll}>{showAllReplies ? "Show less" : "View all"}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.cardHint}>Check these, then improve the training if something sounds off.</Text>
        {replies.length ? visibleReplies.map((item) => {
          const done = reviewed.includes(item.id);
          return (
            <View key={item.id} style={styles.replyRow}>
              <View style={styles.replyHead}>
                <View style={[styles.replyAvatar, { backgroundColor: avatarColors[(item.lead_name?.charCodeAt(0) || 0) % avatarColors.length] }]}>
                  <Text style={styles.replyAvatarText}>{(item.lead_name?.charAt(0) || "?").toUpperCase()}</Text>
                </View>
                <Text style={styles.replyName} numberOfLines={1}>{item.lead_name}</Text>
                <Text style={styles.replyMeta}>{whenText(item.sent_at)}</Text>
              </View>
              {item.lead_message ? <View style={styles.bubbleIn}><Text style={styles.bubbleText}>{item.lead_message}</Text></View> : null}
              <View style={styles.bubbleAi}><Text style={styles.bubbleAiText}>{item.reply}</Text></View>
              {done ? (
                <Text style={styles.reviewedText}>Marked as good</Text>
              ) : (
                <View style={styles.feedbackRow}>
                  <Pressable style={[styles.feedbackButton, { backgroundColor: UI.greenSoft }]} onPress={() => setReviewed((current) => [...current, item.id])} accessibilityRole="button">
                    <Text style={[styles.feedbackText, { color: UI.green }]}>Looks good</Text>
                  </Pressable>
                  <Pressable style={[styles.feedbackButton, { backgroundColor: "#fde9c9" }]} onPress={editTraining} accessibilityRole="button">
                    <Text style={[styles.feedbackText, { color: "#b45f06" }]}>Needs fixing</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }) : <Text style={styles.noneText}>No AI replies yet.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  center: { minHeight: 220, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 6 },
  centerTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  centerText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  retry: { marginTop: 8, backgroundColor: UI.blue, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  disabled: { opacity: 0.6 },

  introCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 20 },
  introIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#dbe5fb", alignItems: "center", justifyContent: "center" },
  introTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 12 },
  introText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12 },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },

  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 4 },
  fieldHint: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  inputBox: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 4, justifyContent: "center" },
  inputText: { color: colors.text, fontSize: 14, paddingVertical: 8 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 2 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line },
  pillActive: { backgroundColor: UI.blue, borderColor: UI.blue },
  pillText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  pillTextActive: { color: "#ffffff" },

  primaryButton: { height: 48, borderRadius: 12, backgroundColor: UI.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  linkButton: { alignItems: "center", paddingVertical: 6 },
  linkText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },

  backRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: UI.blue, fontSize: 13, fontWeight: "800" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  sectionHint: { color: colors.textSecondary, fontSize: 13, marginTop: -8 },

  statusCard: { borderRadius: 16, padding: 14, backgroundColor: "#d8f0e5", borderWidth: 1, borderColor: "#b7e0cb", gap: 12 },
  statusCardOff: { backgroundColor: "#eceff5", borderColor: UI.line },
  statusTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: UI.green, alignItems: "center", justifyContent: "center" },
  statusTitle: { color: UI.ink, fontSize: 15, fontFamily: "DMSans_700Bold" },
  statusSub: { color: UI.sub, fontSize: 11, marginTop: 2 },
  statusPills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: UI.green },
  statusPillText: { color: UI.ink, fontSize: 10, fontFamily: "Inter_600SemiBold" },

  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 14, gap: 10 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#dbe5fb", alignItems: "center", justifyContent: "center" },
  cardTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  cardHint: { color: UI.sub, fontSize: 11, marginTop: -4 },
  aboutText: { color: UI.sub, fontSize: 12, lineHeight: 18 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: "#e9edf9", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: "#475569", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 2 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 10 },
  actionPrimary: { backgroundColor: UI.blue },
  actionLight: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line },
  actionText: { color: UI.blue, fontSize: 12, fontFamily: "Inter_700Bold" },

  repliesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  viewAll: { color: UI.blue, fontSize: 12, fontFamily: "Inter_700Bold" },
  replyRow: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: UI.line },
  replyHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  replyAvatar: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  replyAvatarText: { color: "#ffffff", fontSize: 11, fontFamily: "Inter_700Bold" },
  replyName: { flex: 1, color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold" },
  replyMeta: { color: UI.sub, fontSize: 10 },
  bubbleIn: { alignSelf: "flex-start", maxWidth: "88%", backgroundColor: "#eef1f6", borderRadius: 10, padding: 10 },
  bubbleAi: { alignSelf: "flex-end", maxWidth: "88%", backgroundColor: UI.blue, borderRadius: 10, padding: 10 },
  bubbleText: { color: UI.ink, fontSize: 12, lineHeight: 17 },
  bubbleAiText: { color: "#ffffff", fontSize: 12, lineHeight: 17 },
  feedbackRow: { flexDirection: "row", gap: 10 },
  feedbackButton: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  feedbackText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  reviewedText: { color: UI.green, fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  noneText: { color: UI.muted, fontSize: 13, textAlign: "center", paddingVertical: 14 },
});
