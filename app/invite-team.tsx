import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

export default function InviteTeamScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"Staff" | "Admin">("Staff");
  const [team, setTeam] = useState("No team");
  const [openMenu, setOpenMenu] = useState<"role" | "team" | null>(null);

  function close() {
    router.back();
  }

  function sendInvite() {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      Alert.alert("Missing details", "Please complete the name, email, and phone fields.");
      return;
    }
    Alert.alert("Invite member", "Member invitations will be available when the invite endpoint is connected.");
  }

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Pressable style={styles.backdropTap} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Invite Team Member</Text>
          <Pressable accessibilityLabel="Close" hitSlop={10} onPress={close}>
            <Ionicons name="close" size={22} color={colors.text} />
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
            options={["No team", "Sales team"]}
            onSelect={(value) => { setTeam(value); setOpenMenu(null); }}
          />
          <View style={styles.actions}>
            <Button mode="outlined" style={styles.cancelButton} contentStyle={styles.actionContent} onPress={close}>Cancel</Button>
            <Button mode="contained" style={styles.sendButton} contentStyle={styles.actionContent} onPress={sendInvite}>Send invite</Button>
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
        outlineColor={colors.border}
        activeOutlineColor={colors.primary}
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
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={22} color={colors.text} />
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
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: { maxHeight: "88%", backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  header: { minHeight: 52, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  description: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  field: { marginBottom: 10 },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 5 },
  required: { color: colors.danger },
  input: { height: 38, backgroundColor: colors.surface, fontSize: 13 },
  select: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { color: colors.text, fontSize: 13 },
  options: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 5, overflow: "hidden", backgroundColor: colors.surface },
  option: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optionText: { color: colors.text, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: spacing.sm },
  actionContent: { height: 42 },
  cancelButton: { flex: 1, borderColor: colors.border },
  sendButton: { flex: 1 },
});
