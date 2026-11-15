import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Checkbox, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { BusinessSettings, fetchBusinessSettings, saveBusinessSettings } from "@/api/workspaceSettings";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";
import { AssignmentSection, DeveloperSection, MessagingSection } from "@/components/SettingsSections";
import { PipelineSection } from "@/components/PipelineSection";
import { fetchPreferences } from "@/api/preferences";
import { fetchFacebookSyncStatus, fetchGoogleAdsIntegrations } from "@/api/integrations";
import { fetchGmbConnection, fetchGmbLocations } from "@/api/gmb";
import { fetchSequences } from "@/api/automations";

type SettingsTab = "profile" | "business" | "templates" | "assignment" | "messaging" | "developer" | "pipeline";

const TABS: { key: SettingsTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "profile", label: "My Profile", icon: "person-outline" },
  { key: "business", label: "Business", icon: "business-outline" },
  { key: "templates", label: "Templates", icon: "chatbox-ellipses-outline" },
  { key: "assignment", label: "Assignment", icon: "shuffle-outline" },
  { key: "messaging", label: "Messaging", icon: "chatbubbles-outline" },
  { key: "developer", label: "Developer", icon: "code-slash-outline" },
  { key: "pipeline", label: "Pipeline", icon: "layers-outline" },
];

function FieldLabel({ children }: { children: string }) {
  // A trailing " *" marks a required field; draw it in red.
  const required = children.endsWith(" *");
  return (
    <Text style={styles.fieldLabel}>
      {required ? children.slice(0, -2) : children}
      {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
    </Text>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ProfileTab() {
  const { user } = useAuth();
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <View style={styles.profileWrap}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>Name</Text>
        <TextInput mode="outlined" value={user?.name || ""} editable={false} dense outlineStyle={styles.profileOutline} style={styles.profileField} />

        <Text style={styles.profileLabel}>Email</Text>
        <TextInput mode="outlined" value={user?.email || ""} editable={false} dense outlineStyle={styles.profileOutline} style={styles.profileField} />

        <Text style={styles.profileLabel}>Role</Text>
        <TextInput mode="outlined" value={(user?.role || "").replace(/_/g, " ")} editable={false} dense outlineStyle={styles.profileOutline} style={[styles.profileField, styles.fieldCapitalize]} />

        <View style={styles.passwordRow}>
          <Text style={styles.passwordTitle}>Password</Text>
          <Pressable onPress={() => router.push("/(app)/more/security")} accessibilityRole="button" style={styles.changeButton}>
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Same look as the Add lead form: white inputs with a soft blue border, teal accents, pill buttons.
const BIZ = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7" };

function BizInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      mode="outlined" dense {...props}
      outlineColor={BIZ.line} activeOutlineColor={BIZ.teal} textColor={BIZ.ink}
      outlineStyle={styles.bizOutline}
      style={[styles.bizField, props.multiline && styles.fieldMultiline, props.style]}
    />
  );
}

function BusinessTab() {
  const { tenant, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [businessName, setBusinessName] = useState(tenant?.name || "");
  const [businessEmail, setBusinessEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [dailyReport, setDailyReport] = useState(true);
  const [sendTime, setSendTime] = useState("08:00");
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);
  const [capMessagesPerDay, setCapMessagesPerDay] = useState(false);

  // The full settings object from the server; edits are merged into it on save so unseen fields aren't lost.
  const [serverSettings, setServerSettings] = useState<BusinessSettings>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  function applySettings(s: BusinessSettings) {
    setBusinessName(s.name || tenant?.name || "");
    setBusinessEmail(s.email || user?.email || "");
    setPhone(s.phone || "");
    setWebsite(s.website || "");
    setAddress(s.address || "");
    setCity(s.city || "");
    setState(s.state || "");
    setGstin(s.gst_number || "");
    setPan(s.pan_number || "");
    setAccountHolder(s.bank_details?.account_holder || "");
    setBankName(s.bank_details?.bank_name || "");
    setAccountNumber(s.bank_details?.account_number || "");
    setIfsc(s.bank_details?.ifsc || "");
    setUpiId(s.bank_details?.upi || "");
    setReplyToEmail(s.email_reply_to || "");
    setDailyReport(!!s.daily_report_enabled);
    setSendTime(s.daily_report_time || "08:00");
    setBusinessHoursOnly(!!s.automation_business_hours_enabled);
    setCapMessagesPerDay(!!s.automation_daily_cap_enabled);
  }

  async function loadSettings() {
    setLoading(true); setLoadFailed(false);
    try {
      const loaded = await fetchBusinessSettings();
      setServerSettings(loaded);
      applySettings(loaded);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSettings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCancel() {
    applySettings(serverSettings);
    setEditing(false);
  }

  async function handleSave() {
    if (!businessName.trim()) { Alert.alert("Business name needed", "Enter your business name before saving."); return; }
    if (dailyReport && !/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime.trim())) { Alert.alert("Check the send time", "Use 24-hour HH:MM format, e.g. 08:00."); return; }
    if (loadFailed) { Alert.alert("Can't save yet", "Your current settings didn't load. Pull them in again first."); return; }
    const changes: BusinessSettings = {
      name: businessName.trim(), email: businessEmail.trim(), phone: phone.trim(), website: website.trim(),
      address: address.trim(), city: city.trim(), state: state.trim(),
      gst_number: gstin.trim().toUpperCase(), pan_number: pan.trim().toUpperCase(),
      bank_details: {
        account_holder: accountHolder.trim(), bank_name: bankName.trim(), account_number: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(), upi: upiId.trim(),
      },
      email_reply_to: replyToEmail.trim(),
      daily_report_enabled: dailyReport, daily_report_time: sendTime.trim() || "08:00",
      automation_business_hours_enabled: businessHoursOnly, automation_daily_cap_enabled: capMessagesPerDay,
    };
    setSaving(true);
    try {
      try {
        await saveBusinessSettings(serverSettings, changes);
      } catch (saveError) {
        // Money is already recorded in the old currency, so the server asks the owner to confirm a currency change.
        if (!axios.isAxiosError(saveError) || saveError.response?.status !== 409 || saveError.response.data?.code !== "CURRENCY_CHANGE_CONFIRM") throw saveError;
        const confirmed = await new Promise<boolean>((resolve) => Alert.alert(
          "Change currency?", `${saveError.response?.data?.error}\n\nChange the currency to ${saveError.response?.data?.to}?`,
          [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: "Change", onPress: () => resolve(true) }],
          { cancelable: true, onDismiss: () => resolve(false) },
        ));
        if (!confirmed) return;
        await saveBusinessSettings(serverSettings, changes, true);
      }
      setServerSettings({ ...serverSettings, ...changes });
      setEditing(false);
      Alert.alert("Saved", "Your business settings have been updated.");
    } catch (saveError) {
      Alert.alert("Couldn't save", axios.isAxiosError(saveError) && typeof saveError.response?.data?.error === "string"
        ? saveError.response.data.error : "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <View style={styles.bizCard}>
        <View>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderBody}>
              <Text style={styles.cardTitle}>Business Settings</Text>
              <Text style={styles.cardDescription}>These details appear on your quotations and PDFs.</Text>
            </View>
            {editing ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Button mode="outlined" textColor={BIZ.teal} compact onPress={handleCancel} disabled={saving} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                  Cancel
                </Button>
                <Button mode="contained" buttonColor={BIZ.teal} compact icon="content-save-outline" onPress={handleSave} loading={saving} disabled={saving} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                  Save
                </Button>
              </View>
            ) : (
              <Button mode="contained" buttonColor={BIZ.teal} compact icon="pencil-outline" onPress={() => setEditing(true)} disabled={loading} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                Edit
              </Button>
            )}
          </View>

          {loading ? <ActivityIndicator color={BIZ.teal} style={{ marginVertical: 14 }} /> : null}
          {loadFailed ? (
            <Pressable onPress={loadSettings} style={styles.loadError}>
              <Text style={styles.loadErrorText}>Couldn't load your saved settings. Tap to retry.</Text>
            </Pressable>
          ) : null}

          <SectionLabel>BASIC INFO</SectionLabel>

          <FieldLabel>Business Logo</FieldLabel>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}><Ionicons name="business" size={20} color={BIZ.teal} /></View>
            <Pressable disabled={!editing} onPress={() => Alert.alert("Coming soon", "Logo uploads aren't available yet.")} style={[styles.logoButton, !editing && styles.logoButtonDisabled]}>
              <Text style={[styles.logoButtonText, !editing && styles.logoButtonTextDisabled]}>Change logo</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>Used to watermark WhatsApp template header images. JPG or PNG.</Text>

          <FieldLabel>Business Name *</FieldLabel>
          <BizInput value={businessName} onChangeText={setBusinessName} editable={editing} style={styles.field} />

          <FieldLabel>Business Email</FieldLabel>
          <BizInput value={businessEmail} onChangeText={setBusinessEmail} editable={editing} autoCapitalize="none" style={styles.field} />

          <FieldLabel>Phone</FieldLabel>
          <BizInput value={phone} onChangeText={setPhone} editable={editing} keyboardType="phone-pad" style={styles.field} />

          <FieldLabel>Website</FieldLabel>
          <BizInput value={website} onChangeText={setWebsite} editable={editing} autoCapitalize="none" placeholder="www.example.com" style={styles.field} />

          <FieldLabel>Address</FieldLabel>
          <BizInput value={address} onChangeText={setAddress} editable={editing} multiline numberOfLines={3} style={[styles.field, styles.fieldMultiline]} />

          <FieldLabel>City</FieldLabel>
          <BizInput value={city} onChangeText={setCity} editable={editing} style={styles.field} />

          <FieldLabel>State</FieldLabel>
          <BizInput value={state} onChangeText={setState} editable={editing} style={styles.field} />

          <SectionLabel>TAX DETAILS</SectionLabel>

          <FieldLabel>GST Number (GSTIN)</FieldLabel>
          <BizInput value={gstin} onChangeText={setGstin} editable={editing} autoCapitalize="characters" placeholder="27ASPPJ5781N1ZT" style={styles.field} />

          <FieldLabel>PAN Number</FieldLabel>
          <BizInput value={pan} onChangeText={setPan} editable={editing} autoCapitalize="characters" placeholder="AAAAA0000A" style={styles.field} />

          <SectionLabel>BANK / PAYMENT DETAILS</SectionLabel>

          <FieldLabel>Account Holder Name</FieldLabel>
          <BizInput value={accountHolder} onChangeText={setAccountHolder} editable={editing} style={styles.field} />

          <FieldLabel>Bank Name</FieldLabel>
          <BizInput value={bankName} onChangeText={setBankName} editable={editing} style={styles.field} />

          <FieldLabel>Account Number</FieldLabel>
          <BizInput value={accountNumber} onChangeText={setAccountNumber} editable={editing} keyboardType="number-pad" style={styles.field} />

          <FieldLabel>IFSC Code</FieldLabel>
          <BizInput value={ifsc} onChangeText={setIfsc} editable={editing} autoCapitalize="characters" style={styles.field} />

          <FieldLabel>UPI ID</FieldLabel>
          <BizInput value={upiId} onChangeText={setUpiId} editable={editing} autoCapitalize="none" placeholder="yourname@upi" style={styles.field} />

          <SectionLabel>EMAIL</SectionLabel>

          <FieldLabel>Reply-to email</FieldLabel>
          <BizInput value={replyToEmail} onChangeText={setReplyToEmail} editable={editing} autoCapitalize="none" style={styles.field} />
          <Text style={styles.helperText}>Emails sent to leads (demo invites, follow-up sequences) and reports come from CurveLead, but show your business name and route replies here. Leave blank to use your Business Email above.</Text>

          <SectionLabel>REPORTS</SectionLabel>

          <Pressable style={styles.checkRow} disabled={!editing} onPress={() => setDailyReport((v) => !v)}>
            <Checkbox status={dailyReport ? "checked" : "unchecked"} color={BIZ.teal} disabled={!editing} onPress={() => setDailyReport((v) => !v)} />
            <View style={styles.checkBody}>
              <Text style={styles.checkTitle}>Email me a daily report</Text>
              <Text style={styles.helperText}>Sent once a day to the business email above — new leads, hot leads, follow-ups due/overdue, SLA breaches, deals won, and active campaign spend. Each staff member gets their own version scoped to their assigned leads.</Text>
            </View>
          </Pressable>

          {dailyReport ? (
            <>
              <FieldLabel>Send time (IST)</FieldLabel>
              <BizInput value={sendTime} onChangeText={setSendTime} editable={editing} style={[styles.field, styles.fieldNarrow]} />
            </>
          ) : null}

          <SectionLabel>AUTOMATION</SectionLabel>

          <Pressable style={styles.checkRow} disabled={!editing} onPress={() => setBusinessHoursOnly((v) => !v)}>
            <Checkbox status={businessHoursOnly ? "checked" : "unchecked"} color={BIZ.teal} disabled={!editing} onPress={() => setBusinessHoursOnly((v) => !v)} />
            <View style={styles.checkBody}>
              <Text style={styles.checkTitle}>Only send automated messages during business hours</Text>
              <Text style={styles.helperText}>Anything due outside this window waits until the next allowed time instead of sending late.</Text>
            </View>
          </Pressable>

          <Pressable style={styles.checkRow} disabled={!editing} onPress={() => setCapMessagesPerDay((v) => !v)}>
            <Checkbox status={capMessagesPerDay ? "checked" : "unchecked"} color={BIZ.teal} disabled={!editing} onPress={() => setCapMessagesPerDay((v) => !v)} />
            <View style={styles.checkBody}>
              <Text style={styles.checkTitle}>Cap automated messages per lead per day</Text>
              <Text style={styles.helperText}>Even if multiple rules would fire, no lead gets more than this many automated messages in a day.</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </>
  );
}

type MenuRow = { label: string; tab?: SettingsTab; href?: string; valueKey?: string };
const MENU: { title: string; rows: MenuRow[] }[] = [
  { title: "Account", rows: [
    { label: "My profile", tab: "profile" },
    { label: "Business", tab: "business" },
    { label: "Notifications", valueKey: "notifications", href: "/(app)/more/notification-settings" },
    { label: "Personalization", href: "/(app)/more/personalization" },
  ] },
  { title: "Leads", rows: [
    { label: "Follow-ups", valueKey: "followups", href: "/(app)/more/lead-automation" },
    { label: "Assignment", tab: "assignment" },
    { label: "Pipeline", tab: "pipeline" },
    { label: "Templates", href: "/(app)/more/templates" },
    { label: "Messaging", tab: "messaging" },
  ] },
  { title: "Connections", rows: [
    { label: "Locations", valueKey: "locations", href: "/(app)/more/locations" },
    { label: "Facebook ID", valueKey: "facebook", href: "/(app)/more/facebook" },
    { label: "Google ID", valueKey: "google", href: "/(app)/more/google" },
    { label: "Developer", tab: "developer" },
  ] },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  // null = the grouped menu; otherwise the section that row opened.
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);

  // Live status shown on the right of a row. Each call is independent, so one failing (or being rate limited) just hides that value.
  const [values, setValues] = useState<Record<string, string>>({});
  useFocusEffect(React.useCallback(() => {
    let active = true;
    const put = (key: string, value: string) => { if (active) setValues((current) => ({ ...current, [key]: value })); };
    (async () => {
      await fetchPreferences().then((prefs) => {
        const flags = Object.values(prefs.notification_prefs || {});
        put("notifications", flags.length && flags.every((flag) => flag === false) ? "Off" : "On");
      }).catch(() => {});
      await fetchFacebookSyncStatus().then((status) => put("facebook", status.configured ? "Connected" : "Not set")).catch(() => {});
      const ads = await fetchGoogleAdsIntegrations().catch(() => null);
      const gmb = await fetchGmbConnection().catch(() => null);
      if (ads || gmb) put("google", ads?.some((item) => item.is_active) || gmb?.connected ? "Connected" : "Not set");
      await fetchSequences().then((list) => {
        const active = list.filter((item) => item.is_active).length;
        put("followups", active ? `${active} active` : "None");
      }).catch(() => {});
      if (gmb) {
        if (!gmb.connected) put("locations", "None");
        else await fetchGmbLocations().then((list) => put("locations", String(list.length))).catch(() => {});
      }
    })();
    return () => { active = false; };
  }, []));

  function openRow(row: MenuRow) {
    if (row.tab) setActiveTab(row.tab);
    else if (row.href) router.push(row.href as never);
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => (activeTab ? setActiveTab(null) : router.back())} />
        <Appbar.Content title={activeTab ? TABS.find((tab) => tab.key === activeTab)?.label ?? "Settings" : "Settings"} titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView
        style={styles.body}
        // Room for the floating tab bar, so the last fields and the Save button can be scrolled into view.
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
      >
        {activeTab === null ? MENU.map((group) => (
          <View key={group.title}>
            <Text style={styles.menuGroupTitle}>{group.title}</Text>
            <View style={styles.menuCard}>
              {group.rows.map((row, index) => (
                <Pressable
                  key={row.label} onPress={() => openRow(row)} accessibilityRole="button"
                  style={({ pressed }) => [styles.menuRow, index > 0 && styles.menuRowDivider, pressed && styles.menuRowPressed]}
                >
                  <Text style={styles.menuLabel}>{row.label}</Text>
                  <View style={styles.menuRight}>
                    {row.valueKey && values[row.valueKey] ? <Text style={styles.menuValue}>{values[row.valueKey]}</Text> : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )) : null}

        {activeTab === "profile" ? <ProfileTab /> : null}
        {/* Kept mounted (hidden) so unsaved edits survive going back to the menu and returning. */}
        <View style={activeTab === "business" ? undefined : styles.hidden}><BusinessTab /></View>
        {activeTab === "assignment" ? <AssignmentSection /> : null}
        {activeTab === "messaging" ? <MessagingSection /> : null}
        {activeTab === "developer" ? <DeveloperSection /> : null}
        {activeTab === "pipeline" ? <PipelineSection /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f0f6fa" },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },

  body: { flex: 1 },

  content: { padding: 18, gap: 18 },
  hidden: { display: "none" },

  menuGroupTitle: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, marginLeft: 4 },
  menuCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, height: 48 },
  menuRowDivider: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  menuRowPressed: { backgroundColor: colors.surfaceMuted },
  menuRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  menuValue: { color: colors.textMuted, fontSize: 12 },
  menuLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },

  card: {},
  bizCard: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#cfe3f1", padding: 14 },
  bizField: { backgroundColor: "#ffffff", fontSize: 13 },
  bizOutline: { borderRadius: 10, borderWidth: 1 },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  cardHeaderBody: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },

  sectionLabel: { color: "#0b6b97", fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginTop: 20, marginBottom: 2 },
  fieldLabel: { color: "#0f172a", fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  field: {},
  fieldCapitalize: { textTransform: "capitalize" },
  fieldMultiline: { minHeight: 70 },
  fieldNarrow: { width: 120 },
  helperText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 },

  profileWrap: { alignItems: "stretch", gap: 14 },
  avatar: { alignSelf: "center", width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primaryPressed, fontSize: 18, fontWeight: "800" },
  profileCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 14 },
  profileLabel: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 6 },
  profileField: { backgroundColor: colors.surface, fontSize: 13, height: 42 },
  profileOutline: { borderRadius: 10, borderColor: colors.borderSoft },
  passwordRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  passwordTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  changeButton: { height: 40, paddingHorizontal: 22, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  changeText: { color: colors.primaryPressed, fontSize: 13, fontWeight: "700" },
  editButton: { borderRadius: 8 },
  editButtonContent: { height: 32 },
  loadError: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginVertical: 10 },
  loadErrorText: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  editButtonLabel: { fontSize: 11, fontWeight: "800", marginVertical: 0, marginHorizontal: 8 },

  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#e1eef7", alignItems: "center", justifyContent: "center" },
  logoButton: { borderWidth: 1, borderColor: "#cfe3f1", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  logoButtonDisabled: { opacity: 0.5 },
  logoButtonText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  logoButtonTextDisabled: { color: colors.textMuted },

  checkRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  checkBody: { flex: 1, paddingTop: 8 },
  checkTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },

});
