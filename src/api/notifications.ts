import { apiClient } from "./client";
import { fetchTodayFollowups, TodayFollowup } from "./leads";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCAL_NOTIFICATIONS_KEY = "curvelead_local_notifications";

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  created_at?: string;
  read_at?: string | null;
  type?: string;
  lead_id?: string;
  lead_name?: string;
  lead_phone?: string;
  lead_stage?: string;
}

type LocalNotificationInput = Pick<AppNotification, "title" | "message" | "type" | "lead_id" | "lead_name" | "lead_phone" | "lead_stage">;

function normalizeNotification(item: Partial<AppNotification> & Record<string, unknown>): AppNotification {
  return {
    id: String(item.id || item.notification_id || `${item.type || "notification"}-${item.created_at || Date.now()}`),
    title: String(item.title || item.message || "Notification"),
    message: typeof item.message === "string" ? item.message : undefined,
    created_at: typeof item.created_at === "string" ? item.created_at : undefined,
    read_at: typeof item.read_at === "string" || item.read_at === null ? item.read_at : undefined,
    type: typeof item.type === "string" ? item.type : undefined,
    lead_id: typeof item.lead_id === "string" ? item.lead_id : undefined,
    lead_name: typeof item.lead_name === "string" ? item.lead_name : undefined,
    lead_phone: typeof item.lead_phone === "string" ? item.lead_phone : undefined,
    lead_stage: typeof item.lead_stage === "string" ? item.lead_stage : undefined,
  };
}

function followupToNotification(item: TodayFollowup): AppNotification {
  return {
    id: `followup-${item.id}`,
    title: `Follow-up overdue - ${item.lead_name}`,
    message: item.next_followup_at,
    created_at: item.next_followup_at,
    type: "followup",
    lead_id: item.lead_id,
    lead_name: item.lead_name,
    lead_phone: item.lead_phone,
    lead_stage: item.lead_stage,
    read_at: null,
  };
}

async function getLocalNotifications() {
  const raw = await AsyncStorage.getItem(LOCAL_NOTIFICATIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeNotification(item as Partial<AppNotification> & Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

async function saveLocalNotification(input: LocalNotificationInput) {
  const current = await getLocalNotifications();
  const now = new Date().toISOString();
  const next: AppNotification[] = [
    {
      id: `local-${input.type || "notification"}-${Date.now()}`,
      title: input.title,
      message: input.message,
      created_at: now,
      read_at: null,
      type: input.type,
      lead_id: input.lead_id,
      lead_name: input.lead_name,
      lead_phone: input.lead_phone,
      lead_stage: input.lead_stage,
    },
    ...current,
  ].slice(0, 100);
  await AsyncStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(next));
}

/**
 * Ids the user has already read on this phone. The server doesn't always remember a read
 * (the request can fail, or it doesn't cover items like overdue follow-ups), so the list and the
 * home bell badge both apply this — otherwise the two screens show different unread counts.
 */
const READ_IDS_KEY = "curvelead_read_notification_ids";
const MAX_READ_IDS = 500;

async function getReadIds() {
  try {
    const raw = await AsyncStorage.getItem(READ_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

async function rememberRead(ids: string[]) {
  const current = await getReadIds();
  ids.forEach((id) => current.add(id));
  await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(Array.from(current).slice(-MAX_READ_IDS)));
}

export async function fetchNotifications() {
  const [localNotifications, readIds] = await Promise.all([getLocalNotifications(), getReadIds()]);
  const withReadState = (list: AppNotification[]) => list.map((item) => (
    item.read_at || !readIds.has(item.id) ? item : { ...item, read_at: new Date().toISOString() }
  ));
  try {
    const { data } = await apiClient.get<{ notifications?: AppNotification[] } | AppNotification[]>("/notifications");
    const items = Array.isArray(data) ? data : data.notifications || [];
    return withReadState([...localNotifications, ...items.map((item) => normalizeNotification(item as Partial<AppNotification> & Record<string, unknown>))]);
  } catch {
    const followups = await fetchTodayFollowups();
    return withReadState([...localNotifications, ...followups.map(followupToNotification)]);
  }
}

/** Pass the ids currently on screen so they stay read here even if the server ignores the request. */
export async function markAllNotificationsRead(ids: string[] = []) {
  const localNotifications = await getLocalNotifications();
  const readAt = new Date().toISOString();
  await rememberRead([...ids, ...localNotifications.map((item) => item.id)]);
  await AsyncStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(localNotifications.map((item) => ({ ...item, read_at: item.read_at || readAt }))));
  await apiClient.put("/notifications/read-all").catch(() => {});
}

export async function markNotificationRead(id: string) {
  await rememberRead([id]);
  const localNotifications = await getLocalNotifications();
  if (localNotifications.some((item) => item.id === id)) {
    const readAt = new Date().toISOString();
    await AsyncStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(localNotifications.map((item) => item.id === id ? { ...item, read_at: item.read_at || readAt } : item)));
  }
  await apiClient.put(`/notifications/${id}/read`).catch(() => {});
}

/** Mirrors an incoming push notification into the same local store the in-app list reads from. */
export async function saveIncomingPushNotification(input: LocalNotificationInput) {
  await saveLocalNotification(input);
}

export async function notifyLeadCreated(lead: { id: string; name: string; phone?: string; stage?: string; source?: string }) {
  await saveLocalNotification({
    title: `New lead created - ${lead.name}`,
    message: lead.source ? `Source: ${lead.source}` : "Lead added successfully.",
    type: "lead_created",
    lead_id: lead.id,
    lead_name: lead.name,
    lead_phone: lead.phone,
    lead_stage: lead.stage || "new",
  });
}

/** A WhatsApp message was sent from this app. Replies and automation messages come from the server, not here. */
export async function notifyMessageSent(lead: { id: string; name: string; phone?: string; stage?: string }) {
  await saveLocalNotification({
    title: `WhatsApp message sent - ${lead.name}`,
    message: "Your message was sent.",
    type: "message_sent",
    lead_id: lead.id,
    lead_name: lead.name,
    lead_phone: lead.phone,
    lead_stage: lead.stage,
  });
}

export async function notifyLeadsDeleted(leads: { id: string; name: string }[]) {
  for (const lead of leads) {
    await saveLocalNotification({
      title: `Lead deleted - ${lead.name}`,
      message: "This lead was deleted.",
      type: "lead_deleted",
      lead_name: lead.name,
    });
  }
}
