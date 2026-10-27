import { apiClient } from "./client";
import { fetchTodayFollowups, TodayFollowup } from "./leads";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { presentLocalNotification } from "@/notifications/push";

const LOCAL_NOTIFICATIONS_KEY = "curvelead_local_notifications";

export interface NotificationGroup {
  key: string;
  label: string;
  description: string;
}

// Used if /notifications/groups can't be reached. Keys must match the backend's notificationTypes.
export const FALLBACK_NOTIFICATION_GROUPS: NotificationGroup[] = [
  { key: "new_leads", label: "New leads", description: "A new lead came in from any source." },
  { key: "new_messages", label: "New WhatsApp messages", description: "A lead sends you a new WhatsApp message." },
  { key: "assigned_to_me", label: "Leads assigned to me", description: "A lead is assigned or reassigned to you." },
  { key: "sla_alerts", label: "Uncontacted lead alerts", description: "A lead has gone too long without a first response." },
  { key: "followups", label: "Follow-up & demo reminders", description: "A follow-up or demo is due soon, overdue, or was never scheduled." },
  { key: "ai_handoff", label: "AI handoff needed", description: "The AI auto-reply needs a human to take over a conversation." },
  { key: "hot_leads", label: "Hot lead escalation", description: "A hot lead or priority-campaign lead needs personal attention." },
];

export async function fetchNotificationGroups() {
  const { data } = await apiClient.get<{ groups?: NotificationGroup[] }>("/notifications/groups");
  return data.groups?.length ? data.groups : FALLBACK_NOTIFICATION_GROUPS;
}

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

function normalizeNotification(raw: Partial<AppNotification> & Record<string, unknown>): AppNotification {
  // Servers vary: fields may sit at the top level or inside a `data`/`meta` object, and ids may be numbers.
  const nested = [raw.data, raw.meta, raw.payload].find((value) => value && typeof value === "object") as Record<string, unknown> | undefined;
  const item: Record<string, unknown> = { ...nested, ...raw };
  const asText = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined);
  const leadId = asText(item.lead_id ?? item.leadId);
  return {
    // The fallback must be stable between fetches, otherwise an item without an id loses its read state every time.
    id: String(item.id || item.notification_id || `${item.type || "notification"}-${item.created_at || ""}-${item.title || item.message || ""}`),
    title: String(item.title || item.message || "Notification"),
    message: typeof item.message === "string" ? item.message : undefined,
    created_at: typeof item.created_at === "string" ? item.created_at : undefined,
    read_at: typeof item.read_at === "string" || item.read_at === null ? item.read_at : undefined,
    type: typeof item.type === "string" ? item.type : undefined,
    lead_id: leadId,
    lead_name: asText(item.lead_name),
    lead_phone: asText(item.lead_phone),
    lead_stage: asText(item.lead_stage),
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

// Every read-modify-write of the local list runs one at a time, so two saves close together can't overwrite each other.
let storageQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = storageQueue.then(task, task);
  storageQueue = run.catch(() => {});
  return run;
}

let localIdCounter = 0;

function saveLocalNotifications(inputs: LocalNotificationInput[]) {
  return serialized(async () => {
    const current = await getLocalNotifications();
    const now = new Date().toISOString();
    const created: AppNotification[] = inputs.map((input) => ({
      // The counter keeps ids unique even when several are created in the same millisecond.
      id: `local-${input.type || "notification"}-${Date.now()}-${localIdCounter++}`,
      title: input.title,
      message: input.message,
      created_at: now,
      read_at: null,
      type: input.type,
      lead_id: input.lead_id,
      lead_name: input.lead_name,
      lead_phone: input.lead_phone,
      lead_stage: input.lead_stage,
    }));
    await AsyncStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify([...created, ...current].slice(0, 100)));
  });
}

function saveLocalNotification(input: LocalNotificationInput) {
  return saveLocalNotifications([input]);
}

function newestFirst(list: AppNotification[]) {
  const time = (item: AppNotification) => {
    const value = new Date(item.created_at || "").getTime();
    return Number.isNaN(value) ? 0 : value;
  };
  return [...list].sort((a, b) => time(b) - time(a));
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
    const serverItems = items.map((item) => normalizeNotification(item as Partial<AppNotification> & Record<string, unknown>));
    // A push received in the foreground is mirrored locally and also returned by the server — keep one copy.
    const key = (item: AppNotification) => `${item.title}|${item.message ?? ""}`;
    const localByKey = new Map(localNotifications.map((item) => [key(item), item]));
    const serverKeys = new Set(serverItems.map(key));
    // For a duplicate keep the server copy (it owns read state) but borrow the lead details
    // from the local one, so tapping it can still open the lead.
    const merged = serverItems.map((item) => {
      const local = localByKey.get(key(item));
      return local ? { ...item, lead_id: item.lead_id || local.lead_id, lead_name: item.lead_name || local.lead_name, lead_phone: item.lead_phone || local.lead_phone, lead_stage: item.lead_stage || local.lead_stage } : item;
    });
    return withReadState(newestFirst([...localNotifications.filter((item) => !serverKeys.has(key(item))), ...merged]));
  } catch {
    // Never let a failing follow-ups call hide the locally saved notifications (e.g. "New lead created").
    const followups = await fetchTodayFollowups().catch(() => []);
    return withReadState(newestFirst([...localNotifications, ...followups.map(followupToNotification)]));
  }
}

/** Pass the ids currently on screen so they stay read here even if the server ignores the request. */
export async function markAllNotificationsRead(ids: string[] = []) {
  const readAt = new Date().toISOString();
  await serialized(async () => {
    const localNotifications = await getLocalNotifications();
    await rememberRead([...ids, ...localNotifications.map((item) => item.id)]);
    await AsyncStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(localNotifications.map((item) => ({ ...item, read_at: item.read_at || readAt }))));
  });
  await apiClient.put("/notifications/read-all").catch(() => {});
}

export async function markNotificationRead(id: string) {
  await serialized(async () => {
    await rememberRead([id]);
    const localNotifications = await getLocalNotifications();
    if (localNotifications.some((item) => item.id === id)) {
      const readAt = new Date().toISOString();
      await AsyncStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(localNotifications.map((item) => item.id === id ? { ...item, read_at: item.read_at || readAt } : item)));
    }
  });
  await apiClient.put(`/notifications/${id}/read`).catch(() => {});
}

/** Mirrors an incoming push notification into the same local store the in-app list reads from. */
export async function saveIncomingPushNotification(input: LocalNotificationInput) {
  await saveLocalNotification(input);
}

export async function notifyLeadCreated(lead: { id: string; name: string; phone?: string; stage?: string; source?: string }) {
  const input: LocalNotificationInput = {
    title: `New lead created - ${lead.name}`,
    message: lead.source ? `Source: ${lead.source}` : "Lead added successfully.",
    type: "lead_created",
    lead_id: lead.id,
    lead_name: lead.name,
    lead_phone: lead.phone,
    lead_stage: lead.stage || "new",
  };
  await saveLocalNotification(input);
  await presentLocalNotification(input.title, input.message, {
    type: input.type, lead_id: input.lead_id, lead_name: input.lead_name, lead_phone: input.lead_phone, lead_stage: input.lead_stage,
  });
}

/** For leads that arrive in bulk (spreadsheet import, Facebook sync) rather than one at a time. */
export async function notifyLeadsAdded(count: number, source: string) {
  if (count <= 0) return;
  const input: LocalNotificationInput = {
    title: `${count} new ${count === 1 ? "lead" : "leads"} added`,
    message: `Source: ${source}`,
    type: "lead_created",
  };
  await saveLocalNotification(input);
  await presentLocalNotification(input.title, input.message, { type: input.type });
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
  if (!leads.length) return;
  // One entry and one alert for the whole batch: separate entries would flood the 100-item list and push out older ones.
  await saveLocalNotification(leads.length === 1
    ? { title: `Lead deleted - ${leads[0].name}`, message: "This lead was deleted.", type: "lead_deleted", lead_name: leads[0].name }
    : { title: `${leads.length} leads deleted`, message: "The selected leads were deleted.", type: "lead_deleted" });
  await presentLocalNotification(
    leads.length === 1 ? `Lead deleted - ${leads[0].name}` : `${leads.length} leads deleted`,
    leads.length === 1 ? "This lead was deleted." : "The selected leads were deleted.",
    { type: "lead_deleted" },
  );
}
