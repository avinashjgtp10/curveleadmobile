import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function PipelineScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="🧭"
      title="Pipeline"
      description="Kanban-style board over GET /api/leads/stages/all and GET /api/lead-statuses/by-stage. Admins can manage stages via /api/lead-stages CRUD."
    />
  );
}
