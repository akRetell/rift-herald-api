/** Mask every digit except the last four. Non-digits are dropped. */
export function maskPhone(phone: string | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 0) return "(none)";
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
