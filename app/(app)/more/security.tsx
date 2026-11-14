import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { changePassword } from "@/api/passwordReset";

// Pale lavender page, white cards with soft borders, indigo actions.
const UI = { bg: "#f4f5fb", line: "#dfe2f0", ink: "#14172e", sub: "#5b6280", muted: "#8b91ab", accent: "#4b45e0", accentSoft: "#e8e9fb", red: "#b3173a", redSoft: "#fde3e8" };

function PasswordField({ label, value, onChange, show, onToggle }: { label: string; value: string; onChange: (value: string) => void; show: boolean; onToggle: () => void }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputBox}>
        <TextInput
          value={value} onChangeText={onChange} placeholder={label} placeholderTextColor={UI.muted}
          secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} style={styles.input}
        />
        <Pressable onPress={onToggle} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"}>
          <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={UI.sub} />
        </Pressable>
      </View>
    </View>
  );
}

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  async function handleChangePassword() {
    setError("");
    if (!currentPassword.trim()) { setError("Enter your current password."); return; }
    if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("New password and confirmation don't match."); return; }
    if (newPassword === currentPassword) { setError("Choose a new password that is different from your current one."); return; }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      Alert.alert("Password updated", "Your password has been changed.");
    } catch (changeError) {
      setError(axios.isAxiosError(changeError)
        ? (typeof changeError.response?.data?.error === "string" ? changeError.response.data.error
          : changeError.response ? "Couldn't change your password. Check your current password and try again."
          : "Couldn't reach the server. Check your connection and try again.")
        : "Couldn't change your password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={UI.ink} /></Pressable>
        <Text style={styles.headerTitle}>Security</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconWrap, { backgroundColor: "#dff0fb" }]}>
              <Ionicons name="key-outline" size={20} color="#0b6b97" />
            </View>
            <View style={styles.cardHeaderBody}>
              <Text style={styles.cardTitle}>Change Password</Text>
              <Text style={styles.cardDescription}>Use a strong password you don't use anywhere else.</Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={UI.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} show={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
          <PasswordField label="New password" value={newPassword} onChange={setNewPassword} show={showNew} onToggle={() => setShowNew((v) => !v)} />
          <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />

          <Pressable onPress={handleChangePassword} disabled={saving} style={[styles.saveButton, saving && { opacity: 0.7 }]} accessibilityRole="button">
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : null}
            <Text style={styles.saveText}>Update Password</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconWrap, { backgroundColor: UI.accentSoft }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={UI.accent} />
            </View>
            <View style={styles.cardHeaderBody}>
              <Text style={styles.cardTitle}>Two-Factor Authentication</Text>
              <Text style={styles.cardDescription}>Add an extra layer of security with a one-time code at sign-in.</Text>
            </View>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.statusRow}>
            <View style={styles.badge}><View style={styles.badgeDot} /><Text style={styles.badgeText}>Coming soon</Text></View>
            <Switch value={twoFactorEnabled} onValueChange={setTwoFactorEnabled} trackColor={{ true: UI.accent, false: "#dcdeea" }} disabled />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconWrap, { backgroundColor: "#fdeccd" }]}>
              <Ionicons name="phone-portrait-outline" size={20} color="#8a5a12" />
            </View>
            <View style={styles.cardHeaderBody}>
              <Text style={styles.cardTitle}>Active Sessions</Text>
              <Text style={styles.cardDescription}>See and sign out of devices logged into your account.</Text>
            </View>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.statusRow}>
            <View style={styles.badge}><View style={styles.badgeDot} /><Text style={styles.badgeText}>Coming soon</Text></View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 24, fontWeight: "800" },
  content: { paddingHorizontal: 14, paddingTop: 4, gap: 10 },

  card: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: UI.line, padding: 14, gap: 10 },
  cardHeaderRow: { flexDirection: "row", gap: 12 },
  cardHeaderBody: { flex: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: UI.ink, fontSize: 15, fontWeight: "800" },
  cardDescription: { color: UI.sub, fontSize: 12, lineHeight: 17, marginTop: 2 },
  cardDivider: { height: 1, backgroundColor: UI.line },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  fieldLabel: { color: UI.sub, fontSize: 12, fontWeight: "800", marginBottom: 5 },
  inputBox: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 14 },
  input: { flex: 1, color: UI.ink, fontSize: 14, paddingVertical: 0 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, backgroundColor: UI.redSoft },
  errorText: { flex: 1, color: UI.red, fontSize: 12, fontWeight: "700" },

  saveButton: { height: 46, borderRadius: 14, backgroundColor: UI.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 },
  saveText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },

  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#dff0fb" },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0b6b97" },
  badgeText: { color: "#0b5a82", fontSize: 12, fontWeight: "800" },
});
