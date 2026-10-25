// Morning reminder: what's due today, today's plans, how much is on the shopping list, dog food or
// medicine running low (added to the list once), papers about to expire, fixed costs charged soon,
// and the rainy hours for walks (for whoever turned on rain alerts). On Sundays, also a summary of the week.
// Called once a day by the scheduler in supabase/daily-reminder.sql.
import { addDays, adminClient, cors, Lang, madridToday, occursOn, sendToHousehold, STARTER } from "../_shared/push.ts";
import { forecast, spells } from "../_shared/weather.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

type Cost = { start_month: string; every_months: number; day: number };
const monthsFrom = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`; };
// Charged this month? Every every_months months, counting from start_month.
const chargedIn = (c: Cost, month: string) => { const n = monthsFrom(c.start_month, month); return n >= 0 && n % (c.every_months || 1) === 0; };
const chargeDate = (c: Cost, month: string) => {
  const [y, m] = month.split("-").map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.slice(0, 8)}${String(Math.min(c.day, last)).padStart(2, "0")}`;
};
const eur = (n: number, lang: Lang) => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-IE", { style: "currency", currency: "EUR" }).format(Number(n));

// Fixed costs: once their day of the month has come (the last day for 29–31 in short months) in a month
// they are charged, add them as an expense, at most once a month.
async function addFixedCosts(admin: SupabaseClient, today: string) {
  const month = today.slice(0, 8) + "01", [y, m, d] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const { data: costs } = await admin.from("fixed_costs").select("*").eq("active", true).lte("start_month", month);
  for (const c of costs ?? []) {
    if ((c.last_month && c.last_month >= month) || !chargedIn(c, month)) continue;
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

// Fixed costs whose next charge is within their reminder days (from tomorrow): mentioned once per charge.
type Bill = { name: string; amount: number; left: number; private: boolean; created_by: string | null };
async function billsSoon(admin: SupabaseClient, householdId: string, today: string) {
  const out: Bill[] = [], month = today.slice(0, 8) + "01";
  const { data: costs } = await admin.from("fixed_costs").select("id, name, amount, day, start_month, every_months, remind_days, reminded_for, last_month, private, created_by")
    .eq("household_id", householdId).eq("active", true).gt("remind_days", 0);
  for (const c of costs ?? []) {
    for (const m of [month, nextMonth(month)]) {
      if (!chargedIn(c, m) || (c.last_month && c.last_month >= m)) continue;
      const date = chargeDate(c, m), left = daysBetween(date, today);
      if (left < 1) continue; // today's is added as an expense instead
      if (left <= c.remind_days && !(c.reminded_for && c.reminded_for >= date)) {
        const { data: claimed } = await admin.from("fixed_costs").update({ reminded_for: date }).eq("id", c.id)
          .or(`reminded_for.is.null,reminded_for.lt.${date}`).select("id");
        if (claimed?.length) out.push({ name: c.name, amount: Number(c.amount), left, private: c.private, created_by: c.created_by });
      }
      break; // only the next charge
    }
  }
  return out;
}

// Plants to water today: every water_every days, or winter_every from November to March.
async function plantsDue(admin: SupabaseClient, householdId: string, today: string) {
  const winter = [11, 12, 1, 2, 3].includes(Number(today.slice(5, 7)));
  const { data } = await admin.from("plants").select("name, water_every, winter_every, last_watered").eq("household_id", householdId);
  return (data ?? []).filter((p) => !p.last_watered || addDays(p.last_watered, winter && p.winter_every ? p.winter_every : p.water_every) <= today).map((p) => p.name);
}

// Sunday: the last 7 days (walks, chores, shops, shared spending) and what comes in the next 7.
async function weekly(admin: SupabaseClient, householdId: string, today: string) {
  const from = addDays(today, -6), to = addDays(today, 7), month = today.slice(0, 8) + "01";
  const [{ data: walks }, { count: chores }, { count: trips }, { data: spent }, { data: evs }, { data: papers }, { data: costs }, { data: people }] = await Promise.all([
    admin.from("dog_log").select("by_user").eq("household_id", householdId).eq("kind", "walk").gte("at", from),
    admin.from("chore_log").select("id", { count: "exact", head: true }).eq("household_id", householdId).gte("at", from),
    admin.from("shopping_trips").select("id", { count: "exact", head: true }).eq("household_id", householdId).gte("created_at", from),
    admin.from("expenses").select("amount").eq("household_id", householdId).eq("private", false).gte("spent_on", from).lte("spent_on", today),
    admin.from("events").select("title, time, date, repeat").eq("household_id", householdId).lte("date", to),
    admin.from("papers").select("title, expires_on").eq("household_id", householdId).gt("expires_on", today).lte("expires_on", to),
    admin.from("fixed_costs").select("name, amount, day, start_month, every_months, last_month").eq("household_id", householdId).eq("active", true).eq("private", false),
    admin.from("members").select("user_id, display_name").eq("household_id", householdId),
  ]);
  const perWalker = new Map<string, number>();
  for (const w of walks ?? []) if (w.by_user) perWalker.set(w.by_user, (perWalker.get(w.by_user) ?? 0) + 1);
  const top = [...perWalker].sort((a, b) => b[1] - a[1])[0];
  const topName = top && perWalker.size > 1 ? (people ?? []).find((p) => p.user_id === top[0])?.display_name : "";
  const total = Math.round((spent ?? []).reduce((t, e) => t + Number(e.amount), 0) * 100) / 100;
  const coming: { date: string; title: string }[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    for (const e of evs ?? []) if (occursOn(e, d)) coming.push({ date: d, title: e.title });
  }
  const bills: { date: string; name: string; amount: number }[] = [];
  for (const c of costs ?? []) {
    for (const m of [month, nextMonth(month)]) {
      if (!chargedIn(c, m) || (c.last_month && c.last_month >= m)) continue;
      const d = chargeDate(c, m);
      if (d > today && d <= to) bills.push({ date: d, name: c.name, amount: Number(c.amount) });
    }
  }
  const nWalks = (walks ?? []).length;
  if (!nWalks && !chores && !trips && !total && !coming.length && !papers?.length && !bills.length) return 0;
  return await sendToHousehold(admin, householdId, (lang: Lang) => {
    const es = lang === "es";
    const dow = (d: string) => new Intl.DateTimeFormat(es ? "es-ES" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
    const done = [
      nWalks ? (es ? `${nWalks} paseos` : `${nWalks} walks`) + (topName ? (es ? ` (más: ${topName} ${top[1]})` : ` (most: ${topName} ${top[1]})`) : "") : "",
      chores ? (es ? `${chores} tareas` : `${chores} chores`) : "",
      trips ? (es ? `${trips} compras` : `${trips} shops`) : "",
      total ? (es ? `${eur(total, lang)} gastado en común` : `${eur(total, lang)} shared spending`) : "",
    ].filter(Boolean);
    const next = [
      ...coming.slice(0, 4).map((e) => `${e.title} (${dow(e.date)})`),
      ...(papers ?? []).map((p) => es ? `${p.title} caduca (${dow(p.expires_on)})` : `${p.title} expires (${dow(p.expires_on)})`),
      ...bills.map((b) => `${b.name} ${eur(b.amount, lang)} (${dow(b.date)})`),
    ];
    const parts = [
      done.length ? (es ? "Últimos 7 días: " : "Last 7 days: ") + done.join(", ") : "",
      next.length ? (es ? "Próximos 7 días: " : "Next 7 days: ") + next.join(", ") + (coming.length > 4 ? ` +${coming.length - 4}` : "") : "",
    ].filter(Boolean);
    return { title: es ? "Vuestra semana en casa" : "Your week at home", body: parts.join(" · "), tag: "weekly", url: "./#today" };
  }, { topic: "weekly" });
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
    const [low, papers, bills, water] = await Promise.all([runningLow(admin, h.id, today), papersDue(admin, h.id, today), billsSoon(admin, h.id, today), plantsDue(admin, h.id, today)]);
    // Plants are only mentioned to those who didn't turn them off in Settings.
    const { data: prefs } = await admin.from("members").select("user_id, notify_off").eq("household_id", h.id);
    const noPlants = new Set((prefs ?? []).filter((m) => (m.notify_off ?? []).includes("plants")).map((m) => m.user_id));
    if (new Date(today + "T12:00:00Z").getUTCDay() === 0) sent += await weekly(admin, h.id, today);
    const news = due.length || events.length || medsDue.length || low.length || papers.length;
    if (!news && !rain.length && !bills.length && !water.length) continue; // nothing to say today

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
      // Private fixed costs: only for whoever added them.
      const myBills = bills.filter((b) => !b.private || b.created_by === userId);
      const myWater = noPlants.has(userId) ? [] : water;
      if (myWater.length) parts.push((es ? "Regar: " : "Water: ") + myWater.slice(0, 5).join(", ") + (myWater.length > 5 ? ` +${myWater.length - 5}` : ""));
      if (myBills.length) {
        parts.push((es ? "Pagos: " : "Bills soon: ") + myBills.map((b) => `${b.name} ${eur(b.amount, lang)} ${es ? `en ${b.left} d` : `in ${b.left}d`}`).join(", "));
      }
      if (toBuy || low.length) parts.push(es ? `${(toBuy ?? 0) + low.length} por comprar` : `${(toBuy ?? 0) + low.length} to buy`);
      const rainForMe = rain.length > 0 && rainFor.has(userId);
      if (!news && !rainForMe && !myBills.length && !myWater.length) return null; // only rain, someone else's bills or muted plants
      if (rainForMe) {
        const peak = Math.max(...rain.map((r) => r.peak));
        parts.push((es ? "Paseos: lluvia " : "Walks: rain ") + rain.slice(0, 3).map((r) => `${r.from}–${r.to}`).join(", ") + ` (${peak}${es ? " %" : "%"})`);
      }
      return { title: es ? "Hoy en casa" : "Today at home", body: parts.join(" · "), tag: "daily", url: "./#today" };
    }, { topic: "daily" });
  }
  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
