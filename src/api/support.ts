import { apiClient } from "./client";

export type TicketPriority = "low" | "medium" | "high";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  priority?: TicketPriority;
  message?: string;
  status?: TicketStatus;
  created_at: string;
}

export interface CreateTicketInput {
  subject: string;
  category: string;
  priority: TicketPriority;
  message: string;
}

export async function fetchMyTickets() {
  const { data } = await apiClient.get<{ tickets: SupportTicket[] }>("/support/tickets");
  return data.tickets || [];
}

export async function createTicket(input: CreateTicketInput) {
  await apiClient.post("/support/tickets", input);
}
