(() => {
  'use strict';

  const KEY = 'finanzappox.v1';
  const EMOJIS = ['🎁', '💝', '🍫', '☕', '🍕', '🎬', '💆', '🧹', '🚗', '🌹', '🍦', '🎮', '📚', '🍳', '⭐', '🎟️'];
  const EURO_SVG = '<svg viewBox="0 0 24 24"><path d="M17.5 6.2A6.6 6.6 0 0 0 7.2 9.5M17.5 17.8A6.6 6.6 0 0 1 7.2 14.5M4.5 10h8.5M4.5 14h7"/></svg>';
  const X_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const defaults = () => ({
    me: 'Matti',
    partner: 'Juna',
    items: [{ id: uid(), name: 'Geschenk', price: 15, emoji: '🎁' }],
    notes: [],
    payer: 'me', // wer gerade zahlt: 'me' oder 'partner'
    tx: [] // { id, itemId, from (wer handelt), type: 'buy' | 'eat' | 'pay', qty, price, ts }
  });

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { state = defaults(); }
  state.tx = (state.tx || []).filter((t) => t.type); // alte Buchungen ohne Art verwerfen
  if (!Array.isArray(state.notes)) state.notes = []; // { id, text, ts }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* privat/voll */ } };

  // UI-Zustand (nicht gespeichert)
  const qty = {};          // Menge je Spalte
  const GROUPS = (window.EMOJI_GROUPS || [['🎁', 'Auswahl', EMOJIS.join(' ')]]).map(([icon, label, list]) => ({ icon, label, list: list.split(' ') }));
  let pickerGroup = 0;     // gewählte Emoji-Gruppe
  let pickerFor = null;    // offene Emoji-Auswahl
  let confirmDel = null;   // Spalte, deren Löschen bestätigt werden muss
  let confirmReset = false;
  let editing = null;      // offene Notiz
  let confirmNoteDel = false;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const money = (n) => eur.format(n).replace('-', '−');
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  const initial = (s) => (s.trim()[0] || '?').toUpperCase();
  const name = (s, fallback) => s.trim() || fallback;

  const other = (who) => (who === 'me' ? 'partner' : 'me');
  const who = (key) => name(state[key], key === 'me' ? 'Matti' : 'Juna');
  const payer = () => (state.payer === 'partner' ? 'partner' : 'me');
  const sumTx = (itemId, key, type) => state.tx.reduce((sum, t) => sum + (t.itemId === itemId && t.from === key && t.type === type ? t.qty : 0), 0);
  // Stücke, die eine Person gekauft und noch nicht aufgegessen hat
  const held = (itemId, key) => sumTx(itemId, key, 'buy') - sumTx(itemId, key, 'eat');
  // Stücke, die eine Person gekauft, aber noch nicht bezahlt hat (negativ = zu viel bezahlt)
  const unpaid = (itemId, key) => sumTx(itemId, key, 'buy') - sumTx(itemId, key, 'pay');
  // Kontostand einer Person: was die andere Person bei ihr gekauft und noch nicht zurückgezahlt hat
  const balance = (key) => Math.round(state.items.reduce((sum, it) => sum + unpaid(it.id, other(key)) * it.price, 0) * 100) / 100;
  const amount = (b) => (b > 0 ? '+' : '') + money(b);
  const tone = (b) => (b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero');

  /* ---------- Rendern ---------- */
  const heldChips = (key) => state.items.map((it) => {
    const c = held(it.id, key);
    return c > 0 ? `<span class="chip">${esc(it.emoji)}${c > 1 ? ' ×' + c : ''}</span>` : '';
  }).join('');
  // Geld, das eine Person der anderen schuldet
  const debt = (key) => Math.round((Math.max(0, balance(other(key))) + Math.max(0, -balance(key))) * 100) / 100;

  function renderHome() {
    $('widget').innerHTML = `
      <div class="w-top"><span class="mini">${EURO_SVG}</span>Finanzen</div>
      <div class="w-rows">${['me', 'partner'].map((k) => {
        const d = debt(k), chips = heldChips(k);
        return `
        <div class="w-person">
          <div class="w-row">
            <span><b>${esc(who(k))}</b> ${d ? 'schuldet' : 'schuldet nichts'}</span>
            ${d ? `<div class="chips"><span class="chip neg">${money(d)}</span></div>` : ''}
          </div>
          ${chips ? `<div class="w-row sub"><span>hat noch</span><div class="chips">${chips}</div></div>` : ''}
        </div>`;
      }).join('')}
      </div>`;
  }

  function renderAccounts() {
    const p = payer();
    $('hero').innerHTML = `
      <div class="accts">${['partner', 'me'].map((k) => {
        const b = balance(k);
        const chips = heldChips(k);
        return `
        <article class="acct glass ${tone(b)}">
          <div class="pair"><div class="avatar ${k === 'partner' ? 'a' : 'b'}">${esc(initial(who(k)))}</div><span>${esc(who(k))}</span></div>
          <div class="label">Kontostand</div>
          <div class="amount">${amount(b)}</div>
          <div class="chips">${chips || '<span class="chip none">Nichts übrig</span>'}</div>
        </article>`;
      }).join('')}
      </div>
      <div class="seg-label">Wer kauft bei wem?</div>
      <div class="seg glass" data-on="${p}">
        <button data-action="payer" data-k="me" class="${p === 'me' ? 'on' : ''}">${esc(who('me'))} → ${esc(who('partner'))}</button>
        <button data-action="payer" data-k="partner" class="${p === 'partner' ? 'on' : ''}">${esc(who('partner'))} → ${esc(who('me'))}</button>
      </div>`;
  }

  function renderItems() {
    const p = payer(), receiver = esc(who(other(p)));
    $('items').innerHTML = state.items.map((it) => {
      const c = held(it.id, p), q = qty[it.id] || 1, open = Math.round(unpaid(it.id, p) * it.price * 100) / 100;
      return `
      <article class="card glass" data-id="${it.id}">
        <div class="card-top">
          <div class="emoji">${esc(it.emoji)}</div>
          <div class="count ${c > 0 ? 'pos' : ''}"><b>${c}</b><small>${esc(who(p))} hat</small></div>
        </div>
        <h3>${esc(it.name || 'Ohne Namen')}</h3>
        <div class="price">${money(it.price)} pro Stück</div>
        <div class="open ${open > 0 ? 'neg' : open < 0 ? 'pos' : ''}">${open > 0 ? `${money(open)} offen` : open < 0 ? `${money(-open)} zu viel bezahlt` : 'Nichts offen'}</div>
        <div class="stepper">
          <button data-action="qty" data-d="-1" aria-label="Weniger">−</button>
          <span>${q}×</span>
          <button data-action="qty" data-d="1" aria-label="Mehr">+</button>
        </div>
        <button class="btn pay" data-action="buy">Kaufen<small>+${money(it.price * q)} für ${receiver}</small></button>
        <button class="btn use" data-action="eat" ${c < q ? 'disabled' : ''}>Aufessen<small>${c < q ? (c ? `nur ${c} vorhanden` : 'nichts vorhanden') : `${q}× ${esc(it.name)}`}</small></button>
        <button class="btn use" data-action="pay">Zurückzahlen<small>${money(it.price * q)} an ${receiver}</small></button>
      </article>`;
    }).join('') + `
      <button class="card glass add" data-action="add-item"><span class="plus">+</span>Neue Spalte</button>`;
  }

  function renderHistory() {
    const byId = Object.fromEntries(state.items.map((it) => [it.id, it]));
    const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const rows = state.tx.slice().reverse().filter((t) => byId[t.itemId]).slice(0, 60).map((t) => {
      const it = byId[t.itemId], P = esc(who(t.from)), R = esc(who(other(t.from))), sum = money(t.qty * t.price);
      const text = t.type === 'buy' ? `${P} kauft ${t.qty}× ${esc(it.name)}`
        : t.type === 'eat' ? `${P} isst ${t.qty}× ${esc(it.name)} auf`
        : `${P} zahlt ${sum} zurück`;
      const val = t.type === 'buy' ? `<div class="val pos">+${sum}</div>` : t.type === 'pay' ? `<div class="val neg">−${sum}</div>` : '';
      return `
      <div class="row" data-tx="${t.id}">
        <div class="emoji">${esc(it.emoji)}</div>
        <div class="txt">
          <b>${text}</b>
          <small>${fmt.format(new Date(t.ts))}${t.type === 'eat' ? '' : ` · Konto ${R}`}</small>
        </div>
        ${val}
        <button class="x" data-action="undo" aria-label="Eintrag löschen">${X_SVG}</button>
      </div>`;
    }).join('');
    $('history').innerHTML = rows || `<div class="empty">Noch keine Einträge.<br>Wähle oben, wer kauft, und tippe auf „Kaufen“.</div>`;
  }

  function renderSettings() {
    $('settings').innerHTML = `
      <div class="group-title">Personen</div>
      <div class="group">
        <div class="field"><label>Person 1</label><input data-person="me" value="${esc(state.me)}" placeholder="Matti" maxlength="20"></div>
        <div class="field"><label>Person 2</label><input data-person="partner" value="${esc(state.partner)}" placeholder="Juna" maxlength="20"></div>
      </div>
      <div class="group-title">Spalten</div>
      ${state.items.map((it) => `
      <div class="group" data-id="${it.id}" style="margin-bottom:10px">
        <div class="field">
          <button class="emoji" data-action="picker" aria-label="Symbol ändern">${esc(it.emoji)}</button>
          <input data-field="name" value="${esc(it.name)}" placeholder="Name" maxlength="24">
          <button class="del ${confirmDel === it.id ? 'sure' : ''}" data-action="del-item" aria-label="Löschen">${confirmDel === it.id ? 'Löschen?' : TRASH_SVG}</button>
        </div>
        ${pickerFor === it.id ? `
        <div class="picker">
          <div class="picker-tabs">${GROUPS.map((g, i) => `<button data-action="emoji-group" data-i="${i}" class="${i === pickerGroup ? 'on' : ''}" aria-label="${g.label}">${g.icon}</button>`).join('')}</div>
          <div class="picker-name">${GROUPS[pickerGroup].label} · ${GROUPS[pickerGroup].list.length}</div>
          <div class="picker-grid">${GROUPS[pickerGroup].list.map((e) => `<button data-action="emoji" data-e="${e}" class="${e === it.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
        </div>` : ''}
        <div class="field"><label>Preis</label><input class="num" data-field="price" inputmode="decimal" value="${String(it.price).replace('.', ',')}"><span class="unit">€</span></div>
      </div>`).join('')}
      <div class="group"><button class="linkbtn" data-action="add-item">+ Neue Spalte hinzufügen</button></div>
      <p class="hint">Jede Spalte hat einen eigenen Namen und Preis. Beim Löschen einer Spalte werden auch ihre Einträge entfernt.</p>
      <div class="group-title">Daten</div>
      <div class="group"><button class="linkbtn danger" data-action="reset">${confirmReset ? 'Wirklich alles löschen? Nochmal tippen' : 'Alles zurücksetzen'}</button></div>`;
  }

  /* ---------- Notes ---------- */
  const NOTE_SVG = '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
  function noteDate(ts, long) {
    const d = new Date(ts), today = new Date().toDateString() === d.toDateString();
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (long) return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) + ', ' + time;
    return today ? time : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function renderNotes() {
    const notes = state.notes.slice().sort((a, b) => b.ts - a.ts);
    $('note-list').innerHTML = notes.length ? `<div class="note-list">${notes.map((n) => {
      const lines = n.text.split('\n').map((l) => l.trim()).filter(Boolean);
      return `
      <button class="note glass" data-action="note-open" data-note="${n.id}">
        <b>${esc(lines[0] || 'Neue Notiz')}</b>
        <span><time>${noteDate(n.ts)}</time>${esc(lines.slice(1).join(' ') || 'Kein weiterer Text')}</span>
      </button>`;
    }).join('')}</div>` : `
      <div class="soon">
        <span class="app-icon notes big">${NOTE_SVG}</span>
        <h2>Noch keine Notizen</h2>
        <p>Tippe auf das Plus, um die erste zu schreiben.</p>
        <button class="btn pay first-note" data-action="note-new">Neue Notiz</button>
      </div>`;
  }
  function renderNoteBar() {
    const n = state.notes.find((x) => x.id === editing);
    if (!n) return;
    $('note-date').textContent = noteDate(n.ts, true);
    $('note-del').innerHTML = confirmNoteDel ? 'Löschen?' : TRASH_SVG;
    $('note-del').classList.toggle('sure', confirmNoteDel);
  }
  function openNote(id, focus) {
    const n = state.notes.find((x) => x.id === id);
    if (!n) return;
    editing = id; confirmNoteDel = false;
    $('note-text').value = n.text;
    renderNoteBar();
    $('notes').classList.add('editing');
    if (focus) $('note-text').focus();
  }
  function closeNote() {
    $('note-text').blur();
    state.notes = state.notes.filter((n) => n.id !== editing || n.text.trim()); // leere Notiz verwerfen
    editing = null;
    $('notes').classList.remove('editing');
    save(); renderNotes();
  }
  $('note-text').addEventListener('input', (e) => {
    const n = state.notes.find((x) => x.id === editing);
    if (!n) return;
    n.text = e.target.value; n.ts = Date.now();
    if (confirmNoteDel) confirmNoteDel = false;
    save(); renderNoteBar();
  });

  function renderMain() { renderHome(); renderAccounts(); renderItems(); renderHistory(); }
  function commit() { save(); renderMain(); }

  /* ---------- Aktionen ---------- */
  function setView(v) {
    document.body.dataset.view = v;
    ['home', 'manager', 'mac', 'notes'].forEach((id) => $(id).setAttribute('aria-hidden', v !== id));
    if (v !== 'manager') closeSheet();
    if (v !== 'notes' && editing) closeNote();
  }
  function openSheet() { pickerFor = confirmDel = null; confirmReset = false; renderSettings(); document.body.classList.add('sheet-open'); $('sheet').setAttribute('aria-hidden', 'false'); }
  function closeSheet() { document.activeElement && document.activeElement.blur(); document.body.classList.remove('sheet-open'); $('sheet').setAttribute('aria-hidden', 'true'); }

  function book(itemId, type) {
    const it = state.items.find((i) => i.id === itemId);
    if (!it) return;
    const q = qty[itemId] || 1;
    if (type === 'eat' && held(itemId, payer()) < q) return;
    state.tx.push({ id: uid(), itemId, from: payer(), type, qty: q, price: it.price, ts: Date.now() });
    qty[itemId] = 1;
    commit();
    const card = document.querySelector(`.card[data-id="${itemId}"]`);
    if (card) card.classList.add('bump');
    if (navigator.vibrate) navigator.vibrate(10);
  }

  const actions = {
    open: () => setView('manager'),
    close: () => setView('home'),
    toggle: (el) => setView(document.body.dataset.view === el.dataset.app ? 'home' : el.dataset.app),
    payer: (el) => { state.payer = el.dataset.k; commit(); },
    settings: openSheet,
    'settings-close': closeSheet,
    qty: (el, id) => { qty[id] = Math.min(99, Math.max(1, (qty[id] || 1) + Number(el.dataset.d))); renderItems(); },
    buy: (el, id) => book(id, 'buy'),
    eat: (el, id) => book(id, 'eat'),
    pay: (el, id) => book(id, 'pay'),
    undo: (el) => { const id = el.closest('[data-tx]').dataset.tx; state.tx = state.tx.filter((t) => t.id !== id); commit(); },
    'note-new': () => { const n = { id: uid(), text: '', ts: Date.now() }; state.notes.push(n); openNote(n.id, true); },
    'note-open': (el) => openNote(el.dataset.note),
    'note-back': closeNote,
    'note-del': () => {
      if (!confirmNoteDel) { confirmNoteDel = true; renderNoteBar(); return; }
      state.notes = state.notes.filter((n) => n.id !== editing);
      closeNote();
    },
    'add-item': () => {
      const it = { id: uid(), name: 'Geschenk ' + (state.items.length + 1), price: 3, emoji: EMOJIS[state.items.length % EMOJIS.length] };
      state.items.push(it);
      commit();
      openSheet();
      const input = document.querySelector(`#settings [data-id="${it.id}"] [data-field="name"]`);
      if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); input.select(); }
    },
    picker: (el, id) => { pickerFor = pickerFor === id ? null : id; renderSettings(); },
    'emoji-group': (el) => { pickerGroup = Number(el.dataset.i); renderSettings(); },
    emoji: (el, id) => { state.items.find((i) => i.id === id).emoji = el.dataset.e; pickerFor = null; commit(); renderSettings(); },
    'del-item': (el, id) => {
      if (confirmDel !== id) { confirmDel = id; renderSettings(); return; }
      state.items = state.items.filter((i) => i.id !== id);
      state.tx = state.tx.filter((t) => t.itemId !== id);
      confirmDel = null; commit(); renderSettings();
    },
    reset: () => {
      if (!confirmReset) { confirmReset = true; renderSettings(); return; }
      state = { ...defaults(), notes: state.notes }; confirmReset = false; commit(); renderSettings();
    }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const holder = el.closest('[data-id]');
    actions[el.dataset.action](el, holder && holder.dataset.id);
  });

  // Einstellungen: live übernehmen, ohne das Eingabefeld neu zu zeichnen
  $('settings').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.person) state[el.dataset.person] = el.value;
    else if (el.dataset.field) {
      const it = state.items.find((i) => i.id === el.closest('[data-id]').dataset.id);
      if (el.dataset.field === 'name') it.name = el.value;
      else {
        const p = parseFloat(el.value.replace(',', '.'));
        if (!(p >= 0)) return;
        it.price = Math.round(p * 100) / 100;
      }
    } else return;
    commit();
  });
  $('settings').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('settings').addEventListener('focusout', (e) => {
    if (e.target.dataset.field !== 'price') return;
    const it = state.items.find((i) => i.id === e.target.closest('[data-id]').dataset.id);
    if (it) e.target.value = String(it.price).replace('.', ',');
  });
  $('items').addEventListener('animationend', (e) => e.target.classList.remove('bump'));

  /* ---------- Uhr ---------- */
  function tick() {
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    $('date').textContent = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tick();
  setInterval(tick, 15000);

  setView('home');
  renderMain();
  renderNotes();
})();
