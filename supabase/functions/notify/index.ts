// Called by the app after someone adds or finishes something.
// Sends a push notification to the other person in the home.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { adminClient, cors, Lang, Message, sendToHousehold } from "../_shared/push.ts";

const TEXT: Record<Lang, Record<string, (who: string, text: string) => Message>> = {
  en: {
    grocery: (w, t) => ({ title: "Shopping list", body: `${w} added ${t}`, tag: "groceries", url: "./#groceries" }),
    event: (w, t) => ({ title: "Calendar", body: `${w} added: ${t}`, url: "./#calendar" }),
    chore: (w, t) => ({ title: "Chores", body: `${w} added a routine: ${t}`, url: "./#chores" }),
    todo: (w, t) => ({ title: "To-do", body: `${w} added: ${t}`, url: "./#chores" }),
    chore_done: (w, t) => ({ title: "Done ✓", body: `${w} did: ${t}`, url: "./#chores" }),
    todo_done: (w, t) => ({ title: "Done ✓", body: `${w} did: ${t}`, url: "./#chores" }),
    need: (w, t) => ({ title: "Needs", body: `${w} added: ${t}`, url: "./#groceries" }),
    note: (w, t) => ({ title: "Notes", body: `${w} added a note: ${t}`, url: "./#notes" }),
    shop: (w, t) => ({ title: "Shopping done", body: `${w} finished shopping: ${t}`, tag: "groceries", url: "./#groceries" }),
    walk: (w) => ({ title: "Dogs", body: `${w} took the dogs out`, tag: "dogs", url: "./#dogs" }),
    food: (w) => ({ title: "Dogs", body: `${w} fed the dogs`, tag: "dogs", url: "./#dogs" }),
    med: (w, t) => ({ title: "Medicine given ✓", body: `${w} gave ${t}`, url: "./#dogs" }),
    test: () => ({ title: "Home Together", body: "Notifications work on this phone.", url: "./" }),
  },
  es: {
    grocery: (w, t) => ({ title: "Lista de la compra", body: `${w} ha añadido ${t}`, tag: "groceries", url: "./#groceries" }),
    event: (w, t) => ({ title: "Calendario", body: `${w} ha añadido: ${t}`, url: "./#calendar" }),
    chore: (w, t) => ({ title: "Tareas", body: `${w} ha añadido una rutina: ${t}`, url: "./#chores" }),
    todo: (w, t) => ({ title: "Por hacer", body: `${w} ha añadido: ${t}`, url: "./#chores" }),
    chore_done: (w, t) => ({ title: "Hecho ✓", body: `${w} ha hecho: ${t}`, url: "./#chores" }),
    todo_done: (w, t) => ({ title: "Hecho ✓", body: `${w} ha hecho: ${t}`, url: "./#chores" }),
    need: (w, t) => ({ title: "Necesidades", body: `${w} ha añadido: ${t}`, url: "./#groceries" }),
    note: (w, t) => ({ title: "Notas", body: `${w} ha añadido una nota: ${t}`, url: "./#notes" }),
    shop: (w, t) => ({ title: "Compra hecha", body: `${w} ha terminado la compra: ${t}`, tag: "groceries", url: "./#groceries" }),
    walk: (w) => ({ title: "Perros", body: `${w} ha sacado a los perros`, tag: "dogs", url: "./#dogs" }),
    food: (w) => ({ title: "Perros", body: `${w} ha dado de comer a los perros`, tag: "dogs", url: "./#dogs" }),
    med: (w, t) => ({ title: "Medicina dada ✓", body: `${w} le ha dado a ${t}`, url: "./#dogs" }),
    test: () => ({ title: "Home Together", body: "Las notificaciones funcionan en este móvil.", url: "./" }),
  },
};

// Which Settings switch each kind belongs to (members.notify_off).
const TOPIC: Record<string, string> = { grocery: "list", shop: "shop", need: "need", event: "calendar", chore: "chores", todo: "chores",
  chore_done: "done", todo_done: "done", walk: "dogs", food: "dogs", med: "med", note: "note" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Who is calling? (the app sends the signed-in user's token)
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "not signed in" }, 401);

  const admin = adminClient();
  const { data: me } = await admin.from("members").select("household_id, display_name").eq("user_id", user.id).maybeSingle();
  if (!me) return json({ error: "not in a home" }, 403);

  let kind = "", text = "";
  try { ({ kind = "", text = "" } = await req.json()); } catch { /* empty body */ }
  if (!TEXT.en[kind]) return json({ error: "unknown kind" }, 400);
  text = String(text).slice(0, 120);

  const isTest = kind === "test";
  const sent = await sendToHousehold(
    admin,
    me.household_id,
    (lang) => TEXT[lang][kind](me.display_name || (lang === "es" ? "Tu pareja" : "Your partner"), text),
    isTest ? { only: user.id } : { exclude: user.id, topic: TOPIC[kind] },
  );
  return json({ sent });
});
