import { apiClient } from "./client";

export type BillingCycle = "monthly" | "yearly";

export interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  max_users?: number;
  features: string[];
}

export interface CurrentBilling {
  plan_id?: string;
  plan_name?: string;
  status: string;
  billing_cycle?: BillingCycle;
  current_period_end?: string;
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  invoice_url?: string;
}

// The server's field names vary a little between endpoints, so read them leniently.
/* eslint-disable @typescript-eslint/no-explicit-any */
function toPlan(raw: any): Plan {
  const monthly = Number(raw.monthly_price ?? raw.price_monthly ?? raw.price ?? raw.amount ?? 0);
  const yearly = Number(raw.yearly_price ?? raw.price_yearly ?? monthly * 12);
  return {
    id: String(raw.id ?? raw.plan_id ?? raw.name),
    name: String(raw.name ?? raw.plan_name ?? "Plan"),
    monthly_price: monthly,
    yearly_price: yearly,
    currency: String(raw.currency ?? "USD").toUpperCase(),
    max_users: raw.max_users ?? raw.users ?? raw.user_limit ?? undefined,
    features: Array.isArray(raw.features) ? raw.features.map(String) : [],
  };
}

export async function fetchPlans() {
  const { data } = await apiClient.get("/payments/plans");
  const list = Array.isArray(data) ? data : data.plans || [];
  return list.map(toPlan) as Plan[];
}

export async function fetchCurrentBilling(): Promise<CurrentBilling> {
  const { data } = await apiClient.get("/billing/current");
  const raw = data.billing ?? data.subscription ?? data;
  return {
    plan_id: raw.plan_id ?? raw.plan?.id,
    plan_name: raw.plan_name ?? raw.plan?.name ?? (typeof raw.plan === "string" ? raw.plan : undefined),
    status: String(raw.status ?? "inactive"),
    billing_cycle: raw.billing_cycle ?? raw.cycle,
    current_period_end: raw.current_period_end ?? raw.renews_at ?? raw.expires_at,
  };
}

export async function fetchInvoices() {
  const { data } = await apiClient.get("/billing/invoices");
  const list = Array.isArray(data) ? data : data.invoices || [];
  return list.map((raw: any): Invoice => ({
    id: String(raw.id),
    amount: Number(raw.amount ?? raw.total ?? 0),
    currency: String(raw.currency ?? "USD").toUpperCase(),
    status: String(raw.status ?? "paid"),
    created_at: raw.created_at ?? raw.date ?? "",
    invoice_url: raw.invoice_url ?? raw.url ?? raw.pdf_url,
  }));
}
