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
const OPENING_STYLES = {
  door: { swing: 'רגילה (ציר)', double: 'כפולה', sliding: 'הזזה', pocket: 'כיס (נכנסת לקיר)', accordion: 'הרמוניקה', pivot: 'פיבוט (ציר מרכזי)' },
  window: { casement: 'נפתח (כנף)', sliding: 'הזזה', fixed: 'קבוע (לא נפתח)' }
};
const OPENING_TIPS = {
  double: 'דלת כפולה: הכנפיים לא חייבות להיות שוות. אפשר ששתיים, ורק אחת נפתחת.',
  sliding: 'דלת הזזה: לא חייבת משקוף. צריך מקום על הקיר לצד הפתח, באורך הדלת, כדי שתיפתח עד הסוף.',
  pocket: 'דלת כיס: נכנסת לתוך הקיר — צריך קיר בעובי מתאים ואורך פנוי בתוך הקיר. לא חייבת משקוף.',
  accordion: 'דלת הרמוניקה: מסילה וצירים. רוחב כל כנף = אורך הפתח ÷ מספר הכנפיים.',
  pivot: 'דלת פיבוט: יושבת על ציר מרכזי. מתאימה לדלת גדולה, בדרך כלל בכניסה.',
  fixed: 'חלון קבוע: לא נפתח.'
};
const OPENING_DEF = {
  door:   { name: 'דלת', width: 90, height: 210, sill: 0 },
  window: { name: 'חלון', width: 120, height: 120, sill: 90 }
};

// ---------------- ספריית ריהוט וסניטריה (מידות מחוברת הקורס) ----------------
// w = רוחב, d = עומק (ס"מ). הצד האחורי למעלה (y=0), החזית למטה (y=d). h = גובה לתלת־ממד.
const R = (x, y, w, h, r = 0, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${extra}/>`;
const FURN = {
  bed2:     { name: 'מיטה זוגית', cat: 'שינה', w: 160, d: 200, h: 50, c3: 0xe8e1d6,
    svg: (w, d) => R(0, 0, w, d) + R(w * .05, d * .04, w * .4, d * .2, 4) + R(w * .55, d * .04, w * .4, d * .2, 4) + `<path d="M0,${d * .29} H${w} M0,${d * .5} L${w * .26},${d * .29} V${d * .5} Z"/>` },
  bed1:     { name: 'מיטת יחיד', cat: 'שינה', w: 80, d: 190, h: 50, c3: 0xe8e1d6,
    svg: (w, d) => R(0, 0, w, d) + R(w * .12, d * .08, w * .76, d * .14) + `<path d="M0,${d * .18} H${w} M0,${d * .32} Q${w * .2},${d * .22} ${w * .37},${d * .33} Q${w * .3},${d * .25} ${w * .37},${d * .18}"/>` },
  wardrobe: { name: 'ארון בגדים', cat: 'שינה', w: 120, d: 60, h: 230, c3: 0xcdb89b,
    svg: (w, d) => R(0, 0, w, d) + `<path d="M0,${d / 2} H${w}"/>` + Array.from({ length: Math.floor(w / 12) }, (_, i) => `<path d="M${i * 12 + 4},${d / 2 + 8} L${i * 12 + 12},${d / 2 - 8}"/>`).join('') },
  sofa3:    { name: 'ספה תלת', cat: 'סלון', w: 240, d: 80, h: 80, c3: 0x9c8f80,
    svg: (w, d) => R(0, 0, w, d) + R(0, 0, w, 13) + R(0, 0, 8, d) + R(w - 8, 0, 8, d) + `<path d="M${8 + (w - 16) / 3},13 V${d} M${8 + 2 * (w - 16) / 3},13 V${d}"/>` },
  armchair: { name: 'כורסה', cat: 'סלון', w: 67, d: 55, h: 80, c3: 0x9c8f80,
    svg: (w, d) => R(6, 0, w - 12, d) + R(6, 0, w - 12, 8) + R(0, 8, 6, d - 14) + R(w - 6, 8, 6, d - 14) },
  armchairR:{ name: 'כורסה מעוגלת', cat: 'סלון', w: 85, d: 80, h: 78, c3: 0x9c8f80,
    svg: (w, d) => `<path d="M3,0 H${w - 3} Q${w},0 ${w},3 V${d - 25} A25,25 0 0 1 ${w - 25},${d} H25 A25,25 0 0 1 0,${d - 25} V3 Q0,0 3,0 Z M16,8 V${d - 24} A8,8 0 0 0 24,${d - 16} H${w - 24} A8,8 0 0 0 ${w - 16},${d - 24} V8 Z"/>` },
  pouf:     { name: 'כיסא / פוף', cat: 'סלון', w: 50, d: 53, h: 45, c3: 0xa89a89,
    svg: (w, d) => R(0, 0, w, d - 8, 5) + R(0, d - 7, w, 7, 2) },
  coffee:   { name: 'שולחן קפה', cat: 'סלון', w: 50, d: 80, h: 40, c3: 0x8a6d55, svg: (w, d) => R(0, 0, w, d) },
  tvunit:   { name: 'מזנון / יחידת טלוויזיה', cat: 'סלון', w: 180, d: 45, h: 50, c3: 0x8a6d55, svg: (w, d) => R(0, 0, w, d) + `<path d="M${w / 3},0 V${d} M${2 * w / 3},0 V${d}"/>` },
  dining6:  { name: 'שולחן אוכל + 6 כיסאות', cat: 'אוכל', w: 270, d: 100, h: 75, c3: 0x8a6d55, chairs: 6,
    svg: (w, d) => R(0, 0, w, d) + [0, 1, 2].map(i => { const cx = 10 + 67 / 2 + i * (67 + 24.5) * (w - 20) / 250; return chairSvg(cx, 0, false) + chairSvg(cx, d, true); }).join('') },
  dining4sq:{ name: 'שולחן מרובע + 4 כיסאות', cat: 'אוכל', w: 120, d: 120, h: 75, c3: 0x8a6d55, chairs: 4,
    svg: (w, d) => R(0, 0, w, d) + chairSvg(w / 2, 0, false) + chairSvg(w / 2, d, true) + chairSvgSide(0, d / 2, false) + chairSvgSide(w, d / 2, true) },
  dining4r: { name: 'שולחן עגול + 4 כיסאות', cat: 'אוכל', w: 150, d: 150, h: 75, c3: 0x8a6d55, chairs: 4, round: true,
    svg: (w, d) => `<circle cx="${w / 2}" cy="${d / 2}" r="${w / 2}"/>` + chairSvg(w / 2, 0, false) + chairSvg(w / 2, d, true) + chairSvgSide(0, d / 2, false) + chairSvgSide(w, d / 2, true) },
  counter:  { name: 'משטח מטבח (ארון תחתון)', cat: 'מטבח', w: 240, d: 60, h: 90, c3: 0xd9d4cc,
    svg: (w, d) => { const n = Math.max(1, Math.round(w / 60)); return R(0, 0, w, d) + Array.from({ length: n }, (_, i) => { const x0 = i * w / n, x1 = (i + 1) * w / n; return `<path d="M${x0},0 L${x1},${d} M${x1},0 L${x0},${d}"/>`; }).join(''); } },
  island:   { name: 'אי מטבח', cat: 'מטבח', w: 180, d: 90, h: 90, c3: 0xd9d4cc, svg: (w, d) => R(0, 0, w, d) + `<path d="M0,60 H${w}" stroke-dasharray="4 3"/>` },
  fridge:   { name: 'מקרר', cat: 'מטבח', w: 70, d: 70, h: 185, c3: 0xdedede, svg: (w, d) => R(0, 0, w, d) + `<path d="M0,0 L${w},${d} M${w},0 L0,${d}"/>` + `<text x="${w / 2}" y="${d / 2 + 4}" font-size="11" text-anchor="middle" stroke="none" fill="#2f2a26">מקרר</text>` },
  sinkR:    { name: 'כיור עגול', cat: 'רחצה', w: 35, d: 35, h: 85, c3: 0xf4f4f2, round: true,
    svg: (w, d) => `<circle cx="${w / 2}" cy="${d / 2}" r="${w / 2}"/><circle cx="${w / 2}" cy="${d / 2}" r="${w / 2 - 3}"/><circle cx="${w / 2}" cy="${d / 2}" r="2"/>` },
  sinkRect: { name: 'כיור מלבני', cat: 'רחצה', w: 60, d: 40, h: 85, c3: 0xf4f4f2,
    svg: (w, d) => R(0, 0, w, d, 8) + R(w / 2 - 3, -2, 6, 12) + `<circle cx="${w / 2}" cy="${d * .55}" r="2.5"/>` },
  shower:   { name: 'מגש מקלחת', cat: 'רחצה', w: 80, d: 80, h: 5, c3: 0xf4f4f2,
    svg: (w, d) => R(0, 0, w, d) + R(5, 5, w - 10, d - 10, 10) + `<circle cx="${w * .2}" cy="${d * .8}" r="2.5"/><path d="M${w * .28},${d * .72} L${w * .5},${d * .5}"/>` },
  bath:     { name: 'אמבטיה', cat: 'רחצה', w: 180, d: 60, h: 55, c3: 0xf4f4f2,
    svg: (w, d) => R(0, 0, w, d) + R(6, 6, w - 12, d - 12, 22) + `<circle cx="${w - 22}" cy="${d / 2}" r="2.5"/>` },
  toilet:   { name: 'אסלה', cat: 'רחצה', w: 40, d: 60, h: 40, c3: 0xf4f4f2,
    svg: (w, d) => R(0, 0, w, 5) + `<path d="M3,5 V${d - 22} A${w / 2 - 3},22 0 0 0 ${w - 3},${d - 22} V5"/><ellipse cx="${w / 2}" cy="${d * .45}" rx="${w / 2 - 7}" ry="${d * .27}"/>` }
};
function chairSvg(cx, y, front) { // כיסא עם משענת, מתחת לשולחן בקו מקווקו
  const cw = 50, cd = 45, dir = front ? 1 : -1, y0 = front ? y - 18 : y - cd + 18;
  return `<g stroke-dasharray="3 2">${R(cx - cw / 2, y0, cw, cd, 3)}</g>` + R(cx - cw / 2, front ? y0 + cd : y0 - 7, cw, 7);
}
function chairSvgSide(x, cy, right) {
  const cw = 45, cd = 50, x0 = right ? x - 18 : x - cw + 18;
  return `<g stroke-dasharray="3 2">${R(x0, cy - cd / 2, cw, cd, 3)}</g>` + R(right ? x0 + cw : x0 - 7, cy - cd / 2, 7, cd);
}
// כללי מרווח לריהוט (מהקורס)
const FURN_RULES = {
  bed2: { sides: [['ימין', 60], ['שמאל', 60]], front: 80, msg: 'בין מיטה לקיר 60–70 ס"מ; מול המיטה כ-80 ס"מ.' },
  bed1: { sides: [['צד', 60]], anySide: true, front: 80, msg: 'מיטת יחיד יכולה להיצמד לקיר מצד אחד; בצד הפתוח 60 ס"מ, מול המיטה 80.' },
  dining6: { all: 90, msg: '90 ס"מ בין השולחן לקיר.' }, dining4sq: { all: 90, msg: '90 ס"מ בין השולחן לקיר (גם מהפינות).' },
  dining4r: { all: 90, msg: '90 ס"מ בין השולחן לקיר.' }, island: { all: 90, maxAll: 120, msg: 'מרווח סביב אי 90–120 ס"מ.' },
  wardrobe: { front: 60, msg: 'צריך מקום לפתיחת דלתות הארון מלפנים.' }
};

const P = {
  p: null, plan: null, svg: null, g: null, tool: 'select', sel: null,
  view: { s: 0.5, tx: 40, ty: 40 }, showOriginal: false, chain: null, cursor: null,
  pointers: new Map(), gesture: null, calib: null, bgImgEl: null
};

function ensurePlan(p) {
  if (!p.plan) p.plan = { walls: [], openings: [], height: 280, bg: null, original: null };
  if (!p.plan.furniture) p.plan.furniture = [];
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
  if (o.kind === 'door' && o.width < 70) out.push({ level: 'red', msg: 'פתח דלת צר מ-70 ס"מ — קטן מהמינימום לכל חדר.' });
  else if (o.kind === 'door' && o.width < 90) out.push({ level: 'green', msg: 'מינימום פתח: כניסה 90, חדרי שינה וחדרים 80, שירותים/אמבטיה 70. גובה דלת 210.' });
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
    const st = o.style || (o.kind === 'door' ? 'swing' : 'casement');
    const sw = 1 / s, ln = (x1, y1, x2, y2, w = 1.5, dash = '') => parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w * sw}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
    const arc = (hx, hy, r, tx, ty, ex, ey, sweep) => parts.push(`<path d="M${tx},${ty} A${r},${r} 0 0,${sweep} ${ex},${ey}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${4 * sw} ${3 * sw}"/>`);
    const leaf = (hx, hy, ux, uy, W, flipSide) => { // כנף על ציר בנקודה h, נפתחת לכיוון u לאורך W
      const f = flipSide ? -1 : 1, px = -a.uy * f, py = a.ux * f;
      const bx = hx + px * w.thick / 2, by = hy + py * w.thick / 2, tx = bx + px * W, ty = by + py * W, ex = bx + ux * W, ey = by + uy * W;
      ln(bx, by, tx, ty, 2); arc(bx, by, W, tx, ty, ex, ey, (px * uy - py * ux) > 0 ? 1 : 0);
    };
    if (o.kind === 'door') {
      if (st === 'double') { leaf(a.x, a.y, a.ux, a.uy, o.width / 2, o.flip); leaf(b.x, b.y, -a.ux, -a.uy, o.width / 2, o.flip); }
      else if (st === 'sliding') { const off = w.thick / 2 + 4; const f = o.flip ? -1 : 1; ln(a.x - a.uy * off * f, a.y + a.ux * off * f, b.x + a.ux * o.width * 0.9 - a.uy * off * f, b.y + a.uy * o.width * 0.9 + a.ux * off * f, 3); ln(a.x, a.y, b.x, b.y, 1, `${4 * sw} ${3 * sw}`); }
      else if (st === 'pocket') { ln(a.x, a.y, b.x, b.y, 3); ln(b.x, b.y, b.x + a.ux * o.width, b.y + a.uy * o.width, 1.5, `${4 * sw} ${3 * sw}`); }
      else if (st === 'accordion') { const n = Math.max(2, Math.round(o.width / 25)), seg = o.width / n, f = o.flip ? -1 : 1; let pts = []; for (let i = 0; i <= n; i++) { const d = i * seg, z = (i % 2 ? 1 : 0) * seg * 0.6 * f; pts.push(`${a.x + a.ux * d - a.uy * (w.thick / 2 + z) * f},${a.y + a.uy * d + a.ux * (w.thick / 2 + z) * f}`); } parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="${1.5 * sw}"/>`); }
      else if (st === 'pivot') { const c = along(w, o.pos - o.width / 2 + o.width * 0.15), L2 = o.width * 0.85, ang = Math.PI / 3 * (o.flip ? -1 : 1), cs = Math.cos(ang), sn = Math.sin(ang); const dx = a.ux * cs - a.uy * sn, dy = a.ux * sn + a.uy * cs; ln(c.x - dx * o.width * 0.15, c.y - dy * o.width * 0.15, c.x + dx * L2, c.y + dy * L2, 3); parts.push(`<circle cx="${c.x}" cy="${c.y}" r="${3 * sw}" fill="${col}"/>`); }
      else leaf(a.x, a.y, a.ux, a.uy, o.width, o.flip);
    } else {
      if (st === 'fixed') { ln(a.x, a.y, b.x, b.y, 1.5); ln(a.x + nx * .9, a.y + ny * .9, b.x + nx * .9, b.y + ny * .9, 1); ln(a.x - nx * .9, a.y - ny * .9, b.x - nx * .9, b.y - ny * .9, 1); }
      else if (st === 'sliding') { const m = along(w, o.pos); ln(a.x + nx * .3, a.y + ny * .3, m.x + a.ux * 5 + nx * .3, m.y + a.uy * 5 + ny * .3, 2.5); ln(m.x - a.ux * 5 - nx * .3, m.y - a.uy * 5 - ny * .3, b.x - nx * .3, b.y - ny * .3, 2.5); ln(a.x + nx * .9, a.y + ny * .9, b.x + nx * .9, b.y + ny * .9, 1); ln(a.x - nx * .9, a.y - ny * .9, b.x - nx * .9, b.y - ny * .9, 1); }
      else for (const k of [-0.5, 0, 0.5]) ln(a.x + nx * k * 1.8, a.y + ny * k * 1.8, b.x + nx * k * 1.8, b.y + ny * k * 1.8, k === 0 ? 1 : 1.5);
    }
  }
  if (orig) for (const o of orig.openings) if (!curIds.has(o.id)) {
    const w = orig.walls.find(x => x.id === o.wallId); if (!w) continue;
    const a = along(w, o.pos - o.width / 2), b = along(w, o.pos + o.width / 2);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#c0392b" stroke-width="${4 / s}" stroke-dasharray="${6 / s} ${4 / s}"/>`);
  }
  for (const f of (pl.furniture || [])) {
    const def = FURN[f.type]; if (!def) continue;
    const isSel = P.sel?.kind === 'furn' && P.sel.id === f.id && !opts.forPrint;
    parts.push(`<g transform="translate(${f.x},${f.y}) rotate(${f.rot || 0}) translate(${-f.w / 2},${-f.d / 2})" fill="${isSel ? '#fbe9dc' : '#fff'}" fill-opacity="${isSel ? 1 : .85}" stroke="${isSel ? '#a86b4a' : '#4a433d'}" stroke-width="${(isSel ? 2.5 : 1) / s}" vector-effect="non-scaling-stroke">${def.svg(f.w, f.d)}</g>`);
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
        <span class="chip" data-t="wall">🧱 קיר</span><span class="chip" data-t="door">🚪 דלת</span><span class="chip" data-t="window">🪟 חלון</span><span class="chip" data-t="furn">🛋️ ריהוט</span>
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
    P.plan.original = clone({ walls: P.plan.walls, openings: P.plan.openings, furniture: P.plan.furniture || [] }); P.showOriginal = false; changed(); toast('נשמר כ"מצב קיים". מכאן כל שינוי נחשב "אחרי".', 3500); rerender();
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
  if (P.showOriginal && ['wall', 'door', 'window', 'furn'].includes(t)) { toast('במצב "לפני" אי אפשר לערוך. עוברים ל"אחרי".'); t = 'select'; }
  P.tool = t; P.chain = null; P.cursor = null;
  if (t === 'furn' && !P.furnType) setTimeout(furnPicker, 50);
  document.querySelectorAll('#tools .chip').forEach(c => c.classList.toggle('on', c.dataset.t === t));
  $('#wtSel').value = P.wallType;
  $('#chainBar').style.display = 'none';
  const hints = {
    select: 'לוחצים על קיר או פתח כדי לערוך. גרירה באצבע אחת מזיזה את התוכנית, שתי אצבעות לזום.',
    pan: 'גרירה מזיזה את התוכנית. שתי אצבעות לזום.',
    wall: 'נוגעים בנקודת ההתחלה, ואז בנקודת הסוף (אפשר לגרור כדי לכוון). הקיר הבא ממשיך מאותה נקודה. מידות נצמדות ל-5 ס"מ.',
    door: 'נוגעים על קיר כדי להוסיף דלת (90 ס"מ).',
    window: 'נוגעים על קיר כדי להוסיף חלון (120 ס"מ).',
    furn: 'בוחרים פריט מהספרייה ונוגעים במקום להניח אותו. אחר כך: בחירה ← גרירה להזזה, וכפתור סיבוב.',
    calib: 'כיול: נוגעים בתחילת מידה ידועה בסרטוט, ואז בסופה. אחר כך מקלידים את המידה האמיתית בס"מ.'
  };
  $('#hint').textContent = hints[t] || '';
  draw();
}
function bindTools() {
  document.querySelectorAll('#tools .chip').forEach(c => c.onclick = () => { if (c.dataset.t === 'furn') { furnPicker(); return; } setTool(c.dataset.t); });
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
    if (P.tool === 'select' && !P.showOriginal) { const f = hitFurn(pt); if (f && P.sel?.kind === 'furn' && P.sel.id === f.id) Object.assign(P.gesture, { type: 'drag', f, ox: f.x - pt.x, oy: f.y - pt.y }); }
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
    else if (g.type === 'drag') { if (g.moved) { const w = toWorld(e.clientX, e.clientY); g.f.x = Math.round((w.x + g.ox) / 5) * 5; g.f.y = Math.round((w.y + g.oy) / 5) * 5; draw(); } }
    else if (g.moved) { P.view.tx = g.view.tx + e.clientX - g.sx; P.view.ty = g.view.ty + e.clientY - g.sy; draw(); }
  });
  const up = e => {
    if (!P.pointers.has(e.pointerId)) return;
    P.pointers.delete(e.pointerId);
    const g = P.gesture;
    if (g?.type === 'pinch') { if (P.pointers.size === 0) P.gesture = null; return; }
    P.gesture = null; if (!g) return;
    if (g.type === 'draw' && P.cursor) return commitPoint(P.cursor);
    if (g.type === 'drag') { if (g.moved) { changed(); renderProps(); } else onTap(toWorld(e.clientX, e.clientY)); return; }
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

function hitFurn(pt) {
  const list = cur().furniture || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i], a = -(f.rot || 0) * Math.PI / 180, dx = pt.x - f.x, dy = pt.y - f.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= f.w / 2 && Math.abs(ly) <= f.d / 2) return f;
  }
  return null;
}
function furnPicker() {
  if (P.showOriginal) return toast('במצב "לפני" אי אפשר לערוך');
  const cats = [...new Set(Object.values(FURN).map(f => f.cat))];
  modal('🛋️ ספריית ריהוט וסניטריה', cats.map(c => `<h3 style="margin-top:10px">${c}</h3><div class="thumbs">${Object.entries(FURN).filter(([, f]) => f.cat === c).map(([k, f]) => {
    const pad = 30, vw = f.w + pad * 2, vh = f.d + pad * 2;
    return `<div class="t" data-k="${k}" style="background:#fff;aspect-ratio:auto;padding:4px;text-align:center"><svg viewBox="${-pad} ${-pad} ${vw} ${vh}" style="width:100%;height:70px"><g fill="#fff" stroke="#4a433d" stroke-width="${Math.max(vw, vh) / 90}">${f.svg(f.w, f.d)}</g></svg><div style="font-size:11px;line-height:1.2">${f.name}<br><span class="muted">${f.w}×${f.d}</span></div></div>`;
  }).join('')}</div>`).join('') + '<div class="muted" style="margin-top:10px">מידות לפי חוברת הריהוט של הקורס. אפשר לשנות מידה אחרי ההנחה.</div>', (b, close) => {
    b.querySelectorAll('[data-k]').forEach(el => el.onclick = () => { P.furnType = el.dataset.k; close(); setTool('furn'); toast(`נוגעים בתוכנית כדי להניח: ${FURN[P.furnType].name}`); });
  });
}
function onTap(pt) {
  if (P.tool === 'furn' && P.furnType) {
    const d = FURN[P.furnType];
    const f = { id: 'f' + uid(), type: P.furnType, x: Math.round(pt.x / 5) * 5, y: Math.round(pt.y / 5) * 5, rot: 0, w: d.w, d: d.d };
    P.plan.furniture.push(f); P.sel = { kind: 'furn', id: f.id }; P.tool = 'select'; P.furnType = null;
    changed(); setTool('select'); renderProps(); return;
  }
  if (P.tool === 'select') { const f = hitFurn(pt); if (f) { P.sel = { kind: 'furn', id: f.id }; draw(); renderProps(); return; } }
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
  if (P.sel.kind === 'furn') {
    const f = (pl.furniture || []).find(x => x.id === P.sel.id); if (!f) { box.innerHTML = ''; return; }
    const def = FURN[f.type], cl = clearances(f, pl), rule = FURN_RULES[f.type], issues = [];
    const sideTxt = (v) => v === Infinity ? 'אין קיר' : (v < 3 ? 'צמוד לקיר' : fmt(v) + ' ס"מ');
    if (rule) {
      if (rule.all) for (const [n, v] of [['אחור', cl.back], ['חזית', cl.front], ['ימין', cl.right], ['שמאל', cl.left]]) { if (v < rule.all) issues.push(`${n}: ${sideTxt(v)} — מינימום ${rule.all}`); else if (rule.maxAll && v < Infinity && v > rule.maxAll + 60) {} }
      if (rule.front && cl.front < rule.front) issues.push(`חזית: ${sideTxt(cl.front)} — מינימום ${rule.front}`);
      if (rule.sides) {
        const sides = [cl.left, cl.right];
        if (rule.anySide) { const open = Math.max(...sides); if (open < 60) issues.push(`צד פתוח: ${sideTxt(open)} — מינימום 60`); }
        else for (const [i, v] of sides.entries()) if (v < 60) issues.push(`${i ? 'ימין' : 'שמאל'}: ${sideTxt(v)} — מינימום 60`);
      }
    }
    box.innerHTML = `<div class="card"><h3>🛋️ ${def.name}</h3>
      <div class="grid2"><div><label>רוחב (ס"מ)</label><input id="fw" type="number" inputmode="numeric" value="${f.w}" ${ro ? 'disabled' : ''}></div>
        <div><label>עומק (ס"מ)</label><input id="fd" type="number" inputmode="numeric" value="${f.d}" ${ro ? 'disabled' : ''}></div></div>
      <div class="muted" style="margin-top:8px">מרחק לקירות: חזית ${sideTxt(cl.front)} · אחור ${sideTxt(cl.back)} · ימין ${sideTxt(cl.right)} · שמאל ${sideTxt(cl.left)}</div>
      ${issues.length ? `<div class="rule orange" style="margin-top:8px"><span class="dot orange"></span><div><b>מרווח קטן מהמומלץ</b><br>${issues.map(esc).join('<br>')}<br><span class="muted">${esc(rule.msg)}</span></div></div>` : rule ? `<div class="rule green" style="margin-top:8px"><span class="dot green"></span><div>המרווחים תקינים ✓</div></div>` : ''}
      ${ro ? '' : `<div class="grid2" style="margin-top:10px"><button class="btn sec" id="frot">⟳ סיבוב 90°</button><button class="btn sec" id="fdup">⧉ שכפול</button></div>
      <div style="height:8px"></div><button class="btn danger full" id="fdel">מחיקה</button>
      <div class="muted" style="margin-top:6px">להזזה: גוררים את הפריט המסומן באצבע.</div>`}</div>`;
    if (ro) return;
    const upd = () => { changed(); draw(); renderProps(); };
    $('#fw').onchange = e => { const v = +e.target.value; if (v > 0) { f.w = v; upd(); } };
    $('#fd').onchange = e => { const v = +e.target.value; if (v > 0) { f.d = v; upd(); } };
    $('#frot').onclick = () => { f.rot = ((f.rot || 0) + 90) % 360; upd(); };
    $('#fdup').onclick = () => { const n = { ...f, id: 'f' + uid(), x: f.x + 30, y: f.y + 30 }; P.plan.furniture.push(n); P.sel = { kind: 'furn', id: n.id }; upd(); };
    $('#fdel').onclick = () => { P.plan.furniture = P.plan.furniture.filter(x => x !== f); P.sel = null; upd(); };
    return;
  }
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
      <label>סוג</label><select id="ost" ${ro ? 'disabled' : ''}>${Object.entries(OPENING_STYLES[o.kind]).map(([k, v]) => `<option value="${k}" ${(o.style || (o.kind === 'door' ? 'swing' : 'casement')) === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="grid2"><div><label>מרחק מתחילת הקיר (ס"מ)</label><input id="op" type="number" inputmode="numeric" value="${fmt(o.pos - o.width / 2)}" ${ro ? 'disabled' : ''}></div>
        <div><label>${o.kind === 'window' ? 'גובה אדן (ס"מ)' : 'כיוון פתיחה'}</label>${o.kind === 'window' ? `<input id="os" type="number" inputmode="numeric" value="${fmt(o.sill)}" ${ro ? 'disabled' : ''}>` : `<button class="btn sec full" id="oflip" ${ro ? 'disabled' : ''}>⇄ הפוך</button>`}</div></div>
      ${OPENING_TIPS[o.style || ''] ? `<div class="muted" style="margin-top:6px">💡 ${OPENING_TIPS[o.style]}</div>` : ''}
      ${issues.map(i => `<div class="rule ${i.level}" style="margin-top:8px"><span class="dot ${i.level}"></span><div>${esc(i.msg)}</div></div>`).join('')}
      ${ro ? '' : '<div style="height:10px"></div><button class="btn danger full" id="odel">מחיקה</button>'}</div>`;
    if (ro) return;
    const upd = () => { changed(); draw(); renderProps(); };
    $('#ow').onchange = e => { const v = +e.target.value; if (v > 0) { o.width = v; upd(); } };
    $('#oh').onchange = e => { const v = +e.target.value; if (v > 0) { o.height = v; upd(); } };
    $('#op').onchange = e => { const v = +e.target.value; if (v >= 0) { o.pos = v + o.width / 2; upd(); } };
    if ($('#os')) $('#os').onchange = e => { o.sill = Math.max(0, +e.target.value || 0); upd(); };
    if ($('#oflip')) $('#oflip').onclick = () => { o.flip = !o.flip; upd(); };
    $('#ost').onchange = e => { o.style = e.target.value; upd(); };
    $('#odel').onclick = () => {
      if ((w.type === 'mamad') && !confirm('זה פתח בקיר ממ"ד (כנראה החלון/הדלת המקוריים של הממ"ד). אסור לשנות אותם. למחוק מהסקיצה בכל זאת?')) return;
      P.plan.openings = P.plan.openings.filter(x => x !== o); P.sel = null; upd();
    };
  }
}

// מרחק מכל צד של הפריט לקיר הקרוב (קרן מאמצע הצד החוצה)
function clearances(f, pl) {
  const a = (f.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const loc = (lx, ly) => ({ x: f.x + lx * ca - ly * sa, y: f.y + lx * sa + ly * ca });
  const dirs = { back: [0, -1, f.d / 2], front: [0, 1, f.d / 2], left: [-1, 0, f.w / 2], right: [1, 0, f.w / 2] };
  const out = {};
  for (const [k, [dx, dy, half]] of Object.entries(dirs)) {
    let best = Infinity;
    const samples = (k === 'back' || k === 'front') ? [-f.w / 2 + 2, 0, f.w / 2 - 2] : [-f.d / 2 + 2, 0, f.d / 2 - 2];
    for (const t of samples) {
      const o = (k === 'back' || k === 'front') ? loc(t, dy * half) : loc(dx * half, t);
      const v = { x: dx * ca - dy * sa, y: dx * sa + dy * ca };
      for (const w of pl.walls) {
        const ex = w.x2 - w.x1, ey = w.y2 - w.y1, den = v.x * ey - v.y * ex; if (Math.abs(den) < 1e-9) continue;
        const tt = ((w.x1 - o.x) * ey - (w.y1 - o.y) * ex) / den, uu = ((w.x1 - o.x) * v.y - (w.y1 - o.y) * v.x) / den;
        if (tt > -1 && uu >= 0 && uu <= 1) { const L = Math.hypot(ex, ey), cos = Math.abs((v.x * -ey + v.y * ex) / L); best = Math.min(best, Math.max(0, tt - (w.thick / 2) / (cos || 1))); }
      }
    }
    out[k] = best;
  }
  return out;
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
// חומרים: ריצוף (מרקם מצויר או תמונה מהקטלוג) וצבע קירות — נשמרים בתוכנית
const FLOORS = {
  oak: { name: 'פרקט אלון', c: ['#c9a27a', '#b98f66', '#d4b08a'], kind: 'planks' },
  walnut: { name: 'פרקט אגוז', c: ['#7a5638', '#6a4a30', '#86603f'], kind: 'planks' },
  herring: { name: 'פרקט שברון', c: ['#c7a07a', '#b48c64', '#d2ae88'], kind: 'herring' },
  tileL: { name: 'אריח בהיר 60×60', c: ['#ece7e0', '#e4ded6'], kind: 'tile', size: 60 },
  tileG: { name: 'אריח אפור 80×80', c: ['#a7a39e', '#9d9993'], kind: 'tile', size: 80 },
  tileD: { name: 'אריח כהה 120×60', c: ['#4f4b47', '#45423e'], kind: 'tile', size: 120, h: 60 },
  marble: { name: 'שיש לבן', c: ['#f1efec', '#d8d3cd'], kind: 'marble' },
  concrete: { name: 'בטון מוחלק', c: ['#b9b5af', '#aca8a2'], kind: 'concrete' }
};
const PAINTS = [['#efeae3', 'לבן שבור'], ['#ffffff', 'לבן'], ['#e8dccb', 'שמנת'], ['#d9cbb6', 'בז׳'], ['#c9c3b8', 'אפור חם'], ['#a9b3ad', 'מרווה'], ['#9fb2c4', 'כחול אפרפר'], ['#d8b4a0', 'אפרסק'], ['#7d8c7a', 'זית'], ['#55606b', 'אפור כהה']];
function floorCanvas(key) {
  const f = FLOORS[key] || FLOORS.oak, c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const rnd = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
  x.fillStyle = f.c[0]; x.fillRect(0, 0, 512, 512);
  if (f.kind === 'planks') { // קרשים 20×120 ס"מ (512px = 2 מ')
    const pw = 51, pl = 307; let i = 0;
    for (let col = 0; col < 11; col++) for (let off = -((col * 131) % pl); off < 512; off += pl) {
      x.fillStyle = f.c[(i++) % f.c.length]; x.fillRect(col * pw, off, pw - 1.5, pl - 1.5);
      x.globalAlpha = .08; for (let g = 0; g < 6; g++) { x.fillStyle = rnd(i * 7 + g) > .5 ? '#000' : '#fff'; x.fillRect(col * pw + rnd(i + g) * pw, off, 1.5, pl); } x.globalAlpha = 1;
    }
  } else if (f.kind === 'herring') { // שברון: עמודות של קרשים באלכסון, כל עמודה בכיוון הפוך
    const cw = 64, step = 32; let i = 0;
    for (let col = 0; col < 512 / cw; col++) {
      const x0 = col * cw, dir = col % 2 ? 1 : -1;
      for (let y = -cw; y < 512 + cw; y += step) {
        x.fillStyle = f.c[(i++ * 7 + col) % 3]; x.beginPath();
        const yl = y + (dir > 0 ? 0 : cw), yr = y + (dir > 0 ? cw : 0);
        x.moveTo(x0 + 0.8, yl + 0.8); x.lineTo(x0 + cw - 0.8, yr + 0.8); x.lineTo(x0 + cw - 0.8, yr + step - 0.8); x.lineTo(x0 + 0.8, yl + step - 0.8); x.closePath(); x.fill();
      }
    }
  } else if (f.kind === 'tile') {
    const tw = 512 * f.size / 200, th = 512 * (f.h || f.size) / 200; let i = 0;
    for (let yy = 0; yy < 512; yy += th) for (let xx = 0; xx < 512; xx += tw) { x.fillStyle = f.c[(i++) % f.c.length]; x.fillRect(xx + 1, yy + 1, tw - 2, th - 2); }
  } else if (f.kind === 'marble') {
    x.strokeStyle = f.c[1]; for (let i = 0; i < 14; i++) { x.lineWidth = .5 + rnd(i) * 2; x.globalAlpha = .5; x.beginPath(); let px = rnd(i * 3) * 512, py = 0; x.moveTo(px, py); while (py < 512) { px += (rnd(px + py) - .5) * 40; py += 20; x.lineTo(px, py); } x.stroke(); }
    x.globalAlpha = 1; x.strokeStyle = '#e6e1db'; x.lineWidth = 1; for (let k = 0; k <= 512; k += 256) { x.strokeRect(0, k, 512, 0); x.strokeRect(k, 0, 0, 512); }
  } else { for (let i = 0; i < 4000; i++) { x.fillStyle = rnd(i) > .5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)'; x.fillRect(rnd(i * 2) * 512, rnd(i * 3) * 512, 3, 3); } }
  return c;
}
async function open3D(plan) {
  if (!plan.walls.length) return toast('קודם משרטטים קירות');
  plan.mat = plan.mat || { floor: 'oak', wall: '#efeae3' };
  const m = document.createElement('div'); m.className = 'modal'; m.style.alignItems = 'stretch';
  m.innerHTML = `<div style="position:relative;width:100%;height:100%;background:#e9e4dc;touch-action:none">
    <div id="c3" style="position:absolute;inset:0"></div>
    <div style="position:absolute;top:calc(10px + var(--safe-t));right:10px;left:10px;display:flex;gap:6px;flex-wrap:wrap;z-index:2">
      <button class="btn sm" id="x3">✕ סגירה</button>
      <button class="btn sec sm" id="mOrbit">🔄 מבט על</button><button class="btn sec sm" id="mWalk">🚶 הליכה</button>
      <button class="btn sec sm" id="mMat">🎨 חומרים</button><button class="btn sec sm" id="mTour">🎬 סרטון סיור</button><button class="btn sec sm" id="mRec">⏺️ הקלטה</button>
      ${plan.original ? '<button class="btn sec sm" id="mBA">לפני / אחרי</button>' : ''}</div>
    <div id="joy" style="position:absolute;bottom:calc(24px + var(--safe-b));left:24px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.8);display:none;z-index:2;touch-action:none">
      <div id="joyK" style="position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(80,60,40,.75)"></div></div>
    <div id="hint3" style="position:absolute;bottom:calc(28px + var(--safe-b));right:12px;max-width:52%;background:rgba(0,0,0,.55);color:#fff;padding:6px 10px;border-radius:10px;font-size:12px;display:none;z-index:2">עיגול שמאלי = ללכת · גרירה על המסך = להסתכל מסביב</div>
    <div id="recDot" style="position:absolute;top:calc(60px + var(--safe-t));left:12px;background:#c62828;color:#fff;padding:4px 10px;border-radius:12px;font-size:13px;display:none;z-index:2">● מקליט</div>
    <div id="ba3" class="lbl" style="position:absolute;top:calc(60px + var(--safe-t));right:10px;background:rgba(0,0,0,.6);color:#fff;padding:4px 10px;border-radius:8px;font-size:13px;display:none;z-index:2"></div>
    <div id="load3" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div class="spinner"></div></div></div>`;
  document.body.appendChild(m);
  let THREE, OrbitControls;
  try { THREE = await import('./vendor/three.module.min.js'); ({ OrbitControls } = await import('./vendor/OrbitControls.js')); }
  catch (e) { m.remove(); return toast('לא הצלחתי לטעון את מנוע התלת־ממד'); }
  $('#load3', m).remove();
  const box = $('#c3', m);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(box.clientWidth, box.clientHeight); box.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe9e4dc);
  const camera = new THREE.PerspectiveCamera(60, box.clientWidth / box.clientHeight, 0.05, 500);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9f, 1.0));
  const amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);
  const lamp = new THREE.PointLight(0xfff1dc, 0, 12, 1); scene.add(lamp); // "מנורה" שהולכת עם המבקר — בפנים יש תקרה שחוסמת את השמש
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun); scene.add(sun.target);
  const group = new THREE.Group(); scene.add(group);
  let showing = plan, ceiling = null, walking = false;
  const H = (plan.height || 280) / 100;
  let walls2 = []; // לבדיקת התנגשות בהליכה
  const texCache = {};
  async function floorMaterial() {
    const k = plan.mat.floor; let tex;
    if (k?.startsWith?.('cat:')) {
      const it = (typeof S !== 'undefined' ? S.catalog : []).find(x => x.id === k.slice(4));
      const src = it ? (await getImg(it.img)) || it.th : null;
      if (src) { const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); if (img) { tex = new THREE.Texture(img); tex.needsUpdate = true; tex.repeat.set(1, 1); tex.userData = { meters: 0.8 }; } }
    }
    if (!tex) { tex = texCache[k] || (texCache[k] = new THREE.CanvasTexture(floorCanvas(FLOORS[k] ? k : 'oak'))); tex.userData = { meters: 2 }; }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return new THREE.MeshStandardMaterial({ map: tex, roughness: k === 'marble' ? 0.35 : 0.75 });
  }
  let build = async function (pl) {
    while (group.children.length) { const c = group.children.pop(); c.geometry?.dispose(); }
    walls2 = [];
    const xs = pl.walls.flatMap(w => [w.x1, w.x2]), ys = pl.walls.flatMap(w => [w.y1, w.y2]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const FW = (maxx - minx) / 100 + 1, FD = (maxy - miny) / 100 + 1;
    const fm = await floorMaterial(); const tm = fm.map.userData.meters; fm.map.repeat.set(FW / tm, FD / tm);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), fm); floor.receiveShadow = true;
    floor.rotation.x = -Math.PI / 2; floor.position.set((minx + maxx) / 200, 0, (miny + maxy) / 200); group.add(floor);
    ceiling = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 1, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2; ceiling.position.set((minx + maxx) / 200, H, (miny + maxy) / 200); ceiling.visible = walking; group.add(ceiling);
    sun.position.set((minx + maxx) / 200 + 6, 12, (miny + maxy) / 200 + 4); sun.target.position.set((minx + maxx) / 200, 0, (miny + maxy) / 200);
    const ext = Math.max(FW, FD); Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
    const glass = new THREE.MeshStandardMaterial({ color: 0x9ec9e8, transparent: true, opacity: 0.3, roughness: 0.05 });
    const frameM = new THREE.MeshStandardMaterial({ color: 0x5b4a3c, roughness: 0.6 });
    for (const w of pl.walls) {
      const L = len(w) / 100, ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1), T = w.thick / 100;
      const custom = w.type === 'interior' || w.type === 'exterior' || w.type === 'unknown' || !w.type;
      const mat = new THREE.MeshStandardMaterial({ color: custom ? new THREE.Color(plan.mat.wall) : (WALL_TYPES[w.type] || WALL_TYPES.interior).c3, roughness: 0.9 });
      const ops = pl.openings.filter(o => o.wallId === w.id).map(o => ({ a: (o.pos - o.width / 2) / 100, b: (o.pos + o.width / 2) / 100, bot: (o.kind === 'door' ? 0 : o.sill) / 100, top: ((o.kind === 'door' ? 0 : o.sill) + o.height) / 100, kind: o.kind })).sort((p, q) => p.a - q.a);
      walls2.push({ x1: w.x1 / 100, z1: w.y1 / 100, x2: w.x2 / 100, z2: w.y2 / 100, T, L, doors: ops.filter(o => o.kind === 'door') });
      const piece = (s0, s1, y0, y1, material = mat, thick = T) => {
        if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
        const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, thick); const mesh = new THREE.Mesh(g, material);
        const mid = (s0 + s1) / 2; mesh.castShadow = material !== glass; mesh.receiveShadow = true;
        mesh.position.set(w.x1 / 100 + Math.cos(ang) * mid, (y0 + y1) / 2, w.y1 / 100 + Math.sin(ang) * mid);
        mesh.rotation.y = -ang; group.add(mesh);
      };
      let s = 0;
      for (const o of ops) {
        piece(s, Math.max(s, o.a), 0, H);
        piece(o.a, o.b, Math.min(o.top, H), H);
        if (o.bot > 0) piece(o.a, o.b, 0, o.bot);
        if (o.kind === 'window') piece(o.a, o.b, o.bot, Math.min(o.top, H), glass, 0.02);
        // משקוף דק סביב הפתח
        const fT = T + 0.02, fw = 0.05;
        piece(o.a - fw, o.a, o.bot, Math.min(o.top, H), frameM, fT); piece(o.b, o.b + fw, o.bot, Math.min(o.top, H), frameM, fT);
        if (o.top < H) piece(o.a - fw, o.b + fw, o.top, Math.min(o.top + fw, H), frameM, fT);
        s = Math.max(s, o.b);
      }
      piece(s, L, 0, H);
    }
    return { cx: (minx + maxx) / 200, cz: (miny + maxy) / 200, size: Math.max(maxx - minx, maxy - miny) / 100, minx: minx / 100, maxx: maxx / 100, minz: miny / 100, maxz: maxy / 100 };
  }
  function addFurniture(pl) {
    for (const f of (pl.furniture || [])) {
      const d = FURN[f.type]; if (!d) continue;
      const mat = new THREE.MeshStandardMaterial({ color: d.c3, roughness: 0.8 });
      const geo = d.round ? new THREE.CylinderGeometry(f.w / 200, f.w / 200, d.h / 100, 32) : new THREE.BoxGeometry(f.w / 100, d.h / 100, f.d / 100);
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; mesh.position.set(f.x / 100, d.h / 200, f.y / 100); mesh.rotation.y = -(f.rot || 0) * Math.PI / 180; group.add(mesh);
      if (d.chairs) { const cm = new THREE.MeshStandardMaterial({ color: 0x6f5a48, roughness: 0.8 });
        const pts = d.chairs === 6 ? [-1, 0, 1].flatMap(i => [[i * f.w / 3, -f.d / 2 - 15], [i * f.w / 3, f.d / 2 + 15]]) : [[0, -f.d / 2 - 15], [0, f.d / 2 + 15], [-f.w / 2 - 15, 0], [f.w / 2 + 15, 0]];
        const a = (f.rot || 0) * Math.PI / 180;
        for (const [lx, ly] of pts) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), cm); c.castShadow = true; c.position.set((f.x + lx * Math.cos(a) - ly * Math.sin(a)) / 100, 0.225, (f.y + lx * Math.sin(a) + ly * Math.cos(a)) / 100); group.add(c); }
      }
    }
  }
  const build0 = build; build = async (pl) => { const r = await build0(pl); addFurniture(pl); return r; };
  let info = await build(plan);
  const controls = new OrbitControls(camera, renderer.domElement);
  // ---- הליכה: ג'ויסטיק + גרירה להסתכלות + התנגשות בקירות (עוברים רק דרך דלתות) ----
  let yaw = 0, pitch = 0; const joy = { x: 0, y: 0 };
  const applyLook = () => { camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, yaw, 0); };
  function blocked(px, pz) {
    const R = 0.22;
    for (const w of walls2) {
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - w.x1) * dx + (pz - w.z1) * dz) / L2));
      const qx = w.x1 + dx * t, qz = w.z1 + dz * t, dist = Math.hypot(px - qx, pz - qz);
      if (dist < w.T / 2 + R) { const along = t * w.L; if (!w.doors.some(o => along > o.a + 0.08 && along < o.b - 0.08)) return true; }
    }
    return false;
  }
  function stepWalk(dt) {
    if (!walking || (!joy.x && !joy.y)) return;
    const sp = 1.4 * dt, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = (fx * -joy.y + rx * joy.x) * sp, mz = (fz * -joy.y + rz * joy.x) * sp;
    const p = camera.position;
    if (!blocked(p.x + mx, p.z + mz)) { p.x += mx; p.z += mz; }
    else if (!blocked(p.x + mx, p.z)) p.x += mx;
    else if (!blocked(p.x, p.z + mz)) p.z += mz;
  }
  // גרירה על המסך = סיבוב הראש
  let look = null;
  renderer.domElement.addEventListener('pointerdown', e => { if (walking) { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; } });
  renderer.domElement.addEventListener('pointermove', e => { if (!look || e.pointerId !== look.id) return; yaw += (e.clientX - look.x) * 0.005; pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - look.y) * 0.004)); look.x = e.clientX; look.y = e.clientY; applyLook(); });
  const endLook = e => { if (look && e.pointerId === look.id) look = null; };
  renderer.domElement.addEventListener('pointerup', endLook); renderer.domElement.addEventListener('pointercancel', endLook);
  const J = $('#joy', m), K = $('#joyK', m);
  J.addEventListener('pointerdown', e => { e.stopPropagation(); J.setPointerCapture(e.pointerId); moveJ(e); });
  J.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') moveJ(e); });
  const endJ = () => { joy.x = joy.y = 0; K.style.left = K.style.top = '35px'; };
  J.addEventListener('pointerup', endJ); J.addEventListener('pointercancel', endJ);
  function moveJ(e) { const r = J.getBoundingClientRect(); let dx = (e.clientX - r.left - 60) / 45, dy = (e.clientY - r.top - 60) / 45; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } joy.x = dx; joy.y = dy; K.style.left = (35 + dx * 45) + 'px'; K.style.top = (35 + dy * 45) + 'px'; }
  // בטלפון לאורך המסך צר — מרחיבים את זווית הצילום כדי לראות את החדר ולא רק קיר
  const walkFov = () => Math.min(90, Math.max(70, 2 * Math.atan(Math.tan(38 * Math.PI / 180) / camera.aspect) * 180 / Math.PI));
  function clearance(x, z) { let d = 1e9; for (const w of walls2) { const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / L2)); d = Math.min(d, Math.hypot(x - w.x1 - dx * t, z - w.z1 - dz * t) - w.T / 2); } return d; }
  function startPoint() { // הנקודה הכי מרווחת בדירה, ופונים לכיוון הכי פתוח
    let best = [info.cx, info.cz], bc = -1;
    for (let x = info.minx + 0.3; x < info.maxx; x += 0.2) for (let z = info.minz + 0.3; z < info.maxz; z += 0.2) { const c = clearance(x, z); if (c > bc) { bc = c; best = [x, z]; } }
    let by = 0, bl = -1;
    for (let a = 0; a < 6.28; a += 0.2) { let l = 0; while (l < 15 && !blocked(best[0] - Math.sin(a) * l, best[1] - Math.cos(a) * l)) l += 0.1; if (l > bl) { bl = l; by = a; } }
    return [best[0], best[1], by];
  }
  function orbit() {
    walking = false; if (ceiling) ceiling.visible = false; controls.enabled = true; amb.intensity = 0.25; lamp.intensity = 0; camera.fov = 60; camera.updateProjectionMatrix();
    J.style.display = 'none'; $('#hint3', m).style.display = 'none';
    controls.minDistance = 0.5; controls.maxDistance = 200; controls.enablePan = true; controls.maxPolarAngle = Math.PI / 2.05;
    camera.position.set(info.cx + info.size * 0.6, info.size * 0.9 + 3, info.cz + info.size * 0.9);
    controls.target.set(info.cx, 0, info.cz); controls.update();
  }
  function walk() {
    walking = true; if (ceiling) ceiling.visible = true; controls.enabled = false;
    J.style.display = 'block'; $('#hint3', m).style.display = 'block'; setTimeout(() => { const h = $('#hint3', m); if (h) h.style.display = 'none'; }, 5000);
    amb.intensity = 0.45; lamp.intensity = 1.2; camera.fov = walkFov(); camera.updateProjectionMatrix();
    const [x, z, y] = startPoint(); camera.position.set(x, 1.6, z); yaw = y; pitch = 0; applyLook();
  }
  orbit();
  $('#mOrbit', m).onclick = orbit; $('#mWalk', m).onclick = walk;
  if ($('#mBA', m)) $('#mBA', m).onclick = async () => {
    showing = showing === plan ? plan.original : plan; info = await build(showing);
    const l = $('#ba3', m); l.style.display = ''; l.textContent = showing === plan ? 'אחרי (תכנון)' : 'לפני (מצב קיים)';
  };
  // ---- חומרים ----
  $('#mMat', m).onclick = () => {
    const cat = (typeof S !== 'undefined' ? S.catalog : []).filter(x => !x.deleted && ['ריצוף', 'חיפוי קירות', 'משטחים'].includes(x.cat));
    modal('🎨 חומרים בתלת־ממד', `<label>ריצוף</label><div class="chips">${Object.entries(FLOORS).map(([k, f]) => `<button class="chip${plan.mat.floor === k ? ' on' : ''}" data-f="${k}">${f.name}</button>`).join('')}</div>
      ${cat.length ? `<label>או ריצוף מהקטלוג</label><div class="thumbs">${cat.map(it => `<div class="thumb" data-cf="${it.id}" style="${plan.mat.floor === 'cat:' + it.id ? 'outline:3px solid var(--accent)' : ''}"><img src="${it.th || ''}"><div class="cap">${esc(it.name)}</div></div>`).join('')}</div>` : '<div class="muted" style="margin-top:6px">כשיהיו בקטלוג מוצרי ריצוף — אפשר יהיה לבחור אותם כאן ולראות אותם על הרצפה.</div>'}
      <label>צבע קירות</label><div class="chips">${PAINTS.map(([c, n]) => `<button class="chip${plan.mat.wall === c ? ' on' : ''}" data-w="${c}"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${c};border:1px solid #0003;vertical-align:-2px"></span> ${n}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><label style="margin:0">צבע אחר:</label><input type="color" id="wc" value="${plan.mat.wall}"></div>
      <div class="muted" style="margin-top:8px">קירות נושאים וממ"ד נשארים בצבע הסימון שלהם, כדי שיהיה ברור מה אסור להזיז.</div>`, (b, close) => {
      const apply = async () => { changed(); info = await build(showing); };
      b.querySelectorAll('[data-f]').forEach(x => x.onclick = async () => { plan.mat.floor = x.dataset.f; b.querySelectorAll('[data-f]').forEach(y => y.classList.toggle('on', y === x)); await apply(); });
      b.querySelectorAll('[data-cf]').forEach(x => x.onclick = async () => { plan.mat.floor = 'cat:' + x.dataset.cf; await apply(); close(); toast('הריצוף הוחלף'); });
      b.querySelectorAll('[data-w]').forEach(x => x.onclick = async () => { plan.mat.wall = x.dataset.w; b.querySelectorAll('[data-w]').forEach(y => y.classList.toggle('on', y === x)); await apply(); });
      b.querySelector('#wc').onchange = async e => { plan.mat.wall = e.target.value; await apply(); };
    });
  };
  // ---- הקלטת וידאו של מה שעל המסך (חינם, בלי AI) ----
  let rec = null;
  function recMime() { for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) if (window.MediaRecorder?.isTypeSupported?.(t)) return t; return ''; }
  function startRec() {
    if (!window.MediaRecorder || !renderer.domElement.captureStream) { toast('הדפדפן הזה לא תומך בהקלטת וידאו'); return false; }
    const mime = recMime(), chunks = [];
    rec = new MediaRecorder(renderer.domElement.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : undefined);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = (rec.mimeType || mime || 'video/webm').split(';')[0], blob = new Blob(chunks, { type }); rec = null;
      $('#recDot', m).style.display = 'none'; $('#mRec', m).textContent = '⏺️ הקלטה';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      modal('🎥 סרטון הסיור', '', b => videoPlayer(b, blob, `סיור-תלת-ממד.${ext}`));
    };
    rec.start(500); $('#recDot', m).style.display = 'block'; $('#mRec', m).textContent = '⏹️ עצירה';
    return true;
  }
  $('#mRec', m).onclick = () => { if (rec) rec.stop(); else if (startRec()) toast('מקליט — מסתובבים בבית ולוחצים "עצירה"'); };
  // ---- סיור אוטומטי מוקלט: מבט 360° מבפנים ואז "רחפן" מעל הדירה ----
  let tour = null;
  $('#mTour', m).onclick = () => {
    if (tour || rec) return;
    walk(); $('#hint3', m).style.display = 'none'; J.style.display = 'none';
    if (!startRec()) return;
    const [x0, z0] = [camera.position.x, camera.position.z], t0 = performance.now(), y0 = yaw;
    tour = (now) => {
      const t = (now - t0) / 1000;
      if (t < 9) { yaw = y0 + (t / 9) * Math.PI * 2; pitch = -0.05; camera.position.set(x0, 1.6, z0); applyLook(); }
      else if (t < 17) {
        if (walking) { walking = false; ceiling.visible = false; amb.intensity = 0.25; lamp.intensity = 0; }
        const k = (t - 9) / 8, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, a = y0 + Math.PI * 2 + e * Math.PI * 1.2;
        const R = info.size * (0.3 + e * 0.6), hgt = 1.6 + e * (info.size * 0.9 + 2);
        camera.position.set(info.cx + Math.sin(a) * R, hgt, info.cz + Math.cos(a) * R); camera.lookAt(info.cx, 0.5, info.cz);
      } else { tour = null; rec?.stop(); orbit(); }
    };
  };
  let alive = true, last = performance.now();
  const loop = (now) => { if (!alive) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; if (tour) tour(now); else stepWalk(dt); lamp.position.set(camera.position.x, Math.min(camera.position.y + 0.6, H - 0.1), camera.position.z); renderer.render(scene, camera); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const onResize = () => { camera.aspect = box.clientWidth / box.clientHeight; if (walking) camera.fov = walkFov(); camera.updateProjectionMatrix(); renderer.setSize(box.clientWidth, box.clientHeight); };
  addEventListener('resize', onResize);
  $('#x3', m).onclick = () => { if (rec) { rec.onstop = null; rec.stop(); } alive = false; removeEventListener('resize', onResize); renderer.dispose(); m.remove(); };
}

// ---------------- ייצוא DXF (R12 — נפתח באוטוקאד, סקצ'אפ, רביט) ----------------
function buildDXF(plan) {
  const out = [];
  const add = (...a) => out.push(...a);
  const Y = (y) => -y; // DXF: ציר Y כלפי מעלה
  const layers = { FURNITURE: 30, WALL_INTERIOR: 8, WALL_EXTERIOR: 7, WALL_BEARING: 1, WALL_MAMAD: 1, WALL_UNVERIFIED: 2, DOORS: 4, WINDOWS: 5, DIMENSIONS: 3 };
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
  for (const f of (plan.furniture || [])) {
    const d = FURN[f.type]; if (!d) continue;
    const a = (f.rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const P2 = (lx, ly) => [f.x + lx * c - ly * sn, f.y + lx * sn + ly * c];
    if (d.round) add('0', 'CIRCLE', '8', 'FURNITURE', '10', f.x.toFixed(2), '20', Y(f.y).toFixed(2), '30', '0', '40', (f.w / 2).toFixed(2));
    else { const q = [P2(-f.w / 2, -f.d / 2), P2(f.w / 2, -f.d / 2), P2(f.w / 2, f.d / 2), P2(-f.w / 2, f.d / 2)]; for (let i = 0; i < 4; i++) line('FURNITURE', ...q[i], ...q[(i + 1) % 4]); }
    text('FURNITURE', f.x, f.y, 8, d.name, 0);
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
