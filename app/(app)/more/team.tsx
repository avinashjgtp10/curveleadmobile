import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Avatar, Button, Card, Checkbox, Divider, IconButton, Text, TextInput } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import axios from "axios";
import { fetchStaff, StaffMember } from "@/api/staff";
import { colors, radii, spacing } from "@/theme";

const PERMISSIONS = [
  "Delete leads", "Export leads to CSV", "Import leads from CSV", "Bulk update/delete leads",
  "Create, edit and delete campaigns", "Invite, edit and remove team members",
  "Change integration and business settings", "Build automation sequences and rules",
];

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
  const [permMember, setPermMember] = useState<StaffMember | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [passwordMember, setPasswordMember] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  function openWhatsappModal(member: StaffMember) {
    setOpenMenuFor(null);
    setWaMember(member); setWaMemberNumber(member.phone || ""); setWaMemberToken("");
  }

  function saveMemberWhatsapp() {
    Alert.alert("WhatsApp number", `${waMember?.name}'s WhatsApp number will be saved when the staff endpoint is connected.`);
    setWaMember(null);
  }

  function openPermissionsModal(member: StaffMember) {
    setOpenMenuFor(null);
    setPermMember(member); setPermissions(new Set());
  }

  function togglePermission(permission: string) {
    setPermissions((current) => {
      const next = new Set(current);
      next.has(permission) ? next.delete(permission) : next.add(permission);
      return next;
    });
  }

  function savePermissions() {
    Alert.alert("Permissions", `${permMember?.name}'s permissions will be saved when the staff endpoint is connected.`);
    setPermMember(null);
  }

  function openPasswordModal(member: StaffMember) {
    setOpenMenuFor(null);
    setPasswordMember(member); setNewPassword(""); setConfirmPassword("");
  }

  function saveMemberPassword() {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Password too short", "Enter a password with at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords don't match", "Make sure both password fields match.");
      return;
    }
    Alert.alert("Password", `${passwordMember?.name}'s password will be changed when the staff endpoint is connected.`);
    setPasswordMember(null);
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
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Team" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View> : error ? (
        <View style={styles.state}>
          <Ionicons name="people-outline" size={38} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={colors.primary} />}
        >
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>Team</Text>
              <Text style={styles.subtitle}>Manage your team members and lead assignment</Text>
            </View>
            <Button mode="contained" compact icon="plus" onPress={openInvite}>
              Add member
            </Button>
          </View>

          <View style={styles.statsRow}>
            <StatCard icon="people-outline" value={staff.length} label="Members" tone="primary" />
            <StatCard icon="shield-checkmark-outline" value={activeCount} label="Active" tone="success" />
            <StatCard icon="people-circle-outline" value={teamCount} label="Teams" tone="warning" />
          </View>

          <Card mode="outlined" style={styles.card}>
            <Card.Content>
              <View style={styles.sectionTopRow}>
                <SectionHeading icon="people-outline" title="Team members" />
                <Button mode="text" compact icon="plus" onPress={() => { setTeamName(""); setTeamModalOpen(true); }}>New team</Button>
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
                {index < staff.length - 1 ? <Divider /> : null}
              </React.Fragment>) : <Text style={styles.empty}>No team members found.</Text>}
            </Card.Content>
          </Card>
        </ScrollView>
      )}

      <Modal visible={teamModalOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setTeamModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTeamModalOpen(false)}>
          <Pressable style={[styles.teamModal, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Team</Text>
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
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
              />
              <View style={styles.modalActions}>
                <Button mode="outlined" style={styles.cancelButton} onPress={() => setTeamModalOpen(false)}>Cancel</Button>
                <Button mode="contained" style={styles.sendButton} onPress={createTeam}>Create</Button>
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
                mode="outlined" dense placeholder="WhatsApp number" value={waMemberNumber} onChangeText={setWaMemberNumber}
                keyboardType="phone-pad" style={styles.teamNameInput} outlineColor={colors.border} activeOutlineColor={colors.primary}
              />
              <TextInput
                mode="outlined" dense placeholder="Access token (leave blank to keep existing)" value={waMemberToken} onChangeText={setWaMemberToken}
                secureTextEntry style={[styles.teamNameInput, { marginTop: spacing.sm }]} outlineColor={colors.border} activeOutlineColor={colors.primary}
              />
              <View style={styles.modalActions}>
                <Button mode="outlined" style={styles.cancelButton} onPress={() => setWaMember(null)}>Cancel</Button>
                <Button mode="contained" style={styles.sendButton} onPress={saveMemberWhatsapp}>Save</Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!permMember} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPermMember(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPermMember(null)}>
          <Pressable style={[styles.teamModal, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{permMember?.name}&apos;s Permissions</Text>
              <Pressable accessibilityLabel="Close" hitSlop={10} onPress={() => setPermMember(null)}><Ionicons name="close" size={22} color={colors.text} /></Pressable>
            </View>
            <ScrollView style={styles.permissionsScroll}>
              <View style={styles.teamModalBody}>
                {PERMISSIONS.map((permission) => (
                  <Pressable key={permission} style={styles.permissionRow} onPress={() => togglePermission(permission)}>
                    <Text style={styles.permissionText}>{permission}</Text>
                    <Checkbox status={permissions.has(permission) ? "checked" : "unchecked"} onPress={() => togglePermission(permission)} color={colors.primary} />
                  </Pressable>
                ))}
                <View style={styles.modalActions}>
                  <Button mode="outlined" style={styles.cancelButton} onPress={() => setPermMember(null)}>Cancel</Button>
                  <Button mode="contained" style={styles.sendButton} onPress={savePermissions}>Save</Button>
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
                secureTextEntry style={styles.teamNameInput} outlineColor={colors.border} activeOutlineColor={colors.primary}
              />
              <TextInput
                mode="outlined" dense placeholder="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword}
                secureTextEntry style={[styles.teamNameInput, { marginTop: spacing.sm }]} outlineColor={colors.border} activeOutlineColor={colors.primary}
              />
              <View style={styles.modalActions}>
                <Button mode="outlined" style={styles.cancelButton} onPress={() => setPasswordMember(null)}>Cancel</Button>
                <Button mode="contained" style={styles.sendButton} onPress={saveMemberPassword}>Save</Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StatCard({ icon, value, label, tone }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string; tone: "primary" | "success" | "warning" }) {
  const toneStyles = { primary: styles.primaryTone, success: styles.successTone, warning: styles.warningTone };
  return <Card mode="outlined" style={styles.statCard}><Card.Content style={styles.statContent}><View style={[styles.statIcon, toneStyles[tone]]}><Ionicons name={icon} size={20} color={tone === "primary" ? colors.primary : tone === "success" ? colors.success : colors.warning} /></View><View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View></Card.Content></Card>;
}

function SectionHeading({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return <View style={styles.sectionHeading}><Ionicons name={icon} size={19} color={colors.primary} /><Text style={styles.sectionTitle}>{title}</Text></View>;
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
        <Avatar.Text size={42} label={initials || "?"} color={colors.primary} style={styles.avatar} />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberMeta}>{member.email} {member.assigned_leads !== undefined ? `• ${member.assigned_leads} leads` : ""}</Text>
          <View style={styles.memberBadges}>
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{roleLabel}</Text></View>
            <View style={[styles.status, member.is_active ? styles.activeStatus : styles.inactiveStatus]}>
              <Text style={[styles.statusText, member.is_active ? styles.activeStatusText : styles.inactiveStatusText]}>{member.is_active ? "Active" : "Inactive"}</Text>
            </View>
          </View>
        </View>
        <IconButton icon="dots-vertical" size={18} onPress={onToggleMenu} style={styles.menuButton} />
      </View>
      {menuOpen ? (
        <>
          <Pressable style={styles.memberMenuBackdrop} onPress={onToggleMenu} />
          <View style={styles.memberMenu}>
            <Pressable style={styles.memberMenuItem} onPress={onWhatsapp}>
              <Ionicons name="logo-whatsapp" size={16} color={colors.textSecondary} />
              <Text style={styles.memberMenuText}>WhatsApp number</Text>
            </Pressable>
            <Pressable style={styles.memberMenuItem} onPress={onPermissions}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.memberMenuText}>Permissions</Text>
            </Pressable>
            <Pressable style={styles.memberMenuItem} onPress={onChangePassword}>
              <Ionicons name="key-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.memberMenuText}>Change password</Text>
            </Pressable>
            <Pressable style={styles.memberMenuItem} onPress={onRemove}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.memberMenuText, styles.memberMenuDangerText]}>Remove member</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { color: colors.text, fontWeight: "700" },
  content: { padding: spacing.lg, gap: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  titleCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 25, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 3 },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, borderColor: colors.borderSoft, borderRadius: radii.md },
  statContent: { padding: spacing.sm, gap: spacing.sm, alignItems: "center" },
  statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primaryTone: { backgroundColor: colors.primarySoft },
  successTone: { backgroundColor: colors.successSoft },
  warningTone: { backgroundColor: colors.warningSoft },
  statValue: { color: colors.text, fontSize: 21, fontWeight: "800", textAlign: "center" },
  statLabel: { color: colors.textSecondary, fontSize: 11, textAlign: "center" },
  card: { borderColor: colors.borderSoft, borderRadius: radii.lg, backgroundColor: colors.surface },
  sectionTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  description: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: spacing.sm, marginBottom: spacing.md },
  memberRowWrap: { paddingVertical: spacing.sm, position: "relative" },
  memberRowWrapRaised: { zIndex: 20, elevation: 20 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { backgroundColor: colors.primarySoft },
  memberInfo: { flex: 1 },
  memberName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  memberMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  memberBadges: { flexDirection: "row", gap: 6, marginTop: 6 },
  roleBadge: { borderRadius: radii.round, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surfaceMuted },
  roleBadgeText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary },
  status: { borderRadius: radii.round, paddingHorizontal: 8, paddingVertical: 4 },
  activeStatus: { backgroundColor: colors.successSoft },
  inactiveStatus: { backgroundColor: colors.surfaceMuted },
  statusText: { fontSize: 10, fontWeight: "700" },
  activeStatusText: { color: colors.success },
  inactiveStatusText: { color: colors.textSecondary },
  menuButton: { margin: 0 },
  memberMenuBackdrop: { position: "absolute", top: -1000, left: -1000, right: -1000, bottom: -1000, zIndex: 20 },
  memberMenu: {
    position: "absolute", top: 44, right: 0, zIndex: 21, elevation: 8,
    backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden", minWidth: 190,
    shadowColor: "#0F172A", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  memberMenuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  memberMenuText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  memberMenuDangerText: { color: colors.danger },
  permissionsScroll: { maxHeight: 360 },
  permissionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  permissionText: { flex: 1, color: colors.text, fontSize: 13 },
  empty: { color: colors.textSecondary, paddingVertical: spacing.lg },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  errorText: { color: colors.textSecondary, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.md },
  retry: { marginTop: spacing.sm },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.52)", justifyContent: "center", padding: spacing.lg },
  modalHeader: { minHeight: 68, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, borderColor: colors.border },
  sendButton: { flex: 1 },
  teamModal: { width: "100%", maxWidth: 385, alignSelf: "center", backgroundColor: colors.surface, borderRadius: 18, overflow: "hidden" },
  teamModalBody: { padding: spacing.lg, paddingTop: spacing.md },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 7 },
  teamNameInput: { height: 43, backgroundColor: colors.surface },
});
