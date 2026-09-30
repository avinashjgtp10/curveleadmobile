/**
 * Builds the `tel:` link for the phone dialer as a plain number: no "+", no spaces.
 * Indian numbers (+91 / 91 prefix) drop the country code too, so the dialer shows the
 * 10-digit number that connects on a domestic call. Other countries keep their "+" —
 * without it an international number won't connect.
 */
export function dialNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length > 10 && phone.trim().startsWith("+")) return `+${digits}`;
  return digits;
}

export function telUrl(phone: string) {
  return `tel:${dialNumber(phone)}`;
}
