import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Checkbox, Text, TextInput } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import axios from "axios";
import { fetchStaff, fetchStaffPermissions, fetchStaffWhatsApp, saveStaffPermissions, saveStaffWhatsApp, setStaffPassword, StaffMember, StaffPermission } from "@/api/staff";
import { colors, radii, spacing } from "@/theme";

// Palette of the redesigned screen: pale blue page, white cards, deep teal-blue actions.
const UI = { bg: "#eef4f8", line: "#d6e6f0", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", green: "#0f7b5f", greenSoft: "#d8f0e5", red: "#d6334f" };

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamName, setTeamName] = useState("");

  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [waMember, setWaMember] = useState<StaffMember | null>(null);
  const [waMemberNumber, setWaMemberNumber] = useState("");
  const [waMemberToken, setWaMemberToken] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const [permMember, setPermMember] = useState<StaffMember | null>(null);
  const [permissions, setPermissions] = useState<StaffPermission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  const [passwordMember, setPasswordMember] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      setStaff(await fetchStaff());
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) && typeof loadError.response?.data?.error === "string" ? loadError.response.data.error : "Could not load your team.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const activeCount = useMemo(() => staff.filter((member) => member.is_active).length, [staff]);
  const teamCount = useMemo(() => new Set(staff.map((member) => member.role)).size || (staff.length ? 1 : 0), [staff]);

  function openInvite() {
    router.push("/invite-team");
  }

  function createTeam() {
    if (!teamName.trim()) {
      Alert.alert("Missing team name", "Enter a name for the new team.");
      return;
    }
    Alert.alert("Create team", "Team creation will be available when the team endpoint is connected.");
  }

  async function openWhatsappModal(member: StaffMember) {
    setOpenMenuFor(null);
    setWaMember(member); setWaMemberNumber(""); setWaMemberToken(""); setWaLoading(true);
    try {
      // The saved Phone number ID comes from the server. (The member's own phone number is a different thing.)
      const saved = await fetchStaffWhatsApp(member.id);
      setWaMemberNumber(saved.whatsapp_phone_number_id);
    } catch {
      // The form still works for entering a new value; saving will report any problem.
    } finally {
      setWaLoading(false);
    }
  }

  async function saveMemberWhatsapp() {
    if (!waMember || waSaving || waLoading) return;
    if (!waMemberNumber.trim()) {
      Alert.alert("Phone number ID needed", "Enter the WhatsApp Phone number ID for this team member.");
      return;
    }
    setWaSaving(true);
    try {
      await saveStaffWhatsApp(waMember.id, { whatsapp_phone_number_id: waMemberNumber.trim(), whatsapp_access_token: waMemberToken.trim() });
      const name = waMember.name;
      setWaMember(null);
      Alert.alert("WhatsApp number saved", `${name}'s WhatsApp number was updated.`);
    } catch (saveError) {
      Alert.alert("Couldn't save WhatsApp number", axios.isAxiosError(saveError) && typeof saveError.response?.data?.error === "string"
        ? saveError.response.data.error : "Please check your connection and try again.");
    } finally {
      setWaSaving(false);
    }
  }

  async function openPermissionsModal(member: StaffMember) {
    setOpenMenuFor(null);
    setPermMember(member); setPermissions([]); setPermissionsLoading(true);
    try {
      const loaded = await fetchStaffPermissions(member.id);
      setPermissions(loaded);
    } catch {
      setPermMember(null);
      Alert.alert("Couldn't load permissions", "Please check your connection and try again.");
    } finally {
      setPermissionsLoading(false);
    }
  }

  function togglePermission(key: string) {
    setPermissions((current) => current.map((item) => (item.key === key ? { ...item, granted: !item.granted } : item)));
  }

  async function savePermissions() {
    if (!permMember || permissionsSaving || permissionsLoading) return;
    setPermissionsSaving(true);
    try {
      await saveStaffPermissions(permMember.id, permissions);
      const name = permMember.name;
      setPermMember(null);
      Alert.alert("Permissions saved", `${name}'s permissions were updated.`);
    } catch (saveError) {
      Alert.alert("Couldn't save permissions", axios.isAxiosError(saveError) && typeof saveError.response?.data?.error === "string"
        ? saveError.response.data.error : "Please check your connection and try again.");
    } finally {
      setPermissionsSaving(false);
    }
  }

  function openPasswordModal(member: StaffMember) {
    setOpenMenuFor(null);
    setPasswordMember(member); setNewPassword(""); setConfirmPassword("");
  }

  async function saveMemberPassword() {
    if (!passwordMember || passwordSaving) return;
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Password too short", "Enter a password with at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords don't match", "Make sure both password fields match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await setStaffPassword(passwordMember.id, newPassword);
      const name = passwordMember.name;
      setPasswordMember(null);
      Alert.alert("Password updated", `${name}'s password has been changed.`);
    } catch (passwordError) {
      Alert.alert("Couldn't change password", axios.isAxiosError(passwordError) && typeof passwordError.response?.data?.error === "string"
        ? passwordError.response.data.error : "Please check your connection and try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  function removeMember(member: StaffMember) {
    setOpenMenuFor(null);
    Alert.alert("Remove member?", `${member.name} will lose access to your workspace.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        Alert.alert("Remove member", "Member removal will be available when the staff endpoint is connected.");
      } },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Team</Text>
      </View>

      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={UI.teal} /></View> : error ? (
        <View style={styles.state}>
          <Ionicons name="people-outline" size={38} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={UI.teal} />}
        >
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={styles.subtitle}>Manage your team members and lead assignment</Text>
            </View>
            <Pressable style={styles.addButton} onPress={openInvite} accessibilityRole="button" accessibilityLabel="Add member">
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add member</Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <StatCard icon="people-outline" value={staff.length} label="Members" tone="primary" />
            <StatCard icon="shield-checkmark-outline" value={activeCount} label="Active" tone="success" />
            <StatCard icon="people-circle-outline" value={teamCount} label="Teams" tone="warning" />
          </View>

          <View style={styles.card}>
            <View>
              <View style={styles.sectionTopRow}>
                <Text style={styles.sectionTitle}>Team members</Text>
                <Pressable onPress={() => { setTeamName(""); setTeamModalOpen(true); }} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.newTeam}>+ New team</Text>
                </Pressable>
              </View>
              {staff.length ? staff.map((member, index) => <React.Fragment key={member.id}>
                <MemberRow
                  member={member} menuOpen={openMenuFor === member.id}
                  onToggleMenu={() => setOpenMenuFor(openMenuFor === member.id ? null : member.id)}
                  onWhatsapp={() => openWhatsappModal(member)}
                  onPermissions={() => openPermissionsModal(member)}
                  onChangePassword={() => openPasswordModal(member)}
                  onRemove={() => removeMember(member)}
                />
                {index < staff.length - 1 ? <View style={styles.rowDivider} /> : null}
              </React.Fragment>) : <Text style={styles.empty}>No team members found.</Text>}
            </View>
          </View>
        </ScrollView>
      )}

      <Modal visible={teamModalOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setTeamModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTeamModalOpen(false)}>
          <Pressable style={[styles.teamModal, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New team</Text>
              <Pressable accessibilityLabel="Close" hitSlop={10} onPress={() => setTeamModalOpen(false)}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
            </View>
            <View style={styles.teamModalBody}>
              <Text style={styles.fieldLabel}>Team name</Text>
              <TextInput
                mode="outlined"
                dense
                value={teamName}
                onChangeText={setTeamName}
                style={styles.teamNameInput}
                outlineColor={UI.line}
                activeOutlineColor={UI.teal}
              />
              <View style={styles.modalActions}>
                <Button mode="outlined" textColor={UI.teal} style={styles.cancelButton} onPress={() => setTeamModalOpen(false)}>Cancel</Button>
                <Button mode="contained" buttonColor={UI.teal} style={styles.sendButton} onPress={createTeam}>Create</Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!waMember} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setWaMember(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setWaMember(null)}>
          <Pressable style={[styles.teamModal, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{waMember?.name}&apos;s WhatsApp Number</Text>
              <Pressable accessibilityLabel="Close" hitSlop={10} onPress={() => setWaMember(null)}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
            </View>
            <View style={styles.teamModalBody}>
              <TextInput
                mode="outlined" dense placeholder="Phone number ID" value={waMemberNumber} onChangeText={setWaMemberNumber}
                keyboardType="number-pad" autoCorrect={false} editable={!waLoading && !waSaving}
                right={waLoading ? <TextInput.Icon icon="loading" /> : undefined}
                style={styles.teamNameInput} outlineColor={UI.line} activeOutlineColor={UI.teal}
              />
              <TextInput
                mode="outlined" dense placeholder="Access token (leave blank to keep existing)" value={waMemberToken} onChangeText={setWaMemberToken}
                secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!waSaving}
                style={[styles.teamNameInput, { marginTop: spacing.sm }]} outlineColor={UI.line} activeOutlineColor={UI.teal}
              />
              <View style={styles.modalActions}>
                <Button mode="outlined" textColor={UI.teal} style={styles.cancelButton} onPress={() => setWaMember(null)} disabled={waSaving}>Cancel</Button>
                <Button mode="contained" buttonColor={UI.teal} style={styles.sendButton} onPress={saveMemberWhatsapp} loading={waSaving} disabled={waSaving || waLoading}>Save</Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!permMember} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPermMember(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPermMember(null)}>
          <Pressable style={[styles.teamModal, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{permMember?.name}&apos;s permissions</Text>
              <Pressable accessibilityLabel="Close" hitSlop={10} onPress={() => setPermMember(null)}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
            </View>
            <ScrollView style={styles.permissionsScroll}>
              <View style={styles.teamModalBody}>
                {permissionsLoading ? <ActivityIndicator color={UI.teal} style={{ marginVertical: spacing.lg }} /> : null}
                {permissions.map((permission) => (
                  <Pressable key={permission.key} style={styles.permissionRow} onPress={() => togglePermission(permission.key)}>
                    <Text style={styles.permissionText}>{permission.label}</Text>
                    <Checkbox status={permission.granted ? "checked" : "unchecked"} onPress={() => togglePermission(permission.key)} color={UI.teal} />
                  </Pressable>
                ))}
                <View style={styles.modalActions}>
                  <Button mode="outlined" textColor={UI.teal} style={styles.cancelButton} onPress={() => setPermMember(null)} disabled={permissionsSaving}>Cancel</Button>
                  <Button mode="contained" buttonColor={UI.teal} style={styles.sendButton} onPress={savePermissions} loading={permissionsSaving} disabled={permissionsSaving || permissionsLoading}>Save</Button>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!passwordMember} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPasswordMember(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPasswordMember(null)}>
          <Pressable style={[styles.teamModal, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change {passwordMember?.name}&apos;s Password</Text>
              <Pressable accessibilityLabel="Close" hitSlop={10} onPress={() => setPasswordMember(null)}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
            </View>
            <View style={styles.teamModalBody}>
              <TextInput
                mode="outlined" dense placeholder="New password" value={newPassword} onChangeText={setNewPassword}
                secureTextEntry style={styles.teamNameInput} outlineColor={UI.line} activeOutlineColor={UI.teal}
              />
              <TextInput
                mode="outlined" dense placeholder="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword}
                secureTextEntry style={[styles.teamNameInput, { marginTop: spacing.sm }]} outlineColor={UI.line} activeOutlineColor={UI.teal}
              />
              <View style={styles.modalActions}>
                <Button mode="outlined" textColor={UI.teal} style={styles.cancelButton} onPress={() => setPasswordMember(null)} disabled={passwordSaving}>Cancel</Button>
                <Button mode="contained" buttonColor={UI.teal} style={styles.sendButton} onPress={saveMemberPassword} loading={passwordSaving} disabled={passwordSaving}>Save</Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StatCard({ icon, value, label, tone }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string; tone: "primary" | "success" | "warning" }) {
  const tint = tone === "primary" ? { bg: "#dbeaf6", fg: UI.teal } : tone === "success" ? { bg: UI.greenSoft, fg: UI.green } : { bg: "#fde9c9", fg: "#c2710c" };
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: tint.bg }]}><Ionicons name={icon} size={20} color={tint.fg} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MemberRow({ member, menuOpen, onToggleMenu, onWhatsapp, onPermissions, onChangePassword, onRemove }: {
  member: StaffMember; menuOpen: boolean; onToggleMenu: () => void;
  onWhatsapp: () => void; onPermissions: () => void; onChangePassword: () => void; onRemove: () => void;
}) {
  const initials = member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = member.role === "super_admin" ? "Super Admin" : member.role === "admin" ? "Admin" : "Staff";
  return (
    <View style={[styles.memberRowWrap, menuOpen && styles.memberRowWrapRaised]}>
      <View style={styles.memberRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials || "?"}</Text></View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberMeta} numberOfLines={1}>{member.email}</Text>
          <View style={styles.memberBadges}>
            <View style={[styles.roleBadge, member.role !== "staff" && styles.roleBadgeAdmin]}><Text style={[styles.roleBadgeText, member.role !== "staff" && { color: UI.teal }]}>{roleLabel}</Text></View>
            <View style={[styles.status, member.is_active ? styles.activeStatus : styles.inactiveStatus]}>
              <Text style={[styles.statusText, member.is_active ? styles.activeStatusText : styles.inactiveStatusText]}>{member.is_active ? "Active" : "Inactive"}</Text>
            </View>
            {member.assigned_leads !== undefined ? <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{member.assigned_leads} leads</Text></View> : null}
          </View>
        </View>
        <Pressable onPress={onToggleMenu} hitSlop={10} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Member actions">
          <Ionicons name="ellipsis-vertical" size={18} color={UI.ink} />
        </Pressable>
      </View>
      {menuOpen ? (
        <>
          <Pressable style={styles.memberMenuBackdrop} onPress={onToggleMenu} />
          <View style={styles.memberMenu}>
            <Pressable style={styles.memberMenuItem} onPress={onWhatsapp}>
              <Ionicons name="chatbubble-outline" size={16} color={UI.sub} />
              <Text style={styles.memberMenuText}>WhatsApp number</Text>
            </Pressable>
            <Pressable style={styles.memberMenuItem} onPress={onPermissions}>
              <Ionicons name="shield-checkmark-outline" size={16} color={UI.sub} />
              <Text style={styles.memberMenuText}>Permissions</Text>
            </Pressable>
            <Pressable style={styles.memberMenuItem} onPress={onChangePassword}>
              <Ionicons name="key-outline" size={16} color={UI.sub} />
              <Text style={styles.memberMenuText}>Change password</Text>
            </Pressable>
            <Pressable style={styles.memberMenuItem} onPress={onRemove}>
              <Ionicons name="trash-outline" size={16} color={UI.red} />
              <Text style={[styles.memberMenuText, styles.memberMenuDangerText]}>Remove member</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  content: { padding: spacing.lg, gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  titleCopy: { flex: 1 },
  subtitle: { color: UI.sub, fontSize: 12, lineHeight: 17 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: UI.teal, borderRadius: 999, paddingHorizontal: 16, height: 42 },
  addButtonText: { color: "#ffffff", fontSize: 13, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 16 },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statValue: { color: UI.ink, fontSize: 20, fontFamily: "DMSans_700Bold" },
  statLabel: { color: UI.sub, fontSize: 11 },
  card: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 16, padding: 14 },
  sectionTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sectionTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  newTeam: { color: UI.teal, fontSize: 12, fontFamily: "Inter_700Bold" },
  rowDivider: { height: 1, backgroundColor: UI.line },
  memberRowWrap: { paddingVertical: 12, position: "relative" },
  memberRowWrapRaised: { zIndex: 20, elevation: 20 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#d7e9f5", alignItems: "center", justifyContent: "center" },
  avatarText: { color: UI.teal, fontSize: 13, fontFamily: "Inter_700Bold" },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { color: UI.ink, fontSize: 14, fontFamily: "Inter_700Bold" },
  memberMeta: { color: UI.sub, fontSize: 11, marginTop: 2 },
  memberBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  roleBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#e9eef4" },
  roleBadgeAdmin: { backgroundColor: "#dfe4fb" },
  roleBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#475569" },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  activeStatus: { backgroundColor: UI.greenSoft },
  inactiveStatus: { backgroundColor: "#e9eef4" },
  statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  activeStatusText: { color: UI.green },
  inactiveStatusText: { color: "#475569" },
  menuButton: { padding: 6 },
  memberMenuBackdrop: { position: "absolute", top: -1000, left: -1000, right: -1000, bottom: -1000, zIndex: 20 },
  memberMenu: {
    position: "absolute", top: 44, right: 0, zIndex: 21, elevation: 8,
    backgroundColor: "#ffffff", borderRadius: 14, overflow: "hidden", minWidth: 200, paddingVertical: 4,
    shadowColor: "#0F172A", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  memberMenuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  memberMenuText: { color: UI.ink, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  memberMenuDangerText: { color: UI.red },
  permissionsScroll: { maxHeight: 360 },
  permissionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: UI.line },
  permissionText: { flex: 1, color: UI.ink, fontSize: 13, fontFamily: "Inter_500Medium" },
  empty: { color: UI.sub, paddingVertical: spacing.lg },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  errorText: { color: UI.sub, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.md },
  retry: { marginTop: spacing.sm },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.52)", justifyContent: "center", padding: spacing.lg },
  modalHeader: { minHeight: 62, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: UI.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, borderColor: UI.line, borderRadius: 999, backgroundColor: "#ffffff" },
  sendButton: { flex: 1, borderRadius: 999 },
  teamModal: { width: "100%", maxWidth: 385, alignSelf: "center", backgroundColor: "#ffffff", borderRadius: 20, overflow: "hidden" },
  teamModalBody: { padding: spacing.lg, paddingTop: spacing.md },
  fieldLabel: { color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 7 },
  teamNameInput: { height: 43, backgroundColor: colors.surface },
});
