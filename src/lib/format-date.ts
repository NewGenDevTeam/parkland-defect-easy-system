// Deterministic Malaysia-time date formatting, shared by server and client.
//
// toLocaleString()/toLocaleDateString() without an explicit locale + timezone
// format differently in Node (Railway server) and the visitor's browser
// (punctuation, day/month order, "am" vs "AM"), which causes React hydration
// mismatches in client components. These helpers pin locale en-GB and
// timezone Asia/Kuala_Lumpur and assemble the string from formatToParts, so
// SSR and hydration always produce byte-identical text and the displayed time
// is always Malaysia time regardless of the server's timezone.

const KL_TIMEZONE = "Asia/Kuala_Lumpur";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: KL_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: KL_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function toValidDate(value: Date | string): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parts(fmt: Intl.DateTimeFormat, d: Date): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  return map;
}

/** DD/MM/YYYY in Malaysia time; "—" for an invalid date. */
export function formatMalaysiaDate(value: Date | string): string {
  const d = toValidDate(value);
  if (!d) return "—";
  const p = parts(DATE_FMT, d);
  return `${p.day}/${p.month}/${p.year}`;
}

/** DD/MM/YYYY, hh:mm:ss AM in Malaysia time; "—" for an invalid date. */
export function formatMalaysiaDateTime(value: Date | string): string {
  const d = toValidDate(value);
  if (!d) return "—";
  const dp = parts(DATE_FMT, d);
  const tp = parts(TIME_FMT, d);
  // en-GB reports "am"/"pm" — uppercase explicitly so casing can never differ
  // between runtimes.
  const period = (tp.dayPeriod ?? "").toUpperCase();
  return `${dp.day}/${dp.month}/${dp.year}, ${tp.hour}:${tp.minute}:${tp.second}${
    period ? ` ${period}` : ""
  }`;
}
