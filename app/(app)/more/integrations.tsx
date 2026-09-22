import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, List, Text, TextInput } from "react-native-paper";
import axios from "axios";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import {
  connectFacebook, connectFacebookPage, FacebookPage, fetchIntegrationSettings, generateApiKey,
  IntegrationSettings, revokeApiKey, updateIntegrationSettings,
} from "@/api/integrations";

WebBrowser.maybeCompleteAuthSession();

const FACEBOOK_APP_ID = (Constants.expoConfig?.extra?.facebookAppId as string | undefined) || "";
const FACEBOOK_DISCOVERY = { authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth" };
const FACEBOOK_SCOPES = ["public_profile", "pages_show_list", "pages_manage_metadata", "pages_read_engagement", "leads_retrieval", "business_management"];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <View style={[styles.badge, connected ? styles.badgeConnected : styles.badgeIdle]}>
      <Text style={[styles.badgeText, connected ? styles.badgeTextConnected : styles.badgeTextIdle]}>{connected ? "Connected" : "Not connected"}</Text>
    </View>
  );
}

export default function IntegrationsScreen() {
  const insets = useSafeAreaInsets();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "curvelead" });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: FACEBOOK_APP_ID, scopes: FACEBOOK_SCOPES, redirectUri, responseType: AuthSession.ResponseType.Token },
    FACEBOOK_DISCOVERY
  );

  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [facebookPages, setFacebookPages] = useState<FacebookPage[]>([]);

  const [apiKeyBusy, setApiKeyBusy] = useState(false);

  const [waSheetOpen, setWaSheetOpen] = useState(false);
  const [waPhoneId, setWaPhoneId] = useState("");
  const [waToken, setWaToken] = useState("");
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setSettings(await fetchIntegrationSettings()); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load integrations.")); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

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
      await load();
    } catch (connectError) {
      Alert.alert("Couldn't connect this Page", errorMessage(connectError, "Please try again."));
    } finally { setConnectingFacebook(false); }
  }

  async function startFacebookConnect() {
    if (!FACEBOOK_APP_ID) { Alert.alert("Not configured", "Facebook App ID is missing from the app config."); return; }
    setConnectingFacebook(true);
    await promptAsync();
  }

  async function handleGenerateKey() {
    setApiKeyBusy(true);
    try { await generateApiKey(); await load(); }
    catch (genError) { Alert.alert("Couldn't generate a key", errorMessage(genError, "Please try again.")); }
    finally { setApiKeyBusy(false); }
  }

  function handleRevokeKey() {
    Alert.alert("Revoke API key?", "Any integration using this key will stop working immediately.", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: async () => {
        setApiKeyBusy(true);
        try { await revokeApiKey(); await load(); }
        catch (revokeError) { Alert.alert("Couldn't revoke the key", errorMessage(revokeError, "Please try again.")); }
        finally { setApiKeyBusy(false); }
      } },
    ]);
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
      await load();
    } catch (saveError) {
      setWaError(errorMessage(saveError, "Could not save these settings."));
    } finally { setWaSaving(false); }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Integrations" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={load} style={styles.retry}>Try again</Button>
        </View>
      ) : settings ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.cardIcon}><Ionicons name="logo-facebook" size={22} color={colors.surface} /></View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Facebook Lead Ads</Text>
                  <StatusBadge connected={settings.meta_configured} />
                </View>
                <Text style={styles.cardDescription}>{settings.meta_configured ? `Connected to "${settings.meta_page_name}"` : "Sync leads from your Facebook Page's Lead Ads forms automatically."}</Text>
                <Button mode="outlined" compact style={styles.cardAction} onPress={startFacebookConnect} loading={connectingFacebook} disabled={!request || connectingFacebook}>
                  {settings.meta_configured ? "Reconnect" : "Connect"}
                </Button>
              </View>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={[styles.cardIcon, styles.cardIconDark]}><Ionicons name="key-outline" size={20} color={colors.surface} /></View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Custom API / Webhook</Text>
                  <StatusBadge connected={!!settings.api_key} />
                </View>
                <Text style={styles.cardDescription}>Send leads from any source (website form, Zapier, custom app) using an API key.</Text>
                {settings.api_key ? (
                  <Text selectable style={styles.codeText}>{settings.api_key}</Text>
                ) : null}
                <Text style={styles.fieldLabel}>Ingest URL</Text>
                <Text selectable style={styles.codeText}>{settings.api_ingest_url}</Text>
                <View style={styles.cardActionRow}>
                  <Button mode="outlined" compact style={styles.cardActionInline} onPress={handleGenerateKey} loading={apiKeyBusy} disabled={apiKeyBusy}>
                    {settings.api_key ? "Regenerate" : "Generate key"}
                  </Button>
                  {settings.api_key ? (
                    <Button mode="outlined" compact textColor={colors.danger} style={[styles.cardActionInline, styles.cardActionDanger]} onPress={handleRevokeKey} disabled={apiKeyBusy}>Revoke</Button>
                  ) : null}
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={[styles.cardIcon, { backgroundColor: "#25D366" }]}><Ionicons name="logo-whatsapp" size={22} color={colors.surface} /></View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>WhatsApp Business API</Text>
                  <StatusBadge connected={settings.whatsapp_configured} />
                </View>
                <Text style={styles.cardDescription}>{settings.whatsapp_configured ? `Phone number ID: ${settings.whatsapp_phone_number_id}` : "Send automated WhatsApp messages using your Business API credentials."}</Text>
                <Button mode="outlined" compact style={styles.cardAction} onPress={openWhatsappSheet}>Configure</Button>
              </View>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={[styles.cardIcon, { backgroundColor: "#EA4335" }]}><Ionicons name="logo-google" size={20} color={colors.surface} /></View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Google Ads Lead Form</Text>
                  <StatusBadge connected={settings.google_configured} />
                </View>
                <Text style={styles.cardDescription}>Google Ads Lead Form integrations (ad-account mapping, webhook keys) are managed from the web dashboard.</Text>
                <Text style={styles.cardActionMuted}>Manage on web</Text>
              </View>
            </Card.Content>
          </Card>

          <Text style={styles.contactBanner}>Looking for any other provider? Contact us.</Text>
        </ScrollView>
      ) : null}

      <Modal visible={pagePickerOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPagePickerOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPagePickerOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Choose a Facebook Page</Text>
            <View style={styles.optionsList}>
              {facebookPages.map((page) => (
                <List.Item
                  key={page.id} title={page.name} titleNumberOfLines={1}
                  onPress={() => finishPageConnect(page)} disabled={connectingFacebook}
                  right={(props) => connectingFacebook ? <ActivityIndicator size="small" color={colors.primary} /> : <List.Icon {...props} icon="chevron-right" color={colors.textMuted} />}
                />
              ))}
            </View>
            <Button mode="outlined" onPress={() => setPagePickerOpen(false)} style={styles.sheetCancel} contentStyle={styles.sheetButtonContent}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={waSheetOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !waSaving && setWaSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !waSaving && setWaSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>WhatsApp Business API</Text>
            {waError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{waError}</Text></View> : null}
            <TextInput mode="outlined" label="Phone Number ID" value={waPhoneId} onChangeText={setWaPhoneId} placeholder="e.g. 109876543210" autoCapitalize="none" style={styles.sheetField} />
            <TextInput
              mode="outlined" label="Access Token" value={waToken} onChangeText={setWaToken}
              placeholder={settings?.whatsapp_configured ? "Leave blank to keep existing token" : "Paste your access token"}
              autoCapitalize="none" secureTextEntry style={styles.sheetField}
            />
            <Button mode="contained" onPress={saveWhatsapp} loading={waSaving} disabled={waSaving} style={styles.sheetPrimaryButton} contentStyle={styles.sheetButtonContent}>Save</Button>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 14 },
  content: { padding: 18, gap: 14 },

  card: {},
  cardContent: { flexDirection: "row", gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  cardIconDark: { backgroundColor: colors.text },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800" },
  cardDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  fieldLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 10, textTransform: "uppercase" },
  codeText: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 4, backgroundColor: colors.surfaceMuted, borderRadius: 6, padding: 8 },
  cardActionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  cardAction: { alignSelf: "flex-start", marginTop: 12 },
  cardActionInline: { alignSelf: "flex-start" },
  cardActionMuted: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 12 },
  cardActionDanger: { borderColor: colors.danger },

  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeConnected: { backgroundColor: colors.successSoft }, badgeIdle: { backgroundColor: colors.surfaceMuted },
  badgeText: { fontSize: 10, fontWeight: "800" },
  badgeTextConnected: { color: colors.success }, badgeTextIdle: { color: colors.textSecondary },

  contactBanner: { textAlign: "center", color: colors.primary, fontSize: 13, fontWeight: "700", backgroundColor: colors.primarySoft, borderRadius: 10, paddingVertical: 14 },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  sheetField: { marginBottom: 12 },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 6, borderRadius: 8, backgroundColor: colors.dangerSoft },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  sheetPrimaryButton: { marginTop: 8 },
  sheetButtonContent: { height: 48 },
  sheetCancel: { marginTop: 10 },
  optionsList: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
});
