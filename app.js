// =====================================================================
// מעצב חכם — אפליקציית סקיצות לעיצוב פנים והום סטיילינג
// חי אפליקציות
// =====================================================================
const APP_VERSION = '0.6.2';
const DEFAULT_MODEL = 'gemini-2.5-flash-image';

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
function R() { return S.custom || { checks: CHECKS, fixed: FIXED_RULES, styles: STYLES, catCats: CATALOG_CATS }; }
function editableRules() {
  if (!S.custom) S.custom = { checks: clone(CHECKS), fixed: clone(FIXED_RULES), styles: [...STYLES], catCats: [...CATALOG_CATS], updated: 0, base: window.RULES_VERSION || 1 };
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
const proj = () => S.projects.find(p => p.id === V.projectId);
const room = () => proj()?.rooms.find(r => r.id === V.roomId);

function go(patch) { Object.assign(V, patch); render(); window.scrollTo(0, 0); }

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  go({ tab: b.dataset.tab, projectId: null, roomId: null, planOpen: false });
});
$('#backBtn').onclick = () => {
  if (V.planOpen) go({ planOpen: false }); else if (V.roomId) go({ roomId: null }); else if (V.projectId) go({ projectId: null });
};
$('#helpBtn').onclick = showHelp;

function setHeader(title, back) {
  $('#title').textContent = title;
  $('#backBtn').style.display = back ? '' : 'none';
}

async function render() {
  const app = $('#app');
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
    <div class="row" style="margin:6px 0 10px"><h2 class="grow" style="margin:0">חדרים</h2><button class="btn" id="newR">+ חדר</button></div>
    ${p.rooms.length ? p.rooms.map(r => {
      const c = catOf(r.cat);
      return `<div class="card list-item" data-id="${r.id}"><div class="ic" data-cover="${r.photos[0] || ''}">${c.icon}</div>
        <div class="grow"><b>${esc(r.name)}</b><div class="muted">${c.name}${r.L ? ` · ${r.L}×${r.W}${r.H ? '×' + r.H : ''} ס"מ` : ''} · ${r.designs.length} הדמיות</div></div><span class="muted">‹</span></div>`;
    }).join('') : `<div class="empty"><b>📐</b>מוסיפים חדר, מגדירים מידות ומעלים תמונה.</div>`}`;
  app.querySelectorAll('[data-cover]').forEach(async el => { const id = el.dataset.cover; if (id) { const d = await getImg(id); if (d) el.innerHTML = `<img src="${d}">`; } });
  app.querySelectorAll('.list-item[data-id]').forEach(el => el.onclick = () => go({ roomId: el.dataset.id, roomTab: 'design' }));
  $('#newR').onclick = () => roomForm();
  $('#openPlan').onclick = () => go({ planOpen: true });
  $('#editP').onclick = () => projectForm(p);
  $('#printP').onclick = () => printProject(p);
  $('#shareP').onclick = () => exportBackup([p]);
  $('#delP').onclick = async () => {
    if (!confirm(`למחוק את "${p.name}" עם כל החדרים והתמונות?`)) return;
    for (const r of p.rooms) await deleteRoomImages(r);
    S.projects = S.projects.filter(x => x !== p); save(); go({ projectId: null });
  };
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
        <button class="btn danger sm" data-a="del">מחיקה</button></div>`;
    dl.appendChild(card);
    const [before, after] = [await getImg(d.base), await getImg(d.result)];
    beforeAfter($('.ba-wrap', card), before, after);
    $('.dnote', card).onchange = (e) => { d.note = e.target.value; save(); };
    card.querySelector('[data-a=cont]').onclick = () => studio(p, r, d);
    card.querySelector('[data-a=full]').onclick = () => viewImage(after);
    card.querySelector('[data-a=del]').onclick = async () => {
      if (!confirm('למחוק את ההדמיה?')) return;
      if (r.designs.some(x => x.base === d.result)) return toast('הדמיה אחרת נבנתה מההדמיה הזו. מוחקים קודם אותה.');
      r.designs = r.designs.filter(x => x !== d); await delImg(d.result); save(); renderRoom($('#app'));
    };
  }
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

function viewImage(src) {
  modal('תצוגה', `<img src="${src}" style="width:100%;border-radius:12px">
    <div style="height:10px"></div><a class="btn sec full" href="${src}" download="meatzev-chacham.jpg" style="display:block;text-align:center;text-decoration:none">⬇️ שמירת התמונה</a>`);
}

// ---------- סטודיו העיצוב ----------
function studio(p, r, fromDesign) {
  const sel = { base: fromDesign ? fromDesign.result : r.photos[0], style: fromDesign?.style || '', items: new Set(fromDesign?.items || []), keep: true, extras: [] };
  const roomNotes = [r.notes, ...(r.elements || []).map(e => e.title + ': ' + e.text)].filter(x => x && x.trim()).join('\n');
  const bases = [...r.photos.map(id => ({ id, label: 'מקור' })), ...r.designs.map(d => ({ id: d.result, label: 'הדמיה' }))];
  modal('✨ עיצוב חדש', `
    <label>1. על איזו תמונה מעצבים?</label>
    <div class="thumbs" id="bases">${bases.map(b => `<div class="t ${b.id === sel.base ? 'sel' : ''}" data-id="${b.id}"><img><span class="badge" style="position:absolute;bottom:4px;right:4px">${b.label}</span></div>`).join('')}</div>
    <label>2. סגנון (לא חובה)</label>
    <div class="chips" id="styles">${R().styles.map(s => `<span class="chip ${s === sel.style ? 'on' : ''}">${esc(s)}</span>`).join('')}</div>
    <label>3. מוצרים מהקטלוג (המערכת תשתמש בדיוק בהם)</label>
    ${S.catalog.length ? `<div class="chips" id="icats" style="margin-bottom:8px">${R().catCats.filter(c => S.catalog.some(x => x.cat === c)).map((c, i) => `<span class="chip ${i === 0 ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</div>
      <div class="thumbs" id="items"></div><div class="muted" id="selCount" style="margin-top:6px"></div>` : '<div class="muted">הקטלוג ריק. אפשר להוסיף מוצרים בלשונית "קטלוג".</div>'}
    <label>4. אלמנטים מצולמים (ריצוף, ספה, וילון… — מתמונה שצילמת או מהגלריה)</label>
    <div id="extras" class="thumbs"></div>
    <button class="btn sec full" id="addEx" style="margin-top:6px">➕ הוספת אלמנט עם תמונה</button>
    <div class="muted" style="margin-top:4px">ה-AI מתאר כל אלמנט בדיוק (חומר, צבע, דוגמה, גודל) ומכניס אותו להנחיה.</div>
    ${roomNotes ? `<label style="display:flex;gap:8px;align-items:center;color:var(--ink);margin-top:10px"><input type="checkbox" id="useNotes" checked style="width:auto"> לכלול את ההערות של החדר</label>
      <div class="muted" style="white-space:pre-wrap;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px;font-size:13px">${esc(roomNotes)}</div>` : ''}
    <label>5. מה לשנות? (במילים שלך)</label>
    <textarea id="ins" placeholder="למשל: להחליף את הריצוף לאריח שבחרתי, לצבוע את הקיר מאחורי המיטה בבז' חם, להשאיר את הארון כמו שהוא">${esc('')}</textarea>
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="keep" checked style="width:auto"> לשנות רק מה שביקשתי, כל השאר נשאר בדיוק אותו דבר</label>
    <div style="height:14px"></div>
    <button class="btn full" id="go">✨ צור הדמיה (בתשלום)</button>
    <div style="height:8px"></div>
    <button class="btn sec full" id="goPrompt">📝 הכנת הנחיה מקצועית לג'מיני (חינם)</button>
    <div class="muted" style="margin-top:4px">המערכת מסתכלת על התמונה, בודקת מול הכללים, וכותבת הנחיה מדויקת להדבקה באפליקציית Gemini.</div>
    <div id="out"></div>`, async (b, close) => {
    for (const el of b.querySelectorAll('#bases .t')) {
      el.querySelector('img').src = await getImg(el.dataset.id);
      el.onclick = () => { sel.base = el.dataset.id; b.querySelectorAll('#bases .t').forEach(x => x.classList.toggle('sel', x === el)); };
    }
    b.querySelectorAll('#styles .chip').forEach(ch => ch.onclick = () => {
      const on = !ch.classList.contains('on'); b.querySelectorAll('#styles .chip').forEach(x => x.classList.remove('on'));
      ch.classList.toggle('on', on); sel.style = on ? ch.textContent : '';
    });
    const itemsEl = $('#items', b);
    const selCount = () => { const c = $('#selCount', b); if (c) c.textContent = sel.items.size ? `נבחרו ${sel.items.size} מוצרים` : 'לוחצים על תמונה כדי לבחור'; };
    const showCat = (cat) => {
      if (!itemsEl) return; itemsEl.innerHTML = '';
      for (const it of S.catalog.filter(x => x.cat === cat)) {
        const d = document.createElement('div'); d.className = 't' + (sel.items.has(it.id) ? ' sel' : '');
        d.innerHTML = `<img loading="lazy"><div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));color:#fff;font-size:11px;padding:12px 5px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</div>`;
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
        out.innerHTML = `<div class="rule red" style="margin-top:12px"><span class="dot red"></span><div>${esc(e.message)}</div></div>`;
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
const TEXT_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
async function geminiText(parts, json, onStatus) {
  const key = S.settings.apiKey.trim();
  const models = [...new Set([S.settings.textModel, ...TEXT_MODELS].filter(Boolean))];
  let busy = false;
  for (let round = 0; round < 3; round++) {
    if (round) { onStatus && onStatus(`השרתים של גוגל עמוסים כרגע. מנסה שוב (${round}/2)…`); await new Promise(r => setTimeout(r, 4000 * round)); }
    for (const model of models) {
      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.4 } : { temperature: 0.4 } })
        });
      } catch { throw new Error('אין חיבור לאינטרנט.'); }
      const j = await res.json().catch(() => ({}));
      const msg = j?.error?.message || '';
      if (res.status === 404) continue;                                   // מודל לא קיים — מנסים את הבא
      if (res.status === 503 || res.status === 500 || /high demand|overloaded|unavailable/i.test(msg)) { busy = true; continue; } // עומס — מנסים מודל אחר
      if (res.status === 429) {
        if (/quota|exhausted|limit/i.test(msg)) { busy = true; continue; } // מכסה של מודל אחד — לפעמים במודל אחר יש עוד מכסה
      }
      if (res.status === 400 && /API key/i.test(msg)) throw new Error('מפתח ה-AI לא תקין.');
      if (!res.ok) throw new Error('שגיאה מהשרת: ' + (msg || res.status));
      S.settings.textModel = model; save();
      return (j?.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
    }
  }
  if (busy) throw new Error('השרתים של גוגל עמוסים כרגע, או שהמכסה היומית החינמית נגמרה. זה בדרך כלל זמני — נסו שוב בעוד כמה דקות.');
  throw new Error('לא נמצא מודל טקסט זמין למפתח הזה.');
}
async function aiPromptHelper(r, sel, ins, items, baseImg, refs = []) {
  const c = catOf(r.cat);
  const own = R().checks[r.cat] || [];
  const checks = [...own, ...R().checks._all.filter(x => !own.some(y => y.key === x.key))];
  const fixed = [...(R().fixed[r.cat] || []), ...R().fixed._all];
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
Style: ${sel.style || 'not specified — keep the existing style unless the request implies otherwise'}.
Products / elements to use (attached as reference images in this order; image 1 is the room). You can SEE these reference images below — for each one, describe it in the prompt precisely: material, exact color, finish (matte/gloss), pattern, texture, tile/plank size and layout, legs/frame, fabric — so Gemini reproduces it exactly:
${items.length ? items.map((it, i) => `${i + 2}. ${it.name} (${it.cat}${it.dims ? ', ' + it.dims : ''}${it.color ? ', ' + it.color : ''}${it.supplier ? ', supplier ' + it.supplier : ''}${it.note ? ', designer note: ' + it.note : ''}${it.photo ? ', photo taken by the designer' : ''})`).join('\n') : 'none'}
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
  const parts = [{ text: sys }, { text: 'Image 1 — the room:' }, part(baseImg)];
  refs.forEach((x, i) => { if (x.img) { parts.push({ text: `Image ${i + 2} — ${x.item.name} (${x.item.cat}):` }); parts.push(part(x.img)); } });
  const txt = await geminiText(parts, true, (m) => { const o = document.querySelector('#out .muted'); if (o) o.textContent = m; });
  try { return JSON.parse(txt.replace(/^```json|```$/g, '').trim()); } catch { return { prompt: txt, prompt_he: '', observations_he: [], warnings_he: [], tips_he: [] }; }
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
  if (items.length) {
    lines.push('Use these EXACT real products. Each one is shown in a reference image after the room photo, in this order. Reproduce their color, texture, pattern and shape faithfully; do not substitute them:');
    items.forEach((it, i) => lines.push(`${i + 1}. ${it.name} — category: ${it.cat}${it.dims ? ', size: ' + it.dims : ''}${it.color ? ', finish/color: ' + it.color : ''}${it.note ? ', note: ' + it.note : ''}${it.photo ? ' (photo of the real element)' : ''}`));
  }
  if (ins) lines.push(`Designer instructions (in Hebrew, follow them exactly): ${ins}`);
  return lines.join('\n');
}

async function aiEdit(baseDataURL, refs, prompt) {
  const key = S.settings.apiKey.trim(), model = (S.settings.model || DEFAULT_MODEL).trim();
  const part = (d) => { const [h, b64] = d.split(','); return { inline_data: { mime_type: h.match(/data:(.*?);/)?.[1] || 'image/jpeg', data: b64 } }; };
  const parts = [{ text: prompt }, part(baseDataURL)];
  refs.forEach((r, i) => { if (r.img) { parts.push({ text: `Reference product ${i + 1}: ${r.item.name}` }); parts.push(part(r.img)); } });
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
    });
  } catch { throw new Error('אין חיבור לאינטרנט, או שהשרת לא זמין. נסו שוב.'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = j?.error?.message || '';
    if (res.status === 400 && /API key/i.test(m)) throw new Error('מפתח ה-AI לא תקין. בודקים אותו בהגדרות.');
    if (res.status === 403) throw new Error('למפתח אין הרשאה למודל הזה. בודקים בהגדרות או ב-Google AI Studio.');
    if (res.status === 429) throw new Error('המכסה נגמרה או שצריך להפעיל חיוב בחשבון גוגל. מודלי תמונה דורשים חיוב.');
    if (res.status === 404) throw new Error(`המודל "${model}" לא נמצא. בודקים את שם המודל בהגדרות.`);
    throw new Error('שגיאה מהשרת: ' + (m || res.status));
  }
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
  const fixed = [...(R().fixed[r.cat] || []), ...R().fixed._all];
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
async function renderCatalog(app) {
  setHeader('קטלוג מוצרים', false);
  const cat = V.catFilter;
  const list = S.catalog.filter(x => !cat || x.cat === cat).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const count = (c) => S.catalog.filter(x => x.cat === c).length;
  app.innerHTML = `
    <div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">קטלוג</h2>
      ${S.sync?.code ? `<button class="btn sec sm" id="syncNow">🔄 סנכרון</button>` : ''}</div>
    <div class="muted" style="margin-bottom:10px">מוצרים אמיתיים מהשוק. ה-AI משתמש בתמונה של המוצר ולא ממציא משהו אחר.
      ${S.sync?.code ? '<br>🤝 המאגר משותף — כל מה שמוסיפים כאן מתעדכן אצל כל השותפים.' : ''}</div>
    <div class="chips" style="margin-bottom:12px"><span class="chip ${!cat ? 'on' : ''}" data-c="">הכול (${S.catalog.length})</span>
      ${R().catCats.map(c => `<span class="chip ${cat === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}${count(c) ? ` (${count(c)})` : ''}</span>`).join('')}</div>
    <div class="grid2" style="margin-bottom:12px">
      <button class="btn" id="bulk">📥 הוספת הרבה תמונות</button>
      <button class="btn sec" id="newI">+ מוצר עם פרטים</button></div>
    ${cat ? '' : '<div class="muted" style="margin-bottom:10px">טיפ: בוחרים קודם קטגוריה, ואז כל התמונות שמוסיפים נכנסות אליה.</div>'}
    <div class="thumbs" id="clist"></div>
    ${list.length ? '' : '<div class="empty"><b>🧱</b>אין מוצרים בקטגוריה הזו עדיין.</div>'}`;
  app.querySelectorAll('[data-c]').forEach(c => c.onclick = () => go({ catFilter: c.dataset.c }));
  $('#newI').onclick = () => itemForm(null, cat);
  $('#bulk').onclick = () => bulkAdd(cat);
  if ($('#syncNow')) $('#syncNow').onclick = () => Sync.run(true);
  const cl = $('#clist');
  for (const it of list) {
    const d = document.createElement('div'); d.className = 't';
    d.innerHTML = `<img loading="lazy"><div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));color:#fff;font-size:11px;padding:14px 5px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</div>`;
    cl.appendChild(d);
    d.onclick = () => itemForm(it);
    getImg(it.img).then(src => { d.querySelector('img').src = src || 'icon.svg'; if (!src && it.img) Sync.fetchImg(it.img).then(s2 => { if (s2) d.querySelector('img').src = s2; }); });
  }
}

async function bulkAdd(cat) {
  if (!cat) {
    return modal('לאיזו קטגוריה?', `<div class="chips">${R().catCats.map(c => `<span class="chip" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</div>`, (b, close) => {
      b.querySelectorAll('[data-c]').forEach(ch => ch.onclick = () => { close(); V.catFilter = ch.dataset.c; render(); bulkAdd(ch.dataset.c); });
    });
  }
  const files = await pickFiles(true); if (!files.length) return;
  let n = S.catalog.filter(x => x.cat === cat).length;
  for (let i = 0; i < files.length; i++) {
    toast(`מוסיף תמונה ${i + 1} מתוך ${files.length}…`, 1200);
    const data = await catalogImageData(files[i]);
    const it = { id: uid(), name: `${cat} ${++n}`, cat, supplier: '', dims: '', color: '', price: '', link: '', note: '', img: await putImg(data), updated: Date.now() };
    S.catalog.push(it); Sync.pushItem(it, data);
  }
  save(); toast(`נוספו ${files.length} תמונות ל"${cat}". אפשר ללחוץ על תמונה ולהוסיף שם ופרטים.`, 3500); render();
}

function itemForm(it, defCat) {
  let newImg = null;
  modal(it ? 'עריכת מוצר' : 'מוצר חדש', `
    <div id="imgBox" style="text-align:center"><img id="ip" style="max-width:100%;max-height:240px;border-radius:12px;display:none">
      <button class="btn sec full" id="pickI" style="margin-top:8px">📷 ${it ? 'החלפת תמונה' : 'תמונת המוצר'}</button></div>
    <label>שם המוצר</label><input id="in" value="${esc(it?.name || '')}" placeholder="למשל: גרניט פורצלן דמוי בטון 60×120">
    <label>קטגוריה</label><select id="ic">${R().catCats.map(c => `<option ${(it?.cat || defCat) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label>ספק / חנות</label><input id="is" value="${esc(it?.supplier || '')}">
    <div class="grid2"><div><label>מידות</label><input id="id" value="${esc(it?.dims || '')}" placeholder="60×120 ס&quot;מ"></div>
      <div><label>צבע / גימור</label><input id="ico" value="${esc(it?.color || '')}" placeholder="אפור מט"></div></div>
    <div class="grid2"><div><label>מחיר</label><input id="ipr" value="${esc(it?.price || '')}" placeholder='120 ₪ למ"ר'></div>
      <div><label>קישור</label><input id="il" value="${esc(it?.link || '')}" inputmode="url"></div></div>
    <label>הערה</label><textarea id="ino">${esc(it?.note || '')}</textarea>
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>
    ${it ? '<div style="height:8px"></div><button class="btn danger full" id="del">מחיקת המוצר</button>' : ''}`, async (b, close) => {
    const ip = $('#ip', b);
    if (it?.img) { ip.src = await getImg(it.img) || await Sync.fetchImg(it.img) || ''; ip.style.display = ip.src ? '' : 'none'; }
    $('#pickI', b).onclick = async () => { const [f] = await pickPhoto(); if (!f) return; newImg = await catalogImageData(f); ip.src = newImg; ip.style.display = ''; };
    $('#ok', b).onclick = async () => {
      const name = $('#in', b).value.trim(); if (!name) return toast('צריך שם למוצר');
      const d = { name, cat: $('#ic', b).value, supplier: $('#is', b).value.trim(), dims: $('#id', b).value.trim(), color: $('#ico', b).value.trim(), price: $('#ipr', b).value.trim(), link: $('#il', b).value.trim(), note: $('#ino', b).value.trim(), updated: Date.now() };
      if (newImg) { d.img = await putImg(newImg); }
      let target = it;
      if (it) Object.assign(it, d); else { target = { id: uid(), ...d }; S.catalog.push(target); }
      Sync.pushItem(target, newImg);
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
  base() { return `https://firestore.googleapis.com/v1/projects/${S.sync.projectId}/databases/(default)/documents/ws/${S.sync.code}`; },
  async req(path, opt = {}) {
    const url = this.base() + path + (path.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(S.sync.apiKey);
    const r = await fetch(url, { ...opt, headers: { 'Content-Type': 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || ('שגיאת סנכרון ' + r.status)); }
    return r.json();
  },
  meta(it) { const { img, updated, ...rest } = it; return rest; },
  async pushItem(it, imgData) {
    if (!this.ok()) return;
    try {
      if (imgData && it.img) await this.req(`/imgs/${it.img}`, { method: 'PATCH', body: JSON.stringify({ fields: { data: { stringValue: imgData } } }) });
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
      const remote = await this.listItems();
      const seen = new Set(); let got = 0, sent = 0;
      for (const doc of remote) {
        const id = doc.name.split('/').pop(); seen.add(id);
        const f = doc.fields || {}; const rUpd = +(f.updated?.integerValue || 0);
        const local = S.catalog.find(x => x.id === id);
        if (f.deleted?.booleanValue) { if (local) { await delImg(local.img); S.catalog = S.catalog.filter(x => x !== local); got++; } continue; }
        if (!local || rUpd > (local.updated || 0)) {
          const meta = JSON.parse(f.meta?.stringValue || '{}');
          const it = { ...meta, id, img: f.img?.stringValue || '', updated: rUpd, synced: true };
          if (local) Object.assign(local, it); else S.catalog.push(it);
          got++;
        } else if (local && (local.updated || 0) > rUpd) { await this.pushItem(local, await getImg(local.img)); sent++; }
      }
      for (const it of S.catalog.filter(x => !seen.has(x.id))) { await this.pushItem(it, await getImg(it.img)); sent++; }
      S.sync.last = Date.now(); save();
      if (manual || got) toast(`הסנכרון הושלם${got ? ` · התקבלו ${got} עדכונים` : ''}${sent ? ` · נשלחו ${sent}` : ''}`);
      if (rulesGot && manual) toast('הכללים עודכנו מהמאגר');
      if ((got && V.tab === 'catalog') || ((rulesGot || aiGot) && V.tab !== 'projects')) render();
    } catch (e) { if (manual) toast('הסנכרון נכשל: ' + e.message, 4500); }
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
    if (d && rUpd > lUpd) { S.custom = JSON.parse(d.fields.data.stringValue); save(); return true; }
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
    ${sec('_all', '🏠 כללי — כל החדרים')}
    ${ROOM_CATS.map(c => sec(c.id, c.icon + ' ' + c.name)).join('')}
    <div class="card"><h3>🛏️ מידות מיטות</h3>${BED_SIZES.map(b => `<div class="row"><span class="grow">${b.name}</span><b>${b.size}</b></div>`).join('')}</div>
    ${ed && S.custom ? '<button class="btn danger full" id="resetR">שחזור הכללים המקוריים</button><div style="height:10px"></div>' : ''}
    <div class="muted">הכללים מבוססים על חומרי הקורס ועל תקנים בישראל. הם עוזרים בסקיצה, ולא מחליפים איש מקצוע מוסמך.</div>`;
  $('#edT').onclick = () => { V.editRules = !ed; render(); };
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
      <label>שם המודל</label><input id="model" value="${esc(st.model || DEFAULT_MODEL)}" dir="ltr">
      <div class="muted" style="margin-top:6px">ברירת מחדל: ${DEFAULT_MODEL}. אפשר להחליף למודל חדש יותר.</div>
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
      <label>קטגוריות בקטלוג (שורה לכל קטגוריה)</label><textarea id="lcats" style="min-height:140px">${esc(R().catCats.join('\n'))}</textarea>
      <label>סגנונות עיצוב (שורה לכל סגנון)</label><textarea id="lsty" style="min-height:140px">${esc(R().styles.join('\n'))}</textarea>
      <div style="height:10px"></div><button class="btn sec full" id="saveLists">שמירת הרשימות</button>
      <div class="muted" style="margin-top:6px">את הכללים והמידות עורכים בלשונית "כללים" ← ✏️ עריכה.</div></div>
    <div class="card"><h3>🤝 מאגר משותף</h3>
      ${Sync.ok() ? `<div class="rule green"><span class="dot green"></span><div>מחובר למאגר משותף${S.sync.last ? ' · סנכרון אחרון ' + new Date(S.sync.last).toLocaleString('he-IL') : ''}</div></div>
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
    $('#syncNow2').onclick = () => Sync.run(true);
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
    const lines = (id) => $(id).value.split('\n').map(x => x.trim()).filter(Boolean);
    const cats = lines('#lcats'), sty = lines('#lsty');
    if (!cats.length) return toast('צריך לפחות קטגוריה אחת');
    const C = editableRules(); C.catCats = [...new Set(cats)]; C.styles = [...new Set(sty)]; rulesChanged(); toast('הרשימות נשמרו');
  };
  $('#exp').onclick = () => exportBackup(S.projects, true);
  $('#imp').onclick = importBackup;
}

async function testKey() {
  const key = S.settings.apiKey; if (!key) return toast('קודם מדביקים מפתח');
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(S.settings.model || DEFAULT_MODEL)}`, { headers: { 'x-goog-api-key': key } });
    if (r.ok) toast('✓ המפתח תקין והמודל זמין');
    else if (r.status === 404) toast('המפתח עובד, אבל שם המודל לא נמצא');
    else toast('המפתח לא תקין (' + r.status + ')');
  } catch { toast('אין חיבור לאינטרנט'); }
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
      for (const c of data.catalog || []) if (!S.catalog.some(x => x.id === c.id)) S.catalog.push(c);
      save(); toast(`שוחזרו ${added} פרויקטים`); render();
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
  migrateRules();
  render();
  playIntro(false);
  Sync.run(false);
  setTimeout(() => checkUpdate(false), 4000);
})();

// כשנוספים כללים חדשים לקובץ rules.js — מוסיפים אותם גם לכללים שנערכו, בלי למחוק עריכות
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
