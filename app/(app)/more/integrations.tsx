import React, { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
import axios from "axios";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import {
  connectFacebook, connectFacebookPage, facebookSyncLeads, FacebookPage, fetchGoogleAdsIntegrations, fetchIntegrationSettings,
  generateApiKey, IntegrationSettings, reconnectWhatsapp, revokeApiKey, syncAdInsights, updateIntegrationSettings,
} from "@/api/integrations";

WebBrowser.maybeCompleteAuthSession();

const FACEBOOK_APP_ID = (Constants.expoConfig?.extra?.facebookAppId as string | undefined) || "";
const FACEBOOK_DISCOVERY = { authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth" };
const FACEBOOK_SCOPES = ["public_profile", "pages_show_list", "pages_manage_metadata", "pages_read_engagement", "leads_retrieval", "business_management"];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

type SoonItem = { key: string; name: string; icon: keyof typeof Ionicons.glyphMap; color: string };

const COMING_SOON: SoonItem[] = [
  { key: "linkedin", name: "LinkedIn Ads", icon: "logo-linkedin", color: "#0A66C2" },
  { key: "google-forms", name: "Google Forms", icon: "document-text-outline", color: "#d99a00" },
  { key: "jotform", name: "JotForm", icon: "reader-outline", color: "#FF6100" },
  { key: "wordpress", name: "WordPress", icon: "logo-wordpress", color: "#21759B" },
  { key: "wix", name: "Wix", icon: "globe-outline", color: "#4A4A4A" },
  { key: "indiamart", name: "IndiaMART", icon: "storefront-outline", color: "#F5A623" },
  { key: "justdial", name: "JustDial", icon: "call-outline", color: "#E4004B" },
  { key: "zapier", name: "Zapier", icon: "flash-outline", color: "#FF4A00" },
  { key: "pabbly", name: "Pabbly Connect", icon: "link-outline", color: "#2F80ED" },
  { key: "tiktok", name: "TikTok Ads", icon: "logo-tiktok", color: "#000000" },
  { key: "clickfunnels", name: "ClickFunnels", icon: "funnel-outline", color: "#EE3D64" },
];

function StatusPill({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <View style={[styles.pill, connected ? styles.pillOn : styles.pillOff]}>
      <View style={[styles.pillDot, { backgroundColor: connected ? "#16a34a" : "#94a3b8" }]} />
      <Text style={[styles.pillText, { color: connected ? "#15803d" : "#64748b" }]}>{label || (connected ? "Connected" : "Not connected")}</Text>
    </View>
  );
}

function IntegrationCard({ icon, tint, bg, title, connected, statusLabel, description, children }: {
  icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; title: string; connected: boolean; statusLabel?: string; description: string; children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: bg }]}><Ionicons name={icon} size={24} color={tint} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <StatusPill connected={connected} label={statusLabel} />
        </View>
      </View>
      <Text style={styles.cardDescription}>{description}</Text>
      {children}
    </View>
  );
}

function ActionButton({ label, icon, onPress, busy, disabled, tone = "primary" }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: "primary" | "danger" | "plain";
}) {
  const tint = tone === "danger" ? colors.danger : tone === "plain" ? colors.textSecondary : colors.primary;
  const bg = tone === "danger" ? colors.dangerSoft : tone === "plain" ? "#eef4f9" : colors.primarySoft;
  return (
    <Pressable onPress={onPress} disabled={busy || disabled} style={[styles.action, { backgroundColor: bg }, (busy || disabled) && { opacity: 0.55 }]}>
      {busy ? <ActivityIndicator size="small" color={tint} /> : <Ionicons name={icon} size={16} color={tint} />}
      <Text style={[styles.actionText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

export default function IntegrationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "curvelead" });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: FACEBOOK_APP_ID, scopes: FACEBOOK_SCOPES, redirectUri, responseType: AuthSession.ResponseType.Token },
    FACEBOOK_DISCOVERY
  );

  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [googleActive, setGoogleActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [facebookPages, setFacebookPages] = useState<FacebookPage[]>([]);
  const [syncingLeads, setSyncingLeads] = useState(false);
  const [syncingInsights, setSyncingInsights] = useState(false);
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const [waSheetOpen, setWaSheetOpen] = useState(false);
  const [waPhoneId, setWaPhoneId] = useState("");
  const [waToken, setWaToken] = useState("");
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      // Same as the web: the settings call plus the Google Ads list (a Google connection is "any active one").
      const [loaded, googleList] = await Promise.all([
        fetchIntegrationSettings(),
        fetchGoogleAdsIntegrations().catch(() => null),
      ]);
      setSettings(loaded);
      setGoogleActive(googleList ? googleList.filter((item) => item.is_active).length : loaded.google_configured ? 1 : 0);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load integrations."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The Page picker and the WhatsApp form are full-page overlays: hide the tab bar and own the back button.
  const overlayOpen = pagePickerOpen || waSheetOpen;
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: overlayOpen ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [overlayOpen, navigation, insets.bottom]);

  useEffect(() => {
    if (!overlayOpen) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (waSaving || connectingFacebook) return true;
      setPagePickerOpen(false);
      setWaSheetOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [overlayOpen, waSaving, connectingFacebook]);

  useEffect(() => {
    if (!response) return;
    if (response.type === "success" && response.params.access_token) {
      handleFacebookToken(response.params.access_token);
    } else if (response.type === "error") {
      setConnectingFacebook(false);
      Alert.alert("Facebook sign-in failed", response.error?.description || "Please try again.");
    } else if (response.type === "cancel" || response.type === "dismiss") {
      setConnectingFacebook(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function handleFacebookToken(userToken: string) {
    try {
      const pages = await connectFacebook(userToken);
      if (!pages.length) {
        Alert.alert("No Pages found", "Your Facebook account isn't an admin on any Page yet. Create or get access to a Facebook Page to connect Lead Ads.");
        setConnectingFacebook(false);
        return;
      }
      if (pages.length === 1) {
        await finishPageConnect(pages[0]);
      } else {
        setFacebookPages(pages);
        setPagePickerOpen(true);
        setConnectingFacebook(false);
      }
    } catch (connectError) {
      Alert.alert("Couldn't connect Facebook", errorMessage(connectError, "Please try again."));
      setConnectingFacebook(false);
    }
  }

  async function finishPageConnect(page: FacebookPage) {
    setConnectingFacebook(true);
    try {
      await connectFacebookPage(page);
      setPagePickerOpen(false);
      await load(true);
    } catch (connectError) {
      Alert.alert("Couldn't connect this Page", errorMessage(connectError, "Please try again."));
    } finally { setConnectingFacebook(false); }
  }

  async function startFacebookConnect() {
    if (!FACEBOOK_APP_ID) { Alert.alert("Not configured", "Facebook App ID is missing from the app config."); return; }
    setConnectingFacebook(true);
    await promptAsync();
  }

  async function syncLeadsNow() {
    setSyncingLeads(true);
    try {
      const result = await facebookSyncLeads();
      Alert.alert("Leads synced", result.message || `${result.created} new, ${result.skipped} already imported.`);
    } catch (syncError) {
      Alert.alert("Sync failed", errorMessage(syncError, "Could not sync leads from Facebook."));
    } finally { setSyncingLeads(false); }
  }

  async function syncInsightsNow() {
    setSyncingInsights(true);
    try {
      const result = await syncAdInsights();
      Alert.alert("Ad insights synced", result.message);
    } catch (syncError) {
      Alert.alert("Sync failed", errorMessage(syncError, "Connect an ad account first."));
    } finally { setSyncingInsights(false); }
  }

  async function handleGenerateKey() {
    setApiKeyBusy(true);
    try { await generateApiKey(); await load(true); }
    catch (genError) { Alert.alert("Couldn't generate a key", errorMessage(genError, "Please try again.")); }
    finally { setApiKeyBusy(false); }
  }

  function handleRevokeKey() {
    Alert.alert("Revoke API key?", "Any integration using this key will stop working immediately.", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: async () => {
        setApiKeyBusy(true);
        try { await revokeApiKey(); await load(true); }
        catch (revokeError) { Alert.alert("Couldn't revoke the key", errorMessage(revokeError, "Please try again.")); }
        finally { setApiKeyBusy(false); }
      } },
    ]);
  }

  async function shareText(message: string) {
    try { await Share.share({ message }); } catch { /* the person closed the share sheet */ }
  }

  function openWhatsappSheet() {
    setWaPhoneId(settings?.whatsapp_phone_number_id || "");
    setWaToken("");
    setWaError("");
    setWaSheetOpen(true);
  }

  async function saveWhatsapp() {
    if (!waPhoneId.trim()) { setWaError("Enter the WhatsApp phone number ID."); return; }
    setWaSaving(true); setWaError("");
    try {
      await updateIntegrationSettings({ whatsapp_phone_number_id: waPhoneId.trim(), ...(waToken.trim() && { whatsapp_access_token: waToken.trim() }) });
      setWaSheetOpen(false);
      await load(true);
    } catch (saveError) {
      setWaError(errorMessage(saveError, "Could not save these settings."));
    } finally { setWaSaving(false); }
  }

  // Re-checks the saved token with Meta. If it has expired, open the form so a new one can be pasted.
  async function handleReconnect() {
    setReconnecting(true);
    try {
      const result = await reconnectWhatsapp();
      await load(true);
      if (result.warning) Alert.alert("Reconnected, with a warning", result.warning);
      else Alert.alert("WhatsApp reconnected", result.display_phone_number ? `Number: ${result.display_phone_number}` : "Your WhatsApp connection is working.");
    } catch (reconnectError) {
      const message = errorMessage(reconnectError, "Could not reconnect WhatsApp.");
      if (axios.isAxiosError(reconnectError) && reconnectError.response?.data?.needs_new_token) {
        await load(true);
        openWhatsappSheet();
        setWaError(`${message} Paste a new access token and save.`);
      } else {
        Alert.alert("Couldn't reconnect", message);
      }
    } finally { setReconnecting(false); }
  }

  const connectedCount = settings
    ? [settings.meta_configured, googleActive > 0, !!settings.api_key, settings.whatsapp_configured].filter(Boolean).length
    : 0;

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Integrations" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="refresh" onPress={() => { setRefreshing(true); load(true); }} disabled={loading || refreshing} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
        </View>
      ) : settings ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{connectedCount} of 4 connected</Text>
              <Text style={styles.heroSub}>Connect your lead sources and WhatsApp so every lead lands in one place.</Text>
              <View style={styles.heroTrack}><View style={[styles.heroFill, { width: `${(connectedCount / 4) * 100}%` }]} /></View>
            </View>
            <View style={styles.heroIcon}><Ionicons name="git-network-outline" size={28} color="#fff" /></View>
          </LinearGradient>

          <Text style={styles.sectionTitle}>Lead sources</Text>

          <IntegrationCard
            icon="logo-facebook" tint="#1877f2" bg="#dbeafe" title="Facebook Lead Ads" connected={settings.meta_configured}
            description={settings.meta_configured ? `Connected to "${settings.meta_page_name}". New leads arrive automatically.` : "Bring in leads from your Facebook Page's Lead Ads forms automatically."}
          >
            <View style={styles.actionRow}>
              <ActionButton label={settings.meta_configured ? "Reconnect" : "Connect Facebook"} icon="logo-facebook" onPress={startFacebookConnect} busy={connectingFacebook} disabled={!request} />
              {settings.meta_configured ? <ActionButton label="Sync leads" icon="sync-outline" onPress={syncLeadsNow} busy={syncingLeads} tone="plain" /> : null}
              {settings.meta_configured ? <ActionButton label="Sync ad insights" icon="stats-chart-outline" onPress={syncInsightsNow} busy={syncingInsights} tone="plain" /> : null}
            </View>
          </IntegrationCard>

          <IntegrationCard
            icon="logo-google" tint="#ea4335" bg="#fee2e2" title="Google Ads Lead Form" connected={googleActive > 0}
            statusLabel={googleActive > 0 ? `${googleActive} active` : undefined}
            description="Set up Google Ads Lead Forms (ad-account mapping and webhook keys) from the web dashboard. Leads show up here once it's active."
          />

          <IntegrationCard
            icon="key-outline" tint="#0f172a" bg="#e2e8f0" title="Custom API / Webhook" connected={!!settings.api_key}
            description="Send leads from any source (website form, Zapier, your own app) using an API key."
          >
            {settings.api_key ? (
              <View>
                <Text style={styles.fieldLabel}>API key</Text>
                <Text selectable style={styles.codeText}>{settings.api_key}</Text>
              </View>
            ) : null}
            <View>
              <Text style={styles.fieldLabel}>Ingest URL</Text>
              <Text selectable style={styles.codeText}>{settings.api_ingest_url}</Text>
            </View>
            <View style={styles.actionRow}>
              <ActionButton label={settings.api_key ? "Regenerate" : "Generate key"} icon="key-outline" onPress={handleGenerateKey} busy={apiKeyBusy} />
              {settings.api_key ? <ActionButton label="Share key" icon="share-outline" onPress={() => shareText(settings.api_key as string)} tone="plain" /> : null}
              {settings.api_key ? <ActionButton label="Revoke" icon="trash-outline" onPress={handleRevokeKey} disabled={apiKeyBusy} tone="danger" /> : null}
            </View>
          </IntegrationCard>

          <Text style={styles.sectionTitle}>Messaging</Text>

          <IntegrationCard
            icon="logo-whatsapp" tint="#16a34a" bg="#dcfce7" title="WhatsApp Business API" connected={settings.whatsapp_configured}
            description={settings.whatsapp_configured ? `Phone number ID: ${settings.whatsapp_phone_number_id}` : "Send and receive WhatsApp messages with your Business API credentials."}
          >
            <View style={styles.actionRow}>
              <ActionButton label={settings.whatsapp_configured ? "Update" : "Configure"} icon="settings-outline" onPress={openWhatsappSheet} />
              {settings.whatsapp_phone_number_id ? <ActionButton label="Reconnect" icon="refresh-outline" onPress={handleReconnect} busy={reconnecting} tone="plain" /> : null}
            </View>
          </IntegrationCard>

          <Text style={styles.sectionTitle}>Coming soon</Text>
          <View style={styles.soonGrid}>
            {COMING_SOON.map((item) => (
              <View key={item.key} style={styles.soonTile}>
                <View style={[styles.soonIcon, { backgroundColor: `${item.color}1A` }]}><Ionicons name={item.icon} size={20} color={item.color} /></View>
                <Text style={styles.soonName} numberOfLines={1}>{item.name}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.contactBanner}>Looking for another provider? Contact us.</Text>
        </ScrollView>
      ) : null}

      {pagePickerOpen ? (
        <View style={styles.overlay}>
          <View style={[styles.overlayHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => !connectingFacebook && setPagePickerOpen(false)} hitSlop={10} style={styles.overlayBack}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.overlayTitle}>Choose a Facebook Page</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}>
            <Text style={styles.overlayHint}>Leads from the Page you pick will be imported automatically.</Text>
            {facebookPages.map((page) => (
              <Pressable key={page.id} style={styles.pageRow} onPress={() => finishPageConnect(page)} disabled={connectingFacebook}>
                <View style={[styles.cardIcon, { backgroundColor: "#dbeafe" }]}><Ionicons name="logo-facebook" size={22} color="#1877f2" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pageName} numberOfLines={1}>{page.name}</Text>
                  {page.fan_count != null ? <Text style={styles.pageMeta}>{Number(page.fan_count).toLocaleString("en-IN")} followers</Text> : null}
                </View>
                {connectingFacebook ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {waSheetOpen ? (
        <View style={styles.overlay}>
          <View style={[styles.overlayHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => !waSaving && setWaSheetOpen(false)} hitSlop={10} style={styles.overlayBack}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.overlayTitle}>WhatsApp Business API</Text>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 6 }} keyboardShouldPersistTaps="handled">
            {waError ? (
              <View style={styles.formError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.formErrorText}>{waError}</Text></View>
            ) : null}
            <Text style={styles.formLabel}>Phone number ID</Text>
            <View style={styles.inputBox}>
              <RNTextInput style={styles.inputText} value={waPhoneId} onChangeText={setWaPhoneId} placeholder="e.g. 109876543210" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="number-pad" />
            </View>
            <Text style={styles.formLabel}>Access token</Text>
            <View style={styles.inputBox}>
              <RNTextInput
                style={styles.inputText} value={waToken} onChangeText={setWaToken} secureTextEntry autoCapitalize="none"
                placeholder={settings?.whatsapp_configured ? "Leave blank to keep the saved token" : "Paste your permanent access token"} placeholderTextColor={colors.textMuted}
              />
            </View>
            <Text style={styles.formHint}>Find both in your Meta Business account under WhatsApp, API setup.</Text>
          </ScrollView>
          <View style={[styles.formFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable onPress={saveWhatsapp} disabled={waSaving} style={waSaving && { opacity: 0.6 }}>
              <LinearGradient colors={["#22c55e", "#0ea5e9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveButton}>
                {waSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
                <Text style={styles.saveText}>Save and connect</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 8 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 8 },
  content: { padding: 14, gap: 12 },

  hero: { borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, lineHeight: 17, marginTop: 4 },
  heroTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)", marginTop: 12, overflow: "hidden" },
  heroFill: { height: 6, borderRadius: 3, backgroundColor: "#fff" },
  heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },

  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 6 },

  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  cardDescription: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillOn: { backgroundColor: "#dcfce7" },
  pillOff: { backgroundColor: "#eef2f6" },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  actionText: { fontSize: 13, fontWeight: "800" },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", marginBottom: 4 },
  codeText: { color: colors.text, fontSize: 12, backgroundColor: "#f4f9fc", borderRadius: 10, padding: 10, overflow: "hidden" },

  soonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  soonTile: { width: "31%", alignItems: "center", gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2eef7", opacity: 0.85 },
  soonIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  soonName: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", paddingHorizontal: 4 },
  contactBanner: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 4 },

  overlay: { ...StyleSheet.absoluteFill, zIndex: 50, elevation: 50, backgroundColor: "#ffffff" },
  overlayHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  overlayBack: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  overlayTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  overlayHint: { color: colors.textSecondary, fontSize: 13 },
  pageRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#e2eef7", backgroundColor: "#ffffff" },
  pageName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  pageMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  formError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 6 },
  formErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },
  formLabel: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  inputBox: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, justifyContent: "center" },
  inputText: { color: colors.text, fontSize: 15 },
  formHint: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  formFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: "#ffffff" },
  saveButton: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
});
