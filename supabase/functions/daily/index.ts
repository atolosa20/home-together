// Morning reminder: what's due today, today's plans and how much is on the shopping list.
// Called once a day by the scheduler in supabase/daily-reminder.sql.
import { addDays, adminClient, cors, Lang, madridToday, occursOn, sendToHousehold, STARTER } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });

  const admin = adminClient();
  const today = madridToday();
  const { data: homes } = await admin.from("households").select("id");
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
    if (!due.length && !events.length && !medsDue.length) continue; // nothing to say today

    sent += await sendToHousehold(admin, h.id, (lang: Lang) => {
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
      return { title: es ? "Hoy en casa" : "Today at home", body: parts.join(" · "), tag: "daily", url: "./#today" };
    });
  }
  return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
});
