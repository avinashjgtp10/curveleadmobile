import { IconBell, SvgUserAdd, SvgCalendar, SvgFolder } from "@/components/ReferenceIcons";
import { glass, GradientIcon, GradientNumber } from "@/components/Glass";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from "react-native";
import { ActivityIndicator, Appbar, Button, Card } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { DashboardPeriod, DashboardSummary, fetchDashboard } from "@/api/dashboard";
import { fetchLeads, fetchTodayFollowups, TodayFollowup } from "@/api/leads";
import { facebookSyncLeads, fetchIntegrationSettings, IntegrationSettings } from "@/api/integrations";
import { fetchNotifications } from "@/api/notifications";
import { useAuth } from "@/contexts/AuthContext";

const AI_IMAGE_SAMPLES = [
  { caption: "Product shot", source: require("../../assets/ai-samples/product-shot.png") },
  { caption: "Studio look", source: require("../../assets/ai-samples/studio-look.png") },
  { caption: "Lifestyle", source: require("../../assets/ai-samples/lifestyle.png") },
  { caption: "Fashion", source: require("../../assets/ai-samples/fashion.png") },
  { caption: "Glow", source: require("../../assets/ai-samples/glow.png") },
  { caption: "Salon color", source: require("../../assets/ai-samples/salon-color.png") },
  { caption: "Bridal makeup", source: require("../../assets/ai-samples/bridal-makeup.png") },
  { caption: "Spa facial", source: require("../../assets/ai-samples/spa-facial.png") },
];

const LAST_SYNC_KEY = "meta_leads_last_sync";
const META_SYNC_THROTTLE_MS = 2 * 60 * 1000;

type IconName = keyof typeof Ionicons.glyphMap;

const fmt = (value?: number) => Number(value || 0).toLocaleString("en-IN");

function pretty(value?: string) {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const SOURCE_ICON: Record<string, IconName> = {
  meta_ads: "infinite-outline",
  google_ads: "logo-google",
  whatsapp: "logo-whatsapp",
  referral: "people-outline",
  manual: "create-outline",
  website: "globe-outline",
  walkin: "walk-outline",
};

interface LeadSourceRow { source: string; leads: number; won: number; conversion: number }

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <GradientNumber value={value} tone={label.includes("Converted") ? "violet" : label.includes("New") ? "emerald" : label.includes("Due") ? "amber" : "sky"} />
    </View>
  );
}

function QuickTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { width } = useWindowDimensions();
  return (
    <Card mode="contained" style={[styles.quickTile, { width: (width - 44) / 2 }]} onPress={onPress}>
      <Card.Content style={styles.quickTileContent}>
        <GradientIcon tone={label.includes("Schedule") ? "amber" : label.includes("Search") ? "emerald" : label.includes("Import") ? "violet" : "sky"}>{label.includes("Add") ? <SvgUserAdd color="#fff" /> : label.includes("Schedule") ? <SvgCalendar color="#fff" /> : label.includes("Import") ? <SvgFolder color="#fff" /> : <Ionicons name={icon} size={20} color="#fff" />}</GradientIcon>
        <Text style={styles.quickLabel}>{label}</Text>
      </Card.Content>
    </Card>
  );
}

function LeadsByStageCard({ stages, onPress }: { stages: DashboardSummary["pipeline"]; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 5 : 2;
  const maxCount = Math.max(1, ...stages.map((stage) => stage.count));
  const totalCount = stages.reduce((sum, stage) => sum + stage.count, 0);
  return (
    <View style={styles.stageCard}>
      <Pressable style={styles.stageCardHeader} onPress={onPress} accessibilityRole="button">
        <Text style={styles.stageCardTitle}>Lead Pipeline</Text>
        <Text style={styles.stageViewAll}>View all ›</Text>
      </Pressable>
      {stages.length ? (
        <View style={styles.stageColumns}>
          {stages.map((stage) => (
            <Pressable key={stage.name} style={[styles.stageColumn, { width: `${(100 - (columns - 1) * 3) / columns}%` }]} onPress={onPress}>
              <Text style={styles.stageName} numberOfLines={1}>{pretty(stage.name).toUpperCase()}</Text>
              <Text style={styles.stageCount}>{fmt(stage.count)}</Text>
              <Text style={styles.stagePercent}>{totalCount ? `${Math.round((stage.count / totalCount) * 100)}%` : "0%"}</Text>
              <View style={styles.stageTrack}>
                <View style={[styles.stageFill, { width: `${Math.max(4, (stage.count / maxCount) * 100)}%` }]} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.stageEmpty}>No stage data yet.</Text>
      )}
    </View>
  );
}

function UrgentFollowupsCard({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable style={styles.urgentCard} onPress={onPress} accessibilityRole="button">
      <View style={styles.urgentIcon}><Ionicons name="alert" size={18} color="#fff" /></View>
      <View style={styles.urgentCopy}>
        <Text style={styles.urgentTitle}>{fmt(count)} follow-ups need urgent attention</Text>
        <Text style={styles.urgentSubtitle}>Open the list and take action now</Text>
      </View>
      <Ionicons name="chevron-forward" size={25} color={colors.danger} />
    </Pressable>
  );
}

function UpcomingFollowupsCard({ followups, onPress }: { followups: TodayFollowup[]; onPress: () => void }) {
  return (
    <View style={styles.upcomingCard}>
      <Pressable style={styles.upcomingHeader} onPress={onPress}>
        <Text style={styles.upcomingTitle}>Upcoming Follow Ups</Text>
        <Text style={styles.upcomingCount}>{followups.length}</Text>
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
              <Ionicons name="call-outline" size={18} color={colors.textMuted} />
              <Text style={styles.upcomingTime}>{Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</Text>
            </View>
          </Pressable>
        );
      }) : (
        <Text style={styles.upcomingEmpty}>No upcoming follow-ups</Text>
      )}
    </View>
  );
}

function InsightsCard({ data, onPress }: { data: DashboardSummary; onPress: () => void }) {
  const insights = [
    { label: "Revenue", value: data.total_revenue || data.revenue_in_period },
    { label: "Avg. deal", value: data.avg_deal_value },
    { label: "Balance due", value: data.balance_due_in_period },
  ];
  return (
    <Pressable style={styles.insightsSection} onPress={onPress} accessibilityRole="button">
      <Text style={styles.insightsTitle}>Insights</Text>
      <View style={styles.insightsRow}>
        {insights.map((item) => (
          <View key={item.label} style={styles.insightCard}>
            <Text style={styles.insightLabel}>{item.label}</Text>
            <Text style={styles.insightValue}>₹{fmt(item.value)}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const START_HERE: { icon: IconName; label: string; bg: string; iconColor: string; badges?: { text: string; bg: string }[]; href: string }[] = [
  { icon: "megaphone-outline", label: "Campaigns", bg: colors.successSoft, iconColor: colors.success, href: "/(app)/more/campaigns" },
  { icon: "git-network-outline", label: "Lead Automation", bg: colors.primarySoft, iconColor: colors.primary, badges: [{ text: "NEW", bg: colors.success }], href: "/(app)/more/lead-automation" },
  { icon: "albums-outline", label: "Content", bg: colors.warningSoft, iconColor: colors.warning, badges: [{ text: "NEW", bg: colors.success }], href: "/(app)/content" },
  { icon: "logo-whatsapp", label: "AI Templates", bg: "#ede9fe", iconColor: "#7c3aed", href: "/(app)/more/whatsapp-templates" },
];

function StartHereTile({ icon, label, bg, iconColor, badges, onPress }: { icon: IconName; label: string; bg: string; iconColor: string; badges?: { text: string; bg: string }[]; onPress: () => void }) {
  return (
    <Pressable style={styles.startTile} onPress={onPress}>
      <View style={[styles.startIconWrap, { backgroundColor: bg }]}>
        {badges?.length ? (
          <View style={styles.startBadgeRow}>
            {badges.map((badge) => (
              <View key={badge.text} style={[styles.startBadge, { backgroundColor: badge.bg }]}>
                <Text style={styles.startBadgeText}>{badge.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.startLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

interface GridItem { icon: IconName; label: string; bg: string; iconColor: string; badges?: { text: string; bg: string }[]; href: string }

const TONE = {
  sky: { bg: colors.primarySoft, iconColor: colors.primary },
  violet: { bg: "#ede9fe", iconColor: "#7c3aed" },
  pink: { bg: "#fce7f3", iconColor: "#db2777" },
  amber: { bg: colors.warningSoft, iconColor: colors.warning },
  emerald: { bg: colors.successSoft, iconColor: colors.success },
  indigo: { bg: "#e0e7ff", iconColor: "#4338ca" },
};

const GROW_BUSINESS: GridItem[] = [
  { icon: "people-outline", label: "Leads", ...TONE.sky, href: "/(app)/leads" },
  { icon: "folder-open-outline", label: "Brochures", ...TONE.amber, href: "/(app)/more/brochures" },
  { icon: "megaphone-outline", label: "Campaigns", ...TONE.emerald, href: "/(app)/more/campaigns" },
  { icon: "sparkles", label: "AI Agent", ...TONE.violet, badges: [{ text: "AI", bg: "#7c3aed" }], href: "/(app)/more/ai-tools" },
  { icon: "logo-whatsapp", label: "WhatsApp", ...TONE.emerald, href: "/(app)/more/whatsapp" },
  { icon: "location-outline", label: "GMB", ...TONE.pink, href: "/(app)/more/gmb" },
  { icon: "calendar-outline", label: "Appointments", ...TONE.sky, href: "/(app)/more/appointments" },
];

const MANAGE_BUSINESS: GridItem[] = [
  { icon: "git-network-outline", label: "Lead Automation", ...TONE.sky, href: "/(app)/more/lead-automation" },
  { icon: "people-outline", label: "Team", ...TONE.violet, href: "/(app)/more/team" },
  { icon: "bar-chart-outline", label: "Reports", ...TONE.emerald, href: "/(app)/more/reports" },
  { icon: "school-outline", label: "Sales Coaching", ...TONE.amber, href: "/(app)/more/sales-coaching" },
  { icon: "globe-outline", label: "Market AI", ...TONE.indigo, badges: [{ text: "AI", bg: "#7c3aed" }], href: "/(app)/more/market-ai" },
  { icon: "extension-puzzle-outline", label: "Integrations", ...TONE.pink, href: "/(app)/more/integrations" },
  { icon: "card-outline", label: "Billing", ...TONE.sky, href: "/(app)/more/billing" },
  { icon: "settings-outline", label: "Settings", ...TONE.emerald, href: "/(app)/more/settings" },
  { icon: "help-circle-outline", label: "User Guide", ...TONE.amber, href: "/(app)/more/user-guide" },
];

function GridTile({ icon, label, bg, iconColor, badges, onPress }: { icon: IconName; label: string; bg: string; iconColor: string; badges?: { text: string; bg: string }[]; onPress: () => void }) {
  return (
    <Pressable style={styles.gridTile} onPress={onPress}>
      <View style={[styles.startIconWrap, { backgroundColor: bg }]}>
        {badges?.length ? (
          <View style={styles.startBadgeRow}>
            {badges.map((badge) => (
              <View key={badge.text} style={[styles.startBadge, { backgroundColor: badge.bg }]}>
                <Text style={styles.startBadgeText}>{badge.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.startLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { user, tenant } = useAuth();
  const insets = useSafeAreaInsets();
  const period: DashboardPeriod = "last_7_days";
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [upcomingFollowups, setUpcomingFollowups] = useState<TodayFollowup[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [setupExpanded, setSetupExpanded] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationSettings | null>(null);
  useEffect(() => {
    // Non-admins may not have access to this endpoint — hide the setup banner rather than error out.
    fetchIntegrationSettings().then(setIntegrations).catch(() => setIntegrations(null));
  }, []);

  const [leadSources, setLeadSources] = useState<LeadSourceRow[] | null>(null);
  useEffect(() => {
    // No dedicated "lead sources" aggregate endpoint exists yet — fetch a large page of
    // real leads and compute the breakdown client-side rather than showing fake numbers.
    fetchLeads({ limit: 500 }).then((page) => {
      const bySource = new Map<string, { leads: number; won: number }>();
      for (const lead of page.leads) {
        const key = lead.source || "manual";
        const entry = bySource.get(key) || { leads: 0, won: 0 };
        entry.leads += 1;
        if (lead.stage?.toLowerCase() === "won") entry.won += 1;
        bySource.set(key, entry);
      }
      const rows = Array.from(bySource.entries())
        .map(([source, { leads, won }]) => ({ source, leads, won, conversion: leads ? (won / leads) * 100 : 0 }))
        .sort((a, b) => b.leads - a.leads);
      setLeadSources(rows);
    }).catch(() => setLeadSources(null));
  }, []);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [summary, todayFollowups] = await Promise.all([
        fetchDashboard(period),
        fetchTodayFollowups().catch(() => []),
      ]);
      setData(summary);
      setUpcomingFollowups(todayFollowups);
      fetchNotifications()
        .then((latestNotifications) => setNotificationCount(latestNotifications.filter((item) => !item.read_at).length))
        .catch(() => setNotificationCount(todayFollowups.length));
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) && typeof loadError.response?.data?.error === "string"
        ? loadError.response.data.error : "Could not load your dashboard.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    fetchNotifications()
      .then((latestNotifications) => {
        if (!cancelled) setNotificationCount(latestNotifications.filter((item) => !item.read_at).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []));

  // Auto-pull Facebook leads whenever the dashboard is focused, so leads show up without
  // a manual tap on Sync — mirrors web. Throttled so switching tabs back and forth
  // doesn't hammer the Graph API — at most once every 2 minutes.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const stored = Number((await AsyncStorage.getItem(LAST_SYNC_KEY)) || 0);
      if (Date.now() - stored < META_SYNC_THROTTLE_MS) return;
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      if (cancelled) return;
      try {
        const result = await facebookSyncLeads();
        if (!cancelled && result.created) load();
      } catch { /* silently ignore — e.g. no Facebook page connected for this tenant */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <View style={styles.profileRow}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{(user?.name?.charAt(0) || "?").toUpperCase()}</Text>
          </View>
          <Text style={styles.profileName} numberOfLines={1}>{tenant?.name || user?.name || "Account"}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {user?.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user.role.replace(/_/g, " ")}</Text>
          </View>
        ) : null}
        <Pressable style={styles.notificationButton} onPress={() => router.push("/(app)/notifications")}>
          <IconBell />
          {notificationCount ? (
            <Text style={styles.notificationBadge}>{notificationCount > 99 ? "99+" : notificationCount}</Text>
          ) : null}
        </Pressable>
      </Appbar.Header>

      <Pressable style={styles.searchRow} onPress={() => Alert.alert("Coming soon", "Search across tools and settings isn't available yet.")}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <Text style={styles.searchPlaceholder}>Search tools & settings</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && !data ? (
          <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.stateText}>Getting your latest numbers…</Text></View>
        ) : error && !data ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>Couldn&apos;t load dashboard</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Button mode="contained" onPress={() => load()} style={styles.retry}>Try again</Button>
          </View>
        ) : data ? (
          <>
            <View style={styles.setupCard}>
              <Pressable style={styles.setupHeaderRow} onPress={() => setSetupExpanded((open) => !open)}>
                <Text style={styles.setupHeaderEmoji}>💰</Text>
                <Text style={styles.setupHeadline}>Finish setup to unlock the full CRM experience</Text>
                <Ionicons name={setupExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.text} />
              </Pressable>
              {(() => {
                const steps = [
                  { label: "Connect WhatsApp", done: !!integrations?.whatsapp_configured, href: "/(app)/more/integrations" },
                  { label: "Connect Facebook Ads", done: !!integrations?.meta_configured, href: "/(app)/more/integrations" },
                  { label: "Add your first lead", done: (data.leads_in_period ?? 0) > 0, href: "/(app)/leads/new" },
                  { label: "Explore AI Tools", done: false, href: "/(app)/more/ai-tools" },
                ];
                const allDone = steps.every((step) => step.done);
                return setupExpanded ? (
                  <View>
                    {steps.map((step, idx) => (
                      <Pressable key={step.label} style={styles.setupStepRowVertical} onPress={() => router.push(step.href as never)}>
                        <View style={styles.setupStepIconCol}>
                          <View style={[styles.setupStepDot, step.done && styles.setupStepDotDone]}>
                            <Ionicons name={step.done ? "checkmark" : "alert"} size={12} color="#fff" />
                          </View>
                          <View style={styles.setupStepLineVertical} />
                        </View>
                        <View style={{ flex: 1, paddingBottom: 18 }}>
                          <Text style={styles.setupStepStepLabel}>{`Step ${idx + 1}`}</Text>
                          <Text style={styles.setupStepText}>{step.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                    <View style={styles.setupStepRowVertical}>
                      <View style={styles.setupStepIconCol}><Text style={styles.setupCrown}>👑</Text></View>
                      <Text style={[styles.setupStepText, { marginTop: 4 }]}>{allDone ? "All set!" : "All set"}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.setupStepRow}>
                    {steps.map((step, idx) => (
                      <React.Fragment key={step.label}>
                        <Pressable style={styles.setupStepCol} onPress={() => router.push(step.href as never)}>
                          <View style={[styles.setupStepDot, step.done && styles.setupStepDotDone]}>
                            <Ionicons name={step.done ? "checkmark" : "alert"} size={14} color="#fff" />
                          </View>
                          <Text style={styles.setupStepLabel}>{`Step ${idx + 1}`}</Text>
                        </Pressable>
                        <View style={styles.setupStepLine} />
                      </React.Fragment>
                    ))}
                    <View style={styles.setupStepCol}>
                      <Text style={[styles.setupCrown, !allDone && styles.setupCrownMuted]}>👑</Text>
                      <Text style={styles.setupStepLabel} numberOfLines={1}>All set</Text>
                    </View>
                  </View>
                );
              })()}
            </View>

            <View style={styles.startHereSection}>
              <Text style={styles.startHereTitle}>Start here</Text>
              <Text style={styles.startHereSubtitle}>Your everyday actions</Text>
              <View style={styles.startHereRow}>
                {START_HERE.map((item) => (
                  <StartHereTile key={item.label} icon={item.icon} label={item.label} bg={item.bg} iconColor={item.iconColor} badges={item.badges} onPress={() => router.push(item.href as never)} />
                ))}
              </View>
            </View>

            <View style={styles.aiImagesCard}>
              <View style={styles.aiImagesHeaderRow}>
                <View style={styles.aiImagesIconWrap}>
                  <View style={styles.aiImagesBadge}><Text style={styles.aiImagesBadgeText}>AI</Text></View>
                  <Ionicons name="hardware-chip-outline" size={22} color="#7c3aed" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiImagesTitle}>AI Images</Text>
                  <Text style={styles.aiImagesSubtitle}>Create high-quality product or fashion photoshoot</Text>
                </View>
                <Pressable onPress={() => router.push("/(app)/more/ai-tools")}>
                  <Text style={styles.aiImagesCreate}>Create</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiImagesRow}>
                {AI_IMAGE_SAMPLES.map((item) => (
                  <ImageBackground key={item.caption} source={item.source} style={styles.aiImageThumb} imageStyle={{ borderRadius: 14 }}>
                    <View style={styles.aiImageCaptionWrap}>
                      <Text style={styles.aiImageCaption} numberOfLines={1}>{item.caption}</Text>
                    </View>
                  </ImageBackground>
                ))}
              </ScrollView>
            </View>

            <View style={styles.statGrid}>
              <StatTile label="Total Leads" value={fmt(data.leads_in_period)} />
              <StatTile label="Total Converted" value={fmt(data.won_in_period)} />
              <StatTile label="New Leads Today" value={fmt(data.leads_today)} />
              <StatTile label="Follow-ups Due Today" value={fmt(data.followups_today)} />
            </View>

            <View style={styles.activityCard}>
              <View style={styles.activityHeaderRow}>
                <View style={styles.activityIconWrap}><Ionicons name="calendar-outline" size={18} color={colors.primary} /></View>
                <Text style={styles.activityTitle}>Today's Activity</Text>
                <Pressable style={{ marginLeft: "auto" }} onPress={() => router.push("/(app)/leads")}>
                  <Text style={styles.activityViewAll}>View all ›</Text>
                </Pressable>
              </View>
              <View style={styles.activityGrid}>
                {[
                  { icon: "person-add-outline", label: "New Leads", value: data.leads_today, tone: TONE.sky },
                  { icon: "calendar-outline", label: "Follow-ups", value: data.followups_today, tone: TONE.emerald },
                  { icon: "videocam-outline", label: "Demos", value: data.demos_today, tone: TONE.violet },
                  { icon: "alert-circle-outline", label: "Overdue", value: data.overdue_followups, tone: TONE.pink },
                  { icon: "flame-outline", label: "Hot Leads", value: data.hot_leads, tone: TONE.amber },
                  { icon: "warning-outline", label: "Critical Follow-ups", value: data.critical_followups, tone: TONE.pink },
                ].map((item) => (
                  <View key={item.label} style={styles.activityTile}>
                    <View style={styles.activityTileTop}>
                      <View style={[styles.activityTileIcon, { backgroundColor: item.tone.bg }]}>
                        <Ionicons name={item.icon as IconName} size={14} color={item.tone.iconColor} />
                      </View>
                      <Text style={styles.activityTileLabel} numberOfLines={1}>{item.label}</Text>
                    </View>
                    <Text style={styles.activityTileValue}>{fmt(item.value)}</Text>
                  </View>
                ))}
              </View>
            </View>

            {leadSources?.length ? (
              <View style={styles.sourcesCard}>
                <View style={styles.sourcesHeaderRow}>
                  <Ionicons name="pie-chart-outline" size={16} color={colors.text} />
                  <Text style={styles.sourcesTitle}>Lead Sources</Text>
                  <Pressable style={{ marginLeft: "auto" }} onPress={() => router.push("/(app)/leads")}>
                    <Text style={styles.sourcesViewAll}>View all ›</Text>
                  </Pressable>
                </View>
                <View style={styles.sourcesColumnHeader}>
                  <Text style={[styles.sourcesColumnLabel, { flex: 1 }]}>SOURCE</Text>
                  <Text style={[styles.sourcesColumnLabel, { width: 44, textAlign: "right" }]}>LEADS</Text>
                  <Text style={[styles.sourcesColumnLabel, { width: 44, textAlign: "right" }]}>WON</Text>
                  <Text style={[styles.sourcesColumnLabel, { width: 70, textAlign: "right" }]}>CONV.</Text>
                </View>
                {leadSources.slice(0, 5).map((row) => (
                  <View key={row.source} style={styles.sourceRow}>
                    <View style={styles.sourceNameCell}>
                      <Ionicons name={SOURCE_ICON[row.source] || "help-circle-outline"} size={15} color={colors.textSecondary} />
                      <Text style={styles.sourceNameText} numberOfLines={1}>{pretty(row.source)}</Text>
                    </View>
                    <Text style={[styles.sourceValueText, { width: 44, textAlign: "right" }]}>{row.leads}</Text>
                    <Text style={[styles.sourceValueText, styles.sourceWonText, { width: 44, textAlign: "right" }]}>{row.won}</Text>
                    <View style={{ width: 70, alignItems: "flex-end" }}>
                      <View style={[styles.sourceConvBadge, row.conversion >= 10 && styles.sourceConvBadgeHigh]}>
                        <Text style={[styles.sourceConvText, row.conversion >= 10 && styles.sourceConvTextHigh]}>{row.conversion.toFixed(1)}%</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.startHereSection}>
              <Text style={styles.startHereTitle}>Grow your business</Text>
              <Text style={styles.startHereSubtitle}>Reach, engage and convert customers</Text>
              <View style={styles.gridWrap}>
                {GROW_BUSINESS.map((item) => (
                  <GridTile key={item.label} icon={item.icon} label={item.label} bg={item.bg} iconColor={item.iconColor} badges={item.badges} onPress={() => router.push(item.href as never)} />
                ))}
              </View>
            </View>

            <View style={styles.startHereSection}>
              <Text style={styles.startHereTitle}>Manage your business</Text>
              <Text style={styles.startHereSubtitle}>People, data and workspace tools</Text>
              <View style={styles.gridWrap}>
                {MANAGE_BUSINESS.map((item) => (
                  <GridTile key={item.label} icon={item.icon} label={item.label} bg={item.bg} iconColor={item.iconColor} badges={item.badges} onPress={() => router.push(item.href as never)} />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <View style={styles.quickGrid}>
                <QuickTile icon="add-circle-outline" label="Add New Lead" onPress={() => router.push({ pathname: "/(app)/leads/new", params: { returnTo: "dashboard" } })} />
                <QuickTile icon="calendar-outline" label="Schedule Follow-up" onPress={() => router.push("/(app)/followups")} />
                <QuickTile icon="search-outline" label="Search Leads" onPress={() => router.push("/(app)/leads")} />
                <QuickTile icon="download-outline" label="Import Contacts" onPress={() => router.push("/(app)/leads/import")} />
              </View>
            </View>

            <LeadsByStageCard stages={data.pipeline || []} onPress={() => router.push("/(app)/leads")} />
            <UrgentFollowupsCard count={data.critical_followups || data.overdue_followups || 0} onPress={() => router.push("/(app)/followups")} />
            <UpcomingFollowupsCard followups={upcomingFollowups} onPress={() => router.push("/(app)/followups")} />
            <InsightsCard data={data} onPress={() => router.push("/(app)/more/reports")} />

          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { height: 80, paddingHorizontal: 12, backgroundColor: "transparent" },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "45%" },
  profileAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  profileName: { color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold", flexShrink: 1 },
  roleBadge: { backgroundColor: colors.surfaceMuted, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  roleBadgeText: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  notificationButton: {
    ...glass,
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  notificationBadge: {
    position: "absolute",
    top: 3,
    right: 3,
    minWidth: 17,
    height: 15,
    paddingHorizontal: 4,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.danger,
    color: "#fff",
    fontSize: 9,
    lineHeight: 15,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
  },
  searchRow: { ...glass, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 16, paddingVertical: 12 },
  searchPlaceholder: { color: colors.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },

  state: { minHeight: 350, padding: 30, alignItems: "center", justifyContent: "center" },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stateText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 9 },
  retry: { marginTop: 16 },

  setupCard: { backgroundColor: "#e7f9ef", borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 16 },
  setupHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 20 },
  setupHeaderEmoji: { fontSize: 20 },
  setupHeadline: { flex: 1, color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  setupStepRow: { flexDirection: "row", alignItems: "flex-start" },
  setupStepCol: { alignItems: "center", gap: 6, width: 44 },
  setupStepDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" },
  setupStepDotDone: { backgroundColor: colors.success },
  setupStepLine: { flex: 1, height: 0, borderTopWidth: 2, borderStyle: "dashed", borderColor: "rgba(217,119,6,0.35)", marginTop: 16, marginHorizontal: 2 },
  setupStepLabel: { color: colors.text, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  setupCrown: { fontSize: 26 },
  setupCrownMuted: { opacity: 0.35 },

  setupStepRowVertical: { flexDirection: "row" },
  setupStepIconCol: { alignItems: "center", width: 34 },
  setupStepLineVertical: { flex: 1, width: 2, backgroundColor: "rgba(217,119,6,0.25)", marginTop: 2 },
  setupStepStepLabel: { color: colors.warning, fontSize: 11, fontFamily: "Inter_700Bold" },
  setupStepText: { color: colors.text, fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginHorizontal: 16, marginBottom: 16 },
  statTile: { ...glass, width: "48%", flexGrow: 1, padding: 16 },
  statLabel: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium" },

  activityCard: { ...glass, marginHorizontal: 16, marginBottom: 16, padding: 16 },
  activityHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  activityIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  activityTitle: { color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  activityViewAll: { color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  activityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  activityTile: { width: "31%", flexGrow: 1, backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 10 },
  activityTileTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  activityTileIcon: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  activityTileLabel: { flex: 1, color: colors.textSecondary, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  activityTileValue: { color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" },

  sourcesCard: { ...glass, marginHorizontal: 16, marginBottom: 16, padding: 16 },
  sourcesHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  sourcesTitle: { color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  sourcesViewAll: { color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sourcesColumnHeader: { flexDirection: "row", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "rgba(224,242,254,0.6)" },
  sourcesColumnLabel: { color: colors.textMuted, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  sourceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  sourceNameCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  sourceNameText: { flex: 1, color: colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sourceValueText: { color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sourceWonText: { color: colors.success },
  sourceConvBadge: { backgroundColor: colors.surfaceMuted, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  sourceConvBadgeHigh: { backgroundColor: colors.warningSoft },
  sourceConvText: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_700Bold" },
  sourceConvTextHigh: { color: colors.warning },

  aiImagesCard: { ...glass, marginHorizontal: 16, marginBottom: 16, padding: 16 },
  aiImagesHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  aiImagesIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" },
  aiImagesBadge: { position: "absolute", top: -6, right: -6, backgroundColor: "#7c3aed", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, zIndex: 2 },
  aiImagesBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  aiImagesTitle: { color: colors.text, fontSize: 13, fontFamily: "DMSans_700Bold" },
  aiImagesSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  aiImagesCreate: { color: colors.success, fontSize: 13, fontFamily: "Inter_700Bold" },
  aiImagesRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  aiImageThumb: { width: 96, height: 128, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  aiImageCaptionWrap: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.35)", paddingVertical: 6, paddingHorizontal: 6 },
  aiImageCaption: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  startHereSection: { ...glass, marginHorizontal: 16, marginBottom: 16, padding: 16 },
  startHereTitle: { color: colors.text, fontSize: 14, fontFamily: "DMSans_700Bold" },
  startHereSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 16 },
  startHereRow: { flexDirection: "row", justifyContent: "space-between" },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", rowGap: 18 },
  gridTile: { width: "25%", alignItems: "center" },

  settingsList: { borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  settingsIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  settingsRowTitle: { color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" },
  settingsRowSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  settingsDivider: { height: 1, backgroundColor: "rgba(224,242,254,0.6)" },
  startTile: { flex: 1, alignItems: "center" },
  startIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  startBadgeRow: { position: "absolute", top: -10, flexDirection: "row", gap: 4, zIndex: 2 },
  startBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  startBadgeText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },
  startLabel: { fontSize: 11, color: colors.text, fontFamily: "Inter_600SemiBold", textAlign: "center" },


  section: { marginTop: 16, marginBottom: 16, paddingHorizontal: 16 },
  sectionTitle: { color: "#334155", fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 12 },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickTile: { ...glass, width: "48%", flexGrow: 1 },
  quickTileContent: { padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  quickLabel: { flex: 1, color: "#334155", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  stageCard: { ...glass, marginHorizontal: 16, marginBottom: 10, padding: 10, backgroundColor: "rgba(255,255,255,0.78)" },
  stageCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  stageCardTitle: { color: colors.text, fontSize: 14, fontFamily: "DMSans_700Bold" },
  stageViewAll: { color: colors.primary, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  stageColumns: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stageColumn: { minWidth: 0, padding: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: "rgba(255,255,255,0.55)" },
  stageName: { color: colors.textMuted, fontSize: 9, fontFamily: "Inter_700Bold", textAlign: "center" },
  stageCount: { color: colors.text, fontSize: 18, fontFamily: "DMSans_700Bold", textAlign: "center", marginTop: 5 },
  stagePercent: { color: colors.textMuted, fontSize: 9, textAlign: "center", marginTop: 1, marginBottom: 6 },
  stageTrack: { height: 5, borderRadius: 3, backgroundColor: "#dff2fb", overflow: "hidden" },
  stageFill: { height: "100%", minWidth: 4, borderRadius: 5, backgroundColor: colors.primary },
  stageEmpty: { color: colors.textMuted, fontSize: 12, paddingVertical: 10 },
  urgentCard: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: "#fcecef", borderWidth: 1, borderColor: "#f0b8c4" },
  urgentIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger },
  urgentCopy: { flex: 1 },
  urgentTitle: { color: "#c81e45", fontSize: 13, fontFamily: "Inter_700Bold" },
  urgentSubtitle: { color: "#c24561", fontSize: 11, marginTop: 3 },
  upcomingCard: { ...glass, marginHorizontal: 16, marginBottom: 10, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.72)" },
  upcomingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 9 },
  upcomingTitle: { color: colors.text, fontSize: 14, fontFamily: "DMSans_700Bold" },
  upcomingCount: { color: colors.textSecondary, fontSize: 15, fontFamily: "Inter_700Bold" },
  upcomingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 54, paddingHorizontal: 12, paddingVertical: 7 },
  upcomingRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  upcomingCopy: { flex: 1, minWidth: 0 },
  upcomingLead: { color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" },
  upcomingType: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  upcomingTimeWrap: { alignItems: "center", gap: 3, marginLeft: 8 },
  upcomingTime: { color: colors.text, fontSize: 11, fontFamily: "Inter_700Bold" },
  upcomingEmpty: { color: colors.textMuted, fontSize: 11, paddingHorizontal: 12, paddingBottom: 10 },
  insightsSection: { marginHorizontal: 16, marginBottom: 10 },
  insightsTitle: { color: colors.text, fontSize: 14, fontFamily: "DMSans_700Bold", marginBottom: 8 },
  insightsRow: { flexDirection: "row", gap: 8 },
  insightCard: { ...glass, flex: 1, minHeight: 70, padding: 10, backgroundColor: "rgba(255,255,255,0.78)" },
  insightLabel: { color: colors.textSecondary, fontSize: 10, fontFamily: "Inter_700Bold" },
  insightValue: { color: colors.text, fontSize: 17, fontFamily: "DMSans_700Bold", marginTop: 8 },
});
