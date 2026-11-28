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

/**
 * Phones are stored as "+<code><digits>" with no spaces, so a number typed as "98765 43210" or "098765 43210" would
 * never match. Anything that looks like a phone number is searched as plain digits; other text is left alone.
 */
export function phoneSearchTerm(query: string) {
  const q = query.trim();
  if (!/^[\d\s()+-]+$/.test(q)) return q;
  const digits = q.replace(/\D/g, "");
  if (!digits) return q;
  return q.startsWith("+") ? digits : digits.replace(/^0+(?=\d)/, "");
}

export function telUrl(phone: string) {
  return `tel:${dialNumber(phone)}`;
}
