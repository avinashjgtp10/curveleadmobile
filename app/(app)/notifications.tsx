import { SvgCalendar } from "@/components/ReferenceIcons";
import { AppNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/api/notifications";
import { useT } from "@/i18n/LanguageContext";
import { navigateToNotification } from "@/notifications/navigateToNotification";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, Button } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Translate = (text: string, vars?: Record<string, string | number>) => string;

// Notification text is stored in English with names/counts baked in, so match the known
// patterns and translate them with the value pulled back out. Anything else stays as sent.
const TITLE_PATTERNS: [RegExp, string, "name" | "n"][] = [
  [/^Follow-up overdue - (.+)$/, "Follow-up overdue - {name}", "name"],
  [/^New lead created - (.+)$/, "New lead created - {name}", "name"],
  [/^Lead deleted - (.+)$/, "Lead deleted - {name}", "name"],
  [/^WhatsApp message sent - (.+)$/, "WhatsApp message sent - {name}", "name"],
  [/^Source: (.+)$/, "Source: {name}", "name"],
  [/^(\d+) new leads? added$/, "{n} new leads added", "n"],
  [/^(\d+) leads deleted$/, "{n} leads deleted", "n"],
];

function translateText(text: string, t: Translate) {
  const exact = t(text);
  if (exact !== text) return exact;
  for (const [pattern, key, variable] of TITLE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return t(key, { [variable]: match[1] });
  }
  return text;
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
    + ", "
    + date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function relativeTime(value: string | undefined, t: Translate) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return t("Just now");
  if (minutes < 60) return t("{n}m ago", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("{n}h ago", { n: hours });
  return t("{n}d ago", { n: Math.floor(hours / 24) });
}

function openNotification(item: AppNotification) {
  if (navigateToNotification(item)) return;
  // No lead id to open — send lead-related notifications to the list instead of doing nothing.
  if (item.type?.startsWith("lead") || /lead/i.test(item.title)) router.push("/(app)/leads");
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useT();
  const locale = language === "hi" ? "hi-IN" : "en-IN";
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
        : t("Could not load notifications."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // The screen is a hidden tab, so it stays mounted after the first visit — reload on every focus
  // or leads added since then (and new pushes) never show up.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    load(!firstFocus.current);
    firstFocus.current = false;
  }, [load]));

  async function handleMarkAllRead() {
    const previous = items;
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    try {
      await markAllNotificationsRead(items.map((item) => item.id));
    } catch {
      setItems(previous);
      setError("");
    }
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
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel={t("Back")}>
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("Notifications")}</Text>
        <Pressable style={styles.headerButton} hitSlop={8} onPress={() => router.push("/(app)/more/notification-settings" as never)} accessibilityRole="button" accessibilityLabel={t("Notification settings")}>
          <Ionicons name="settings-outline" size={21} color={UI.ink} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={UI.teal} />
          <Text style={styles.stateText}>{t("Loading notifications...")}</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>{t("Could not load notifications")}</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Button mode="contained" onPress={() => load()} style={styles.retry} buttonColor={UI.teal}>{t("Try again")}</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={UI.teal} colors={[UI.teal]} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <Text style={styles.subtitle}>{unreadCount ? t("{n} unread", { n: unreadCount }) : t("You're all caught up")}</Text>
            <Pressable style={styles.markReadButton} onPress={handleMarkAllRead} disabled={!unreadCount}>
              <Ionicons name="checkmark-done" size={15} color={unreadCount ? UI.teal : UI.muted} />
              <Text style={[styles.markReadText, !unreadCount && styles.disabledText]}>{t("Mark all read")}</Text>
            </Pressable>
          </View>

          {items.map((item) => {
            const unread = !item.read_at;
            return (
              <Pressable key={item.id} style={[styles.card, unread && styles.cardUnread]} onPress={() => handlePress(item)}>
                <View style={styles.iconWrap}><SvgCalendar color="#f59e0b" /></View>
                <View style={styles.notificationCopy}>
                  <Text style={styles.notificationTitle} numberOfLines={2}>{translateText(item.title, t)}</Text>
                  {item.message ? <Text style={styles.notificationDate}>{formatDate(item.message, locale) === item.message ? translateText(item.message, t) : formatDate(item.message, locale)}</Text> : null}
                  <Text style={styles.notificationTime}>{relativeTime(item.created_at || item.message, t)}</Text>
                </View>
                {unread ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          })}
          {!items.length ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-outline" size={34} color={UI.muted} />
              <Text style={styles.stateTitle}>{t("No notifications yet")}</Text>
              <Text style={styles.stateText}>{t("Follow-up reminders and lead updates will appear here.")}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// Same palette as Reports: pale blue page, white cards with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7" };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  content: { padding: 16, flexGrow: 1 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  subtitle: { flex: 1, color: UI.sub, fontSize: 13 },
  markReadButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff" },
  markReadText: { color: UI.teal, fontSize: 12, fontWeight: "700" },
  disabledText: { color: UI.muted },
  card: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, marginBottom: 10, backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line },
  cardUnread: { borderColor: UI.teal, backgroundColor: "#f7fbfe" },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#fff4e0", alignItems: "center", justifyContent: "center" },
  notificationCopy: { flex: 1 },
  notificationTitle: { color: UI.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  notificationDate: { color: UI.sub, fontSize: 13, lineHeight: 18, marginTop: 2 },
  notificationTime: { color: UI.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: UI.teal, marginTop: 6 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  stateTitle: { color: UI.ink, fontSize: 16, fontWeight: "700", marginTop: 10, textAlign: "center" },
  stateText: { color: UI.sub, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: "center" },
  retry: { marginTop: 16 },
  emptyState: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", padding: 28 },
});
