export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source?: string; // e.g. "meta_ad", "referral", "walk_in"
  status: LeadStatus;
  score?: number; // AI lead score (Groq), 0-100
  assignedTo?: string; // staff id
  createdAt: string;
  updatedAt: string;
}

export interface Followup {
  id: string;
  leadId: string;
  note: string;
  dueAt: string;
  completed: boolean;
  createdBy: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "sales";
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  tenantId: string;
}
