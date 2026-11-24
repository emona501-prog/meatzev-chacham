// =====================================================================
// מעצב חכם — אפליקציית סקיצות לעיצוב פנים והום סטיילינג
// חי אפליקציות
// =====================================================================
const APP_VERSION = '0.1.0';
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

let S = { projects: [], catalog: [], settings: { apiKey: '', model: DEFAULT_MODEL, printNotes: true } };
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
function pickFiles(multiple = false) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple;
    i.onchange = () => res([...i.files]); i.click();
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
  go({ tab: b.dataset.tab, projectId: null, roomId: null });
});
$('#backBtn').onclick = () => {
  if (V.roomId) go({ roomId: null }); else if (V.projectId) go({ projectId: null });
};
$('#helpBtn').onclick = showHelp;

function setHeader(title, back) {
  $('#title').textContent = title;
  $('#backBtn').style.display = back ? '' : 'none';
}

async function render() {
  const app = $('#app');
  if (V.tab === 'projects') {
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
    <div class="row" style="margin:6px 0 10px"><h2 class="grow" style="margin:0">חדרים</h2><button class="btn" id="newR">+ חדר</button></div>
    ${p.rooms.length ? p.rooms.map(r => {
      const c = catOf(r.cat);
      return `<div class="card list-item" data-id="${r.id}"><div class="ic" data-cover="${r.photos[0] || ''}">${c.icon}</div>
        <div class="grow"><b>${esc(r.name)}</b><div class="muted">${c.name}${r.L ? ` · ${r.L}×${r.W}${r.H ? '×' + r.H : ''} ס"מ` : ''} · ${r.designs.length} הדמיות</div></div><span class="muted">‹</span></div>`;
    }).join('') : `<div class="empty"><b>📐</b>מוסיפים חדר, מגדירים מידות ומעלים תמונה.</div>`}`;
  app.querySelectorAll('[data-cover]').forEach(async el => { const id = el.dataset.cover; if (id) { const d = await getImg(id); if (d) el.innerHTML = `<img src="${d}">`; } });
  app.querySelectorAll('.list-item[data-id]').forEach(el => el.onclick = () => go({ roomId: el.dataset.id, roomTab: 'design' }));
  $('#newR').onclick = () => roomForm();
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
      <button class="btn sec sm" id="addPh">+ תמונה</button></div>
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
    const files = await pickFiles(true); if (!files.length) return;
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
  const sel = { base: fromDesign ? fromDesign.result : r.photos[0], style: fromDesign?.style || '', items: new Set(fromDesign?.items || []), keep: true };
  const bases = [...r.photos.map(id => ({ id, label: 'מקור' })), ...r.designs.map(d => ({ id: d.result, label: 'הדמיה' }))];
  modal('✨ עיצוב חדש', `
    <label>1. על איזו תמונה מעצבים?</label>
    <div class="thumbs" id="bases">${bases.map(b => `<div class="t ${b.id === sel.base ? 'sel' : ''}" data-id="${b.id}"><img><span class="badge" style="position:absolute;bottom:4px;right:4px">${b.label}</span></div>`).join('')}</div>
    <label>2. סגנון (לא חובה)</label>
    <div class="chips" id="styles">${STYLES.map(s => `<span class="chip ${s === sel.style ? 'on' : ''}">${esc(s)}</span>`).join('')}</div>
    <label>3. מוצרים מהקטלוג (המערכת תשתמש בדיוק בהם)</label>
    <div id="items">${S.catalog.length ? '' : '<div class="muted">הקטלוג ריק. אפשר להוסיף מוצרים בלשונית "קטלוג".</div>'}</div>
    <label>4. מה לשנות? (במילים שלך)</label>
    <textarea id="ins" placeholder="למשל: להחליף את הריצוף לאריח שבחרתי, לצבוע את הקיר מאחורי המיטה בבז' חם, להשאיר את הארון כמו שהוא">${esc('')}</textarea>
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="keep" checked style="width:auto"> לשנות רק מה שביקשתי, כל השאר נשאר בדיוק אותו דבר</label>
    <div style="height:14px"></div>
    <button class="btn full" id="go">✨ צור הדמיה</button>
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
    for (const it of S.catalog) {
      const d = document.createElement('div'); d.className = 'card pick cat-item' + (sel.items.has(it.id) ? ' on' : ''); d.style.padding = '8px'; d.style.marginBottom = '6px';
      d.innerHTML = `<img><div class="grow"><b>${esc(it.name)}</b><div class="muted">${esc(it.cat)}${it.supplier ? ' · ' + esc(it.supplier) : ''}</div></div>`;
      d.querySelector('img').src = await getImg(it.img) || 'icon.svg';
      d.onclick = () => { sel.items.has(it.id) ? sel.items.delete(it.id) : sel.items.add(it.id); d.classList.toggle('on'); };
      itemsEl.appendChild(d);
    }
    $('#go', b).onclick = async () => {
      if (!S.settings.apiKey) { toast('צריך להכניס מפתח AI בהגדרות'); return; }
      const ins = $('#ins', b).value.trim();
      if (!ins && !sel.style && !sel.items.size) return toast('בוחרים סגנון, מוצר או כותבים מה לשנות');
      sel.keep = $('#keep', b).checked;
      const out = $('#out', b); const btn = $('#go', b);
      btn.disabled = true; out.innerHTML = `<div class="spinner"></div><div class="muted" style="text-align:center">יוצר הדמיה… זה לוקח בערך 10–30 שניות</div>`;
      try {
        const baseImg = await getImg(sel.base);
        const items = [...sel.items].map(id => S.catalog.find(x => x.id === id)).filter(Boolean);
        const refs = []; for (const it of items) refs.push({ item: it, img: await getImg(it.img) });
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
    items.forEach((it, i) => lines.push(`${i + 1}. ${it.name} — category: ${it.cat}${it.dims ? ', size: ' + it.dims : ''}${it.color ? ', finish/color: ' + it.color : ''}${it.note ? ', note: ' + it.note : ''}`));
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
  const checks = [...(CHECKS[r.cat] || []), ...CHECKS._all];
  const fixed = [...(FIXED_RULES[r.cat] || []), ...FIXED_RULES._all];
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
// קטלוג
// =====================================================================
async function renderCatalog(app) {
  setHeader('קטלוג מוצרים', false);
  const list = S.catalog.filter(x => !V.catFilter || x.cat === V.catFilter);
  app.innerHTML = `
    <div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">קטלוג</h2><button class="btn" id="newI">+ מוצר</button></div>
    <div class="muted" style="margin-bottom:10px">מוצרים אמיתיים מהשוק. ה-AI משתמש בתמונה של המוצר ולא ממציא משהו אחר.</div>
    <div class="chips" style="margin-bottom:12px"><span class="chip ${!V.catFilter ? 'on' : ''}" data-c="">הכול</span>
      ${CATALOG_CATS.map(c => `<span class="chip ${V.catFilter === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</div>
    <div id="clist">${list.length ? '' : '<div class="empty"><b>🧱</b>אין מוצרים בקטגוריה הזו.</div>'}</div>`;
  app.querySelectorAll('[data-c]').forEach(c => c.onclick = () => go({ catFilter: c.dataset.c }));
  $('#newI').onclick = () => itemForm();
  const cl = $('#clist');
  for (const it of list) {
    const d = document.createElement('div'); d.className = 'card cat-item';
    d.innerHTML = `<img><div class="grow"><b>${esc(it.name)}</b><div class="muted">${esc(it.cat)}${it.supplier ? ' · ' + esc(it.supplier) : ''}${it.price ? ' · ' + esc(it.price) : ''}</div>
      ${it.dims || it.color ? `<div class="muted">${esc([it.dims, it.color].filter(Boolean).join(' · '))}</div>` : ''}</div><span class="muted">‹</span>`;
    d.querySelector('img').src = await getImg(it.img) || 'icon.svg';
    d.onclick = () => itemForm(it);
    cl.appendChild(d);
  }
}
function itemForm(it) {
  let newImg = null;
  modal(it ? 'עריכת מוצר' : 'מוצר חדש', `
    <div id="imgBox" style="text-align:center"><img id="ip" style="max-width:100%;max-height:200px;border-radius:12px;display:none">
      <button class="btn sec full" id="pickI" style="margin-top:8px">📷 תמונת המוצר</button></div>
    <label>שם המוצר</label><input id="in" value="${esc(it?.name || '')}" placeholder="למשל: גרניט פורצלן דמוי בטון 60×120">
    <label>קטגוריה</label><select id="ic">${CATALOG_CATS.map(c => `<option ${it?.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label>ספק / חנות</label><input id="is" value="${esc(it?.supplier || '')}">
    <div class="grid2"><div><label>מידות</label><input id="id" value="${esc(it?.dims || '')}" placeholder="60×120 ס&quot;מ"></div>
      <div><label>צבע / גימור</label><input id="ico" value="${esc(it?.color || '')}" placeholder="אפור מט"></div></div>
    <div class="grid2"><div><label>מחיר</label><input id="ipr" value="${esc(it?.price || '')}" placeholder='120 ₪ למ"ר'></div>
      <div><label>קישור</label><input id="il" value="${esc(it?.link || '')}" inputmode="url"></div></div>
    <label>הערה</label><textarea id="ino">${esc(it?.note || '')}</textarea>
    <div style="height:14px"></div><button class="btn full" id="ok">שמירה</button>
    ${it ? '<div style="height:8px"></div><button class="btn danger full" id="del">מחיקת המוצר</button>' : ''}`, async (b, close) => {
    const ip = $('#ip', b);
    if (it?.img) { ip.src = await getImg(it.img); ip.style.display = ''; }
    $('#pickI', b).onclick = async () => { const [f] = await pickFiles(); if (!f) return; newImg = await compressImage(f, 1024); ip.src = newImg; ip.style.display = ''; };
    $('#ok', b).onclick = async () => {
      const name = $('#in', b).value.trim(); if (!name) return toast('צריך שם למוצר');
      const d = { name, cat: $('#ic', b).value, supplier: $('#is', b).value.trim(), dims: $('#id', b).value.trim(), color: $('#ico', b).value.trim(), price: $('#ipr', b).value.trim(), link: $('#il', b).value.trim(), note: $('#ino', b).value.trim() };
      if (newImg) { if (it?.img) await delImg(it.img); d.img = await putImg(newImg); }
      if (it) Object.assign(it, d); else S.catalog.push({ id: uid(), ...d });
      save(); close(); render();
    };
    if (it) $('#del', b).onclick = async () => {
      if (!confirm('למחוק את המוצר?')) return;
      await delImg(it.img); S.catalog = S.catalog.filter(x => x !== it); save(); close(); render();
    };
  });
}

// =====================================================================
// כללים (ספר הכללים)
// =====================================================================
function renderRules(app) {
  setHeader('ספר הכללים', false);
  const sec = (title, fixed, checks) => `<div class="card"><h3>${title}</h3>
    ${(fixed || []).map(f => `<div class="rule ${f.level}"><span class="dot ${f.level}"></span><div>${esc(f.text)}</div></div>`).join('')}
    ${(checks || []).map(c => `<div class="rule ${c.level}"><span class="dot ${c.level}"></span><div><b>${esc(c.label)}</b>${c.min != null || c.max != null ? ` — ${c.min != null ? 'מינ׳ ' + c.min : ''}${c.min != null && c.max != null ? ', ' : ''}${c.max != null ? 'מקס׳ ' + c.max : ''} ס"מ` : ''}<br>${esc(c.msg)}</div></div>`).join('')}</div>`;
  app.innerHTML = `
    <h2>📏 ספר הכללים</h2>
    <div class="card"><div class="rule red"><span class="dot red"></span><div>אדום = אסור</div></div>
      <div class="rule orange"><span class="dot orange"></span><div>כתום = דורש בדיקה</div></div>
      <div class="rule green"><span class="dot green"></span><div>ירוק = המלצה מקצועית</div></div></div>
    ${sec('🏠 כללי — כל החדרים', FIXED_RULES._all, CHECKS._all)}
    ${ROOM_CATS.filter(c => FIXED_RULES[c.id] || CHECKS[c.id]).map(c => sec(c.icon + ' ' + c.name, FIXED_RULES[c.id], CHECKS[c.id])).join('')}
    <div class="card"><h3>🛏️ מידות מיטות</h3>${BED_SIZES.map(b => `<div class="row"><span class="grow">${b.name}</span><b>${b.size}</b></div>`).join('')}</div>
    <div class="muted">הכללים מבוססים על חומרי הקורס ועל תקנים בישראל. הם עוזרים בסקיצה, ולא מחליפים איש מקצוע מוסמך.</div>`;
}

// =====================================================================
// הגדרות + גיבוי
// =====================================================================
function renderSettings(app) {
  setHeader('הגדרות', false);
  const st = S.settings;
  app.innerHTML = `
    <div class="card"><h3>🤖 מנוע ה-AI (Google Gemini)</h3>
      <label>מפתח AI</label>
      <div class="row"><input id="key" type="password" class="grow" value="${esc(st.apiKey)}" placeholder="מדביקים כאן את המפתח" autocomplete="off" style="flex:1">
        <button class="btn sec sm" id="showK">👁</button></div>
      <div class="muted" style="margin-top:6px">המפתח נשמר רק בטלפון הזה. מקבלים אותו ב-aistudio.google.com ← Get API key. להדמיות צריך להפעיל חיוב בחשבון גוגל (מומלץ עם תקרת הוצאה).</div>
      <label>שם המודל</label><input id="model" value="${esc(st.model || DEFAULT_MODEL)}" dir="ltr">
      <div class="muted" style="margin-top:6px">ברירת מחדל: ${DEFAULT_MODEL}. אפשר להחליף למודל חדש יותר.</div>
      <div style="height:10px"></div><button class="btn sec full" id="test">בדיקת חיבור</button></div>
    <div class="card"><h3>📄 הדפסה</h3>
      <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="pn" style="width:auto" ${st.printNotes ? 'checked' : ''}> להדפיס הערות בתיק הפרויקט</label></div>
    <div class="card"><h3>💾 גיבוי ושחזור</h3>
      <div class="muted">חשוב במיוחד באייפון: שומרים גיבוי מדי פעם. אפשר גם לשלוח את הקובץ בוואטסאפ כדי להעביר פרויקטים לטלפון אחר.</div>
      <div style="height:10px"></div>
      <button class="btn full" id="exp">⬇️ גיבוי של הכול</button><div style="height:8px"></div>
      <button class="btn sec full" id="imp">⬆️ שחזור מקובץ גיבוי</button></div>
    <div class="card"><h3>📲 התקנה למסך הבית</h3>
      <div style="font-size:14px;line-height:1.6"><b>אנדרואיד:</b> בכרום ← תפריט ⋮ ← "הוסף למסך הבית".<br>
      <b>אייפון:</b> רק ב-Safari ← כפתור השיתוף ⬆️ ← "הוסף למסך הבית".</div></div>
    <div class="muted" style="text-align:center">מעצב חכם · גרסה ${APP_VERSION} · חי אפליקציות</div>`;
  $('#key').onchange = e => { st.apiKey = e.target.value.trim(); save(); toast('המפתח נשמר'); };
  $('#showK').onclick = () => { const k = $('#key'); k.type = k.type === 'password' ? 'text' : 'password'; };
  $('#model').onchange = e => { st.model = e.target.value.trim() || DEFAULT_MODEL; save(); };
  $('#pn').onchange = e => { st.printNotes = e.target.checked; save(); };
  $('#test').onclick = testKey;
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
  for (const r of p.rooms) {
    const c = catOf(r.cat);
    h += `<div class="pp"><h2>${c.icon} ${esc(r.name)}</h2><p>${c.name}${r.L ? ` · מידות: ${r.L}×${r.W}${r.H ? '×' + r.H : ''} ס"מ` : ''}</p>`;
    const checks = [...(CHECKS[r.cat] || []), ...CHECKS._all].filter(ch => r.checks[ch.key] !== '' && r.checks[ch.key] != null);
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
  render();
})();
