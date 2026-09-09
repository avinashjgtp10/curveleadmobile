import { apiClient } from "./client";

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected";

export interface QuotationItem {
  name: string;
  description?: string;
  quantity: number;
  price: number;
}

export interface Quotation {
  id: string;
  quote_number: string;
  lead_id: string;
  title?: string;
  lead_name: string;
  lead_phone: string;
  status: QuotationStatus;
  items: QuotationItem[];
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  valid_until?: string;
  terms?: string;
  notes?: string;
  rejection_reason?: string;
  created_at: string;
}

export async function fetchQuotations(params?: { lead_id?: string; status?: QuotationStatus }) {
  const { data } = await apiClient.get<{ quotations: Quotation[] }>("/quotations", { params });
  return data.quotations || [];
}

export async function fetchQuotation(id: string) {
  const { data } = await apiClient.get<{ quotation: Quotation }>(`/quotations/${id}`);
  return data.quotation;
}

export interface CreateQuotationInput {
  lead_id: string;
  title?: string;
  items: QuotationItem[];
  discount_percent?: number;
  tax_percent?: number;
  valid_until?: string;
  terms?: string;
  notes?: string;
}

export async function createQuotation(input: CreateQuotationInput) {
  const { data } = await apiClient.post<{ quotation: Quotation }>("/quotations", input);
  return data.quotation;
}

export async function updateQuotation(id: string, input: Partial<CreateQuotationInput>) {
  const { data } = await apiClient.put<{ quotation: Quotation }>(`/quotations/${id}`, input);
  return data.quotation;
}

export async function sendQuotation(id: string) {
  const { data } = await apiClient.post<{ whatsapp_url: string; message: string }>(`/quotations/${id}/send`);
  return data;
}

export async function acceptQuotation(id: string) {
  await apiClient.post(`/quotations/${id}/accept`);
}

export async function rejectQuotation(id: string, reason?: string) {
  await apiClient.post(`/quotations/${id}/reject`, { reason });
}

export async function deleteQuotation(id: string) {
  await apiClient.delete(`/quotations/${id}`);
}
