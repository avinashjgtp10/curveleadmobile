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

export async function fetchStaff() {
  const { data } = await apiClient.get<{ staff: StaffMember[] }>("/staff");
  return data.staff || [];
}
