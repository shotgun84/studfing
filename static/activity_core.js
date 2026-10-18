/* Meridian activity_core — pure, DOM-free activity logic (UMD: browser global ACT + node require).
   All state transitions are pure functions on plain objects so they can be unit-tested. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.ACT = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- text normalization for short answers ---------- */
  function norm(s) {
    return String(s ?? "").toLowerCase()
      .replace(/[\u2018\u2019\u201c\u201d]/g, m => ({ "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"' }[m]))
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function shortCheck(given, accepted) {
    const g = norm(given);
    if (!g) return { ok: false, empty: true };
    const list = (Array.isArray(accepted) ? accepted : [accepted]).map(norm);
    return { ok: list.some(a => a && a === g), empty: false };
  }

  /* ---------- single-select ---------- */
  function selectCheck(pick, answerIndex) {
    return { ok: pick === answerIndex };
  }

  /* ---------- fill-in-the-blank state ----------
     state: { blanks: [tileId|null...], bank: [tileId...] } ; tiles: {id:{text,reusable}} */
  function fibInit(tiles, nBlanks) {
    return { blanks: Array(nBlanks).fill(null), bank: tiles.map(t => t.id) };
  }
  function fibPlace(state, tilesById, tileId, blankIdx) {
    const t = tilesById[tileId];
    if (!t || blankIdx < 0 || blankIdx >= state.blanks.length) return { state, error: "bad-target" };
    const blanks = state.blanks.slice();
    let bank = state.bank.slice();
    if (!t.reusable) {
      const bi = bank.indexOf(tileId);
      if (bi === -1 && blanks[blankIdx] !== tileId) return { state, error: "tile-used" };
      if (bi !== -1) bank.splice(bi, 1);
    }
    const prev = blanks[blankIdx];
    if (prev && prev !== tileId) {
      const pt = tilesById[prev];
      if (pt && !pt.reusable && bank.indexOf(prev) === -1) bank.push(prev);
    }
    blanks[blankIdx] = tileId;
    return { state: { blanks, bank }, error: null };
  }
  function fibRemove(state, tilesById, blankIdx) {
    if (blankIdx < 0 || blankIdx >= state.blanks.length) return { state, error: "bad-target" };
    const blanks = state.blanks.slice();
    const prev = blanks[blankIdx];
    blanks[blankIdx] = null;
    let bank = state.bank.slice();
    const pt = tilesById[prev];
    if (prev && pt && !pt.reusable && bank.indexOf(prev) === -1) bank.push(prev);
    return { state: { blanks, bank }, error: null };
  }
  function fibScore(state, answers) {
    // answers: array of accepted tileId arrays per blank
    const per = state.blanks.map((t, i) => t !== null && (answers[i] || []).indexOf(t) !== -1);
    const done = state.blanks.every(t => t !== null);
    return { per, done, correct: per.filter(Boolean).length, total: answers.length,
             ok: done && per.every(Boolean) };
  }

  /* ---------- ordering ---------- */
  function orderScore(currentIds, correctIds) {
    const per = currentIds.map((id, i) => id === correctIds[i]);
    const correct = per.filter(Boolean).length;
    return { per, correct, total: correctIds.length, ok: correct === correctIds.length };
  }
  function moveItem(ids, from, to) {
    const arr = ids.slice();
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return { ids: arr, error: "bad-index" };
    const [it] = arr.splice(from, 1);
    arr.splice(to, 0, it);
    return { ids: arr, error: null };
  }

  /* ---------- matching ---------- */
  function matchScore(pairs, key) {
    // pairs: {leftId: rightId}; key: {leftId: correctRightId}
    const lefts = Object.keys(key);
    const per = {};
    lefts.forEach(l => { per[l] = pairs[l] === key[l]; });
    const correct = lefts.filter(l => per[l]).length;
    const done = lefts.every(l => pairs[l] !== undefined);
    return { per, done, correct, total: lefts.length, ok: done && correct === lefts.length };
  }

  /* ---------- decision trees ---------- */
  function treeStep(nodes, nodeId, optIdx) {
    const n = nodes[nodeId];
    if (!n || n.ending) return { error: "bad-node" };
    const opt = (n.options || [])[optIdx];
    if (!opt || !nodes[opt.to]) return { error: "bad-branch" };
    return { next: opt.to, note: opt.note || null, error: null };
  }
  /* Current node after a history of {node,pick} choices.
     Critical: the current node is the DESTINATION of the last choice,
     not the node the last choice was made from. */
  function treeCurrent(nodes, start, hist) {
    let cur = start;
    for (const h of (hist || [])) {
      const r = treeStep(nodes, h.node, h.pick);
      if (r.error) return { node: null, error: r.error };
      cur = r.next;
    }
    if (!nodes[cur]) return { node: null, error: "bad-node" };
    return { node: cur, error: null };
  }
  function validateTree(nodes, start) {
    const errs = [];
    if (!nodes[start]) { errs.push("missing start node: " + start); return errs; }
    Object.keys(nodes).forEach(id => {
      const n = nodes[id];
      (n.options || []).forEach((o, i) => {
        if (!o.label) errs.push(id + ": option " + i + " missing label");
        if (!nodes[o.to]) errs.push(id + ": option " + i + " bad destination " + o.to);
      });
      if (n.ending && !n.debrief) errs.push(id + ": ending missing debrief");
    });
    // reachability from start
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const n = nodes[stack.pop()];
      if (!n) continue;
      (n.options || []).forEach(o => { if (nodes[o.to] && !seen.has(o.to)) { seen.add(o.to); stack.push(o.to); } });
    }
    Object.keys(nodes).forEach(id => { if (!seen.has(id)) errs.push("unreachable node: " + id); });
    // cycle detection (forward-graph must be a DAG; back-navigation uses history)
    const WHITE = 0, GRAY = 1, BLACK = 2, color = {};
    Object.keys(nodes).forEach(id => color[id] = WHITE);
    let cyclic = false;
    const dfs = id => {
      color[id] = GRAY;
      for (const o of (nodes[id].options || [])) {
        if (!nodes[o.to]) continue;
        if (color[o.to] === GRAY) { cyclic = true; return; }
        if (color[o.to] === WHITE) dfs(o.to);
      }
      color[id] = BLACK;
    };
    dfs(start);
    if (cyclic) errs.push("forward graph contains a cycle (use history for back-navigation, not graph cycles)");
    // every path must be able to reach an ending
    const canEnd = {};
    const ends = id => {
      if (!nodes[id]) return false;
      if (canEnd[id] !== undefined) return canEnd[id];
      const n = nodes[id];
      if (n.ending) return (canEnd[id] = true);
      canEnd[id] = false; // break recursion optimistically; DAG so safe
      const r = (n.options || []).some(o => ends(o.to));
      canEnd[id] = r;
      return r;
    };
    Object.keys(nodes).forEach(id => { if (!ends(id)) errs.push("dead-end without ending: " + id); });
    return errs;
  }

  /* ---------- activity schema validation (runtime guard; deep validation lives in tests) ---------- */
  const TYPES = ["tf", "mcq", "fib", "order", "match", "hotspot", "code", "short", "tree"];
  function validateActivity(a, ctx) {
    // ctx: {articleIds:Set, visualIndex:{articleId:{visualId:{nodes:[{id}],hotspots:[...]}}}}
    const errs = [];
    if (!a || typeof a !== "object") return ["not an object"];
    if (!a.id) errs.push("missing id");
    if (!TYPES.includes(a.type)) errs.push("bad type: " + a.type);
    if (a.version !== 1) errs.push("unsupported version (want 1)");
    if (!a.prompt) errs.push("missing prompt");
    if (!a.explanation) errs.push("missing explanation");
    if (a.type === "tf" || a.type === "mcq") {
      const n = (a.options || []).length;
      if (a.type === "tf" && n !== 2) errs.push("tf needs exactly 2 options");
      if (a.type === "mcq" && n < 2) errs.push("mcq needs >=2 options");
      if (!(a.answerIndex >= 0 && a.answerIndex < n)) errs.push("bad answerIndex");
    }
    if (a.type === "fib") {
      const texts = (a.text || []);
      const blanks = texts.join(" ").split("___").length - 1;
      if (!blanks) errs.push("fib text has no ___ blanks");
      if (!Array.isArray(a.tiles) || !a.tiles.length) errs.push("fib needs tiles");
      const ids = new Set((a.tiles || []).map(t => t.id));
      if (ids.size !== (a.tiles || []).length) errs.push("duplicate tile ids");
      (a.answers || []).forEach((acc, i) => {
        (Array.isArray(acc) ? acc : [acc]).forEach(tid => {
          if (!ids.has(tid)) errs.push("fib answer[" + i + "] unknown tile " + tid);
        });
      });
      if ((a.answers || []).length !== blanks) errs.push("fib answers/blanks mismatch");
    }
    if (a.type === "order") {
      const ids = (a.items || []).map(x => x.id);
      if (ids.length < 2) errs.push("order needs >=2 items");
      if (new Set(ids).size !== ids.length) errs.push("duplicate order item ids");
      (a.correct || []).forEach(id => { if (!ids.includes(id)) errs.push("order correct[] unknown id " + id); });
      if ((a.correct || []).length !== ids.length) errs.push("order correct[] must list every item");
    }
    if (a.type === "match") {
      const L = new Set((a.left || []).map(x => x.id)), R = new Set((a.right || []).map(x => x.id));
      if (!L.size || !R.size) errs.push("match needs left+right sets");
      Object.keys(a.key || {}).forEach(l => {
        if (!L.has(l)) errs.push("match key unknown left " + l);
        if (!R.has(a.key[l])) errs.push("match key bad right for " + l);
      });
      if (Object.keys(a.key || {}).length !== L.size) errs.push("match key must cover every left item");
    }
    if (a.type === "hotspot") {
      const v = ctx && ctx.visualIndex && ctx.visualIndex[a.article] && ctx.visualIndex[a.article][a.visual];
      if (!v) errs.push("hotspot refs unknown visual " + a.visual);
      else {
        const ok = (v.nodes || []).some(n => n.id === a.target) ||
                   (a.targetIndex !== undefined && (v.hotspots || [])[a.targetIndex]);
        if (!ok) errs.push("hotspot target not found: " + (a.target || a.targetIndex));
      }
    }
    if (a.type === "code") {
      if (!a.code) errs.push("code activity needs code text");
      if (a.mode === "bug" && !(a.bugLine >= 1 && a.bugLine <= a.code.split("\n").length)) errs.push("bad bugLine");
      if (a.mode === "predict") {
        const n = (a.options || []).length;
        if (n < 2) errs.push("predict needs >=2 options");
        if (!(a.answerIndex >= 0 && a.answerIndex < n)) errs.push("predict bad answerIndex");
      }
      if (!["bug", "predict"].includes(a.mode)) errs.push("bad code mode");
    }
    if (a.type === "short") {
      if (!a.accept || !a.accept.length) errs.push("short needs accept list");
    }
    if (a.type === "tree") {
      if (!a.start || !a.nodes) errs.push("tree needs start+nodes");
      else validateTree(a.nodes, a.start).forEach(e => errs.push("tree: " + e));
    }
    (a.articles || []).forEach(id => {
      if (ctx && ctx.articleIds && !ctx.articleIds.has(id)) errs.push("unknown article ref " + id);
    });
    return errs;
  }

  return { norm, shortCheck, selectCheck, fibInit, fibPlace, fibRemove, fibScore,
           orderScore, moveItem, matchScore, treeStep, treeCurrent, validateTree, validateActivity, TYPES };
});
