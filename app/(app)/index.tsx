import { IconBell } from "@/components/ReferenceIcons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Keyboard, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from "react-native";
import { ActivityIndicator, Button } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { DashboardPeriod, DashboardSummary, fetchDashboard } from "@/api/dashboard";
import { fetchLeads, fetchTodayFollowups, TodayFollowup } from "@/api/leads";
import { facebookSyncLeads } from "@/api/integrations";
import { fetchNotifications, notifyLeadsAdded } from "@/api/notifications";
import { fetchByStaff, StaffPerformance } from "@/api/reports";
import { rateLimitRemainingMs } from "@/api/client";
import { APP_TOOLS, TOOL_TONES } from "@/navigation/appTools";
import { UserRole } from "@/types";
import { setAppBadge } from "@/notifications/push";
import { homeOrigin } from "@/navigation/homeOrigin";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/i18n/LanguageContext";

// What the revenue card can show. Each one reloads the card's figures for that real calendar range.
const PERIOD_OPTIONS: { key: DashboardPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "last_7_days", label: "Last 7 days" },
  { key: "this_month", label: "This month" },
  { key: "last_30_days", label: "Last 30 days" },
];

const LAST_SYNC_KEY = "meta_leads_last_sync";
const META_SYNC_THROTTLE_MS = 2 * 60 * 1000;

type IconName = keyof typeof Ionicons.glyphMap;

const fmt = (value?: number) => Number(value || 0).toLocaleString("en-IN");

function pretty(value?: string) {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Every lead source gets its own icon and colour, so the list can be read at a glance.
type SourceLook = { icon: IconName; color: string; bg: string; label?: string };
const SOURCE_LOOK: Record<string, SourceLook> = {
  meta_ads: { icon: "logo-facebook", color: "#1877f2", bg: "#dbeafe", label: "Meta Ads" },
  instagram: { icon: "logo-instagram", color: "#c026d3", bg: "#fae8ff", label: "Instagram" },
  google_ads: { icon: "logo-google", color: "#ea4335", bg: "#fee2e2", label: "Google Ads" },
  whatsapp: { icon: "logo-whatsapp", color: "#16a34a", bg: "#dcfce7", label: "WhatsApp" },
  manual: { icon: "create", color: "#4f46e5", bg: "#e0e7ff", label: "Manual" },
  referral: { icon: "people", color: "#d97706", bg: "#fef3c7", label: "Referral" },
  website: { icon: "globe", color: "#0891b2", bg: "#cffafe", label: "Website" },
  walkin: { icon: "walk", color: "#7c3aed", bg: "#ede9fe", label: "Walk-in" },
  organic: { icon: "leaf", color: "#15803d", bg: "#dcfce7", label: "Organic" },
  import: { icon: "cloud-upload", color: "#0369a1", bg: "#e0f2fe", label: "Imported" },
  api: { icon: "code-slash", color: "#475569", bg: "#e2e8f0", label: "API" },
};
const DEFAULT_SOURCE_LOOK: SourceLook = { icon: "help-circle", color: "#64748b", bg: "#eef2f6" };

// Sources are stored in different spellings ("WhatsApp", "whatsapp_inbound", "Meta Lead Ads"...),
// so match on what the name contains instead of needing an exact key.
function sourceLook(source: string): SourceLook {
  if (SOURCE_LOOK[source]) return SOURCE_LOOK[source];
  const key = (source || "").toLowerCase().replace(/[^a-z]/g, "");
  if (key.includes("whatsapp")) return SOURCE_LOOK.whatsapp;
  if (key.includes("instagram")) return SOURCE_LOOK.instagram;
  if (key.includes("meta") || key.includes("facebook") || key === "fb") return SOURCE_LOOK.meta_ads;
  if (key.includes("google")) return SOURCE_LOOK.google_ads;
  if (key.includes("manual") || key.includes("typed")) return SOURCE_LOOK.manual;
  if (key.includes("refer")) return SOURCE_LOOK.referral;
  if (key.includes("web") || key.includes("site") || key.includes("form")) return SOURCE_LOOK.website;
  if (key.includes("walk")) return SOURCE_LOOK.walkin;
  if (key.includes("organic")) return SOURCE_LOOK.organic;
  if (key.includes("import") || key.includes("csv") || key.includes("excel") || key.includes("sheet")) return SOURCE_LOOK.import;
  if (key.includes("api") || key.includes("webhook")) return SOURCE_LOOK.api;
  return DEFAULT_SOURCE_LOOK;
}

interface LeadSourceRow { source: string; leads: number; won: number; conversion: number }

// The dashboard's palette: soft grey-green page, white cards, dark green revenue card, blue actions.
const UI = {
  bg: "#f1f4f2", line: "#e4e9e6", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8",
  green: "#0f7b5f", greenDark: "#0f4d3f", greenMid: "#1b6b58", blue: "#2457e6", red: "#d6334f",
};

function QuickTile({ icon, label, bg, color, onPress }: { icon: IconName; label: string; bg: string; color: string; onPress: () => void }) {
  const { t } = useT();
  return (
    <Pressable style={styles.quickTile} onPress={onPress} accessibilityRole="button">
      <View style={[styles.quickIcon, { backgroundColor: bg }]}><Ionicons name={icon} size={17} color={color} /></View>
      <Text style={styles.quickLabel} numberOfLines={2}>{t(label)}</Text>
    </Pressable>
  );
}

// Stage dots follow the stage's name, so the same stage keeps the same colour on every screen.
const STAGE_PALETTE = ["#2563eb", "#0f8a6a", "#7c3aed", "#2f6fd6", "#db2777", "#92400e", "#065f46", "#e11d48", "#f59e0b", "#475569", "#94a3b8"];
function stageColor(name: string, index: number) {
  const key = (name || "").toLowerCase();
  if (key.includes("unqual")) return "#475569";
  if (key.includes("qualif")) return "#7c3aed";
  if (key.includes("contact")) return "#0f8a6a";
  if (key.includes("demo") || key.includes("visit")) return "#2f6fd6";
  if (key.includes("proposal")) return "#db2777";
  if (key.includes("negotiat")) return "#92400e";
  if (key.includes("follow")) return "#f59e0b";
  if (key === "won" || key.includes("enrolled")) return "#065f46";
  if (key.includes("lost")) return "#e11d48";
  if (key === "new") return "#2563eb";
  return STAGE_PALETTE[index % STAGE_PALETTE.length];
}

function PipelineCard({ stages, onPress }: { stages: DashboardSummary["pipeline"]; onPress: () => void }) {
  const { t } = useT();
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  return (
    <View style={styles.cardBlock}>
      <Pressable style={styles.blockHeader} onPress={onPress} accessibilityRole="button">
        <Text style={styles.blockTitle}>{t("Pipeline")}</Text>
        <Text style={styles.blockMeta}>{t("{n} leads", { n: fmt(total) })}</Text>
      </Pressable>
      {stages.length ? (
        <View style={styles.pipelineList}>
          {stages.map((stage, index) => (
            <Pressable key={stage.name} style={styles.pipelineRow} onPress={onPress}>
              <View style={[styles.pipelineDot, { backgroundColor: stageColor(stage.name, index) }]} />
              <Text style={styles.pipelineName} numberOfLines={1}>{pretty(stage.name)}</Text>
              {stage.count > 0 && total > 0 ? (
                <View style={styles.pipelinePill}><Text style={styles.pipelinePillText}>{Math.round((stage.count / total) * 100)}%</Text></View>
              ) : null}
              <Text style={styles.pipelineCount}>{fmt(stage.count)}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>{t("No stage data yet.")}</Text>
      )}
    </View>
  );
}

// Always shown, like the design: red when something needs action, calm when nothing does.
function AttentionCard({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useT();
  const calm = count === 0;
  return (
    <Pressable style={[styles.attentionCard, calm && styles.attentionCalm]} onPress={onPress} accessibilityRole="button">
      <View style={[styles.attentionIcon, calm && { backgroundColor: UI.red }]}><Ionicons name="alert" size={16} color="#fff" /></View>
      <View style={styles.attentionCopy}>
        <Text style={styles.attentionTitle}>{t("{n} follow-ups need attention", { n: fmt(count) })}</Text>
        <Text style={styles.attentionSub}>{calm ? t("You're all caught up") : t("Open the list and take action now")}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#c2475f" />
    </Pressable>
  );
}

function UpcomingFollowupsCard({ followups, onPress }: { followups: TodayFollowup[]; onPress: () => void }) {
  const { t } = useT();
  return (
    <View style={styles.cardBlock}>
      <Pressable style={styles.blockHeader} onPress={onPress}>
        <Text style={styles.blockTitle}>{t("Upcoming Follow Ups")}</Text>
        <Text style={styles.blockMeta}>{followups.length}</Text>
      </Pressable>
      {followups.length ? followups.slice(0, 2).map((followup, index) => {
        const time = new Date(followup.next_followup_at);
        return (
          <Pressable key={followup.id} style={[styles.upcomingRow, index > 0 && styles.upcomingRowBorder]} onPress={onPress}>
            <View style={styles.upcomingCopy}>
              <Text style={styles.upcomingLead} numberOfLines={1}>{followup.lead_name}</Text>
              <Text style={styles.upcomingType}>{pretty(followup.followup_type)} follow-up</Text>
            </View>
            <View style={styles.upcomingTimeWrap}>
              <Ionicons name="call-outline" size={18} color={UI.muted} />
              <Text style={styles.upcomingTime}>{Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</Text>
            </View>
          </Pressable>
        );
      }) : (
        <Text style={styles.emptyText}>{t("No upcoming follow-ups")}</Text>
      )}
    </View>
  );
}

function TodayActivityCard({ data, onPress }: { data: DashboardSummary; onPress: () => void }) {
  const { t } = useT();
  const items = [
    { label: "New leads", value: data.leads_today, dot: "#10b981" },
    { label: "Follow-ups", value: data.followups_today, dot: "#f59e0b" },
    { label: "Demos", value: data.demos_today, dot: "#7c3aed" },
    { label: "Overdue", value: data.overdue_followups, dot: "#e11d48" },
    { label: "Hot Leads", value: data.hot_leads, dot: "#ea580c" },
    { label: "Critical", value: data.critical_followups, dot: "#be123c" },
  ];
  return (
    <View style={styles.plainBlock}>
      <View style={styles.blockHeaderPlain}>
        <Text style={styles.sectionTitle}>{t("Today's activity")}</Text>
        <Pressable onPress={onPress} hitSlop={8}><Text style={styles.viewAll}>{t("View all")}</Text></Pressable>
      </View>
      <View style={styles.activityGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.activityTile}>
            <View style={[styles.activityDot, { backgroundColor: item.dot }]} />
            <Text style={styles.activityValue}>{fmt(item.value)}</Text>
            <Text style={styles.activityLabel} numberOfLines={1}>{t(item.label)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const MEMBER_TINTS = [{ bg: "#dbe8fb", fg: "#2457e6" }, { bg: "#e7dffb", fg: "#6d4fd6" }, { bg: "#fde9c9", fg: "#c2710c" }, { bg: "#d8f0e5", fg: "#0f7b5f" }];


function TeamPerformanceCard({ team, onPress }: { team: StaffPerformance[]; onPress: () => void }) {
  const { t } = useT();
  const leads = team.reduce((sum, member) => sum + (member.total_leads || 0), 0);
  const won = team.reduce((sum, member) => sum + (member.won || 0), 0);
  const lost = team.reduce((sum, member) => sum + (member.lost || 0), 0);
  const ranked = [...team].sort((a, b) => (b.total_leads || 0) - (a.total_leads || 0));
  const summary = [
    { label: "Team leads", value: fmt(leads), bg: "#dbe8fb", tint: "#2457e6" },
    { label: "Won", value: fmt(won), bg: "#d8f0e5", tint: UI.green },
    { label: "Lost", value: fmt(lost), bg: "#fde9c9", tint: "#c2710c" },
  ];
  return (
    <View style={styles.plainBlock}>
      <View style={styles.blockHeaderPlain}>
        <Text style={styles.sectionTitle}>{t("Team performance")} <Text style={styles.blockMeta}>· {t("this month")}</Text></Text>
        <Pressable onPress={onPress} hitSlop={8}><Text style={styles.viewAll}>{t("View all ›")}</Text></Pressable>
      </View>
      <View style={styles.insightsRow}>
        {summary.map((item) => (
          <View key={item.label} style={[styles.teamSummary, { backgroundColor: item.bg }]}>
            <Text style={[styles.teamSummaryLabel, { color: item.tint }]}>{t(item.label)}</Text>
            <Text style={styles.teamSummaryValue}>{item.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.memberGrid}>
        {ranked.slice(0, 4).map((member, index) => {
          const tint = MEMBER_TINTS[index % MEMBER_TINTS.length];
          return (
            <Pressable key={`${member.name}-${index}`} style={styles.memberCard} onPress={onPress}>
              <View style={styles.memberHead}>
                <View style={[styles.memberAvatar, { backgroundColor: tint.bg }]}><Text style={[styles.memberAvatarText, { color: tint.fg }]}>{(member.name?.charAt(0) || "?").toUpperCase()}</Text></View>
                <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                {index === 0 && (member.total_leads || 0) > 0 && ranked.length > 1 ? <View style={styles.topBadge}><Text style={styles.topBadgeText}>{t("Top")}</Text></View> : null}
              </View>
              <View style={styles.memberLeadsRow}>
                <Text style={styles.memberStatLabel}>{t("Leads")}</Text>
                <Text style={styles.memberLeads}>{fmt(member.total_leads)}</Text>
              </View>
              <View style={styles.memberStats}>
                <View><Text style={styles.memberStatLabel}>{t("Won")}</Text><Text style={[styles.memberStatValue, { color: UI.green }]}>{fmt(member.won)}</Text></View>
                <View><Text style={styles.memberStatLabel}>{t("Lost")}</Text><Text style={[styles.memberStatValue, { color: UI.red }]}>{fmt(member.lost)}</Text></View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface GridItem { icon: IconName; label: string; bg: string; iconColor: string; badges?: { text: string; bg: string }[]; href: string; roles?: UserRole[] }

// Every tool of the app, from the shared list that the More menu also uses.
const ALL_TOOLS: GridItem[] = APP_TOOLS.map((tool) => ({
  icon: tool.icon, label: tool.label, href: tool.href, roles: tool.roles,
  bg: TOOL_TONES[tool.tone].bg, iconColor: TOOL_TONES[tool.tone].fg,
  badges: tool.badge ? [{ text: tool.badge, bg: "#7c3aed" }] : undefined,
}));

// Everyday tools shown on the dashboard, in this order. Everything else lives in the More tab.
const DASHBOARD_TOOLS = ["Leads", "Follow-ups", "WhatsApp", "Appointments", "Quotations", "Brochures", "Ads Manager", "Lead Automation", "AI Agent", "Reports", "Team"];
const MORE_TILE: GridItem = { icon: "grid-outline", label: "More", bg: TOOL_TONES.gray.bg, iconColor: TOOL_TONES.gray.fg, href: "/(app)/more" };

function openGridItem(item: GridItem) {
  // Features under More open inside the More tab's stack; remember they came from Home so Back returns here
  // (see more/_layout.tsx) and the More tab isn't left showing this feature.
  homeOrigin.current = item.href.startsWith("/(app)/more/");
  router.push(item.href as never);
}

const SHORT_LABEL: Record<string, string> = { "Lead Automation": "Automation", "Sales Coaching": "Coaching", "WhatsApp Templates": "WA Templates", "Notification Settings": "Alerts" };

function GridTile({ icon, label, bg, iconColor, badges, onPress }: { icon: IconName; label: string; bg: string; iconColor: string; badges?: { text: string; bg: string }[]; onPress: () => void }) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const translated = t(label);
  // Four tiles per row between the 16px page margins and 8px gaps.
  const size = Math.floor((width - 32 - 24) / 4);
  return (
    <Pressable style={[styles.gridTile, { width: size }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={translated}>
      <View style={[styles.gridIconWrap, { backgroundColor: bg }]}>
        {badges?.length ? (
          <View style={styles.startBadgeRow}>
            {badges.map((badge) => (
              <View key={badge.text} style={[styles.startBadge, { backgroundColor: badge.bg }]}>
                <Text style={styles.startBadgeText}>{badge.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.gridLabel} numberOfLines={2}>{translated === label && SHORT_LABEL[label] ? SHORT_LABEL[label] : translated}</Text>
    </Pressable>
  );
}

function ToolGrid({ title, items, onOpen }: { title: string; items: GridItem[]; onOpen: (item: GridItem) => void }) {
  const { t } = useT();
  return (
    <View style={styles.plainBlock}>
      <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>{t(title)}</Text>
      <View style={styles.gridWrap}>
        {items.map((item) => (
          <GridTile key={item.label} icon={item.icon} label={item.label} bg={item.bg} iconColor={item.iconColor} badges={item.badges} onPress={() => onOpen(item)} />
        ))}
      </View>
    </View>
  );
}

// Lead-source bars keep one colour per channel, matching the design.
function sourceBarColor(source: string) {
  const look = sourceLook(source);
  switch (look.label) {
    case "Manual": return "#5b4bd5";
    case "Meta Ads": return "#1d5fc4";
    case "WhatsApp": return "#0f8a6a";
    case "Google Ads": return "#f59e0b";
    case "Walk-in": return "#ec4899";
    default: return look.color;
  }
}

const LEAD_SOURCES_TTL_MS = 5 * 60_000;
let leadSourcesCache: { at: number; rows: LeadSourceRow[] } | null = null;

export default function DashboardScreen() {
  const { t } = useT();
  const { user, tenant } = useAuth();
  // Team, Integrations and Billing are admin-only (the More menu already hides them from staff).
  const canManage = user?.role === "admin" || user?.role === "super_admin";
  // The search offers every tool this person may use (Team, Integrations and Billing are admin-only).
  const visibleTools = ALL_TOOLS.filter((item) => !item.roles || (!!user?.role && item.roles.includes(user.role)));
  const searchItems = visibleTools;
  // The grid shows the everyday tools; the rest are one tap away in More (the last tile).
  const manageItems = [
    ...DASHBOARD_TOOLS.map((label) => visibleTools.find((item) => item.label === label)).filter((item): item is GridItem => !!item),
    MORE_TILE,
  ];
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<DashboardPeriod>("last_7_days");
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodLabel = PERIOD_OPTIONS.find((item) => item.key === period)?.label || "Last 7 days";
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [upcomingFollowups, setUpcomingFollowups] = useState<TodayFollowup[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  // Keep the number on the app icon equal to the unread count the bell shows.
  useEffect(() => { setAppBadge(notificationCount); }, [notificationCount]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  // Counts failed loads, so the auto-retry below runs again even when a retry fails with the same message.
  const [failedLoads, setFailedLoads] = useState(0);

  const [searchOpen, setSearchOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Keeps the last results scrollable above the keyboard, whether or not Android also shrinks the window.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [searchQuery, setSearchQuery] = useState("");

  // The dashboard is the request that matters; the extras below wait for it so opening Home doesn't fire a burst
  // of calls at once (the server answers a burst with "Too many requests").
  const dashboardLoaded = !!data;

  const [leadSources, setLeadSources] = useState<LeadSourceRow[] | null>(leadSourcesCache?.rows ?? null);
  // Bumped on pull-to-refresh so the lead sources are recomputed too (they are a big download, so not on every focus).
  const [sourcesVersion, setSourcesVersion] = useState(0);
  const dashboardReady = !!data;
  useEffect(() => {
    // No dedicated "lead sources" aggregate endpoint exists yet — fetch a large page of
    // real leads and compute the breakdown client-side rather than showing fake numbers.
    // That's a big download, so it waits until the dashboard has painted instead of competing with it.
    if (!dashboardReady) return;
    // Reuse the last result for a few minutes: this is a 500-lead download and every Home visit was repeating it.
    if (leadSourcesCache && Date.now() - leadSourcesCache.at < LEAD_SOURCES_TTL_MS) return;
    let cancelled = false;
    // A short delay lets the dashboard paint first (InteractionManager is deprecated).
    const task = setTimeout(() => {
      fetchLeads({ limit: 500 }).then((page) => {
        if (cancelled) return;
        const bySource = new Map<string, { leads: number; won: number }>();
        for (const lead of page.leads) {
          const key = lead.source || "manual";
          const entry = bySource.get(key) || { leads: 0, won: 0 };
          entry.leads += 1;
          if (["won", "enrolled"].includes(lead.stage?.toLowerCase() || "")) entry.won += 1;
          bySource.set(key, entry);
        }
        const rows = Array.from(bySource.entries())
          .map(([source, { leads, won }]) => ({ source, leads, won, conversion: leads ? (won / leads) * 100 : 0 }))
          .sort((a, b) => b.leads - a.leads);
        leadSourcesCache = { at: Date.now(), rows };
        setLeadSources(rows);
      }).catch(() => { /* keep the last breakdown on a failed refresh */ });
    }, 300);
    return () => { cancelled = true; clearTimeout(task); };
  }, [dashboardReady, sourcesVersion]);

  const [team, setTeam] = useState<StaffPerformance[] | null>(null);
  useEffect(() => {
    // Team figures are an admin view; like the other extras they wait for the dashboard so Home doesn't fire a burst of calls.
    if (!dashboardReady || !canManage) return;
    let cancelled = false;
    const task = setTimeout(() => {
      fetchByStaff("this_month").then((rows) => { if (!cancelled) setTeam(rows); }).catch(() => { if (!cancelled) setTeam(null); });
    }, 600);
    return () => { cancelled = true; clearTimeout(task); };
  }, [dashboardReady, canManage]);

  // `silent` re-fetches in the background (no spinner, no error alert) when returning to the screen.
  const load = useCallback(async (refresh = false, silent = false) => {
    if (!silent) refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [summary, todayFollowups] = await Promise.all([
        fetchDashboard(period),
        fetchTodayFollowups().catch(() => null),
      ]);
      setData(summary);
      // A failed follow-ups request keeps the last list instead of showing "No upcoming follow-ups".
      if (todayFollowups) setUpcomingFollowups(todayFollowups);
      // The focus effect below already fetches notifications on first open; only pull-to-refresh needs it here.
      // On failure the badge keeps its last known count rather than guessing.
      if (refresh) {
        setSourcesVersion((version) => version + 1);
        fetchNotifications()
          .then((latestNotifications) => setNotificationCount(latestNotifications.filter((item) => !item.read_at).length))
          .catch(() => {});
      }
    } catch (loadError) {
      const message = axios.isAxiosError(loadError) && typeof loadError.response?.data?.error === "string"
        ? loadError.response.data.error : "Could not load your dashboard.";
      setError(message);
      setFailedLoads((count) => count + 1);
      // With numbers already on screen the error banner is hidden, so tell the person the refresh didn't work.
      if (refresh) Alert.alert("Couldn't refresh", message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // Coming back to Home (e.g. after completing follow-ups): refresh the numbers quietly so they aren't stale.
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; } // the first load is handled above
    load(false, true);
  }, [load]));

  useFocusEffect(useCallback(() => {
    if (!dashboardLoaded) return;
    let cancelled = false;
    fetchNotifications()
      .then((latestNotifications) => {
        if (!cancelled) setNotificationCount(latestNotifications.filter((item) => !item.read_at).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [dashboardLoaded]));

  // Auto-pull Facebook leads whenever the dashboard is focused, so leads show up without
  // a manual tap on Sync — mirrors web. Throttled so switching tabs back and forth
  // doesn't hammer the Graph API — at most once every 2 minutes.
  useFocusEffect(useCallback(() => {
    if (!dashboardLoaded) return;
    let cancelled = false;
    (async () => {
      const stored = Number((await AsyncStorage.getItem(LAST_SYNC_KEY)) || 0);
      if (Date.now() - stored < META_SYNC_THROTTLE_MS) return;
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      if (cancelled) return;
      try {
        const result = await facebookSyncLeads();
        if (result.created) notifyLeadsAdded(result.created, "Facebook").catch(() => {});
        if (!cancelled && result.created) load();
      } catch { /* silently ignore — e.g. no Facebook page connected for this tenant */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardLoaded]));

  // If the dashboard couldn't load because the server is rate limiting, try again by itself once the wait is over.
  useEffect(() => {
    if (!error || data) return;
    const wait = rateLimitRemainingMs();
    if (!wait) return;
    const timer = setTimeout(() => load(), wait + 500);
    return () => clearTimeout(timer);
  }, [error, failedLoads, data, load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const businessName = tenant?.name || user?.name || "Account";
  // A finished subscription, or a trial whose end date has passed.
  const subscriptionStatus = (tenant?.subscriptionStatus || "").toLowerCase();
  const trialOver = subscriptionStatus === "trial" && !!tenant?.trialEndsAt && new Date(tenant.trialEndsAt).getTime() < Date.now();
  const subscriptionEnded = trialOver || ["expired", "ended", "cancelled", "canceled", "inactive", "past_due", "suspended"].includes(subscriptionStatus);
  const attentionCount = data ? data.critical_followups || data.overdue_followups || 0 : 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.profileRow} accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push("/(app)/more/account")}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{(businessName.charAt(0) || "?").toUpperCase()}</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.greeting}>{t(greeting)}</Text>
            <Text style={styles.profileName} numberOfLines={1}>{businessName}</Text>
          </View>
        </Pressable>
        <View style={{ flex: 1 }} />
        {user ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{t(user.role === "super_admin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Staff")}</Text>
          </View>
        ) : null}
        <Pressable style={styles.notificationButton} accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push("/(app)/notifications")}>
          <IconBell />
          {notificationCount ? (
            <Text style={styles.notificationBadge}>{notificationCount > 99 ? "99+" : notificationCount}</Text>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={UI.green} colors={[UI.green]} />}
        showsVerticalScrollIndicator={false}
      >
        {subscriptionEnded ? (
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionRow}>
              <View style={styles.subscriptionIcon}><Ionicons name="power" size={18} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subscriptionTitle}>{t("Your subscription has ended")}</Text>
                <Text style={styles.subscriptionSub}>{canManage ? t("Renew now to keep using {name}.", { name: businessName }) : t("Ask your admin to renew {name}.", { name: businessName })}</Text>
              </View>
            </View>
            {canManage ? (
              <Pressable style={styles.renewButton} onPress={() => router.push("/(app)/more/billing" as never)} accessibilityRole="button">
                <Text style={styles.renewButtonText}>{t("Renew your subscription")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable style={styles.searchRow} onPress={() => setSearchOpen(true)} accessibilityRole="search">
          <Ionicons name="search-outline" size={17} color={UI.muted} />
          <Text style={styles.searchPlaceholder}>{t("Search tools & settings")}</Text>
        </Pressable>

        {loading && !data ? (
          <View style={styles.state}><ActivityIndicator size="large" color={UI.green} /><Text style={styles.stateText}>{t("Getting your latest numbers…")}</Text></View>
        ) : error && !data ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>{t("Couldn't load dashboard")}</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Button mode="contained" onPress={() => load()} style={styles.retry}>{t("Try again")}</Button>
          </View>
        ) : data ? (
          <>
            <View style={styles.revenueCard}>
              <View style={styles.revenueTop}>
                <Text style={styles.revenueLabel}>{t("Total revenue")}</Text>
                <Pressable style={styles.periodPill} onPress={() => setPeriodOpen(true)} accessibilityRole="button" accessibilityLabel={`Period: ${periodLabel}`}>
                  <Text style={styles.periodPillText}>{t(periodLabel)}</Text>
                  <Ionicons name="chevron-down" size={12} color="#d8f0e5" />
                </Pressable>
              </View>
              <Text style={styles.revenueValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>₹{fmt(data.revenue_in_period)}</Text>
              {data.is_fallback ? (
                <Text style={styles.revenueHint}>Revenue isn't available from the server right now, so it shows 0.</Text>
              ) : data.revenue_in_period === 0 && (data.won_in_period || 0) === 0 ? (
                <Text style={styles.revenueHint}>No leads were won in this period. Mark a lead as Won and add its Expected Value to see revenue.</Text>
              ) : data.revenue_in_period === 0 ? (
                <Text style={styles.revenueHint}>Your won leads have no Expected Value yet. Add one on each lead to count it as revenue.</Text>
              ) : null}
              <View style={styles.revenueTiles}>
                <View style={styles.revenueTile}>
                  <Text style={styles.revenueTileLabel}>{t("Avg. deal")}</Text>
                  <Text style={styles.revenueTileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>₹{fmt(data.avg_deal_value)}</Text>
                </View>
                <View style={styles.revenueTile}>
                  <Text style={styles.revenueTileLabel}>{t("Balance due")}</Text>
                  <Text style={styles.revenueTileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>₹{fmt(data.balance_due_in_period)}</Text>
                </View>
                <View style={[styles.revenueTile, styles.revenueTileYellow]}>
                  <Text style={[styles.revenueTileLabel, { color: "#7a5300" }]}>{t("Converted")}</Text>
                  <Text style={[styles.revenueTileValue, { color: "#3b2a00" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fmt(data.won_in_period)} / {fmt(data.leads_in_period)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.plainBlock}>
              <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>{t("Quick actions")}</Text>
              <View style={styles.quickGrid}>
                <QuickTile icon="person-add-outline" label="Add new lead" bg="#d8f0e5" color={UI.green} onPress={() => router.push({ pathname: "/(app)/leads/new", params: { returnTo: "dashboard" } })} />
                <QuickTile icon="calendar-outline" label="Schedule follow-up" bg="#fde9c9" color="#c2710c" onPress={() => router.push("/(app)/followups")} />
                <QuickTile icon="search-outline" label="Search leads" bg="#dbe8fb" color="#2457e6" onPress={() => router.push("/(app)/leads")} />
                <QuickTile icon="cloud-upload-outline" label="Import contacts" bg="#e7dffb" color="#6d4fd6" onPress={() => router.push("/(app)/leads/import")} />
              </View>
            </View>

            <PipelineCard stages={data.pipeline || []} onPress={() => router.push("/(app)/leads")} />
            {team?.length ? <TeamPerformanceCard team={team} onPress={() => router.push("/(app)/more/reports")} /> : null}
            <AttentionCard count={attentionCount} onPress={() => router.push("/(app)/followups")} />
            <UpcomingFollowupsCard followups={upcomingFollowups} onPress={() => router.push("/(app)/followups")} />
            <TodayActivityCard data={data} onPress={() => router.push("/(app)/leads")} />

            <ToolGrid title="Manage your business" items={manageItems} onOpen={openGridItem} />

            {leadSources?.length ? (
              <View style={styles.cardBlock}>
                <View style={styles.blockHeader}>
                  <Text style={styles.blockTitle}>{t("Lead sources")}</Text>
                  <Pressable onPress={() => router.push("/(app)/leads")} hitSlop={8}><Text style={styles.viewAll}>{t("View all")}</Text></Pressable>
                </View>
                {(() => {
                  const rows = leadSources.slice(0, 5);
                  const max = Math.max(1, ...rows.map((row) => row.leads));
                  return rows.map((row) => (
                    <View key={row.source} style={styles.sourceRow}>
                      <View style={styles.sourceTop}>
                        <Text style={styles.sourceName} numberOfLines={1}>{sourceLook(row.source).label || pretty(row.source)}</Text>
                        <Text style={styles.sourceValue}>{row.leads} · {row.conversion.toFixed(1)}%</Text>
                      </View>
                      <View style={styles.sourceTrack}>
                        <View style={[styles.sourceFill, { width: `${Math.max(3, (row.leads / max) * 100)}%`, backgroundColor: sourceBarColor(row.source) }]} />
                      </View>
                    </View>
                  ));
                })()}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={periodOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPeriodOpen(false)}>
        <Pressable style={styles.periodBackdrop} onPress={() => setPeriodOpen(false)}>
          <Pressable style={styles.periodCard} onPress={() => {}}>
            <Text style={styles.periodTitle}>{t("Show revenue for")}</Text>
            {PERIOD_OPTIONS.map((item) => {
              const active = item.key === period;
              return (
                <Pressable key={item.key} style={[styles.periodItem, active && styles.periodItemActive]} onPress={() => { setPeriod(item.key); setPeriodOpen(false); }} accessibilityRole="button">
                  <Text style={[styles.periodItemText, active && styles.periodItemTextActive]}>{t(item.label)}</Text>
                  {active ? <Ionicons name="checkmark" size={16} color={UI.green} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={searchOpen} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSearchOpen(false)}>
        <View style={[styles.searchScreen, { paddingTop: insets.top + 12 }]}>
          <View style={styles.searchModalRow}>
            <View style={styles.searchModalInputWrap}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                autoFocus value={searchQuery} onChangeText={setSearchQuery}
                placeholder={t("Search tools & settings")} placeholderTextColor={colors.textMuted}
                style={styles.searchModalInput} returnKeyType="search" autoCorrect={false}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={() => { setSearchOpen(false); setSearchQuery(""); }} hitSlop={10}>
              <Text style={styles.searchModalCancel}>Cancel</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={[styles.searchResults, { paddingBottom: 24 + Math.max(keyboardHeight, insets.bottom) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {(searchQuery.trim()
              ? searchItems.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
              : searchItems
            ).map((item) => (
              <Pressable
                key={item.href} style={styles.searchResultRow}
                onPress={() => { setSearchOpen(false); setSearchQuery(""); openGridItem(item); }}
              >
                <View style={[styles.searchResultIcon, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={18} color={item.iconColor} />
                </View>
                <Text style={styles.searchResultLabel}>{t(item.label)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
            {searchQuery.trim() && !searchItems.some((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase())) ? (
              <Text style={styles.searchEmptyText}>No matches for "{searchQuery.trim()}".</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const CARD = { backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 16 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: "55%" },
  profileAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: UI.green, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  greeting: { color: UI.sub, fontSize: 11, fontFamily: "Inter_500Medium" },
  profileName: { color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  roleBadge: { backgroundColor: "#d8f0e5", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginRight: 10 },
  roleBadgeText: { color: UI.green, fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "capitalize" },
  notificationButton: { ...CARD, width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notificationBadge: {
    position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, overflow: "hidden",
    backgroundColor: colors.danger, color: "#fff", fontSize: 9, lineHeight: 18, textAlign: "center", fontFamily: "Inter_700Bold",
  },

  subscriptionCard: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: "#fdecef", borderWidth: 1, borderColor: "#f6c8d0" },
  subscriptionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  subscriptionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: UI.red, alignItems: "center", justifyContent: "center" },
  subscriptionTitle: { color: "#b4233f", fontSize: 13, fontFamily: "Inter_700Bold" },
  subscriptionSub: { color: "#c2475f", fontSize: 11, marginTop: 2 },
  renewButton: { marginTop: 12, height: 40, borderRadius: 10, backgroundColor: UI.blue, alignItems: "center", justifyContent: "center" },
  renewButtonText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },

  searchRow: { ...CARD, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, height: 44, borderRadius: 12 },
  searchPlaceholder: { color: UI.muted, fontSize: 13, fontFamily: "Inter_400Regular" },

  searchScreen: { flex: 1, backgroundColor: colors.background },
  searchModalRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  searchModalInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 12 },
  searchModalInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0, height: 46 },
  searchModalCancel: { color: UI.blue, fontSize: 14, fontFamily: "Inter_700Bold" },
  searchResults: { paddingHorizontal: 16, paddingBottom: 24, gap: 4 },
  searchResultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: UI.line },
  searchResultIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  searchResultLabel: { flex: 1, color: colors.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  searchEmptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 30 },

  state: { minHeight: 350, padding: 30, alignItems: "center", justifyContent: "center" },
  stateTitle: { color: UI.ink, fontSize: 18, fontWeight: "800" },
  stateText: { color: UI.sub, fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 9 },
  retry: { marginTop: 16 },

  revenueCard: { marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 18, backgroundColor: UI.greenDark },
  revenueTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  revenueLabel: { color: "#b8d8cc", fontSize: 11, fontFamily: "Inter_500Medium" },
  periodPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: UI.greenMid, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  periodBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "center", paddingHorizontal: 40 },
  periodCard: { backgroundColor: "#ffffff", borderRadius: 16, paddingVertical: 8 },
  periodTitle: { color: UI.sub, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 16, paddingVertical: 8 },
  periodItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13 },
  periodItemActive: { backgroundColor: "#d8f0e5" },
  periodItemText: { color: UI.ink, fontSize: 14, fontFamily: "Inter_500Medium" },
  periodItemTextActive: { color: UI.green, fontFamily: "Inter_700Bold" },
  periodPillText: { color: "#d8f0e5", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  revenueHint: { color: "#b8d8cc", fontSize: 10, lineHeight: 15, marginTop: -8, marginBottom: 12 },
  revenueValue: { color: "#ffffff", fontSize: 30, fontFamily: "DMSans_700Bold", marginTop: 6, marginBottom: 14 },
  revenueTiles: { flexDirection: "row", gap: 8 },
  revenueTile: { flex: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: UI.greenMid },
  revenueTileYellow: { backgroundColor: "#fbbf24" },
  revenueTileLabel: { color: "#b8d8cc", fontSize: 9, fontFamily: "Inter_600SemiBold" },
  revenueTileValue: { color: "#ffffff", fontSize: 14, fontFamily: "DMSans_700Bold", marginTop: 3 },

  plainBlock: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  blockHeaderPlain: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  viewAll: { color: UI.green, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardBlock: { ...CARD, marginHorizontal: 16, marginBottom: 16, padding: 14 },
  blockHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  blockTitle: { color: UI.ink, fontSize: 14, fontFamily: "DMSans_700Bold" },
  blockMeta: { color: UI.sub, fontSize: 11, fontFamily: "Inter_500Medium" },
  emptyText: { color: UI.muted, fontSize: 12, paddingVertical: 6 },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickTile: { ...CARD, width: "48.7%", borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  quickIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  quickLabel: { flex: 1, color: UI.ink, fontSize: 12, fontFamily: "Inter_600SemiBold" },

  activityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  activityTile: { ...CARD, width: "31.6%", borderRadius: 12, padding: 12 },
  activityDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 8 },
  activityValue: { color: UI.ink, fontSize: 24, fontFamily: "DMSans_700Bold" },
  activityLabel: { color: UI.sub, fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 },

  insightsRow: { flexDirection: "row", gap: 8 },

  pipelineList: { marginTop: 2 },
  pipelineRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  pipelineDot: { width: 8, height: 8, borderRadius: 3 },
  pipelineName: { flex: 1, color: UI.ink, fontSize: 13, fontFamily: "Inter_500Medium" },
  pipelinePill: { backgroundColor: "#d8f0e5", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  pipelinePillText: { color: UI.green, fontSize: 10, fontFamily: "Inter_700Bold" },
  pipelineCount: { minWidth: 22, textAlign: "right", color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold" },

  teamSummary: { flex: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10 },
  teamSummaryLabel: { fontSize: 10, fontFamily: "Inter_700Bold" },
  teamSummaryValue: { color: UI.ink, fontSize: 22, fontFamily: "DMSans_700Bold", marginTop: 4 },
  memberGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  memberCard: { ...CARD, width: "48.7%", borderRadius: 12, padding: 10 },
  memberHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  memberAvatar: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  memberName: { flexShrink: 1, color: UI.ink, fontSize: 12, fontFamily: "Inter_700Bold" },
  topBadge: { backgroundColor: "#fde9c9", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  topBadgeText: { color: "#c2710c", fontSize: 8, fontFamily: "Inter_700Bold" },
  memberLeadsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  memberLeads: { color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold" },
  memberStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  memberStatLabel: { color: UI.muted, fontSize: 9, fontFamily: "Inter_500Medium" },
  memberStatValue: { fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 1 },

  attentionCard: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 16, padding: 12, borderRadius: 14, backgroundColor: "#fdecef", borderWidth: 1, borderColor: "#f6c8d0" },
  attentionCalm: { backgroundColor: "#fdecef" },
  attentionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger },
  attentionCopy: { flex: 1 },
  attentionTitle: { color: "#b4233f", fontSize: 12, fontFamily: "Inter_700Bold" },
  attentionSub: { color: "#c2475f", fontSize: 10, marginTop: 2 },

  upcomingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, paddingVertical: 7 },
  upcomingRowBorder: { borderTopWidth: 1, borderTopColor: UI.line },
  upcomingCopy: { flex: 1, minWidth: 0 },
  upcomingLead: { color: UI.ink, fontSize: 13, fontFamily: "Inter_500Medium" },
  upcomingType: { color: UI.sub, fontSize: 11, marginTop: 2 },
  upcomingTimeWrap: { alignItems: "center", gap: 3, marginLeft: 8 },
  upcomingTime: { color: UI.ink, fontSize: 11, fontFamily: "Inter_700Bold" },

  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridTile: { ...CARD, borderRadius: 12, alignItems: "center", paddingVertical: 10, paddingHorizontal: 4 },
  gridIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  gridLabel: { fontSize: 9, color: UI.ink, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  sourceRow: { paddingVertical: 7 },
  sourceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  sourceName: { flex: 1, color: UI.ink, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sourceValue: { color: UI.sub, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sourceTrack: { height: 5, borderRadius: 3, backgroundColor: "#e6ece9", overflow: "hidden" },
  sourceFill: { height: 5, borderRadius: 3 },


  startBadgeRow: { position: "absolute", top: -10, flexDirection: "row", gap: 4, zIndex: 2 },
  startBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  startBadgeText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },


});
