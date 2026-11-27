// =====================================================================
// מעצב חכם — אפליקציית סקיצות לעיצוב פנים והום סטיילינג
// חי אפליקציות
// =====================================================================
const APP_VERSION = '1.1.2';
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
// רמות איכות להדמיה — לכל רמה רשימת מודלים לפי סדר (אם גוגל מחליפה שם, עוברים לבא / למה שגוגל ממליצה)
const TIERS = {
  basic:   { label: '⚡ בסיסי',  price: 'כ-3 סנט', desc: 'לבדוק רעיון מהר וזול. פחות מדויק עם תמונות של מוצרים.', models: ['gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image'] },
  regular: { label: '⭐ רגיל',   price: 'כ-7 סנט', desc: 'לעבודה יומיומית — שומר טוב על החדר ועל המוצרים.', models: ['gemini-3.1-flash-image', 'gemini-nano-banana-2.1', 'gemini-2.5-flash-image'] },
  pro:     { label: '💎 איכותי', price: 'כ-13 סנט', desc: 'להדמיה סופית: הכי מדויק, חושב לפני שמבצע, חד גם להדפסה.', models: ['gemini-3-pro-image', 'gemini-3.1-flash-image'] }
};
function tier() { return TIERS[S.settings.tier] ? S.settings.tier : 'regular'; }

// ---------------- אחסון (IndexedDB) ----------------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('meatzev-chacham', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  get(k) {
    return new Promise((res, rej) => {
      const t = this.db.transaction('kv').objectStore('kv').get(k);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  },
  set(k, v) {
    return new Promise((res, rej) => {
      const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  },
  del(k) {
    return new Promise((res) => {
      const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k);
      t.oncomplete = () => res(); t.onerror = () => res();
    });
  },
  keys() {
    return new Promise((res, rej) => {
      const t = this.db.transaction('kv').objectStore('kv').getAllKeys();
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  }
};

let S = { projects: [], catalog: [], settings: { apiKey: '', model: DEFAULT_MODEL, printNotes: true, introLogo: true, introPresenter: true } };
// כללים ורשימות שניתנים לעריכה (נשמרים ב-S.custom ומסתנכרנים למאגר המשותף)
const clone = (o) => JSON.parse(JSON.stringify(o));
const DEFAULT_SUBS = window.CATALOG_SUBS || {};
window.OLD_DEFAULT_SUBS = ['מנורות תלייה', 'מנורת תקרה', 'צמוד תקרה', 'מנורה עומדת', 'מנורות לילה', 'מנורות קיר', 'אהילים', 'בתי מנורה', 'נורות', 'מנורות סטנדרט', 'צבעי נורה', 'מנורות LED', 'פסי לד', 'פלורסנט'];
function R() { return S.custom || { checks: CHECKS, fixed: FIXED_RULES, styles: STYLES, catCats: CATALOG_CATS, subCats: DEFAULT_SUBS }; }
function subsOf(c) { const m = R().subCats || DEFAULT_SUBS; return (m && m[c]) || []; }
// גווני אור לבחירה בסטודיו (נכנס להנחיה ל-AI)
const LIGHT_TONES = [['', 'כמו בתמונה'], ['cool', 'לבן קר (6500K)'], ['neutral', 'לבן טבעי / שמנת (4000K)'], ['warm', 'צהוב-כתום חם (2700K)'], ['amber', 'ענבר חם מאוד (2200K)']];
const LIGHT_EN = { cool: 'cool white light, about 6500K', neutral: 'neutral natural white / creamy light, about 4000K', warm: 'warm yellow-orange light, about 2700K', amber: 'very warm amber light, about 2200K, vintage filament glow' };
function editableRules() {
  if (!S.custom) S.custom = { checks: clone(CHECKS), fixed: clone(FIXED_RULES), styles: [...STYLES], catCats: [...CATALOG_CATS], updated: 0, base: window.RULES_VERSION || 1 };
  if (!S.custom.subCats) { S.custom.subCats = clone(DEFAULT_SUBS); S.custom.taxo = window.TAXONOMY_VERSION || 1; }
  return S.custom;
}
function rulesChanged() { S.custom.updated = Date.now(); save(); Sync.pushRules(); }
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => DB.set('state', S), 300); }

const imgCache = {};
async function putImg(dataURL) { const id = 'img_' + uid(); imgCache[id] = dataURL; await DB.set(id, dataURL); return id; }
async function getImg(id) { if (!id) return ''; if (imgCache[id]) return imgCache[id]; const v = await DB.get(id); if (v) imgCache[id] = v; return v || ''; }
async function delImg(id) { if (!id) return; delete imgCache[id]; await DB.del(id); }

// ---------------- עזרים ----------------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (t) => new Date(t).toLocaleDateString('he-IL');
const catOf = (id) => ROOM_CATS.find(c => c.id === id) || ROOM_CATS[ROOM_CATS.length - 1];
function toast(msg, ms = 2500) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), ms); }

function shrinkData(dataURL, max, q) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const sc = Math.min(1, max / Math.max(im.width, im.height));
      if (sc === 1 && dataURL.length < 400000) return res(dataURL);
      const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q));
    };
    im.onerror = () => res(dataURL); im.src = dataURL;
  });
}
function compressImage(file, max = 1600, q = 0.85) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        let { width: w, height: h } = im; const sc = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', q));
      };
      im.onerror = rej; im.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
function pickFiles(multiple = false, camera = false) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple && !camera;
    if (camera) i.setAttribute('capture', 'environment');
    i.onchange = () => res([...i.files]); i.click();
  });
}
// בוחרים: צילום במצלמה או מהגלריה
function pickPhoto(multiple = false) {
  return new Promise(res => {
    const close = modal('הוספת תמונה', `<div class="grid2"><button class="btn" id="pcCam">📷 צילום עכשיו</button><button class="btn sec" id="pcGal">🖼️ מהגלריה</button></div>`, (b, cl) => {
      $('#pcCam', b).onclick = async () => { cl(); res(await pickFiles(false, true)); };
      $('#pcGal', b).onclick = async () => { cl(); res(await pickFiles(multiple)); };
    });
  });
}

// ---------------- ניווט ----------------
let V = { tab: 'projects', projectId: null, roomId: null, roomTab: 'design', catFilter: '' };
const proj = (id) => S.projects.find(p => p.id === (id || V.projectId));
const room = () => proj()?.rooms.find(r => r.id === V.roomId);

// ↩ היסטוריית ניווט: "חזור" תמיד מחזיר צעד אחד אחורה (גם כפתור החזרה של הטלפון)
const NAV = []; const NAVK = ['tab', 'projectId', 'roomId', 'roomTab', 'planOpen', 'catFilter', 'subFilter'];
const navSnap = () => Object.fromEntries(NAVK.map(k => [k, V[k]]));
function go(patch) { const before = navSnap(); if (NAVK.some(k => k in patch && patch[k] !== V[k])) { NAV.push(before); if (NAV.length > 60) NAV.shift(); } Object.assign(V, patch); if (V.tab !== 'catalog') { V.selMode = false; const sb = document.getElementById('selBar'); if (sb) sb.remove(); } render(); window.scrollTo(0, 0); }
// מעבר בתוך אותו מסך (למשל בחירת קטגוריה) — בלי לקפוץ למעלה
async function stay(patch) { const y = window.scrollY; Object.assign(V, patch); await render(); window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y)); }

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  go({ tab: b.dataset.tab, projectId: null, roomId: null, planOpen: false });
});
function goBack() {
  // קודם סוגרים את מה שפתוח מעל המסך (חלון, הגדלה, ספר, תלת־ממד…)
  const top = [...document.querySelectorAll('.modal')].pop();
  if (top) { top.querySelector('.top button')?.click(); if (top.isConnected) { const x = top.querySelector('#x3'); if (x) x.click(); else top.remove(); } return true; }
  const zv = document.getElementById('zoomv'); if (zv) { zv.remove(); return true; }
  const tv = document.getElementById('tryv'); if (tv) { tv.querySelector('#tX')?.click(); return true; }
  const fb = document.getElementById('fbook'); if (fb) { fb.querySelector('#fbX')?.click(); return true; }
  if (document.body.classList.contains('planfs')) { document.getElementById('fsExit')?.click(); return true; }
  const prev = NAV.pop();
  if (prev) { Object.assign(V, prev); render(); window.scrollTo(0, 0); return true; }
  if (V.planOpen) { V.planOpen = false; render(); return true; } if (V.roomId) { V.roomId = null; render(); return true; } if (V.projectId) { V.projectId = null; render(); return true; }
  return false;
}
$('#backBtn').onclick = () => goBack();
// כפתור/מחוות "חזור" של הטלפון → צעד אחד אחורה באפליקציה (ולא יציאה)
try { history.replaceState({ m: 1 }, ''); history.pushState({ m: 2 }, ''); } catch {}
addEventListener('popstate', () => { const did = goBack(); try { history.pushState({ m: 2 }, ''); } catch {} if (!did) toast('אתם במסך הראשי'); });
$('#helpBtn').onclick = showHelp;

function setHeader(title, back) {
  $('#title').textContent = title;
  $('#backBtn').style.display = back || NAV.length ? '' : 'none';
}

async function render() {
  if (V.tab === 'catalog') { clearTimeout(render.ct); render.ct = setTimeout(ensureCuts, 4000); }
  const app = $('#app');
  if (!V.planOpen) document.body.classList.remove('planfs', 'toolsOpen', 'propsOpen');
  if (V.tab === 'projects') {
    if (V.planOpen && proj()) return Plan.open(app, proj());
    if (V.roomId && room()) return renderRoom(app);
    if (V.projectId && proj()) return renderProject(app);
    return renderProjects(app);
  }
  if (V.tab === 'catalog') return renderCatalog(app);
  if (V.tab === 'rules') return renderRules(app);
  if (V.tab === 'settings') return renderSettings(app);
}

// ---------------- מודאל ----------------
function modal(title, html, onMount) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="sheet"><div class="top"><h3>${esc(title)}</h3><button aria-label="סגור">✕</button></div><div class="body">${html}</div></div>`;
  const close = () => m.remove();
  m.querySelector('.top button').onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.body.appendChild(m);
  onMount && onMount(m.querySelector('.body'), close);
  return close;
}

// =====================================================================
// פרויקטים
// =====================================================================
function renderProjects(app) {
  setHeader('מעצב חכם', false);
  const list = S.projects.slice().sort((a, b) => b.updated - a.updated);
  app.innerHTML = `
    <div class="row" style="margin-bottom:12px"><h2 class="grow" style="margin:0">הפרויקטים שלי</h2>
    <button class="btn" id="newP">+ פרויקט חדש</button></div>
    ${list.length ? list.map(p => `
      <div class="card list-item" data-id="${p.id}">
        <div class="ic">🏠</div>
        <div class="grow"><b>${esc(p.name)}</b>
          <div class="muted">${p.rooms.length} חדרים · עודכן ${fmtDate(p.updated)}${p.client ? ' · ' + esc(p.client) : ''}</div></div>
        <span class="muted">‹</span>
      </div>`).join('') : `<div class="empty"><b>🏡</b>עוד אין פרויקטים.<br>לוחצים על "פרויקט חדש" כדי להתחיל.</div>`}`;
  $('#newP').onclick = () => projectForm();
  app.querySelectorAll('[data-id]').forEach(el => el.onclick = () => go({ projectId: el.dataset.id }));
}

function projectForm(p) {
  modal(p ? 'עריכת פרויקט' : 'פרויקט חדש', `
    <label>שם הפרויקט</label><input id="pn" value="${esc(p?.name || '')}" placeholder="למשל: דירת משפחת כהן">
    <label>לקוח (לא חובה)</label><input id="pc" value="${esc(p?.client || '')}">
    <label>כתובת (לא חובה)</label><input id="pa" value="${esc(p?.address || '')}">
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>`, (b, close) => {
    $('#ok', b).onclick = () => {
      const name = $('#pn', b).value.trim(); if (!name) return toast('צריך שם לפרויקט');
      if (p) Object.assign(p, { name, client: $('#pc', b).value.trim(), address: $('#pa', b).value.trim(), updated: Date.now() });
      else { const np = { id: uid(), name, client: $('#pc', b).value.trim(), address: $('#pa', b).value.trim(), created: Date.now(), updated: Date.now(), rooms: [] }; S.projects.push(np); V.projectId = np.id; }
      save(); close(); render();
    };
  });
}

function renderProject(app) {
  const p = proj();
  setHeader(p.name, true);
  app.innerHTML = `
    <div class="card"><div class="row"><div class="grow"><b>${esc(p.name)}</b>
      <div class="muted">${[p.client, p.address].filter(Boolean).map(esc).join(' · ') || 'נוצר ' + fmtDate(p.created)}</div></div>
      <button class="btn sec sm" id="editP">עריכה</button></div>
      <div class="row" style="margin-top:10px">
        <button class="btn sec sm" id="printP">📄 הכנה לדפוס</button>
        <button class="btn sec sm" id="shareP">📤 גיבוי הפרויקט</button>
        <button class="btn danger sm" id="delP">מחיקה</button></div></div>
    <div class="card list-item" id="openPlan"><div class="ic">📐</div><div class="grow"><b>תוכנית הבית</b>
      <div class="muted">${p.plan?.walls?.length ? `${p.plan.walls.length} קירות · ${p.plan.openings.length} פתחים${p.plan.original ? ' · יש מצב קיים' : ''}` : 'סרטוט, תלת־ממד, ייצוא לאוטוקאד'}</div></div><span class="muted">‹</span></div>
    <div class="card"><div class="row"><div class="grow"><b>🧺 אוסף הפרויקט</b> <span class="muted">(${(p.picks || []).length})</span>
      <div class="muted">המוצרים שבחרתם לפרויקט — נכנסים אוטומטית לכל עיצוב</div></div><button class="btn sec sm" id="browseP">📖 דפדוף בקטלוג</button></div>
      ${(p.picks || []).length ? `<div class="picks" id="picks">${p.picks.map(id => { const it = S.catalog.find(x => x.id === id); return it ? `<div class="pk" data-id="${id}"><img data-th="${id}"><button data-rm="${id}">✕</button><span>${esc(it.name)}</span></div>` : ''; }).join('')}</div>
        <button class="btn full" id="designPicks" style="margin-top:10px">🎨 השלב הבא: לשלב את המוצרים בחדר ›</button>
        <button class="btn sec full" id="tryPicks" style="margin-top:8px">📸 לנסות אצלי — להניח על תמונה ולהזיז ביד</button>` : `<div class="muted" style="margin-top:8px">בוחרים מוצרים ב"דפדוף בקטלוג" (⭐), ואז ממשיכים מכאן לעיצוב החדר.</div>`}</div>
    <div class="row" style="margin:6px 0 10px"><h2 class="grow" style="margin:0">חדרים</h2><button class="btn" id="newR">+ חדר</button></div>
    ${p.rooms.length ? p.rooms.map(r => {
      const c = catOf(r.cat);
      return `<div class="card list-item" data-id="${r.id}"><div class="ic" data-cover="${r.photos[0] || ''}">${c.icon}</div>
        <div class="grow"><b>${esc(r.name)}</b><div class="muted">${c.name}${r.L ? ` · ${r.L}×${r.W}${r.H ? '×' + r.H : ''} ס"מ` : ''} · ${r.designs.length} הדמיות</div></div><span class="muted">‹</span></div>`;
    }).join('') : `<div class="empty"><b>📐</b>מוסיפים חדר, מגדירים מידות ומעלים תמונה.</div>`}`;
  app.querySelectorAll('[data-cover]').forEach(async el => { const id = el.dataset.cover; if (id) { const d = await getImg(id); if (d) el.innerHTML = `<img src="${d}">`; } });
  app.querySelectorAll('.list-item[data-id]').forEach(el => el.onclick = () => go({ roomId: el.dataset.id, roomTab: 'design' }));
  $('#newR').onclick = () => roomForm();
  $('#browseP').onclick = () => flipbook(S.catalog.slice().sort((a, b) => (R().catCats.indexOf(a.cat) - R().catCats.indexOf(b.cat)) || (b.updated || 0) - (a.updated || 0)), 0, p.id);
  app.querySelectorAll('[data-th]').forEach(async im => { const it = S.catalog.find(x => x.id === im.dataset.th); if (!it) return; im.src = it.th || await getImg(it.img) || await Sync.fetchImg(it.img) || ''; });
  app.querySelectorAll('.pk').forEach(el => el.onclick = (e) => { if (e.target.dataset.rm) return; const it = S.catalog.find(x => x.id === el.dataset.id); if (it) flipbook([it], 0, p.id); });
  app.querySelectorAll('[data-rm]').forEach(bt => bt.onclick = () => { p.picks = (p.picks || []).filter(x => x !== bt.dataset.rm); p.updated = Date.now(); save(); render(); });
  $('#openPlan').onclick = () => go({ planOpen: true });
  if ($('#designPicks')) $('#designPicks').onclick = () => designWithPicks(p);
  if ($('#tryPicks')) $('#tryPicks').onclick = () => tryAtHome(p.picks || []);
  $('#editP').onclick = () => projectForm(p);
  $('#printP').onclick = () => printProject(p);
  $('#shareP').onclick = () => exportBackup([p]);
  $('#delP').onclick = async () => {
    if (!confirm(`למחוק את "${p.name}" עם כל החדרים והתמונות?`)) return;
    for (const r of p.rooms) await deleteRoomImages(r);
    S.projects = S.projects.filter(x => x !== p); save(); go({ projectId: null });
  };
}

// 🎨 מהאוסף לעיצוב: בוחרים חדר (או מצלמים חדר חדש) ונכנסים לסטודיו עם המוצרים מסומנים
function designWithPicks(p) {
  modal('באיזה חדר לשלב את המוצרים?', `
    <div class="muted" style="margin-bottom:8px">${(p.picks || []).length} מוצרים מהאוסף ייכנסו אוטומטית לעיצוב. בשלב הבא כותבים בדיוק איפה ואיך לשלב אותם.</div>
    ${p.rooms.map(r => `<div class="card list-item" data-r="${r.id}"><div class="ic">${catOf(r.cat).icon}</div><div class="grow"><b>${esc(r.name)}</b><div class="muted">${r.photos.length ? r.photos.length + ' תמונות' : 'עוד אין תמונה — נצלם עכשיו'}</div></div><span class="muted">‹</span></div>`).join('')}
    <button class="btn full" id="newRoomPh" style="margin-top:8px">📸 חדר חדש — לצלם עכשיו</button>`, (b, close) => {
    const withPhoto = async (r) => {
      if (!r.photos.length) {
        toast('מצלמים או בוחרים תמונה של החדר');
        const files = await pickPhoto(false); if (!files.length) return;
        r.photos.push(await putImg(await compressImage(files[0]))); p.updated = Date.now(); save();
      }
      close(); go({ roomId: r.id, roomTab: 'design' }); setTimeout(() => studio(p, r), 150);
    };
    b.querySelectorAll('[data-r]').forEach(el => el.onclick = () => withPhoto(p.rooms.find(r => r.id === el.dataset.r)));
    b.querySelector('#newRoomPh').onclick = () => {
      b.innerHTML = `<label>סוג החדר</label><select id="qc">${ROOM_CATS.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select>
        <label>שם (לא חובה)</label><input id="qn" placeholder="למשל: פינת אוכל">
        <div style="height:12px"></div><button class="btn full" id="qok">📸 המשך לצילום</button>`;
      b.querySelector('#qok').onclick = () => {
        const cat = b.querySelector('#qc').value;
        const r = { id: uid(), cat, name: b.querySelector('#qn').value.trim() || catOf(cat).name, L: '', W: '', H: '', photos: [], designs: [], checks: {}, notes: '', elements: [], created: Date.now() };
        p.rooms.push(r); save(); withPhoto(r);
      };
    };
  });
}

function roomForm(r) {
  const p = proj();
  modal(r ? 'עריכת חדר' : 'חדר חדש', `
    <label>סוג החדר</label>
    <select id="rc">${ROOM_CATS.map(c => `<option value="${c.id}" ${r?.cat === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select>
    <label>שם החדר</label><input id="rn" value="${esc(r?.name || '')}" placeholder="למשל: חדר הורים">
    <label>מידות בס"מ</label>
    <div class="grid3"><input id="rL" type="number" inputmode="numeric" placeholder="אורך" value="${r?.L || ''}">
      <input id="rW" type="number" inputmode="numeric" placeholder="רוחב" value="${r?.W || ''}">
      <input id="rH" type="number" inputmode="numeric" placeholder="גובה" value="${r?.H || ''}"></div>
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>`, (b, close) => {
    const rc = $('#rc', b), rn = $('#rn', b);
    rc.onchange = () => { if (!rn.value || ROOM_CATS.some(c => c.name === rn.value)) rn.value = catOf(rc.value).name; };
    if (!r) rn.value = catOf(rc.value).name;
    $('#ok', b).onclick = () => {
      const d = { cat: rc.value, name: rn.value.trim() || catOf(rc.value).name, L: +$('#rL', b).value || '', W: +$('#rW', b).value || '', H: +$('#rH', b).value || '' };
      if ([d.L, d.W, d.H].filter(Boolean).every(v => v <= 20) && (d.L || d.W)) { ['L', 'W', 'H'].forEach(k => { if (d[k]) d[k] = Math.round(d[k] * 100); }); toast('המידות הוזנו במטרים — הומרו לס"מ', 3000); }
      if (r) Object.assign(r, d);
      else p.rooms.push({ id: uid(), ...d, photos: [], designs: [], checks: {}, notes: '', elements: [], created: Date.now() });
      p.updated = Date.now(); save(); close(); render();
    };
  });
}

async function deleteRoomImages(r) {
  for (const id of r.photos) await delImg(id);
  for (const d of r.designs) await delImg(d.result);
}

// =====================================================================
// חדר
// =====================================================================
async function renderRoom(app) {
  const p = proj(), r = room(), c = catOf(r.cat);
  setHeader(r.name, true);
  app.innerHTML = `
    <div class="card"><div class="row"><div style="font-size:30px">${c.icon}</div>
      <div class="grow"><b>${esc(r.name)}</b><div class="muted">${c.name}${r.L ? ` · ${r.L}×${r.W}${r.H ? '×' + r.H : ''} ס"מ` : ' · לא הוגדרו מידות'}</div></div>
      <button class="btn sec sm" id="editR">עריכה</button></div></div>
    <div class="seg">
      <button data-rt="design" class="${V.roomTab === 'design' ? 'on' : ''}">🎨 עיצוב</button>
      <button data-rt="checks" class="${V.roomTab === 'checks' ? 'on' : ''}">📏 מידות וכללים</button>
      <button data-rt="notes" class="${V.roomTab === 'notes' ? 'on' : ''}">📝 הערות</button>
    </div><div id="rbody"></div>`;
  app.querySelectorAll('[data-rt]').forEach(b => b.onclick = () => { V.roomTab = b.dataset.rt; renderRoom(app); });
  $('#editR').onclick = () => roomForm(r);
  const body = $('#rbody');
  if (V.roomTab === 'design') return renderDesignTab(body, p, r);
  if (V.roomTab === 'checks') return renderChecksTab(body, p, r);
  return renderNotesTab(body, p, r);
}

// ---------- לשונית עיצוב ----------
async function renderDesignTab(body, p, r) {
  body.innerHTML = `
    <div class="card"><div class="row" style="margin-bottom:10px"><h3 class="grow" style="margin:0">תמונות החדר (לפני)</h3>
      <button class="btn sec sm" id="addPh">📷 + תמונה</button></div>
      ${r.photos.length ? `<div class="thumbs" id="phs">${r.photos.map(id => `<div class="t" data-id="${id}"><img><button class="x">✕</button></div>`).join('')}</div>`
        : `<div class="muted">מצלמים את החדר מכמה זוויות, באור יום, מגובה העיניים.</div>`}
    </div>
    <button class="btn full" id="newD" ${r.photos.length ? '' : 'disabled'}>✨ עיצוב חדש על תמונה</button>
    <div style="height:14px"></div>
    <h3>הדמיות (${r.designs.length})</h3><div id="dlist"></div>`;
  for (const el of body.querySelectorAll('#phs .t')) {
    el.querySelector('img').src = await getImg(el.dataset.id);
    el.querySelector('.x').onclick = async (e) => {
      e.stopPropagation(); if (!confirm('למחוק את התמונה?')) return;
      if (r.designs.some(d => d.base === el.dataset.id)) return toast('יש הדמיות שמבוססות על התמונה הזו. מוחקים קודם אותן.');
      r.photos = r.photos.filter(x => x !== el.dataset.id); await delImg(el.dataset.id); save(); renderRoom($('#app'));
    };
    el.onclick = async () => viewImage(await getImg(el.dataset.id));
  }
  $('#addPh').onclick = async () => {
    const files = await pickPhoto(true); if (!files.length) return;
    toast('מעבד תמונות…');
    for (const f of files) r.photos.push(await putImg(await compressImage(f)));
    p.updated = Date.now(); save(); renderRoom($('#app'));
  };
  $('#newD').onclick = () => studio(p, r);
  const dl = $('#dlist');
  if (!r.designs.length) { dl.innerHTML = `<div class="empty"><b>🎨</b>עוד אין הדמיות לחדר הזה.</div>`; return; }
  for (const d of r.designs.slice().reverse()) {
    const card = document.createElement('div'); card.className = 'card';
    const items = (d.items || []).map(id => S.catalog.find(x => x.id === id)).filter(Boolean);
    card.innerHTML = `<div class="ba-wrap"></div>
      <div class="muted" style="margin-top:8px">${fmtDate(d.created)}${d.style ? ' · ' + esc(d.style) : ''}</div>
      ${d.instructions ? `<div style="margin-top:6px;font-size:14px">${esc(d.instructions)}</div>` : ''}
      ${items.length ? `<div class="chips" style="margin-top:8px">${items.map(i => `<span class="chip">${esc(i.name)}</span>`).join('')}</div>` : ''}
      <label>הערה להדמיה</label><textarea class="dnote" placeholder="מה אהבתי, מה לשנות…">${esc(d.note || '')}</textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn sec sm" data-a="cont">✏️ להמשיך מכאן</button>
        <button class="btn sec sm" data-a="full">🔍 מסך מלא</button>
        <button class="btn sec sm" data-a="gif">🎞️ GIF לפני/אחרי</button>
        <button class="btn sec sm" data-a="veo">🎬 סרטון AI${d.videos?.length ? ` (${d.videos.length})` : ''}</button>
        <button class="btn danger sm" data-a="del">מחיקה</button></div>`;
    dl.appendChild(card);
    const [before, after] = [await getImg(d.base), await getImg(d.result)];
    beforeAfter($('.ba-wrap', card), before, after);
    $('.dnote', card).onchange = (e) => { d.note = e.target.value; save(); };
    card.querySelector('[data-a=cont]').onclick = () => studio(p, r, d);
    card.querySelector('[data-a=full]').onclick = () => viewImage(after);
    card.querySelector('[data-a=gif]').onclick = () => gifDialog(before, after, `${p.name}-${r.name}`);
    card.querySelector('[data-a=veo]').onclick = () => veoDialog(p, r, d, before, after);
    card.querySelector('[data-a=del]').onclick = async () => {
      if (!confirm('למחוק את ההדמיה?')) return;
      if (r.designs.some(x => x.base === d.result)) return toast('הדמיה אחרת נבנתה מההדמיה הזו. מוחקים קודם אותה.');
      r.designs = r.designs.filter(x => x !== d); await delImg(d.result); for (const v of d.videos || []) await delImg(v.id); save(); renderRoom($('#app'));
    };
  }
}

// =====================================================================
// GIF לפני/אחרי — וילון שזז מצד לצד, עם תוויות ולוגו
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function makeBAGif(before, after, onProgress) {
  const { GIFEncoder, quantize, applyPalette } = await import('./vendor/gifenc.esm.js?v=1');
  const [bi, ai] = await Promise.all([loadImg(before), loadImg(after)]);
  let logo = null; try { logo = await loadImg('media/logo.png'); } catch {}
  const W = Math.min(720, ai.width), H = Math.round(W * ai.height / ai.width);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const cover = (img) => { const sc = Math.max(W / img.width, H / img.height), w = img.width * sc, h = img.height * sc; x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); };
  const pill = (txt, right) => {
    const fs = Math.round(W / 22); x.font = `700 ${fs}px Heebo, Arial, sans-serif`; x.direction = 'rtl';
    const tw = x.measureText(txt).width, pw = tw + fs * 1.2, ph = fs * 1.6, px = right ? W - pw - fs * .6 : fs * .6, py = fs * .6;
    x.fillStyle = 'rgba(30,25,20,.72)'; x.beginPath(); x.roundRect(px, py, pw, ph, ph / 2); x.fill();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, px + pw / 2, py + ph / 2 + 1);
  };
  // pos = כמה מהתמונה (מימין) כבר "אחרי": 0 = כולה לפני, 1 = כולה אחרי
  const frame = (pos) => {
    cover(bi);
    const cut = W * (1 - pos);
    if (pos > 0) { x.save(); x.beginPath(); x.rect(cut, 0, W - cut, H); x.clip(); cover(ai); x.restore(); }
    if (pos > 0 && pos < 1) { x.fillStyle = '#fff'; x.fillRect(cut - 2, 0, 4, H); }
    if (pos < 1) pill('לפני', false);
    if (pos > 0) pill('אחרי', true);
    if (logo) { const s = Math.round(W / 9); x.globalAlpha = .9; x.drawImage(logo, W - s - 10, H - s - 10, s, s); x.globalAlpha = 1; }
    return x.getImageData(0, 0, W, H).data;
  };
  const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const plan = [[0, 1400]];
  const N = 14;
  for (let i = 1; i < N; i++) plan.push([ease(i / N), 70]);
  plan.push([1, 1800]);
  for (let i = N - 1; i > 0; i--) plan.push([ease(i / N), 70]);
  // פלטה אחת משותפת מתמונת "לפני" ו"אחרי" — מהיר יותר ובלי הבהובים
  const fb = frame(0), fa = frame(1);
  const mix = new Uint8ClampedArray(fb.length * 2); mix.set(fb); mix.set(fa, fb.length);
  const palette = quantize(mix, 256);
  const gif = GIFEncoder();
  for (let i = 0; i < plan.length; i++) {
    const [pos, delay] = plan[i];
    gif.writeFrame(applyPalette(frame(pos), palette), W, H, { palette, delay });
    onProgress && onProgress((i + 1) / plan.length);
    if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
function gifDialog(before, after, name) {
  modal('GIF לפני / אחרי', `<div id="gp" class="muted" style="text-align:center"><div class="spinner"></div>מכין את ה-GIF… <span id="gpp">0%</span></div>`, async (b) => {
    try {
      const blob = await makeBAGif(before, after, (p) => { const e = b.querySelector('#gpp'); if (e) e.textContent = Math.round(p * 100) + '%'; });
      const fname = `${name}-לפני-אחרי.gif`.replace(/[\\/:*?"<>|]/g, '-');
      const file = new File([blob], fname, { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      b.innerHTML = `<img src="${url}" style="width:100%;border-radius:12px">
        <div class="muted" style="text-align:center;margin:6px 0">${(blob.size / 1048576).toFixed(1)} MB</div>
        <div class="grid2"><button class="btn" id="gShare">📤 שיתוף</button><button class="btn sec" id="gSave">💾 הורדה</button></div>`;
      b.querySelector('#gSave').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); toast('נשמר בהורדות'); };
      b.querySelector('#gShare').onclick = async () => {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'לפני / אחרי' }); } catch {} }
        else b.querySelector('#gSave').click();
      };
    } catch (e) { b.innerHTML = `<div class="rule red"><span class="dot red"></span><div>לא הצלחתי ליצור GIF: ${esc(e.message)}</div></div>`; }
  });
}

// =====================================================================
// 🎬 סרטון הדמיה עם AI (Veo של גוגל) — מתוך הדמיה קיימת
// סיור בחדר המעוצב / מעבר מלפני לאחרי / סיבוב סביב החדר
const VEO_TIERS = {
  lite:    { name: 'חסכוני', want: /lite/, price: 0.05, note: 'איכות סבירה, הכי זול' },
  fast:    { name: 'מהיר', want: /fast/, price: 0.10, note: 'מומלץ — איכות טובה במחיר נמוך' },
  quality: { name: 'איכותי', want: /^(?!.*(fast|lite)).*/, price: 0.40, note: 'הכי יפה ומדויק, יקר פי 4' }
};
const VEO_FALLBACK = ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview', 'veo-3.0-fast-generate-001', 'veo-3.0-generate-001'];
const VEO_MODES = {
  walk: { name: '🚶 סיור בחדר המעוצב', needsAfter: true,
    prompt: 'Smooth cinematic real-estate walkthrough video inside this exact interior. The camera slowly glides forward into the room at eye level (1.6 m) with a gentle turn, revealing the space. Keep every piece of furniture, material, color, lighting and layout exactly as in the image. Photorealistic, steady gimbal motion, soft natural light. No people, no text, no added objects.' },
  orbit: { name: '🔄 תנועה סביב החדר', needsAfter: true,
    prompt: 'Slow cinematic orbit / parallax camera move around this exact interior room, as if filmed by a professional interior photographer with a gimbal. Keep the design, furniture, materials and colors exactly as shown. Photorealistic, no people, no text, no new objects.' },
  ba: { name: '✨ מעבר מלפני לאחרי', needsAfter: true, lastFrame: true,
    prompt: 'Magical smooth renovation transformation of this room: starting from the original room, the new design gradually appears — walls, floor, furniture and decor morph and settle into place — ending exactly on the final designed room. The camera stays almost still. Photorealistic, elegant, no people, no text.' }
};
async function veoModels(key) {
  if (veoModels.cache) return veoModels.cache;
  try {
    const r = await fetchT('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + encodeURIComponent(key), {}, 20000);
    const j = await r.json();
    const list = (j.models || []).map(m => m.name.replace('models/', '')).filter(n => /^veo/.test(n));
    veoModels.cache = list.length ? list : VEO_FALLBACK;
  } catch { veoModels.cache = VEO_FALLBACK; }
  return veoModels.cache;
}
function veoPick(all, t) {
  const ver = n => parseFloat((/veo-(\d+(\.\d+)?)/.exec(n) || [0, 0])[1]);
  const sorted = all.slice().sort((a, b) => ver(b) - ver(a) || (/preview/.test(a) ? 1 : -1));
  const want = sorted.filter(n => VEO_TIERS[t].want.test(n.replace(/^veo-[\d.]+-/, '')));
  // אם אין דגם בדרגה המבוקשת — עוברים לדרגה הקרובה
  const order = t === 'lite' ? ['lite', 'fast', 'quality'] : t === 'fast' ? ['fast', 'lite', 'quality'] : ['quality', 'fast', 'lite'];
  const rest = order.slice(1).flatMap(o => sorted.filter(n => VEO_TIERS[o].want.test(n.replace(/^veo-[\d.]+-/, ''))));
  return [...new Set([...want, ...rest])];
}
async function toVeoImage(src) {
  const im = await loadImg(src); const s = Math.min(1, 1280 / Math.max(im.width, im.height));
  const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return { bytesBase64Encoded: c.toDataURL('image/jpeg', 0.9).split(',')[1], mimeType: 'image/jpeg', portrait: c.height > c.width };
}
async function makeVeoVideo({ before, after, mode, tierKey, extra, onStatus }) {
  const key = (S.settings.apiKey || '').trim(); if (!key) throw new Error('צריך מפתח AI בהגדרות');
  const md = VEO_MODES[mode];
  const first = await toVeoImage(mode === 'ba' ? before : after);
  const inst = { prompt: md.prompt + (extra ? ' Extra direction: ' + extra : ''), image: { bytesBase64Encoded: first.bytesBase64Encoded, mimeType: 'image/jpeg' } };
  if (md.lastFrame) { const l = await toVeoImage(after); inst.lastFrame = { bytesBase64Encoded: l.bytesBase64Encoded, mimeType: 'image/jpeg' }; }
  const params = { aspectRatio: first.portrait ? '9:16' : '16:9', negativePrompt: 'people, person, text, watermark, distorted furniture, warped walls, blurry' };
  const models = veoPick(await veoModels(key), tierKey);
  AI_LOG = []; let op = null, used = null, lastErr = '';
  for (const model of models) {
    onStatus && onStatus(`שולח לגוגל (${model})…`);
    let body = JSON.stringify({ instances: [inst], parameters: params });
    let r = await gFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`, key, body, 60000);
    let j = await r.json().catch(() => ({}));
    // חלק מהדגמים לא מקבלים פרמטר מסוים — מנסים שוב בלי הפרמטרים הנוספים
    if (r.status === 400 && /negativePrompt|aspectRatio|not supported/i.test(j.error?.message || '') && !/lastFrame/i.test(j.error?.message || '')) {
      body = JSON.stringify({ instances: [inst] });
      r = await gFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`, key, body, 60000); j = await r.json().catch(() => ({}));
    }
    AI_LOG.push({ model, status: r.status, msg: j.error?.message || (j.name ? 'ok' : '') });
    if (r.ok && j.name) { op = j.name; used = model; break; }
    lastErr = j.error?.message || ('שגיאה ' + r.status);
  }
  if (!op) {
    if (/billing|paid|quota|RESOURCE_EXHAUSTED|429/i.test(lastErr + AI_LOG.map(l => l.status).join())) throw new Error('סרטוני AI זמינים רק במפתח עם חיוב (אשראי) מופעל, או שנגמרה המכסה. ' + lastErr);
    throw new Error(lastErr);
  }
  const t0 = Date.now();
  while (true) {
    await new Promise(r => setTimeout(r, 8000));
    const sec = Math.round((Date.now() - t0) / 1000);
    onStatus && onStatus(`גוגל מצלם את הסרטון… ${sec} שניות (בדרך כלל 1–3 דקות)`);
    if (sec > 600) throw new Error('לקח יותר מ-10 דקות. נסו שוב מאוחר יותר.');
    let s; try { s = await (await fetchT(`https://generativelanguage.googleapis.com/v1beta/${op}?key=${encodeURIComponent(key)}`, {}, 30000)).json(); } catch { continue; }
    if (s.error) throw new Error(s.error.message || 'שגיאה ביצירת הסרטון');
    if (!s.done) continue;
    const res = s.response?.generateVideoResponse || s.response || {};
    const sample = (res.generatedSamples || res.videos || [])[0];
    const uri = sample?.video?.uri || sample?.uri;
    if (res.raiMediaFilteredReasons?.length) throw new Error('גוגל סינן את הסרטון: ' + res.raiMediaFilteredReasons.join(', '));
    if (!uri) throw new Error('הסרטון לא חזר מגוגל');
    onStatus && onStatus('מוריד את הסרטון…');
    const vr = await fetchT(uri + (uri.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key), {}, 120000);
    if (!vr.ok) throw new Error('הורדת הסרטון נכשלה (' + vr.status + ')');
    return { blob: await vr.blob(), model: used };
  }
}
const blobToData = (b) => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
async function dataToBlob(d) { return await (await fetch(d)).blob(); }
function videoPlayer(b, blob, fname) {
  const url = URL.createObjectURL(blob);
  const file = new File([blob], fname, { type: blob.type || 'video/mp4' });
  b.innerHTML = `<video src="${url}" controls autoplay loop playsinline style="width:100%;border-radius:12px;background:#000"></video>
    <div class="muted" style="text-align:center;margin:6px 0">${(blob.size / 1048576).toFixed(1)} MB</div>
    <div class="grid2"><button class="btn" id="vShare">📤 שיתוף</button><button class="btn sec" id="vSave">💾 הורדה</button></div>`;
  b.querySelector('#vSave').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); toast('נשמר בהורדות'); };
  b.querySelector('#vShare').onclick = async () => {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'סרטון הדמיה' }); } catch {} }
    else b.querySelector('#vSave').click();
  };
}
function veoDialog(p, r, d, before, after) {
  const name = `${p.name}-${r.name}`.replace(/[\\/:*?"<>|]/g, '-');
  const t0 = S.settings.veoTier || 'fast';
  modal('🎬 סרטון הדמיה עם AI', `
    ${d.videos?.length ? `<div class="card" style="margin:0 0 10px"><b>סרטונים שכבר נוצרו</b><div class="row" style="margin-top:6px">${d.videos.map((v, i) => `<button class="btn sec sm" data-v="${i}">▶️ ${esc(VEO_MODES[v.mode]?.name.replace(/^\S+\s/, '') || 'סרטון')} ${i + 1}</button>`).join('')}</div></div>` : ''}
    <label>איזה סרטון?</label>
    <div class="chips" id="vMode">${Object.entries(VEO_MODES).map(([k, m], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-m="${k}">${m.name}</button>`).join('')}</div>
    <label>איכות</label>
    <div class="chips" id="vTier">${Object.entries(VEO_TIERS).map(([k, t]) => `<button class="chip${k === t0 ? ' on' : ''}" data-t="${k}">${t.name} · ~$${(t.price * 8).toFixed(2)}</button>`).join('')}</div>
    <div class="muted" id="vNote" style="margin-top:4px"></div>
    <label>הכוונה נוספת (לא חובה)</label><input id="vExtra" placeholder="למשל: להתחיל מהחלון ולהסתובב לכיוון הספה">
    <div class="muted" style="margin-top:8px">סרטון של 8 שניות. לוקח בדרך כלל 1–3 דקות. דורש מפתח עם חיוב מופעל — המחיר מחויב בגוגל לפי שנייה.</div>
    <button class="btn" id="vGo" style="width:100%;margin-top:12px">🎬 ליצור סרטון</button>
    <div id="vOut" style="margin-top:12px"></div>`, (b) => {
    let mode = 'walk', tk = t0;
    const note = () => { b.querySelector('#vNote').textContent = VEO_TIERS[tk].note; }; note();
    b.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { mode = x.dataset.m; b.querySelectorAll('[data-m]').forEach(y => y.classList.toggle('on', y === x)); });
    b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { tk = x.dataset.t; S.settings.veoTier = tk; save(); b.querySelectorAll('[data-t]').forEach(y => y.classList.toggle('on', y === x)); note(); });
    b.querySelectorAll('[data-v]').forEach(x => x.onclick = async () => { const v = d.videos[+x.dataset.v]; const data = await getImg(v.id); if (data) videoPlayer(b.querySelector('#vOut'), await dataToBlob(data), `${name}-סרטון.mp4`); else toast('הסרטון לא נמצא במכשיר הזה'); });
    b.querySelector('#vGo').onclick = async () => {
      const out = b.querySelector('#vOut'), go = b.querySelector('#vGo');
      if (!confirm(`ליצור סרטון "${VEO_MODES[mode].name.replace(/^\S+\s/, '')}" באיכות ${VEO_TIERS[tk].name}?\nעלות משוערת: כ-$${(VEO_TIERS[tk].price * 8).toFixed(2)}`)) return;
      go.disabled = true; out.innerHTML = `<div class="muted" style="text-align:center"><div class="spinner"></div><span id="vSt">מתחיל…</span></div>`;
      try {
        const { blob, model } = await makeVeoVideo({ before, after, mode, tierKey: tk, extra: b.querySelector('#vExtra').value.trim(), onStatus: s => { const e = out.querySelector('#vSt'); if (e) e.textContent = s; } });
        // שומרים במכשיר (סרטונים לא נשלחים למאגר המשותף — כבדים מדי)
        try { const id = await putImg(await blobToData(blob)); (d.videos = d.videos || []).push({ id, mode, model, created: Date.now() }); save(); } catch {}
        videoPlayer(out, blob, `${name}-סרטון.mp4`);
      } catch (e) { out.innerHTML = `<div class="rule red"><span class="dot red"></span><div>לא הצלחתי ליצור סרטון: ${esc(e.message)}</div></div>${aiLogHtml()}`; }
      go.disabled = false;
    };
  });
}

function beforeAfter(wrap, before, after) {
  wrap.innerHTML = `<div class="ba"><img src="${before}"><div class="after"><img src="${after}"></div><div class="handle"></div>
    <span class="lbl" style="right:8px">אחרי</span><span class="lbl" style="left:8px">לפני</span></div>`;
  const ba = $('.ba', wrap), aft = $('.after', ba), h = $('.handle', ba);
  const set = (pct) => { pct = Math.max(0, Math.min(100, pct)); aft.style.clipPath = `inset(0 0 0 ${100 - pct}%)`; h.style.right = `calc(${pct}% - 1px)`; };
  set(50);
  const move = (x) => { const rc = ba.getBoundingClientRect(); set((rc.right - x) / rc.width * 100); };
  ba.addEventListener('pointerdown', e => { ba.setPointerCapture(e.pointerId); move(e.clientX); });
  ba.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') move(e.clientX); });
}

// =====================================================================
// 📖 ספר דפדוף: מוצר אחד בכל עמוד, דפדוף תלת־ממדי, הגדלה, והוספה לאוסף של פרויקט
function flipbook(list, start = 0, projectId = '') {
  if (!list.length) return toast('אין מוצרים להצגה');
  let i = Math.max(0, Math.min(start, list.length - 1)), busy = false;
  const ov = document.createElement('div'); ov.id = 'fbook';
  ov.innerHTML = `<div class="fb-top"><button class="fb-x" id="fbX">✕</button><span id="fbN"></span><span style="display:flex;gap:8px">${projectId ? '<button class="fb-x" id="fbDone" style="width:auto;padding:0 12px;border-radius:18px;font-size:14px">✓ סיימתי ›</button>' : ''}<button class="fb-x" id="fbRev" title="הפיכת כיוון הדפדוף">⇄</button><button class="fb-x" id="fbTry" title="לנסות אצלי">📸</button><button class="fb-x" id="fbZ">🔍</button></span></div>
    <div class="fb-stage" id="fbStage"></div>
    <div class="fb-bot"><button class="btn sec" id="fbPrev">‹ הקודם</button><button class="btn" id="fbPick"></button><button class="btn sec" id="fbNext">הבא ›</button></div>`;
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  const stage = ov.querySelector('#fbStage');
  const inProjects = (it) => S.projects.filter(p => (p.picks || []).includes(it.id));
  const page = (it) => {
    const d = document.createElement('div'); d.className = 'fb-page';
    d.innerHTML = `<div class="fb-img"><img alt=""></div>
      <div class="fb-info"><div class="fb-cat">${esc(it.cat)}${it.sub ? ' › ' + esc(it.sub) : ''}</div><h3>${esc(it.name)}</h3>${dotsHTML(it, it.id)}
      ${[['🎨', it.color], ['📏', it.dims], ['🏷️', it.supplier], ['#', it.model], ['₪', it.price]].filter(x => x[1]).map(([k, v]) => `<span class="fb-chip">${k} ${esc(v)}</span>`).join('')}
      ${it.note ? `<p>${esc(it.note)}</p>` : ''}${it.angles?.length ? `<div class="muted">🔄 ${it.angles.length + 1} זוויות — גוררים על התמונה</div>` : ''}</div>`;
    d.querySelectorAll('[data-vid]').forEach(dt => dt.onclick = (e) => { e.stopPropagation(); const v = S.catalog.find(x => x.id === dt.dataset.vid); if (!v || v.id === list[i].id) return; list[i] = v; const n = page(v); stage.replaceChild(n, cur); cur = n; refresh(); });
    d.querySelectorAll('.cdots').forEach(c => c.addEventListener('pointerdown', e => e.stopPropagation()));
    (async () => {
      const im = d.querySelector('img'); if (it.th) im.src = it.th;
      const full = await getImg(it.img) || await Sync.fetchImg(it.img); const srcs = [full || it.th, ...(await loadImgs(it.angles || []))].filter(Boolean);
      if (srcs.length > 1) attachSpin(im, srcs); else if (full) im.src = full;
    })();
    return d;
  };
  const refresh = () => {
    const it = list[i]; ov.querySelector('#fbN').textContent = `${i + 1} מתוך ${list.length}`;
    const pr = inProjects(it); const pb = ov.querySelector('#fbPick');
    pb.textContent = projectId ? ((proj(projectId)?.picks || []).includes(it.id) ? '✓ באוסף הפרויקט' : '⭐ הוספה לפרויקט') : (pr.length ? `✓ ב-${pr.length} פרויקטים` : '⭐ הוספה לפרויקט');
    pb.classList.toggle('sec', projectId ? (proj(projectId)?.picks || []).includes(it.id) : !!pr.length);
    ov.querySelector('#fbPrev').disabled = i === 0; ov.querySelector('#fbNext').disabled = i === list.length - 1;
  };
  let cur = page(list[i]); stage.appendChild(cur); refresh();
  // כיוון: בספר בעברית "הבא" = מרימים את הצד השמאלי של הדף ומעבירים ימינה (אפשר להפוך בכפתור ⇄)
  const rev = () => !!S.settings.fbRev;
  const sideNext = () => rev() ? -1 : 1;           // 1 = גרירה ימינה מדפדפת קדימה
  let drag = null;
  const shade = (el, k) => { let sh = el.querySelector('.fb-shade'); if (!sh) { sh = document.createElement('div'); sh.className = 'fb-shade'; el.appendChild(sh); } sh.style.opacity = (0.55 * Math.sin(Math.min(1, k) * Math.PI / 2)).toFixed(3); };
  const setAngle = (el, dirSign, k) => { // dirSign: 1 = הדף עף ימינה, -1 = שמאלה; k: 0..1
    el.style.transition = 'none'; el.style.transformOrigin = dirSign > 0 ? 'right center' : 'left center';
    el.style.transform = `rotateY(${(dirSign > 0 ? 1 : -1) * 170 * k}deg)`; shade(el, k);
  };
  const finish = async (dirSign, k, go) => {
    const el = cur; el.style.transition = 'transform .45s cubic-bezier(.3,.1,.25,1)';
    el.style.transform = `rotateY(${go ? (dirSign > 0 ? 1 : -1) * 170 : 0}deg)`; shade(el, go ? 1 : 0);
    await new Promise(r => setTimeout(r, 460));
    if (go) { el.remove(); const n = stage.querySelector('.fb-page.under'); n.classList.remove('under'); cur = n; refresh(); }
    else { stage.querySelectorAll('.fb-page.under').forEach(x => x.remove()); el.style.transform = ''; el.querySelector('.fb-shade')?.remove(); }
    busy = false;
  };
  const prepUnder = (ni) => { stage.querySelectorAll('.fb-page.under').forEach(x => x.remove()); const n = page(list[ni]); n.classList.add('under'); stage.insertBefore(n, cur); };
  const turn = (step) => { // step: 1 = הבא, -1 = הקודם (מהכפתורים)
    if (busy) return; const ni = i + step; if (ni < 0 || ni >= list.length) return;
    busy = true; prepUnder(ni); i = ni; const dirSign = step * sideNext();
    setAngle(cur, dirSign, 0); requestAnimationFrame(() => finish(dirSign, 1, true));
  };
  // צביטה בשתי אצבעות על הדף = הגדלה (לחיצה כפולה לא מגדילה — כדי לא להפריע לדפדוף)
  const fpts = new Map(); let pinch0 = 0;
  stage.addEventListener('pointerdown', e => { fpts.set(e.pointerId, [e.clientX, e.clientY]); if (fpts.size === 2) { const [a, b] = [...fpts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } }, true);
  stage.addEventListener('pointermove', e => {
    if (!fpts.has(e.pointerId)) return; fpts.set(e.pointerId, [e.clientX, e.clientY]);
    if (fpts.size === 2 && pinch0) { const [a, b] = [...fpts.values()]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) - pinch0 > 40) {
      pinch0 = 0; fpts.clear(); if (drag) { const d = drag; drag = null; if (d.dir) finish(d.dir, d.k, false); }
      const im = cur.querySelector('img'); if (im?.src) zoomView(im.src); } }
  }, true);
  const fup = e => { fpts.delete(e.pointerId); if (fpts.size < 2) pinch0 = 0; };
  stage.addEventListener('pointerup', fup, true); stage.addEventListener('pointercancel', fup, true);
  stage.addEventListener('pointerdown', e => {
    if (busy || !e.isPrimary || fpts.size > 1) return;
    const it = list[i]; if (it.angles?.length && e.target.closest('.fb-img')) return; // על מוצר עם זוויות — הגרירה מסובבת אותו
    drag = { x: e.clientX, dir: 0, ni: null, k: 0 }; stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return; const dx = e.clientX - drag.x;
    if (!drag.dir) { if (Math.abs(dx) < 12) return; const dirSign = dx > 0 ? 1 : -1, step = dirSign * sideNext(), ni = i + step;
      if (ni < 0 || ni >= list.length) { drag = null; return; } drag.dir = dirSign; drag.step = step; drag.ni = ni; busy = true; prepUnder(ni); }
    drag.k = Math.max(0, Math.min(1, (dx * drag.dir) / (stage.clientWidth * 0.9))); setAngle(cur, drag.dir, drag.k);
  });
  const endDrag = () => { if (!drag) return; const d = drag; drag = null; if (!d.dir) return; const go = d.k > 0.3; if (go) i = d.ni; finish(d.dir, d.k, go); };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  ov.querySelector('#fbRev').onclick = () => { S.settings.fbRev = !S.settings.fbRev; save(); toast(S.settings.fbRev ? 'כיוון הדפדוף הופך: גרירה שמאלה = הבא' : 'כיוון רגיל: גרירה ימינה = הבא'); };
  ov.querySelector('#fbNext').onclick = () => turn(1);
  ov.querySelector('#fbPrev').onclick = () => turn(-1);
  ov.querySelector('#fbTry').onclick = () => tryAtHome([list[i].id]);
  ov.querySelector('#fbZ').onclick = () => { const im = cur.querySelector('img'); if (im?.src) zoomView(im.src); };
  ov.querySelector('#fbX').onclick = () => { ov.remove(); document.body.style.overflow = ''; render(); };
  if (ov.querySelector('#fbDone')) ov.querySelector('#fbDone').onclick = () => {
    ov.remove(); document.body.style.overflow = '';
    const p = proj(projectId); go({ projectId, roomId: null, planOpen: false });
    if (p && (p.picks || []).length) setTimeout(() => designWithPicks(p), 250);
  };
  ov.querySelector('#fbPick').onclick = () => {
    const it = list[i];
    const addTo = (p) => { p.picks = p.picks || []; if (p.picks.includes(it.id)) p.picks = p.picks.filter(x => x !== it.id); else p.picks.push(it.id); p.updated = Date.now(); save(); refresh(); toast(p.picks.includes(it.id) ? `נוסף לאוסף של "${p.name}"` : `הוסר מהאוסף של "${p.name}"`); };
    if (projectId) return addTo(proj(projectId));
    if (!S.projects.length) return toast('אין עדיין פרויקטים — יוצרים פרויקט בלשונית "פרויקטים"');
    modal('לאיזה פרויקט להוסיף?', `<div id="pl">${S.projects.map(p => `<div class="card list-item" data-p="${p.id}"><div class="grow"><b>${esc(p.name)}</b><div class="muted">${(p.picks || []).length} מוצרים באוסף</div></div><span>${(p.picks || []).includes(it.id) ? '✓' : '＋'}</span></div>`).join('')}</div>`, (b, close) => {
      b.querySelectorAll('[data-p]').forEach(el => el.onclick = () => { addTo(S.projects.find(p => p.id === el.dataset.p)); close(); });
    });
  };
}

// =====================================================================
// 🎨 גרסאות צבע + קבוצות (אותו מוצר בצבעים שונים) + פירוק סטים לפריטים בודדים
const METALS = {
  gold:      { name: 'זהב',      dot: '#c9a04a', stops: [[52, 34, 8], [184, 138, 52], [255, 236, 170]] },
  champagne: { name: 'שמפניה',   dot: '#d8c49e', stops: [[64, 54, 38], [196, 176, 136], [252, 244, 222]] },
  silver:    { name: 'כסף',      dot: '#c8ccd2', stops: [[34, 36, 40], [164, 168, 175], [252, 252, 254]] },
  rose:      { name: 'רוז גולד', dot: '#d9a08c', stops: [[66, 36, 30], [200, 138, 118], [255, 226, 212]] },
  bronze:    { name: 'ברונזה',   dot: '#8a6236', stops: [[38, 24, 10], [132, 92, 50], [222, 188, 128]] },
  black:     { name: 'שחור מט',  dot: '#2a2a2c', stops: [[8, 8, 9], [42, 42, 45], [128, 128, 132]] }
};
const COLOR_WORDS = ['זהב', 'מוזהב', 'מוזהבים', 'כסוף', 'כסופה', 'כסופים', 'כסף', 'שמפניה', 'רוז', 'גולד', 'ברונזה', 'שחור', 'שחורים'];
function metalOf(it) {
  if (it.metal) return it.metal; const c = (it.color || '') + ' ' + (it.name || '');
  return /רוז/.test(c) ? 'rose' : /שמפניה/.test(c) ? 'champagne' : /זהב|מוזהב|פליז/.test(c) ? 'gold' : /כסף|כסוף|ניקל|כרום/.test(c) ? 'silver' : /ברונזה|נחושת/.test(c) ? 'bronze' : /שחור/.test(c) ? 'black' : '';
}
const grpOf = (it) => it.grp || it.id;
const siblings = (it) => { const g = grpOf(it); return S.catalog.filter(x => !x.deleted && grpOf(x) === g); };
const dotColor = (it) => METALS[metalOf(it)]?.dot || '#bbb';
// מציג מוצר אחד מכל קבוצה (הראשון), בלי לאבד אף מוצר
function collapseGroups(list) { // נציג לכל קבוצה: המוצר המקורי (לא גרסת צבע), במקום של הראשון ברשימה
  const pos = new Map(), rep = new Map();
  list.forEach((x, i) => { const g = grpOf(x); if (!pos.has(g)) pos.set(g, i); const r = rep.get(g); if (!r || (r.variantOf && !x.variantOf)) rep.set(g, x); });
  return [...pos.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => rep.get(g));
}
function dotsHTML(it, cur) { const sib = siblings(it); if (sib.length < 2) return ''; return `<div class="cdots">${sib.map(x => `<span class="cdot${x.id === cur ? ' on' : ''}" data-vid="${x.id}" title="${esc(x.color || METALS[metalOf(x)]?.name || '')}" style="background:${dotColor(x)}"></span>`).join('')}</div>`; }
// צביעה מחדש של גזירה: מפת גוונים לפי בהירות (שומר הברקות וצללים), בלי לגעת בנרות לבנים/זכוכית
async function recolorCut(src, key, baseMetal) {
  const im = await loadImg(src), W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H), p = d.data, st = METALS[key].stops;
  const protectWhite = baseMetal && baseMetal !== 'silver' && baseMetal !== 'black';
  const Ls = []; for (let i = 0; i < p.length; i += 16) if (p[i + 3] > 60) Ls.push((p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11) / 255);
  Ls.sort((a, b) => a - b); const lo = Ls[Math.floor(Ls.length * .02)] || 0, hi = Ls[Math.floor(Ls.length * .98)] || 1;
  const grad = (t) => { const a = t < .5 ? st[0] : st[1], b = t < .5 ? st[1] : st[2], k = t < .5 ? t * 2 : (t - .5) * 2; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue; const r = p[i], g = p[i + 1], b = p[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, L = (r * .3 + g * .59 + b * .11) / 255;
    if (protectWhite && ((sat < 0.12 && L > 0.8) || (sat < 0.4 && L > 0.5))) continue; // נר לבן / זכוכית — נשאר (המתכת הזהובה רוויה יותר)
    const t = Math.max(0, Math.min(1, (L - lo) / Math.max(.05, hi - lo))), [nr, ng, nb] = grad(t);
    p[i] = nr; p[i + 1] = ng; p[i + 2] = nb;
  }
  x.putImageData(d, 0, 0); const u = c.toDataURL('image/webp', 0.9); return u.startsWith('data:image/webp') ? u : c.toDataURL('image/png');
}
async function onWhite(src) { const im = await loadImg(src), pad = Math.round(Math.max(im.width, im.height) * .06), c = document.createElement('canvas'); c.width = im.width + pad * 2; c.height = im.height + pad * 2; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, pad, pad); return c.toDataURL('image/jpeg', 0.9); }
const stripColor = (name) => name.split(/\s+/).filter(w => !COLOR_WORDS.includes(w.replace(/[^֐-׿]/g, ''))).join(' ').replace(/\s+—.*$/, '').trim();
async function makeVariants(base, keys, onStatus) {
  const cut = await itemCutout(base); if (!cut) throw new Error('אין תמונה למוצר');
  const bm = metalOf(base); base.grp = grpOf(base); if (!base.metal && bm) base.metal = bm; base.updated = Date.now(); base.synced = false; Sync.pushItem(base);
  const made = [];
  for (const k of keys) {
    if (siblings(base).some(x => metalOf(x) === k)) continue;
    onStatus && onStatus(`יוצר ${METALS[k].name}…`);
    const vc = await recolorCut(cut, k, bm), img = await onWhite(vc);
    const it = { ...base, id: uid(), grp: base.grp, metal: k, color: METALS[k].name, name: `${stripColor(base.name)} — ${METALS[k].name}`, img: await putImg(img), cut: await putImg(vc), th: await makeThumb(img), angles: [], review: false, ph: await imgHash(img), created: Date.now(), updated: Date.now(), synced: false, variantOf: base.id };
    delete it.cutTried; delete it.cutPending; it.cutPending = true;
    S.catalog.push(it); made.push(it); save(); Sync.pushItem(it, img);
  }
  return made;
}
// ✂️ פירוק סט: כל חלק שקוף נפרד בגזירה = פריט בודד (למשל 3 פמוטים בתמונה אחת)
const PART_CACHE = {};
async function itemParts(it) {
  const key = it.cut || it.img; if (PART_CACHE[key]) return PART_CACHE[key];
  const src = await itemCutout(it); if (!src) return [];
  const im = await loadImg(src), sc = Math.min(1, 360 / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * sc)), h = Math.max(1, Math.round(im.height * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
  const a = x.getImageData(0, 0, w, h).data, lab = new Int32Array(w * h).fill(-1), comps = [];
  for (let k = 0; k < w * h; k++) {
    if (lab[k] >= 0 || a[k * 4 + 3] < 40) continue; const id = comps.length, st = [k]; let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; lab[k] = id;
    while (st.length) { const q = st.pop(), qx = q % w, qy = (q / w) | 0; n++; if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const nk = ny * w + nx; if (lab[nk] < 0 && a[nk * 4 + 3] >= 40) { lab[nk] = id; st.push(nk); } } }
    comps.push({ n, x0, y0, x1, y1 });
  }
  const big = Math.max(0, ...comps.map(c => c.n)); let keep = comps.filter(c => c.n >= big * 0.08);
  // חלק קטן שיושב מעל/בתוך חלק גדול (להבה, ידית) מצורף אליו
  keep = keep.filter(c => !keep.some(o => o !== c && o.n > c.n * 3 && c.x0 >= o.x0 - 4 && c.x1 <= o.x1 + 4 && c.y1 <= o.y1 + 4 && c.y0 >= o.y0 - (o.y1 - o.y0) * .6));
  if (keep.length < 2 || keep.length > 8) return (PART_CACHE[key] = []);
  keep.sort((p, q) => p.x0 - q.x0);
  const parts = keep.map((c, i) => {
    const X0 = Math.max(0, Math.floor(c.x0 / sc) - 4), Y0 = Math.max(0, Math.floor(c.y0 / sc) - 4), X1 = Math.min(im.width, Math.ceil((c.x1 + 1) / sc) + 4), Y1 = Math.min(im.height, Math.ceil((c.y1 + 1) / sc) + 4);
    const o = document.createElement('canvas'); o.width = X1 - X0; o.height = Y1 - Y0; const ox = o.getContext('2d'); ox.drawImage(im, -X0, -Y0);
    // מנקים שאריות של חלקים שכנים שנכנסו למלבן
    const od = ox.getImageData(0, 0, o.width, o.height), op = od.data;
    for (let yy = 0; yy < o.height; yy++) for (let xx = 0; xx < o.width; xx++) { const sx = Math.min(w - 1, Math.floor((xx + X0) * sc)), sy = Math.min(h - 1, Math.floor((yy + Y0) * sc)), L = lab[sy * w + sx]; if (L >= 0 && comps[L] !== c && keep.includes(comps[L])) op[(yy * o.width + xx) * 4 + 3] = 0; }
    ox.putImageData(od, 0, 0);
    return { i, url: o.toDataURL('image/png'), cx: (X0 + X1) / 2 / im.width, cy: (Y0 + Y1) / 2 / im.height, w: (X1 - X0) / im.width, h: (Y1 - Y0) / im.height };
  });
  return (PART_CACHE[key] = parts);
}
// חלון בחירה: כל הסט או רק חלק מהפריטים
function choosePartsDialog(it, parts) {
  return new Promise(res => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    modal('✂️ כל הסט או רק חלק?', `<div class="muted">בתמונה יש ${parts.length} פריטים. בוחרים אילו להוסיף — כל פריט יהיה נפרד, ואפשר להזיז כל אחד לבד.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:10px 0">${parts.map(p => `<label style="width:88px;text-align:center;cursor:pointer"><div style="height:110px;display:flex;align-items:flex-end;justify-content:center;background:#f6f2ec;border-radius:10px;padding:4px"><img src="${p.url}" style="max-width:100%;max-height:100%"></div><input type="checkbox" data-pi="${p.i}" checked> פריט ${p.i + 1}</label>`).join('')}</div>
      <div class="grid2"><button class="btn" id="cpSel">➕ הוספת המסומנים</button><button class="btn sec" id="cpAll">כל הסט כתמונה אחת</button></div>`, (b, close) => {
      $('#cpAll', b).onclick = () => { fin(null); close(); };
      $('#cpSel', b).onclick = () => { const sel = [...b.querySelectorAll('[data-pi]:checked')].map(x => +x.dataset.pi); if (!sel.length) return toast('מסמנים לפחות פריט אחד'); fin(sel); close(); };
      const ob = new MutationObserver(() => { if (!b.isConnected) { ob.disconnect(); fin(undefined); } }); ob.observe(document.body, { childList: true, subtree: true });
    });
  });
}
function variantsDialog(it, after) {
  const have = new Set(siblings(it).map(metalOf));
  modal('🎨 גרסאות צבע', `<div class="muted">יוצרים לאותו מוצר גרסאות בגימורים אחרים. כולן יופיעו בכרטיס אחד, ומחליפים ביניהן בנקודות הצבע.</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0">${Object.entries(METALS).map(([k, m]) => `<label class="chip" style="gap:6px;${have.has(k) ? 'opacity:.45' : ''}"><input type="checkbox" data-mk="${k}" ${have.has(k) ? 'disabled checked' : ['gold', 'champagne', 'silver'].includes(k) ? 'checked' : ''}><span class="cdot" style="background:${m.dot}"></span>${m.name}${have.has(k) ? ' ✓' : ''}</label>`).join('')}</div>
    <div class="muted">מתאים למוצרי מתכת (פמוטים, ידיות, מנורות, ברזים). נרות וזכוכית נשארים כמו שהם.</div>
    <button class="btn full" id="vGo" style="margin-top:10px">🎨 ליצור</button><div id="vSt" class="muted" style="text-align:center;margin-top:6px"></div>`, (b, close) => {
    $('#vGo', b).onclick = async () => {
      const keys = [...b.querySelectorAll('[data-mk]:checked:not(:disabled)')].map(x => x.dataset.mk); if (!keys.length) return toast('בוחרים צבע');
      $('#vGo', b).disabled = true;
      try { const made = await makeVariants(it, keys, m => { const e = $('#vSt', b); if (e) e.textContent = m; }); close(); toast(`נוצרו ${made.length} גרסאות צבע`); after && after(made); }
      catch (e) { $('#vSt', b).textContent = e.message; $('#vGo', b).disabled = false; }
    };
  });
}

// =====================================================================
// 📸 לנסות אצלי — מצלמים פינה בבית (או מצלמה חיה) ומניחים עליה מוצרים מהקטלוג
// גרירה = הזזה · שתי אצבעות = הגדלה וסיבוב · הידית ↘ = הגדלה וסיבוב באצבע אחת
const CUT_CACHE = {};
// ✂️ גזירה נקייה אוטומטית עם AI: ה-AI מזהה את המוצר (מסכת סגמנטציה), והרקע נעלם — גם כשהמוצר לבן/כסוף
async function aiCutout(it) {
  const src = (await getImg(it.img)) || (await Sync.fetchImg(it.img)); if (!src) throw new Error('אין תמונה');
  const im = await loadImg(src), sc = Math.min(1, 1024 / Math.max(im.width, im.height)), W = Math.round(im.width * sc), H = Math.round(im.height * sc);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
  const send = c.toDataURL('image/jpeg', 0.9).split(',')[1];
  const prompt = `Give the segmentation masks for the product(s) shown in this catalog photo (${it.name || 'decor item'}). Include every physical part of the product: candles, glass, stems, bases, cables. Exclude the background, floor and cast shadows.
Output a JSON list where each entry has "box_2d" ([y0,x0,y1,x1] normalized 0-1000), "mask" (base64 PNG probability map of the box area) and "label".`;
  const txt = await geminiText([{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: send } }], true, null, { timeout: 90000 });
  let arr; try { arr = JSON.parse(txt.replace(/^```json|```$/g, '').trim()); } catch { throw new Error('תשובה לא תקינה'); }
  if (!Array.isArray(arr)) arr = arr.masks || arr.items || [arr];
  const m = document.createElement('canvas'); m.width = W; m.height = H; const mx = m.getContext('2d'); mx.globalCompositeOperation = 'lighten'; let n = 0;
  for (const e of arr) {
    if (!e?.mask || !e.box_2d) continue; const [y0, x0, y1, x1] = e.box_2d.map(v => v / 1000);
    const mi = await loadImg(e.mask.startsWith('data:') ? e.mask : 'data:image/png;base64,' + e.mask).catch(() => null); if (!mi) continue;
    mx.drawImage(mi, x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H); n++;
  }
  if (!n) throw new Error('לא התקבלה מסכה');
  const md = mx.getImageData(0, 0, W, H).data, d = x.getImageData(0, 0, W, H), p = d.data;
  let cover = 0;
  for (let k = 0; k < W * H; k++) {
    const i = k * 4, mk = md[i] / 255; let a = mk < 0.35 ? 0 : mk > 0.65 ? 1 : (mk - 0.35) / 0.3;
    if (a > 0 && a < 1) { const mn = Math.min(p[i], p[i + 1], p[i + 2]); a = Math.max(a * 0.6, Math.min(1, (255 - mn) / 255 * 1.6)); for (let q = 0; q < 3; q++) p[i + q] = Math.max(0, Math.min(255, (p[i + q] - (1 - a) * 255) / Math.max(a, .05))); }
    p[i + 3] = Math.round(a * 255); if (a > .5) cover++;
  }
  if (cover < W * H * 0.01) throw new Error('המסכה ריקה');
  x.putImageData(d, 0, 0);
  // חיתוך לגבולות
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0; for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (p[(yy * W + xx) * 4 + 3] > 20) { if (xx < bx0) bx0 = xx; if (xx > bx1) bx1 = xx; if (yy < by0) by0 = yy; if (yy > by1) by1 = yy; }
  const o = document.createElement('canvas'); o.width = bx1 - bx0 + 1; o.height = by1 - by0 + 1; o.getContext('2d').drawImage(c, -bx0, -by0);
  let url = o.toDataURL('image/webp', 0.88); if (!url.startsWith('data:image/webp')) url = o.toDataURL('image/png');
  return url;
}
// תור רקע: כל מוצר בלי גזירה מקבל גזירה נקייה (אחד אחרי השני, בלי להפריע)
let cutBusy = false;
async function ensureCuts() {
  if (cutBusy || !(S.settings.apiKey || '').trim() || S.settings.autoCut === false) return;
  if (Sync.ok() && Date.now() - (S.sync.last || 0) > 6e5) return; // קודם מסנכרנים — אולי כבר יש גזירה במאגר
  cutBusy = true;
  try {
    for (const it of S.catalog.filter(x => !x.deleted && x.img && !x.cut && !(x.cutTried > Date.now() - 864e5))) {
      try { const url = await aiCutout(it); it.cut = await putImg(url); it.cutPending = true; it.updated = Date.now(); it.synced = false; save(); Sync.pushItem(it); }
      catch (e) { it.cutTried = Date.now(); save(); console.warn('cut', it.name, e.message); if (/מפתח|key|billing/i.test(e.message)) break; }
    }
  } finally { cutBusy = false; }
}
// גזירה מוכנה מראש (שקופה, איכותית) אם יש למוצר — אחרת גזירה מהירה בטלפון
async function itemCutout(it) {
  if (it.cut) { const c = (await getImg(it.cut)) || (await Sync.fetchImg(it.cut)); if (c) return c; }
  const src = (await getImg(it.img)) || (await Sync.fetchImg(it.img)) || it.th; if (!src) return null;
  return cutoutWhite(src, it.img);
}
async function cutoutWhite(src, key) { // מסיר רקע לבן מהקצוות פנימה (המוצר עצמו נשמר גם אם יש בו לבן)
  if (key && CUT_CACHE[key]) return CUT_CACHE[key];
  const im = await loadImg(src), sc = Math.min(1, 900 / Math.max(im.width, im.height));
  const W = Math.round(im.width * sc), H = Math.round(im.height * sc), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H); const d = x.getImageData(0, 0, W, H), p = d.data;
  const bgish = (i) => { const r = p[i], g = p[i + 1], b = p[i + 2]; return Math.min(r, g, b) > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 22; };
  const seen = new Uint8Array(W * H), st = [];
  for (let i = 0; i < W; i++) st.push(i, (H - 1) * W + i); for (let j = 0; j < H; j++) st.push(j * W, j * W + W - 1);
  while (st.length) { const k = st.pop(); if (seen[k]) continue; seen[k] = 1; if (!bgish(k * 4)) { seen[k] = 2; continue; } p[k * 4 + 3] = 0; const xx = k % W, yy = (k / W) | 0;
    if (xx > 0) st.push(k - 1); if (xx < W - 1) st.push(k + 1); if (yy > 0) st.push(k - W); if (yy < H - 1) st.push(k + W); }
  for (let k = 0; k < W * H; k++) if (seen[k] === 2) { // קצה: מפרידים את הלבן מהצבע (בלי "הילה" לבנה)
    const i = k * 4, mn = Math.min(p[i], p[i + 1], p[i + 2]), a = Math.min(1, Math.max(0.15, (255 - mn) / 255 * 1.6));
    if (a < 1) { for (let c = 0; c < 3; c++) p[i + c] = Math.max(0, Math.min(255, (p[i + c] - (1 - a) * 255) / a)); p[i + 3] = Math.round(255 * a); } }
  x.putImageData(d, 0, 0);
  // חיתוך לגבולות המוצר
  let x0 = W, y0 = H, x1 = 0, y1 = 0; for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (p[(yy * W + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  if (x1 <= x0) return src;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, -x0, -y0);
  const url = o.toDataURL('image/png'); if (key) CUT_CACHE[key] = url; return url;
}
function tryAtHome(startIds = []) {
  const ov = document.createElement('div'); ov.id = 'tryv';
  ov.innerHTML = `<style>
    #tryv{position:fixed;inset:0;z-index:210;background:#14110f;display:flex;flex-direction:column;color:#fff;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
    #tryv .tb{display:flex;gap:6px;padding:8px;flex-wrap:wrap;align-items:center}
    #tryv .tb .btn{padding:7px 10px;font-size:13px}
    #tryv .main{flex:1;display:flex;min-height:0}
    #tryv .stage{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;touch-action:none}
    #tryv .wrap{position:relative;touch-action:none}
    #tryv .wrap>img.bg,#tryv .wrap>video{display:block;width:100%;height:100%;object-fit:fill;user-select:none;-webkit-user-drag:none}
    #tryv .rail{width:84px;background:#221c18;overflow-y:auto;padding:6px 4px;display:flex;flex-direction:column;gap:8px;border-inline-start:1px solid #3a302a}
    #tryv .rail .ri{width:74px;height:74px;border-radius:50%;background:#fff;overflow:hidden;flex:none;border:3px solid transparent;position:relative}
    #tryv .rail .ri img{width:100%;height:100%;object-fit:contain}
    #tryv .rail .ri.on{border-color:#e2a26f}
    #tryv .rail .rn{font-size:10px;line-height:1.15;text-align:center;color:#d9cfc6;margin-top:-4px;max-height:2.3em;overflow:hidden}
    #tryv .rail select{width:100%;font-size:11px;padding:4px;border-radius:8px}
    #tryv .stk{position:absolute;left:0;top:0;transform-origin:center center;touch-action:none;user-select:none}
    #tryv .stk img{display:block;width:100%;pointer-events:none;-webkit-user-drag:none}
    #tryv .stk.sel{outline:2px dashed #e2a26f;outline-offset:4px}
    #tryv .stk .hd{position:absolute;width:30px;height:30px;border-radius:50%;background:#e2a26f;color:#fff;display:none;align-items:center;justify-content:center;font-size:16px;bottom:-22px;left:-22px;box-shadow:0 1px 4px #0008}
    #tryv .stk.sel .hd{display:flex}
    #tryv .start{display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;padding:20px;text-align:center}
    #tryv .sbar{display:none;gap:6px;padding:6px 8px;flex-wrap:wrap;justify-content:center;background:#221c18}
    #tryv input[type=range]{width:110px}
  </style>
  <div class="tb"><button class="btn sm" id="tX">✕</button><b style="flex:1">📸 לנסות אצלי</b>
    <button class="btn sec sm" id="tUndo" title="פעולה אחורה" disabled>↶</button><button class="btn sec sm" id="tRedo" title="פעולה קדימה" disabled>↷</button><button class="btn sec sm" id="tNew">🖼️ תמונה אחרת</button><button class="btn sec sm" id="tSave">💾 שמירה</button><button class="btn sm" id="tAI">✨ ריאליסטי</button></div>
  <div class="main"><div class="stage" id="tStage"><div class="start" id="tStart">
      <div style="font-size:44px">🛋️📸</div><div style="max-width:300px;color:#ddd">מצלמים את השולחן, הפינה או המדף — ואז בוחרים מוצרים מהסרגל בצד ומניחים אותם על התמונה.</div>
      <button class="btn" id="tCam">📷 מצלמה חיה</button><button class="btn sec" id="tShot">📸 לצלם תמונה</button><button class="btn sec" id="tGal">🖼️ תמונה מהגלריה</button></div></div>
    <div class="rail" id="tRail"></div></div>
  <div class="sbar" id="tSbar"><div id="tColors" style="width:100%;display:none;justify-content:center;gap:8px;align-items:center"></div><button class="btn sec sm" data-s="flip">↔️ היפוך</button><button class="btn sec sm" data-s="front">⬆️ קדימה</button><button class="btn sec sm" data-s="dup">⧉ עוד אחד</button>
    <label style="display:flex;align-items:center;gap:4px;font-size:12px">☀️<input type="range" id="tLight" min="55" max="135" value="100"></label>
    <label style="display:flex;align-items:center;gap:4px;font-size:12px">🌑<input type="range" id="tShadow" min="0" max="100" value="55"></label>
    <button class="btn danger sm" data-s="del" style="padding:7px 12px">🗑️ הסרה</button></div>`;
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  const stage = ov.querySelector('#tStage'), rail = ov.querySelector('#tRail'), sbar = ov.querySelector('#tSbar');
  let wrap = null, bgEl = null, stream = null, natW = 0, natH = 0, sel = null; const stks = [];
  const close = () => { stream?.getTracks().forEach(t => t.stop()); ov.remove(); document.body.style.overflow = ''; };
  ov.querySelector('#tX').onclick = close;
  // ---- רקע ----
  function layout() { // מתאים את המסגרת ליחס של התמונה ולגודל הבמה
    if (!wrap || !natW) return; const sw = stage.clientWidth, sh = stage.clientHeight, k = Math.min(sw / natW, sh / natH);
    const w = natW * k, h = natH * k, ow = parseFloat(wrap.style.width) || w;
    wrap.style.width = w + 'px'; wrap.style.height = h + 'px'; stks.forEach(t => place(t));
  }
  function setupWrap(el) {
    stage.innerHTML = ''; wrap = document.createElement('div'); wrap.className = 'wrap'; wrap.appendChild(el); stage.appendChild(wrap); bgEl = el;
    stks.forEach(t => wrap.appendChild(t.el)); layout();
    wrap.addEventListener('pointerdown', e => { if (e.target === bgEl || e.target === wrap) selectStk(null); });
  }
  async function useImage(src) {
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    const im = await loadImg(src); natW = im.width; natH = im.height; const el = document.createElement('img'); el.className = 'bg'; el.src = src; setupWrap(el);
    ov.querySelector('#tNew').textContent = '🖼️ תמונה אחרת';
  }
  async function useCam() {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
    catch { toast('אין גישה למצלמה — אפשר לצלם תמונה במקום'); return; }
    const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.autoplay = true; v.srcObject = stream;
    await new Promise(r => v.onloadedmetadata = r); await v.play().catch(() => {}); natW = v.videoWidth; natH = v.videoHeight; setupWrap(v);
    ov.querySelector('#tNew').textContent = '⏸ הקפאה';
  }
  const frameData = () => { const c = document.createElement('canvas'); c.width = natW; c.height = natH; c.getContext('2d').drawImage(bgEl, 0, 0, natW, natH); return c.toDataURL('image/jpeg', 0.92); };
  ov.querySelector('#tCam').onclick = useCam;
  ov.querySelector('#tShot').onclick = async () => { const f = await pickFiles(false, true); if (f[0]) useImage(await compressImage(f[0], 2000, 0.9)); };
  ov.querySelector('#tGal').onclick = async () => { const f = await pickFiles(false); if (f[0]) useImage(await compressImage(f[0], 2000, 0.9)); };
  ov.querySelector('#tNew').onclick = async () => {
    if (stream) { const d = frameData(); await useImage(d); toast('התמונה הוקפאה — עכשיו ממקמים בנחת'); return; }
    const r = await pickPhoto(false); if (r[0]) useImage(await compressImage(r[0], 2000, 0.9));
  };
  // ---- מדבקות (מוצרים על התמונה) ----
  function place(t) {
    const W = wrap.clientWidth, H = wrap.clientHeight, w = t.w * W;
    t.el.style.width = w + 'px';
    t.el.style.transform = `translate(${t.x * W - w / 2}px, ${t.y * H - (t.el.offsetHeight || w) / 2}px) rotate(${t.rot}deg) scaleX(${t.flip ? -1 : 1})`;
    const sh = t.shadow / 100;
    t.el.querySelector('img').style.filter = `brightness(${t.light / 100}) drop-shadow(${3 * sh}px ${10 * sh}px ${8 * sh + 2}px rgba(0,0,0,${0.15 + sh * 0.45}))`;
  }
  function selectStk(t) {
    sel = t; stks.forEach(x => x.el.classList.toggle('sel', x === t)); sbar.style.display = t ? 'flex' : 'none';
    if (t) { ov.querySelector('#tLight').value = t.light; ov.querySelector('#tShadow').value = t.shadow; }
    const tc = ov.querySelector('#tColors'), sib = t ? siblings(t.it) : [];
    if (t && sib.length > 1) {
      tc.style.display = 'flex'; tc.innerHTML = '<span style="font-size:12px">🎨 צבע:</span>' + sib.map(x => `<span class="cdot${x.id === t.id ? ' on' : ''}" data-cv="${x.id}" title="${esc(x.color || '')}" style="background:${dotColor(x)};width:26px;height:26px"></span>`).join('');
      tc.querySelectorAll('[data-cv]').forEach(dt => dt.onclick = async () => {
        const v = S.catalog.find(x => x.id === dt.dataset.cv); if (!v || v.id === t.id) return;
        const idx = stks.indexOf(t), st = { part: t.part ?? null, x: t.x, y: t.y, w: t.w, rot: t.rot, flip: t.flip, light: t.light, shadow: t.shadow };
        const n = await mkStk(v, st); if (!n) return; stks.splice(stks.indexOf(n), 1); stks.splice(idx, 1, n); t.el.replaceWith(n.el); selectStk(n); record();
      });
    } else if (tc) tc.style.display = 'none';
    rail.querySelectorAll('.ri').forEach(r => r.classList.toggle('on', stks.some(s => s.id === r.dataset.id)));
  }
  // ↶ ↷ היסטוריית פעולות — ללא הגבלה
  const cutSrc = {}, HIST = [], hb = () => { ov.querySelector('#tUndo').disabled = hi <= 0; ov.querySelector('#tRedo').disabled = hi >= HIST.length - 1; };
  let hi = -1;
  const snapS = () => JSON.stringify(stks.map(t => ({ id: t.id, part: t.part ?? null, x: t.x, y: t.y, w: t.w, rot: t.rot, flip: t.flip, light: t.light, shadow: t.shadow })));
  function record() { const sn = snapS(); if (HIST[hi] === sn) return; HIST.length = hi + 1; HIST.push(sn); hi = HIST.length - 1; hb(); }
  async function mkStk(it, state) {
    const ck = it.id + '#' + (state.part ?? ''); let cut = cutSrc[ck];
    if (!cut) { if (state.part != null) { const ps = await itemParts(it); cut = ps[state.part]?.url; } else cut = await itemCutout(it); cutSrc[ck] = cut; }
    if (!cut) return null;
    const el = document.createElement('div'); el.className = 'stk'; el.innerHTML = `<img src="${cut}"><div class="hd">↘</div>`;
    const t = { id: it.id, it, el, x: .5, y: .55, w: .28, rot: 0, flip: false, light: 100, shadow: 55, ...state, el, it };
    wrap.appendChild(el); stks.push(t); await new Promise(r => { const i = el.querySelector('img'); i.complete ? r() : i.onload = r; }); place(t); bindStk(t); return t;
  }
  async function restore(sn) {
    stks.splice(0).forEach(t => t.el.remove()); selectStk(null);
    for (const st of JSON.parse(sn)) { const it = S.catalog.find(x => x.id === st.id); if (it) await mkStk(it, st); }
    selectStk(null); hb();
  }
  ov.querySelector('#tUndo').onclick = () => { if (hi > 0) { hi--; restore(HIST[hi]); } };
  ov.querySelector('#tRedo').onclick = () => { if (hi < HIST.length - 1) { hi++; restore(HIST[hi]); } };
  async function addStk(it, from) {
    if (!wrap) { toast('קודם מצלמים או בוחרים תמונה של המקום'); return; }
    if (hi < 0) record(); // מצב התחלתי (ריק)
    if (!from) { // סט של כמה פריטים בתמונה אחת → בוחרים הכל או חלק, וכל פריט נפרד
      const parts = await itemParts(it);
      if (parts.length >= 2) {
        const ch = await choosePartsDialog(it, parts); if (ch === undefined) return;
        if (ch) { const W0 = 0.42; let last = null; for (const pi of ch) { const p = parts[pi]; last = await mkStk(it, { part: pi, x: .5 + (p.cx - .5) * W0, y: .55 + (p.cy - .5) * W0 * 0.8, w: p.w * W0 }); } if (last) selectStk(last); record(); return; }
      }
    }
    const t = await mkStk(it, from ? { part: from.part ?? null, x: Math.min(.9, from.x + .06), y: from.y, w: from.w, rot: from.rot, flip: from.flip, light: from.light, shadow: from.shadow } : {});
    if (!t) return toast('אין תמונה למוצר הזה');
    selectStk(t); record();
  }
  function bindStk(t) {
    const pts = new Map(); let g = null;
    let changedG = false;
    const st = () => { const v = [...pts.values()]; if (v.length >= 2) { const [a, b] = v; g = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), w: t.w, rot: t.rot }; } else if (v.length === 1) { const [a] = v; g = { x: a.x, y: a.y, tx: t.x, ty: t.y }; } else g = null; };
    t.el.addEventListener('pointerdown', e => {
      e.stopPropagation(); t.el.setPointerCapture(e.pointerId); selectStk(t);
      if (e.target.classList.contains('hd')) { const r = t.el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        g = { handle: true, cx, cy, d: Math.hypot(e.clientX - cx, e.clientY - cy), ang: Math.atan2(e.clientY - cy, e.clientX - cx), w: t.w, rot: t.rot }; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); st();
    });
    t.el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !g) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const W = wrap.clientWidth, H = wrap.clientHeight;
      if (g.handle) { const d = Math.hypot(e.clientX - g.cx, e.clientY - g.cy), a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx); t.w = Math.max(.03, Math.min(1.5, g.w * d / g.d)); t.rot = g.rot + (a - g.ang) * 180 / Math.PI; }
      else if (g.pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; t.w = Math.max(.03, Math.min(1.5, g.w * Math.hypot(a.x - b.x, a.y - b.y) / g.d)); t.rot = g.rot + (Math.atan2(b.y - a.y, b.x - a.x) - g.ang) * 180 / Math.PI; }
      else if (!g.pinch) { t.x = g.tx + (e.clientX - g.x) / W; t.y = g.ty + (e.clientY - g.y) / H; }
      const near = Math.round(t.rot / 90) * 90; if (Math.abs(t.rot - near) < 3) t.rot = near; place(t); changedG = true;
    });
    const up = e => { pts.delete(e.pointerId); if (g?.handle) g = null; else st(); if (!pts.size && changedG) { changedG = false; record(); } };
    t.el.addEventListener('pointerup', up); t.el.addEventListener('pointercancel', up);
  }
  sbar.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    if (!sel) return; const a = b.dataset.s;
    if (a === 'flip') { sel.flip = !sel.flip; place(sel); record(); }
    if (a === 'front') { wrap.appendChild(sel.el); stks.push(stks.splice(stks.indexOf(sel), 1)[0]); record(); }
    if (a === 'dup') addStk(sel.it, sel);
    if (a === 'del') { sel.el.remove(); stks.splice(stks.indexOf(sel), 1); selectStk(null); record(); }
  });
  ov.querySelector('#tLight').oninput = e => { if (sel) { sel.light = +e.target.value; place(sel); } };
  ov.querySelector('#tShadow').oninput = e => { if (sel) { sel.shadow = +e.target.value; place(sel); } };
  ov.querySelector('#tLight').onchange = ov.querySelector('#tShadow').onchange = () => record();
  // ---- סרגל המוצרים ----
  const all = S.catalog.filter(x => !x.deleted && x.img);
  const projPicks = S.projects.flatMap(p => p.picks || []);
  const groups = [...new Set(all.map(x => x.sub || x.cat))];
  function drawRail(filter) {
    const list = collapseGroups(filter === '__mine' ? all.filter(x => startIds.includes(x.id) || projPicks.includes(x.id)) : filter ? all.filter(x => (x.sub || x.cat) === filter) : all);
    rail.innerHTML = `<select id="tF"><option value="">הכל (${all.length})</option>${projPicks.length || startIds.length ? `<option value="__mine" ${filter === '__mine' ? 'selected' : ''}>⭐ מהפרויקטים</option>` : ''}${groups.map(g => `<option ${g === filter ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` +
      list.map(it => `<div class="ri" data-id="${it.id}"><img src="${it.th || ''}"></div><div class="rn">${esc(it.name)}</div>`).join('') || '<div class="rn">אין מוצרים</div>';
    rail.querySelector('#tF').onchange = e => drawRail(e.target.value);
    rail.querySelectorAll('.ri').forEach(r => r.onclick = () => addStk(all.find(x => x.id === r.dataset.id)));
    selectStk(sel);
  }
  drawRail(startIds.length || projPicks.length ? '__mine' : '');
  addEventListener('resize', layout);
  // ---- שמירה / שיתוף / AI ----
  async function compose() {
    if (!wrap) return null; const c = document.createElement('canvas'); c.width = natW; c.height = natH; const x = c.getContext('2d');
    x.drawImage(bgEl, 0, 0, natW, natH); const k = natW / wrap.clientWidth;
    for (const t of stks) {
      const im = t.el.querySelector('img'), w = t.w * natW, h = w * im.naturalHeight / im.naturalWidth, sh = t.shadow / 100;
      x.save(); x.translate(t.x * natW, t.y * natH); x.rotate(t.rot * Math.PI / 180); if (t.flip) x.scale(-1, 1);
      x.shadowColor = `rgba(0,0,0,${0.15 + sh * 0.45})`; x.shadowBlur = (8 * sh + 2) * k; x.shadowOffsetX = 3 * sh * k; x.shadowOffsetY = 10 * sh * k;
      x.filter = `brightness(${t.light / 100})`; x.drawImage(im, -w / 2, -h / 2, w, h); x.restore();
    }
    return c.toDataURL('image/jpeg', 0.92);
  }
  async function shareData(d, name) {
    const blob = await (await fetch(d)).blob(), file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'איך זה ייראה אצלי' }); return; } catch {} }
    const a = document.createElement('a'); a.href = d; a.download = name; a.click(); toast('נשמר בהורדות');
  }
  ov.querySelector('#tSave').onclick = async () => { if (!stks.length) return toast('קודם מוסיפים מוצר מהסרגל'); selectStk(null); shareData(await compose(), 'לנסות-אצלי.jpg'); };
  ov.querySelector('#tAI').onclick = async () => {
    if (!stks.length) return toast('קודם מוסיפים מוצר מהסרגל');
    if (!S.settings.apiKey) return toast('צריך מפתח AI בהגדרות');
    const comp = await compose(); const refs = [];
    for (const t of stks) if (!refs.some(r => r.item.id === t.it.id)) refs.push({ item: t.it, img: (await getImg(t.it.img)) || t.it.th });
    modal('✨ שילוב ריאליסטי עם AI', `<div class="muted">ה-AI ישאיר את המוצרים בדיוק במקום ובגודל שקבעת, ורק יתאים תאורה, צללים, השתקפויות ופרספקטיבה כדי שזה ייראה אמיתי. (הדמיה אחת בתשלום — ${TIERS[tier()].price})</div><div id="aiO" style="margin-top:10px"><div style="text-align:center"><div class="spinner"></div>יוצר…</div></div>`, async (b) => {
      const o = b.querySelector('#aiO');
      try {
        const prompt = 'Photo-realistic compositing task. The first image is a real photo of a room where product cut-outs were placed by hand. Make the placed products look like they truly stand in this room: match the scene lighting direction and color temperature, add correct contact shadows and soft ambient occlusion where they touch the surface, add subtle reflections on glossy surfaces, fix perspective slightly so they sit on the surface naturally. Do NOT move, resize, add or remove anything. Keep each product\'s exact design, shape, color and material identical to its reference image. Keep the rest of the photo exactly the same.';
        const res = await aiEdit(comp, refs, prompt);
        o.innerHTML = ''; const wrapBA = document.createElement('div'); o.appendChild(wrapBA); beforeAfter(wrapBA, comp, res);
        const bt = document.createElement('button'); bt.className = 'btn full'; bt.style.marginTop = '10px'; bt.textContent = '📤 שיתוף / שמירה'; bt.onclick = () => shareData(res, 'לנסות-אצלי-AI.jpg'); o.appendChild(bt);
      } catch (e) { o.innerHTML = `<div class="rule red"><span class="dot red"></span><div>${esc(e.message)}</div></div>`; }
    });
  };
}
// 🔍 הגדלה: צביטה / גלגלת / לחיצה כפולה, וגרירה
function zoomView(src) {
  const z = document.createElement('div'); z.id = 'zoomv';
  z.innerHTML = `<img src="${src}"><button class="fb-x" style="position:absolute;top:14px;left:14px">✕</button><div class="muted" style="position:absolute;bottom:18px;width:100%;text-align:center;color:#ddd">צובטים להגדלה · גוררים להזזה</div>`;
  document.body.appendChild(z);
  const im = z.querySelector('img'); let sc = 1, tx = 0, ty = 0; const pts = new Map(); let d0 = 0, s0 = 1, last = null;
  const ap = () => im.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`;
  z.querySelector('button').onclick = () => z.remove();
  z.onwheel = (e) => { e.preventDefault(); sc = Math.min(6, Math.max(1, sc * (e.deltaY < 0 ? 1.15 : 0.87))); ap(); };
  im.onpointerdown = (e) => { im.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); s0 = sc; } last = [e.clientX, e.clientY]; };
  im.onpointermove = (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; sc = Math.min(6, Math.max(1, s0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / d0)); }
    else if (sc > 1 && last) { tx += e.clientX - last[0]; ty += e.clientY - last[1]; }
    last = [e.clientX, e.clientY]; ap();
  };
  im.onpointerup = im.onpointercancel = (e) => { pts.delete(e.pointerId); last = null; };
}

function viewImage(src) {
  modal('תצוגה', `<img src="${src}" style="width:100%;border-radius:12px">
    <div style="height:10px"></div><a class="btn sec full" href="${src}" download="meatzev-chacham.jpg" style="display:block;text-align:center;text-decoration:none">⬇️ שמירת התמונה</a>`);
}

// ---------- סטודיו העיצוב ----------
function studio(p, r, fromDesign) {
  const picks = (p.picks || []).filter(id => S.catalog.some(x => x.id === id));
  const sel = { base: fromDesign ? fromDesign.result : r.photos[0], style: fromDesign?.style || '', items: new Set(fromDesign?.items || picks), keep: true, extras: [] };
  const roomNotes = [r.notes, ...(r.elements || []).map(e => e.title + ': ' + e.text)].filter(x => x && x.trim()).join('\n');
  const bases = [...r.photos.map(id => ({ id, label: 'מקור' })), ...r.designs.map(d => ({ id: d.result, label: 'הדמיה' }))];
  modal('✨ עיצוב חדש', `
    <label>1. על איזו תמונה מעצבים?</label>
    <div class="thumbs" id="bases">${bases.map(b => `<div class="t ${b.id === sel.base ? 'sel' : ''}" data-id="${b.id}"><img><span class="badge" style="position:absolute;bottom:4px;right:4px">${b.label}</span></div>`).join('')}</div>
    <label>2. סגנון (לא חובה)</label>
    <div class="chips" id="styles">${R().styles.map(s => `<span class="chip ${s === sel.style ? 'on' : ''}">${esc(s)}</span>`).join('')}</div>
    <label>3. מוצרים מהקטלוג (המערכת תשתמש בדיוק בהם)</label>
    ${picks.length ? `<div class="rule green" style="margin-bottom:8px"><span class="dot green"></span><div>🧺 ${picks.length} מוצרים מאוסף הפרויקט כבר נבחרו. אפשר לבטל או להוסיף.</div></div>` : ''}
    ${S.catalog.length ? `<div class="chips" id="icats" style="margin-bottom:8px">${R().catCats.filter(c => S.catalog.some(x => x.cat === c)).map((c, i) => `<span class="chip ${i === 0 ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</div>
      <div class="thumbs" id="items"></div><div class="muted" id="selCount" style="margin-top:6px"></div>` : '<div class="muted">הקטלוג ריק. אפשר להוסיף מוצרים בלשונית "קטלוג".</div>'}
    <label>4. אלמנטים מצולמים (ריצוף, ספה, וילון… — מתמונה שצילמת או מהגלריה)</label>
    <div id="extras" class="thumbs"></div>
    <button class="btn sec full" id="addEx" style="margin-top:6px">➕ הוספת אלמנט עם תמונה</button>
    <div class="muted" style="margin-top:4px">ה-AI מתאר כל אלמנט בדיוק (חומר, צבע, דוגמה, גודל) ומכניס אותו להנחיה.</div>
    ${roomNotes ? `<label style="display:flex;gap:8px;align-items:center;color:var(--ink);margin-top:10px"><input type="checkbox" id="useNotes" checked style="width:auto"> לכלול את ההערות של החדר</label>
      <div class="muted" style="white-space:pre-wrap;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px">${esc(roomNotes)}</div>` : ''}
    <label>💡 גוון האור (לא חובה)</label>
    <div class="chips" id="tones">${LIGHT_TONES.map(([k, t]) => `<span class="chip ${(sel.tone || '') === k ? 'on' : ''}" data-tone="${k}">${t}</span>`).join('')}</div>
    <label>5. מה לשנות ואיפה לשים כל מוצר? (במילים שלך)</label>
    <div class="muted" id="insHint" style="margin-bottom:4px"></div>
    <div class="chips" id="insChips" style="margin-bottom:6px"></div>
    <textarea id="ins" rows="4" placeholder="${picks.length ? 'למשל: את סט הפמוטים הזהב לשים במרכז שולחן האוכל, ואת פמוט הגליל על המזנון. כל השאר נשאר כמו שהוא.' : 'למשל: להחליף את הריצוף לאריח שבחרתי, לצבוע את הקיר מאחורי המיטה בבז\' חם, להשאיר את הארון כמו שהוא'}">${esc('')}</textarea>
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="keep" checked style="width:auto"> לשנות רק מה שביקשתי, כל השאר נשאר בדיוק אותו דבר</label>
    <label>6. רמת איכות</label>
    <div id="tierSel" style="display:flex;gap:6px">${Object.entries(TIERS).map(([k, t]) => `<button type="button" class="btn ${k === tier() ? '' : 'sec'} sm" data-t="${k}" style="flex:1;padding:8px 4px;line-height:1.3">${t.label}<br><small style="font-weight:400">${t.price}</small></button>`).join('')}</div>
    <div class="muted" id="tierDesc" style="margin-top:4px">${TIERS[tier()].desc}</div>
    <div style="height:14px"></div>
    <button class="btn full" id="go">✨ צור הדמיה (בתשלום)</button>
    <div style="height:8px"></div>
    <button class="btn sec full" id="goPrompt">📝 הכנת הנחיה מקצועית לג'מיני (חינם)</button>
    <div class="muted" style="margin-top:4px">המערכת מסתכלת על התמונה, בודקת מול הכללים, וכותבת הנחיה מדויקת להדבקה באפליקציית Gemini.</div>
    <div id="out"></div>`, async (b, close) => {
    b.querySelectorAll('#tones [data-tone]').forEach(ch => ch.onclick = () => { sel.tone = ch.dataset.tone; b.querySelectorAll('#tones [data-tone]').forEach(x => x.classList.toggle('on', x === ch)); });
    b.querySelectorAll('#tierSel [data-t]').forEach(bt => bt.onclick = () => {
      S.settings.tier = bt.dataset.t; save();
      b.querySelectorAll('#tierSel [data-t]').forEach(x => x.classList.toggle('sec', x !== bt));
      $('#tierDesc', b).textContent = TIERS[bt.dataset.t].desc;
    });
    for (const el of b.querySelectorAll('#bases .t')) {
      el.querySelector('img').src = await getImg(el.dataset.id);
      el.onclick = () => { sel.base = el.dataset.id; b.querySelectorAll('#bases .t').forEach(x => x.classList.toggle('sel', x === el)); };
    }
    b.querySelectorAll('#styles .chip').forEach(ch => ch.onclick = () => {
      const on = !ch.classList.contains('on'); b.querySelectorAll('#styles .chip').forEach(x => x.classList.remove('on'));
      ch.classList.toggle('on', on); sel.style = on ? ch.textContent : '';
    });
    const itemsEl = $('#items', b);
    // צ'יפים של המוצרים שנבחרו — לחיצה מוסיפה את שם המוצר להנחיה, ואז כותבים איפה לשים אותו
    const drawInsChips = () => {
      const box = $('#insChips', b), hint = $('#insHint', b); if (!box) return;
      const its = [...sel.items].map(id => S.catalog.find(x => x.id === id)).filter(Boolean);
      hint.textContent = its.length ? 'לוחצים על מוצר כדי להכניס את השם שלו, וממשיכים לכתוב איפה לשים אותו:' : '';
      box.innerHTML = its.map(it => `<span class="chip" data-ins="${it.id}">＋ ${esc(it.name)}</span>`).join('');
      box.querySelectorAll('[data-ins]').forEach(ch => ch.onclick = () => {
        const ta = $('#ins', b), it = S.catalog.find(x => x.id === ch.dataset.ins);
        ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + `את "${it.name}" לשים `; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    };
    const selCount = () => { const c = $('#selCount', b); if (c) c.textContent = sel.items.size ? `נבחרו ${sel.items.size} מוצרים` : 'לוחצים על תמונה כדי לבחור'; drawInsChips(); };
    const showCat = (cat) => {
      if (!itemsEl) return; itemsEl.innerHTML = '';
      for (const it of S.catalog.filter(x => x.cat === cat)) {
        const d = document.createElement('div'); d.className = 't' + (sel.items.has(it.id) ? ' sel' : '');
        d.innerHTML = `<img loading="lazy"><div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));color:#fff;font-size:11px;padding:12px 5px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}${it.model ? `<br><span dir="ltr" style="opacity:.85">${esc(it.model)}</span>` : ''}</div>`;
        getImg(it.img).then(async src => { d.querySelector('img').src = src || await Sync.fetchImg(it.img) || 'icon.svg'; });
        d.onclick = () => { sel.items.has(it.id) ? sel.items.delete(it.id) : sel.items.add(it.id); d.classList.toggle('sel'); selCount(); };
        itemsEl.appendChild(d);
      }
    };
    b.querySelectorAll('#icats .chip').forEach(ch => ch.onclick = () => { b.querySelectorAll('#icats .chip').forEach(x => x.classList.toggle('on', x === ch)); showCat(ch.dataset.c); });
    const first = b.querySelector('#icats .chip'); if (first) showCat(first.dataset.c); selCount();
    const drawExtras = () => {
      const box = $('#extras', b); box.innerHTML = '';
      sel.extras.forEach((x, i) => {
        const d = document.createElement('div'); d.className = 't';
        d.innerHTML = `<img src="${x.img}"><button class="x">✕</button><div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));color:#fff;font-size:11px;padding:12px 5px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.cat)}${x.note ? ' · ' + esc(x.note) : ''}</div>`;
        d.querySelector('.x').onclick = (e) => { e.stopPropagation(); sel.extras.splice(i, 1); drawExtras(); };
        box.appendChild(d);
      });
    };
    $('#addEx', b).onclick = () => {
      let img = null;
      modal('➕ אלמנט עם תמונה', `
        <label>מה זה?</label><select id="exCat">${['ריצוף', 'חיפוי קיר', 'צבע קיר', 'משטח', 'ספה', 'כורסה', 'שולחן', 'כיסא', 'מיטה', 'וילון', 'שטיח', 'תאורה', 'ארון / נגרות', 'כלי סניטרי', 'ברז', 'צמח', 'אביזר', 'אחר'].map(c => `<option>${c}</option>`).join('')}</select>
        <label>תיאור קצר (לא חובה)</label><input id="exNote" placeholder="למשל: גרניט פורצלן 60×120 אפור בהיר, מט">
        <label>תמונה</label><img id="exImg" style="max-width:100%;max-height:200px;border-radius:12px;display:none">
        <div class="grid2"><button class="btn sec" id="exCam">📷 צילום</button><button class="btn sec" id="exGal">🖼️ מהגלריה</button></div>
        <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="exSave" style="width:auto"> לשמור גם בקטלוג</label>
        <div style="height:12px"></div><button class="btn full" id="exOk">הוספה</button>`, (mb, mclose) => {
        const setF = async (fs) => { if (!fs[0]) return; img = await catalogImageData(fs[0]); $('#exImg', mb).src = img; $('#exImg', mb).style.display = ''; };
        $('#exCam', mb).onclick = async () => setF(await pickFiles(false, true));
        $('#exGal', mb).onclick = async () => setF(await pickFiles(false));
        $('#exOk', mb).onclick = async () => {
          if (!img) return toast('צריך תמונה של האלמנט');
          const cat = $('#exCat', mb).value, note = $('#exNote', mb).value.trim();
          sel.extras.push({ cat, note, img });
          if ($('#exSave', mb).checked) {
            const catalogCat = R().catCats.find(c => c.includes(cat.split(' ')[0])) || 'אחר';
            const it = { id: uid(), name: note || cat, cat: catalogCat, supplier: '', dims: '', color: '', price: '', link: '', note: '', img: await putImg(img), updated: Date.now() };
            S.catalog.push(it); Sync.pushItem(it, img); save();
          }
          mclose(); drawExtras();
        };
      });
    };
    const fullRequest = () => {
      const typed = $('#ins', b).value.trim();
      const notes = roomNotes && $('#useNotes', b)?.checked ? roomNotes : '';
      return [typed, notes ? 'הערות החדר: ' + notes : ''].filter(Boolean).join('\n');
    };
    const gatherRefs = async () => {
      const items = [...sel.items].map(id => S.catalog.find(x => x.id === id)).filter(Boolean);
      const refs = []; for (const it of items) refs.push({ item: it, img: await getImg(it.img) || await Sync.fetchImg(it.img) });
      for (const x of sel.extras) refs.push({ item: { name: x.note || x.cat, cat: x.cat, note: x.note, photo: true }, img: x.img });
      return refs;
    };
    $('#goPrompt', b).onclick = async () => {
      if (!S.settings.apiKey) { toast('צריך להכניס מפתח AI בהגדרות'); return; }
      const ins = fullRequest();
      if (!ins && !sel.style && !sel.items.size && !sel.extras.length) return toast('בוחרים סגנון, מוצר, אלמנט או כותבים מה לשנות');
      sel.keep = $('#keep', b).checked;
      const out = $('#out', b), btn = $('#goPrompt', b);
      btn.disabled = true; out.innerHTML = `<div class="spinner"></div><div class="muted" style="text-align:center">מנתח את התמונה וכותב הנחיה…</div>`;
      try {
        const baseImg = await getImg(sel.base);
        const refs = await gatherRefs(); const items = refs.map(x => x.item);
        const res = await aiPromptHelper(r, sel, ins, items, baseImg, refs);
        renderPromptResult(out, res, baseImg, refs, p, r, sel, ins, close);
      } catch (e) {
        out.innerHTML = `<div class="rule red" style="margin-top:12px"><span class="dot red"></span><div>${esc(e.message)}</div></div>
          <button class="btn full" id="localP" style="margin-top:10px">⚡ הנחיה בסיסית מיידית (בלי AI, בלי המתנה)</button>${aiLogHtml()}`;
        $('#localP', out).onclick = async () => { const baseImg = await getImg(sel.base); const refs = await gatherRefs(); renderPromptResult(out, localPrompt(r, sel, ins, refs), baseImg, refs, p, r, sel, ins, close); };
      } finally { btn.disabled = false; }
    };
    $('#go', b).onclick = async () => {
      if (!S.settings.apiKey) { toast('צריך להכניס מפתח AI בהגדרות'); return; }
      const ins = fullRequest();
      if (!ins && !sel.style && !sel.items.size && !sel.extras.length) return toast('בוחרים סגנון, מוצר, אלמנט או כותבים מה לשנות');
      sel.keep = $('#keep', b).checked;
      const out = $('#out', b); const btn = $('#go', b);
      btn.disabled = true; out.innerHTML = `<div class="spinner"></div><div class="muted" style="text-align:center">יוצר הדמיה… זה לוקח בערך 10–30 שניות</div>`;
      try {
        const baseImg = await getImg(sel.base);
        const refs = await gatherRefs(); const items = refs.map(x => x.item);
        const result = await aiEdit(baseImg, refs, buildPrompt(r, sel, ins, items));
        out.innerHTML = `<div style="height:12px"></div><div class="ba-wrap"></div>
          <div class="row" style="margin-top:10px"><button class="btn grow" id="keepIt">💾 שמירה</button><button class="btn sec" id="again">🔄 שוב</button></div>`;
        beforeAfter($('.ba-wrap', out), baseImg, result);
        $('#again', out).onclick = () => $('#go', b).click();
        $('#keepIt', out).onclick = async () => {
          const rid = await putImg(result);
          r.designs.push({ id: uid(), base: sel.base, result: rid, style: sel.style, items: [...sel.items], instructions: ins, note: '', created: Date.now() });
          p.updated = Date.now(); save(); close(); toast('ההדמיה נשמרה'); renderRoom($('#app'));
        };
      } catch (e) {
        out.innerHTML = `<div class="rule red" style="margin-top:12px"><span class="dot red"></span><div>${esc(e.message)}</div></div>`;
      } finally { btn.disabled = false; }
    };
  });
}

// ---------- עוזר הנחיות (מודל טקסט+ראייה, בשכבה החינמית) ----------
const TEXT_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
// כשגוגל עונה "המודל הוחלף — השתמשו ב-models/X", לוקחים את X אוטומטית
function suggestedModel(msg) { const m = /use models\/([\w.\-]+)/i.exec(msg || ''); return m ? m[1] : null; }
// fetch עם הגבלת זמן — כדי שבקשה תקועה לא תתקע את כל האפליקציה
// בקשה "פשוטה" בלי כותרות מיוחדות — עוקפת חסימות של חלק מהמסננים/רשתות
async function gFetch(url, key, body, ms) {
  try {
    return await fetchT(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }, ms);
  } catch (e) {
    if (e.timeout) throw e;
    return await fetchT(url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }, ms);
  }
}
async function fetchT(url, opts, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  catch (e) { if (e.name === 'AbortError') { const er = new Error('timeout'); er.timeout = true; throw er; } throw e; }
  finally { clearTimeout(t); }
}
// יומן ניסיונות אחרון — כדי לראות מה גוגל באמת עונה
let AI_LOG = [];
function aiLogHtml() {
  if (!AI_LOG.length) return '';
  return `<details style="margin-top:8px"><summary class="muted">פרטים טכניים (לצלם מסך ולשלוח)</summary><div dir="ltr" style="font-size:12px;text-align:left;white-space:pre-wrap;word-break:break-word">${AI_LOG.map(l => esc(`${l.model}: ${l.status} ${l.msg}`)).join('\n')}</div></details>`;
}
let AI_LAST = null;
async function geminiText(parts, json, onStatus, opts = {}) {
  const key = S.settings.apiKey.trim();
  const models = [...new Set([...(tier() === 'pro' ? ['gemini-3.8-flash'] : []), S.settings.textModel, ...TEXT_MODELS].filter(Boolean))];
  AI_LOG = [];
  const skip = new Set();
  const addModel = (m) => { if (m && !models.includes(m)) models.push(m); };
  let busy = false, noFree = 0, wait = 0;
  const deadline = Date.now() + 180000;
  for (let round = 0; round < 3; round++) {
    if (Date.now() > deadline) break;
    if (round) {
      const sec = Math.min(30, Math.max(wait, 5 * round));
      for (let t = sec; t > 0; t--) { onStatus && onStatus(`השרתים של גוגל עמוסים. מנסה שוב בעוד ${t} שניות (${round}/2)…`); await new Promise(r => setTimeout(r, 1000)); }
    }
    noFree = 0;
    for (const model of models) {
      if (Date.now() > deadline) break;
      if (skip.has(model)) continue;
      onStatus && onStatus(`שולח ל-${model}…`);
      let res;
      try {
        res = await gFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, key,
          JSON.stringify({ contents: [{ role: 'user', parts }], ...(opts.tools ? { tools: opts.tools } : {}), generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.4 } : { temperature: 0.4 } }), opts.timeout || 45000);
      } catch (e) {
        AI_LOG.push({ model, status: e.timeout ? 'timeout' : 'net', msg: e.timeout ? 'no answer in 45s' : String(e.message || e) });
        if (e.timeout) { busy = true; continue; }
        throw new Error('אין חיבור לאינטרנט.');
      }
      const j = await res.json().catch(() => ({}));
      const msg = j?.error?.message || '';
      AI_LOG.push({ model, status: res.status, msg: msg.slice(0, 300) });
      const rd = (j?.error?.details || []).find(d => d.retryDelay)?.retryDelay;
      if (rd) wait = Math.max(wait, parseInt(rd) || 0);
      if (res.status === 404) { addModel(suggestedModel(msg)); if (S.settings.textModel === model) S.settings.textModel = ''; continue; }
      if (res.status === 400 && /API key/i.test(msg)) throw new Error('מפתח ה-AI לא תקין.');
      if (res.status === 403) throw new Error('המפתח חסום לשירות הזה (403). צריך לבדוק ב-AI Studio שהמפתח שייך לפרויקט עם Gemini API פעיל.');
      if (res.status === 429 && /limit:\s*0\b|free_tier.*limit.*\b0\b/i.test(msg)) { noFree++; continue; } // אין בכלל מכסה חינמית במודל הזה
      if (res.status === 429) { skip.add(model); busy = true; continue; } // מכסה — לא מנסים שוב את אותו מודל בסבב הזה
      if (res.status === 503 || res.status === 500 || /high demand|overloaded|unavailable/i.test(msg)) { busy = true; continue; }
      if (!res.ok) throw new Error('שגיאה מהשרת: ' + (msg || res.status));
      const out = (j?.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
      if (!out) { AI_LOG[AI_LOG.length - 1].msg = 'empty: ' + (j?.candidates?.[0]?.finishReason || j?.promptFeedback?.blockReason || ''); continue; }
      AI_LAST = j; if (!opts.tools) { S.settings.textModel = model; save(); }
      return out;
    }
    if (noFree && !busy) break;
  }
  if (noFree && !busy) throw new Error('לפרויקט של המפתח הזה אין מכסה חינמית (גוגל מחזירה limit 0). צריך מפתח מפרויקט אחר ב-AI Studio, או להפעיל חיוב.');
  if (busy) throw new Error('השרתים החינמיים של גוגל עמוסים כרגע (ניסינו כמה מודלים במשך עד 3 דקות). נסו שוב בעוד כמה דקות. בגרסה בתשלום אין את העומס הזה.');
  throw new Error('לא נמצא מודל טקסט זמין למפתח הזה.');
}
async function aiPromptHelper(r, sel, ins, items, baseImg, refs = []) {
  const c = catOf(r.cat);
  const own = R().checks[r.cat] || [];
  const checks = [...own, ...R().checks._all.filter(x => !own.some(y => y.key === x.key))];
  const fixed = [...(R().fixed[r.cat] || []), ...R().fixed._all, ...planRuleLines()];
  const rules = [...fixed.map(f => `- [${f.level}] ${f.text}`), ...checks.map(ch => `- [${ch.level}] ${ch.label}: ${ch.min != null ? 'min ' + ch.min : ''}${ch.max != null ? ' max ' + ch.max : ''} cm — ${ch.msg}`)].join('\n');
  const sys = `You are a senior interior designer and an expert prompt engineer for Google Gemini image editing ("Nano Banana").
The user is an Israeli interior-design student. She uploads a real photo of a room and describes in Hebrew what she wants.
Your job: look carefully at the photo and write ONE precise, professional image-editing prompt (in English) that she will paste into the Gemini app together with the photo (and the product photos listed below, attached in the same order).

The prompt you write MUST:
1. Start by instructing to edit the attached room photo, not to create a new image.
2. Lock the geometry: same camera angle, perspective, framing, walls, windows, doors, ceiling, room size and proportions.${sel.keep ? '\n3. Change ONLY the requested elements; everything else stays pixel-identical. No added furniture or decor that was not requested.' : '\n3. Allow tasteful complementary decor that fits the style, using only realistic market products.'}
4. Describe each requested change concretely: exact element, material, finish, color, texture, pattern, scale and placement — using professional interior-design vocabulary, based on what you actually see in the photo (refer to visible elements by location, e.g. "the wall behind the bed on the left").
5. If product photos are attached, tell Gemini to reproduce them faithfully (reference image 2, 3...) and not substitute them.
6. Require photorealistic lighting consistent with the photo, realistic shadows/reflections, no people, no text, no watermark.
7. Respect the real dimensions and the professional rules below. Never move, remove or open structural/bearing walls or shelter (ממ"ד) walls.

Room type: ${c.name}. Real size: ${r.L ? `${r.L} x ${r.W} cm, ceiling ${r.H || '?'} cm` : 'unknown'}.
Style: ${sel.style || 'not specified — keep the existing style unless the request implies otherwise'}.${sel.tone && LIGHT_EN[sel.tone] ? `\nLighting color requested: ${LIGHT_EN[sel.tone]} (all fixtures and bulbs; ambient light and reflections must match).` : ''}
Products / elements to use (attached as reference images in this order; image 1 is the room). You can SEE these reference images below — for each one, describe it in the prompt precisely: material, exact color, finish (matte/gloss), pattern, texture, tile/plank size and layout, legs/frame, fabric — so Gemini reproduces it exactly:
${items.length ? items.map((it, i) => `${i + 2}. ${it.name} (${it.cat}${it.sub ? ' › ' + it.sub : ''}${it.model ? ', model ' + it.model : ''}${it.dims ? ', ' + it.dims : ''}${it.color ? ', ' + it.color : ''}${it.supplier ? ', supplier ' + it.supplier : ''}${it.note ? ', designer note: ' + it.note : ''}${it.photo ? ', photo taken by the designer' : ''})`).join('\n') : 'none'}
Professional rules from her course (red = forbidden, orange = needs checking, green = recommendation):
${rules}

The designer's request (Hebrew): """${ins || '(no text — use the style and products)'}"""

Return JSON only:
{"prompt": "<the English prompt, ready to paste>",
 "prompt_he": "<a short Hebrew translation/summary of the prompt so she understands it>",
 "observations_he": ["<what you see in the room photo that matters: materials, light, problems>", "<one line per reference element: how you described it>"],
 "warnings_he": ["<any conflict between her request and the rules or the real dimensions; empty if none>"],
 "tips_he": ["<1-3 professional design tips relevant to this request>"]}`;
  const part = (d) => { const [h, b64] = d.split(','); return { inline_data: { mime_type: h.match(/data:(.*?);/)?.[1] || 'image/jpeg', data: b64 } }; };
  // לניתוח מספיקה תמונה קטנה — שולחים מהר יותר וגוגל עונה מהר יותר
  const parts = [{ text: sys }, { text: 'Image 1 — the room:' }, part(await shrinkData(baseImg, 1024, 0.8))];
  for (let i = 0; i < refs.length; i++) { const x = refs[i]; if (x.img) { parts.push({ text: `Image ${i + 2} — ${x.item.name} (${x.item.cat}):` }); parts.push(part(await shrinkData(x.img, 512, 0.8))); } }
  const t0 = Date.now();
  const txt = await geminiText(parts, true, (m) => { const o = document.querySelector('#out .muted'); if (o) o.textContent = `${m} · ${Math.round((Date.now() - t0) / 1000)} שנ'`; });
  try { return JSON.parse(txt.replace(/^```json|```$/g, '').trim()); } catch { return { prompt: txt, prompt_he: '', observations_he: [], warnings_he: [], tips_he: [] }; }
}
// הנחיה מוכנה בלי AI — מיידית, בלי עומסים. ג'מיני מבין עברית, אז הבקשה נשארת במילים שלה
function localPrompt(r, sel, ins, refs) {
  const c = catOf(r.cat);
  const lines = [
    'Edit the attached room photo (image 1). Do NOT create a new image.',
    'Keep exactly the same camera angle, perspective, framing, walls, windows, doors, ceiling, room size and proportions.',
    sel.keep ? 'Change ONLY what is requested below. Everything else must stay identical. Do not add furniture or decor that was not requested.' : '',
    `Room: ${c.name}${r.L ? `, real size ${r.L}x${r.W} cm${r.H ? `, ceiling ${r.H} cm` : ''}` : ''}.`,
    sel.style ? `Style: ${sel.style}.` : '',
    sel.tone && LIGHT_EN[sel.tone] ? `Light color: ${LIGHT_EN[sel.tone]} from all fixtures and bulbs, with matching ambient light and reflections.` : '',
    ins ? `Requested changes (in Hebrew): ${ins}` : '',
    ...refs.map((x, i) => `Image ${i + 2} is a real product/material: ${x.item.name} (${x.item.cat}${x.item.model ? ', model ' + x.item.model : ''}${x.item.color ? ', ' + x.item.color : ''})${x.item.note ? ' — ' + x.item.note : ''}. Copy it exactly as it looks in the photo: same material, color, finish, pattern and proportions.`),
    'Use realistic real-world scale and proportions. Photorealistic interior photography, natural lighting matching the original photo, realistic shadows and reflections, high detail.'
  ].filter(Boolean);
  return { prompt: lines.join('\n'), prompt_he: '', observations_he: [], warnings_he: [], tips_he: ['זו הנחיה בסיסית שנבנתה בלי AI. כשהשרתים פנויים, ההנחיה המקצועית מנתחת גם את התמונה ובודקת מול הכללים.'] };
}
function renderPromptResult(out, res, baseImg, refs, p, r, sel, ins, close) {
  const li = (a) => (a || []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('');
  out.innerHTML = `<div style="height:12px"></div>
    ${(res.warnings_he || []).filter(Boolean).length ? `<div class="rule orange"><span class="dot orange"></span><div><b>שימי לב:</b><ul style="margin:4px 0;padding-inline-start:18px">${li(res.warnings_he)}</ul></div></div>` : ''}
    <div class="card"><h3>📝 ההנחיה לג'מיני</h3>
      <textarea id="pTxt" dir="ltr" style="min-height:180px;font-size:13px">${esc(res.prompt || '')}</textarea>
      <div class="grid2" style="margin-top:8px"><button class="btn" id="pCopy">📋 העתקת ההנחיה</button><button class="btn sec" id="pShare">📤 שיתוף לג'מיני</button></div>
      ${res.prompt_he ? `<details style="margin-top:8px"><summary class="muted">מה כתוב בהנחיה (בעברית)</summary><div style="font-size:14px;margin-top:6px">${esc(res.prompt_he)}</div></details>` : ''}</div>
    ${li(res.observations_he) ? `<div class="card"><h3>👁️ מה המערכת ראתה בתמונה</h3><ul style="margin:0;padding-inline-start:18px;font-size:14px">${li(res.observations_he)}</ul></div>` : ''}
    ${li(res.tips_he) ? `<div class="card"><h3>💡 טיפים</h3><ul style="margin:0;padding-inline-start:18px;font-size:14px">${li(res.tips_he)}</ul></div>` : ''}
    <div class="card"><h3>איך משתמשים</h3><div style="font-size:14px;line-height:1.7">
      1. לוחצים <b>שיתוף לג'מיני</b> ובוחרים Gemini. התמונות וההנחיה נשלחות יחד.<br>
      (או: <b>העתקת ההנחיה</b>, פותחים את Gemini, מצרפים את תמונת החדר${refs.length ? ' ואז את תמונות המוצרים לפי הסדר' : ''}, ומדביקים.)<br>
      2. כשג'מיני מחזיר תמונה — שומרים אותה בטלפון.<br>
      3. חוזרים לכאן ולוחצים <b>שמירת התוצאה מג'מיני</b> — ותקבלו לפני/אחרי בתוך הפרויקט.</div>
      <div style="height:10px"></div>
      <div class="grid2"><a class="btn sec" href="https://gemini.google.com/app" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">🔗 פתיחת Gemini</a><button class="btn" id="pSave">💾 שמירת התוצאה מג'מיני</button></div>
      ${refs.length ? `<div class="muted" style="margin-top:8px">תמונות לצירוף לפי הסדר: 1. החדר${refs.map((x, i) => ` · ${i + 2}. ${esc(x.item.name)}`).join('')}</div>` : ''}</div>`;
  const getTxt = () => $('#pTxt', out).value;
  $('#pCopy', out).onclick = async () => { try { await navigator.clipboard.writeText(getTxt()); toast('ההנחיה הועתקה'); } catch { $('#pTxt', out).select(); document.execCommand('copy'); toast('ההנחיה הועתקה'); } };
  $('#pShare', out).onclick = async () => {
    const toFile = async (d, n) => new File([await (await fetch(d)).blob()], n, { type: 'image/jpeg' });
    const files = [await toFile(baseImg, '1-room.jpg')];
    for (const [i, x] of refs.entries()) if (x.img) files.push(await toFile(x.img, `${i + 2}-product.jpg`));
    try { await navigator.clipboard.writeText(getTxt()); } catch {}
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, text: getTxt() }); toast('אם ההנחיה לא הודבקה לבד — היא כבר מועתקת, רק להדביק', 4000); } catch {}
    } else toast('השיתוף לא נתמך כאן. ההנחיה הועתקה — פותחים את Gemini ומדביקים.', 4000);
  };
  $('#pSave', out).onclick = async () => {
    const [f] = await pickFiles(); if (!f) return;
    const rid = await putImg(await compressImage(f, 1600, 0.88));
    r.designs.push({ id: uid(), base: sel.base, result: rid, style: sel.style, items: [...sel.items], instructions: ins, note: 'נוצר ב-Gemini לפי ההנחיה', prompt: getTxt(), created: Date.now() });
    p.updated = Date.now(); save(); close(); toast('נשמר עם לפני/אחרי ✓'); renderRoom($('#app'));
  };
}

function buildPrompt(r, sel, ins, items) {
  const c = catOf(r.cat);
  const lines = [
    'You are a precise interior-design rendering assistant working for a professional interior designer.',
    'Edit the FIRST image (a real photo of the room). Return one edited photorealistic image.',
    `Room type: ${c.name} (${r.cat}).` + (r.L ? ` Real room size: ${r.L} x ${r.W} cm, ceiling height ${r.H || 'unknown'} cm. Keep realistic proportions for this size.` : ''),
    'STRICT RULES:',
    '- Keep the exact same camera angle, lens, perspective and framing.',
    '- Keep walls, windows, doors, columns, ceiling and room geometry exactly as they are. Never move or remove walls.',
    '- Do not include any people.',
    '- Realistic lighting, materials and shadows. No text, no watermark.'
  ];
  if (sel.keep) lines.push('- Change ONLY what is requested below. Everything else must stay identical. Do NOT invent or add furniture, decor or objects that were not requested.');
  else lines.push('- You may add tasteful complementary decor that fits the requested style, but only real, common market products.');
  if (sel.style) lines.push(`Design style: ${sel.style}.`);
  if (sel.tone && LIGHT_EN[sel.tone]) lines.push(`Lighting color: all light fixtures and bulbs emit ${LIGHT_EN[sel.tone]}; the room's ambient light and reflections match this color temperature realistically.`);
  if (items.length) {
    lines.push('Use these EXACT real products. Each one is shown in a reference image after the room photo, in this order. Reproduce their color, texture, pattern and shape faithfully; do not substitute them:');
    items.forEach((it, i) => lines.push(`${i + 1}. ${it.name} — category: ${it.cat}${it.dims ? ', size: ' + it.dims : ''}${it.color ? ', finish/color: ' + it.color : ''}${it.note ? ', note: ' + it.note : ''}${it.photo ? ' (photo of the real element)' : ''}`));
  }
  if (ins) lines.push(`Designer instructions (in Hebrew, follow them exactly): ${ins}`);
  return lines.join('\n');
}

async function aiEdit(baseDataURL, refs, prompt) {
  const key = S.settings.apiKey.trim();
  const custom = (S.settings.model || '').trim();
  const models = [...TIERS[tier()].models]; if (custom && custom !== DEFAULT_MODEL && !models.includes(custom)) models.unshift(custom);
  const part = (d) => { const [h, b64] = d.split(','); return { inline_data: { mime_type: h.match(/data:(.*?);/)?.[1] || 'image/jpeg', data: b64 } }; };
  const parts = [{ text: prompt }, part(baseDataURL)];
  refs.forEach((r, i) => { if (r.img) { parts.push({ text: `Reference product ${i + 1}: ${r.item.name}` }); parts.push(part(r.img)); } });
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
  let res, j, lastErr = '';
  for (let round = 0; round < 2; round++) {
    for (let mi = 0; mi < models.length; mi++) {
      const model = models[mi];
      try { res = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }, 120000); }
      catch (e) { lastErr = e.timeout ? 'השרת לא ענה בזמן.' : 'אין חיבור לאינטרנט.'; continue; }
      j = await res.json().catch(() => ({}));
      if (res.ok) { round = 9; break; }
      const m = j?.error?.message || '';
      if (res.status === 400 && /API key/i.test(m)) throw new Error('מפתח ה-AI לא תקין. בודקים אותו בהגדרות.');
      if (res.status === 404) { const sm = suggestedModel(m); if (sm && !models.includes(sm)) models.push(sm); lastErr = `המודל ${model} לא נמצא.`; continue; }
      if (res.status === 429 && /limit:\s*0\b|billing|free/i.test(m)) throw new Error('הדמיות דורשות חיוב פעיל בחשבון גוגל (המודלים האלה לא זמינים בחינם).');
      if (res.status === 403) { lastErr = 'למפתח אין הרשאה למודל הזה.'; continue; }
      if (res.status === 429 || res.status >= 500) { lastErr = 'השרתים עמוסים כרגע.'; continue; }
      throw new Error('שגיאה מהשרת: ' + (m || res.status));
    }
    if (round === 0 && !(res && res.ok)) await new Promise(r => setTimeout(r, 5000));
  }
  if (!res || !res.ok) throw new Error(lastErr + ' נסו שוב בעוד כמה דקות, או בחרו רמת איכות אחרת.');
  const ps = j?.candidates?.[0]?.content?.parts || [];
  const img = ps.find(x => x.inlineData || x.inline_data);
  if (!img) {
    const txt = ps.map(x => x.text).filter(Boolean).join(' ');
    const fr = j?.candidates?.[0]?.finishReason;
    throw new Error('לא התקבלה תמונה. ' + (txt ? 'תגובת המערכת: ' + txt : fr ? 'סיבה: ' + fr : 'נסו לנסח אחרת.'));
  }
  const d = img.inlineData || img.inline_data;
  return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`;
}

// ---------- לשונית מידות וכללים ----------
function evalCheck(ch, v) {
  if (v === '' || v == null || isNaN(v)) return null;
  if (ch.min != null && v < ch.min) return { ok: false, txt: `נמוך מהמינימום (${ch.min} ס"מ)` };
  if (ch.max != null && v > ch.max) return { ok: false, txt: `מעל המקסימום (${ch.max} ס"מ)` };
  return { ok: true, txt: 'תקין ✓' };
}
function renderChecksTab(body, p, r) {
  const own = R().checks[r.cat] || [];
  const checks = [...own, ...R().checks._all.filter(c => !own.some(x => x.key === c.key))];
  const fixed = [...(R().fixed[r.cat] || []), ...R().fixed._all, ...planRuleLines()];
  const roomChecks = r.cat === 'corridor' && r.W ? `<div class="muted">רוחב החדר שהוגדר: ${r.W} ס"מ</div>` : '';
  body.innerHTML = `
    <div class="card"><h3>📏 בדיקת מידות</h3>${roomChecks}
      <div class="muted">מכניסים מידה, והמערכת בודקת מול הכללים.</div>
      ${checks.map(ch => `<div class="check-row" data-k="${ch.key}">
        <label style="margin-top:0">${esc(ch.label)} <span class="muted">(ס"מ)</span></label>
        <input type="number" inputmode="numeric" value="${r.checks[ch.key] ?? ''}">
        <div class="res"></div></div>`).join('')}
    </div>
    ${r.cat === 'bedroom' || r.cat === 'kids' ? `<div class="card"><h3>🛏️ מידות מיטות (בלי מסגרת)</h3>${BED_SIZES.map(b => `<div class="row"><span class="grow">${b.name}</span><b>${b.size}</b></div>`).join('')}</div>` : ''}
    <div class="card"><h3>⚠️ כללים לחדר הזה</h3>
      ${fixed.map(f => `<div class="rule ${f.level}"><span class="dot ${f.level}"></span><div>${esc(f.text)}</div></div>`).join('')}
      <div class="muted" style="margin-top:8px">האפליקציה היא כלי עזר לסקיצה. היא לא מחליפה קונסטרוקטור, חשמלאי מוסמך או אדריכל.</div></div>`;
  body.querySelectorAll('.check-row').forEach(row => {
    const ch = checks.find(c => c.key === row.dataset.k), inp = $('input', row), res = $('.res', row);
    const upd = () => {
      const v = inp.value === '' ? '' : +inp.value; r.checks[ch.key] = v; save();
      const e = evalCheck(ch, v);
      res.innerHTML = !e ? '' : e.ok ? `<span style="color:var(--green)">${e.txt}</span>`
        : `<div class="rule ${ch.level}" style="margin:0"><span class="dot ${ch.level}"></span><div><b>${e.txt}</b><br>${esc(ch.msg)}</div></div>`;
    };
    inp.oninput = upd; upd();
  });
}

// ---------- לשונית הערות ----------
function renderNotesTab(body, p, r) {
  body.innerHTML = `
    <div class="card"><h3>📝 הערות כלליות לחדר</h3>
      <textarea id="rnotes" placeholder="רעיונות, בקשות הלקוח, דברים לבדוק…">${esc(r.notes || '')}</textarea></div>
    <div class="row" style="margin:6px 0 10px"><h3 class="grow" style="margin:0">הערות לפי אלמנט / עבודה</h3><button class="btn sm" id="addEl">+ הערה</button></div>
    <div id="els"></div>
    <div class="muted">בהגדרות בוחרים אם ההערות יופיעו גם בהדפסה.</div>`;
  $('#rnotes').onchange = e => { r.notes = e.target.value; save(); };
  const els = $('#els');
  els.innerHTML = r.elements.length ? r.elements.map(el => `<div class="card" data-id="${el.id}">
    <div class="row"><b class="grow">${esc(el.title)}</b><span class="note-ic" data-a="edit">עריכה</span><span class="note-ic" data-a="del" style="color:var(--red)">מחיקה</span></div>
    <div style="margin-top:6px;white-space:pre-wrap;font-size:14px">${esc(el.text)}</div>
    ${el.print === false ? '<div class="muted">לא יודפס</div>' : ''}</div>`).join('') : '<div class="empty">אין עדיין הערות לאלמנטים.</div>';
  els.querySelectorAll('[data-id]').forEach(c => {
    const el = r.elements.find(x => x.id === c.dataset.id);
    c.querySelector('[data-a=edit]').onclick = () => elementForm(r, el);
    c.querySelector('[data-a=del]').onclick = () => { if (confirm('למחוק את ההערה?')) { r.elements = r.elements.filter(x => x !== el); save(); renderRoom($('#app')); } };
  });
  $('#addEl').onclick = () => elementForm(r);
}
function elementForm(r, el) {
  modal(el ? 'עריכת הערה' : 'הערה חדשה', `
    <label>על מה ההערה? (אלמנט / עבודה)</label><input id="et" value="${esc(el?.title || '')}" placeholder="למשל: ריצוף, תאורה מעל האי, קיר טלוויזיה">
    <label>ההערה</label><textarea id="ex">${esc(el?.text || '')}</textarea>
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="ep" style="width:auto" ${el?.print === false ? '' : 'checked'}> להדפיס את ההערה הזו</label>
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>`, (b, close) => {
    $('#ok', b).onclick = () => {
      const d = { title: $('#et', b).value.trim() || 'הערה', text: $('#ex', b).value.trim(), print: $('#ep', b).checked };
      if (el) Object.assign(el, d); else r.elements.push({ id: uid(), ...d });
      save(); close(); renderRoom($('#app'));
    };
  });
}

// =====================================================================
// קטלוג — מאגר תמונות לפי קטגוריה (משותף בסנכרון)
// =====================================================================
async function catalogImageData(file) {
  // תמונות קטלוג נשמרות קטנות יותר, כדי שיעברו בסנכרון
  let d = await compressImage(file, 1024, 0.8);
  if (d.length > 850000) d = await compressImage(file, 800, 0.7);
  return d;
}
// הוספה / שינוי שם / מחיקה של קטגוריה בקטלוג (נשמר ומשותף דרך המאגר)
function catForm(old, focusSubs) {
  const n = old ? S.catalog.filter(x => x.cat === old).length : 0;
  modal(old ? 'עריכת קטגוריה' : 'קטגוריות חדשות', `
    ${old ? `<label>שם הקטגוריה</label><input id="cn" value="${esc(old)}">
      <label>תתי-קטגוריות</label><textarea id="csub" rows="5" placeholder="לדוגמה:&#10;מנורות לילה, מנורה עומדת, אהילים">${esc(subsOf(old).join('\n'))}</textarea>
      <div class="muted" style="font-size:12px">שורה לכל אחת, או הרבה במכה אחת עם פסיקים / לוכסנים.</div>`
    : `<label>קטגוריה אחת — או הרבה במכה אחת</label><textarea id="cn" rows="5" placeholder="קירות&#10;נרות, פמוטים, מגשים&#10;תאורה: מנורות לילה, מנורה עומדת, אהילים"></textarea>
      <div class="muted" style="font-size:12px">מפרידים בשורות, בפסיקים או בלוכסנים — הכל מתפרק לבד.<br>תתי-קטגוריות: כותבים את הראשית, נקודתיים, ואחריה את התתים.</div>`}
    <div class="row" style="margin-top:14px;gap:8px">
      <button class="btn grow" id="cSave">${old ? 'שמירה' : '+ הוספה'}</button>
      ${old ? `<button class="btn sec" id="cDel" style="color:#b3261e">🗑 מחיקה</button>` : ''}</div>
    ${old && n ? `<div class="muted" style="margin-top:8px">יש בקטגוריה ${n} מוצרים. במחיקה הם יעברו ל"אחר".</div>` : ''}`, (b, close) => {
    const inp = b.querySelector(focusSubs ? '#csub' : '#cn'); setTimeout(() => { inp.focus(); if (focusSubs) inp.setSelectionRange(inp.value.length, inp.value.length); }, 50);
    b.querySelector('#cSave').onclick = () => {
      const C = editableRules();
      if (!old) {
        const { cats, subs } = parseCatText(b.querySelector('#cn').value);
        if (!cats.length) return toast('צריך לכתוב שם');
        const add = cats.filter(c => !C.catCats.includes(c)); const i = C.catCats.indexOf('אחר');
        if (i >= 0) C.catCats.splice(i, 0, ...add); else C.catCats.push(...add);
        let ns = 0; for (const [k, l] of Object.entries(subs)) { const cur = C.subCats[k] || []; const nn = l.filter(x => !cur.includes(x)); ns += nn.length; C.subCats[k] = [...cur, ...nn]; }
        rulesChanged(); close(); toast([add.length ? `נוספו ${add.length} קטגוריות` : '', ns ? `${ns} תתי-קטגוריות` : ''].filter(Boolean).join(' · ') || 'כבר קיים');
        return go({ catFilter: cats.length === 1 ? cats[0] : '', subFilter: '' });
      }
      const name = b.querySelector('#cn').value.trim(); if (!name) return toast('צריך לכתוב שם');
      if (name !== old && C.catCats.includes(name)) return toast('כבר יש קטגוריה בשם הזה');
      const newSubs = splitList(b.querySelector('#csub').value.split('\n').map(l => l.replace(/\s\/\s/g, ',')));
      C.catCats = C.catCats.map(c => c === old ? name : c);
      delete C.subCats[old]; if (newSubs.length) C.subCats[name] = newSubs;
      S.catalog.filter(x => x.cat === old).forEach(x => {
        let ch = false;
        if (name !== old) { x.cat = name; ch = true; }
        if (x.sub && !newSubs.includes(x.sub)) { x.sub = ''; ch = true; }
        if (ch) { x.updated = Date.now(); Sync.pushItem(x); }
      });
      rulesChanged(); close(); toast('הקטגוריה עודכנה'); go({ catFilter: name, subFilter: '' });
    };
    const del = b.querySelector('#cDel');
    if (del) del.onclick = () => {
      if (!confirm(`למחוק את הקטגוריה "${old}"?`)) return;
      const C = editableRules();
      C.catCats = C.catCats.filter(c => c !== old); delete C.subCats[old];
      if (n && !C.catCats.includes('אחר')) C.catCats.push('אחר');
      S.catalog.filter(x => x.cat === old).forEach(x => { x.cat = 'אחר'; x.sub = ''; x.updated = Date.now(); Sync.pushItem(x); });
      rulesChanged(); close(); toast('הקטגוריה נמחקה'); go({ catFilter: '', subFilter: '' });
    };
  });
}

// ☑️ בחירה מרובה והעברה בין קטגוריות
const CSEL = new Set();
function selBar(list) {
  let bar = $('#selBar');
  if (!V.selMode || V.tab !== 'catalog') { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'selBar'; document.body.appendChild(bar); }
  const dis = CSEL.size ? '' : 'disabled';
  bar.innerHTML = `<div class="sbr"><b>נבחרו ${CSEL.size}</b><button class="btn sec sm" id="sbAll">${list.length && list.every(x => CSEL.has(x.id)) ? 'בטל הכל' : `בחר הכל (${list.length})`}</button></div>
    <div class="sbr"><button class="btn sm" id="sbMove" ${dis}>📂 העברה</button><button class="btn sm" id="sbEdit" ${dis}>✏️ עריכה</button><button class="btn sm" id="sbDel" ${dis} style="background:#b3261e">🗑 מחיקה</button></div>`;
  bar.querySelector('#sbAll').onclick = () => { const all = list.every(x => CSEL.has(x.id)); list.forEach(x => all ? CSEL.delete(x.id) : CSEL.add(x.id)); stay({}); };
  bar.querySelector('#sbMove').onclick = () => moveForm([...CSEL]);
  bar.querySelector('#sbEdit').onclick = () => bulkEditForm([...CSEL]);
  bar.querySelector('#sbDel').onclick = async () => {
    const ids = [...CSEL]; if (!ids.length) return;
    if (!confirm(`למחוק ${ids.length} מוצרים מהקטלוג?\nהם יימחקו גם אצל כל השותפים במאגר. אי אפשר לבטל.`)) return;
    let n = 0;
    for (const id of ids) {
      const it = S.catalog.find(x => x.id === id); if (!it) continue;
      await delImg(it.img); for (const a of it.angles || []) await delImg(a);
      S.catalog = S.catalog.filter(x => x !== it); Sync.deleteItem(it); n++;
    }
    CSEL.clear(); save(); toast(`נמחקו ${n} מוצרים`, 3000); stay({});
  };
}
// ✏️ עריכה מרובה: ממלאים רק את השדות שרוצים לשנות — השאר נשאר כמו שהוא
function bulkEditForm(ids) {
  const F = [['supplier', 'ספק / מותג'], ['model', 'מספר דגם / מק"ט'], ['dims', 'מידות'], ['color', 'צבע וגימור'], ['price', 'מחיר'], ['link', 'קישור'], ['note', 'הערה']];
  modal(`עריכת ${ids.length} מוצרים`, `<div class="muted">ממלאים רק מה שרוצים לשנות בכל המוצרים שנבחרו. שדה ריק = לא משתנה.</div>
    ${F.map(([k, l]) => `<label>${l}</label><input data-k="${k}" ${k === 'model' || k === 'link' ? 'dir="ltr"' : ''}>`).join('')}
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="beRev" style="width:auto"> להסיר סימון "⚠️ לבירור"</label>
    <button class="btn full" id="beGo" style="margin-top:14px">✓ עדכון ${ids.length} מוצרים</button>`, (b, close) => {
    $('#beGo', b).onclick = () => {
      const patch = {}; b.querySelectorAll('[data-k]').forEach(i => { if (i.value.trim()) patch[i.dataset.k] = i.value.trim(); });
      const clr = $('#beRev', b).checked;
      if (!Object.keys(patch).length && !clr) return toast('לא מולא שום שדה');
      for (const id of ids) { const it = S.catalog.find(x => x.id === id); if (!it) continue; Object.assign(it, patch); if (clr) { it.review = false; it.reviewWhy = []; } it.updated = Date.now(); it.synced = false; Sync.pushItem(it); }
      save(); CSEL.clear(); close(); toast(`עודכנו ${ids.length} מוצרים`); go({ selMode: false });
    };
  });
}
function moveForm(ids) {
  const cats = R().catCats;
  const first = S.catalog.find(x => x.id === ids[0]);
  modal(`העברת ${ids.length} מוצרים`, `
    <label>לקטגוריה</label><select id="mvC">${cats.map(c => `<option ${c === (first?.cat) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label>תת-קטגוריה</label><select id="mvS"></select>
    <input id="mvNew" placeholder="שם תת-קטגוריה חדשה" style="display:none;margin-top:6px">
    <button class="btn full" id="mvGo" style="margin-top:14px">📂 העברה</button>`, (b, close) => {
    const fill = () => { const l = subsOf($('#mvC', b).value); $('#mvS', b).innerHTML = `<option value="">— בלי תת-קטגוריה —</option>${l.map(x => `<option>${esc(x)}</option>`).join('')}<option value="__new">＋ תת-קטגוריה חדשה…</option>`; $('#mvNew', b).style.display = 'none'; };
    fill(); $('#mvC', b).onchange = fill;
    $('#mvS', b).onchange = () => { $('#mvNew', b).style.display = $('#mvS', b).value === '__new' ? '' : 'none'; if ($('#mvS', b).value === '__new') $('#mvNew', b).focus(); };
    $('#mvGo', b).onclick = () => {
      const cat = $('#mvC', b).value; let sub = $('#mvS', b).value;
      if (sub === '__new') {
        sub = $('#mvNew', b).value.trim(); if (!sub) return toast('צריך לכתוב שם לתת-הקטגוריה');
        const C = editableRules(); C.subCats[cat] = [...new Set([...(C.subCats[cat] || []), sub])]; rulesChanged();
      }
      let n = 0;
      for (const id of ids) { const it = S.catalog.find(x => x.id === id); if (!it) continue; it.cat = cat; it.sub = sub; it.updated = Date.now(); it.synced = false; Sync.pushItem(it); n++; }
      save(); CSEL.clear(); close(); toast(`הועברו ${n} מוצרים ל"${cat}${sub ? ' › ' + sub : ''}"`, 3000);
      go({ selMode: false, catFilter: cat, subFilter: sub });
    };
  });
}

async function renderCatalog(app) {
  setHeader('קטלוג מוצרים', false);
  const cat = V.catFilter;
  const nRev = S.catalog.filter(x => x.review).length, nPend = S.catalog.filter(x => x.pending).length;
  const sub = V.subFilter || '', subs = cat && cat !== '__review' ? subsOf(cat) : [];
  const list = S.catalog.filter(x => !cat || (cat === '__review' ? x.review : x.cat === cat && (!sub || x.sub === sub))).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const count = (c) => S.catalog.filter(x => x.cat === c).length;
  app.innerHTML = `
    <div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">קטלוג</h2>
      <button class="btn sec sm" id="openBook">📖 דפדוף</button><button class="btn sec sm" id="tryHome">📸 לנסות אצלי</button>
      <button class="btn ${V.selMode ? '' : 'sec'} sm" id="selMode">${V.selMode ? '✓ סיום בחירה' : '☑️ בחירה מרובה'}</button>
      ${S.sync?.code ? `<button class="btn sec sm" id="syncNow">🔄</button>` : ''}</div>
    ${V.selMode ? `<div class="rule" style="margin-bottom:10px"><span class="dot"></span><div>לוחצים על מוצרים כדי לסמן אותם (או "בחר הכל"), ואז בוחרים: העברה, עריכה או מחיקה.</div></div>` : ''}
    ${!Sync.ok() ? `<div class="rule orange" style="margin-bottom:10px"><span class="dot orange"></span><div><b>הקטלוג לא מחובר למאגר המשותף.</b> מה שמוסיפים כאן נשאר רק בטלפון הזה. מתחברים בהגדרות ← מאגר משותף (עם קוד ההזמנה).</div></div>`
      : S.sync.err ? `<div class="rule red" style="margin-bottom:10px"><span class="dot red"></span><div><b>הסנכרון לא עובד כרגע:</b> ${esc(S.sync.err)}</div></div>`
      : (() => { const u = S.catalog.filter(x => !x.synced).length; return u ? `<div class="rule orange" style="margin-bottom:10px"><span class="dot orange"></span><div>⚠️ ${u} מוצרים עוד לא עלו למאגר המשותף. <button class="btn sm" id="syncNow3">🔄 להעלות עכשיו</button></div></div>` : ''; })()}
    <button class="btn full" id="sortIn" style="margin-bottom:10px;background:linear-gradient(135deg,#8a5a3c,#b0764e)">📥 זריקת תמונות למיון אוטומטי (AI)</button>
    ${nPend ? `<button class="btn sec full" id="resume" style="margin-bottom:10px">⏳ ${nPend} תמונות ממתינות למיון — המשך מיון</button>` : ''}
    <div class="catbar">
      <div class="cb ${!cat ? 'on' : ''}" data-c=""><i>🗂️</i><span>הכול</span><b>${S.catalog.length}</b></div>
      ${nRev ? `<div class="cb rev ${cat === '__review' ? 'on' : ''}" data-c="__review"><i>⚠️</i><span>לבירור</span><b>${nRev}</b></div>` : ''}
      ${R().catCats.map(c => { const n = count(c); return `<div class="cb ${cat === c ? 'on' : ''} ${n ? '' : 'empty'}" data-c="${esc(c)}"><i>${(window.CATALOG_ICONS || {})[c] || '🏷️'}</i><span>${esc(c)}</span>${n ? `<b>${n}</b>` : ''}</div>`; }).join('')}
      <div class="cb add" id="addCat"><i>＋</i><span>קטגוריה</span></div>
    </div>
    ${cat && cat !== '__review' ? `<div class="subbox"><div class="row" style="margin-bottom:8px"><span class="grow"><b>${esc(cat)}</b>${sub ? ` › ${esc(sub)}` : ''}</span><button class="btn sec sm" id="editCat">✏️ עריכה</button></div>
      <div class="chips"><span class="chip ${!sub ? 'on' : ''}" data-s="">הכול</span>${subs.map(x => { const n = S.catalog.filter(i => i.cat === cat && i.sub === x).length; return `<span class="chip ${sub === x ? 'on' : ''}" data-s="${esc(x)}">${esc(x)}${n ? ` (${n})` : ''}</span>`; }).join('')}
      <span class="chip" id="addSub" style="border-style:dashed">＋ תת-קטגוריה</span></div></div>` : ''}
    ${cat === '__review' ? `<div class="rule orange" style="margin-bottom:10px"><span class="dot orange"></span><div>אלה מוצרים שה-AI לא היה בטוח בהם. לוחצים על כל אחד, בודקים, מתקנים ושומרים — והסימון יורד.</div></div>` : ''}
    <div class="grid2" style="margin-bottom:12px">
      <button class="btn" id="bulk">📥 הוספת הרבה תמונות</button>
      <button class="btn sec" id="newI">+ מוצר עם פרטים</button></div>
    ${cat ? '' : '<div class="muted" style="margin-bottom:10px">טיפ: בוחרים קודם קטגוריה, ואז כל התמונות שמוסיפים נכנסות אליה.</div>'}
    <div class="swatches" id="clist"></div>
    ${list.length ? '' : '<div class="empty"><b>🧱</b>אין מוצרים בקטגוריה הזו עדיין.</div>'}`;
  app.querySelectorAll('[data-c]').forEach(c => c.onclick = () => stay({ catFilter: c.dataset.c, subFilter: '' }));
  { const on = app.querySelector('.catbar .cb.on'), bar = app.querySelector('.catbar'); if (on && bar) { const r = on.getBoundingClientRect(), br = bar.getBoundingClientRect(); bar.scrollLeft += (r.left + r.width / 2) - (br.left + br.width / 2); } }
  app.querySelectorAll('[data-s]').forEach(c => c.onclick = () => stay({ subFilter: c.dataset.s }));
  if ($('#addSub')) $('#addSub').onclick = () => catForm(cat, true);
  $('#newI').onclick = () => itemForm(null, cat === '__review' ? '' : cat, sub);
  $('#bulk').onclick = () => bulkAdd(cat === '__review' ? '' : cat, sub);
  $('#sortIn').onclick = () => sortInbox();
  $('#selMode').onclick = () => { CSEL.clear(); stay({ selMode: !V.selMode }); };
  $('#openBook').onclick = () => flipbook(collapseGroups(list), 0);
  $('#tryHome').onclick = () => tryAtHome([]);
  selBar(list);
  if ($('#syncNow3')) $('#syncNow3').onclick = async () => { await Sync.run(true); render(); };
  if ($('#resume')) $('#resume').onclick = () => resumeSort();
  $('#addCat').onclick = () => catForm(null);
  if ($('#editCat')) $('#editCat').onclick = () => catForm(cat);
  if ($('#syncNow')) $('#syncNow').onclick = () => Sync.run(true);
  const cl = $('#clist');
  for (const it of (V.selMode ? list : collapseGroups(list))) {
    const d = document.createElement('div'); d.className = 'sw';
    d.innerHTML = `<div class="c"><img loading="lazy"></div>${it.review ? `<span class="flag">${it.pending ? '⏳' : '!'}</span>` : ''}${it.angles?.length ? `<span class="spin3d" title="${it.angles.length + 1} זוויות">🔄</span>` : ''}<div class="n">${esc(siblings(it).length > 1 ? stripColor(it.name) : it.name)}</div>${dotsHTML(it)}${it.sub && !V.subFilter ? `<div class="m">${esc(it.sub)}</div>` : ''}${it.model ? `<div class="m" dir="ltr">${esc(it.model)}</div>` : ''}`;
    cl.appendChild(d);
    if (V.selMode && CSEL.has(it.id)) d.classList.add('picked');
    d.onclick = () => { if (!V.selMode) return itemForm(it); CSEL.has(it.id) ? CSEL.delete(it.id) : CSEL.add(it.id); d.classList.toggle('picked'); selBar(list); };
    const im = d.querySelector('img'); im.onload = () => { const r = im.naturalWidth / im.naturalHeight; if (r > 1.5 || r < 0.67) im.classList.add('fit'); };
    // ברשימה מציגים תמונה ממוזערת קטנה (חוסך זיכרון — לא קורס גם עם אלפי מוצרים). את המלאה טוענים רק כשפותחים מוצר.
    if (it.th) im.src = it.th;
    else getImg(it.img).then(async src => { src = src || (it.img ? await Sync.fetchImg(it.img) : ''); im.src = src || 'icon.svg'; if (src) { it.th = await makeThumb(src); save(); } });
  }
}

// =====================================================================
// זיהוי כפילויות — "טביעת אצבע" של תמונה (dHash 64 ביט). תמונה זהה או כמעט זהה (גם אם הוקטנה/נדחסה) תיתן טביעה קרובה
const makeThumb = (d) => shrinkData(d, 240, 0.72);
async function imgHash(dataURL) {
  try {
    const im = await loadImg(dataURL);
    const c = document.createElement('canvas'); c.width = 9; c.height = 8;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, 9, 8);
    const d = x.getImageData(0, 0, 9, 8).data; let h = '';
    for (let y = 0; y < 8; y++) for (let i = 0; i < 8; i++) {
      const a = (y * 9 + i) * 4, b = a + 4;
      h += (d[a] * .3 + d[a + 1] * .59 + d[a + 2] * .11) > (d[b] * .3 + d[b + 1] * .59 + d[b + 2] * .11) ? '1' : '0';
    }
    return h;
  } catch { return ''; }
}
const hashDist = (a, b) => { if (!a || !b || a.length !== b.length) return 99; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
// משלים טביעות לפריטים ישנים שאין להם (פעם אחת)
async function ensureHashes() {
  for (const it of S.catalog) {
    if (it.ph || !it.img) continue;
    const d = await getImg(it.img); if (d) it.ph = await imgHash(d);
  }
}
async function findDuplicate(hash, exceptId) {
  if (!hash) return null;
  await ensureHashes();
  let best = null, bd = 99;
  for (const it of S.catalog) { if (it.id === exceptId) continue; const d = hashDist(hash, it.ph); if (d < bd) { bd = d; best = it; } }
  return bd <= 6 ? best : null;
}

// =====================================================================
// זיהוי מוצר בעזרת AI — שם, קטגוריה, דגם, צבע, מידות וכו' מתוך התמונה
async function aiIdentify(dataURL, onStatus) {
  if (!S.settings.apiKey) throw new Error('צריך מפתח AI בהגדרות.');
  const small = await shrinkData(dataURL, 1024, 0.85);
  const [h, b64] = small.split(',');
  const cats = R().catCats;
  const sys = `You are an expert interior-design materials and products cataloguer for the Israeli market.
Identify the product/material in the photo. It may be a shop shelf, a sample board, a catalog page, a box label or a product photo.
Return ONLY JSON with these keys (Hebrew values except where noted):
{"name": short descriptive Hebrew product name (e.g. "גרניט פורצלן דמוי שיש קלקטה מבריק"),
 "category": EXACTLY one of: ${JSON.stringify(cats)},
 "subcategory": if the chosen category has subcategories in this map, EXACTLY one of them, else "": ${JSON.stringify(Object.fromEntries(cats.filter(c => subsOf(c).length).map(c => [c, subsOf(c)])))},
 "model": model / series / SKU code exactly as printed in the photo (keep original Latin letters and digits), or "" if no code is visible,
 "brand": brand or supplier name if printed/visible, else "",
 "dims": size if printed or clearly standard (e.g. "60×120 ס\\"מ"), else "",
 "color": color and finish in Hebrew (e.g. "לבן מבריק", "אלון טבעי מט"),
 "material": material in Hebrew,
 "price": price if a price tag is visible, else "",
 "note": one short Hebrew sentence describing look/texture/style useful for an AI image prompt,
 "confidence": "high" | "medium" | "low"}
CRITICAL: never invent a model number, brand or price. Only copy them if they are actually readable in the photo. Read every label/sticker/text carefully.`;
  const txt = await geminiText([{ text: sys }, { inline_data: { mime_type: h.match(/data:(.*?);/)?.[1] || 'image/jpeg', data: b64 } }], true, onStatus);
  let j; try { j = JSON.parse(txt.replace(/^```json|```$/g, '').trim()); } catch { throw new Error('ה-AI החזיר תשובה לא מובנת. נסו שוב.'); }
  if (!cats.includes(j.category)) j.category = cats.includes('אחר') ? 'אחר' : cats[0];
  j.sub = subsOf(j.category).includes(j.subcategory) ? j.subcategory : '';
  return j;
}

// =====================================================================
// 📥 מיון אוטומטי — זורקים את כל התמונות למקום אחד, ה-AI ממיין, ומה שלא בטוח מסומן "לבירור"
async function aiWebModel(it, dataURL, onStatus) {
  // חיפוש בגוגל (Grounding) — מציע התאמות אפשריות עם קישורים. לא מחליט לבד.
  const small = await shrinkData(dataURL, 768, 0.8); const [h, b64] = small.split(',');
  const q = `This photo shows: ${it.name}${it.color ? ', ' + it.color : ''}${it.supplier ? ', brand ' + it.supplier : ''}${it.model ? ', code ' + it.model : ''} (category: ${it.cat}).
Search the web (prefer Israeli suppliers and shops, e.g. Negev Ceramics, Mody, Halamish, Ceramica Ltd, Hamat, Kirsch, Tambour, Nirlat and similar) for the commercial product that best matches this photo.
Reply ONLY with JSON (no markdown): {"matches":[{"name": Hebrew or original product name, "supplier": "...", "model": exact model/SKU as shown on the supplier site, "url": product page url, "why": short Hebrew reason}], "sure": true|false}
Max 3 matches. If you cannot find a convincing match, return {"matches":[], "sure": false}. Never invent model numbers or urls.`;
  const txt = await geminiText([{ text: q }, { inline_data: { mime_type: h.match(/data:(.*?);/)?.[1] || 'image/jpeg', data: b64 } }], false, onStatus, { tools: [{ google_search: {} }], timeout: 60000 });
  let j = {}; try { j = JSON.parse((txt.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch {}
  const links = (AI_LAST?.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map(c => c.web).filter(Boolean).map(w => ({ title: w.title || '', url: w.uri }));
  return { matches: (j.matches || []).filter(m => m && m.name).slice(0, 3), sure: !!j.sure, links: links.slice(0, 5) };
}
// באילו קטגוריות חובה קוד יצרן / דגם (חומרי גמר וקבועים). באקססוריז ודקורציה — מספיקים תמונה, צבע וגובה.
const CODE_CATS = ['ריצוף', 'חיפוי קירות', 'משטחים', 'צבע / טיח', 'כלים סניטריים', 'ברזים', 'נגרות וארונות', 'דלתות וחלונות', 'מוצרי חשמל'];
// בתאורה חשוב המפרט (הברגה, צורת נורה, גוון אור K, הספק) — לא מק"ט
function codeRequired(cat) { return CODE_CATS.includes(cat); }
async function sortOne(it, data, useWeb, onStatus) {
  const reasons = [];
  const a = await aiIdentify(data, onStatus);
  Object.assign(it, { name: a.name || it.name, cat: a.category || 'אחר', sub: a.sub || '', model: a.model || '', supplier: a.brand || '', dims: a.dims || '', color: a.color || '', price: a.price || '', note: [a.material, a.note].filter(Boolean).join(' · '), pending: false });
  const needCode = codeRequired(it.cat);
  if (a.confidence === 'low' || (needCode && a.confidence !== 'high')) reasons.push(a.confidence === 'low' ? 'הזיהוי לא ודאי — לבדוק מה זה בדיוק' : 'זיהוי סביר אבל לא בטוח — לוודא');
  if (needCode && !it.model && useWeb) {
    try {
      onStatus && onStatus('🔎 מחפש את הדגם ברשת…');
      const w = await aiWebModel(it, data, onStatus);
      it.web = w;
      if (w.matches.length) reasons.push(`נמצאו ${w.matches.length} התאמות אפשריות ברשת — לבחור את הנכונה ולוודא בקישור`);
      else reasons.push('לא נמצא דגם ברשת — לברר בחנות / אצל הספק');
    } catch { reasons.push('חסר מספר דגם (החיפוש ברשת לא הצליח כרגע)'); }
  } else if (needCode && !it.model) reasons.push('חסר קוד יצרן / דגם — לברר אצל הספק או לצלם את התווית');
  it.review = reasons.length > 0; it.reviewWhy = reasons;
  it.updated = Date.now();
}
function sortInbox() {
  modal('📥 מיון אוטומטי', `
    <div class="muted">זורקים לכאן את כל התמונות — מכל הקטגוריות יחד. ה-AI יזהה כל תמונה, ישים אותה בקטגוריה, ייתן שם ודגם.
      מה שהוא לא בטוח בו יסומן <b style="color:var(--orange)">⚠️ לבירור</b> עם הסבר מה לבדוק.</div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="sWeb" checked style="width:auto"> לחפש מספר דגם ברשת כשהוא לא כתוב בתמונה</label>
    <div class="muted" style="font-size:12px">התמונות לא הולכות לאיבוד: כל תמונה נשמרת מיד, גם אם הזיהוי נכשל (אז אפשר להמשיך מאוחר יותר).</div>
    <div class="grid2" style="margin-top:12px"><button class="btn" id="sCam">📷 צילום</button><button class="btn" id="sGal">🖼️ מהגלריה</button></div>
    <div id="sProg" style="margin-top:12px"></div>`, (b, close) => {
    const run = async (camera) => {
      if (!S.settings.apiKey) return toast('צריך מפתח AI בהגדרות');
      const files = await pickFiles(!camera, camera); if (!files.length) return;
      const useWeb = $('#sWeb', b).checked;
      const pr = $('#sProg', b); b.querySelectorAll('button').forEach(x => x.disabled = true);
      await ensureHashes();
      const queue = []; let dups = 0;
      for (let i = 0; i < files.length; i++) {
        pr.innerHTML = `<div class="muted">שומר תמונה ${i + 1} מתוך ${files.length}…</div>`;
        const data = await catalogImageData(files[i]); const ph = await imgHash(data);
        if (await findDuplicate(ph)) { dups++; continue; }
        const it = { id: uid(), name: 'ממתין למיון', cat: 'אחר', supplier: '', model: '', dims: '', color: '', price: '', link: '', note: '', ph, th: await makeThumb(data), pending: true, review: true, reviewWhy: ['עוד לא מוין'], img: await putImg(data), updated: Date.now() };
        S.catalog.push(it); Sync.pushItem(it, data); queue.push([it, data]);
      }
      save();
      await sortQueue(queue, useWeb, pr, dups);
      b.querySelectorAll('button').forEach(x => x.disabled = false);
      render();
    };
    $('#sCam', b).onclick = () => run(true);
    $('#sGal', b).onclick = () => run(false);
  });
}
async function sortQueue(queue, useWeb, pr, dups = 0) {
  let ok = 0, rev = 0, fail = 0;
  for (let i = 0; i < queue.length; i++) {
    const [it, data] = queue[i];
    const line = (m) => pr.innerHTML = `<div class="rule"><span class="dot"></span><div><b>ממיין ${i + 1} מתוך ${queue.length}</b><br><span class="muted">${esc(m)}</span></div></div>`;
    line('מזהה…');
    try { await sortOne(it, data, useWeb, line); ok++; if (it.review) rev++; Sync.pushItem(it); save(); }
    catch (e) { fail++; it.reviewWhy = ['המיון האוטומטי לא הצליח (' + e.message + ') — אפשר ללחוץ "המשך מיון" מאוחר יותר']; save(); if (/מפתח|חיוב|403/.test(e.message)) break; }
  }
  pr.innerHTML = `<div class="rule green"><span class="dot green"></span><div><b>סיום!</b> מוינו ${ok} תמונות.
    ${rev ? `<br>⚠️ ${rev} מסומנות לבירור — בקטלוג לוחצים על "⚠️ לבירור".` : ''}
    ${fail ? `<br>⏳ ${fail} לא מוינו (עומס / תקלה) — נשמרו, ואפשר "המשך מיון" אחר כך.` : ''}
    ${dups ? `<br>🔁 ${dups} דולגו כי כבר קיימות בקטלוג.` : ''}</div></div>`;
}
async function resumeSort() {
  const pend = S.catalog.filter(x => x.pending);
  if (!pend.length) return toast('אין תמונות שממתינות למיון');
  modal('⏳ המשך מיון', `<div id="sProg"></div>`, async (b) => {
    const queue = [];
    for (const it of pend) { const d = await getImg(it.img) || await Sync.fetchImg(it.img); if (d) queue.push([it, d]); }
    await sortQueue(queue, true, $('#sProg', b)); render();
  });
}

async function bulkAdd(cat, sub = '') {
  if (!cat) {
    return modal('לאיזו קטגוריה?', `<div class="chips">${R().catCats.map(c => `<span class="chip" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</div>`, (b, close) => {
      b.querySelectorAll('[data-c]').forEach(ch => ch.onclick = () => { close(); V.catFilter = ch.dataset.c; render(); bulkAdd(ch.dataset.c); });
    });
  }
  const files = await pickFiles(true); if (!files.length) return;
  const useAI = !!S.settings.apiKey && confirm(`לזהות אוטומטית עם AI את שם המוצר, הדגם והפרטים של ${files.length} התמונות?\n(אישור = כן, ביטול = רק להוסיף)`);
  let n = S.catalog.filter(x => x.cat === cat).length, added = 0, dups = [], aiFail = 0;
  await ensureHashes();
  for (let i = 0; i < files.length; i++) {
    toast(`מוסיף תמונה ${i + 1} מתוך ${files.length}…`, 1500);
    const data = await catalogImageData(files[i]);
    const ph = await imgHash(data);
    const dup = await findDuplicate(ph);
    if (dup) { dups.push(dup.name); continue; }
    const it = { id: uid(), name: `${sub || cat} ${++n}`, cat, sub, supplier: '', model: '', dims: '', color: '', price: '', link: '', note: '', ph, th: await makeThumb(data), updated: Date.now() };
    if (useAI) {
      try {
        toast(`🤖 מזהה מוצר ${i + 1} מתוך ${files.length}…`, 20000);
        const a = await aiIdentify(data);
        Object.assign(it, { name: a.name || it.name, sub: subsOf(cat).includes(a.sub) ? a.sub : (it.sub || ''), model: a.model || '', supplier: a.brand || '', dims: a.dims || '', color: a.color || '', price: a.price || '', note: [a.material, a.note].filter(Boolean).join(' · ') });
      } catch { aiFail++; }
    }
    it.img = await putImg(data); it.cut = ''; it.cutTried = 0;
    S.catalog.push(it); Sync.pushItem(it, data); added++;
  }
  save(); render();
  const msg = [`נוספו ${added} תמונות ל"${cat}".`];
  if (dups.length) msg.push(`${dups.length} דולגו כי כבר קיימות בקטלוג (${dups.slice(0, 3).join(', ')}${dups.length > 3 ? '…' : ''}).`);
  if (aiFail) msg.push(`ב-${aiFail} הזיהוי האוטומטי לא הצליח — אפשר לפתוח ולנסות שוב.`);
  if (dups.length || aiFail) alert(msg.join('\n')); else toast(msg[0], 3000);
}

// 🔄 צפייה בזוויות "כמו תלת מימד": גוררים ימינה/שמאלה על התמונה והיא מתחלפת בין הזוויות
function attachSpin(img, srcs, onChange) {
  let i = 0, sx = null, si = 0;
  const show = (n) => { if (!srcs.length) return; i = ((n % srcs.length) + srcs.length) % srcs.length; img.src = srcs[i]; onChange && onChange(i); };
  img.style.touchAction = 'pan-y'; img.style.cursor = srcs.length > 1 ? 'grab' : '';
  img.onpointerdown = (e) => { if (srcs.length < 2) return; sx = e.clientX; si = i; img.setPointerCapture(e.pointerId); };
  img.onpointermove = (e) => { if (sx === null) return; const step = Math.max(22, img.clientWidth / (srcs.length * 1.6)); show(si + Math.round((sx - e.clientX) / step)); };
  img.onpointerup = img.onpointercancel = () => { sx = null; };
  show(0);
  return { show, get i() { return i; } };
}
async function loadImgs(ids) { const out = []; for (const id of ids) { const d = await getImg(id) || await Sync.fetchImg(id); if (d) out.push(d); } return out; }

function itemForm(it, defCat, defSub) {
  let newImg = null;
  modal(it ? 'עריכת מוצר' : 'מוצר חדש', `
    <div id="imgBox" style="text-align:center"><img id="ip" style="max-width:100%;max-height:260px;border-radius:12px;display:none;user-select:none;-webkit-user-drag:none">
      <div id="spinHint" class="muted" style="font-size:12px;margin-top:4px"></div>
      <div id="angStrip" class="angstrip"></div>
      <div class="grid2" style="margin-top:8px"><button class="btn sec" id="pickI">📷 ${it ? 'החלפת תמונה' : 'תמונת המוצר'}</button>
        <button class="btn sec" id="addAng">🔄 + זוויות נוספות</button></div>
      ${it ? `<div class="row" style="justify-content:center;gap:10px;margin-top:8px">${siblings(it).length > 1 ? `<span class="muted">צבעים:</span>${dotsHTML(it, it.id)}` : ''}<button class="btn sec sm" id="mkVar">🎨 גרסאות צבע</button></div>` : ''}
      <button class="btn full" id="aiId" style="margin-top:8px;${it?.img ? '' : 'display:none'}">🤖 זיהוי אוטומטי מהתמונה</button>
      <div id="aiMsg" class="muted" style="margin-top:6px"></div></div>
    ${it?.review ? `<div class="rule orange" style="margin-top:10px"><span class="dot orange"></span><div><b>⚠️ לבירור:</b><br>${(it.reviewWhy || []).map(esc).join('<br>')}
      ${it.web?.matches?.length ? `<div style="margin-top:8px"><b>התאמות שנמצאו ברשת</b> (לוחצים כדי למלא, ופותחים את הקישור כדי לוודא):</div>
        ${it.web.matches.map((m, i) => `<div class="card" style="margin:6px 0;padding:8px"><b>${esc(m.name)}</b>${m.supplier ? ' · ' + esc(m.supplier) : ''}${m.model ? `<br><span dir="ltr">${esc(m.model)}</span>` : ''}${m.why ? `<div class="muted" style="font-size:12px">${esc(m.why)}</div>` : ''}
          <div class="row" style="margin-top:6px;gap:6px"><button class="btn sm" data-m="${i}">✓ זה המוצר</button>${m.url ? `<a class="btn sec sm" href="${esc(m.url)}" target="_blank" rel="noopener">🔗 לבדיקה</a>` : ''}</div></div>`).join('')}` : ''}
      ${!it.web?.matches?.length && it.web?.links?.length ? `<div style="margin-top:6px">קישורים שעשויים לעזור: ${it.web.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || 'קישור')}</a>`).join(' · ')}</div>` : ''}
      <div class="muted" style="font-size:12px;margin-top:6px">כשמסיימים לבדוק — לוחצים "שמירה" והסימון יורד.</div></div></div>` : ''}
    <label>שם המוצר</label><input id="in" value="${esc(it?.name || '')}" placeholder="למשל: גרניט פורצלן דמוי בטון 60×120">
    <div class="grid2"><div><label>קטגוריה</label><select id="ic">${R().catCats.map(c => `<option ${(it?.cat || defCat) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div><label>תת-קטגוריה</label><select id="isub"></select></div></div>
    <div class="grid2"><div><label>קוד יצרן / דגם</label><input id="im" value="${esc(it?.model || '')}" dir="ltr" placeholder="CAL-60120"></div>
      <div><label>ספק / מותג</label><input id="is" value="${esc(it?.supplier || '')}"></div></div>
    <div class="grid2"><div><label>מידות</label><input id="id" value="${esc(it?.dims || '')}" placeholder="60×120 ס&quot;מ"></div>
      <div><label>צבע / גימור</label><input id="ico" value="${esc(it?.color || '')}" placeholder="אפור מט"></div></div>
    <div class="grid2"><div><label>מחיר</label><input id="ipr" value="${esc(it?.price || '')}" placeholder='120 ₪ למ"ר'></div>
      <div><label>קישור</label><input id="il" value="${esc(it?.link || '')}" inputmode="url"></div></div>
    <label>הערה</label><textarea id="ino">${esc(it?.note || '')}</textarea>
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>
    ${it ? '<div style="height:8px"></div><button class="btn danger full" id="del">מחיקת המוצר</button>' : ''}`, async (b, close) => {
    if (it) {
      b.querySelectorAll('[data-vid]').forEach(dt => dt.onclick = () => { const v = S.catalog.find(x => x.id === dt.dataset.vid); if (v && v.id !== it.id) { close(); setTimeout(() => itemForm(v), 120); } });
      const mv = b.querySelector('#mkVar'); if (mv) mv.onclick = () => variantsDialog(it, () => { close(); render(); setTimeout(() => itemForm(it), 150); });
    }
    const ip = $('#ip', b);
    const fillSubs = (want) => { const l = subsOf($('#ic', b).value); $('#isub', b).innerHTML = `<option value="">—</option>` + l.map(x => `<option ${x === want ? 'selected' : ''}>${esc(x)}</option>`).join(''); $('#isub', b).disabled = !l.length; };
    fillSubs(it?.sub ?? defSub); $('#ic', b).onchange = () => fillSubs('');
    let mainSrc = it?.img ? (await getImg(it.img) || await Sync.fetchImg(it.img) || '') : '';
    let angIds = [...(it?.angles || [])], angSrcs = await loadImgs(angIds), newAngs = [], removed = [];
    let spin = null;
    const refreshViews = () => {
      const srcs = [mainSrc, ...angSrcs, ...newAngs].filter(Boolean);
      ip.style.display = srcs.length ? '' : 'none';
      $('#spinHint', b).textContent = srcs.length > 1 ? `↔ גוררים על התמונה כדי לסובב · ${srcs.length} זוויות` : '';
      const strip = $('#angStrip', b);
      const all = [{ s: mainSrc, main: true }, ...angSrcs.map((s, k) => ({ s, k, old: true })), ...newAngs.map((s, k) => ({ s, k, nw: true }))].filter(x => x.s);
      strip.innerHTML = all.length > 1 ? all.map((x, j) => `<div class="ang" data-j="${j}"><img src="${x.s}">${x.main ? '' : `<button data-rm="${j}">✕</button>`}</div>`).join('') : '';
      spin = attachSpin(ip, srcs, (n) => strip.querySelectorAll('.ang').forEach((e, j) => e.classList.toggle('on', j === n)));
      strip.querySelectorAll('.ang').forEach(e => e.onclick = (ev) => { if (ev.target.dataset.rm) return; spin.show(+e.dataset.j); });
      strip.querySelectorAll('[data-rm]').forEach(btn => btn.onclick = () => {
        const x = all[+btn.dataset.rm];
        if (x.old) { removed.push(angIds[x.k]); angIds.splice(x.k, 1); angSrcs.splice(x.k, 1); } else newAngs.splice(x.k, 1);
        refreshViews();
      });
    };
    refreshViews();
    $('#addAng', b).onclick = async () => {
      const files = await pickPhoto(true); if (!files.length) return;
      for (const f of files) newAngs.push(await catalogImageData(f));
      if (!mainSrc && !newImg) { newImg = newAngs.shift(); mainSrc = newImg; }
      refreshViews(); $('#aiId', b).style.display = '';
    };
    let newHash = '';
    $('#pickI', b).onclick = async () => {
      const [f] = await pickPhoto(); if (!f) return;
      const data = await catalogImageData(f); const h = await imgHash(data);
      const dup = await findDuplicate(h, it?.id);
      if (dup && !confirm(`התמונה הזו כבר קיימת בקטלוג:\n"${dup.name}"${dup.model ? ' · ' + dup.model : ''} (${dup.cat})\n\nלהשתמש בה בכל זאת?`)) return;
      newImg = data; newHash = h; mainSrc = data; refreshViews(); $('#aiId', b).style.display = '';
    };
    b.querySelectorAll('[data-m]').forEach(bt => bt.onclick = () => {
      const m = it.web.matches[+bt.dataset.m];
      if (m.name) $('#in', b).value = m.name; if (m.model) $('#im', b).value = m.model; if (m.supplier) $('#is', b).value = m.supplier; if (m.url) $('#il', b).value = m.url;
      toast('מולא — לוודא בקישור ואז לשמור');
    });
    $('#aiId', b).onclick = async () => {
      const src = newImg || mainSrc; if (!src) return toast('קודם בוחרים תמונה');
      const btn = $('#aiId', b), msg = $('#aiMsg', b); btn.disabled = true; msg.textContent = '🤖 מזהה…';
      try {
        const a = await aiIdentify(src, (m) => msg.textContent = m);
        const set = (id, v) => { if (v) $(id, b).value = v; };
        set('#in', a.name); set('#im', a.model); set('#is', a.brand); set('#id', a.dims); set('#ico', a.color); set('#ipr', a.price);
        if (a.category) { $('#ic', b).value = a.category; fillSubs(a.sub || ''); }
        const note = [a.material, a.note].filter(Boolean).join(' · '); if (note && !$('#ino', b).value.trim()) $('#ino', b).value = note;
        msg.innerHTML = `✓ זוהה (${a.confidence === 'high' ? 'ביטחון גבוה' : a.confidence === 'low' ? 'ביטחון נמוך — כדאי לבדוק' : 'ביטחון בינוני'}). ${a.model ? '' : 'לא נמצא מספר דגם כתוב בתמונה — אפשר לצלם את המדבקה/התווית ולנסות שוב.'} בודקים ומתקנים לפני שמירה.`;
      } catch (e) { msg.textContent = e.message; }
      btn.disabled = false;
    };
    $('#ok', b).onclick = async () => {
      const name = $('#in', b).value.trim(); if (!name) return toast('צריך שם למוצר');
      const d = { review: false, reviewWhy: [], pending: false, name, cat: $('#ic', b).value, sub: $('#isub', b).value, model: $('#im', b).value.trim(), supplier: $('#is', b).value.trim(), dims: $('#id', b).value.trim(), color: $('#ico', b).value.trim(), price: $('#ipr', b).value.trim(), link: $('#il', b).value.trim(), note: $('#ino', b).value.trim(), updated: Date.now() };
      if (newImg) { d.img = await putImg(newImg); d.ph = newHash || await imgHash(newImg); d.th = await makeThumb(newImg); d.cut = ''; d.cutTried = 0; }
      for (const a of newAngs) angIds.push(await putImg(a));
      d.angles = angIds; for (const r of removed) delImg(r);
      let target = it;
      if (it) Object.assign(it, d); else { target = { id: uid(), ...d }; S.catalog.push(target); }
      Sync.pushItem(target, newImg || (newAngs.length ? mainSrc : null));
      save(); close(); render();
    };
    if (it) $('#del', b).onclick = async () => {
      if (!confirm('למחוק את המוצר? הוא יימחק גם אצל השותפים.')) return;
      await delImg(it.img); S.catalog = S.catalog.filter(x => x !== it); Sync.deleteItem(it); save(); close(); render();
    };
  });
}

// =====================================================================
// סנכרון משותף (Firebase Firestore דרך REST — בלי ספריות)
// מבנה: ws/{code}/items/{id}  — פרטי מוצר
//        ws/{code}/imgs/{imgId} — התמונה (base64)
// =====================================================================
const Sync = {
  busy: false,
  ok() { return !!(S.sync?.projectId && S.sync?.apiKey && S.sync?.code); },
  tag() { return S.sync?.code ? S.sync.code.slice(-4).toUpperCase() : ''; },
  async diag() {
    const local = S.catalog.length, uns = S.catalog.filter(x => !x.synced).length;
    const remote = (await this.listItems()).filter(d => !d.fields?.deleted?.booleanValue).length;
    return { local, uns, remote };
  },
  base() { return `https://firestore.googleapis.com/v1/projects/${S.sync.projectId}/databases/(default)/documents/ws/${S.sync.code}`; },
  async req(path, opt = {}) {
    const url = this.base() + path + (path.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(S.sync.apiKey);
    const r = await fetch(url, { ...opt, headers: { 'Content-Type': 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) {
      const j = await r.json().catch(() => ({})); const m = j?.error?.message || '';
      if (r.status === 429 || /quota|exhausted/i.test(m)) throw new Error('נגמרה המכסה היומית החינמית של המאגר (Firebase). היא מתאפסת כל יום בערך ב-10:00 בבוקר. מה שהוספתם שמור בטלפון ויעלה אוטומטית אחר כך.');
      throw new Error(m || ('שגיאת סנכרון ' + r.status));
    }
    return r.json();
  },
  meta(it) { const { img, updated, cutPending, cutTried, ...rest } = it; return rest; },
  async pushItem(it, imgData) {
    if (!this.ok()) return;
    try {
      if (imgData && it.img) await this.req(`/imgs/${it.img}`, { method: 'PATCH', body: JSON.stringify({ fields: { data: { stringValue: imgData } } }) });
      if (it.cut && (imgData || it.cutPending)) { const cd = await getImg(it.cut); if (cd) await this.req(`/imgs/${it.cut}`, { method: 'PATCH', body: JSON.stringify({ fields: { data: { stringValue: cd } } }) }); delete it.cutPending; }
      if (imgData) for (const a of it.angles || []) { const ad = await getImg(a); if (ad) await this.req(`/imgs/${a}`, { method: 'PATCH', body: JSON.stringify({ fields: { data: { stringValue: ad } } }) }); }
      await this.req(`/items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ fields: {
        meta: { stringValue: JSON.stringify(this.meta(it)) }, img: { stringValue: it.img || '' },
        updated: { integerValue: String(it.updated || Date.now()) }, deleted: { booleanValue: false } } }) });
      it.synced = true; save();
    } catch (e) { it.synced = false; save(); console.warn(e); }
  },
  async deleteItem(it) {
    if (!this.ok()) return;
    S.tombs = S.tombs || []; S.tombs.push(it.id); save();
    try {
      await this.req(`/items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { deleted: { booleanValue: true }, updated: { integerValue: String(Date.now()) }, meta: { stringValue: '{}' }, img: { stringValue: '' } } }) });
      if (it.img) await this.req(`/imgs/${it.img}`, { method: 'DELETE' });
      S.tombs = S.tombs.filter(x => x !== it.id); save();
    } catch (e) { console.warn(e); }
  },
  async fetchImg(id) {
    if (!this.ok() || !id) return '';
    try { const d = await this.req(`/imgs/${id}`); const v = d?.fields?.data?.stringValue; if (v) { imgCache[id] = v; await DB.set(id, v); } return v || ''; }
    catch { return ''; }
  },
  async changedSince(ts) {
    const parent = `projects/${S.sync.projectId}/databases/(default)/documents/ws/${S.sync.code}`;
    const r = await fetch(`https://firestore.googleapis.com/v1/${parent}:runQuery?key=${encodeURIComponent(S.sync.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'items' }], where: { fieldFilter: { field: { fieldPath: 'updated' }, op: 'GREATER_THAN', value: { integerValue: String(Math.max(0, Math.floor(ts))) } } } } })
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((Array.isArray(j) ? j[0] : j)?.error?.message || ('שגיאת סנכרון ' + r.status)); }
    const arr = await r.json();
    return arr.map(x => x.document).filter(Boolean);
  },
  async listItems() {
    const out = []; let token = '';
    do {
      const d = await this.req(`/items?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
      (d?.documents || []).forEach(doc => out.push(doc)); token = d?.nextPageToken || '';
    } while (token);
    return out;
  },
  async run(manual) {
    if (!this.ok() || this.busy) return;
    this.busy = true; if (manual) toast('מסנכרן…');
    try {
      // מחיקות שלא נשלחו
      for (const id of [...(S.tombs || [])]) await this.deleteItem({ id });
      const rulesGot = await this.syncRules();
      const aiGot = await this.syncAI();
      if (aiGot) toast('מפתח ה-AI התקבל מהמאגר המשותף ✓');
      // קוראים מהענן רק מה שהשתנה מאז הפעם הקודמת (חוסך קריאות — במכסה החינמית יש 50,000 קריאות ביום)
      const full = !S.sync.cursor || manual === 'full' || Date.now() - (S.sync.fullAt || 0) > 24 * 3600e3;
      const remote = full ? await this.listItems() : await this.changedSince(S.sync.cursor - 15 * 60e3);
      let got = 0, sent = 0, maxU = S.sync.cursor || 0;
      const seen = new Set();
      for (const doc of remote) {
        const id = doc.name.split('/').pop(); seen.add(id);
        const f = doc.fields || {}; const rUpd = +(f.updated?.integerValue || 0); if (rUpd > maxU) maxU = rUpd;
        const local = S.catalog.find(x => x.id === id);
        if (f.deleted?.booleanValue) { if (local) { await delImg(local.img); S.catalog = S.catalog.filter(x => x !== local); got++; } continue; }
        if (!local || rUpd > (local.updated || 0)) {
          const meta = JSON.parse(f.meta?.stringValue || '{}');
          const it = { ...meta, id, img: f.img?.stringValue || '', updated: rUpd, synced: true };
          if (local) Object.assign(local, it); else S.catalog.push(it);
          got++;
        } else if (local && (local.updated || 0) > rUpd) { await this.pushItem(local, await getImg(local.img)); sent++; }
      }
      // מה שעוד לא עלה מהטלפון הזה (בסנכרון מלא: גם מה שחסר בענן)
      for (const it of S.catalog.filter(x => !x.synced || (full && !seen.has(x.id)))) { await this.pushItem(it, await getImg(it.img)); if (it.synced) sent++; }
      S.sync.cursor = maxU; if (full) S.sync.fullAt = Date.now(); S.sync.err = '';
      S.sync.last = Date.now(); save(); setTimeout(ensureCuts, 2000);
      if (manual || got) toast(`הסנכרון הושלם${got ? ` · התקבלו ${got} עדכונים` : ''}${sent ? ` · נשלחו ${sent}` : ''}`);
      if (rulesGot && manual) toast('הכללים עודכנו מהמאגר');
      if ((got && V.tab === 'catalog') || ((rulesGot || aiGot) && V.tab !== 'projects')) render();
    } catch (e) { S.sync.err = e.message; save(); if (manual) toast('הסנכרון נכשל: ' + e.message, 6000); if (V.tab === 'catalog') render(); }
    finally { this.busy = false; }
  },
  async pushRules() {
    if (!this.ok() || !S.custom) return;
    try { await this.req('/meta/rules', { method: 'PATCH', body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(S.custom) }, updated: { integerValue: String(S.custom.updated || 0) } } }) }); }
    catch (e) { console.warn(e); }
  },
  async syncRules() {
    const d = await this.req('/meta/rules');
    const rUpd = +(d?.fields?.updated?.integerValue || 0), lUpd = S.custom?.updated || 0;
    if (d && rUpd > lUpd) { S.custom = JSON.parse(d.fields.data.stringValue); save(); fixLists(); migrateTaxonomy(); return true; }
    if (S.custom && lUpd > rUpd) await this.pushRules();
    return false;
  },
  async pushAI() {
    const st = S.settings;
    if (!this.ok() || st.shareAI === false) return;
    try { await this.req('/meta/ai', { method: 'PATCH', body: JSON.stringify({ fields: { key: { stringValue: st.apiKey || '' }, model: { stringValue: st.model || DEFAULT_MODEL }, updated: { integerValue: String(st.aiUpdated || Date.now()) } } }) }); }
    catch (e) { console.warn(e); }
  },
  async syncAI() {
    const st = S.settings; if (st.shareAI === false) return false;
    const d = await this.req('/meta/ai'); const f = d?.fields;
    const rUpd = +(f?.updated?.integerValue || 0), lUpd = st.aiUpdated || 0;
    if (f && rUpd > lUpd) { st.apiKey = f.key?.stringValue || ''; st.model = f.model?.stringValue || DEFAULT_MODEL; st.aiUpdated = rUpd; save(); return true; }
    if (lUpd > rUpd && st.apiKey) await this.pushAI();
    return false;
  },
  inviteCode() { return btoa(unescape(encodeURIComponent(JSON.stringify({ p: S.sync.projectId, k: S.sync.apiKey, c: S.sync.code })))); },
  join(code) {
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!o.p || !o.k || !o.c) throw 0;
      S.sync = { projectId: o.p, apiKey: o.k, code: o.c }; save(); toast('הצטרפת למאגר המשותף 🤝'); this.run(true); return true;
    } catch { toast('קוד ההזמנה לא תקין'); return false; }
  }
};
setInterval(() => { if (document.visibilityState === 'visible') Sync.run(false); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.run(false); });

// =====================================================================
// כללים (ספר הכללים)
// =====================================================================
// 📐 כללי שרטוט — מתוך ספר הכללים; חלים על השרטוט, התלת־ממד, האזהרות וה-AI
function planRulesNow() { const b = window.PLAN_RULES, c = (S.custom && S.custom.plan) || {}; const walls = {}; for (const k of Object.keys(b.walls)) walls[k] = { ...b.walls[k], ...((c.walls || {})[k] || {}) }; return { walls, furn: { ...b.furn, ...(c.furn || {}) }, open: { ...b.open, ...(c.open || {}) }, thick: c.thick || b.thick || [10, 15, 20, 25, 30], ticks: { ...(b.ticks || {}), ...(c.ticks || {}) } }; }
function planRuleLines() { // אותם כללים בדיוק — גם להנחיות ה-AI
  const p = planRulesNow(), L = { red: 'אסור', orange: 'מותר רק עם בדיקה של איש מקצוע', green: 'מותר' }, out = [];
  out.push({ level: 'orange', text: 'כללי השרטוט הבאים הם העדכניים — אם הם סותרים כלל אחר, הם גוברים.' });
  for (const [k, r] of Object.entries(p.walls)) {
    const worst = [r.open, r.change, r.remove].includes('red') ? 'red' : [r.open, r.change, r.remove].includes('orange') ? 'orange' : 'green';
    out.push({ level: worst, text: `${r.name}: פתיחת פתח — ${L[r.open]}; הזזה/שינוי — ${L[r.change]}; הריסה — ${L[r.remove]}.${k === 'mamad' ? ` עד ${r.maxDoors} דלת ו-${r.maxWindows} חלון בכל קיר; מעבר לזה — ${L[r.extra]}.` : ''}` });
  }
  const f = p.furn; out.push({ level: 'green', text: `מרווחים: ${f.bedSide} ס"מ בצדי מיטה, ${f.bedFront} ס"מ מול מיטה, ${f.dining} ס"מ סביב שולחן אוכל, ${f.island}–${f.islandMax} ס"מ סביב אי, ${f.wardrobeFront} ס"מ מול ארון.` });
  out.push({ level: 'orange', text: `עובי קיר תמיד אחד מ: ${p.thick.join(', ')} ס"מ. קנה מידה: ${Object.entries(p.ticks).map(([k, v]) => `1:${k} — כל פס בסרגל = ${v} ס"מ`).join(' · ')} (למשל ב-1:50 קיר 15 = ${15 / (p.ticks[50] || 5)} פסים).` });
  out.push({ level: 'green', text: `ברירת מחדל: דלת ${p.open.doorW}×${p.open.doorH} ס"מ, חלון ${p.open.winW}×${p.open.winH} ס"מ בגובה ${p.open.winSill} ס"מ מהרצפה.` });
  return out;
}
function planRulesCard(ed) {
  const p = planRulesNow(), L = { red: '🔴 אסור', orange: '🟠 באזהרה', green: '🟢 מותר' };
  const sel = (k, act, v) => `<select data-pw="${k}|${act}" style="padding:6px;width:auto">${['red', 'orange', 'green'].map(l => `<option value="${l}" ${v === l ? 'selected' : ''}>${L[l]}</option>`).join('')}</select>`;
  const num = (grp, k, v, label) => `<div><label>${label}</label><input type="number" inputmode="numeric" data-pn="${grp}|${k}" value="${v}" ${ed ? '' : 'disabled'}></div>`;
  return `<div class="card"><h3>📐 כללי שרטוט — חלים על השרטוט, התלת־ממד, האזהרות וה-AI</h3>
    <div class="muted" style="margin-bottom:8px">כל שינוי כאן חל מיד בכל האפליקציה (וגם אצל השותפים במאגר).</div>
    ${Object.entries(p.walls).map(([k, r]) => `<div class="rule ${[r.open, r.change, r.remove].includes('red') ? 'red' : [r.open, r.change, r.remove].includes('orange') ? 'orange' : 'green'}"><span class="dot ${[r.open, r.change, r.remove].includes('red') ? 'red' : [r.open, r.change, r.remove].includes('orange') ? 'orange' : 'green'}"></span><div class="grow"><b>${esc(r.name)}</b>
      ${ed ? `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:6px"><span>פתיחת פתח</span>${sel(k, 'open', r.open)}<span>הזזה / שינוי</span>${sel(k, 'change', r.change)}<span>הריסה</span>${sel(k, 'remove', r.remove)}
        ${k === 'mamad' ? `<span>מקס׳ דלתות בקיר</span><input type="number" data-pm="maxDoors" value="${r.maxDoors}" style="width:70px"><span>מקס׳ חלונות בקיר</span><input type="number" data-pm="maxWindows" value="${r.maxWindows}" style="width:70px"><span>מעבר למקסימום</span>${sel(k, 'extra', r.extra)}` : ''}</div>`
        : `<br>פתח — ${L[r.open]} · שינוי — ${L[r.change]} · הריסה — ${L[r.remove]}${k === 'mamad' ? ` · עד ${r.maxDoors} דלת ו-${r.maxWindows} חלון בקיר` : ''}`}</div></div>`).join('')}
    <h3 style="margin-top:12px">↔️ מרווחים סביב רהיטים (ס"מ)</h3>
    <div class="grid2">${num('furn', 'bedSide', p.furn.bedSide, 'צדי מיטה')}${num('furn', 'bedFront', p.furn.bedFront, 'מול מיטה')}${num('furn', 'dining', p.furn.dining, 'סביב שולחן אוכל')}${num('furn', 'wardrobeFront', p.furn.wardrobeFront, 'מול ארון')}${num('furn', 'island', p.furn.island, 'סביב אי — מינ׳')}${num('furn', 'islandMax', p.furn.islandMax, 'סביב אי — מקס׳')}</div>
    <h3 style="margin-top:12px">📏 קנה מידה ועובי קירות</h3>
    <div class="muted" style="margin-bottom:6px">כמה ס"מ שווה כל פס בסרגל. קובע את הסרגלים, את ההצמדה בזמן שרטוט ואת ספירת הפסים של העובי.</div>
    <div class="grid2">${Object.entries(p.ticks).map(([k, v]) => `<div><label>1:${k} — כל פס =</label><input type="number" inputmode="decimal" data-pt="${k}" value="${v}" ${ed ? '' : 'disabled'}></div>`).join('')}
      <div><label>עוביי קיר תקניים (ס"מ)</label><input data-pth value="${p.thick.join(', ')}" ${ed ? '' : 'disabled'}></div></div>
    <div class="muted" style="font-size:12px;margin-top:4px">${p.thick.map(t => `${t}=${+(t / (p.ticks[50] || 5)).toFixed(1)} פסים`).join(' · ')} (ב-1:50)</div>
    <h3 style="margin-top:12px">🚪 מידות ברירת מחדל לפתחים (ס"מ)</h3>
    <div class="grid2">${num('open', 'doorW', p.open.doorW, 'רוחב דלת')}${num('open', 'doorH', p.open.doorH, 'גובה דלת')}${num('open', 'winW', p.open.winW, 'רוחב חלון')}${num('open', 'winH', p.open.winH, 'גובה חלון')}${num('open', 'winSill', p.open.winSill, 'גובה חלון מהרצפה')}</div>
    ${ed ? '' : '<div class="muted" style="margin-top:6px">לשינוי: "✏️ עריכה" למעלה.</div>'}</div>`;
}
function bindPlanRules(app) {
  const C = () => { const c = editableRules(); c.plan = c.plan || { walls: {}, furn: {}, open: {} }; c.plan.walls = c.plan.walls || {}; c.plan.furn = c.plan.furn || {}; c.plan.open = c.plan.open || {}; return c.plan; };
  app.querySelectorAll('[data-pw]').forEach(el => el.onchange = () => { const [k, act] = el.dataset.pw.split('|'), p = C(); p.walls[k] = { ...(p.walls[k] || {}), [act]: el.value }; rulesChanged(); toast('הכלל עודכן — חל עכשיו בכל האפליקציה'); render(); });
  app.querySelectorAll('[data-pm]').forEach(el => el.onchange = () => { const p = C(), v = Math.max(0, +el.value || 0); p.walls.mamad = { ...(p.walls.mamad || {}), [el.dataset.pm]: v }; rulesChanged(); toast('הכלל עודכן'); });
  app.querySelectorAll('[data-pt]').forEach(el => el.onchange = () => { const p = C(), v = +el.value; if (!(v > 0)) return; p.ticks = { ...(p.ticks || {}), [el.dataset.pt]: v }; rulesChanged(); toast(`1:${el.dataset.pt} — כל פס = ${v} ס"מ`); render(); });
  app.querySelectorAll('[data-pth]').forEach(el => el.onchange = () => { const a = el.value.split(/[ ,]+/).map(Number).filter(v => v > 0).sort((x, y) => x - y); if (!a.length) return; C().thick = a; rulesChanged(); toast('עוביי הקיר עודכנו'); render(); });
  app.querySelectorAll('[data-pn]').forEach(el => el.onchange = () => { const [g, k] = el.dataset.pn.split('|'), p = C(), v = +el.value; if (!(v >= 0)) return; p[g][k] = v; rulesChanged(); toast('הכלל עודכן'); });
}
function renderRules(app) {
  setHeader('ספר הכללים', false);
  const ed = !!V.editRules;
  const lvlTxt = { red: 'אסור', orange: 'דורש בדיקה', green: 'המלצה' };
  const sec = (key, title) => {
    const fixed = R().fixed[key] || [], checks = R().checks[key] || [];
    if (!ed && !fixed.length && !checks.length) return '';
    return `<div class="card"><h3>${title}</h3>
    ${fixed.map((f, i) => `<div class="rule ${f.level}"><span class="dot ${f.level}"></span><div class="grow">${esc(f.text)}</div>
      ${ed ? `<span class="note-ic" data-ef="${key}|${i}">✏️</span>` : ''}</div>`).join('')}
    ${checks.map((c, i) => `<div class="rule ${c.level}"><span class="dot ${c.level}"></span><div class="grow"><b>${esc(c.label)}</b>${c.min != null || c.max != null ? ` — ${c.min != null ? 'מינ׳ ' + c.min : ''}${c.min != null && c.max != null ? ', ' : ''}${c.max != null ? 'מקס׳ ' + c.max : ''} ס"מ` : ''}<br>${esc(c.msg)}</div>
      ${ed ? `<span class="note-ic" data-ec="${key}|${i}">✏️</span>` : ''}</div>`).join('')}
    ${ed ? `<div class="row" style="margin-top:8px"><button class="btn sec sm" data-af="${key}">+ כלל</button><button class="btn sec sm" data-ac="${key}">+ בדיקת מידה</button></div>` : ''}</div>`;
  };
  app.innerHTML = `
    <div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">📏 ספר הכללים</h2>
      <button class="btn ${ed ? '' : 'sec'} sm" id="edT">${ed ? '✓ סיום עריכה' : '✏️ עריכה'}</button></div>
    ${ed ? '<div class="muted" style="margin-bottom:10px">מצב עריכה: לוחצים ✏️ כדי לשנות או למחוק, או מוסיפים כלל חדש. השינויים מתעדכנים גם אצל השותפים במאגר.</div>' : ''}
    <div class="card"><div class="rule red"><span class="dot red"></span><div>אדום = אסור</div></div>
      <div class="rule orange"><span class="dot orange"></span><div>כתום = דורש בדיקה</div></div>
      <div class="rule green"><span class="dot green"></span><div>ירוק = המלצה מקצועית</div></div></div>
    ${planRulesCard(ed)}
    ${sec('_all', '🏠 כללי — כל החדרים')}
    ${ROOM_CATS.map(c => sec(c.id, c.icon + ' ' + c.name)).join('')}
    <div class="card"><h3>🛏️ מידות מיטות</h3>${BED_SIZES.map(b => `<div class="row"><span class="grow">${b.name}</span><b>${b.size}</b></div>`).join('')}</div>
    ${ed && S.custom ? '<button class="btn danger full" id="resetR">שחזור הכללים המקוריים</button><div style="height:10px"></div>' : ''}
    <div class="muted">הכללים מבוססים על חומרי הקורס ועל תקנים בישראל. הם עוזרים בסקיצה, ולא מחליפים איש מקצוע מוסמך.</div>`;
  $('#edT').onclick = () => { V.editRules = !ed; render(); };
  bindPlanRules(app);
  app.querySelectorAll('[data-ef]').forEach(el => el.onclick = () => { const [k, i] = el.dataset.ef.split('|'); fixedRuleForm(k, +i); });
  app.querySelectorAll('[data-ec]').forEach(el => el.onclick = () => { const [k, i] = el.dataset.ec.split('|'); checkRuleForm(k, +i); });
  app.querySelectorAll('[data-af]').forEach(el => el.onclick = () => fixedRuleForm(el.dataset.af));
  app.querySelectorAll('[data-ac]').forEach(el => el.onclick = () => checkRuleForm(el.dataset.ac));
  if ($('#resetR')) $('#resetR').onclick = () => {
    if (!confirm('לחזור לכללים המקוריים? כל השינויים שעשיתם יימחקו (גם אצל השותפים).')) return;
    S.custom = { checks: clone(CHECKS), fixed: clone(FIXED_RULES), styles: [...STYLES], catCats: [...CATALOG_CATS], base: window.RULES_VERSION || 1 }; rulesChanged(); render();
  };
}
const levelSelect = (v) => `<select id="lv"><option value="red" ${v === 'red' ? 'selected' : ''}>🔴 אדום — אסור</option><option value="orange" ${v === 'orange' ? 'selected' : ''}>🟠 כתום — דורש בדיקה</option><option value="green" ${v === 'green' || !v ? 'selected' : ''}>🟢 ירוק — המלצה</option></select>`;
const roomSelect = (v) => `<select id="rk"><option value="_all" ${v === '_all' ? 'selected' : ''}>🏠 כל החדרים</option>${ROOM_CATS.map(c => `<option value="${c.id}" ${v === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select>`;
function fixedRuleForm(key, idx) {
  const C = editableRules(); const f = idx != null ? C.fixed[key][idx] : null;
  modal(f ? 'עריכת כלל' : 'כלל חדש', `
    <label>חדר</label>${roomSelect(key)}
    <label>רמה</label>${levelSelect(f?.level)}
    <label>הכלל</label><textarea id="tx">${esc(f?.text || '')}</textarea>
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>
    ${f ? '<div style="height:8px"></div><button class="btn danger full" id="del">מחיקת הכלל</button>' : ''}`, (b, close) => {
    $('#ok', b).onclick = () => {
      const text = $('#tx', b).value.trim(); if (!text) return toast('צריך לכתוב את הכלל');
      const nk = $('#rk', b).value, rule = { level: $('#lv', b).value, text };
      if (f) C.fixed[key].splice(idx, 1);
      (C.fixed[nk] = C.fixed[nk] || []).push(rule);
      rulesChanged(); close(); render();
    };
    if (f) $('#del', b).onclick = () => { if (!confirm('למחוק את הכלל?')) return; C.fixed[key].splice(idx, 1); rulesChanged(); close(); render(); };
  });
}
function checkRuleForm(key, idx) {
  const C = editableRules(); const c = idx != null ? C.checks[key][idx] : null;
  modal(c ? 'עריכת בדיקת מידה' : 'בדיקת מידה חדשה', `
    <label>חדר</label>${roomSelect(key)}
    <label>מה מודדים?</label><input id="lb" value="${esc(c?.label || '')}" placeholder="למשל: מרווח בין כיור לקיר">
    <div class="grid2"><div><label>מינימום (ס"מ)</label><input id="mn" type="number" inputmode="numeric" value="${c?.min ?? ''}"></div>
      <div><label>מקסימום (ס"מ)</label><input id="mx" type="number" inputmode="numeric" value="${c?.max ?? ''}"></div></div>
    <label>רמה</label>${levelSelect(c?.level)}
    <label>ההסבר שמופיע בהתרעה</label><textarea id="ms">${esc(c?.msg || '')}</textarea>
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>
    ${c ? '<div style="height:8px"></div><button class="btn danger full" id="del">מחיקה</button>' : ''}`, (b, close) => {
    $('#ok', b).onclick = () => {
      const label = $('#lb', b).value.trim(); if (!label) return toast('צריך לכתוב מה מודדים');
      const mn = $('#mn', b).value, mx = $('#mx', b).value;
      if (mn === '' && mx === '') return toast('צריך מינימום או מקסימום');
      const nk = $('#rk', b).value;
      const rule = { key: c?.key || 'c_' + uid(), label, level: $('#lv', b).value, msg: $('#ms', b).value.trim(), edited: true };
      if (mn !== '') rule.min = +mn; if (mx !== '') rule.max = +mx;
      if (c) C.checks[key].splice(idx, 1);
      (C.checks[nk] = C.checks[nk] || []).push(rule);
      rulesChanged(); close(); render();
    };
    if (c) $('#del', b).onclick = () => { if (!confirm('למחוק את בדיקת המידה?')) return; C.checks[key].splice(idx, 1); rulesChanged(); close(); render(); };
  });
}

// =====================================================================
// הגדרות + גיבוי
// =====================================================================
function renderSettings(app) {
  setHeader('הגדרות · גרסה ' + APP_VERSION, false);
  const st = S.settings;
  app.innerHTML = `
    <div class="card"><h3>🤖 מנוע ה-AI (Google Gemini)</h3>
      <label>מפתח AI</label>
      <div class="row"><input id="key" type="text" class="grow" value="${esc(st.apiKey)}" placeholder="מדביקים כאן את המפתח" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" dir="ltr" style="flex:1;-webkit-text-security:disc">
        <button class="btn sec sm" id="showK">👁</button></div>
      <div class="muted" style="margin-top:6px">המפתח נשמר רק בטלפון הזה. מקבלים אותו ב-aistudio.google.com ← Get API key. להדמיות צריך להפעיל חיוב בחשבון גוגל (מומלץ עם תקרת הוצאה).</div>
      ${Sync.ok() ? `<label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="shareAI" style="width:auto" ${st.shareAI !== false ? 'checked' : ''}> לשתף את המפתח עם כל המחוברים למאגר המשותף</label>
        <div class="muted">כשמסומן, המפתח מגיע לבד לטלפונים של השותפים, וכל ההדמיות שלהם מחויבות באותו חשבון.</div>` : ''}
      <label>מודל מותאם אישית (לא חובה)</label><input id="model" value="${esc(st.model && st.model !== DEFAULT_MODEL ? st.model : '')}" dir="ltr" placeholder="ריק = לפי רמת האיכות שנבחרה">
      <div class="muted" style="margin-top:6px">את המודל בוחרים בסטודיו לפי רמה: ⚡ בסיסי / ⭐ רגיל / 💎 איכותי. כאן ממלאים רק אם רוצים לכפות מודל מסוים.</div>
      <div style="height:10px"></div><button class="btn sec full" id="test">בדיקת חיבור</button></div>
    <div class="card"><h3>🎬 פתיח</h3>
      <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="inLogo" style="width:auto" ${st.introLogo !== false ? 'checked' : ''}> סרטון הלוגו בפתיחת האפליקציה</label>
      <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="inPres" style="width:auto" ${st.introPresenter !== false ? 'checked' : ''}> סרטון המציגה (אחרי הלוגו)</label>
      <div class="row" style="margin-top:10px"><button class="btn sec sm" id="playIntro">▶ צפייה בפתיח עכשיו</button></div></div>
    <div class="card"><h3>🔄 עדכון גרסה</h3>
      <div class="muted">גרסה מותקנת: ${APP_VERSION}</div>
      <div style="height:8px"></div><button class="btn full" id="updNow">🔄 בדיקת עדכון ועדכון עכשיו</button>
      <div class="muted" style="margin-top:6px">מעדכן את האפליקציה, הסרטונים והאייקון. הפרויקטים והקטלוג לא נמחקים.</div></div>
    <div class="card"><h3>📄 הדפסה</h3>
      <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="pn" style="width:auto" ${st.printNotes ? 'checked' : ''}> להדפיס הערות בתיק הפרויקט</label></div>
    <div class="card"><h3>📋 רשימות לעריכה</h3>
      <label>קטגוריות בקטלוג</label>
      <div class="muted" style="font-size:12px">שורה לכל קטגוריה ראשית. תתי-קטגוריות כותבים אחרי נקודתיים, מופרדות בפסיק או לוכסן.<br>לדוגמה: <b>תאורה: מנורות לילה, מנורה עומדת, אהילים</b></div>
      <textarea id="lcats" style="min-height:180px">${esc(R().catCats.map(c => subsOf(c).length ? `${c}: ${subsOf(c).join(', ')}` : c).join('\n'))}</textarea>
      <label>סגנונות עיצוב (שורה לכל סגנון)</label><textarea id="lsty" style="min-height:140px">${esc(R().styles.join('\n'))}</textarea>
      <div style="height:10px"></div><button class="btn sec full" id="saveLists">שמירת הרשימות</button>
      <div class="muted" style="margin-top:6px">את הכללים והמידות עורכים בלשונית "כללים" ← ✏️ עריכה.</div></div>
    <div class="card"><h3>🤝 מאגר משותף</h3>
      ${Sync.ok() ? `<div class="rule green"><span class="dot green"></span><div>מחובר למאגר משותף${S.sync.last ? ' · סנכרון אחרון ' + new Date(S.sync.last).toLocaleString('he-IL') : ''}
          <br><b>מזהה המאגר: <span dir="ltr">${esc(Sync.tag())}</span></b> <span class="muted">(צריך להיות זהה בכל הטלפונים)</span></div></div>
        <button class="btn sec full" id="diag">🩺 בדיקת סנכרון</button><div id="diagOut" style="margin:8px 0"></div>
        <button class="btn full" id="invite">📲 שליחת הזמנה בוואטסאפ</button><div style="height:8px"></div>
        <button class="btn sec full" id="copyInv">📋 העתקת קוד ההזמנה</button><div style="height:8px"></div>
        <button class="btn sec full" id="syncNow2">🔄 סנכרון עכשיו</button><div style="height:8px"></div>
        <button class="btn danger full" id="leave">ניתוק מהמאגר</button>`
      : `<div class="muted">הקטלוג מתעדכן אצל כל מי שמחובר לאותו מאגר.</div>
        <label>קיבלת קוד הזמנה? מדביקים כאן:</label><textarea id="joinCode" style="min-height:60px" dir="ltr"></textarea>
        <button class="btn full" id="join">הצטרפות</button>
        <details style="margin-top:12px"><summary class="muted">הקמת מאגר חדש (פעם אחת, למנהל)</summary>
          <label>Firebase Project ID</label><input id="fpid" dir="ltr" value="${esc(S.sync?.projectId || '')}">
          <label>Firebase Web API Key</label><input id="fkey" dir="ltr" value="${esc(S.sync?.apiKey || '')}">
          <div style="height:10px"></div><button class="btn sec full" id="create">יצירת מאגר משותף</button></details>`}
    </div>
    <div class="card"><h3>💾 גיבוי ושחזור</h3>
      <div class="muted">חשוב במיוחד באייפון: שומרים גיבוי מדי פעם. אפשר גם לשלוח את הקובץ בוואטסאפ כדי להעביר פרויקטים לטלפון אחר.</div>
      <div style="height:10px"></div>
      <button class="btn full" id="exp">⬇️ גיבוי של הכול</button><div style="height:8px"></div>
      <button class="btn sec full" id="imp">⬆️ שחזור מקובץ גיבוי</button></div>
    <div class="card"><h3>📲 התקנה למסך הבית</h3>
      <div style="font-size:14px;line-height:1.6"><b>אנדרואיד:</b> בכרום ← תפריט ⋮ ← "הוסף למסך הבית".<br>
      <b>אייפון:</b> רק ב-Safari ← כפתור השיתוף ⬆️ ← "הוסף למסך הבית".</div></div>
    <div class="muted" style="text-align:center">מעצב חכם · גרסה ${APP_VERSION} · חי אפליקציות</div>`;
  $('#key').onchange = e => { st.apiKey = e.target.value.trim(); st.aiUpdated = Date.now(); save(); Sync.pushAI(); toast(Sync.ok() && st.shareAI !== false ? 'המפתח נשמר ונשלח לשותפים במאגר' : 'המפתח נשמר'); };
  if ($('#shareAI')) $('#shareAI').onchange = e => { st.shareAI = e.target.checked; save(); if (st.shareAI) { st.aiUpdated = Date.now(); Sync.pushAI(); } };
  $('#showK').onclick = () => { const k = $('#key'); k.style.webkitTextSecurity = k.style.webkitTextSecurity === 'none' ? 'disc' : 'none'; };
  $('#model').onchange = e => { st.model = e.target.value.trim() || DEFAULT_MODEL; st.aiUpdated = Date.now(); save(); Sync.pushAI(); };
  $('#pn').onchange = e => { st.printNotes = e.target.checked; save(); };
  $('#inLogo').onchange = e => { st.introLogo = e.target.checked; save(); };
  $('#inPres').onchange = e => { st.introPresenter = e.target.checked; save(); };
  $('#playIntro').onclick = () => playIntro(true);
  $('#updNow').onclick = () => checkUpdate(true);
  $('#test').onclick = testKey;
  if (Sync.ok()) {
    $('#invite').onclick = () => {
      const link = location.origin + location.pathname + '?join=' + encodeURIComponent(Sync.inviteCode());
      const txt = `הזמנה למאגר המשותף של "מעצב חכם" 🤝\n\nאם האפליקציה מותקנת אצלך: פותחים אותה ← הגדרות ← מאגר משותף ← מדביקים את הקוד:\n${Sync.inviteCode()}\n\nאם עוד לא: פותחים את הקישור:\n${link}`;
      location.href = 'https://wa.me/?text=' + encodeURIComponent(txt);
    };
    $('#copyInv').onclick = async () => { try { await navigator.clipboard.writeText(Sync.inviteCode()); toast('הקוד הועתק'); } catch { prompt('העתיקו את הקוד:', Sync.inviteCode()); } };
    $('#syncNow2').onclick = () => Sync.run('full');
    $('#diag').onclick = async () => {
      const o = $('#diagOut'); o.innerHTML = '<div class="muted">בודק…</div>';
      try {
        const d = await Sync.diag();
        o.innerHTML = `<div class="rule ${d.uns ? 'orange' : 'green'}"><span class="dot ${d.uns ? 'orange' : 'green'}"></span><div>
          בטלפון הזה: <b>${d.local}</b> מוצרים · במאגר בענן: <b>${d.remote}</b> מוצרים
          ${d.uns ? `<br>⚠️ ${d.uns} מוצרים עוד לא עלו לענן — לוחצים "סנכרון עכשיו" עם אינטרנט טוב.` : '<br>✓ כל מה שבטלפון הזה נמצא בענן.'}
          <br><span class="muted">אם בטלפון השני רואים מספר אחר "במאגר בענן" — הוא מחובר למאגר אחר (בודקים שמזהה המאגר זהה).</span></div></div>`;
      } catch (e) { o.innerHTML = `<div class="rule red"><span class="dot red"></span><div>לא הצלחתי להתחבר לענן: ${esc(e.message)}</div></div>`; }
    };
    $('#leave').onclick = () => { if (confirm('להתנתק מהמאגר המשותף? המוצרים יישארו בטלפון.')) { S.sync = null; save(); render(); } };
  } else {
    $('#join').onclick = () => { if (Sync.join($('#joinCode').value)) render(); };
    $('#create').onclick = async () => {
      const projectId = $('#fpid').value.trim(), apiKey = $('#fkey').value.trim();
      if (!projectId || !apiKey) return toast('צריך Project ID ו-API Key');
      const code = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x => x.toString(16).padStart(2, '0')).join('');
      S.sync = { projectId, apiKey, code }; save();
      try { await Sync.req('/items?pageSize=1'); toast('המאגר נוצר ✓ מעלה את הקטלוג…'); Sync.run(true); render(); }
      catch (e) { S.sync = null; save(); toast('החיבור נכשל: ' + e.message, 5000); }
    };
  }
  $('#saveLists').onclick = () => {
    const lines = (id) => splitList($(id).value.split('\n'));
    const { cats, subs } = parseCatText($('#lcats').value), sty = lines('#lsty');
    if (!cats.length) return toast('צריך לפחות קטגוריה אחת');
    const C = editableRules(); C.catCats = cats; C.subCats = subs; C.styles = sty; rulesChanged();
    toast(`הרשימות נשמרו · ${cats.length} קטגוריות${Object.keys(subs).length ? ` · ${Object.values(subs).flat().length} תתי-קטגוריות` : ''}`); render();
  };
  $('#exp').onclick = () => exportBackup(S.projects, true);
  $('#imp').onclick = importBackup;
}

async function testKey() {
  const key = S.settings.apiKey; if (!key) return toast('קודם מדביקים מפתח');
  modal('בדיקת חיבור ל-AI', `<div class="muted">שולח הודעה קצרה לכל מודל חינמי ובודק מי עונה…</div><div id="tk" style="margin-top:10px"></div>`, async (b) => {
    const box = b.querySelector('#tk'); let okAny = false; const list = [...TEXT_MODELS];
    for (let mi = 0; mi < list.length; mi++) { const m = list[mi];
      const row = document.createElement('div'); row.className = 'rule'; row.innerHTML = `<span class="dot"></span><div dir="ltr" style="text-align:left"><b>${m}</b> …</div>`; box.appendChild(row);
      try {
        const r = await gFetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, key.trim(), JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK' }] }], generationConfig: { maxOutputTokens: 20 } }), 20000);
        const j = await r.json().catch(() => ({}));
        if (r.status === 404) { const sm = suggestedModel(j?.error?.message); if (sm && !list.includes(sm)) list.push(sm); }
        const good = r.ok && j?.candidates; if (good) { if (!okAny) { S.settings.textModel = m; save(); } okAny = true; }
        row.className = 'rule ' + (good ? 'green' : 'red'); row.querySelector('.dot').className = 'dot ' + (good ? 'green' : 'red');
        row.querySelector('div').innerHTML = `<b>${m}</b> — ${good ? '✓ עובד' : esc(r.status + ' ' + (j?.error?.message || '').slice(0, 220))}`;
      } catch (e) { row.className = 'rule red'; row.querySelector('.dot').className = 'dot red'; row.querySelector('div').innerHTML = `<b>${m}</b> — ${e.timeout ? 'לא ענה תוך 20 שניות' : 'אין חיבור (' + esc(String(e.message || e).slice(0, 80)) + ')'}`; }
    }
    const s2 = document.createElement('div'); s2.style.marginTop = '10px'; s2.innerHTML = okAny ? '<b>✓ יש מודל חינמי שעובד — הכנת ההנחיה תשתמש בו.</b>' : '<b>אף מודל לא ענה. צלמו את המסך הזה ושלחו.</b>'; box.appendChild(s2);
  });
}

function collectImgIds(projects, withCatalog) {
  const ids = new Set();
  projects.forEach(p => p.rooms.forEach(r => { r.photos.forEach(i => ids.add(i)); r.designs.forEach(d => { ids.add(d.base); ids.add(d.result); }); }));
  if (withCatalog) S.catalog.forEach(c => c.img && ids.add(c.img));
  return [...ids];
}
async function exportBackup(projects, all = false) {
  toast('מכין קובץ גיבוי…');
  const images = {};
  for (const id of collectImgIds(projects, all)) images[id] = await getImg(id);
  const data = { app: 'meatzev-chacham', version: APP_VERSION, date: Date.now(), projects, catalog: all ? S.catalog : [], images };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = (all ? 'מעצב-חכם-גיבוי' : 'מעצב-חכם-' + projects[0].name) + '-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function importBackup() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'meatzev-chacham') throw 0;
      for (const [id, d] of Object.entries(data.images || {})) if (d) { imgCache[id] = d; await DB.set(id, d); }
      let added = 0;
      for (const p of data.projects || []) {
        const ex = S.projects.findIndex(x => x.id === p.id);
        if (ex >= 0) { if (!confirm(`הפרויקט "${p.name}" כבר קיים. להחליף אותו בגרסה מהגיבוי?`)) continue; S.projects[ex] = p; }
        else S.projects.push(p);
        added++;
      }
      let cAdded = 0;
      for (const c of data.catalog || []) if (!S.catalog.some(x => x.id === c.id)) { c.synced = false; S.catalog.push(c); cAdded++; }
      save(); toast([added ? `שוחזרו ${added} פרויקטים` : '', cAdded ? `נוספו ${cAdded} מוצרים לקטלוג` : ''].filter(Boolean).join(' · ') || 'אין משהו חדש בקובץ', 3500); render();
      if (cAdded) Sync.run(false);
    } catch { toast('הקובץ לא תקין'); }
  };
  i.click();
}

// =====================================================================
// הכנה לדפוס
// =====================================================================
async function printProject(p) {
  toast('מכין את התיק להדפסה…');
  const withNotes = S.settings.printNotes;
  let h = `<div class="pp" style="text-align:center;padding-top:120px"><h1 style="font-size:34px">${esc(p.name)}</h1>
    <p>${[p.client, p.address].filter(Boolean).map(esc).join(' · ')}</p><p>${fmtDate(Date.now())}</p><p style="color:#888">מעצב חכם</p></div>`;
  if (p.plan?.walls?.length) {
    if (p.plan.original) h += `<div class="pp"><h2>📐 תוכנית — מצב קיים</h2>${Plan.printSVG(p.plan.original)}</div>`;
    h += `<div class="pp"><h2>📐 תוכנית${p.plan.original ? ' — תכנון' : ''}</h2>${Plan.printSVG(p.plan)}<p>גובה תקרה: ${p.plan.height || 280} ס"מ</p></div>`;
  }
  for (const r of p.rooms) {
    const c = catOf(r.cat);
    h += `<div class="pp"><h2>${c.icon} ${esc(r.name)}</h2><p>${c.name}${r.L ? ` · מידות: ${r.L}×${r.W}${r.H ? '×' + r.H : ''} ס"מ` : ''}</p>`;
    const checks = [...(R().checks[r.cat] || []), ...R().checks._all].filter(ch => r.checks[ch.key] !== '' && r.checks[ch.key] != null);
    if (checks.length) h += `<table><tr><th>מידה</th><th>ערך</th><th>סטטוס</th></tr>${checks.map(ch => { const e = evalCheck(ch, r.checks[ch.key]); return `<tr><td>${esc(ch.label)}</td><td>${r.checks[ch.key]} ס"מ</td><td>${e?.ok ? 'תקין' : esc(e?.txt || '')}</td></tr>`; }).join('')}</table>`;
    for (const d of r.designs) {
      const items = (d.items || []).map(id => S.catalog.find(x => x.id === id)).filter(Boolean);
      h += `<div style="display:flex;gap:8px;margin-top:10px"><div style="flex:1"><b>לפני</b><img src="${await getImg(d.base)}"></div><div style="flex:1"><b>אחרי</b><img src="${await getImg(d.result)}"></div></div>`;
      if (d.style) h += `<p>סגנון: ${esc(d.style)}</p>`;
      if (items.length) h += `<table><tr><th>מוצר</th><th>קטגוריה</th><th>ספק</th><th>מידות</th><th>גימור</th><th>מחיר</th></tr>${items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.cat)}</td><td>${esc(i.supplier)}</td><td>${esc(i.dims)}</td><td>${esc(i.color)}</td><td>${esc(i.price)}</td></tr>`).join('')}</table>`;
      if (withNotes && d.note) h += `<p><b>הערה:</b> ${esc(d.note)}</p>`;
    }
    if (withNotes) {
      if (r.notes) h += `<h3>הערות</h3><p style="white-space:pre-wrap">${esc(r.notes)}</p>`;
      const els = r.elements.filter(e => e.print !== false);
      if (els.length) h += `<h3>הערות לפי אלמנט</h3>${els.map(e => `<p><b>${esc(e.title)}:</b> ${esc(e.text)}</p>`).join('')}`;
    }
    h += `</div>`;
  }
  $('#print').innerHTML = h;
  const imgs = [...$('#print').querySelectorAll('img')];
  await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  setTimeout(() => window.print(), 300);
}

// =====================================================================
// עזרה
// =====================================================================
function showHelp() {
  modal('איך עובדים עם מעצב חכם', `<div style="font-size:15px;line-height:1.7">
    <b>1. פרויקט:</b> פותחים פרויקט לכל לקוח או דירה.<br>
    <b>2. חדרים:</b> מוסיפים חדר, בוחרים סוג ומכניסים מידות.<br>
    <b>3. תמונות:</b> מצלמים את החדר מכמה זוויות.<br>
    <b>4. קטלוג:</b> מוסיפים מוצרים אמיתיים עם תמונה (ריצוף, ברזים, תאורה…).<br>
    <b>5. עיצוב:</b> "עיצוב חדש" ← בוחרים תמונה, סגנון ומוצרים ← כותבים מה לשנות ← יוצרים הדמיה.<br>
    <b>6. לפני/אחרי:</b> גוררים את הפס באמצע התמונה.<br>
    <b>7. מידות וכללים:</b> מכניסים מידות, והמערכת מתריעה כשמשהו לא תקין.<br>
    <b>8. הדפסה:</b> בדף הפרויקט ← "הכנה לדפוס" ← שומרים כ-PDF.<br>
    <b>9. גיבוי:</b> בהגדרות. חשוב במיוחד באייפון.</div>`);
}

// =====================================================================
// הפעלה
// =====================================================================
(async function init() {
  try {
    await DB.open();
    const st = await DB.get('state');
    if (st) S = { ...S, ...st, settings: { ...S.settings, ...(st.settings || {}) } };
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch (e) { toast('שגיאה בפתיחת האחסון: ' + e.message, 5000); }
  const jq = new URLSearchParams(location.search).get('join');
  if (jq) { history.replaceState(null, '', location.pathname); if (!Sync.ok() || confirm('להצטרף למאגר המשותף החדש?')) Sync.join(jq); }
  migrateRules(); fixLists(); migrateTaxonomy();
  render();
  playIntro(false);
  Sync.run(false);
  setTimeout(() => checkUpdate(false), 4000);
})();

// כשנוספים כללים חדשים לקובץ rules.js — מוסיפים אותם גם לכללים שנערכו, בלי למחוק עריכות
// פירוק רשימה: אפשר להדביק הרבה קטגוריות במכה אחת — בשורות, בפסיקים, או עם "/" ביניהן.
// "צבע / טיח" (לוכסן אחד) נשאר קטגוריה אחת; 2 לוכסנים ומעלה או פסיקים = רשימה.
function splitList(arr) {
  const out = [];
  for (const raw of arr) {
    const e = String(raw || '').trim(); if (!e) continue;
    const parts = ((e.match(/\//g) || []).length >= 2 || /[,،;|\n]/.test(e)) ? e.split(/[\/,،;|\n]+/) : [e];
    for (const p of parts) { const t = p.trim().replace(/^[-–•*·]+\s*/, ''); if (t && !out.includes(t)) out.push(t); }
  }
  return out;
}
// "תאורה: א, ב / ג" → קטגוריה ראשית עם תתי-קטגוריות. שורה בלי נקודתיים = קטגוריות ראשיות (אפשר כמה בשורה).
function parseCatText(txt) {
  const cats = [], subs = {};
  for (const line of String(txt).split('\n')) {
    const l = line.trim(); if (!l) continue;
    const m = l.match(/^([^:：]+)[:：](.*)$/);
    if (m) {
      const main = m[1].trim(); if (!main) continue;
      if (!cats.includes(main)) cats.push(main);
      const list = splitList([m[2].replace(/\s\/\s/g, ',')]);
      if (list.length) subs[main] = [...new Set([...(subs[main] || []), ...list])];
    } else for (const c of splitList([l])) if (!cats.includes(c)) cats.push(c);
  }
  const o = cats.indexOf('אחר'); if (o >= 0 && o !== cats.length - 1) { cats.splice(o, 1); cats.push('אחר'); }
  return { cats, subs };
}
// סידור מקצועי חד-פעמי: מוסיף את עץ הקטגוריות, ומכניס קטגוריות "קטנות" (נרות, פמוטים…) כתתי-קטגוריות במקום הנכון.
// לא מוחק כלום: קטגוריות ותתים שהוספתם נשארים, ומוצרים עוברים יחד איתם.
function migrateTaxonomy() {
  const C = S.custom; if (!C || (C.taxo || 0) >= (window.TAXONOMY_VERSION || 1)) return;
  C.subCats = C.subCats || {};
  const ALIAS = { 'עציצים': 'עציצים וצמחים', 'עלים': 'עלים ופמפס', 'פמפיסים': 'עלים ופמפס', 'פמפסים': 'עלים ופמפס', 'סלסלות קש קטן-גדול': 'סלסלות קש', 'מנורות לילה': 'מנורות שולחן / לילה' };
  const owner = {}; for (const [m, l] of Object.entries(DEFAULT_SUBS)) for (const x of l) owner[x] = m;
  for (const [k, v] of Object.entries(ALIAS)) owner[k] = owner[v];
  const moved = {};
  const kept = [];
  for (const c of C.catCats) {
    const target = !CATALOG_CATS.includes(c) && owner[c];
    if (target) { moved[c] = [target, ALIAS[c] || c]; } else kept.push(c);
  }
  // סדר: הקטגוריות המקצועיות לפי הסדר, ואחריהן מה שהוספתם בעצמכם, ו"אחר" בסוף
  const extra = kept.filter(c => !CATALOG_CATS.includes(c));
  C.catCats = [...CATALOG_CATS.filter(c => c !== 'אחר'), ...extra, 'אחר'];
  for (const m of CATALOG_CATS) {
    const mine = [...new Set((C.subCats[m] || []).map(x => ALIAS[x] || x))], def = DEFAULT_SUBS[m] || [];
    // אם בניתם לקטגוריה רשימה משלכם — היא נשמרת כמו שהיא. אחרת מקבלים את הרשימה המקצועית (ומה שהוספתם בתוכה).
    const ownWords = mine.filter(x => !def.includes(x) && !(window.OLD_DEFAULT_SUBS || []).includes(x));
    C.subCats[m] = ownWords.length >= 3 ? mine : [...new Set([...def, ...mine])];
    if (!C.subCats[m].length) delete C.subCats[m];
  }
  for (const it of S.catalog) {
    let ch = false;
    if (moved[it.cat]) { const [m, sb] = moved[it.cat]; it.cat = m; it.sub = sb; ch = true; }
    if (it.sub && ALIAS[it.sub]) { it.sub = ALIAS[it.sub]; ch = true; }
    if (ch) { it.updated = Date.now(); it.synced = false; }
  }
  C.taxo = window.TAXONOMY_VERSION || 1;
  rulesChanged(); save();
}
function fixLists() {
  const C = S.custom; if (!C) return;
  let ch = false;
  for (const key of ['catCats', 'styles']) {
    if (!Array.isArray(C[key])) continue;
    const f = splitList(C[key]);
    if (JSON.stringify(f) !== JSON.stringify(C[key])) { C[key] = f; ch = true; }
  }
  if (ch) { const o = C.catCats.indexOf('אחר'); if (o >= 0 && o !== C.catCats.length - 1) { C.catCats.splice(o, 1); C.catCats.push('אחר'); } rulesChanged(); }
}
function migrateRules() {
  const C = S.custom; if (!C || (C.base || 1) >= (window.RULES_VERSION || 1)) return;
  for (const [k, list] of Object.entries(FIXED_RULES)) {
    C.fixed[k] = C.fixed[k] || [];
    for (const r of list) if (!C.fixed[k].some(x => x.text === r.text)) C.fixed[k].push(clone(r));
  }
  for (const [k, list] of Object.entries(CHECKS)) {
    C.checks[k] = C.checks[k] || [];
    for (const r of list) { const i = C.checks[k].findIndex(x => x.key === r.key); if (i < 0) C.checks[k].push(clone(r)); else if (!C.checks[k][i].edited) C.checks[k][i] = clone(r); }
  }
  C.base = window.RULES_VERSION; C.updated = Date.now(); save(); Sync.pushRules();
}


// =====================================================================
// פתיח (לוגו + מציגה)
// =====================================================================
function playIntro(force) {
  const st = S.settings;
  const list = [];
  if (force || st.introLogo !== false) list.push('media/intro-logo.mp4?v=' + APP_VERSION);
  if (force || st.introPresenter !== false) list.push('media/intro-presenter.mp4?v=' + APP_VERSION);
  if (!list.length) return;
  const d = document.createElement('div'); d.id = 'splash';
  d.innerHTML = `<video playsinline webkit-playsinline preload="auto"></video>
    <div class="tap" style="position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:#f6f2ec">
      <img src="media/logo.png" style="width:62vw;max-width:320px">
      <button class="btn" style="font-size:18px;padding:14px 34px">▶ כניסה</button></div>
    <button class="sbtn skip">דילוג לאפליקציה ⏭</button><button class="sbtn snd" style="display:none">🔊 הפעלת קול</button>`;
  document.body.appendChild(d);
  const v = d.querySelector('video'), snd = d.querySelector('.snd'), tap = d.querySelector('.tap');
  let i = 0, done = false;
  const end = () => { if (done) return; done = true; v.pause(); d.style.transition = 'opacity .4s'; d.style.opacity = 0; setTimeout(() => d.remove(), 400); };
  // מנגן עם קול. אם הדפדפן חוסם קול בלי נגיעה — מציגים מסך "כניסה" (נגיעה אחת מאפשרת קול לשני הסרטונים)
  const playCur = async () => {
    v.muted = false;
    try { await v.play(); tap.style.display = 'none'; snd.style.display = 'none'; }
    catch { tap.style.display = 'flex'; }
  };
  const next = () => { if (i >= list.length) return end(); v.src = list[i++]; playCur(); };
  tap.querySelector('button').onclick = (e) => { e.stopPropagation(); tap.style.display = 'none'; v.muted = false; v.play().catch(() => { v.muted = true; snd.style.display = ''; v.play().catch(end); }); };
  v.onended = next; v.onerror = next;
  d.querySelector('.skip').onclick = (e) => { e.stopPropagation(); end(); };
  snd.onclick = (e) => { e.stopPropagation(); v.muted = false; v.play(); snd.style.display = 'none'; };
  next();
}

// =====================================================================
// עדכון גרסה
// =====================================================================
async function checkUpdate(manual) {
  let latest = null;
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); latest = (await r.json()).version; } catch { if (manual) toast('אין חיבור לאינטרנט'); return; }
  if (latest && latest !== APP_VERSION) {
    if (manual) return doUpdate();
    if (document.getElementById('updBar')) return;
    const b = document.createElement('div'); b.id = 'updBar';
    b.innerHTML = `<div style="flex:1">✨ יש גרסה חדשה (${esc(latest)})</div><button>עדכון</button><span style="cursor:pointer;padding:0 4px">✕</span>`;
    b.querySelector('button').onclick = doUpdate; b.querySelector('span').onclick = () => b.remove();
    document.body.appendChild(b);
  } else if (manual) {
    if (confirm(`יש לך את הגרסה העדכנית (${APP_VERSION}). לרענן בכל זאת את כל הקבצים (סרטונים, אייקון)?`)) doUpdate();
  }
}
async function doUpdate() {
  toast('מעדכן…', 4000);
  try { save(); await new Promise(r => setTimeout(r, 400)); } catch {}
  try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch {}
  try { const regs = await navigator.serviceWorker?.getRegistrations(); for (const r of regs || []) await r.unregister(); } catch {}
  // מושכים מחדש את כל הקבצים מהשרת, בלי זיכרון מטמון של הדפדפן
  try { await Promise.all(['./', 'index.html', 'app.js', 'rules.js', 'plan.js', 'sw.js', 'manifest.webmanifest', 'version.json', 'media/logo.png', 'apple-touch-icon.png'].map(u => fetch(u, { cache: 'reload' }).catch(() => {}))); } catch {}
  location.replace(location.pathname + '?v=' + Date.now());
}
