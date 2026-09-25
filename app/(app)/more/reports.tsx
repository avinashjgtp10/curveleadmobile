import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Checkbox, Menu, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { useStages } from "@/hooks/useStages";
import { GlassBackground, glass, GradientNumber } from "@/components/Glass";
import type { GradientName } from "@/components/Glass";
import {
  ConversionReport, fetchByCampaign, fetchByStaff, fetchBySource, fetchConversion, fetchFollowupTrend,
  fetchFunnel, fetchLeadDetailGrid, fetchResponseTimeline, fetchTimeInStage, FunnelLeak, FunnelStage,
  LeadDetailRow, ReportPeriod, CampaignReportRow, StaffReportRow, SourceReportRow, TimeInStageRow,
  FollowupTrendPoint, TimelinePoint,
} from "@/api/reports";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "funnel", label: "Funnel" },
  { id: "team", label: "Team" },
  { id: "campaigns", label: "Campaigns" },
  { id: "leads", label: "Lead Detail" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
];

const TREND_DAY_OPTIONS = [7, 30, 90];
const PAGE_SIZE = 20;
const BAR_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function fmtDuration(seconds: number | null) {
  if (seconds == null) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Spinner() {
  return <View style={styles.spinnerWrap}><ActivityIndicator size="large" color={colors.primary} /></View>;
}

function EmptyState({ message = "No data for this period" }: { message?: string }) {
  return <Text style={styles.emptyText}>{message}</Text>;
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function StatTile({ label, value, icon, tone, iconBg }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; tone: GradientName; iconBg: string }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}><Ionicons name={icon} size={16} color={colors.textSecondary} /></View>
      <GradientNumber value={String(value)} tone={tone} />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BarRow({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barRowTop}>
        <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.barValue}>{value}{sub ? ` ${sub}` : ""}</Text>
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function TableHeader({ columns }: { columns: { label: string; flex?: number; align?: "left" | "right" | "center" }[] }) {
  return (
    <View style={styles.tableHeaderRow}>
      {columns.map((col) => (
        <Text key={col.label} style={[styles.tableHeaderText, { flex: col.flex ?? 1, textAlign: col.align || "left" }]}>{col.label}</Text>
      ))}
    </View>
  );
}

function Dropdown({ value, options, onSelect }: { value: string; options: { value: string; label: string }[]; onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Pressable style={styles.dropdown} onPress={() => setOpen(true)}>
          <Text style={styles.dropdownText} numberOfLines={1}>{selected?.label || "Select"}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
      }
    >
      {options.map((item) => (
        <Menu.Item key={item.value || "all"} title={item.label} onPress={() => { onSelect(item.value); setOpen(false); }} />
      ))}
    </Menu>
  );
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { stages } = useStages();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [period, setPeriod] = useState<ReportPeriod>("this_month");

  const [loading, setLoading] = useState(true);
  const [conversion, setConversion] = useState<ConversionReport | null>(null);
  const [bySource, setBySource] = useState<SourceReportRow[]>([]);
  const [byStaff, setByStaff] = useState<StaffReportRow[]>([]);
  const [byCampaign, setByCampaign] = useState<CampaignReportRow[]>([]);

  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [funnelLeaks, setFunnelLeaks] = useState<FunnelLeak[]>([]);
  const [timeInStage, setTimeInStage] = useState<TimeInStageRow[]>([]);
  const [stalledCount, setStalledCount] = useState(0);

  const [trendDays, setTrendDays] = useState(30);
  const [trendLoading, setTrendLoading] = useState(true);
  const [responseTrend, setResponseTrend] = useState<TimelinePoint[]>([]);
  const [followupTrend, setFollowupTrend] = useState<FollowupTrendPoint[]>([]);

  const [gridStage, setGridStage] = useState("");
  const [gridAttachment, setGridAttachment] = useState("");
  const [gridStalled, setGridStalled] = useState(false);
  const [gridPage, setGridPage] = useState(1);
  const [gridLeads, setGridLeads] = useState<LeadDetailRow[]>([]);
  const [gridTotal, setGridTotal] = useState(0);
  const [gridPages, setGridPages] = useState(1);
  const [gridLoading, setGridLoading] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchConversion(period).catch(() => null),
      fetchBySource(period).catch(() => []),
      fetchByStaff(period).catch(() => []),
      fetchByCampaign(period).catch(() => []),
    ]).then(([conv, sources, staff, campaigns]) => {
      if (cancelled) return;
      setConversion(conv); setBySource(sources); setByStaff(staff); setByCampaign(campaigns);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    setFunnelLoading(true);
    Promise.all([
      fetchFunnel(period).catch(() => ({ stages: [], leaks: [] })),
      fetchTimeInStage(period).catch(() => []),
      fetchLeadDetailGrid({ stalled: true, limit: 1 }).catch(() => ({ leads: [], pagination: { total: 0, pages: 1 } })),
    ]).then(([funnel, tis, stalled]) => {
      if (cancelled) return;
      setFunnelStages(funnel.stages); setFunnelLeaks(funnel.leaks); setTimeInStage(tis); setStalledCount(stalled.pagination.total);
    }).finally(() => { if (!cancelled) setFunnelLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);
    Promise.all([
      fetchResponseTimeline(trendDays).catch(() => []),
      fetchFollowupTrend(trendDays).catch(() => []),
    ]).then(([timeline, trend]) => {
      if (cancelled) return;
      setResponseTrend(timeline); setFollowupTrend(trend);
    }).finally(() => { if (!cancelled) setTrendLoading(false); });
    return () => { cancelled = true; };
  }, [trendDays]);

  useEffect(() => {
    let cancelled = false;
    setGridLoading(true);
    fetchLeadDetailGrid({
      page: gridPage, limit: PAGE_SIZE,
      ...(gridStage && { stage: gridStage }),
      ...(gridAttachment && { has_attachment: gridAttachment as "yes" | "no" }),
      ...(gridStalled && { stalled: true }),
    }).then((result) => {
      if (cancelled) return;
      setGridLeads(result.leads); setGridTotal(result.pagination.total); setGridPages(result.pagination.pages);
    }).catch(() => { if (!cancelled) { setGridLeads([]); setGridTotal(0); setGridPages(1); } })
      .finally(() => { if (!cancelled) setGridLoading(false); });
    return () => { cancelled = true; };
  }, [gridStage, gridAttachment, gridStalled, gridPage]);

  const conversionRate = conversion && conversion.total_leads > 0 ? ((conversion.won / conversion.total_leads) * 100).toFixed(1) : "0";
  const maxSourceLeads = Math.max(1, ...bySource.map((item) => item.total_leads));
  const maxStageCount = Math.max(1, ...(conversion?.stages || []).map((item) => item.count));
  const maxFunnelReached = Math.max(1, ...funnelStages.map((item) => item.reached_count));

  const stageOptions = useMemo(() => [{ value: "", label: "All Stages" }, ...stages.map((item) => ({ value: item.name, label: item.name }))], [stages]);
  const attachmentOptions = [
    { value: "", label: "Any Attachment Status" },
    { value: "yes", label: "File Attached" },
    { value: "no", label: "No File Attached" },
  ];
  const activeLeadFilterCount = [gridStage, gridAttachment, gridStalled ? "stalled" : ""].filter(Boolean).length;
  const gridStageLabel = stageOptions.find((item) => item.value === gridStage)?.label || "All Stages";
  const gridAttachmentLabel = attachmentOptions.find((item) => item.value === gridAttachment)?.label || "Any Attachment Status";

  function changeGridFilter(setter: (value: string) => void, value: string) {
    setGridPage(1);
    setter(value);
  }

  return (
    <View style={styles.screen}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Reports" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <View style={styles.topRow}>
        <Text style={styles.topRowSubtitle}>Track conversion, sources, and campaign performance</Text>
        {activeTab !== "leads" ? <Dropdown value={period} options={PERIODS} onSelect={(value) => setPeriod(value as ReportPeriod)} /> : null}
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <Pressable key={tab.id} style={[styles.tabChip, activeTab === tab.id && styles.tabChipActive]} onPress={() => setActiveTab(tab.id)}>
            <Text style={[styles.tabChipText, activeTab === tab.id && styles.tabChipTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" ? (
          loading ? <Spinner /> : (
            <>
              <View style={styles.statGrid}>
                <StatTile label="Total Leads" value={conversion?.total_leads || 0} icon="people-outline" tone="sky" iconBg={colors.primarySoft} />
                <StatTile label="Won" value={conversion?.won || 0} icon="checkmark-circle-outline" tone="emerald" iconBg={colors.successSoft} />
                <StatTile label="Conversion Rate" value={`${conversionRate}%`} icon="trending-up-outline" tone="violet" iconBg="#ede9fe" />
                <StatTile label="Active Campaigns" value={byCampaign.length} icon="megaphone-outline" tone="amber" iconBg={colors.warningSoft} />
              </View>

              <Card title="Leads by Source">
                {bySource.length === 0 ? <EmptyState /> : bySource.map((item, index) => (
                  <BarRow key={item.source} label={item.source?.replace(/_/g, " ") || "Unknown"} value={item.total_leads} max={maxSourceLeads} color={BAR_COLORS[index % BAR_COLORS.length]} />
                ))}
              </Card>

              <Card title="Conversion Funnel">
                {!conversion?.stages?.length ? <EmptyState /> : conversion.stages.map((item, index) => (
                  <BarRow key={item.stage} label={item.stage} value={item.count} max={maxStageCount} color={BAR_COLORS[index % BAR_COLORS.length]} />
                ))}
              </Card>
            </>
          )
        ) : null}

        {activeTab === "funnel" ? (
          funnelLoading ? <Spinner /> : (
            <>
              <View style={styles.statGrid}>
                <StatTile label="Open, untouched, no follow-up due" value={stalledCount} icon="alert-circle-outline" tone="pink" iconBg={colors.dangerSoft} />
              </View>

              <Card title="Sales Funnel Drop-off">
                {!funnelStages.length ? <EmptyState /> : (
                  <>
                    {funnelStages.map((item, index) => (
                      <BarRow key={item.id} label={item.name} value={item.reached_count} max={maxFunnelReached} color={BAR_COLORS[0]} />
                    ))}
                    <TableHeader columns={[{ label: "STAGE", flex: 2 }, { label: "REACHED", align: "right" }, { label: "DROP-OFF", align: "right" }]} />
                    {funnelStages.map((item, index) => (
                      <View key={item.id} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 2, fontWeight: "700" }]}>{item.name}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right" }]}>{item.reached_count}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right", color: colors.danger }]}>{index > 0 ? `${item.drop_off_count} (${item.drop_off_pct}%)` : "-"}</Text>
                      </View>
                    ))}
                  </>
                )}
              </Card>

              <Card title="Where Leads Leak">
                {!funnelLeaks.length ? <EmptyState message="No lost leads in this period" /> : (
                  <>
                    <TableHeader columns={[{ label: "LOST FROM", flex: 2 }, { label: "LOST LEADS", align: "right" }, { label: "LOST VALUE", align: "right" }]} />
                    {funnelLeaks.map((item, index) => (
                      <View key={index} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 2, fontWeight: "700" }]}>{item.from_stage || "Unknown"}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right", color: colors.danger, fontWeight: "700" }]}>{item.lost_count}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right" }]}>Rs {item.lost_value.toLocaleString("en-IN")}</Text>
                      </View>
                    ))}
                  </>
                )}
              </Card>

              <Card title="Time in Stage">
                {!timeInStage.length ? <EmptyState /> : (
                  <>
                    <TableHeader columns={[{ label: "STAGE", flex: 2 }, { label: "AVG TIME", align: "right" }, { label: "STUCK", align: "right" }]} />
                    {timeInStage.map((item, index) => (
                      <View key={index} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 2, fontWeight: "700" }]}>{item.stage}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right" }]}>{fmtDuration(item.avg_seconds_in_stage)}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right", color: colors.warning, fontWeight: "700" }]}>{item.currently_in_stage}</Text>
                      </View>
                    ))}
                  </>
                )}
              </Card>
            </>
          )
        ) : null}

        {activeTab === "team" ? (
          <>
            {loading ? <Spinner /> : (
              <Card title="Staff Performance">
                {!byStaff.length ? <EmptyState /> : (
                  <>
                    <TableHeader columns={[{ label: "NAME", flex: 1.4 }, { label: "LEADS", align: "right" }, { label: "WON", align: "right" }, { label: "LOST", align: "right" }, { label: "CONV.", align: "right" }]} />
                    {byStaff.map((item, index) => (
                      <View key={index} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 1.4, fontWeight: "700" }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right" }]}>{item.total_leads}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right", color: colors.success, fontWeight: "700" }]}>{item.won}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right", color: colors.danger }]}>{item.lost}</Text>
                        <Text style={[styles.tableCell, { textAlign: "right", fontWeight: "700" }]}>{item.total_leads > 0 ? ((item.won / item.total_leads) * 100).toFixed(1) : 0}%</Text>
                      </View>
                    ))}
                  </>
                )}
              </Card>
            )}

            <View style={styles.trendHeaderRow}>
              <Text style={styles.trendTitle}>Trends</Text>
              <Dropdown value={String(trendDays)} options={TREND_DAY_OPTIONS.map((d) => ({ value: String(d), label: `Last ${d} Days` }))} onSelect={(value) => setTrendDays(Number(value))} />
            </View>

            <Card title="Response Time Trend (avg minutes)">
              {trendLoading ? <Spinner /> : !responseTrend.length ? <EmptyState /> : responseTrend.map((point, index) => (
                <BarRow key={index} label={fmtDate(point.period)} value={point.avg_response_seconds ? Math.round(point.avg_response_seconds / 60) : 0} max={Math.max(1, ...responseTrend.map((p) => p.avg_response_seconds ? Math.round(p.avg_response_seconds / 60) : 0))} color="#6366f1" sub="min" />
              ))}
            </Card>

            <Card title="Follow-up Completion Trend">
              {trendLoading ? <Spinner /> : !followupTrend.length ? <EmptyState /> : followupTrend.map((point, index) => (
                <View key={index} style={{ marginBottom: 10 }}>
                  <Text style={styles.barLabel}>{fmtDate(point.period)}</Text>
                  <BarRow label="Scheduled" value={point.scheduled} max={Math.max(1, ...followupTrend.map((p) => Math.max(p.scheduled, p.completed)))} color="#f59e0b" />
                  <BarRow label="Completed" value={point.completed} max={Math.max(1, ...followupTrend.map((p) => Math.max(p.scheduled, p.completed)))} color="#10b981" />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {activeTab === "campaigns" ? (
          loading ? <Spinner /> : (
            <Card title="Campaign ROI">
              {!byCampaign.length ? <EmptyState message="No campaigns yet" /> : (
                <>
                  <TableHeader columns={[{ label: "CAMPAIGN", flex: 2 }, { label: "LEADS", align: "right" }, { label: "CPL", align: "right" }, { label: "WON", align: "right" }]} />
                  {byCampaign.map((item, index) => (
                    <View key={index} style={styles.tableRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.tableCell} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.tableSubCell} numberOfLines={1}>{item.source?.replace(/_/g, " ")} - Rs {Number(item.actual_spend || 0).toLocaleString("en-IN")}</Text>
                      </View>
                      <Text style={[styles.tableCell, { textAlign: "right" }]}>{item.total_leads}</Text>
                      <Text style={[styles.tableCell, { textAlign: "right", color: colors.primary, fontWeight: "700" }]}>Rs {item.cpl}</Text>
                      <Text style={[styles.tableCell, { textAlign: "right", color: colors.success }]}>{item.won || 0}</Text>
                    </View>
                  ))}
                </>
              )}
            </Card>
          )
        ) : null}

        {activeTab === "leads" ? (
          <Card title="Lead Detail Report">
            <Pressable style={styles.filterButton} onPress={() => setFilterSheetOpen(true)}>
              <View style={styles.filterButtonIcon}>
                <Ionicons name="options-outline" size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterButtonTitle}>Filters{activeLeadFilterCount ? ` (${activeLeadFilterCount})` : ""}</Text>
                <Text style={styles.filterButtonMeta} numberOfLines={1}>
                  {activeLeadFilterCount ? [gridStageLabel, gridAttachmentLabel, gridStalled ? "Stalled only" : ""].filter(Boolean).join(" - ") : "All leads"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>

            {gridLoading ? <Spinner /> : !gridLeads.length ? <EmptyState message="No leads match these filters" /> : (
              <>
                {gridLeads.map((lead) => (
                  <Pressable key={lead.id} style={styles.leadRow} onPress={() => router.push(`/(app)/leads/${lead.id}`)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
                      <Text style={styles.leadMeta} numberOfLines={1}>{lead.lead_number ? `${lead.lead_number} - ` : ""}{lead.phone} - {lead.assigned_to_name || "Unassigned"}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.leadStage}>{lead.stage}</Text>
                      {lead.attachment_count ? (
                        <View style={styles.attachmentPill}><Ionicons name="attach-outline" size={11} color={colors.success} /><Text style={styles.attachmentText}>{lead.attachment_count}</Text></View>
                      ) : <Text style={styles.leadMeta}>No file</Text>}
                    </View>
                  </Pressable>
                ))}
                <View style={styles.paginationRow}>
                  <Text style={styles.paginationText}>{Math.min((gridPage - 1) * PAGE_SIZE + 1, gridTotal)}-{Math.min(gridPage * PAGE_SIZE, gridTotal)} of {gridTotal}</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable style={[styles.pageButton, gridPage === 1 && styles.pageButtonDisabled]} disabled={gridPage === 1} onPress={() => setGridPage((page) => Math.max(1, page - 1))}>
                      <Ionicons name="chevron-back" size={16} color={gridPage === 1 ? colors.textMuted : colors.primary} />
                    </Pressable>
                    <Pressable style={[styles.pageButton, gridPage === gridPages && styles.pageButtonDisabled]} disabled={gridPage === gridPages} onPress={() => setGridPage((page) => Math.min(gridPages, page + 1))}>
                      <Ionicons name="chevron-forward" size={16} color={gridPage === gridPages ? colors.textMuted : colors.primary} />
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </Card>
        ) : null}
      </ScrollView>

      <Modal visible={filterSheetOpen} transparent animationType="fade" onRequestClose={() => setFilterSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setFilterSheetOpen(false)}>
          <Pressable style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Lead filters</Text>
              {activeLeadFilterCount ? (
                <Pressable onPress={() => { setGridPage(1); setGridStage(""); setGridAttachment(""); setGridStalled(false); }}>
                  <Text style={styles.clearFiltersText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.sheetLabel}>Stage</Text>
            <Dropdown value={gridStage} options={stageOptions} onSelect={(value) => changeGridFilter(setGridStage, value)} />
            <Text style={styles.sheetLabel}>Attachment</Text>
            <Dropdown value={gridAttachment} options={attachmentOptions} onSelect={(value) => changeGridFilter(setGridAttachment, value)} />
            <Pressable style={styles.stalledRow} onPress={() => { setGridPage(1); setGridStalled((current) => !current); }}>
              <Checkbox status={gridStalled ? "checked" : "unchecked"} onPress={() => { setGridPage(1); setGridStalled((current) => !current); }} color={colors.primary} />
              <Text style={styles.stalledText}>Stalled only</Text>
            </Pressable>
            <Pressable style={styles.applyFilterButton} onPress={() => setFilterSheetOpen(false)}>
              <Text style={styles.applyFilterText}>Apply filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: "transparent" },
  headerTitle: { color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  topRow: { ...glass, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  topRowSubtitle: { flex: 1, color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  tabRow: { paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tabChip: { minHeight: 42, minWidth: 96, flexGrow: 1, flexBasis: "30%", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.62)", alignItems: "center", justifyContent: "center" },
  tabChipActive: { backgroundColor: colors.primary },
  tabChipText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontFamily: "Inter_700Bold" },
  tabChipTextActive: { color: "#fff" },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  spinnerWrap: { paddingVertical: 40, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: "center", paddingVertical: 16, fontFamily: "Inter_500Medium" },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  statTile: { ...glass, width: "47%", flexGrow: 1, minHeight: 104, padding: 14 },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 1, fontFamily: "Inter_600SemiBold" },

  card: { ...glass, padding: 14, marginBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 12 },

  barRow: { marginBottom: 10 },
  barRowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { flex: 1, color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  barValue: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_700Bold" },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: "rgba(224,242,254,0.72)", overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },

  tableHeaderRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingBottom: 8, marginBottom: 4 },
  tableHeaderText: { color: colors.textMuted, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  tableCell: { flex: 1, color: colors.text, fontSize: 12, fontFamily: "Inter_500Medium" },
  tableSubCell: { color: colors.textMuted, fontSize: 10, marginTop: 2, textTransform: "capitalize" },

  trendHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  trendTitle: { color: colors.text, fontSize: 14, fontFamily: "Inter_700Bold" },

  dropdown: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.82)", maxWidth: 170 },
  dropdownText: { color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold", flexShrink: 1 },

  filterButton: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.74)", borderRadius: 14, padding: 12, marginBottom: 12 },
  filterButtonIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  filterButtonTitle: { color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" },
  filterButtonMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: "Inter_500Medium" },
  stalledRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 12 },
  stalledText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.28)" },
  filterSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.7)" },
  sheetHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  sheetHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetTitle: { color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  clearFiltersText: { color: colors.primary, fontSize: 13, fontFamily: "Inter_700Bold" },
  sheetLabel: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 10, marginBottom: 8 },
  applyFilterButton: { backgroundColor: colors.primary, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingVertical: 14, marginTop: 4 },
  applyFilterText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },

  leadRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, gap: 10 },
  leadName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  leadMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  leadStage: { color: colors.primary, fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  attachmentPill: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  attachmentText: { color: colors.success, fontSize: 10, fontWeight: "700" },

  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, marginTop: 4 },
  paginationText: { color: colors.textMuted, fontSize: 11 },
  pageButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  pageButtonDisabled: { opacity: 0.4 },
});
