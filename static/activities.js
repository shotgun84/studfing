/* Meridian activities — embedded interactive learning (drag-drop, trees, quizzes).
   Depends: ACT (activity_core.js), VIS (visuals.js), app.js globals (esc,$,$$,toast,saveProgress,buildNav,S). */
"use strict";
window.ACTUI = (function () {
  const ST = {}; // id -> runtime state
  const VREG = {}; // id -> definition

  function statusChip(a) {
    const p = (S.progress.activities || {})[a.id];
    if (p && p.ok) return `<span class="astatus done">✓ done</span>`;
    if (p && p.tries) return `<span class="astatus">tries: ${p.tries}</span>`;
    return `<span class="astatus"></span>`;
  }
  function record(id, ok) {
    if (String(id).indexOf("tmp-") === 0) return; // ephemeral generated activities are never persisted
    S.progress.activities = S.progress.activities || {};
    const p = S.progress.activities[id] || { tries: 0, ok: false };
    p.tries++; p.ok = p.ok || !!ok; p.ts = Date.now();
    S.progress.activities[id] = p; saveProgress();
    $$('[data-act-root="' + id + '"] .astatus').forEach(el => {
      el.className = "astatus" + (p.ok ? " done" : "");
      el.textContent = p.ok ? "✓ done" : "tries: " + p.tries;
    });
  }
  function frame(a, inner, extra) {
    return `<section class="activity" data-act-root="${a.id}" data-type="${a.type}" id="act-${a.id}">
      <div class="ahead"><span class="atag">${esc(a.tag || a.type)}</span><h3>${esc(a.prompt)}</h3>
        <div class="atools">${a.hints && a.hints.length ? `<button class="iconbtn" data-aact="hint" title="Show a hint" aria-label="Show a hint">?</button>` : ""}
        <button class="iconbtn" data-aact="retry" title="Retry this activity" aria-label="Retry">↻</button></div></div>
      ${a.instructions ? `<p class="awhat">${esc(a.instructions)}</p>` : ""}
      <div class="abody">${inner}</div>
      <div class="ahint" hidden></div>
      <div class="afeed" aria-live="polite"></div>
      ${extra || ""}
      <div class="afoot"><span class="rel">${statusChip(a)}</span>
      ${(a.articles || []).map(id => `<a href="#/article/${id}">${esc(S.byId[id]?.title || id)}</a>`).join(" · ")}</div>
    </section>`;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ----- renderers (pure strings) ----- */
  function rTF(a) {
    return frame(a, `<div class="aopts" role="group" aria-label="${esc(a.prompt)}">
      ${a.options.map((o, i) => `<button class="opt" data-pick="${i}"><b>${i === 0 ? "T" : "F"}.</b> ${esc(o)}</button>`).join("")}</div>
      <div class="aexp" hidden></div>`);
  }
  function rMCQ(a) {
    return frame(a, `<div class="aopts" role="group" aria-label="${esc(a.prompt)}">
      ${a.options.map((o, i) => `<button class="opt" data-pick="${i}"><b>${"ABCD"[i] || (i + 1)}.</b> ${esc(o)}</button>`).join("")}</div>
      <div class="aexp" hidden></div>`);
  }
  function fibText(a) {
    let bi = 0;
    return a.text.map(par => `<p>` + esc(par).split("___").map((chunk, i, arr) =>
      i === arr.length - 1 ? chunk : chunk + `<button class="blank" data-b="${bi++}" aria-label="Blank ${bi}"><span class="bval"></span></button>`
    ).join("") + `</p>`).join("");
  }
  function rFIB(a) {
    const html = frame(a, `<div class="fibtext">${fibText(a)}</div>
      <div class="bank" aria-label="Word bank">${a.tiles.map(t => `<button class="tile" data-t="${t.id}">${esc(t.text)}</button>`).join("")}</div>
      <p><button class="btn small" data-aact="check">Check answer</button>
      <span class="rel">Drag tiles into blanks — or tap a tile, then tap a blank. Tap a filled blank to return its tile.</span></p>
      <div class="aexp" hidden></div>`);
    return html;
  }
  function rOrder(a) {
    const start = shuffle(a.items);
    return frame(a, `<ol class="olist" aria-label="Reorderable list">${start.map(it =>
      `<li class="orow" data-id="${it.id}" tabindex="0"><span class="handle" aria-hidden="true">⠿</span><span class="olabel">${esc(it.label)}</span><span class="omark"></span></li>`).join("")}</ol>
      <p><button class="btn small" data-aact="check">Check order</button>
      <span class="rel">Drag rows (or focus + Alt+↑/↓) to reorder.</span></p>
      <div class="aexp" hidden></div>`, `<span class="ostart" hidden>${esc(JSON.stringify(start.map(s => s.id)))}</span>`);
  }
  function rMatch(a) {
    const rights = shuffle(a.right);
    return frame(a, `<div class="match"><div class="mcol" aria-label="Terms">
      ${a.left.map(l => `<button class="mleft" data-l="${l.id}"><span class="pbadge" aria-hidden="true"></span><span class="mlabel">${esc(l.label)}</span><span class="mmark" aria-hidden="true"></span></button>`).join("")}</div>
      <div class="mcol" aria-label="Definitions">${rights.map(r => `<button class="mright" data-r="${r.id}"><span class="pbadge" aria-hidden="true"></span><span class="mlabel">${esc(r.label)}</span><span class="mmark" aria-hidden="true"></span></button>`).join("")}</div></div>
      <p><button class="btn small" data-aact="check">Check matches</button>
      <span class="rel">Tap a term, then its match — or drag a term onto its match. Tap a pair to unpair.</span></p>
      <div class="aexp" hidden></div>`);
  }
  function rHotspot(a) {
    const v = a.visualDef;
    const inner = v && window.VIS ? window.VIS.render(Object.assign({ id: a.id + "-q" }, v), a.article) : `<p class="rel">Diagram unavailable.</p>`;
    return frame(a, `<div class="aquiz">${inner}</div><div class="aexp" hidden></div>`);
  }
  function rCode(a) {
    const lines = a.code.split("\n");
    const code = a.mode === "bug"
      ? `<div class="codelines">${lines.map((l, i) => `<button class="cline" data-line="${i + 1}"><span class="ln">${i + 1}</span><code>${esc(l) || " "}</code></button>`).join("")}</div>`
      : `<pre class="codeblock"><code>${esc(a.code)}</code></pre>
         <div class="aopts">${a.options.map((o, i) => `<button class="opt" data-pick="${i}"><b>${"ABCD"[i]}.</b> ${esc(o)}</button>`).join("")}</div>`;
    return frame(a, code + `<div class="aexp" hidden></div>`);
  }
  function rShort(a) {
    return frame(a, `<p class="shortrow"><input class="shortin" type="text" placeholder="Type your answer…" aria-label="Your answer">
      <button class="btn small" data-aact="check">Submit</button></p><div class="aexp" hidden></div>`);
  }
  function treeNode(a, nodeId, depth) {
    const n = a.nodes[nodeId];
    if (n.ending) {
      return `<div class="tnode tend"><h4>${esc(n.title || "Outcome")}</h4><p>${esc(n.text)}</p></div>
        <div class="adebrief"></div>
        <p><button class="btn small" data-aact="tree-retry">Try a different path</button></p>`;
    }
    return `<div class="tnode"><div class="tprog">Decision ${depth} · choose what happens next</div><p>${esc(n.text)}</p>
      <div class="aopts">${n.options.map((o, i) => `<button class="opt topt" data-topt="${i}">${esc(o.label)}</button>`).join("")}</div></div>`;
  }
  function rTree(a) {
    return frame(a, `<div class="tpath" aria-label="Your path"></div><div class="tbody">${treeNode(a, a.start, 1)}</div><div class="aexp" hidden></div>`);
  }

  const R = { tf: rTF, mcq: rMCQ, fib: rFIB, order: rOrder, match: rMatch, hotspot: rHotspot, code: rCode, short: rShort, tree: rTree };
  function render(a) {
    VREG[a.id] = a;
    try {
      const vctx = {};
      if (a.visualDef && a.visual) vctx[a.articles[0]] = { [a.visual]: a.visualDef };
      const errs = ACT.validateActivity(a, { articleIds: new Set(Object.keys(S.byId || {})), visualIndex: vctx });
      if (errs.length) return `<section class="activity v-error" id="act-${a.id}"><h3>Activity unavailable</h3><p class="rel">${esc(errs.slice(0, 3).join("; "))}</p></section>`;
      return (R[a.type] || (() => `<section class="activity v-error"><p>Unknown activity type.</p></section>`))(a);
    } catch (e) { return `<section class="activity v-error"><p>Could not render this activity.</p></section>`; }
  }

  /* ----- shared feedback helpers ----- */
  function showExp(root, a, extraHTML, ok) {
    const ex = root.querySelector(".aexp");
    ex.hidden = false;
    ex.innerHTML = (extraHTML || "") + `<p>${esc(a.explanation)}</p>`;
    ex.classList.toggle("good", !!ok); ex.classList.toggle("bad", ok === false);
  }
  function toast2(msg) { try { toast(msg); } catch {} }

  /* ----- pointer drag engine (mouse + touch unified; delegated, no per-node binding) -----
     Taps are handled ONLY by the click event (press+release on one element).
     Real drags (release elsewhere) fire no click; a timestamp guard below also
     swallows the rare click some browsers synthesize after a drop. ----- */
  function startDrag(e, h, root) {
    const sx = e.clientX, sy = e.clientY;
    let on = false;
    const mv = ev => {
      if (!on && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 7) {
        on = true; document.body.classList.add("dragging");
        h.start && h.start(ev);
      }
      if (on) { h.move && h.move(ev); if (ev.cancelable) ev.preventDefault(); }
    };
    const up = ev => {
      off();
      if (on) {
        if (root) { root._dropAt = Date.now(); root._dropEl = h.src || null; }
        h.drop && h.drop(ev);
      }
    };
    const cn = () => { off(); h.cancel && h.cancel(); };
    const off = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cn);
      document.body.classList.remove("dragging");
    };
    window.addEventListener("pointermove", mv, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cn);
  }
  function ghost(text, x, y) {
    closeGhost();
    const g = document.createElement("div");
    g.className = "draghost"; g.textContent = text;
    g.style.left = x + "px"; g.style.top = y + "px";
    document.body.appendChild(g);
    return g;
  }
  function closeGhost() { document.querySelectorAll(".draghost").forEach(g => g.remove()); }
  function overBlank(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest(".blank") : null;
  }
  function flipAnimate(list) {
    const before = new Map([...list.querySelectorAll(".orow")].map(r => [r.dataset.id, r.getBoundingClientRect().top]));
    return () => {
      [...list.querySelectorAll(".orow")].forEach(r => {
        const dy = (before.get(r.dataset.id) ?? r.getBoundingClientRect().top) - r.getBoundingClientRect().top;
        if (dy) {
          r.style.transition = "none"; r.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => { r.style.transition = "transform .18s ease"; r.style.transform = ""; });
          setTimeout(() => { r.style.transition = ""; r.style.transform = ""; }, 220);
        }
      });
    };
  }

  /* ----- wiring (delegated, attach once) ----- */
  function sel() { return (S.progress.activities || {}); }
  function wire(root) {
    if (root._actwired) return; root._actwired = true;

    /* --- pointer drags (delegated pointerdown; engine starts synchronously) --- */
    root.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const row = e.target.closest(".orow");
      if (row && (e.target.closest(".handle") || e.pointerType === "mouse")) { rowDrag(e, row); return; }
      const tile = e.target.closest(".tile");
      if (tile && !tile.disabled) { tileDrag(e, tile); return; }
      const ml = e.target.closest(".mleft");
      if (ml && !ml.classList.contains("paired")) { matchDrag(e, ml); }
    });

    function rowDrag(e, row) {
      const list = row.closest(".olist");
      const label = row.querySelector(".olabel").textContent;
      let g = null, gap = null, unflip = null;
      const rows = () => [...list.querySelectorAll(".orow")];
      startDrag(e, {
        src: row,
        start(ev) {
          unflip = flipAnimate(list);
          row.classList.add("drag-src");
          gap = document.createElement("li"); gap.className = "dropgap";
          gap.style.height = row.offsetHeight + "px";
          g = ghost(label, ev.clientX + 8, ev.clientY - 14);
        },
        move(ev) {
          g.style.left = ev.clientX + 8 + "px"; g.style.top = ev.clientY - 14 + "px";
          row.style.visibility = "hidden";
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const target = el && el.closest ? el.closest(".orow") : null;
          if (!gap.isConnected) list.appendChild(gap);
          if (target && target !== row && target !== gap) {
            const r = target.getBoundingClientRect();
            list.insertBefore(gap, ev.clientY > r.top + r.height / 2 ? target.nextSibling : target);
          }
          row.style.visibility = "";
        },
        drop() {
          closeGhost();
          if (gap && gap.isConnected) { list.insertBefore(row, gap); gap.remove(); }
          row.classList.remove("drag-src");
          if (unflip) unflip();
          clearMarks(list);
        },
        cancel() { closeGhost(); if (gap) gap.remove(); row.classList.remove("drag-src"); row.style.visibility = ""; }
      }, list.closest("[data-act-root]"));
    }
    function tileDrag(e, tile) {
      const rootA = tile.closest("[data-act-root]"), a = VREG[rootA?.dataset.actRoot];
      if (!a) return;
      let g = null;
      startDrag(e, {
        src: tile,
        start(ev) { g = ghost(tile.textContent, ev.clientX + 8, ev.clientY - 14); tile.classList.add("lifted"); },
        move(ev) {
          g.style.left = ev.clientX + 8 + "px"; g.style.top = ev.clientY - 14 + "px";
          rootA.querySelectorAll(".blank").forEach(b => b.classList.remove("over"));
          const b = overBlank(ev.clientX, ev.clientY);
          if (b && b.closest("[data-act-root]") === rootA) b.classList.add("over");
        },
        drop(ev) {
          closeGhost(); tile.classList.remove("lifted");
          rootA.querySelectorAll(".blank").forEach(b => b.classList.remove("over"));
          const b = overBlank(ev.clientX, ev.clientY);
          if (b && b.closest("[data-act-root]") === rootA) fillBlank(rootA, a, b, tile);
          else announce(rootA, tile.textContent + " kept — drop it on a blank.");
        },
        cancel() { closeGhost(); tile.classList.remove("lifted"); }
      }, rootA);
    }
    function matchDrag(e, ml) {
      const rootA = ml.closest("[data-act-root]");
      let g = null;
      const wrap = ml.closest(".match");
      startDrag(e, {
        src: ml,
        start(ev) {
          g = ghost(ml.textContent, ev.clientX + 8, ev.clientY - 14); ml.classList.add("lifted");
          wireOn(wrap, ml);
          rootA.querySelectorAll(".mright:not(.paired)").forEach(r => r.classList.add("drop-ok"));
        },
        move(ev) {
          g.style.left = ev.clientX + 8 + "px"; g.style.top = ev.clientY - 14 + "px";
          wireMove(wrap, ml, ev.clientX, ev.clientY);
        },
        drop(ev) {
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const r = el && el.closest ? el.closest(".mright") : null;
          wireOff(wrap, rootA);
          closeGhost(); ml.classList.remove("lifted");
          if (r && !r.classList.contains("paired") && r.closest("[data-act-root]") === rootA) pairItems(rootA, ml, r);
          else announce(rootA, ml.textContent + " kept — drop it on an unpaired definition.");
        },
        cancel() { wireOff(wrap, rootA); closeGhost(); ml.classList.remove("lifted"); }
      }, rootA);
    }

    /* --- drag wire overlay: SVG line from source item to pointer --- */
    function wireOn(wrap, src) {
      if (!wrap) return;
      wireOff(wrap);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "matchwire");
      svg.innerHTML = `<line x1="0" y1="0" x2="0" y2="0"/>`;
      wrap.appendChild(svg);
      wireMove(wrap, src, -100, -100);
    }
    function wireMove(wrap, src, cx, cy) {
      if (!wrap) return;
      const svg = wrap.querySelector(".matchwire");
      if (!svg) return;
      const w = wrap.getBoundingClientRect(), s = src.getBoundingClientRect();
      const x1 = s.right - w.left, y1 = s.top + s.height / 2 - w.top;
      svg.setAttribute("viewBox", `0 0 ${w.width} ${w.height}`);
      const line = svg.querySelector("line");
      line.setAttribute("x1", x1); line.setAttribute("y1", y1);
      line.setAttribute("x2", cx - w.left); line.setAttribute("y2", cy - w.top);
    }
    function wireOff(wrap, rootA) {
      if (wrap) { const svg = wrap.querySelector(".matchwire"); if (svg) svg.remove(); }
      if (rootA) rootA.querySelectorAll(".drop-ok").forEach(x => x.classList.remove("drop-ok"));
    }

    /* --- clicks (taps are handled HERE only; drags never reach click) --- */
    root.addEventListener("click", e => {
      const R2 = e.target.closest("[data-act-root]");
      // swallow the click some browsers synthesize right after a real drag
      if (R2 && R2._dropEl && (e.target === R2._dropEl || R2._dropEl.contains(e.target)) &&
          Date.now() - (R2._dropAt || 0) < 500) return;
      // tool buttons
      const ab = e.target.closest("[data-aact]");
      if (ab && R2) {
        const a = VREG[R2.dataset.actRoot];
        if (ab.dataset.aact === "retry") { resetActivity(R2, a); return; }
        if (ab.dataset.aact === "hint") {
          const h = R2.querySelector(".ahint");
          const seen = +(h.dataset.n || 0);
          if (a.hints && seen < a.hints.length) {
            h.hidden = false; h.dataset.n = seen + 1;
            h.innerHTML = `<b>Hint ${seen + 1}:</b> ${esc(a.hints[seen])}`;
          }
          return;
        }
        if (ab.dataset.aact === "check") { checkActivity(R2, a); return; }
        if (ab.dataset.aact === "tree-retry") { treeReset(R2, a); return; }
      }
      if (!R2) return;
      const a = VREG[R2.dataset.actRoot];
      if (!a) return;
      // single-select options
      const pick = e.target.closest("[data-pick]");
      if (pick && !pick.disabled) { gradeSelect(R2, a, +pick.dataset.pick); return; }
      // tree options
      const to = e.target.closest("[data-topt]");
      if (to) { treeChoose(R2, a, +to.dataset.topt); return; }
      // tree path back-links
      const bk = e.target.closest("[data-back]");
      if (bk) { treeBack(R2, a, +bk.dataset.back); return; }
      // fib tap-to-fill
      const tile = e.target.closest(".tile");
      if (tile && !tile.disabled) { tapTile(R2, a, tile); return; }
      const blank = e.target.closest(".blank");
      if (blank) { tapBlank(R2, a, blank); return; }
      // match tap pairing (paired left tap unpairs, symmetric with right)
      const ml = e.target.closest(".mleft");
      if (ml) { ml.classList.contains("paired") ? unpairLeft(R2, ml) : tapLeft(R2, ml); return; }
      const mr = e.target.closest(".mright");
      if (mr) { tapRight(R2, mr); return; }
      // code bug lines
      const cl = e.target.closest(".cline");
      if (cl && !cl.disabled) { gradeCodeBug(R2, a, +cl.dataset.line); return; }
      // quiz visuals (hotspot type)
      const q = e.target.closest(".aquiz");
      if (q) {
        const dn = e.target.closest(".dnode[data-n]");
        if (dn) { gradeHotspot(R2, a, { node: dn.dataset.n, el: dn }); return; }
        const hh = e.target.closest(".hotspot");
        if (hh) { gradeHotspot(R2, a, { idx: +hh.dataset.h, el: hh }); return; }
      }
    });

    /* --- short answer submit --- */
    root.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches(".shortin")) {
        const R2 = e.target.closest("[data-act-root]");
        if (R2) checkActivity(R2, VREG[R2.dataset.actRoot]);
      }
      // reorder keyboard: Alt+Arrow moves focused row
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && e.target.matches(".orow")) {
        e.preventDefault();
        const row = e.target, list = row.closest(".olist");
        const rows = [...list.querySelectorAll(".orow")];
        const i = rows.indexOf(row), j = i + (e.key === "ArrowUp" ? -1 : 1);
        if (j >= 0 && j < rows.length) {
          list.insertBefore(row, e.key === "ArrowUp" ? rows[j] : rows[j].nextSibling);
          row.focus(); clearMarks(list);
          announce(row, "Moved " + (e.key === "ArrowUp" ? "up" : "down"));
        }
      }
      // blank keyboard: Enter on focused tile lifts, Enter on blank drops
      // (preventDefault: <button> would otherwise ALSO fire click → double-toggle)
      if (e.key === "Enter" && e.target.matches(".tile")) {
        e.preventDefault();
        const R2 = e.target.closest("[data-act-root]"); tapTile(R2, VREG[R2?.dataset.actRoot], e.target);
      }
      if (e.key === "Enter" && e.target.matches(".blank")) {
        e.preventDefault();
        const R2 = e.target.closest("[data-act-root]"); tapBlank(R2, VREG[R2?.dataset.actRoot], e.target);
      }
      if (e.key === "Escape") { $$(".tile.sel").forEach(t => t.classList.remove("sel")); $$(".mleft.sel").forEach(t => t.classList.remove("sel")); }
    });
    root.addEventListener("input", e => {
      // live short-answer? no — submit only
    });
  }

  function announce(scope, msg) {
    let live = scope.querySelector(".sr-live");
    if (!live) { live = document.createElement("div"); live.className = "sr-live"; live.setAttribute("aria-live", "polite"); scope.appendChild(live); }
    live.textContent = msg;
  }

  /* ----- fib interactions ----- */
  function fibState(R2, a) {
    const blanks = [...R2.querySelectorAll(".blank")].map(b => b.dataset.tile || null);
    const bank = [...R2.querySelectorAll(".bank .tile")].map(t => t.dataset.t);
    return { blanks, bank };
  }
  function paintFib(R2, a, state) {
    const tilesById = Object.fromEntries(a.tiles.map(t => [t.id, t.text]));
    R2.querySelectorAll(".blank").forEach((b, i) => {
      const tid = state.blanks[i];
      b.dataset.tile = tid || "";
      b.querySelector(".bval").textContent = tid ? tilesById[tid] : "";
      b.classList.toggle("filled", !!tid);
    });
    const bank = R2.querySelector(".bank");
    bank.innerHTML = state.bank.map(tid => {
      const t = a.tiles.find(x => x.id === tid);
      return `<button class="tile" data-t="${t.id}">${esc(t.text)}</button>`;
    }).join("") || `<span class="rel">Bank empty — tap a filled blank to return its tile.</span>`;
  }
  function tapTile(R2, a, tile) {
    if (!a || a.type !== "fib") return;
    const was = tile.classList.contains("sel");
    R2.querySelectorAll(".tile.sel").forEach(t => t.classList.remove("sel"));
    if (!was) { tile.classList.add("sel"); announce(R2, tile.textContent + " selected. Choose a blank."); }
  }
  function fillBlank(R2, a, blankEl, tileEl) {
    const tilesById = Object.fromEntries(a.tiles.map(t => [t.id, t]));
    const st = fibState(R2, a);
    const r = ACT.fibPlace(st, tilesById, tileEl.dataset.t, +blankEl.dataset.b);
    if (r.error) { toast2("That tile is already used — tap its blank to move it."); return; }
    paintFib(R2, a, r.state);
    clearFibMarks(R2);
    announce(R2, tileEl.textContent + " placed.");
  }
  function tapBlank(R2, a, blank) {
    if (!a || a.type !== "fib") return;
    if (blank.dataset.tile) {
      // return tile to bank
      const tilesById = Object.fromEntries(a.tiles.map(t => [t.id, t]));
      const st = fibState(R2, a);
      paintFib(R2, a, ACT.fibRemove(st, tilesById, +blank.dataset.b).state);
      clearFibMarks(R2);
      return;
    }
    const selT = R2.querySelector(".tile.sel");
    if (selT) fillBlank(R2, a, blank, selT);
  }
  function clearFibMarks(R2) {
    R2.querySelectorAll(".blank").forEach(b => b.classList.remove("right", "wrong"));
    const ex = R2.querySelector(".aexp"); ex.hidden = true; ex.innerHTML = "";
  }
  function clearMarks(list) { list.querySelectorAll(".orow").forEach(r => r.classList.remove("right", "wrong")); }

  /* ----- match interactions ----- */
  function tapLeft(R2, ml) {
    const was = ml.classList.contains("sel");
    R2.querySelectorAll(".mleft.sel").forEach(x => x.classList.remove("sel"));
    R2.querySelectorAll(".mright.armed").forEach(x => x.classList.remove("armed"));
    if (!was && !ml.classList.contains("paired")) {
      ml.classList.add("sel");
      R2.querySelectorAll(".mright:not(.paired)").forEach(x => x.classList.add("armed"));
      announce(R2, ml.textContent.trim().slice(0, 60) + " selected. Now tap its match.");
    }
  }
  function tapRight(R2, mr) {
    if (mr.classList.contains("paired")) { unpair(R2, mr); return; }
    const ml = R2.querySelector(".mleft.sel");
    if (ml) pairItems(R2, ml, mr);
  }
  const PAIR_COLORS = ["#7DB8E8", "#D9A441", "#7FB685", "#B39DDB", "#E08FA5", "#66C6C0"];
  function renumberPairs(R2) {
    [...R2.querySelectorAll(".mleft.paired")].forEach((l, i) => {
      const r = R2.querySelector(`.mright[data-r="${l.dataset.with}"]`);
      const c = PAIR_COLORS[i % PAIR_COLORS.length];
      l.style.setProperty("--pair", c);
      if (r) r.style.setProperty("--pair", c);
      const b1 = l.querySelector(".pbadge"); if (b1) b1.textContent = i + 1;
      const b2 = r && r.querySelector(".pbadge"); if (b2) b2.textContent = i + 1;
    });
  }
  function pairItems(R2, ml, mr) {
    ml.classList.remove("sel"); ml.classList.add("paired");
    mr.classList.add("paired"); mr.dataset.with = ml.dataset.l; ml.dataset.with = mr.dataset.r;
    R2.querySelectorAll(".mright.armed").forEach(x => x.classList.remove("armed"));
    clearMatchMarks(R2);
    renumberPairs(R2);
    const n = [...R2.querySelectorAll(".mleft.paired")].indexOf(ml) + 1;
    announce(R2, `Pair ${n}: ${ml.textContent.trim().slice(0, 40)} ↔ ${mr.textContent.trim().slice(0, 40)}. Tap either side to unpair.`);
  }
  function unpairLeft(R2, ml) {
    const rid = ml.dataset.with;
    ml.classList.remove("paired"); delete ml.dataset.with;
    const mr = rid && R2.querySelector(`.mright[data-r="${rid}"]`);
    if (mr) { mr.classList.remove("paired"); delete mr.dataset.with; }
    clearMatchMarks(R2); renumberPairs(R2);
    announce(R2, "Pair removed. Tile returned.");
  }
  function unpair(R2, mr) {
    const lid = mr.dataset.with;
    mr.classList.remove("paired"); delete mr.dataset.with;
    const ml = R2.querySelector(`.mleft[data-l="${lid}"]`);
    if (ml) { ml.classList.remove("paired"); delete ml.dataset.with; }
    clearMatchMarks(R2); renumberPairs(R2);
    announce(R2, "Pair removed. Tile returned.");
  }
  function clearMatchMarks(R2) {
    R2.querySelectorAll(".mleft,.mright").forEach(x => { x.classList.remove("right", "wrong"); const m = x.querySelector(".mmark"); if (m) m.textContent = ""; });
    const ex = R2.querySelector(".aexp"); ex.hidden = true; ex.innerHTML = "";
  }
  function matchState(R2) {
    const pairs = {};
    R2.querySelectorAll(".mleft.paired").forEach(ml => { pairs[ml.dataset.l] = ml.dataset.with; });
    return pairs;
  }

  /* ----- grading ----- */
  function expHTML(a, extra) {
    return `${extra ? `<p>${extra}</p>` : ""}<p>${esc(a.explanation)}</p>`;
  }
  function gradeSelect(R2, a, pick) {
    const ok = ACT.selectCheck(pick, a.answerIndex).ok;
    R2.querySelectorAll("[data-pick]").forEach(b => {
      const i = +b.dataset.pick;
      b.disabled = true;
      if (i === a.answerIndex) b.classList.add("right");
      else if (i === pick) b.classList.add("wrong");
    });
    let extra = "";
    if (!ok && a.distractor && a.distractor[pick]) extra = a.distractor[pick];
    if (ok && a.confirm) extra = a.confirm;
    showExp(R2, a, extra, ok);
    record(a.id, ok);
    toast2(ok ? "Correct." : "Not quite — see why.");
  }
  function gradeCodeBug(R2, a, line) {
    const ok = line === a.bugLine;
    R2.querySelectorAll(".cline").forEach(b => {
      b.disabled = true;
      if (+b.dataset.line === a.bugLine) b.classList.add("right");
      else if (+b.dataset.line === line) b.classList.add("wrong");
    });
    showExp(R2, a, ok ? "That's the faulty line." : "Line " + line + " is fine — the bug is elsewhere.", ok);
    record(a.id, ok);
  }
  function gradeHotspot(R2, a, got) {
    const v = VREG[a.id + "-q"] || a.visualDef;
    let ok = false;
    if (got.node !== undefined) ok = got.node === a.target;
    else ok = got.idx === a.targetIndex;
    got.el.classList.remove("right", "wrong");
    got.el.classList.add(ok ? "right" : "wrong");
    if (got.node !== undefined && v) {
      const rightEl = R2.querySelector(`.dnode[data-n="${a.target}"]`);
      if (rightEl && !ok) setTimeout(() => rightEl.classList.add("right"), 350);
    }
    showExp(R2, a, ok ? "Correct region." : "Not that one — the highlighted region is the answer.", ok);
    record(a.id, ok);
  }
  function checkActivity(R2, a) {
    if (!a) return;
    if (a.type === "fib") {
      const st = fibState(R2, a);
      const sc = ACT.fibScore(st, a.answers);
      R2.querySelectorAll(".blank").forEach((b, i) => {
        b.classList.remove("right", "wrong");
        if (st.blanks[i]) b.classList.add(sc.per[i] ? "right" : "wrong");
      });
      showExp(R2, a, sc.done ? (sc.ok ? "All blanks correct." : sc.correct + " of " + sc.total + " blanks right — fix the marked ones.") : "Fill every blank, then check again.", sc.done ? sc.ok : null);
      record(a.id, sc.ok);
    } else if (a.type === "order") {
      const cur = [...R2.querySelectorAll(".orow")].map(r => r.dataset.id);
      const sc = ACT.orderScore(cur, a.correct);
      R2.querySelectorAll(".orow").forEach((r, i) => {
        r.classList.remove("right", "wrong");
        r.querySelector(".omark").textContent = sc.per[i] ? "✓" : "✗";
        r.classList.add(sc.per[i] ? "right" : "wrong");
      });
      showExp(R2, a, sc.correct + " of " + sc.total + " positions right." + (sc.ok ? " Perfect order." : ""), sc.ok);
      record(a.id, sc.ok);
    } else if (a.type === "match") {
      const sc = ACT.matchScore(matchState(R2), a.key);
      R2.querySelectorAll(".mleft").forEach(ml => {
        ml.classList.remove("right", "wrong");
        const rid = ml.dataset.with;
        const right = rid ? R2.querySelector(`.mright[data-r="${rid}"]`) : null;
        const ok = !!rid && a.key[ml.dataset.l] === rid;
        ml.classList.add(ok ? "right" : "wrong");
        const mm = ml.querySelector(".mmark"); if (mm) mm.textContent = ok ? "✓" : "✗";
        if (right) {
          right.classList.remove("right", "wrong"); right.classList.add(ok ? "right" : "wrong");
          const rm = right.querySelector(".mmark"); if (rm) rm.textContent = ok ? "✓" : "✗";
        }
      });
      let extra = sc.correct + " of " + sc.total + " pairs right.";
      Object.keys(a.key).forEach(l => {
        const got = (matchState(R2))[l];
        if (got && got !== a.key[l] && a.pairNotes && a.pairNotes[l]) extra += " " + a.pairNotes[l];
      });
      showExp(R2, a, sc.ok ? "All pairs correct." : extra, sc.ok);
      record(a.id, sc.ok);
    } else if (a.type === "short") {
      const val = R2.querySelector(".shortin").value;
      const r = ACT.shortCheck(val, a.accept);
      showExp(R2, a, r.empty ? "Type something first." : (r.ok ? "Accepted." : "Not accepted — check the expected shape."), r.empty ? null : r.ok);
      if (!r.empty) record(a.id, r.ok);
    }
  }
  function resetActivity(R2, a) {
    if (a.type === "fib") {
      const tilesById = Object.fromEntries(a.tiles.map(t => [t.id, t]));
      paintFib(R2, a, ACT.fibInit(a.tiles, R2.querySelectorAll(".blank").length));
      void tilesById;
    } else if (a.type === "order") {
      const list = R2.querySelector(".olist");
      const byId = Object.fromEntries(a.items.map(x => [x.id, x]));
      const start = shuffle(a.items);
      list.innerHTML = start.map(it => `<li class="orow" data-id="${it.id}" tabindex="0"><span class="handle" aria-hidden="true">⠿</span><span class="olabel">${esc(it.label)}</span><span class="omark"></span></li>`).join("");
      void byId;
    } else if (a.type === "match") {
      R2.querySelectorAll(".mleft,.mright").forEach(x => {
        x.classList.remove("paired", "sel", "right", "wrong", "armed");
        delete x.dataset.with; x.style.removeProperty("--pair");
        const b = x.querySelector(".pbadge"); if (b) b.textContent = "";
        const m = x.querySelector(".mmark"); if (m) m.textContent = "";
      });
      const ex = R2.querySelector(".aexp"); ex.hidden = true; ex.innerHTML = "";
      return;
    } else {
      R2.querySelectorAll("[data-pick],.cline,.opt").forEach(b => { b.disabled = false; b.classList.remove("right", "wrong"); });
      R2.querySelectorAll(".dnode.right,.dnode.wrong,.hotspot.right,.hotspot.wrong").forEach(x => x.classList.remove("right", "wrong"));
      const ex = R2.querySelector(".aexp"); ex.hidden = true; ex.innerHTML = "";
      const si = R2.querySelector(".shortin"); if (si) si.value = "";
      return;
    }
    const ex = R2.querySelector(".aexp"); ex.hidden = true; ex.innerHTML = "";
    const t = R2.querySelector(".tries"); if (t) t.textContent = "";
  }

  /* ----- decision trees ----- */
  function treeHist(R2) {
    try { return JSON.parse(R2.dataset.hist || "[]"); } catch { return []; }
  }
  function treeChoose(R2, a, optIdx) {
    const hist = treeHist(R2);
    const curR = ACT.treeCurrent(a.nodes, a.start, hist);
    if (curR.error) { toast2("That choice leads nowhere — data error."); return; }
    const r = ACT.treeStep(a.nodes, curR.node, optIdx);
    if (r.error) { toast2("That choice leads nowhere — data error."); return; }
    hist.push({ node: curR.node, pick: optIdx });
    R2.dataset.hist = JSON.stringify(hist);
    paintTree(R2, a);
  }
  function treeBack(R2, a, idx) {
    const hist = treeHist(R2).slice(0, idx + 1);
    R2.dataset.hist = JSON.stringify(hist);
    paintTree(R2, a);
  }
  function treeReset(R2, a) { R2.dataset.hist = "[]"; paintTree(R2, a); }
  function paintTree(R2, a) {
    const hist = treeHist(R2);
    const curR = ACT.treeCurrent(a.nodes, a.start, hist);
    const nodeId = curR.error ? a.start : curR.node;
    const body = R2.querySelector(".tbody");
    body.innerHTML = treeNode(a, nodeId, hist.length + 1);
    body.firstChild.classList.add("tin");
    const path = R2.querySelector(".tpath");
    path.innerHTML = hist.length ? `<span class="rel">Path:</span> ` + hist.map((h, i) =>
      `<button class="tback" data-back="${i}" title="Return to this decision">${esc(String(a.nodes[h.node].options[h.pick].label).slice(0, 26))}</button>`).join(" → ") : "";
    const n = a.nodes[nodeId];
    if (n.ending) {
      const missed = [];
      hist.forEach(h => {
        const nd = a.nodes[h.node];
        const good = (nd.options || []).findIndex(o => o.good);
        if (good !== -1 && h.pick !== good) missed.push({ node: h.node, best: nd.options[good].label, why: nd.options[good].note || "" });
      });
      const db = R2.querySelector(".adebrief");
      db.innerHTML = `<h4>Debrief — ${esc(n.rating || "complete")}</h4><p>${esc(n.debrief)}</p>` +
        (missed.length ? `<p><b>Stronger moves you passed up:</b></p><ul>${missed.map(m => `<li>At “${esc(a.nodes[m.node].text.slice(0, 60))}…” — ${esc(m.best)}${m.why ? ": " + esc(m.why) : ""}</li>`).join("")}</ul>`
          : `<p><b>Clean run:</b> you picked the recommended move at every decision.</p>`);
      record(a.id, /risky|poor|bad/i.test(n.rating || "") ? false : true);
    }
    const ex = R2.querySelector(".aexp"); ex.hidden = true; ex.innerHTML = "";
  }

  return { render, wire, VREG };
})();
window.ACTUI = window.ACTUI;
