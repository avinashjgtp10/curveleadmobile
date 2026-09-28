import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Switch, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { draftGmbReviewMessage, fetchGmbReviewRequestSettings, GmbReviewRequestSettings, updateGmbReviewRequestSettings } from "@/api/gmb";

type GmbTab = "review-requests" | "reviews" | "posts" | "insights";

const TABS: { key: GmbTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "review-requests", label: "Review Requests", icon: "star-outline" },
  { key: "reviews", label: "Reviews", icon: "chatbubble-ellipses-outline" },
  { key: "posts", label: "Posts", icon: "megaphone-outline" },
  { key: "insights", label: "Insights", icon: "bar-chart-outline" },
];

const DEFAULT_REVIEW_MESSAGE = "Hi {{name}}! Thank you for choosing us — it means a lot. If you enjoyed the experience, would you mind leaving us a quick Google review? {{review_link}}";

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function isRouteMissing(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <View style={styles.comingSoon}>
      <View style={styles.comingSoonIcon}><Ionicons name="time-outline" size={22} color={colors.primary} /></View>
      <Text style={styles.comingSoonTitle}>{label} coming soon</Text>
      <Text style={styles.comingSoonText}>We're bringing this to the app shortly.</Text>
    </View>
  );
}

function ReviewRequestsTab() {
  const [settings, setSettings] = useState<GmbReviewRequestSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [reviewLink, setReviewLink] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await fetchGmbReviewRequestSettings();
      setSettings(data);
      setEnabled(data.enabled);
      setReviewLink(data.review_link);
      setMessage(data.message);
    } catch (loadError) {
      if (isRouteMissing(loadError)) {
        // Backend route isn't live yet — fall back to sensible defaults instead of an error screen.
        const fallback: GmbReviewRequestSettings = { enabled: false, review_link: "", message: DEFAULT_REVIEW_MESSAGE };
        setSettings(fallback);
        setEnabled(fallback.enabled);
        setReviewLink(fallback.review_link);
        setMessage(fallback.message);
      } else {
        setError(errorMessage(loadError, "Could not load review request settings."));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleEnabled(value: boolean) {
    setEnabled(value);
    try {
      await updateGmbReviewRequestSettings({ enabled: value, review_link: reviewLink, message });
    } catch (toggleError) {
      if (isRouteMissing(toggleError)) return;
      setEnabled(!value);
      Alert.alert("Couldn't update this", errorMessage(toggleError, "Please try again."));
    }
  }

  async function handleDraft() {
    setDrafting(true);
    try {
      const draft = await draftGmbReviewMessage();
      setMessage(draft);
    } catch (draftError) {
      if (isRouteMissing(draftError)) { Alert.alert("Coming soon", "AI drafting for this message isn't available yet."); return; }
      Alert.alert("Couldn't draft a message", errorMessage(draftError, "Please try again."));
    } finally {
      setDrafting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data = await updateGmbReviewRequestSettings({ enabled, review_link: reviewLink.trim(), message });
      setSettings(data);
      Alert.alert("Saved", "Your review request settings have been updated.");
    } catch (saveError) {
      if (isRouteMissing(saveError)) { Alert.alert("Saved locally", "This will sync once the review request feature goes live."); return; }
      Alert.alert("Couldn't save these settings", errorMessage(saveError, "Please try again."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (error) {
    return (
      <View style={styles.state}>
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={load} style={styles.retry}>Try again</Button>
      </View>
    );
  }
  if (!settings) return null;

  return (
    <>
      <Card mode="outlined" style={styles.card}>
        <Card.Content style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={styles.cardTitle}>Ask for a Google review when a lead is won</Text>
            <Text style={styles.cardDescription}>The moment a lead reaches a Won stage, this message is sent to them on WhatsApp automatically — no staff involved.</Text>
          </View>
          <Switch value={enabled} onValueChange={toggleEnabled} color={colors.primary} />
        </Card.Content>
      </Card>

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Your Google review link</Text>
          <Text style={styles.cardDescription}>From your Google Business Profile: Home → "Get more reviews" → Share review form. It's a link that opens the review box directly, no searching needed.</Text>
          <TextInput
            mode="outlined" value={reviewLink} onChangeText={setReviewLink}
            placeholder="https://g.page/r/.../review" autoCapitalize="none" autoCorrect={false}
            style={styles.field}
          />
        </Card.Content>
      </Card>

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <View style={styles.messageHeaderRow}>
            <Text style={styles.cardTitle}>Message</Text>
            <Button
              mode="contained" compact icon="creation" onPress={handleDraft} loading={drafting} disabled={drafting}
              style={styles.draftButton} contentStyle={styles.draftButtonContent} labelStyle={styles.draftButtonLabel}
            >
              Draft with AI
            </Button>
          </View>
          <Text style={styles.cardDescription}>Keep {"{{name}}"} and {"{{review_link}}"} in the message — they're swapped for the real values when it's sent.</Text>
          <TextInput
            mode="outlined" value={message} onChangeText={setMessage} multiline numberOfLines={5}
            style={[styles.field, styles.messageField]}
          />
        </Card.Content>
      </Card>

      <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={styles.saveButton} contentStyle={styles.saveButtonContent}>
        Save
      </Button>
    </>
  );
}

export default function GmbScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<GmbTab>("review-requests");

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="GMB" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable key={tab.key} style={[styles.tabChip, active && styles.tabChipActive]} onPress={() => setActiveTab(tab.key)}>
              <Ionicons name={tab.icon} size={14} color={active ? colors.surface : colors.textSecondary} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        {activeTab === "review-requests" ? <ReviewRequestsTab /> : <ComingSoonTab label={TABS.find((tab) => tab.key === activeTab)!.label} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  state: { alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 30 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 14 },

  tabRow: { gap: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  tabChip: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  tabLabelActive: { color: colors.surface },

  content: { padding: 18, gap: 14 },

  card: {},
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  cardDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  field: { marginTop: 12 },
  messageField: { minHeight: 100 },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleBody: { flex: 1 },

  messageHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  draftButton: { borderRadius: 8 },
  draftButtonContent: { height: 32 },
  draftButtonLabel: { fontSize: 11, fontWeight: "800", marginVertical: 0, marginHorizontal: 8 },

  saveButton: { borderRadius: 10, marginTop: 4 },
  saveButtonContent: { height: 48 },

  comingSoon: { alignItems: "center", paddingVertical: 60, gap: 10 },
  comingSoonIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  comingSoonTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  comingSoonText: { color: colors.textSecondary, fontSize: 12 },
});
