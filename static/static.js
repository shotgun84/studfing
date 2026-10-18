/* studfing static build — replaces every /api + /files backend call with
   precomputed files under api/, page renders under static/img/, and small
   client-side mirrors of search/docsearch. No server required. */
"use strict";
(function () {
  let docmapP = null, textCache = {}, pvidxP = null;

  function ensureDocMap() {
    if (!docmapP) docmapP = fetch("api/docmap.json").then(r => {
      if (!r.ok) throw new Error("docmap " + r.status);
      return r.json();
    }).then(m => (window.__DOCMAP__ = m));
    return docmapP;
  }
  window.__ensureDocMap = ensureDocMap;
  // kick off early so rel->id is ready before any render
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => ensureDocMap().catch(() => {}));
  else ensureDocMap().catch(() => {});

  function idOf(rel) {
    const m = window.__DOCMAP__ || {};
    return m[rel] || null;
  }

  /* Map a backend URL to a static file. Returns:
     string -> fetch this path instead | null -> resolve as null (no fetch)
     undefined -> leave the URL untouched (will 404 on static hosts; existing
     catch-paths handle those). */
  async function staticResolve(url) {
    const u = String(url);
    if (!u.startsWith("/api/")) {
      if (u.startsWith("/files/")) {
        const rel = decodeURIComponent(u.slice(7).split("?")[0]);
        return rel.split("/").map(encodeURIComponent).join("/");
      }
      return undefined;
    }
    let parsed;
    try { parsed = new URL(u, location.origin); }
    catch (e) { return undefined; }
    const path = parsed.pathname, q = parsed.searchParams;
    const simple = {
      "/api/articles": "api/articles.json",
      "/api/questions": "api/questions.json",
      "/api/graph": "api/graph.json",
      "/api/coverage": "api/coverage.json",
      "/api/sources": "api/sources.json",
      "/api/library": "api/library.json",
      "/api/health": "api/health.json"
    };
    if (simple[path]) return simple[path];
    if (path.startsWith("/api/article/")) {
      return "api/article/" + path.slice(13).split("/").map(encodeURIComponent).join("/") + ".json";
    }
    const src = q.get("src") || "";
    if (path === "/api/related" || path === "/api/activities-for" || path === "/api/preview-pages") {
      try { await ensureDocMap(); } catch (e) { return undefined; }
      const id = idOf(src);
      if (!id) return undefined;
      const base = path === "/api/related" ? "related" : path === "/api/activities-for" ? "activities-for" : "preview-pages";
      return `api/${base}/${id}.json`;
    }
    if (path === "/api/preview") {
      try { await ensureDocMap(); } catch (e) { return undefined; }
      const id = idOf(src);
      if (!id || !/^\d+$/.test(q.get("page") || "")) return undefined;
      return `api/preview/${id}-p${q.get("page")}.json`;
    }
    if (path === "/api/progress") return null;
    return undefined; // /api/search, /api/docsearch, /api/doctext, /api/page-image -> client-side below
  }
  window.staticResolve = staticResolve;

  /* Page renders: pre-baked at 320 (thumbs) and 1600 (reading/zoom). */
  const WIDTHS = [320, 1600];
  window.pageImg = function (rel, page, w) {
    const id = idOf(rel);
    if (!id) return "";
    w = +w || 320;
    let best = WIDTHS[0];
    for (const x of WIDTHS) if (Math.abs(x - w) < Math.abs(best - w)) best = x;
    return `static/img/${id}/p${page}-${best}.jpg`;
  };

  /* Per-document extracted text (powers text view + in-document search). */
  async function docText(rel) {
    if (textCache[rel]) return textCache[rel];
    try { await ensureDocMap(); } catch (e) { return []; }
    const id = idOf(rel);
    if (!id) return [];
    try {
      const d = await (await fetch(`api/text/${id}.json`)).json();
      textCache[rel] = d.pages || [];
    } catch (e) { textCache[rel] = []; }
    return textCache[rel];
  }
  window.docText = docText;

  function snippet(txt, i) {
    return txt.replace(/\s+/g, " ").slice(Math.max(0, i - 70), i + 110).trim();
  }

  /* Client mirror of api_docsearch: every token must match; snippet at first token. */
  window.staticDocSearch = async function (rel, query) {
    const q = String(query || "").trim().toLowerCase();
    const toks = (q.match(/[a-z0-9]+/g) || []);
    if (!toks.length) return { results: [] };
    const pages = await docText(rel);
    const out = [];
    for (const p of pages) {
      const low = (p.text || "").toLowerCase();
      if (toks.every(t => low.includes(t))) {
        out.push({ page: p.page, snippet: snippet(p.text || "", low.indexOf(toks[0])) });
        if (out.length >= 40) break;
      }
    }
    return { results: out };
  };
  window.staticDocText = async function (rel, page) {
    const pages = await docText(rel);
    const hit = pages.find(p => p.page === +page);
    return { source: rel, page: +page, text: hit ? hit.text : "" };
  };

  /* Client mirror of api_search (articles, questions, sources, slides). */
  function pvidx() {
    if (!pvidxP) pvidxP = fetch("data/preview_index.json").then(r => r.json()).catch(() => ({}));
    return pvidxP;
  }
  async function allTexts() {
    try { await ensureDocMap(); } catch (e) {}
    const map = window.__DOCMAP__ || {};
    await Promise.all(Object.keys(map).map(docText).map(p => p.catch(() => [])));
  }
  window.staticSearch = async function (query) {
    const q = String(query || "").trim().toLowerCase();
    const toks = (q.match(/[a-z0-9]+/g) || []);
    if (!toks.length) return { results: [] };
    const out = [];
    for (const a of ((typeof S !== "undefined" && S.articles) || [])) {
      const title = (a.title || "").toLowerCase();
      let s = q && title.includes(q) ? 60 : 0;
      for (const t of toks) {
        if (title.includes(t)) s += 18;
        if ((a.summary || "").toLowerCase().includes(t)) s += 5;
        if ((a.category || "").toLowerCase().includes(t)) s += 4;
      }
      if (s) out.push({ kind: "Article", id: a.id, title: a.title, sub: a.category, score: s });
    }
    for (const qu of (((typeof S !== "undefined") && S.questions) || [])) {
      const hay = ((qu.id || "") + " " + (qu.prompt || qu.title || "") + " " + (qu.source || "") + " " + (qu.detail || "")).toLowerCase();
      let s = toks.reduce((n, t) => n + (hay.includes(t) ? 10 : 0), 0);
      if ((qu.id || "").toLowerCase() === q.replace(/ /g, "")) s += 80;
      if (q && (qu.source || "").toLowerCase().includes(q)) s += 12;
      if (s) {
        const kind = { "past-paper": "Past paper", "worksheet": "Worksheet" }[qu.origin] || "Practice";
        out.push({ kind, id: "q:" + qu.id, title: String(qu.prompt || qu.title || "").slice(0, 90), sub: `${qu.id} · ${qu.source || ""}`, score: s });
      }
    }
    for (const s_ of (((typeof S !== "undefined") && S.sources) || [])) {
      const fn = ((s_.file || "")).toLowerCase();
      if (q && fn.includes(q) || toks.some(t => fn.includes(t))) {
        const rel = s_.rel || s_.file || "";
        out.push({ kind: "Source", id: "src:" + rel, title: s_.file, sub: s_.role || "", score: 30 });
      }
    }
    try {
      const idx = await pvidx();
      await allTexts();
      let slides = 0;
      outer: for (const rel of Object.keys(window.__DOCMAP__ || {})) {
        const pages = textCache[rel] || [];
        for (const p of pages) {
          if (!idx[`${rel}::p${p.page}`]) continue;
          const low = (p.text || "").toLowerCase();
          if (toks.every(t => low.includes(t))) {
            const fname = rel.split("/").pop();
            out.push({ kind: "Slide", id: `slide:${rel}:${p.page}`, title: `${fname} — p.${p.page}`, sub: snippet(p.text || "", low.indexOf(toks[0])).slice(0, 140), score: 22 });
            if (++slides >= 8) break outer;
          }
        }
      }
    } catch (e) {}
    out.sort((a, b) => b.score - a.score);
    return { results: out.slice(0, 16).map(({ score, ...r }) => r) };
  };
})();
