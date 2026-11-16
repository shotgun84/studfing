/* Meridian visuals.js — reusable visual-asset renderers + graph view + previews.
   Depends on app.js globals: S, esc, $, $$, toast, masteryOf. */
"use strict";
const VISREG = {};
window.VIS = {
  render(v, aid) {
    VISREG[v.id] = v;
    const cites = (v.cites || []).map(c => `<span class="vsrc">${esc(c.source.split("/").pop())} · ${esc(c.locator)}</span>`).join("");
    const links = (v.links || []).map(id => `<a href="#/article/${id}">${esc(S.byId[id]?.title || id)}</a>`).join(" · ");
    const R = { diagram: vDiagram, reveal: vReveal, figure: vFigure, chart: vChart,
                compare: vCompare, steps: vSteps, layers: vLayers, timeline: vTimeline }[v.type];
    if (!R) return `<div class="visual v-error"><p>Unsupported visual type “${esc(v.type)}”.</p></div>`;
    let body = "";
    try { body = R(v); }
    catch (e) { return `<div class="visual v-error"><p>Could not render “${esc(v.title)}”.</p></div>`; }
    return `<section class="visual" id="vis-${v.id}" data-v="${v.id}">
      <div class="v-head"><h3>${esc(v.title)}</h3>
        <div class="v-tools">
          <button class="iconbtn" data-vact="zin" aria-label="Zoom in">+</button><button class="iconbtn" data-vact="zout" aria-label="Zoom out">−</button><button class="iconbtn" data-vact="zreset" aria-label="Reset zoom">⤾</button>
        </div></div>
      <p class="v-what">${esc(v.what || "")}</p>
      <div class="v-body">${body}</div>
      ${v.caption ? `<p class="v-cap">${esc(v.caption)}</p>` : ""}
      <div class="v-foot">${cites ? `<span class="v-cites">${cites}</span>` : ""}${links ? `<span class="v-links">Read: ${links}</span>` : ""}</div>
    </section>`;
  },
  after(root) {
    root.querySelectorAll(".stepper").forEach(st => {
      const sec = st.closest(".visual"), v = sec && VISREG[sec.dataset.v];
      if (v) paintStep(st, v);
    });
    root.querySelectorAll('.sim[data-sim="burnup"]').forEach(drawBurnup);
  }
};

/* ---------- shared svg helpers ---------- */
const VC = { ink: "var(--v-ink)", mut: "var(--v-mut)", blue: "var(--v-blue)", amber: "var(--v-amber)", green: "var(--v-green)", red: "var(--v-red)", purp: "var(--v-purp)", box: "var(--v-box)", line: "var(--v-line)" };
const TONE = { amber: "var(--v-amber)", dim: "var(--v-line)", green: "var(--v-green)", red: "var(--v-red)" };
function wrapLabel(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
    if (lines.length === 2) break;
  }
  if (cur) lines.push(cur);
  const rest = words.slice(lines.join(" ").split(/\s+/).filter(Boolean).length);
  if (rest.length) lines[lines.length - 1] += "…";
  return lines.slice(0, 3);
}
function nodeBox(n, masked) {
  const w = n.w || 150, x = n.x, y = n.y;
  const maxChars = Math.max(8, Math.floor((w - 20) / 6.7));
  const title = masked ? ["?"] : wrapLabel(n.label || ((n.lines || [])[0] || n.id), maxChars);
  const subs = masked ? [] : (n.lines || []).slice(1);
  const h = 18 + title.length * 17 + subs.length * 15;
  n._h = h;
  const stroke = TONE[n.tone] || VC.blue;
  const open = n.link ? `<a href="#/article/${n.link}">` : "";
  const close = n.link ? `</a>` : "";
  const tspan = title.map((t, i) => `<text x="${x + w / 2}" y="${y + 24 + i * 17}" fill="${masked ? VC.mut : VC.ink}" font-size="12.5" text-anchor="middle">${esc(t)}</text>`).join("");
  const ssub = subs.map((l, i) => `<text x="${x + w / 2}" y="${y + 24 + title.length * 17 + i * 15}" fill="${VC.mut}" font-size="11" text-anchor="middle">${esc(l)}</text>`).join("");
  return `${open}<g class="dnode${n.link ? " linked" : ""}${masked ? " masked" : ""}" data-n="${n.id}" tabindex="${masked ? "0" : "-1"}" role="${masked ? "button" : "img"}" aria-label="${esc(n.label || (n.lines || [])[0] || n.id)}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${VC.box}" stroke="${stroke}" stroke-width="2" ${masked ? 'stroke-dasharray="5 4"' : ""}/>${tspan}${ssub}</g>${close}`;
}
function edgePath(a, b, nodes) {
  const A = nodes[a], B = nodes[b];
  if (!A || !B) return "";
  const ax = A.x + (A.w || 150) / 2, ay = A.y + (A._h || 64), bx = B.x + (B.w || 150) / 2, by = B.y;
  if (Math.abs(A.y - B.y) < 4) { const y = A.y + (A._h || 64) / 2; return `<line x1="${A.x + (A.w || 150)}" y1="${y}" x2="${B.x}" y2="${y}" stroke="${VC.blue}"/>`; }
  const my = (ay + by) / 2;
  return `<path d="M${ax},${ay} V${my} H${bx} V${by}" fill="none" stroke="${VC.blue}" stroke-width="1.6"/>`;
}
function diagramSVG(v, masked) {
  const byId = Object.fromEntries(v.nodes.map(n => [n.id, n]));
  const W = (v.canvas && v.canvas.w) || 620, H = (v.canvas && v.canvas.h) || 300;
  const boxes = v.nodes.map(n => nodeBox(n, masked && !n.nomask)).join("");
  const edges = (v.edges || []).map(e => {
    const p = edgePath(e.from, e.to, byId);
    const A = byId[e.from], B = byId[e.to];
    const lx = A && B ? (A.x + (A.w || 150) / 2 + B.x + (B.w || 150) / 2) / 2 : 0;
    const ly = A && B ? (A.y + (A._h || 64) + B.y) / 2 - 6 : 0;
    return p + (e.label ? `<text x="${lx}" y="${ly}" fill="${VC.mut}" font-size="11" text-anchor="middle">${esc(e.label)}</text>` : "");
  }).join("");
  return `<div class="zoombox"><div class="zoom-inner"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.alt || v.title)}">${edges}${boxes}</svg></div></div>`;
}
function vDiagram(v) { return diagramSVG(v, false); }
function vReveal(v) {
  const total = v.nodes.length;
  return `${diagramSVG(v, true)}
    <div class="rv-bar"><span class="rel" data-rvcount>0 of ${total} revealed</span>
    <button class="btn small ghost" data-vact="rv-all">Reveal all</button>
    <button class="btn small ghost" data-vact="rv-none">Hide all</button></div>`;
}
function vFigure(v) {
  const hs = (v.hotspots || []).map((h, i) =>
    `<button class="hotspot" style="left:${h.x}%;top:${h.y}%" data-h="${i}" aria-label="Annotation: ${esc(h.title)}">${i + 1}</button>`).join("");
  return `<div class="zoombox"><div class="zoom-inner"><div class="figwrap">${window.themeSvg ? window.themeSvg(v.svg) : v.svg}<div class="hotspots">${hs}</div>
    <div class="hpop" hidden></div></div></div></div>`;
}

/* ---------- charts ---------- */
function axesSVG(W, H, pad, ymin, ymax, yfmt, ticks) {
  let g = "";
  const vals = ticks || [0, 1, 2, 3, 4].map(i => ymin + (ymax - ymin) * i / 4);
  for (const val of vals) {
    const y = pad.t + (H - pad.t - pad.b) * (1 - (val - ymin) / Math.max(1e-9, ymax - ymin));
    g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="${VC.line}"/><text x="${pad.l - 6}" y="${y + 4}" fill="${VC.mut}" font-size="10" text-anchor="end">${yfmt(val)}</text>`;
  }
  return g;
}
function chartSVG(v, mod) {
  const c = v.chart, W = 620, H = 300, pad = { l: 52, r: 12, t: 14, b: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  let inner = "";
  const intData = (c.series || []).every(s => s.values.every(v => Number.isInteger(v)));
  const yfmt = x => intData ? Math.round(x).toString() : (Math.round(x * 10) / 10).toString();
  if (c.kind === "bar") {
    const max = Math.max(1, ...c.series.flatMap(s => s.values));
    const ticks = max <= 6 ? Array.from({ length: max + 1 }, (_, i) => i) : null;
    inner += axesSVG(W, H, pad, 0, max, yfmt, ticks);
    const n = c.labels.length, gw = iw / n, bw = Math.min(26, (gw - 14) / c.series.length);
    c.labels.forEach((lb, i) => {
      c.series.forEach((s, j) => {
        const hgt = (s.values[i] / max) * ih, x = pad.l + i * gw + (gw - bw * c.series.length) / 2 + j * bw;
        inner += `<rect x="${x.toFixed(1)}" y="${(pad.t + ih - hgt).toFixed(1)}" width="${bw}" height="${hgt.toFixed(1)}" rx="3" fill="${s.color}"><title>${esc(s.name)}: ${s.values[i]} ${esc(c.yLabel || "")}</title></rect>`;
      });
      inner += `<text x="${(pad.l + i * gw + gw / 2).toFixed(1)}" y="${H - 12}" fill="${VC.mut}" font-size="11" text-anchor="middle">${esc(lb)}</text>`;
    });
  } else if (c.kind === "gantt") {
    const max = Math.max(...c.tasks.map(t => t.end));
    const gp = { l: 100, r: 12, t: 14, b: 34 };
    const giw = W - gp.l - gp.r, gih = H - gp.t - gp.b;
    const GX = t => gp.l + (t / max) * giw;
    for (let t = 0; t <= max; t += 5) {
      inner += `<line x1="${GX(t).toFixed(1)}" y1="${gp.t}" x2="${GX(t).toFixed(1)}" y2="${H - gp.b}" stroke="${VC.line}" opacity="0.7"/>
        <text x="${GX(t).toFixed(1)}" y="${H - 12}" fill="${VC.mut}" font-size="10" text-anchor="middle">${t}w</text>`;
    }
    const rh = Math.min(30, (gih - 6) / c.tasks.length);
    c.tasks.forEach((t, i) => {
      const y = gp.t + 3 + i * ((gih - 6) / c.tasks.length);
      const x = gp.l + (t.start / max) * giw, w = Math.max(3, ((t.end - t.start) / max) * giw);
      inner += `<line x1="${gp.l}" y1="${(y + rh + 3).toFixed(1)}" x2="${W - gp.r}" y2="${(y + rh + 3).toFixed(1)}" stroke="${VC.line}" opacity="0.5"/>`;
      inner += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${rh}" rx="5" fill="${t.crit ? VC.amber : VC.box}" stroke="${t.crit ? VC.amber : VC.blue}" opacity="${t.crit ? 0.9 : 1}"><title>${esc(t.name)}: weeks ${t.start}–${t.end}${t.crit ? " (critical)" : ""}</title></rect>
        <text x="${gp.l - 8}" y="${(y + rh / 2 + 4).toFixed(1)}" fill="${VC.ink}" font-size="11" text-anchor="end">${esc(t.name)}</text>`;
    });
  } else { // line
    const max = Math.max(1, ...c.series.flatMap(s => s.values));
    inner += axesSVG(W, H, pad, 0, max, yfmt);
    const n = c.labels.length;
    const X = i => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw), Y = val => pad.t + ih - (val / max) * ih;
    c.series.forEach(s => {
      inner += `<polyline points="${s.values.map((val, i) => `${X(i).toFixed(1)},${Y(val).toFixed(1)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
      s.values.forEach((val, i) => { inner += `<circle cx="${X(i).toFixed(1)}" cy="${Y(val).toFixed(1)}" r="4" fill="${s.color}"><title>${esc(s.name)} @ ${esc(c.labels[i])}: ${val} ${esc(c.yLabel || "")}</title></circle>`; });
    });
    c.labels.forEach((lb, i) => { inner += `<text x="${X(i).toFixed(1)}" y="${H - 12}" fill="${VC.mut}" font-size="11" text-anchor="middle">${esc(lb)}</text>`; });
  }
  const legend = (c.series || []).map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
  return `<div class="zoombox"><div class="zoom-inner"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.alt || v.title)}">${inner}
    <text x="14" y="${H / 2}" fill="${VC.mut}" font-size="11" transform="rotate(-90 14 ${H / 2})" text-anchor="middle">${esc(c.yLabel || "")}</text>
    <text x="${W / 2}" y="${H - 0}" fill="${VC.mut}" font-size="11" text-anchor="middle"></text></svg></div></div>
    <div class="legend">${legend}<span class="xlab">${esc(c.xLabel || "")}</span></div>`;
}
function vChart(v) {
  if (v.chart.sim === "burnup") return burnupSim(v);
  return chartSVG(v) + (v.chart.note ? `<p class="v-note">${esc(v.chart.note)}</p>` : "");
}
function burnupSim(v) {
  return `<div class="sim" data-sim="burnup">
    <div class="sim-controls">
      <label>Total effort (days) <input type="range" min="60" max="400" step="10" value="200" data-p="total"><b data-o="total">200</b></label>
      <label>Planned duration (days) <input type="range" min="40" max="160" step="5" value="100" data-p="dur"><b data-o="dur">100</b></label>
      <label>Team pace <input type="range" min="50" max="140" step="5" value="100" data-p="pace"><b data-o="pace">100%</b></label>
      <label>Scope shock at day <input type="range" min="20" max="140" step="5" value="60" data-p="shock"><b data-o="shock">60</b></label>
      <label>Extra scope (days) <input type="range" min="0" max="120" step="5" value="40" data-p="add"><b data-o="add">40</b></label>
    </div>
    <div class="sim-out"></div>
    <p class="v-read" data-read></p>
    <p class="v-note">${esc(v.chart.note || "")}</p></div>`;
}
function drawBurnup(box) {
  const g = p => parseFloat(box.querySelector(`[data-p="${p}"]`).value);
  const total = g("total"), dur = g("dur"), pace = g("pace") / 100, shock = g("shock"), add = g("add");
  box.querySelector('[data-o="total"]').textContent = total; box.querySelector('[data-o="dur"]').textContent = dur;
  box.querySelector('[data-o="pace"]').textContent = g("pace") + "%"; box.querySelector('[data-o="shock"]').textContent = shock;
  box.querySelector('[data-o="add"]').textContent = add;
  const W = 620, H = 280, pad = { l: 52, r: 12, t: 14, b: 30 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const ymax = Math.max(total + add, (total / dur) * dur * 1.1, pace * total * 1.1) * 1.05;
  const X = t => pad.l + (t / 160) * iw, Y = val => pad.t + ih - (val / ymax) * ih;
  const line = (fn, color, dash) => `<polyline points="${Array.from({ length: 33 }, (_, i) => { const t = i * 5; return `${X(t).toFixed(1)},${Y(fn(t)).toFixed(1)}`; }).join(" ")}" fill="none" stroke="${color}" stroke-width="2.2"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const planned = t => Math.min(total / dur * t, total);
  const scope = t => total + (t >= shock ? add : 0);
  const actual = t => Math.min(pace * (total / dur) * t, scope(t));
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Burn-up simulation">${axesSVG(W, H, pad, 0, ymax, x => Math.round(x))}
    ${line(planned, VC.blue)}${line(actual, VC.amber)}${line(scope, VC.red, "6 4")}
    <text x="${X(dur)}" y="${Y(planned(dur)) - 8}" fill="${VC.blue}" font-size="11" text-anchor="middle">planned</text>
    <text x="${X(120)}" y="${Y(actual(120)) - 8}" fill="${VC.amber}" font-size="11" text-anchor="middle">actual</text>
    <text x="${X(160)}" y="${Y(scope(160)) + 14}" fill="${VC.red}" font-size="11" text-anchor="end">scope</text></svg>
    <div class="legend"><span><i style="background:${VC.blue}"></i>planned</span><span><i style="background:${VC.amber}"></i>actual</span><span><i style="background:${VC.red}"></i>scope</span></div>`;
  box.querySelector(".sim-out").innerHTML = svg;
  const t = 30, a = actual(t), p = planned(t);
  box.querySelector("[data-read]").textContent = a >= p
    ? `At day ${t}: actual ${a.toFixed(0)} vs planned ${p.toFixed(0)} — ahead or on track.`
    : `At day ${t}: actual ${a.toFixed(0)} vs planned ${p.toFixed(0)} — behind. Replan, rebalance reviewers, or renegotiate scope.`;
}

/* ---------- compare / steps / layers / timeline ---------- */
function vCompare(v) {
  const col = s => `<div class="cmp-col"><h4>${esc(s.title)}</h4><span class="chip">${esc(s.tag || "")}</span><ul>${(s.points || []).map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
  return `<div class="cmp">${col(v.left)}<div class="cmp-vs" aria-hidden="true">vs</div>${col(v.right)}</div>
    ${v.why ? `<p class="v-why">${esc(v.why)}</p>` : ""}`;
}
function vSteps(v) {
  return `<div class="stepper" data-step="0">
    <div class="stp-progress">${v.steps.map((_, i) => `<i data-d="${i}" class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>
    <div class="stp-card"><h4 data-t></h4><p data-x></p></div>
    <div class="stp-nav"><button class="btn small ghost" data-vact="prev">Back</button>
    <span class="rel" data-n></span>
    <button class="btn small" data-vact="next">Next step</button>
    <button class="btn small ghost" data-vact="replay">Replay</button></div></div>`;
}
function paintStep(box, v) {
  const i = +box.dataset.step, s = v.steps[i];
  box.querySelector("[data-t]").textContent = s.title; box.querySelector("[data-x]").textContent = s.text;
  box.querySelector("[data-n]").textContent = `${i + 1} of ${v.steps.length}`;
  box.querySelectorAll("[data-d]").forEach((d, j) => d.classList.toggle("on", j <= i));
}
function vLayers(v) {
  return `<div class="layers" data iso="0">${(v.layers || []).map((l, i) =>
    `<button class="layer" data-l="${i}"><b>${esc(l.label)}</b><span>${esc(l.desc)}</span>
     ${l.link ? `<em>→ ${esc(S.byId[l.link]?.title || l.link)}</em>` : ""}</button>`).join("")}</div>
    <p><button class="btn small ghost" data-vact="layers-all">Show all layers</button></p>`;
}
function vTimeline(v) {
  return `<div class="tl">${(v.milestones || []).map((m, i) =>
    `<button class="tl-m" data-m="${i}"><i>${i + 1}</i><b>${esc(m.t)}</b><span>${esc(m.label)}</span></button>`).join("")}</div>
    <div class="tl-detail" data-detail><p class="rel">Select a milestone to expand it.</p></div>`;
}

/* ---------- preview modal + multi-page slide viewer ---------- */
function pageNums(loc) {
  const out = [];
  const m1 = (loc || "").match(/pp?\.?\s*(\d+)\s*[–-]\s*(\d+)/i);
  if (m1) {
    let a = +m1[1], b = +m1[2];
    if (b < a) [a, b] = [b, a];
    for (let p = a; p <= b && out.length < 12; p++) out.push(p);
    return out;
  }
  const m2 = (loc || "").match(/(?:p\.?|slide|p)\s*(\d+)/i);
  if (m2) out.push(+m2[1]);
  return out;
}
async function openPreview(source, locator, excerpt) {
  const pages = pageNums(locator);
  if (!pages.length) { toast("No rendered preview for this citation yet."); return; }
  showSlideViewer(source, pages, 0, excerpt);
}
function showSlideViewer(source, pages, idx, excerpt) {
  getJSON(`/api/preview-pages?src=${encodeURIComponent(source)}`).then(avail => {
    const have = new Set(avail.pages || []);
    const use = pages.filter(p => have.has(p));
    if (!use.length) { toast("No rendered preview for this citation yet."); return; }
    showSlidePage(source, use, Math.min(idx, use.length - 1), excerpt);
  }).catch(() => toast("No rendered preview for this citation yet."));
}
function showSlidePage(source, pages, idx, excerpt) {
  const page = pages[idx];
  getJSON(`/api/preview?src=${encodeURIComponent(source)}&page=${page}`).then(d => {
    const cited = (d.cited_by || []).map(c => `<a href="#/article/${c.id}">${esc(c.title)}</a>`).join(" · ");
      modal(`<p class="m-kicker">From the original course file</p>
        <h3>${esc(source.split("/").pop())} — page ${d.page}</h3>
        ${d.doc ? `<p><a class="btn small" href="#/read/${d.doc}?page=${d.page}">Open page ${d.page} in the reader</a></p>` : ""}
        ${pages.length > 1 ? `<div class="pager"><button class="btn small ghost" data-pg="-1" ${idx <= 0 ? "disabled" : ""}>‹ Prev</button><span class="rel">Page ${idx + 1} of ${pages.length} (slides ${pages.join(", ")})</span><button class="btn small ghost" data-pg="1" ${idx >= pages.length - 1 ? "disabled" : ""}>Next ›</button></div>` : ""}
      <img src="${d.url}" alt="Render of ${esc(source)} page ${d.page}" class="m-img" loading="lazy">
      ${excerpt ? `<blockquote class="m-quote">“${esc(excerpt)}”</blockquote>` : ""}
      ${cited ? `<p class="rel">Cited by: ${cited}</p>` : ""}
      <p class="rel">${esc(d.note || "")} Find the file under <code>${esc(source)}</code> to open the full document.</p>`);
    $$("#mmodal [data-pg]").forEach(b => b.onclick = () => showSlidePage(source, pages, idx + (+b.dataset.pg), excerpt));
  }).catch(() => toast("No rendered preview for this citation yet."));
}
window.openSlidePage = (src, page) => showSlideViewer(src, [page], 0, "");
let modalReturnTo = null;
function modal(html) {
  closeModal(true);
  modalReturnTo = document.activeElement;
  const d = document.createElement("div");
  d.className = "modal"; d.id = "mmodal";
  d.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="Source preview"><button class="iconbtn m-close" aria-label="Close">✕</button>${html}</div>`;
  document.body.appendChild(d);
  d.addEventListener("click", e => { if (e.target === d || e.target.closest(".m-close")) closeModal(); });
  const box = d.querySelector(".modal-box");
  const focusables = () => [...box.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  d.addEventListener("keydown", e => {
    if (e.key === "Tab") {
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    } else if (e.key === "Escape") { e.stopPropagation(); closeModal(); }
  });
  const f = box.querySelector(".m-close");
  if (f) setTimeout(() => f.focus(), 0);
  return d;
}
function closeModal(silent) { document.getElementById("mmodal")?.remove();
  if (!silent && modalReturnTo && modalReturnTo.focus) { try { modalReturnTo.focus(); } catch {} modalReturnTo = null; } }
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closePop(); } });
window.addEventListener("hashchange", () => closeModal());

/* ---------- wiring (delegated, attached once) ---------- */
function closePop() { $$(".hpop").forEach(p => p.hidden = true); }
function updateRvCount(sec) {
  const total = sec.querySelectorAll(".dnode[data-n]").length,
        shown = sec.querySelectorAll(".dnode[data-n]:not(.masked)").length;
  const c = sec.querySelector("[data-rvcount]");
  if (c) c.textContent = `${shown} of ${total} revealed`;
}
function toggleReveal(sec, dn) {
  if (dn.classList.contains("masked")) dn.classList.remove("masked");
  else dn.classList.add("masked");
  updateRvCount(sec);
}
function wireVisuals(root) {
  if (root._vwired) return; root._vwired = true;
  root.addEventListener("click", e => {
    const sec = e.target.closest(".visual");
    // hotspot annotations (figure type)
    const hs = e.target.closest(".hotspot");
    if (hs) {
      const wrap = hs.closest(".figwrap"), pop = wrap.querySelector(".hpop");
      const v = VISREG[sec?.dataset.v], h = v?.hotspots?.[+hs.dataset.h];
      if (!h) return;
      pop.innerHTML = `<b>${esc(h.title)}</b><p>${esc(h.text)}</p>${h.link ? `<a href="#/article/${h.link}">Read: ${esc(S.byId[h.link]?.title || h.link)} →</a>` : ""}`;
      pop.hidden = false;
      const r = hs.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      pop.style.left = Math.min(60, ((r.left - wr.left) / wr.width) * 100) + "%";
      pop.style.top = Math.min(70, ((r.bottom - wr.top) / wr.height) * 100 + 4) + "%";
      return;
    }
    // citation slide previews (article sources)
    const pv = e.target.closest("[data-preview]");
    if (pv) { openPreview(pv.dataset.src, pv.dataset.loc, pv.dataset.ex); return; }
    if (!e.target.closest(".hpop")) closePop();
    if (!sec) return;
    const v = VISREG[sec.dataset.v];
    if (!v) return;
    // timeline milestones (no toolbar button — must run before any button check)
    const tlm = e.target.closest(".tl-m");
    if (tlm) {
      sec.querySelectorAll(".tl-m").forEach(m => m.classList.remove("on")); tlm.classList.add("on");
      const m = v.milestones[+tlm.dataset.m];
      sec.querySelector("[data-detail]").innerHTML = `<h4>${esc(m.t)} — ${esc(m.label)}</h4><p>${esc(m.text)}</p>`;
      return;
    }
    // layer isolate (no toolbar button)
    const lay = e.target.closest(".layer");
    if (lay) {
      const all = [...sec.querySelectorAll(".layer")];
      const iso = lay.classList.contains("solo");
      all.forEach(l => l.classList.remove("dim", "solo"));
      if (!iso) { lay.classList.add("solo"); all.forEach(l => { if (l !== lay) l.classList.add("dim"); });
        const l = v.layers[+lay.dataset.l]; if (l?.link) toast(`Layer: ${l.label} — see ${S.byId[l.link]?.title || l.link}`); }
      return;
    }
    // reveal-mode label toggle (click or keyboard via keydown below)
    const dn = e.target.closest(".dnode[data-n]");
    if (dn && sec.querySelector(".rv-bar")) { toggleReveal(sec, dn); return; }
    // toolbar buttons
    const btn = e.target.closest("[data-vact]");
    if (!btn) return;
    const box = sec.querySelector(".zoom-inner");
    const z = () => parseFloat(box?.dataset.z || "1");
    const setZ = nz => { if (!box) return; nz = Math.min(3, Math.max(0.6, nz)); box.dataset.z = nz;
      box.style.transform = `scale(${nz})`; };
    const act = btn.dataset.vact;
    if (act === "zin") setZ(z() + 0.25);
    else if (act === "zout") setZ(z() - 0.25);
    else if (act === "zreset" && box) { box.dataset.z = 1; box.style.transform = ""; box.parentElement.scrollTo(0, 0); }
    else if (act === "rv-all") { sec.querySelectorAll(".dnode.masked").forEach(n => n.classList.remove("masked")); updateRvCount(sec); }
    else if (act === "rv-none") { sec.querySelectorAll(".dnode[data-n]").forEach(n => n.classList.add("masked")); updateRvCount(sec); }
    else if (act === "prev" || act === "next" || act === "replay") {
      const st = sec.querySelector(".stepper"); let i = +st.dataset.step;
      i = act === "prev" ? Math.max(0, i - 1) : act === "next" ? Math.min(v.steps.length - 1, i + 1) : 0;
      st.dataset.step = i; paintStep(st, v);
    } else if (act === "layers-all") sec.querySelectorAll(".layer").forEach(l => l.classList.remove("dim", "solo"));
  });
  // keyboard activation for reveal nodes + timeline/layers are native <button>s
  root.addEventListener("keydown", e => {
    const dn = e.target.closest?.(".dnode.masked");
    if (dn && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const sec = dn.closest(".visual");
      if (sec?.querySelector(".rv-bar")) toggleReveal(sec, dn);
    }
  });
  // sim sliders
  root.addEventListener("input", e => {
    const sim = e.target.closest(".sim"); if (!sim) return;
    drawBurnup(sim);
  });
  // layer link navigation: single click on solo layer link text goes via toast; double-click opens
  root.addEventListener("dblclick", e => {
    const lay = e.target.closest(".layer"); if (!lay) return;
    const sec = lay.closest(".visual"), v = VISREG[sec?.dataset.v], l = v?.layers?.[+lay.dataset.l];
    if (l?.link) location.hash = "#/article/" + l.link;
  });
}
window.wireVisuals = wireVisuals;

/* ---------- MCQ choices ---------- */
function mcqHTML(q) {
  const att = S.progress.attempts[q.id];
  return `<div class="mcq" data-mcq="${q.id}">
    ${(q.choices || []).map((c, i) => {
      let cls = "";
      if (att?.pick === i) cls = i === q.answerIndex ? "right" : "wrong";
      else if (att && i === q.answerIndex) cls = "right";
      return `<button class="opt ${cls}" data-i="${i}" ${att ? "disabled" : ""}><b>${"ABCD"[i] || i + 1}.</b> ${esc(c)}</button>`; }).join("")}
    <div class="mcq-fb" ${att ? "" : "hidden"}>${att ? (att.pick === q.answerIndex ? "✓ Correct. " : "✗ Not quite — the model answer is marked. ") + esc(q.answer?.text || "") : ""}</div></div>`;
}
window.mcqHTML = mcqHTML;
function wireMCQ(root) {
  if (root._mqwired) return; root._mqwired = true;
  root.addEventListener("click", e => {
    const o = e.target.closest(".opt"); if (!o || o.disabled) return;
    const box = o.closest(".mcq"), qid = box.dataset.mcq, q = S.qById[qid];
    const pick = +o.dataset.i, ok = pick === q.answerIndex;
    S.progress.attempts[qid] = { status: ok ? "got" : "missed", pick, ts: Date.now() };
    saveProgress(); buildNav();
    box.querySelectorAll(".opt").forEach(b => {
      b.disabled = true;
      if (+b.dataset.i === q.answerIndex) b.classList.add("right");
      else if (b === o) b.classList.add("wrong");
    });
    const fb = box.querySelector(".mcq-fb");
    fb.hidden = false;
    fb.textContent = (ok ? "✓ Correct. " : "✗ Not quite — correct option marked. ") + (q.answer?.text || "");
    toast(ok ? "Correct — nice." : "Recorded as missed — it joins your review queue.");
  });
}
window.wireMCQ = wireMCQ;

/* ================= Knowledge graph view ================= */
window.GraphView = {
  state: { x: 0, y: 0, k: 1, sel: null, cats: null, kinds: null, ekinds: null, q: "", focus: false, init: false },
  render(focusId) {
    document.onscroll = null;
    const st = this.state;
    if (focusId && S.byId[focusId]) { st.sel = focusId; st.focus = true; }
    const nodes = S.graph.nodes || [], edges = S.graph.edges || [];
    const cats = [...new Set(nodes.filter(n => !n.kind || n.kind === "article").map(n => n.category))];
    if (!st.cats) st.cats = new Set(nodes.map(n => n.category));
    if (!st.kinds) st.kinds = new Set(["article", "lecture", "paper", "worksheet", "ref"]);
    if (!st.ekinds) st.ekinds = new Set(["rel"]); // evidence edges (cite/test) opt-in: kills the hairball
    else st.ekinds.delete("pre");
    if (!st.init) {
      st.init = true;
      const deg = {};
      edges.forEach(e => { if ((e.kind || "rel") === "rel") { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; } });
      const top = [...S.articles].sort((a, b) => (deg[b.id] || 0) - (deg[a.id] || 0))[0];
      if (top && !st.sel) { st.sel = top.id; st.focus = true; }
    }
    const col = cat => (window.catColor ? window.catColor(cat, cats.indexOf(cat)) : ["#7db8e8", "#D9A441", "#7FB685", "#D97A6C", "#B39DDB", "#66C6C0", "#E08FA5"][cats.indexOf(cat) % 7] || "#7DB8E8");
    // deterministic layout: high-degree articles inner ring, rest outer ring, sources on rails
    const pos = {};
    const degAll = {};
    edges.forEach(e => { if ((e.kind || "rel") === "rel") { degAll[e.from] = (degAll[e.from] || 0) + 1; degAll[e.to] = (degAll[e.to] || 0) + 1; } });
    const arts = nodes.filter(n => (!n.kind || n.kind === "article") && st.cats.has(n.category) && st.kinds.has("article"));
    arts.sort((a, b) => (degAll[b.id] || 0) - (degAll[a.id] || 0) || a.id.localeCompare(b.id));
    const inner = arts.slice(0, 8), outer = arts.slice(8);
    const ring = (list, rx, ry) => list.forEach((a, i) => {
      const ang = (list.length <= 1 ? 0 : (i / list.length) * Math.PI * 2 - Math.PI / 2);
      pos[a.id] = [400 + rx * Math.cos(ang), 300 + ry * Math.sin(ang)];
    });
    ring(inner, 130, 100); ring(outer, 245, 178);
    const row = (list, y) => list.sort((a, b) => a.id.localeCompare(b.id)).forEach((n, i, arr) =>
      pos[n.id] = [60 + (680 * (arr.length === 1 ? 0.5 : i / (arr.length - 1))), y]);
    row(nodes.filter(n => n.kind === "lecture" && st.cats.has(n.category) && st.kinds.has("lecture")), 52);
    row(nodes.filter(n => (n.kind === "paper" || n.kind === "worksheet") && st.cats.has(n.category) && (st.kinds.has(n.kind))), 488);
    row(nodes.filter(n => n.kind === "ref" && st.cats.has(n.category) && st.kinds.has("ref")), 552);
    const vis = new Set(Object.keys(pos));
    let nb = null;
    if (st.sel && st.focus) {
      nb = new Set([st.sel]);
      edges.forEach(e => { if (e.from === st.sel) nb.add(e.to); if (e.to === st.sel) nb.add(e.from); });
    }
    const show = id => vis.has(id) && (!nb || nb.has(id)) &&
      (!st.q || (S.graph.nodes.find(n => n.id === id)?.title || "").toLowerCase().includes(st.q));
    const EK = { rel: "var(--v-line)", pre: "var(--v-blue)", cite: "var(--v-amber)", test: "var(--v-green)" };
    const edgeSVG = edges.filter(e => show(e.from) && show(e.to) && st.ekinds.has(e.kind || "rel")).map(e => {
      const a = pos[e.from], b = pos[e.to], hot = st.sel && (e.from === st.sel || e.to === st.sel);
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${EK[e.kind] || "var(--v-line)"}"
        stroke-width="${hot ? 2.4 : 1.1}" ${e.kind === "cite" || e.kind === "test" ? 'stroke-dasharray="5 4"' : ""} opacity="${st.sel && !hot ? 0.25 : 0.9}"/>`;
    }).join("");
    const nodeSVG = nodes.filter(n => show(n.id)).map(n => {
      const [x, y] = pos[n.id], sel = st.sel === n.id;
      const dim = st.sel && !(nb ? nb.has(n.id) : edges.some(e => (e.from === st.sel && e.to === n.id) || (e.to === st.sel && e.from === n.id)) || n.id === st.sel);
      const op = dim ? 0.3 : 1;
      const full = n.title || n.id;
      const label = full.length > 18 ? full.slice(0, 17) + "…" : full;
      let shape = "";
      if (!n.kind || n.kind === "article") shape = `<circle r="${sel ? 13 : 8}" fill="var(--v-box)" stroke="${col(n.category)}" stroke-width="${sel ? 3 : 1.6}"/>`;
      else if (n.kind === "lecture") shape = `<rect x="-9" y="-9" width="18" height="18" rx="4" fill="var(--v-box)" stroke="${VC.amber}" stroke-width="${sel ? 3 : 1.6}"/>`;
      else if (n.kind === "paper") shape = `<rect x="-9" y="-9" width="18" height="18" fill="var(--v-box)" stroke="${VC.red}" stroke-width="${sel ? 3 : 1.6}"/>`;
      else shape = `<polygon points="0,-10 9,7 -9,7" fill="var(--v-box)" stroke="${VC.mut}" stroke-width="${sel ? 3 : 1.6}"/>`;
      return `<g class="gnode${sel ? " focus" : ""}" data-id="${n.id}" transform="translate(${x.toFixed(0)},${y.toFixed(0)})" opacity="${op}" tabindex="0" role="button" aria-label="${esc(full)}"><title>${esc(full)}</title>${shape}<text y="24" text-anchor="middle">${esc(label)}</text></g>`;
    }).join("");
    const q = st.q;
    $("#view").innerHTML = `<p class="crumbs"><a href="#/">Home</a></p>
      <h1 class="atitle">Concept map</h1>
      <p class="summary">${arts.length} topics and how they connect, with the lectures and papers behind them. Drag to move, scroll to zoom, select a node to see its links.</p>
      <div class="gtoolbar">
        <input id="gq" type="search" placeholder="Find a node…" value="${esc(q)}" aria-label="Find a node">
        <button class="btn small ghost" id="gReset">Reset</button>
        <button class="btn small ghost" id="gFocus">${st.focus ? "Show everything" : "Show only the selected topic"}</button>
        <span class="gzoom"><button class="iconbtn" id="gzOut" aria-label="Zoom out">−</button>
        <button class="iconbtn" id="gzIn" aria-label="Zoom in">+</button></span>
      </div>
      <div class="graphwrap"><svg id="gsvg" viewBox="0 0 800 600" role="img" aria-label="Interactive concept graph">
        <g id="gvp" transform="translate(${st.x},${st.y}) scale(${st.k})">${edgeSVG}${nodeSVG}</g></svg></div>
      <div class="gfilters">
        <details open><summary>Units</summary><div class="gchecks">
          ${[...new Set(nodes.map(n => n.category))].map(c => `<label><input type="checkbox" data-cat="${esc(c)}" ${st.cats.has(c) ? "checked" : ""}> <i class="cdot" style="background:${col(c)}"></i>${esc(c)}</label>`).join("")}
        </div></details>
        <details open><summary>Show</summary><div class="gchecks">
          ${[["article", "Topics"], ["lecture", "Lectures"], ["paper", "Past papers"], ["worksheet", "Worksheets"], ["ref", "References"]].map(([k, l]) => `<label><input type="checkbox" data-kind="${k}" ${st.kinds.has(k) ? "checked" : ""}> ${l}</label>`).join("")}
        </div></details>
        <details open><summary>Links</summary><div class="gchecks">
          ${[["rel", "Related topics"], ["cite", "Topic is covered in a lecture"], ["test", "Topic is tested by a paper"]].map(([k, l]) => `<label><input type="checkbox" data-ek="${k}" ${st.ekinds.has(k) ? "checked" : ""}> ${l}</label>`).join("")}
        </div></details>
      </div>
      <p class="rel legend legend-row">${cats.map(c => `<span><i class="cdot" style="background:${col(c)}"></i>${esc(c)}</span>`).join("")}<br><span style="color:${VC.blue}">●</span> topic &nbsp;<span style="color:${VC.amber}">■</span> lecture &nbsp;<span style="color:${VC.red}">■</span> past paper &nbsp;<span style="color:${VC.mut}">▲</span> worksheet or reference</p>`;
    this.detail();
    // interactions
    const svg = $("#gsvg"), vp = $("#gvp");
    const apply = () => {
      vp.setAttribute("transform", `translate(${st.x},${st.y}) scale(${st.k})`);
      svg.classList.toggle("zoomout", st.k < 0.75);
    };
    let drag = null;
    svg.addEventListener("pointerdown", e => { drag = [e.clientX, e.clientY, st.x, st.y]; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", e => { if (drag) { st.x = drag[2] + (e.clientX - drag[0]); st.y = drag[3] + (e.clientY - drag[1]); apply(); } });
    svg.addEventListener("pointerup", () => drag = null);
    svg.addEventListener("wheel", e => { e.preventDefault(); st.k = Math.min(3, Math.max(0.4, st.k * (e.deltaY < 0 ? 1.12 : 0.9))); apply(); }, { passive: false });
    $("#gzIn").onclick = () => { st.k = Math.min(3, st.k * 1.25); apply(); };
    $("#gzOut").onclick = () => { st.k = Math.max(0.4, st.k * 0.8); apply(); };
    $("#gReset").onclick = () => { Object.assign(st, { x: 0, y: 0, k: 1, sel: null, focus: false }); this.render(); };
    $("#gFocus").onclick = () => { st.focus = !st.focus; this.render(); };
    let gqT = 0;
    $("#gq").addEventListener("input", e => {
      clearTimeout(gqT);
      const el = e.target, val = el.value, caret = el.selectionStart;
      gqT = setTimeout(() => {
        st.q = val.trim().toLowerCase();
        const m = nodes.find(n => (n.title || "").toLowerCase().includes(st.q) && st.q);
        if (m) st.sel = m.id;
        this.render();
        const nq = $("#gq");
        if (nq) { nq.focus(); try { nq.setSelectionRange(caret, caret); } catch {} }
      }, 160);
    });
    $$("#view [data-cat]").forEach(c => c.onchange = () => { c.checked ? st.cats.add(c.dataset.cat) : st.cats.delete(c.dataset.cat); this.render(); });
    $$("#view [data-kind]").forEach(c => c.onchange = () => { c.checked ? st.kinds.add(c.dataset.kind) : st.kinds.delete(c.dataset.kind); this.render(); });
    $$("#view [data-ek]").forEach(c => c.onchange = () => { c.checked ? st.ekinds.add(c.dataset.ek) : st.ekinds.delete(c.dataset.ek); this.render(); });
    const activate = g => { st.sel = g.dataset.id; this.render(); const ng = document.querySelector(`#gsvg .gnode[data-id="${CSS.escape(g.dataset.id)}"]`); if (ng) ng.focus(); };
    $$("#gsvg .gnode").forEach(g => {
      g.addEventListener("click", e => { e.stopPropagation(); st.sel = g.dataset.id; this.render(); });
      g.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(g); }
      });
    });
    svg.addEventListener("click", e => { if (e.target === svg) { st.sel = null; this.render(); } });
    markNav("");
  },
  detail() {
    const st = this.state, n = (S.graph.nodes || []).find(x => x.id === st.sel);
    let html = `<div class="ctx"><h3>Selection</h3>`;
    if (!n) html += `<p class="rel">Select a node to see what it links to.</p>`;
    else {
      const edges = (S.graph.edges || []).filter(e => e.from === n.id || e.to === n.id);
      const a = S.byId[n.id];
      html += `<h4 style="margin:.2rem 0;font-size:1.05rem">${esc(n.title)}</h4>
        <p class="rel">${esc(({ article: "Topic", lecture: "Lecture", paper: "Past paper", worksheet: "Worksheet", ref: "Reference" })[n.kind || "article"] || "")}, ${esc(n.category || "")}</p>`;
      if (a) html += `<p class="rel">${esc((a.summary || "").slice(0, 160))}…</p>
        <p class="rel">You: ${esc((MLABEL[masteryOf(n.id)] || "").toLowerCase())}</p>
        <p><a class="btn small" href="#/article/${n.id}">Open this topic</a></p>`;
      const seen = new Set();
      const others = edges.map(e => e.from === n.id ? e.to : e.from).filter(o => !seen.has(o) && seen.add(o));
      html += `<h3>Linked to (${others.length})</h3><ul class="links">${others.slice(0, 14).map(o => {
        const on = (S.graph.nodes || []).find(x => x.id === o);
        return `<li><a href="#" data-go="${o}">${esc(on?.title || o)}</a></li>`; }).join("")}</ul>`;
    }
    html += `</div>`;
    $("#rightRail").innerHTML = html;
    $$("#rightRail [data-go]").forEach(x => x.onclick = ev => { ev.preventDefault(); st.sel = x.dataset.go; st.focus = false; this.render(); });
  }
};
