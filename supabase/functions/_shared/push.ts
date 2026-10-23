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
 */
export async function sendToHousehold(
  admin: SupabaseClient,
  householdId: string,
  build: (lang: Lang, userId: string) => Message | null,
  opts: { exclude?: string | null; only?: string | null } = {},
): Promise<number> {
  const { data: members } = await admin.from("members").select("user_id, lang").eq("household_id", householdId);
  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("household_id", householdId);
  const langOf = new Map((members ?? []).map((m) => [m.user_id, (m.lang === "es" ? "es" : "en") as Lang]));
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    if (opts.exclude && s.user_id === opts.exclude) return;
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

export const STARTER: Record<Lang, Record<string, string>> = {
  en: { laundry: "Laundry", sheets: "Change the bed sheets", bathroom: "Clean the bathroom", dogbeds: "Wash the dogs' beds and blankets", fleas: "Flea & tick treatment", worming: "Deworming tablet" },
  es: { laundry: "Poner lavadoras", sheets: "Cambiar las sábanas", bathroom: "Limpiar el baño", dogbeds: "Lavar las camas y mantas de los perros", fleas: "Pipeta antipulgas y garrapatas", worming: "Pastilla desparasitaria" },
};
