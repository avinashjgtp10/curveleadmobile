import { apiClient } from "./client";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "staff" | "admin" | "super_admin";
  is_active: boolean;
  assigned_leads?: number;
}

// Each team member can send from their own WhatsApp Business number. The token is write-only: the server never returns it.
export async function fetchStaffWhatsApp(staffId: string) {
  const { data } = await apiClient.get<{ whatsapp_phone_number_id?: string | null }>(`/staff/${staffId}/whatsapp-number`);
  return { whatsapp_phone_number_id: data.whatsapp_phone_number_id || "" };
}

export async function saveStaffWhatsApp(staffId: string, input: { whatsapp_phone_number_id: string; whatsapp_access_token: string }) {
  await apiClient.put(`/staff/${staffId}/whatsapp-number`, input);
}

// Emails the person a link to set their own password (the same call the web Team page makes).
export async function inviteStaffMember(input: { name: string; email: string; phone: string; role: "staff" | "admin"; team_id?: string }) {
  await apiClient.post("/staff/invite", { ...input, team_id: input.team_id || undefined });
}

export async function fetchStaff() {
  const { data } = await apiClient.get<{ staff: StaffMember[] }>("/staff");
  return data.staff || [];
}
