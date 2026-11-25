// =====================================================================
// מעצב חכם — עורך תוכניות (2D), תלת־ממד, ייצוא DXF
// כל המידות בס"מ. ציר Y של העולם כלפי מטה (כמו במסך).
// =====================================================================
(function () {
const WALL_TYPES = {
  interior: { name: 'קיר פנימי (גבס/בלוק)', thick: 10, fill: '#b9b2a8', c3: 0xefeae3 },
  exterior: { name: 'קיר חיצוני', thick: 20, fill: '#6f6760', c3: 0xe4ddd3 },
  bearing:  { name: 'קיר נושא', thick: 20, fill: 'url(#hBearing)', c3: 0xd9d0c4 },
  mamad:    { name: 'קיר ממ"ד', thick: 30, fill: 'url(#hMamad)', c3: 0xd6c4bc },
  unknown:  { name: 'לא מאומת', thick: 15, fill: 'url(#hUnknown)', c3: 0xe9e2d0 }
};
const OPENING_DEF = {
  door:   { name: 'דלת', width: 90, height: 210, sill: 0 },
  window: { name: 'חלון', width: 120, height: 120, sill: 90 }
};

const P = {
  p: null, plan: null, svg: null, g: null, tool: 'select', sel: null,
  view: { s: 0.5, tx: 40, ty: 40 }, showOriginal: false, chain: null, cursor: null,
  pointers: new Map(), gesture: null, calib: null, bgImgEl: null
};

function ensurePlan(p) {
  if (!p.plan) p.plan = { walls: [], openings: [], height: 280, bg: null, original: null };
  return p.plan;
}
const cur = () => (P.showOriginal && P.plan.original) ? P.plan.original : P.plan;
const len = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
const fmt = (n) => Math.round(n);

// ---------------- כללים ----------------
function openingRule(w, kind) {
  const n = kind === 'door' ? 'דלת' : 'חלון';
  if (w.type === 'mamad') return { level: 'red', msg: `אסור לפרוץ ${n} בקיר ממ"ד (קיר הדף).` };
  if (w.type === 'bearing') return { level: 'orange', msg: `זה קיר נושא. פריצת ${n} מחייבת אישור קונסטרוקטור. להוסיף לסקיצה בכל זאת?` };
  if (w.type === 'exterior') return { level: 'orange', msg: `זה קיר חיצוני. שינוי בחזית דורש היתר. להוסיף לסקיצה בכל זאת?` };
  if (w.type === 'unknown') return { level: 'orange', msg: `הקיר לא מאומת — לא ידוע אם הוא נושא. כדאי לבדוק עם קונסטרוקטור. להוסיף בכל זאת?` };
  return null;
}
function deleteRule(w) {
  if (w.type === 'mamad') return { level: 'red', msg: 'אסור להרוס או לקצר קיר ממ"ד.' };
  if (w.type === 'bearing') return { level: 'orange', msg: 'זה קיר נושא. הריסה מחייבת קונסטרוקטור והיתר. למחוק מהסקיצה בכל זאת?' };
  if (w.type === 'exterior') return { level: 'orange', msg: 'זה קיר חיצוני. שינוי בחזית דורש היתר. למחוק בכל זאת?' };
  if (w.type === 'unknown') return { level: 'orange', msg: 'הקיר לא מאומת. אם הוא נושא — אסור להרוס בלי קונסטרוקטור. למחוק בכל זאת?' };
  return null;
}
function checkRule(r) {
  if (!r) return true;
  if (r.level === 'red') { alertBox(r); return false; }
  return confirm('⚠️ ' + r.msg);
}
function alertBox(r) {
  modal('⛔ פעולה אסורה', `<div class="rule red"><span class="dot red"></span><div><b>${esc(r.msg)}</b></div></div>
    <div class="muted" style="margin-top:8px">הכלל מופיע ב"ספר הכללים". האפליקציה היא כלי עזר, ואיש מקצוע מוסמך הוא שמחליט.</div>`);
}
function openingIssues(o, w) {
  const out = [];
  if (o.kind === 'door' && o.width < 90) out.push({ level: 'orange', msg: 'רוחב דלת מינימלי 90 ס"מ (אפשר להגדיל, לא להקטין).' });
  const L = len(w);
  if (o.pos - o.width / 2 < 0 || o.pos + o.width / 2 > L) out.push({ level: 'red', msg: 'הפתח יוצא מגבולות הקיר.' });
  for (const x of P.plan.openings) if (x !== o && x.wallId === o.wallId && Math.abs(x.pos - o.pos) < (x.width + o.width) / 2) out.push({ level: 'orange', msg: 'הפתח חופף לפתח אחר באותו קיר.' });
  return out;
}

// ---------------- גאומטריה ----------------
function toWorld(cx, cy) { const r = P.svg.getBoundingClientRect(); return { x: (cx - r.left - P.view.tx) / P.view.s, y: (cy - r.top - P.view.ty) / P.view.s }; }
function projOnWall(w, pt) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1;
  let t = ((pt.x - w.x1) * dx + (pt.y - w.y1) * dy) / L2; t = Math.max(0, Math.min(1, t));
  const x = w.x1 + t * dx, y = w.y1 + t * dy;
  return { t, x, y, d: Math.hypot(pt.x - x, pt.y - y), pos: t * Math.sqrt(L2) };
}
function hitWall(pt, walls = cur().walls) {
  let best = null;
  for (const w of walls) { const pr = projOnWall(w, pt); const tol = (w.thick || 10) / 2 + 14 / P.view.s; if (pr.d < tol && (!best || pr.d < best.d)) best = { w, ...pr }; }
  return best;
}
function hitOpening(pt) {
  const pl = cur();
  for (const o of pl.openings) {
    const w = pl.walls.find(x => x.id === o.wallId); if (!w) continue;
    const pr = projOnWall(w, pt); if (pr.d < (w.thick / 2 + 14 / P.view.s) && Math.abs(pr.pos - o.pos) < o.width / 2) return o;
  }
  return null;
}
function snap(pt, from) {
  const tol = 16 / P.view.s;
  for (const w of P.plan.walls) for (const e of [[w.x1, w.y1], [w.x2, w.y2]]) if (Math.hypot(pt.x - e[0], pt.y - e[1]) < tol) return { x: e[0], y: e[1], snapped: true };
  let x = Math.round(pt.x / 5) * 5, y = Math.round(pt.y / 5) * 5;
  if (from) {
    const dx = x - from.x, dy = y - from.y;
    if (Math.abs(dy) < Math.abs(dx) * 0.2) y = from.y; else if (Math.abs(dx) < Math.abs(dy) * 0.2) x = from.x;
  }
  return { x, y };
}
function wallPoly(w) {
  const L = len(w) || 1, nx = -(w.y2 - w.y1) / L * w.thick / 2, ny = (w.x2 - w.x1) / L * w.thick / 2;
  return [[w.x1 + nx, w.y1 + ny], [w.x2 + nx, w.y2 + ny], [w.x2 - nx, w.y2 - ny], [w.x1 - nx, w.y1 - ny]];
}
function along(w, d) { const L = len(w) || 1; return { x: w.x1 + (w.x2 - w.x1) * d / L, y: w.y1 + (w.y2 - w.y1) * d / L, ux: (w.x2 - w.x1) / L, uy: (w.y2 - w.y1) / L }; }

// ---------------- ציור SVG ----------------
function planSVG(pl, opts = {}) {
  const s = opts.forPrint ? 1 : P.view.s;
  const parts = [];
  const orig = opts.diff ? P.plan.original : null;
  const origIds = orig ? new Set([...orig.walls.map(w => w.id), ...orig.openings.map(o => o.id)]) : null;
  const curIds = orig ? new Set([...pl.walls.map(w => w.id), ...pl.openings.map(o => o.id)]) : null;
  if (orig) for (const w of orig.walls) if (!curIds.has(w.id)) parts.push(`<polygon points="${wallPoly(w).join(' ')}" fill="none" stroke="#c0392b" stroke-width="${2 / s}" stroke-dasharray="${8 / s} ${5 / s}"/>`);
  for (const w of pl.walls) {
    const isSel = P.sel?.kind === 'wall' && P.sel.id === w.id && !opts.forPrint;
    const isNew = orig && !origIds.has(w.id);
    parts.push(`<polygon data-w="${w.id}" points="${wallPoly(w).join(' ')}" fill="${(WALL_TYPES[w.type] || WALL_TYPES.interior).fill}" stroke="${isSel ? '#a86b4a' : isNew ? '#2e8b57' : '#2f2a26'}" stroke-width="${(isSel || isNew ? 3 : 1) / s}"/>`);
  }
  for (const o of pl.openings) {
    const w = pl.walls.find(x => x.id === o.wallId); if (!w) continue;
    const a = along(w, o.pos - o.width / 2), b = along(w, o.pos + o.width / 2);
    const nx = -a.uy * w.thick / 2, ny = a.ux * w.thick / 2;
    const isSel = P.sel?.kind === 'opening' && P.sel.id === o.id && !opts.forPrint;
    const isNew = orig && !origIds.has(o.id);
    const col = isSel ? '#a86b4a' : isNew ? '#2e8b57' : '#2f2a26';
    parts.push(`<polygon points="${a.x + nx * 1.05},${a.y + ny * 1.05} ${b.x + nx * 1.05},${b.y + ny * 1.05} ${b.x - nx * 1.05},${b.y - ny * 1.05} ${a.x - nx * 1.05},${a.y - ny * 1.05}" fill="#fff" stroke="none"/>`);
    if (o.kind === 'door') {
      const flip = o.flip ? -1 : 1, px = -a.uy * flip, py = a.ux * flip;
      const hx = a.x + px * w.thick / 2, hy = a.y + py * w.thick / 2;
      const tipx = hx + px * o.width, tipy = hy + py * o.width;
      const ex = hx + a.ux * o.width, ey = hy + a.uy * o.width;
      parts.push(`<line x1="${hx}" y1="${hy}" x2="${tipx}" y2="${tipy}" stroke="${col}" stroke-width="${2 / s}"/>`);
      const sweep = (px * a.uy - py * a.ux) > 0 ? 1 : 0;
      parts.push(`<path d="M${tipx},${tipy} A${o.width},${o.width} 0 0,${sweep} ${ex},${ey}" fill="none" stroke="${col}" stroke-width="${1 / s}" stroke-dasharray="${4 / s} ${3 / s}"/>`);
    } else {
      for (const k of [-0.5, 0, 0.5]) parts.push(`<line x1="${a.x + nx * k * 2 * 0.9}" y1="${a.y + ny * k * 2 * 0.9}" x2="${b.x + nx * k * 2 * 0.9}" y2="${b.y + ny * k * 2 * 0.9}" stroke="${col}" stroke-width="${(k === 0 ? 1 : 1.5) / s}"/>`);
    }
  }
  if (orig) for (const o of orig.openings) if (!curIds.has(o.id)) {
    const w = orig.walls.find(x => x.id === o.wallId); if (!w) continue;
    const a = along(w, o.pos - o.width / 2), b = along(w, o.pos + o.width / 2);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#c0392b" stroke-width="${4 / s}" stroke-dasharray="${6 / s} ${4 / s}"/>`);
  }
  if (opts.dims !== false) for (const w of pl.walls) {
    const L = len(w); if (L < 20) continue;
    const m = along(w, L / 2), off = w.thick / 2 + 14 / s;
    const tx = m.x - m.uy * off, ty = m.y + m.ux * off;
    let ang = Math.atan2(m.uy, m.ux) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
    parts.push(`<text x="${tx}" y="${ty}" font-size="${12 / s}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${tx} ${ty})" fill="#5a524b" stroke="#fff" stroke-width="${3 / s}" paint-order="stroke">${fmt(L)}</text>`);
  }
  return parts.join('');
}
const DEFS = `<defs>
  <pattern id="hBearing" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#8d847b"/><line x1="0" y1="0" x2="0" y2="8" stroke="#2f2a26" stroke-width="3"/></pattern>
  <pattern id="hMamad" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#d98b7e"/><line x1="0" y1="0" x2="0" y2="8" stroke="#8e2b1f" stroke-width="3"/><line x1="4" y1="0" x2="4" y2="8" stroke="#8e2b1f" stroke-width="1"/></pattern>
  <pattern id="hUnknown" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#e8d9a0"/><line x1="0" y1="0" x2="0" y2="10" stroke="#b89b2f" stroke-width="4"/></pattern>
</defs>`;

function draw() {
  if (!P.svg) return;
  const pl = cur(), s = P.view.s;
  const bg = P.plan.bg && P.bgImgEl ? `<image href="${P.bgImgEl}" x="${P.plan.bg.x || 0}" y="${P.plan.bg.y || 0}" width="${P.plan.bg.w * P.plan.bg.scale}" height="${P.plan.bg.h * P.plan.bg.scale}" opacity="${P.plan.bg.opacity ?? 0.5}" preserveAspectRatio="none"/>` : '';
  // רשת
  const r = P.svg.getBoundingClientRect();
  const x0 = -P.view.tx / s, y0 = -P.view.ty / s, x1 = x0 + r.width / s, y1 = y0 + r.height / s;
  const step = s > 0.8 ? 50 : s > 0.3 ? 100 : 500; let grid = '';
  for (let x = Math.floor(x0 / step) * step; x < x1; x += step) grid += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${x % 500 === 0 ? '#ddd3c6' : '#ece5dc'}" stroke-width="${1 / s}"/>`;
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) grid += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${y % 500 === 0 ? '#ddd3c6' : '#ece5dc'}" stroke-width="${1 / s}"/>`;
  let extra = '';
  if (P.chain && P.cursor) {
    const a = P.chain, b = P.cursor, L = Math.hypot(b.x - a.x, b.y - a.y);
    extra += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#a86b4a" stroke-width="${WALL_TYPES[P.wallType].thick}" stroke-opacity=".5"/>
      <text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 18 / s}" font-size="${15 / s}" text-anchor="middle" fill="#a86b4a" stroke="#fff" stroke-width="${4 / s}" paint-order="stroke" font-weight="700">${fmt(L)} ס"מ</text>`;
  }
  if (P.cursor && (P.tool === 'wall' || P.tool === 'calib')) extra += `<circle cx="${P.cursor.x}" cy="${P.cursor.y}" r="${6 / s}" fill="${P.cursor.snapped ? '#2e8b57' : '#a86b4a'}"/>`;
  if (P.calib?.a) extra += `<circle cx="${P.calib.a.x}" cy="${P.calib.a.y}" r="${6 / s}" fill="#c0392b"/>` + (P.cursor ? `<line x1="${P.calib.a.x}" y1="${P.calib.a.y}" x2="${P.cursor.x}" y2="${P.cursor.y}" stroke="#c0392b" stroke-width="${2 / s}"/>` : '');
  P.svg.innerHTML = DEFS + `<g transform="translate(${P.view.tx},${P.view.ty}) scale(${s})">${grid}${bg}${planSVG(pl, { diff: !P.showOriginal && P.plan.original && P.diffOn })}${extra}</g>`;
}

// ---------------- מסך העורך ----------------
function open(app, p) {
  P.p = p; P.plan = ensurePlan(p); P.sel = null; P.chain = null; P.cursor = null; P.calib = null;
  P.wallType = P.wallType || 'interior';
  setHeader('📐 ' + p.name, true);
  app.innerHTML = `
    <div class="card" style="padding:10px">
      <div class="chips" id="tools">
        <span class="chip" data-t="select">👆 בחירה</span><span class="chip" data-t="pan">✋ הזזה</span>
        <span class="chip" data-t="wall">🧱 קיר</span><span class="chip" data-t="door">🚪 דלת</span><span class="chip" data-t="window">🪟 חלון</span>
      </div>
      <div class="row" style="margin-top:8px"><span class="muted">סוג קיר חדש:</span>
        <select id="wtSel" class="grow" style="padding:7px 10px;flex:1">${Object.entries(WALL_TYPES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></div>
      <div id="hint" class="muted" style="margin-top:6px;min-height:3.9em;line-height:1.3"></div>
    </div>
    <div style="position:relative;background:#fbf8f4;border:1px solid var(--line);border-radius:14px;overflow:hidden;height:58vh;touch-action:none" id="stage">
      <svg id="psvg" width="100%" height="100%" style="display:block;touch-action:none;user-select:none"></svg>
      <div style="position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:6px">
        <button class="btn sec sm" id="zin">＋</button><button class="btn sec sm" id="zout">－</button><button class="btn sec sm" id="zfit">⤢</button></div>
      <div id="chainBar" style="position:absolute;bottom:8px;right:8px;display:none"><button class="btn sm" id="endChain">✓ סיום קו</button></div>
      ${P.plan.original ? `<div style="position:absolute;top:8px;right:8px"><button class="btn ${P.showOriginal ? '' : 'sec'} sm" id="baBtn">${P.showOriginal ? '👁 מצב קיים (לפני)' : '✏️ אחרי (תכנון)'}</button></div>` : ''}
    </div>
    <div id="props" style="margin-top:10px"></div>
    <div class="card" style="margin-top:10px">
      <div class="grid2">
        <button class="btn" id="b3d">🏠 תלת־ממד</button>
        <button class="btn sec" id="bDxf">⬇️ ייצוא לאוטוקאד (DXF)</button>
        <button class="btn sec" id="bBg">🖼️ סרטוט רקע</button>
        <button class="btn sec" id="bOrig">${P.plan.original ? '🔄 עדכון "מצב קיים"' : '📸 קבע כ"מצב קיים"'}</button>
      </div>
      ${P.plan.original ? `<label style="display:flex;gap:8px;align-items:center;color:var(--ink);margin-top:10px"><input type="checkbox" id="diffOn" style="width:auto" ${P.diffOn ? 'checked' : ''}> סמן שינויים (ירוק = חדש, אדום מקווקו = נהרס)</label>` : ''}
      <label>גובה תקרה (ס"מ)</label><input id="ph" type="number" inputmode="numeric" value="${P.plan.height || 280}">
      ${P.plan.bg ? `<label>שקיפות הרקע</label><input id="bgOp" type="range" min="0" max="1" step="0.05" value="${P.plan.bg.opacity ?? 0.5}" style="padding:0">
        <div class="row" style="margin-top:8px"><button class="btn sec sm" id="bCal">📏 כיול קנה מידה</button><button class="btn danger sm" id="bBgDel">הסרת הרקע</button></div>` : ''}
      <div class="muted" style="margin-top:8px">${P.plan.walls.length} קירות · ${P.plan.openings.length} פתחים</div>
    </div>`;
  P.svg = $('#psvg');
  bindTools(); bindPointer(); renderProps();
  if (P.plan.bg) getImg(P.plan.bg.img).then(src => { P.bgImgEl = src; draw(); }); else P.bgImgEl = null;
  if (!P.fitted) { fit(); P.fitted = p.id; } else if (P.fitted !== p.id) { fit(); P.fitted = p.id; }
  setTool(P.tool); draw();
  $('#zin').onclick = () => zoomAt(1.4); $('#zout').onclick = () => zoomAt(1 / 1.4); $('#zfit').onclick = () => { fit(); draw(); };
  $('#endChain').onclick = () => { P.chain = null; P.cursor = null; $('#chainBar').style.display = 'none'; draw(); };
  $('#b3d').onclick = () => open3D(P.plan);
  $('#bDxf').onclick = () => exportDXF(p);
  $('#bBg').onclick = pickBackground;
  $('#bOrig').onclick = () => {
    if (!P.plan.walls.length) return toast('קודם משרטטים את הבית');
    if (P.plan.original && !confirm('לעדכן את "מצב קיים" לתוכנית הנוכחית? המצב הקודם יוחלף.')) return;
    P.plan.original = clone({ walls: P.plan.walls, openings: P.plan.openings }); P.showOriginal = false; changed(); toast('נשמר כ"מצב קיים". מכאן כל שינוי נחשב "אחרי".', 3500); rerender();
  };
  if ($('#baBtn')) $('#baBtn').onclick = () => { P.showOriginal = !P.showOriginal; P.sel = null; rerender(); };
  if ($('#diffOn')) $('#diffOn').onchange = (e) => { P.diffOn = e.target.checked; draw(); };
  $('#ph').onchange = (e) => { P.plan.height = +e.target.value || 280; changed(); };
  if ($('#bgOp')) $('#bgOp').oninput = (e) => { P.plan.bg.opacity = +e.target.value; draw(); changed(); };
  if ($('#bCal')) $('#bCal').onclick = () => { P.calib = { a: null }; setTool('calib'); };
  if ($('#bBgDel')) $('#bBgDel').onclick = async () => { if (!confirm('להסיר את סרטוט הרקע?')) return; await delImg(P.plan.bg.img); P.plan.bg = null; P.bgImgEl = null; changed(); rerender(); };
}
function rerender() { open($('#app'), P.p); }
function changed() { P.p.updated = Date.now(); save(); }

function setTool(t) {
  if (P.showOriginal && ['wall', 'door', 'window'].includes(t)) { toast('במצב "לפני" אי אפשר לערוך. עוברים ל"אחרי".'); t = 'select'; }
  P.tool = t; P.chain = null; P.cursor = null;
  document.querySelectorAll('#tools .chip').forEach(c => c.classList.toggle('on', c.dataset.t === t));
  $('#wtSel').value = P.wallType;
  $('#chainBar').style.display = 'none';
  const hints = {
    select: 'לוחצים על קיר או פתח כדי לערוך. גרירה באצבע אחת מזיזה את התוכנית, שתי אצבעות לזום.',
    pan: 'גרירה מזיזה את התוכנית. שתי אצבעות לזום.',
    wall: 'נוגעים בנקודת ההתחלה, ואז בנקודת הסוף (אפשר לגרור כדי לכוון). הקיר הבא ממשיך מאותה נקודה. מידות נצמדות ל-5 ס"מ.',
    door: 'נוגעים על קיר כדי להוסיף דלת (90 ס"מ).',
    window: 'נוגעים על קיר כדי להוסיף חלון (120 ס"מ).',
    calib: 'כיול: נוגעים בתחילת מידה ידועה בסרטוט, ואז בסופה. אחר כך מקלידים את המידה האמיתית בס"מ.'
  };
  $('#hint').textContent = hints[t] || '';
  draw();
}
function bindTools() {
  document.querySelectorAll('#tools .chip').forEach(c => c.onclick = () => setTool(c.dataset.t));
  $('#wtSel').onchange = (e) => { P.wallType = e.target.value; setTool('wall'); };
}

function fit() {
  const pl = cur(); const r = P.svg.getBoundingClientRect();
  let pts = pl.walls.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]);
  if (!pts.length && P.plan.bg) pts = [[P.plan.bg.x || 0, P.plan.bg.y || 0], [(P.plan.bg.x || 0) + P.plan.bg.w * P.plan.bg.scale, (P.plan.bg.y || 0) + P.plan.bg.h * P.plan.bg.scale]];
  if (!pts.length) pts = [[0, 0], [1000, 800]];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minx = Math.min(...xs) - 60, maxx = Math.max(...xs) + 60, miny = Math.min(...ys) - 60, maxy = Math.max(...ys) + 60;
  const s = Math.min(r.width / (maxx - minx), r.height / (maxy - miny)) || 0.5;
  P.view = { s, tx: (r.width - (maxx - minx) * s) / 2 - minx * s, ty: (r.height - (maxy - miny) * s) / 2 - miny * s };
}
function zoomAt(f, cx, cy) {
  const r = P.svg.getBoundingClientRect(); cx = cx ?? r.left + r.width / 2; cy = cy ?? r.top + r.height / 2;
  const w = toWorld(cx, cy); P.view.s = Math.max(0.05, Math.min(8, P.view.s * f));
  P.view.tx = cx - r.left - w.x * P.view.s; P.view.ty = cy - r.top - w.y * P.view.s; draw();
}

function bindPointer() {
  const el = P.svg;
  el.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId); P.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (P.pointers.size === 2) {
      const [a, b] = [...P.pointers.values()];
      P.gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...P.view } };
      P.cursor = null; draw(); return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    const drawing = ['wall', 'calib'].includes(P.tool);
    P.gesture = { type: drawing ? 'draw' : 'tap', sx: e.clientX, sy: e.clientY, view: { ...P.view }, moved: false };
    if (drawing) { P.cursor = snap(pt, P.tool === 'wall' ? P.chain : P.calib?.a); draw(); }
  });
  el.addEventListener('pointermove', e => {
    if (!P.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && ['wall', 'calib'].includes(P.tool)) { P.cursor = snap(toWorld(e.clientX, e.clientY), P.tool === 'wall' ? P.chain : P.calib?.a); draw(); }
      return;
    }
    P.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = P.gesture; if (!g) return;
    if (g.type === 'pinch' && P.pointers.size >= 2) {
      const [a, b] = [...P.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = P.svg.getBoundingClientRect(), f = d / g.d;
      const wx = (g.cx - r.left - g.view.tx) / g.view.s, wy = (g.cy - r.top - g.view.ty) / g.view.s;
      P.view.s = Math.max(0.05, Math.min(8, g.view.s * f));
      P.view.tx = cx - r.left - wx * P.view.s; P.view.ty = cy - r.top - wy * P.view.s; draw(); return;
    }
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) g.moved = true;
    if (g.type === 'draw') { P.cursor = snap(toWorld(e.clientX, e.clientY), P.tool === 'wall' ? P.chain : P.calib?.a); draw(); }
    else if (g.moved) { P.view.tx = g.view.tx + e.clientX - g.sx; P.view.ty = g.view.ty + e.clientY - g.sy; draw(); }
  });
  const up = e => {
    if (!P.pointers.has(e.pointerId)) return;
    P.pointers.delete(e.pointerId);
    const g = P.gesture;
    if (g?.type === 'pinch') { if (P.pointers.size === 0) P.gesture = null; return; }
    P.gesture = null; if (!g) return;
    if (g.type === 'draw' && P.cursor) return commitPoint(P.cursor);
    if (g.type === 'tap' && !g.moved) onTap(toWorld(e.clientX, e.clientY));
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

function commitPoint(pt) {
  if (P.tool === 'calib') {
    if (!P.calib.a) { P.calib.a = { x: pt.x, y: pt.y }; draw(); return; }
    const a = P.calib.a, d = Math.hypot(pt.x - a.x, pt.y - a.y);
    P.calib = null; P.cursor = null;
    const real = +prompt('מה המידה האמיתית בס"מ בין שתי הנקודות?', '');
    if (real > 0 && d > 0) { const f = real / d; P.plan.bg.scale *= f; P.plan.bg.x = (P.plan.bg.x || 0) * f; P.plan.bg.y = (P.plan.bg.y || 0) * f; changed(); fit(); toast('קנה המידה כויל ✓ עכשיו משרטטים קירות מעל הסרטוט.', 3500); }
    setTool('wall'); return;
  }
  if (!P.chain) { P.chain = { x: pt.x, y: pt.y }; $('#chainBar').style.display = ''; P.cursor = null; draw(); return; }
  const a = P.chain; if (Math.hypot(pt.x - a.x, pt.y - a.y) < 5) { P.cursor = null; draw(); return; }
  const t = WALL_TYPES[P.wallType];
  P.plan.walls.push({ id: 'w' + uid(), x1: a.x, y1: a.y, x2: pt.x, y2: pt.y, thick: t.thick, type: P.wallType });
  P.chain = { x: pt.x, y: pt.y }; P.cursor = null; changed(); draw(); renderProps();
}

function onTap(pt) {
  if (P.tool === 'door' || P.tool === 'window') {
    const h = hitWall(pt); if (!h) return toast('נוגעים על קיר');
    const r = openingRule(h.w, P.tool); if (!checkRule(r)) return;
    const d = OPENING_DEF[P.tool], L = len(h.w);
    const width = Math.min(d.width, L - 10); if (width < 40) return toast('הקיר קצר מדי לפתח');
    const pos = Math.max(width / 2, Math.min(L - width / 2, h.pos));
    const o = { id: 'o' + uid(), wallId: h.w.id, kind: P.tool, pos, width, height: d.height, sill: d.sill };
    P.plan.openings.push(o); P.sel = { kind: 'opening', id: o.id }; changed(); draw(); renderProps(); return;
  }
  const o = hitOpening(pt); if (o) { P.sel = { kind: 'opening', id: o.id }; draw(); renderProps(); return; }
  const h = hitWall(pt); P.sel = h ? { kind: 'wall', id: h.w.id } : null; draw(); renderProps();
}

// ---------------- פאנל מאפיינים ----------------
function renderProps() {
  const box = $('#props'); if (!box) return;
  const pl = cur(), ro = P.showOriginal;
  if (!P.sel) { box.innerHTML = ''; return; }
  if (P.sel.kind === 'wall') {
    const w = pl.walls.find(x => x.id === P.sel.id); if (!w) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="card"><h3>🧱 קיר · ${fmt(len(w))} ס"מ</h3>
      <label>סוג הקיר</label><select id="wt" ${ro ? 'disabled' : ''}>${Object.entries(WALL_TYPES).map(([k, v]) => `<option value="${k}" ${w.type === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
      <div class="grid2"><div><label>אורך (ס"מ)</label><input id="wl" type="number" inputmode="numeric" value="${fmt(len(w))}" ${ro ? 'disabled' : ''}></div>
        <div><label>עובי (ס"מ)</label><input id="wk" type="number" inputmode="numeric" value="${w.thick}" ${ro ? 'disabled' : ''}></div></div>
      ${w.type === 'mamad' ? '<div class="rule red" style="margin-top:8px"><span class="dot red"></span><div>קיר ממ"ד — אסור לפרוץ, לקצר או להרוס.</div></div>' : ''}
      ${w.type === 'bearing' ? '<div class="rule orange" style="margin-top:8px"><span class="dot orange"></span><div>קיר נושא — כל שינוי מחייב קונסטרוקטור.</div></div>' : ''}
      ${w.type === 'unknown' ? '<div class="rule orange" style="margin-top:8px"><span class="dot orange"></span><div>לא ידוע אם הקיר נושא. כדאי לבדוק ולסמן.</div></div>' : ''}
      ${ro ? '' : '<div style="height:10px"></div><button class="btn danger full" id="wdel">מחיקת הקיר</button>'}</div>`;
    if (ro) return;
    $('#wt').onchange = e => {
      const nt = e.target.value;
      if (w.type === 'mamad' && nt !== 'mamad' && !confirm('לשנות סוג של קיר ממ"ד? עושים את זה רק אם הסימון היה טעות.')) { e.target.value = w.type; return; }
      w.type = nt; w.thick = WALL_TYPES[nt].thick; changed(); draw(); renderProps();
    };
    $('#wk').onchange = e => { w.thick = Math.max(5, +e.target.value || w.thick); changed(); draw(); };
    $('#wl').onchange = e => {
      const nl = +e.target.value; if (!(nl > 0)) return;
      if (w.type === 'mamad') { alertBox({ msg: 'אסור לקצר או להאריך קיר ממ"ד.' }); e.target.value = fmt(len(w)); return; }
      if (w.type === 'bearing' && !confirm('⚠️ זה קיר נושא. שינוי אורך מחייב קונסטרוקטור. להמשיך בסקיצה?')) { e.target.value = fmt(len(w)); return; }
      const L = len(w), ox = w.x2, oy = w.y2;
      w.x2 = w.x1 + (w.x2 - w.x1) / L * nl; w.y2 = w.y1 + (w.y2 - w.y1) / L * nl;
      for (const o of P.plan.walls) if (o !== w) { if (Math.abs(o.x1 - ox) < 1 && Math.abs(o.y1 - oy) < 1) { o.x1 = w.x2; o.y1 = w.y2; } if (Math.abs(o.x2 - ox) < 1 && Math.abs(o.y2 - oy) < 1) { o.x2 = w.x2; o.y2 = w.y2; } }
      changed(); draw(); renderProps();
    };
    $('#wdel').onclick = () => {
      if (!checkRule(deleteRule(w))) return;
      P.plan.walls = P.plan.walls.filter(x => x !== w); P.plan.openings = P.plan.openings.filter(o => o.wallId !== w.id);
      P.sel = null; changed(); draw(); renderProps();
    };
  } else {
    const o = pl.openings.find(x => x.id === P.sel.id); const w = o && pl.walls.find(x => x.id === o.wallId);
    if (!o || !w) { box.innerHTML = ''; return; }
    const issues = openingIssues(o, w);
    box.innerHTML = `<div class="card"><h3>${o.kind === 'door' ? '🚪 דלת' : '🪟 חלון'}</h3>
      <div class="grid2"><div><label>רוחב (ס"מ)</label><input id="ow" type="number" inputmode="numeric" value="${fmt(o.width)}" ${ro ? 'disabled' : ''}></div>
        <div><label>גובה (ס"מ)</label><input id="oh" type="number" inputmode="numeric" value="${fmt(o.height)}" ${ro ? 'disabled' : ''}></div></div>
      <div class="grid2"><div><label>מרחק מתחילת הקיר (ס"מ)</label><input id="op" type="number" inputmode="numeric" value="${fmt(o.pos - o.width / 2)}" ${ro ? 'disabled' : ''}></div>
        <div><label>${o.kind === 'window' ? 'גובה אדן (ס"מ)' : 'כיוון פתיחה'}</label>${o.kind === 'window' ? `<input id="os" type="number" inputmode="numeric" value="${fmt(o.sill)}" ${ro ? 'disabled' : ''}>` : `<button class="btn sec full" id="oflip" ${ro ? 'disabled' : ''}>⇄ הפוך</button>`}</div></div>
      ${issues.map(i => `<div class="rule ${i.level}" style="margin-top:8px"><span class="dot ${i.level}"></span><div>${esc(i.msg)}</div></div>`).join('')}
      ${ro ? '' : '<div style="height:10px"></div><button class="btn danger full" id="odel">מחיקה</button>'}</div>`;
    if (ro) return;
    const upd = () => { changed(); draw(); renderProps(); };
    $('#ow').onchange = e => { const v = +e.target.value; if (v > 0) { o.width = v; upd(); } };
    $('#oh').onchange = e => { const v = +e.target.value; if (v > 0) { o.height = v; upd(); } };
    $('#op').onchange = e => { const v = +e.target.value; if (v >= 0) { o.pos = v + o.width / 2; upd(); } };
    if ($('#os')) $('#os').onchange = e => { o.sill = Math.max(0, +e.target.value || 0); upd(); };
    if ($('#oflip')) $('#oflip').onclick = () => { o.flip = !o.flip; upd(); };
    $('#odel').onclick = () => {
      if ((w.type === 'mamad') && !confirm('זה פתח בקיר ממ"ד (כנראה החלון/הדלת המקוריים של הממ"ד). אסור לשנות אותם. למחוק מהסקיצה בכל זאת?')) return;
      P.plan.openings = P.plan.openings.filter(x => x !== o); P.sel = null; upd();
    };
  }
}

// ---------------- סרטוט רקע (תמונה / PDF) ----------------
function pickBackground() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    toast('טוען את הסרטוט…');
    try {
      let dataURL;
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) dataURL = await pdfToImage(f);
      else dataURL = await compressImage(f, 2400, 0.9);
      const im = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = rej; x.src = dataURL; });
      if (P.plan.bg?.img) await delImg(P.plan.bg.img);
      // הנחה התחלתית: רוחב התמונה = 12 מטר. אחר כך מכיילים.
      P.plan.bg = { img: await putImg(dataURL), w: im.width, h: im.height, scale: 1200 / im.width, x: 0, y: 0, opacity: 0.5 };
      changed(); P.fitted = null; rerender();
      setTimeout(() => { P.calib = { a: null }; setTool('calib'); toast('עכשיו מכיילים: נוגעים בשני קצוות של מידה ידועה בסרטוט.', 4500); }, 300);
    } catch (e) { toast('לא הצלחתי לפתוח את הקובץ: ' + e.message, 4000); }
  };
  i.click();
}
async function pdfToImage(file) {
  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', location.href).href;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const v0 = page.getViewport({ scale: 1 }); const sc = Math.min(3, 2400 / Math.max(v0.width, v0.height));
  const vp = page.getViewport({ scale: sc });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.9);
}

// ---------------- תלת־ממד ----------------
async function open3D(plan) {
  if (!plan.walls.length) return toast('קודם משרטטים קירות');
  const m = document.createElement('div'); m.className = 'modal'; m.style.alignItems = 'stretch';
  m.innerHTML = `<div style="position:relative;width:100%;height:100%;background:#e9e4dc">
    <div id="c3" style="position:absolute;inset:0"></div>
    <div style="position:absolute;top:calc(10px + var(--safe-t));right:10px;left:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn sm" id="x3">✕ סגירה</button>
      <button class="btn sec sm" id="mOrbit">🔄 סיבוב</button><button class="btn sec sm" id="mWalk">🚶 הליכה</button>
      ${plan.original ? '<button class="btn sec sm" id="mBA">לפני / אחרי</button>' : ''}</div>
    <div id="walkPad" style="position:absolute;bottom:calc(20px + var(--safe-b));left:50%;transform:translateX(-50%);display:none;gap:8px">
      <button class="btn sec" data-mv="l">↪️</button><button class="btn sec" data-mv="f">⬆️</button><button class="btn sec" data-mv="b">⬇️</button><button class="btn sec" data-mv="r">↩️</button></div>
    <div id="ba3" class="lbl" style="position:absolute;bottom:calc(20px + var(--safe-b));right:10px;background:rgba(0,0,0,.6);color:#fff;padding:4px 10px;border-radius:8px;font-size:13px;display:none"></div>
    <div id="load3" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div class="spinner"></div></div></div>`;
  document.body.appendChild(m);
  let THREE, OrbitControls;
  try { THREE = await import('./vendor/three.module.min.js'); ({ OrbitControls } = await import('./vendor/OrbitControls.js')); }
  catch (e) { m.remove(); return toast('לא הצלחתי לטעון את מנוע התלת־ממד'); }
  $('#load3', m).remove();
  const box = $('#c3', m);
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(box.clientWidth, box.clientHeight); box.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe9e4dc);
  const camera = new THREE.PerspectiveCamera(60, box.clientWidth / box.clientHeight, 0.05, 500);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9f, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(8, 15, 6); scene.add(sun);
  const group = new THREE.Group(); scene.add(group);
  let showing = plan;
  const H = (plan.height || 280) / 100;
  function build(pl) {
    while (group.children.length) { const c = group.children.pop(); c.geometry?.dispose(); }
    const xs = pl.walls.flatMap(w => [w.x1, w.x2]), ys = pl.walls.flatMap(w => [w.y1, w.y2]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry((maxx - minx) / 100 + 1, (maxy - miny) / 100 + 1), new THREE.MeshStandardMaterial({ color: 0xcdb79e, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((minx + maxx) / 200, 0, (miny + maxy) / 200); group.add(floor);
    const glass = new THREE.MeshStandardMaterial({ color: 0x9ec9e8, transparent: true, opacity: 0.35, roughness: 0.1 });
    for (const w of pl.walls) {
      const L = len(w) / 100, ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1), T = w.thick / 100;
      const mat = new THREE.MeshStandardMaterial({ color: (WALL_TYPES[w.type] || WALL_TYPES.interior).c3, roughness: 0.85 });
      const ops = pl.openings.filter(o => o.wallId === w.id).map(o => ({ a: (o.pos - o.width / 2) / 100, b: (o.pos + o.width / 2) / 100, bot: (o.kind === 'door' ? 0 : o.sill) / 100, top: ((o.kind === 'door' ? 0 : o.sill) + o.height) / 100, kind: o.kind })).sort((p, q) => p.a - q.a);
      const piece = (s0, s1, y0, y1, material = mat, thick = T) => {
        if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
        const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, thick); const mesh = new THREE.Mesh(g, material);
        const mid = (s0 + s1) / 2;
        mesh.position.set(w.x1 / 100 + Math.cos(ang) * mid, (y0 + y1) / 2, w.y1 / 100 + Math.sin(ang) * mid);
        mesh.rotation.y = -ang; group.add(mesh);
      };
      let s = 0;
      for (const o of ops) {
        piece(s, Math.max(s, o.a), 0, H);
        piece(o.a, o.b, Math.min(o.top, H), H);
        if (o.bot > 0) piece(o.a, o.b, 0, o.bot);
        if (o.kind === 'window') piece(o.a, o.b, o.bot, Math.min(o.top, H), glass, 0.02);
        s = Math.max(s, o.b);
      }
      piece(s, L, 0, H);
    }
    return { cx: (minx + maxx) / 200, cz: (miny + maxy) / 200, size: Math.max(maxx - minx, maxy - miny) / 100 };
  }
  let info = build(plan);
  const controls = new OrbitControls(camera, renderer.domElement);
  function orbit() {
    $('#walkPad', m).style.display = 'none';
    controls.minDistance = 0.5; controls.maxDistance = 200; controls.enablePan = true; controls.maxPolarAngle = Math.PI / 2.05;
    camera.position.set(info.cx + info.size * 0.6, info.size * 0.9 + 3, info.cz + info.size * 0.9);
    controls.target.set(info.cx, 0, info.cz); controls.update();
  }
  function walk() {
    $('#walkPad', m).style.display = 'flex';
    camera.position.set(info.cx, 1.6, info.cz); controls.target.set(info.cx, 1.6, info.cz - 0.1);
    controls.minDistance = 0.1; controls.maxDistance = 0.1; controls.enablePan = false; controls.maxPolarAngle = Math.PI; controls.update();
  }
  orbit();
  $('#mOrbit', m).onclick = orbit; $('#mWalk', m).onclick = walk;
  m.querySelectorAll('[data-mv]').forEach(b => {
    let t = null; const act = () => {
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position); dir.y = 0; dir.normalize();
      const mv = b.dataset.mv;
      if (mv === 'f' || mv === 'b') { const st = dir.multiplyScalar(mv === 'f' ? 0.12 : -0.12); camera.position.add(st); controls.target.add(st); }
      else { const a = mv === 'l' ? 0.06 : -0.06; const off = new THREE.Vector3().subVectors(controls.target, camera.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), a); controls.target.copy(camera.position).add(off); }
      controls.update();
    };
    b.onpointerdown = () => { act(); t = setInterval(act, 60); }; b.onpointerup = b.onpointerleave = () => clearInterval(t);
  });
  if ($('#mBA', m)) $('#mBA', m).onclick = () => {
    showing = showing === plan ? plan.original : plan; info = build(showing);
    const l = $('#ba3', m); l.style.display = ''; l.textContent = showing === plan ? 'אחרי (תכנון)' : 'לפני (מצב קיים)';
  };
  let alive = true;
  const loop = () => { if (!alive) return; renderer.render(scene, camera); requestAnimationFrame(loop); }; loop();
  const onResize = () => { camera.aspect = box.clientWidth / box.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(box.clientWidth, box.clientHeight); };
  addEventListener('resize', onResize);
  $('#x3', m).onclick = () => { alive = false; removeEventListener('resize', onResize); renderer.dispose(); m.remove(); };
}

// ---------------- ייצוא DXF (R12 — נפתח באוטוקאד, סקצ'אפ, רביט) ----------------
function buildDXF(plan) {
  const out = [];
  const add = (...a) => out.push(...a);
  const Y = (y) => -y; // DXF: ציר Y כלפי מעלה
  const layers = { WALL_INTERIOR: 8, WALL_EXTERIOR: 7, WALL_BEARING: 1, WALL_MAMAD: 1, WALL_UNVERIFIED: 2, DOORS: 4, WINDOWS: 5, DIMENSIONS: 3 };
  const wl = (t) => ({ interior: 'WALL_INTERIOR', exterior: 'WALL_EXTERIOR', bearing: 'WALL_BEARING', mamad: 'WALL_MAMAD', unknown: 'WALL_UNVERIFIED' }[t] || 'WALL_INTERIOR');
  const line = (L, x1, y1, x2, y2) => add('0', 'LINE', '8', L, '10', x1.toFixed(2), '20', Y(y1).toFixed(2), '30', '0', '11', x2.toFixed(2), '21', Y(y2).toFixed(2), '31', '0');
  const text = (L, x, y, h, s, rot = 0) => add('0', 'TEXT', '8', L, '10', x.toFixed(2), '20', Y(y).toFixed(2), '30', '0', '40', h.toFixed(2), '1', s, '50', rot.toFixed(2), '72', '1', '11', x.toFixed(2), '21', Y(y).toFixed(2), '31', '0');
  add('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '5', '0', 'ENDSEC');
  add('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(Object.keys(layers).length));
  for (const [n, c] of Object.entries(layers)) add('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS');
  add('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  for (const w of plan.walls) {
    const L = len(w), ops = plan.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
    const u = along(w, 0), nx = -u.uy * w.thick / 2, ny = u.ux * w.thick / 2, layer = wl(w.type);
    // שני קווי הקיר, עם הפסקות בפתחים
    const segs = []; let s = 0;
    for (const o of ops) { segs.push([s, Math.max(s, o.pos - o.width / 2)]); s = o.pos + o.width / 2; }
    segs.push([s, L]);
    for (const [a, b] of segs) {
      if (b - a < 0.5) continue;
      const A = along(w, a), B = along(w, b);
      line(layer, A.x + nx, A.y + ny, B.x + nx, B.y + ny); line(layer, A.x - nx, A.y - ny, B.x - nx, B.y - ny);
      line(layer, A.x + nx, A.y + ny, A.x - nx, A.y - ny); line(layer, B.x + nx, B.y + ny, B.x - nx, B.y - ny);
    }
    for (const o of ops) {
      const A = along(w, o.pos - o.width / 2), B = along(w, o.pos + o.width / 2);
      if (o.kind === 'window') {
        line('WINDOWS', A.x + nx, A.y + ny, B.x + nx, B.y + ny); line('WINDOWS', A.x - nx, A.y - ny, B.x - nx, B.y - ny); line('WINDOWS', A.x, A.y, B.x, B.y);
      } else {
        const f = o.flip ? -1 : 1, px = -u.uy * f, py = u.ux * f;
        const hx = A.x + px * w.thick / 2, hy = A.y + py * w.thick / 2;
        line('DOORS', hx, hy, hx + px * o.width, hy + py * o.width);
        // קשת פתיחה
        const n360 = (v) => ((v % 360) + 360) % 360;
        const a1 = n360(Math.atan2(-py, px) * 180 / Math.PI), a2 = n360(Math.atan2(-u.uy, u.ux) * 180 / Math.PI);
        const [start, end] = Math.abs(n360(a1 + 90) - a2) < 1 ? [a1, a2] : [a2, a1];
        add('0', 'ARC', '8', 'DOORS', '10', hx.toFixed(2), '20', Y(hy).toFixed(2), '30', '0', '40', o.width.toFixed(2), '50', start.toFixed(2), '51', end.toFixed(2));
      }
    }
    if (L >= 20) {
      const m = along(w, L / 2), off = w.thick / 2 + 15; let ang = Math.atan2(-m.uy, m.ux) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      text('DIMENSIONS', m.x - m.uy * off, m.y + m.ux * off, 10, String(fmt(L)), ang);
    }
  }
  add('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n');
}
async function exportDXF(p) {
  if (!p.plan?.walls.length) return toast('אין עדיין קירות לייצא');
  const blob = new Blob([buildDXF(p.plan)], { type: 'application/dxf' });
  const name = `${p.name}-תוכנית.dxf`;
  const file = new File([blob], name, { type: 'application/dxf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('הקובץ נשמר. יחידות: ס"מ. שכבות לפי סוג קיר, דלתות, חלונות ומידות.', 4000);
}

// SVG להדפסה
function printSVG(plan) {
  if (!plan?.walls.length) return '';
  const xs = plan.walls.flatMap(w => [w.x1, w.x2]), ys = plan.walls.flatMap(w => [w.y1, w.y2]);
  const minx = Math.min(...xs) - 50, miny = Math.min(...ys) - 50, W = Math.max(...xs) - minx + 50, Hh = Math.max(...ys) - miny + 50;
  const save = { ...P.view }, saveSel = P.sel, savePlan = P.plan; P.view = { s: 1, tx: 0, ty: 0 }; P.sel = null; P.plan = plan;
  const inner = planSVG(plan, { forPrint: true });
  P.view = save; P.sel = saveSel; P.plan = savePlan;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minx} ${miny} ${W} ${Hh}" style="width:100%;max-height:600px">${DEFS}${inner}</svg>`;
}

window.Plan = { open, printSVG, buildDXF, WALL_TYPES };
})();
