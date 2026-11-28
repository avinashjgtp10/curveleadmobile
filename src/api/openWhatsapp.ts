import { Alert, Linking } from "react-native";
import { router } from "expo-router";
import { fetchIntegrationSettings } from "./integrations";

interface WhatsappLead {
  id: string;
  name: string;
  phone: string;
}

let configuredCache: boolean | null = null;

async function isInAppWhatsappConfigured() {
  if (configuredCache !== null) return configuredCache;
  try {
    const settings = await fetchIntegrationSettings();
    configuredCache = !!settings.whatsapp_configured;
    return configuredCache;
  } catch {
    // Unknown (offline / rate limited): fall back to the phone's WhatsApp, and ask again next time.
    return false;
  }
}

/** Always opens the phone's own WhatsApp app on this lead's chat (never the in-app inbox). */
export async function openPhoneWhatsapp(lead: Pick<WhatsappLead, "phone">) {
  const digits = (lead.phone || "").replace(/\D/g, "");
  if (!digits) {
    Alert.alert("No phone number", "This lead doesn't have a phone number to message.");
    return;
  }
  try {
    // The app's own link goes straight into the chat; it fails when WhatsApp isn't installed.
    await Linking.openURL(`whatsapp://send?phone=${digits}`);
  } catch {
    try {
      await Linking.openURL(`https://wa.me/${digits}`);
    } catch {
      Alert.alert("Couldn't open WhatsApp", "Make sure WhatsApp is installed on this phone.");
    }
  }
}

/** Opens the in-app WhatsApp chat when the Business API is connected, otherwise the phone's own WhatsApp. */
export async function openLeadWhatsapp(lead: WhatsappLead) {
  if (await isInAppWhatsappConfigured()) {
    router.push({ pathname: "/(app)/more/whatsapp", params: { leadId: lead.id, name: lead.name, phone: lead.phone, openAt: String(Date.now()) } });
    return "app" as const;
  }
  try {
    await Linking.openURL(`https://wa.me/${lead.phone.replace(/\D/g, "")}`);
  } catch {
    Alert.alert("Couldn't open WhatsApp", "Make sure WhatsApp is installed on this phone.");
  }
  return "phone" as const;
}
