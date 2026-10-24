// Morning reminder: what's due today, today's plans, how much is on the shopping list, dog food or
// medicine running low (added to the list once), papers about to expire, and the rainy hours for walks
// (for whoever turned on rain alerts).
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

const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

// Put an item on the shopping list unless it is already there (not yet bought).
async function addToList(admin: SupabaseClient, householdId: string, name: string) {
  const { data } = await admin.from("groceries").select("id").eq("household_id", householdId).eq("done", false).ilike("name", name).limit(1);
  if (!data?.length) await admin.from("groceries").insert({ household_id: householdId, name, cat: "dogs" });
}

// Food bags within their warning days, and medicines with about 5 days (or 2 doses) left.
// Each is claimed first, so it is added to the list once per bag / refill however often this runs.
async function runningLow(admin: SupabaseClient, householdId: string, today: string) {
  const out: { name: string; left: number | null }[] = [];
  const { data: supplies } = await admin.from("dog_supplies").select("id, name, size, per_day, opened_on, warn_days, alerted_on").eq("household_id", householdId);
  for (const s of supplies ?? []) {
    const left = daysBetween(addDays(s.opened_on, Math.floor(Number(s.size) / Number(s.per_day))), today);
    if (left > s.warn_days || (s.alerted_on && s.alerted_on >= s.opened_on)) continue;
    const { data: claimed } = await admin.from("dog_supplies").update({ alerted_on: today }).eq("id", s.id)
      .or(`alerted_on.is.null,alerted_on.lt.${s.opened_on}`).select("id");
    if (!claimed?.length) continue;
    await addToList(admin, householdId, s.name);
    out.push({ name: s.name, left: Math.max(0, left) });
  }
  const { data: meds } = await admin.from("dog_meds").select("id, name, every, stock, dogs(name)")
    .eq("household_id", householdId).eq("low_alerted", false).not("stock", "is", null);
  for (const m of meds ?? []) {
    const left = m.every ? m.stock * m.every : null;
    if (left !== null ? left > 5 : m.stock > 2) continue;
    const { data: claimed } = await admin.from("dog_meds").update({ low_alerted: true }).eq("id", m.id).eq("low_alerted", false).select("id");
    if (!claimed?.length) continue;
    const dog = (m.dogs as { name?: string } | null)?.name;
    const name = dog ? `${m.name} (${dog})` : m.name;
    await addToList(admin, householdId, name);
    out.push({ name, left });
  }
  return out;
}

// Papers to mention today: once when they enter their reminder window, once on the day they expire.
async function papersDue(admin: SupabaseClient, householdId: string, today: string) {
  const out: { title: string; left: number }[] = [];
  const { data: papers } = await admin.from("papers").select("id, title, expires_on, remind_days, reminded, dogs(name)")
    .eq("household_id", householdId).not("expires_on", "is", null).lt("reminded", 2);
  for (const p of papers ?? []) {
    const left = daysBetween(p.expires_on, today);
    const level = left <= 0 ? 2 : left <= p.remind_days ? 1 : 0;
    if (level <= p.reminded) continue;
    const { data: claimed } = await admin.from("papers").update({ reminded: level }).eq("id", p.id).lt("reminded", level).select("id");
    if (!claimed?.length) continue;
    const dog = (p.dogs as { name?: string } | null)?.name;
    out.push({ title: dog ? `${p.title} (${dog})` : p.title, left });
  }
  return out;
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
    const [low, papers] = await Promise.all([runningLow(admin, h.id, today), papersDue(admin, h.id, today)]);
    const news = due.length || events.length || medsDue.length || low.length || papers.length;
    if (!news && !rain.length) continue; // nothing to say today

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
      if (low.length) {
        parts.push((es ? "Se acaba (añadido a la compra): " : "Running low (added to the list): ") +
          low.map((x) => x.left === null ? x.name : `${x.name} ${x.left}${es ? " d" : "d"}`).join(", "));
      }
      if (papers.length) {
        parts.push((es ? "Papeles: " : "Papers: ") + papers.map((p) => p.left < 0
          ? `${p.title} ${es ? "caducado" : "expired"}`
          : p.left === 0 ? `${p.title} ${es ? "caduca hoy" : "expires today"}` : `${p.title} ${es ? `caduca en ${p.left} d` : `expires in ${p.left}d`}`).join(", "));
      }
      if (toBuy || low.length) parts.push(es ? `${(toBuy ?? 0) + low.length} por comprar` : `${(toBuy ?? 0) + low.length} to buy`);
      const rainForMe = rain.length > 0 && rainFor.has(userId);
      if (!news && !rainForMe) return null; // only rain, and not for this person
      if (rainForMe) {
        const peak = Math.max(...rain.map((r) => r.peak));
        parts.push((es ? "Paseos: lluvia " : "Walks: rain ") + rain.slice(0, 3).map((r) => `${r.from}–${r.to}`).join(", ") + ` (${peak}${es ? " %" : "%"})`);
      }
      return { title: es ? "Hoy en casa" : "Today at home", body: parts.join(" · "), tag: "daily", url: "./#today" };
    });
  }
  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
