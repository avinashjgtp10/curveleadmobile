import { apiClient } from "./client";

export interface AiKnowledge {
  about?: string;
  services_prices?: string;
  faqs?: string;
  tone?: string;
  goal?: string;
  never_say?: string;
  handoff_rules?: string;
  [key: string]: unknown;
}

export interface AiAgentState {
  enabled: boolean;
  knowledge: AiKnowledge;
}

export interface AiReply {
  id: string;
  lead_name: string;
  sent_at: string;
  lead_message?: string | null;
  reply: string;
}

export interface DraftAiAgentInput {
  website: string;
  businessType: string;
  businessContext?: string;
  groundRules?: string;
  agentName?: string;
  greeting?: string;
}

export const KNOWLEDGE_FIELDS: { key: string; label: string; hint: string; lines: number }[] = [
  { key: "about", label: "About the business", hint: "What you do and who you serve.", lines: 3 },
  { key: "services_prices", label: "Services and prices", hint: "Real prices only - the AI never invents them.", lines: 5 },
  { key: "faqs", label: "FAQs", hint: "Questions customers ask often, with answers.", lines: 5 },
  { key: "tone", label: "Tone and style", hint: "e.g. friendly, short, simple English.", lines: 2 },
  { key: "goal", label: "Main goal", hint: "e.g. book an appointment.", lines: 2 },
  { key: "never_say", label: "Never say or promise", hint: "Things the AI must avoid.", lines: 2 },
  { key: "handoff_rules", label: "Hand off to a human when", hint: "When a person should take over.", lines: 2 },
];

export async function fetchAiAgent(): Promise<AiAgentState> {
  const { data } = await apiClient.get("/whatsapp/hub/ai-knowledge");
  return { enabled: !!data.enabled, knowledge: (data.knowledge || {}) as AiKnowledge };
}

export async function saveAiAgent(enabled: boolean, knowledge: AiKnowledge) {
  await apiClient.put("/whatsapp/hub/ai-knowledge", { enabled, knowledge });
}

// The server reads the website and drafts the training, which can take a while.
export async function draftAiAgent(input: DraftAiAgentInput) {
  const { data } = await apiClient.post<{ knowledge: AiKnowledge }>("/whatsapp/hub/ai-agent/draft", input, { timeout: 90000 });
  return data.knowledge || {};
}

export async function fetchAiReplies() {
  const { data } = await apiClient.get<{ replies: AiReply[] }>("/whatsapp/hub/ai-replies");
  return data.replies || [];
}
