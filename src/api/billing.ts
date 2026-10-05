import { apiClient } from "./client";

export type BillingCycle = "monthly" | "yearly";

export interface PlanPrice {
  /** In the currency's smallest unit (paise, cents), exactly as the server sends it. */
  amount: number;
  currency: string;
}

export interface Plan {
  id: string;
  name: string;
  /** Negative means unlimited. */
  max_users?: number | null;
  amount: number;
  currency: string;
  prices: Partial<Record<BillingCycle, PlanPrice>>;
  checkoutEnabled: boolean;
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Same call the web billing page makes. Prices come back per billing period.
export async function fetchPlans(): Promise<Plan[]> {
  const { data } = await apiClient.get("/payments/plans");
  const list = Array.isArray(data) ? data : data.plans || [];
  return list.map((raw: Record<string, any>): Plan => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: String(raw.id ?? raw.name),
    name: String(raw.name ?? "Plan"),
    max_users: raw.max_users ?? null,
    amount: toNumber(raw.amount),
    currency: String(raw.currency || "USD").toUpperCase(),
    prices: {
      monthly: raw.prices?.monthly ? { amount: toNumber(raw.prices.monthly.amount), currency: String(raw.prices.monthly.currency || raw.currency || "USD").toUpperCase() } : undefined,
      yearly: raw.prices?.yearly ? { amount: toNumber(raw.prices.yearly.amount), currency: String(raw.prices.yearly.currency || raw.currency || "USD").toUpperCase() } : undefined,
    },
    checkoutEnabled: !!raw.checkoutEnabled,
  }));
}

export interface SubscriptionOrder {
  razorpayKeyId: string;
  subscriptionId: string;
  description?: string;
  prefill?: { name?: string; email?: string };
}

// Step 1 of paying, the same call the website makes: the server creates the Razorpay subscription.
export async function createSubscription(planName: string, billingPeriod: BillingCycle): Promise<SubscriptionOrder> {
  const { data } = await apiClient.post("/payments/create-subscription", { planName, billingPeriod }, { timeout: 30000 });
  return {
    razorpayKeyId: String(data.razorpayKeyId || ""),
    subscriptionId: String(data.subscriptionId || ""),
    description: data.plan?.description,
    prefill: data.prefill,
  };
}

export interface RazorpayPayment {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

// Step 3: the server checks the payment signature with Razorpay and only then activates the plan.
export async function verifySubscription(payment: RazorpayPayment, planName: string, billingPeriod: BillingCycle) {
  const { data } = await apiClient.post<{ message?: string }>("/payments/verify-subscription", { ...payment, planName, billingPeriod }, { timeout: 30000 });
  return data.message || "Payment successful. Your plan is active.";
}

/** What a plan costs for the chosen period, in whole currency units (not paise or cents). */
export function priceFor(plan: Plan, cycle: BillingCycle) {
  const price = plan.prices[cycle];
  return { amount: (price?.amount ?? plan.amount) / 100, currency: price?.currency ?? plan.currency };
}

export function formatPrice(amount: number, currency: string) {
  if (!amount) return "Free";
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toLocaleString(currency === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 0 })}`;
}
