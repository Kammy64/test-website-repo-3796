/* Mon Bujo — bullet journal + to-do list, 100 % local (localStorage). */
(() => {
  'use strict';

  const KEY = 'bujo-v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ---------- Données ----------
  const empty = () => ({ entries: {}, todos: [], months: {}, moods: {}, period: {}, habits: [], hlog: {} });
  let db = load();
  if (!db.period) db.period = {};
  if (!db.habits) db.habits = [];
  if (!db.hlog) db.hlog = {};
  let store = null;          // collection privée de la personne (db)
  const dirty = new Set();   // documents à réécrire
  let saveTimer = null, saving = false;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(empty(), JSON.parse(raw));
    } catch (e) { /* stockage indisponible */ }
    return empty();
  }
  // Un document par mois pour le journal, un pour la to-do + objectifs.
  function docsFor(all) {
    const out = { core: { todos: db.todos, months: db.months, habits: db.habits } };
    for (const k of Object.keys(db.entries)) {
      const id = 'e-' + k.slice(0, 7);
      (out[id] = out[id] || { days: {} }).days[k] = db.entries[k];
    }
    for (const k of Object.keys(db.moods || {})) {
      const id = 'e-' + k.slice(0, 7);
      out[id] = out[id] || { days: {} };
      (out[id].moods = out[id].moods || {})[k] = db.moods[k];
    }
    for (const k of Object.keys(db.period || {})) {
      const id = 'e-' + k.slice(0, 7);
      out[id] = out[id] || { days: {} };
      (out[id].period = out[id].period || {})[k] = db.period[k];
    }
    for (const k of Object.keys(db.hlog || {})) {
      const id = 'e-' + k.slice(0, 7);
      out[id] = out[id] || { days: {} };
      (out[id].hlog = out[id].hlog || {})[k] = db.hlog[k];
    }
    return all ? out : out;
  }
  function save(monthKeys) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
    dirty.add('core');
    (monthKeys || [day, todayIso()]).forEach((k) => dirty.add('e-' + k.slice(0, 7)));
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
  }
  function markAll() {
    dirty.add('core');
    Object.keys(db.entries).concat(Object.keys(db.moods || {}), Object.keys(db.period || {}), Object.keys(db.hlog || {})).forEach((k) => dirty.add('e-' + k.slice(0, 7)));
  }
  async function flush() {
    if (!store || saving || !dirty.size) return;
    saving = true;
    const docs = docsFor();
    const ids = [...dirty]; dirty.clear();
    try {
      for (const id of ids) await store.doc(id).set(docs[id] || { days: {} });
      setSync('✓ Synchronisé');
      const gs = $('#goalsState'); if (gs && gs.textContent) gs.textContent = '✓ Objectifs enregistrés';
    } catch (e) {
      const gs = $('#goalsState'); if (gs && gs.textContent) gs.textContent = '⚠️ Pas encore enregistré, nouvel essai…';
      ids.forEach((id) => dirty.add(id));
      setSync('⚠️ Non synchronisé');
      clearTimeout(saveTimer); saveTimer = setTimeout(flush, 5000);
    }
    saving = false;
    if (dirty.size) flush();
  }
  function setSync(t) {
    if (!store) { const gs = $('#goalsState'); if (gs && gs.textContent === 'Enregistrement…') gs.textContent = '✓ Enregistré'; } const s = $('#sync'); if (s) s.textContent = t; }

  async function connect() {
    if (!window.claude || !window.claude.use) return setSync('Sur cet appareil');
    try {
      const [dbx, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      const id = user && await user.id();
      if (!dbx || !id) return setSync('Sur cet appareil');
      const col = dbx.collection('data/users/' + id);
      const snap = await Promise.race([col.get(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 10000))]);
      store = col;
      if (snap.size) {
        const next = empty();
        snap.docs.forEach((d) => {
          const v = JSON.parse(JSON.stringify(d.data() || {})); // copie modifiable (les données reçues sont figées)
          if (d.id === 'core') { next.todos = v.todos || []; next.months = v.months || {}; next.habits = v.habits || []; }
          else { Object.assign(next.entries, v.days || {}); Object.assign(next.moods, v.moods || {}); Object.assign(next.period, v.period || {}); Object.assign(next.hlog, v.hlog || {}); }
        });
        db = next;
        try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
        render();
      } else if (db.todos.length || Object.keys(db.entries).length || Object.keys(db.moods).length || Object.keys(db.period).length || db.habits.length) {
        markAll(); flush();
      }
      setSync('✓ Synchronisé');
      const gs = $('#goalsState'); if (gs && gs.textContent) gs.textContent = '✓ Objectifs enregistrés';
    } catch (e) {
      const gs = $('#goalsState'); if (gs && gs.textContent) gs.textContent = '⚠️ Pas encore enregistré, nouvel essai…'; setSync('Sur cet appareil'); }
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

  const BULLET = { task: '•', event: '○', note: '–', joy: '✿' };
  const TASK_GLYPH = { open: '•', done: '×', migrated: '›', cancelled: '•' };

  // ---------- Rendu ----------
  function render() {
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
    $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
    $('#dateNav').hidden = view !== 'day';
    $('#moodRow').hidden = view !== 'day';
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
      : { task: 'Nouvelle tâche…', event: 'Nouvel événement…', note: 'Nouvelle note…', joy: 'Un instant joyeux…' }[type];
  }

  function renderDay() {
    const t = todayIso();
    const rel = day === t ? '' : day === addDays(t, -1) ? ' · hier' : day === addDays(t, 1) ? ' · demain' : '';
    const lbl = fmtLong.format(parse(day)) + rel;
    $('#dateLabel').textContent = lbl.charAt(0).toUpperCase() + lbl.slice(1);
    renderMood();
    renderPeriodBtn();
    renderHabitsDay();
    const all = db.entries[day] || [];
    const row = (e) => {
      const li = el('li', `${e.type} ${e.type === 'task' ? e.status : ''}`);
      li.dataset.id = e.id;
      const b = el('button', 'bullet');
      b.textContent = e.type === 'task' ? TASK_GLYPH[e.status] : BULLET[e.type];
      b.setAttribute('aria-label', e.type === 'task' ? 'Cocher' : 'Options');
      b.onclick = () => {
        if (e.type !== 'task') return openEntryMenu(e);
        e.status = e.status === 'done' ? 'open' : e.status === 'open' ? 'done' : 'open';
        save(); renderDay();
      };
      li.append(b, textCell(e, () => { save(); renderDay(); }, () => removeEntry(e)), moreBtn(() => openEntryMenu(e)));
      return li;
    };
    const list = all.filter((e) => e.type !== 'joy');
    const joys = all.filter((e) => e.type === 'joy');
    $('#dayList').replaceChildren(...list.map(row));
    $('#joyList').replaceChildren(...joys.map(row));
    $('#dayEmpty').hidden = list.length > 0;
    $('#joyEmpty').hidden = joys.length > 0;
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
    const info = cycleInfo();
    for (let d = 1; d <= nDays; d++) {
      const key = `${month}-${pad(d)}`;
      const list = db.entries[key] || [];
      const md = db.moods[key];
      const b = el('button', (key === t ? 'today' : '') + (md && md.color ? ' mood' : ''));
      if (md && md.color) b.style.background = md.color;
      b.append(document.createTextNode(d));
      if (md && md.emoji) { const em = el('em'); em.textContent = md.emoji; b.append(em); }
      if (db.period[key]) { b.classList.add('period'); const dr = el('span', 'drop'); dr.textContent = '🩸'; b.append(dr); }
      else if (info.predicted.has(key)) b.classList.add('pred');
      const dots = el('i');
      const open = list.filter((e) => e.type === 'task' && e.status === 'open').length;
      const hasJoy = list.some((e) => e.type === 'joy');
      const rest = Math.max(0, Math.min(list.filter((e) => e.type !== 'joy').length - open, 3 - Math.min(open, 3) - (hasJoy ? 1 : 0)));
      for (let k = 0; k < Math.min(open, hasJoy ? 2 : 3); k++) dots.append(el('b', 'open'));
      for (let k = 0; k < rest; k++) dots.append(el('b'));
      if (hasJoy) dots.append(el('b', 'joy'));
      b.append(dots);
      b.onclick = () => { day = key; view = 'day'; render(); };
      cells.push(b);
    }
    $('#cal').replaceChildren(...cells);
    renderMoodSum();
    renderCycle(info);
    renderHabitGrid();
    const joysM = [];
    Object.keys(db.entries).filter((k) => k.startsWith(month)).sort().forEach((k) =>
      db.entries[k].forEach((e) => { if (e.type === 'joy') joysM.push([k, e]); }));
    const joyLi = ([k, e]) => {
      const li = el('li');
      const d = el('span'); d.textContent = fmtShort.format(parse(k));
      const t2 = el('span'); t2.textContent = (e.important ? '★ ' : '') + e.text;
      li.append(d, t2); li.onclick = () => { day = k; view = 'day'; render(); };
      return li;
    };
    const noJoy = () => [Object.assign(el('li'), { textContent: 'Pas encore d’instant joyeux noté ce mois-ci' })];
    // Sélection de 5 instants au hasard, identique toute la journée et renouvelée chaque jour.
    const pick = dailyShuffle(joysM, todayIso() + '|' + month).slice(0, 5)
      .sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
    $('#monthJoys').replaceChildren(...(pick.length ? pick.map(joyLi) : noJoy()));
    $('#monthJoysAll').replaceChildren(...(joysM.length ? joysM.map(joyLi) : noJoy()));
    $('#monthJoyCount').textContent = joysM.length ? `(${joysM.length})` : '';
    $('#monthGoals').value = (db.months[month] && db.months[month].goals) || '';
  }

  // Mélange déterministe : même graine (date du jour) → même ordre.
  function dailyShuffle(arr, seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rand = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }


  // ---------- Humeur du jour ----------
  const FACES = [['🤩','Au top'],['😄','Joyeux·se'],['🙂','Bien'],['😌','Serein·e'],['🥰','Aimé·e'],
                 ['😐','Bof'],['😴','Fatigué·e'],['😰','Stressé·e'],['😢','Triste'],['😠','En colère']];
  const COLORS = [['#ffe8a3','Joie'],['#ffc9de','Amour'],['#ffd5b8','Énergie'],['#c9eed6','Calme'],
                  ['#bfe2f6','Sérénité'],['#ddd0f6','Fatigue'],['#d3d9e6','Tristesse'],['#f7b9b9','Stress']];
  function renderMood() {
    const m = db.moods[day];
    const b = $('#moodBtn');
    const face = el('span', 'face'); face.textContent = (m && m.emoji) || '＋';
    const label = el('span');
    const name = m && (FACES.find((f) => f[0] === m.emoji) || COLORS.find((c) => c[0] === m.color) || [])[1];
    label.textContent = m ? (name || 'Mon humeur') : 'Comment je me sens ?';
    b.replaceChildren(face, label);
    b.className = 'mood-btn' + (m ? ' set' : '');
    b.style.background = (m && m.color) || (m ? 'var(--accent-soft)' : '');
    if (m && !m.color) b.style.color = 'var(--ink)'; else b.style.color = '';
  }
  function setMood(patch) {
    const cur = Object.assign({}, db.moods[day], patch);
    Object.keys(cur).forEach((k) => { if (!cur[k]) delete cur[k]; });
    if (Object.keys(cur).length) db.moods[day] = cur; else delete db.moods[day];
    save([day]); renderMood();
  }
  function openMoodSheet() {
    const s = $('#sheet');
    const draw = () => {
      const m = db.moods[day] || {};
      const h = el('h3'); h.textContent = 'Humeur · ' + fmtLong.format(parse(day));
      const h1 = el('h4'); h1.textContent = 'Un smiley';
      const g = el('div', 'mood-grid');
      FACES.forEach(([f, n]) => {
        const b = el('button', m.emoji === f ? 'on' : ''); b.textContent = f;
        const sm = el('small'); sm.textContent = n; b.append(sm);
        b.setAttribute('aria-label', n);
        b.onclick = () => { setMood({ emoji: m.emoji === f ? '' : f }); draw(); };
        g.append(b);
      });
      const h2 = el('h4'); h2.textContent = 'Une couleur';
      const sw = el('div', 'swatches');
      COLORS.forEach(([c, n]) => {
        const b = el('button', m.color === c ? 'on' : ''); b.style.background = c; b.textContent = n;
        b.setAttribute('aria-label', n);
        b.onclick = () => { setMood({ color: m.color === c ? '' : c }); draw(); };
        sw.append(b);
      });
      const items = [h, h1, g, h2, sw];
      if (db.moods[day]) items.push(Object.assign(el('button', 'danger'), { textContent: 'Effacer l’humeur', onclick: () => { delete db.moods[day]; save([day]); renderMood(); draw(); } }));
      items.push(Object.assign(el('button', 'cancel primary'), { textContent: 'Terminé', onclick: closeSheet }));
      s.replaceChildren(...items);
    };
    draw();
    $('#sheetBg').hidden = false;
  }
  $('#moodBtn').onclick = openMoodSheet;
  $('#joyAdd').onclick = () => { const b = document.querySelector('.type[data-type="joy"]'); b.click(); };

  function renderMoodSum() {
    const counts = {}, colors = {};
    Object.keys(db.moods).filter((k) => k.startsWith(month)).forEach((k) => {
      const m = db.moods[k];
      if (m.emoji) counts[m.emoji] = (counts[m.emoji] || 0) + 1;
      if (m.color) colors[m.color] = (colors[m.color] || 0) + 1;
    });
    const chips = [];
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => {
      const c = el('span'); c.textContent = `${f} × ${n}`; chips.push(c);
    });
    Object.entries(colors).sort((a, b) => b[1] - a[1]).forEach(([col, n]) => {
      const c = el('span'); const dot = el('i'); dot.style.background = col;
      c.append(dot, document.createTextNode(`${(COLORS.find((x) => x[0] === col) || [, ''])[1]} × ${n}`)); chips.push(c);
    });
    if (!chips.length) { const e = el('span'); e.textContent = 'Pas encore d’humeur notée ce mois-ci'; e.style.color = 'var(--muted)'; chips.push(e); }
    $('#moodSum').replaceChildren(...chips);
  }


  // ---------- Cycle menstruel ----------
  const FLOW = { light: 'léger', medium: 'moyen', heavy: 'abondant' };
  const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  function cycleInfo() {
    const days = Object.keys(db.period).sort();
    const set = new Set(days);
    const periods = [];
    days.forEach((d) => {
      if (!set.has(addDays(d, -1))) periods.push({ start: d, len: 1 });
      else periods[periods.length - 1].len++;
    });
    const cycles = [];
    for (let i = 1; i < periods.length; i++) cycles.push({ from: periods[i - 1].start, to: periods[i].start, days: dayDiff(periods[i - 1].start, periods[i].start), len: periods[i - 1].len });
    const usable = cycles.filter((c) => c.days >= 15 && c.days <= 60).slice(-6);
    const avg = usable.length ? Math.round(usable.reduce((a, c) => a + c.days, 0) / usable.length) : null;
    const lens = periods.slice(-6).map((p) => p.len);
    const avgLen = lens.length ? Math.max(1, Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)) : 5;
    const t = todayIso();
    const past = periods.filter((p) => p.start <= t);
    const last = past.length ? past[past.length - 1] : null;
    const predicted = new Set();
    let next = null;
    if (last && avg) {
      next = addDays(last.start, avg);
      while (next < t && dayDiff(next, t) > 7) next = addDays(next, avg); // si oubli de noter
      for (let c = 0; c < 3; c++) {
        const st = addDays(next, c * avg);
        for (let k = 0; k < avgLen; k++) { const d = addDays(st, k); if (!set.has(d) && d >= t) predicted.add(d); }
      }
    }
    return { periods, cycles, avg, avgLen, last, next, predicted, cycleDay: last ? dayDiff(last.start, t) + 1 : null };
  }
  function renderPeriodBtn() {
    const f = db.period[day];
    const b = $('#periodBtn');
    b.className = 'period-btn' + (f ? ' on' : '');
    b.textContent = f ? `🩸 Règles · ${FLOW[f]}` : '🩸 Règles ?';
  }
  function openPeriodSheet() {
    const set = (v) => { if (v) db.period[day] = v; else delete db.period[day]; save([day]); renderPeriodBtn(); };
    const f = db.period[day];
    sheet('Règles · ' + fmtLong.format(parse(day)), [
      [(f === 'light' ? '✓ ' : '') + '🩸 Flux léger', () => set('light')],
      [(f === 'medium' ? '✓ ' : '') + '🩸🩸 Flux moyen', () => set('medium')],
      [(f === 'heavy' ? '✓ ' : '') + '🩸🩸🩸 Flux abondant', () => set('heavy')],
      f && ['Pas de règles ce jour-là', () => set(''), 'danger'],
    ]);
  }
  $('#periodBtn').onclick = openPeriodSheet;

  function renderCycle(info) {
    const box = $('#cycleBox');
    if (!info.periods.length) {
      const p = el('p', 'cycle-empty');
      p.textContent = 'Dans le Journal, touche « 🩸 Règles ? » les jours où tu as tes règles. Ton cycle s’affichera ici.';
      return box.replaceChildren(p);
    }
    const stat = (big, small) => { const d = el('div', 'cycle-stat'); const b = el('b'); b.textContent = big; const sp = el('span'); sp.textContent = small; d.append(b, sp); return d; };
    const stats = el('div', 'cycle-stats');
    if (info.cycleDay) stats.append(stat('Jour ' + info.cycleDay, 'de ton cycle'));
    if (info.avg) stats.append(stat(info.avg + ' jours', 'entre deux règles (moyenne)'));
    if (info.next) {
      const n = dayDiff(todayIso(), info.next);
      stats.append(stat(fmtShort.format(parse(info.next)), n > 1 ? `prochaines règles, dans ${n} jours` : n === 1 ? 'prochaines règles, demain' : n === 0 ? 'prochaines règles, aujourd’hui' : `prochaines règles (retard de ${-n} j)`));
    }
    stats.append(stat(info.avgLen + ' jours', 'durée habituelle des règles'));
    const items = [stats];
    if (info.cycles.length) {
      const ul = el('ul', 'cycle-list');
      info.cycles.slice(-6).reverse().forEach((c) => {
        const li = el('li');
        const a = el('span'); a.textContent = `${fmtShort.format(parse(c.from))} → ${fmtShort.format(parse(c.to))}`;
        const b = el('b'); b.textContent = `${c.days} jours`;
        li.append(a, b); ul.append(li);
      });
      items.push(ul);
    }
    const note = el('p', 'cycle-note');
    note.textContent = info.avg ? 'Les prévisions sont une estimation basée sur tes derniers cycles.' : 'Note au moins deux débuts de règles pour voir l’écart entre elles et une estimation des prochaines.';
    items.push(note);
    box.replaceChildren(...items);
  }

  // ---------- Tarot ----------
  const TAROT = [
    ['0', 'Le Mat', '🎒', 'Chaque grand voyage commence par un pas léger.', 'Ose l’inconnu : ta curiosité est une boussole qui ne se trompe pas.'],
    ['I', 'Le Bateleur', '🪄', 'Tu as déjà en main tout ce qu’il te faut.', 'Ce que tu commences aujourd’hui peut devenir quelque chose de beau.'],
    ['II', 'La Papesse', '📜', 'Le silence a souvent les meilleures réponses.', 'Fais confiance à ton intuition, elle te connaît bien.'],
    ['III', 'L’Impératrice', '🌸', 'Ce que tu nourris avec amour finit toujours par fleurir.', 'Prends soin de toi comme tu prends soin des autres.'],
    ['IV', 'L’Empereur', '🏛️', 'Des bases solides permettent les plus grands rêves.', 'Tu sais poser tes limites, avec douceur et fermeté.'],
    ['V', 'Le Pape', '🕊️', 'Apprendre, c’est aussi oser demander.', 'Les bons conseils arrivent quand tu t’ouvres aux autres.'],
    ['VI', 'L’Amoureux', '💞', 'Choisir avec le cœur, c’est choisir juste.', 'Les liens que tu tisses sont précieux, laisse-les te porter.'],
    ['VII', 'Le Chariot', '🏇', 'La volonté trace la route.', 'Tu avances, même quand ça ne se voit pas encore.'],
    ['VIII', 'La Justice', '⚖️', 'L’équilibre est un cadeau qu’on se fait à soi-même.', 'Tu mérites la même bienveillance que celle que tu offres.'],
    ['IX', 'L’Hermite', '🏮', 'Une petite lumière suffit pour trouver son chemin.', 'Un moment rien qu’à toi te fera un bien fou.'],
    ['X', 'La Roue de Fortune', '🎡', 'Tout tourne, et le meilleur arrive aussi.', 'Une belle surprise peut se cacher dans le changement.'],
    ['XI', 'La Force', '🦁', 'La vraie force est douce.', 'Tu as bien plus de courage que tu ne le crois.'],
    ['XII', 'Le Pendu', '🙃', 'Changer de regard, c’est déjà changer le monde.', 'Faire une pause n’est jamais du temps perdu.'],
    ['XIII', 'L’Arcane sans nom', '🦋', 'Chaque fin ouvre la porte à un renouveau.', 'Laisse partir ce qui te pèse, et fais de la place au neuf.'],
    ['XIV', 'La Tempérance', '🫖', 'Un peu de douceur, un peu de patience, et tout s’apaise.', 'Prends ton temps, tu es exactement là où tu dois être.'],
    ['XV', 'Le Diable', '🔥', 'Reconnaître ce qui nous retient, c’est déjà s’en libérer.', 'Ta passion est une énergie précieuse : mets-la au service de tes envies.'],
    ['XVI', 'La Maison Dieu', '⚡', 'Ce qui s’écroule laisse entrer la lumière.', 'Même les tempêtes apportent de l’air frais.'],
    ['XVII', 'L’Étoile', '⭐', 'L’espoir brille même dans la nuit la plus noire.', 'Tes rêves comptent : continue d’y croire.'],
    ['XVIII', 'La Lune', '🌙', 'Les rêves murmurent ce que le cœur sait déjà.', 'Écoute tes émotions, elles ont de belles choses à te dire.'],
    ['XIX', 'Le Soleil', '☀️', 'La joie se partage et se multiplie.', 'Aujourd’hui est fait pour sourire, tu le mérites.'],
    ['XX', 'Le Jugement', '📯', 'Il n’est jamais trop tard pour renaître.', 'Tu as le droit de te réinventer, autant de fois que tu veux.'],
    ['XXI', 'Le Monde', '🌍', 'Tout ce que tu as traversé t’a conduit ici.', 'Célèbre le chemin parcouru : il est magnifique.'],
  ];

  // Arcanes mineurs : 4 couleurs × 14 cartes
  const RANKS = [['AS', 'As'], ['II', 'Deux'], ['III', 'Trois'], ['IV', 'Quatre'], ['V', 'Cinq'], ['VI', 'Six'], ['VII', 'Sept'],
    ['VIII', 'Huit'], ['IX', 'Neuf'], ['X', 'Dix'], ['VALET', 'Valet'], ['CAVALIER', 'Cavalier'], ['REINE', 'Reine'], ['ROI', 'Roi']];
  const SUITS = [
    ['Bâtons', 'de ', '🪄', 'linear-gradient(160deg, #ffe0c7, #ffd0dc)', [
      ['Une étincelle suffit à allumer un grand feu.', 'Une nouvelle envie naît en toi : suis-la !'],
      ['Le monde est vaste, et il t’attend.', 'Tes projets ont de l’avenir, ose voir grand.'],
      ['Ce que tu as semé commence à voyager.', 'Les efforts d’hier préparent de belles nouvelles.'],
      ['Chaque étape franchie mérite d’être fêtée.', 'Savoure ce que tu as construit, c’est une vraie réussite.'],
      ['Les désaccords font aussi grandir les idées.', 'Ta voix compte, ose la faire entendre avec douceur.'],
      ['La victoire a le goût de la persévérance.', 'Tes efforts sont vus et reconnus.'],
      ['Tenir bon, c’est déjà gagner.', 'Tu as le droit de défendre ce qui compte pour toi.'],
      ['Les choses s’accélèrent dans le bon sens.', 'De bonnes nouvelles sont en route.'],
      ['Ta résilience est ta plus belle force.', 'Tu as déjà tant traversé : tu es plus solide que tu ne le penses.'],
      ['Poser un fardeau, ce n’est pas abandonner.', 'Tu as le droit de demander de l’aide et de te reposer.'],
      ['La curiosité est le début de toutes les aventures.', 'Laisse-toi surprendre par une idée nouvelle.'],
      ['L’élan du cœur va plus vite que la peur.', 'Ton enthousiasme est contagieux, partage-le !'],
      ['Rayonner, c’est simplement être soi.', 'Ta chaleur illumine la journée des autres.'],
      ['Une vision claire guide les grands projets.', 'Tu as tout pour mener tes rêves à bien.'],
    ]],
    ['Coupes', 'de ', '🏆', 'linear-gradient(160deg, #cdeffd, #ddd4ff)', [
      ['Le cœur qui s’ouvre se remplit de joie.', 'Une émotion douce, une amitié ou un amour t’attend.'],
      ['Deux cœurs qui s’accordent valent tous les trésors.', 'Une belle connexion se renforce.'],
      ['La joie partagée est une joie doublée.', 'Entoure-toi de celles et ceux qui te font rire.'],
      ['Parfois, le cadeau est juste sous nos yeux.', 'Prends un moment pour voir tout ce qui va bien.'],
      ['Quand une coupe se renverse, d’autres restent pleines.', 'Ce qui reste est précieux, et le meilleur est à venir.'],
      ['Les souvenirs doux réchauffent le cœur.', 'Retrouve l’enfant en toi, il a tant de joie à t’offrir.'],
      ['Rêver, c’est déjà commencer à créer.', 'Choisis le rêve qui fait le plus vibrer ton cœur.'],
      ['Partir vers ce qui nous nourrit demande du courage.', 'Tu as le droit de chercher encore plus de bonheur.'],
      ['Un vœu sincère trouve toujours son chemin.', 'Fais un vœu : c’est la carte des souhaits !'],
      ['Le bonheur se cultive en famille et entre amis.', 'L’harmonie et l’amour t’entourent.'],
      ['Une émotion nouvelle est un message du cœur.', 'Laisse ta sensibilité s’exprimer, elle est belle.'],
      ['Suivre son cœur mène vers de jolis horizons.', 'Un message tendre ou une invitation peut arriver.'],
      ['La douceur est une force tranquille.', 'Ton empathie fait du bien autour de toi, à commencer par toi.'],
      ['Rester calme dans les vagues, c’est apprivoiser la mer.', 'Tu sais accueillir tes émotions avec sagesse.'],
    ]],
    ['Épées', 'd’', '⚔️', 'linear-gradient(160deg, #e6dcff, #d3e6f7)', [
      ['La vérité éclaire le chemin.', 'Une idée claire va débloquer la situation.'],
      ['Le cœur sait souvent avant la tête.', 'Prends le temps qu’il faut pour choisir, sans pression.'],
      ['Les blessures guérissent et nous rendent plus doux.', 'Sois tendre avec toi : ce qui fait mal finit par passer.'],
      ['Le repos est une arme secrète.', 'Accorde-toi une vraie pause, tu l’as méritée.'],
      ['Savoir choisir ses batailles est une sagesse.', 'Ta paix vaut plus que d’avoir raison.'],
      ['Des eaux plus calmes t’attendent.', 'Tu avances vers des jours plus légers.'],
      ['Une bonne stratégie vaut mieux que la force.', 'Fais confiance à ton ingéniosité.'],
      ['Les liens qui nous retiennent sont plus fragiles qu’on ne le croit.', 'Tu es plus libre que tu ne le penses.'],
      ['La nuit rend les peurs plus grandes qu’elles ne sont.', 'Respire : demain, tout paraîtra plus doux.'],
      ['Après la fin, l’aube se lève toujours.', 'Le plus dur est derrière toi.'],
      ['Une question bien posée ouvre mille portes.', 'Ta curiosité t’aidera à y voir clair.'],
      ['Les idées vives font bouger le monde.', 'Fonce : ton esprit est affûté aujourd’hui.'],
      ['Dire vrai avec bienveillance est un don.', 'Ta lucidité est précieuse, pour toi comme pour les autres.'],
      ['Un esprit clair apaise toutes les tempêtes.', 'Tes décisions sont justes et réfléchies.'],
    ]],
    ['Pentacles', 'de ', '🪙', 'linear-gradient(160deg, #dff5d8, #fff0c4)', [
      ['Une graine plantée aujourd’hui sera un arbre demain.', 'Une belle opportunité concrète se présente.'],
      ['La vie est une danse, l’équilibre vient en bougeant.', 'Tu jongles très bien avec tout ce que tu as à faire.'],
      ['Ensemble, on construit des merveilles.', 'Ton travail et ton talent sont reconnus.'],
      ['Protéger ce qu’on aime est une forme de sagesse.', 'Tu as tout ce qu’il faut pour te sentir en sécurité.'],
      ['Même dans le froid, une fenêtre éclairée nous attend.', 'L’aide est plus proche que tu ne crois, ose la demander.'],
      ['Donner et recevoir font tourner le monde.', 'La générosité que tu offres te reviendra.'],
      ['La patience fait mûrir les plus beaux fruits.', 'Tes efforts paient, doucement mais sûrement.'],
      ['Chaque geste répété rend la main plus sûre.', 'Tu progresses chaque jour, même un tout petit peu.'],
      ['Savourer ce qu’on a construit est un luxe mérité.', 'Offre-toi un moment de plaisir, tu le vaux bien.'],
      ['La vraie richesse se transmet avec amour.', 'Tu construis quelque chose de solide et de durable.'],
      ['Chaque apprentissage est un trésor.', 'Un nouveau savoir va t’ouvrir des portes.'],
      ['Pas à pas, on va loin.', 'Ta constance est ta superpuissance.'],
      ['Prendre soin de son corps, c’est honorer sa vie.', 'Chouchoute-toi : tu mérites douceur et confort.'],
      ['L’abondance naît de la confiance.', 'Tu as les ressources pour réussir ce que tu entreprends.'],
    ]],
  ];
  SUITS.forEach(([suit, de, sym, bg, texts]) => texts.forEach(([quote, msg], r) =>
    TAROT.push([RANKS[r][0] + ' · ' + suit.toUpperCase(), `${RANKS[r][1]} ${de}${suit}`, sym, quote, msg, bg, 'Arcane mineur'])));
  const CARD_BG = [
    'linear-gradient(160deg, #fff1c9, #ffd6e6)', 'linear-gradient(160deg, #e3d7ff, #c9ecff)',
    'linear-gradient(160deg, #d4f3e3, #fff1c9)', 'linear-gradient(160deg, #ffd9cc, #e3d7ff)',
    'linear-gradient(160deg, #cdeffd, #e2f7d6)', 'linear-gradient(160deg, #ffd6e6, #ffe8c2)',
  ];
  let lastCard = -1;
  function drawTarot() {
    let i; do { i = Math.floor(Math.random() * TAROT.length); } while (i === lastCard);
    lastCard = i;
    const [num, name, sym, quote, msg, bg, kind] = TAROT[i];
    const wrap = el('div', 'tarot-wrap');
    const card = el('div', 'tarot-card'); card.style.background = bg || CARD_BG[i % CARD_BG.length];
    const n = el('span', 'num'); n.textContent = num;
    const sy = el('span', 'sym'); sy.textContent = sym;
    const nm = el('span', 'name'); nm.textContent = name;
    card.append(n, sy, nm);
    const k = el('p', 'tarot-kind'); k.textContent = kind || 'Arcane majeur';
    const q = el('p', 'tarot-quote'); q.textContent = '« ' + quote + ' »';
    const m = el('p', 'tarot-msg'); m.textContent = msg;
    wrap.append(card, k, q, m);
    const again = el('button', 'primary'); again.textContent = '✦ Tirer une autre carte'; again.onclick = drawTarot;
    $('#sheet').replaceChildren(wrap, again, Object.assign(el('button', 'cancel'), { textContent: 'Fermer', onclick: closeSheet }));
    $('#sheetBg').hidden = false;
  }
  $('#tarotBtn').onclick = drawTarot;


  // ---------- Habitudes ----------
  const HCOLORS = ['#c9eed6', '#ffd5b8', '#bfe2f6', '#ffc9de', '#ddd0f6', '#ffe8a3', '#d3f1f0', '#f7c9b9'];
  const HEMOJI = ['💧', '🧘', '📖', '🚶', '😴', '🥗', '📵', '✍️', '🏃', '💊', '🎨', '🎵', '🧴', '🌿', '🙏', '☀️'];
  const HSUGG = [['💧', 'Boire de l’eau'], ['🧘', 'Méditer'], ['📖', 'Lire'], ['🚶', 'Marcher'], ['😴', 'Dormir 8 h'],
    ['🥗', 'Manger des légumes'], ['📵', 'Pas d’écran le soir'], ['✍️', 'Écrire mon journal'], ['🏃', 'Sport'], ['🧴', 'Skincare']];
  const hDone = (d, id) => (db.hlog[d] || []).includes(id);
  function toggleHabit(d, id) {
    const l = new Set(db.hlog[d] || []);
    l.has(id) ? l.delete(id) : l.add(id);
    if (l.size) db.hlog[d] = [...l]; else delete db.hlog[d];
    save([d]);
  }
  function streak(id, from) {
    let d = from, n = 0;
    if (!hDone(d, id)) d = addDays(d, -1);
    while (hDone(d, id)) { n++; d = addDays(d, -1); }
    return n;
  }
  function renderHabitsDay() {
    const chips = db.habits.map((h) => {
      const on = hDone(day, h.id);
      const b = el('button', 'habit-chip' + (on ? ' on' : ''));
      if (on) b.style.background = h.color;
      const tk = el('span', 'tick'); tk.textContent = on ? '✓' : '';
      const nm = el('span'); nm.textContent = `${h.emoji} ${h.name}`;
      b.append(tk, nm);
      const st = streak(h.id, day);
      if (st >= 2) { const s2 = el('span', 'streak'); s2.textContent = `🔥 ${st}`; b.append(s2); }
      b.setAttribute('aria-pressed', on);
      b.onclick = () => { toggleHabit(day, h.id); renderHabitsDay(); };
      return b;
    });
    $('#habitChips').replaceChildren(...chips);
    $('#habitChips').hidden = !db.habits.length;
    $('#habitEmpty').hidden = $('#habitAdd').hidden = db.habits.length > 0;
    $('#habitManage').hidden = !db.habits.length;
  }
  function renderHabitGrid() {
    const box = $('#habitGrid');
    if (!db.habits.length) {
      const p = el('p', 'habit-empty'); p.textContent = 'Ajoute tes habitudes dans le Journal (espace « Mes habitudes ») pour voir ton tableau du mois ici.';
      return box.replaceChildren(p);
    }
    const [y, m] = month.split('-').map(Number);
    const nDays = new Date(y, m, 0).getDate();
    const t = todayIso();
    const table = el('table', 'hgrid');
    const hr = el('tr'); hr.append(el('th', 'hname'));
    for (let d = 1; d <= nDays; d++) { const th = el('th', `${month}-${pad(d)}` === t ? 'today' : ''); th.textContent = d; hr.append(th); }
    table.append(hr);
    db.habits.forEach((h) => {
      const tr = el('tr');
      const nameCell = el('td', 'hname');
      let count = 0;
      for (let d = 1; d <= nDays; d++) if (hDone(`${month}-${pad(d)}`, h.id)) count++;
      nameCell.textContent = `${h.emoji} ${h.name}`;
      const sm = el('small'); sm.textContent = `${count} / ${nDays} jours`; nameCell.append(sm);
      tr.append(nameCell);
      for (let d = 1; d <= nDays; d++) {
        const key = `${month}-${pad(d)}`;
        const td = el('td', 'c');
        const b = el('button', (hDone(key, h.id) ? 'on' : '') + (key === t ? ' today' : ''));
        if (hDone(key, h.id)) b.style.background = h.color;
        b.setAttribute('aria-label', `${h.name}, ${d}`);
        b.onclick = () => { toggleHabit(key, h.id); renderHabitGrid(); };
        td.append(b); tr.append(td);
      }
      table.append(tr);
    });
    const wrap = el('div', 'hgrid-wrap'); wrap.append(table);
    box.replaceChildren(wrap);
    // fait défiler jusqu'à aujourd'hui
    const ti = t.startsWith(month) ? Number(t.slice(8)) : 0;
    if (ti > 8) requestAnimationFrame(() => { wrap.scrollLeft = (ti - 6) * 24; });
  }
  function addHabit(emoji, name) {
    name = name.trim(); if (!name) return;
    db.habits.push({ id: uid(), emoji: emoji || '🌱', name, color: HCOLORS[db.habits.length % HCOLORS.length] });
    save([]);
  }
  function openHabitSheet() {
    let emoji = '🌱';
    const draw = () => {
      const s = $('#sheet');
      const items = [];
      const h = el('h3'); h.textContent = 'Mes habitudes'; items.push(h);
      db.habits.forEach((hb, i) => {
        const row = el('div', 'hrow');
        const dot = el('span', 'dot'); dot.style.background = hb.color; dot.textContent = hb.emoji;
        const n = el('span', 'n'); n.textContent = hb.name;
        const del = el('button'); del.textContent = 'Retirer';
        del.onclick = () => {
          db.habits.splice(i, 1); save([]); draw(); render();
          toast('Habitude retirée', 'Annuler', () => { db.habits.splice(i, 0, hb); save([]); render(); });
        };
        row.append(dot, n, del); items.push(row);
      });
      const sug = HSUGG.filter(([, n]) => !db.habits.some((x) => x.name === n));
      if (sug.length) {
        const h4 = el('h4'); h4.textContent = 'Idées (touche pour ajouter)'; items.push(h4);
        const box = el('div', 'sugg');
        sug.forEach(([e, n]) => { const b = el('button'); b.textContent = `${e} ${n}`; b.onclick = () => { addHabit(e, n); draw(); render(); }; box.append(b); });
        items.push(box);
      }
      const h5 = el('h4'); h5.textContent = 'Ou crée la tienne'; items.push(h5);
      const emo = el('div', 'emo');
      HEMOJI.forEach((e) => { const b = el('button', e === emoji ? 'on' : ''); b.textContent = e; b.onclick = () => { emoji = e; emo.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }; emo.append(b); });
      items.push(emo);
      const form = el('div', 'hnew');
      const inp = el('input'); inp.id = 'habitName'; inp.placeholder = 'Ex. : Appeler un·e ami·e'; inp.maxLength = 40;
      const add = el('button', 'primary'); add.textContent = 'Ajouter';
      const go = () => { if (!inp.value.trim()) return inp.focus(); addHabit(emoji, inp.value); draw(); render(); };
      add.onclick = go; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
      form.append(inp, add); items.push(form);
      items.push(Object.assign(el('button', 'cancel'), { textContent: 'Terminé', onclick: closeSheet }));
      s.replaceChildren(...items);
    };
    draw();
    $('#sheetBg').hidden = false;
  }
  $('#habitManage').onclick = openHabitSheet;
  $('#habitAdd').onclick = openHabitSheet;

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
    save([key]); render();
    toast('Supprimé', 'Annuler', () => { (db.entries[key] = db.entries[key] || []).splice(i, 0, e); save([key]); render(); });
  }
  function removeTodo(t) {
    const i = db.todos.indexOf(t); if (i < 0) return;
    db.todos.splice(i, 1); save(); render();
    toast('Supprimé', 'Annuler', () => { db.todos.splice(i, 0, t); save(); render(); });
  }
  function migrate(e, target) {
    e.status = 'migrated';
    (db.entries[target] = db.entries[target] || []).push({ id: uid(), type: 'task', text: e.text, status: 'open', important: e.important });
    save([day, target]); render();
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
    markAll(); save(); day = t; view = 'day'; render();
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
    if (e.type === 'joy') return sheet(e.text, [
      ['✏️ Modifier', () => { const li = document.querySelector(`#view-day li[data-id="${e.id}"]`); if (li) li.querySelector('.txt').click(); }],
      [e.important ? '☆ Retirer le cœur' : '★ Coup de cœur', () => { e.important = !e.important; done(); }],
      ['– Déplacer dans « Mes tâches » (note)', () => { e.type = 'note'; done(); }],
      ['🗑 Supprimer', () => removeEntry(e), 'danger'],
    ]);
    sheet(e.text, [
      ['✏️ Modifier', () => {
        const li = document.querySelector(`#view-day li[data-id="${e.id}"]`);
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
      ['✿ Déplacer dans « Instants joyeux »', () => { e.type = 'joy'; e.status = 'open'; done(); }],
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
        save([k]); toast('Ajoutée au journal du jour');
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
    const s = $('#sheet');
    const h = el('h3'); h.textContent = 'Choisir une date';
    const inp = el('input'); inp.type = 'date'; inp.id = 'sheetDate'; inp.value = initial;
    const ok = el('button', 'primary'); ok.textContent = 'Valider';
    ok.onclick = () => { if (/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) { closeSheet(); cb(inp.value); } };
    s.replaceChildren(h, inp, ok, Object.assign(el('button', 'cancel'), { textContent: 'Fermer', onclick: closeSheet }));
    $('#sheetBg').hidden = false;
  }

  // ---------- Sauvegarde ----------
  async function exportData() {
    const filename = `bujo-${todayIso()}.json`;
    const text = JSON.stringify(db, null, 2);
    const dl = window.claude && claude.use ? await claude.use('downloads') : null;
    if (dl) {
      try { await dl.save({ filename, data: text }); toast('Sauvegarde exportée'); }
      catch (e) { if (e && e.code !== 'declined') toast('Export impossible'); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Sauvegarde exportée');
  }
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data && !data.moods) data.moods = {};
      if (data && !data.period) data.period = {};
      if (data && !data.habits) data.habits = [];
      if (data && !data.hlog) data.hlog = {};
      if (!data || typeof data.entries !== 'object' || !Array.isArray(data.todos)) throw new Error();
      sheet('Remplacer toutes les données actuelles par cette sauvegarde ?', [
        ['Oui, tout remplacer', () => { db = Object.assign(empty(), data); markAll(); save(); render(); toast('Sauvegarde importée'); }, 'danger'],
      ]);
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
    $('#goalsState').textContent = 'Enregistrement…';
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
  connect();
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.claude) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
