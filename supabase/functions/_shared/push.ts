// Shared helpers for sending Web Push notifications to the people in a home.
import webpush from "npm:web-push@3.6.7";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

export const adminClient = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export type Lang = "en" | "es";
export type Message = { title: string; body: string; tag?: string; url?: string };

/**
 * Send a notification to members of a household.
 * `build` returns the message in each member's language, or null to skip that member.
 * `topic` is what the notification is about; members who turned that topic off in Settings
 * (members.notify_off) don't get it.
 */
export async function sendToHousehold(
  admin: SupabaseClient,
  householdId: string,
  build: (lang: Lang, userId: string) => Message | null,
  opts: { exclude?: string | null; only?: string | null; topic?: string } = {},
): Promise<number> {
  const { data: members } = await admin.from("members").select("user_id, lang, notify_off").eq("household_id", householdId);
  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("household_id", householdId);
  const langOf = new Map((members ?? []).map((m) => [m.user_id, (m.lang === "es" ? "es" : "en") as Lang]));
  const muted = new Set((members ?? []).filter((m) => opts.topic && (m.notify_off ?? []).includes(opts.topic)).map((m) => m.user_id));
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    if (opts.exclude && s.user_id === opts.exclude) return;
    if (muted.has(s.user_id)) return;
    if (opts.only && s.user_id !== opts.only) return;
    const msg = build(langOf.get(s.user_id) ?? "en", s.user_id);
    if (!msg) return;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg),
        { TTL: 60 * 60 * 12 },
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      // The phone unsubscribed or the app was removed: forget this subscription.
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", code, err);
    }
  }));
  return sent;
}

// Today's date in Spain, as YYYY-MM-DD.
export const madridToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Date and time now in Spain: { date: "YYYY-MM-DD", time: "HH:MM" }.
export function madridNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const addDays = (s: string, n: number) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Does a calendar plan happen on this day? Monthly and yearly plans on the 29th–31st
// fall on the last day of shorter months. Keep in step with occursOn() in app.js.
export function occursOn(e: { date: string; repeat?: string | null }, day: string): boolean {
  if (day < e.date) return false;
  if (day === e.date) return true;
  const [y0, m0, d0] = e.date.split("-").map(Number), [y, m, d] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  switch (e.repeat) {
    case "week": return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y0, m0 - 1, d0)) / 864e5) % 7 === 0;
    case "month": return d === Math.min(d0, last);
    case "year": return m === m0 && d === Math.min(d0, last);
    default: return false;
  }
}

export const STARTER: Record<Lang, Record<string, string>> = {
  en: { laundry: "Laundry", sheets: "Change the bed sheets", bathroom: "Clean the bathroom", dogbeds: "Wash the dogs' beds and blankets", fleas: "Flea & tick treatment", worming: "Deworming tablet" },
  es: { laundry: "Poner lavadoras", sheets: "Cambiar las sábanas", bathroom: "Limpiar el baño", dogbeds: "Lavar las camas y mantas de los perros", fleas: "Pipeta antipulgas y garrapatas", worming: "Pastilla desparasitaria" },
};
