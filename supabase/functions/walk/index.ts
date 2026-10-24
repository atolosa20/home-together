// Logs a walk (or a meal) from an iPhone Shortcut, without opening the app, and tells the partner.
// The personal link from Settings carries a token: .../functions/v1/walk?t=<token>[&kind=food]
import { adminClient, cors, Lang, sendToHousehold } from "../_shared/push.ts";

const TEXT: Record<Lang, { title: string; walk: (w: string) => string; food: (w: string) => string; done: Record<string, string> }> = {
  en: { title: "Dogs", walk: (w) => `${w} took the dogs out`, food: (w) => `${w} fed the dogs`, done: { walk: "Walk logged", food: "Meal logged" } },
  es: { title: "Perros", walk: (w) => `${w} ha sacado a los perros`, food: (w) => `${w} ha dado de comer a los perros`, done: { walk: "Paseo apuntado", food: "Comida apuntada" } },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const kind = url.searchParams.get("kind") === "food" ? "food" : "walk";
  if (token.length < 32) return new Response("forbidden", { status: 403 });

  const admin = adminClient();
  const { data: tok } = await admin.from("shortcut_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tok) return new Response("forbidden", { status: 403 });
  const { data: me } = await admin.from("members").select("household_id, display_name, lang").eq("user_id", tok.user_id).maybeSingle();
  if (!me) return new Response("not in a home", { status: 403 });

  const { error } = await admin.from("dog_log").insert({ household_id: me.household_id, kind, by_user: tok.user_id });
  if (error) return new Response("couldn't save", { status: 500 });

  await sendToHousehold(admin, me.household_id, (lang) => ({
    title: TEXT[lang].title,
    body: TEXT[lang][kind](me.display_name || (lang === "es" ? "Tu pareja" : "Your partner")),
    tag: "dogs",
    url: "./#dogs",
  }), { exclude: tok.user_id, topic: "dogs" });

  // Shown by the Shortcut, in the person's own language.
  const lang: Lang = me.lang === "es" ? "es" : "en";
  return new Response(TEXT[lang].done[kind], { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
});
