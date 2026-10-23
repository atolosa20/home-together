// Home Together — app logic (plain JavaScript, no build step).
(() => {
const CFG = window.HOME_CONFIG || {};
const I18N = window.I18N;

// ---------- language ----------
let lang = "en";
try { lang = localStorage.getItem("ht-lang") || ((navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en"); } catch (e) {}
if (!I18N[lang]) lang = "en";
const T = k => I18N[lang][k];

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const mon3 = i => T("months")[i].slice(0, 3);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDay = s => { const d = parse(s); return `${T("dow")[d.getDay()]} ${d.getDate()} ${mon3(d.getMonth())}`; };
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const IC = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  paw: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:-2px"><circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="5.8" r="2.2"/><circle cx="14.5" cy="5.8" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M12 11c-3 0-6.5 4.6-6.5 7.2 0 1.6 1.3 2.3 2.8 2.3 1.4 0 2.4-.8 3.7-.8s2.3.8 3.7.8c1.5 0 2.8-.7 2.8-2.3C18.5 15.6 15 11 12 11z"/></svg>'
};
const GROC_KEYS = ["veg", "bakery", "dairy", "meat", "pantry", "frozen", "drinks", "home", "dogs", "other"];
const EV_COLORS = { home: "--c-home", dogs: "--c-dogs", people: "--c-people", appt: "--c-appt", bills: "--c-bills", travel: "--c-travel" };
const NEED_KEYS = ["furniture", "tech", "home", "books", "clothes", "gifts", "other"];
const SHOP_VIEWS = ["list", "needs", "past"];
const MAX_FILE = 10 * 1024 * 1024;
const REPEAT = [0, 1, 2, 3, 7, 14, 30, 90, 180, 365];
const repeatLabel = n => T("repeat")[n] || T("everyN")(n);
const choreTitle = c => (c.key && T("starter")[c.key]) || c.title;
const uuid = () => crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

// Does a calendar plan happen on this day? Monthly and yearly plans on the 29th–31st
// fall on the last day of shorter months. Keep in step with occursOn() in supabase/functions/_shared/push.ts.
function occursOn(e, day) {
  if (day < e.date) return false;
  if (day === e.date) return true;
  const [y0, m0, d0] = e.date.split("-").map(Number), [y, m, d] = day.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  switch (e.repeat) {
    case "week": return diffDays(day, e.date) % 7 === 0;
    case "month": return d === Math.min(d0, last);
    case "year": return m === m0 && d === Math.min(d0, last);
    default: return false;
  }
}
// The first day on or after `from` that the plan happens, or null.
function nextOn(e, from) {
  if (!e.repeat) return e.date >= from ? e.date : null;
  for (let s = e.date > from ? e.date : from, i = 0; i < 400; i++, s = addDays(s, 1)) if (occursOn(e, s)) return s;
  return null;
}

// Whose job a chore is: a fixed person, or alternating between the people in the home.
function owner(c) {
  if (c.rotate) return S.members.length < 2 ? null : (S.members.find(m => m.user_id !== c.last_by) || S.members[0]).user_id;
  return c.assigned_to || null;
}
const ownerLabel = (c, id) => c.rotate ? (id === me ? T("yourTurn") : T("turnOf")(who(id))) : (id === me ? T("you_") : who(id));

// ---------- Supabase ----------
const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("YOUR-PROJECT");
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

// ---------- state ----------
const S = { groceries: [], chores: [], events: [], dogs: [], members: [], history: [], needs: [], shopping_trips: [], attachments: [], dog_log: [], dog_meds: [], home: null };
let me = null, hid = null, channel = null, online = true;
let tab = "today", calMonth = today().slice(0, 7), calSel = today(), pendingDelete = null;
const ui = { grocCat: "other", evCat: "home", needCat: "other", shopView: "list", finishing: false, filesFor: null, medFor: null, dogFor: null, dogPhoto: null, authMode: "signin", setupMode: "create" };
try {
  const g = localStorage.getItem("ht-grocCat"); if (GROC_KEYS.includes(g)) ui.grocCat = g;
  const s = localStorage.getItem("ht-shopView"); if (SHOP_VIEWS.includes(s)) ui.shopView = s;
} catch (e) {}

function toast(k) { const t = $("#toast"); t.textContent = T(k) || k; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 1800); }
function who(id) { if (!id) return ""; if (id === me) return T("you"); const m = S.members.find(x => x.user_id === id); return (m && m.display_name) || T("partner"); }
function show(id) { ["authGate", "setupGate", "app"].forEach(x => $("#" + x).hidden = x !== id); }

async function run(promise, okKey) {
  const { error } = await promise;
  if (error) { console.error(error); toast("cantSave"); return false; }
  if (okKey) toast(okKey);
  return true;
}
// Tell the other phone(s). Fire and forget: the change is already saved.
function notify(kind, text) {
  if (!sb) return;
  sb.functions.invoke("notify", { body: { kind, text } }).catch(() => {});
}

// ---------- saving, also offline ----------
// Every change to the lists goes through save(). It shows straight away; if the phone has no
// connection it waits on the phone (in order) and is sent as soon as the connection is back.
// op = { t: table, kind: "insert" | "update" | "delete" | "clear", id?, values?, match?, notify?: [kind, text] }
let queue = [];
const qKey = () => "ht-queue-" + me;
function loadQueue() { try { queue = JSON.parse(localStorage.getItem(qKey()) || "[]"); } catch (e) { queue = []; } }
function storeQueue() { try { localStorage.setItem(qKey(), JSON.stringify(queue)); } catch (e) {} }

const DEFAULTS = {
  groceries: { qty: "", cat: "other", done: false },
  chores: { every: 0, dog: false, done: false, last_done: null, last_by: null, assigned_to: null, rotate: false },
  events: { time: "", cat: "home", repeat: "", remind: "" },
  dogs: { breed: "", notes: "", birthday: null },
  needs: { cat: "other", price: "", link: "", notes: "", done: false, done_by: null },
  shopping_trips: { store: "", total: "", items: [] },
  dog_log: { dog_id: null, detail: "" },
  dog_meds: { dose: "", every: 0, last_given: null, last_by: null, at_time: "09:00", stock: null }
};
function applyOp(op) {
  const list = S[op.t];
  if (op.kind === "insert" && !list.some(x => x.id === op.values.id)) list.push({ ...DEFAULTS[op.t], created_by: me, created_at: op.at, start_date: today(), by_user: me, at: op.at, ...op.values });
  if (op.kind === "update") Object.assign(list.find(x => x.id === op.id) || {}, op.values);
  if (op.kind === "delete") S[op.t] = list.filter(x => x.id !== op.id);
  if (op.kind === "clear") S[op.t] = list.filter(x => !Object.entries(op.match).every(([k, v]) => x[k] === v));
}
function send(op) {
  const q = sb.from(op.t);
  // Inserts carry their own id, so sending one twice (reply lost on a bad connection) is harmless.
  if (op.kind === "insert") return q.upsert(op.values, { onConflict: "id", ignoreDuplicates: true });
  if (op.kind === "update") return q.update(op.values).eq("id", op.id);
  if (op.kind === "delete") return q.delete().eq("id", op.id);
  return q.delete().eq("household_id", hid).match(op.match);
}
// Status 0: the request never reached the server.
const unreachable = res => res.status === 0 || !navigator.onLine;

// Resolves true once the change is on the server, false if it is waiting on the phone or failed.
async function save(op, okKey) {
  op.at = new Date().toISOString();
  applyOp(op); render();
  if (!queue.length && navigator.onLine) {
    const res = await send(op);
    if (!res.error) { if (okKey) toast(okKey); if (op.notify) notify(...op.notify); return true; }
    if (!unreachable(res)) { console.error(res.error); toast("cantSave"); load(op.t); return false; }
  }
  queue.push(op); storeQueue(); await flush();
  if (queue.includes(op)) { toast("savedOffline"); return false; }
  if (okKey) toast(okKey);
  return true;
}
let flushing = false;
async function flush() {
  if (flushing || !queue.length || !navigator.onLine || !hid) { renderChrome(); return; }
  flushing = true;
  try {
    while (queue.length) {
      const op = queue[0], res = await send(op);
      if (res.error && unreachable(res)) break;
      if (res.error) { console.error(res.error); toast("cantSave"); }
      else if (op.notify) notify(...op.notify);
      queue.shift(); storeQueue();
    }
  } finally { flushing = false; }
  renderChrome();
  if (!queue.length) loadAll();
}
window.addEventListener("online", flush);

// ---------- data loading ----------
const TABLES = {
  groceries: () => sb.from("groceries").select("*").order("created_at"),
  chores: () => sb.from("chores").select("*").order("created_at"),
  events: () => sb.from("events").select("*").order("date"),
  dogs: () => sb.from("dogs").select("*").order("created_at"),
  members: () => sb.from("members").select("user_id, display_name, lang, created_at").order("created_at"),
  needs: () => sb.from("needs").select("*").order("created_at"),
  shopping_trips: () => sb.from("shopping_trips").select("*").order("created_at", { ascending: false }),
  attachments: () => sb.from("attachments").select("*").order("created_at"),
  dog_log: () => sb.from("dog_log").select("*").order("at", { ascending: false }).limit(100),
  dog_meds: () => sb.from("dog_meds").select("*").order("created_at"),
  history: () => sb.from("grocery_history").select("name_key, name, cat, uses").order("uses", { ascending: false }).order("last_used", { ascending: false }).limit(40)
};
async function load(name) {
  const { data, error } = await TABLES[name]();
  if (error) return;
  S[name] = data || [];
  queue.filter(op => op.t === name).forEach(applyOp); // changes still waiting to be sent
  render();
  if (name === "dogs") loadPhotos();
  if (name === "attachments" && ui.filesFor && !$("#settings").hidden) renderFiles();
}
async function loadHome() {
  const { data } = await sb.from("households").select("id, name, invite_code").eq("id", hid).maybeSingle();
  S.home = data; render();
}
async function loadAll() { await Promise.all([...Object.keys(TABLES).map(load), loadHome()]); }

const reloadSoon = {};
function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("home-" + hid);
  ["groceries", "chores", "events", "dogs", "needs", "shopping_trips", "attachments", "dog_log", "dog_meds"].forEach(t => {
    channel.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `household_id=eq.${hid}` }, () => {
      clearTimeout(reloadSoon[t]); reloadSoon[t] = setTimeout(() => load(t), 150);
    });
  });
  channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "households", filter: `id=eq.${hid}` }, loadHome);
  channel.subscribe(status => { online = status === "SUBSCRIBED"; renderChrome(); });
}
// iPhone pauses apps in the background: refresh when it comes back.
document.addEventListener("visibilitychange", () => { if (!document.hidden && hid) { flush(); loadAll(); if (!online) subscribe(); } });

// ---------- derived ----------
const due = c => c.every ? (c.last_done ? addDays(c.last_done, c.every) : (c.start_date || today())) : null;
function duePill(d0) {
  const d = diffDays(d0, today());
  if (d < 0) return `<span class="pill late">${esc(T("late")(-d))}</span>`;
  if (d === 0) return `<span class="pill today">${T("dueToday")}</span>`;
  if (d === 1) return `<span class="pill soon">${T("tomorrow")}</span>`;
  return `<span class="pill soon">${esc(T("inDays")(d))}</span>`;
}
const routines = () => S.chores.filter(c => c.every > 0).map(c => ({ ...c, due: due(c) })).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : choreTitle(a).localeCompare(choreTitle(b)));
const todos = () => S.chores.filter(c => !c.every).sort((a, b) => (a.done - b.done) || a.created_at.localeCompare(b.created_at));
const dueNow = () => routines().filter(c => c.due <= today());
// Each plan at its next date (repeating plans appear once, at their next time).
const upcoming = (n = 50) => S.events.map(e => { const d = nextOn(e, today()); return d && { ...e, date: d }; }).filter(Boolean)
  .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, n);
const onDay = s => S.events.filter(e => occursOn(e, s)).map(e => ({ ...e, date: s }));

// ---------- views ----------
function delBtn(table, id) {
  const key = table + "/" + id;
  return pendingDelete === key
    ? `<button class="icon confirm" data-act="del-yes" data-k="${esc(key)}">${T("del")}</button>`
    : `<button class="icon" data-act="del" data-k="${esc(key)}" aria-label="${T("delAria")}">${IC.trash}</button>`;
}
// On Today: a chip when the chore is someone's. In the lists: a button that changes who does it.
function ownerTag(c, compact) {
  const o = owner(c);
  if (compact) return o ? ` <span class="chip ${o === me ? "mine" : ""}">${esc(ownerLabel(c, o))}</span>` : "";
  const label = c.rotate ? (o ? ownerLabel(c, o) : T("whoTurns")) : o ? ownerLabel(c, o) : T("whoAnyone");
  return ` · <button class="who" data-act="who" data-id="${esc(c.id)}" aria-label="${esc(T("whoLabel"))}: ${esc(label)}">${esc(label)}</button>`;
}
function routineRow(c, compact) {
  const last = c.last_done ? T("lastDone")(fmtDay(c.last_done), c.last_by ? who(c.last_by) : "") : T("notYet");
  return `<div class="row">
    <div class="main"><div class="t">${c.dog ? `<span class="paw">${IC.paw}</span> ` : ""}${esc(choreTitle(c))}${compact ? ownerTag(c, true) : ""}</div>
      <div class="s">${esc(repeatLabel(c.every))} · ${esc(last)}${compact ? "" : ownerTag(c)}</div></div>
    ${duePill(c.due)}
    <button class="btn small" data-act="did" data-id="${esc(c.id)}">${T("done")}</button>
    ${compact ? "" : delBtn("chores", c.id)}
  </div>`;
}
function eventRow(e) {
  const d = parse(e.date), cat = EV_COLORS[e.cat] ? e.cat : "home";
  return `<div class="row">
    <div class="when"><b>${d.getDate()}</b><span>${esc(mon3(d.getMonth()))}</span></div>
    <span class="dot" style="background:var(${EV_COLORS[cat]})"></span>
    <div class="main"><div class="t">${esc(e.title)}</div>
      <div class="s">${esc(T("dow")[d.getDay()])}${e.time ? ` · ${esc(e.time)}` : ""} · ${esc(T("evCats")[cat])}${e.repeat ? ` · ${esc(T("evRepeat")[e.repeat])}` : ""}${e.remind ? ` · <span title="${esc(T("evRemind")[e.remind])}">${IC.bell}</span>` : ""}${e.created_by ? ` · ${esc(T("addedBy")(who(e.created_by)))}` : ""}</div></div>
    ${clipBtn("event", e.id, e.title)}
    ${delBtn("events", e.id)}
  </div>`;
}
function todoRow(t) {
  const sub = t.done && t.done_by ? T("doneBy")(who(t.done_by)) : t.created_by ? T("addedBy")(who(t.created_by)) : "";
  return `<div class="row ${t.done ? "done" : ""}">
    <button class="check ${t.done ? "on" : ""}" data-act="todo" data-id="${esc(t.id)}" aria-label="${t.done ? T("reopen") : T("markDone")}">${t.done ? IC.tick : ""}</button>
    <div class="main"><div class="t">${t.dog ? `<span class="paw">${IC.paw}</span> ` : ""}${esc(choreTitle(t))}${t.done ? "" : ownerTag(t, true)}</div>
      <div class="s">${esc(sub)}</div></div>
    ${delBtn("chores", t.id)}</div>`;
}

function viewToday() {
  const d = dueNow(), meds = medsDueNow(), ev = upcoming(5), groc = S.groceries.filter(g => !g.done).length;
  const open = todos().filter(t => !t.done);
  const week = upcoming(999).filter(e => diffDays(e.date, today()) < 7).length;
  return `
  <div class="stats">
    <a class="card stat ${d.length ? "alert" : ""}" href="#chores"><b>${d.length}</b><span>${T("choresDue")}</span></a>
    <a class="card stat" href="#groceries"><b>${groc}</b><span>${T("toBuy")}</span></a>
    <a class="card stat" href="#calendar"><b>${week}</b><span>${T("thisWeek")}</span></a>
  </div>
  ${S.dogs.length ? `<section class="sec">${dogButtons()}</section>` : ""}
  <section class="sec"><div class="sec-head"><h2>${T("dueNow")}</h2><a class="link" href="#chores">${T("allChores")}</a></div>
    <div class="card list">${d.length || meds.length ? d.map(c => routineRow(c, true)).join("") + meds.map(m => medRow(m, true)).join("")
      : `<div class="empty">${T("nothingDue")} ${S.chores.length ? T("enjoy") : T("addRoutinesHint")}</div>`}</div></section>
  ${open.length ? `<section class="sec"><div class="sec-head"><h2>${T("todos")}</h2><span class="eyebrow">${esc(T("open")(open.length))}</span></div>
    <div class="card list">${open.slice(0, 4).map(todoRow).join("")}</div></section>` : ""}
  <section class="sec"><div class="sec-head"><h2>${T("comingUp")}</h2><a class="link" href="#calendar">${T("calendar")}</a></div>
    <div class="card list">${ev.length ? ev.map(eventRow).join("") : `<div class="empty">${T("noPlans")}</div>`}</div></section>`;
}

function viewGroceries() {
  const open = S.groceries.filter(g => !g.done), done = S.groceries.filter(g => g.done);
  const groups = GROC_KEYS.map(k => [k, open.filter(g => (GROC_KEYS.includes(g.cat) ? g.cat : "other") === k)]).filter(g => g[1].length);
  const onList = new Set(open.map(g => g.name.trim().toLowerCase()));
  const often = S.history.filter(h => h.uses >= 2 && !onList.has(h.name_key)).slice(0, 10);
  const row = g => `<div class="row ${g.done ? "done" : ""}">
      <button class="check ${g.done ? "on" : ""}" data-act="groc" data-id="${esc(g.id)}" aria-label="${g.done ? T("putBack") : T("markBought")}">${g.done ? IC.tick : ""}</button>
      <div class="main"><div class="t">${esc(g.name)}${g.qty ? ` <span class="chip">${esc(g.qty)}</span>` : ""}</div>${g.created_by && !g.done ? `<div class="s">${esc(T("addedBy")(who(g.created_by)))}</div>` : ""}</div>
      ${delBtn("groceries", g.id)}</div>`;
  return `
  <form class="addbar" id="fGroc">
    <input type="text" id="gName" class="grow" placeholder="${esc(T("gPlaceholder"))}" autocomplete="off" required>
    <input type="text" id="gQty" placeholder="${esc(T("qty"))}" style="flex:0 1 80px">
    <select id="gCat">${GROC_KEYS.map(k => `<option value="${k}" ${k === ui.grocCat ? "selected" : ""}>${esc(T("grocCats")[k])}</option>`).join("")}</select>
    <button class="btn">${T("add")}</button>
  </form>
  ${often.length ? `<div class="often"><span class="eyebrow">${T("often")}</span>
    ${often.map(h => `<button class="chip-btn" data-act="often" data-name="${esc(h.name)}" data-cat="${esc(h.cat)}">+ ${esc(h.name)}</button>`).join("")}</div>` : ""}
  ${groups.length ? groups.map(([k, items]) => `<section class="sec"><span class="eyebrow">${esc(T("grocCats")[k])}</span><div class="card list">${items.map(row).join("")}</div></section>`).join("")
    : `<section class="sec"><div class="card"><div class="empty">${T("listEmpty")}</div></div></section>`}
  ${done.length ? `<section class="sec"><div class="sec-head"><span class="eyebrow">${esc(T("basket")(done.length))}</span>
      <div class="kv">${ui.finishing ? "" : `<button class="btn ghost small" data-act="clear-basket">${T("clearBasket")}</button><button class="btn small" data-act="finish">${T("finishShop")}</button>`}</div></div>
    ${ui.finishing ? `<form class="addbar" id="fFinish" style="margin-bottom:10px">
      <input type="text" id="fStore" class="grow" placeholder="${esc(T("store"))}" autocomplete="off">
      <input type="text" id="fTotal" inputmode="decimal" placeholder="${esc(T("total"))}" style="flex:0 1 120px">
      <label class="file-pick"><span>${T("receipt")}</span><input type="file" id="fReceipt" accept="image/*,application/pdf" multiple></label>
      <button type="button" class="btn ghost" data-act="finish-cancel">${T("cancel")}</button><button class="btn">${T("saveTrip")}</button>
    </form>` : ""}
    <div class="card list">${done.map(row).join("")}</div></section>` : ""}`;
}

// Shopping tab: the list, bigger needs, and past shops (with receipts).
function viewShopping() {
  const n = S.needs.filter(x => !x.done).length;
  const seg = `<div class="seg" role="tablist">${SHOP_VIEWS.map(v => `<button type="button" role="tab" data-act="shop-view" data-v="${v}" aria-pressed="${ui.shopView === v}" aria-selected="${ui.shopView === v}">${T({ list: "shopList", needs: "shopNeeds", past: "shopPast" }[v])}${v === "needs" && n ? ` <span class="count">${n}</span>` : ""}</button>`).join("")}</div>`;
  return seg + { list: viewGroceries, needs: viewNeeds, past: viewPast }[ui.shopView]();
}

const safeLink = u => /^https?:\/\//i.test(u) ? u : "https://" + u;
function viewNeeds() {
  const open = S.needs.filter(x => !x.done), done = S.needs.filter(x => x.done);
  const groups = NEED_KEYS.map(k => [k, open.filter(x => (NEED_KEYS.includes(x.cat) ? x.cat : "other") === k)]).filter(g => g[1].length);
  const row = x => `<div class="row ${x.done ? "done" : ""}">
      <button class="check ${x.done ? "on" : ""}" data-act="need" data-id="${esc(x.id)}" aria-label="${x.done ? T("putBack") : T("markBought")}">${x.done ? IC.tick : ""}</button>
      <div class="main"><div class="t">${esc(x.title)}${x.price ? ` <span class="chip">${esc(x.price)}</span>` : ""}</div>
        <div class="s">${[x.notes ? esc(x.notes) : "", x.link ? `<a class="link" href="${esc(safeLink(x.link))}" target="_blank" rel="noopener noreferrer">${T("openLink")} ${IC.link}</a>` : "",
          x.done && x.done_by ? esc(T("doneBy")(who(x.done_by))) : x.created_by ? esc(T("addedBy")(who(x.created_by))) : ""].filter(Boolean).join(" · ")}</div></div>
      ${delBtn("needs", x.id)}</div>`;
  return `
  <form class="addbar" id="fNeed">
    <input type="text" id="nTitle" class="grow" placeholder="${esc(T("nPlaceholder"))}" autocomplete="off" required>
    <select id="nCat">${NEED_KEYS.map(k => `<option value="${k}" ${k === ui.needCat ? "selected" : ""}>${esc(T("needCats")[k])}</option>`).join("")}</select>
    <input type="text" id="nPrice" placeholder="${esc(T("price"))}" style="flex:0 1 90px">
    <input type="url" id="nLink" placeholder="${esc(T("link"))}" autocomplete="off">
    <input type="text" id="nNotes" class="grow" placeholder="${esc(T("nNotes"))}">
    <button class="btn">${T("add")}</button>
  </form>
  ${groups.length ? groups.map(([k, items]) => `<section class="sec"><span class="eyebrow">${esc(T("needCats")[k])}</span><div class="card list">${items.map(row).join("")}</div></section>`).join("")
    : `<section class="sec"><div class="card"><div class="empty">${T("noNeeds")}</div></div></section>`}
  ${done.length ? `<section class="sec"><div class="sec-head"><span class="eyebrow">${esc(T("bought")(done.length))}</span><button class="btn ghost small" data-act="clear-needs">${T("clearBought")}</button></div>
    <div class="card list">${done.map(row).join("")}</div></section>` : ""}`;
}

const filesOf = (kind, id) => S.attachments.filter(a => (kind === "event" ? a.event_id : a.trip_id) === id);
function clipBtn(kind, id, title) {
  const n = filesOf(kind, id).length;
  return `<button class="icon clip ${n ? "has" : ""}" data-act="files" data-kind="${kind}" data-id="${esc(id)}" data-title="${esc(title)}" aria-label="${esc(T("files"))}${n ? ` (${n})` : ""}">${IC.clip}${n ? `<span>${n}</span>` : ""}</button>`;
}
function viewPast() {
  if (!S.shopping_trips.length) return `<section class="sec"><div class="card"><div class="empty">${T("noTrips")}</div></div></section>`;
  return `<section class="sec"><div class="card list">${S.shopping_trips.map(tr => {
    const items = Array.isArray(tr.items) ? tr.items : [], day = ymd(new Date(tr.created_at));
    const title = [cap(fmtDay(day)), tr.store].filter(Boolean).join(" · ");
    return `<div class="row trip">
      <div class="main"><div class="t">${esc(title)}${tr.total ? ` <span class="chip">${esc(tr.total)}</span>` : ""}</div>
        <details><summary class="s">${esc(T("items")(items.length))}${tr.created_by ? ` · ${esc(T("addedBy")(who(tr.created_by)))}` : ""}</summary>
          <ul class="trip-items">${items.map(i => `<li>${esc(i.name)}${i.qty ? ` <span class="chip">${esc(i.qty)}</span>` : ""}</li>`).join("")}</ul></details></div>
      ${clipBtn("trip", tr.id, title)}
      ${delBtn("shopping_trips", tr.id)}</div>`;
  }).join("")}</div></section>`;
}

function viewChores() {
  const r = routines(), t = todos();
  return `
  <form class="addbar" id="fChore">
    <input type="text" id="cTitle" class="grow" placeholder="${esc(T("cPlaceholder"))}" autocomplete="off" required>
    <select id="cEvery">${REPEAT.map(n => `<option value="${n}" ${n === 7 ? "selected" : ""}>${esc(repeatLabel(n))}</option>`).join("")}</select>
    <select id="cWho" aria-label="${esc(T("whoLabel"))}"><option value="">${esc(T("whoAnyone"))}</option>${S.members.map(m => `<option value="${esc(m.user_id)}">${esc(m.user_id === me ? T("you_") : m.display_name || T("partner"))}</option>`).join("")}${S.members.length > 1 ? `<option value="turns">${esc(T("whoTurns"))}</option>` : ""}</select>
    <label class="toggle"><input type="checkbox" id="cDog"> ${T("dogsBox")}</label>
    <button class="btn">${T("add")}</button>
  </form>
  <section class="sec"><div class="sec-head"><h2>${T("routines")}</h2><span class="eyebrow">${T("repeatOwn")}</span></div>
    <div class="card list">${r.length ? r.map(c => routineRow(c)).join("") : `<div class="empty">${T("noRoutines")}</div>`}</div></section>
  <section class="sec"><div class="sec-head"><h2>${T("oneOff")}</h2>${t.some(x => x.done) ? `<button class="btn ghost small" data-act="clear-todos">${T("clearDone")}</button>` : ""}</div>
    <div class="card list">${t.length ? t.map(todoRow).join("") : `<div class="empty">${T("noTodos")}</div>`}</div></section>`;
}

function viewCalendar() {
  const [y, m] = calMonth.split("-").map(Number);
  const startOff = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const gridStart = new Date(y, m - 1, 1 - startOff);
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); const s = ymd(d);
    if (i >= 35 && d.getMonth() !== m - 1) break;
    const evs = onDay(s);
    cells += `<button class="day ${d.getMonth() !== m - 1 ? "out" : ""} ${s === today() ? "today" : ""} ${s === calSel ? "sel" : ""}" data-act="pick" data-d="${s}" aria-label="${esc(fmtDay(s))}${evs.length ? `, ${esc(T("plans")(evs.length))}` : ""}">
      ${d.getDate()}<span class="dots">${evs.slice(0, 3).map(e => `<i style="background:var(${EV_COLORS[e.cat] || EV_COLORS.home})"></i>`).join("")}</span></button>`;
  }
  const dayEvents = onDay(calSel).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const later = upcoming(12).filter(e => e.date !== calSel);
  return `
  <div class="card cal">
    <div class="cal-head"><button class="icon" data-act="mon" data-n="-1" aria-label="${T("prevMonth")}">${IC.prev}</button>
      <b>${esc(cap(T("months")[m - 1]))} ${y}</b>
      <button class="icon" data-act="mon" data-n="1" aria-label="${T("nextMonth")}">${IC.next}</button></div>
    <div class="grid7">${T("dowGrid").map(d => `<div class="dow">${d}</div>`).join("")}${cells}</div>
  </div>
  <form class="addbar" id="fEvent" style="margin-top:12px">
    <input type="text" id="eTitle" class="grow" placeholder="${esc(T("ePlaceholder"))}" autocomplete="off" required>
    <input type="date" id="eDate" value="${calSel}" required>
    <input type="time" id="eTime" style="flex:0 1 110px">
    <select id="eCat">${Object.keys(EV_COLORS).map(k => `<option value="${k}" ${k === ui.evCat ? "selected" : ""}>${esc(T("evCats")[k])}</option>`).join("")}</select>
    <select id="eRepeat" aria-label="${esc(T("repeatLbl"))}">${Object.entries(T("evRepeat")).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
    <select id="eRemind" aria-label="${esc(T("remindLbl"))}">${Object.entries(T("evRemind")).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
    <button class="btn">${T("add")}</button>
  </form>
  <section class="sec"><div class="sec-head"><h2>${esc(cap(fmtDay(calSel)))}</h2>${calSel === today() ? `<span class="eyebrow">${T("todayLbl")}</span>` : ""}</div>
    <div class="card list">${dayEvents.length ? dayEvents.map(eventRow).join("") : `<div class="empty">${T("nothingDay")}</div>`}</div></section>
  <section class="sec"><h2>${T("nextUp")}</h2>
    <div class="card list">${later.length ? later.map(eventRow).join("") : `<div class="empty">${T("nothingElse")}</div>`}</div></section>`;
}

// ---------- dogs ----------
function age(b) {
  if (!b) return "";
  const n = new Date(), d = parse(b);
  const m = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth() - (n.getDate() < d.getDate() ? 1 : 0);
  return m < 12 ? T("ageMonths")(Math.max(0, m)) : T("ageYears")(Math.floor(m / 12));
}
const hhmm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const when = iso => ymd(new Date(iso)) === today() ? hhmm(iso) : `${fmtDay(ymd(new Date(iso)))} ${hhmm(iso)}`;
const todaysLog = () => S.dog_log.filter(l => ymd(new Date(l.at)) === today()).sort((a, b) => b.at.localeCompare(a.at));
const LOG_ICON = { walk: "🦮", food: "🥣", med: "💊" };
const dogName = id => find(S.dogs, id)?.name || "";

// Medicines: due like chores (every N days), or "when needed" (every 0).
const medDue = m => m.every ? (m.last_given ? addDays(m.last_given, m.every) : m.start_date || today()) : null;
const medsDueNow = () => S.dog_meds.filter(m => m.every && medDue(m) <= today());
const medDetail = m => `${m.name}${m.dose ? ` (${m.dose})` : ""}`;
const medEvery = n => n ? repeatLabel(n) : T("whenNeeded");
function medRow(m, compact) {
  const last = m.last_given ? T("lastDone")(fmtDay(m.last_given), m.last_by ? who(m.last_by) : "") : T("notYet");
  const sub = [compact ? dogName(m.dog_id) : "", m.dose, medEvery(m.every), m.every ? T("atTime")(m.at_time || "09:00") : "", last,
    m.stock != null ? T("left")(m.stock) : ""].filter(Boolean).map(esc).join(" · ");
  return `<div class="row ${m.stock != null && m.stock <= 2 ? "low" : ""}">
    <span class="log-ic">${LOG_ICON.med}</span>
    <div class="main"><div class="t">${esc(m.name)}</div><div class="s">${sub}</div></div>
    ${m.every ? duePill(medDue(m)) : ""}
    <button class="btn small" data-act="med-given" data-id="${esc(m.id)}">${T("given")}</button>
    ${compact ? "" : delBtn("dog_meds", m.id)}</div>`;
}
function medForm(dogId) {
  return `<form class="addbar med-form" id="fMed" data-dog="${esc(dogId)}">
    <input type="text" id="mName" class="grow" placeholder="${esc(T("medName"))}" required autocomplete="off">
    <input type="text" id="mDose" placeholder="${esc(T("medDose"))}" required>
    <select id="mEvery" aria-label="${esc(T("medEveryLbl"))}">${[1, 2, 7, 14, 30, 90, 180, 365, 0].map(n => `<option value="${n}" ${n === 1 ? "selected" : ""}>${esc(medEvery(n))}</option>`).join("")}</select>
    <label class="inline"><span>${T("medTime")}</span><input type="time" id="mTime" value="09:00"></label>
    <input type="number" id="mStock" min="0" inputmode="numeric" placeholder="${esc(T("medStock"))}" style="flex:0 1 110px">
    <button type="button" class="btn ghost" data-act="med-cancel">${T("cancel")}</button><button class="btn">${T("add")}</button>
  </form>`;
}

// One tap: walk or meal for the whole pack.
function dogButtons() {
  const lastWalk = S.dog_log.filter(l => l.kind === "walk").sort((a, b) => b.at.localeCompare(a.at))[0];
  return `<div class="card dog-quick">
    <div class="quick-btns"><button class="btn big" data-act="log" data-kind="walk">${LOG_ICON.walk} ${T("walkBtn")}</button><button class="btn big ghost" data-act="log" data-kind="food">${LOG_ICON.food} ${T("foodBtn")}</button></div>
    <div class="hint" style="margin:0">${esc(lastWalk ? T("lastWalk")(when(lastWalk.at), lastWalk.by_user ? who(lastWalk.by_user) : "") : T("noWalkYet"))}</div></div>`;
}
function dogCard(d) {
  const url = d.photo && photoUrls[d.photo];
  const facts = [age(d.birthday), d.breed, d.sex ? T("sexOpts")[d.sex] : "", d.weight].filter(Boolean).map(esc).join(" · ");
  const info = [["dFood", d.food], ["dVet", d.vet], ["dChip", d.chip], ["dHealth", d.health], ["dNotesL", d.notes]].filter(x => x[1])
    .map(([k, val]) => `<div><span class="lbl">${T(k)}</span> ${esc(val)}</div>`).join("");
  const meds = S.dog_meds.filter(m => m.dog_id === d.id);
  return `<div class="card dog-card">
    <div class="dog">
      ${url ? `<img class="av photo" src="${esc(url)}" alt="">` : `<div class="av">${esc((d.name || "?").trim()[0]?.toUpperCase() || "?")}</div>`}
      <div class="main"><div class="dog-name">${esc(d.name)}</div><div class="s">${facts}</div>${info ? `<div class="dog-info">${info}</div>` : ""}</div>
      <div class="dog-actions"><button class="btn ghost small" data-act="dog-edit" data-id="${esc(d.id)}">${T("editDog")}</button>${delBtn("dogs", d.id)}</div>
    </div>
    <div class="dog-meds"><div class="sec-head"><span class="eyebrow">${T("medicines")}</span>${ui.medFor === d.id ? "" : `<button class="btn ghost small" data-act="med-add" data-id="${esc(d.id)}">+ ${T("addMed")}</button>`}</div>
      ${ui.medFor === d.id ? medForm(d.id) : ""}
      ${meds.length ? `<div class="list">${meds.map(m => medRow(m)).join("")}</div>` : ui.medFor === d.id ? "" : `<div class="hint" style="margin:0">${T("noMeds")}</div>`}</div>
  </div>`;
}
function viewDogs() {
  const care = routines().filter(c => c.dog), dogTodos = todos().filter(t => t.dog && !t.done);
  const vet = upcoming(999).filter(e => e.cat === "dogs").slice(0, 6), log = todaysLog();
  return `
  ${dogButtons()}
  <section class="sec"><h2>${T("todayLbl2")}</h2>
    <div class="card list">${log.length ? log.map(l => `<div class="row"><span class="log-ic">${LOG_ICON[l.kind] || ""}</span>
      <div class="main"><div class="t">${esc(l.kind === "med" ? `${dogName(l.dog_id)}: ${l.detail}` : T(l.kind === "walk" ? "logWalk" : "logFood"))} · ${hhmm(l.at)}</div><div class="s">${esc(who(l.by_user))}</div></div>${delBtn("dog_log", l.id)}</div>`).join("")
      : `<div class="empty">${T("noLogToday")}</div>`}</div></section>
  <section class="sec"><div class="sec-head"><h2>${T("pack")}</h2><button class="btn small" data-act="dog-edit" data-id="">${T("addDog")}</button></div>
    ${S.dogs.length ? `<div class="dogs">${S.dogs.map(dogCard).join("")}</div>` : `<div class="card"><div class="empty">${T("noDogs")}</div></div>`}</section>
  <section class="sec"><div class="sec-head"><h2>${T("care")}</h2><a class="link" href="#chores">${T("addInChores")}</a></div>
    <div class="card list">${care.length ? care.map(c => routineRow(c)).join("") : `<div class="empty">${T("noCare")}</div>`}
    ${dogTodos.map(todoRow).join("")}</div></section>
  <section class="sec"><div class="sec-head"><h2>${T("vet")}</h2><a class="link" href="#calendar">${T("addInCal")}</a></div>
    <div class="card list">${vet.length ? vet.map(eventRow).join("") : `<div class="empty">${T("noVet")}</div>`}</div></section>`;
}
function logDogs(kind) {
  save({ t: "dog_log", kind: "insert", values: { id: uuid(), kind }, notify: [kind, ""] }, kind === "walk" ? "walkLogged" : "foodLogged");
}
function medGiven(id) {
  const m = find(S.dog_meds, id); if (!m) return;
  save({ t: "dog_meds", kind: "update", id, values: { last_given: today(), last_by: me, stock: m.stock != null ? Math.max(0, m.stock - 1) : null } });
  const detail = medDetail(m);
  save({ t: "dog_log", kind: "insert", values: { id: uuid(), kind: "med", dog_id: m.dog_id, detail }, notify: ["med", `${dogName(m.dog_id)}: ${detail}`] },
    m.stock != null && m.stock - 1 <= 2 ? "medLow" : "medGiven");
}

// Add or edit a dog in the sheet.
function openDog(id) {
  const d = (id && find(S.dogs, id)) || {}; ui.dogFor = id || "new"; ui.dogPhoto = null;
  const f = (k, label, type = "text", extra = "") => `<label><span>${T(label)}</span><input type="${type}" id="dg_${k}" value="${esc(d[k] || "")}" ${extra}></label>`;
  const url = d.photo && photoUrls[d.photo];
  $("#settings").innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(id ? T("editDog") : T("addDog"))}">
    <div class="kv"><h2>${esc(id ? d.name : T("addDog"))}</h2><button class="btn ghost small" data-act="close-settings">${T("close")}</button></div>
    <form id="fDogEdit" class="card dog-form">
      <div class="photo-pick">${url ? `<img class="av photo" id="dgPrev" src="${esc(url)}" alt="">` : `<div class="av" id="dgPrev">${esc((d.name || "?")[0].toUpperCase())}</div>`}
        <label class="btn ghost small">${T("photo")}<input type="file" id="dgPhoto" accept="image/*" hidden></label></div>
      ${f("name", "name", "text", 'required maxlength="40"')}
      <div class="two">${f("birthday", "birthday", "date")}<label><span>${T("sex")}</span><select id="dg_sex">${Object.entries(T("sexOpts")).map(([k, l]) => `<option value="${k}" ${(d.sex || "") === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label></div>
      <div class="two">${f("breed", "breed")}${f("weight", "weight", "text", 'placeholder="12 kg"')}</div>
      ${f("food", "foodLbl")}${f("vet", "vetLbl")}${f("chip", "chipLbl", "text", 'inputmode="numeric"')}${f("health", "healthLbl")}${f("notes", "notesLbl")}
      <button class="btn">${T("saveTrip")}</button>
    </form></div>`;
  $("#settings").hidden = false;
}
const DOG_FIELDS = ["name", "birthday", "sex", "breed", "weight", "food", "vet", "chip", "health", "notes"];
async function saveDog() {
  const values = Object.fromEntries(DOG_FIELDS.map(k => [k, ($("#dg_" + k)?.value || "").trim()]));
  if (!values.name) return;
  values.birthday = values.birthday || null;
  const isNew = ui.dogFor === "new", id = isNew ? uuid() : ui.dogFor, photo = ui.dogPhoto;
  closeSettings();
  const sent = await save(isNew ? { t: "dogs", kind: "insert", values: { id, ...values } } : { t: "dogs", kind: "update", id, values }, isNew ? "added" : "savedOk");
  if (photo) sent ? uploadDogPhoto(id, photo) : toast("needsOnline");
}
// Photos are made smaller on the phone first (about 900 px), so they load fast.
async function shrink(file) {
  try {
    const img = await createImageBitmap(file), k = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch (e) { return file; }
}
async function uploadDogPhoto(id, file) {
  if (!navigator.onLine) { toast("needsOnline"); return; }
  const small = await shrink(file);
  if (small.size > MAX_FILE) { toast("fileTooBig"); return; }
  const ext = small.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "img").toLowerCase();
  const path = `${hid}/dog/${id}/${uuid()}.${ext}`;
  const up = await sb.storage.from("files").upload(path, small, { contentType: small.type || MIME_BY_EXT[ext] || "image/jpeg" });
  if (up.error) { console.error(up.error); toast("cantUpload"); return; }
  const old = find(S.dogs, id)?.photo;
  if (await save({ t: "dogs", kind: "update", id, values: { photo: path } })) { if (old) sb.storage.from("files").remove([old]); loadPhotos(); }
}
// Private photos are shown through signed links that last a few hours, made when the dogs load.
const photoUrls = {};
async function loadPhotos() {
  const paths = S.dogs.map(d => d.photo).filter(p => p && !photoUrls[p]);
  if (!paths.length || !navigator.onLine) return;
  const { data } = await sb.storage.from("files").createSignedUrls(paths, 6 * 3600);
  (data || []).forEach(x => { if (x.signedUrl) photoUrls[x.path] = x.signedUrl; });
  render();
}

const VIEWS = { today: viewToday, groceries: viewShopping, chores: viewChores, calendar: viewCalendar, dogs: viewDogs };

// ---------- settings sheet ----------
async function pushState() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS && !isStandalone() ? "ios" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}
// Personal link for an iPhone Shortcut that logs a dog walk (see supabase/functions/walk).
const scUrl = t => `${CFG.SUPABASE_URL}/functions/v1/walk?t=${t}`;
async function newShortcutToken() {
  const t = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, "0")).join("");
  const { error } = await sb.from("shortcut_tokens").upsert({ token: t }, { onConflict: "user_id" });
  if (error) { console.error(error); toast(navigator.onLine ? "cantSave" : "needsOnline"); }
  await renderSettings();
}
async function renderSettings() {
  const st = await pushState();
  const scToken = (await sb.from("shortcut_tokens").select("token").maybeSingle()).data?.token || "";
  const notifBody = {
    on: `<p class="hint">${T("notifOn")}</p><div class="kv"><button class="btn small" data-act="push-test">${T("notifTest")}</button><button class="btn ghost small" data-act="push-off">${T("notifDisable")}</button></div>`,
    off: `<p class="hint">${T("notifOff")}</p><button class="btn" data-act="push-on">${T("notifEnable")}</button>`,
    ios: `<p class="hint">${T("notifIOS")}</p>`,
    denied: `<p class="hint">${T("notifDenied")}</p>`,
    unsupported: `<p class="hint">${T("notifUnsupported")}</p>`
  }[st];
  $("#settings").innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${T("settings")}">
    <div class="kv"><h2>${T("settings")}</h2><button class="btn ghost small" data-act="close-settings">${T("close")}</button></div>
    <div class="card"><b>${T("invite")}</b><p class="hint" style="margin:0">${T("inviteHint")}</p>
      <div class="kv"><span class="code" id="inviteCode">${esc(S.home?.invite_code || "")}</span><button class="btn small" data-act="copy-code">${T("copy")}</button></div></div>
    <div class="card"><b>${T("members")}</b>${S.members.map(m => `<div>${esc(m.display_name || "—")}${m.user_id === me ? ` <span class="chip">${T("you_")}</span>` : ""}</div>`).join("")}</div>
    <div class="card"><b>${T("notif")}</b>${notifBody}</div>
    <div class="card"><div class="kv"><b>${T("language")}</b>
      <div class="lang" role="group"><button data-lang="en" aria-pressed="${lang === "en"}">EN</button><button data-lang="es" aria-pressed="${lang === "es"}">ES</button></div></div></div>
    <div class="card"><b>${T("scTitle")}</b><p class="hint" style="margin:0">${T("scHint")}</p>
      ${scToken ? `<input type="text" id="scLink" readonly value="${esc(scUrl(scToken))}" aria-label="${esc(T("scTitle"))}">
        <div class="kv"><button class="btn small" data-act="sc-copy">${T("scCopy")}</button><button class="btn ghost small" data-act="sc-new">${T("scNew")}</button></div>
        <details><summary class="link">${T("scHow")}</summary><ol class="steps">${T("scSteps").map(x => `<li>${x}</li>`).join("")}</ol></details>`
      : `<button class="btn small" data-act="sc-new" style="align-self:flex-start">${T("scCreate")}</button>`}</div>
    <div class="card"><b>${T("data")}</b><p class="hint" style="margin:0">${T("dataHint")}</p>
      <button class="btn ghost small" data-act="export" style="align-self:flex-start">${T("exportBtn")}</button></div>
    <button class="btn ghost" data-act="sign-out">${T("signOut")}</button>
    <p class="hint" style="margin:0;text-align:center">${T("version")} ${esc(running?.version || "dev")}</p>
  </div>`;
}
async function openSettings() { $("#settings").hidden = false; await renderSettings(); }
function closeSettings() { $("#settings").hidden = true; $("#settings").innerHTML = ""; ui.filesFor = null; }

// ---------- files (receipts, tickets, bookings) ----------
// Stored privately in the "files" bucket under <household id>/; the database rules keep each home's files to itself.
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const MIME_BY_EXT = { pdf: "application/pdf", pkpass: "application/vnd.apple.pkpass", heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
async function uploadFiles(kind, parentId, files) {
  if (!navigator.onLine) { toast("needsOnline"); return; }
  let ok = 0;
  for (const f of files) {
    if (f.size > MAX_FILE) { toast("fileTooBig"); continue; }
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const mime = f.type || MIME_BY_EXT[ext] || "";
    const path = `${hid}/${kind}/${parentId}/${uuid()}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
    toast("uploading");
    const up = await sb.storage.from("files").upload(path, f, { contentType: mime });
    if (up.error) { console.error(up.error); toast("cantUpload"); continue; }
    const { error } = await sb.from("attachments").insert({ [kind === "event" ? "event_id" : "trip_id"]: parentId, path, name: f.name, mime, size: f.size });
    if (error) { console.error(error); sb.storage.from("files").remove([path]); toast("cantUpload"); continue; }
    ok++;
  }
  if (ok) { toast("uploaded"); load("attachments"); }
}
function renderFiles() {
  const { kind, id, title } = ui.filesFor, list = filesOf(kind, id);
  $("#settings").innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(T("files"))}">
    <div class="kv"><h2>${esc(T("filesFor")(title))}</h2><button class="btn ghost small" data-act="close-settings">${T("close")}</button></div>
    <div class="card list">${list.length ? list.map(a => `<div class="row">
        <div class="main"><button class="file-open" data-act="open-file" data-path="${esc(a.path)}">${esc(a.name)}</button>
          <div class="s">${esc(fmtSize(a.size))}${a.created_by ? ` · ${esc(T("addedBy")(who(a.created_by)))}` : ""}</div></div>
        <button class="icon" data-act="del-file" data-id="${esc(a.id)}" aria-label="${T("delAria")}">${IC.trash}</button></div>`).join("")
      : `<div class="empty">${T("noFiles")}</div>`}</div>
    <label class="btn file-add">${T("addFile")}<input type="file" id="fileAdd" accept="image/*,application/pdf,.pkpass,application/vnd.apple.pkpass" multiple hidden></label>
  </div>`;
}
function openFiles(kind, id, title) { ui.filesFor = { kind, id, title }; $("#settings").hidden = false; renderFiles(); }
async function openFile(path) {
  const w = window.open("", "_blank"); // opened straight away so the browser doesn't block it
  const { data, error } = await sb.storage.from("files").createSignedUrl(path, 300);
  if (error) { if (w) w.close(); toast(navigator.onLine ? "cantUpload" : "needsOnline"); return; }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}
async function deleteFile(id) {
  const a = find(S.attachments, id); if (!a) return;
  const { error } = await sb.from("attachments").delete().eq("id", id);
  if (error) { toast(navigator.onLine ? "cantSave" : "needsOnline"); return; }
  sb.storage.from("files").remove([a.path]);
  S.attachments = S.attachments.filter(x => x.id !== id); render(); renderFiles(); toast("deleted");
}
// Files of a plan or shop that is being deleted (their rows go with it in the database).
function removeFilesOf(kind, id) {
  const paths = filesOf(kind, id).map(a => a.path);
  if (paths.length) sb.storage.from("files").remove(paths);
}

// Finish shopping: keep what was in the basket as one shop (with receipts), then empty the basket.
async function finishShopping() {
  const bought = S.groceries.filter(g => g.done); if (!bought.length) return;
  const id = uuid(), files = ui.receiptFiles || [];
  const values = { id, store: $("#fStore").value.trim(), total: $("#fTotal").value.trim(), items: bought.map(g => ({ name: g.name, qty: g.qty, cat: g.cat })) };
  ui.finishing = false; ui.receiptFiles = null;
  const sent = await save({ t: "shopping_trips", kind: "insert", values,
    notify: ["shop", `${T("items")(bought.length)}${values.store ? " · " + values.store : ""}`] }, "tripSaved");
  save({ t: "groceries", kind: "clear", match: { done: true } });
  if (files.length) sent ? uploadFiles("trip", id, files) : toast("receiptLater");
}

// A copy of everything in this home, as a JSON file (the database rules limit it to this home).
async function exportData() {
  const tables = ["households", "members", "groceries", "chores", "events", "dogs", "needs", "shopping_trips", "attachments", "dog_meds", "dog_log", "grocery_history"];
  const out = { app: "Home Together", version: running?.version || "dev", exported_at: new Date().toISOString() };
  for (const t of tables) {
    const { data, error } = await sb.from(t).select("*");
    if (error) { console.error(error); toast("cantExport"); return; }
    out[t] = data;
  }
  const name = `home-together-${today()}.json`;
  const file = new File([JSON.stringify(out, null, 2)], name, { type: "application/json" });
  // On iPhone the share sheet offers "Save to Files"; elsewhere it downloads.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); } catch (e) { /* closed the share sheet */ }
    return;
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast("exported");
}

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
async function pushOn() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { await renderSettings(); return; }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  await run(sb.from("push_subscriptions").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" }));
  await renderSettings();
}
async function pushOff() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
  await renderSettings();
}

// ---------- render ----------
function applyStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach(el => el.textContent = T(el.dataset.t));
  document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  $("#aSubmit").textContent = T(ui.authMode === "signin" ? "signIn" : "signUp");
  $("#aSwitch").textContent = T(ui.authMode === "signin" ? "noAccount" : "haveAccount");
  $("#aPass").autocomplete = ui.authMode === "signin" ? "current-password" : "new-password";
  $("#sSubmit").textContent = T(ui.setupMode === "create" ? "create" : "join");
  $("#openSettings").setAttribute("aria-label", T("settings"));
}
function renderChrome() {
  applyStatic();
  const hn = $("#homeName"); if (hn) { hn.textContent = S.home?.name || T("ourHome"); hn.title = T("rename"); }
  const d = new Date();
  $("#dateline").textContent = lang === "es" ? cap(`${T("dow")[d.getDay()]} ${d.getDate()} de ${T("months")[d.getMonth()]}`) : `${T("dow")[d.getDay()]} ${d.getDate()} ${T("months")[d.getMonth()]}`;
  const s = $("#sync"); s.classList.toggle("on", online && navigator.onLine && !queue.length);
  s.querySelector("span").textContent = queue.length ? T("pending")(queue.length) : T(!navigator.onLine ? "offline" : online ? "synced" : "reconnecting");
}
function render() {
  if ($("#app").hidden) { applyStatic(); return; }
  const focusId = document.activeElement?.id;
  renderChrome();
  document.querySelectorAll("nav.tabs a").forEach(a => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const nG = S.groceries.filter(g => !g.done).length, nC = dueNow().length;
  $("#bGroc").hidden = !nG; $("#bGroc").textContent = nG;
  $("#bChores").hidden = !nC; $("#bChores").textContent = nC;
  const drafts = {}; document.querySelectorAll("#view input:not([type=file]), #view select").forEach(el => { if (el.id) drafts[el.id] = el.type === "checkbox" ? el.checked : el.value; });
  $("#view").innerHTML = VIEWS[tab]();
  Object.entries(drafts).forEach(([id, v]) => { const el = document.getElementById(id); if (!el || id === "eDate") return; if (el.type === "checkbox") el.checked = v; else if (v !== "") el.value = v; });
  if (focusId) { const el = document.getElementById(focusId); if (el && el.closest("#view")) el.focus(); }
}
function setTab(t) { tab = VIEWS[t] ? t : "today"; pendingDelete = null; render(); window.scrollTo(0, 0); }
window.addEventListener("hashchange", () => setTab(location.hash.slice(1)));
window.addEventListener("online", renderChrome); window.addEventListener("offline", renderChrome);

// ---------- actions ----------
const find = (arr, id) => arr.find(x => x.id === id);
function setLang(l) {
  lang = l; try { localStorage.setItem("ht-lang", lang); } catch (e) {}
  if (sb && me && hid) sb.from("members").update({ lang }).eq("user_id", me).then(() => {});
  render(); if (!$("#settings").hidden) renderSettings();
}

document.addEventListener("click", async ev => {
  const lb = ev.target.closest(".lang button"); if (lb) { setLang(lb.dataset.lang); return; }
  if (ev.target.id === "settings") { closeSettings(); return; }
  if (ev.target.closest("#openSettings")) { openSettings(); return; }
  const b = ev.target.closest("[data-act]");
  if (!b) { if (pendingDelete) { pendingDelete = null; render(); } return; }
  const act = b.dataset.act, id = b.dataset.id;
  if (act !== "del" && act !== "del-yes" && pendingDelete) pendingDelete = null;
  switch (act) {
    case "del": pendingDelete = b.dataset.k; render(); return;
    case "del-yes": {
      const [t, i] = b.dataset.k.split("/"); pendingDelete = null;
      if (t === "events" || t === "shopping_trips") removeFilesOf(t === "events" ? "event" : "trip", i);
      if (t === "dogs") { const p = find(S.dogs, i)?.photo; if (p) sb.storage.from("files").remove([p]); }
      save({ t, kind: "delete", id: i }, "deleted"); return;
    }
    case "shop-view": ui.shopView = b.dataset.v; ui.finishing = false; try { localStorage.setItem("ht-shopView", ui.shopView); } catch (e) {} render(); return;
    case "need": {
      const x = find(S.needs, id); if (!x) return; const done = !x.done;
      save({ t: "needs", kind: "update", id, values: { done, done_by: done ? me : null } }); return;
    }
    case "clear-needs": save({ t: "needs", kind: "clear", match: { done: true } }); return;
    case "finish": ui.finishing = true; render(); $("#fStore")?.focus(); return;
    case "finish-cancel": ui.finishing = false; ui.receiptFiles = null; render(); return;
    case "log": logDogs(b.dataset.kind); return;
    case "med-given": medGiven(id); return;
    case "med-add": ui.medFor = id; render(); $("#mName")?.focus(); return;
    case "med-cancel": ui.medFor = null; render(); return;
    case "dog-edit": openDog(id); return;
    case "files": openFiles(b.dataset.kind, id, b.dataset.title); return;
    case "open-file": openFile(b.dataset.path); return;
    case "del-file":
      if (b.dataset.armed) { deleteFile(id); return; }
      b.dataset.armed = "1"; b.classList.add("confirm"); b.textContent = T("del"); return;
    case "groc": { const g = find(S.groceries, id); if (!g) return; save({ t: "groceries", kind: "update", id, values: { done: !g.done } }); return; }
    case "todo": {
      const t = find(S.chores, id); if (!t) return; const done = !t.done;
      save({ t: "chores", kind: "update", id, values: { done, done_by: done ? me : null }, notify: done ? ["todo_done", choreTitle(t)] : null });
      return;
    }
    case "did": {
      const c = find(S.chores, id); if (!c) return;
      save({ t: "chores", kind: "update", id, values: { last_done: today(), last_by: me }, notify: ["chore_done", choreTitle(c)] }, "markedDone");
      return;
    }
    case "who": {
      // Anyone → each person → take turns → anyone
      const c = find(S.chores, id); if (!c) return;
      const opts = [{ assigned_to: null, rotate: false }, ...S.members.map(m => ({ assigned_to: m.user_id, rotate: false }))];
      if (S.members.length > 1) opts.push({ assigned_to: null, rotate: true });
      const cur = opts.findIndex(o => o.rotate === !!c.rotate && o.assigned_to === (c.rotate ? null : c.assigned_to || null));
      save({ t: "chores", kind: "update", id, values: opts[(cur + 1) % opts.length] });
      return;
    }
    case "often": addGrocery(b.dataset.name, "", b.dataset.cat); return;
    case "clear-basket": save({ t: "groceries", kind: "clear", match: { done: true } }, "basketCleared"); return;
    case "clear-todos": save({ t: "chores", kind: "clear", match: { every: 0, done: true } }); return;
    case "export": exportData(); return;
    case "sc-new": newShortcutToken(); return;
    case "sc-copy": {
      try { await navigator.clipboard.writeText($("#scLink").value); toast("copied"); } catch (e) { $("#scLink").select(); }
      return;
    }
    case "mon": { const [y, m] = calMonth.split("-").map(Number); calMonth = ymd(new Date(y, m - 1 + Number(b.dataset.n), 1)).slice(0, 7); render(); return; }
    case "pick": calSel = b.dataset.d; calMonth = calSel.slice(0, 7); render(); return;
    case "close-settings": closeSettings(); return;
    case "copy-code": {
      try { await navigator.clipboard.writeText(S.home?.invite_code || ""); toast("copied"); }
      catch (e) { const r = document.createRange(); r.selectNodeContents($("#inviteCode")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      return;
    }
    case "push-on": pushOn().catch(e => { console.error(e); toast("cantSave"); }); return;
    case "push-off": pushOff().catch(() => {}); return;
    case "push-test": notify("test", ""); toast("testSent"); return;
    case "sign-out": await pushOff().catch(() => {}); await sb.auth.signOut(); closeSettings(); return;
  }
});

document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const f = ev.target, v = id => (document.getElementById(id)?.value || "").trim();
  if (f.id === "fAuth") return submitAuth();
  if (f.id === "fSetup") return submitSetup();
  if (f.id === "fGroc") {
    const name = v("gName"), qty = v("gQty"); if (!name) return; ui.grocCat = v("gCat"); try { localStorage.setItem("ht-grocCat", ui.grocCat); } catch (e) {}
    $("#gName").value = ""; $("#gQty").value = "";
    addGrocery(name, qty, ui.grocCat); $("#gName")?.focus();
  }
  if (f.id === "fChore") {
    const title = v("cTitle"); if (!title) return; const every = Number(v("cEvery")), dog = $("#cDog").checked, w = v("cWho");
    $("#cTitle").value = ""; $("#cDog").checked = false;
    save({ t: "chores", kind: "insert", values: { id: uuid(), title, every, dog, assigned_to: w && w !== "turns" ? w : null, rotate: w === "turns" },
      notify: [every ? "chore" : "todo", title] }, "added");
  }
  if (f.id === "fEvent") {
    const title = v("eTitle"), date = v("eDate"); if (!title || !date) return; ui.evCat = v("eCat");
    const time = v("eTime"), repeat = v("eRepeat"), remind = v("eRemind");
    if (remind === "hour" && !time) { toast("hourNeedsTime"); $("#eTime").focus(); return; }
    $("#eTitle").value = ""; $("#eTime").value = ""; $("#eRepeat").value = ""; $("#eRemind").value = "";
    calSel = date; calMonth = date.slice(0, 7);
    save({ t: "events", kind: "insert", values: { id: uuid(), title, date, time, cat: ui.evCat, repeat, remind },
      notify: ["event", `${title} · ${fmtDay(date)}${time ? " " + time : ""}`] }, "addedCal");
  }
  if (f.id === "fFinish") finishShopping();
  if (f.id === "fNeed") {
    const title = v("nTitle"); if (!title) return; ui.needCat = v("nCat");
    const values = { id: uuid(), title, cat: ui.needCat, price: v("nPrice"), link: v("nLink"), notes: v("nNotes") };
    ["nTitle", "nPrice", "nLink", "nNotes"].forEach(i => $("#" + i).value = "");
    save({ t: "needs", kind: "insert", values, notify: ["need", title] }, "added");
  }
  if (f.id === "fDogEdit") saveDog();
  if (f.id === "fMed") {
    const name = v("mName"), dog_id = f.dataset.dog; if (!name || !dog_id) return;
    const stock = v("mStock");
    const values = { id: uuid(), dog_id, name, dose: v("mDose"), every: Number(v("mEvery")), at_time: v("mTime") || "09:00", stock: stock === "" ? null : Math.max(0, parseInt(stock, 10) || 0), start_date: today() };
    ui.medFor = null;
    save({ t: "dog_meds", kind: "insert", values }, values.every ? "medAdded" : "added");
  }
});
// File pickers: the receipt is kept aside so a live refresh of the list can't drop it.
document.addEventListener("change", ev => {
  if (ev.target.id === "fReceipt") ui.receiptFiles = [...ev.target.files];
  if (ev.target.id === "dgPhoto" && ev.target.files[0]) {
    ui.dogPhoto = ev.target.files[0];
    const img = document.createElement("img"); img.className = "av photo"; img.id = "dgPrev"; img.alt = ""; img.src = URL.createObjectURL(ui.dogPhoto);
    $("#dgPrev").replaceWith(img);
  }
  if (ev.target.id === "fileAdd" && ui.filesFor) { const { kind, id } = ui.filesFor; uploadFiles(kind, id, [...ev.target.files]); ev.target.value = ""; }
});
function addGrocery(name, qty, cat) {
  save({ t: "groceries", kind: "insert", values: { id: uuid(), name, qty, cat }, notify: ["grocery", name] });
}

// rename the home
function onRename() {
  const h = document.createElement("span"); $("#homeName").replaceWith(h);
  h.innerHTML = `<input type="text" id="homeEdit" value="${esc(S.home?.name || T("ourHome"))}" maxlength="40" aria-label="${esc(T("homeName"))}" style="font-family:var(--display);font-size:1.3rem;font-weight:700;max-width:240px">`;
  const inp = $("#homeEdit"); inp.focus(); inp.select();
  let finished = false;
  const finish = async save => {
    if (finished) return; finished = true;
    const name = inp.value.trim();
    const btn = document.createElement("button"); btn.id = "homeName"; h.replaceWith(btn); btn.addEventListener("click", onRename);
    if (save && name && name !== S.home?.name) { S.home = { ...S.home, name }; await run(sb.from("households").update({ name }).eq("id", hid), "renamed"); }
    render();
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
  inp.addEventListener("blur", () => finish(true));
}
$("#homeName").addEventListener("click", onRename);

// ---------- sign in & setup ----------
$("#aSwitch").addEventListener("click", () => { ui.authMode = ui.authMode === "signin" ? "signup" : "signin"; $("#aErr").hidden = true; $("#aOk").hidden = true; applyStatic(); });
async function submitAuth() {
  const email = $("#aEmail").value.trim(), password = $("#aPass").value;
  $("#aErr").hidden = true; $("#aOk").hidden = true;
  if (password.length < 6) { $("#aErr").textContent = T("pwShort"); $("#aErr").hidden = false; return; }
  $("#aSubmit").disabled = true;
  if (ui.authMode === "signup") {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) { $("#aErr").textContent = error.message; $("#aErr").hidden = false; }
    else if (!data.session) { $("#aOk").textContent = T("checkEmail"); $("#aOk").hidden = false; ui.authMode = "signin"; applyStatic(); }
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { $("#aErr").textContent = T("badLogin"); $("#aErr").hidden = false; }
  }
  $("#aSubmit").disabled = false;
}

function setSetupMode(mode) {
  ui.setupMode = mode;
  $("#segCreate").setAttribute("aria-pressed", String(mode === "create"));
  $("#segJoin").setAttribute("aria-pressed", String(mode === "join"));
  $("#sHomeWrap").hidden = mode !== "create"; $("#sCodeWrap").hidden = mode !== "join";
  $("#sCode").required = mode === "join"; $("#sErr").hidden = true; applyStatic();
}
$("#segCreate").addEventListener("click", () => setSetupMode("create"));
$("#segJoin").addEventListener("click", () => setSetupMode("join"));
async function submitSetup() {
  const name = $("#sName").value.trim(); if (!name) return;
  $("#sSubmit").disabled = true; $("#sErr").hidden = true;
  const { data, error } = ui.setupMode === "create"
    ? await sb.rpc("create_household", { home_name: $("#sHome").value.trim() || T("ourHome"), my_name: name, my_lang: lang })
    : await sb.rpc("join_household", { code: $("#sCode").value.trim(), my_name: name, my_lang: lang });
  $("#sSubmit").disabled = false;
  if (error) { $("#sErr").textContent = /invalid code/.test(error.message) ? T("badCode") : error.message; $("#sErr").hidden = false; return; }
  hid = data; await enterApp();
}

async function enterApp() {
  show("app"); setTab(location.hash.slice(1) || "today");
  await loadAll(); subscribe(); flush();
}

async function onSession(session) {
  if (!session) { me = null; hid = null; if (channel) { sb.removeChannel(channel); channel = null; } show("authGate"); applyStatic(); return; }
  if (me === session.user.id) return; // already handled (sign-in fires twice on load)
  me = session.user.id; loadQueue();
  const { data } = await sb.from("members").select("household_id, lang").eq("user_id", me).maybeSingle();
  if (data) { hid = data.household_id; await enterApp(); }
  else { show("setupGate"); setSetupMode("create"); }
}

// ---------- app updates ----------
// version.json is written by the release workflow (.github/workflows/release.yml).
// The copy read at start is the version running now; later checks spot a newer release.
let running = null, dismissed = null;
const fetchVersion = () => fetch("version.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
const summary = s => String(s || "").replace(/\r/g, "").replace(/^#+\s*/gm, "").replace(/\*\*|__|`/g, "").trim().slice(0, 280);
function rememberVersion(v) { try { localStorage.setItem("ht-version", v); } catch (e) {} }
function showUpdate(v, fresh) {
  const notes = summary(v.notes);
  $("#update").innerHTML = `<div class="ver">${T(fresh ? "whatsNew" : "updateReady")} · ${esc(v.version)}</div>
    ${notes ? `<p>${esc(notes)}</p>` : ""}
    <div class="kv">${fresh
      ? `<span></span><button class="btn small" data-up="ok">${T("gotIt")}</button>`
      : `<button class="btn ghost small" data-up="later">${T("updateLater")}</button><button class="btn small" data-up="apply">${T("updateApply")}</button>`}</div>`;
  $("#update").dataset.version = v.version;
  $("#update").hidden = false;
}
$("#update").addEventListener("click", e => {
  const b = e.target.closest("[data-up]"); if (!b) return;
  const v = $("#update").dataset.version;
  if (b.dataset.up === "apply") { rememberVersion(v); location.reload(); return; }
  if (b.dataset.up === "later") dismissed = v;
  $("#update").hidden = true;
});
async function checkUpdate() {
  if (!running) return;
  const v = await fetchVersion();
  if (v && v.version !== running.version && v.version !== dismissed) showUpdate(v, false);
}
fetchVersion().then(v => {
  running = v; if (!v || v.version === "dev") return;
  let seen = null; try { seen = localStorage.getItem("ht-version"); } catch (e) {}
  rememberVersion(v.version);
  if (seen && seen !== v.version) showUpdate(v, true); // the app updated itself on open: say what's new
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
setInterval(checkUpdate, 30 * 60000);

// ---------- boot ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
let day = today();
setInterval(() => { if (today() !== day) { day = today(); render(); } }, 60000);

if (!sb) {
  show("authGate"); applyStatic();
  $("#aErr").textContent = "Setup needed: fill in config.js with your Supabase URL and keys (see README.md).";
  $("#aErr").hidden = false; $("#aSubmit").disabled = true;
} else {
  sb.auth.getSession().then(({ data }) => onSession(data.session));
  sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => onSession(session), 0); });
}
})();
