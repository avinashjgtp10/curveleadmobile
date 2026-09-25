import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
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
        <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
        <Text style={styles.periodFieldText}>{selected?.label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={13} color={colors.textSecondary} />
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

  const loadOverview = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [conv, sources, staff, campaigns] = await Promise.all([
        fetchConversion(period), fetchBySource(period), fetchByStaff(period), fetchByCampaign(period),
      ]);
      setConversion(conv); setBySource(sources); setByStaff(staff); setByCampaign(campaigns);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load reports."));
    } finally {
      setLoading(false);
    }
  }, [period]);

  const loadFunnel = useCallback(async () => {
    setFunnelLoading(true);
    try {
      const [funnel, stages] = await Promise.all([fetchFunnel(period), fetchTimeInStage(period)]);
      setFunnelStages(funnel.stages); setFunnelLeaks(funnel.leaks); setTimeInStage(stages);
    } catch { /* best-effort */ }
    finally { setFunnelLoading(false); }
  }, [period]);

  const loadLeads = useCallback(async (page: number) => {
    setLeadsLoading(true);
    try {
      const result = await fetchLeads({ search: leadSearch.trim() || undefined, page, limit: 25 });
      setLeads((current) => (page === 1 ? result.leads : [...current, ...result.leads]));
      setLeadsTotal(result.pagination.total);
      setLeadPage(page);
    } catch { /* best-effort */ }
    finally { setLeadsLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadSearch]);

  const loadMessages = useCallback(async (page: number) => {
    setMessagesLoading(true);
    try {
      const result = await fetchReportMessages({ search: messageSearch.trim() || undefined, page, limit: 25 });
      setMessages((current) => (page === 1 ? result.messages : [...current, ...result.messages]));
      setMessagesTotal(result.pagination.total);
      setMessagePage(page);
    } catch { /* best-effort */ }
    finally { setMessagesLoading(false); }
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

  useEffect(() => { if (tab === "leads") loadLeads(1); }, [tab, loadLeads]);
  useEffect(() => { if (tab === "messages") loadMessages(1); }, [tab, loadMessages]);
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
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Reports" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Text style={styles.subtitle}>Track conversion, sources, and campaign performance</Text>
          {tab !== "leads" && tab !== "messages" ? <PeriodDropdown value={period} onChange={setPeriod} /> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((item) => (
            <Pressable key={item.id} style={[styles.tabChip, tab === item.id && styles.tabChipActive]} onPress={() => setTab(item.id)}>
              <Text style={[styles.tabChipText, tab === item.id && styles.tabChipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === "overview" ? (
          loading ? <View style={styles.spinner}><ActivityIndicator color={colors.primary} /></View>
          : error ? <View style={styles.spinner}><Text style={styles.errorText}>{error}</Text><Button mode="contained" onPress={loadOverview} style={{ marginTop: 8 }}>Try again</Button></View>
          : (
            <>
              <View style={styles.statsGrid}>
                <StatCard icon="people-outline" label="Total Leads" value={conversion?.total_leads || 0} tone={colors.primary} toneSoft={colors.primarySoft} />
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
          funnelLoading ? <View style={styles.spinner}><ActivityIndicator color={colors.primary} /></View> : (
            <>
              <Card title="Sales Funnel Drop-off">
                {funnelStages.length ? (
                  <>
                    <BarList items={funnelStages.map((s) => ({ label: s.name, value: s.reached_count }))} />
                    <View style={styles.tableWrap}>
                      <TableHeader columns={[{ label: "Stage", flex: 1.2 }, { label: "Reached", flex: 0.8, align: "right" }, { label: "Drop-off", flex: 1, align: "right" }]} />
                      {funnelStages.map((s, i) => (
                        <View key={s.id} style={styles.tableRow}>
                          <Text style={[styles.tableCell, { flex: 1.2, fontWeight: "700" }]} numberOfLines={1}>{s.name}</Text>
                          <Text style={[styles.tableCell, { flex: 0.8, textAlign: "right" }]}>{s.reached_count}</Text>
                          <Text style={[styles.tableCell, { flex: 1, textAlign: "right", color: colors.danger }]} numberOfLines={1}>
                            {i > 0 ? `${s.drop_off_count || 0} (${s.drop_off_pct || 0}%)` : "—"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : <EmptyState />}
              </Card>

              <Card title="Where Leads Leak">
                {funnelLeaks.length ? (
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[{ label: "Lost From Stage", flex: 1.3 }, { label: "Lost Leads", flex: 0.8, align: "right" }, { label: "Lost Value", flex: 1, align: "right" }]} />
                    {funnelLeaks.map((l, i) => (
                      <View key={i} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 1.3, fontWeight: "700" }]} numberOfLines={1}>{pretty(l.from_stage) || "Unknown"}</Text>
                        <Text style={[styles.tableCell, { flex: 0.8, textAlign: "right", color: colors.danger, fontWeight: "700" }]}>{l.lost_count}</Text>
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
          loading ? <View style={styles.spinner}><ActivityIndicator color={colors.primary} /></View> : (
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
                        <Text style={[styles.tableCell, { width: 55, textAlign: "right", color: colors.danger }]}>{s.lost}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right", fontWeight: "700" }]}>
                          {s.total_leads > 0 ? ((s.won / s.total_leads) * 100).toFixed(1) : 0}%
                        </Text>
                        <Text style={[styles.tableCell, { width: 55, textAlign: "right", color: colors.primary }]}>{s.ai_sent || 0}</Text>
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
          loading ? <View style={styles.spinner}><ActivityIndicator color={colors.primary} /></View> : (
            <Card title="Campaign ROI">
              {byCampaign.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Campaign", width: 160 }, { label: "Source", width: 90 }, { label: "Spent", width: 85, align: "right" },
                      { label: "Leads", width: 60, align: "right" }, { label: "CPL", width: 65, align: "right" }, { label: "Won", width: 55, align: "right" },
                    ]} />
                    {byCampaign.map((c, i) => (
                      <View key={i} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: 160, fontWeight: "700" }]} numberOfLines={1}>{c.name}</Text>
                        <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>{pretty(c.source)}</Text>
                        <Text style={[styles.tableCell, { width: 85, textAlign: "right" }]}>{money(c.actual_spend)}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{c.total_leads || 0}</Text>
                        <Text style={[styles.tableCell, { width: 65, textAlign: "right", color: colors.primary, fontWeight: "700" }]}>₹{c.cpl || 0}</Text>
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
              <Ionicons name="search" size={14} color={colors.textMuted} />
              <RNTextInput
                style={styles.searchInput} value={leadSearch} onChangeText={setLeadSearch}
                placeholder="Search by name or phone…" placeholderTextColor={colors.textMuted}
                onSubmitEditing={() => loadLeads(1)} returnKeyType="search"
              />
            </View>
            {leadsLoading && leadPage === 1 ? <View style={styles.spinner}><ActivityIndicator color={colors.primary} /></View> : leads.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Lead #", width: 70 }, { label: "Name", width: 130 }, { label: "Phone", width: 110 },
                      { label: "Stage", width: 100 }, { label: "Assigned", width: 90 }, { label: "Created", width: 90, align: "right" },
                    ]} />
                    {leads.map((lead) => (
                      <Pressable key={lead.id} style={styles.tableRow} onPress={() => router.push(`/(app)/leads/${lead.id}`)}>
                        <Text style={[styles.tableCell, { width: 70, color: colors.textMuted }]}>{lead.lead_number || "—"}</Text>
                        <Text style={[styles.tableCell, { width: 130, fontWeight: "700" }]} numberOfLines={1}>{lead.name}</Text>
                        <Text style={[styles.tableCell, { width: 110 }]}>{lead.phone}</Text>
                        <Text style={[styles.tableCell, { width: 100 }]} numberOfLines={1}>{pretty(lead.stage)}</Text>
                        <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>{lead.assigned_to_name || "—"}</Text>
                        <Text style={[styles.tableCell, { width: 90, textAlign: "right", color: colors.textMuted }]}>
                          {new Date(lead.created_at).toLocaleDateString("en-IN")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.countText}>Showing {leads.length} of {leadsTotal} leads</Text>
                {leads.length < leadsTotal ? (
                  <Button mode="outlined" onPress={() => loadLeads(leadPage + 1)} loading={leadsLoading && leadPage > 1} style={{ marginTop: 8 }}>Load more</Button>
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
              <StatCard icon="document-outline" label="Total Size" value={fmtSize(brochureStats.size)} tone={colors.primary} toneSoft={colors.primarySoft} />
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color={colors.textMuted} />
              <RNTextInput
                style={styles.searchInput} value={brochureSearch} onChangeText={setBrochureSearch}
                placeholder="Search brochures…" placeholderTextColor={colors.textMuted}
              />
            </View>

            {brochuresLoading ? <View style={styles.spinner}><ActivityIndicator color={colors.primary} /></View> : filteredBrochures.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Brochure", width: 150 }, { label: "Category", width: 90 }, { label: "Views", width: 60, align: "right" },
                      { label: "Shares", width: 65, align: "right" }, { label: "Size", width: 75, align: "right" }, { label: "Created", width: 90, align: "right" },
                    ]} />
                    {filteredBrochures.map((b) => (
                      <View key={b.id} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: 150, fontWeight: "700", color: colors.primary }]} numberOfLines={1}>{b.name}</Text>
                        <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>{pretty(b.category) || "General"}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: "right" }]}>{b.views || 0}</Text>
                        <Text style={[styles.tableCell, { width: 65, textAlign: "right" }]}>{b.times_shared || 0}</Text>
                        <Text style={[styles.tableCell, { width: 75, textAlign: "right", color: colors.textMuted }]}>{fmtSize(b.file_size)}</Text>
                        <Text style={[styles.tableCell, { width: 90, textAlign: "right", color: colors.textMuted }]}>
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
              <Ionicons name="search" size={14} color={colors.textMuted} />
              <RNTextInput
                style={styles.searchInput} value={messageSearch} onChangeText={setMessageSearch}
                placeholder="Search by name or phone…" placeholderTextColor={colors.textMuted}
                onSubmitEditing={() => loadMessages(1)} returnKeyType="search"
              />
            </View>
            {messagesLoading && messagePage === 1 ? <View style={styles.spinner}><ActivityIndicator color={colors.primary} /></View> : messages.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <TableHeader columns={[
                      { label: "Lead", width: 140 }, { label: "Direction", width: 80 }, { label: "Type", width: 80 },
                      { label: "Source", width: 90 }, { label: "Status", width: 80 }, { label: "Sent At", width: 130, align: "right" },
                    ]} />
                    {messages.map((m) => (
                      <View key={m.id} style={styles.tableRow}>
                        <View style={{ width: 140 }}>
                          <Text style={[styles.tableCell, { fontWeight: "700" }]} numberOfLines={1}>{m.lead_name}</Text>
                          <Text style={styles.tableCellSub} numberOfLines={1}>{m.lead_phone}</Text>
                        </View>
                        <Text style={[styles.tableCell, { width: 80 }]}>{pretty(m.direction)}</Text>
                        <Text style={[styles.tableCell, { width: 80 }]} numberOfLines={1}>{pretty(m.message_type)}</Text>
                        <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>{m.is_automated ? (m.is_ai_generated ? "AI Automated" : "Automated") : "Manual"}</Text>
                        <View style={{ width: 80 }}>
                          <View style={[styles.statusPill, {
                            backgroundColor: m.status === "delivered" || m.status === "read" ? colors.successSoft
                              : m.status === "sent" ? colors.primarySoft : m.status === "failed" ? colors.dangerSoft : colors.surfaceMuted,
                          }]}>
                            <Text style={[styles.statusPillText, {
                              color: m.status === "delivered" || m.status === "read" ? colors.success
                                : m.status === "sent" ? colors.primary : m.status === "failed" ? colors.danger : colors.textSecondary,
                            }]}>{m.status?.toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={[styles.tableCell, { width: 130, textAlign: "right", color: colors.textMuted }]}>
                          {new Date(m.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.countText}>Showing {messages.length} of {messagesTotal} messages</Text>
                {messages.length < messagesTotal ? (
                  <Button mode="outlined" onPress={() => loadMessages(messagePage + 1)} loading={messagesLoading && messagePage > 1} style={{ marginTop: 8 }}>Load more</Button>
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
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { color: colors.text, fontWeight: "700" },
  content: { padding: 16 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  subtitle: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  spinner: { paddingVertical: 40, alignItems: "center" },
  errorText: { color: colors.textSecondary, textAlign: "center" },

  periodWrap: { minWidth: 130 },
  periodField: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, backgroundColor: colors.surface },
  periodFieldText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  periodPanel: { position: "absolute", top: 38, right: 0, zIndex: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, minWidth: 140, elevation: 6, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  periodItem: { paddingHorizontal: 14, paddingVertical: 10 },
  periodItemText: { color: colors.text, fontSize: 13 },
  periodItemTextSelected: { color: colors.primary, fontWeight: "700" },

  tabsRow: { gap: 6, paddingBottom: 14 },
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surfaceMuted },
  tabChipActive: { backgroundColor: colors.primary },
  tabChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  tabChipTextActive: { color: "#fff" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  statCard: { width: "47%", backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 14 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statLabel: { color: colors.textSecondary, fontSize: 11 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 2 },

  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 16, marginBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 12 },
  emptyText: { color: colors.textMuted, textAlign: "center", paddingVertical: 20, fontSize: 12 },

  sourceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sourceDot: { width: 10, height: 10, borderRadius: 5 },
  sourceLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
  sourceValue: { color: colors.textSecondary, fontSize: 12 },

  barRowLabel: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "600" },
  barValue: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },

  tableWrap: { marginTop: 6 },
  tableRow: { flexDirection: "row", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, alignItems: "center" },
  tableHeadCell: { color: colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  tableCell: { color: colors.text, fontSize: 12 },
  tableCellSub: { color: colors.textMuted, fontSize: 10, marginTop: 1 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, height: 38, marginBottom: 12 },
  searchInput: { flex: 1, color: colors.text, fontSize: 12 },
  countText: { color: colors.textMuted, fontSize: 11, marginTop: 10 },

  statusPill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 9, fontWeight: "800" },
});
