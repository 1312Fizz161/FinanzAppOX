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
    payer: 'me', // wer gerade zahlt: 'me' oder 'partner'
    tx: [] // { id, itemId, from (Zahler), qty (+ bezahlt / − eingelöst), price, ts }
  });

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { state = defaults(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* privat/voll */ } };

  // UI-Zustand (nicht gespeichert)
  const qty = {};          // Menge je Spalte
  let pickerFor = null;    // offene Emoji-Auswahl
  let confirmDel = null;   // Spalte, deren Löschen bestätigt werden muss
  let confirmReset = false;

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
  // Guthaben (Stückzahl) einer Person in einer Spalte
  const countOf = (itemId, key) => state.tx.reduce((sum, t) => sum + (t.itemId === itemId && (t.from || 'me') === key ? t.qty : 0), 0);
  // Kontostand einer Person: was die andere Person bei ihr bezahlt (und noch nicht eingelöst) hat
  const balance = (key) => Math.round(state.items.reduce((sum, it) => sum + countOf(it.id, other(key)) * it.price, 0) * 100) / 100;
  const amount = (b) => (b > 0 ? '+' : '') + money(b);
  const tone = (b) => (b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero');

  /* ---------- Rendern ---------- */
  function renderHome() {
    $('widget').innerHTML = `
      <div class="w-top"><span class="mini">${EURO_SVG}</span>Finanzen</div>
      <div class="w-rows">${['partner', 'me'].map((k) => `
        <div class="w-row"><span>${esc(who(k))}</span><b class="${tone(balance(k))}">${amount(balance(k))}</b></div>`).join('')}
      </div>`;
  }

  function renderAccounts() {
    const p = payer();
    $('hero').innerHTML = `
      <div class="accts">${['partner', 'me'].map((k) => {
        const b = balance(k);
        const chips = state.items.map((it) => {
          const c = countOf(it.id, k);
          return c ? `<span class="chip ${c < 0 ? 'neg' : ''}">${esc(it.emoji)} ${signed(c)}</span>` : '';
        }).join('');
        return `
        <article class="acct glass ${tone(b)}">
          <div class="pair"><div class="avatar ${k === 'partner' ? 'a' : 'b'}">${esc(initial(who(k)))}</div><span>${esc(who(k))}</span></div>
          <div class="label">Kontostand</div>
          <div class="amount">${amount(b)}</div>
          <div class="chips">${chips || '<span class="chip none">Kein Guthaben</span>'}</div>
        </article>`;
      }).join('')}
      </div>
      <div class="seg-label">Wer zahlt?</div>
      <div class="seg glass" data-on="${p}">
        <button data-action="payer" data-k="me" class="${p === 'me' ? 'on' : ''}">${esc(who('me'))} → ${esc(who('partner'))}</button>
        <button data-action="payer" data-k="partner" class="${p === 'partner' ? 'on' : ''}">${esc(who('partner'))} → ${esc(who('me'))}</button>
      </div>`;
  }

  function renderItems() {
    const p = payer(), receiver = who(other(p));
    $('items').innerHTML = state.items.map((it) => {
      const c = countOf(it.id, p), q = qty[it.id] || 1;
      return `
      <article class="card glass" data-id="${it.id}">
        <div class="card-top">
          <div class="emoji">${esc(it.emoji)}</div>
          <div class="count ${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}"><b>${c < 0 ? '−' + -c : c}</b><small>${esc(who(p))} hat</small></div>
        </div>
        <h3>${esc(it.name || 'Ohne Namen')}</h3>
        <div class="price">${money(it.price)} pro Stück</div>
        <div class="stepper">
          <button data-action="qty" data-d="-1" aria-label="Weniger">−</button>
          <span>${q}×</span>
          <button data-action="qty" data-d="1" aria-label="Mehr">+</button>
        </div>
        <button class="btn pay" data-action="pay">Bezahlen<small>${money(it.price * q)} an ${esc(receiver)}</small></button>
        <button class="btn use" data-action="use">Einlösen<small>${q}× an ${esc(receiver)}</small></button>
      </article>`;
    }).join('') + `
      <button class="card glass add" data-action="add-item"><span class="plus">+</span>Neue Spalte</button>`;
  }

  function renderHistory() {
    const byId = Object.fromEntries(state.items.map((it) => [it.id, it]));
    const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const rows = state.tx.slice().reverse().filter((t) => byId[t.itemId]).slice(0, 60).map((t) => {
      const it = byId[t.itemId], n = Math.abs(t.qty), paid = t.qty > 0;
      const from = t.from || 'me', P = esc(who(from)), R = esc(who(other(from)));
      return `
      <div class="row" data-tx="${t.id}">
        <div class="emoji">${esc(it.emoji)}</div>
        <div class="txt">
          <b>${paid ? `${P} bezahlt ${n}× ${esc(it.name)}` : `${P} löst ${n}× ${esc(it.name)} ein`}</b>
          <small>${fmt.format(new Date(t.ts))} · Konto ${R}</small>
        </div>
        <div class="val ${paid ? 'pos' : 'neg'}">${paid ? '+' : '−'}${money(n * t.price)}</div>
        <button class="x" data-action="undo" aria-label="Eintrag löschen">${X_SVG}</button>
      </div>`;
    }).join('');
    $('history').innerHTML = rows || `<div class="empty">Noch keine Einträge.<br>Wähle oben, wer zahlt, und tippe auf „Bezahlen“.</div>`;
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
        ${pickerFor === it.id ? `<div class="picker">${EMOJIS.map((e) => `<button data-action="emoji" data-e="${e}" class="${e === it.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>` : ''}
        <div class="field"><label>Preis</label><input class="num" data-field="price" inputmode="decimal" value="${String(it.price).replace('.', ',')}"><span class="unit">€</span></div>
      </div>`).join('')}
      <div class="group"><button class="linkbtn" data-action="add-item">+ Neue Spalte hinzufügen</button></div>
      <p class="hint">Jede Spalte hat einen eigenen Namen und Preis. Beim Löschen einer Spalte werden auch ihre Einträge entfernt.</p>
      <div class="group-title">Daten</div>
      <div class="group"><button class="linkbtn danger" data-action="reset">${confirmReset ? 'Wirklich alles löschen? Nochmal tippen' : 'Alles zurücksetzen'}</button></div>`;
  }

  function renderMain() { renderHome(); renderAccounts(); renderItems(); renderHistory(); }
  function commit() { save(); renderMain(); }

  /* ---------- Aktionen ---------- */
  function setView(v) {
    document.body.dataset.view = v;
    $('manager').setAttribute('aria-hidden', v !== 'manager');
    $('home').setAttribute('aria-hidden', v !== 'home');
    if (v !== 'manager') closeSheet();
  }
  function openSheet() { pickerFor = confirmDel = null; confirmReset = false; renderSettings(); document.body.classList.add('sheet-open'); $('sheet').setAttribute('aria-hidden', 'false'); }
  function closeSheet() { document.activeElement && document.activeElement.blur(); document.body.classList.remove('sheet-open'); $('sheet').setAttribute('aria-hidden', 'true'); }

  function book(itemId, sign) {
    const it = state.items.find((i) => i.id === itemId);
    if (!it) return;
    state.tx.push({ id: uid(), itemId, from: payer(), qty: sign * (qty[itemId] || 1), price: it.price, ts: Date.now() });
    qty[itemId] = 1;
    commit();
    const card = document.querySelector(`.card[data-id="${itemId}"]`);
    if (card) card.classList.add('bump');
    if (navigator.vibrate) navigator.vibrate(10);
  }

  const actions = {
    open: () => setView('manager'),
    close: () => setView('home'),
    toggle: () => setView(document.body.dataset.view === 'manager' ? 'home' : 'manager'),
    payer: (el) => { state.payer = el.dataset.k; commit(); },
    settings: openSheet,
    'settings-close': closeSheet,
    qty: (el, id) => { qty[id] = Math.min(99, Math.max(1, (qty[id] || 1) + Number(el.dataset.d))); renderItems(); },
    pay: (el, id) => book(id, 1),
    use: (el, id) => book(id, -1),
    undo: (el) => { const id = el.closest('[data-tx]').dataset.tx; state.tx = state.tx.filter((t) => t.id !== id); commit(); },
    'add-item': () => {
      const it = { id: uid(), name: 'Geschenk ' + (state.items.length + 1), price: 3, emoji: EMOJIS[state.items.length % EMOJIS.length] };
      state.items.push(it);
      commit();
      openSheet();
      const input = document.querySelector(`#settings [data-id="${it.id}"] [data-field="name"]`);
      if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); input.select(); }
    },
    picker: (el, id) => { pickerFor = pickerFor === id ? null : id; renderSettings(); },
    emoji: (el, id) => { state.items.find((i) => i.id === id).emoji = el.dataset.e; pickerFor = null; commit(); renderSettings(); },
    'del-item': (el, id) => {
      if (confirmDel !== id) { confirmDel = id; renderSettings(); return; }
      state.items = state.items.filter((i) => i.id !== id);
      state.tx = state.tx.filter((t) => t.itemId !== id);
      confirmDel = null; commit(); renderSettings();
    },
    reset: () => {
      if (!confirmReset) { confirmReset = true; renderSettings(); return; }
      state = defaults(); confirmReset = false; commit(); renderSettings();
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

  renderMain();
})();
