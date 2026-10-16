import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Checkbox, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { BusinessSettings, fetchBusinessSettings, saveBusinessSettings } from "@/api/workspaceSettings";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";
import { AssignmentSection, DeveloperSection, MessagingSection } from "@/components/SettingsSections";
import { PipelineSection } from "@/components/PipelineSection";

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
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ProfileTab() {
  const { user, tenant } = useAuth();
  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content>
        <Text style={styles.cardTitle}>My Profile</Text>

        <FieldLabel>Name</FieldLabel>
        <TextInput mode="outlined" value={user?.name || ""} editable={false} style={styles.field} />

        <FieldLabel>Email</FieldLabel>
        <TextInput mode="outlined" value={user?.email || ""} editable={false} style={styles.field} />

        <FieldLabel>Role</FieldLabel>
        <TextInput mode="outlined" value={(user?.role || "").replace(/_/g, " ")} editable={false} style={[styles.field, styles.fieldCapitalize]} />

        {tenant?.name ? (
          <>
            <FieldLabel>Workspace</FieldLabel>
            <TextInput mode="outlined" value={tenant.name} editable={false} style={styles.field} />
          </>
        ) : null}

        <View style={styles.passwordRow}>
          <Text style={styles.cardTitle}>Change Password</Text>
          <Button mode="contained" compact icon="pencil-outline" onPress={() => router.push("/(app)/more/security")} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
            Edit
          </Button>
        </View>
      </Card.Content>
    </Card>
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
      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderBody}>
              <Text style={styles.cardTitle}>Business Settings</Text>
              <Text style={styles.cardDescription}>These details appear on your quotations and PDFs.</Text>
            </View>
            {editing ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Button mode="outlined" compact onPress={handleCancel} disabled={saving} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                  Cancel
                </Button>
                <Button mode="contained" compact icon="content-save-outline" onPress={handleSave} loading={saving} disabled={saving} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                  Save
                </Button>
              </View>
            ) : (
              <Button mode="contained" compact icon="pencil-outline" onPress={() => setEditing(true)} disabled={loading} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                Edit
              </Button>
            )}
          </View>

          {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 14 }} /> : null}
          {loadFailed ? (
            <Pressable onPress={loadSettings} style={styles.loadError}>
              <Text style={styles.loadErrorText}>Couldn't load your saved settings. Tap to retry.</Text>
            </Pressable>
          ) : null}

          <SectionLabel>BASIC INFO</SectionLabel>

          <FieldLabel>Business Logo</FieldLabel>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}><Ionicons name="business" size={20} color={colors.primary} /></View>
            <Pressable disabled={!editing} onPress={() => Alert.alert("Coming soon", "Logo uploads aren't available yet.")} style={[styles.logoButton, !editing && styles.logoButtonDisabled]}>
              <Text style={[styles.logoButtonText, !editing && styles.logoButtonTextDisabled]}>Change logo</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>Used to watermark WhatsApp template header images. JPG or PNG.</Text>

          <FieldLabel>Business Name *</FieldLabel>
          <TextInput mode="outlined" value={businessName} onChangeText={setBusinessName} editable={editing} style={styles.field} />

          <FieldLabel>Business Email</FieldLabel>
          <TextInput mode="outlined" value={businessEmail} onChangeText={setBusinessEmail} editable={editing} autoCapitalize="none" style={styles.field} />

          <FieldLabel>Phone</FieldLabel>
          <TextInput mode="outlined" value={phone} onChangeText={setPhone} editable={editing} keyboardType="phone-pad" style={styles.field} />

          <FieldLabel>Website</FieldLabel>
          <TextInput mode="outlined" value={website} onChangeText={setWebsite} editable={editing} autoCapitalize="none" placeholder="www.example.com" style={styles.field} />

          <FieldLabel>Address</FieldLabel>
          <TextInput mode="outlined" value={address} onChangeText={setAddress} editable={editing} multiline numberOfLines={3} style={[styles.field, styles.fieldMultiline]} />

          <FieldLabel>City</FieldLabel>
          <TextInput mode="outlined" value={city} onChangeText={setCity} editable={editing} style={styles.field} />

          <FieldLabel>State</FieldLabel>
          <TextInput mode="outlined" value={state} onChangeText={setState} editable={editing} style={styles.field} />

          <SectionLabel>TAX DETAILS</SectionLabel>

          <FieldLabel>GST Number (GSTIN)</FieldLabel>
          <TextInput mode="outlined" value={gstin} onChangeText={setGstin} editable={editing} autoCapitalize="characters" placeholder="27ASPPJ5781N1ZT" style={styles.field} />

          <FieldLabel>PAN Number</FieldLabel>
          <TextInput mode="outlined" value={pan} onChangeText={setPan} editable={editing} autoCapitalize="characters" placeholder="AAAAA0000A" style={styles.field} />

          <SectionLabel>BANK / PAYMENT DETAILS</SectionLabel>

          <FieldLabel>Account Holder Name</FieldLabel>
          <TextInput mode="outlined" value={accountHolder} onChangeText={setAccountHolder} editable={editing} style={styles.field} />

          <FieldLabel>Bank Name</FieldLabel>
          <TextInput mode="outlined" value={bankName} onChangeText={setBankName} editable={editing} style={styles.field} />

          <FieldLabel>Account Number</FieldLabel>
          <TextInput mode="outlined" value={accountNumber} onChangeText={setAccountNumber} editable={editing} keyboardType="number-pad" style={styles.field} />

          <FieldLabel>IFSC Code</FieldLabel>
          <TextInput mode="outlined" value={ifsc} onChangeText={setIfsc} editable={editing} autoCapitalize="characters" style={styles.field} />

          <FieldLabel>UPI ID</FieldLabel>
          <TextInput mode="outlined" value={upiId} onChangeText={setUpiId} editable={editing} autoCapitalize="none" placeholder="yourname@upi" style={styles.field} />

          <SectionLabel>EMAIL</SectionLabel>

          <FieldLabel>Reply-to email</FieldLabel>
          <TextInput mode="outlined" value={replyToEmail} onChangeText={setReplyToEmail} editable={editing} autoCapitalize="none" style={styles.field} />
          <Text style={styles.helperText}>Emails sent to leads (demo invites, follow-up sequences) and reports come from CurveLead, but show your business name and route replies here. Leave blank to use your Business Email above.</Text>

          <SectionLabel>REPORTS</SectionLabel>

          <Pressable style={styles.checkRow} disabled={!editing} onPress={() => setDailyReport((v) => !v)}>
            <Checkbox status={dailyReport ? "checked" : "unchecked"} color={colors.primary} disabled={!editing} onPress={() => setDailyReport((v) => !v)} />
            <View style={styles.checkBody}>
              <Text style={styles.checkTitle}>Email me a daily report</Text>
              <Text style={styles.helperText}>Sent once a day to the business email above — new leads, hot leads, follow-ups due/overdue, SLA breaches, deals won, and active campaign spend. Each staff member gets their own version scoped to their assigned leads.</Text>
            </View>
          </Pressable>

          {dailyReport ? (
            <>
              <FieldLabel>Send time (IST)</FieldLabel>
              <TextInput mode="outlined" value={sendTime} onChangeText={setSendTime} editable={editing} style={[styles.field, styles.fieldNarrow]} />
            </>
          ) : null}

          <SectionLabel>AUTOMATION</SectionLabel>

          <Pressable style={styles.checkRow} disabled={!editing} onPress={() => setBusinessHoursOnly((v) => !v)}>
            <Checkbox status={businessHoursOnly ? "checked" : "unchecked"} color={colors.primary} disabled={!editing} onPress={() => setBusinessHoursOnly((v) => !v)} />
            <View style={styles.checkBody}>
              <Text style={styles.checkTitle}>Only send automated messages during business hours</Text>
              <Text style={styles.helperText}>Anything due outside this window waits until the next allowed time instead of sending late.</Text>
            </View>
          </Pressable>

          <Pressable style={styles.checkRow} disabled={!editing} onPress={() => setCapMessagesPerDay((v) => !v)}>
            <Checkbox status={capMessagesPerDay ? "checked" : "unchecked"} color={colors.primary} disabled={!editing} onPress={() => setCapMessagesPerDay((v) => !v)} />
            <View style={styles.checkBody}>
              <Text style={styles.checkTitle}>Cap automated messages per lead per day</Text>
              <Text style={styles.helperText}>Even if multiple rules would fire, no lead gets more than this many automated messages in a day.</Text>
            </View>
          </Pressable>
        </Card.Content>
      </Card>
    </>
  );
}

function LinkOutTab({ icon, title, description, href, buttonLabel }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; href: string; buttonLabel: string }) {
  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.linkOutContent}>
        <View style={styles.linkOutIcon}><Ionicons name={icon} size={22} color={colors.primary} /></View>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={[styles.cardDescription, styles.linkOutDescription]}>{description}</Text>
        <Button mode="contained" onPress={() => router.push(href as never)} style={styles.linkOutButton} contentStyle={styles.saveButtonContent}>
          {buttonLabel}
        </Button>
      </Card.Content>
    </Card>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Settings" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
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

      <ScrollView
        style={styles.body}
        // Room for the floating tab bar, so the last fields and the Save button can be scrolled into view.
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
      >
        {activeTab === "profile" ? <ProfileTab /> : null}
        {activeTab === "business" ? <BusinessTab /> : null}
        {activeTab === "templates" ? (
          <LinkOutTab
            icon="chatbox-ellipses-outline" title="Message Templates"
            description="Create reusable WhatsApp, SMS and email templates you can send to any lead in one tap."
            href="/(app)/more/templates" buttonLabel="Open Templates"
          />
        ) : null}
        {activeTab === "assignment" ? <AssignmentSection /> : null}
        {activeTab === "messaging" ? <MessagingSection /> : null}
        {activeTab === "developer" ? <DeveloperSection /> : null}
        {activeTab === "pipeline" ? <PipelineSection /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },

  // A horizontal ScrollView in a column otherwise stretches to fill the screen and leaves the form no height to scroll in.
  tabScroll: { flexGrow: 0, flexShrink: 0 },
  body: { flex: 1 },
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
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  cardHeaderBody: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },

  sectionLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginTop: 18, marginBottom: 4 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  field: {},
  fieldCapitalize: { textTransform: "capitalize" },
  fieldMultiline: { minHeight: 70 },
  fieldNarrow: { width: 120 },
  helperText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 },

  passwordRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  editButton: { borderRadius: 8 },
  editButtonContent: { height: 32 },
  loadError: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginVertical: 10 },
  loadErrorText: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  editButtonLabel: { fontSize: 11, fontWeight: "800", marginVertical: 0, marginHorizontal: 8 },

  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  logoButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  logoButtonDisabled: { opacity: 0.5 },
  logoButtonText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  logoButtonTextDisabled: { color: colors.textMuted },

  checkRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  checkBody: { flex: 1, paddingTop: 8 },
  checkTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },

  linkOutContent: { alignItems: "center", textAlign: "center", paddingVertical: 10 },
  linkOutIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  linkOutDescription: { textAlign: "center", marginTop: 6, marginBottom: 16 },
  linkOutButton: { borderRadius: 10, alignSelf: "stretch" },
  saveButtonContent: { height: 46 },
});
