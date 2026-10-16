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

export async function fetchStaff() {
  const { data } = await apiClient.get<{ staff: StaffMember[] }>("/staff");
  return data.staff || [];
}
