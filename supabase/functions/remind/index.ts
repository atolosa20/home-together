// Reminders before a calendar plan (the evening before from 19:00, or one hour before),
// dog medicines on the days they are due, and rain coming soon (for walks).
// Called every 15 minutes by the scheduler in supabase/reminders.sql.
import { addDays, adminClient, cors, Lang, madridNow, occursOn, sendToHousehold } from "../_shared/push.ts";
import { forecast, spells, wet } from "../_shared/weather.ts";

const TEXT: Record<Lang, { title: string; day: string; hour: string }> = {
  en: { title: "Reminder", day: "Tomorrow", hour: "In 1 hour" },
  es: { title: "Recordatorio", day: "Mañana", hour: "En 1 hora" },
};

const BUDGET: Record<Lang, { title: string; near: (cat: string, s: string, b: string) => string; over: (cat: string, s: string, b: string) => string; cats: Record<string, string> }> = {
  en: {
    title: "Budget", near: (c, s, b) => `${c}: ${s} of ${b} this month (80%)`, over: (c, s, b) => `${c}: ${s} of ${b} — over budget this month`,
    cats: { groceries: "Groceries", home: "Home", bills: "Bills", dogs: "Dogs", eating_out: "Eating out", transport: "Transport", leisure: "Leisure", health: "Health", clothes: "Clothes", gifts: "Gifts", other: "Other" },
  },
  es: {
    title: "Presupuesto", near: (c, s, b) => `${c}: ${s} de ${b} este mes (80 %)`, over: (c, s, b) => `${c}: ${s} de ${b} — os habéis pasado este mes`,
    cats: { groceries: "Supermercado", home: "Casa", bills: "Facturas", dogs: "Perros", eating_out: "Comer fuera", transport: "Transporte", leisure: "Ocio", health: "Salud", clothes: "Ropa", gifts: "Regalos", other: "Otros" },
  },
};
const euros = (lang: Lang, n: number) => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-IE", { style: "currency", currency: "EUR" }).format(n);

const MED: Record<Lang, { title: string; body: (dog: string, med: string) => string; low: (n: number) => string }> = {
  en: { title: "Medicine", body: (d, m) => `Time for ${d}'s ${m}`, low: (n) => ` · only ${n} left, buy more` },
  es: { title: "Medicina", body: (d, m) => `Toca darle a ${d}: ${m}`, low: (n) => ` · quedan ${n}, hay que comprar más` },
};

const RAIN: Record<Lang, { title: string; body: (from: string, to: string, p: number) => string }> = {
  en: { title: "Rain soon", body: (f, t, p) => `Rain from ${f} to ${t} (${p}%). Good time to walk the dogs now.` },
  es: { title: "Va a llover", body: (f, t, p) => `Lluvia de ${f} a ${t} (${p} %). Buen momento para sacar a los perros.` },
};

// "HH:MM" one hour earlier, not before midnight.
const hourBefore = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const mins = Math.max(0, h * 60 + m - 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });

  const admin = adminClient();
  const { date: today, time: now } = madridNow();
  const tomorrow = addDays(today, 1);
  const { data: events } = await admin.from("events")
    .select("id, household_id, title, date, time, repeat, remind").neq("remind", "").lte("date", tomorrow);
  let sent = 0;

  for (const e of events ?? []) {
    let on = "";
    if (e.remind === "day" && now >= "19:00" && occursOn(e, tomorrow)) on = tomorrow;
    if (e.remind === "hour" && e.time && occursOn(e, today) && now >= hourBefore(e.time) && now < e.time) on = today;
    if (!on) continue;

    // Record it first: if it was already recorded, it was already sent.
    const { error } = await admin.from("event_reminders").insert({ event_id: e.id, on_date: on, kind: e.remind });
    if (error) continue;

    sent += await sendToHousehold(admin, e.household_id, (lang) => ({
      title: TEXT[lang].title,
      body: `${TEXT[lang][e.remind as "day" | "hour"]}: ${e.title}${e.time ? ` ${e.time}` : ""}`,
      tag: `remind-${e.id}`,
      url: "./#calendar",
    }), { topic: "reminders" });
  }
  // Budgets: tell both phones when a category reaches 80% and when it goes over, once each per month.
  // Only shared spending counts ("only me" expenses stay private).
  const month = today.slice(0, 8) + "01";
  const { data: budgets } = await admin.from("budgets").select("household_id, cat, amount");
  if (budgets?.length) {
    const { data: spent } = await admin.from("expenses").select("household_id, cat, amount")
      .eq("private", false).gte("spent_on", month).lte("spent_on", today);
    const total = new Map<string, number>();
    for (const x of spent ?? []) total.set(`${x.household_id}|${x.cat}`, (total.get(`${x.household_id}|${x.cat}`) ?? 0) + Number(x.amount));
    for (const b of budgets) {
      const s = total.get(`${b.household_id}|${b.cat}`) ?? 0, limit = Number(b.amount);
      const level = s >= limit ? 100 : s >= limit * 0.8 ? 80 : 0;
      if (!level) continue;
      // Going straight over 100% also counts as the 80% one, so it isn't sent afterwards.
      const rows = (level === 100 ? [80, 100] : [80]).map((l) => ({ household_id: b.household_id, cat: b.cat, month, level: l }));
      const { data: added } = await admin.from("budget_alerts").upsert(rows, { onConflict: "household_id,cat,month,level", ignoreDuplicates: true }).select("level");
      if (!added?.some((a) => a.level === level)) continue;
      sent += await sendToHousehold(admin, b.household_id, (lang) => {
        const t = BUDGET[lang], cat = t.cats[b.cat] ?? b.cat;
        return { title: t.title, body: (level === 100 ? t.over : t.near)(cat, euros(lang, s), euros(lang, limit)), tag: `budget-${b.cat}`, url: "./#money" };
      }, { topic: "budget" });
    }
  }

  // Dog medicines: from their time of day on each day they are due, once a day until someone taps "Given".
  const { data: meds } = await admin.from("dog_meds")
    .select("id, household_id, name, dose, every, start_date, last_given, at_time, stock, dogs(name)").gt("every", 0);
  for (const m of meds ?? []) {
    const due = m.last_given ? addDays(m.last_given, m.every) : m.start_date;
    if (due > today || now < (m.at_time || "09:00")) continue;
    const { error } = await admin.from("med_reminders").insert({ med_id: m.id, on_date: today });
    if (error) continue;
    const dog = (m.dogs as { name?: string } | null)?.name ?? "";
    sent += await sendToHousehold(admin, m.household_id, (lang) => ({
      title: MED[lang].title,
      body: MED[lang].body(dog, `${m.name}${m.dose ? ` (${m.dose})` : ""}`) + (m.stock != null && m.stock <= 2 ? MED[lang].low(m.stock) : ""),
      tag: `med-${m.id}`,
      url: "./#dogs",
    }), { topic: "meds_due" });
  }

  // Rain: when the next hour turns wet after a dry one (07:00–21:00), tell whoever turned on rain alerts,
  // unless someone walked the dogs in the last hour. Once per rainy spell.
  if (now >= "07:00" && now < "21:00") {
    const { data: wanted } = await admin.from("members").select("household_id, user_id").eq("rain_alerts", true);
    const homes = new Map<string, Set<string>>();
    for (const m of wanted ?? []) homes.set(m.household_id, (homes.get(m.household_id) ?? new Set()).add(m.user_id));
    const { data: places } = homes.size
      ? await admin.from("households").select("id, lat, lon").in("id", [...homes.keys()]).not("lat", "is", null)
      : { data: [] };
    for (const h of places ?? []) {
      const hours = await forecast(h.lat, h.lon);
      const i = hours?.findIndex((x) => x.t === `${today}T${now.slice(0, 2)}:00`) ?? -1;
      if (!hours || i < 0 || wet(hours[i]) || !hours[i + 1] || !wet(hours[i + 1])) continue;
      const rain = spells(hours.slice(i + 1))[0];
      const { count: walked } = await admin.from("dog_log").select("id", { count: "exact", head: true })
        .eq("household_id", h.id).eq("kind", "walk").gte("at", new Date(Date.now() - 60 * 60000).toISOString());
      if (walked) continue;
      const { error } = await admin.from("weather_alerts").insert({ household_id: h.id, on_date: today, starts: rain.from });
      if (error) continue;
      const users = homes.get(h.id)!;
      sent += await sendToHousehold(admin, h.id, (lang, userId) => users.has(userId)
        ? { title: RAIN[lang].title, body: RAIN[lang].body(rain.from, rain.to, rain.peak), tag: "rain", url: "./#dogs" }
        : null);
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
