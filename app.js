(() => {
  'use strict';

  const KEY = 'finanzappox.v1';
  const EMOJIS = ['🎁', '💝', '🍫', '☕', '🍕', '🎬', '💆', '🧹', '🚗', '🌹', '🍦', '🎮', '📚', '🍳', '⭐', '🎟️'];
  const EURO_SVG = '<svg viewBox="0 0 24 24"><path d="M17.5 6.2A6.6 6.6 0 0 0 7.2 9.5M17.5 17.8A6.6 6.6 0 0 1 7.2 14.5M4.5 10h8.5M4.5 14h7"/></svg>';
  const X_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const defaults = () => ({
    people: [{ id: 'me', name: 'Matti' }, { id: 'partner', name: 'Juna' }],
    buyer: 'me',      // wer gerade kauft
    seller: 'partner', // bei wem gekauft wird
    items: [
      { id: uid(), name: 'Geschenk', price: 15, bulkQty: 10, bulkPrice: 12, emoji: '🎁' },
      { id: uid(), name: 'Geschenke 2', price: 3, bulkQty: 10, bulkPrice: 2, emoji: '💝' }
    ],
    notes: [],
    statMode: 'week', // Statistik: 'day' | 'week' | 'month'
    v: 4,
    tx: [] // { id, itemId, from (wer handelt), to (bei wem), type: 'cash' (Geld einzahlen) | 'buy' | 'loan' (leihen) | 'settle' (geliehenes zahlen) | 'eat' | 'ret' (bezahltes zurück) | 'retl' (geliehenes zurück), qty, price, ts }
  });

  // Einen (auch älteren) Stand in die aktuelle Form bringen
  function normalize(st) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) st = defaults();
    if (!Array.isArray(st.items)) st.items = [];
    st.tx = (Array.isArray(st.tx) ? st.tx : []).filter((t) => t && t.type); // alte Buchungen ohne Art verwerfen
    // Ältere Stände mit genau zwei festen Personen übernehmen
    if (!Array.isArray(st.people) || st.people.length < 2) {
      st.people = [{ id: 'me', name: st.me || 'Matti' }, { id: 'partner', name: st.partner || 'Juna' }];
      st.buyer = st.payer === 'partner' ? 'partner' : 'me';
      delete st.me; delete st.partner; delete st.payer;
    }
    if (st.v !== 3 && st.v !== 4) st.tx = []; // Buchungen aus früheren Rechenmodellen verwerfen
    if (st.v !== 4) { // Version 4: Mengenrabatt und Geschenke 2
      const g = st.items.find((i) => i.name === 'Geschenk');
      if (g && g.bulkQty == null) { g.bulkQty = 10; g.bulkPrice = 12; }
      if (!st.items.some((i) => i.name === 'Geschenke 2')) st.items.push({ id: uid(), name: 'Geschenke 2', price: 3, bulkQty: 10, bulkPrice: 2, emoji: '💝' });
      st.v = 4;
    }
    st.tx.forEach((t) => { if (!t.to) t.to = t.from === 'me' ? 'partner' : 'me'; });
    if (!['day', 'week', 'month'].includes(st.statMode)) st.statMode = 'week';
    if (!st.mac) st.mac = { stamps: 0, loanUntil: null }; // MacPunkte: Stempel und Ende der Ausleihe
    if (!Array.isArray(st.notes)) st.notes = []; // { id, text, ts }
    if (!Array.isArray(st.accounts)) st.accounts = []; // { id, user, salt, hash, personId }
    if (typeof st.ts !== 'number') st.ts = 0; // Zeit der letzten Änderung (für den Online-Abgleich)
    return st;
  }

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { state = defaults(); }
  state = normalize(state);

  const CLIENT = uid(); // kennzeichnet dieses Gerät/Fenster in Online-Schreibvorgängen
  const persistLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* privat/voll */ } };
  const save = () => { state.ts = Date.now(); state.by = CLIENT; persistLocal(); cloudPush(); };

  // UI-Zustand (nicht gespeichert)
  const qty = {};          // Menge je Spalte
  const GROUPS = (window.EMOJI_GROUPS || [['🎁', 'Auswahl', EMOJIS.join(' ')]]).map(([icon, label, list]) => ({ icon, label, list: list.split(' ') }));
  let pickerGroup = 0;     // gewählte Emoji-Gruppe
  let pickerFor = null;    // offene Emoji-Auswahl
  let confirmDel = null;   // Spalte, deren Löschen bestätigt werden muss
  let confirmReset = false;
  let confirmDelPerson = null;
  let dataOpen = null;     // 'save' | 'load' im Daten-Bereich
  let loadError = '';
  let editing = null;      // offene Notiz
  let confirmNoteDel = false;
  let confirmMacReturn = false;
  let invPerson = null;
  let statOffset = 0;      // 0 = aktueller Zeitraum, −1 = vorheriger …
  let cashFor = null;      // Person, für die gerade Geld hinzugefügt wird      // 0 = aktueller Zeitraum, −1 = vorheriger …    // wessen Inventar gezeigt wird

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const money = (n) => eur.format(n).replace('-', '−');
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  const initial = (s) => (s.trim()[0] || '?').toUpperCase();

  const COLORS = [['#8ea2ff', '#5b4bff'], ['#ff8fb8', '#ff4f8b'], ['#5ef0a0', '#12a56c'], ['#ffd36b', '#f59a0b'], ['#7fe3ff', '#1e9bd8'], ['#d9a2ff', '#9b4bff'], ['#ff9d7a', '#f0562e'], ['#b8c4d6', '#66758c']];
  const round2 = (n) => Math.round(n * 100) / 100;
  const person = (id) => state.people.find((p) => p.id === id);
  const who = (id) => { const p = person(id); return (p && p.name.trim()) || 'Person ' + (state.people.indexOf(p) + 1); };
  const avatar = (id, cls = '') => {
    const c = COLORS[Math.max(0, state.people.indexOf(person(id))) % COLORS.length];
    return `<div class="avatar ${cls}" style="background:linear-gradient(145deg, ${c[0]}, ${c[1]})">${esc(who(id)[0].toUpperCase())}</div>`;
  };
  /* ---------- Login-Konten ---------- */
  const SKEY = 'finanzappox.session';
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch { session = null; }
  if (!session) { try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { session = null; } }
  let sessionPending = !session; // lokal keine Anmeldung: kurz im privaten claude.ai-Bereich nachsehen
  let cloudDb = null, cloudUid = null; // privater Bereich dieses claude.ai-Kontos (für die Anmeldung)
  const account = () => (session && state.accounts.find((a) => a.id === session.accountId)) || null;
  // Die Person des angemeldeten Kontos (null, wenn nicht angemeldet oder Person gelöscht)
  const myPerson = () => { const a = account(); return a && person(a.personId) ? a.personId : null; };
  // Admin sieht alles; das Passwort steht hier nur als Prüfsumme, nie im Klartext
  const ADMIN_HASH = '8a57b24a425eba4a232e88212eade47de5ab8e1510dae5e338b6417eb6e6572d';
  const isAdmin = () => !!(account() && session.admin);
  // Ohne Admin ist die Sicht auf die eigene Person beschränkt
  const restrictTo = () => (account() && !session.admin ? myPerson() : null);
  function saveSession() {
    try {
      localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY);
      if (session) (session.keep === false ? sessionStorage : localStorage).setItem(SKEY, JSON.stringify(session));
    } catch { /* Speicher im Browser blockiert: die Cloud-Kopie unten greift */ }
    cloudSaveSession();
  }
  // Angemeldet bleiben, auch wenn der Browser-Speicher blockiert ist: Kopie im privaten Bereich dieses claude.ai-Kontos
  function cloudSaveSession() {
    if (!cloudDb || !cloudUid) return;
    const ref = cloudDb.doc('data/users/' + cloudUid + '/session');
    if (session && session.keep !== false) ref.set({ accountId: session.accountId, user: session.user, admin: !!session.admin }).catch(() => {});
    else ref.delete().catch(() => {});
  }
  async function hashPw(salt, pw) {
    const text = salt + ':' + pw;
    if (crypto && crypto.subtle) {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let a = 0x811c9dc5, out = ''; // Notlösung ohne WebCrypto
    for (let r = 0; r < 8; r++) { for (const c of text) { a ^= c.codePointAt(0) + r; a = Math.imul(a, 0x01000193) >>> 0; } out += a.toString(16).padStart(8, '0'); }
    return 'x' + out;
  }

  const buyer = () => myPerson() || (person(state.buyer) ? state.buyer : state.people[0].id);
  const seller = () => { const b = buyer(); return person(state.seller) && state.seller !== b ? state.seller : state.people.find((p) => p.id !== b).id; };
  // Verwehrte Käufe gelten als nie passiert (Geld zurück, kein Inventar). Offene Käufe zählen schon.
  const liveTx = () => state.tx.filter((t) => t.st !== 'denied');
  const JUNA = 'partner'; // die Person, die Käufe bestätigt
  const sumTx = (itemId, from, type, to) => liveTx().reduce((sum, t) => sum + (t.itemId === itemId && t.from === from && t.type === type && (!to || t.to === to) ? t.qty : 0), 0);
  // Stücke im Inventar einer Person: gekauft, weder konsumiert noch zurückgegeben (optional nur von einem Verkäufer)
  const held = (itemId, key, from) => sumTx(itemId, key, 'buy', from) + sumTx(itemId, key, 'loan', from) - sumTx(itemId, key, 'eat', from) - sumTx(itemId, key, 'ret', from) - sumTx(itemId, key, 'retl', from);
  // Geldsumme der Buchungen eines Typs von a bei b
  const moneyTx = (itemId, a, type, b) => liveTx().reduce((sum, t) => sum + (t.itemId === itemId && t.from === a && t.type === type && t.to === b ? t.qty * t.price : 0), 0);
  // Geliehene, noch nicht bezahlte (und nicht zurückgegebene) Stücke von a bei b
  const debtUnits = (itemId, a, b) => sumTx(itemId, a, 'loan', b) - sumTx(itemId, a, 'settle', b) - sumTx(itemId, a, 'retl', b);
  // Stückpreis beim Kauf von q auf einmal (Mengenrabatt ab bulkQty Stück)
  const unitPrice = (it, q) => (it.bulkQty >= 2 && it.bulkPrice != null && q >= it.bulkQty ? it.bulkPrice : it.price);
  // Durchschnittspreis, zu dem o das Stück bei sl bekommen hat (für Konsum und Rückgabe)
  const acqAvg = (itemId, o, sl) => {
    const u = sumTx(itemId, o, 'buy', sl) + sumTx(itemId, o, 'loan', sl);
    if (!u) { const it = state.items.find((i) => i.id === itemId); return it ? it.price : 0; }
    return round2((moneyTx(itemId, o, 'buy', sl) + moneyTx(itemId, o, 'loan', sl)) / u);
  };
  // Offener geliehener Betrag und Preis je noch offenem Stück
  const debtMoney = (itemId, a, b) => round2(moneyTx(itemId, a, 'loan', b) - moneyTx(itemId, a, 'settle', b) - moneyTx(itemId, a, 'retl', b));
  const loanAvg = (itemId, a, b) => { const u = debtUnits(itemId, a, b); return u > 0 ? round2(debtMoney(itemId, a, b) / u) : acqAvg(itemId, a, b); };
  // Kontostand aus den Buchungen: Einzahlungen plus Verkäufe minus Käufe; Rückgaben drehen den Kauf um.
  const balance = (key) => round2(liveTx().reduce((sum, t) => {
    const v = t.qty * t.price;
    if (t.type === 'cash') return sum + (t.from === key ? v : 0);
    if (t.type === 'buy' || t.type === 'settle') return sum + (t.to === key ? v : 0) - (t.from === key ? v : 0);
    if (t.type === 'ret') return sum + (t.from === key ? v : 0) - (t.to === key ? v : 0);
    return sum;
  }, 0));
  const amount = (b) => (b > 0 ? '+' : '') + money(b);
  const tone = (b) => (b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero');

  /* ---------- Rendern ---------- */
  const heldChips = (key) => state.items.map((it) => {
    const c = held(it.id, key);
    return c > 0 ? `<span class="chip">${esc(it.emoji)}${c > 1 ? ' ×' + c : ''}</span>` : '';
  }).join('');

  function renderHome() {
    $('widget').innerHTML = `
      <div class="w-top"><span class="mini">${EURO_SVG}</span>Finanzen</div>
      <div class="w-rows">${state.people.filter((p) => !restrictTo() || p.id === restrictTo()).map((p) => {
        const bal = balance(p.id);
        return `
        <div class="w-row money">
          <span>${avatar(p.id, 'sm')}<b>${esc(who(p.id))}</b></span>
          <strong class="${tone(bal)}">${amount(bal)}</strong>
        </div>`;
      }).join('')}
      </div>`;
  }

  function renderAccounts() {
    const b = buyer(), sl = seller(), fixed = !!myPerson();
    const pick = (action, list, on) => `<div class="pick">${list.map((p) => `
        <button class="pchip glass ${p.id === on ? 'on' : ''}" data-action="${action}" data-k="${p.id}">${avatar(p.id, 'sm')}<span>${esc(who(p.id))}</span></button>`).join('')}
      </div>`;
    $('hero').innerHTML = `
      <div class="accts">${state.people.filter((p) => !restrictTo() || p.id === restrictTo()).map((p) => {
        const bal = balance(p.id);
        return `
        <article class="acct glass ${tone(bal)} ${p.id === b ? 'me' : ''}" ${fixed ? '' : 'data-action="buyer" role="button" tabindex="0"'} data-k="${p.id}" aria-pressed="${p.id === b}">
${!myPerson() || isAdmin() || p.id === myPerson() ? `<button class="addcash" data-action="cash" data-k="${p.id}" aria-label="Geld für ${esc(who(p.id))} ändern">+</button>` : ''}
          <div class="pair">${avatar(p.id)}<span>${esc(who(p.id))}</span></div>
          <div class="label">Konto${p.id === b ? '<span class="tag">kauft</span>' : ''}</div>
          <div class="amount">${amount(bal)}</div>
          <div class="chips">${heldChips(p.id) || '<span class="chip none">Nichts übrig</span>'}</div>
        </article>`;
      }).join('')}
      </div>
      ${cashFormHtml()}
      ${state.people.length > 2 ? `
      <div class="seg-label">Bei wem kauft ${esc(who(b))}?</div>
      ${pick('seller', state.people.filter((p) => p.id !== b), sl)}` : `
      <div class="ctx">${esc(who(b))} kauft bei ${esc(who(sl))}${fixed ? '' : ' · antippen zum Wechseln'}</div>`}
      ${debtsHtml(b)}`;
  }

  // Eingabefeld, um einer Person Geld gutzuschreiben
  function cashFormHtml() {
    if (!person(cashFor)) return '';
    return `
      <div class="cashform glass">
        <label for="cash-amount">Geld für ${esc(who(cashFor))}</label>
        <div class="cashrow">
          <input id="cash-amount" inputmode="decimal" placeholder="z. B. 100" aria-label="Betrag in Euro">
          <span class="unit">€</span>
        </div>
        <div class="cashbtns">
          <button class="paybtn" data-action="cash-add">+ Hinzufügen</button>
          <button class="paybtn out" data-action="cash-sub">− Abziehen</button>
        </div>
      </div>`;
  }

  // Offene geliehene Beträge der Person b, mit Knopf zum Zahlen
  function debtsHtml(b) {
    const debts = state.items.flatMap((it) => state.people
      .filter((p2) => p2.id !== b && debtUnits(it.id, b, p2.id) > 0)
      .map((p2) => ({ it, p2, n: debtUnits(it.id, b, p2.id) })));
    if (!debts.length) return '';
    return `
      <div class="seg-label">Geliehen · noch zu zahlen</div>
      <div class="debts">${debts.map((d) => `
        <div class="debt glass" data-debt="${d.it.id}|${d.p2.id}">
          <div class="emoji">${esc(d.it.emoji)}</div>
          <div class="txt">
            <b>${d.n}× ${esc(d.it.name)}</b>
            <small>${esc(who(b))} schuldet ${esc(who(d.p2.id))} ${money(debtMoney(d.it.id, b, d.p2.id))}</small>
          </div>
          <button class="paybtn" data-action="debt-pay">${money(loanAvg(d.it.id, b, d.p2.id))}<small>zahlen</small></button>
        </div>`).join('')}
      </div>`;
  }

  function renderItems() {
    const p = buyer(), sl = seller(), receiver = esc(who(sl));
    $('items').innerHTML = state.items.map((it) => {
      const c = held(it.id, p), q = qty[it.id] || 1;
      const unit = unitPrice(it, q), total = round2(unit * q), rabatt = it.bulkQty >= 2 && it.bulkPrice != null;
      return `
      <article class="card glass" data-id="${it.id}">
        <div class="card-top">
          <div class="emoji">${esc(it.emoji)}</div>
          <div class="count ${c > 0 ? 'pos' : ''}"><b>${c}</b><small>${esc(who(p))} hat</small></div>
        </div>
        <h3>${esc(it.name || 'Ohne Namen')}</h3>
        <div class="price">${money(it.price)} pro Stück${rabatt ? ` · ab ${it.bulkQty}: ${money(it.bulkPrice)}` : ''}</div>
        <div class="stepper">
          <button data-action="qty" data-d="-1" aria-label="Weniger">−</button>
          <span>${q}×</span>
          <button data-action="qty" data-d="1" aria-label="Mehr">+</button>
        </div>
        <button class="btn pay" data-action="buy">Kaufen<small>${money(total)} an ${receiver}${unit < it.price ? ` · je ${money(unit)}` : ''}</small></button>
        <button class="btn loan" data-action="loan">Leihen</button>
      </article>`;
    }).join('') || '<div class="empty wide">Noch keine Spalte. Lege im Zahnrad eine an.</div>';
  }

  /* ---------- Statistik ---------- */
  function statRange() {
    const m = state.statMode, o = statOffset, now = new Date();
    let start, end, label;
    if (m === 'day') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + o);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + o + 1);
      label = o === 0 ? 'Heute' : o === -1 ? 'Gestern' : start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    } else if (m === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() + o, 1);
      end = new Date(now.getFullYear(), now.getMonth() + o + 1, 1);
      label = start.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + o * 7);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      const f = (d, withM) => d.toLocaleDateString('de-DE', withM ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
      label = (o === 0 ? 'Diese Woche · ' : '') + f(start, start.getMonth() !== last.getMonth()) + ' – ' + f(last, true);
    }
    return { start: +start, end: +end, label };
  }

  function renderStats() {
    const m = state.statMode, { start, end, label } = statRange();
    const rows = state.people.filter((p) => !restrictTo() || p.id === restrictTo()).map((p) => {
      let total = 0;
      const counts = {};
      liveTx().forEach((t) => {
        if (t.type === 'eat' && t.from === p.id && t.ts >= start && t.ts < end) {
          total += t.qty * t.price;
          counts[t.itemId] = (counts[t.itemId] || 0) + t.qty;
        }
      });
      return { p, total: round2(total), counts };
    });
    const max = Math.max(...rows.map((r) => r.total), 0);
    $('stats').innerHTML = `
      <div class="seg glass three" data-on="${m}">
        <button data-action="stat-mode" data-k="day" class="${m === 'day' ? 'on' : ''}">Tag</button>
        <button data-action="stat-mode" data-k="week" class="${m === 'week' ? 'on' : ''}">Woche</button>
        <button data-action="stat-mode" data-k="month" class="${m === 'month' ? 'on' : ''}">Monat</button>
      </div>
      <div class="period">
        <button class="round glass sm" data-action="stat-prev" aria-label="Zeitraum zurück">‹</button>
        <span>${esc(label)}</span>
        <button class="round glass sm" data-action="stat-next" aria-label="Zeitraum vor" ${statOffset ? '' : 'disabled'}>›</button>
      </div>
      ${max > 0 ? rows.map(({ p, total, counts }) => `
      <div class="stat-row">
        <div class="stat-top">
          <div class="pair">${avatar(p.id, 'sm')}<span>${esc(who(p.id))}</span></div>
          <b>${money(total)}</b>
        </div>
        <div class="bar-track stat"><i style="width:${Math.round(total / max * 100)}%"></i></div>
        <div class="chips">${Object.entries(counts).map(([id, n]) => {
          const it = state.items.find((i) => i.id === id);
          return it ? `<span class="chip">${esc(it.emoji)}${n > 1 ? ' ×' + n : ''}</span>` : '';
        }).join('') || '<span class="chip none">Nichts konsumiert</span>'}</div>
      </div>`).join('') : '<div class="empty">In diesem Zeitraum wurde nichts konsumiert.</div>'}`;
  }

  function renderHistory() {
    const byId = Object.fromEntries(state.items.map((it) => [it.id, it]));
    const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const rows = state.tx.slice().reverse().filter((t) => person(t.from) && (!restrictTo() || t.from === restrictTo() || t.to === restrictTo()) && (t.type === 'cash' || (byId[t.itemId] && person(t.to)))).slice(0, 60).map((t) => {
      const P = esc(who(t.from)), R = esc(who(t.to)), sum = money(t.qty * t.price);
      if (t.type === 'cash') {
        const out = t.price < 0, amt = money(Math.abs(t.qty * t.price));
        return `
      <div class="row" data-tx="${t.id}">
        <div class="emoji">💶</div>
        <div class="txt"><b>${P} ${out ? `entnimmt ${amt}` : `zahlt ${amt} ein`}</b><small>${fmt.format(new Date(t.ts))}</small></div>
        <div class="val ${out ? 'neg' : 'pos'}">${out ? '−' : '+'}${amt}</div>
        <button class="x" data-action="undo" aria-label="Eintrag löschen">${X_SVG}</button>
      </div>`;
      }
      const it = byId[t.itemId];
      const pend = t.st === 'pending', denied = t.st === 'denied';
      const text = t.type === 'buy' ? `${P} kauft ${t.qty}× ${esc(it.name)} bei ${R}${pend ? ' · Juna bestätigt noch' : denied ? ' · von Juna verwehrt' : ''}`
        : t.type === 'loan' ? `${P} leiht ${t.qty}× ${esc(it.name)} bei ${R}`
        : t.type === 'settle' ? `${P} zahlt ${R} ${sum} für Geliehenes`
        : t.type === 'eat' ? `${P} konsumiert ${t.qty}× ${esc(it.name)}`
        : t.type === 'retl' ? `${P} gibt ${R} ${t.qty}× ${esc(it.name)} zurück (war geliehen)`
        : `${P} gibt ${R} ${t.qty}× ${esc(it.name)} zurück`;
      const val = denied ? '<div class="val dim">storniert</div>' : t.type === 'ret' ? `<div class="val pos">+${sum}</div>`
        : t.type === 'buy' || t.type === 'settle' ? `<div class="val neg">−${sum}</div>`
        : t.type === 'loan' ? `<div class="val dim">${sum} offen</div>` : '';
      return `
      <div class="row" data-tx="${t.id}">
        <div class="emoji">${esc(it.emoji)}</div>
        <div class="txt">
          <b>${text}</b>
          <small>${fmt.format(new Date(t.ts))}</small>
        </div>
        ${val}
        <button class="x" data-action="undo" aria-label="Eintrag löschen">${X_SVG}</button>
      </div>`;
    }).join('');
    $('history').innerHTML = rows || `<div class="empty">Noch keine Einträge.<br>Wähle oben, wer kauft, und tippe auf „Kaufen“. Konsumieren und Zurückgeben geht im Inventar.</div>`;
  }

  function renderSettings() {
    const admin = isAdmin();
    $('settings').innerHTML = `
      ${account() ? `
      <div class="group-title">Konto</div>
      <div class="group">
        <div class="field"><label>Angemeldet</label><div class="acc-as">${esc(account().user)}${myPerson() ? ` · ${esc(who(myPerson()))}` : ''}</div></div>
        <button class="linkbtn danger" data-action="logout">Abmelden</button>
      </div>` : ''}
      <div class="group-title">App</div>
      <div class="group">
        <button class="linkbtn" data-action="install">Zum Home-Bildschirm hinzufügen</button>
        ${installOpen ? `<p class="hint inpad">${esc(installText())}</p>` : ''}
      </div>
      <div class="group-title">Admin</div>
      <div class="group">
        ${admin ? `
        <div class="field"><label>Status</label><div class="acc-as">Admin-Modus aktiv – du siehst alles</div></div>
        <button class="linkbtn danger" data-action="admin-exit">Admin verlassen</button>` : `
        <button class="linkbtn" data-action="admin-open">Admin werden</button>
        ${adminOpen ? `
        <div class="codebox">
          <input id="admin-pass" type="password" placeholder="Admin-Passwort" autocomplete="off" aria-label="Admin-Passwort">
          ${adminErr ? `<p class="hint err">${esc(adminErr)}</p>` : ''}
          <button class="btn pay" data-action="admin-submit">Bestätigen</button>
        </div>` : ''}`}
      </div>
      ${admin ? `
      <div class="group-title">Personen</div>
      <div class="group">
        ${state.people.map((p, i) => `
        <div class="field" data-pid="${p.id}">
          ${avatar(p.id, 'sm')}
          <input data-person value="${esc(p.name)}" placeholder="Person ${i + 1}" maxlength="20" aria-label="Name Person ${i + 1}">
          ${state.people.length > 2 ? `<button class="del ${confirmDelPerson === p.id ? 'sure' : ''}" data-action="del-person" aria-label="Person löschen">${confirmDelPerson === p.id ? 'Löschen?' : TRASH_SVG}</button>` : ''}
        </div>`).join('')}
        <button class="linkbtn" data-action="add-person">+ Person hinzufügen</button>
      </div>
      ${myPerson() ? '' : `
      <div class="group-title">Ich bin</div>
      <div class="pick in-sheet">${state.people.map((p) => `
        <button class="pchip glass ${p.id === buyer() ? 'on' : ''}" data-action="buyer" data-k="${p.id}">${avatar(p.id, 'sm')}<span>${esc(who(p.id))}</span></button>`).join('')}
      </div>`}
      <p class="hint">Beim Löschen einer Person werden auch ihre Einträge entfernt.</p>
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
        <div class="field bulk"><label>Rabatt</label><span class="unit">ab</span><input class="num tiny" data-field="bulkQty" inputmode="numeric" value="${it.bulkQty || ''}" placeholder="–" aria-label="Rabatt ab Stück"><span class="unit">Stück, je</span><input class="num" data-field="bulkPrice" inputmode="decimal" value="${it.bulkPrice != null ? String(it.bulkPrice).replace('.', ',') : ''}" placeholder="–" aria-label="Rabattpreis"><span class="unit">€</span></div>
      </div>`).join('')}
      <div class="group"><button class="linkbtn" data-action="add-item">+ Neue Spalte hinzufügen</button></div>
      <p class="hint">Jede Spalte hat einen eigenen Namen und Preis. Beim Löschen einer Spalte werden auch ihre Einträge entfernt.</p>` : ''}
      <div class="group-title">Daten</div>
      <p class="hint" id="sync-hint" style="margin-bottom:8px">${esc(syncHint())}</p>
      ${admin ? `
      <div class="group">
        <button class="linkbtn" data-action="data-save">Save · Daten als Code sichern</button>
        ${dataOpen === 'save' ? `
        <div class="codebox">
          <textarea id="save-code" readonly rows="4" aria-label="Gesicherter Code">${esc(JSON.stringify(state))}</textarea>
          <button class="btn pay" data-action="copy-code">Code kopieren</button>
          <p class="hint">Bewahre den Code z. B. in einer Notiz oder Nachricht auf. Über „Load“ spielst du ihn auf jedem Gerät wieder ein.</p>
        </div>` : ''}
        <button class="linkbtn" data-action="data-load">Load · Code einspielen</button>
        ${dataOpen === 'load' ? `
        <div class="codebox">
          <textarea id="load-code" rows="4" placeholder="Code hier einfügen …" aria-label="Code einfügen"></textarea>
          ${loadError ? `<p class="hint err">${esc(loadError)}</p>` : ''}
          <button class="btn pay" data-action="apply-code">Code übernehmen</button>
          <p class="hint">Ersetzt alle Daten dieser App auf diesem Gerät (auch die Notizen).</p>
        </div>` : ''}
        <button class="linkbtn danger" data-action="reset">${confirmReset ? 'Wirklich zurücksetzen? Nochmal tippen' : 'Alles zurücksetzen'}</button>
      </div>
      <p class="hint">Setzt Konten, Inventar und Verlauf auf null. Personen, Spalten und Notizen bleiben erhalten.</p>` : '<p class="hint">Personen, Spalten, Sicherung und Zurücksetzen verwaltet nur der Admin.</p>'}`;
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

  /* ---------- MacPoints ---------- */
  const MAC_SVG = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/></svg>';
  const STAMPS = 5, LOAN_MS = 24 * 60 * 60 * 1000;
  const pad = (n) => String(n).padStart(2, '0');
  const countdown = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`; };
  let macWasOver = null;
  /* ---------- Anfragen (für Juna statt MacPoints) ---------- */
  const INBOX_SVG = '<svg viewBox="0 0 24 24"><path d="M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>';
  const requestsMode = () => myPerson() === JUNA;
  function renderRequests() {
    $('mac-title').textContent = 'Anfragen';
    const byId = Object.fromEntries(state.items.map((it) => [it.id, it]));
    const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const open = state.tx.filter((t) => t.st === 'pending' && t.to === JUNA && byId[t.itemId] && person(t.from)).slice().reverse();
    const done = state.tx.filter((t) => (t.st === 'ok' || t.st === 'denied') && t.to === JUNA && t.type === 'buy' && byId[t.itemId] && person(t.from)).slice().reverse().slice(0, 20);
    const row = (t, extra, tag) => {
      const it = byId[t.itemId];
      return `
        <div class="req glass" data-tx="${t.id}">
          <div class="req-top">
            <div class="emoji">${esc(it.emoji)}</div>
            <div class="txt"><b>${esc(who(t.from))} kauft ${t.qty}× ${esc(it.name)}</b><small>${fmt.format(new Date(t.ts))}${tag ? ` · ${tag}` : ''}</small></div>
            <div class="val ${t.st === 'denied' ? 'dim' : ''}">${money(t.qty * t.price)}</div>
          </div>
          ${extra}
        </div>`;
    };
    $('mac-body').innerHTML = `
      ${reqMsg ? `<p class="hint err">${esc(reqMsg)}</p>` : ''}
      <div class="section-title first"><span>Offen</span><small>${open.length}</small></div>
      ${open.length ? `<div class="req-list">${open.map((t) => row(t, `
          <div class="req-btns">
            <button class="btn pay" data-action="req-ok">Erhalten<small>hat er bekommen</small></button>
            <button class="btn use" data-action="req-no">Verwehren<small>Geld geht zurück</small></button>
          </div>`, '')).join('')}</div>` : '<div class="empty">Gerade keine offenen Anfragen.</div>'}
      <div class="section-title"><span>Bearbeitet</span></div>
      ${done.length ? `<div class="req-list">${done.map((t) => row(t, '', t.st === 'denied' ? 'verwehrt, Geld zurück' : 'erhalten bestätigt')).join('')}</div>` : '<div class="empty">Noch nichts bearbeitet.</div>'}`;
  }
  let reqMsg = '';
  function decideReq(el, st) {
    if (!requestsMode()) return;
    const id = el.closest('[data-tx]').dataset.tx;
    const t = state.tx.find((x) => x.id === id);
    if (!t || t.st !== 'pending' || t.to !== JUNA) return;
    if (st === 'denied' && held(t.itemId, t.from, t.to) < t.qty) {
      reqMsg = 'Matti hat es schon konsumiert. Verwehren geht nicht mehr.';
      renderRequests();
      return;
    }
    reqMsg = '';
    t.st = st;
    if (navigator.vibrate) navigator.vibrate(10);
    commit();
  }
  // Leiste: für Juna ein Posteingang-Symbol mit Anzahl offener Anfragen
  function renderDock() {
    const j = requestsMode(), icon = document.querySelector('[data-app="mac"] .app-icon');
    if (icon) icon.innerHTML = j ? INBOX_SVG : MAC_SVG;
    const n = j ? state.tx.filter((t) => t.st === 'pending' && t.to === JUNA).length : 0;
    const b = $('req-badge');
    if (b) { b.textContent = n || ''; b.classList.toggle('on', n > 0); }
  }

  function renderMac(popLast) {
    if (requestsMode()) { renderRequests(); return; }
    $('mac-title').textContent = 'MacPoints';
    const m = state.mac, active = m.loanUntil != null, left = active ? m.loanUntil - Date.now() : 0, over = active && left <= 0;
    macWasOver = over;
    const until = active ? new Date(m.loanUntil).toLocaleString('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    $('mac-body').innerHTML = `
      ${active ? `
      <section class="loan glass ${over ? 'over' : ''}">
        <div class="label">${over ? 'Zeit abgelaufen' : 'MacBook ausgeliehen'}</div>
        <div class="time" id="mac-time">${countdown(left)}</div>
        <div class="bar-track"><i id="mac-bar" style="width:${Math.max(0, Math.min(100, left / LOAN_MS * 100))}%"></i></div>
        <div class="info">${over ? 'Die 24 Stunden sind um. Bitte das MacBook zurückgeben.' : `Zurückgeben bis ${until} Uhr`}</div>
        <button class="btn use" data-action="mac-return">${confirmMacReturn ? 'Wirklich zurückgegeben? Nochmal tippen' : 'MacBook zurückgegeben'}</button>
      </section>` : ''}
      <div class="section-title ${active ? '' : 'first'}"><span>MacPunkte</span><small>${m.stamps} von ${STAMPS}</small></div>
      <section class="stampcard glass">
        <div class="stamps">${Array.from({ length: STAMPS }, (_, i) => `
          <div class="stamp ${i < m.stamps ? 'on' : ''} ${popLast && i === m.stamps - 1 ? 'pop' : ''}" style="--r:${[-8, 6, -4, 9, -6][i]}deg">${i < m.stamps ? MAC_SVG : i + 1}</div>`).join('')}
        </div>
        <p class="info">${m.stamps >= STAMPS ? (active ? 'Karte voll. Ausleihen geht wieder, sobald das MacBook zurück ist.' : 'Karte voll! Du darfst das MacBook 24 Stunden ausleihen.')
          : `Noch ${STAMPS - m.stamps} ${STAMPS - m.stamps === 1 ? 'Stempel' : 'Stempel'} bis zur Ausleihe für 24 Stunden.`}</p>
        ${m.stamps >= STAMPS
          ? `<button class="btn mac" data-action="mac-loan" ${active ? 'disabled' : ''}>MacBook ausleihen<small>24 Stunden · Karte wird geleert</small></button>`
          : `<button class="btn mac" data-action="mac-stamp">Stempel sammeln<small>+1 MacPunkt</small></button>`}
        <button class="btn use" data-action="mac-unstamp" ${m.stamps ? '' : 'disabled'}>Stempel entfernen</button>
      </section>`;
  }
  function tickMac() {
    const m = state.mac;
    if (requestsMode() || m.loanUntil == null) return;
    const left = m.loanUntil - Date.now();
    if ((left <= 0) !== macWasOver) { renderMac(); return; }
    const t = $('mac-time'), bar = $('mac-bar');
    if (t) t.textContent = countdown(left);
    if (bar) bar.style.width = Math.max(0, Math.min(100, left / LOAN_MS * 100)) + '%';
  }
  setInterval(tickMac, 1000);

  /* ---------- Inventar ---------- */
  const BAG_SVG = '<svg viewBox="0 0 24 24"><path d="M8.5 7V6a3.5 3.5 0 0 1 7 0v1"/><rect x="5" y="7" width="14" height="14" rx="3.5"/><path d="M9 13h6v3.5H9z"/></svg>';
  const invOwner = () => restrictTo() || (person(invPerson) ? invPerson : buyer());
  function renderInventory() {
    const o = invOwner();
    const many = state.people.length > 2, mp = myPerson();
    const slots = state.items.map((it) => state.people.filter((sl) => sl.id !== o && held(it.id, o, sl.id) > 0).map((sl) => `
        <article class="slot glass" data-id="${it.id}" data-seller="${sl.id}">
          <span class="badge">×${held(it.id, o, sl.id)}</span>
          <span class="big">${esc(it.emoji)}</span>
          <b>${esc(it.name || 'Ohne Namen')}</b>
          ${many ? `<small class="from">von ${esc(who(sl.id))}</small>` : ''}
          ${!mp || o === mp ? `
          <button class="eat" data-action="inv-eat">Konsumieren</button>
          <button class="back" data-action="inv-ret">Zurückgeben<small>${debtUnits(it.id, o, sl.id) > 0 ? 'war geliehen · Schuld entfällt' : `+${money(it.price)} von ${esc(who(sl.id))}`}</small></button>` : '<small class="viewonly">Nur ansehen</small>'}
        </article>`).join('')).join('');
    $('inv-body').innerHTML = `
      ${restrictTo() ? '' : `
      <div class="seg-label">Wessen Inventar?</div>
      <div class="pick">${state.people.map((p) => `
        <button class="pchip glass ${p.id === o ? 'on' : ''}" data-action="inv-person" data-k="${p.id}">${avatar(p.id, 'sm')}<span>${esc(who(p.id))}</span></button>`).join('')}
      </div>`}
      ${slots ? `<div class="inv-grid">${slots}</div>` : `
      <div class="soon">
        <span class="app-icon inv big">${BAG_SVG}</span>
        <h2>Inventar ist leer</h2>
        <p>${esc(who(o))} hat gerade nichts im Inventar.<br>Gekauftes landet automatisch hier.</p>
      </div>`}`;
  }

  /* ---------- Login-Bildschirm ---------- */
  let loginMode = 'login', loginErr = '', regPerson = null, loginBusy = false;
  let installEvt = null, installOpen = false;
  let adminOpen = false, adminErr = '';
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
  function installText() {
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) return 'Die App läuft schon vom Home-Bildschirm aus.';
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios
      ? 'Öffne diese Seite in Safari (nicht in der Claude-App: dort oben rechts auf das Teilen- oder Browser-Symbol und „In Safari öffnen“ wählen). In Safari dann: Teilen-Symbol (Viereck mit Pfeil) antippen, nach unten scrollen und „Zum Home-Bildschirm“ wählen.'
      : 'Öffne das Browser-Menü (⋮) und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.';
  }
  function canStoreHere() {
    try { localStorage.setItem('__fx_test', '1'); localStorage.removeItem('__fx_test'); return true; } catch { return false; }
  }
  function renderLogin() {
    const reg = loginMode === 'register' || !state.accounts.length;
    const keep = { u: $('login-user') ? $('login-user').value : '', p: $('login-pass') ? $('login-pass').value : '', p2: $('login-pass2') ? $('login-pass2').value : '', r: $('login-remember') ? $('login-remember').checked : true };
    const free = state.people.filter((p) => !state.accounts.some((a) => a.personId === p.id));
    $('login').innerHTML = `
      <div class="lock-card glass">
        <span class="app-icon lock-icon">${EURO_SVG}</span>
        <h2>${reg ? 'Konto erstellen' : 'Anmelden'}</h2>
        <input id="login-user" placeholder="Username" maxlength="20" autocomplete="username" autocapitalize="off" autocorrect="off" aria-label="Username">
        <input id="login-pass" type="password" placeholder="Passwort" autocomplete="${reg ? 'new-password' : 'current-password'}" aria-label="Passwort">
        ${reg ? `
        <input id="login-pass2" type="password" placeholder="Passwort wiederholen" autocomplete="new-password" aria-label="Passwort wiederholen">
        <div class="seg-label">Wer bist du?</div>
        <div class="pick">${free.map((p) => `
          <button class="pchip glass ${regPerson === p.id ? 'on' : ''}" data-action="login-person" data-k="${p.id}">${avatar(p.id, 'sm')}<span>${esc(who(p.id))}</span></button>`).join('')}
          <button class="pchip glass ${regPerson === 'new' ? 'on' : ''}" data-action="login-person" data-k="new"><span class="plus-sm">+</span><span>Neue Person</span></button>
        </div>` : ''}
        <label class="remember"><input type="checkbox" id="login-remember" checked> Angemeldet bleiben</label>
        ${canStoreHere() ? '' : '<p class="hint">Dieser Browser speichert auf diesem Gerät gerade nichts. Angemeldet bleibst du dann über deinen claude.ai-Account, solange du dort angemeldet bist.</p>'}
        ${loginErr ? `<p class="hint err">${esc(loginErr)}</p>` : ''}
        <button class="btn pay" data-action="login-submit">${reg ? 'Konto erstellen' : 'Anmelden'}</button>
        ${state.accounts.length ? `<button class="linkbtn center" data-action="login-toggle">${reg ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen'}</button>` : ''}
      </div>`;
    if (keep.u) $('login-user').value = keep.u;
    if (keep.p) $('login-pass').value = keep.p;
    if (keep.p2 && $('login-pass2')) $('login-pass2').value = keep.p2;
    $('login-remember').checked = keep.r;
  }
  function updateLock() {
    const locked = !account();
    document.body.classList.toggle('locked', locked);
    $('login').setAttribute('aria-hidden', String(!locked));
    if (locked) {
      setView('home');
      if (sessionPending) $('login').innerHTML = `<div class="lock-card glass"><span class="app-icon lock-icon">${EURO_SVG}</span><p class="hint">Anmeldung wird geprüft …</p></div>`;
      else renderLogin();
    }
  }
  function resolveSession() {
    if (!sessionPending) return;
    sessionPending = false;
    updateLock();
  }
  $('login').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions['login-submit'](); });

  /* ---------- Online-Speicher (geteilt über claude.ai) ---------- */
  let cloudDoc = null, cloudStatus = 'local'; // 'local' | 'on' | 'read' | 'err'
  let pushTimer = null, pushing = false, pushAgain = false;
  function syncHint() {
    return cloudStatus === 'on' ? 'Online-Speicher aktiv: Jede Änderung landet auf dem Server und gilt für alle, die diese Seite nutzen – auf jedem Gerät.'
      : cloudStatus === 'read' ? 'Du siehst den Online-Stand, darfst ihn aber nicht ändern (nur Lesezugriff). Eigene Änderungen bleiben nur auf diesem Gerät.'
      : cloudStatus === 'err' ? 'Online-Speicher gerade nicht erreichbar – Änderungen werden auf diesem Gerät gespeichert.'
      : 'Daten werden auf diesem Gerät gespeichert. Auf claude.ai angemeldet, teilt der Online-Speicher sie automatisch mit allen Geräten.';
  }
  function setCloudStatus(st) {
    if (cloudStatus === st) return;
    cloudStatus = st;
    const el = $('sync-hint');
    if (el) el.textContent = syncHint();
  }
  function cloudPush() {
    if (!cloudDoc || cloudStatus === 'read') return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, 500);
  }
  function doPush() {
    if (!cloudDoc) return;
    if (pushing) { pushAgain = true; return; } // immer nur ein Schreibvorgang
    pushing = true;
    const body = JSON.parse(JSON.stringify(state));
    cloudDoc.set(body).then(
      () => { setCloudStatus('on'); },
      (e) => {
        if (e && e.code === 'invalid_argument') setCloudStatus('read'); // keine Schreibrechte
        else if (e && e.code === 'unavailable') { pushAgain = true; }
        else setCloudStatus('err');
      }
    ).finally(() => {
      pushing = false;
      if (pushAgain && cloudStatus !== 'read') { pushAgain = false; cloudPush(); }
    });
  }
  function adoptRemote(d) {
    state = normalize(JSON.parse(JSON.stringify(d)));
    persistLocal();
    if (editing && !state.notes.find((n) => n.id === editing)) { editing = null; $('notes').classList.remove('editing'); }
    renderMain(); renderNotes(); renderMac();
    updateLock();
    if (document.body.classList.contains('sheet-open')) renderSettings();
  }
  (async () => {
    if (sessionPending) setTimeout(resolveSession, 3000); // Notbremse, falls der Speicher nie antwortet
    if (!(window.claude && window.claude.use)) { resolveSession(); return; }
    let db = null, uid = null;
    try { db = await window.claude.use('db'); } catch { /* wie nicht verfügbar */ }
    try { const user = await window.claude.use('user'); uid = user ? await user.id() : null; } catch { /* keine Kennung */ }
    if (!db) { resolveSession(); return; } // nicht verfügbar: lokal weiterarbeiten
    cloudDb = db; cloudUid = uid || null;
    if (uid && !account()) {
      try {
        const snap = await db.doc('data/users/' + uid + '/session').get();
        const d = snap.exists ? snap.data() : null;
        if (d && d.accountId) {
          session = { accountId: d.accountId, user: d.user, admin: !!d.admin, keep: true };
          try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch { /* egal */ }
        }
      } catch { /* keine gespeicherte Anmeldung */ }
    }
    resolveSession();
    cloudDoc = db.doc('app/state');
    cloudDoc.onSnapshot((snap) => {
      if (!snap.exists) { // noch nichts im Online-Speicher: eigenen Stand hochladen
        if (!snap.metadata.fromCache) { setCloudStatus('on'); cloudPush(); }
        return;
      }
      const d = snap.data();
      setCloudStatus(cloudStatus === 'read' ? 'read' : 'on');
      if (d.by === CLIENT && d.ts === state.ts) return; // Echo des eigenen Schreibens
      if ((d.ts || 0) > (state.ts || 0)) adoptRemote(d);
      else if ((d.ts || 0) < (state.ts || 0) && !snap.metadata.fromCache) cloudPush(); // lokal ist neuer
    }, () => setCloudStatus('err'));
  })();

  function renderMain() { renderHome(); renderAccounts(); renderItems(); renderStats(); renderHistory(); renderInventory(); renderMac(); renderDock(); }
  function commit() { save(); renderMain(); }

  /* ---------- Aktionen ---------- */
  function setView(v) {
    document.body.dataset.view = v;
    ['home', 'manager', 'mac', 'notes', 'inv'].forEach((id) => $(id).setAttribute('aria-hidden', v !== id));
    if (v !== 'manager') closeSheet();
    if (v !== 'notes' && editing) closeNote();
  }
  function openSheet() { pickerFor = confirmDel = confirmDelPerson = dataOpen = null; loadError = ''; installOpen = false; adminOpen = false; adminErr = ''; confirmReset = false; renderSettings(); document.body.classList.add('sheet-open'); $('sheet').setAttribute('aria-hidden', 'false'); }
  function closeSheet() { document.activeElement && document.activeElement.blur(); document.body.classList.remove('sheet-open'); $('sheet').setAttribute('aria-hidden', 'true'); }

  function book(itemId, type) {
    const it = state.items.find((i) => i.id === itemId);
    if (!it) return;
    const q = qty[itemId] || 1;
    const needsOk = type === 'buy' && seller() === JUNA; // Käufe bei Juna braucht ihre Bestätigung
    state.tx.push({ id: uid(), itemId, from: buyer(), to: seller(), type, qty: q, price: unitPrice(it, q), ts: Date.now(), ...(needsOk ? { st: 'pending' } : {}) });
    qty[itemId] = 1;
    commit();
    const card = document.querySelector(`.card[data-id="${itemId}"]`);
    if (card) card.classList.add('bump');
    if (navigator.vibrate) navigator.vibrate(10);
  }

  // Ein Stück aus dem Inventar konsumieren ('eat') oder dem Verkäufer zurückgeben ('ret')
  function invUse(el, id, type) {
    const slot = el.closest('.slot'), sl = slot.dataset.seller, o = invOwner(), it = state.items.find((i) => i.id === id);
    if (!it || held(id, o, sl) < 1 || slot.classList.contains('eating')) return;
    if (myPerson() && o !== myPerson()) return; // fremdes Inventar: nur ansehen
    if (type === 'ret' && debtUnits(id, o, sl) > 0) type = 'retl'; // Geliehenes zurück: kein Geld, Schuld entfällt
    const price = type === 'retl' ? loanAvg(id, o, sl) : acqAvg(id, o, sl);
    slot.classList.add('eating', type);
    if (navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => {
      state.tx.push({ id: uid(), itemId: id, from: o, to: sl, type, qty: 1, price, ts: Date.now() });
      commit();
    }, 260);
  }

  // Geld auf das eigene Konto einzahlen (+1) oder davon abziehen (−1)
  function bookCash(sign) {
    const i = $('cash-amount'), v = parseFloat((i && i.value || '').replace(',', '.'));
    if (!(v > 0) || !person(cashFor)) { if (i) i.focus(); return; }
    if (myPerson() && !isAdmin() && cashFor !== myPerson()) return; // ohne Admin nur das eigene Konto
    state.tx.push({ id: uid(), itemId: null, from: cashFor, to: cashFor, type: 'cash', qty: 1, price: sign * round2(v), ts: Date.now() });
    cashFor = null;
    commit();
  }

  const actions = {
    'mac-stamp': () => { if (state.mac.stamps < STAMPS) { state.mac.stamps++; save(); renderMac(true); if (navigator.vibrate) navigator.vibrate(10); } },
    'mac-unstamp': () => { if (state.mac.stamps > 0) { state.mac.stamps--; save(); renderMac(); } },
    'mac-loan': () => {
      if (state.mac.stamps < STAMPS || state.mac.loanUntil != null) return;
      state.mac.stamps -= STAMPS; state.mac.loanUntil = Date.now() + LOAN_MS; confirmMacReturn = false;
      save(); renderMac();
    },
    'mac-return': () => {
      if (!confirmMacReturn) { confirmMacReturn = true; renderMac(); return; }
      state.mac.loanUntil = null; confirmMacReturn = false; save(); renderMac();
    },
    open: () => setView('manager'),
    close: () => setView('home'),
    toggle: (el) => setView(document.body.dataset.view === el.dataset.app ? 'home' : el.dataset.app),
    buyer: (el) => { if (myPerson()) return; const prev = buyer(), sl = seller(); state.buyer = el.dataset.k; state.seller = sl === state.buyer ? prev : sl; invPerson = null; commit(); renderSettings(); },
    seller: (el) => { state.seller = el.dataset.k; commit(); },
    'add-person': () => {
      const p = { id: uid(), name: '' };
      state.people.push(p);
      commit(); renderSettings();
      const input = document.querySelector(`#settings [data-pid="${p.id}"] input`);
      if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); }
    },
    'del-person': (el) => {
      const id = el.closest('[data-pid]').dataset.pid;
      if (state.people.length <= 2) return;
      if (confirmDelPerson !== id) { confirmDelPerson = id; renderSettings(); return; }
      state.people = state.people.filter((p) => p.id !== id);
      state.tx = state.tx.filter((t) => t.from !== id && t.to !== id);
      confirmDelPerson = null; commit(); renderSettings();
    },
    settings: openSheet,
    'settings-close': closeSheet,
    qty: (el, id) => { qty[id] = Math.min(99, Math.max(1, (qty[id] || 1) + Number(el.dataset.d))); renderItems(); },
    cash: (el) => {
      cashFor = cashFor === el.dataset.k ? null : el.dataset.k;
      renderAccounts();
      const i = $('cash-amount');
      if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); }
    },
    'cash-add': () => bookCash(1),
    'cash-sub': () => bookCash(-1),
    buy: (el, id) => book(id, 'buy'),
    loan: (el, id) => book(id, 'loan'),
    'debt-pay': (el) => {
      const [itemId, slId] = el.closest('[data-debt]').dataset.debt.split('|');
      const it = state.items.find((i) => i.id === itemId), b = buyer();
      if (!it || debtUnits(itemId, b, slId) < 1) return;
      state.tx.push({ id: uid(), itemId, from: b, to: slId, type: 'settle', qty: 1, price: loanAvg(itemId, b, slId), ts: Date.now() });
      if (navigator.vibrate) navigator.vibrate(10);
      commit();
    },
    'inv-person': (el) => { invPerson = el.dataset.k; renderInventory(); },
    'inv-eat': (el, id) => invUse(el, id, 'eat'),
    'inv-ret': (el, id) => invUse(el, id, 'ret'),
    undo: (el) => { const id = el.closest('[data-tx]').dataset.tx; state.tx = state.tx.filter((t) => t.id !== id); commit(); },
    'note-new': () => { const n = { id: uid(), text: '', ts: Date.now() }; state.notes.push(n); openNote(n.id, true); },
    'note-open': (el) => openNote(el.dataset.note),
    'note-back': closeNote,
    'note-del': () => {
      if (!confirmNoteDel) { confirmNoteDel = true; renderNoteBar(); return; }
      state.notes = state.notes.filter((n) => n.id !== editing);
      closeNote();
    },
    'req-ok': (el) => decideReq(el, 'ok'),
    'req-no': (el) => decideReq(el, 'denied'),
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
    'admin-open': () => {
      adminOpen = !adminOpen; adminErr = '';
      renderSettings();
      const i = $('admin-pass');
      if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); }
    },
    'admin-submit': async () => {
      const i = $('admin-pass');
      if ((await hashPw('fx1', i ? i.value : '')) !== ADMIN_HASH) {
        adminErr = 'Falsches Admin-Passwort.';
        renderSettings();
        const x = $('admin-pass');
        if (x) x.focus();
        return;
      }
      session.admin = true; saveSession();
      adminOpen = false; adminErr = '';
      renderMain(); renderSettings();
    },
    'admin-exit': () => { if (session) { session.admin = false; saveSession(); } renderMain(); renderSettings(); },
    install: () => { if (installEvt) { installEvt.prompt(); return; } installOpen = !installOpen; renderSettings(); },
    'login-person': (el) => { regPerson = el.dataset.k; renderLogin(); },
    'login-toggle': () => { loginMode = loginMode === 'register' ? 'login' : 'register'; loginErr = ''; renderLogin(); },
    'login-submit': async () => {
      if (loginBusy || !document.body.classList.contains('locked')) return;
      const fail = (m) => { loginErr = m; renderLogin(); };
      const u = ($('login-user').value || '').trim(), pw = $('login-pass').value || '';
      const reg = loginMode === 'register' || !state.accounts.length;
      if (!u) return fail('Bitte einen Username eingeben.');
      if (pw.length < 4) return fail('Das Passwort braucht mindestens 4 Zeichen.');
      loginBusy = true;
      try {
        if (reg) {
          if (($('login-pass2').value || '') !== pw) return fail('Die Passwörter stimmen nicht überein.');
          if (state.accounts.some((a) => a.user.toLowerCase() === u.toLowerCase())) return fail('Diesen Username gibt es schon.');
          if (!regPerson) return fail('Wähle unten, wer du bist.');
          let pid = regPerson;
          if (pid === 'new') { const p = { id: uid(), name: u }; state.people.push(p); pid = p.id; }
          else if (!person(pid) || state.accounts.some((a) => a.personId === pid)) return fail('Diese Person ist schon vergeben.');
          const salt = uid();
          const a = { id: uid(), user: u, salt, hash: await hashPw(salt, pw), personId: pid };
          state.accounts.push(a);
          session = { accountId: a.id, user: a.user, keep: $('login-remember').checked };
        } else {
          const a = state.accounts.find((x) => x.user.toLowerCase() === u.toLowerCase());
          if (!a || (await hashPw(a.salt, pw)) !== a.hash) return fail('Username oder Passwort ist falsch.');
          session = { accountId: a.id, user: a.user, keep: $('login-remember').checked };
        }
        saveSession();
        if (myPerson()) state.buyer = myPerson();
        loginErr = ''; regPerson = null; loginMode = 'login';
        commit(); updateLock();
      } finally { loginBusy = false; }
    },
    logout: () => { session = null; saveSession(); closeSheet(); loginErr = ''; renderMain(); updateLock(); },
    'stat-mode': (el) => { state.statMode = el.dataset.k; statOffset = 0; save(); renderStats(); },
    'stat-prev': () => { statOffset--; renderStats(); },
    'stat-next': () => { if (statOffset < 0) { statOffset++; renderStats(); } },
    'data-save': () => {
      dataOpen = dataOpen === 'save' ? null : 'save'; loadError = '';
      renderSettings();
      const t = $('save-code');
      if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); t.select(); }
    },
    'data-load': () => {
      dataOpen = dataOpen === 'load' ? null : 'load'; loadError = '';
      renderSettings();
      const t = $('load-code');
      if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); }
    },
    'copy-code': (el) => {
      const t = $('save-code');
      navigator.clipboard.writeText(t.value).then(
        () => { el.textContent = 'Kopiert ✓'; },
        () => { t.focus(); t.select(); el.textContent = 'Markierten Text selbst kopieren'; }
      );
    },
    'apply-code': () => {
      const t = $('load-code'), raw = t.value.trim();
      try {
        const d = JSON.parse(raw);
        if (!d || !Array.isArray(d.people) || !Array.isArray(d.items) || !Array.isArray(d.tx)) throw new Error();
        localStorage.setItem(KEY, JSON.stringify(d));
      } catch {
        loadError = raw ? 'Das ist kein gültiger Code. Bitte den kompletten Code einfügen.' : 'Bitte zuerst einen Code einfügen.';
        renderSettings();
        const x = $('load-code');
        if (x) x.value = raw;
        return;
      }
      location.reload(); // lädt den eingespielten Stand sauber
    },
    reset: () => {
      if (!confirmReset) { confirmReset = true; renderSettings(); return; }
      state.tx = []; /* Personen, Spalten und Notizen bleiben */ confirmReset = false; commit(); renderSettings();
    }
  };

  // Nur der Admin darf Preise, Spalten, Personen und Daten ändern
  const ADMIN_ONLY = new Set(['add-person', 'del-person', 'add-item', 'del-item', 'picker', 'emoji-group', 'emoji', 'reset', 'data-save', 'data-load', 'copy-code', 'apply-code']);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (ADMIN_ONLY.has(el.dataset.action) && !isAdmin()) return;
    const holder = el.closest('[data-id]');
    actions[el.dataset.action](el, holder && holder.dataset.id);
  });

  // Einstellungen: live übernehmen, ohne das Eingabefeld neu zu zeichnen
  $('settings').addEventListener('input', (e) => {
    if (!isAdmin()) return; // Preise und Namen ändert nur der Admin
    const el = e.target;
    if (el.dataset.person !== undefined) {
      const id = el.closest('[data-pid]').dataset.pid;
      person(id).name = el.value;
      el.previousElementSibling.textContent = who(id)[0].toUpperCase();
    }
    else if (el.dataset.field) {
      const it = state.items.find((i) => i.id === el.closest('[data-id]').dataset.id);
      const f = el.dataset.field;
      if (f === 'name') it.name = el.value;
      else if (f === 'bulkQty') { const n = parseInt(el.value, 10); it.bulkQty = n >= 2 ? n : null; }
      else if (f === 'bulkPrice') { const p = parseFloat(el.value.replace(',', '.')); it.bulkPrice = p >= 0 ? round2(p) : null; }
      else {
        const p = parseFloat(el.value.replace(',', '.'));
        if (!(p >= 0)) return;
        it.price = round2(p);
      }
    } else return;
    commit();
  });
  $('settings').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.id === 'admin-pass') { actions['admin-submit'](); return; }
    e.target.blur();
  });
  $('settings').addEventListener('focusout', (e) => {
    const f = e.target.dataset.field;
    if (f !== 'price' && f !== 'bulkQty' && f !== 'bulkPrice') return;
    const it = state.items.find((i) => i.id === e.target.closest('[data-id]').dataset.id);
    if (!it) return;
    if (f === 'price') e.target.value = String(it.price).replace('.', ',');
    else if (f === 'bulkQty') e.target.value = it.bulkQty || '';
    else e.target.value = it.bulkPrice != null ? String(it.bulkPrice).replace('.', ',') : '';
  });
  $('hero').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'cash-amount') actions['cash-add'](); });
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
  renderMac();
  updateLock();
})();
