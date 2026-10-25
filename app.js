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
// Usual supermarkets; any other shop typed in is remembered and offered too.
const STORES = ["Mercadona", "Bonpreu", "Lidl", "Carrefour", "Condis", "Caprabo", "Dia", "Consum", "Aldi", "Esclat", "Alcampo"];
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
const S = { groceries: [], chores: [], events: [], dogs: [], members: [], history: [], needs: [], shopping_trips: [], attachments: [], dog_log: [], dog_meds: [], expenses: [], fixed_costs: [], budgets: [], dog_supplies: [], papers: [], home_info: [], chore_log: [], dog_weights: [], notes: [], fengshui: [], home: null };
let me = null, hid = null, channel = null, online = true;
let tab = "today", calMonth = today().slice(0, 7), calSel = today(), pendingDelete = null;
const ui = { grocCat: "other", evCat: "home", needCat: "other", shopView: "list", shopFilter: "", finishing: false, filesFor: null, medFor: null, dogFor: null, dogPhoto: null, moneyMonth: today().slice(0, 7), expCat: "groceries", authMode: "signin", setupMode: "create", homeMonth: today().slice(0, 7), supEdit: null, paperEdit: null, stats: null, fixedEdit: null, noteEdit: null, fsZone: null };
try {
  const g = localStorage.getItem("ht-grocCat"); if (GROC_KEYS.includes(g)) ui.grocCat = g;
  const s = localStorage.getItem("ht-shopView"); if (SHOP_VIEWS.includes(s)) ui.shopView = s;
  ui.shopFilter = localStorage.getItem("ht-shopFilter") || "";
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
  groceries: { qty: "", cat: "other", store: "", done: false },
  chores: { every: 0, dog: false, done: false, last_done: null, last_by: null, assigned_to: null, rotate: false },
  events: { time: "", cat: "home", repeat: "", remind: "" },
  dogs: { breed: "", notes: "", birthday: null },
  needs: { cat: "other", price: "", store: "", link: "", notes: "", done: false, done_by: null },
  shopping_trips: { store: "", total: "", items: [] },
  dog_log: { dog_id: null, detail: "" },
  dog_meds: { dose: "", every: 0, last_given: null, last_by: null, at_time: "09:00", stock: null, low_alerted: false },
  dog_supplies: { dog_id: null, unit: "kg", warn_days: 5, alerted_on: null },
  papers: { dog_id: null, expires_on: null, remind_days: 14, notes: "", reminded: 0 },
  home_info: { value: "" },
  chore_log: { chore_id: null, title: "" },
  expenses: { cat: "other", note: "", store: "", private: false, trip_id: null, need_id: null, fixed_id: null, event_id: null },
  fixed_costs: { cat: "bills", private: false, active: true, every_months: 1, remind_days: 3, reminded_for: null, last_month: null },
  dog_weights: {},
  notes: { title: "", body: "", pinned: false },
  fengshui: { kind: "task", done: false, done_by: null, sort: 0 }
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
  members: () => sb.from("members").select("user_id, display_name, lang, rain_alerts, notify_off, created_at").order("created_at"),
  needs: () => sb.from("needs").select("*").order("created_at"),
  shopping_trips: () => sb.from("shopping_trips").select("*").order("created_at", { ascending: false }),
  attachments: () => sb.from("attachments").select("*").order("created_at"),
  dog_log: () => sb.from("dog_log").select("*").order("at", { ascending: false }).limit(100),
  dog_meds: () => sb.from("dog_meds").select("*").order("created_at"),
  // Spending: this year and last (enough for the months shown and the yearly export).
  expenses: () => sb.from("expenses").select("*").gte("spent_on", (new Date().getFullYear() - 1) + "-01-01").order("spent_on", { ascending: false }),
  fixed_costs: () => sb.from("fixed_costs").select("*").order("day"),
  budgets: () => sb.from("budgets").select("cat, amount"),
  dog_supplies: () => sb.from("dog_supplies").select("*").order("created_at"),
  papers: () => sb.from("papers").select("*").order("created_at"),
  home_info: () => sb.from("home_info").select("*").order("created_at"),
  // This month's chores done (to undo a ticked to-do); the monthly counts come from home_stats.
  chore_log: () => sb.from("chore_log").select("*").gte("at", today().slice(0, 7) + "-01").order("at", { ascending: false }),
  dog_weights: () => sb.from("dog_weights").select("*").order("on_date").order("created_at"),
  notes: () => sb.from("notes").select("*").order("updated_at", { ascending: false }),
  fengshui: () => sb.from("fengshui").select("*").order("sort").order("created_at"),
  history: () => sb.from("grocery_history").select("name_key, name, cat, store, uses").order("uses", { ascending: false }).order("last_used", { ascending: false }).limit(40)
};
async function load(name) {
  const { data, error } = await TABLES[name]();
  if (error) return;
  S[name] = data || [];
  queue.filter(op => op.t === name).forEach(applyOp); // changes still waiting to be sent
  render(); keepCopy();
  if (name === "dogs") loadPhotos();
  if (name === "attachments" && ui.filesFor && !$("#settings").hidden) renderFiles();
}
async function loadHome() {
  const { data, error } = await sb.from("households").select("id, name, invite_code, place, lat, lon").eq("id", hid).maybeSingle();
  if (error) return;
  S.home = data; render(); keepCopy();
}
async function loadAll() { await Promise.all([...Object.keys(TABLES).map(load), loadHome()]); }

// A copy of the home's data on the phone, so the app opens with everything even without a connection.
// Text only (no photos or files): a few hundred KB at most.
const copyKey = id => "ht-data-" + id;
function keepCopy() {
  clearTimeout(keepCopy.h);
  keepCopy.h = setTimeout(() => { if (me && hid) try { localStorage.setItem(copyKey(me), JSON.stringify({ hid, S })); } catch (e) {} }, 1000);
}
function readCopy(id) { try { const c = JSON.parse(localStorage.getItem(copyKey(id)) || "null"); return c && c.hid ? c : null; } catch (e) { return null; } }
function openCopy(c) { hid = c.hid; Object.assign(S, c.S); queue.forEach(applyOp); }
// Who is signed in on this phone, even when the sign-in can't be renewed offline.
function storedUser() {
  try {
    const k = Object.keys(localStorage).find(k => /^sb-.+-auth-token$/.test(k));
    return k ? JSON.parse(localStorage.getItem(k))?.user?.id || null : null;
  } catch (e) { return null; }
}
window.addEventListener("online", () => { if (hid) { loadAll(); if (!online) subscribe(); } });

const reloadSoon = {};
function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("home-" + hid);
  ["groceries", "chores", "events", "dogs", "needs", "shopping_trips", "attachments", "dog_log", "dog_meds", "expenses", "fixed_costs", "budgets", "dog_supplies", "papers", "home_info", "chore_log", "dog_weights", "notes", "fengshui"].forEach(t => {
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
const whoOptions = sel => `<option value="">${esc(T("whoAnyone"))}</option>${S.members.map(m => `<option value="${esc(m.user_id)}" ${sel === m.user_id ? "selected" : ""}>${esc(m.user_id === me ? T("you_") : m.display_name || T("partner"))}</option>`).join("")}${S.members.length > 1 ? `<option value="turns" ${sel === "turns" ? "selected" : ""}>${esc(T("whoTurns"))}</option>` : ""}`;
// Edit a routine in place: name, how often, who, dogs, and when it's next due.
function routineForm(c) {
  const every = REPEAT.filter(n => n > 0); if (!every.includes(c.every)) every.push(c.every);
  return `<form class="row edit-row" id="fChoreEdit" data-id="${esc(c.id)}">
    <input type="text" id="ceTitle" value="${esc(choreTitle(c))}" aria-label="${esc(T("ceName"))}" required autocomplete="off">
    <div class="edit-grid">
      <label class="inline"><span>${T("ceEvery")}</span><select id="ceEvery">${every.sort((a, b) => a - b).map(n => `<option value="${n}" ${n === c.every ? "selected" : ""}>${esc(repeatLabel(n))}</option>`).join("")}</select></label>
      <label class="inline"><span>${T("whoLabel")}</span><select id="ceWho">${whoOptions(c.rotate ? "turns" : c.assigned_to || "")}</select></label>
      <label class="inline"><span>${T("ceNext")}</span><input type="date" id="ceNext" value="${esc(c.due)}" required></label>
      <label class="toggle"><input type="checkbox" id="ceDog" ${c.dog ? "checked" : ""}> ${T("dogsBox")}</label>
    </div>
    <div class="kv"><span>${delBtn("chores", c.id)}</span><span class="kv"><button type="button" class="btn ghost small" data-act="chore-cancel">${T("cancel")}</button><button class="btn small">${T("save")}</button></span></div>
  </form>`;
}
function saveRoutine(f) {
  const c = find(S.chores, f.dataset.id); if (!c) return;
  const title = $("#ceTitle").value.trim(), every = Number($("#ceEvery").value), w = $("#ceWho").value, next = $("#ceNext").value;
  if (!title || !next) return;
  const values = { every, dog: $("#ceDog").checked, assigned_to: w && w !== "turns" ? w : null, rotate: w === "turns" };
  if (title !== choreTitle(c)) Object.assign(values, { title, key: null }); // a renamed starter chore keeps the new name in both languages
  // A new date for next time: count from it (keeping the real "last done" when there is one).
  if (next !== c.due) Object.assign(values, c.last_done ? { last_done: addDays(next, -every) } : { start_date: next });
  else if (!c.last_done && every !== c.every) values.start_date = c.due;
  ui.choreEdit = null;
  save({ t: "chores", kind: "update", id: c.id, values }, "saved");
}
function routineRow(c, compact) {
  if (!compact && ui.choreEdit === c.id) return routineForm(c);
  const last = c.last_done ? T("lastDone")(fmtDay(c.last_done), c.last_by ? who(c.last_by) : "") : T("notYet");
  return `<div class="row">
    <div class="main"><div class="t">${c.dog ? `<span class="paw">${IC.paw}</span> ` : ""}${esc(choreTitle(c))}${compact ? ownerTag(c, true) : ""}</div>
      <div class="s">${esc(repeatLabel(c.every))} · ${esc(last)}${compact ? "" : ownerTag(c)}</div></div>
    ${duePill(c.due)}
    <button class="btn small" data-act="did" data-id="${esc(c.id)}">${T("done")}</button>
    ${compact ? "" : `<button class="btn ghost small" data-act="chore-edit" data-id="${esc(c.id)}">${T("editDog")}</button>`}
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

// A calm sentence for the chakra of the day (Monday root … Sunday crown) and the moon phase, picked at random each time the app opens.
let mantraAt = Math.random(), mantraOn = true;
try { mantraOn = localStorage.getItem("ht-mantra") !== "off"; } catch (e) {}
const CHAKRA_COLORS = ["#C0392B", "#E67E22", "#E2B007", "#27AE60", "#2E86C1", "#4B4FB0", "#8E44AD"];
const MOON_ICONS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
const chakraToday = () => (new Date().getDay() + 6) % 7;
// 0 new … 4 full … 7 waning crescent, from the moon's age since a known new moon (6 Jan 2000 18:14 UTC).
function moonPhase(d = new Date()) {
  const age = ((d.getTime() / 864e5 + 2440587.5 - 2451550.26) / 29.530588853 % 1 + 1) % 1;
  return Math.floor(age * 8 + 0.5) % 8;
}
// Zodiac sign (0 Aries … 11 Pisces) of the sun and the moon, from their positions along the ecliptic (accurate to well under a degree).
const SIGN_ICONS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
function skySigns(t = new Date()) {
  const d = t.getTime() / 864e5 - 10957.5, r = x => x * Math.PI / 180, sin = x => Math.sin(r(x));
  const g = 357.529 + 0.98560028 * d;
  const sun = 280.460 + 0.9856474 * d + 1.915 * sin(g) + 0.020 * sin(2 * g);
  const M = 134.963 + 13.064993 * d, D = 297.850 + 12.190749 * d, F = 93.272 + 13.229350 * d;
  const moon = 218.316 + 13.176396 * d + 6.289 * sin(M) + 1.274 * sin(2 * D - M) + 0.658 * sin(2 * D)
    + 0.214 * sin(2 * M) - 0.186 * sin(g) - 0.114 * sin(2 * F);
  const sign = lon => Math.floor((((lon % 360) + 360) % 360) / 30);
  return { sun: sign(sun), moon: sign(moon) };
}
function mantraCard() {
  if (!mantraOn) return "";
  const i = chakraToday(), c = T("chakras")[i], p = moonPhase(), [moonName, moonTip] = T("moon")[p];
  const sky = skySigns(), sun = T("signs")[sky.sun], moonSign = T("signs")[sky.moon];
  return `<button class="card mantra" data-act="mantra-next" aria-label="${esc(T("mantraNext"))}" style="--chakra:${CHAKRA_COLORS[i]}">
    <span class="mantra-meta"><i class="chakra-dot"></i>${T("chakraOf")}: ${esc(c.name)} · ${c.sk}</span>
    <q>${esc(c.lines[Math.floor(mantraAt * c.lines.length)])}</q>
    <span class="mantra-moon">${MOON_ICONS[p]} ${esc(moonName)}: ${esc(moonTip)}</span>
    <span class="mantra-moon">${SIGN_ICONS[sky.sun]}\uFE0E ${T("sunIn")} ${sun[0]}: ${sun[1]}.</span>
    <span class="mantra-moon">${SIGN_ICONS[sky.moon]}\uFE0E ${T("moonIn")} ${moonSign[0]}: ${moonSign[2]}.</span></button>`;
}
// On Today: food or medicine running low, papers about to expire, budgets at 80% or more.
function headsUp() {
  const link = (href, ic, t, s) => `<a class="row" href="${href}"><span class="log-ic">${ic}</span><div class="main"><div class="t">${esc(t)}</div><div class="s">${esc(s)}</div></div></a>`;
  const m = today().slice(0, 7);
  const budgets = EXP_KEYS.filter(budgetOf).map(k => [k, sumOf(monthExp(m).filter(e => expCat(e.cat) === k && !e.private)), budgetOf(k)]).filter(([, s, b]) => s >= b * 0.8);
  const rows = [
    ...suppliesLow().map(s => link("#food", LOG_ICON.food, s.name, supplyStatus(s))),
    ...S.dog_meds.filter(medLow).map(x => link("#health", LOG_ICON.med, `${dogName(x.dog_id)}: ${x.name}`, T("left")(x.stock))),
    ...papersSoon().map(p => paperRow(p, true)),
    ...budgets.map(([k, s, b]) => link("#money", "💶", T("expCats")[k], T("budgetUsed")(money(s), money(b), Math.round(s / b * 100)))),
  ];
  return rows.length ? `<section class="sec"><h2>${T("headsUp")}</h2><div class="card list">${rows.join("")}</div></section>` : "";
}
function viewToday() {
  const d = dueNow(), meds = medsDueNow(), ev = upcoming(5), groc = S.groceries.filter(g => !g.done).length;
  const open = todos().filter(t => !t.done);
  const week = upcoming(999).filter(e => diffDays(e.date, today()) < 7).length;
  return `
  ${mantraCard()}
  <div class="stats">
    <a class="card stat ${d.length ? "alert" : ""}" href="#chores"><b>${d.length}</b><span>${T("choresDue")}</span></a>
    <a class="card stat" href="#groceries"><b>${groc}</b><span>${T("toBuy")}</span></a>
    <a class="card stat" href="#calendar"><b>${week}</b><span>${T("thisWeek")}</span></a>
  </div>
  <a class="card spend-line" href="#money"><span>${T("spentMonth")}</span><b>${esc(money(sumOf(monthExp(today().slice(0, 7)))))}</b></a>
  ${headsUp()}
  ${S.dogs.length ? `<section class="sec">${dogButtons()}</section>` : ""}
  <section class="sec"><div class="sec-head"><h2>${T("dueNow")}</h2><a class="link" href="#chores">${T("allChores")}</a></div>
    <div class="card list">${d.length || meds.length ? d.map(c => routineRow(c, true)).join("") + meds.map(m => medRow(m, true)).join("")
      : `<div class="empty">${T("nothingDue")} ${S.chores.length ? T("enjoy") : T("addRoutinesHint")}</div>`}</div></section>
  ${open.length ? `<section class="sec"><div class="sec-head"><h2>${T("todos")}</h2><span class="eyebrow">${esc(T("open")(open.length))}</span></div>
    <div class="card list">${open.slice(0, 4).map(todoRow).join("")}</div></section>` : ""}
  <section class="sec"><div class="sec-head"><h2>${T("comingUp")}</h2><a class="link" href="#calendar">${T("calendar")}</a></div>
    <div class="card list">${ev.length ? ev.map(eventRow).join("") : `<div class="empty">${T("noPlans")}</div>`}</div></section>`;
}

const sameStore = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
const knownStores = () => {
  const all = [...STORES, ...S.groceries.map(g => g.store), ...S.history.map(h => h.store)].map(x => (x || "").trim()).filter(Boolean);
  return all.filter((x, i) => all.findIndex(y => sameStore(x, y)) === i).sort((a, b) => a.localeCompare(b));
};
// The shop used last time for this item, if any.
const rememberedStore = name => S.history.find(h => h.name_key === name.trim().toLowerCase())?.store || "";
// Things bought at a steady pace (on 3+ shopping days): suggested once that many days have passed again.
// Not after 3× the usual gap, when it has probably stopped being bought.
function probablyNeeded(onList) {
  const seen = new Map();
  for (const t of S.shopping_trips) {
    const day = ymd(new Date(t.created_at));
    for (const it of t.items || []) {
      const k = (it.name || "").trim().toLowerCase(); if (!k) continue;
      if (!seen.has(k)) seen.set(k, { name: it.name.trim(), cat: it.cat, days: new Set() });
      seen.get(k).days.add(day);
    }
  }
  const out = [];
  for (const [k, x] of seen) {
    if (onList.has(k) || x.days.size < 3) continue;
    const days = [...x.days].sort(), last = days[days.length - 1];
    const every = diffDays(last, days[0]) / (days.length - 1), since = diffDays(today(), last);
    if (every < 1 || since < Math.round(every) || since > every * 3) continue;
    const h = S.history.find(y => y.name_key === k);
    out.push({ name: h?.name || x.name, cat: h?.cat || x.cat || "other", store: h?.store || "", every: Math.round(every), score: since / every });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

function viewGroceries() {
  const all = S.groceries.filter(g => !g.done), done = S.groceries.filter(g => g.done), f = ui.shopFilter;
  // Shopping at one shop: its items plus the "any shop" ones.
  const open = f ? all.filter(g => !g.store || sameStore(g.store, f)) : all, hidden = all.length - open.length;
  const shops = [...new Set(all.map(g => g.store).filter(Boolean).concat(f ? [f] : []))].filter((x, i, a) => a.findIndex(y => sameStore(x, y)) === i).sort((a, b) => a.localeCompare(b));
  const groups = GROC_KEYS.map(k => [k, open.filter(g => (GROC_KEYS.includes(g.cat) ? g.cat : "other") === k)]).filter(g => g[1].length);
  const onList = new Set(all.map(g => g.name.trim().toLowerCase()));
  const soon = probablyNeeded(onList), soonKeys = new Set(soon.map(x => x.name.trim().toLowerCase()));
  const often = S.history.filter(h => h.uses >= 2 && !onList.has(h.name_key) && !soonKeys.has(h.name_key)).slice(0, 10);
  const row = g => `<div class="row ${g.done ? "done" : ""}">
      <button class="check ${g.done ? "on" : ""}" data-act="groc" data-id="${esc(g.id)}" aria-label="${g.done ? T("putBack") : T("markBought")}">${g.done ? IC.tick : ""}</button>
      <div class="main"><div class="t">${esc(g.name)}${g.qty ? ` <span class="chip">${esc(g.qty)}</span>` : ""}</div>
        <div class="s">${g.done ? esc(g.store) : [g.created_by ? esc(T("addedBy")(who(g.created_by))) : "",
          `<button class="who ${g.store ? "" : "faint"}" data-act="groc-store" data-id="${esc(g.id)}" aria-label="${esc(T("whichShop"))}">${esc(g.store || T("anyShop"))}</button>`].filter(Boolean).join(" · ")}</div></div>
      ${delBtn("groceries", g.id)}</div>`;
  return `
  <form class="addbar" id="fGroc">
    <input type="text" id="gName" class="grow" placeholder="${esc(T("gPlaceholder"))}" autocomplete="off" required>
    <input type="text" id="gQty" placeholder="${esc(T("qty"))}" style="flex:0 1 80px">
    <select id="gCat">${GROC_KEYS.map(k => `<option value="${k}" ${k === ui.grocCat ? "selected" : ""}>${esc(T("grocCats")[k])}</option>`).join("")}</select>
    <input type="text" id="gStore" list="storeList" value="${esc(f)}" placeholder="${esc(T("anyShopPh"))}" autocomplete="off" style="flex:1 1 120px">
    <datalist id="storeList">${knownStores().map(x => `<option value="${esc(x)}">`).join("")}</datalist>
    <button class="btn">${T("add")}</button>
  </form>
  ${shops.length ? `<div class="shops" role="group" aria-label="${esc(T("shopFilterLbl"))}">
    <button class="chip-btn" data-act="shop-filter" data-v="" aria-pressed="${!f}">${T("allShops")}</button>
    ${shops.map(x => `<button class="chip-btn" data-act="shop-filter" data-v="${esc(x)}" aria-pressed="${sameStore(x, f)}">${esc(x)}</button>`).join("")}</div>` : ""}
  ${hidden ? `<p class="hint" style="margin:6px 2px 0">${esc(T("otherShops")(hidden))} <button class="who" data-act="shop-filter" data-v="">${T("showAll")}</button></p>` : ""}
  ${soon.length ? `<div class="often"><span class="eyebrow">${T("dueAgain")}</span>
    ${soon.map(h => `<button class="chip-btn" data-act="often" data-name="${esc(h.name)}" data-cat="${esc(h.cat)}" data-store="${esc(h.store)}">+ ${esc(h.name)} <small>${esc(T("buyEvery")(h.every))}</small></button>`).join("")}</div>` : ""}
  ${often.length ? `<div class="often"><span class="eyebrow">${T("often")}</span>
    ${often.map(h => `<button class="chip-btn" data-act="often" data-name="${esc(h.name)}" data-cat="${esc(h.cat)}" data-store="${esc(h.store || "")}">+ ${esc(h.name)}${h.store ? ` <small>${esc(h.store)}</small>` : ""}</button>`).join("")}</div>` : ""}
  ${groups.length ? groups.map(([k, items]) => `<section class="sec"><span class="eyebrow">${esc(T("grocCats")[k])}</span><div class="card list">${items.map(row).join("")}</div></section>`).join("")
    : `<section class="sec"><div class="card"><div class="empty">${T("listEmpty")}</div></div></section>`}
  ${done.length ? `<section class="sec"><div class="sec-head"><span class="eyebrow">${esc(T("basket")(done.length))}</span>
      <div class="kv">${ui.finishing ? "" : `<button class="btn ghost small" data-act="clear-basket">${T("clearBasket")}</button><button class="btn small" data-act="finish">${T("finishShop")}</button>`}</div></div>
    ${ui.finishing ? `<form class="addbar" id="fFinish" style="margin-bottom:10px">
      <input type="text" id="fStore" class="grow" list="storeList" value="${esc(f)}" placeholder="${esc(T("store"))}" autocomplete="off">
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
      <div class="main"><div class="t">${esc(x.title)}${x.price ? ` <span class="chip">${esc(x.price)}</span>` : ""}${x.store ? ` <span class="chip">${esc(x.store)}</span>` : ""}</div>
        <div class="s">${[x.notes ? esc(x.notes) : "", x.link ? `<a class="link" href="${esc(safeLink(x.link))}" target="_blank" rel="noopener noreferrer">${T("openLink")} ${IC.link}</a>` : "",
          x.done && x.done_by ? esc(T("doneBy")(who(x.done_by))) : x.created_by ? esc(T("addedBy")(who(x.created_by))) : ""].filter(Boolean).join(" · ")}</div></div>
      ${delBtn("needs", x.id)}</div>`;
  return `
  ${shopDatalist()}
  <form class="addbar" id="fNeed">
    <input type="text" id="nTitle" class="grow" placeholder="${esc(T("nPlaceholder"))}" autocomplete="off" required>
    <select id="nCat">${NEED_KEYS.map(k => `<option value="${k}" ${k === ui.needCat ? "selected" : ""}>${esc(T("needCats")[k])}</option>`).join("")}</select>
    <input type="text" id="nPrice" placeholder="${esc(T("price"))}" style="flex:0 1 90px">
    <input type="text" id="nStore" list="shopList" placeholder="${esc(T("shopOrWeb"))}" autocomplete="off">
    <input type="url" id="nLink" placeholder="${esc(T("link"))}" autocomplete="off">
    <input type="text" id="nNotes" class="grow" placeholder="${esc(T("nNotes"))}">
    <button class="btn">${T("add")}</button>
  </form>
  ${groups.length ? groups.map(([k, items]) => `<section class="sec"><span class="eyebrow">${esc(T("needCats")[k])}</span><div class="card list">${items.map(row).join("")}</div></section>`).join("")
    : `<section class="sec"><div class="card"><div class="empty">${T("noNeeds")}</div></div></section>`}
  ${done.length ? `<section class="sec"><div class="sec-head"><span class="eyebrow">${esc(T("bought")(done.length))}</span><button class="btn ghost small" data-act="clear-needs">${T("clearBought")}</button></div>
    <div class="card list">${done.map(row).join("")}</div></section>` : ""}`;
}

const FILE_COL = { event: "event_id", trip: "trip_id", expense: "expense_id", paper: "paper_id", fengshui: "section" };
const filesOf = (kind, id) => S.attachments.filter(a => a[FILE_COL[kind]] === id);
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
    <select id="cWho" aria-label="${esc(T("whoLabel"))}">${whoOptions("")}</select>
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
// Running low: about 5 days of doses left (or 2 doses, for "when needed"). Keep in step with the daily function.
const medLow = m => m.stock != null && (m.every ? m.stock * m.every <= 5 : m.stock <= 2);
function medRow(m, compact) {
  const last = m.last_given ? T("lastDone")(fmtDay(m.last_given), m.last_by ? who(m.last_by) : "") : T("notYet");
  const sub = [compact ? dogName(m.dog_id) : "", m.dose, medEvery(m.every), m.every ? T("atTime")(m.at_time || "09:00") : "", last,
    m.stock != null ? T("left")(m.stock) + (m.every ? ` (${T("aboutDays")(m.stock * m.every)})` : "") : ""].filter(Boolean).map(esc).join(" · ");
  return `<div class="row ${medLow(m) ? "low" : ""}">
    <span class="log-ic">${LOG_ICON.med}</span>
    <div class="main"><div class="t">${esc(m.name)}</div><div class="s">${sub}</div></div>
    ${m.every ? duePill(medDue(m)) : ""}
    <button class="btn small" data-act="med-given" data-id="${esc(m.id)}">${T("given")}</button>
    ${compact || m.stock == null ? "" : `<button class="btn ghost small" data-act="med-refill" data-id="${esc(m.id)}">${T("refill")}</button>`}
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

// A date with its year when it isn't this year (papers can expire years from now).
const fmtDate = s => fmtDay(s) + (s.slice(0, 4) !== today().slice(0, 4) ? " " + s.slice(0, 4) : "");
const forOptions = (sel, none) => `<option value="">${esc(none)}</option>${S.dogs.map(d => `<option value="${esc(d.id)}" ${d.id === sel ? "selected" : ""}>${esc(d.name)}</option>`).join("")}`;
const formButtons = (table, id, cancelAct) => `<div class="kv"><span>${id ? delBtn(table, id) : ""}</span>
  <span class="kv"><button type="button" class="btn ghost small" data-act="${cancelAct}">${T("cancel")}</button><button class="btn small">${T("save")}</button></span></div>`;

// Food bags (and anything else used up at a steady pace): it runs out on opened_on + size / per_day.
// The daily function puts it on the shopping list warn_days before.
const UNITS = ["kg", "g", "l", "units"];
const numFmt = n => Number(n).toLocaleString(lang === "es" ? "es-ES" : "en-IE", { maximumFractionDigits: 3 });
const parseNum = s => { const n = Number(String(s || "").trim().replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const supplyEnd = s => addDays(s.opened_on, Math.floor(Number(s.size) / Number(s.per_day)));
const supplyLeft = s => diffDays(supplyEnd(s), today());
const suppliesLow = () => S.dog_supplies.filter(s => supplyLeft(s) <= s.warn_days);
const supplyStatus = s => { const left = supplyLeft(s); return left < 0 ? T("ranOut") : left === 0 ? T("runsOutToday") : T("daysLeft")(left, fmtDate(supplyEnd(s))); };
function supplyRow(s) {
  if (ui.supEdit === s.id) return supplyForm(s);
  const left = supplyLeft(s), total = Math.max(1, Math.floor(Number(s.size) / Number(s.per_day))), low = left <= s.warn_days;
  const sub = [s.dog_id ? dogName(s.dog_id) : T("allDogs"), T("perDay")(numFmt(s.per_day), T("units")[s.unit] || s.unit), T("opened")(fmtDate(s.opened_on))];
  return `<div class="row ${low ? "low" : ""}"><span class="log-ic">${LOG_ICON.food}</span>
    <div class="main"><div class="t">${esc(s.name)}</div>
      <div class="bar ${left < 0 ? "over" : low ? "near" : ""}"><i style="width:${Math.round(Math.max(0, Math.min(1, left / total)) * 100)}%"></i></div>
      <div class="s">${[supplyStatus(s), ...sub].map(esc).join(" · ")}</div></div>
    <button class="btn small" data-act="sup-new" data-id="${esc(s.id)}">${T("newBag")}</button>
    <button class="btn ghost small" data-act="sup-edit" data-id="${esc(s.id)}">${T("editDog")}</button></div>`;
}
function supplyForm(s = {}) {
  const val = x => x == null ? "" : esc(String(Number(x)).replace(".", lang === "es" ? "," : ".")); // no thousands dots: 1000 g stays 1000
  return `<form class="row edit-row" id="fSupply" data-id="${esc(s.id || "")}">
    <input type="text" id="suName" value="${esc(s.name || "")}" placeholder="${esc(T("supName"))}" aria-label="${esc(T("supName"))}" required maxlength="60" autocomplete="off">
    <div class="edit-grid">
      <label class="inline"><span>${T("supFor")}</span><select id="suDog">${forOptions(s.dog_id, T("allDogs"))}</select></label>
      <label class="inline"><span>${T("supSize")}</span><input type="text" id="suSize" inputmode="decimal" value="${val(s.size)}" required style="width:70px"></label>
      <select id="suUnit" aria-label="${esc(T("supUnit"))}">${UNITS.map(u => `<option value="${u}" ${u === (s.unit || "kg") ? "selected" : ""}>${esc(T("units")[u])}</option>`).join("")}</select>
      <label class="inline"><span>${T("supPerDay")}</span><input type="text" id="suPerDay" inputmode="decimal" value="${val(s.per_day)}" required style="width:70px"></label>
      <label class="inline"><span>${T("supOpened")}</span><input type="date" id="suOpened" value="${esc(s.opened_on || today())}" required></label>
      <label class="inline"><span>${T("supWarn")}</span><input type="number" id="suWarn" min="0" max="60" value="${s.warn_days ?? 5}" style="width:60px"></label>
    </div>
    <div class="hint" style="margin:0">${T("supHint")}</div>
    ${formButtons("dog_supplies", s.id, "sup-cancel")}
  </form>`;
}
function saveSupply(f) {
  const v = id => ($("#" + id)?.value || "").trim(), name = v("suName"), size = parseNum(v("suSize")), perDay = parseNum(v("suPerDay"));
  if (!name) return; if (size === null || perDay === null) { toast("badAmount"); return; }
  const values = { name, dog_id: v("suDog") || null, size: Math.round(size * 100) / 100, per_day: Math.round(perDay * 1000) / 1000, unit: v("suUnit") || "kg",
    opened_on: v("suOpened") || today(), warn_days: Math.min(60, Math.max(0, parseInt(v("suWarn"), 10) || 0)) };
  const old = f.dataset.id && find(S.dog_supplies, f.dataset.id);
  // A different bag or pace: the list reminder can come again.
  if (old && (values.opened_on !== old.opened_on || values.size !== Number(old.size) || values.per_day !== Number(old.per_day))) values.alerted_on = null;
  ui.supEdit = null;
  save(old ? { t: "dog_supplies", kind: "update", id: old.id, values } : { t: "dog_supplies", kind: "insert", values: { id: uuid(), ...values } }, "saved");
}

// Papers with an expiry date, for a dog or for the home. The daily function reminds remind_days before and on the day.
const REMIND = [7, 14, 30, 60, 90];
const paperLeft = p => p.expires_on ? diffDays(p.expires_on, today()) : null;
const papersSoon = () => S.papers.filter(p => { const d = paperLeft(p); return d !== null && d <= p.remind_days; }).sort(byExpiry);
const byExpiry = (a, b) => (a.expires_on || "9999").localeCompare(b.expires_on || "9999") || a.title.localeCompare(b.title);
function paperPill(p) {
  const d = paperLeft(p);
  if (d === null || d > p.remind_days) return "";
  if (d < 0) return `<span class="pill late">${T("expired")}</span>`;
  if (d === 0) return `<span class="pill today">${T("expiresToday")}</span>`;
  return `<span class="pill soon">${esc(T("inDays")(d))}</span>`;
}
function paperRow(p, compact) {
  if (!compact && ui.paperEdit?.id === p.id) return paperForm(p);
  const sub = [p.dog_id ? dogName(p.dog_id) : compact ? T("forHome") : "", p.expires_on ? T("expiresOn")(fmtDate(p.expires_on)) : T("noExpiry"), compact ? "" : p.notes]
    .filter(Boolean).map(esc).join(" · ");
  return `<div class="row"><span class="log-ic">📄</span>
    <div class="main"><div class="t">${esc(p.title)}</div><div class="s">${sub}</div></div>
    ${paperPill(p)}${clipBtn("paper", p.id, p.title)}
    ${compact ? "" : `<button class="btn ghost small" data-act="paper-edit" data-id="${esc(p.id)}">${T("editDog")}</button>`}</div>`;
}
function paperForm(p) {
  return `<form class="row edit-row" id="fPaper" data-id="${esc(p.id || "")}">
    <input type="text" id="paTitle" value="${esc(p.title || "")}" placeholder="${esc(T(p.dog_id ? "paperDogPh" : "paperPh"))}" aria-label="${esc(T("paperName"))}" required maxlength="80" autocomplete="off">
    <div class="edit-grid">
      <label class="inline"><span>${T("paperFor")}</span><select id="paDog">${forOptions(p.dog_id, T("forHome"))}</select></label>
      <label class="inline"><span>${T("paperExpires")}</span><input type="date" id="paExp" value="${esc(p.expires_on || "")}"></label>
      <label class="inline"><span>${T("paperRemind")}</span><select id="paRemind">${REMIND.map(n => `<option value="${n}" ${n === (p.remind_days ?? 14) ? "selected" : ""}>${esc(T("daysBefore")(n))}</option>`).join("")}</select></label>
    </div>
    <input type="text" id="paNotes" value="${esc(p.notes || "")}" placeholder="${esc(T("paperNotes"))}" aria-label="${esc(T("paperNotes"))}" autocomplete="off">
    ${formButtons("papers", p.id, "paper-cancel")}
  </form>`;
}
function savePaper(f) {
  const v = id => ($("#" + id)?.value || "").trim(), title = v("paTitle"); if (!title) return;
  const values = { title, dog_id: v("paDog") || null, expires_on: v("paExp") || null, remind_days: Number(v("paRemind")) || 14, notes: v("paNotes") };
  const old = f.dataset.id && find(S.papers, f.dataset.id);
  if (!old || values.expires_on !== old.expires_on || values.remind_days !== old.remind_days) values.reminded = 0; // renewed: remind again
  ui.paperEdit = null;
  save(old ? { t: "papers", kind: "update", id: old.id, values } : { t: "papers", kind: "insert", values: { id: uuid(), ...values } }, "saved");
}
// A papers section: the list, with the add form on top while adding here.
function papersSection(where, list, title, empty) {
  const adding = ui.paperEdit && !ui.paperEdit.id && ui.paperEdit.where === where;
  return `<section class="sec"><div class="sec-head"><h2>${title}</h2>${adding ? "" : `<button class="btn small" data-act="paper-add" data-where="${where}">+ ${T("add")}</button>`}</div>
    <div class="card list">${adding ? paperForm({ dog_id: where === "dogs" ? S.dogs[0]?.id || null : null }) : ""}
      ${list.length ? list.map(p => paperRow(p)).join("") : adding ? "" : `<div class="empty">${empty}</div>`}</div></section>`;
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
  return `<div class="card dog-card">
    <div class="dog">
      ${url ? `<img class="av photo" src="${esc(url)}" alt="">` : `<div class="av">${esc((d.name || "?").trim()[0]?.toUpperCase() || "?")}</div>`}
      <div class="main"><div class="dog-name">${esc(d.name)}</div><div class="s">${facts}</div>${info ? `<div class="dog-info">${info}</div>` : ""}</div>
      <div class="dog-actions"><button class="btn ghost small" data-act="dog-edit" data-id="${esc(d.id)}">${T("editDog")}</button>${delBtn("dogs", d.id)}</div>
    </div>
  </div>`;
}
// One dog's medicines (on Dogs → Health).
function medsCard(d) {
  const meds = S.dog_meds.filter(m => m.dog_id === d.id);
  return `<div class="card dog-meds"><div class="sec-head"><span class="eyebrow">${esc(d.name)}</span>${ui.medFor === d.id ? "" : `<button class="btn ghost small" data-act="med-add" data-id="${esc(d.id)}">+ ${T("addMed")}</button>`}</div>
    ${ui.medFor === d.id ? medForm(d.id) : ""}
    ${meds.length ? `<div class="list">${meds.map(m => medRow(m)).join("")}</div>` : ui.medFor === d.id ? "" : `<div class="hint" style="margin:0">${T("noMeds")}</div>`}</div>`;
}
// Dogs: Today (buttons, weather, log, care routines) · Food · Health (medicines, vet, papers) · Pack (profiles).
function viewDogs() {
  const bar = subBar("dogs");
  if (sub.dogs === "food") return `${bar}
  <section class="sec"><div class="sec-head"><h2>${T("suppliesH")}</h2>${ui.supEdit === "new" ? "" : `<button class="btn small" data-act="sup-add">+ ${T("add")}</button>`}</div>
    <div class="card list">${ui.supEdit === "new" ? supplyForm() : ""}
      ${S.dog_supplies.length ? S.dog_supplies.map(supplyRow).join("") : ui.supEdit === "new" ? "" : `<div class="empty">${T("noSupplies")}</div>`}</div></section>`;
  if (sub.dogs === "health") {
    const vet = upcoming(999).filter(e => e.cat === "dogs").slice(0, 6), past = pastVisits();
    return `${bar}
  <section class="sec"><h2>${T("medicines")}</h2>${S.dogs.length ? `<div class="dogs">${S.dogs.map(medsCard).join("")}</div>` : `<div class="card"><div class="empty">${T("noDogs")}</div></div>`}</section>
  <section class="sec"><div class="sec-head"><h2>${T("vet")}</h2><a class="link" href="#calendar">${T("addInCal")}</a></div>
    <div class="card list">${vet.length ? vet.map(eventRow).join("") : `<div class="empty">${T("noVet")}</div>`}</div></section>
  ${past.length ? `<section class="sec"><div class="sec-head"><h2>${T("vetPast")}</h2><span class="eyebrow">${T("vetPastHint")}</span></div>
    <div class="card list">${past.map(visitRow).join("")}</div></section>` : ""}
  ${S.dogs.length ? `<section class="sec"><h2>${T("weightH")}</h2><div class="dogs">${S.dogs.map(weightCard).join("")}</div></section>` : ""}
  ${papersSection("dogs", S.papers.filter(p => p.dog_id).sort(byExpiry), T("dogPapersH"), T("noDogPapers"))}`;
  }
  if (sub.dogs === "pack") return `${bar}
  <section class="sec"><div class="sec-head"><h2>${T("pack")}</h2><button class="btn small" data-act="dog-edit" data-id="">${T("addDog")}</button></div>
    ${S.dogs.length ? `<div class="dogs">${S.dogs.map(dogCard).join("")}</div>` : `<div class="card"><div class="empty">${T("noDogs")}</div></div>`}</section>`;
  const care = routines().filter(c => c.dog), dogTodos = todos().filter(t => t.dog && !t.done), log = todaysLog();
  return `${bar}
  ${dogButtons()}
  ${weatherCard()}
  <section class="sec"><h2>${T("todayLbl2")}</h2>
    <div class="card list">${log.length ? log.map(l => `<div class="row"><span class="log-ic">${LOG_ICON[l.kind] || ""}</span>
      <div class="main"><div class="t">${esc(l.kind === "med" ? `${dogName(l.dog_id)}: ${l.detail}` : T(l.kind === "walk" ? "logWalk" : "logFood"))} · ${hhmm(l.at)}</div><div class="s">${esc(who(l.by_user))}</div></div>${delBtn("dog_log", l.id)}</div>`).join("")
      : `<div class="empty">${T("noLogToday")}</div>`}</div></section>
  <section class="sec"><div class="sec-head"><h2>${T("care")}</h2><a class="link" href="#chores">${T("addInChores")}</a></div>
    <div class="card list">${care.length ? care.map(c => routineRow(c)).join("") : `<div class="empty">${T("noCare")}</div>`}
    ${dogTodos.map(todoRow).join("")}</div></section>`;
}
// Dog appointments of the last 6 months (one-off calendar events in "Dogs"), with what they cost.
const pastVisits = () => S.events.filter(e => e.cat === "dogs" && !e.repeat && e.date <= today() && e.date >= addDays(today(), -183))
  .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
function visitRow(e) {
  const d = parse(e.date), paid = S.expenses.filter(x => x.event_id === e.id);
  return `<div class="row"><div class="when"><b>${d.getDate()}</b><span>${esc(mon3(d.getMonth()))}</span></div>
    <div class="main"><div class="t">${esc(e.title)}</div><div class="s">${esc(fmtDate(e.date))}</div></div>
    ${paid.length ? `<b class="amt">${esc(money(sumOf(paid)))}</b>` : `<button class="btn ghost small" data-act="vet-cost" data-id="${esc(e.id)}">💶 ${T("addCost")}</button>`}</div>`;
}
function vetCost(id) {
  const e = find(S.events, id); if (!e) return;
  const ans = prompt(T("vetCostPrompt")(e.title), ""); if (ans === null || !ans.trim()) return;
  const amount = parseAmount(ans); if (amount === null) { toast("badAmount"); return; }
  addExpense({ amount, cat: "dogs", note: e.title, spent_on: e.date, event_id: e.id }, "costAdded");
}

// Weight over time: a line per dog (thin, pine, dots ringed with the surface), first and last values labelled.
const weightsOf = id => S.dog_weights.filter(w => w.dog_id === id).sort((a, b) => a.on_date.localeCompare(b.on_date) || (a.created_at || "").localeCompare(b.created_at || ""));
function weightChart(list) {
  const W = 300, H = 120, L = 8, R = 8, top = 22, bottom = 22;
  const t0 = parse(list[0].on_date).getTime(), t1 = parse(list[list.length - 1].on_date).getTime();
  const kgs = list.map(w => Number(w.kg)), lo = Math.min(...kgs), hi = Math.max(...kgs), pad_ = Math.max(0.5, (hi - lo) * 0.15);
  const x = w => t1 > t0 ? L + (parse(w.on_date).getTime() - t0) / (t1 - t0) * (W - L - R) : W / 2;
  const y = kg => top + (1 - (kg - (lo - pad_)) / (hi - lo + 2 * pad_)) * (H - top - bottom);
  const pts = list.map(w => [x(w), y(Number(w.kg)), w]);
  const first = pts[0], last = pts[pts.length - 1];
  const label = ([px, py, w], anchor) => `<text x="${px.toFixed(1)}" y="${(py - 9).toFixed(1)}" text-anchor="${anchor}" class="wv">${esc(numFmt(w.kg))}</text>`;
  return `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T("weightAria")(numFmt(first[2].kg), numFmt(last[2].kg), fmtDate(first[2].on_date), fmtDate(last[2].on_date)))}">
    <line x1="${L}" x2="${W - R}" y1="${H - bottom + 4}" y2="${H - bottom + 4}" class="base"/>
    <polyline points="${pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}" class="ln"/>
    ${pts.map(([px, py, w]) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" class="pt"><title>${esc(fmtDate(w.on_date))}: ${esc(numFmt(w.kg))} kg</title></circle>`).join("")}
    ${label(first, "start")}${pts.length > 1 ? label(last, "end") : ""}
    <text x="${L}" y="${H - 4}" class="wd">${esc(fmtDate(first[2].on_date))}</text>
    ${pts.length > 1 ? `<text x="${W - R}" y="${H - 4}" text-anchor="end" class="wd">${esc(fmtDate(last[2].on_date))}</text>` : ""}
  </svg>`;
}
function weightCard(d) {
  const list = weightsOf(d.id), last = list[list.length - 1], prev = list[list.length - 2];
  const change = last && prev ? Math.round((last.kg - prev.kg) * 100) / 100 : null;
  return `<div class="card weight-card"><div class="sec-head"><span class="eyebrow">${esc(d.name)}</span>
      ${last ? `<span><b class="wnow">${esc(numFmt(last.kg))} kg</b>${change !== null ? ` <span class="s">${esc(T("weightChange")(change, diffDays(last.on_date, prev.on_date)))}</span>` : ""}</span>` : ""}</div>
    ${list.length > 1 ? weightChart(list.slice(-24)) : `<div class="hint" style="margin:0">${T(list.length ? "oneWeight" : "noWeights")}</div>`}
    ${list.length ? `<details class="more-cats"><summary class="link">${T("weightList")(list.length)}</summary><div class="list">${list.slice().reverse().map(w => `<div class="row"><div class="main"><div class="t">${esc(numFmt(w.kg))} kg</div><div class="s">${esc(fmtDate(w.on_date))}${w.by_user ? " · " + esc(who(w.by_user)) : ""}</div></div>${delBtn("dog_weights", w.id)}</div>`).join("")}</div></details>` : ""}
    <form class="addbar" id="fWeight-${esc(d.id)}" data-dog="${esc(d.id)}">
      <input type="text" id="wKg-${esc(d.id)}" inputmode="decimal" placeholder="kg" aria-label="${esc(T("weightKg")(d.name))}" required autocomplete="off" style="flex:1 1 70px">
      <input type="date" id="wDate-${esc(d.id)}" value="${today()}" max="${today()}" required aria-label="${esc(T("dateLbl"))}">
      <button class="btn small">${T("add")}</button>
    </form></div>`;
}
function saveWeight(f) {
  const dog = f.dataset.dog, kg = parseNum($("#wKg-" + dog)?.value), on_date = $("#wDate-" + dog)?.value || today();
  if (kg === null || kg >= 200) { toast("badAmount"); return; }
  $("#wKg-" + dog).value = "";
  const latest = weightsOf(dog).pop();
  save({ t: "dog_weights", kind: "insert", values: { id: uuid(), dog_id: dog, kg: Math.round(kg * 100) / 100, on_date } }, "saved");
  // The profile shows the latest weight.
  if (!latest || on_date >= latest.on_date) save({ t: "dogs", kind: "update", id: dog, values: { weight: `${numFmt(kg)} kg` } });
}

function logDogs(kind) {
  save({ t: "dog_log", kind: "insert", values: { id: uuid(), kind }, notify: [kind, ""] }, kind === "walk" ? "walkLogged" : "foodLogged");
}
function medGiven(id) {
  const m = find(S.dog_meds, id); if (!m) return;
  save({ t: "dog_meds", kind: "update", id, values: { last_given: today(), last_by: me, stock: m.stock != null ? Math.max(0, m.stock - 1) : null } });
  const detail = medDetail(m);
  save({ t: "dog_log", kind: "insert", values: { id: uuid(), kind: "med", dog_id: m.dog_id, detail }, notify: ["med", `${dogName(m.dog_id)}: ${detail}`] },
    m.stock != null && medLow({ ...m, stock: Math.max(0, m.stock - 1) }) ? "medLow" : "medGiven");
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

// ---------- spending ----------
const EXP_KEYS = ["groceries", "home", "bills", "dogs", "eating_out", "transport", "leisure", "health", "clothes", "gifts", "other"];
const EXP_COLORS = { groceries: "--c-home", home: "--c-appt", bills: "--c-bills", dogs: "--c-dogs", eating_out: "--mustard", transport: "--c-people",
  leisure: "--c-travel", health: "--red", clothes: "--c-people", gifts: "--c-travel", other: "--muted" };
const NEED_TO_EXP = { furniture: "home", tech: "home", home: "home", books: "leisure", clothes: "clothes", gifts: "gifts", other: "other" };
// Shops and websites offered when typing; anything else typed is remembered from then on.
const OTHER_SHOPS = ["Amazon", "AliExpress", "IKEA", "Decathlon", "MediaMarkt", "El Corte Inglés", "Zara", "Primark", "Leroy Merlin", "Fnac", "PcComponentes", "Shein", "Temu"];
const allShops = () => {
  const all = [...OTHER_SHOPS, ...STORES, ...S.expenses.map(e => e.store), ...S.needs.map(n => n.store), ...S.groceries.map(g => g.store), ...S.history.map(h => h.store)]
    .map(x => (x || "").trim()).filter(Boolean);
  return all.filter((x, i) => all.findIndex(y => sameStore(x, y)) === i).sort((a, b) => a.localeCompare(b));
};
const shopDatalist = () => `<datalist id="shopList">${allShops().map(x => `<option value="${esc(x)}">`).join("")}</datalist>`;

const money = n => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-IE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
// "54,30", "54.30", "1.234,50", "12 €", "~300€" → number, or null.
function parseAmount(s) {
  let t = String(s || "").replace(/[€\s~≈]/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
const sumOf = list => Math.round(list.reduce((t, e) => t + Number(e.amount || 0), 0) * 100) / 100;
const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); return ymd(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
const monthLabel = m => { const [y, mo] = m.split("-").map(Number); return `${cap(T("months")[mo - 1])} ${y}`; };
const monthExp = m => S.expenses.filter(e => e.spent_on.slice(0, 7) === m);
const expCat = k => EXP_KEYS.includes(k) ? k : "other";
const budgetOf = k => Number(S.budgets.find(b => b.cat === k)?.amount || 0);
const dayIn = (m, day) => { const [y, mo] = m.split("-").map(Number); return `${m}-${pad(Math.min(day, new Date(y, mo, 0).getDate()))}`; };
const payerOptions = sel => S.members.map(p => `<option value="${esc(p.user_id)}" ${p.user_id === sel ? "selected" : ""}>${esc(p.user_id === me ? T("you_") : p.display_name || T("partner"))}</option>`).join("");
const catOptions = sel => EXP_KEYS.map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(T("expCats")[k])}</option>`).join("");
const onlyMeChip = x => x.private ? ` <span class="chip">${T("onlyMe")}</span>` : "";

function expRow(e) {
  const k = expCat(e.cat), title = e.note || e.store || T("expCats")[k];
  const sub = [fmtDay(e.spent_on), T("expCats")[k], e.note && e.store ? e.store : "", e.paid_by ? T("paidBy")(who(e.paid_by)) : "", e.fixed_id ? T("fixedTag") : ""]
    .filter(Boolean).map(esc).join(" · ");
  return `<div class="row"><span class="dot" style="background:var(${EXP_COLORS[k]})"></span>
    <div class="main"><div class="t">${esc(title)}${onlyMeChip(e)}</div><div class="s">${sub}</div></div>
    <b class="amt">${esc(money(e.amount))}</b>${clipBtn("expense", e.id, title)}${delBtn("expenses", e.id)}</div>`;
}
// Fixed costs are charged every every_months months from start_month; the daily function adds each charge
// as an expense on its day, and mentions it remind_days before in the morning notification.
const EVERY_M = [1, 2, 3, 6, 12], BILL_REMIND = [0, 1, 3, 7];
const monthsFrom = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const chargedIn = (c, m) => { const n = monthsFrom(c.start_month || today(), m); return n >= 0 && n % (c.every_months || 1) === 0; };
function nextCharge(c) {
  for (let i = 0, m = today().slice(0, 7); i < 36; i++, m = shiftMonth(m, 1)) {
    if (chargedIn(c, m) && !(c.last_month && c.last_month.slice(0, 7) >= m)) return dayIn(m, c.day);
  }
  return null;
}
function fixedRow(c) {
  if (ui.fixedEdit === c.id) return fixedForm(c);
  const next = nextCharge(c), every = c.every_months || 1;
  const sub = [every > 1 ? T("everyMonths")[every] : T("dayN")(c.day), next ? T("nextOn")(fmtDate(next)) : "", T("expCats")[expCat(c.cat)], c.paid_by ? T("paidBy")(who(c.paid_by)) : ""]
    .filter(Boolean).map(esc).join(" · ");
  return `<div class="row"><span class="dot" style="background:var(${EXP_COLORS[expCat(c.cat)]})"></span>
    <div class="main"><div class="t">${esc(c.name)}${onlyMeChip(c)}</div><div class="s">${sub}${c.remind_days ? ` · <span title="${esc(T("daysBefore")(c.remind_days))}" aria-label="${esc(T("daysBefore")(c.remind_days))}">${IC.bell}</span>` : ""}</div></div>
    <b class="amt">${esc(money(c.amount))}</b><button class="btn ghost small" data-act="fixed-edit" data-id="${esc(c.id)}">${T("editDog")}</button></div>`;
}
// The add form (p = "fx", at the bottom) or the edit form in place of a row (p = "fe").
function fixedForm(c = {}) {
  const p = c.id ? "fe" : "fx", next = c.id ? nextCharge(c) : null, cur = today().slice(0, 7);
  return `<form class="${c.id ? "row edit-row" : "addbar"}" id="${c.id ? "fFixedEdit" : "fFixed"}" data-id="${esc(c.id || "")}"${c.id ? "" : ' style="margin-top:10px"'}>
      <input type="text" id="${p}Name" class="grow" value="${esc(c.name || "")}" placeholder="${esc(T("fixedName"))}" aria-label="${esc(T("fixedName"))}" required autocomplete="off">
      <input type="text" id="${p}Amount" inputmode="decimal" value="${c.id ? esc(String(Number(c.amount)).replace(".", lang === "es" ? "," : ".")) : ""}" placeholder="${esc(T("amount"))}" aria-label="${esc(T("amount"))}" required style="flex:1 1 90px">
      <label class="inline"><span>${T("onDay")}</span><input type="number" id="${p}Day" min="1" max="31" value="${c.day || Number(today().slice(8))}" required style="width:64px"></label>
      <label class="inline"><span>${T("fxEvery")}</span><select id="${p}Every">${EVERY_M.map(n => `<option value="${n}" ${n === (c.every_months || 1) ? "selected" : ""}>${esc(T("everyMonths")[n])}</option>`).join("")}</select></label>
      <label class="inline"><span>${T(c.id ? "fxNext" : "fxFirst")}</span><input type="month" id="${p}Start" min="${cur}" value="${esc((next || "").slice(0, 7) || cur)}" required></label>
      <label class="inline"><span>${T("paperRemind")}</span><select id="${p}Remind">${BILL_REMIND.map(n => `<option value="${n}" ${n === (c.remind_days ?? 3) ? "selected" : ""}>${esc(n ? T("daysBefore")(n) : T("noReminder"))}</option>`).join("")}</select></label>
      <select id="${p}Cat" aria-label="${esc(T("category"))}">${catOptions(c.cat || "bills")}</select>
      <select id="${p}Paid" aria-label="${esc(T("paidByLbl"))}">${payerOptions(c.paid_by || me)}</select>
      <label class="toggle"><input type="checkbox" id="${p}Private" ${c.private ? "checked" : ""}> ${T("onlyMe")}</label>
      ${c.id ? formButtons("fixed_costs", c.id, "fixed-cancel") : `<button class="btn">${T("add")}</button>`}
    </form>`;
}
function saveFixed(f) {
  const p = f.id === "fFixedEdit" ? "fe" : "fx", v = id => ($("#" + p + id)?.value || "").trim();
  const amount = parseAmount(v("Amount")), day = Math.min(31, Math.max(1, parseInt(v("Day"), 10) || 1)), name = v("Name");
  if (!name) return; if (amount === null) { toast("badAmount"); return; }
  const cur = today().slice(0, 7), start = /^\d{4}-\d{2}$/.test(v("Start")) && v("Start") > cur ? v("Start") : cur;
  const values = { name, amount, day, cat: v("Cat"), paid_by: v("Paid") || me, private: $("#" + p + "Private").checked,
    every_months: Number(v("Every")) || 1, remind_days: Number(v("Remind")), start_month: start + "-01" };
  const old = f.dataset.id && find(S.fixed_costs, f.dataset.id);
  if (old) {
    // A different day or pace: remind again. (Months before start_month are never charged.)
    if (day !== old.day || values.every_months !== old.every_months || values.start_month !== old.start_month) values.reminded_for = null;
    ui.fixedEdit = null;
    save({ t: "fixed_costs", kind: "update", id: old.id, values }, "saved"); return;
  }
  // First charge this month and its day has passed: it goes into this month's spending now.
  const id = uuid(), now = start === cur && dayIn(cur, day) <= today();
  values.last_month = now ? cur + "-01" : null;
  ["fxName", "fxAmount"].forEach(i => $("#" + i).value = "");
  save({ t: "fixed_costs", kind: "insert", values: { id, ...values } }, "fixedAdded").then(() => {
    if (now) addExpense({ amount, cat: values.cat, spent_on: dayIn(cur, day), paid_by: values.paid_by, note: name, private: values.private, fixed_id: id }, null);
  });
}
function viewMoney() {
  const m = ui.moneyMonth, list = monthExp(m).sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at || "").localeCompare(a.created_at || ""));
  const total = sumOf(list), prev = sumOf(monthExp(shiftMonth(m, -1)));
  const diff = prev ? Math.round((total - prev) / prev * 100) : null;
  const byPerson = S.members.map(p => [p, sumOf(list.filter(e => e.paid_by === p.user_id))]).filter(x => x[1]);
  const byCat = EXP_KEYS.map(k => [k, sumOf(list.filter(e => expCat(e.cat) === k)), budgetOf(k)]).filter(([, s, b]) => s || b);
  const maxCat = Math.max(1, ...byCat.map(x => x[1]));
  // By shop: same shop however it was typed ("amazon" = "Amazon").
  const shops = [];
  for (const e of list) {
    if (!e.store) continue;
    const row = shops.find(x => sameStore(x[0], e.store));
    if (row) row[1] += Number(e.amount); else shops.push([e.store.trim(), Number(e.amount)]);
  }
  shops.sort((a, b) => b[1] - a[1]);
  const catRow = ([k, s, b]) => {
    const pct = b ? s / b : s / maxCat, lvl = b ? (pct >= 1 ? "over" : pct >= 0.8 ? "near" : "ok") : "plain";
    return `<button type="button" class="row cat-row" data-act="budget" data-k="${k}" aria-label="${esc(T("budgetFor")(T("expCats")[k]))}">
      <span class="dot" style="background:var(${EXP_COLORS[k]})"></span>
      <div class="main"><div class="t">${esc(T("expCats")[k])}</div><div class="bar ${lvl}"><i style="width:${Math.min(100, Math.round(pct * 100))}%"></i></div>
        <div class="s">${b ? esc(T("ofBudget")(money(s), money(b))) : T("noBudget")}</div></div>
      <b class="amt">${esc(money(s))}</b></button>`;
  };
  const curMonth = today().slice(0, 7), fixed = S.fixed_costs.slice().sort((a, b) => a.day - b.day);
  const unbudgeted = EXP_KEYS.filter(k => !byCat.some(x => x[0] === k));
  return `
  <div class="card month-card">
    <div class="cal-head"><button class="icon" data-act="mmon" data-n="-1" aria-label="${T("prevMonth")}">${IC.prev}</button>
      <b>${esc(monthLabel(m))}</b><button class="icon" data-act="mmon" data-n="1" aria-label="${T("nextMonth")}">${IC.next}</button></div>
    <div class="money-total">${esc(money(total))}</div>
    <div class="hint money-sub">${[diff === null ? "" : T("vsLast")(diff), ...byPerson.map(([p, s]) => `${p.user_id === me ? T("you_") : p.display_name} ${money(s)}`)].filter(Boolean).map(esc).join(" · ")}</div>
  </div>
  ${shopDatalist()}
  <form class="addbar" id="fExp" style="margin-top:12px">
    <input type="text" id="xAmount" inputmode="decimal" placeholder="${esc(T("amount"))}" required autocomplete="off" style="flex:1 1 90px">
    <select id="xCat" aria-label="${esc(T("category"))}">${catOptions(ui.expCat)}</select>
    <input type="text" id="xStore" list="shopList" placeholder="${esc(T("shopOrWeb"))}" autocomplete="off" style="flex:1 1 140px">
    <input type="date" id="xDate" value="${m === curMonth ? today() : m + "-01"}" required>
    <select id="xPaid" aria-label="${esc(T("paidByLbl"))}">${payerOptions(me)}</select>
    <input type="text" id="xNote" class="grow" placeholder="${esc(T("expNote"))}" autocomplete="off">
    <label class="toggle"><input type="checkbox" id="xPrivate"> ${T("onlyMe")}</label>
    <button class="btn">${T("add")}</button>
  </form>
  <section class="sec"><div class="sec-head"><h2>${T("byCategory")}</h2><span class="eyebrow">${T("tapBudget")}</span></div>
    <div class="card list">${byCat.length ? byCat.map(catRow).join("") : `<div class="empty">${T("noSpending")}</div>`}</div>
    ${unbudgeted.length ? `<details class="more-cats"><summary class="link">${T("setBudget")}</summary><div class="often">${unbudgeted.map(k => `<button class="chip-btn" data-act="budget" data-k="${k}">${esc(T("expCats")[k])}</button>`).join("")}</div></details>` : ""}</section>
  ${shops.length ? `<section class="sec"><h2>${T("byShop")}</h2><div class="card list">${shops.slice(0, 8).map(([name, s]) => `<div class="row"><div class="main"><div class="t">${esc(name)}</div></div><b class="amt">${esc(money(s))}</b></div>`).join("")}</div></section>` : ""}
  <section class="sec"><h2>${T("expensesH")}</h2>
    <div class="card list">${list.length ? list.map(expRow).join("") : `<div class="empty">${T("noSpending")}</div>`}</div></section>
  <section class="sec"><div class="sec-head"><h2>${T("fixedH")}</h2><span class="eyebrow">${T("fixedHint")}</span></div>
    <div class="card list">${fixed.length ? fixed.map(fixedRow).join("") : `<div class="empty">${T("noFixed")}</div>`}</div>
    ${fixedForm()}
    <p class="hint">${T("fixedFormHint")}</p></section>
  ${yearCard()}
  <section class="sec"><div class="kv"><span class="eyebrow">${T("exportCsv")}</span>
    <div class="kv"><button class="btn ghost small" data-act="csv" data-scope="month">${esc(monthLabel(m))}</button><button class="btn ghost small" data-act="csv" data-scope="year">${m.slice(0, 4)}</button></div></div></section>`;
}

// The year of the month shown: a bar per month (tap one to open it), the average, against last year, and by category.
const moneyRound = n => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
function yearCard() {
  const y = ui.moneyMonth.slice(0, 4), cur = today().slice(0, 7), inYear = e => e.spent_on.startsWith(y);
  const total = sumOf(S.expenses.filter(inYear)); if (!total) return "";
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`), totals = months.map(mm => sumOf(monthExp(mm))), max = Math.max(...totals);
  const upTo = y === cur.slice(0, 4) ? Number(cur.slice(5)) : 12, prevY = String(Number(y) - 1);
  const before = sumOf(S.expenses.filter(e => e.spent_on.startsWith(prevY) && Number(e.spent_on.slice(5, 7)) <= upTo)); // only last year is loaded
  const vs = before ? Math.round((total - before) / before * 100) : null;
  const cats = EXP_KEYS.map(k => [k, sumOf(S.expenses.filter(e => inYear(e) && expCat(e.cat) === k))]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  return `<section class="sec"><div class="sec-head"><h2>${esc(T("yearH")(y))}</h2><span class="eyebrow">${T("tapMonth")}</span></div>
    <div class="card year-card">
      <div><div class="money-total" style="text-align:left">${esc(money(total))}</div>
        <div class="hint" style="margin:0">${[T("avgMonth")(money(total / upTo)), vs === null ? "" : T("vsYear")(vs, prevY)].filter(Boolean).map(esc).join(" · ")}</div></div>
      <div class="ybars">${months.map((mm, i) => {
        const t = totals[i], sel = mm === ui.moneyMonth, lbl = `${monthLabel(mm)}: ${money(t)}`;
        return `<button class="ybar ${sel ? "sel" : ""}" data-act="mgo" data-m="${mm}" aria-label="${esc(lbl)}" title="${esc(lbl)}" ${mm > cur ? "disabled" : ""} ${sel ? 'aria-current="true"' : ""}>
          <span class="col">${sel && t ? `<em>${esc(moneyRound(t))}</em>` : ""}<i style="height:${t ? Math.max(3, Math.round(t / max * 84)) : 0}px"></i></span>
          <span class="lbl">${esc(cap(T("months")[i]).slice(0, 3))}</span></button>`;
      }).join("")}</div>
      <div class="list">${cats.slice(0, 6).map(([k, s]) => `<div class="row"><span class="dot" style="background:var(${EXP_COLORS[k]})"></span>
        <div class="main"><div class="t">${esc(T("expCats")[k])}</div></div><span class="s">${Math.round(s / total * 100)}%</span><b class="amt">${esc(money(s))}</b></div>`).join("")}</div>
    </div></section>`;
}

function addExpense(values, okKey = "added") {
  const v = { id: uuid(), store: "", note: "", private: false, paid_by: me, spent_on: today(), ...values };
  return save({ t: "expenses", kind: "insert", values: v }, okKey).then(ok => { budgetToast(v.cat, v.spent_on); return ok; });
}
// Local heads-up when a budget is nearly used up (the server also notifies both phones).
function budgetToast(cat, day) {
  const b = budgetOf(cat); if (!b) return;
  const s = sumOf(monthExp(day.slice(0, 7)).filter(e => expCat(e.cat) === cat && !e.private));
  if (s >= b) toast(T("budgetOverToast")(T("expCats")[cat])); else if (s >= b * 0.8) toast(T("budgetNearToast")(T("expCats")[cat]));
}
// A Need ticked as bought goes into Spending with its name, category, shop and price.
// Without a usable price it asks for one (empty = don't add).
function needBought(x) {
  let amount = parseAmount(x.price);
  if (amount === null) {
    const ans = prompt(T("needCost")(x.title), x.price || "");
    if (ans === null || !ans.trim()) return;
    amount = parseAmount(ans);
    if (amount === null) { toast("badAmount"); return; }
  }
  addExpense({ amount, cat: NEED_TO_EXP[x.cat] || "other", note: x.title, store: x.store || "", need_id: x.id }, "expAdded");
}
async function setBudget(k) {
  const cur = budgetOf(k), name = T("expCats")[k];
  const ans = prompt(T("budgetPrompt")(name), cur ? String(cur).replace(".", lang === "es" ? "," : ".") : ""); if (ans === null) return;
  if (!navigator.onLine) { toast("needsOnline"); return; }
  const n = parseAmount(ans);
  if (ans.trim() && n === null) { toast("badAmount"); return; }
  const res = !ans.trim() || n === 0 ? await sb.from("budgets").delete().eq("household_id", hid).eq("cat", k)
    : await sb.from("budgets").upsert({ household_id: hid, cat: k, amount: n }, { onConflict: "household_id,cat" });
  if (res.error) { console.error(res.error); toast("cantSave"); return; }
  toast("savedOk"); load("budgets");
}
function exportCsv(scope) {
  const m = ui.moneyMonth, es = lang === "es", sep = es ? ";" : ",";
  const rows = S.expenses.filter(e => scope === "year" ? e.spent_on.startsWith(m.slice(0, 4)) : e.spent_on.slice(0, 7) === m)
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on));
  const q = v => { const s = String(v ?? ""); return /["\n;,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = n => es ? Number(n).toFixed(2).replace(".", ",") : Number(n).toFixed(2);
  const lines = [T("csvHead").map(q).join(sep), ...rows.map(e => [e.spent_on, T("expCats")[expCat(e.cat)], num(e.amount), e.paid_by ? who(e.paid_by) : "",
    e.note, e.store, e.fixed_id ? T("fixedTag") : "", e.private ? T("onlyMe") : ""].map(q).join(sep))];
  const name = `home-together-${scope === "year" ? m.slice(0, 4) : m}.csv`;
  const file = new File(["﻿" + lines.join("\r\n")], name, { type: "text/csv" }); // the BOM lets Excel read accents
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------- weather for walks (Open-Meteo: free, no key) ----------
// The home's town is shared; the forecast is kept on the phone for 30 minutes (and shown offline while it lasts).
// Keep wet() in step with supabase/functions/_shared/weather.ts.
const wet = h => (h.prob ?? 0) >= 50 || (h.mm ?? 0) >= 0.5;
let wx = null;
try { wx = JSON.parse(localStorage.getItem("ht-wx") || "null"); } catch (e) {}
const wxKey = () => S.home?.lat != null ? `${S.home.lat},${S.home.lon}` : "";
async function loadWeather() {
  const key = wxKey(); if (!key || loadWeather.busy) return;
  if (wx && wx.key === key && Date.now() - wx.at < 30 * 60000) return;
  if (Date.now() - (loadWeather.failed || 0) < 5 * 60000) return;
  loadWeather.busy = true;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${S.home.lat}&longitude=${S.home.lon}` +
      "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&timezone=Europe%2FMadrid&forecast_days=2");
    if (!r.ok) throw new Error(r.status);
    const H = (await r.json()).hourly;
    wx = { key, at: Date.now(), hours: H.time.map((t, i) => ({ t, temp: H.temperature_2m[i], prob: H.precipitation_probability[i], mm: H.precipitation[i], code: H.weather_code[i], day: H.is_day[i] })) };
    try { localStorage.setItem("ht-wx", JSON.stringify(wx)); } catch (e) {}
    if (tab === "dogs") render();
  } catch (e) { loadWeather.failed = Date.now(); }
  finally { loadWeather.busy = false; }
}
function wxIcon(c, day) {
  if (c >= 95) return "⛈️";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "🌨️";
  if (c >= 61) return "🌧️";
  if (c >= 51) return "🌦️";
  if (c >= 45) return "🌫️";
  if (c === 3) return "☁️";
  if (c >= 1) return day ? "🌤️" : "☁️";
  return day ? "☀️" : "🌙";
}
// The next 12 hours from the start of this one.
const nextHours = () => {
  const d = new Date(), from = `${today()}T${pad(d.getHours())}:00`;
  return (wx && wx.key === wxKey() ? wx.hours : []).filter(h => h.t >= from).slice(0, 12);
};
function rainLine(hours) {
  const i = hours.findIndex(wet);
  if (i < 0) return T("wxDry");
  let j = i; while (j < hours.length && wet(hours[j])) j++;
  const peak = Math.max(...hours.slice(i, j).map(h => h.prob ?? 0));
  const to = j < hours.length ? hours[j].t.slice(11, 16) : "";
  return i === 0 ? T("wxNow")(to) : T("wxLater")(hours[i].t.slice(11, 16), to, peak);
}
function weatherCard() {
  if (!S.home?.place) return `<div class="card wx"><b>${T("wxTitle")}</b><p class="hint" style="margin:0">${T("wxSetTown")}</p>
    <button class="btn ghost small" data-act="open-settings" style="align-self:flex-start">${T("wxChoose")}</button></div>`;
  loadWeather();
  const hours = nextHours();
  if (!hours.length) return `<div class="card wx"><b>${T("wxTitle")} · ${esc(S.home.place)}</b><p class="hint" style="margin:0">${T(navigator.onLine ? "wxLoading" : "wxOffline")}</p></div>`;
  const rain = hours.some(wet);
  return `<div class="card wx">
    <div class="kv"><b>${T("wxTitle")} · ${esc(S.home.place)}</b><span class="wx-temp">${wxIcon(hours[0].code, hours[0].day)} ${Math.round(hours[0].temp)}°</span></div>
    <div class="wx-line${rain ? " rainy" : ""}">${esc(rainLine(hours))}</div>
    <div class="wx-hours">${hours.map(h => `<div class="wx-h${wet(h) ? " wet" : ""}"><span>${h.t.slice(11, 13)}h</span><span aria-hidden="true">${wxIcon(h.code, h.day)}</span><span>${h.prob ?? 0}%</span></div>`).join("")}</div>
  </div>`;
}
function weatherSettings() {
  const mine = S.members.find(m => m.user_id === me), place = S.home?.place;
  const search = `<form id="fPlace" class="row-form"><input type="text" id="plName" placeholder="${esc(T("wxTown"))}" aria-label="${esc(T("wxTown"))}" autocomplete="off" required>
      <button class="btn small">${T("wxSearch")}</button></form>
    ${ui.places ? (ui.places.length ? `<div class="wx-places">${ui.places.map((p, i) => `<button class="btn ghost small" data-act="wx-pick" data-i="${i}">${esc([p.name, p.admin1, p.country].filter(Boolean).join(", "))}</button>`).join("")}</div>` : `<p class="hint" style="margin:0">${T("wxNone")}</p>`) : ""}
    <div class="kv"><button class="btn ghost small" data-act="wx-here">📍 ${T("wxHere")}</button>${place ? `<button class="btn ghost small" data-act="wx-cancel">${T("cancel")}</button>` : ""}</div>`;
  return `<div class="card"><b>${T("wxTitle")}</b><p class="hint" style="margin:0">${T("wxHint")}</p>
    ${place && !ui.placeEdit ? `<div class="kv"><span>📍 ${esc(place)}</span><button class="btn ghost small" data-act="wx-change">${T("wxChange")}</button></div>` : search}
    <label class="toggle"><input type="checkbox" id="wxAlerts" ${mine?.rain_alerts ? "checked" : ""} ${place ? "" : "disabled"}> ${T("wxAlerts")}</label>
    <p class="hint" style="margin:0">${T("wxAlertsHint")}</p></div>`;
}
async function findPlace(name) {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${lang}&format=json`);
    ui.places = (await r.json()).results || [];
  } catch (e) { toast("needsOnline"); return; }
  await renderSettings();
}
async function savePlace(values) {
  ui.places = null; ui.placeEdit = false; wx = null;
  S.home = { ...S.home, ...values };
  if (!await run(sb.from("households").update(values).eq("id", hid), "wxSaved")) loadHome();
  render(); await renderSettings();
}
function placeHere() {
  if (!navigator.geolocation) { toast("wxNoLocation"); return; }
  navigator.geolocation.getCurrentPosition(
    p => savePlace({ place: T("wxHereName"), lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
    () => toast("wxNoLocation"), { timeout: 15000, maximumAge: 600000 });
}

// ---------- home: papers, home info, who did what ----------
function infoRow(x) {
  return `<div class="row"><div class="main"><div class="t">${esc(x.label)}</div>${x.value ? `<div class="s info-val">${esc(x.value)}</div>` : ""}</div>
    ${x.value ? `<button class="btn ghost small" data-act="info-copy" data-id="${esc(x.id)}">${T("copy")}</button>` : ""}${delBtn("home_info", x.id)}</div>`;
}
// Monthly counts per person, worked out by the database (home_stats), so they cover every walk, not just the last ones loaded.
const STAT_KINDS = [["chore", "✅"], ["walk", LOG_ICON.walk], ["food", LOG_ICON.food], ["med", LOG_ICON.med], ["trip", "🛒"]];
async function loadStats(m) {
  if (!sb || !navigator.onLine || loadStats.busy === m) return;
  loadStats.busy = m;
  const { data, error } = await sb.rpc("home_stats", { p_from: m + "-01", p_to: shiftMonth(m, 1) + "-01" });
  loadStats.busy = null;
  if (error) console.error(error);
  ui.stats = { m, rows: error ? null : data || [] };
  if (tab === "home") render();
}
function statsCard() {
  const m = ui.homeMonth, st = ui.stats?.m === m ? ui.stats : null;
  if (!st) loadStats(m);
  const head = `<div class="cal-head"><button class="icon" data-act="hmon" data-n="-1" aria-label="${T("prevMonth")}">${IC.prev}</button>
    <b>${esc(monthLabel(m))}</b><button class="icon" data-act="hmon" data-n="1" aria-label="${T("nextMonth")}" ${m >= today().slice(0, 7) ? "disabled" : ""}>${IC.next}</button></div>`;
  if (!st || !st.rows) return `<div class="card stats-card">${head}<div class="empty">${T(!st ? (navigator.onLine ? "loadingStats" : "needsOnline") : "statsError")}</div></div>`;
  const per = S.members.map(p => {
    const row = k => st.rows.find(r => r.user_id === p.user_id && r.kind === k);
    const counts = STAT_KINDS.map(([k]) => Number(row(k)?.n || 0));
    return { p, counts, sum: counts.reduce((a, b) => a + b, 0), paid: Number(row("paid")?.amount || 0) };
  });
  const all = per.reduce((a, x) => a + x.sum, 0);
  if (!all && !per.some(x => x.paid)) return `<div class="card stats-card">${head}<div class="empty">${T("noStats")}</div></div>`;
  return `<div class="card stats-card">${head}<div class="list">${per.map(x => `<div class="row"><div class="main">
      <div class="kv"><span class="t">${esc(x.p.user_id === me ? T("you_") : x.p.display_name || T("partner"))}</span><span class="s">${all ? Math.round(x.sum / all * 100) : 0}%</span></div>
      <div class="bar"><i style="width:${all ? Math.round(x.sum / all * 100) : 0}%"></i></div>
      <div class="s">${[...STAT_KINDS.map(([k, ic], j) => x.counts[j] ? `${ic} ${x.counts[j]} ${T("statLbl")[k]}` : ""), x.paid ? `💶 ${money(x.paid)}` : ""].filter(Boolean).map(esc).join(" · ") || "—"}</div>
    </div></div>`).join("")}</div></div>`;
}
// Shared notes. A line written "[ ] milk" (or "- [ ] milk") is a tick; tapping it writes "[x]".
const TICK = /^(\s*(?:[-*]\s*)?)\[( |x|X)\](\s?)(.*)$/;
const noteSort = (a, b) => (b.pinned - a.pinned) || (b.updated_at || "").localeCompare(a.updated_at || "");
function noteBody(n) {
  return n.body.split("\n").map((line, i) => {
    const m = line.match(TICK);
    if (!m) return line.trim() ? `<p>${esc(line)}</p>` : `<p class="gap"></p>`;
    const on = m[2] !== " ";
    return `<button type="button" class="tick ${on ? "on" : ""}" data-act="note-tick" data-id="${esc(n.id)}" data-i="${i}" aria-pressed="${on}">
      <span class="box">${on ? IC.tick : ""}</span><span class="lbl">${esc(m[4])}</span></button>`;
  }).join("");
}
function noteCard(n) {
  if (ui.noteEdit === n.id) return noteForm(n);
  const ticks = n.body.split("\n").filter(l => TICK.test(l)), done = ticks.filter(l => l.match(TICK)[2] !== " ").length;
  return `<div class="card note-card">
    <div class="sec-head"><b class="t">${n.pinned ? "📌 " : ""}${esc(n.title || T("untitled"))}</b>
      <span class="kv">${ticks.length ? `<span class="chip">${done}/${ticks.length}</span>` : ""}<button class="btn ghost small" data-act="note-edit" data-id="${esc(n.id)}">${T("editDog")}</button></span></div>
    ${n.body.trim() ? `<div class="note-body">${noteBody(n)}</div>` : ""}
    <div class="s">${esc(T("editedBy")(cap(who(n.updated_by || n.created_by)), fmtDate(ymd(new Date(n.updated_at || n.created_at)))))}</div></div>`;
}
function noteForm(n = {}) {
  return `<form class="card note-form" id="fNote" data-id="${esc(n.id || "")}">
    <input type="text" id="noTitle" value="${esc(n.title || "")}" placeholder="${esc(T("noteTitle"))}" aria-label="${esc(T("noteTitle"))}" maxlength="80" autocomplete="off">
    <textarea id="noBody" rows="7" placeholder="${esc(T("noteBodyPh"))}" aria-label="${esc(T("noteBodyLbl"))}">${esc(n.body || "")}</textarea>
    <label class="toggle"><input type="checkbox" id="noPin" ${n.pinned ? "checked" : ""}> ${T("pinNote")}</label>
    ${formButtons("notes", n.id, "note-cancel")}
  </form>`;
}
function saveNote(f) {
  const title = $("#noTitle").value.trim(), body = $("#noBody").value.replace(/\s+$/, "");
  if (!title && !body) return;
  const old = f.dataset.id && find(S.notes, f.dataset.id);
  const values = { title, body, pinned: $("#noPin").checked, updated_by: me, updated_at: new Date().toISOString() };
  ui.noteEdit = null;
  save(old ? { t: "notes", kind: "update", id: old.id, values } : { t: "notes", kind: "insert", values: { id: uuid(), ...values }, notify: ["note", title || body.split("\n")[0]] }, "saved");
}
function noteTick(id, i) {
  const n = find(S.notes, id); if (!n) return;
  const lines = n.body.split("\n"), m = (lines[i] || "").match(TICK); if (!m) return;
  lines[i] = `${m[1]}[${m[2] === " " ? "x" : " "}]${m[3]}${m[4]}`;
  save({ t: "notes", kind: "update", id, values: { body: lines.join("\n"), updated_by: me, updated_at: new Date().toISOString() } });
}
function viewNotes() {
  const list = S.notes.slice().sort(noteSort), adding = ui.noteEdit === "new";
  return `<section class="sec"><div class="sec-head"><h2>${T("notesH")}</h2>${adding ? "" : `<button class="btn small" data-act="note-add">+ ${T("newNote")}</button>`}</div>
    <div class="notes">${adding ? noteForm() : ""}${list.length ? list.map(noteCard).join("") : adding ? "" : `<div class="card"><div class="empty">${T("noNotes")}</div></div>`}</div>
    <p class="hint">${T("notesHint")}</p></section>`;
}


// ---------- feng shui: the bagua on the home's plan ----------
// The plan of the flat, in the pixels of the study's drawing: walls, rooms, the missing areas (blue in the
// study) and the extra one (red). What the study says for each zone is in the database (table fengshui).
const PLAN = {
  w: 960, h: 1130, c: [482, 552], box: [95, 135, 870, 970],
  outline: "M95 135H870V970H610V1100H425V970H95Z",
  rooms: [["salon", 100, 140, 395, 435], ["master", 500, 140, 365, 330], ["hall", 500, 470, 255, 105], ["entry", 100, 580, 125, 280],
    ["kitchen", 225, 580, 205, 385], ["room", 430, 580, 230, 385], ["bath", 660, 580, 205, 385], ["gallery", 425, 970, 185, 130]],
  missing: ["M760 478H865V575H760Z", "M100 860H225L282 965H100Z"],
  extra: ["M425 970H610V1100H425Z"],
  marks: { viento: "missing", agua: "missing", trueno: "extra" },
};
// The eight zones around the centre (angle of their middle, 0 = right, clockwise) as drawn on the study.
const ZONES = [["lago", -90], ["cielo", -45], ["agua", 0], ["montana", 45], ["trueno", 90], ["viento", 135], ["fuego", 180], ["tierra", -135]];
const FS_ALL = [...ZONES.map(z => z[0]), "centro"];
// Each zone's own element, and the one that feeds it in the five-element cycle (water → wood → fire → earth → metal → water).
const FS_EL = { trueno: "wood", viento: "wood", fuego: "fire", tierra: "earth", lago: "metal", cielo: "metal", agua: "water", montana: "earth", centro: "earth" };
const FEEDS = { wood: "water", fire: "wood", earth: "fire", metal: "earth", water: "metal" };
const TRIGRAM = { trueno: [1, 0, 0], viento: [0, 1, 1], fuego: [1, 0, 1], tierra: [0, 0, 0], lago: [1, 1, 0], cielo: [1, 1, 1], agua: [0, 1, 0], montana: [0, 0, 1] }; // bottom → top, 1 = solid
const fsItems = (zone, kind) => S.fengshui.filter(x => x.zone === zone && x.kind === kind).sort((a, b) => a.sort - b.sort || (a.created_at || "").localeCompare(b.created_at || ""));
const fsPending = zone => S.fengshui.filter(x => x.zone === zone && x.kind === "task" && !x.done).length;
// A trigram as three bars (top first), solid or broken.
const trigramHtml = (z, cls = "") => TRIGRAM[z] ? `<span class="trigram ${cls}" aria-hidden="true">${TRIGRAM[z].slice().reverse().map(l => `<i class="${l ? "" : "yin"}"></i>`).join("")}</span>` : "";

// Where a ray from the centre at this angle leaves the main rectangle, to place the zone's label inside it.
function rayToBox(deg) {
  const [cx, cy] = PLAN.c, [x0, y0, x1, y1] = PLAN.box, a = deg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
  const t = Math.min(dx > 1e-9 ? (x1 - cx) / dx : dx < -1e-9 ? (x0 - cx) / dx : Infinity, dy > 1e-9 ? (y1 - cy) / dy : dy < -1e-9 ? (y0 - cy) / dy : Infinity);
  return t;
}
function fsMap() {
  const [cx, cy] = PLAN.c, R = 2000, sel = ui.fsZone;
  const pt = (deg, r) => { const a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const wedges = ZONES.map(([z, deg]) => {
    const p1 = pt(deg - 22.5, R), p2 = pt(deg + 22.5, R);
    return `<polygon points="${cx},${cy} ${p1[0].toFixed(0)},${p1[1].toFixed(0)} ${p2[0].toFixed(0)},${p2[1].toFixed(0)}" class="wedge el-${FS_EL[z]} ${sel === z ? "sel" : ""}" data-act="fs-zone" data-z="${z}"><title>${esc(T("fsZones")[z].name)}</title></polygon>`;
  }).join("");
  const labels = ZONES.map(([z, deg]) => {
    const [x, y] = pt(deg, rayToBox(deg) * 0.6), n = fsPending(z), mark = PLAN.marks[z];
    const bars = TRIGRAM[z].slice().reverse().map((l, i) => l ? `<rect x="-26" y="${i * 14 - 46}" width="52" height="8" rx="2"/>` : `<rect x="-26" y="${i * 14 - 46}" width="22" height="8" rx="2"/><rect x="4" y="${i * 14 - 46}" width="22" height="8" rx="2"/>`).join("");
    return `<g class="zlabel" transform="translate(${x.toFixed(0)},${y.toFixed(0)})">${bars}
      <text y="20" text-anchor="middle" class="zname">${esc(T("fsZones")[z].name)}</text>
      <text y="48" text-anchor="middle" class="zel">${esc(T("fsEl")[FS_EL[z]])}${mark ? (mark === "missing" ? " · −" : " · +") : ""}</text>
      ${n ? `<g transform="translate(34,-52)"><circle r="17" class="zbadge"/><text y="7" text-anchor="middle" class="zbadge-n">${n}</text></g>` : ""}</g>`;
  }).join("");
  const rooms = PLAN.rooms.map(([k, x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="room"/>`).join("");
  // Room names in a corner of each room (top or bottom), clear of the zone labels.
  const BOTTOM = ["kitchen", "room", "bath", "gallery"];
  const roomNames = PLAN.rooms.map(([k, x, y, w, h]) => `<text x="${x + 12}" y="${BOTTOM.includes(k) ? y + h - 14 : y + 30}" class="rname">${esc(T("fsRooms")[k])}</text>`).join("");
  const n = fsPending("centro");
  return `<svg class="fsmap" viewBox="60 110 ${PLAN.w - 60} ${PLAN.h - 90}" role="group" aria-label="${esc(T("fsMapAria"))}">
    <defs><clipPath id="house"><path d="${PLAN.outline}"/></clipPath>
      <pattern id="hatchMiss" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" class="miss-bg"/><line x1="0" y1="0" x2="0" y2="14" class="miss-ln"/></pattern>
      <pattern id="hatchExtra" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="14" height="14" class="extra-bg"/><line x1="0" y1="0" x2="0" y2="14" class="extra-ln"/></pattern></defs>
    <g clip-path="url(#house)">${wedges}</g>
    ${PLAN.missing.map(d => `<path d="${d}" fill="url(#hatchMiss)" class="area"/>`).join("")}${PLAN.extra.map(d => `<path d="${d}" fill="url(#hatchExtra)" class="area"/>`).join("")}
    <g class="walls">${rooms}<path d="${PLAN.outline}" class="outline"/></g>
    <g class="names">${roomNames}</g>
    ${labels}
    <g data-act="fs-zone" data-z="centro" class="centre ${sel === "centro" ? "sel" : ""}"><circle cx="${cx}" cy="${cy}" r="34"/><title>${esc(T("fsZones").centro.name)}</title>
      ${n ? `<circle cx="${cx + 30}" cy="${cy - 30}" r="15" class="zbadge"/><text x="${cx + 30}" y="${cy - 24}" text-anchor="middle" class="zbadge-n">${n}</text>` : ""}</g>
  </svg>`;
}
function fsTaskRow(x) {
  return `<div class="row ${x.done ? "done" : ""}">
    <button class="check ${x.done ? "on" : ""}" data-act="fs-done" data-id="${esc(x.id)}" aria-pressed="${x.done}" aria-label="${esc(x.done ? T("putBack") : T("fsMarkDone"))}">${x.done ? IC.tick : ""}</button>
    <div class="main"><div class="t">${esc(x.text)}</div>${x.done && x.done_by ? `<div class="s">${esc(T("doneBy")(who(x.done_by)))}</div>` : ""}</div>${delBtn("fengshui", x.id)}</div>`;
}
const fsAddForm = zone => `<form class="addbar fs-add" id="fFs-${zone}" data-zone="${zone}">
    <input type="text" id="fsTask-${zone}" class="grow" placeholder="${esc(T("fsAddPh"))}" aria-label="${esc(T("fsAddPh"))}" required maxlength="200" autocomplete="off">
    <button class="btn small">${T("add")}</button></form>`;
function fsZoneCard(z) {
  const info = T("fsZones")[z], own = FS_EL[z], mark = PLAN.marks[z], notes = fsItems(z, "note"), tasks = fsItems(z, "task");
  const feeds = z === "centro" ? [] : [own, FEEDS[own]].filter((e, i, a) => a.indexOf(e) === i);
  const elBlock = e => `<details class="fs-el"><summary><span class="eldot el-${e}"></span><b>${esc(T("fsEl")[e])}</b> <span class="s">${esc(T("fsElHint"))}</span></summary><p>${esc(T("fsElRep")[e])}</p></details>`;
  return `<div class="card fs-zone el-${own}">
    <div class="fs-head">${trigramHtml(z, "big")}<div><h3>${esc(info.name)}${lang === "en" ? ` <span class="s">${esc(info.es)}</span>` : ""}</h3>
      <div class="s">${esc(info.area)}</div></div></div>
    ${mark ? `<p class="fs-mark ${mark}">${esc(T(mark === "missing" ? "fsMissing" : "fsExtra"))}</p>` : ""}
    <p>${esc(info.about)}</p>
    ${feeds.length ? `<div><span class="eyebrow">${T("fsNourish")}</span>
      <p class="hint" style="margin:4px 0 6px">${esc(T("fsWhy")(T("fsEl")[own], T("fsEl")[FEEDS[own]]))}</p>${feeds.map(elBlock).join("")}</div>` : ""}
    ${notes.length ? `<div><span class="eyebrow">${T("fsInHome")}</span>${notes.map(x => `<p class="fs-note">${esc(x.text)}</p>`).join("")}</div>` : ""}
    <div><span class="eyebrow">${T("fsTodo")}</span>
      <div class="list">${tasks.length ? tasks.map(fsTaskRow).join("") : `<div class="hint" style="margin:4px 0">${T("fsNothing")}</div>`}</div>
      ${fsAddForm(z)}</div>
  </div>`;
}
function viewFengShui() {
  if (!FS_ALL.includes(ui.fsZone)) ui.fsZone = FS_ALL.find(fsPending) || "centro";
  const tasks = S.fengshui.filter(x => x.kind === "task"), done = tasks.filter(x => x.done).length;
  const personal = fsItems("personal", "note"), ptasks = fsItems("personal", "task"), docs = filesOf("fengshui", "fengshui");
  return `<section class="sec"><div class="sec-head"><h2>${T("fsH")}</h2>${tasks.length ? `<span class="eyebrow">${esc(T("fsProgress")(done, tasks.length))}</span>` : ""}</div>
    <div class="card fs-map-card">${fsMap()}
      <div class="fs-legend"><span><i class="lg miss"></i>${T("fsLegendMiss")}</span><span><i class="lg extra"></i>${T("fsLegendExtra")}</span><span>${T("fsTapZone")}</span></div>
      <div class="often fs-chips" role="group" aria-label="${esc(T("fsZonesLbl"))}">${FS_ALL.map(z => `<button class="chip-btn" data-act="fs-zone" data-z="${z}" aria-pressed="${ui.fsZone === z}"><span class="eldot el-${FS_EL[z]}"></span>${esc(T("fsZones")[z].name)}${fsPending(z) ? ` <small>${fsPending(z)}</small>` : ""}</button>`).join("")}</div>
    </div></section>
  <section class="sec" id="fsZone">${fsZoneCard(ui.fsZone)}</section>
  ${personal.length || ptasks.length ? `<section class="sec"><h2>${T("fsPersonal")}</h2><div class="card fs-zone">
    ${personal.map(x => `<p class="fs-note">${esc(x.text)}</p>`).join("")}${ptasks.length ? `<div class="list">${ptasks.map(fsTaskRow).join("")}</div>` : ""}
    <p class="hint" style="margin:0">${T("fsPersonalHint")}</p></div></section>` : ""}
  <section class="sec"><h2>${T("fsRulesH")}</h2><div class="card fs-zone"><ul class="fs-rules">${T("fsRules").map(r => `<li>${esc(r)}</li>`).join("")}</ul></div></section>
  <section class="sec"><div class="sec-head"><h2>${T("fsDocs")}</h2><button class="btn small" data-act="files" data-kind="fengshui" data-id="fengshui" data-title="${esc(T("fsH"))}">${T(docs.length ? "fsDocsManage" : "addFile")}</button></div>
    <div class="card list">${docs.length ? docs.map(a => `<div class="row"><span class="log-ic">📄</span><div class="main"><button class="file-open" data-act="open-file" data-path="${esc(a.path)}">${esc(a.name)}</button>
      <div class="s">${esc(fmtSize(a.size))}${a.created_by ? ` · ${esc(T("addedBy")(who(a.created_by)))}` : ""}</div></div></div>`).join("") : `<div class="empty">${T("fsNoDocs")}</div>`}</div></section>`;
}

// Home: Spending · Papers · Info · Notes · Feng shui · Activity (who did what).
function viewHome() {
  const bar = subBar("home");
  if (sub.home === "money") return bar + viewMoney();
  if (sub.home === "notes") return bar + viewNotes();
  if (sub.home === "fengshui") return bar + viewFengShui();
  if (sub.home === "papers") return `${bar}
  ${papersSection("home", S.papers.filter(p => !p.dog_id).sort(byExpiry), T("papersH"), T("noPapers"))}
  <p class="hint">${T("papersHint")}</p>`;
  if (sub.home === "who") return `${bar}
  <section class="sec"><h2>${T("whoH")}</h2>${statsCard()}<p class="hint">${T("statsHint")}</p></section>`;
  return `${bar}
  <section class="sec"><h2>${T("infoH")}</h2>
    <div class="card list">${S.home_info.length ? S.home_info.map(infoRow).join("") : `<div class="empty">${T("noInfo")}</div>`}</div>
    <form class="addbar" id="fInfo" style="margin-top:10px">
      <input type="text" id="inLabel" placeholder="${esc(T("infoLabel"))}" aria-label="${esc(T("infoLabel"))}" required maxlength="40" autocomplete="off">
      <input type="text" id="inValue" class="grow" placeholder="${esc(T("infoValue"))}" aria-label="${esc(T("infoValue"))}" maxlength="200" autocomplete="off">
      <button class="btn">${T("add")}</button>
    </form></section>`;
}

// ---------- tabs and their sections ----------
// Five tabs; Agenda, Dogs and Home have sections picked with a switch at the top (remembered on this phone).
// The old addresses (#chores, #calendar, #money… used by links and notifications) open the right section.
const SUBS = { agenda: ["chores", "calendar"], dogs: ["dogtoday", "food", "health", "pack"], home: ["money", "papers", "info", "notes", "fengshui", "who"] };
const ALIAS = { chores: ["agenda", "chores"], calendar: ["agenda", "calendar"], money: ["home", "money"], walks: ["dogs", "dogtoday"], food: ["dogs", "food"], health: ["dogs", "health"], pack: ["dogs", "pack"],
  papers: ["home", "papers"], info: ["home", "info"], notes: ["home", "notes"], fengshui: ["home", "fengshui"], who: ["home", "who"] };
const sub = {};
for (const t in SUBS) { let s = null; try { s = localStorage.getItem("ht-sub-" + t); } catch (e) {} sub[t] = SUBS[t].includes(s) ? s : SUBS[t][0]; }
function setSub(t, s) {
  if (!SUBS[t]?.includes(s)) return;
  sub[t] = s; try { localStorage.setItem("ht-sub-" + t, s); } catch (e) {}
  if (s === "who") ui.stats = null; // fresh counts each time
}
const subBar = t => `<div class="seg ${SUBS[t].length > 5 ? "many" : ""}" role="tablist">${SUBS[t].map(s => `<button type="button" role="tab" data-act="sub" data-t="${t}" data-v="${s}" aria-pressed="${sub[t] === s}" aria-selected="${sub[t] === s}">${esc(T("subs")[s])}${s === "chores" && dueNow().length ? ` <span class="count">${dueNow().length}</span>` : ""}</button>`).join("")}</div>`;
const viewAgenda = () => subBar("agenda") + (sub.agenda === "calendar" ? viewCalendar() : viewChores());

const VIEWS = { today: viewToday, groceries: viewShopping, agenda: viewAgenda, dogs: viewDogs, home: viewHome };

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
    <div class="card"><b>${T("notif")}</b>${notifBody}${st === "on" ? notifPrefs() : ""}</div>
    ${weatherSettings()}
    <div class="card"><b>${T("mantraTitle")}</b>
      <label class="toggle"><input type="checkbox" id="mantraOn" ${mantraOn ? "checked" : ""}> ${T("mantraShow")}</label>
      <p class="hint" style="margin:0">${T("mantraHint")}</p></div>
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
// Which notifications this person gets (members.notify_off; the server skips the topics turned off).
const NOTIF_TOPICS = [["fromOther", ["list", "shop", "need", "calendar", "chores", "done", "dogs", "med", "note"]], ["remindersSum", ["reminders", "meds_due", "budget", "daily", "weekly"]]];
function notifPrefs() {
  const off = S.members.find(m => m.user_id === me)?.notify_off || [];
  return `<details class="notif-prefs"><summary class="link">${T("notifChoose")}</summary>
    ${NOTIF_TOPICS.map(([g, list]) => `<span class="eyebrow">${T("notifGroups")[g]}</span>
      ${list.map(k => `<label class="toggle"><input type="checkbox" class="nt-pref" data-k="${k}" ${off.includes(k) ? "" : "checked"}> ${esc(T("notifTopics")[k])}</label>`).join("")}`).join("")}
    <p class="hint" style="margin:0">${T("notifPrefsHint")}</p></details>`;
}
async function openSettings() { $("#settings").hidden = false; await renderSettings(); }
function closeSettings() { $("#settings").hidden = true; $("#settings").innerHTML = ""; ui.filesFor = null; ui.places = null; ui.placeEdit = false; }

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
    const { error } = await sb.from("attachments").insert({ [FILE_COL[kind]]: parentId, path, name: f.name, mime, size: f.size });
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
  const amount = parseAmount(values.total);
  if (amount) addExpense({ amount, cat: "groceries", store: values.store, note: T("items")(bought.length), trip_id: id });
  if (files.length) sent ? uploadFiles("trip", id, files) : toast("receiptLater");
}

// A copy of everything in this home, as a JSON file (the database rules limit it to this home).
async function exportData() {
  const tables = ["households", "members", "groceries", "chores", "events", "dogs", "needs", "shopping_trips", "attachments", "dog_meds", "dog_log", "dog_supplies", "papers", "home_info", "chore_log", "dog_weights", "notes", "fengshui", "expenses", "fixed_costs", "budgets", "grocery_history"];
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
  const shown = $("#aPass").type === "text", eye = $("#aShow");
  if (eye) { eye.textContent = T(shown ? "hidePw" : "showPw"); eye.setAttribute("aria-label", T(shown ? "hidePwLong" : "showPwLong")); eye.setAttribute("aria-pressed", String(shown)); }
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
  const drafts = {}; document.querySelectorAll("#view input:not([type=file]), #view select, #view textarea").forEach(el => { if (el.id) drafts[el.id] = el.type === "checkbox" ? el.checked : el.value; });
  $("#view").innerHTML = VIEWS[tab]();
  Object.entries(drafts).forEach(([id, v]) => { const el = document.getElementById(id); if (!el || id === "eDate") return; if (el.type === "checkbox") el.checked = v; else if (v !== "") el.value = v; });
  if (focusId) { const el = document.getElementById(focusId); if (el && el.closest("#view")) el.focus(); }
}
function setTab(t) {
  if (ALIAS[t]) { setSub(...ALIAS[t]); t = ALIAS[t][0]; }
  tab = VIEWS[t] ? t : "today"; pendingDelete = null; if (tab === "home") ui.stats = null; render(); window.scrollTo(0, 0);
}
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
      const fk = { events: "event", shopping_trips: "trip", expenses: "expense", papers: "paper" }[t]; if (fk) removeFilesOf(fk, i);
      if (t === "dogs") { const p = find(S.dogs, i)?.photo; if (p) sb.storage.from("files").remove([p]); }
      save({ t, kind: "delete", id: i }, "deleted"); return;
    }
    case "shop-view": ui.shopView = b.dataset.v; ui.finishing = false; try { localStorage.setItem("ht-shopView", ui.shopView); } catch (e) {} render(); return;
    case "need": {
      const x = find(S.needs, id); if (!x) return; const done = !x.done;
      save({ t: "needs", kind: "update", id, values: { done, done_by: done ? me : null } });
      if (done && !S.expenses.some(e => e.need_id === x.id)) needBought(x);
      return;
    }
    case "clear-needs": save({ t: "needs", kind: "clear", match: { done: true } }); return;
    case "finish": ui.finishing = true; render(); $("#fStore")?.focus(); return;
    case "finish-cancel": ui.finishing = false; ui.receiptFiles = null; render(); return;
    case "log": logDogs(b.dataset.kind); return;
    case "med-given": medGiven(id); return;
    case "med-add": ui.medFor = id; render(); $("#mName")?.focus(); return;
    case "chore-edit": $("#fChoreEdit")?.remove(); ui.choreEdit = id; render(); $("#ceTitle")?.focus(); return; // remove first: render() keeps typed values by id
    case "chore-cancel": ui.choreEdit = null; render(); return;
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
      // For "who did what": count it, or take it back when it is unticked.
      if (done) save({ t: "chore_log", kind: "insert", values: { id: uuid(), chore_id: id, title: choreTitle(t) } });
      else { const l = S.chore_log.find(x => x.chore_id === id && x.by_user === me); if (l) save({ t: "chore_log", kind: "delete", id: l.id }); }
      return;
    }
    case "did": {
      const c = find(S.chores, id); if (!c) return;
      save({ t: "chores", kind: "update", id, values: { last_done: today(), last_by: me }, notify: ["chore_done", choreTitle(c)] }, "markedDone");
      save({ t: "chore_log", kind: "insert", values: { id: uuid(), chore_id: id, title: choreTitle(c) } });
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
    case "often": addGrocery(b.dataset.name, "", b.dataset.cat, b.dataset.store || ""); return;
    case "shop-filter": {
      ui.shopFilter = b.dataset.v; try { localStorage.setItem("ht-shopFilter", ui.shopFilter); } catch (e) {}
      ["gStore", "fStore"].forEach(i => { const el = document.getElementById(i); if (el) el.value = ui.shopFilter; }); // render() keeps typed values
      render(); return;
    }
    case "groc-store": {
      const g = find(S.groceries, id); if (!g) return;
      const s = prompt(T("whichShop"), g.store || ""); if (s === null) return;
      save({ t: "groceries", kind: "update", id, values: { store: s.trim() } }); return;
    }
    case "clear-basket": save({ t: "groceries", kind: "clear", match: { done: true } }, "basketCleared"); return;
    case "clear-todos": save({ t: "chores", kind: "clear", match: { every: 0, done: true } }); return;
    case "export": exportData(); return;
    case "mmon": {
      ui.moneyMonth = shiftMonth(ui.moneyMonth, Number(b.dataset.n));
      const xd = $("#xDate"); if (xd) xd.value = ui.moneyMonth === today().slice(0, 7) ? today() : ui.moneyMonth + "-01"; // render() keeps typed values
      render(); return;
    }
    case "budget": setBudget(b.dataset.k); return;
    case "csv": exportCsv(b.dataset.scope); return;
    case "sc-new": newShortcutToken(); return;
    case "sc-copy": {
      try { await navigator.clipboard.writeText($("#scLink").value); toast("copied"); } catch (e) { $("#scLink").select(); }
      return;
    }
    case "mon": { const [y, m] = calMonth.split("-").map(Number); calMonth = ymd(new Date(y, m - 1 + Number(b.dataset.n), 1)).slice(0, 7); render(); return; }
    case "pick": calSel = b.dataset.d; calMonth = calSel.slice(0, 7); render(); return;
    // Forms opened in place: the old one is removed first, because render() keeps typed values by id.
    case "sup-add": $("#fSupply")?.remove(); ui.supEdit = "new"; render(); $("#suName")?.focus(); return;
    case "sup-edit": $("#fSupply")?.remove(); ui.supEdit = id; render(); $("#suName")?.focus(); return;
    case "sup-cancel": ui.supEdit = null; render(); return;
    case "sup-new": save({ t: "dog_supplies", kind: "update", id, values: { opened_on: today(), alerted_on: null } }, "newBagSaved"); return;
    case "paper-add": $("#fPaper")?.remove(); ui.paperEdit = { id: null, where: b.dataset.where }; render(); $("#paTitle")?.focus(); return;
    case "paper-edit": $("#fPaper")?.remove(); ui.paperEdit = { id }; render(); $("#paTitle")?.focus(); return;
    case "paper-cancel": ui.paperEdit = null; render(); return;
    case "med-refill": {
      const m = find(S.dog_meds, id); if (!m) return;
      const ans = prompt(T("refillPrompt")(m.name), String(m.stock ?? "")); if (ans === null) return;
      const n = parseInt(ans, 10); if (!(n >= 0)) { toast("badAmount"); return; }
      save({ t: "dog_meds", kind: "update", id, values: { stock: n, low_alerted: false } }, "saved"); return;
    }
    case "info-copy": {
      const x = find(S.home_info, id); if (!x) return;
      try { await navigator.clipboard.writeText(x.value); toast("copied"); } catch (e) { toast(x.value); }
      return;
    }
    case "hmon": ui.homeMonth = shiftMonth(ui.homeMonth, Number(b.dataset.n)); render(); return;
    case "sub": setSub(b.dataset.t, b.dataset.v); render(); window.scrollTo(0, 0); return;
    case "fixed-edit": $("#fFixedEdit")?.remove(); ui.fixedEdit = id; render(); $("#feName")?.focus(); return;
    case "fixed-cancel": ui.fixedEdit = null; render(); return;
    case "vet-cost": vetCost(id); return;
    case "note-add": $("#fNote")?.remove(); ui.noteEdit = "new"; render(); $("#noTitle")?.focus(); return;
    case "note-edit": $("#fNote")?.remove(); ui.noteEdit = id; render(); $("#noBody")?.focus(); return;
    case "note-cancel": ui.noteEdit = null; render(); return;
    case "note-tick": noteTick(id, Number(b.dataset.i)); return;
    case "fs-zone": {
      ui.fsZone = b.dataset.z; render();
      if (b.closest("svg") || b.closest(".fs-chips")) $("#fsZone")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    case "fs-done": { const x = find(S.fengshui, id); if (!x) return; save({ t: "fengshui", kind: "update", id, values: { done: !x.done, done_by: x.done ? null : me } }); return; }
    case "mgo": {
      ui.moneyMonth = b.dataset.m;
      const xd = $("#xDate"); if (xd) xd.value = ui.moneyMonth === today().slice(0, 7) ? today() : ui.moneyMonth + "-01"; // render() keeps typed values
      render(); window.scrollTo(0, 0); return;
    }
    case "close-settings": closeSettings(); return;
    case "open-settings": openSettings(); return;
    case "mantra-next": {
      const n = T("chakras")[chakraToday()].lines.length, i = Math.floor(mantraAt * n);
      mantraAt = ((i + 1 + Math.floor(Math.random() * (n - 1))) % n + 0.5) / n; render(); return;
    }
    case "wx-change": ui.placeEdit = true; ui.places = null; renderSettings(); return;
    case "wx-cancel": ui.placeEdit = false; ui.places = null; renderSettings(); return;
    case "wx-here": placeHere(); return;
    case "wx-pick": { const p = ui.places?.[Number(b.dataset.i)]; if (!p) return; savePlace({ place: p.name, lat: Math.round(p.latitude * 100) / 100, lon: Math.round(p.longitude * 100) / 100 }); return; }
    case "copy-code": {
      try { await navigator.clipboard.writeText(S.home?.invite_code || ""); toast("copied"); }
      catch (e) { const r = document.createRange(); r.selectNodeContents($("#inviteCode")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      return;
    }
    case "push-on": pushOn().catch(e => { console.error(e); toast("cantSave"); }); return;
    case "push-off": pushOff().catch(() => {}); return;
    case "push-test": notify("test", ""); toast("testSent"); return;
    case "sign-out": {
      try { localStorage.removeItem(copyKey(me)); localStorage.removeItem("ht-wx"); } catch (e) {}
      clearTimeout(keepCopy.h); await pushOff().catch(() => {}); await sb.auth.signOut(); closeSettings(); return;
    }
  }
});

document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const f = ev.target, v = id => (document.getElementById(id)?.value || "").trim();
  if (f.id === "fAuth") return submitAuth();
  if (f.id === "fPlace") return findPlace(v("plName"));
  if (f.id === "fSetup") return submitSetup();
  if (f.id === "fGroc") {
    const name = v("gName"), qty = v("gQty"); if (!name) return; ui.grocCat = v("gCat"); try { localStorage.setItem("ht-grocCat", ui.grocCat); } catch (e) {}
    const store = v("gStore") || rememberedStore(name);
    $("#gName").value = ""; $("#gQty").value = ""; $("#gStore").value = ui.shopFilter;
    addGrocery(name, qty, ui.grocCat, store); $("#gName")?.focus();
  }
  if (f.id === "fChoreEdit") saveRoutine(f);
  if (f.id === "fSupply") saveSupply(f);
  if (f.id === "fPaper") savePaper(f);
  if (f.id === "fInfo") {
    const label = v("inLabel"), value = v("inValue"); if (!label) return;
    $("#inLabel").value = ""; $("#inValue").value = "";
    save({ t: "home_info", kind: "insert", values: { id: uuid(), label, value } }, "added");
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
  if (f.id === "fExp") {
    const amount = parseAmount(v("xAmount")); if (amount === null) { toast("badAmount"); $("#xAmount").focus(); return; }
    ui.expCat = v("xCat");
    const values = { amount, cat: ui.expCat, store: v("xStore"), spent_on: v("xDate") || today(), paid_by: v("xPaid") || me, note: v("xNote"), private: $("#xPrivate").checked };
    ["xAmount", "xStore", "xNote"].forEach(i => $("#" + i).value = ""); $("#xPrivate").checked = false;
    addExpense(values);
  }
  if (f.id === "fFixed" || f.id === "fFixedEdit") saveFixed(f);
  if (f.id === "fNote") saveNote(f);
  if (f.id.startsWith("fFs-")) {
    const zone = f.dataset.zone, inp = $("#fsTask-" + zone), text = (inp?.value || "").trim(); if (!text) return;
    inp.value = "";
    save({ t: "fengshui", kind: "insert", values: { id: uuid(), zone, kind: "task", text, sort: fsItems(zone, "task").length + 1 } }, "added");
  }
  if (f.id.startsWith("fWeight-")) saveWeight(f);
  if (f.id === "fNeed") {
    const title = v("nTitle"); if (!title) return; ui.needCat = v("nCat");
    const values = { id: uuid(), title, cat: ui.needCat, price: v("nPrice"), store: v("nStore"), link: v("nLink"), notes: v("nNotes") };
    ["nTitle", "nPrice", "nStore", "nLink", "nNotes"].forEach(i => $("#" + i).value = "");
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
  if (ev.target.id === "mantraOn") {
    mantraOn = ev.target.checked; try { localStorage.setItem("ht-mantra", mantraOn ? "on" : "off"); } catch (e) {}
    render();
  }
  if (ev.target.classList.contains("nt-pref")) {
    const off = [...document.querySelectorAll(".nt-pref")].filter(x => !x.checked).map(x => x.dataset.k), m = S.members.find(x => x.user_id === me);
    const before = m?.notify_off || []; if (m) m.notify_off = off;
    run(sb.from("members").update({ notify_off: off }).eq("user_id", me), "saved").then(ok => { if (!ok && m) { m.notify_off = before; ev.target.checked = !ev.target.checked; } });
  }
  if (ev.target.id === "wxAlerts") {
    const on = ev.target.checked, m = S.members.find(x => x.user_id === me); if (m) m.rain_alerts = on;
    run(sb.from("members").update({ rain_alerts: on }).eq("user_id", me), on ? "wxAlertsOn" : "wxAlertsOff").then(ok => { if (!ok) { load("members"); ev.target.checked = !on; } });
  }
  if (ev.target.id === "dgPhoto" && ev.target.files[0]) {
    ui.dogPhoto = ev.target.files[0];
    const img = document.createElement("img"); img.className = "av photo"; img.id = "dgPrev"; img.alt = ""; img.src = URL.createObjectURL(ui.dogPhoto);
    $("#dgPrev").replaceWith(img);
  }
  if (ev.target.id === "fileAdd" && ui.filesFor) { const { kind, id } = ui.filesFor; uploadFiles(kind, id, [...ev.target.files]); ev.target.value = ""; }
});
function addGrocery(name, qty, cat, store = "") {
  save({ t: "groceries", kind: "insert", values: { id: uuid(), name, qty, cat, store }, notify: ["grocery", store ? `${name} (${store})` : name] });
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
// Show or hide the password while typing it.
$("#aShow")?.addEventListener("click", () => { const p = $("#aPass"); p.type = p.type === "password" ? "text" : "password"; applyStatic(); p.focus(); });
$("#aSwitch").addEventListener("click", () => { ui.authMode = ui.authMode === "signin" ? "signup" : "signin"; $("#aErr").hidden = true; $("#aOk").hidden = true; applyStatic(); });
async function submitAuth() {
  const email = $("#aEmail").value.trim(), password = $("#aPass").value;
  $("#aPass").type = "password"; applyStatic(); // so the iPhone offers to save it
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
  if (!session) {
    // Still signed in, but the sign-in can't be renewed without a connection: open the copy on the phone.
    const uid = storedUser(), copy = uid && readCopy(uid);
    if (copy) { if (me !== uid) { me = uid; loadQueue(); openCopy(copy); enterApp(); } return; }
    me = null; hid = null; if (channel) { sb.removeChannel(channel); channel = null; } show("authGate"); applyStatic(); return;
  }
  if (me === session.user.id) return; // already handled (sign-in fires twice on load)
  me = session.user.id; loadQueue();
  const copy = readCopy(me);
  if (copy) { openCopy(copy); enterApp(); } // show the copy on the phone straight away, then refresh
  const { data, error } = await sb.from("members").select("household_id, lang").eq("user_id", me).maybeSingle();
  if (error) {
    if (!copy) { toast("needsOnline"); window.addEventListener("online", () => { me = null; onSession(session); }, { once: true }); }
    return;
  }
  if (data) { if (data.household_id !== hid) { hid = data.household_id; await enterApp(); } }
  else { hid = null; show("setupGate"); setSetupMode("create"); }
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
