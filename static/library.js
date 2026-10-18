/* Meridian library + reader. Plugs into app.js router (Library.render / Library.reader).
   Depends: app.js globals ($,$$,esc,getJSON,toast,saveProgress,S,markNav,questionCard,ACTUI,VIS). */
"use strict";
window.Library = (function () {
  let libCache = null;
  let R = null; // active reader state
  let keyH = null;

  async function data(force) {
    if (!libCache || force) libCache = await getJSON("/api/library");
    return libCache;
  }
  function byId(id) { return (libCache || []).find(d => d.id === id); }
  function thumb(d, w) { return window.pageImg ? window.pageImg(d.rel, 1, w || 320) : ""; }
  function docTitle(d) { return d.title || d.file; }

  /* ================= homepage section ================= */
  async function homeSection() {
    try {
      const docs = await data();
      const reads = Object.entries((S.progress.reader || {}));
      const withProg = docs.filter(d => d.progress && d.progress.page > 0)
        .sort((a, b) => (b.progress.updated || 0) - (a.progress.updated || 0)).slice(0, 3);
      const added = docs.slice().sort((a, b) => (b.added || "").localeCompare(a.added || "")).slice(0, 3);
      const card = d => `<a class="libmini" href="#/read/${d.id}">
        <img loading="lazy" src="${thumb(d, 240)}" alt="Cover of ${esc(docTitle(d))}">
        <span class="libmini-t"><b>${esc(docTitle(d))}</b>
        <small>${esc(d.subject || "")} · ${d.pages} p${d.progress ? ` · p.${d.progress.page}/${d.pages}` : ""}</small>
        ${d.progress ? `<span class="pbar"><i style="width:${d.pct}%"></i></span>` : ""}</span></a>`;
      return `<div class="home-lib">
        <div class="home-lib-head"><h2>Learning materials</h2><span><a class="btn small ghost" href="#/library">Browse library →</a></span></div>
        ${withProg.length ? `<h3>Continue reading</h3><div class="libminis">${withProg.map(card).join("")}</div>` : ""}
        <h3>Recently added</h3><div class="libminis">${added.map(card).join("") || `<p class="rel">No materials yet.</p>`}</div>
      </div>`;
    } catch { return `<div class="home-lib"><h2>Learning materials</h2><p class="rel">Library unavailable. <a href="#/library">Try the library →</a></p></div>`; }
  }

  /* ================= library view ================= */
  const LSTATE = { q: "", subj: "", role: "", sort: "opened", view: (typeof localStorage !== "undefined" && localStorage.getItem("meridian-libview")) || "grid" };
  async function render() {
    document.onscroll = null;
    $("#view").innerHTML = `<p class="crumbs"><a href="#/">Meridian</a> › <b>Library</b></p>
    <h1 class="atitle">Learning materials</h1>
    <p class="summary">Every lecture deck, worksheet and past paper — open, read, search and study, right here.</p>
      <div class="libbar">
        <input id="libq" type="search" placeholder="Search titles, files, subjects…" value="${esc(LSTATE.q)}" aria-label="Search library">
        <select id="libsubj" aria-label="Filter by subject"><option value="">All subjects</option></select>
        <select id="librole" aria-label="Filter by collection">
          <option value="">All collections</option><option value="lecture">Lectures</option>
          <option value="worksheet">Worksheets</option><option value="past-paper">Past papers</option>
          <option value="reference">References</option><option value="supplementary">Other</option></select>
        <select id="libsort" aria-label="Sort">
          <option value="opened">Recently opened</option><option value="added">Recently added</option>
          <option value="title">Title A–Z</option><option value="pages">Most pages</option></select>
        <button class="iconbtn" id="libview" title="Toggle grid/list" aria-label="Toggle grid or list">▦</button>
      </div>
      <div id="liblist"><div class="card"><p>Loading library…</p></div></div>`;
    $("#rightRail").innerHTML = `<div class="ctx"><h3>About this library</h3>
      <p class="rel">Original course files — nothing here is generated. Reading progress, bookmarks and notes are saved in this browser.</p></div>`;
    markNav("");
    try {
      const docs = await data(true);
      const subjs = [...new Set(docs.map(d => d.subject).filter(Boolean))].sort();
      $("#libsubj").innerHTML = `<option value="">All subjects</option>` + subjs.map(s => `<option ${LSTATE.subj === s ? "selected" : ""}>${esc(s)}</option>`).join("");
      $("#librole").value = LSTATE.role; $("#libsort").value = LSTATE.sort;
      const draw = () => paintLib(docs);
      ["libq", "libsubj", "librole", "libsort"].forEach(id => $("#" + id).addEventListener("input", () => {
        LSTATE.q = $("#libq").value; LSTATE.subj = $("#libsubj").value;
        LSTATE.role = $("#librole").value; LSTATE.sort = $("#libsort").value; draw();
      }));
      $("#libview").onclick = () => {
        LSTATE.view = LSTATE.view === "grid" ? "list" : "grid";
        try { localStorage.setItem("meridian-libview", LSTATE.view); } catch {}
        draw();
      };
      draw();
    } catch {
      $("#liblist").innerHTML = `<div class="card"><h3>Library unavailable</h3><p>The server could not list materials.</p><p><button class="btn small" onclick="location.reload()">Retry</button></p></div>`;
    }
  }
  function paintLib(docs) {
    const q = LSTATE.q.trim().toLowerCase();
    let list = docs.filter(d =>
      (!q || (d.title + " " + d.file + " " + (d.subject || "")).toLowerCase().includes(q)) &&
      (!LSTATE.subj || d.subject === LSTATE.subj) &&
      (!LSTATE.role || d.role === LSTATE.role));
    const opened = id => ((S.progress.reader || {})[id] || {}).updated || 0;
    const by = {
      opened: (a, b) => (opened(b.id) || (b.progress ? 1 : 0)) - (opened(a.id) || (a.progress ? 1 : 0)) || (b.added || "").localeCompare(a.added || ""),
      added: (a, b) => (b.added || "").localeCompare(a.added || ""),
      title: (a, b) => a.title.localeCompare(b.title),
      pages: (a, b) => b.pages - a.pages
    }[LSTATE.sort] || ((a, b) => 0);
    list = list.slice().sort(by);
    const continued = docs.filter(d => d.progress && d.progress.page > 0)
      .sort((a, b) => (b.progress.updated || 0) - (a.progress.updated || 0)).slice(0, 4);
    const showGroups = !q && !LSTATE.subj && !LSTATE.role;
    const card = d => {
      const badges = [
        d.status === "failed" ? `<span class="chip warn">extraction failed</span>` : "",
        d.status === "partial" ? `<span class="chip">partial text</span>` : "",
        d.locked ? `<span class="chip warn">locked</span>` : "",
        !d.hasText ? `<span class="chip">image-only</span>` : ""
      ].join("");
      return `<article class="libcard" data-doc="${d.id}">
        <a class="libcover" href="#/read/${d.id}" aria-label="Read ${esc(docTitle(d))}">
          ${d.pages ? `<img loading="lazy" src="${thumb(d, 320)}" alt="">` : `<div class="nocover">PDF</div>`}
          ${d.progress ? `<span class="pbar"><i style="width:${d.pct}%"></i></span>` : ""}</a>
        <div class="libmeta"><h3><a href="#/read/${d.id}">${esc(docTitle(d))}</a></h3>
          <p class="rel">${esc(d.subject || "")} · ${esc(d.role || "")} · ${d.pages} pages${d.progress ? ` · p.${d.progress.page}/${d.pages}` : ""}</p>
          <p>${badges}</p>
          <div class="libops">
            <a class="btn small" href="#/read/${d.id}">${d.progress ? "Continue" : "Open"}</a>
          </div></div></article>`;
    };
    $("#liblist").innerHTML =
      (showGroups && continued.length ? `<h2>Continue reading</h2><div class="lib${LSTATE.view}">${continued.map(card).join("")}</div>` : "") +
      `<h2>${showGroups ? "All materials" : `${list.length} result${list.length === 1 ? "" : "s"}`}</h2>` +
      (list.length ? `<div class="lib${LSTATE.view}">${list.map(card).join("")}</div>`
        : `<div class="card"><h3>No materials match</h3><p>Try a different search or <button class="btn small ghost" id="libclear">clear all filters</button>.</p></div>`);
    const cq = $("#libclear");
    if (cq) cq.onclick = () => { LSTATE.q = ""; LSTATE.subj = ""; LSTATE.role = ""; $("#libq").value = ""; paintLib(docs); syncLibFilters(docs) };
    $("#rightRail").innerHTML = `<div class="ctx"><h3>Library</h3>
      <p class="rel">${docs.length} documents · ${LSTATE.view === "grid" ? "grid" : "list"} view · sorted by ${esc(LSTATE.sort)}</p>
      <h3>Legend</h3>      <p class="rel">Progress bars resume where you left off. “image-only” means no selectable text — search falls back to page images.</p></div>`;
  }
  function syncLibFilters(docs) {
    const subjs = [...new Set(docs.map(d => d.subject).filter(Boolean))].sort();
    $("#libsubj").innerHTML = `<option value="">All subjects</option>` + subjs.map(s => `<option>${esc(s)}</option>`).join("");
    $("#librole").value = ""; $("#libsort").value = LSTATE.sort;
  }
  return { data, homeSection, render };
})();

/* ================= Reader ================= */
Object.assign(window.Library, (function () {
  let R = null, keyH = null, saveT = null;
  let openSeq = 0, robs = null;
  const LADDER = [640, 1100, 1600, 2200];

  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { try { saveProgress(); } catch {} }, 800); }
  function flushSave() { clearTimeout(saveT); try { saveProgress(); } catch {} }
  function touchProgress(page) {
    if (!R) return;
    S.progress.reader = S.progress.reader || {};
    const e = S.progress.reader[R.doc.id] || { page: 1, updated: 0, opens: 0 };
    e.page = page; e.updated = Date.now();
    if (!R._counted) { e.opens = (e.opens || 0) + 1; R._counted = true; }
    S.progress.reader[R.doc.id] = e;
    saveSoon();
  }
  function notesOf() {
    S.progress.notes = S.progress.notes || {};
    if (!S.progress.notes[R.doc.id]) S.progress.notes[R.doc.id] = { bookmarks: [], notes: {} };
    return S.progress.notes[R.doc.id];
  }
  function onLeave(h) {
    if (!document.body.classList.contains("reader-open") && R) { flushSave(); R = null; }
    if (robs) { robs.disconnect(); robs = null; }
    if (keyH) { document.removeEventListener("keydown", keyH); keyH = null; }
    document.removeEventListener("click", closeMenuOutside);
    document.removeEventListener("keydown", escMenu);
    document.title = "Meridian — ISAD1000 Personal Wikipedia";
  }
  function imgUrl(page, w) { return window.pageImg ? window.pageImg(R.doc.rel, page, w) : ""; }
  function fitWidth() {
    const wrap = $("#rcanvaswrap");
    if (!wrap) return 1100;
    const avail = Math.max(200, (wrap.clientWidth || 900) - 32);
    const target = Math.min(avail, 1700) * Math.min(window.devicePixelRatio || 1, 2);
    return LADDER.find(w => w >= target) || 2200;
  }
  function curW() {
    if (!R) return 1100;
    if (R.fit === "page") {
      const img = $("#rimg");
      if (img && img.naturalWidth) {
        const wrapH = (img.closest(".ws-canvaswrap") || {}).clientHeight || 600;
        const availH = Math.max(200, wrapH - 8);
        return Math.min(2000, Math.max(320, Math.round(availH * (img.naturalWidth / Math.max(1, img.naturalHeight)))));
      }
      return 1100;
    }
    if (R.fit === "width") return fitWidth();
    return LADDER[R.zoomIdx];
  }
  function zoomLabel() {
    if (!R) return "";
    if (R.fit === "width") return "Fit W";
    if (R.fit === "page") return "Fit P";
    return Math.round(LADDER[R.zoomIdx] / 1100 * 100) + "%";
  }

  async function open(ref) {
    flushSave();
    const my = ++openSeq;
    const qi = String(ref || "").indexOf("?page=");
    const id = qi === -1 ? String(ref || "") : String(ref || "").slice(0, qi);
    const qpage = qi === -1 ? NaN : parseInt(String(ref || "").slice(qi + 6), 10);
    let docs = [];
    try { docs = await window.Library.data(); } catch (e) { docs = []; }
    if (my !== openSeq) return;
    let d = docs.find(function (x) { return x.id === id; });
    if (!d) {
      try { docs = await getJSON("/api/library?include_hidden=1"); d = docs.find(function (x) { return x.id === id; }); } catch (e) {}
      if (my !== openSeq) return;
    }
    if (!d || !d.pages) {
      $("#view").innerHTML = `<p class="crumbs"><a href="#/">Meridian</a> › <a href="#/library">Library</a> › <b>?</b></p>
        <div class="card"><h3>Document unavailable</h3><p>${!d ? "Unknown document." : "This file has no readable pages."} <a href="#/library">Back to library →</a></p></div>`;
      $("#rightRail").innerHTML = ""; return;
    }
    const saved = ((S.progress.reader || {})[id] || {}).page || 1;
    try { if (window.__ensureDocMap) await window.__ensureDocMap(); } catch (e) {}
    let hideR = false;
    try { hideR = !!localStorage.getItem("meridian-wshr"); } catch (e) {}
    R = { doc: d, page: Math.min(Math.max(1, qpage || saved || 1), d.pages), zoomIdx: 1, fit: "width",
          leftPane: "docs", panel: !hideR, tab: "related",
          search: { q: "", res: [], i: -1, seq: 0 }, textMode: false, ai: null, panes: {},
          lq: "", _draw: 0, _fitAdj: false, _drafts: {} };
    R.notes = (S.progress.notes || {})[d.id] || { bookmarks: [], notes: {} };
    touchProgress(R.page);
    document.title = d.title + " — Meridian";
    paintShell();
    goto(R.page, { first: true });
    paintBrowser(); paintPages(); paintPanel();
    if (keyH) document.removeEventListener("keydown", keyH);
    keyH = ev => {
      if (!location.hash.startsWith("#/read/")) return;
      const tag = (ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        if (ev.key === "Escape") ev.target.blur();
        return;
      }
      if (ev.key === "ArrowRight") goto(R.page + 1);
      else if (ev.key === "ArrowLeft") goto(R.page - 1);
      else if (ev.key === "+" || ev.key === "=") zoomStep(1);
      else if (ev.key === "-") zoomStep(-1);
      else if (ev.key.toLowerCase() === "f") toggleFS();
      else if (ev.key === "/") { ev.preventDefault(); toggleSearch(true); }
      else if (ev.key === "Escape") { const p = $("#rsearch"); if (p && !p.hidden) toggleSearch(false); }
    };
    document.addEventListener("keydown", keyH);
    markNav("");
  }

  function paintShell() {
    const d = R.doc;
    if (robs) { robs.disconnect(); robs = null; }
    document.removeEventListener("click", closeMenuOutside);
    document.removeEventListener("keydown", escMenu);
    let hideL = false, hideR = !R.panel;
    try {
      hideL = !!localStorage.getItem("meridian-wshl");
      hideR = !!localStorage.getItem("meridian-wshr");
      R.panel = !hideR;
    } catch (e) {}
    $("#view").innerHTML = `<div class="ws" id="reader"${hideL ? ' data-hidel="1"' : ""}${hideR ? ' data-hider="1"' : ""}>
      <div class="ws-top">
        <div class="ws-title">
          <button class="iconbtn" id="rback" aria-label="Back">‹</button>
          <button class="iconbtn ws-tgl" id="rdocbtn" title="Documents panel" aria-label="Toggle documents panel" aria-pressed="true">▤</button>
          <div class="wstitle"><b>${esc(d.title)}</b><span>${esc(d.subject || "")} · ${esc(d.role || "")} · ${d.pages} pages · ${d.type === "pdf" ? "PDF" : esc(d.type || "")}</span></div>
        </div>
        <div class="ws-groups" role="toolbar" aria-label="Reader controls">
          <div class="wsgroup" role="group" aria-label="Navigate">
            <button class="iconbtn" id="rprev" aria-label="Previous page">‹</button>
            <span class="rpage"><input id="rpage" type="number" min="1" max="${d.pages}" value="${R.page}" aria-label="Page number"><span class="rtotal">/ ${d.pages}</span></span>
            <button class="iconbtn" id="rnext" aria-label="Next page">›</button>
          </div>
          <div class="wsgroup" role="group" aria-label="Zoom">
            <button class="iconbtn" id="rzout" aria-label="Zoom out">−</button>
            <button class="rzoom" id="rzoom" title="Click to fit width">${zoomLabel()}</button>
            <button class="iconbtn" id="rzin" aria-label="Zoom in">+</button>
            <div class="seg" role="group" aria-label="Fit mode">
              <button id="rfitw" aria-pressed="${R.fit === "width"}">W</button><button id="rfitp" aria-pressed="${R.fit === "page"}">P</button>
            </div>
          </div>
          <div class="wsgroup" role="group" aria-label="View">
            <button class="iconbtn" id="rsearchbtn" title="Search in document (/)" aria-label="Search">⌕</button>
            <button class="iconbtn" id="rpagebtn" title="Page thumbnails" aria-label="Toggle page thumbnails" aria-pressed="${R.leftPane === "pages"}">▦</button>
            <button class="iconbtn" id="rpanelbtn" title="Study panel" aria-label="Toggle study panel" aria-pressed="${R.panel}">◧</button>
            <button class="iconbtn" id="rmore" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">⋯</button>
          </div>
        </div>
        <div class="wsover" id="rmenu" role="menu" hidden>
          <button role="menuitem" id="rtextbtn">Abc&ensp;Selectable text view</button>
          <button role="menuitem" id="rmarkbtn">☆&ensp;Bookmark this page</button>
          <button role="menuitem" id="rfs">⛶&ensp;Fullscreen</button>
          <a role="menuitem" id="rdl" href="${d.rel.split("/").map(encodeURIComponent).join("/")}" download>⤓&ensp;Download original</a>
          <button role="menuitem" id="rwreset">Reset panel widths</button>
        </div>
      </div>
      <div class="rsearch" id="rsearch" hidden>
        <input id="rsq" type="search" placeholder="Search in this document…" aria-label="Search in document">
        <button class="btn small ghost" id="rsprev" aria-label="Previous result">‹</button>
        <button class="btn small ghost" id="rsnext" aria-label="Next result">›</button>
        <span class="rel" id="rscount"></span>
        <ol class="rresults" id="rslist"></ol>
      </div>
      <div class="ws-main" id="wsmain">
        <aside class="ws-left" id="wsleft" aria-label="Document browser">
          <div class="ws-seg" role="tablist" aria-label="Left panel view">
            <button role="tab" data-lp="docs" aria-selected="${R.leftPane === "docs"}">Documents</button>
            <button role="tab" data-lp="pages" aria-selected="${R.leftPane === "pages"}">Pages</button>
          </div>
          <div class="ws-docs" id="wsdocs"${R.leftPane === "docs" ? "" : " hidden"}>
            <input id="wsq" type="search" placeholder="Filter documents…" aria-label="Filter documents">
            <div class="ws-doclist" id="wsdoclist" role="listbox" aria-label="Documents"></div>
            <p class="rel ws-foot"><a href="#/library">＋ Full library &amp; upload</a></p>
          </div>
          <div class="ws-pages" id="wspages"${R.leftPane === "pages" ? "" : " hidden"} aria-label="Page thumbnails"></div>
        </aside>
        <div class="ws-grip" data-grip="l" role="separator" aria-orientation="vertical" aria-label="Resize browser panel" tabindex="0"></div>
        <main class="ws-canvaswrap" id="rcanvaswrap" aria-label="Document">
          <div class="ws-canvas" id="rcanvas"><img id="rimg" alt="Page ${R.page} of ${esc(d.title)}"><pre class="rtext" id="rtext" hidden></pre><div class="ws-loading" id="rloading" hidden><span class="spin" aria-hidden="true"></span>Loading page…</div></div>
        </main>
        <div class="ws-grip" data-grip="r" role="separator" aria-orientation="vertical" aria-label="Resize study panel" tabindex="0"></div>
        <aside class="ws-right" id="rstudy" aria-label="Study tools">
          <div class="rtabs" role="tablist">
            ${["related", "practice", "notes"].map(t => `<button role="tab" data-tab="${t}" aria-selected="${R.tab === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
          </div>
          <div class="rpanel" id="rpanel"></div>
        </aside>
      </div></div>`;
    $("#rightRail").innerHTML = "";
    applyWsLayout();
    // toolbar wiring
    $("#rback").onclick = () => { if (history.length > 1) history.back(); else location.hash = "#/library"; };
    $("#rzout").onclick = () => zoomStep(-1);
    $("#rzin").onclick = () => zoomStep(1);
    $("#rzoom").onclick = () => setFit("width");
    $("#rfitw").onclick = () => setFit("width");
    $("#rfitp").onclick = () => setFit("page");
    $("#rprev").onclick = () => goto(R.page - 1);
    $("#rnext").onclick = () => goto(R.page + 1);
    $("#rpage").addEventListener("change", e => goto(+e.target.value || 1));
    $("#rdocbtn").onclick = e => toggleLeft();
    $("#rpagebtn").onclick = () => setLeftPane();
    $("#rpanelbtn").onclick = e => { setRight(!R.panel); };
    $("#rsearchbtn").onclick = () => toggleSearch();
    $("#rtextbtn").onclick = e => { R.textMode = !R.textMode; closeMenu(); drawPage(); toast(R.textMode ? "Text view — selectable text." : "Image view."); };
    $("#rmarkbtn").onclick = () => { toggleBookmark(); closeMenu(); };
    $("#rfs").onclick = () => { closeMenu(); toggleFS(); };
    $("#rdl").onclick = () => closeMenu();
    $("#rwreset").onclick = () => { try { localStorage.removeItem("meridian-wsl"); localStorage.removeItem("meridian-wsr"); } catch (e) {} applyWsLayout(true); closeMenu(); };
    $("#rmore").onclick = e => { e.stopPropagation(); toggleMenu(); };
    document.addEventListener("click", closeMenuOutside, { once: false });
    document.addEventListener("keydown", escMenu);
    $$("#rstudy [data-tab]").forEach(b => b.onclick = () => { R.tab = b.dataset.tab; paintPanel(); });
    let rsT = null;
    $("#rsq").addEventListener("input", e => { clearTimeout(rsT); rsT = setTimeout(() => runSearch(e.target.value.trim()), 250); });
    $("#rsq").addEventListener("keydown", e => { if (e.key === "Enter") stepSearch(1); });
    $("#rsprev").onclick = () => stepSearch(-1);
    $("#rsnext").onclick = () => stepSearch(1);
    $$("#wsleft [data-lp]").forEach(b => b.onclick = () => setLeftPane(b.dataset.lp));
    const wq = $("#wsq");
    if (wq) wq.addEventListener("input", () => paintBrowser(wq.value));
    // grip drag-resize
    $$(".ws-grip").forEach(g => { g.onpointerdown = ev => gripStart(ev, g); g.onkeydown = ev => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      const key = g.dataset.grip === "l" ? "meridian-wsl" : "meridian-wsr";
      let cur = 0;
      try { cur = parseInt(localStorage.getItem(key) || (g.dataset.grip === "l" ? "240" : "300"), 10); } catch (e) { cur = g.dataset.grip === "l" ? 240 : 300; }
      cur += (ev.key === "ArrowRight" ? 12 : -12);
      saveWsWidth(g.dataset.grip, cur);
    }; });
    // resize observer: refit on layout change, no window listener leaks
    if (typeof ResizeObserver !== "undefined") {
      robs = new ResizeObserver(() => { if (R && (R.fit === "width" || R.fit === "page")) drawPage(); });
      const cw = $("#rcanvaswrap");
      if (cw) robs.observe(cw);
    }
    syncMark();
  }
  function closeMenu() { const m = $("#rmenu"); if (m) { m.hidden = true; const b = $("#rmore"); if (b) b.setAttribute("aria-expanded", "false"); } }
  function closeMenuOutside(e) { const m = $("#rmenu"); if (m && !m.hidden && !e.target.closest("#rmenu") && !e.target.closest("#rmore")) closeMenu(); }
  function escMenu(e) { if (e.key === "Escape") closeMenu(); }
  function toggleMenu() {
    const m = $("#rmenu"); if (!m) return;
    const open = m.hidden;
    m.hidden = !open;
    $("#rmore").setAttribute("aria-expanded", open);
    if (open) { const f = m.querySelector("button, a"); if (f) f.focus(); }
  }
  function wsW(which, def, min, max) {
    let v = def;
    try { v = parseInt(localStorage.getItem(which === "l" ? "meridian-wsl" : "meridian-wsr") || def, 10) || def; } catch (e) {}
    return Math.min(max, Math.max(min, v));
  }
  function saveWsWidth(which, v) {
    const main = $("#wsmain");
    if (which === "l") v = Math.min(420, Math.max(150, v));
    else v = Math.min(520, Math.max(240, v));
    try { localStorage.setItem(which === "l" ? "meridian-wsl" : "meridian-wsr", String(v)); } catch (e) {}
    applyWsLayout();
  }
  function applyWsLayout(reset) {
    const ws = $("#reader"), main = $("#wsmain");
    if (!ws || !main) return;
    if (reset) { main.style.removeProperty("--wsl"); main.style.removeProperty("--wsr"); }
    else {
      // Inline vars beat the .hide-l/.hide-r class rules, so write 0px when hidden.
      main.style.setProperty("--wsl", ws.dataset.hidel ? "0px" : wsW("l", 240, 150, 420) + "px");
      main.style.setProperty("--wsr", (ws.dataset.hider || !R.panel) ? "0px" : wsW("r", 304, 240, 520) + "px");
    }
    ws.classList.toggle("hide-l", !!ws.dataset.hidel);
    ws.classList.toggle("hide-r", !!ws.dataset.hider);
    const tgl = $("#rdocbtn"), tgp = $("#rpanelbtn");
    if (tgl) tgl.setAttribute("aria-pressed", !ws.dataset.hidel);
    if (tgp) tgp.setAttribute("aria-pressed", !ws.dataset.hider);
  }
  function toggleLeft() {
    const ws = $("#reader"); if (!ws) return;
    if (ws.dataset.hidel) { delete ws.dataset.hidel; try { localStorage.removeItem("meridian-wshl"); } catch (e) {} }
    else { ws.dataset.hidel = "1"; try { localStorage.setItem("meridian-wshl", "1"); } catch (e) {} }
    applyWsLayout(); drawPage();
  }
  function setRight(on) {
    R.panel = on;
    const ws = $("#reader"); if (!ws) return;
    if (on) { delete ws.dataset.hider; try { localStorage.removeItem("meridian-wshr"); } catch (e) {} }
    else { ws.dataset.hider = "1"; try { localStorage.setItem("meridian-wshr", "1"); } catch (e) {} }
    applyWsLayout(); drawPage();
  }
  function setFit(mode) {
    if (!R) return;
    R.fit = mode; R.zoomIdx = 1; R._fitAdj = false;
    const w = $("#rfitw"), p = $("#rfitp");
    if (w) w.setAttribute("aria-pressed", mode === "width");
    if (p) p.setAttribute("aria-pressed", mode === "page");
    drawPage();
  }
  function gripStart(ev, g) {
    ev.preventDefault();
    try { g.setPointerCapture(ev.pointerId); } catch (e) {}
    const main = $("#wsmain");
    const rect = main.getBoundingClientRect();
    const move = e2 => {
      const x = e2.clientX - rect.left;
      if (g.dataset.grip === "l") saveWsWidth("l", Math.round(x));
      else saveWsWidth("r", Math.round(rect.right - e2.clientX));
    };
    const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); drawPage(); };
    g.addEventListener("pointermove", move);
    g.addEventListener("pointerup", up);
    g.addEventListener("pointercancel", up);
  }

  function goto(p, opts) {
    if (!R) return;
    p = Math.min(Math.max(1, p || 1), R.doc.pages);
    const changed = p !== R.page;
    R.page = p;
    R._fitAdj = false;
    const inp = $("#rpage"); if (inp) inp.value = p;
    drawPage();
    paintThumbActive();
    if (changed || (opts && opts.first)) touchProgress(p);
    if (R.textMode) loadText();
    syncMark();
    if (R.panes.notes && R.panes.notes.isConnected) updateNotesPane();
  }
  function drawPage() {
    if (!R) return;
    const img = $("#rimg"), txt = $("#rtext"), load = $("#rloading");
    if (!img) return;
    const w = curW();
    const my = ++R._draw;
    if (load) load.hidden = false;
    const done = ok => {
      if (!R || my !== R._draw) return;
      img.style.opacity = "1";
      if (load) load.hidden = true;
      if (!ok) img.alt = "Page failed to render";
    };
    if (R.textMode) {
      img.hidden = true; txt.hidden = false;
      if (load) load.hidden = true;
      const canvas = $("#rcanvas");
      if (canvas) { canvas.style.width = "100%"; canvas.style.maxWidth = "100%"; }
      loadText();
    }
    else {
      txt.hidden = true; img.hidden = false;
      // Fit-width fills the wrap; fixed modes size the canvas in px so
      // zoomed pages genuinely overflow and scroll (block auto-margins
      // keep narrow pages centred and let wide pages scroll right).
      const canvas = $("#rcanvas");
      if (R.fit === "width") {
        if (canvas) { canvas.style.width = "100%"; canvas.style.maxWidth = "100%"; }
      } else {
        if (canvas) { canvas.style.width = w + "px"; canvas.style.maxWidth = "none"; }
      }
      img.style.width = "100%";
      const url = window.pageImg ? window.pageImg(R.doc.rel, R.page, w) : "";
      if (img.dataset.u !== url) {
        img.dataset.u = url;
        img.dataset.w = w;
        img.style.opacity = ".35";
        img.onload = () => {
          if (!R || my !== R._draw) return;
          done(true);
          // Fit-to-page needs natural size before it can pick a width, so allow
          // at most one corrective pass per page and only when the width moved.
          if (R.fit === "page" && !R._fitAdj) {
            R._fitAdj = true;
            const nw = curW();
            const oldW = parseInt(img.dataset.w || "0", 10);
            if (oldW && Math.abs(nw - oldW) / oldW > 0.08) drawPage();
          }
        };
        img.onerror = () => done(false);
        img.src = url;
      } else { img.style.opacity = "1"; if (load) load.hidden = true; }
    }
    const zl = $("#rzoom"); if (zl) zl.textContent = zoomLabel();
    const fw = $("#rfitw"), fp = $("#rfitp");
    if (fw) fw.setAttribute("aria-pressed", R.fit === "width");
    if (fp) fp.setAttribute("aria-pressed", R.fit === "page");
    [R.page + 1, R.page + 2, R.page - 1].forEach(p => {
      if (p >= 1 && p <= R.doc.pages) { const im = new Image(); if (window.pageImg) im.src = window.pageImg(R.doc.rel, p, w); }
    });
  }
  function zoomStep(d) {
    if (!R) return;
    R.fit = null;
    R._fitAdj = false;
    R.zoomIdx = Math.min(3, Math.max(0, R.zoomIdx + d));
    drawPage();
  }
  function toggleFS() {
    const el = $("#reader");
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen && el.requestFullscreen().catch(() => toast("Fullscreen blocked by browser."));
  }
  function toggleBookmark() {
    const n = R.notes;
    const i = n.bookmarks.indexOf(R.page);
    if (i >= 0) n.bookmarks.splice(i, 1); else n.bookmarks.push(R.page);
    n.bookmarks.sort((a, b) => a - b);
    S.progress.notes = S.progress.notes || {};
    S.progress.notes[R.doc.id] = n;
    saveSoon(); syncMark();
    if (R.tab === "notes") paintPanel();
    toast(i >= 0 ? "Bookmark removed." : "Page bookmarked.");
  }
  function syncMark() {
    const b = $("#rmarkbtn");
    if (b) { const on = (R.notes.bookmarks || []).includes(R.page); b.textContent = on ? "★" : "☆"; b.setAttribute("aria-pressed", on); }
  }

  /* ---------- left browser: docs + pages ---------- */
  let browserDocs = null;
  async function paintBrowser(filter) {
    const box = $("#wsdoclist");
    if (!box || !R) return;
    if (!browserDocs) {
      try { browserDocs = await getJSON("/api/library"); }
      catch (e) { box.innerHTML = `<p class="rel" style="padding:.4rem">Library unavailable.</p>`; return; }
    }
    const prog = S.progress.reader || {};
    const q = (filter !== undefined ? filter : R.lq || "").trim().toLowerCase();
    R.lq = filter !== undefined ? filter : R.lq;
    const scored = browserDocs.filter(d => d.pages > 0).map(d => {
      const pr = prog[d.id];
      return { d, score: pr && pr.page ? 100000 + (pr.updated || 0) : 0 };
    });
    const list = scored
      .filter(({ d }) => !q || (d.title + " " + d.file + " " + (d.subject || "")).toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score || a.d.title.localeCompare(b.d.title));
    box.innerHTML = list.length ? list.map(({ d }) => {
      const pr = prog[d.id];
      const on = d.id === R.doc.id;
      return `<button class="ws-doc${on ? " on" : ""}" data-doc="${d.id}" role="option" aria-selected="${on}" title="${esc(d.title)}${pr && pr.page ? ` — p.${pr.page}/${d.pages}` : ""}">
        <span class="ws-doc-t">${esc(d.title)}</span>
        <span class="ws-doc-m">${d.pages}p · ${esc(d.subject || d.role || "")}${pr && pr.page ? ` · <b>p.${pr.page}</b>` : ""}</span>
        ${pr && pr.page ? `<span class="pbar"><i style="width:${Math.round(100 * pr.page / Math.max(1, d.pages))}%"></i></span>` : ""}
      </button>`;
    }).join("") : `<p class="rel" style="padding:.4rem">No documents match.</p>`;
    box.querySelectorAll("[data-doc]").forEach(b => b.onclick = () => {
      if (b.dataset.doc !== R.doc.id) location.hash = "#/read/" + b.dataset.doc;
    });
  }
  function paintPages() {
    const box = $("#wspages");
    if (!box || !R) return;
    if (!box.dataset.built) {
      let html = "";
      for (let p = 1; p <= R.doc.pages; p++) {
        html += `<button class="rthumb" data-p="${p}" aria-label="Page ${p}"><img loading="lazy" src="${window.pageImg ? window.pageImg(R.doc.rel, p, 160) : ""}" alt=""><span>${p}</span></button>`;
      }
      box.innerHTML = html;
      box.querySelectorAll(".rthumb").forEach(b => b.onclick = () => goto(+b.dataset.p));
      box.dataset.built = "1";
    }
    paintThumbActive();
  }
  function paintThumbActive() {
    const box = $("#wspages");
    if (!box || !R) return;
    if (!box.offsetParent) {
      box.querySelectorAll(".rthumb").forEach(b => b.classList.toggle("on", +b.dataset.p === R.page));
      return;
    }
    box.querySelectorAll(".rthumb").forEach(b => {
      const on = +b.dataset.p === R.page;
      b.classList.toggle("on", on);
      if (on) b.scrollIntoView({ block: "nearest" });
    });
  }
  function setLeftPane(which) {
    if (!R) return;
    // Toolbar toggle flips docs<->pages; the panel itself is hidden only via #rdocbtn.
    if (!which) which = R.leftPane === "pages" ? "docs" : "pages";
    R.leftPane = which;
    $$("#wsleft [data-lp]").forEach(b => b.setAttribute("aria-selected", b.dataset.lp === which));
    const d = $("#wsdocs"), p = $("#wspages");
    if (d) d.hidden = which !== "docs";
    if (p) p.hidden = which !== "pages";
    const t = $("#rpagebtn");
    if (t) t.setAttribute("aria-pressed", which === "pages");
    if (which === "pages") paintThumbActive();
  }

  /* ---------- in-document search ---------- */
  let sqT = null;
  function toggleSearch(force) {
    const p = $("#rsearch");
    if (!p) return;
    p.hidden = force !== undefined ? !force : !p.hidden;
    if (!p.hidden) setTimeout(() => $("#rsq").focus(), 0);
  }
  async function runSearch(q) {
    const list = $("#rslist"), cnt = $("#rscount");
    const seq = ++R.search.seq;
    R.search = { q, res: [], i: -1, seq };
    if (!q) { list.innerHTML = ""; cnt.textContent = ""; return; }
    cnt.textContent = "Searching…";
    try {
      const d = await window.staticDocSearch(R.doc.rel, q);
      if (!R || seq !== R.search.seq) return; // stale response
      R.search.res = d.results || [];
      paintSearch();
    } catch { if (R && seq === R.search.seq) cnt.textContent = "Search failed."; }
  }
  function paintSearch() {
    const { res, i } = R.search, list = $("#rslist"), cnt = $("#rscount");
    cnt.textContent = res.length ? `${res.length} match${res.length === 1 ? "" : "es"}` : (R.search.q ? "No matches in this document." : "");
    list.innerHTML = res.map((r, k) => `<li data-i="${k}" class="${k === i ? "on" : ""}"><button><b>p.${r.page}</b> — ${esc(r.snippet)}</button></li>`).join("");
    list.querySelectorAll("li").forEach(li => li.onclick = () => {
      R.search.i = +li.dataset.i; paintSearch();
      const r = R.search.res[R.search.i];
      goto(r.page); flashPage();
    });
  }
  function stepSearch(d) {
    const { res } = R.search;
    if (!res.length) return;
    R.search.i = (R.search.i + d + res.length) % res.length;
    paintSearch();
    goto(R.search.res[R.search.i].page); flashPage();
  }
  function flashPage() {
    const c = $("#rcanvas");
    if (!c) return;
    c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
  }
  async function loadText() {
    const txt = $("#rtext");
    if (!txt || !R.textMode) return;
    txt.textContent = "Loading text…";
    try {
      const d = await window.staticDocText(R.doc.rel, R.page);
      txt.textContent = (d.text || "").trim() || "[No selectable text on this page — see the page image.]";
    } catch { txt.textContent = "[Text unavailable for this page.]"; }
  }

  /* ---------- study panel ---------- */
  async function paintPanel() {
    const box = $("#rpanel");
    if (!box || !R) return;
    $$("#rstudy [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === R.tab));
    R.panes = R.panes || {};
    if (!R.panes[R.tab]) {
      const div = document.createElement("div");
      div.dataset.pane = R.tab;
      R.panes[R.tab] = div;
      await buildPane(R.tab, div);
      if (!R || R.panes[R.tab] !== div) return;
    }
    if (box.firstChild !== R.panes[R.tab]) { box.innerHTML = ""; box.appendChild(R.panes[R.tab]); }
    if (R.tab === "notes") updateNotesPane();
    if (R.tab === "practice" && window.ACTUI && window.ACTUI.after && !R.panes[R.tab]._wired) {
      R.panes[R.tab]._wired = true;
      window.ACTUI.after(R.panes[R.tab]);
    }
  }
  async function buildPane(tab, el) {
    if (tab === "related") {
      el.innerHTML = "<p class='rel'>Loading linked articles…</p>";
      try {
        const rel = await getJSON("/api/related?src=" + encodeURIComponent(R.doc.rel));
        el.innerHTML = rel.length ? rel.map(a =>
          '<div class="relcard"><b><a href="#/article/' + a.id + '">' + esc(a.title) + "</a></b>" +
          "<p class='rel'>" + esc((a.summary || "").slice(0, 140)) + "…</p>" +
          "<p class='rel'>Cited on: " + a.locators.map(esc).join(" · ") + "</p>" +
          '<p><button class="btn small ghost" data-open="' + a.id + '">Open article</button> ' +
          "<span class='rel'>" + a.questions + " questions</span></p></div>").join("")
          : "<p class='rel'>No articles cite this file yet — it may be background reading.</p>";
        el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { flushSave(); location.hash = "#/article/" + b.dataset.open; });
      } catch (e) { el.innerHTML = "<p class='rel'>Related articles unavailable.</p>"; }
    } else if (tab === "practice") {
      el.innerHTML = "<p class='rel prac-status'>Loading practice linked to this file…</p><div id='pracout'></div>";
      try {
        const acts = await getJSON("/api/activities-for?src=" + encodeURIComponent(R.doc.rel));
        const st = el.querySelector(".prac-status");
        if (st) st.remove();
        const out = el.querySelector("#pracout");
        if (out) {
          out.innerHTML = acts.length && window.ACTUI ? acts.map(a => window.ACTUI.render(a)).join("") : "<p class='rel'>No linked practice yet.</p>";
          if (window.ACTUI && window.ACTUI.after) window.ACTUI.after(out);
        }
      } catch (e) {
        const st = el.querySelector(".prac-status");
        if (st) st.textContent = "Practice unavailable.";
        const out = el.querySelector("#pracout");
        if (out) out.innerHTML = "";
      }
    } else if (tab === "notes") {
      buildNotesPane(el);
      updateNotesPane();
    }
  }
  function buildNotesPane(el) {
    el.innerHTML =
      "<p><button class='btn small ghost' id='bmbtn'></button></p>" +
      "<p class='rel' id='nbmarks'></p>" +
      "<h4>Note on p. <span id='nhdr'>1</span></h4>" +
      "<p><textarea id='notein' rows='3' placeholder='Write a note for this page…' aria-label='Note for this page'></textarea></p>" +
      "<p><button class='btn small' id='notesave'>Save note</button></p>" +
      "<h4>All notes (<span id='ncount'>0</span>)</h4><div id='nlist'></div>";
    el.querySelector("#notein").addEventListener("input", e => { R._drafts[R.page] = e.target.value; });
    el.querySelector("#bmbtn").onclick = () => { toggleBookmark(); updateNotesPane(); };
    el.querySelector("#notesave").onclick = () => {
      const v = el.querySelector("#notein").value.trim();
      if (v) R.notes.notes[R.page] = v; else delete R.notes.notes[R.page];
      delete R._drafts[R.page];
      S.progress.notes[R.doc.id] = R.notes; saveSoon(); updateNotesPane();
      toast(v ? "Note saved." : "Note cleared.");
    };
    el.querySelector("#nlist").addEventListener("click", e => {
      const j = e.target.closest("[data-jump]");
      if (j) { goto(+j.dataset.jump); return; }
      const d = e.target.closest("[data-delnote]");
      if (d) {
        delete R.notes.notes[+d.dataset.delnote];
        S.progress.notes[R.doc.id] = R.notes; saveSoon(); updateNotesPane();
      }
    });
  }
  function updateNotesPane() {
    const pane = R.panes && R.panes.notes;
    if (!pane || !pane.isConnected) return;
    const n = R.notes || { bookmarks: [], notes: {} };
    const cur = pane.querySelector("#notein");
    if (cur) cur.value = (R._drafts[R.page] !== undefined) ? R._drafts[R.page] : (n.notes[R.page] || "");
    const bm = pane.querySelector("#bmbtn");
    if (bm) bm.textContent = (n.bookmarks || []).indexOf(R.page) >= 0 ? "★ Bookmarked — remove" : "☆ Bookmark this page";
    const bl = pane.querySelector("#nbmarks");
    if (bl) bl.innerHTML = (n.bookmarks || []).length ? "Bookmarks: " + n.bookmarks.map(p => '<button class="linklike" data-jump="' + p + '">p.' + p + "</button>").join(" · ") : "No bookmarks yet.";
    const hd = pane.querySelector("#nhdr");
    if (hd) hd.textContent = R.page;
    const items = Object.keys(n.notes || {}).map(Number).sort((a, b) => a - b);
    const nc = pane.querySelector("#ncount");
    if (nc) nc.textContent = items.length;
    const nl = pane.querySelector("#nlist");
    if (nl) nl.innerHTML = items.length ? items.map(p => '<div class="notecard"><b>p. ' + p + "</b><p>" + esc(n.notes[p]) + "</p>" +
      '<p><button class="btn small ghost" data-jump="' + p + '">Jump</button> ' +
      '<button class="btn small ghost" data-delnote="' + p + '">Delete</button></p></div>').join("")
      : "<p class='rel'>No notes yet. Notes live on pages and survive refreshes.</p>";
    pane.querySelectorAll("[data-jump]").forEach(x => x.onclick = () => goto(+x.getAttribute("data-jump")));
  }

  function wireGlobal() {
    // Boot hook called by app.js alongside the other module wire fns.
    // The reader is route-driven (reader()/onLeave()), so there is no
    // global chrome to wire; the hook exists to keep the contract.
  }

  return { reader: open, onLeave: onLeave, wireGlobal: wireGlobal };
})());
