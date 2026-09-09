import { PlaceholderScreen } from "@/components/PlaceholderScreen";

// Public, no-auth screen — reachable via a share link deep link (curvelead://quotations/public/:id)
export default function PublicQuotationScreen() {
  return (
    <PlaceholderScreen
      icon="📄"
      title="Quotation"
      description="Wire to GET /api/quotations/public/:id (no auth) and GET /api/quotations/pdf/:id for download. No login required."
    />
  );
}
