import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { inviteStaffMember } from "@/api/staff";
import { fetchTeams, Team } from "@/api/workspaceSettings";

// Palette shared with the Team screen: pale blue page, white fields, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", teal: "#0b6b97", red: "#d6334f" };

const NO_TEAM = "No team";

export default function InviteTeamScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"Staff" | "Admin">("Staff");
  const [team, setTeam] = useState(NO_TEAM);
  const [teams, setTeams] = useState<Team[]>([]);
  const [openMenu, setOpenMenu] = useState<"role" | "team" | null>(null);
  const [sending, setSending] = useState(false);

  // The Team list is the workspace's real teams; if they can't load, "No team" still works.
  useEffect(() => { fetchTeams().then(setTeams).catch(() => {}); }, []);

  function close() {
    if (!sending) router.back();
  }

  async function sendInvite() {
    if (sending) return;
    if (!name.trim() || !email.trim() || !phone.trim()) {
      Alert.alert("Missing details", "Please complete the name, email, and phone fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert("Check the email", "Enter a valid email address.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      Alert.alert("Check the phone number", "Enter a valid phone number with at least 10 digits.");
      return;
    }
    setSending(true);
    try {
      await inviteStaffMember({
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        role: role === "Admin" ? "admin" : "staff",
        team_id: teams.find((item) => item.name === team)?.id,
      });
      Alert.alert("Invitation sent", `${name.trim()} will get an email with a link to set their password.`);
      router.back();
    } catch (inviteError) {
      Alert.alert("Couldn't send the invitation", axios.isAxiosError(inviteError) && typeof inviteError.response?.data?.error === "string"
        ? inviteError.response.data.error : "Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.backdrop, { paddingBottom: keyboardHeight }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.sheet, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Invite team member</Text>
          <Pressable accessibilityLabel="Close" hitSlop={10} onPress={close}>
            <Ionicons name="close" size={22} color={UI.ink} />
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        >
          <Text style={styles.description}>They&apos;ll get an email with a link to set their own password.</Text>
          <InviteField label="Name" required value={name} onChangeText={setName} />
          <InviteField label="Email" required value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <InviteField label="Phone" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <InviteSelect
            label="Role"
            value={role}
            open={openMenu === "role"}
            onPress={() => setOpenMenu(openMenu === "role" ? null : "role")}
            options={["Staff", "Admin"]}
            onSelect={(value) => { setRole(value as "Staff" | "Admin"); setOpenMenu(null); }}
          />
          <InviteSelect
            label="Team"
            value={team}
            open={openMenu === "team"}
            onPress={() => setOpenMenu(openMenu === "team" ? null : "team")}
            options={[NO_TEAM, ...teams.map((item) => item.name)]}
            onSelect={(value) => { setTeam(value); setOpenMenu(null); }}
          />
          <View style={styles.actions}>
            <Button mode="outlined" textColor={UI.teal} style={styles.cancelButton} contentStyle={styles.actionContent} onPress={close} disabled={sending}>Cancel</Button>
            <Button mode="contained" buttonColor={UI.teal} style={styles.sendButton} contentStyle={styles.actionContent} onPress={sendInvite} loading={sending} disabled={sending}>Send invite</Button>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function InviteField({ label, required, ...props }: { label: string; required?: boolean; value: string; onChangeText: (value: string) => void; keyboardType?: "default" | "email-address" | "phone-pad"; autoCapitalize?: "none" | "sentences" }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <TextInput
        mode="outlined"
        dense
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
        style={styles.input}
        outlineColor={UI.line}
        activeOutlineColor={UI.teal}
      />
    </View>
  );
}

function InviteSelect({ label, value, open, onPress, options, onSelect }: { label: string; value: string; open: boolean; onPress: () => void; options: string[]; onSelect: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.select} onPress={onPress}>
        <Text style={styles.selectText}>{value}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={UI.ink} />
      </Pressable>
      {open ? (
        <View style={styles.options}>
          {options.map((option) => (
            <Pressable key={option} style={styles.option} onPress={() => onSelect(option)}>
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: UI.bg },
  sheet: { flex: 1, backgroundColor: UI.bg },
  header: { minHeight: 56, paddingHorizontal: spacing.lg, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  description: { color: UI.sub, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },
  field: { marginBottom: 12 },
  label: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 6 },
  required: { color: UI.red },
  input: { height: 42, backgroundColor: "#ffffff", fontSize: 13 },
  select: { minHeight: 44, borderWidth: 1, borderColor: UI.line, borderRadius: 10, backgroundColor: "#ffffff", paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { color: UI.ink, fontSize: 13 },
  options: { borderWidth: 1, borderColor: UI.line, borderRadius: 10, marginTop: 5, overflow: "hidden", backgroundColor: "#ffffff" },
  option: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  optionText: { color: UI.ink, fontSize: 13 },
  actions: { flexDirection: "row", gap: 12, marginTop: spacing.md },
  actionContent: { height: 44 },
  cancelButton: { flex: 1, borderColor: UI.line, borderRadius: 999, backgroundColor: "#ffffff" },
  sendButton: { flex: 1, borderRadius: 999 },
});
