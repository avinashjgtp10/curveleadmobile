import React, { useCallback, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  TextInput as RNTextInput, View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import {
  activateAiAdDraft, AiAdBrief, AiAdDestination, AiAdDraft, AiAdDraftSummary, AiAdLanguage, AiMetaDraft,
  createAiAdDraft, createAiAdOnMeta, fetchAiAdDraft, fetchAiAdDrafts, updateAiAdDraft, uploadAiAdImage,
} from "@/api/ads";
import { Campaign, CampaignMetrics, CampaignPeriod, deleteCampaign, fetchCampaignsPage } from "@/api/campaigns";
import { fetchGoogleAdsIntegrations, fetchIntegrationSettings, IntegrationSettings, syncAdInsights } from "@/api/integrations";


// The add forms' palette: pale blue page, white cards with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7" };
const PAGE_SIZE = 20;
const ACTION_BLUE = "#1d4fd8";

const PERIODS: { value: CampaignPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
];

const PERIOD_TABS: { value: CampaignPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "Week" },
  { value: "this_month", label: "Month" },
  { value: "last_month", label: "Last month" },
];

type ManagerTab = "campaigns" | "meta" | "google" | "forms";

const MANAGER_TABS: { value: ManagerTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "campaigns", label: "Campaigns", icon: "megaphone-outline" },
  { value: "meta", label: "Meta Ads", icon: "trending-up-outline" },
  { value: "google", label: "Google Ads", icon: "search-outline" },
  { value: "forms", label: "Lead Forms", icon: "clipboard-outline" },
];

const EMPTY_AI_BRIEF: AiAdBrief = {
  offer: "",
  goal: "",
  location: "",
  budget_per_day_inr: 500,
  duration_days: 14,
  language: "en",
  destination: "LEAD_FORM",
};

const LANGUAGES: { value: AiAdLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
];

const CTA_OPTIONS: Record<AiAdDestination, string[]> = {
  LEAD_FORM: ["BOOK_NOW", "SIGN_UP", "GET_QUOTE", "LEARN_MORE", "APPLY_NOW", "CONTACT_US", "GET_OFFER", "SUBSCRIBE", "DOWNLOAD"],
  WHATSAPP: ["WHATSAPP_MESSAGE"],
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "#dcfce7", text: "#15803d", label: "Active" },
  paused: { bg: "#fef3c7", text: "#b45309", label: "Paused" },
  completed: { bg: "#eef2f6", text: "#64748b", label: "Completed" },
  draft: { bg: "#e0f2fe", text: "#0369a1", label: "Draft" },
};

const SOURCE_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  meta_ads: { icon: "logo-facebook", color: "#1877f2", bg: "#dbeafe" },
  google_ads: { icon: "logo-google", color: "#ea4335", bg: "#fee2e2" },
  instagram: { icon: "logo-instagram", color: "#c026d3", bg: "#fae8ff" },
  whatsapp: { icon: "logo-whatsapp", color: "#16a34a", bg: "#dcfce7" },
  organic: { icon: "leaf-outline", color: "#15803d", bg: "#dcfce7" },
  referral: { icon: "people-outline", color: "#d97706", bg: "#fef3c7" },
  other: { icon: "megaphone-outline", color: UI.teal, bg: "#e0e7ff" },
};

const VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  high_quality: { bg: "#dcfce7", text: "#15803d" },
  high_volume_low_quality: { bg: "#fef3c7", text: "#b45309" },
  underperforming: { bg: "#fee2e2", text: "#b91c1c" },
  average: { bg: "#eef2f6", text: "#64748b" },
  too_early: { bg: "#e0f2fe", text: "#0369a1" },
  no_leads: { bg: "#eef2f6", text: "#94a3b8" },
};

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function pretty(value?: string) {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value?: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function num(value?: number) {
  return Number(value || 0).toLocaleString("en-IN");
}

function shortDate(value?: string) {
  const [y, m, d] = String(value || "").split("T")[0].split("-").map(Number);
  return y ? new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
}

function ctaLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const EMPTY_METRICS: CampaignMetrics = { total_leads: 0, won: 0, conversion_rate: 0, active_campaigns: 0 };

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [managerTab, setManagerTab] = useState<ManagerTab>("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetrics>(EMPTY_METRICS);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [googleActive, setGoogleActive] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<CampaignPeriod>("this_month");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBrief, setAiBrief] = useState<AiAdBrief>(EMPTY_AI_BRIEF);
  const [aiDrafts, setAiDrafts] = useState<AiAdDraftSummary[]>([]);
  const [aiLoadingDrafts, setAiLoadingDrafts] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDraft, setAiDraft] = useState<AiAdDraft | null>(null);
  const [aiDraftForm, setAiDraftForm] = useState<AiMetaDraft | null>(null);
  const [aiBusyAction, setAiBusyAction] = useState("");
  const [activateConfirm, setActivateConfirm] = useState("");

  // Only the newest request may update the screen, so a slow reply for an earlier period can't overwrite a later one.
  const latestRequest = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async (options: { refresh?: boolean; nextPage?: number; period?: CampaignPeriod } = {}) => {
    const requestId = ++latestRequest.current;
    const nextPage = options.nextPage || 1;
    const append = nextPage > 1;
    if (options.refresh) setRefreshing(true);
    else if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const [result, integrationSettings, googleList] = await Promise.all([
        fetchCampaignsPage({ period: options.period || period, page: nextPage, limit: PAGE_SIZE }),
        fetchIntegrationSettings().catch(() => null),
        fetchGoogleAdsIntegrations().catch(() => null),
      ]);
      if (requestId !== latestRequest.current) return;
      hasData.current = true;
      setCampaigns((current) => append ? [...current, ...result.campaigns.filter((item) => !current.some((existing) => existing.id === item.id))] : result.campaigns);
      setMetrics(result.metrics);
      setTotal(result.total);
      setPage(nextPage);
      if (integrationSettings) setSettings(integrationSettings);
      if (googleList) setGoogleActive(googleList.filter((item) => item.is_active).length);
      else if (integrationSettings?.google_configured) setGoogleActive(1);
    } catch (loadError) {
      if (requestId !== latestRequest.current) return;
      const message = errorMessage(loadError, "Could not load campaigns.");
      // With campaigns already on screen the error banner isn't shown, so say so instead of failing silently.
      if (hasData.current) Alert.alert("Couldn't load campaigns", message);
      else setError(message);
    } finally {
      if (requestId === latestRequest.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [period]);

  // `load` changes with the period, so choosing a period reloads through this effect.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function choosePeriod(value: CampaignPeriod) {
    if (value === period) return;
    setPeriod(value);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncAdInsights();
      Alert.alert("Sync complete", result.message);
      load();
    } catch (syncError) {
      Alert.alert("Sync failed", errorMessage(syncError, "Connect an ad account in Integrations first."));
    } finally {
      setSyncing(false);
    }
  }

  async function openAiCreator() {
    setAiOpen(true);
    setAiError("");
    setAiDraft(null);
    setAiDraftForm(null);
    setActivateConfirm("");
    setAiLoadingDrafts(true);
    try {
      setAiDrafts(await fetchAiAdDrafts());
    } catch {
      setAiDrafts([]);
    } finally {
      setAiLoadingDrafts(false);
    }
  }

  function updateAiBrief<K extends keyof AiAdBrief>(key: K, value: AiAdBrief[K]) {
    setAiBrief((current) => ({ ...current, [key]: value }));
    setAiError("");
  }

  async function handleCreateAiDraft() {
    if (!aiBrief.offer.trim()) {
      setAiError("Tell AI what you are advertising.");
      return;
    }
    setAiDrafting(true);
    setAiError("");
    try {
      const draft = await createAiAdDraft({
        ...aiBrief,
        offer: aiBrief.offer.trim(),
        goal: aiBrief.goal?.trim(),
        location: aiBrief.location?.trim(),
        budget_per_day_inr: Number(aiBrief.budget_per_day_inr) || 500,
        duration_days: Number(aiBrief.duration_days) || 14,
      });
      setAiDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
      setAiDraft(draft);
      setAiDraftForm(draft.draft || null);
    } catch (draftError) {
      setAiError(errorMessage(draftError, "Could not draft the campaign."));
    } finally {
      setAiDrafting(false);
    }
  }

  async function openAiDraft(id: string) {
    setAiBusyAction("open");
    setAiError("");
    try {
      const draft = await fetchAiAdDraft(id);
      setAiDraft(draft);
      setAiDraftForm(draft.draft || null);
      setActivateConfirm("");
    } catch (openError) {
      setAiError(errorMessage(openError, "Could not open the draft."));
    } finally {
      setAiBusyAction("");
    }
  }

  function updateDraftField<K extends keyof AiMetaDraft>(key: K, value: AiMetaDraft[K]) {
    setAiDraftForm((current) => current ? { ...current, [key]: value } : current);
    setAiError("");
  }

  function updateDraftArray(key: "primary_texts" | "headlines", index: number, value: string) {
    setAiDraftForm((current) => {
      if (!current) return current;
      const next = [...(current[key] || [])];
      next[index] = value;
      return { ...current, [key]: next };
    });
  }

  function updateLeadFormPrivacy(value: string) {
    setAiDraftForm((current) => current ? {
      ...current,
      lead_form: { ...(current.lead_form || {}), privacy_policy_url: value },
    } : current);
  }

  async function saveAiDraft() {
    if (!aiDraft || !aiDraftForm) return null;
    setAiBusyAction("save");
    setAiError("");
    try {
      const saved = await updateAiAdDraft(aiDraft.id, {
        ...aiDraftForm,
        radius_km: Number(aiDraftForm.radius_km),
        age_min: Number(aiDraftForm.age_min),
        age_max: Number(aiDraftForm.age_max),
        daily_budget_inr: Number(aiDraftForm.daily_budget_inr),
        duration_days: Number(aiDraftForm.duration_days),
      });
      setAiDraft(saved);
      setAiDraftForm(saved.draft || null);
      setAiDrafts((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      return saved;
    } catch (saveError) {
      setAiError(errorMessage(saveError, "Could not save this draft."));
      return null;
    } finally {
      setAiBusyAction("");
    }
  }

  async function uploadDraftImage() {
    if (!aiDraft) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setAiBusyAction("image");
    setAiError("");
    try {
      const image = await uploadAiAdImage(aiDraft.id, {
        uri: asset.uri,
        name: asset.name || "ad-image.jpg",
        mimeType: asset.mimeType,
      });
      setAiDraft((current) => current ? { ...current, image } : current);
    } catch (uploadError) {
      setAiError(errorMessage(uploadError, "Could not upload the ad image."));
    } finally {
      setAiBusyAction("");
    }
  }

  async function createDraftOnMeta() {
    if (!aiDraft || !aiDraftForm) return;
    const saved = await saveAiDraft();
    if (!saved || saved.errors?.length) {
      setAiError(saved?.errors?.length ? `Fix ${saved.errors.length} problem(s) before creating on Meta.` : "Could not save this draft.");
      return;
    }
    setAiBusyAction("create");
    setAiError("");
    try {
      const created = await createAiAdOnMeta(aiDraft.id);
      setAiDraft(created);
      setAiDraftForm(created.draft || aiDraftForm);
      setAiDrafts((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    } catch (createError) {
      setAiError(errorMessage(createError, "Could not create this campaign on Meta."));
      try {
        const latest = await fetchAiAdDraft(aiDraft.id);
        setAiDraft(latest);
        setAiDraftForm(latest.draft || null);
      } catch { /* keep the form as-is */ }
    } finally {
      setAiBusyAction("");
    }
  }

  async function activateDraft() {
    if (!aiDraft || !aiDraftForm) return;
    setAiBusyAction("activate");
    setAiError("");
    try {
      const activated = await activateAiAdDraft(aiDraft.id, activateConfirm.trim());
      setAiDraft(activated);
      setAiDraftForm(activated.draft || aiDraftForm);
      setAiDrafts((current) => [activated, ...current.filter((item) => item.id !== activated.id)]);
    } catch (activateError) {
      setAiError(errorMessage(activateError, "Could not activate this campaign."));
    } finally {
      setAiBusyAction("");
    }
  }

  function confirmDelete(campaign: Campaign) {
    Alert.alert("Delete this campaign?", campaign.name, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteCampaign(campaign.id); load(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  const activeCount = campaigns.filter((c) => c.status === "active").length;
  const inactiveCount = campaigns.length - activeCount;
  const visible = campaigns.filter((c) => (tab === "active" ? c.status === "active" : c.status !== "active"));
  const focusCampaigns = campaigns.filter((c) => c.verdict === "high_quality" || c.verdict === "high_volume_low_quality");
  const hasMore = campaigns.length < total;
  const metaCampaigns = campaigns.filter((c) => c.source === "meta_ads");
  const metaSpend = metaCampaigns.reduce((sum, c) => sum + Number(c.actual_spend || 0), 0);
  const metaLeads = metaCampaigns.reduce((sum, c) => sum + Number(c.total_leads || 0), 0);
  const metaWon = metaCampaigns.reduce((sum, c) => sum + Number(c.won_leads || 0), 0);
  const metaCpl = metaLeads > 0 ? Math.round(metaSpend / metaLeads) : 0;

  const tiles = [
    { label: "Leads", value: num(metrics.total_leads), icon: "people-outline" as const, tint: "#2563eb", bg: "#dbeafe" },
    { label: "Won", value: num(metrics.won), icon: "trophy-outline" as const, tint: "#16a34a", bg: "#dcfce7" },
    { label: "Conversion", value: `${metrics.conversion_rate}%`, icon: "trending-up-outline" as const, tint: UI.teal, bg: "#ede9fe" },
    { label: "Active", value: num(metrics.active_campaigns), icon: "megaphone-outline" as const, tint: "#d97706", bg: "#fef3c7" },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Ads Manager</Text>
        <Pressable onPress={handleSync} disabled={syncing} hitSlop={10} style={[styles.headerButton, syncing && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Sync">
          <Ionicons name="sync" size={18} color={UI.teal} />
        </Pressable>
      </View>

      {loading && !campaigns.length ? (
        <View style={styles.state}><ActivityIndicator size="large" color={UI.teal} /></View>
      ) : error && !campaigns.length ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={32} color={UI.muted} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" buttonColor={UI.teal} onPress={() => load()} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 170 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} tintColor={UI.teal} colors={[UI.teal]} />}
        >
          <View style={styles.segmented}>
            {MANAGER_TABS.map((item) => {
              const active = managerTab === item.value;
              return (
                <Pressable key={item.value} onPress={() => setManagerTab(item.value)} style={[styles.segOption, active && styles.segOptionActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                  <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {managerTab === "campaigns" || managerTab === "meta" ? (
            <View style={styles.segmented}>
              {PERIOD_TABS.map((item) => {
                const active = period === item.value;
                return (
                  <Pressable key={item.value} onPress={() => choosePeriod(item.value)} style={[styles.segOption, active && styles.segOptionActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                    <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {managerTab === "meta" ? (
            <>
              <View style={styles.connectionCard}>
                <View style={styles.connectionTop}>
                  <View style={[styles.connectionIcon, { backgroundColor: "#dbeafe" }]}><Ionicons name="logo-facebook" size={24} color="#1877f2" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectionTitle}>Meta Ads</Text>
                    <Text style={styles.connectionSub}>{settings?.meta_configured ? `Connected to ${settings.meta_page_name || "Facebook Page"}` : "Connect Facebook in Integrations to sync leads and ad insights."}</Text>
                  </View>
                  <View style={[styles.connectionPill, settings?.meta_configured ? styles.pillConnected : styles.pillMuted]}>
                    <Text style={[styles.connectionPillText, { color: settings?.meta_configured ? "#15803d" : "#64748b" }]}>{settings?.meta_configured ? "Connected" : "Not connected"}</Text>
                  </View>
                </View>
                <View style={styles.metaActionRow}>
                  <Pressable style={styles.aiAction} onPress={() => router.push("/(app)/more/campaigns/ai")}>
                    <Ionicons name="add" size={22} color="#ffffff" />
                    <Text style={styles.aiActionText}>Create ad</Text>
                  </Pressable>
                  <Pressable style={styles.metaOutlineAction} onPress={handleSync} disabled={syncing}>
                    {syncing ? <ActivityIndicator size="small" color={ACTION_BLUE} /> : <Ionicons name="sync-outline" size={16} color={ACTION_BLUE} />}
                    <Text style={styles.outlineActionText}>Sync now</Text>
                  </Pressable>
                  <Pressable style={styles.metaOutlineAction} onPress={() => router.push("/(app)/more/integrations")}>
                    <Ionicons name="link-outline" size={16} color={ACTION_BLUE} />
                    <Text style={styles.outlineActionText}>{settings?.meta_configured ? "Reconnect" : "Connect"}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.metaTilesGrid}>
                <View style={styles.metaTile}><Text style={styles.metaTileLabel}>Spend</Text><Text style={styles.metaTileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(metaSpend)}</Text></View>
                <View style={styles.metaTile}><Text style={styles.metaTileLabel}>Reported</Text><Text style={styles.metaTileValue}>{num(metaLeads)}</Text></View>
                <View style={styles.metaTile}><Text style={styles.metaTileLabel}>Won</Text><Text style={styles.metaTileValue}>{num(metaWon)}</Text></View>
                <View style={styles.metaTile}><Text style={styles.metaTileLabel}>CPL</Text><Text style={styles.metaTileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{metaCpl ? money(metaCpl) : "-"}</Text></View>
              </View>

              <Text style={styles.sectionTitle}>Campaigns</Text>
              {metaCampaigns.length ? metaCampaigns.map((c) => (
                <Pressable key={c.id} style={styles.simpleCard} onPress={() => router.push(`/(app)/more/campaigns/${c.id}`)}>
                  <Text style={[styles.simpleTitle, { flex: 1 }]} numberOfLines={1}>{c.name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={UI.sub} />
                </Pressable>
              )) : (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}><Ionicons name="logo-facebook" size={32} color={UI.teal} /></View>
                  <Text style={styles.emptyTitle}>No Meta campaigns synced</Text>
                  <Text style={styles.emptyText}>Use Sync now after connecting Meta Ads to bring campaign performance into CurveLead.</Text>
                </View>
              )}
            </>
          ) : managerTab === "google" ? (
            <View style={styles.connectionCard}>
              <View style={styles.googleIcon}><Ionicons name="trending-up-outline" size={26} color="#1d5fa8" /></View>
              <Text style={styles.googleTitle}>Connect Google Ads</Text>
              <Text style={styles.connectionSub}>See cost, clicks and conversions for Google Ads campaigns once reporting is available. Lead form connections are checked from the backend.</Text>
              <View style={[styles.connectionPill, googleActive > 0 ? styles.pillConnected : styles.pillMuted, { alignSelf: "flex-start" }]}>
                <Text style={[styles.connectionPillText, { color: googleActive > 0 ? "#0f6b57" : "#64748b" }]}>{googleActive > 0 ? `${googleActive} active` : "Coming soon"}</Text>
              </View>
              <Pressable style={styles.aiAction} onPress={() => router.push("/(app)/more/integrations")}>
                <Ionicons name="settings-outline" size={18} color="#ffffff" />
                <Text style={styles.aiActionText}>Open integrations</Text>
              </Pressable>
            </View>
          ) : managerTab === "forms" ? (
            <>
              <View style={styles.connectionCard}>
                <View style={styles.connectionTop}>
                  <View style={[styles.connectionIcon, { backgroundColor: "#ede9fe" }]}><Ionicons name="clipboard-outline" size={24} color={UI.teal} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectionTitle}>Lead Forms</Text>
                    <Text style={styles.connectionSub}>New Meta and Google form leads arrive in CurveLead through the connected integrations.</Text>
                  </View>
                </View>
              </View>
              <View style={styles.formSetting}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.simpleTitle}>Score new Meta leads instantly</Text>
                  <Text style={styles.simpleMeta}>Every new lead gets a hot, warm or cold score as soon as it arrives.</Text>
                </View>
                <View style={styles.checkCircle}><Ionicons name="checkmark" size={18} color="#ffffff" /></View>
              </View>
              <View style={styles.formSetting}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.simpleTitle}>Lead quality feedback to Meta</Text>
                  <Text style={styles.simpleMeta}>{settings?.meta_configured ? "Enabled when Meta Conversions API dataset and token are configured on web." : "Connect Meta first, then add dataset ID and token from the web dashboard."}</Text>
                </View>
                <Pressable onPress={() => router.push("/(app)/more/integrations")} hitSlop={8} style={styles.setupButton}>
                  <Text style={styles.linkText}>Setup</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
          <View style={styles.statsCard}>
            {tiles.map((tile, index) => (
              <View key={tile.label} style={[styles.statCell, index > 0 && styles.statDivider]}>
                <Text style={[styles.statNumber, tile.label === "Won" && { color: "#0f6b57" }]}>{tile.value}</Text>
                <Text style={styles.statCaption} numberOfLines={1}>{tile.label}</Text>
              </View>
            ))}
          </View>

          {syncing ? <Text style={styles.syncingText}>Syncing ad insights…</Text> : null}

          {focusCampaigns.length ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.focusTitle}>Where to focus</Text>
              {focusCampaigns.map((c) => {
                const isGood = c.verdict === "high_quality";
                return (
                  <Pressable key={c.id} style={styles.focusRow} onPress={() => router.push(`/(app)/more/campaigns/${c.id}`)}>
                    <View style={styles.focusTop}>
                      <Text style={styles.focusName} numberOfLines={1}>{c.name}</Text>
                      <View style={[styles.focusBadge, { backgroundColor: isGood ? "#d9efe8" : "#fbe8c8" }]}>
                        <Text style={[styles.focusBadgeText, { color: isGood ? "#0f6b57" : "#8a5a12" }]}>{isGood ? "Scale up" : "Review"}</Text>
                      </View>
                    </View>
                    <Text style={styles.focusReason}>{c.verdict_reason}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {campaigns.length ? (
            <View style={styles.segment}>
              <Pressable style={[styles.segmentButton, tab === "active" && styles.segmentActive]} onPress={() => setTab("active")}>
                <Text style={[styles.segmentText, tab === "active" && styles.segmentTextActive]}>Active ({activeCount})</Text>
              </Pressable>
              <Pressable style={[styles.segmentButton, tab === "inactive" && styles.segmentActive]} onPress={() => setTab("inactive")}>
                <Text style={[styles.segmentText, tab === "inactive" && styles.segmentTextActive]}>Inactive ({inactiveCount})</Text>
              </Pressable>
            </View>
          ) : null}

          {!campaigns.length ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="megaphone-outline" size={32} color={UI.teal} /></View>
              <Text style={styles.emptyTitle}>No campaigns yet</Text>
              <Text style={styles.emptyText}>Tap + to create your first campaign and track what each rupee brings in.</Text>
            </View>
          ) : !visible.length ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="megaphone-outline" size={32} color={UI.teal} /></View>
              <Text style={styles.emptyTitle}>No {tab} campaigns</Text>
            </View>
          ) : visible.map((c) => {
            const status = STATUS_STYLE[c.status] || STATUS_STYLE.draft;
            const source = SOURCE_ICON[c.source] || SOURCE_ICON.other;
            const verdict = c.verdict ? VERDICT_STYLE[c.verdict] : null;
            const spend = Number(c.actual_spend) || 0;
            const budget = Number(c.budget) || 0;
            const usedPct = budget > 0 ? Math.min(100, Math.round((spend / budget) * 100)) : null;
            const ctr = Number(c.impressions) > 0 ? ((Number(c.clicks || 0) / Number(c.impressions)) * 100).toFixed(1) : null;
            const start = shortDate(c.start_date);
            const end = shortDate(c.end_date);
            return (
              <Pressable key={c.id} style={styles.card} onPress={() => router.push(`/(app)/more/campaigns/${c.id}`)}>
                <View style={styles.cardTop}>
                  <View style={[styles.sourceIcon, { backgroundColor: source.bg }]}><Ionicons name={source.icon} size={20} color={source.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={2}>{c.name}</Text>
                    <View style={styles.tagsRow}>
                      <Text style={styles.cardSource}>{pretty(c.source)}</Text>
                      {c.meta_campaign_id ? <View style={styles.metaTag}><Text style={styles.metaTagText}>Meta synced</Text></View> : null}
                      {c.is_priority ? <View style={styles.priorityTag}><Ionicons name="star" size={9} color={UI.teal} /><Text style={styles.priorityTagText}>Priority</Text></View> : null}
                    </View>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>

                {c.verdict_label && verdict ? (
                  <View style={[styles.verdictBanner, { backgroundColor: verdict.bg }]}>
                    <Text style={[styles.verdictText, { color: verdict.text }]}>{c.verdict_label}</Text>
                  </View>
                ) : null}

                {budget > 0 ? (
                  <View>
                    <View style={styles.budgetRow}>
                      <Text style={styles.budgetText}><Text style={styles.budgetSpent}>{money(spend)}</Text> of {money(budget)}</Text>
                      {usedPct != null ? <Text style={styles.budgetPct}>{usedPct}%</Text> : null}
                    </View>
                    <View style={styles.track}><View style={[styles.fill, { width: `${usedPct || 0}%`, backgroundColor: (usedPct || 0) > 90 ? "#ef4444" : UI.teal }]} /></View>
                  </View>
                ) : (
                  <Text style={styles.budgetText}>Spent <Text style={styles.budgetSpent}>{money(spend)}</Text></Text>
                )}

                <View style={styles.statsRow}>
                  <View style={styles.statBox}><Text style={styles.statValue}>{num(c.total_leads)}</Text><Text style={styles.statLabel}>Leads</Text></View>
                  <View style={styles.statBox}><Text style={[styles.statValue, { color: UI.teal }]}>₹{Math.round(c.cpl || 0)}</Text><Text style={styles.statLabel}>Cost / lead</Text></View>
                  <View style={styles.statBox}><Text style={styles.statValue}>{num(c.won_leads)}</Text><Text style={styles.statLabel}>Won</Text></View>
                  {ctr != null ? <View style={styles.statBox}><Text style={styles.statValue}>{ctr}%</Text><Text style={styles.statLabel}>CTR</Text></View> : null}
                </View>

                <View style={styles.cardBottom}>
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar-outline" size={13} color={UI.muted} />
                    <Text style={styles.dateText}>{start || end ? `${start || "—"} → ${end || "ongoing"}` : "No dates set"}</Text>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable style={styles.iconAction} hitSlop={6} onPress={() => router.push({ pathname: "/(app)/more/campaigns/new", params: { id: c.id } })}>
                      <Ionicons name="pencil-outline" size={17} color={UI.sub} />
                    </Pressable>
                    <Pressable style={[styles.iconAction, { backgroundColor: colors.dangerSoft }]} hitSlop={6} onPress={() => confirmDelete(c)}>
                      <Ionicons name="trash-outline" size={17} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {hasMore ? (
            <Pressable style={styles.loadMore} onPress={() => load({ nextPage: page + 1 })} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator size="small" color={UI.teal} /> : <Text style={styles.loadMoreText}>Load more campaigns</Text>}
            </Pressable>
          ) : null}
            </>
          )}
        </ScrollView>
      )}

      {managerTab === "campaigns" && (!loading || campaigns.length) ? (
        <Pressable accessibilityLabel="New campaign" style={[styles.fabWrap, { bottom: 64 + Math.max(insets.bottom, 8) + 16 }]} onPress={() => router.push("/(app)/more/campaigns/new")}>
          <View style={[styles.fab, { backgroundColor: UI.teal }]}>
            <Ionicons name="add" size={30} color="#fff" />
          </View>
        </Pressable>
      ) : null}

      <Modal visible={aiOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => !aiDrafting && setAiOpen(false)}>
        <KeyboardAvoidingView style={[styles.aiScreen, { paddingBottom: keyboardHeight }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.aiHeader, { paddingTop: insets.top + 10 }]}>
            <View style={styles.aiHeaderTitle}>
              <Ionicons name="sparkles-outline" size={19} color={UI.teal} />
              <Text style={styles.aiTitle}>Create a campaign with AI</Text>
            </View>
            <Pressable onPress={() => !aiDrafting && setAiOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={[styles.aiContent, { paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
            {aiError ? (
              <View style={styles.aiError}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.aiErrorText}>{aiError}</Text>
              </View>
            ) : null}

            {aiDraft && aiDraftForm ? (
              <>
                <View style={styles.reviewTop}>
                  <Pressable onPress={() => { setAiDraft(null); setAiDraftForm(null); }} style={styles.backToBrief}>
                    <Ionicons name="arrow-back" size={16} color={UI.teal} />
                    <Text style={styles.outlineActionText}>Brief</Text>
                  </Pressable>
                  <Text style={styles.reviewStatus}>{aiDraft.status}</Text>
                </View>
                {aiDraft.ai_reasoning ? <Text style={styles.aiHint}>{aiDraft.ai_reasoning}</Text> : null}
                {aiDraft.warnings?.map((warning, index) => (
                  <View key={`${warning.field || "warning"}-${index}`} style={styles.warningBox}>
                    <Ionicons name="warning-outline" size={15} color="#b45309" />
                    <Text style={styles.warningText}>{warning.message}</Text>
                  </View>
                ))}
                {aiDraft.errors?.map((item, index) => (
                  <View key={`${item.field}-${index}`} style={styles.aiError}>
                    <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                    <Text style={styles.aiErrorText}>{item.field}: {item.message}</Text>
                  </View>
                ))}
                {aiDraft.error ? (
                  <View style={styles.aiError}>
                    <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                    <Text style={styles.aiErrorText}>{aiDraft.error}</Text>
                  </View>
                ) : null}

                <Text style={styles.aiLabel}>Campaign name</Text>
                <View style={styles.aiInputBox}>
                  <RNTextInput value={aiDraftForm.campaign_name} onChangeText={(value) => updateDraftField("campaign_name", value)} editable={aiDraft.status === "draft" || aiDraft.status === "failed"} style={styles.aiInput} />
                </View>

                <Text style={styles.aiLabel}>Primary text - pick one, edit freely</Text>
                {(aiDraftForm.primary_texts || []).map((text, index) => (
                  <View key={`primary-${index}`} style={[styles.copyChoice, aiDraftForm.primary_text_index === index && styles.copyChoiceActive]}>
                    <Pressable onPress={() => updateDraftField("primary_text_index", index)} disabled={aiDraft.status !== "draft" && aiDraft.status !== "failed"} style={styles.radioWrap}>
                      <Ionicons name={aiDraftForm.primary_text_index === index ? "radio-button-on" : "radio-button-off"} size={19} color={UI.teal} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={[styles.aiInputBox, styles.reviewTextareaBox]}>
                        <RNTextInput
                          value={text}
                          onChangeText={(value) => updateDraftArray("primary_texts", index, value)}
                          editable={aiDraft.status === "draft" || aiDraft.status === "failed"}
                          multiline
                          textAlignVertical="top"
                          style={[styles.aiInput, styles.reviewTextarea]}
                        />
                      </View>
                      <Text style={[styles.aiHint, text.length > 125 && { color: "#b45309" }]}>{text.length} characters{text.length > 125 ? " - may show See more" : ""}</Text>
                    </View>
                  </View>
                ))}

                <Text style={styles.aiLabel}>Headline (max 40)</Text>
                {(aiDraftForm.headlines || []).map((headline, index) => (
                  <View key={`headline-${index}`} style={styles.headlineRow}>
                    <Pressable onPress={() => updateDraftField("headline_index", index)} disabled={aiDraft.status !== "draft" && aiDraft.status !== "failed"} style={styles.radioWrap}>
                      <Ionicons name={aiDraftForm.headline_index === index ? "radio-button-on" : "radio-button-off"} size={19} color={UI.teal} />
                    </Pressable>
                    <View style={[styles.aiInputBox, { flex: 1 }]}>
                      <RNTextInput value={headline} onChangeText={(value) => updateDraftArray("headlines", index, value)} editable={aiDraft.status === "draft" || aiDraft.status === "failed"} style={styles.aiInput} />
                    </View>
                  </View>
                ))}

                <Text style={styles.aiLabel}>Button</Text>
                <View style={styles.languageRow}>
                  {(CTA_OPTIONS[aiDraftForm.destination] || CTA_OPTIONS.LEAD_FORM).slice(0, 4).map((cta) => {
                    const active = aiDraftForm.cta === cta;
                    return (
                      <Pressable key={cta} onPress={() => updateDraftField("cta", cta)} disabled={aiDraft.status !== "draft" && aiDraft.status !== "failed"} style={[styles.languageChip, active && styles.languageChipActive]}>
                        <Text style={[styles.languageText, active && styles.languageTextActive]}>{ctaLabel(cta)}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.aiGrid}>
                  <View style={styles.aiHalf}>
                    <Text style={styles.aiLabel}>City</Text>
                    <View style={styles.aiInputBox}><RNTextInput value={aiDraftForm.location} onChangeText={(value) => updateDraftField("location", value)} editable={aiDraft.status === "draft" || aiDraft.status === "failed"} style={styles.aiInput} /></View>
                  </View>
                  <View style={styles.aiHalf}>
                    <Text style={styles.aiLabel}>Radius (km)</Text>
                    <View style={styles.aiInputBox}><RNTextInput value={String(aiDraftForm.radius_km)} onChangeText={(value) => updateDraftField("radius_km", value)} editable={aiDraft.status === "draft" || aiDraft.status === "failed"} keyboardType="number-pad" style={styles.aiInput} /></View>
                  </View>
                </View>

                <View style={styles.aiGrid}>
                  <View style={styles.aiHalf}>
                    <Text style={styles.aiLabel}>Age from</Text>
                    <View style={styles.aiInputBox}><RNTextInput value={String(aiDraftForm.age_min)} onChangeText={(value) => updateDraftField("age_min", value)} editable={(aiDraft.status === "draft" || aiDraft.status === "failed") && !(aiDraftForm.special_ad_categories?.length)} keyboardType="number-pad" style={styles.aiInput} /></View>
                  </View>
                  <View style={styles.aiHalf}>
                    <Text style={styles.aiLabel}>Age to</Text>
                    <View style={styles.aiInputBox}><RNTextInput value={String(aiDraftForm.age_max)} onChangeText={(value) => updateDraftField("age_max", value)} editable={(aiDraft.status === "draft" || aiDraft.status === "failed") && !(aiDraftForm.special_ad_categories?.length)} keyboardType="number-pad" style={styles.aiInput} /></View>
                  </View>
                </View>

                <View style={styles.aiGrid}>
                  <View style={styles.aiHalf}>
                    <Text style={styles.aiLabel}>Budget / day (₹)</Text>
                    <View style={styles.aiInputBox}><RNTextInput value={String(aiDraftForm.daily_budget_inr)} onChangeText={(value) => updateDraftField("daily_budget_inr", value)} editable={aiDraft.status === "draft" || aiDraft.status === "failed"} keyboardType="number-pad" style={styles.aiInput} /></View>
                  </View>
                  <View style={styles.aiHalf}>
                    <Text style={styles.aiLabel}>Days</Text>
                    <View style={styles.aiInputBox}><RNTextInput value={String(aiDraftForm.duration_days)} onChangeText={(value) => updateDraftField("duration_days", value)} editable={aiDraft.status === "draft" || aiDraft.status === "failed"} keyboardType="number-pad" style={styles.aiInput} /></View>
                  </View>
                </View>

                {aiDraftForm.destination === "LEAD_FORM" && !aiDraftForm.lead_form?.existing_form_id ? (
                  <>
                    <Text style={styles.aiLabel}>Privacy-policy link</Text>
                    <View style={styles.aiInputBox}>
                      <RNTextInput value={aiDraftForm.lead_form?.privacy_policy_url || ""} onChangeText={updateLeadFormPrivacy} editable={aiDraft.status === "draft" || aiDraft.status === "failed"} placeholder="https://yourbusiness.in/privacy" placeholderTextColor={UI.muted} autoCapitalize="none" keyboardType="url" style={styles.aiInput} />
                    </View>
                    <Text style={styles.aiHint}>Meta requires it on every new lead form.</Text>
                  </>
                ) : null}

                <View style={styles.imageBox}>
                  <View style={styles.imageIcon}><Ionicons name={aiDraft.image ? "image-outline" : "cloud-upload-outline"} size={22} color={UI.muted} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.simpleTitle}>{aiDraft.image?.name || "Ad image"}</Text>
                    <Text style={styles.simpleMeta}>{aiDraft.image ? "Image uploaded" : "Upload JPG or PNG before creating on Meta."}</Text>
                  </View>
                  <Pressable onPress={uploadDraftImage} disabled={!!aiBusyAction || (aiDraft.status !== "draft" && aiDraft.status !== "failed")} style={styles.outlineAction}>
                    {aiBusyAction === "image" ? <ActivityIndicator size="small" color={UI.teal} /> : <Text style={styles.outlineActionText}>{aiDraft.image ? "Replace" : "Upload"}</Text>}
                  </Pressable>
                </View>

                {(aiDraft.status === "draft" || aiDraft.status === "failed") ? (
                  <View style={styles.reviewActions}>
                    <Pressable onPress={saveAiDraft} disabled={!!aiBusyAction} style={styles.secondaryAction}>
                      <Text style={styles.secondaryActionText}>{aiBusyAction === "save" ? "Saving..." : "Save draft"}</Text>
                    </Pressable>
                    <Pressable onPress={createDraftOnMeta} disabled={!!aiBusyAction || !aiDraft.image} style={[styles.primaryAction, (!aiDraft.image || !!aiBusyAction) && { opacity: 0.55 }]}>
                      <Text style={styles.primaryActionText}>{aiBusyAction === "create" ? "Creating..." : "Create on Meta (paused)"}</Text>
                    </Pressable>
                  </View>
                ) : null}

                {aiDraft.status === "created" ? (
                  <View style={styles.activateBox}>
                    <Text style={styles.activateTitle}>On Meta and paused - nothing is spending yet.</Text>
                    <Text style={styles.simpleMeta}>To start spending {money(Number(aiDraftForm.daily_budget_inr))} a day, type the campaign name.</Text>
                    <View style={styles.aiInputBox}><RNTextInput value={activateConfirm} onChangeText={setActivateConfirm} placeholder={aiDraftForm.campaign_name} placeholderTextColor={UI.muted} style={styles.aiInput} /></View>
                    <Pressable onPress={activateDraft} disabled={aiBusyAction === "activate" || activateConfirm.trim() !== aiDraftForm.campaign_name.trim()} style={[styles.activateButton, (aiBusyAction === "activate" || activateConfirm.trim() !== aiDraftForm.campaign_name.trim()) && { opacity: 0.55 }]}>
                      <Text style={styles.primaryActionText}>{aiBusyAction === "activate" ? "Starting..." : "Activate campaign"}</Text>
                    </Pressable>
                  </View>
                ) : null}

                {aiDraft.status === "activated" ? (
                  <View style={styles.successBox}>
                    <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                    <Text style={styles.successText}>Live on Meta. It appears in the campaign list after the next sync.</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
            <Text style={styles.aiLabel}>What are you advertising?</Text>
            <View style={[styles.aiInputBox, styles.aiTextareaBox]}>
              <RNTextInput
                value={aiBrief.offer}
                onChangeText={(value) => updateAiBrief("offer", value)}
                multiline
                textAlignVertical="top"
                placeholder="Diwali hair spa at 999 for women in Baramati, this month only"
                placeholderTextColor={UI.muted}
                style={[styles.aiInput, styles.aiTextarea]}
              />
            </View>
            <Text style={styles.aiHint}>The offer, price and who it's for.</Text>

            <Text style={styles.aiLabel}>Goal (optional)</Text>
            <View style={styles.aiInputBox}>
              <RNTextInput value={aiBrief.goal} onChangeText={(value) => updateAiBrief("goal", value)} placeholder="e.g. 50 bookings before Diwali" placeholderTextColor={UI.muted} style={styles.aiInput} />
            </View>

            <View style={styles.aiGrid}>
              <View style={styles.aiHalf}>
                <Text style={styles.aiLabel}>City</Text>
                <View style={styles.aiInputBox}>
                  <RNTextInput value={aiBrief.location} onChangeText={(value) => updateAiBrief("location", value)} placeholder="Baramati" placeholderTextColor={UI.muted} style={styles.aiInput} />
                </View>
              </View>
              <View style={styles.aiHalf}>
                <Text style={styles.aiLabel}>Ad language</Text>
                <View style={styles.languageRow}>
                  {LANGUAGES.map((item) => {
                    const active = aiBrief.language === item.value;
                    return (
                      <Pressable key={item.value} onPress={() => updateAiBrief("language", item.value)} style={[styles.languageChip, active && styles.languageChipActive]}>
                        <Text style={[styles.languageText, active && styles.languageTextActive]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.aiGrid}>
              <View style={styles.aiHalf}>
                <Text style={styles.aiLabel}>Budget per day (₹)</Text>
                <View style={styles.aiInputBox}>
                  <RNTextInput value={String(aiBrief.budget_per_day_inr)} onChangeText={(value) => updateAiBrief("budget_per_day_inr", Number(value.replace(/[^\d]/g, "")) || 0)} keyboardType="number-pad" placeholder="500" placeholderTextColor={UI.muted} style={styles.aiInput} />
                </View>
              </View>
              <View style={styles.aiHalf}>
                <Text style={styles.aiLabel}>Run for (days)</Text>
                <View style={styles.aiInputBox}>
                  <RNTextInput value={String(aiBrief.duration_days)} onChangeText={(value) => updateAiBrief("duration_days", Number(value.replace(/[^\d]/g, "")) || 0)} keyboardType="number-pad" placeholder="14" placeholderTextColor={UI.muted} style={styles.aiInput} />
                </View>
              </View>
            </View>

            <Text style={styles.aiLabel}>When someone taps the ad</Text>
            <View style={styles.destinationRow}>
              {([
                ["LEAD_FORM", "Instant lead form", "Leads land in CurveLead automatically"],
                ["WHATSAPP", "WhatsApp chat", "Opens a chat with your business"],
              ] as [AiAdDestination, string, string][]).map(([value, title, subtitle]) => {
                const active = aiBrief.destination === value;
                return (
                  <Pressable key={value} onPress={() => updateAiBrief("destination", value)} style={[styles.destinationCard, active && styles.destinationCardActive]}>
                    <Text style={[styles.destinationTitle, active && styles.destinationTitleActive]}>{title}</Text>
                    <Text style={styles.destinationSubtitle}>{subtitle}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={handleCreateAiDraft} disabled={aiDrafting} style={[styles.draftButton, aiDrafting && { opacity: 0.65 }]}>
              {aiDrafting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles-outline" size={17} color="#fff" />}
              <Text style={styles.draftButtonText}>{aiDrafting ? "Writing your ads..." : "Draft the campaign"}</Text>
            </Pressable>

            <View style={styles.draftsHeader}>
              <Text style={styles.aiSectionTitle}>Earlier drafts</Text>
              {aiLoadingDrafts ? <ActivityIndicator size="small" color={UI.teal} /> : null}
            </View>
            {aiDrafts.length ? aiDrafts.slice(0, 8).map((draft) => (
              <Pressable key={draft.id} style={styles.draftRow} onPress={() => openAiDraft(draft.id)} disabled={aiBusyAction === "open"}>
                <Text style={styles.draftStatus}>{draft.status}</Text>
                <Text style={styles.draftName} numberOfLines={1}>{draft.campaign_name || draft.brief?.offer || "Untitled draft"}</Text>
                <Text style={styles.draftDate}>{shortDate(draft.created_at)}</Text>
              </Pressable>
            )) : !aiLoadingDrafts ? (
              <Text style={styles.aiEmptyText}>No drafts yet.</Text>
            ) : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.line },
  headerButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  content: { padding: 12, gap: 10 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },
  errorText: { color: UI.sub, textAlign: "center" },
  retry: { marginTop: 6 },

  connectionCard: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: UI.line, padding: 14, gap: 12 },
  connectionTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  connectionIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  connectionTitle: { color: UI.ink, fontSize: 16, fontWeight: "800" },
  connectionSub: { color: "#4a6a61", fontSize: 12, lineHeight: 18, marginTop: 2 },
  connectionPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillConnected: { backgroundColor: "#d9efe8" },
  pillMuted: { backgroundColor: "#eef2f6" },
  connectionPillText: { fontSize: 11, fontWeight: "900" },
  metaActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  aiAction: { width: "100%", minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: ACTION_BLUE, paddingHorizontal: 13 },
  aiActionText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  metaOutlineAction: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 10 },
  outlineAction: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 13 },
  outlineActionText: { color: UI.ink, fontSize: 13, fontWeight: "800" },
  sectionTitle: { color: UI.ink, fontSize: 14, fontWeight: "800", marginTop: 2 },
  simpleCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 14, paddingVertical: 12 },
  simpleTitle: { color: UI.ink, fontSize: 14, fontWeight: "800" },
  simpleMeta: { color: "#4a6a61", fontSize: 12, lineHeight: 17, marginTop: 3 },
  simpleAmount: { color: colors.text, fontSize: 14, fontWeight: "900" },
  centerIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 10 },
  formSetting: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 14, paddingVertical: 12 },
  linkText: { color: ACTION_BLUE, fontSize: 13, fontWeight: "800" },

  aiScreen: { flex: 1, backgroundColor: "#ffffff" },
  aiHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  aiHeaderTitle: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  aiTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  aiContent: { padding: 16, gap: 8 },
  aiError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12 },
  aiErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  aiLabel: { color: UI.sub, fontSize: 12, fontWeight: "800", marginTop: 10 },
  aiInputBox: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 12, justifyContent: "center" },
  aiTextareaBox: { minHeight: 90, paddingVertical: 10 },
  aiInput: { color: colors.text, fontSize: 15, paddingVertical: 0 },
  aiTextarea: { minHeight: 70 },
  aiHint: { color: UI.muted, fontSize: 11 },
  aiGrid: { flexDirection: "row", gap: 10 },
  aiHalf: { flex: 1 },
  languageRow: { flexDirection: "row", gap: 6 },
  languageChip: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  languageChipActive: { backgroundColor: "#ede9fe", borderColor: UI.teal },
  languageText: { color: UI.sub, fontSize: 11, fontWeight: "800" },
  languageTextActive: { color: UI.teal },
  destinationRow: { flexDirection: "row", gap: 10 },
  destinationCard: { flex: 1, minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", padding: 10, justifyContent: "center" },
  destinationCardActive: { backgroundColor: UI.tealSoft, borderColor: UI.teal },
  destinationTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  destinationTitleActive: { color: UI.teal },
  destinationSubtitle: { color: UI.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  draftButton: { marginTop: 8, height: 50, borderRadius: 14, backgroundColor: UI.teal, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  draftButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  draftsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  aiSectionTitle: { color: UI.sub, fontSize: 12, fontWeight: "900" },
  draftRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 10 },
  draftStatus: { overflow: "hidden", borderRadius: 999, backgroundColor: "#eef2f6", color: UI.sub, fontSize: 10, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 3, textTransform: "lowercase" },
  draftName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "800" },
  draftDate: { color: UI.muted, fontSize: 10, fontWeight: "700" },
  aiEmptyText: { color: UI.muted, fontSize: 12, textAlign: "center", paddingVertical: 10 },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backToBrief: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, borderRadius: 12, backgroundColor: "#ffffff", paddingHorizontal: 10 },
  reviewStatus: { overflow: "hidden", borderRadius: 999, backgroundColor: "#eef2f6", color: UI.sub, fontSize: 11, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 4, textTransform: "lowercase" },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fef3c7", borderRadius: 12, padding: 12 },
  warningText: { flex: 1, color: "#b45309", fontSize: 12, fontWeight: "700" },
  copyChoice: { flexDirection: "row", gap: 8, borderRadius: 14, borderWidth: 1, borderColor: UI.line, padding: 8 },
  copyChoiceActive: { borderColor: UI.teal, backgroundColor: UI.tealSoft },
  radioWrap: { paddingTop: 10 },
  reviewTextareaBox: { minHeight: 76, paddingVertical: 8 },
  reviewTextarea: { minHeight: 58 },
  headlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  imageBox: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderColor: UI.line, padding: 12 },
  imageIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#eef2f6", alignItems: "center", justifyContent: "center" },
  reviewActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  secondaryAction: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: UI.line, alignItems: "center", justifyContent: "center" },
  secondaryActionText: { color: UI.sub, fontSize: 13, fontWeight: "900" },
  primaryAction: { flex: 1.4, height: 48, borderRadius: 14, backgroundColor: UI.teal, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  primaryActionText: { color: "#ffffff", fontSize: 13, fontWeight: "900", textAlign: "center" },
  activateBox: { gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: "#fde68a", backgroundColor: "#fffbeb", padding: 14 },
  activateTitle: { color: "#92400e", fontSize: 13, fontWeight: "900" },
  activateButton: { height: 48, borderRadius: 14, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center" },
  successBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, backgroundColor: "#dcfce7", padding: 12 },
  successText: { flex: 1, color: "#15803d", fontSize: 13, fontWeight: "800" },


  segmented: { flexDirection: "row", backgroundColor: "#e4ece9", borderRadius: 12, padding: 3 },
  segOption: { flex: 1, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingHorizontal: 2 },
  segOptionActive: { backgroundColor: "#ffffff" },
  segText: { color: "#4a6a61", fontSize: 12, fontWeight: "600" },
  segTextActive: { color: UI.ink, fontWeight: "800" },
  statsCard: { flexDirection: "row", backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: UI.line, paddingVertical: 10 },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: { borderLeftWidth: 1, borderLeftColor: UI.line },
  statNumber: { color: UI.ink, fontSize: 18, fontWeight: "800" },
  statCaption: { color: "#4a6a61", fontSize: 11, fontWeight: "600", marginTop: 1 },
  tileLabel: { color: UI.sub, fontSize: 11, fontWeight: "700", marginTop: 1 },
  metaTilesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaTile: { width: "48%", flexGrow: 1, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: UI.line, paddingVertical: 10, paddingHorizontal: 12 },
  metaTileLabel: { color: "#4a6a61", fontSize: 11, fontWeight: "700" },
  googleIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#dde9f8", alignItems: "center", justifyContent: "center" },
  googleTitle: { color: UI.ink, fontSize: 17, fontWeight: "800" },
  checkCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#0f7b67", alignItems: "center", justifyContent: "center" },
  setupButton: { backgroundColor: "#e9f0fe", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  metaTileValue: { color: UI.ink, fontSize: 18, fontWeight: "800", marginTop: 2 },
  syncingText: { color: UI.teal, fontSize: 12, fontWeight: "700", textAlign: "center" },

  focusTitle: { color: UI.ink, fontSize: 14, fontWeight: "800", marginTop: 2 },
  focusRow: { backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 12, paddingVertical: 10 },
  focusTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  focusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  focusBadgeText: { fontSize: 10, fontWeight: "800" },
  focusCopy: { flex: 1 },
  focusName: { flex: 1, color: UI.ink, fontSize: 13, fontWeight: "700" },
  focusReason: { color: "#4a6a61", fontSize: 11, lineHeight: 16, marginTop: 4 },

  segment: { flexDirection: "row", backgroundColor: "#eaf1f7", borderRadius: 14, padding: 4 },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", height: 38, borderRadius: 11 },
  segmentActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: UI.sub, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: UI.teal },

  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptyText: { color: UI.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: UI.line, padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  sourceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  tagsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  cardSource: { color: UI.sub, fontSize: 11 },
  metaTag: { backgroundColor: UI.tealSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  metaTagText: { color: UI.teal, fontSize: 9, fontWeight: "800" },
  priorityTag: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#ede9fe", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  priorityTagText: { color: UI.teal, fontSize: 9, fontWeight: "800" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "800" },
  verdictBanner: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  verdictText: { fontSize: 12, fontWeight: "700" },

  budgetRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  budgetText: { color: UI.sub, fontSize: 12 },
  budgetSpent: { color: colors.text, fontWeight: "800" },
  budgetPct: { color: UI.sub, fontSize: 12, fontWeight: "700" },
  track: { height: 7, borderRadius: 4, backgroundColor: "#eef4f9", overflow: "hidden" },
  fill: { height: 7, borderRadius: 4 },

  statsRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: "#ffffff", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "900" },
  statLabel: { color: UI.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },

  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  dateText: { color: UI.muted, fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 8 },
  iconAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#eef4f9", alignItems: "center", justifyContent: "center" },

  loadMore: { alignItems: "center", justifyContent: "center", height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: UI.line, backgroundColor: "#ffffff" },
  loadMoreText: { color: UI.teal, fontSize: 14, fontWeight: "800" },

  fabWrap: { position: "absolute", right: 18 },
  fab: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", shadowColor: UI.teal, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
});
