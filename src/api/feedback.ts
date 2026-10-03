import { apiClient } from "./client";

export type FeedbackType = "idea" | "bug" | "other";

// Feedback reaches the team as a support ticket, so it is tracked and answered like any other request.
const CATEGORY: Record<FeedbackType, string> = {
  idea: "Feature Request",
  bug: "Bug Report",
  other: "General",
};

const SUBJECT_PREFIX: Record<FeedbackType, string> = {
  idea: "Idea",
  bug: "Bug",
  other: "Feedback",
};

export async function sendFeedback(input: { type: FeedbackType; message: string; rating: number }) {
  const message = input.message.trim();
  const firstLine = message.split("\n")[0].slice(0, 60);
  await apiClient.post("/support/tickets", {
    subject: `${SUBJECT_PREFIX[input.type]}: ${firstLine}`,
    category: CATEGORY[input.type],
    priority: input.type === "bug" ? "medium" : "low",
    message: input.rating ? `${message}\n\nApp rating: ${input.rating}/5` : message,
  });
}
