import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { fetchStaff } from "@/api/staff";
import {
  AgentReportRow, createTopup, fetchAgentReport, fetchVoiceCalls, fetchVoiceNumbers, fetchVoiceRates, fetchVoiceStatus, fetchVoiceWallet,
  fetchWalletTransactions, TopupPayment, verifyTopup, VoiceCall, VoiceNumber, VoiceRate, VoiceStatus, VoiceWallet, WalletTransaction,
} from "@/api/voice";
import {
  callResult, CallTone, chargeText, durationText, EMPTY_FILTERS, filterCalls, formatDuration, formatMinor, latestCallByLead,
  localDay, OUTCOME_OPTIONS, outcomeLabel, retryableLeadIds, STATUS_FILTERS, toMinor,
} from "@/utils/voiceCall";

// Lavender page, white cards, indigo actions (same look as the website's Calling page on a phone).
const UI = { bg: "#f6f5fb", line: "#e7e5f1", ink: "#12142b", sub: "#5f6480", muted: "#8b8fa8", accent: "#4f46e5", accentSoft: "#eceafc", track: "#e6e7ec" };
const PILL: Record<CallTone, { bg: string; fg: string }> = {
  ok: { bg: "#dcfce7", fg: "#15803d" }, bad: { bg: "#fde2e2", fg: "#b91c1c" }, warn: { bg: "#fef3c7", fg: "#92400e" },
  live: { bg: "#dbeafe", fg: "#1d4ed8" }, muted: { bg: "#eceef3", fg: "#5b6275" },
};
const PRESETS = ["500", "1000", "2500", "5000"];

type TabKey = "history" | "agents" | "wallet" | "rates";

function errorText(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    if (typeof error.response?.data?.error === "string") return error.response.data.error;
    if (error.response?.status === 403) return "You don't have permission to view this.";
  }
  return fallback;
}

// Razorpay's checkout is a native add-on: it exists in the development / release build, not in Expo Go.
interface RazorpayModule { open: (options: Record<string, unknown>) => Promise<TopupPayment> }
function loadRazorpay(): RazorpayModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("react-native-razorpay");
    return (module.default || module) as RazorpayModule;
  } catch { return null; }
}

function Pill({ tone, label }: { tone: CallTone; label: string }) {
  return <View style={[styles.pill, { backgroundColor: PILL[tone].bg }]}><Text style={[styles.pillText, { color: PILL[tone].fg }]}>{label}</Text></View>;
}

function Message({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={styles.messageBox}>
      <Text style={styles.messageText}>{text}</Text>
      {onRetry ? <Pressable onPress={onRetry} hitSlop={8}><Text style={styles.link}>Try again</Text></Pressable> : null}
    </View>
  );
}

// ---- History ------------------------------------------------------------------------------------------------------

type FilterKey = "agent" | "status" | "outcome" | "date";
const DATE_OPTIONS = [{ value: "", label: "Any date" }, { value: "today", label: "Today" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }];

function dayOffset(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return localDay(d.toISOString());
}

function HistoryTab({ isAdmin, calls, names }: { isAdmin: boolean; calls: VoiceCall[]; names: Record<string, string> }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [datePreset, setDatePreset] = useState("");
  const [open, setOpen] = useState<FilterKey | null>(null);

  const all = useMemo(() => calls.filter((c) => c.status !== "authorized"), [calls]); // an unused authorization is not a call
  const rows = useMemo(() => filterCalls(all, filters), [all, filters]);
  const latest = useMemo(() => latestCallByLead(all), [all]);
  const retryIds = useMemo(() => new Set(retryableLeadIds(all)), [all]);
  const canRetry = (c: VoiceCall) => !!c.lead_id && latest.get(c.lead_id) === c && retryIds.has(c.lead_id);
  const retryable = rows.filter(canRetry);
  const agentIds = [...new Set(all.map((c) => c.agent_id).filter(Boolean) as string[])];

  function pickDate(value: string) {
    setDatePreset(value);
    setFilters((f) => ({ ...f, from: value === "today" ? dayOffset(0) : value ? dayOffset(Number(value)) : "", to: "" }));
  }

  const chips: { key: FilterKey; label: string; options: { value: string; label: string }[]; value: string; set: (v: string) => void }[] = [
    ...(isAdmin && agentIds.length ? [{
      key: "agent" as const, label: "All agents", value: filters.agent, set: (v: string) => setFilters((f) => ({ ...f, agent: v })),
      options: [{ value: "", label: "All agents" }, ...agentIds.map((id) => ({ value: id, label: names[id] || "Agent" }))],
    }] : []),
    { key: "status", label: "Any status", value: filters.status, set: (v) => setFilters((f) => ({ ...f, status: v })), options: [{ value: "", label: "Any status" }, ...STATUS_FILTERS] },
    { key: "outcome", label: "Any outcome", value: filters.outcome, set: (v) => setFilters((f) => ({ ...f, outcome: v })), options: [{ value: "", label: "Any outcome" }, ...OUTCOME_OPTIONS] },
    { key: "date", label: "Date", value: datePreset, set: pickDate, options: DATE_OPTIONS },
  ];
  const active = chips.find((chip) => chip.key === open);
  const filtered = !!(filters.agent || filters.status || filters.outcome || filters.from);

  // Calls go out from the lead's own page; the first lead that needs a retry opens there.
  function retryFailed() {
    const first = retryable[0]?.lead_id;
    if (first) router.push(`/(app)/leads/${first}` as never);
  }

  if (!all.length) return <Message text="No calls yet. Open a lead and tap Call." />;

  return (
    <View style={styles.stack}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {chips.map((chip) => (
          <Pressable key={chip.key} onPress={() => setOpen(open === chip.key ? null : chip.key)} style={[styles.chip, (chip.value || open === chip.key) && styles.chipActive]}>
            <Text style={[styles.chipText, chip.value ? styles.chipTextActive : null]} numberOfLines={1}>
              {chip.options.find((o) => o.value === chip.value)?.label || chip.label}
            </Text>
            <Ionicons name={open === chip.key ? "chevron-up" : "chevron-down"} size={12} color={chip.value ? UI.accent : UI.muted} />
          </Pressable>
        ))}
      </ScrollView>
      {active ? (
        <View style={styles.optionsPanel}>
          {active.options.map((option) => (
            <Pressable key={option.value || "any"} onPress={() => { active.set(option.value); setOpen(null); }} style={styles.optionRow}>
              <Text style={[styles.optionText, option.value === active.value && styles.optionTextActive]}>{option.label}</Text>
              {option.value === active.value ? <Ionicons name="checkmark" size={16} color={UI.accent} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable onPress={retryFailed} disabled={!retryable.length} style={[styles.retryAll, !retryable.length && { opacity: 0.4 }]} accessibilityRole="button">
        <Ionicons name="refresh" size={15} color="#fff" />
        <Text style={styles.retryAllText}>Retry failed ({retryable.length})</Text>
      </Pressable>

      {rows.length === 0 ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>No calls match these filters.</Text>
          {filtered ? <Pressable onPress={() => { setFilters(EMPTY_FILTERS); setDatePreset(""); }}><Text style={styles.link}>Clear filters</Text></Pressable> : null}
        </View>
      ) : rows.map((call) => {
        const r = callResult(call);
        const when = call.started_at ? new Date(call.started_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—";
        const agent = call.agent_id ? names[call.agent_id] || "Agent" : "";
        const detail = [when, agent, r.connected ? [durationText(call), chargeText(call)].filter((x) => x !== "—").join(" · ") : r.reason, r.outcome ? outcomeLabel(r.outcome) : ""].filter(Boolean).join(" · ");
        return (
          <View key={call.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.number}>{call.to_number}</Text>
              <Pill tone={r.tone} label={r.label} />
            </View>
            <Text style={styles.detail}>{detail}</Text>
            <View style={styles.cardActions}>
              {call.lead_id ? (
                <Pressable style={[styles.outlineBtn, { flex: 1 }]} onPress={() => router.push(`/(app)/leads/${call.lead_id}` as never)} accessibilityRole="button">
                  <Text style={styles.outlineBtnText}>Open lead</Text>
                </Pressable>
              ) : null}
              {canRetry(call) ? (
                <Pressable style={[styles.softBtn, { flex: 1 }]} onPress={() => router.push(`/(app)/leads/${call.lead_id}` as never)} accessibilityRole="button">
                  <Text style={styles.softBtnText}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
      <Text style={styles.footnote}>Showing the latest {all.length} call{all.length === 1 ? "" : "s"}.</Text>
    </View>
  );
}

// ---- Agents -------------------------------------------------------------------------------------------------------

function AgentsTab({ rows }: { rows: AgentReportRow[] }) {
  if (!rows.length) return <Message text="No calls in the last 30 days." />;
  return (
    <View style={styles.stack}>
      {rows.map((r) => (
        <View key={r.agent_id} style={styles.card}>
          <Text style={styles.number}>{r.name}</Text>
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={styles.statValue}>{r.calls}</Text><Text style={styles.statLabel}>Calls</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{r.connected}</Text><Text style={styles.statLabel}>Connected</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{formatDuration(Number(r.billable_seconds))}</Text><Text style={styles.statLabel}>Talk time</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{formatMinor(r.spend_minor, r.currency)}</Text><Text style={styles.statLabel}>Spend</Text></View>
          </View>
        </View>
      ))}
    </View>
  );
}

// ---- Wallet -------------------------------------------------------------------------------------------------------

function WalletTab({ wallet, transactions, isAdmin, onChanged }: { wallet: VoiceWallet | null; transactions: WalletTransaction[]; isAdmin: boolean; onChanged: () => void }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const minor = toMinor(amount);

  async function pay() {
    if (!wallet || !minor || minor === "0") { Alert.alert("Enter an amount", "Enter a valid amount to add."); return; }
    const Razorpay = loadRazorpay();
    if (!Razorpay) { Alert.alert("Payments aren't available here", "Recharging needs the installed CurveLead app. It doesn't work in Expo Go."); return; }
    setBusy(true);
    try {
      const order = await createTopup(minor);
      let payment: TopupPayment;
      try {
        payment = await Razorpay.open({
          key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
          name: "CurveLead", description: "Calling wallet recharge",
          prefill: { name: user?.name || "", email: user?.email || "" }, theme: { color: UI.accent },
        });
      } catch (checkoutError) {
        const reason = checkoutError as { code?: number; description?: string };
        if (reason?.code === 0 || /cancel/i.test(reason?.description || "")) return; // closing the sheet isn't an error
        Alert.alert("Payment failed", reason?.description || "The payment could not be completed. Please try again.");
        return;
      }
      try {
        // The balance changes only once the server has confirmed the payment with Razorpay.
        const result = await verifyTopup(payment);
        Alert.alert(result.result === "pending" ? "Payment received" : "Wallet recharged", result.result === "pending" ? "Your balance will update as soon as it is confirmed." : "Your calling wallet has been topped up.");
        onChanged();
      } catch (verifyError) {
        Alert.alert("Payment received, not confirmed", `${errorText(verifyError, "We couldn't confirm it yet.")}\n\nIf money was taken, contact support with payment ID ${payment.razorpay_payment_id}.`);
      }
    } catch (startError) {
      Alert.alert("Couldn't start the payment", errorText(startError, "Please try again."));
    } finally { setBusy(false); }
  }

  if (!wallet) return <Message text="No calling wallet yet. Contact support to enable calling." />;
  return (
    <View style={styles.stack}>
      <View style={styles.balanceRow}>
        <View style={[styles.card, styles.balanceCard]}><Text style={styles.statLabel}>Available</Text><Text style={styles.balance}>{formatMinor(wallet.available_balance, wallet.currency)}</Text></View>
        <View style={[styles.card, styles.balanceCard]}><Text style={styles.statLabel}>Reserved for calls</Text><Text style={styles.balance}>{formatMinor(wallet.reserved_balance, wallet.currency)}</Text></View>
      </View>

      {isAdmin ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recharge wallet ({wallet.currency})</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((preset) => (
              <Pressable key={preset} onPress={() => setAmount(preset)} style={[styles.preset, amount === preset && styles.presetActive]}>
                <Text style={[styles.presetText, amount === preset && { color: "#fff" }]}>{preset}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amountInput} accessibilityLabel="Amount" placeholderTextColor={UI.muted} />
          <Pressable onPress={pay} disabled={busy || !minor} style={[styles.payBtn, (busy || !minor) && { opacity: 0.6 }]} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.payText}>Pay {minor ? formatMinor(minor, wallet.currency) : ""}</Text>}
          </Pressable>
        </View>
      ) : null}

      {transactions.length ? transactions.map((tx) => (
        <View key={tx.id} style={[styles.card, styles.txRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.txType}>{tx.transaction_type.replace(/_/g, " ")}</Text>
            <Text style={styles.detail}>{new Date(tx.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</Text>
          </View>
          <Text style={styles.txAmount}>{formatMinor(tx.amount, tx.currency)}</Text>
        </View>
      )) : <Text style={styles.footnote}>No wallet activity yet.</Text>}
    </View>
  );
}

// ---- Rates --------------------------------------------------------------------------------------------------------

function RatesTab({ numbers, rates }: { numbers: VoiceNumber[]; rates: VoiceRate[] }) {
  return (
    <View style={styles.stack}>
      <Text style={styles.sectionTitle}>Authorized caller IDs</Text>
      {numbers.length ? numbers.map((n) => (
        <View key={n.id} style={[styles.card, styles.txRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.number}>{n.phone_number_e164}</Text>
            <Text style={styles.detail}>{n.country_code}</Text>
          </View>
          <Pill tone={n.verification_status === "verified" ? "ok" : "warn"} label={n.verification_status === "verified" ? "Verified" : n.verification_status.replace(/_/g, " ")} />
        </View>
      )) : <Message text="No caller IDs yet. Caller IDs are added and verified by CurveLead support." />}

      <Text style={[styles.sectionTitle, { marginTop: 6 }]}>Countries &amp; rates</Text>
      {rates.length ? rates.map((rate, index) => (
        <View key={`${rate.destination_country}-${rate.call_type}-${index}`} style={[styles.card, styles.txRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.number}>{rate.destination_country} · +{rate.destination_prefix}</Text>
            <Text style={styles.detail}>{rate.call_type === "any" ? "Any type" : rate.call_type.replace(/_/g, " ")} · billed in {rate.billing_increment_seconds}s</Text>
          </View>
          <Text style={styles.txAmount}>{rate.display}</Text>
        </View>
      )) : <Message text="No routes are enabled for your workspace yet. Countries are enabled after provider and compliance review." />}
    </View>
  );
}

// ---- Screen -------------------------------------------------------------------------------------------------------

export default function CallingScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [tab, setTab] = useState<TabKey>("history");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [wallet, setWallet] = useState<VoiceWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [numbers, setNumbers] = useState<VoiceNumber[]>([]);
  const [rates, setRates] = useState<VoiceRate[]>([]);
  const [report, setReport] = useState<AgentReportRow[]>([]);
  const [status, setStatus] = useState<VoiceStatus | null>(null);

  // Each request is independent: one failing (or the workspace not having calling set up) never blanks the others.
  // They run one after another so opening the screen doesn't burst the server's rate limit.
  const load = useCallback(async () => {
    setError("");
    let firstError = "";
    const run = async <T,>(fn: () => Promise<T>, apply: (value: T) => void) => {
      try { apply(await fn()); } catch (e) { firstError = firstError || errorText(e, "Couldn't load calling details."); }
    };
    await run(fetchVoiceStatus, setStatus);
    await run(fetchVoiceWallet, setWallet);
    await run(() => fetchVoiceCalls(200), setCalls);
    await run(fetchWalletTransactions, setTransactions);
    await run(fetchVoiceNumbers, setNumbers);
    await run(fetchVoiceRates, setRates);
    if (isAdmin) {
      await run(fetchAgentReport, setReport);
      await run(fetchStaff, (staff) => setNames(Object.fromEntries(staff.map((member) => [member.id, member.name]))));
    }
    setError(firstError);
    setLoading(false); setRefreshing(false);
  }, [isAdmin]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tabs: { key: TabKey; label: string }[] = [
    { key: "history", label: "History" }, ...(isAdmin ? [{ key: "agents" as const, label: "Agents" }] : []),
    { key: "wallet", label: "Wallet" }, { key: "rates", label: "Rates" },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={UI.ink} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>CURVELEAD</Text>
          <Text style={styles.title}>Calling</Text>
        </View>
        {wallet ? (
          <Pressable onPress={() => setTab("wallet")} style={styles.walletPill} accessibilityRole="button" accessibilityLabel="Open wallet">
            <Text style={styles.walletLabel}>Wallet </Text>
            <Text style={styles.walletValue}>{formatMinor(wallet.available_balance, wallet.currency)}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.segmented}>
        {tabs.map((item) => (
          <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.segment, tab === item.key && styles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }}>
            <Text style={[styles.segmentText, tab === item.key && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UI.accent} colors={[UI.accent]} />}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? <ActivityIndicator color={UI.accent} style={{ marginTop: 40 }} /> : (
          <>
            {status && !status.enabled ? <View style={styles.notice}><Text style={styles.noticeText}>Calling isn't switched on for your workspace yet. Contact CurveLead support to enable it.</Text></View> : null}
            {status?.enabled && !status.canCall ? <View style={styles.notice}><Text style={styles.noticeText}>Your account can view calling, but isn't allowed to place calls. Ask an admin for access.</Text></View> : null}
            {error && !calls.length && !wallet ? <Message text={error} onRetry={() => { setLoading(true); load(); }} /> : null}
            {tab === "history" && !(error && !calls.length && !wallet) ? <HistoryTab isAdmin={isAdmin} calls={calls} names={names} /> : null}
            {tab === "agents" ? <AgentsTab rows={report} /> : null}
            {tab === "wallet" ? <WalletTab wallet={wallet} transactions={transactions} isAdmin={isAdmin} onChanged={load} /> : null}
            {tab === "rates" ? <RatesTab numbers={numbers} rates={rates} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: "#ffffff" },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  brand: { color: UI.accent, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  title: { color: UI.ink, fontSize: 24, fontWeight: "800" },
  walletPill: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#fff", paddingHorizontal: 12, height: 38 },
  walletLabel: { color: UI.sub, fontSize: 13 },
  walletValue: { color: UI.ink, fontSize: 14, fontWeight: "800" },

  segmented: { flexDirection: "row", backgroundColor: UI.track, borderRadius: 14, padding: 4, marginHorizontal: 16, marginTop: 12 },
  segment: { flex: 1, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: UI.accent },
  segmentText: { color: "#3b3f55", fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: "#fff" },

  content: { padding: 16, gap: 12 },
  stack: { gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  number: { color: UI.ink, fontSize: 16, fontWeight: "800" },
  detail: { color: UI.sub, fontSize: 12, marginTop: 4 },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  outlineBtn: { height: 42, borderRadius: 10, borderWidth: 1, borderColor: UI.line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  outlineBtnText: { color: UI.accent, fontSize: 14, fontWeight: "800" },
  softBtn: { height: 42, borderRadius: 10, backgroundColor: UI.accentSoft, alignItems: "center", justifyContent: "center" },
  softBtnText: { color: UI.accent, fontSize: 14, fontWeight: "800" },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "800" },

  chipRow: { gap: 8, paddingRight: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: UI.line, backgroundColor: "#fff" },
  chipActive: { borderColor: UI.accent },
  chipText: { color: UI.sub, fontSize: 13, fontWeight: "600", maxWidth: 140 },
  chipTextActive: { color: UI.accent, fontWeight: "800" },
  optionsPanel: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: UI.line, overflow: "hidden" },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, height: 42 },
  optionText: { color: UI.ink, fontSize: 14 },
  optionTextActive: { color: UI.accent, fontWeight: "800" },
  retryAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12, backgroundColor: UI.accent },
  retryAllText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  statRow: { flexDirection: "row", marginTop: 10, gap: 6 },
  stat: { flex: 1 },
  statValue: { color: UI.ink, fontSize: 14, fontWeight: "800" },
  statLabel: { color: UI.sub, fontSize: 12, marginTop: 2 },

  balanceRow: { flexDirection: "row", gap: 10 },
  balanceCard: { flex: 1 },
  balance: { color: UI.ink, fontSize: 24, fontWeight: "800", marginTop: 6 },
  sectionTitle: { color: UI.ink, fontSize: 16, fontWeight: "800" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  preset: { height: 38, paddingHorizontal: 18, borderRadius: 19, borderWidth: 1, borderColor: UI.line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  presetActive: { backgroundColor: UI.accent, borderColor: UI.accent },
  presetText: { color: "#3b3f55", fontSize: 13, fontWeight: "700" },
  amountInput: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 14, marginTop: 10, color: UI.ink, fontSize: 16, backgroundColor: "#fff" },
  payBtn: { height: 48, borderRadius: 12, backgroundColor: UI.accent, alignItems: "center", justifyContent: "center", marginTop: 10 },
  payText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  txRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  txType: { color: UI.ink, fontSize: 15, fontWeight: "800", textTransform: "capitalize" },
  txAmount: { color: UI.ink, fontSize: 15, fontWeight: "800" },

  notice: { backgroundColor: "#fef3c7", borderRadius: 12, padding: 12 },
  noticeText: { color: "#92400e", fontSize: 13, lineHeight: 18 },
  messageBox: { alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 12 },
  messageText: { color: UI.sub, fontSize: 14, textAlign: "center", lineHeight: 20 },
  link: { color: UI.accent, fontSize: 13, fontWeight: "800" },
  footnote: { color: UI.muted, fontSize: 12, textAlign: "center", marginTop: 4 },
});
