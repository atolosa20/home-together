// Reminders before a calendar plan (the evening before from 19:00, or one hour before),
// and dog medicines on the days they are due.
// Called every 15 minutes by the scheduler in supabase/reminders.sql.
import { addDays, adminClient, cors, Lang, madridNow, occursOn, sendToHousehold } from "../_shared/push.ts";

const TEXT: Record<Lang, { title: string; day: string; hour: string }> = {
  en: { title: "Reminder", day: "Tomorrow", hour: "In 1 hour" },
  es: { title: "Recordatorio", day: "Mañana", hour: "En 1 hora" },
};

const MED: Record<Lang, { title: string; body: (dog: string, med: string) => string; low: (n: number) => string }> = {
  en: { title: "Medicine", body: (d, m) => `Time for ${d}'s ${m}`, low: (n) => ` · only ${n} left, buy more` },
  es: { title: "Medicina", body: (d, m) => `Toca darle a ${d}: ${m}`, low: (n) => ` · quedan ${n}, hay que comprar más` },
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
    }));
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
    }));
  }

  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
