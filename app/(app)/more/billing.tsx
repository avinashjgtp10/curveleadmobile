import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function BillingScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="💳"
      title="Billing"
      description="Wire to GET /api/billing/current, /api/billing/invoices, GET /api/payments/plans, and the Razorpay checkout flow: POST /create-order → react-native-razorpay → POST /verify-payment."
    />
  );
}
