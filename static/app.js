/* Meridian SPA — hash router, search, graph, study. Vanilla JS, no build. */
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const S = { articles: [], questions: [], graph: null, coverage: [], sources: [],
  byId: {}, qById: {}, progress: { mastery: {}, attempts: {}, visits: {} } };

const MASTERY = ["unfamiliar", "learning", "understood", "needs-revision"];
const MLABEL = { unfamiliar: "Not started", learning: "Learning", understood: "Understood", "needs-revision": "Needs revision" };

/* ---------- data ---------- */
async function getJSON(url) {
  // studfing static build: resolve backend URLs to precomputed files first.
  let u = url;
  try {
    if (window.staticResolve) {
      const s = await window.staticResolve(String(url));
      if (s === null) return null;
      if (typeof s === "string") u = s;
    }
  } catch (e) {}
  const r = await fetch(u);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
async function boot() {
  try {
    const [arts, qs, graph, cov, srcs, prog] = await Promise.all([
      getJSON("/api/articles"), getJSON("/api/questions"), getJSON("/api/graph"),
      getJSON("/api/coverage"), getJSON("/api/sources"), getJSON("/api/progress").catch(() => null)]);
    S.articles = arts; S.questions = qs; S.graph = graph; S.coverage = cov; S.sources = srcs;
    S.byId = Object.fromEntries(arts.map(a => [a.id, a]));
    S.qById = Object.fromEntries(qs.map(q => [q.id, q]));
    let local = null;
    try { local = JSON.parse(localStorage.getItem("meridian-progress") || "null"); }
    catch { try { localStorage.removeItem("meridian-progress"); } catch {} local = null; }
    const isObj = o => o && typeof o === "object" && !Array.isArray(o);
    const base = { mastery: {}, attempts: {}, visits: {}, activities: {}, reader: {}, notes: {}, scroll: {} };
    S.progress = Object.assign(base, isObj(prog) ? prog : {}, isObj(local) ? local : {});
    for (const k of ["mastery", "attempts", "visits", "activities", "reader", "notes", "scroll"])
      if (!isObj(S.progress[k])) S.progress[k] = {};
    $("#buildStats").textContent = `${arts.length} topics and ${qs.length} questions.`;
  } catch (e) {
    $("#view").innerHTML = `<div class="card"><h3>The course data didn't load</h3>
      <p>This site has to be opened through a web server, not as a local file. If it is, check your connection and reload.</p>
      <p><button class="btn small" onclick="location.reload()">Reload</button></p></div>`;
    throw e;
  }
  buildNav(); route();
  if (window.wireVisuals) window.wireVisuals($("#view"));
  if (window.wireMCQ) window.wireMCQ($("#view"));
  if (window.ACTUI) window.ACTUI.wire($("#view"));
  if (window.Library) window.Library.wireGlobal();
}
let saveT = null;
function saveProgress() {
  // static build: progress lives in this browser only (no server to sync to).
  try { localStorage.setItem("meridian-progress", JSON.stringify(S.progress)); } catch (e) {}
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200); }

/* ---------- linkify ---------- */
const ALIAS = { "nfr": "nfr-overview", "nfrs": "nfr-overview", "non-functional requirement": "nfr-overview",
  "fr": "functional-requirements", "frs": "functional-requirements", "aon": "activity-graphs",
  "activity-on-node": "activity-graphs", "aoa": "activity-graphs", "activity-on-arc": "activity-graphs",
  "wbs": "wbs", "work breakdown": "wbs", "wip": "kanban-wip", "wip limit": "kanban-wip", "srs": "srs-ieee830",
  "product owner": "scrum-framework", "scrum master": "scrum-framework", "burn-up": "burn-up-charts",
  "burn up": "burn-up-charts", "earned value": "burn-up-charts", "kanban": "kanban-wip",
  "planning poker": "estimation-planning-poker", "user story": "user-stories", "user stories": "user-stories",
  "use case": "use-case-headers", "use cases": "use-case-headers", "flow of events": "use-case-flow",
  "extension": "use-case-flow", "extensions": "use-case-flow", "gantt": "gantt-charts",
  "scrum": "scrum-framework", "sprint": "scrum-events-backlogs", "sprint backlog": "scrum-events-backlogs",
  "product backlog": "scrum-events-backlogs", "backlog": "scrum-events-backlogs",
  "trolley": "ethics-theories", "trolley problem": "ethics-theories", "utilitarianism": "ethics-theories",
  "deontology": "ethics-theories", "moral philosophy": "ethics-theories",
  "mttf": "reliability-requirements", "mtbf": "reliability-requirements", "pofod": "reliability-requirements",
  "rocof": "reliability-requirements", "availability": "reliability-requirements",
  "usability": "usability-requirements", "waterfall": "lifecycle-models", "spiral": "lifecycle-models",
  "prototyping": "lifecycle-models", "prototype": "lifecycle-models", "slack": "critical-path",
  "critical path": "critical-path", "code review": "code-review", "inspection": "code-review",
  "stakeholder": "stakeholders-actors", "actor": "stakeholders-actors", "primary actor": "stakeholders-actors",
  "ethics": "ethics-se-professionalism", "professionalism": "ethics-se-professionalism",
  "ieee 830": "srs-ieee830", "gephi": "srs-ieee830", "performance": "performance-requirements",
  "reliability": "reliability-requirements", "security": "other-nfrs", "interoperability": "other-nfrs",
  "localisation": "other-nfrs", "localization": "other-nfrs", "accessibility": "other-nfrs",
  "agile": "agile-processes", "lifecycle": "lifecycle-models", "estimation": "estimation-planning-poker",
  "cocomo": "estimation-planning-poker", "midterm": "midterm-study-guide",
  "equivalence partitioning": "equivalence-partitioning", "equivalence partitions": "equivalence-partitioning",
  "boundary value": "boundary-value-analysis", "boundary value analysis": "boundary-value-analysis",
  "boundary-value": "boundary-value-analysis",
  "white box": "white-box-paths", "white-box": "white-box-paths", "white box testing": "white-box-paths",
  "statement coverage": "white-box-paths", "branch coverage": "white-box-paths",
  "black box": "testing-overview", "black-box": "testing-overview",
  "test fixture": "io-exceptions-fixtures", "test fixtures": "io-exceptions-fixtures", "fixture": "io-exceptions-fixtures",
  "assertion": "test-code-assertions", "assertions": "test-code-assertions",
  "git": "version-control-git",
  "cohesion": "modularity-coupling-cohesion", "coupling": "modularity-coupling-cohesion", "modularity": "modularity-coupling-cohesion",
  "tdd": "testing-overview", "test-driven development": "testing-overview" };
function linkify(text, currentId, budget) {
  let out = esc(text);
  if (budget.n <= 0) return out;
  const phrases = Object.keys(ALIAS).sort((a, b) => b.length - a.length);
  for (const ph of phrases) {
    const id = ALIAS[ph];
    if (id === currentId || budget.used.has(id)) continue;
    const re = new RegExp(`(?<!\\w)${ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "i");
    // only match plain text: never inside a link we already made (or inside its href)
    const parts = out.split(/(<a\b[^>]*>.*?<\/a>)/i);
    const at = parts.findIndex((seg, i) => i % 2 === 0 && re.test(seg));
    if (at !== -1) {
      parts[at] = parts[at].replace(re, m => `<a href="#/article/${id}">${m}</a>`);
      out = parts.join("");
      budget.used.add(id); budget.n--;
      if (budget.n <= 0) break;
    }
  }
  return out;
}

/* ---------- shared category colors (single source of truth for both graph renderers) ---------- */
const CAT_COLORS = {
  "Project planning": "#4c7df0",
  "Requirements engineering": "#d08a1a",
  "Functional requirements": "#2fa36b",
  "Non-functional requirements": "#e0604f",
  "Agile": "#8e6be8",
  "Testing": "#1fa7a0",
  "Implementation": "#d65c91",
  "Ethics & professionalism": "#b8962a",
  "Exam strategy": "#6fa82e"
};
const CAT_FALLBACK = ["#4c7df0", "#d08a1a", "#2fa36b", "#e0604f", "#8e6be8", "#1fa7a0", "#d65c91", "#b8962a", "#6fa82e"];
function catColor(cat, idx) {
  if (cat && CAT_COLORS[cat]) return CAT_COLORS[cat];
  if (typeof idx === "number") return CAT_FALLBACK[((idx % CAT_FALLBACK.length) + CAT_FALLBACK.length) % CAT_FALLBACK.length];
  let h = 0; const s = String(cat || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAT_FALLBACK[h % CAT_FALLBACK.length];
}
window.CAT_COLORS = CAT_COLORS; window.catColor = catColor;

/* ---------- search ---------- */
const SYN = { nfr: ["non-functional"], fr: ["functional"], aon: ["activity", "node"], aoa: ["activity", "arc"],
  srs: ["specification", "ieee"], wbs: ["breakdown"], wip: ["kanban", "limit"], qa: ["testing", "quality", "assurance"],
  ep: ["equivalence", "partitioning"], bva: ["boundary", "value", "analysis"],
  tdd: ["testing", "test", "driven"], git: ["version", "control"],
  bvb: ["boundary", "value"], wb: ["white", "box"], bb: ["black", "box"] };
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}
function searchAll(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const toks = q.split(/\s+/).flatMap(t => [t, ...(SYN[t] || [])]);
  const out = [];
  for (const a of S.articles) {
    const title = a.title.toLowerCase(), sum = (a.summary || "").toLowerCase();
    let s = 0; const tt = title.split(/[^a-z0-9]+/);
    if (title.includes(q)) s += 60;
    for (const t of toks) {
      if (title.includes(t)) s += 18;
      else if (tt.some(w => lev(w, t) <= (t.length >= 6 ? 2 : 1))) s += 8;
      if (sum.includes(t)) s += 5;
      if ((a.category || "").toLowerCase().includes(t)) s += 4;
    }
    if (s > 0) out.push({ kind: "Article", id: a.id, title: a.title, sub: a.category, score: s });
  }
  for (const qu of S.questions) {
    const p = (qu.prompt || "").toLowerCase(); let s = 0;
    for (const t of toks) if (p.includes(t)) s += 10;
    if ((qu.source || "").toLowerCase().includes(q)) s += 12;
    if (s > 0) out.push({ kind: qu.origin === "past-paper" ? "Past paper" : qu.origin === "worksheet" ? "Worksheet" : "Practice",
      id: "q:" + qu.id, title: (qu.prompt || "").slice(0, 90), sub: qu.source, score: s });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 14);
}

/* ---------- palette (server search: articles, questions incl. IDs, sources, slides) ---------- */
let palIdx = 0, palItems = [], palSeq = 0, palTimer = 0;
function openPalette() { $("#palette").hidden = false; $("#paletteInput").value = "";
  renderPalette(); setTimeout(() => $("#paletteInput").focus(), 0); }
function closePalette() { $("#palette").hidden = true; $("#paletteInput").blur(); clearTimeout(palTimer); }
function renderPalette() {
  const q = $("#paletteInput").value;
  clearTimeout(palTimer);
  if (!q.trim()) { palItems = []; palIdx = 0; paintPalette("Search every topic, question, slide and source document."); return; }
  paintPalette("Searching…");
  palTimer = setTimeout(() => {
    const seq = ++palSeq;
    (window.staticSearch ? window.staticSearch(q) : getJSON("/api/search?q=" + encodeURIComponent(q))).then(d => {
      if (seq !== palSeq) return;
      palItems = d.results || []; palIdx = 0; paintPalette();
    }).catch(() => {
      if (seq !== palSeq) return;
      palItems = searchAll(q); palIdx = 0; paintPalette();
    });
  }, 160);
}
function paintPalette(msg) {
  const list = $("#paletteList");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Search results");
  list.innerHTML = palItems.map((r, i) =>
    `<li id="pal-opt-${i}" role="option" data-i="${i}" aria-selected="${i === palIdx}"><span class="k">${esc(r.kind)}</span>
     <span class="t"><b>${esc(r.title)}</b><br><small>${esc(r.sub || "")}</small></span></li>`).join("")
    || `<li><span class="t">${esc(msg || "Nothing matches. Try “critical path”, “planning poker” or a question ID like pp2022-q1-2b.")}</span></li>`;
  $$("#paletteList li[data-i]").forEach(li => li.onclick = () => goResult(palItems[+li.dataset.i]));
  const input = $("#paletteInput");
  if (palItems.length) input.setAttribute("aria-activedescendant", "pal-opt-" + palIdx);
  else input.removeAttribute("aria-activedescendant");
}
function goResult(r) {
  if (!r) return;
  closePalette();
  if (r.kind === "Slide") {
    const m = /^slide:(.+):(\d+)$/.exec(r.id || "");
    if (m && window.openSlidePage) { window.openSlidePage(m[1], +m[2]); return; }
  }
  if (r.kind === "Source") {
    const rel = (r.id || "").replace(/^src:/, "");
    if (rel && window.openSlidePage) { window.openSlidePage(rel, 1); return; }
  }
  location.hash = r.id.startsWith("q:") ? "#/questions?q=" + encodeURIComponent(r.id.slice(2)) : "#/article/" + r.id;
}

/* ---------- icons ---------- */
const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  cards: '<rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 3.5h12a2 2 0 0 1 2 2V15"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.3l1.7-1.8"/><path d="M20 20v-4.5h-4.5"/>',
  book: '<path d="M5 4h13v16H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/>',
  graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="m8.4 6.6 7.2 1M7 8.3l2.2 7.4M16.4 10l-4.8 6.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  panelr: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  fwd: '<path d="m10 6 6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
};
function icon(n) { return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ""}</svg>`; }
window.icon = icon;
$$("[data-icon]").forEach(el => { el.outerHTML = icon(el.dataset.icon); });

/* Diagrams stored in the course data use a fixed dark palette; map it onto theme variables. */
const SVG_THEME = { "#9aa0a8": "--v-mut", "#e8e6e1": "--v-ink", "#1b1e24": "--v-box", "#d9a441": "--v-amber",
  "#7db8e8": "--v-blue", "#31343c": "--v-line", "#26282e": "--v-line", "#7fb685": "--v-green",
  "#d97a6c": "--v-red", "#b39ddb": "--v-purp" };
function themeSvg(svg) {
  return String(svg || "").replace(/#[0-9a-fA-F]{6}\b/g, m => SVG_THEME[m.toLowerCase()] ? `var(${SVG_THEME[m.toLowerCase()]})` : m);
}
window.themeSvg = themeSvg;

/* ---------- nav ---------- */
const CAT_ORDER = ["Project planning", "Agile", "Requirements engineering", "Functional requirements",
  "Non-functional requirements", "Ethics & professionalism", "Implementation", "Testing", "Exam strategy"];
function categories() {
  const m = new Map();
  for (const a of S.articles) {
    if (!m.has(a.category)) m.set(a.category, []);
    m.get(a.category).push(a);
  }
  const rank = c => { const i = CAT_ORDER.indexOf(c); return i === -1 ? CAT_ORDER.length - 1.5 : i; };
  return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}
function courseOrder() { return categories().flatMap(([, arts]) => arts); }
function tally(arts) {
  const t = { unfamiliar: 0, learning: 0, understood: 0, "needs-revision": 0 };
  arts.forEach(a => { t[masteryOf(a.id)]++; });
  return t;
}
function mbar(arts) {
  const t = tally(arts);
  return `<span class="mbar" role="img" aria-label="${t.understood} of ${arts.length} understood">` +
    ["understood", "learning", "needs-revision"].map(k => t[k] ? `<i class="s-${k}" style="flex:${t[k]}"></i>` : "").join("") +
    (t.unfamiliar ? `<i style="flex:${t.unfamiliar}"></i>` : "") + `</span>`;
}
let navCur = "";
function navOpenSet() {
  try { return new Set(JSON.parse(localStorage.getItem("meridian-navopen") || "[]")); } catch { return new Set(); }
}
function saveNavOpen() {
  try { localStorage.setItem("meridian-navopen", JSON.stringify($$("#sideNav details[open]").map(d => d.dataset.cat))); } catch {}
}
function buildNav() {
  const open = navOpenSet();
  const cur = S.byId[navCur];
  if (cur) open.add(cur.category);
  $("#sideNav").innerHTML = categories().map(([c, arts]) => {
    const t = tally(arts);
    return `<details data-cat="${esc(c)}"${open.has(c) ? " open" : ""}><summary><span class="cname">${esc(c)}</span><span class="n" title="${t.understood} of ${arts.length} understood">${t.understood}/${arts.length}</span></summary><ul>` +
      arts.map(a => `<li><a data-nav="${a.id}" href="#/article/${a.id}"${a.id === navCur ? ' class="active" aria-current="page"' : ""}><i class="mdot m-${masteryOf(a.id)}" title="${MLABEL[masteryOf(a.id)]}"></i><span>${esc(a.title)}</span></a></li>`).join("") +
      `</ul></details>`; }).join("");
  $$("#sideNav details").forEach(d => d.addEventListener("toggle", saveNavOpen));
  const all = tally(S.articles);
  $("#navProgress").textContent = `${all.understood} of ${S.articles.length} understood`;
  const rev = reviewList();
  $("#reviewCount").textContent = rev.length ? String(rev.length) : "";
}
function markNav(id) {
  navCur = id || "";
  $$("#sideNav a").forEach(a => {
    const on = a.dataset.nav === navCur;
    a.classList.toggle("active", on);
    if (on) { a.setAttribute("aria-current", "page"); const d = a.closest("details"); if (d) d.open = true;
      a.scrollIntoView({ block: "nearest" }); }
    else a.removeAttribute("aria-current");
  });
}

/* ---------- progress ---------- */
function masteryOf(aid) { return S.progress.mastery[aid] || "unfamiliar"; }
function setMastery(aid, m) {
  S.progress.mastery[aid] = m; saveProgress(); buildNav();
  toast(`“${S.byId[aid]?.title}” marked ${MLABEL[m].toLowerCase()}`);
}
/* ---------- reading position (remembered per article) ----------
   Stored as "nearest heading + pixel offset" rather than a raw scroll value, so it still
   lands in the right place if the window width (and so the page height) has changed. */
let readingId = null;
const instant = y => window.scrollTo({ top: y, left: 0, behavior: "instant" });
function saveReadPos() {
  const id = readingId;
  if (!id) return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  S.progress.scroll = S.progress.scroll || {};
  if (y < 160) { if (S.progress.scroll[id]) { delete S.progress.scroll[id]; saveProgress(); } return; }
  let sec = null, off = y;
  for (const h of $$(".article h2[id]")) {
    const top = h.getBoundingClientRect().top + y;
    if (top <= y + 1) { sec = h.id; off = y - top; } else break;
  }
  S.progress.scroll[id] = { sec, off: Math.round(off), y: Math.round(y), ts: Date.now() };
  saveProgress();
}
let readSaveT = 0;
function saveReadPosSoon() { clearTimeout(readSaveT); readSaveT = setTimeout(saveReadPos, 250); }
function restoreReadPos(id) {
  const r = (S.progress.scroll || {})[id];
  if (!r) return false;
  const place = () => {
    const h = r.sec && document.getElementById(r.sec);
    const y = h ? h.getBoundingClientRect().top + window.scrollY + r.off : r.y;
    instant(Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight)));
  };
  place();
  // images and diagrams can still be settling; re-apply once if the reader hasn't moved yet
  const at = window.scrollY;
  setTimeout(() => { if (readingId === id && Math.abs(window.scrollY - at) < 4) place(); }, 350);
  return true;
}
window.addEventListener("pagehide", saveReadPos);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveReadPos(); });
function recordVisit(aid) {
  S.progress.visits[aid] = (S.progress.visits[aid] || 0) + 1;
  S.progress.last = { id: aid, ts: Date.now() };
  saveProgress();
}
function missedOf(a) { return (a.qids || []).filter(qid => S.progress.attempts[qid]?.status === "missed"); }
/* Review = things you flagged or got wrong. Topics you have not opened yet are not "due". */
function reviewList() {
  const rank = a => masteryOf(a.id) === "needs-revision" ? 0 : 1;
  return S.articles.filter(a => masteryOf(a.id) === "needs-revision" || missedOf(a).length > 0)
    .sort((a, b) => rank(a) - rank(b) || missedOf(b).length - missedOf(a).length).map(a => a.id);
}
function nextUp() {
  const order = courseOrder();
  const todo = a => masteryOf(a.id) !== "understood";
  const last = S.progress.last && S.byId[S.progress.last.id];
  if (last && todo(last)) return { a: last, mode: "continue" };
  let pool = order;
  if (last) { const i = order.findIndex(a => a.id === last.id); pool = [...order.slice(i + 1), ...order.slice(0, i)]; }
  const a = pool.find(todo);
  if (!a) return { a: null, mode: "done" };
  const started = Object.keys(S.progress.visits).length > 0 || Object.keys(S.progress.mastery).length > 0;
  return { a, mode: started ? "next" : "start" };
}

/* ---------- shared renderers ---------- */
function masteryBtns(aid) {
  const cur = masteryOf(aid);
  return `<div class="mastery" role="group" aria-label="How well you know this topic">` +
    MASTERY.map(m => `<button class="mbtn" data-m="${m}" data-a="${aid}" aria-pressed="${cur === m}">${MLABEL[m]}</button>`).join("") + `</div>`;
}
const ORIGIN = { "past-paper": "Past paper", worksheet: "Worksheet", generated: "Practice" };
const ATT = { got: "Got it", partial: "Partly", missed: "Missed" };
function attChip(att) { return att && ATT[att.status] ? `<span class="chip st-${att.status}" title="Your last attempt">${ATT[att.status]}</span>` : ""; }
function questionCard(q, opts = {}) {
  const att = S.progress.attempts[q.id];
  const mcq = !!q.choices;
  const arts = (q.articles || []).map(id => `<a href="#/article/${id}">${esc(S.byId[id]?.title || id)}</a>`).join(", ");
  const mark = k => `<button class="btn small ghost" data-act="${k}" aria-pressed="${att?.status === k}">${ATT[k]}</button>`;
  return `<article class="qcard" id="qc-${q.id}" data-q="${q.id}">
    <header><span class="chip o-${esc(q.origin)}">${esc(ORIGIN[q.origin] || q.origin)}</span>
      ${q.marks ? `<span class="qmarks">${esc(q.marks)} mark${+q.marks === 1 ? "" : "s"}</span>` : ""}
      <span class="src">${esc(q.source || "")}</span>
      <span class="qstatus">${attChip(att)}</span></header>
    <p class="prompt">${esc(q.prompt)}</p>
    ${q.detail ? `<p class="detail">${esc(q.detail)}</p>` : ""}
    ${mcq ? (window.mcqHTML ? window.mcqHTML(q) : "") : `<textarea placeholder="Write your answer first, then check it" aria-label="Your answer"></textarea>`}
    <footer>
      ${mcq ? "" : `<button class="btn small" data-act="reveal" aria-expanded="false">Show answer</button>`}
      ${opts.similar ? `<button class="btn small ghost" data-act="similar">Try a similar question</button>` : ""}
      <span class="qid" title="Question ID. You can search for it.">${esc(q.id)}</span>
    </footer>
    <div class="model" hidden>
      <p>${esc(q.answer?.text || "")}</p>
      ${(q.answer?.rubric || []).length ? `<ul class="rubric">${q.answer.rubric.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${q.answer?.official ? "" : `<p class="rel">This model answer was worked independently. Check it against your lecture notes.</p>`}
      ${arts ? `<p class="rel">Revise: ${arts}</p>` : ""}
      <div class="selfmark" role="group" aria-label="Mark your own answer"><span>How did you do?</span>${mark("got")}${mark("partial")}${mark("missed")}</div>
    </div></article>`;
}
function wireQuestions(root) {
  if (root._wired) return;
  root._wired = true;
  root.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]"); const mbtn = e.target.closest("button.mbtn");
    if (mbtn) {
      setMastery(mbtn.dataset.a, mbtn.dataset.m);
      $$(`button.mbtn[data-a="${mbtn.dataset.a}"]`, root).forEach(b => b.setAttribute("aria-pressed", b.dataset.m === mbtn.dataset.m));
      if (location.hash === "#/review") renderReview();
      return;
    }
    if (!btn) return;
    const card = btn.closest(".qcard"); const qid = card?.dataset.q; if (!qid) return;
    const q = S.qById[qid];
    if (btn.dataset.act === "reveal") {
      const m = $(".model", card); m.hidden = !m.hidden;
      btn.textContent = m.hidden ? "Show answer" : "Hide answer";
      btn.setAttribute("aria-expanded", String(!m.hidden));
    } else if (btn.dataset.act === "similar") {
      const pool = S.questions.filter(x => x.id !== qid && (x.articles || []).some(a => (q.articles || []).includes(a)));
      if (pool.length) { const pick = pool[Math.floor(Math.random() * pool.length)];
        location.hash = "#/questions?q=" + encodeURIComponent(pick.id); }
      else toast("No similar question yet.");
    } else {
      const st = btn.dataset.act;
      S.progress.attempts[qid] = { status: st, ts: Date.now() }; saveProgress(); buildNav();
      $$(".selfmark button", card).forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      const qs = $(".qstatus", card); if (qs) qs.innerHTML = attChip({ status: st });
      toast(st === "missed" ? "Marked missed. It's in your review list." : `Marked “${ATT[st].toLowerCase()}”`);
    }
  });
}

/* ---------- views ---------- */
function crumbs(a) {
  return `<p class="crumbs"><a href="#/">Home</a> / ${esc(a.category)}</p>`;
}
function secBody(s, id, budget) {
  const paras = (s.paras || []).map(p => `<p>${linkify(p, id, budget)}</p>`).join("");
  const bullets = (s.bullets || []).length ? `<ul>${s.bullets.map(b => `<li>${linkify(b, id, budget)}</li>`).join("")}</ul>` : "";
  const table = s.table ? `<table><thead><tr>${s.table.head.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
  const code = s.code ? `<pre><code>${esc(s.code.text)}</code></pre>` : "";
  const svg = s.svg ? `<figure class="diagram">${themeSvg(s.svg)}<figcaption>${esc(s.heading_2 || "Diagram")}</figcaption></figure>` : "";
  const kind = s.callout ? (s.callout.kind || "exam") : "";
  const klabel = { exam: "Exam tip", warning: "Watch out" }[kind] || kind.replace("-", " ");
  const call = s.callout ? `<aside class="callout ${kind}"><span class="k">${esc(klabel)}</span>${esc(s.callout.text)}</aside>` : "";
  return paras + bullets + table + code + svg + call;
}
async function renderArticle(id) {
  let full;
  try { full = await getJSON("/api/article/" + id); }
  catch {
    $("#view").innerHTML = `<p class="crumbs"><a href="#/">Home</a></p><h1 class="atitle">That topic isn't here</h1>
      <p class="summary">There is no article called “${esc(id)}”. Search for it, or go back to the course map.</p>
      <p><a class="btn" href="#/">Back to home</a></p>`;
    $("#rightRail").innerHTML = ""; markNav(""); return;
  }
  recordVisit(id);
  const budget = { n: 6, used: new Set() };
  const secHTML = (full.sections || []).map((s, i) =>
    `<h2 id="sec-${i}">${esc(s.heading_2 && s.svg ? s.heading_2 : s.heading)}</h2>` + secBody(s, id, budget));
  // interleave visuals and activities close to the prose they explain
  const visuals = full.visuals || [];
  if (window.VIS && visuals.length && secHTML.length > 0) visuals.forEach((v, k) => {
    secHTML[k % secHTML.length] += window.VIS.render(v, id);
  });
  if (window.ACTUI && full.activities && secHTML.length > 0) full.activities.forEach((a, k) => {
    secHTML[(k + 1) % secHTML.length] += window.ACTUI.render(a);
  });
  const recall = (full.recall || []).map(r =>
    `<details class="recall"><summary>${esc(r.q)}</summary><p class="answer">${esc(r.a)}</p></details>`).join("");
  const qlist = (full.question_ids || []).map(qid => S.qById[qid]).filter(Boolean);
  const ncite = (full.citations || []).length;
  const cites = (full.citations || []).map((c, i) =>
    `<li id="cite-${i + 1}">${esc(c.source)} <span class="loc">${esc(c.locator || "")}</span><span class="kind">${esc(c.kind || "course")}</span>
     <button class="btn small ghost" data-preview data-src="${esc(c.source)}" data-loc="${esc(c.locator || "")}" data-ex="${esc(c.excerpt || "")}">View slide</button>
     ${c.excerpt ? `<blockquote>“${esc(c.excerpt)}”</blockquote>` : ""}</li>`).join("");
  const tocItems = (full.sections || []).map((s, i) => `<li><a href="#sec-${i}">${esc(s.heading_2 && s.svg ? s.heading_2 : s.heading)}</a></li>`).join("") +
    (recall ? `<li><a href="#sec-recall">Check yourself</a></li>` : "") +
    (qlist.length ? `<li><a href="#sec-practice">Practice questions</a></li>` : "") +
    (cites ? `<li><a href="#sec-sources">Sources</a></li>` : "");
  const order = courseOrder(), at = order.findIndex(a => a.id === id);
  const prev = at > 0 ? order[at - 1] : null, next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const pnLabel = (o, word) => o.category === full.category ? `${word} in ${esc(full.category)}` : `${word}: ${esc(o.category)}`;
  $("#view").innerHTML = `${crumbs(full)}
    <h1 class="atitle">${esc(full.title)}</h1>
    <p class="summary">${esc(full.summary || "")}</p>
    <div class="meta"><span class="mi">${icon("clock")}${full.read_minutes || 5} min read</span>
      ${qlist.length ? `<a class="mi" href="#sec-practice">${qlist.length} practice question${qlist.length === 1 ? "" : "s"}</a>` : ""}
      ${ncite ? `<a class="mi" href="#sec-sources">${ncite} source${ncite === 1 ? "" : "s"}</a>` : ""}</div>
    <div class="masterybox"><span>How well do you know this?</span>${masteryBtns(id)}</div>
    ${tocItems ? `<details class="toc-mobile"><summary>On this page</summary><ol class="toc">${tocItems}</ol></details>` : ""}
    <div class="article">${secHTML.join("")}
      ${recall ? `<h2 id="sec-recall">Check yourself</h2>${recall}` : ""}
      ${qlist.length ? `<h2 id="sec-practice">Practice questions</h2>${qlist.map(q => questionCard(q, { similar: true })).join("")}` : ""}
      ${cites ? `<h2 id="sec-sources">Sources</h2><ol class="sources">${cites}</ol>` : ""}
    </div>
    <section class="finish"><h2>Finished reading? Mark how well you know it.</h2>${masteryBtns(id)}
      <div class="pn">${prev ? `<a class="prev" href="#/article/${prev.id}"><span>${pnLabel(prev, "Previous")}</span><b>${esc(prev.title)}</b></a>` : ""}
      ${next ? `<a class="next" href="#/article/${next.id}"><span>${pnLabel(next, "Next")}</span><b>${esc(next.title)}</b></a>` : ""}</div></section>`;
  const prereq = full.prerequisites || [];
  const related = (full.related || []).filter((v, i, a) => a.indexOf(v) === i && !prereq.includes(v));
  const backl = (full.backlinks || []).filter(v => !prereq.includes(v) && !related.includes(v));
  const rel = a => `<li><a href="#/article/${a}">${esc(S.byId[a]?.title || a)}</a></li>`;
  const srcCount = {};
  (full.citations || []).forEach(c => { if (c.source) srcCount[c.source] = (srcCount[c.source] || 0) + 1; });
  const srcByRel = Object.fromEntries((S.sources || []).map(s => [s.rel, s]));
  const topSrc = Object.entries(srcCount).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([r]) => srcByRel[r]).filter(s => s && s.pages);
  const srcName = s => (s.file || "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\(\d+\)/g, "").trim();
  $("#rightRail").innerHTML = `<div class="ctx">
    <h3>On this page</h3><ol class="toc" id="railToc">${tocItems}</ol>
    ${prereq.length ? `<h3>Read these first</h3><ul class="links">${prereq.map(rel).join("")}</ul>` : ""}
    ${related.length ? `<h3>Related topics</h3><ul class="links">${related.map(rel).join("")}</ul>` : ""}
    ${backl.length ? `<h3>Mentioned in</h3><ul class="links">${backl.slice(0, 6).map(rel).join("")}</ul>` : ""}
    ${topSrc.length ? `<h3>Original slides</h3><ul class="links">${topSrc.map(s => `<li><a href="#/read/${s.id}">${esc(srcName(s))}</a></li>`).join("")}</ul>` : ""}</div>`;
  wireQuestions($("#view"));
  if (window.VIS?.after) window.VIS.after($("#view"));
  markNav(id);
  // reading progress + table-of-contents highlight
  const heads = $$(".article h2[id]");
  const onScroll = () => {
    const el = document.documentElement;
    const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    $("#readProgress span").style.width = (p * 100).toFixed(1) + "%";
    let cur = heads[0];
    for (const h of heads) { if (h.getBoundingClientRect().top < 140) cur = h; else break; }
    $$("#railToc a").forEach(a => a.classList.toggle("on", !!cur && a.getAttribute("href") === "#" + cur.id));
  };
  readingId = id;
  const resumed = restoreReadPos(id);
  document.onscroll = () => { onScroll(); if (readingId === id) saveReadPosSoon(); };
  onScroll();
  if (resumed) toast("Back where you left off");
}

function renderHome() {
  document.onscroll = null;
  const order = courseOrder(), cats = categories(), all = tally(order), nu = nextUp();
  const kicker = { continue: "Continue where you left off", next: "Next up", start: "Start here", done: "" }[nu.mode];
  const hero = nu.a
    ? `<p class="desk-kicker">${kicker} in ${esc(nu.a.category)}</p>
       <h1><a href="#/article/${nu.a.id}"><span class="hl">${esc(nu.a.title)}</span></a></h1>
       <p class="desk-sum">${esc(nu.a.summary || "")}</p>
       <div class="cta"><a class="btn" href="#/article/${nu.a.id}">${nu.mode === "continue" ? "Continue reading" : "Start reading"}</a>
         <a class="btn ghost" href="#/study">Start a study session</a>
         <span class="meta-inline">${nu.a.read_minutes || 5} min read</span></div>`
    : `<p class="desk-kicker">Every topic is marked understood</p>
       <h1><span class="hl">Now prove it under exam conditions.</span></h1>
       <p class="desk-sum">Work through the past-paper questions without notes, then mark anything shaky as “needs revision”.</p>
       <div class="cta"><a class="btn" href="#/questions?origin=past-paper">Open past-paper questions</a>
         <a class="btn ghost" href="#/study">Start a study session</a></div>`;
  const short = c => ({ "Non-functional requirements": "Non-functional reqs", "Functional requirements": "Functional reqs",
    "Requirements engineering": "Requirements", "Ethics & professionalism": "Ethics" }[c] || c);
  const strip = cats.map(([c, arts]) => `<div class="cm-g"><span class="cm-l">${esc(short(c))}</span><div class="cm-cells">${
    arts.map(a => { const m = masteryOf(a.id);
      return `<a class="cm-c m-${m}${nu.a && nu.a.id === a.id ? " cur" : ""}" href="#/article/${a.id}" title="${esc(a.title)} (${MLABEL[m].toLowerCase()})" aria-label="${esc(a.title)}, ${MLABEL[m].toLowerCase()}"></a>`; }).join("")
  }</div></div>`).join("");
  const leg = (k, n, label) => `<span><i class="mdot m-${k}"></i>${n} ${label}</span>`;
  const rows = cats.map(([c, arts]) => {
    const t = tally(arts), nx = arts.find(a => masteryOf(a.id) !== "understood");
    return `<a class="trow" href="#/article/${(nx || arts[0]).id}">
      <span class="trow-t">${esc(c)}</span>${mbar(arts)}<span class="trow-n">${t.understood}/${arts.length}</span>
      <span class="trow-next">${nx ? `Next: ${esc(nx.title)}` : "All understood"}</span></a>`; }).join("");
  const rev = reviewList().slice(0, 4).map(id => { const a = S.byId[id], ms = missedOf(a).length;
    return `<li><a href="#/article/${id}"><b>${esc(a.title)}</b><span>${masteryOf(id) === "needs-revision" ? "Marked needs revision" : ""}${
      masteryOf(id) === "needs-revision" && ms ? " · " : ""}${ms ? `${ms} missed question${ms === 1 ? "" : "s"}` : ""}</span></a></li>`; }).join("");
  const nPast = S.questions.filter(q => q.origin === "past-paper").length;
  const has = id => !!S.byId[id];
  const paths = [["wbs", "Calculations", "Work breakdown, activity graphs, critical path, burn-up charts"],
    ["user-stories", "Requirements writing", "User stories, use cases, flows of events, valid NFRs"],
    ["scrum-framework", "Judgement questions", "Scrum, Kanban and professional ethics"]].filter(p => has(p[0]));
  $("#view").innerHTML = `
    <section class="desk">${hero}
      <div class="cmap"><div class="cmap-head"><b>${all.understood} of ${order.length} topics understood</b>
        <div class="cmap-legend">${leg("understood", all.understood, "understood")}${leg("learning", all.learning, "learning")}${leg("needs-revision", all["needs-revision"], "to revise")}${leg("unfamiliar", all.unfamiliar, "not started")}</div></div>
        <div class="cm">${strip}</div></div>
    </section>
    <div class="homegrid">
      <div>
        <h2>Topics</h2>
        <div class="trows">${rows}</div>
        <div id="homeLib"></div>
      </div>
      <div>
        <div class="side-block"><div class="h2row"><h2>Due for review</h2>${rev ? `<a href="#/review">See all</a>` : ""}</div>
          ${rev ? `<ul class="slist">${rev}</ul>` : `<p class="empty">Nothing is due. Topics you mark “needs revision” and questions you miss will show up here.</p>`}</div>
        <div class="side-block"><h2>Past papers</h2>
          <ul class="slist"><li><a href="#/questions?origin=past-paper"><b>${nPast} past-paper questions</b><span>Original wording and marks, with model answers</span></a></li>
          ${has("midterm-study-guide") ? `<li><a href="#/article/midterm-study-guide"><b>Midterm study guide</b><span>2022 paper: 90 minutes, 100 marks, closed book</span></a></li>` : ""}</ul></div>
        ${paths.length ? `<div class="side-block"><h2>Where the marks are</h2>
          <ul class="slist">${paths.map(p => `<li><a href="#/article/${p[0]}"><b>${p[1]}</b><span>${p[2]}</span></a></li>`).join("")}</ul></div>` : ""}
        <div class="side-block"><h2>A mistake that costs marks</h2>
          <div class="note"><p id="misText">Loading…</p><button class="linklike" id="misBtn">Show another</button></div></div>
      </div>
    </div>`;
  $("#rightRail").innerHTML = "";
  markNav("");
  if (window.Library && window.Library.homeSection) {
    window.Library.homeSection().then(html => { const el = $("#homeLib"); if (el) el.innerHTML = html; }).catch(() => {});
  }
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const MIS = S.articles.filter(a => a.id.startsWith("exam-mistakes-")).map(a => a.id);
  const showMis = async () => {
    const el = $("#misText"); if (!el) return;
    if (!MIS.length) { el.closest(".side-block").hidden = true; return; }
    const id = rnd(MIS);
    try {
      const full = await getJSON("/api/article/" + id);
      const tip = rnd(full.sections.flatMap(s => s.bullets || []));
      const t = $("#misText"); if (!t) return;
      t.innerHTML = `${esc(tip || "")} <a href="#/article/${id}">${esc(S.byId[id].title)}</a>`;
    } catch { const t = $("#misText"); if (t) t.textContent = "Couldn't load a tip. Try again."; }
  };
  $("#misBtn").onclick = showMis; showMis();
}

function renderQuestions(focusQ, origin0) {
  document.onscroll = null;
  const cats = categories().map(c => c[0]);
  const st = { origin: origin0 || "" };
  const count = o => S.questions.filter(q => !o || q.origin === o).length;
  $("#view").innerHTML = `<p class="crumbs"><a href="#/">Home</a></p>
    <h1 class="atitle">Question bank</h1>
    <p class="summary">Write your answer before you look. Then check the model answer and mark yourself honestly: anything you miss goes to your review list.</p>
    <div class="segs" role="group" aria-label="Question source">
      ${[["", "All"], ["past-paper", "Past papers"], ["worksheet", "Worksheets"], ["generated", "Practice"]].map(([o, l]) =>
        `<button data-o="${o}" aria-pressed="${st.origin === o}">${l}<span>${count(o)}</span></button>`).join("")}</div>
    <div class="filters">
      <input id="fq" type="search" placeholder="Filter by word or question ID" value="${esc(focusQ || "")}" aria-label="Filter questions">
      <select id="fcat" aria-label="Topic"><option value="">All topics</option>
        ${cats.map(c => `<option>${esc(c)}</option>`).join("")}</select>
      <select id="fstat" aria-label="Your progress"><option value="">Any progress</option>
        <option value="todo">Not attempted</option><option value="missed">Missed</option>
        <option value="partial">Partly</option><option value="got">Got it</option></select>
    </div><p class="qcount" id="qcount"></p><div id="qlist"></div>`;
  $("#rightRail").innerHTML = "";
  const draw = () => {
    const q = ($("#fq").value || "").toLowerCase(), o = st.origin, c = $("#fcat").value, s = $("#fstat").value;
    const list = S.questions.filter(x => (!o || x.origin === o) &&
      (!q || ((x.id || "") + " " + (x.prompt || "") + " " + (x.source || "") + " " + (x.detail || "")).toLowerCase().includes(q)) &&
      (!c || (x.articles || []).some(a => S.byId[a]?.category === c)) &&
      (!s || (s === "todo" ? !S.progress.attempts[x.id] : S.progress.attempts[x.id]?.status === s)));
    $("#qcount").textContent = list.length === S.questions.length ? `${list.length} questions` : `Showing ${list.length} of ${S.questions.length} questions`;
    $("#qlist").innerHTML = list.length ? list.map(x => questionCard(x, { similar: true })).join("") :
      `<div class="card"><h3>No questions match these filters</h3>
       <p>Try a topic word or a question ID such as pp2022-q1-2b.</p>
       <p><button class="btn small ghost" id="qclear">Clear filters</button></p></div>`;
    const qc = $("#qclear");
    if (qc) qc.onclick = () => { $("#fq").value = ""; $("#fcat").value = ""; $("#fstat").value = ""; st.origin = ""; paintSegs(); draw(); };
    if (focusQ) { const el = document.getElementById("qc-" + focusQ); focusQ = ""; el?.scrollIntoView({ block: "center" }); }
  };
  const paintSegs = () => $$(".segs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.o === st.origin)));
  $$(".segs button").forEach(b => b.onclick = () => { st.origin = b.dataset.o; paintSegs(); draw(); });
  ["fq", "fcat", "fstat"].forEach(id => $("#" + id).addEventListener("input", draw));
  draw(); wireQuestions($("#view")); markNav("");
}

function renderGraph(focus) {
  document.onscroll = null;
  const cats = [...new Set(S.articles.map(a => a.category))];
  const col = (cat, i) => catColor(cat, i);
  const N = S.articles.length, cx = 400, cy = 300, R = 230;
  const pos = {};
  S.articles.forEach((a, i) => {
    const ci = cats.indexOf(a.category);
    const ang = (i / N) * Math.PI * 2 + ci * 0.15;
    pos[a.id] = [cx + R * Math.cos(ang), cy + R * Math.sin(ang) * 0.72];
  });
  const edges = (S.graph.edges || []).map(e => {
    const [x1, y1] = pos[e.from] || [cx, cy], [x2, y2] = pos[e.to] || [cx, cy];
    return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="var(--v-line)"/>`; }).join("");
  const shortTitle = t => { t = String(t || ""); return t.length > 22 ? t.slice(0, 21) + "…" : t; };
  const nodes = S.articles.map(a => {
    const [x, y] = pos[a.id]; const ci = cats.indexOf(a.category);
    return `<g class="gnode ${focus === a.id ? "focus" : ""}" data-id="${a.id}" transform="translate(${x.toFixed(0)},${y.toFixed(0)})"><title>${esc(a.title || a.id)}</title>
      <circle r="${focus === a.id ? 12 : 8}" style="stroke:${col(a.category, ci)}"/><text y="24" text-anchor="middle">${esc(shortTitle(a.title))}</text></g>`; }).join("");
  const legend = cats.map((c, i) => `<span><i class="cdot" style="background:${col(c, i)}"></i>${esc(c)}</span>`).join("");
  $("#view").innerHTML = `<p class="crumbs"><a href="#/">Home</a></p>
    <h1 class="atitle">Concept map</h1>
    <p class="summary">${S.articles.length} topics and how they connect. Select one to read it.</p>
    <div class="graphwrap"><svg viewBox="0 0 800 600" role="img" aria-label="Concept relationship graph">${edges}${nodes}</svg></div>
    <p class="rel legend legend-row">${legend}</p>`;
  $("#rightRail").innerHTML = `<div class="ctx"><h3>Reading the map</h3>
    <p class="rel">Colour shows the unit. Lines join related topics and prerequisites.</p></div>`;
  $$(".gnode").forEach(g => g.onclick = () => location.hash = "#/article/" + g.dataset.id);
  markNav("");
}

function renderReview() {
  document.onscroll = null;
  const ids = reviewList();
  $("#view").innerHTML = `<p class="crumbs"><a href="#/">Home</a></p>
    <h1 class="atitle">Review</h1>
    <p class="summary">${ids.length
      ? `${ids.length} topic${ids.length === 1 ? "" : "s"} to go back over: the ones you flagged, and the ones where you missed a question.`
      : "Nothing is due. Topics you mark “needs revision” and questions you miss will show up here."}</p>
    ${ids.length ? "" : `<p><a class="btn" href="#/study">Start a study session</a> <a class="btn ghost" href="#/questions">Open the question bank</a></p>`}
    ${ids.map(id => { const a = S.byId[id];
      if (!a) return "";
      const ms = missedOf(a).length, flagged = masteryOf(id) === "needs-revision";
      return `<div class="rrow"><div><h3><a href="#/article/${id}">${esc(a.title)}</a></h3>
        <p><span class="why">${flagged ? "Needs revision" : ""}${flagged && ms ? " · " : ""}${ms ? `${ms} missed question${ms === 1 ? "" : "s"}` : ""}</span> · ${esc(a.category)}</p></div>
        <div>${masteryBtns(id)}</div></div>`; }).join("")}`;
  $("#rightRail").innerHTML = "";
  wireQuestions($("#view")); markNav("");
}

/* ---------- study session ---------- */
let deck = [], di = 0, sess = null;
function buildDeck() {
  deck = [];
  for (const a of S.articles) {
    if (masteryOf(a.id) === "understood") continue;
    deck.push({ t: "recall", aid: a.id });
    for (const qid of (a.qids || []))
      if (S.qById[qid] && S.progress.attempts[qid]?.status !== "got") deck.push({ t: "q", qid });
  }
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  deck = deck.slice(0, 12); di = 0; sess = { start: Date.now(), got: 0, missed: 0 };
}
async function renderStudy() {
  document.onscroll = null;
  $("#rightRail").innerHTML = ""; markNav("");
  if (!sess) buildDeck();
  const view = $("#view");
  const restart = () => { buildDeck(); renderStudy(); };
  if (!deck.length) {
    sess = null;
    view.innerHTML = `<div class="scard sdone"><h1>Nothing left to drill</h1>
      <p class="rel">Every topic is marked understood and every question is answered. Test yourself on past papers instead.</p>
      <p><a class="btn" href="#/questions?origin=past-paper">Open past-paper questions</a></p></div>`;
    return;
  }
  if (di >= deck.length) {
    const s = sess; sess = null;
    view.innerHTML = `<div class="scard sdone"><h1>Session done</h1>
      <p class="rel">${deck.length} cards. Anything you missed is in your review list.</p>
      <div class="tallyrow"><span><b>${s.got}</b>got it</span><span><b>${s.missed}</b>missed</span><span><b>${deck.length - s.got - s.missed}</b>skipped</span></div>
      <p><button class="btn" id="again">Start another session</button> <a class="btn ghost" href="#/review">Go to review</a></p></div>`;
    $("#again").onclick = restart;
    return;
  }
  const card = deck[di];
  const head = `<div class="sbar"><span>Card ${di + 1} of ${deck.length}</span>
    <span class="pbar"><i style="width:${Math.round(100 * di / deck.length)}%"></i></span><a href="#/">End session</a></div>`;
  const next = () => { di++; renderStudy(); instant(0); };
  if (card.t === "recall") {
    let full = null;
    try { full = await getJSON("/api/article/" + card.aid); } catch {}
    if (location.hash !== "#/study") return;
    const recalls = (full && full.recall) || [];
    if (!recalls.length) { deck.splice(di, 1); renderStudy(); return; }
    if (card.ri === undefined) card.ri = Math.floor(Math.random() * recalls.length);
    const r = recalls[card.ri];
    view.innerHTML = `${head}<div class="scard">
      <p class="from">From <a href="#/article/${card.aid}">${esc(full.title)}</a></p>
      <h1>${esc(r.q)}</h1>
      <textarea id="studyAns" placeholder="Explain it from memory, then check" aria-label="Your answer"></textarea>
      <div class="sanswer" id="studyModel" hidden>${esc(r.a)}</div>
      <div class="sactions" id="sact"><button class="btn" id="reveal">Show answer</button><span class="spacer"></span>
        <button class="btn ghost" data-s="skip">Skip</button></div></div>`;
    $("#reveal").onclick = () => {
      $("#studyModel").hidden = false;
      $("#sact").innerHTML = `<span class="rel">How did you do?</span><button class="btn" data-s="got">Got it</button>
        <button class="btn ghost" data-s="missed">Missed</button>`;
      wire();
    };
    const wire = () => $$("#sact [data-s]").forEach(b => b.onclick = () => {
      const s = b.dataset.s;
      if (s === "got" || s === "missed") {
        sess[s]++;
        S.progress.attempts[`recall:${card.aid}:${card.ri}`] = { status: s, ts: Date.now() };
        if (s === "missed" && masteryOf(card.aid) !== "needs-revision") { S.progress.mastery[card.aid] = "needs-revision"; buildNav(); }
        saveProgress();
      }
      next();
    });
    wire();
    $("#studyAns").focus({ preventScroll: true });
  } else {
    const q = S.qById[card.qid];
    if (!q) { deck.splice(di, 1); renderStudy(); return; }
    view.innerHTML = `${head}<div class="scard">${questionCard(q)}
      <div class="sactions"><span class="spacer"></span><button class="btn ghost" id="snext">Next card</button></div></div>`;
    wireQuestions(view);
    $("#snext").onclick = () => {
      const att = S.progress.attempts[q.id];
      if (att && att.ts >= sess.start) { if (att.status === "got") sess.got++; else if (att.status === "missed") sess.missed++; }
      next();
    };
  }
}

/* ---------- router ---------- */
function route() {
  const h = location.hash || "#/";
  $("#readProgress span").style.width = "0";
  const name = h.startsWith("#/read/") ? "read" : h.startsWith("#/library") ? "library" : h.startsWith("#/article/") ? "article"
    : h.startsWith("#/questions") ? "questions" : h.startsWith("#/graph") ? "graph" : h === "#/review" ? "review"
    : h === "#/study" ? "study" : "home";
  document.body.dataset.view = name;
  document.body.classList.toggle("reader-open", name === "read");
  document.body.classList.toggle("norail", name !== "article" && name !== "graph");
  document.body.classList.remove("navopen");
  const navName = name === "read" ? "library" : name;
  $$("#mainNav a").forEach(a => { if (a.dataset.route === navName) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (name !== "study") sess = null;
  if (window.Library && window.Library.onLeave) window.Library.onLeave(h);
  saveReadPos(); readingId = null; clearTimeout(readSaveT);
  instant(0);
  if (name === "read") { window.Library ? window.Library.reader(h.slice(7)) : null; }
  else if (name === "library") { window.Library ? window.Library.render() : renderHome(); }
  else if (name === "article") renderArticle(decodeURIComponent(h.slice(10)));
  else if (name === "questions") {
    const p = new URLSearchParams(h.split("?")[1] || "");
    renderQuestions(p.get("q") || "", p.get("origin") || "");
  }
  else if (name === "graph") (window.GraphView ? window.GraphView.render(new URLSearchParams(h.split("?")[1] || "").get("focus")) : renderGraph());
  else if (name === "review") renderReview();
  else if (name === "study") renderStudy();
  else renderHome();
  $("#palette").hidden = true;
}

/* ---------- events ---------- */
window.addEventListener("hashchange", route);
// in-page anchors (TOC, visuals, citations) must scroll, never route to home
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest('a[href^="#"]:not([href^="#/"])');
  if (!a) return;
  const el = document.getElementById(a.getAttribute("href").slice(1));
  if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); }
});
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
  else if (e.key === "Escape") { closePalette(); document.body.classList.remove("navopen"); }
  else if (!$("#palette").hidden && ["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
    e.preventDefault();
    if (e.key === "Enter") goResult(palItems[palIdx]);
    else { palIdx = (palIdx + (e.key === "ArrowDown" ? 1 : -1) + Math.max(1, palItems.length)) % Math.max(1, palItems.length);
      $$("#paletteList li").forEach((li, i) => li.setAttribute("aria-selected", String(i === palIdx)));
      const inp = $("#paletteInput");
      if (inp && palItems.length) inp.setAttribute("aria-activedescendant", "pal-opt-" + palIdx);
      $("#pal-opt-" + palIdx)?.scrollIntoView({ block: "nearest" });
    }
  }
});
$("#searchBtn").onclick = openPalette;
$("#paletteInput").addEventListener("input", renderPalette);
$("#palette").addEventListener("click", e => { if (e.target.id === "palette") closePalette(); });
$("#paletteClose").onclick = closePalette;
const syncThemeBtn = () => $("#themeBtn").setAttribute("aria-checked", document.documentElement.dataset.theme === "dark");
syncThemeBtn();
let fadeTimer;
$("#themeBtn").onclick = () => { const h = document.documentElement;
  h.classList.add("theme-fade"); clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => h.classList.remove("theme-fade"), 600);
  h.dataset.theme = h.dataset.theme === "dark" ? "light" : "dark";
  const m = document.querySelector('meta[name="color-scheme"]'); if (m) m.content = h.dataset.theme;
  syncThemeBtn();
  try { localStorage.setItem("meridian-theme", h.dataset.theme); } catch {} };
$("#readingBtn").onclick = () => { const on = document.body.classList.toggle("reading");
  $("#readingBtn").setAttribute("aria-pressed", on); };
$("#navToggle").onclick = () => document.body.classList.toggle("navopen");
$("#scrim").onclick = () => document.body.classList.remove("navopen");

boot();
