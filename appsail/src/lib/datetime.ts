// appsail/src/lib/datetime.ts
// Catalyst DateTime string helpers: "YYYY-MM-DD HH:mm:ss" (Node runtime TZ, e.g. Asia/Riyadh).
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toCatalystDateTime(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export function nowCatalyst(): string {
  return toCatalystDateTime(new Date());
}

export function catalystDateTimeIn(seconds: number): string {
  return toCatalystDateTime(new Date(Date.now() + seconds * 1000));
}

export function catalystDateTimeDaysAgo(days: number): string {
  return toCatalystDateTime(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

/** Parse a Catalyst datetime string to epoch ms (treats it as local runtime TZ). */
export function parseCatalystDateTime(s: string | null | undefined): number {
  if (!s) return NaN;
  const t = Date.parse(String(s).replace(" ", "T"));
  return Number.isFinite(t) ? t : NaN;
}

/** Lexicographic compare for the same format: true if a > b. */
export function catalystDtAfter(a: string, b: string): boolean {
  return String(a) > String(b);
}
