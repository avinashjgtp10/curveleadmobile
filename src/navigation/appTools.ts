import { Ionicons } from "@expo/vector-icons";
import { UserRole } from "@/types";

// One list of every tool in the app. The dashboard's "Manage your business" grid and the More menu both read it,
// so they always offer the same features. Order = the dashboard grid order: the workspace menu first, extras after.
export type ToolTone = "blue" | "purple" | "pink" | "orange" | "green" | "indigo" | "gray";

export const TOOL_TONES: Record<ToolTone, { bg: string; fg: string }> = {
  blue: { bg: "#dbe5fb", fg: "#2457e6" },
  purple: { bg: "#e7dffb", fg: "#6d4fd6" },
  pink: { bg: "#fde1ea", fg: "#d6336c" },
  orange: { bg: "#fde9c9", fg: "#c2710c" },
  green: { bg: "#d8f0e5", fg: "#0f7b5f" },
  indigo: { bg: "#e0e7ff", fg: "#4338ca" },
  gray: { bg: "#e5e9f2", fg: "#475569" },
};

/** Where the More menu shows it: the blue banner, the tool grid, the Manage list or the Preferences list. */
export type ToolGroup = "agent" | "tools" | "manage" | "preferences";

export interface AppTool {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: string;
  tone: ToolTone;
  group: ToolGroup;
  /** Small badge on the dashboard tile, e.g. "AI". */
  badge?: string;
  /** Undefined = everyone. */
  roles?: UserRole[];
}

const ADMINS: UserRole[] = ["admin", "super_admin"];

export const APP_TOOLS: AppTool[] = [
  { icon: "people-outline", label: "Leads", href: "/(app)/leads", tone: "blue", group: "tools" },
  { icon: "folder-open-outline", label: "Brochures", href: "/(app)/more/brochures", tone: "orange", group: "tools" },
  { icon: "trending-up-outline", label: "Ads Manager", href: "/(app)/more/campaigns", tone: "green", group: "tools" },
  { icon: "sparkles-outline", label: "AI Agent", href: "/(app)/more/ai-tools", tone: "purple", group: "agent", badge: "AI" },
  { icon: "logo-whatsapp", label: "WhatsApp", href: "/(app)/more/whatsapp", tone: "green", group: "tools" },
  { icon: "location-outline", label: "GMB", href: "/(app)/more/gmb", tone: "pink", group: "tools" },
  { icon: "calendar-outline", label: "Appointments", href: "/(app)/more/appointments", tone: "blue", group: "tools" },
  { icon: "document-text-outline", label: "Quotations", href: "/(app)/more/quotations", tone: "purple", group: "tools" },
  { icon: "git-network-outline", label: "Lead Automation", href: "/(app)/more/lead-automation", tone: "green", group: "tools" },
  { icon: "person-add-outline", label: "Team", href: "/(app)/more/team", tone: "pink", group: "manage", roles: ADMINS },
  { icon: "bar-chart-outline", label: "Reports", href: "/(app)/more/reports", tone: "gray", group: "manage" },
  { icon: "school-outline", label: "Sales Coaching", href: "/(app)/more/sales-coaching", tone: "orange", group: "tools" },
  { icon: "globe-outline", label: "Market AI", href: "/(app)/more/market-ai", tone: "indigo", group: "tools", badge: "AI" },
  { icon: "power-outline", label: "Integrations", href: "/(app)/more/integrations", tone: "purple", group: "manage", roles: ADMINS },
  { icon: "card-outline", label: "Billing", href: "/(app)/more/billing", tone: "blue", group: "manage", roles: ADMINS },
  { icon: "settings-outline", label: "Settings", href: "/(app)/more/settings", tone: "gray", group: "preferences" },
  { icon: "help-buoy-outline", label: "Help & Support", href: "/(app)/more/help-support", tone: "green", group: "preferences" },
  { icon: "book-outline", label: "User Guide", href: "/(app)/more/user-guide", tone: "orange", group: "preferences" },
  // Everything else the app offers.
  { icon: "checkmark-circle-outline", label: "Follow-ups", href: "/(app)/followups", tone: "blue", group: "tools" },
  { icon: "albums-outline", label: "Content Library", href: "/(app)/content", tone: "purple", group: "tools" },
  { icon: "chatbox-ellipses-outline", label: "Message Templates", href: "/(app)/more/templates", tone: "blue", group: "tools" },
  { icon: "document-attach-outline", label: "WhatsApp Templates", href: "/(app)/more/whatsapp-templates", tone: "green", group: "tools" },
  { icon: "notifications-outline", label: "Notifications", href: "/(app)/notifications", tone: "orange", group: "preferences" },
  { icon: "options-outline", label: "Notification Settings", href: "/(app)/more/notification-settings", tone: "orange", group: "preferences" },
  { icon: "lock-closed-outline", label: "Security", href: "/(app)/more/security", tone: "purple", group: "preferences" },
  { icon: "language-outline", label: "Language", href: "/(app)/more/language", tone: "orange", group: "preferences" },
  { icon: "bulb-outline", label: "Submit Feedback", href: "/(app)/more/feedback", tone: "pink", group: "preferences" },
  { icon: "person-outline", label: "Account", href: "/(app)/more/account", tone: "gray", group: "preferences" },
  { icon: "shield-checkmark-outline", label: "Super Admin", href: "/(app)/more/super-admin", tone: "gray", group: "manage", roles: ["super_admin"] },
];

export function toolVisible(tool: AppTool, role?: UserRole) {
  return !tool.roles || (!!role && tool.roles.includes(role));
}
