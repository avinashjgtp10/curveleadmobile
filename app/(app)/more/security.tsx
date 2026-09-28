import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Switch, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

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

  function handleChangePassword() {
    setError("");
    if (!currentPassword.trim()) { setError("Enter your current password."); return; }
    if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("New password and confirmation don't match."); return; }

    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      Alert.alert("Password updated", "Your password has been changed.");
    }, 600);
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Security" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="key-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.cardHeaderBody}>
                <Text style={styles.cardTitle}>Change Password</Text>
                <Text style={styles.cardDescription}>Use a strong password you don't use anywhere else.</Text>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TextInput
              mode="outlined" label="Current Password" value={currentPassword} onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent} autoCapitalize="none" style={styles.field}
              right={<TextInput.Icon icon={showCurrent ? "eye-off-outline" : "eye-outline"} onPress={() => setShowCurrent((v) => !v)} />}
            />
            <TextInput
              mode="outlined" label="New Password" value={newPassword} onChangeText={setNewPassword}
              secureTextEntry={!showNew} autoCapitalize="none" style={styles.field}
              right={<TextInput.Icon icon={showNew ? "eye-off-outline" : "eye-outline"} onPress={() => setShowNew((v) => !v)} />}
            />
            <TextInput
              mode="outlined" label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm} autoCapitalize="none" style={styles.field}
              right={<TextInput.Icon icon={showConfirm ? "eye-off-outline" : "eye-outline"} onPress={() => setShowConfirm((v) => !v)} />}
            />

            <Button mode="contained" onPress={handleChangePassword} loading={saving} disabled={saving} style={styles.saveButton} contentStyle={styles.saveButtonContent}>
              Update Password
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Content style={styles.toggleRow}>
            <View style={[styles.iconWrap, { backgroundColor: "#ede9fe" }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#7c3aed" />
            </View>
            <View style={styles.toggleBody}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Two-Factor Authentication</Text>
                <View style={styles.badge}>
                  <View style={styles.badgeDot} />
                  <Text style={styles.badgeText}>Coming soon</Text>
                </View>
              </View>
              <Text style={styles.cardDescription}>Add an extra layer of security with a one-time code at sign-in.</Text>
            </View>
            <Switch value={twoFactorEnabled} onValueChange={setTwoFactorEnabled} color={colors.primary} disabled />
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Content style={styles.toggleRow}>
            <View style={[styles.iconWrap, { backgroundColor: colors.warningSoft }]}>
              <Ionicons name="phone-portrait-outline" size={20} color={colors.warning} />
            </View>
            <View style={styles.toggleBody}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Active Sessions</Text>
                <View style={styles.badge}>
                  <View style={styles.badgeDot} />
                  <Text style={styles.badgeText}>Coming soon</Text>
                </View>
              </View>
              <Text style={styles.cardDescription}>See and sign out of devices logged into your account.</Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  content: { padding: 18, gap: 14 },

  card: {},
  cardHeaderRow: { flexDirection: "row", gap: 12, marginBottom: 4 },
  cardHeaderBody: { flex: 1 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  field: { marginTop: 12 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginTop: 12, borderRadius: 8, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },

  saveButton: { marginTop: 14, borderRadius: 10 },
  saveButtonContent: { height: 48 },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleBody: { flex: 1 },

  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: colors.primarySoft },
  badgeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary },
  badgeText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
});
