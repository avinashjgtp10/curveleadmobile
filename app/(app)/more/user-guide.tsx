import React, { Fragment, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

// Palette shared with the other redesigned screens: pale blue page, white cards, deep teal-blue links.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7" };

interface GuideTopic {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  warning?: string;
}

interface GuideGroup {
  title: string;
  topics: GuideTopic[];
}

const GUIDE_GROUPS: GuideGroup[] = [
  {
    title: "Getting Started",
    topics: [
      {
        key: "welcome",
        icon: "help-circle-outline",
        title: "Welcome to CurveLead",
        paragraphs: [
          "CurveLead helps you capture leads from ads/website/WhatsApp, track them through your sales pipeline, follow up on time, send quotations, and see where your team is winning or falling behind.",
          "The sidebar covers the main areas: **Leads** is where you'll spend most of your day; **Dashboard** and **Reports** tell you how things are going; **Settings** and **Integrations** are one-time setup.",
        ],
      },
      {
        key: "dashboard",
        icon: "grid-outline",
        title: "Dashboard",
        paragraphs: ["Your daily starting point — what needs attention today, at a glance."],
        bullets: [
          "**Action strip** — New Today, Follow-ups Today, Demos Today, Overdue, Hot Leads, Missed Follow-ups, and Critical Follow-ups. Click any tile to jump straight to the filtered leads list.",
          "**Overdue** is any pending follow-up past its due time. **Missed** narrows that to 48 hours–5 days overdue; **Critical** is more than 5 days overdue.",
          "Alert banners appear only when something needs action — unassigned leads, or leads with critical missed follow-ups. No banner means nothing urgent.",
          "Pipeline funnel, recent leads, lead sources, and team performance charts below the fold give the bigger picture.",
        ],
      },
    ],
  },
  {
    title: "Leads",
    topics: [
      {
        key: "managing-leads",
        icon: "people-outline",
        title: "Managing Leads",
        paragraphs: ["The Leads page is a filterable table of every lead, plus a Pipeline (kanban) view and a Follow-ups tab."],
        bullets: [
          "**Add a lead** with the \"+ Add Lead\" button, or let leads flow in automatically via Integrations (Facebook, website form, API, WhatsApp).",
          "**Filters** — Stage, Status, Score, Follow-up Health, Source, Assigned To, and date range. Active filters show as removable chips.",
          "Click a lead's name to open its detail panel without losing your filters/page position.",
          "Change **Stage** or **Status** directly from the table by clicking the value in that row.",
          "Switch to the **Pipeline** tab for a kanban board grouped by stage, or the **Follow-ups** tab to see only leads with a pending follow-up, colored by health.",
        ],
      },
      {
        key: "lead-intent",
        icon: "pulse-outline",
        title: "Lead Intent Index",
        paragraphs: [
          "Opening a lead shows a Lead Intent card at the top of the Overview tab — a quick read on how likely this lead is to convert and what to do next. Everything on it is calculated automatically from your team's own activity, not guessed by AI.",
        ],
        bullets: [
          "**Score & Level** — a 0–100 score and a Hot/Warm/Cold label. It goes up when the lead is contacted recently, responds well (status like \"Interested\"/\"Connected\"/\"Proposal\"), and follow-ups are on time. It drops for negative statuses (\"Not Interested\", \"No Answer\", \"Busy\"), follow-ups that keep getting rescheduled without a real outcome, or long gaps with no contact. A lead in a Won stage is always 100; a Lost stage is always 5.",
          "**Follow-up Health** — Good, Delayed (overdue <48h), Missed (48h–5 days), or Critical (5+ days). This is purely about timing: is someone from the team going to call this lead when they said they would.",
          "**Suggested next action** — a one-line recommendation (\"Follow up today\", \"Manager follow-up needed\", \"Call to confirm interest before marking Lost\", etc.) picked from whichever signal is worst right now.",
          "**Why** — a plain-language explanation listing exactly which signals contributed, so you can always see the reasoning, not just the number.",
          "**Score history** — expand it to see every past recalculation with its score and reason, so you can see how a lead's intent has trended over time.",
          "Click **\"Recalculate Intent\"** (or the lightning icon in the leads table) any time to refresh a lead's score after a call or status change — it updates instantly since there's no AI call involved.",
        ],
      },
      {
        key: "followups",
        icon: "time-outline",
        title: "Follow-ups & Appointments",
        paragraphs: ["Two main places to review follow-ups, filtered differently:"],
        bullets: [
          "**Leads → Follow-ups tab** — every pending follow-up across all types (call, WhatsApp, visit, demo), color-coded by health, alongside the lead's stage. This is the primary place to work from.",
          "**Appointments page** (sidebar) — just Demos specifically, grouped by Overdue/Today/Tomorrow/This Week/Later.",
        ],
        warning: "Marking a follow-up \"Done\" without a proper outcome, or repeatedly rescheduling it, will lower that lead's Intent Score — see Lead Intent Index above.",
      },
    ],
  },
  {
    title: "Selling",
    topics: [
      {
        key: "quotations",
        icon: "document-text-outline",
        title: "Quotations",
        paragraphs: ["Build itemized price quotes tied to a lead and send them straight to WhatsApp."],
        bullets: [
          "**\"New Quotation\"** → pick a lead, add line items, discount %, tax %, valid-until date, terms.",
          "**\"Save & Send on WhatsApp\"** sends it immediately; **\"Save Draft\"** lets you finish later.",
          "Every quotation gets a public shareable link — anyone with the link can view it, no login needed, so only put information you're comfortable sharing externally.",
          "When a client **Accepts** a sent quotation, the linked lead is automatically moved to Won. **Reject** prompts for an optional reason.",
          "Only draft quotations can be deleted or manually marked \"Sent.\"",
        ],
      },
      {
        key: "brochures",
        icon: "book-outline",
        title: "Brochures",
        paragraphs: ["Upload marketing PDFs/images once, then share them to any lead over WhatsApp in one click."],
        bullets: [
          "**\"Upload Brochure\"** — name, category (Products/Services/Pricing/Company/General), and the file.",
          "Filter by category, then use \"Share\" on a lead's Overview tab (Share Materials) or here to send via WhatsApp.",
          "Each brochure card shows how many times it's been shared.",
        ],
      },
      {
        key: "campaigns",
        icon: "megaphone-outline",
        title: "Campaigns",
        paragraphs: ["Track marketing campaigns and see which ones are actually producing leads."],
        bullets: [
          "**\"New Campaign\"** — name, source (Meta Ads/Google Ads/Instagram/etc.), budget, dates, status.",
          "Open a campaign to see Budget, Spent, Leads generated, and Cost Per Lead — CPL is calculated automatically from spend ÷ leads.",
          "Attribute leads to a campaign via the campaign field when a lead comes in (automatic for ad-integration leads, manual otherwise).",
        ],
      },
    ],
  },
  {
    title: "Communication",
    topics: [
      {
        key: "whatsapp-inbox",
        icon: "chatbubble-outline",
        title: "WhatsApp Inbox",
        paragraphs: [
          "A directory of every WhatsApp conversation you're having with leads — search by name or phone, click a conversation to jump into that lead's chat thread on their detail page. New inbound messages appear here automatically; there's nothing to set up beyond connecting WhatsApp in Integrations.",
        ],
      },
    ],
  },
  {
    title: "Team & Insights",
    topics: [
      {
        key: "team",
        icon: "people-circle-outline",
        title: "Team",
        paragraphs: ["Admins can add and manage staff accounts here."],
        bullets: [
          "**\"Add Member\"** — name, email, an initial password you set for them, and role (Staff or Admin).",
          "Staff only see leads assigned to them; Admins see everything.",
          "Admin accounts can't be removed from this page.",
        ],
      },
      {
        key: "reports",
        icon: "bar-chart-outline",
        title: "Reports",
        paragraphs: [
          "Read-only analytics: pick a period (Today/Week/Month/Last Month/Year) to see conversion rate, leads-by-source breakdown, the pipeline funnel, staff performance (leads/won/lost/conversion per rep), and campaign ROI.",
        ],
      },
      {
        key: "sales-coaching",
        icon: "bulb-outline",
        title: "Sales Coaching",
        paragraphs: [
          "An AI-generated playbook — best practices, common objections and how to handle them, phrases that work — built from your team's won/lost calls, plus a per-rep coaching table comparing each rep's average call score to the team average.",
        ],
        warning: "You need a few leads marked Won or Lost with analyzed calls attached before there's enough data to generate a playbook. Use \"Regenerate Now\" once you do.",
      },
      {
        key: "market-intelligence",
        icon: "globe-outline",
        title: "Market Intelligence",
        paragraphs: [
          "Fill in your industry, product/service, and target market to get an AI-generated market overview, ideal customer profile, competitor breakdown, opportunities/threats, and strategic recommendations.",
        ],
        warning: "This is based on the AI's general training data, not live research — treat it as a starting point, not real-time competitive intelligence. Results aren't saved; \"New Analysis\" discards the current one.",
      },
      {
        key: "integrations",
        icon: "link-outline",
        title: "Integrations",
        paragraphs: [
          "Connect the lead sources you actually use — this is a one-time setup, from the Integrations tab.",
        ],
        bullets: [
          "**Facebook / Instagram** and **Google Ads Lead Form** sync new leads in automatically once connected.",
          "**REST API** lets you push leads from any system — IndiaMART, JustDial, your own backend, Zapier.",
          "**Website Embed Form** captures leads from a form embedded on your own site.",
          "**WhatsApp Business API** sends automated appointment and demo confirmations to leads.",
          "Other providers (LinkedIn Ads, Google Forms, JotForm, WordPress, Wix, Zapier, Pabbly Connect, TikTok Ads, ClickFunnels) are marked \"Coming soon.\"",
        ],
      },
    ],
  },
];

function RichText({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <Text style={style}>
      {parts.map((part, index) => (
        <Fragment key={index}>{index % 2 === 1 ? <Text style={styles.bold}>{part}</Text> : part}</Fragment>
      ))}
    </Text>
  );
}

// "Your daily starting point — what needs attention today" reads as a heading plus a line; without a dash the
// topic's own title is the heading and the paragraph stays as the line.
function splitIntro(topic: GuideTopic) {
  const first = topic.paragraphs?.[0] || "";
  const dash = first.indexOf(" — ");
  if (dash > 0 && dash < 60) {
    const rest = first.slice(dash + 3).trim();
    return { heading: first.slice(0, dash).trim(), lead: rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "", more: topic.paragraphs?.slice(1) || [] };
  }
  return { heading: topic.title, lead: first, more: topic.paragraphs?.slice(1) || [] };
}

function GuideTopicDetail({ topic }: { topic: GuideTopic }) {
  const { heading, lead, more } = splitIntro(topic);
  return (
    <View style={styles.card}>
      <Text style={styles.detailHeading}>{heading}</Text>
      {lead ? <RichText text={lead} style={styles.paragraph} /> : null}
      {more.map((paragraph, index) => <RichText key={index} text={paragraph} style={styles.paragraph} />)}

      {topic.bullets ? (
        <View style={styles.bulletList}>
          {topic.bullets.map((bullet, index) => (
            <View key={index} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <RichText text={bullet} style={styles.bulletText} />
            </View>
          ))}
        </View>
      ) : null}

      {topic.warning ? (
        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={15} color={colors.warning} />
          <RichText text={topic.warning} style={styles.warningText} />
        </View>
      ) : null}
    </View>
  );
}

export default function UserGuideScreen() {
  const insets = useSafeAreaInsets();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openTopic = openKey ? GUIDE_GROUPS.flatMap((group) => group.topics).find((topic) => topic.key === openKey) : undefined;

  // Back from a topic returns to the list of topics, not out of the guide.
  function goBack() {
    if (openTopic) setOpenKey(null);
    else router.back();
  }
  useEffect(() => {
    if (!openTopic) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { setOpenKey(null); return true; });
    return () => sub.remove();
  }, [openTopic]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{openTopic ? openTopic.title : "User guide"}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {openTopic ? (
          <GuideTopicDetail topic={openTopic} />
        ) : (
          GUIDE_GROUPS.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
              <View style={styles.list}>
                {group.topics.map((topic, index) => (
                  <View key={topic.key}>
                    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#f5f9fc" }]} onPress={() => setOpenKey(topic.key)} accessibilityRole="button">
                      <View style={styles.rowIcon}><Ionicons name={topic.icon} size={16} color={UI.teal} /></View>
                      <Text style={styles.rowTitle}>{topic.title}</Text>
                      <Ionicons name="chevron-forward" size={16} color={UI.muted} />
                    </Pressable>
                    {index < group.topics.length - 1 ? <View style={styles.divider} /> : null}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        <Pressable style={styles.stuckCard} onPress={() => router.push("/(app)/more/help-support")} accessibilityRole="button">
          <Text style={styles.stuckText}>Still stuck? Send a request</Text>
          <Ionicons name="chevron-forward" size={18} color={UI.teal} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },

  group: { gap: 8 },
  groupTitle: { color: "#5b6a8c", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginLeft: 2 },
  list: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center" },
  rowTitle: { flex: 1, color: UI.ink, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, backgroundColor: UI.line, marginLeft: 56 },

  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 16 },
  detailHeading: { color: UI.ink, fontSize: 17, fontFamily: "DMSans_700Bold" },
  paragraph: { color: UI.ink, fontSize: 13, lineHeight: 20, marginTop: 8 },
  bold: { color: UI.ink, fontFamily: "Inter_700Bold" },

  bulletList: { marginTop: 14, gap: 14 },
  bulletRow: { flexDirection: "row", gap: 10 },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: UI.ink, marginTop: 8 },
  bulletText: { flex: 1, color: UI.ink, fontSize: 13, lineHeight: 20 },

  warningBox: { flexDirection: "row", gap: 8, marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: colors.warningSoft },
  warningText: { flex: 1, color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: "600" },

  stuckCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 16, height: 52 },
  stuckText: { color: UI.teal, fontSize: 13, fontFamily: "Inter_700Bold" },
});
