import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import axios from "axios";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { fetchLeads, LeadListItem } from "@/api/leads";
import { Brochure, fetchBrochures } from "@/api/brochures";
import {
  CampaignPerformance, ConversionSummary, fetchByCampaign, fetchByStaff, fetchBySource, fetchConversion,
  fetchFunnel, fetchReportMessages, fetchTimeInStage, FunnelLeak, FunnelStage, ReportMessage, ReportPeriod,
  SourceBreakdown, StaffPerformance, TimeInStage,
} from "@/api/reports";


// The add forms' palette: pale blue page, white cards with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", track: "#e1eef7", won: "#0f7b5f", red: "#d6334f", redSoft: "#fdecef" };
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "funnel", label: "Funnel" },
  { id: "team", label: "Team" },
  { id: "campaigns", label: "Campaigns" },
  { id: "leads", label: "Lead Detail" },
  { id: "brochures", label: "Brochure Detail" },
  { id: "messages", label: "Messages" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
];

const SOURCE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function fmtDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function money(value?: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function fmtSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pretty(value?: string) {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// The funnel: each stage's count and its share of the first stage, with the won stage in green.
function FunnelBars({ stages }: { stages: FunnelStage[] }) {
  const first = Math.max(1, Number(stages[0]?.reached_count) || 0);
  return (
    <View style={{ gap: 14 }}>
      {stages.map((stage, index) => {
        const count = Number(stage.reached_count) || 0;
        const pct = (count / first) * 100;
        const won = /won|enrol/i.test(stage.name || "") || (index === stages.length - 1 && /won/i.test(stage.name || ""));
        return (
          <View key={stage.id || index}>
            <View style={styles.barRowLabel}>
              <Text style={styles.barLabel} numberOfLines={1}>{stage.name}</Text>
              <Text style={styles.barValue}>{count.toLocaleString("en-IN")} · {pct >= 99.95 || pct === 0 ? Math.round(pct) : pct.toFixed(pct < 10 ? 1 : 0)}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(3, pct)}%`, backgroundColor: won ? UI.won : UI.teal }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function EmptyState({ message = "No data for this period." }: { message?: string }) {
  return <Text style={styles.emptyText}>{message}</Text>;
}

function StatCard({ icon, label, value, tone, toneSoft }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; tone: string; toneSoft: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: toneSoft }]}><Ionicons name={icon} size={18} color={tone} /></View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function PeriodDropdown({ value, onChange }: { value: ReportPeriod; onChange: (period: ReportPeriod) => void }) {
  const [open, setOpen] = useState(false);
  const selected = PERIODS.find((p) => p.value === value);
  return (
    <View style={styles.periodWrap}>
      <Pressable style={styles.periodField} onPress={() => setOpen((v) => !v)}>
        <Ionicons name="calendar-outline" size={13} color={UI.sub} />
        <Text style={styles.periodFieldText}>{selected?.label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={13} color={UI.sub} />
      </Pressable>
      {open ? (
        <View style={styles.periodPanel}>
          {PERIODS.map((p) => (
            <Pressable key={p.value} style={styles.periodItem} onPress={() => { onChange(p.value); setOpen(false); }}>
              <Text style={[styles.periodItemText, p.value === value && styles.periodItemTextSelected]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Simple horizontal bar list — stands in for the web app's chart library, which isn't part of this app's dependencies.
function BarList({ items, valueColor }: { items: { label: string; value: number }[]; valueColor?: string }) {
  const safeItems = items.map((item) => ({ label: item.label || "—", value: Number(item.value) || 0 }));
  const max = Math.max(1, ...safeItems.map((item) => item.value));
  return (
    <View style={{ gap: 12 }}>
      {safeItems.map((item, index) => (
        <View key={`${item.label}-${index}`}>
          <View style={styles.barRowLabel}>
            <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
            <Text style={[styles.barValue, valueColor ? { color: valueColor } : null]}>{item.value.toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max(4, (item.value / max) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

type ColumnSize = { width: number; flex?: undefined } | { width?: undefined; flex: number };

function TableHeader({ columns }: { columns: ({ label: string; align?: "left" | "right" } & ColumnSize)[] }) {
  return (
    <View style={styles.tableRow}>
      {columns.map((col) => (
        <Text
          key={col.label}
          style={[styles.tableHeadCell, col.flex ? { flex: col.flex } : { width: col.width }, { textAlign: col.align || "left" }]}
        >
          {col.label}
        </Text>
      ))}
    </View>
  );
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>("overview");
  const [period, setPeriod] = useState<ReportPeriod>("this_month");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conversion, setConversion] = useState<ConversionSummary | null>(null);
  const [bySource, setBySource] = useState<SourceBreakdown[]>([]);
  const [byStaff, setByStaff] = useState<StaffPerformance[]>([]);
  const [byCampaign, setByCampaign] = useState<CampaignPerformance[]>([]);

  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [funnelLeaks, setFunnelLeaks] = useState<FunnelLeak[]>([]);
  const [timeInStage, setTimeInStage] = useState<TimeInStage[]>([]);

  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadPage, setLeadPage] = useState(1);

  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messageSearch, setMessageSearch] = useState("");
  const [messagePage, setMessagePage] = useState(1);

  const [brochuresLoading, setBrochuresLoading] = useState(false);
  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [brochuresLoaded, setBrochuresLoaded] = useState(false);
  const [brochureSearch, setBrochureSearch] = useState("");

  // Each loader ignores a response that arrives after a newer request was started (period or search changed meanwhile).
  const overviewRequest = useRef(0);
  const funnelRequest = useRef(0);
  const leadsRequest = useRef(0);
  const messagesRequest = useRef(0);

  const loadOverview = useCallback(async () => {
    const request = ++overviewRequest.current;
    setLoading(true); setError("");
    try {
      const [conv, sources, staff, campaigns] = await Promise.all([
        fetchConversion(period), fetchBySource(period), fetchByStaff(period), fetchByCampaign(period),
      ]);
      if (request !== overviewRequest.current) return;
      setConversion(conv); setBySource(sources); setByStaff(staff); setByCampaign(campaigns);
    } catch (loadError) {
      if (request === overviewRequest.current) setError(errorMessage(loadError, "Could not load reports."));
    } finally {
      if (request === overviewRequest.current) setLoading(false);
    }
  }, [period]);

  const loadFunnel = useCallback(async () => {
    const request = ++funnelRequest.current;
    setFunnelLoading(true);
    try {
      const [funnel, stages] = await Promise.all([fetchFunnel(period), fetchTimeInStage(period)]);
      if (request !== funnelRequest.current) return;
      setFunnelStages(funnel.stages); setFunnelLeaks(funnel.leaks); setTimeInStage(stages);
    } catch { /* best-effort */ }
    finally { if (request === funnelRequest.current) setFunnelLoading(false); }
  }, [period]);

  const loadLeads = useCallback(async (page: number) => {
    const request = ++leadsRequest.current;
    // A new search starts from page 1, so the full-list spinner shows instead of the old rows.
    if (page === 1) setLeadPage(1);
    setLeadsLoading(true);
    try {
      const result = await fetchLeads({ search: leadSearch.trim() || undefined, page, limit: 25 });
      if (request !== leadsRequest.current) return;
      setLeads((current) => (page === 1 ? result.leads : [...current, ...result.leads]));
      setLeadsTotal(result.pagination.total);
      setLeadPage(page);
    } catch { /* best-effort */ }
    finally { if (request === leadsRequest.current) setLeadsLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadSearch]);

  const loadMessages = useCallback(async (page: number) => {
    const request = ++messagesRequest.current;
    if (page === 1) setMessagePage(1);
    setMessagesLoading(true);
    try {
      const result = await fetchReportMessages({ search: messageSearch.trim() || undefined, page, limit: 25 });
      if (request !== messagesRequest.current) return;
      setMessages((current) => (page === 1 ? result.messages : [...current, ...result.messages]));
      setMessagesTotal(result.pagination.total);
      setMessagePage(page);
    } catch { /* best-effort */ }
    finally { if (request === messagesRequest.current) setMessagesLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageSearch]);

  const loadBrochures = useCallback(async () => {
    setBrochuresLoading(true);
    try {
      setBrochures(await fetchBrochures());
    } catch { /* best-effort */ }
    finally { setBrochuresLoading(false); setBrochuresLoaded(true); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadFunnel(); }, [loadFunnel]);

  // Typing a search waits for a short pause instead of sending a request for every letter.
  useEffect(() => {
    if (tab !== "leads") return undefined;
    const timer = setTimeout(() => loadLeads(1), leadSearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [tab, loadLeads, leadSearch]);
  useEffect(() => {
    if (tab !== "messages") return undefined;
    const timer = setTimeout(() => loadMessages(1), messageSearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [tab, loadMessages, messageSearch]);
  useEffect(() => { if (tab === "brochures" && !brochuresLoaded) loadBrochures(); }, [tab, brochuresLoaded, loadBrochures]);

  const filteredBrochures = brochures
    .filter((b) => !brochureSearch.trim() || b.name?.toLowerCase().includes(brochureSearch.trim().toLowerCase()))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const brochureStats = {
    total: brochures.length,
    shared: brochures.filter((b) => (b.times_shared || 0) > 0).length,
    views: brochures.reduce((sum, b) => sum + (b.views || 0), 0),
    size: brochures.reduce((sum, b) => sum + (b.file_size || 0), 0),
  };

  const conversionRate = conversion?.total_leads ? ((conversion.won || 0) / conversion.total_leads * 100).toFixed(1) : "0";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Reports</Text>
        {tab !== "leads" && tab !== "messages" ? <PeriodDropdown value={period} onChange={setPeriod} /> : null}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.tabsRow}>
          {TABS.map((item) => (
            <Pressable key={item.id} style={[styles.tabChip, tab === item.id && styles.tabChipActive]} onPress={() => setTab(item.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }}>
              <Text style={[styles.tabChipText, tab === item.id && styles.tabChipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "overview" ? (
          loading ? <View style={styles.spinner}><ActivityIndicator color={UI.teal} /></View>
          : error ? <View style={styles.spinner}><Text style={styles.errorText}>{error}</Text><Button mode="contained" buttonColor={UI.teal} onPress={loadOverview} style={{ marginTop: 8 }}>Try again</Button></View>
          : (
            <>
              <View style={styles.statsGrid}>
                <StatCard icon="people-outline" label="Total Leads" value={conversion?.total_leads || 0} tone={UI.teal} toneSoft={UI.tealSoft} />
                <StatCard icon="trophy-outline" label="Won" value={conversion?.won || 0} tone={colors.success} toneSoft={colors.successSoft} />
                <StatCard icon="trending-up-outline" label="Conversion Rate" value={`${conversionRate}%`} tone="#7C3AED" toneSoft="#EDE9FE" />
                <StatCard icon="megaphone-outline" label="Active Campaigns" value={byCampaign.length} tone={colors.warning} toneSoft={colors.warningSoft} />
              </View>

              <Card title="Leads by Source">
                {bySource.length ? (
                  <View style={{ gap: 10 }}>
                    {bySource.map((item, index) => {
                      const total = bySource.reduce((sum, s) => sum + s.total_leads, 0) || 1;
                      const color = SOURCE_COLORS[index % SOURCE_COLORS.length];
                      return (
                        <View key={item.source} style={styles.sourceRow}>
                          <View style={[styles.sourceDot, { backgroundColor: color }]} />
                          <Text style={styles.sourceLabel} numberOfLines={1}>{pretty(item.source)}</Text>
                          <Text style={styles.sourceValue}>{item.total_leads} ({Math.round((item.total_leads / total) * 100)}%)</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : <EmptyState />}
              </Card>

              <Card title="Conversion Funnel">
                {conversion?.stages?.length ? (
                  <BarList items={conversion.stages.map((s) => ({ label: pretty(s.stage), value: s.count }))} />
                ) : <EmptyState />}
              </Card>
            </>
          )
        ) : null}

        {tab === "funnel" ? (
          funnelLoading ? <View style={styles.spinner}><ActivityIndicator color={UI.teal} /></View> : (
            <>
              <Card title="Lead funnel">
                {funnelStages.length ? (
                  <FunnelBars stages={funnelStages} />
                ) : <EmptyState />}
              </Card>
              {funnelLeaks.length ? (
                <Text style={styles.funnelNote}>Lost {funnelLeaks.reduce((sum, leak) => sum + (Number(leak.lost_count) || 0), 0).toLocaleString("en-IN")} leads are not shown in the funnel.</Text>
              ) : null}

              <Card title="Where Leads Leak">
                {funnelLeaks.length ? (
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[{ label: "Lost From Stage", flex: 1.3 }, { label: "Lost Leads", flex: 0.8, align: "right" }, { label: "Lost Value", flex: 1, align: "right" }]} />
                    {funnelLeaks.map((l, i) => (
                      <View key={i} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 1.3, fontWeight: "700" }]} numberOfLines={1}>{pretty(l.from_stage) || "Unknown"}</Text>
                        <Text style={[styles.tableCell, { flex: 0.8, textAlign: "right", color: UI.red, fontWeight: "700" }]}>{l.lost_count}</Text>
                        <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{money(l.lost_value)}</Text>
                      </View>
                    ))}
                  </View>
                ) : <EmptyState message="No lost leads in this period" />}
              </Card>

              <Card title="Time in Stage">
                {timeInStage.length ? (
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[{ label: "Stage", flex: 1.3 }, { label: "Avg Time", flex: 1, align: "right" }, { label: "Stuck", flex: 0.8, align: "right" }]} />
                    {timeInStage.map((s, i) => (
                      <View key={i} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 1.3, fontWeight: "700" }]} numberOfLines={1}>{pretty(s.stage)}</Text>
                        <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{fmtDuration(s.avg_seconds_in_stage)}</Text>
                        <Text style={[styles.tableCell, { flex: 0.8, textAlign: "right", color: colors.warning, fontWeight: "700" }]}>{s.currently_in_stage}</Text>
                      </View>
                    ))}
                  </View>
                ) : <EmptyState />}
              </Card>
            </>
          )
        ) : null}

        {tab === "team" ? (
          loading ? <View style={styles.spinner}><ActivityIndicator color={UI.teal} /></View>
          : error ? <View style={styles.spinner}><Text style={styles.errorText}>{error}</Text><Button mode="contained" buttonColor={UI.teal} onPress={loadOverview} style={{ marginTop: 8 }}>Try again</Button></View>
          : (
            <Card title="Staff Performance">
              {byStaff.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Name", width: 110 }, { label: "Leads", width: 60, align: "right" }, { label: "Won", width: 55, align: "right" },
                      { label: "Lost", width: 55, align: "right" }, { label: "Conv.", width: 60, align: "right" },
                      { label: "AI", width: 55, align: "right" }, { label: "Manual", width: 65, align: "right" },
                    ]} />
                    {byStaff.map((s, i) => (
                      <View key={i} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: 110, fontWeight: "700" }]}>{s.name}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{s.total_leads}</Text>
                        <Text style={[styles.tableCell, { width: 55, textAlign: "right", color: colors.success, fontWeight: "700" }]}>{s.won}</Text>
                        <Text style={[styles.tableCell, { width: 55, textAlign: "right", color: UI.red }]}>{s.lost}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right", fontWeight: "700" }]}>
                          {s.total_leads > 0 ? ((s.won / s.total_leads) * 100).toFixed(1) : 0}%
                        </Text>
                        <Text style={[styles.tableCell, { width: 55, textAlign: "right", color: UI.teal }]}>{s.ai_sent || 0}</Text>
                        <Text style={[styles.tableCell, { width: 65, textAlign: "right" }]}>{s.manual_sent || 0}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : <EmptyState />}
            </Card>
          )
        ) : null}

        {tab === "campaigns" ? (
          loading ? <View style={styles.spinner}><ActivityIndicator color={UI.teal} /></View>
          : error ? <View style={styles.spinner}><Text style={styles.errorText}>{error}</Text><Button mode="contained" buttonColor={UI.teal} onPress={loadOverview} style={{ marginTop: 8 }}>Try again</Button></View>
          : (
            <Card title="Campaign ROI">
              {byCampaign.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Campaign", width: 180 }, { label: "Source", width: 120 }, { label: "Spent", width: 100, align: "right" },
                      { label: "Leads", width: 60, align: "right" }, { label: "CPL", width: 65, align: "right" }, { label: "Won", width: 55, align: "right" },
                    ]} />
                    {byCampaign.map((c, i) => (
                      <View key={i} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: 180, paddingRight: 20, fontWeight: "700" }]} numberOfLines={1}>{c.name}</Text>
                        <Text style={[styles.tableCell, { width: 120 }]} numberOfLines={1}>{pretty(c.source)}</Text>
                        <Text style={[styles.tableCell, { width: 100, textAlign: "right" }]}>{money(c.actual_spend)}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{c.total_leads || 0}</Text>
                        <Text style={[styles.tableCell, { width: 65, textAlign: "right", color: UI.teal, fontWeight: "700" }]}>{money(Math.round(c.cpl || 0))}</Text>
                        <Text style={[styles.tableCell, { width: 55, textAlign: "right", color: colors.success }]}>{c.won || 0}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : <EmptyState message="No campaigns yet" />}
            </Card>
          )
        ) : null}

        {tab === "leads" ? (
          <Card title="Lead Detail Report">
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color={UI.muted} />
              <RNTextInput
                style={styles.searchInput} value={leadSearch} onChangeText={setLeadSearch}
                placeholder="Search by name or phone…" placeholderTextColor={UI.muted}
                onSubmitEditing={() => loadLeads(1)} returnKeyType="search"
              />
            </View>
            {leadsLoading && leadPage === 1 ? <View style={styles.spinner}><ActivityIndicator color={UI.teal} /></View> : leads.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Lead #", width: 80 }, { label: "Name", width: 190 }, { label: "Phone", width: 125 },
                      { label: "Stage", width: 100 }, { label: "Assigned", width: 90 }, { label: "Created", width: 90, align: "right" },
                    ]} />
                    {leads.map((lead) => (
                      <Pressable key={lead.id} style={styles.tableRow} onPress={() => router.push(`/(app)/leads/${lead.id}`)}>
                        <Text style={[styles.tableCell, { width: 80, color: UI.muted }]}>{lead.lead_number || "—"}</Text>
                        <Text style={[styles.tableCell, { width: 190, paddingRight: 16, fontWeight: "700" }]} numberOfLines={1}>{lead.name}</Text>
                        <Text style={[styles.tableCell, { width: 125 }]}>{lead.phone}</Text>
                        <Text style={[styles.tableCell, { width: 100 }]} numberOfLines={1}>{pretty(lead.stage)}</Text>
                        <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>{lead.assigned_to_name || "—"}</Text>
                        <Text style={[styles.tableCell, { width: 90, textAlign: "right", color: UI.muted }]}>
                          {new Date(lead.created_at).toLocaleDateString("en-IN")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.countText}>Showing {leads.length} of {leadsTotal} leads</Text>
                {leads.length < leadsTotal ? (
                  <Button mode="outlined" textColor={UI.teal} onPress={() => loadLeads(leadPage + 1)} loading={leadsLoading && leadPage > 1} style={{ marginTop: 8 }}>Load more</Button>
                ) : null}
              </>
            ) : <EmptyState message="No leads match these filters" />}
          </Card>
        ) : null}

        {tab === "brochures" ? (
          <Card title="Brochure Detail Report">
            <View style={styles.statsGrid}>
              <StatCard icon="document-text-outline" label="Total Brochures" value={brochureStats.total} tone="#4F46E5" toneSoft="#E0E7FF" />
              <StatCard icon="share-social-outline" label="Shared Brochures" value={brochureStats.shared} tone={colors.success} toneSoft={colors.successSoft} />
              <StatCard icon="eye-outline" label="Total Views" value={brochureStats.views} tone={colors.warning} toneSoft={colors.warningSoft} />
              <StatCard icon="document-outline" label="Total Size" value={fmtSize(brochureStats.size)} tone={UI.teal} toneSoft={UI.tealSoft} />
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color={UI.muted} />
              <RNTextInput
                style={styles.searchInput} value={brochureSearch} onChangeText={setBrochureSearch}
                placeholder="Search brochures…" placeholderTextColor={UI.muted}
              />
            </View>

            {brochuresLoading ? <View style={styles.spinner}><ActivityIndicator color={UI.teal} /></View> : filteredBrochures.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Brochure", width: 150 }, { label: "Category", width: 90 }, { label: "Views", width: 60, align: "right" },
                      { label: "Shares", width: 65, align: "right" }, { label: "Size", width: 75, align: "right" }, { label: "Created", width: 90, align: "right" },
                    ]} />
                    {filteredBrochures.map((b) => (
                      <View key={b.id} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: 150, fontWeight: "700", color: UI.teal }]} numberOfLines={1}>{b.name}</Text>
                        <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>{pretty(b.category) || "General"}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{b.views || 0}</Text>
                        <Text style={[styles.tableCell, { width: 65, textAlign: "right" }]}>{b.times_shared || 0}</Text>
                        <Text style={[styles.tableCell, { width: 75, textAlign: "right", color: UI.muted }]}>{fmtSize(b.file_size)}</Text>
                        <Text style={[styles.tableCell, { width: 90, textAlign: "right", color: UI.muted }]}>
                          {b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN") : "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.countText}>Showing {filteredBrochures.length} of {brochures.length} brochures</Text>
              </>
            ) : <EmptyState message="No brochures match these filters" />}
          </Card>
        ) : null}

        {tab === "messages" ? (
          <Card title="Messages Report">
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color={UI.muted} />
              <RNTextInput
                style={styles.searchInput} value={messageSearch} onChangeText={setMessageSearch}
                placeholder="Search by name or phone…" placeholderTextColor={UI.muted}
                onSubmitEditing={() => loadMessages(1)} returnKeyType="search"
              />
            </View>
            {messagesLoading && messagePage === 1 ? <View style={styles.spinner}><ActivityIndicator color={UI.teal} /></View> : messages.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.tableWrap}>
                  <TableHeader columns={[
                    { label: "Lead", width: 150 }, { label: "Source", width: 70 }, { label: "Status", width: 92 }, { label: "Sent At", width: 118, align: "right" },
                  ]} />
                  {messages.map((m) => (
                    <View key={m.id} style={styles.tableRow}>
                      <View style={styles.messageLeadCell}>
                        <Text style={[styles.tableCell, { fontWeight: "700" }]} numberOfLines={1}>{m.lead_name || "Unknown"}</Text>
                        <Text style={styles.tableCellSub} numberOfLines={1}>{m.lead_phone}</Text>
                        <Text style={styles.tableCellSub} numberOfLines={1}>{pretty(m.direction)} · {pretty(m.message_type)}</Text>
                      </View>
                      <Text style={[styles.tableCell, styles.messageSourceCell]} numberOfLines={2}>{m.is_automated ? (m.is_ai_generated ? "AI" : "Auto") : "Manual"}</Text>
                      <View style={styles.messageStatusCell}>
                        <View style={[styles.statusPill, {
                          backgroundColor: m.status === "delivered" || m.status === "read" ? colors.successSoft
                            : m.status === "sent" ? UI.tealSoft : m.status === "failed" ? UI.redSoft : UI.track,
                        }]}>
                          <Text style={[styles.statusPillText, {
                            color: m.status === "delivered" || m.status === "read" ? colors.success
                              : m.status === "sent" ? UI.teal : m.status === "failed" ? UI.red : UI.sub,
                          }]} numberOfLines={1}>{m.status?.toUpperCase() || "—"}</Text>
                        </View>
                      </View>
                      <Text style={[styles.tableCell, styles.messageSentAtCell]}>
                        {new Date(m.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                      </Text>
                    </View>
                  ))}
                </View>
                </ScrollView>
                <Text style={styles.countText}>Showing {messages.length} of {messagesTotal} messages</Text>
                {messages.length < messagesTotal ? (
                  <Button mode="outlined" textColor={UI.teal} onPress={() => loadMessages(messagePage + 1)} loading={messagesLoading && messagePage > 1} style={{ marginTop: 8 }}>Load more</Button>
                ) : null}
              </>
            ) : <EmptyState message="No messages match these filters" />}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: UI.bg, zIndex: 20, elevation: 20 },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  funnelNote: { color: UI.sub, fontSize: 11, marginTop: -4, marginBottom: 14, paddingHorizontal: 2 },
  content: { padding: 16 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  subtitle: { flex: 1, color: UI.sub, fontSize: 13 },
  spinner: { paddingVertical: 40, alignItems: "center" },
  errorText: { color: UI.sub, textAlign: "center" },

  periodWrap: { minWidth: 130, alignItems: "flex-end" },
  periodField: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, borderWidth: 1, borderColor: UI.line, borderRadius: 999, paddingHorizontal: 12, backgroundColor: "#ffffff" },
  periodFieldText: { color: UI.ink, fontSize: 12, fontWeight: "700" },
  periodPanel: { position: "absolute", top: 38, right: 0, zIndex: 10, backgroundColor: "#ffffff", borderRadius: 10, borderWidth: 1, borderColor: UI.line, minWidth: 140, elevation: 6, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  periodItem: { paddingHorizontal: 14, paddingVertical: 10 },
  periodItemText: { color: UI.ink, fontSize: 13 },
  periodItemTextSelected: { color: UI.teal, fontWeight: "700" },

  tabsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 14 },
  tabChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "#e4ecf3" },
  tabChipActive: { backgroundColor: UI.teal },
  tabChipText: { color: UI.ink, fontSize: 12, fontWeight: "700" },
  tabChipTextActive: { color: "#fff" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  statCard: { width: "47%", backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 14 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statLabel: { color: UI.sub, fontSize: 11 },
  statValue: { color: UI.ink, fontSize: 17, fontWeight: "800", marginTop: 2 },

  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 16, marginBottom: 14 },
  cardTitle: { color: UI.ink, fontSize: 14, fontWeight: "700", marginBottom: 12 },
  emptyText: { color: UI.muted, textAlign: "center", paddingVertical: 20, fontSize: 12 },

  sourceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sourceDot: { width: 10, height: 10, borderRadius: 5 },
  sourceLabel: { flex: 1, color: UI.ink, fontSize: 13, fontWeight: "600" },
  sourceValue: { color: UI.sub, fontSize: 12 },

  barRowLabel: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { flex: 1, color: UI.ink, fontSize: 12, fontWeight: "600" },
  barValue: { color: UI.sub, fontSize: 12, fontWeight: "700" },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: UI.track, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: UI.teal },

  tableWrap: { marginTop: 6 },
  tableRow: { flexDirection: "row", paddingVertical: 10, borderTopWidth: 1, borderTopColor: UI.line, alignItems: "center" },
  tableHeadCell: { color: UI.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  tableCell: { color: UI.ink, fontSize: 12 },
  tableCellSub: { color: UI.muted, fontSize: 10, marginTop: 1 },
  messageLeadCell: { width: 150, paddingRight: 8 },
  messageSourceCell: { width: 70, paddingRight: 8 },
  messageStatusCell: { width: 92, alignItems: "flex-start" },
  messageSentAtCell: { width: 118, textAlign: "right", color: UI.muted, fontSize: 11 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: UI.line, borderRadius: 8, paddingHorizontal: 10, height: 38, marginBottom: 12 },
  searchInput: { flex: 1, color: UI.ink, fontSize: 12 },
  countText: { color: UI.muted, fontSize: 11, marginTop: 10 },

  statusPill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 9, fontWeight: "800" },
});
