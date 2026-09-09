import axios from "axios";
import { apiClient } from "@/api/client";

export type DashboardPeriod = "today" | "last_7_days" | "last_30_days";

function localDate(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export interface DashboardStage {
  name: string;
  color: string;
  count: number;
  pipeline_value: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface DashboardLead {
  id: string;
  name: string;
  phone: string;
  source?: string;
  stage: string;
  lead_score?: "hot" | "warm" | "cold";
  created_at: string;
}

export interface DashboardSummary {
  is_fallback?: boolean;
  total_leads: number;
  leads_today: number;
  leads_in_period: number;
  leads_change: number;
  hot_leads: number;
  won_in_period: number;
  total_revenue: number;
  revenue_in_period: number;
  revenue_change: number;
  conversion_rate: string;
  avg_deal_value: number;
  advance_collected_in_period: number;
  balance_due_in_period: number;
  followups_today: number;
  overdue_followups: number;
  demos_today: number;
  missed_followups: number;
  critical_followups: number;
  unassigned_leads: number;
  active_enrollments: number;
  completed_this_month: number;
  ai_replies_this_week: number;
  meta_leads_today: number;
  pipeline: DashboardStage[];
  recentLeads: DashboardLead[];
}

export async function fetchDashboard(period: DashboardPeriod) {
  const daysAgo = period === "today" ? 0 : period === "last_7_days" ? 6 : 29;
  const params = {
    period: "custom",
    date_from: localDate(daysAgo),
    date_to: localDate(),
  };
  try {
    const { data } = await apiClient.get<DashboardSummary>("/reports/summary", {
      params,
    });
    return data;
  } catch (error) {
    // Authentication and subscription errors need to reach the screen unchanged.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 402 || status === 403) throw error;

    // Older deployments may not have /reports/summary yet. Build a useful dashboard
    // from the long-standing lead endpoints until that deployment catches up.
    const [statsResponse, leadsResponse] = await Promise.all([
      apiClient.get<{
        byStage: Array<{ stage: string; count: string | number }>;
        thisMonth: number;
        conversionRate: number;
        todayFollowups: number;
        overdueFollowups: number;
      }>("/leads/stats"),
      apiClient.get<{
        leads: Array<{
          id: string; name: string; phone: string; source?: string; stage: string;
          lead_score?: "hot" | "warm" | "cold"; created_at: string;
        }>;
        pagination: { total: number };
      }>("/leads", { params: { limit: 6, page: 1, date_field: "created_at", date_from: params.date_from, date_to: params.date_to } }),
    ]);

    const stats = statsResponse.data;
    const leads = leadsResponse.data;
    const total = Number(leads.pagination?.total || 0);
    const won = stats.byStage.find(({ stage }) => ["won", "enrolled"].includes(stage?.toLowerCase()))?.count || 0;

    return {
      is_fallback: true,
      total_leads: total,
      leads_today: 0,
      leads_in_period: total,
      leads_change: 0,
      hot_leads: leads.leads.filter((lead) => lead.lead_score === "hot").length,
      won_in_period: Number(won),
      total_revenue: 0,
      revenue_in_period: 0,
      revenue_change: 0,
      conversion_rate: String(stats.conversionRate || 0),
      avg_deal_value: 0,
      advance_collected_in_period: 0,
      balance_due_in_period: 0,
      followups_today: Number(stats.todayFollowups || 0),
      overdue_followups: Number(stats.overdueFollowups || 0),
      demos_today: 0,
      missed_followups: 0,
      critical_followups: 0,
      unassigned_leads: 0,
      active_enrollments: 0,
      completed_this_month: 0,
      ai_replies_this_week: 0,
      meta_leads_today: 0,
      pipeline: stats.byStage.map(({ stage, count }) => ({
        name: stage || "Unknown", color: "teal", count: Number(count),
        pipeline_value: 0, is_won: ["won", "enrolled"].includes(stage?.toLowerCase()),
        is_lost: stage?.toLowerCase() === "lost",
      })),
      recentLeads: leads.leads,
    };
  }
}
