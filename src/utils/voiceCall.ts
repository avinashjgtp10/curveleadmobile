import type { VoiceCall } from "@/api/voice";

// Ported from the website's utils/voiceCall.js so a call reads the same on the phone and on the web.

/** Minor units (paise / fils / cents) to display text. Display only: never used for arithmetic. */
export function formatMinor(minor: string | number | null | undefined, currency = "INR") {
  if (minor === null || minor === undefined || minor === "") return "—";
  const value = Number(minor) / 100;
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export function formatDuration(seconds: number | null | undefined) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** "123.45" to "12345" without floats; null for anything that isn't a plain non-negative decimal. */
export function toMinor(major: string) {
  const m = /^(\d{1,12})(?:\.(\d*))?$/.exec(String(major ?? "").trim());
  if (!m) return null;
  const frac = m[2] || "";
  if (frac.length > 2) return null;
  return (m[1] + frac.padEnd(2, "0")).replace(/^0+(?=\d)/, "");
}

export const OUTCOME_OPTIONS = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "not_interested", label: "Not interested" },
  { value: "follow_up_required", label: "Call back later" },
  { value: "interested", label: "Interested" },
  { value: "none", label: "No outcome" },
];

export const STATUS_FILTERS = [
  { value: "connected", label: "Connected" }, { value: "no_answer", label: "No answer" }, { value: "busy", label: "Busy" },
  { value: "failed", label: "Failed" }, { value: "timed_out", label: "Timed out" }, { value: "canceled", label: "Cancelled" }, { value: "in_progress", label: "In progress" },
];

const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(OUTCOME_OPTIONS.map((o) => [o.value, o.label]));
export const outcomeLabel = (value?: string | null) => (value ? OUTCOME_LABEL[value] || value.replace(/_/g, " ") : "");

const NOT_CONNECTED_OUTCOMES = ["no_answer", "busy", "wrong_number"];
const CAUSE_REASON: Record<string, string> = {
  unallocated_number: "Invalid number", invalid_number: "Invalid number", number_changed: "Invalid number",
  user_busy: "Busy", no_answer: "No answer", timeout: "No answer", originator_cancel: "Cancelled",
  call_rejected: "Rejected", destination_out_of_order: "Unreachable", network_out_of_order: "Unreachable", unreachable: "Unreachable",
};
const STUCK_AFTER_MS = 60 * 1000;

const time = (value?: string | null) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
};

export type CallTone = "ok" | "bad" | "warn" | "live" | "muted";

export interface CallResult {
  connected: boolean;
  label: string;
  reason: string | null;
  outcome: string | null;
  tone: CallTone;
  retryable: boolean;
}

// A call still "initiating" after 60 seconds never got off the ground.
function isStuck(call: VoiceCall, nowMs: number) {
  const t = time(call.started_at) ?? time(call.created_at);
  return call.status === "initiating" && t !== null && nowMs - t > STUCK_AFTER_MS;
}

/** One truthful description of a call, whatever outcome the agent typed. */
export function callResult(call: VoiceCall, nowMs = Date.now()): CallResult {
  const status = call.status;
  const connected = !!call.answered_at && status === "completed";
  if (connected) return { connected: true, label: "Connected", reason: null, outcome: call.outcome || null, tone: "ok", retryable: false };
  if (status === "answered") return { connected: true, label: "In progress", reason: null, outcome: null, tone: "live", retryable: false };
  if (status === "ringing") return { connected: false, label: "Ringing", reason: null, outcome: null, tone: "live", retryable: false };
  if (status === "initiating") {
    return isStuck(call, nowMs)
      ? { connected: false, label: "Timed out", reason: "The call never started", outcome: null, tone: "warn", retryable: true }
      : { connected: false, label: "Starting", reason: null, outcome: null, tone: "live", retryable: false };
  }
  if (status === "authorized") return { connected: false, label: "Not started", reason: null, outcome: null, tone: "muted", retryable: false };
  const byStatus: Record<string, string> = { no_answer: "No answer", busy: "Busy", canceled: "Cancelled", failed: "Couldn’t connect" };
  const fromCause = CAUSE_REASON[String(call.hangup_cause || "").toLowerCase()];
  const reason = (status === "failed" ? fromCause : null) || byStatus[status] || "Couldn’t connect";
  // Never show "Connected" as the outcome of a call that didn't connect.
  const outcome = call.outcome && NOT_CONNECTED_OUTCOMES.includes(call.outcome) ? call.outcome : null;
  return { connected: false, label: "Not connected", reason, outcome, tone: status === "failed" ? "bad" : "muted", retryable: status === "failed" || status === "no_answer" || status === "busy" };
}

export const durationText = (call: VoiceCall) => (callResult(call).connected && call.duration_seconds != null ? formatDuration(call.duration_seconds) : "—");
export const chargeText = (call: VoiceCall) => (callResult(call).connected && call.customer_cost != null ? formatMinor(call.customer_cost, call.currency) : "—");

/** One key per status for filtering. */
export function statusKey(call: VoiceCall, nowMs = Date.now()) {
  const r = callResult(call, nowMs);
  if (r.connected && r.label === "Connected") return "connected";
  if (r.label === "Timed out") return "timed_out";
  if (r.tone === "live" || r.label === "Not started") return "in_progress";
  return ["no_answer", "busy", "failed", "canceled"].includes(call.status) ? call.status : "failed";
}

export interface CallFilters { agent: string; status: string; outcome: string; from: string; to: string }
export const EMPTY_FILTERS: CallFilters = { agent: "", status: "", outcome: "", from: "", to: "" };

/** YYYY-MM-DD for a timestamp, in the phone's own time zone. */
export function localDay(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function filterCalls(calls: VoiceCall[], filters: CallFilters, nowMs = Date.now()) {
  return calls.filter((c) => {
    if (filters.agent && c.agent_id !== filters.agent) return false;
    if (filters.status && statusKey(c, nowMs) !== filters.status) return false;
    if (filters.outcome) {
      const o = callResult(c, nowMs).outcome;
      if (filters.outcome === "none" ? !!o : o !== filters.outcome) return false;
    }
    if (filters.from || filters.to) {
      const day = c.started_at ? localDay(c.started_at) : "";
      if (!day || (filters.from && day < filters.from) || (filters.to && day > filters.to)) return false;
    }
    return true;
  });
}

/** The newest call per lead (the API returns calls newest first), so a lead reached afterwards isn't offered a retry. */
export function latestCallByLead(calls: VoiceCall[]) {
  const map = new Map<string, VoiceCall>();
  for (const c of calls) if (c.lead_id && !map.has(c.lead_id) && c.status !== "authorized") map.set(c.lead_id, c);
  return map;
}

/** Leads whose latest call never connected. */
export function retryableLeadIds(calls: VoiceCall[], nowMs = Date.now()) {
  return [...latestCallByLead(calls)].filter(([, c]) => callResult(c, nowMs).retryable).map(([id]) => id);
}
