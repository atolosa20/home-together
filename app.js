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
  paw: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:-2px"><circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="5.8" r="2.2"/><circle cx="14.5" cy="5.8" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M12 11c-3 0-6.5 4.6-6.5 7.2 0 1.6 1.3 2.3 2.8 2.3 1.4 0 2.4-.8 3.7-.8s2.3.8 3.7.8c1.5 0 2.8-.7 2.8-2.3C18.5 15.6 15 11 12 11z"/></svg>'
};
const GROC_KEYS = ["veg", "bakery", "dairy", "meat", "pantry", "frozen", "drinks", "home", "dogs", "other"];
const EV_COLORS = { home: "--c-home", dogs: "--c-dogs", people: "--c-people", appt: "--c-appt", bills: "--c-bills" };
const REPEAT = [0, 1, 2, 3, 7, 14, 30, 90, 180, 365];
const repeatLabel = n => T("repeat")[n] || T("everyN")(n);
const choreTitle = c => (c.key && T("starter")[c.key]) || c.title;

// ---------- Supabase ----------
const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("YOUR-PROJECT");
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

// ---------- state ----------
const S = { groceries: [], chores: [], events: [], dogs: [], members: [], home: null };
let me = null, hid = null, channel = null, online = true;
let tab = "today", calMonth = today().slice(0, 7), calSel = today(), pendingDelete = null;
const ui = { grocCat: "other", evCat: "home", authMode: "signin", setupMode: "create" };
try { const g = localStorage.getItem("ht-grocCat"); if (GROC_KEYS.includes(g)) ui.grocCat = g; } catch (e) {}

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

// ---------- data loading ----------
const TABLES = {
  groceries: () => sb.from("groceries").select("*").order("created_at"),
  chores: () => sb.from("chores").select("*").order("created_at"),
  events: () => sb.from("events").select("*").order("date"),
  dogs: () => sb.from("dogs").select("*").order("created_at"),
  members: () => sb.from("members").select("user_id, display_name, lang")
};
async function load(name) {
  const { data, error } = await TABLES[name]();
  if (!error) { S[name] = data || []; render(); }
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
  ["groceries", "chores", "events", "dogs"].forEach(t => {
    channel.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `household_id=eq.${hid}` }, () => {
      clearTimeout(reloadSoon[t]); reloadSoon[t] = setTimeout(() => load(t), 150);
    });
  });
  channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "households", filter: `id=eq.${hid}` }, loadHome);
  channel.subscribe(status => { online = status === "SUBSCRIBED"; renderChrome(); });
}
// iPhone pauses apps in the background: refresh when it comes back.
document.addEventListener("visibilitychange", () => { if (!document.hidden && hid) { loadAll(); if (!online) subscribe(); } });

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
const upcoming = (n = 50) => S.events.filter(e => e.date >= today()).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, n);

// ---------- views ----------
function delBtn(table, id) {
  const key = table + "/" + id;
  return pendingDelete === key
    ? `<button class="icon confirm" data-act="del-yes" data-k="${esc(key)}">${T("del")}</button>`
    : `<button class="icon" data-act="del" data-k="${esc(key)}" aria-label="${T("delAria")}">${IC.trash}</button>`;
}
function routineRow(c, compact) {
  const last = c.last_done ? T("lastDone")(fmtDay(c.last_done), c.last_by ? who(c.last_by) : "") : T("notYet");
  return `<div class="row">
    <div class="main"><div class="t">${c.dog ? `<span class="paw">${IC.paw}</span> ` : ""}${esc(choreTitle(c))}</div>
      <div class="s">${esc(repeatLabel(c.every))} · ${esc(last)}</div></div>
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
      <div class="s">${esc(T("dow")[d.getDay()])}${e.time ? ` · ${esc(e.time)}` : ""} · ${esc(T("evCats")[cat])}${e.created_by ? ` · ${esc(T("addedBy")(who(e.created_by)))}` : ""}</div></div>
    ${delBtn("events", e.id)}
  </div>`;
}
function todoRow(t) {
  const sub = t.done && t.done_by ? T("doneBy")(who(t.done_by)) : t.created_by ? T("addedBy")(who(t.created_by)) : "";
  return `<div class="row ${t.done ? "done" : ""}">
    <button class="check ${t.done ? "on" : ""}" data-act="todo" data-id="${esc(t.id)}" aria-label="${t.done ? T("reopen") : T("markDone")}">${t.done ? IC.tick : ""}</button>
    <div class="main"><div class="t">${t.dog ? `<span class="paw">${IC.paw}</span> ` : ""}${esc(choreTitle(t))}</div>
      <div class="s">${esc(sub)}</div></div>
    ${delBtn("chores", t.id)}</div>`;
}

function viewToday() {
  const d = dueNow(), ev = upcoming(5), groc = S.groceries.filter(g => !g.done).length;
  const open = todos().filter(t => !t.done);
  const week = upcoming(999).filter(e => diffDays(e.date, today()) < 7).length;
  return `
  <div class="stats">
    <a class="card stat ${d.length ? "alert" : ""}" href="#chores"><b>${d.length}</b><span>${T("choresDue")}</span></a>
    <a class="card stat" href="#groceries"><b>${groc}</b><span>${T("toBuy")}</span></a>
    <a class="card stat" href="#calendar"><b>${week}</b><span>${T("thisWeek")}</span></a>
  </div>
  <section class="sec"><div class="sec-head"><h2>${T("dueNow")}</h2><a class="link" href="#chores">${T("allChores")}</a></div>
    <div class="card list">${d.length ? d.map(c => routineRow(c, true)).join("") : `<div class="empty">${T("nothingDue")} ${S.chores.length ? T("enjoy") : T("addRoutinesHint")}</div>`}</div></section>
  ${open.length ? `<section class="sec"><div class="sec-head"><h2>${T("todos")}</h2><span class="eyebrow">${esc(T("open")(open.length))}</span></div>
    <div class="card list">${open.slice(0, 4).map(todoRow).join("")}</div></section>` : ""}
  <section class="sec"><div class="sec-head"><h2>${T("comingUp")}</h2><a class="link" href="#calendar">${T("calendar")}</a></div>
    <div class="card list">${ev.length ? ev.map(eventRow).join("") : `<div class="empty">${T("noPlans")}</div>`}</div></section>`;
}

function viewGroceries() {
  const open = S.groceries.filter(g => !g.done), done = S.groceries.filter(g => g.done);
  const groups = GROC_KEYS.map(k => [k, open.filter(g => (GROC_KEYS.includes(g.cat) ? g.cat : "other") === k)]).filter(g => g[1].length);
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
  ${groups.length ? groups.map(([k, items]) => `<section class="sec"><span class="eyebrow">${esc(T("grocCats")[k])}</span><div class="card list">${items.map(row).join("")}</div></section>`).join("")
    : `<section class="sec"><div class="card"><div class="empty">${T("listEmpty")}</div></div></section>`}
  ${done.length ? `<section class="sec"><div class="sec-head"><span class="eyebrow">${esc(T("basket")(done.length))}</span><button class="btn ghost small" data-act="clear-basket">${T("clearBasket")}</button></div>
    <div class="card list">${done.map(row).join("")}</div></section>` : ""}`;
}

function viewChores() {
  const r = routines(), t = todos();
  return `
  <form class="addbar" id="fChore">
    <input type="text" id="cTitle" class="grow" placeholder="${esc(T("cPlaceholder"))}" autocomplete="off" required>
    <select id="cEvery">${REPEAT.map(n => `<option value="${n}" ${n === 7 ? "selected" : ""}>${esc(repeatLabel(n))}</option>`).join("")}</select>
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
  const byDay = {};
  S.events.forEach(e => (byDay[e.date] ||= []).push(e));
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); const s = ymd(d);
    if (i >= 35 && d.getMonth() !== m - 1) break;
    const evs = byDay[s] || [];
    cells += `<button class="day ${d.getMonth() !== m - 1 ? "out" : ""} ${s === today() ? "today" : ""} ${s === calSel ? "sel" : ""}" data-act="pick" data-d="${s}" aria-label="${esc(fmtDay(s))}${evs.length ? `, ${esc(T("plans")(evs.length))}` : ""}">
      ${d.getDate()}<span class="dots">${evs.slice(0, 3).map(e => `<i style="background:var(${EV_COLORS[e.cat] || EV_COLORS.home})"></i>`).join("")}</span></button>`;
  }
  const dayEvents = (byDay[calSel] || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
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
    <button class="btn">${T("add")}</button>
  </form>
  <section class="sec"><div class="sec-head"><h2>${esc(cap(fmtDay(calSel)))}</h2>${calSel === today() ? `<span class="eyebrow">${T("todayLbl")}</span>` : ""}</div>
    <div class="card list">${dayEvents.length ? dayEvents.map(eventRow).join("") : `<div class="empty">${T("nothingDay")}</div>`}</div></section>
  <section class="sec"><h2>${T("nextUp")}</h2>
    <div class="card list">${later.length ? later.map(eventRow).join("") : `<div class="empty">${T("nothingElse")}</div>`}</div></section>`;
}

function viewDogs() {
  const care = routines().filter(c => c.dog), dogTodos = todos().filter(t => t.dog && !t.done);
  const vet = upcoming(999).filter(e => e.cat === "dogs").slice(0, 6);
  return `
  <section class="sec"><h2>${T("pack")}</h2>
    ${S.dogs.length ? `<div class="dogs">${S.dogs.map(d => `<div class="card dog"><div class="av">${esc((d.name || "?").trim()[0]?.toUpperCase() || "?")}</div>
      <div class="main"><div style="font-weight:700">${esc(d.name)}</div><div style="font-size:.82rem;color:var(--muted)">${[d.breed, d.birthday ? T("born")(fmtDay(d.birthday)) : ""].filter(Boolean).map(esc).join(" · ")}</div>
      ${d.notes ? `<div class="hint" style="margin-top:4px">${esc(d.notes)}</div>` : ""}</div>${delBtn("dogs", d.id)}</div>`).join("")}</div>`
      : `<div class="card"><div class="empty">${T("noDogs")}</div></div>`}
    <form class="addbar" id="fDog">
      <input type="text" id="dName" placeholder="${esc(T("name"))}" required autocomplete="off">
      <input type="text" id="dBreed" placeholder="${esc(T("breed"))}">
      <input type="text" id="dNotes" class="grow" placeholder="${esc(T("dNotes"))}">
      <button class="btn">${T("addDog")}</button>
    </form></section>
  <section class="sec"><div class="sec-head"><h2>${T("care")}</h2><a class="link" href="#chores">${T("addInChores")}</a></div>
    <div class="card list">${care.length ? care.map(c => routineRow(c)).join("") : `<div class="empty">${T("noCare")}</div>`}
    ${dogTodos.map(todoRow).join("")}</div></section>
  <section class="sec"><div class="sec-head"><h2>${T("vet")}</h2><a class="link" href="#calendar">${T("addInCal")}</a></div>
    <div class="card list">${vet.length ? vet.map(eventRow).join("") : `<div class="empty">${T("noVet")}</div>`}</div></section>`;
}

const VIEWS = { today: viewToday, groceries: viewGroceries, chores: viewChores, calendar: viewCalendar, dogs: viewDogs };

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
async function renderSettings() {
  const st = await pushState();
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
    <button class="btn ghost" data-act="sign-out">${T("signOut")}</button>
    <p class="hint" style="margin:0;text-align:center">${T("version")} ${esc(running?.version || "dev")}</p>
  </div>`;
}
async function openSettings() { $("#settings").hidden = false; await renderSettings(); }
function closeSettings() { $("#settings").hidden = true; $("#settings").innerHTML = ""; }

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
  const s = $("#sync"); s.classList.toggle("on", online && navigator.onLine); s.querySelector("span").textContent = T(!navigator.onLine ? "offline" : online ? "synced" : "reconnecting");
}
function render() {
  if ($("#app").hidden) { applyStatic(); return; }
  const focusId = document.activeElement?.id;
  renderChrome();
  document.querySelectorAll("nav.tabs a").forEach(a => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const nG = S.groceries.filter(g => !g.done).length, nC = dueNow().length;
  $("#bGroc").hidden = !nG; $("#bGroc").textContent = nG;
  $("#bChores").hidden = !nC; $("#bChores").textContent = nC;
  const drafts = {}; document.querySelectorAll("#view input, #view select").forEach(el => { if (el.id) drafts[el.id] = el.type === "checkbox" ? el.checked : el.value; });
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
    case "del-yes": { const [t, i] = b.dataset.k.split("/"); pendingDelete = null; if (await run(sb.from(t).delete().eq("id", i), "deleted")) load(t); return; }
    case "groc": { const g = find(S.groceries, id); if (!g) return; g.done = !g.done; render(); run(sb.from("groceries").update({ done: g.done }).eq("id", id)); return; }
    case "todo": {
      const t = find(S.chores, id); if (!t) return; t.done = !t.done; t.done_by = t.done ? me : null; render();
      if (await run(sb.from("chores").update({ done: t.done, done_by: t.done_by }).eq("id", id)) && t.done) notify("todo_done", choreTitle(t));
      return;
    }
    case "did": {
      const c = find(S.chores, id); if (!c) return; c.last_done = today(); c.last_by = me; render();
      if (await run(sb.from("chores").update({ last_done: c.last_done, last_by: me }).eq("id", id), "markedDone")) notify("chore_done", choreTitle(c));
      return;
    }
    case "clear-basket": { if (await run(sb.from("groceries").delete().eq("household_id", hid).eq("done", true), "basketCleared")) load("groceries"); return; }
    case "clear-todos": { if (await run(sb.from("chores").delete().eq("household_id", hid).eq("every", 0).eq("done", true))) load("chores"); return; }
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
    const name = v("gName"); if (!name) return; ui.grocCat = v("gCat"); try { localStorage.setItem("ht-grocCat", ui.grocCat); } catch (e) {}
    $("#gName").value = ""; $("#gQty").value = ""; $("#gName").focus();
    if (await run(sb.from("groceries").insert({ name, qty: v("gQty"), cat: ui.grocCat }))) { load("groceries"); notify("grocery", name); }
  }
  if (f.id === "fChore") {
    const title = v("cTitle"); if (!title) return; const every = Number(v("cEvery")), dog = $("#cDog").checked;
    $("#cTitle").value = ""; $("#cDog").checked = false;
    if (await run(sb.from("chores").insert({ title, every, dog }), "added")) { load("chores"); notify(every ? "chore" : "todo", title); }
  }
  if (f.id === "fEvent") {
    const title = v("eTitle"), date = v("eDate"); if (!title || !date) return; ui.evCat = v("eCat");
    const time = v("eTime"); $("#eTitle").value = ""; $("#eTime").value = "";
    if (await run(sb.from("events").insert({ title, date, time, cat: ui.evCat }), "addedCal")) {
      calSel = date; calMonth = date.slice(0, 7); load("events"); notify("event", `${title} · ${fmtDay(date)}${time ? " " + time : ""}`);
    }
  }
  if (f.id === "fDog") {
    const name = v("dName"); if (!name) return;
    if (await run(sb.from("dogs").insert({ name, breed: v("dBreed"), notes: v("dNotes") }), "added")) { ["dName", "dBreed", "dNotes"].forEach(i => $("#" + i).value = ""); load("dogs"); }
  }
});

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
  await loadAll(); subscribe();
}

async function onSession(session) {
  if (!session) { me = null; hid = null; if (channel) { sb.removeChannel(channel); channel = null; } show("authGate"); applyStatic(); return; }
  if (me === session.user.id) return; // already handled (sign-in fires twice on load)
  me = session.user.id;
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
