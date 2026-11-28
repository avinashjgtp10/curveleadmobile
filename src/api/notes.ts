import { apiClient } from "./client";

export type NoteType = "general" | "meeting" | "call" | "follow_up";

export interface LeadNote {
  id: string;
  note: string;
  note_type: NoteType;
  created_by_name?: string;
  created_at: string;
}

export async function fetchLeadNotes(leadId: string) {
  const { data } = await apiClient.get<{ notes: LeadNote[] }>(`/notes/lead/${leadId}`);
  return data.notes || [];
}

export async function createLeadNote(leadId: string, input: { note: string; note_type: NoteType }) {
  const { data } = await apiClient.post<{ note?: LeadNote }>(`/notes/lead/${leadId}`, input);
  return data?.note;
}

export async function updateLeadNote(leadId: string, noteId: string, note: string) {
  await apiClient.put(`/notes/lead/${leadId}/${noteId}`, { note });
}

export async function deleteLeadNote(leadId: string, noteId: string) {
  await apiClient.delete(`/notes/lead/${leadId}/${noteId}`);
}
