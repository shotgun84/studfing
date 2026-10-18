/* Meridian SPA — hash router, search, graph, study. Vanilla JS, no build. */
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const S = { articles: [], questions: [], graph: null, coverage: [], sources: [],
  byId: {}, qById: {}, progress: { mastery: {}, attempts: {}, visits: {} } };

const MASTERY = ["unfamiliar", "learning", "understood", "needs-revision"];
const MLABEL = { unfamiliar: "Unfamiliar", learning: "Learning", understood: "Understood", "needs-revision": "Needs revision" };

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
    const local = JSON.parse(localStorage.getItem("meridian-progress") || "null");
    S.progress = Object.assign({ mastery: {}, attempts: {}, visits: {}, activities: {}, reader: {}, notes: {} }, prog || {}, local || {});
    $("#buildStats").textContent = `${arts.length} articles · ${qs.length} questions · ${graph.edges?.length ?? 0} links`;
  } catch (e) {
    $("#view").innerHTML = `<div class="card"><h3>Could not load the knowledge base</h3>
      <p>Is the Flask app running? Start it with <code>python app.py</code> and reload.</p></div>`;
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
  "cocomo": "estimation-planning-poker", "midterm": "midterm-study-guide" };
function linkify(text, currentId, budget) {
  let out = esc(text);
  if (budget.n <= 0) return out;
  const phrases = Object.keys(ALIAS).sort((a, b) => b.length - a.length);
  for (const ph of phrases) {
    const id = ALIAS[ph];
    if (id === currentId || budget.used.has(id)) continue;
    const re = new RegExp(`(?<!\\w)${ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "i");
    if (re.test(out)) {
      out = out.replace(re, m => `<a href="#/article/${id}">${m}</a>`);
      budget.used.add(id); budget.n--;
      if (budget.n <= 0) break;
    }
  }
  return out;
}

/* ---------- search ---------- */
const SYN = { nfr: ["non-functional"], fr: ["functional"], aon: ["activity", "node"], aoa: ["activity", "arc"],
  srs: ["specification", "ieee"], wbs: ["breakdown"], wip: ["kanban", "limit"], qa: ["testing"] };
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
    const p = qu.prompt.toLowerCase(); let s = 0;
    for (const t of toks) if (p.includes(t)) s += 10;
    if (qu.source.toLowerCase().includes(q)) s += 12;
    if (s > 0) out.push({ kind: qu.origin === "past-paper" ? "Past paper" : qu.origin === "worksheet" ? "Worksheet" : "Practice",
      id: "q:" + qu.id, title: qu.prompt.slice(0, 90), sub: qu.source, score: s });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 14);
}

/* ---------- palette (server search: articles, questions incl. IDs, sources, slides) ---------- */
let palIdx = 0, palItems = [], palSeq = 0, palTimer = 0;
function openPalette() { $("#palette").hidden = false; $("#paletteInput").value = $("#searchInput").value || "";
  renderPalette(); setTimeout(() => $("#paletteInput").focus(), 0); }
function closePalette() { $("#palette").hidden = true; $("#paletteInput").blur(); clearTimeout(palTimer); }
function renderPalette() {
  const q = $("#paletteInput").value;
  clearTimeout(palTimer);
  if (!q.trim()) { palItems = []; palIdx = 0; paintPalette("Type to search articles, questions, sources and slides…"); return; }
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
  }, q.length < 3 ? 0 : 140);
}
function paintPalette(msg) {
  $("#paletteList").innerHTML = palItems.map((r, i) =>
    `<li data-i="${i}" aria-selected="${i === 0}"><span class="k">${esc(r.kind)}</span>
     <span class="t"><b>${esc(r.title)}</b><br><small>${esc(r.sub || "")}</small></span></li>`).join("")
    || `<li><span class="t">${esc(msg || "No matches — try “critical path”, “pp2022-q1-2b”, “planning poker”…")}</span></li>`;
  $$("#paletteList li[data-i]").forEach(li => li.onclick = () => goResult(palItems[+li.dataset.i]));
}
function goResult(r) {
  if (!r) return;
  closePalette(); $("#searchInput").value = "";
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

/* ---------- nav ---------- */
function categories() {
  const m = new Map();
  for (const a of S.articles) {
    if (!m.has(a.category)) m.set(a.category, []);
    m.get(a.category).push(a);
  }
  return [...m.entries()];
}
function buildNav() {
  $("#sideNav").innerHTML = categories().map(([c, arts]) =>
    `<details open><summary>${esc(c)}<span class="n">${arts.length}</span></summary><ul>` +
    arts.map(a => `<li><a data-nav="${a.id}" href="#/article/${a.id}"><i class="mdot m-${masteryOf(a.id)}" title="Mastery: ${MLABEL[masteryOf(a.id)]}" aria-hidden="true"></i><span>${esc(a.title)}</span></a></li>`).join("") + `</ul></details>`).join("");
  const rev = reviewList();
  $("#reviewCount").textContent = rev.length ? `(${rev.length})` : "";
  document.body.classList.remove("navopen");
}
function markNav(id) { $$("#sideNav a").forEach(a => a.classList.toggle("active", a.dataset.nav === id)); }

/* ---------- progress ---------- */
function masteryOf(aid) { return S.progress.mastery[aid] || "unfamiliar"; }
function setMastery(aid, m) { S.progress.mastery[aid] = m; saveProgress(); buildNav(); toast(`Marked “${S.byId[aid]?.title}” — ${MLABEL[m]}`); }
function recordVisit(aid) { S.progress.visits[aid] = (S.progress.visits[aid] || 0) + 1; saveProgress(); }
function reviewList() {
  return S.articles.filter(a => {
    const m = masteryOf(a.id);
    if (m === "needs-revision" || m === "unfamiliar") return true;
    return (a.qids || []).some(qid => S.progress.attempts[qid]?.status === "missed");
  }).map(a => a.id);
}

/* ---------- shared renderers ---------- */
function masteryBtns(aid) {
  const cur = masteryOf(aid);
  return `<div class="mastery" role="group" aria-label="Mark your understanding"><span>Mastery:</span>` +
    MASTERY.map(m => `<button class="mbtn" data-m="${m}" data-a="${aid}" aria-pressed="${cur === m}">${MLABEL[m]}</button>`).join("") + `</div>`;
}
function questionCard(q, opts = {}) {
  const att = S.progress.attempts[q.id];
  const arts = (q.articles || []).map(id => `<a href="#/article/${id}">${esc(S.byId[id]?.title || id)}</a>`).join(" · ");
  return `<article class="qcard" id="qc-${q.id}" data-q="${q.id}">
    <header><span class="chip">${esc(q.origin)}</span><span class="chip">${esc(q.type || "")}</span>
    ${q.marks ? `<span class="chip">${q.marks} marks</span>` : ""}<span class="qid" title="Question ID — searchable">${esc(q.id)}</span><span class="src">${esc(q.source || "")}</span>
    ${att ? `<span class="chip" title="Your last self-mark">last: ${esc(att.status)}</span>` : ""}</header>
    <p class="prompt">${esc(q.prompt)}</p>
    ${q.detail ? `<p class="detail">${esc(q.detail)}</p>` : ""}
    ${q.choices ? (window.mcqHTML ? window.mcqHTML(q) : "") : `<textarea placeholder="Draft your answer here before revealing the model…" aria-label="Your answer"></textarea>`}
    <footer>
      <button class="btn small ghost" data-act="reveal">Show model answer</button>
      <button class="btn small ghost" data-act="got">✓ Got it</button>
      <button class="btn small ghost" data-act="partial">~ Partial</button>
      <button class="btn small ghost" data-act="missed">✗ Missed</button>
      ${opts.similar ? `<button class="btn small ghost" data-act="similar">Similar question</button>` : ""}
    </footer>
    <div class="model" hidden>
      <p>${esc(q.answer?.text || "")}</p>
      ${(q.answer?.rubric || []).length ? `<ul class="rubric">${q.answer.rubric.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${q.answer?.official ? "" : `<p class="src">Independently worked — verify against lectures/worksheets.</p>`}
      ${arts ? `<p class="src">Revise: ${arts}</p>` : ""}
    </div></article>`;
}
function wireQuestions(root) {
  if (root._wired) return;
  root._wired = true;
  root.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]"); const mbtn = e.target.closest("button.mbtn");
    if (mbtn) { setMastery(mbtn.dataset.a, mbtn.dataset.m); $$(`button.mbtn[data-a="${mbtn.dataset.a}"]`, root).forEach(b => b.setAttribute("aria-pressed", b.dataset.m === mbtn.dataset.m)); return; }
    if (!btn) return;
    const card = btn.closest(".qcard"); const qid = card?.dataset.q; if (!qid) return;
    const q = S.qById[qid];
    if (btn.dataset.act === "reveal") { const m = $(".model", card); m.hidden = !m.hidden;
      btn.textContent = m.hidden ? "Show model answer" : "Hide model answer"; }
    else if (btn.dataset.act === "similar") {
      const pool = S.questions.filter(x => x.id !== qid && (x.articles || []).some(a => (q.articles || []).includes(a)));
      if (pool.length) { const pick = pool[Math.floor(Math.random() * pool.length)];
        location.hash = "#/questions?q=" + encodeURIComponent(pick.id); toast("A similar question: " + pick.prompt.slice(0, 60) + "…"); }
      else toast("No similar question indexed yet.");
    } else {
      S.progress.attempts[qid] = { status: btn.dataset.act, ts: Date.now() }; saveProgress(); buildNav();
      toast(`Recorded “${btn.dataset.act}” — it will feed your review queue.`);
    }
  });
}

/* ---------- views ---------- */
function crumbs(a) {
  return `<p class="crumbs"><a href="#/">Meridian</a> › ${esc(a.category)} › <b>${esc(a.title)}</b></p>`;
}
function secBody(s, id, budget) {
  const paras = (s.paras || []).map(p => `<p>${linkify(p, id, budget)}</p>`).join("");
  const bullets = (s.bullets || []).length ? `<ul>${s.bullets.map(b => `<li>${linkify(b, id, budget)}</li>`).join("")}</ul>` : "";
  const table = s.table ? `<table><thead><tr>${s.table.head.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
  const code = s.code ? `<pre><code>${esc(s.code.text)}</code></pre>` : "";
  const svg = s.svg ? `<figure class="diagram">${s.svg}<figcaption>${esc(s.heading_2 || "Diagram")}</figcaption></figure>` : "";
  const call = s.callout ? `<aside class="callout ${s.callout.kind || "exam"}"><span class="k">${esc((s.callout.kind || "exam").replace("-", " "))}</span>${esc(s.callout.text)}</aside>` : "";
  return paras + bullets + table + code + svg + call;
}
async function renderArticle(id) {
  let full;
  try { full = await getJSON("/api/article/" + id); }
  catch { $("#view").innerHTML = `<div class="card"><h3>Missing article</h3><p>No article “${esc(id)}”. It may be a planned placeholder — try search.</p></div>`; return; }
  recordVisit(id);
  const budget = { n: 6, used: new Set() };
  let secn = 0;
  const secHTML = (full.sections || []).map((s, i) => {
    secn++;
    let h = `<h2 id="sec-${i}"><span class="secn">${secn}</span>${esc(s.heading)}</h2>`;
    if (s.heading_2 && s.svg) h = `<h2 id="sec-${i}"><span class="secn">${secn}</span>${esc(s.heading_2)}</h2>`;
    return h + secBody(s, id, budget);
  });
  // interleave visuals close to the prose they explain
  const visuals = full.visuals || [];
  if (window.VIS && visuals.length && secHTML.length) visuals.forEach((v, k) => {
    secHTML[k % secHTML.length] += window.VIS.render(v, id);
  });
  if (window.ACTUI && full.activities && secHTML.length) full.activities.forEach((a, k) => {
    secHTML[(k + 1) % secHTML.length] += window.ACTUI.render(a);
  });
  const body = secHTML.join("");
  const recall = (full.recall || []).map((r, i) =>
    `<details class="recall"><summary>Recall ${i + 1}: ${esc(r.q)}</summary><p class="answer">${esc(r.a)}</p></details>`).join("");
  const qlist = (full.question_ids || []).map(qid => S.qById[qid]).filter(Boolean);
  const cites = (full.citations || []).map((c, i) =>
    `<li id="cite-${i + 1}"><b>[${i + 1}]</b> ${esc(c.source)} <span class="loc">${esc(c.locator || "")}</span>
     <span class="kind">${esc(c.kind || "course")}</span>
     <button class="btn small ghost" data-preview data-src="${esc(c.source)}" data-loc="${esc(c.locator || "")}" data-ex="${esc(c.excerpt || "")}">View slide</button>
     ${c.excerpt ? `<blockquote>“${esc(c.excerpt)}”</blockquote>` : ""}</li>`).join("");
  const rel = a => `<li><a href="#/article/${a}">${esc(S.byId[a]?.title || a)}</a><br><span class="rel">${esc(S.byId[a]?.category || "")}</span></li>`;
  $("#view").innerHTML = `${crumbs(full)}
    <h1 class="atitle">${esc(full.title)}</h1>
    <p class="summary">${esc(full.summary || "")}</p>
    <div class="meta"><span class="chip cat">${esc(full.category)}</span>
      <span class="chip">⧗ ${full.read_minutes || 5} min</span>
      <span class="chip">${(full.citations || []).length} sources</span>
      <span class="chip">${qlist.length} questions</span>${masteryBtns(id)}</div>
    <div class="article">${body}
      ${recall ? `<h2><span class="secn">◌</span>Active recall</h2>${recall}` : ""}
      ${qlist.length ? `<h2><span class="secn">❖</span>Practice questions</h2>${qlist.map(q => questionCard(q, { similar: true })).join("")}` : ""}
      ${cites ? `<h2><span class="secn">§</span>Sources</h2><ol class="sources">${cites}</ol>` : ""}
    </div>`;
  const related = [...(full.related || []), ...(full.prerequisites || [])].filter((v, i, a) => a.indexOf(v) === i);
  const srcCount = {};
  (full.citations || []).forEach(c => { if (c.source) srcCount[c.source] = (srcCount[c.source] || 0) + 1; });
  const srcByRel = Object.fromEntries((S.sources || []).map(s => [s.rel, s]));
  const topSrc = Object.entries(srcCount).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([rel]) => srcByRel[rel]).filter(s => s && s.pages);
  $("#rightRail").innerHTML = `<div class="ctx">
    <h3>On this page</h3><ol class="toc">${(full.sections || []).map((s, i) => `<li><a href="#sec-${i}" data-sec="${i}">${esc(s.heading_2 || s.heading)}</a></li>`).join("")}${(full.visuals || []).map(v => `<li><a href="#vis-${v.id}">◈ ${esc(v.title)}</a></li>`).join("")}</ol>
    ${topSrc.length ? `<h3>Study in the reader</h3><p class="rel">Open the source document with practice, notes and search:</p><ul class="links">${topSrc.map(s => `<li><a href="#/read/${s.id}">📖 Read ${esc((s.file || "").replace(/_/g, " ").slice(0, 34))}</a></li>`).join("")}</ul>` : ""}
    ${(full.prerequisites || []).length ? `<h3>Start here first</h3><ul class="links">${full.prerequisites.map(rel).join("")}</ul>` : ""}
    ${related.length ? `<h3>Related concepts</h3><ul class="links">${related.map(rel).join("")}</ul>` : ""}
    ${(full.backlinks || []).length ? `<h3>Linked from</h3><ul class="links">${full.backlinks.map(rel).join("")}</ul>` : ""}
    <h3>Evidence</h3><p class="rel">${(full.citations || []).length} citations · ${qlist.length} linked questions</p></div>`;
  wireQuestions($("#view"));
  if (window.VIS?.after) window.VIS.after($("#view"));
  markNav(id);
  // reading progress + TOC highlight
  const onScroll = () => {
    const el = document.documentElement;
    const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    $("#readProgress span").style.width = (p * 100).toFixed(1) + "%";
  };
  document.onscroll = onScroll; onScroll();
}

function renderHome() {
  document.onscroll = () => { $("#readProgress span").style.width = "0"; };
  const deg = {};
  (S.graph.edges || []).forEach(e => { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; });
  const top = [...S.articles].sort((a, b) => (deg[b.id] || 0) - (deg[a.id] || 0)).slice(0, 5);
  const cov = S.coverage;
  const dots = ev => ["lecture", "worksheet", "past-paper", "practice"].map(k =>
    `<span class="dot ${ev[k] ? "y" : "n"}">${ev[k] ? "●" : "○"} ${k}</span>`).join("");
  const covItem = c => {
    const a = S.byId[c.id];
    if (!a) return "";
    return `<div class="covitem"><a href="#/article/${c.id}">${esc(a.title)}</a><div class="dots">${dots(c.evidence)}</div></div>`;
  };
  $("#view").innerHTML = `
    <div class="hero"><p class="crumbs">A personal encyclopedia · ISAD1000/ISAD5004</p>
      <h1>Your course, mapped as a universe worth exploring.</h1>
      <p>Every concept from project planning to professional ethics — explained like an article,
      linked like Wikipedia, and cited to the exact lecture, worksheet or past paper it came from.
      Follow curiosity; the exam coverage follows you.</p>
      <div class="cta"><button class="btn" id="startTrack">Start the calculation track</button>
      <a class="btn ghost" href="#/questions" style="text-decoration:none">Open the question bank</a>
      <button class="btn ghost" id="randBtn">⚄ Surprise me</button></div></div>
    <div class="stats">
      <div class="stat"><b>${S.articles.length}</b><span>articles</span></div>
      <div class="stat"><b>${S.questions.filter(q => q.origin === "past-paper").length}</b><span>past-paper questions</span></div>
      <div class="stat"><b>${S.graph.edges?.length ?? 0}</b><span>concept links</span></div>
      <div class="stat"><b>${S.questions.length}</b><span>practice items</span></div>
    </div>
    <h2>Study tracks</h2>
    <div class="tracks">
      <div class="track"><h3>① The calculation track</h3><p>WBS → graphs → critical path → burn-ups. Highest mark density.</p>
        <a href="#/article/wbs">Begin with work breakdown →</a></div>
      <div class="track"><h3>② The requirements track</h3><p>Stories → use cases → flows → NFR validity. Most writing marks.</p>
        <a href="#/article/user-stories">Begin with user stories →</a></div>
      <div class="track"><h3>③ The judgement track</h3><p>Scrum → Kanban → ethics. Reasoning the markers reward.</p>
        <a href="#/article/scrum-framework">Begin with Scrum →</a></div>
    </div>
    <div id="homeLib"></div>
    <h2>Most connected concepts</h2>
    <div class="grid2">${top.map(a => `<div class="card"><h3><a href="#/article/${a.id}">${esc(a.title)}</a></h3>
      <p>${deg[a.id]} links · ${esc(a.summary.slice(0, 110))}…</p></div>`).join("")}</div>
    <h2>Coverage map <small style="color:var(--faint)">(evidence per concept)</small></h2>
    <div class="cov" id="covGrid">${cov.slice(0, 6).map(covItem).join("")}</div>
    <div class="cov" id="covRest" hidden>${cov.slice(6).map(covItem).join("")}</div>
    ${cov.length > 6 ? `<p><button class="btn small ghost" id="covToggle" aria-expanded="false">Show all ${cov.length} concepts ▾</button></p>` : ""}
    <h2>Explore sideways</h2>
    <div class="grid2">
      <div class="card"><h3>⚄ Surprise me</h3><p>A random concept from your course — curiosity first.</p>
        <button class="btn small ghost" id="randBtn2">Open random article</button></div>
      <div class="card"><h3>✦ Surprising connection</h3><p id="connText">Two linked ideas you might not expect.</p>
        <button class="btn small ghost" id="connBtn">Reveal a connection</button></div>
      <div class="card"><h3>⚠ Misconception roulette</h3><p id="misText">The mark-losers, on demand.</p>
        <button class="btn small ghost" id="misBtn">Show a misconception</button></div>
      <div class="card"><h3>▼ Take me deeper</h3><p>Drill into the foundations of a random article.</p>
        <button class="btn small ghost" id="deepBtn">Go one level deeper</button></div>
    </div>`;
  $("#rightRail").innerHTML = `<div class="ctx"><h3>Midterm at a glance</h3>
    <p class="rel">2022 paper: 90 min · 100 marks · closed book.<br>Q1 planning · Q2 use cases · Q3 NFRs · Q4 agile.</p>
    <h3>Continue</h3><ul class="links"><li><a href="#/review">↻ Review queue</a></li>
    <li><a href="#/study">▶ Study mode</a></li><li><a href="#/graph">◈ Concept graph</a></li>
    <li><a href="#/article/midterm-study-guide">▤ Study guide</a></li></ul></div>`;
  markNav("");
  const covT = $("#covToggle");
  if (covT) covT.onclick = () => {
    const rest = $("#covRest"), open = rest.hidden;
    rest.hidden = !open;
    covT.textContent = open ? `Show fewer ▴` : `Show all ${cov.length} concepts ▾`;
    covT.setAttribute("aria-expanded", open);
  };
  if (window.Library && window.Library.homeSection) {
    window.Library.homeSection().then(html => { const el = $("#homeLib"); if (el) el.innerHTML = html; }).catch(() => {});
  }
  $("#startTrack").onclick = () => location.hash = "#/article/wbs";
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const goRand = () => location.hash = "#/article/" + rnd(S.articles).id;
  $("#randBtn").onclick = goRand; $("#randBtn2").onclick = goRand; $("#surpriseBtn").onclick = goRand;
  $("#connBtn").onclick = () => { const e = rnd(S.graph.edges || []);
    $("#connText").innerHTML = e ? `<a href="#/article/${e.from}">${esc(S.byId[e.from]?.title)}</a> ↔
      <a href="#/article/${e.to}">${esc(S.byId[e.to]?.title)}</a>` : "No edges."; };
  const MIS = [["exam-mistakes-planning", 0], ["exam-mistakes-agile", 0], ["exam-mistakes-requirements", 0], ["exam-mistakes-nfr", 0], ["exam-mistakes-ethics", 0]];
  $("#misBtn").onclick = async () => { const [id] = rnd(MIS);
    try { const full = await getJSON("/api/article/" + id);
      const secs = full.sections.flatMap(s => s.bullets || []);
      $("#misText").textContent = "⚠ " + (rnd(secs) || "—"); } catch { $("#misText").textContent = "Try again."; } };
  $("#deepBtn").onclick = async () => { const a = rnd(S.articles);
    try { const full = await getJSON("/api/article/" + a.id);
      const pre = (full.prerequisites || [])[0] || a.id;
      location.hash = "#/article/" + pre; } catch { goRand(); } };
}

function renderQuestions(focusQ) {
  document.onscroll = null;
  const cats = [...new Set(S.articles.map(a => a.category))];
  $("#view").innerHTML = `<p class="crumbs"><a href="#/">Meridian</a> › <b>Question bank</b></p>
    <h1 class="atitle">Question bank</h1>
    <p class="summary">${S.questions.length} indexed questions — authentic past-paper and worksheet items plus labelled generated practice. Attempt before revealing.</p>
    <div class="filters">
      <input id="fq" type="search" placeholder="Filter…" value="${esc(focusQ || "")}" aria-label="Filter questions">
      <select id="forigin" aria-label="Origin"><option value="">All origins</option>
        <option>past-paper</option><option>worksheet</option><option>generated</option></select>
      <select id="fcat" aria-label="Category"><option value="">All topics</option>
        ${cats.map(c => `<option>${esc(c)}</option>`).join("")}</select>
    </div><div id="qlist"></div>`;
  $("#rightRail").innerHTML = `<div class="ctx"><h3>How to use this</h3>
    <p class="rel">Write your answer first, then reveal the model and self-mark honestly.
    Missed items join your review queue automatically.</p>
    <h3>Legend</h3><p class="rel">past-paper = authentic wording, marks and source preserved.<br>
    worksheet = coursework tasks.<br>generated = extra practice, needs verification.</p></div>`;
  const draw = () => {
    const q = ($("#fq").value || "").toLowerCase(), o = $("#forigin").value, c = $("#fcat").value;
    const list = S.questions.filter(x => (!o || x.origin === o) &&
      (!q || (x.id + " " + x.prompt + " " + (x.source || "") + " " + (x.detail || "")).toLowerCase().includes(q)) &&
      (!c || (x.articles || []).some(a => S.byId[a]?.category === c)));
    $("#qlist").innerHTML = list.length ? list.map(x => questionCard(x, { similar: true })).join("") :
      `<div class="card"><h3>No questions match “${esc($("#fq").value)}”</h3>
       <p>Try a question ID (e.g. pp2022-q1-2b), a topic word, or clear the filters.</p>
       <p><button class="btn small ghost" id="qclear">Clear all filters</button></p></div>`;
    const qc = $("#qclear");
    if (qc) qc.onclick = () => { $("#fq").value = ""; $("#forigin").value = ""; $("#fcat").value = ""; draw(); };
    if (focusQ) { const el = document.getElementById("qc-" + CSS.escape(focusQ)); el?.scrollIntoView({ block: "center" }); }
  };
  ["fq", "forigin", "fcat"].forEach(id => $("#" + id).addEventListener("input", draw));
  draw(); wireQuestions($("#view")); markNav("");
}

function renderGraph(focus) {
  document.onscroll = null;
  const cats = [...new Set(S.articles.map(a => a.category))];
  const col = i => ["#7db8e8", "#d9a441", "#7fb685", "#d97a6c", "#b39ddb", "#66c6c0", "#e08fa5"][i % 7];
  const N = S.articles.length, cx = 400, cy = 300, R = 230;
  const pos = {};
  S.articles.forEach((a, i) => {
    const ci = cats.indexOf(a.category);
    const ang = (i / N) * Math.PI * 2 + ci * 0.15;
    pos[a.id] = [cx + R * Math.cos(ang), cy + R * Math.sin(ang) * 0.72];
  });
  const edges = (S.graph.edges || []).map(e => {
    const [x1, y1] = pos[e.from] || [cx, cy], [x2, y2] = pos[e.to] || [cx, cy];
    return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#31343c"/>`; }).join("");
  const nodes = S.articles.map(a => {
    const [x, y] = pos[a.id]; const ci = cats.indexOf(a.category);
    return `<g class="gnode ${focus === a.id ? "focus" : ""}" data-id="${a.id}" transform="translate(${x.toFixed(0)},${y.toFixed(0)})">
      <circle r="${focus === a.id ? 12 : 8}" style="stroke:${col(ci)}"/><text y="24" text-anchor="middle">${esc(a.title.length > 22 ? a.title.slice(0, 21) + "…" : a.title)}</text></g>`; }).join("");
  $("#view").innerHTML = `<p class="crumbs"><a href="#/">Meridian</a> › <b>Concept graph</b></p>
    <h1 class="atitle">Concept graph</h1>
    <p class="summary">${S.articles.length} concepts · ${(S.graph.edges || []).length} relationships. Select a node to read it.</p>
    <div class="graphwrap"><svg viewBox="0 0 800 600" role="img" aria-label="Concept relationship graph">${edges}${nodes}</svg></div>
    <p class="rel">${cats.map((c, i) => `<span style="color:${col(i)}">●</span> ${esc(c)}`).join(" &nbsp; ")}</p>`;
  $("#rightRail").innerHTML = `<div class="ctx"><h3>Reading the graph</h3>
    <p class="rel">Colour = topic family. Lines = related or prerequisite relationships.
    Dense clusters (critical path, use cases, NFRs) are the most examined regions.</p></div>`;
  $$(".gnode").forEach(g => g.onclick = () => location.hash = "#/article/" + g.dataset.id);
  markNav("");
}

function renderReview() {
  document.onscroll = null;
  const ids = reviewList();
  $("#view").innerHTML = `<p class="crumbs"><a href="#/">Meridian</a> › <b>Review queue</b></p>
    <h1 class="atitle">Review queue</h1>
    <p class="summary">${ids.length ? `${ids.length} concepts want attention — missed questions and unfamiliar material first.` : "All clear. Everything is marked understood — try Surprise me to stretch further."}</p>
    ${ids.map(id => { const a = S.byId[id];
      const missed = (a.qids || []).filter(q => S.progress.attempts[q]?.status === "missed");
      return `<div class="card"><h3><a href="#/article/${id}">${esc(a.title)}</a></h3>
        <p>${esc(a.summary.slice(0, 140))}…</p>
        <p class="rel">Mastery: ${MLABEL[masteryOf(id)]}${missed.length ? ` · missed: ${missed.length}` : ""} ${masteryBtns(id)}</p></div>`; }).join("")}`;
  $("#rightRail").innerHTML = `<div class="ctx"><h3>Spaced logic</h3>
    <p class="rel">The queue is ordered by need: “needs revision” and missed questions surface first.
    Mark items understood only after a successful unaided recall.</p></div>`;
  wireQuestions($("#view")); markNav("");
}

let deck = [], di = 0;
function buildDeck() {
  deck = [];
  for (const a of S.articles) {
    if (masteryOf(a.id) === "understood") continue;
    deck.push({ t: "recall", aid: a.id });
    for (const qid of (a.qids || []))
      if (S.progress.attempts[qid]?.status !== "got") deck.push({ t: "q", qid });
  }
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[deck[i], deck[j]] = [deck[j], deck[i]]; }
  deck = deck.slice(0, 30); di = 0;
}
async function renderStudy() {
  document.onscroll = null;
  if (!deck.length) buildDeck();
  $("#rightRail").innerHTML = `<div class="ctx"><h3>Study mode</h3>
    <p class="rel">One prompt at a time, no navigation. Reveal, self-mark, move on. ${deck.length} cards in this deck.</p>
    <p><button class="btn small ghost" id="reshuffle">Reshuffle deck</button></p></div>`;
  $("#reshuffle").onclick = () => { buildDeck(); renderStudy(); };
  if (!deck.length) { $("#view").innerHTML = `<div class="card"><h3>Deck complete</h3><p>Nothing due. Reshuffle or explore.</p></div>`; return; }
  const card = deck[di % deck.length];
  let inner = "";
  if (card.t === "recall") {
    const full = await getJSON("/api/article/" + card.aid);
    const r = (full.recall || [])[0];
    inner = r ? `<p class="crumbs"><a href="#/article/${card.aid}">${esc(full.title)}</a> › recall</p>
      <h1 class="atitle">${esc(r.q)}</h1>
      <textarea id="studyAns" placeholder="Explain from memory, then reveal…"></textarea>
      <p><button class="btn small ghost" id="reveal">Reveal suggested answer</button></p>
      <div class="card" id="studyModel" hidden><p>${esc(r.a)}</p></div>
      <p class="rel">Card ${di % deck.length + 1} of ${deck.length}</p>
      <p><button class="btn small ghost" data-m="got">✓ Got it</button>
      <button class="btn small ghost" data-m="missed">✗ Missed</button>
      <button class="btn small ghost" data-m="skip">Next →</button></p>`
      : `<div class="card"><p>No recall prompt here — <a href="#/article/${card.aid}">read the article</a>.</p>
      <p><button class="btn small ghost" data-m="skip">Next →</button></p></div>`;
  } else {
    const q = S.qById[card.qid];
    inner = `<p class="crumbs">Question · ${esc(q.source || "")}</p><h1 class="atitle">${esc(q.prompt)}</h1>
      ${q.detail ? `<p>${esc(q.detail)}</p>` : ""}
      <textarea id="studyAns" placeholder="Attempt before revealing…"></textarea>
      <div id="sq">${questionCard(q)}</div>
      <p><button class="btn small ghost" data-m="skip">Next →</button></p>`;
  }
  $("#view").innerHTML = `<p class="crumbs"><a href="#/">Meridian</a> › <b>Study mode</b></p>` + inner;
  wireQuestions($("#view"));
  $("#reveal") && ($("#reveal").onclick = () => { $("#studyModel").hidden = false; });
  $$("#view [data-m]").forEach(b => b.onclick = () => {
    if (card.t === "recall" && (b.dataset.m === "got" || b.dataset.m === "missed"))
      toast(b.dataset.m === "got" ? "Nice — keep it." : "Queued for review.");
    di++; renderStudy();
  });
  markNav("");
}

/* ---------- router ---------- */
function route() {
  const h = location.hash || "#/";
  $("#readProgress span").style.width = "0";
  document.body.classList.toggle("reader-open", h.startsWith("#/read/"));
  if (window.Library && window.Library.onLeave) window.Library.onLeave(h);
  if (h.startsWith("#/read/")) { window.Library ? window.Library.reader(h.slice(7)) : null; }
  else if (h.startsWith("#/library")) { window.Library ? window.Library.render() : renderHome(); }
  else if (h.startsWith("#/article/")) renderArticle(decodeURIComponent(h.slice(10)));
  else if (h.startsWith("#/questions")) {
    const m = h.match(/[?&]q=([^&]+)/); renderQuestions(m ? decodeURIComponent(m[1]) : "");
  }
  else if (h.startsWith("#/graph")) (window.GraphView ? window.GraphView.render(new URLSearchParams(h.split("?")[1] || "").get("focus")) : renderGraph());
  else if (h === "#/review") renderReview();
  else if (h === "#/study") renderStudy();
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
  else if (e.key === "Escape") closePalette();
  else if (!$("#palette").hidden && ["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
    e.preventDefault();
    if (e.key === "Enter") goResult(palItems[palIdx]);
    else { palIdx = (palIdx + (e.key === "ArrowDown" ? 1 : -1) + Math.max(1, palItems.length)) % Math.max(1, palItems.length);
      $$("#paletteList li").forEach((li, i) => li.setAttribute("aria-selected", i === palIdx)); }
  }
});
$("#searchInput").addEventListener("focus", openPalette);
$("#searchInput").addEventListener("input", e => { openPalette(); $("#paletteInput").value = e.target.value; renderPalette(); });
$("#paletteInput").addEventListener("input", renderPalette);
$("#palette").addEventListener("click", e => { if (e.target.id === "palette") closePalette(); });
$("#paletteClose").onclick = closePalette;
$("#surpriseBtn").onclick = () => location.hash = "#/article/" + S.articles[Math.floor(Math.random() * S.articles.length)].id;
$("#themeBtn").onclick = () => { const h = document.documentElement;
  h.dataset.theme = h.dataset.theme === "dark" ? "light" : "dark";
  $("#themeBtn").setAttribute("aria-pressed", h.dataset.theme === "light"); };
$("#readingBtn").onclick = () => { const on = document.body.classList.toggle("reading");
  $("#readingBtn").setAttribute("aria-pressed", on); };
$("#navToggle").onclick = () => document.body.classList.toggle("navopen");
$("#navClose").onclick = () => document.body.classList.remove("navopen");

boot();
