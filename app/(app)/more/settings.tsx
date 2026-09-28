import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Checkbox, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";

type SettingsTab = "profile" | "business" | "templates" | "pipeline";

const TABS: { key: SettingsTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "profile", label: "My Profile", icon: "person-outline" },
  { key: "business", label: "Business", icon: "business-outline" },
  { key: "templates", label: "Templates", icon: "chatbox-ellipses-outline" },
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

  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setEditing(false);
      Alert.alert("Saved", "Your business settings have been updated.");
    }, 500);
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
              <Button mode="contained" compact icon="content-save-outline" onPress={handleSave} loading={saving} disabled={saving} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                Save
              </Button>
            ) : (
              <Button mode="contained" compact icon="pencil-outline" onPress={() => setEditing(true)} style={styles.editButton} contentStyle={styles.editButtonContent} labelStyle={styles.editButtonLabel}>
                Edit
              </Button>
            )}
          </View>

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

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {activeTab === "profile" ? <ProfileTab /> : null}
        {activeTab === "business" ? <BusinessTab /> : null}
        {activeTab === "templates" ? (
          <LinkOutTab
            icon="chatbox-ellipses-outline" title="Message Templates"
            description="Create reusable WhatsApp, SMS and email templates you can send to any lead in one tap."
            href="/(app)/more/templates" buttonLabel="Open Templates"
          />
        ) : null}
        {activeTab === "pipeline" ? (
          <LinkOutTab
            icon="layers-outline" title="Pipeline"
            description="Manage your lead stages and statuses — the kanban board leads move through."
            href="/(app)/more/pipeline" buttonLabel="Open Pipeline"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },

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
