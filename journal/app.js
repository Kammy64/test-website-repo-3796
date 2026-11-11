/* Mon Bujo — bullet journal + to-do list, 100 % local (localStorage). */
(() => {
  'use strict';

  const KEY = 'bujo-v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ---------- Données ----------
  const empty = () => ({ entries: {}, todos: [], months: {} });
  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(empty(), JSON.parse(raw));
    } catch (e) { /* stockage indisponible */ }
    return empty();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('⚠️ Impossible d’enregistrer'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Dates ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const todayIso = () => iso(new Date());
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

  // ---------- État de l'interface ----------
  let view = 'day';
  let day = todayIso();
  let month = todayIso().slice(0, 7);
  let type = 'task';
  let filter = 'open';
  let datePickCb = null;

  const BULLET = { task: '•', event: '○', note: '–' };
  const TASK_GLYPH = { open: '•', done: '×', migrated: '›', cancelled: '•' };

  // ---------- Rendu ----------
  function render() {
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
    $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
    $('#dateNav').hidden = view !== 'day';
    $('#monthNav').hidden = view !== 'month';
    $('#todoFilters').hidden = view !== 'todo';
    $('#composer').hidden = view === 'month';
    $('#typePicker').hidden = view !== 'day';
    $('#title').textContent = view === 'day' ? (day === todayIso() ? 'Aujourd’hui' : 'Journal')
      : view === 'todo' ? 'To-do' : 'Mois';
    updatePlaceholder();
    if (view === 'day') renderDay();
    if (view === 'todo') renderTodos();
    if (view === 'month') renderMonth();
  }

  function updatePlaceholder() {
    $('#newText').placeholder = view === 'todo' ? 'Nouvelle tâche…'
      : { task: 'Nouvelle tâche…', event: 'Nouvel événement…', note: 'Nouvelle note…' }[type];
  }

  function renderDay() {
    const t = todayIso();
    const rel = day === t ? '' : day === addDays(t, -1) ? ' · hier' : day === addDays(t, 1) ? ' · demain' : '';
    const lbl = fmtLong.format(parse(day)) + rel;
    $('#dateLabel').textContent = lbl.charAt(0).toUpperCase() + lbl.slice(1);
    const list = db.entries[day] || [];
    const ul = $('#dayList');
    ul.replaceChildren(...list.map((e) => {
      const li = el('li', `${e.type} ${e.type === 'task' ? e.status : ''}`);
      const b = el('button', 'bullet');
      b.textContent = e.type === 'task' ? TASK_GLYPH[e.status] : BULLET[e.type];
      b.setAttribute('aria-label', e.type === 'task' ? 'Cocher' : e.type);
      b.onclick = () => {
        if (e.type !== 'task') return openEntryMenu(e);
        e.status = e.status === 'done' ? 'open' : e.status === 'open' ? 'done' : 'open';
        save(); renderDay();
      };
      li.append(b, textCell(e, () => { save(); renderDay(); }, () => removeEntry(e)), moreBtn(() => openEntryMenu(e)));
      return li;
    }));
    $('#dayEmpty').hidden = list.length > 0;
  }

  function textCell(item, onSave, onEmpty) {
    const span = el('span', 'txt');
    if (item.important) { const s = el('span', 'star'); s.textContent = '★'; span.append(s); }
    span.append(document.createTextNode(item.text));
    if (item.due !== undefined && item.due) {
      const d = el('span', 'due' + (!item.done && item.due < todayIso() ? ' late' : ''));
      d.textContent = '📅 ' + fmtShort.format(parse(item.due));
      span.append(d);
    }
    span.onclick = () => startEdit(span, item, onSave, onEmpty);
    return span;
  }

  function startEdit(span, item, onSave, onEmpty) {
    if (span.isContentEditable) return;
    span.textContent = item.text;
    span.contentEditable = 'true';
    span.focus();
    const r = document.createRange(); r.selectNodeContents(span); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const finish = () => {
      span.removeEventListener('blur', finish);
      const v = span.textContent.trim();
      if (!v) return onEmpty();
      item.text = v; onSave();
    };
    span.addEventListener('blur', finish);
    span.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); span.blur(); } };
  }

  function moreBtn(fn) {
    const b = el('button', 'more'); b.textContent = '⋯'; b.setAttribute('aria-label', 'Options'); b.onclick = fn;
    return b;
  }

  function sortedTodos() {
    return db.todos
      .filter((t) => filter === 'all' || (filter === 'done' ? t.done : !t.done))
      .sort((a, b) => (a.done - b.done) || (b.important - a.important)
        || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0)
        || a.created - b.created);
  }

  function renderTodos() {
    $$('.chip').forEach((c) => c.classList.toggle('on', c.dataset.filter === filter));
    const list = sortedTodos();
    $('#todoList').replaceChildren(...list.map((t) => {
      const li = el('li', t.done ? 'done' : '');
      const c = el('button', 'check'); c.textContent = t.done ? '✓' : ''; c.setAttribute('aria-label', 'Cocher');
      c.onclick = () => { t.done = !t.done; t.doneAt = t.done ? Date.now() : undefined; save(); renderTodos(); };
      li.append(c, textCell(t, () => { save(); renderTodos(); }, () => removeTodo(t)), moreBtn(() => openTodoMenu(t)));
      return li;
    }));
    $('#todoEmpty').hidden = list.length > 0;
    $('#clearDone').hidden = !db.todos.some((t) => t.done) || filter === 'open';
  }

  function renderMonth() {
    const [y, m] = month.split('-').map(Number);
    $('#monthLabel').textContent = fmtMonth.format(new Date(y, m - 1, 1));
    const first = new Date(y, m - 1, 1);
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const nDays = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(el('span'));
    const t = todayIso();
    for (let d = 1; d <= nDays; d++) {
      const key = `${month}-${pad(d)}`;
      const list = db.entries[key] || [];
      const b = el('button', key === t ? 'today' : '');
      b.append(document.createTextNode(d));
      const dots = el('i');
      const open = list.filter((e) => e.type === 'task' && e.status === 'open').length;
      const rest = Math.min(list.length - open, 3 - Math.min(open, 3));
      for (let k = 0; k < Math.min(open, 3); k++) dots.append(el('b', 'open'));
      for (let k = 0; k < rest; k++) dots.append(el('b'));
      b.append(dots);
      b.onclick = () => { day = key; view = 'day'; render(); };
      cells.push(b);
    }
    $('#cal').replaceChildren(...cells);
    $('#monthGoals').value = (db.months[month] && db.months[month].goals) || '';

    const open = [];
    Object.keys(db.entries).filter((k) => k.startsWith(month)).sort().forEach((k) =>
      db.entries[k].forEach((e) => { if (e.type === 'task' && e.status === 'open') open.push([k, e]); }));
    $('#monthOpen').replaceChildren(...(open.length ? open.map(([k, e]) => {
      const li = el('li');
      const d = el('span'); d.textContent = fmtShort.format(parse(k));
      const s = el('span'); s.textContent = e.text;
      li.append(d, s); li.onclick = () => { day = k; view = 'day'; render(); };
      return li;
    }) : [Object.assign(el('li'), { textContent: 'Aucune — bravo !' })]));
  }

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

  // ---------- Actions ----------
  function addEntry(text) {
    (db.entries[day] = db.entries[day] || []).push({ id: uid(), type, text, status: 'open', important: false });
  }
  function addTodo(text) {
    db.todos.push({ id: uid(), text, done: false, important: false, due: '', created: Date.now() });
    if (filter === 'done') filter = 'open';
  }
  function removeEntry(e, key = day) {
    const list = db.entries[key] || [];
    const i = list.indexOf(e); if (i < 0) return;
    list.splice(i, 1);
    if (!list.length) delete db.entries[key];
    save(); render();
    toast('Supprimé', 'Annuler', () => { (db.entries[key] = db.entries[key] || []).splice(i, 0, e); save(); render(); });
  }
  function removeTodo(t) {
    const i = db.todos.indexOf(t); if (i < 0) return;
    db.todos.splice(i, 1); save(); render();
    toast('Supprimé', 'Annuler', () => { db.todos.splice(i, 0, t); save(); render(); });
  }
  function migrate(e, target) {
    e.status = 'migrated';
    (db.entries[target] = db.entries[target] || []).push({ id: uid(), type: 'task', text: e.text, status: 'open', important: e.important });
    save(); render();
    toast('Reportée au ' + fmtShort.format(parse(target)));
  }
  function migrateAllOpen() {
    const t = todayIso(); let n = 0;
    Object.keys(db.entries).filter((k) => k < t).forEach((k) => db.entries[k].forEach((e) => {
      if (e.type === 'task' && e.status === 'open') {
        e.status = 'migrated';
        (db.entries[t] = db.entries[t] || []).push({ id: uid(), type: 'task', text: e.text, status: 'open', important: e.important });
        n++;
      }
    }));
    save(); day = t; view = 'day'; render();
    toast(n ? `${n} tâche${n > 1 ? 's' : ''} reportée${n > 1 ? 's' : ''} à aujourd’hui` : 'Aucune tâche en retard 👍');
  }

  // ---------- Menus ----------
  function sheet(title, items) {
    const s = $('#sheet');
    const h = el('h3'); h.textContent = title;
    s.replaceChildren(h, ...items.filter(Boolean).map(([label, fn, cls]) => {
      const b = el('button', cls || ''); b.textContent = label;
      b.onclick = () => { closeSheet(); fn(); };
      return b;
    }), Object.assign(el('button', 'cancel'), { textContent: 'Fermer', onclick: closeSheet }));
    $('#sheetBg').hidden = false;
  }
  function closeSheet() { $('#sheetBg').hidden = true; }

  function openEntryMenu(e) {
    const isTask = e.type === 'task';
    const done = () => { save(); render(); };
    sheet(e.text, [
      ['✏️ Modifier', () => {
        const li = [...$('#dayList').children][(db.entries[day] || []).indexOf(e)];
        if (li) li.querySelector('.txt').click();
      }],
      [e.important ? '☆ Retirer « important »' : '★ Marquer important', () => { e.important = !e.important; done(); }],
      isTask && e.status === 'open' && ['› Reporter à demain', () => migrate(e, addDays(day, 1))],
      isTask && e.status === 'open' && ['📅 Reporter à une date…', () => pickDate(addDays(day, 1), (d) => migrate(e, d))],
      isTask && e.status !== 'cancelled' && ['🚫 Annuler (n’est plus utile)', () => { e.status = 'cancelled'; done(); }],
      isTask && e.status !== 'open' && ['↺ Remettre à faire', () => { e.status = 'open'; done(); }],
      isTask && ['✓ Copier dans la to-do', () => { addTodo(e.text); save(); toast('Ajoutée à la to-do'); }],
      !isTask && ['• Transformer en tâche', () => { e.type = 'task'; e.status = 'open'; done(); }],
      e.type !== 'event' && ['○ Transformer en événement', () => { e.type = 'event'; done(); }],
      e.type !== 'note' && ['– Transformer en note', () => { e.type = 'note'; done(); }],
      ['🗑 Supprimer', () => removeEntry(e), 'danger'],
    ]);
  }

  function openTodoMenu(t) {
    const done = () => { save(); render(); };
    sheet(t.text, [
      ['✏️ Modifier', () => {
        const li = [...$('#todoList').children][sortedTodos().indexOf(t)];
        if (li) li.querySelector('.txt').click();
      }],
      [t.important ? '☆ Retirer la priorité' : '★ Prioritaire', () => { t.important = !t.important; done(); }],
      ['📅 ' + (t.due ? 'Changer l’échéance' : 'Ajouter une échéance'), () => pickDate(t.due || todayIso(), (d) => { t.due = d; done(); })],
      t.due && ['Retirer l’échéance', () => { t.due = ''; done(); }],
      ['📖 Planifier dans le journal d’aujourd’hui', () => {
        const k = todayIso();
        (db.entries[k] = db.entries[k] || []).push({ id: uid(), type: 'task', text: t.text, status: 'open', important: t.important });
        save(); toast('Ajoutée au journal du jour');
      }],
      ['🗑 Supprimer', () => removeTodo(t), 'danger'],
    ]);
  }

  function openMainMenu() {
    sheet('Menu', [
      ['📖 Aller à aujourd’hui', () => { day = todayIso(); month = day.slice(0, 7); view = 'day'; render(); }],
      ['📅 Aller à une date…', () => pickDate(day, (d) => { day = d; view = 'day'; render(); })],
      ['› Reporter toutes les tâches en retard à aujourd’hui', migrateAllOpen],
      ['💾 Exporter une sauvegarde', exportData],
      ['📂 Importer une sauvegarde', () => $('#importFile').click()],
    ]);
  }

  function pickDate(initial, cb) {
    const p = $('#datePicker');
    p.value = initial; datePickCb = cb;
    if (p.showPicker) { try { p.showPicker(); return; } catch (e) { /* repli */ } }
    const v = prompt('Date (AAAA-MM-JJ)', initial);
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) cb(v);
  }
  $('#datePicker').addEventListener('change', (e) => {
    if (e.target.value && datePickCb) datePickCb(e.target.value);
    datePickCb = null;
  });

  // ---------- Sauvegarde ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `bujo-${todayIso()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data.entries !== 'object' || !Array.isArray(data.todos)) throw new Error();
      if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
      db = Object.assign(empty(), data); save(); render(); toast('Sauvegarde importée');
    } catch (err) { toast('Fichier invalide'); }
  });

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, actionLabel, action) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = el('div', 'toast'); t.textContent = msg;
    if (actionLabel) {
      const b = el('button'); b.textContent = ' ' + actionLabel;
      b.style.cssText = 'color:inherit;font-weight:700;margin-left:10px;text-decoration:underline';
      b.onclick = () => { t.remove(); action(); };
      t.append(b);
    }
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), actionLabel ? 4500 : 2200);
  }

  // ---------- Événements ----------
  $$('.tab').forEach((b) => (b.onclick = () => { view = b.dataset.view; render(); }));
  $$('.chip').forEach((b) => (b.onclick = () => { filter = b.dataset.filter; renderTodos(); }));
  $$('.type').forEach((b) => (b.onclick = () => {
    type = b.dataset.type;
    $$('.type').forEach((x) => x.classList.toggle('on', x === b));
    updatePlaceholder(); $('#newText').focus();
  }));
  $('#prevDay').onclick = () => { day = addDays(day, -1); render(); };
  $('#nextDay').onclick = () => { day = addDays(day, 1); render(); };
  $('#dateLabel').onclick = () => pickDate(day, (d) => { day = d; render(); });
  $('#prevMonth').onclick = () => { const [y, m] = month.split('-').map(Number); month = iso(new Date(y, m - 2, 1)).slice(0, 7); render(); };
  $('#nextMonth').onclick = () => { const [y, m] = month.split('-').map(Number); month = iso(new Date(y, m, 1)).slice(0, 7); render(); };
  $('#menuBtn').onclick = openMainMenu;
  $('#sheetBg').onclick = (e) => { if (e.target.id === 'sheetBg') closeSheet(); };
  $('#clearDone').onclick = () => {
    const kept = db.todos.filter((t) => !t.done), old = db.todos;
    db.todos = kept; save(); render();
    toast('Tâches faites effacées', 'Annuler', () => { db.todos = old; save(); render(); });
  };
  $('#monthGoals').addEventListener('input', (e) => {
    db.months[month] = { goals: e.target.value }; save();
  });
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#newText'); const v = input.value.trim();
    if (!v) return;
    if (view === 'todo') addTodo(v); else addEntry(v);
    input.value = ''; save(); render();
    const main = document.querySelector('main'); main.scrollTop = main.scrollHeight;
  });

  // Swipe gauche/droite pour changer de jour
  let sx = null, sy = null;
  $('#view-day').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('#view-day').addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && !document.activeElement.isContentEditable) {
      day = addDays(day, dx < 0 ? 1 : -1); render();
    }
  });

  // Mise à jour si l'appli reste ouverte après minuit / revient au premier plan
  let lastToday = todayIso();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && todayIso() !== lastToday) {
      if (day === lastToday) day = todayIso();
      lastToday = todayIso(); render();
    }
  });

  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
