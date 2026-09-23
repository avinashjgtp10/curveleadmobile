import { GlassBackground, glass } from "@/components/Glass";
import { SvgCalendar } from "@/components/ReferenceIcons";
import { AppNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/api/notifications";
import { colors } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, Appbar, Button } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    + ", "
    + date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function relativeTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function openNotification(item: AppNotification) {
  if (item.lead_id) {
    router.push({
      pathname: "/(app)/leads/[id]",
      params: {
        id: item.lead_id,
        name: item.lead_name || "",
        phone: item.lead_phone || "",
        stage: item.lead_stage || "new",
      },
    });
    return;
  }
  if (item.type === "followup") router.push("/(app)/followups");
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const unreadCount = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      setItems(await fetchNotifications());
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) && typeof loadError.response?.data?.error === "string"
        ? loadError.response.data.error
        : "Could not load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleMarkAllRead() {
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    await markAllNotificationsRead();
  }

  async function handlePress(item: AppNotification) {
    if (!item.read_at) {
      setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, read_at: new Date().toISOString() } : currentItem));
      markNotificationRead(item.id).catch(() => {});
    }
    openNotification(item);
  }

  return (
    <View style={styles.screen}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction color={colors.text} onPress={() => router.back()} />
        <Appbar.Content title="Notifications" titleStyle={styles.headerTitle} />
        {unreadCount ? <Text style={styles.headerBadge}>{unreadCount > 99 ? "99+" : unreadCount}</Text> : null}
      </Appbar.Header>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Notifications</Text>
          <Pressable style={styles.markReadButton} onPress={handleMarkAllRead} disabled={!unreadCount}>
            <Ionicons name="checkmark-done" size={15} color={unreadCount ? colors.primary : colors.textMuted} />
            <Text style={[styles.markReadText, !unreadCount && styles.disabledText]}>Mark all read</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading notifications...</Text>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>Could not load notifications</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 22 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item) => {
              const unread = !item.read_at;
              return (
                <Pressable key={item.id} style={[styles.notificationItem, unread && styles.unreadItem]} onPress={() => handlePress(item)}>
                  <View style={styles.iconWrap}><SvgCalendar color="#f59e0b" /></View>
                  <View style={styles.notificationCopy}>
                    <Text style={styles.notificationTitle} numberOfLines={2}>{item.title}</Text>
                    {item.message ? <Text style={styles.notificationDate}>{formatDate(item.message)}</Text> : null}
                    <Text style={styles.notificationTime}>{relativeTime(item.created_at || item.message)}</Text>
                  </View>
                  {unread ? <View style={styles.unreadDot} /> : null}
                </Pressable>
              );
            })}
            {!items.length ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-outline" size={34} color={colors.textMuted} />
                <Text style={styles.stateTitle}>No notifications yet</Text>
                <Text style={styles.stateText}>Follow-up reminders and lead updates will appear here.</Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { height: 80, paddingHorizontal: 6, backgroundColor: "transparent" },
  headerTitle: { color: colors.text, fontSize: 20, fontFamily: "DMSans_700Bold" },
  headerBadge: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: colors.danger,
    color: "#fff",
    fontSize: 11,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    marginRight: 12,
  },
  panel: { ...glass, flex: 1, marginHorizontal: 16, marginBottom: 12, overflow: "hidden" },
  panelHeader: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  panelTitle: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  markReadButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8 },
  markReadText: { color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  disabledText: { color: colors.textMuted },
  listContent: { flexGrow: 1 },
  notificationItem: {
    minHeight: 98,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  unreadItem: { backgroundColor: "rgba(240,249,255,0.92)" },
  iconWrap: { width: 20, paddingTop: 3, alignItems: "center" },
  notificationCopy: { flex: 1 },
  notificationTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontFamily: "Inter_700Bold" },
  notificationDate: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
  notificationTime: { color: colors.textMuted, fontSize: 11, lineHeight: 16, fontFamily: "Inter_500Medium" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3b82f6", marginTop: 12 },
  state: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", padding: 24 },
  stateTitle: { color: colors.text, fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 10, textAlign: "center" },
  stateText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: "center" },
  retry: { marginTop: 16 },
  emptyState: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", padding: 28 },
});
