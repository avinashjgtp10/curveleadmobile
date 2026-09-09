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

export async function fetchStaff() {
  const { data } = await apiClient.get<{ staff: StaffMember[] }>("/staff");
  return data.staff || [];
}
