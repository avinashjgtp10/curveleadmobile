import { apiClient } from "./client";

// CurveLead Voice: the same /voice endpoints the website's Calling page uses.

export interface VoiceCall {
  id: string;
  lead_id?: string | null;
  agent_id?: string | null;
  to_number: string;
  status: string;
  started_at?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
  answered_at?: string | null;
  duration_seconds?: number | null;
  customer_cost?: string | number | null;
  currency?: string;
  outcome?: string | null;
  hangup_cause?: string | null;
}

export interface VoiceWallet {
  available_balance: string | number;
  reserved_balance: string | number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  transaction_type: string;
  amount: string | number;
  currency: string;
  created_at: string;
}

export interface VoiceNumber {
  id: string;
  phone_number_e164: string;
  country_code: string;
  verification_status: string;
}

export interface VoiceRate {
  destination_country: string;
  destination_prefix: string;
  call_type: string;
  display: string;
  billing_increment_seconds: number;
}

export interface AgentReportRow {
  agent_id: string;
  name: string;
  calls: number;
  connected: number;
  billable_seconds: string | number;
  spend_minor: string | number;
  currency: string;
}

export interface TopupOrder {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
}

export interface TopupPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

// The server returns the latest calls first; filtering happens on the phone.
export async function fetchVoiceCalls(limit = 200) {
  const { data } = await apiClient.get<VoiceCall[]>("/voice/calls", { params: { limit } });
  return Array.isArray(data) ? data : [];
}

// A 404 / empty body means the workspace has no calling wallet yet.
export async function fetchVoiceWallet() {
  const { data } = await apiClient.get<VoiceWallet | null>("/voice/wallet");
  return data && typeof data === "object" ? data : null;
}

export async function fetchWalletTransactions(limit = 50) {
  const { data } = await apiClient.get<WalletTransaction[]>("/voice/wallet/transactions", { params: { limit } });
  return Array.isArray(data) ? data : [];
}

export async function fetchVoiceNumbers() {
  const { data } = await apiClient.get<VoiceNumber[]>("/voice/numbers");
  return Array.isArray(data) ? data : [];
}

export async function fetchVoiceRates() {
  const { data } = await apiClient.get<VoiceRate[]>("/voice/rates");
  return Array.isArray(data) ? data : [];
}

export async function fetchAgentReport() {
  const { data } = await apiClient.get<AgentReportRow[]>("/voice/reports/agents");
  return Array.isArray(data) ? data : [];
}

export async function createTopup(amountMinor: string) {
  const { data } = await apiClient.post<TopupOrder>("/voice/wallet/topup", { amountMinor });
  return data;
}

export async function verifyTopup(payment: TopupPayment) {
  const { data } = await apiClient.post<{ result?: string }>("/voice/wallet/topup/verify", payment, { timeout: 30000 });
  return data;
}

export interface VoiceStatus {
  enabled: boolean;
  accountStatus: string;
  canCall: boolean;
  currency: string | null;
}

/** Whether calling is switched on for this workspace, and whether this person may place calls. */
export async function fetchVoiceStatus() {
  const { data } = await apiClient.get<VoiceStatus>("/voice/status");
  return data;
}
