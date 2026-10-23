// Morning reminder: what's due today, today's plans, how much is on the shopping list,
// and the rainy hours for walks (for whoever turned on rain alerts).
// Called once a day by the scheduler in supabase/daily-reminder.sql.
import { addDays, adminClient, cors, Lang, madridToday, occursOn, sendToHousehold, STARTER } from "../_shared/push.ts";
import { forecast, spells } from "../_shared/weather.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

// Fixed monthly costs: once their day of the month has come (the last day for 29–31 in short months),
// add them as an expense, at most once a month.
async function addFixedCosts(admin: SupabaseClient, today: string) {
  const month = today.slice(0, 8) + "01", [y, m, d] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const { data: costs } = await admin.from("fixed_costs").select("*").eq("active", true).lte("start_month", month);
  for (const c of costs ?? []) {
    if (c.last_month && c.last_month >= month) continue;
    const day = Math.min(c.day, lastDay);
    if (d < day) continue;
    // Claim the month first, so two runs can never add it twice.
    const { data: claimed } = await admin.from("fixed_costs").update({ last_month: month }).eq("id", c.id)
      .or(`last_month.is.null,last_month.lt.${month}`).select("id");
    if (!claimed?.length) continue;
    await admin.from("expenses").insert({
      household_id: c.household_id, amount: c.amount, cat: c.cat, spent_on: `${today.slice(0, 8)}${String(day).padStart(2, "0")}`,
      paid_by: c.paid_by, note: c.name, private: c.private, fixed_id: c.id, created_by: c.created_by,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });

  const admin = adminClient();
  const today = madridToday();
  await addFixedCosts(admin, today);
  const { data: homes } = await admin.from("households").select("id, lat, lon");
  let sent = 0;

  for (const h of homes ?? []) {
    const [{ data: chores }, { data: allEvents }, { count: toBuy }] = await Promise.all([
      admin.from("chores").select("title, key, every, start_date, last_done").eq("household_id", h.id).gt("every", 0),
      admin.from("events").select("title, time, date, repeat").eq("household_id", h.id).lte("date", today),
      admin.from("groceries").select("id", { count: "exact", head: true }).eq("household_id", h.id).eq("done", false),
    ]);
    const due = (chores ?? []).filter((c) => (c.last_done ? addDays(c.last_done, c.every) : c.start_date) <= today);
    const events = (allEvents ?? []).filter((e) => occursOn(e, today)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const { data: meds } = await admin.from("dog_meds").select("name, every, start_date, last_given, dogs(name)").eq("household_id", h.id).gt("every", 0);
    const medsDue = (meds ?? []).filter((m) => (m.last_given ? addDays(m.last_given, m.every) : m.start_date) <= today)
      .map((m) => `${(m.dogs as { name?: string } | null)?.name ?? ""}: ${m.name}`);
    // Rain between 07:00 and 22:00, told only to those who asked for rain alerts.
    let rain: ReturnType<typeof spells> = [], rainFor = new Set<string>();
    if (h.lat != null && h.lon != null) {
      const { data: wanted } = await admin.from("members").select("user_id").eq("household_id", h.id).eq("rain_alerts", true);
      rainFor = new Set((wanted ?? []).map((m) => m.user_id));
      if (rainFor.size) {
        const hours = (await forecast(h.lat, h.lon)) ?? [];
        rain = spells(hours.filter((x) => x.t.startsWith(today) && x.t.slice(11, 13) >= "07" && x.t.slice(11, 13) < "22"));
      }
    }
    if (!due.length && !events.length && !medsDue.length && !rain.length) continue; // nothing to say today


    sent += await sendToHousehold(admin, h.id, (lang: Lang, userId: string) => {
      const es = lang === "es";
      const parts: string[] = [];
      if (due.length) {
        const names = due.slice(0, 4).map((c) => (c.key && STARTER[lang][c.key]) || c.title);
        parts.push((es ? "Toca: " : "Due: ") + names.join(", ") + (due.length > 4 ? ` +${due.length - 4}` : ""));
      }
      if ((events ?? []).length) {
        parts.push((es ? "Hoy: " : "Today: ") + (events ?? []).map((e) => e.time ? `${e.title} ${e.time}` : e.title).join(", "));
      }
      if (medsDue.length) parts.push((es ? "Medicinas: " : "Medicines: ") + medsDue.join(", "));
      if (toBuy) parts.push(es ? `${toBuy} por comprar` : `${toBuy} to buy`);
      const rainForMe = rain.length > 0 && rainFor.has(userId);
      if (!due.length && !events.length && !medsDue.length && !rainForMe) return null; // only rain, and not for this person
      if (rainForMe) {
        const peak = Math.max(...rain.map((r) => r.peak));
        parts.push((es ? "Paseos: lluvia " : "Walks: rain ") + rain.slice(0, 3).map((r) => `${r.from}–${r.to}`).join(", ") + ` (${peak}${es ? " %" : "%"})`);
      }
      return { title: es ? "Hoy en casa" : "Today at home", body: parts.join(" · "), tag: "daily", url: "./#today" };
    });
  }
  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
