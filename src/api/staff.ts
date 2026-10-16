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

// An admin sets a team member's password directly (the same call the web Team page makes).
export async function setStaffPassword(staffId: string, password: string) {
  await apiClient.put(`/staff/${staffId}/password`, { password });
}

export interface StaffPermission {
  key: string;
  label: string;
  granted: boolean;
}

// The server defines which permissions exist and which ones this person has, so the list always comes from it.
export async function fetchStaffPermissions(staffId: string) {
  const { data } = await apiClient.get<{ permissions: StaffPermission[] }>(`/staff/${staffId}/permissions`);
  return data.permissions || [];
}

export async function saveStaffPermissions(staffId: string, permissions: StaffPermission[]) {
  const asObject = Object.fromEntries(permissions.map((item) => [item.key, item.granted]));
  await apiClient.put(`/staff/${staffId}/permissions`, { permissions: asObject });
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
