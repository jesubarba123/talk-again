/* Talk Again — lógica principal.
   Sin dependencias ni compilación: funciona abriendo index.html o desde cualquier servidor estático. */
(function () {
  'use strict';

  const D = window.TA_DATA;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------- Almacenamiento (todo local) ---------------- */
  const KEYS = {
    settings: 'talkagain.v1.settings',
    vocab: 'talkagain.v1.vocab',
    history: 'talkagain.v1.history',
    words: 'talkagain.v1.words',
    saved: 'talkagain.v1.saved'
  };
  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* sin almacenamiento */ } }
  };

  const DEFAULT_SETTINGS = {
    voiceURI: '', rate: 0.95, scale: '1', theme: 'system', keyboardOrder: 'abc',
    scanInterval: 2, scanLoops: 2, scanSelect: 'screen', scanSpeak: true, scanAuto: false,
    cam: false, camSens: 1, camPreview: true,
    people: ''
  };
  let settings = Object.assign({}, DEFAULT_SETTINGS, store.get(KEYS.settings, {}) || {});
  let vocab = store.get(KEYS.vocab, {}) || {};          // { categoriaId: [items] } sobrescribe los valores por defecto
  let history = store.get(KEYS.history, []) || [];
  let learned = store.get(KEYS.words, {}) || {};        // palabra -> veces usada
  let saved = store.get(KEYS.saved, []) || [];          // frases guardadas desde Deletrear

  const saveSettings = () => store.set(KEYS.settings, settings);

  /* ---------------- Utilidades ---------------- */
  let toastTimer = 0;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2500);
  }
  function flashEl(el) {
    if (!el) return;
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 450);
  }
  function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.startsWith('data-')) node.setAttribute(k, attrs[k]);
      else if (k in node) node[k] = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  /* ---------------- Voz ---------------- */
  const speech = {
    voices: [],
    contentSpeaking: false,
    supported: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    init() {
      if (!this.supported) { renderVoiceSelect(); return; }
      const load = () => { this.voices = speechSynthesis.getVoices() || []; renderVoiceSelect(); };
      load();
      try { speechSynthesis.addEventListener('voiceschanged', load); } catch (e) { speechSynthesis.onvoiceschanged = load; }
      // Algunos navegadores tardan en cargar las voces.
      setTimeout(load, 800);
    },
    spanishVoices() { return this.voices.filter(v => /^es([-_]|$)/i.test(v.lang)); },
    pickVoice() {
      if (!this.voices.length) return null;
      if (settings.voiceURI) {
        const v = this.voices.find(x => x.voiceURI === settings.voiceURI);
        if (v) return v;
      }
      const es = this.spanishVoices();
      if (!es.length) return null;
      const nav = (navigator.language || '').toLowerCase().replace('_', '-');
      return es.find(v => v.lang.toLowerCase().replace('_', '-') === nav) || es.find(v => v.default) || es[0];
    },
    say(text, opts) {
      opts = opts || {};
      if (!text) return;
      if (!this.supported) { toast('Este navegador no tiene voz. Usa Chrome, Safari o Edge.'); return; }
      try {
        if (opts.scan && this.contentSpeaking) return;   // una etiqueta del barrido nunca corta una frase
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = this.pickVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'es'; }
        u.rate = opts.rate || settings.rate;
        u.pitch = 1;
        u.volume = opts.volume == null ? 1 : opts.volume;
        if (!opts.scan) {
          this.contentSpeaking = true;
          const done = () => { this.contentSpeaking = false; };
          u.onend = done; u.onerror = done;
          setTimeout(done, 8000);
        }
        speechSynthesis.speak(u);
      } catch (e) { console.warn('speech', e); }
    },
    stop() { if (this.supported) { try { speechSynthesis.cancel(); } catch (e) { /* nada */ } } }
  };

  function renderVoiceSelect() {
    const sel = $('#set-voice');
    const note = $('#voice-note');
    if (!sel) return;
    sel.innerHTML = '';
    if (!speech.supported) {
      sel.appendChild(el('option', { value: '', text: 'Sin voz disponible' }));
      note.textContent = 'Este navegador no puede leer en voz alta. Prueba con Chrome, Safari o Edge.';
      return;
    }
    const es = speech.spanishVoices();
    sel.appendChild(el('option', { value: '', text: es.length ? 'Automática (español)' : 'Predeterminada del dispositivo' }));
    es.forEach(v => sel.appendChild(el('option', { value: v.voiceURI, text: `${v.name} (${v.lang})` })));
    sel.value = settings.voiceURI && es.some(v => v.voiceURI === settings.voiceURI) ? settings.voiceURI : '';
    note.textContent = es.length
      ? `${es.length} voz${es.length === 1 ? '' : 'es'} en español en este dispositivo.`
      : 'No se encontraron voces en español. En Android, instala «Síntesis de voz de Google» y añade español; en iPhone/iPad, Ajustes → Accesibilidad → Contenido hablado → Voces.';
  }

  /* ---------------- Historial ---------------- */
  function addHistory(type, text, extra) {
    const entry = Object.assign({ t: new Date().toISOString(), type, text }, extra || {});
    history.push(entry);
    if (history.length > 600) history = history.slice(-600);
    store.set(KEYS.history, history);
    if (currentView === 'history') renderHistory();
  }

  const TYPE_LABEL = { answer: 'Respuesta', phrase: 'Frase', spell: 'Escrito', pain: 'Dolor', help: 'AYUDA' };
  function dayLabel(date) {
    const today = new Date(); const d = new Date(date);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (sameDay(d, today)) return 'Hoy';
    if (sameDay(d, yesterday)) return 'Ayer';
    return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function renderHistory() {
    const list = $('#history-list');
    list.innerHTML = '';
    $('#history-empty').hidden = history.length > 0;
    let lastDay = null;
    history.slice().reverse().forEach(h => {
      const day = dayLabel(h.t);
      if (day !== lastDay) { list.appendChild(el('li', { class: 'hist-day', text: day })); lastDay = day; }
      const time = new Date(h.t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      const textEl = el('div', { class: 'hist-text' });
      textEl.appendChild(el('span', { class: 'chip chip-' + h.type, text: TYPE_LABEL[h.type] || h.type }));
      textEl.appendChild(document.createTextNode(h.text));
      if (h.q) textEl.appendChild(el('span', { class: 'hist-q', text: 'Pregunta: ' + h.q }));
      list.appendChild(el('li', { class: 'hist-item' }, [el('span', { class: 'hist-time', text: time }), textEl]));
    });
  }
  function historyAsText() {
    return history.map(h => {
      const d = new Date(h.t);
      const stamp = d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      return `[${stamp}] ${TYPE_LABEL[h.type] || h.type}: ${h.text}${h.q ? ' (pregunta: ' + h.q + ')' : ''}`;
    }).join('\n');
  }
  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || 'Copiado');
    } catch (e) {
      // Alternativa: seleccionar en un área de texto temporal.
      const ta = el('textarea', { value: text, style: 'position:fixed;left:-9999px' });
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? (okMsg || 'Copiado') : 'No se pudo copiar automáticamente');
    }
  }

  /* ---------------- Navegación ---------------- */
  let currentView = 'home';
  function show(view) {
    const target = $('#view-' + view);
    if (!target) return;
    currentView = view;
    $$('.view').forEach(v => { v.hidden = v !== target; });
    $('#view-title').textContent = target.dataset.title || 'Talk Again';
    $('#views').scrollTop = 0;
    if (view === 'board') renderBoard();
    if (view === 'spell') renderSpell();
    if (view === 'pain') renderPain();
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSettings();
    scanner.refresh();
  }

  /* ---------------- Aviso de ayuda ---------------- */
  let audioCtx = null;
  function alarm() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      for (let i = 0; i < 6; i++) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.value = i % 2 ? 660 : 880;
        const t0 = now + i * 0.32;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.3);
      }
    } catch (e) { /* sin audio */ }
  }
  function help() {
    alarm();
    const flash = $('#flash');
    flash.hidden = false;
    setTimeout(() => { flash.hidden = true; }, 4000);
    speech.say('¡Necesito ayuda, por favor!');
    addHistory('help', '¡Necesito ayuda!');
    toast('Aviso de AYUDA');
  }

  /* ---------------- Barrido (escaneo) ---------------- */
  const scanner = {
    active: false,
    state: 'running',   // running | idle (pausa automática) | paused (pausa manual)
    timer: 0,
    suspendUntil: 0,
    activating: false,
    groups: [],
    level: 0, gi: 0, ii: 0, loops: 0,

    start() {
      this.active = true;
      this.state = 'running';
      document.body.classList.add('is-scanning');
      document.body.classList.toggle('select-screen', settings.scanSelect === 'screen');
      $('#scanbar').hidden = false;
      const b = $('#btn-scan'); b.setAttribute('aria-pressed', 'true'); b.textContent = '⏹ Barrido';
      $('#btn-scan-pause').textContent = '⏸ Pausa';
      this.refresh();
    },
    stop() {
      this.active = false;
      clearTimeout(this.timer);
      this.clearHl();
      document.body.classList.remove('is-scanning', 'select-screen');
      $('#scanbar').hidden = true;
      const b = $('#btn-scan'); b.setAttribute('aria-pressed', 'false'); b.textContent = '▶ Barrido';
    },
    toggle() { if (this.active) this.stop(); else this.start(); },
    status(msg) { $('#scan-status').textContent = msg; },
    clearHl() { $$('.scan-hl, .scan-group-hl').forEach(e => e.classList.remove('scan-hl', 'scan-group-hl')); },

    collect() {
      const view = $('#view-' + currentView);
      const visible = $$('[data-scan]', view).filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const explicit = new Map();
      const auto = [];
      visible.forEach(e => {
        const row = e.getAttribute('data-row');
        if (row != null) {
          const scope = e.closest('[data-scan-scope]');
          const key = (scope ? scope.id : '') + ':' + row;
          if (!explicit.has(key)) explicit.set(key, []);
          explicit.get(key).push(e);
        } else auto.push(e);
      });
      const top = e => e.getBoundingClientRect().top;
      const left = e => e.getBoundingClientRect().left;
      auto.sort((a, b) => top(a) - top(b));
      const rows = [];
      auto.forEach(e => {
        const last = rows[rows.length - 1];
        if (last && Math.abs(top(e) - top(last[0])) <= 12) last.push(e);
        else rows.push([e]);
      });
      explicit.forEach(items => rows.push(items));
      rows.forEach(r => r.sort((a, b) => left(a) - left(b)));
      rows.sort((a, b) => Math.min(...a.map(top)) - Math.min(...b.map(top)));
      // Si hay pocas opciones, barrido lineal sin filas.
      const total = rows.reduce((n, r) => n + r.length, 0);
      this.groups = (total <= 8 || rows.length === 1) ? [rows.flat()] : rows;
    },

    refresh() {
      if (!this.active) return;
      clearTimeout(this.timer);
      const wait = this.suspendUntil - Date.now();
      if (wait > 0) { this.timer = setTimeout(() => this.refresh(), wait); return; }
      this.clearHl();
      this.collect();
      this.level = this.groups.length === 1 ? 1 : 0;
      this.gi = 0; this.ii = 0; this.loops = 0;
      this.state = 'running';
      $('#btn-scan-pause').textContent = '⏸ Pausa';
      if (!this.groups.length || !this.groups[0].length) { this.status('No hay opciones que barrer en esta pantalla'); return; }
      this.step();
    },

    current() { return this.groups[this.gi] ? this.groups[this.gi][this.ii] : null; },

    step() {
      this.clearHl();
      if (this.level === 0) {
        const g = this.groups[this.gi];
        g.forEach(e => e.classList.add('scan-group-hl'));
        try { g[0].scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* nada */ }
        const label = `Fila ${this.gi + 1} de ${this.groups.length}`;
        this.status(label + ' · toca para entrar');
        if (settings.scanSpeak) speech.say(label, { scan: true, rate: Math.min(1.5, settings.rate + 0.25) });
      } else {
        const e = this.current();
        if (!e) { this.refresh(); return; }
        e.classList.add('scan-hl');
        try { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* nada */ }
        const label = labelOf(e);
        this.status(label);
        if (settings.scanSpeak) speech.say(label, { scan: true, rate: Math.min(1.5, settings.rate + 0.25) });
      }
      this.timer = setTimeout(() => this.advance(), settings.scanInterval * 1000);
    },

    advance(manual) {
      if (this.level === 0) {
        this.gi++;
        if (this.gi >= this.groups.length) { this.gi = 0; this.loops++; }
      } else {
        this.ii++;
        if (this.ii >= this.groups[this.gi].length) { this.ii = 0; this.loops++; }
      }
      if (!manual && this.loops >= Number(settings.scanLoops)) {
        this.idle();
        return;
      }
      this.step();
    },
    retreat() {
      if (this.level === 0) { this.gi = (this.gi - 1 + this.groups.length) % this.groups.length; }
      else { const n = this.groups[this.gi].length; this.ii = (this.ii - 1 + n) % n; }
      this.step();
    },
    idle() {
      this.state = 'idle';
      clearTimeout(this.timer);
      this.clearHl();
      this.status('En espera. Toca, pulsa o asiente para seguir.');
      speech.stop();
    },
    pauseToggle() {
      if (!this.active) return;
      if (this.state === 'paused') { this.resume(); return; }
      this.state = 'paused';
      clearTimeout(this.timer);
      this.clearHl();
      this.status('Pausado por el acompañante. La pantalla se usa de forma normal.');
      $('#btn-scan-pause').textContent = '▶ Seguir';
      speech.stop();
    },
    resume() {
      if (!this.active) return;
      this.state = 'running';
      this.loops = 0;
      $('#btn-scan-pause').textContent = '⏸ Pausa';
      this.collect();
      if (!this.groups.length || !this.groups[0].length) { this.status('No hay opciones que barrer en esta pantalla'); return; }
      this.level = this.groups.length === 1 ? 1 : 0;
      this.gi = Math.min(this.gi, this.groups.length - 1);
      this.ii = 0;
      this.step();
    },
    select() {
      if (!this.active || Date.now() < this.suspendUntil) return;
      if (this.state !== 'running') { this.resume(); return; }
      clearTimeout(this.timer);
      if (this.level === 0) {
        const g = this.groups[this.gi];
        if (g.length === 1) { this.activate(g[0]); return; }
        this.level = 1; this.ii = 0; this.loops = 0;
        this.step();
        return;
      }
      const e = this.current();
      if (e) this.activate(e);
    },
    activate(e) {
      this.clearHl();
      e.classList.add('scan-hl');
      this.suspendUntil = Date.now() + 1000;
      this.activating = true;
      try {
        if (typeof e.click === 'function') e.click();
        else e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } finally { this.activating = false; }
      this.refresh();
    },
    back() {
      if (!this.active || Date.now() < this.suspendUntil) return;
      clearTimeout(this.timer);
      if (this.state !== 'running') { this.resume(); return; }
      if (this.level === 1 && this.groups.length > 1) { this.level = 0; this.ii = 0; this.loops = 0; this.step(); }
      else if (currentView !== 'home') { show('home'); }
      else { this.loops = 0; this.step(); }
    },
    manualNext() { if (!this.active || Date.now() < this.suspendUntil) return; clearTimeout(this.timer); if (this.state !== 'running') { this.resume(); return; } this.advance(true); },
    manualPrev() { if (!this.active || Date.now() < this.suspendUntil) return; clearTimeout(this.timer); if (this.state !== 'running') { this.resume(); return; } this.retreat(); }
  };

  function labelOf(e) {
    return e.getAttribute('data-label') || e.getAttribute('aria-label') || (e.textContent || '').trim().replace(/\s+/g, ' ');
  }

  /* ---------------- Sí / No ---------------- */
  function answer(text, say, sourceEl) {
    const q = ($('#question-input').value || '').trim();
    speech.say(say || text);
    addHistory('answer', text, q ? { q } : {});
    flashEl(sourceEl || $(`[data-answer="${text}"]`));
    toast(text, 1800);
  }

  /* ---------------- Frases (tablero) ---------------- */
  let currentCat = D.categories[0].id;
  function categoryById(id) { return D.categories.find(c => c.id === id); }
  function itemsOf(catId) {
    const cat = categoryById(catId);
    if (!cat) return [];
    let items = Array.isArray(vocab[catId]) ? vocab[catId] : cat.items;
    if (catId === 'personas') {
      const names = (settings.people || '').split('\n').map(s => s.trim()).filter(Boolean)
        .map(n => ({ e: '👤', t: n, s: 'Quiero ver a ' + n }));
      items = names.concat(items);
    }
    return items;
  }
  function makeTile(item, k, extraAttrs) {
    const attrs = Object.assign({
      class: 'tile ' + (k || '') + (item.urgent ? ' is-urgent' : ''),
      type: 'button', 'data-scan': '', 'data-label': item.t, 'data-say': item.s || item.t
    }, extraAttrs || {});
    return el('button', attrs, [
      el('span', { class: 'tile-emoji', text: item.e || '💬' }),
      el('span', { class: 'tile-text', text: item.t })
    ]);
  }
  function renderBoard() {
    const strip = $('#board-cats');
    strip.innerHTML = '';
    D.categories.forEach(c => {
      strip.appendChild(el('button', {
        class: 'cat-btn ' + c.k + (c.id === currentCat ? ' is-active' : ''),
        type: 'button', 'data-scan': '', 'data-cat': c.id, 'data-label': c.name, text: `${c.emoji} ${c.name}`
      }));
    });
    const grid = $('#board-grid');
    grid.innerHTML = '';
    const cat = categoryById(currentCat);
    itemsOf(currentCat).forEach(item => { if (item.t) grid.appendChild(makeTile(item, cat.k)); });
  }

  /* ---------------- Deletrear ---------------- */
  let spellText = '';
  function renderSpell() { renderKeyboard(); renderOutput(); renderPredictions(); renderSaved(); }
  function renderOutput() {
    const out = $('#spell-output');
    out.textContent = spellText;
    if (spellText) out.appendChild(el('span', { class: 'caret' }));
  }
  function renderKeyboard() {
    const kb = $('#spell-keyboard');
    kb.innerHTML = '';
    kb.setAttribute('data-scan-scope', '');
    kb.id = 'spell-keyboard';
    const rows = D.keyboardRows[settings.keyboardOrder] || D.keyboardRows.abc;
    rows.forEach((row, ri) => {
      const r = el('div', { class: 'key-row' });
      row.forEach(ch => r.appendChild(el('button', {
        class: 'key', type: 'button', 'data-scan': '', 'data-row': String(ri), 'data-key': ch,
        'data-label': ch === '´' ? 'tilde' : ch, text: ch
      })));
      kb.appendChild(r);
    });
    const actions = el('div', { class: 'key-row key-row-actions' });
    [
      { a: 'space', t: '␣ Espacio', l: 'espacio' },
      { a: 'back', t: '⌫ Borrar', l: 'borrar letra' },
      { a: 'clear', t: '🗑 Borrar todo', l: 'borrar todo' },
      { a: 'speak', t: '🔊 Hablar', l: 'hablar', cls: ' key-speak' },
      { a: 'save', t: '💾 Guardar', l: 'guardar frase' }
    ].forEach(k => actions.appendChild(el('button', {
      class: 'key key-action' + (k.cls || ''), type: 'button', 'data-scan': '', 'data-row': String(rows.length),
      'data-action': k.a, 'data-label': k.l, text: k.t
    })));
    kb.appendChild(actions);
  }
  function currentWordPrefix() {
    const m = spellText.match(/([^\s]*)$/);
    return m ? m[1] : '';
  }
  function predictions(prefix) {
    const norm = s => stripAccents(s.toLowerCase());
    const p = norm(prefix);
    const seen = new Set();
    const out = [];
    const learnedSorted = Object.keys(learned).sort((a, b) => learned[b] - learned[a]);
    const pool = learnedSorted.concat(D.words);
    for (const w of pool) {
      const nw = norm(w);
      if (p && !nw.startsWith(p)) continue;
      if (!p && !(w in learned)) continue;        // sin prefijo: solo palabras que la persona ya usó
      if (nw === p || seen.has(nw)) continue;
      seen.add(nw);
      out.push(w);
      if (out.length >= 4) break;
    }
    return out;
  }
  function renderPredictions() {
    const row = $('#spell-predictions');
    row.innerHTML = '';
    predictions(currentWordPrefix()).forEach(w => row.appendChild(el('button', {
      class: 'pred-btn', type: 'button', 'data-scan': '', 'data-word': w, 'data-label': w, text: w
    })));
  }
  function renderSaved() {
    const row = $('#spell-saved');
    row.innerHTML = '';
    saved.forEach((s, i) => {
      const chip = el('span', { class: 'saved-chip' });
      chip.appendChild(el('button', { class: 'saved-say btn-plain', type: 'button', 'data-scan': '', 'data-saved': String(i), 'data-label': s, text: s, style: 'border:0;background:transparent;padding:0;font:inherit;color:inherit;text-align:left' }));
      chip.appendChild(el('button', { class: 'saved-del', type: 'button', 'data-del-saved': String(i), 'aria-label': 'Quitar frase guardada', text: '✕' }));
      row.appendChild(chip);
    });
  }
  function learnWords(text) {
    text.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-záéíóúüñ]/g, '')).filter(w => w.length >= 2).forEach(w => {
      learned[w] = (learned[w] || 0) + 1;
    });
    store.set(KEYS.words, learned);
  }
  function accentLast() {
    const map = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };
    const last = spellText.slice(-1);
    if (map[last]) spellText = spellText.slice(0, -1) + map[last];
  }
  function spellKey(ch) {
    if (ch === '´') { accentLast(); }
    else { spellText += ch.toLowerCase(); }
    renderOutput(); renderPredictions();
  }
  function spellAction(a) {
    if (a === 'space') { if (spellText && !spellText.endsWith(' ')) { learnWords(currentWordPrefix()); spellText += ' '; } }
    else if (a === 'back') { spellText = spellText.slice(0, -1); }
    else if (a === 'clear') { spellText = ''; }
    else if (a === 'speak') {
      const t = spellText.trim();
      if (!t) { toast('No hay nada escrito todavía'); return; }
      speech.say(t); addHistory('spell', t); learnWords(t);
    }
    else if (a === 'save') {
      const t = spellText.trim();
      if (!t) { toast('Escribe algo antes de guardar'); return; }
      if (!saved.includes(t)) { saved.push(t); store.set(KEYS.saved, saved); }
      toast('Frase guardada'); renderSaved();
    }
    renderOutput(); renderPredictions();
  }

  /* ---------------- Dolor ---------------- */
  let painSide = 'front', painPart = null;
  const BODY_ROWS = {
    cabeza: 0, nuca: 0, cuello: 0, cuello_atras: 0,
    pecho: 1, espalda_alta: 1, brazo_der: 1, brazo_izq: 1, brazo_izq_atras: 1, brazo_der_atras: 1,
    estomago: 2, espalda_baja: 2, pelvis: 2, gluteos: 2, mano_der: 2, mano_izq: 2, mano_izq_atras: 2, mano_der_atras: 2,
    pierna_der: 3, pierna_izq: 3, pierna_izq_atras: 3, pierna_der_atras: 3, pie_der: 3, pie_izq: 3, talon_izq: 3, talon_der: 3
  };
  function renderBodyMap() {
    const svg = $('#body-map');
    svg.innerHTML = '';
    svg.setAttribute('data-scan-scope', '');
    const ns = 'http://www.w3.org/2000/svg';
    ['front', 'back'].forEach(side => {
      const group = document.createElementNS(ns, 'g');
      group.setAttribute('data-side', side);
      group.style.display = side === painSide ? '' : 'none';
      D.body[side].forEach(p => {
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('data-scan', '');
        g.setAttribute('data-row', 'b' + (BODY_ROWS[p.id] != null ? BODY_ROWS[p.id] : 9));
        g.setAttribute('data-part', p.id);
        g.setAttribute('data-say', p.say);
        g.setAttribute('data-label', p.label);
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', p.label);
        if (p.id === painPart) g.classList.add('is-selected');
        let shape;
        if (p.shape === 'ellipse') {
          shape = document.createElementNS(ns, 'ellipse');
          shape.setAttribute('cx', p.cx); shape.setAttribute('cy', p.cy); shape.setAttribute('rx', p.rx); shape.setAttribute('ry', p.ry);
        } else {
          shape = document.createElementNS(ns, 'rect');
          shape.setAttribute('x', p.x); shape.setAttribute('y', p.y); shape.setAttribute('width', p.w); shape.setAttribute('height', p.h); shape.setAttribute('rx', p.r || 8);
        }
        shape.setAttribute('class', 'part');
        g.appendChild(shape);
        const label = document.createElementNS(ns, 'text');
        const cx = p.shape === 'ellipse' ? p.cx : p.x + p.w / 2;
        const cy = p.shape === 'ellipse' ? p.cy : p.y + p.h / 2;
        label.setAttribute('x', cx); label.setAttribute('y', cy + 4); label.setAttribute('text-anchor', 'middle');
        const words = p.label.split(' ');
        if (words.length > 1 && (p.w == null || p.w < 60)) {
          label.setAttribute('y', cy - 2);
          const t1 = document.createElementNS(ns, 'tspan'); t1.setAttribute('x', cx); t1.textContent = words[0];
          const t2 = document.createElementNS(ns, 'tspan'); t2.setAttribute('x', cx); t2.setAttribute('dy', '12'); t2.textContent = words.slice(1).join(' ');
          label.appendChild(t1); label.appendChild(t2);
        } else {
          label.textContent = p.label;
        }
        g.appendChild(label);
        group.appendChild(g);
      });
      svg.appendChild(group);
    });
    $$('.seg-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.side === painSide);
      b.setAttribute('data-scan', '');
      b.setAttribute('data-row', 'side');
      b.setAttribute('data-label', b.textContent.trim());
    });
  }
  function renderLevels() {
    const wrap = $('#pain-levels');
    wrap.innerHTML = '';
    for (let n = 0; n <= 10; n++) {
      wrap.appendChild(el('button', {
        class: 'level', type: 'button', 'data-scan': '', 'data-level': String(n), 'data-label': `dolor ${n}`
      }, [el('span', { class: 'level-face', text: D.painFaces[n] }), el('span', { text: String(n) })]));
    }
  }
  function renderQuick() {
    const wrap = $('#pain-quick');
    wrap.innerHTML = '';
    D.painQuick.forEach(item => wrap.appendChild(makeTile(item, 'k-health')));
  }
  function renderPain() { renderBodyMap(); renderLevels(); renderQuick(); }
  function partById(id) { return D.body.front.concat(D.body.back).find(p => p.id === id); }

  /* ---------------- Ajustes ---------------- */
  function applySettings() {
    document.documentElement.style.setProperty('--scale', String(settings.scale || 1));
    if (settings.theme === 'light' || settings.theme === 'dark') document.documentElement.setAttribute('data-theme', settings.theme);
    else document.documentElement.removeAttribute('data-theme');
    document.body.classList.toggle('select-screen', scanner.active && settings.scanSelect === 'screen');
  }
  function renderSettings() {
    renderVoiceSelect();
    $('#set-rate').value = settings.rate; $('#set-rate-out').textContent = Number(settings.rate).toFixed(2).replace('.', ',');
    $('#set-scale').value = String(settings.scale);
    $('#set-theme').value = settings.theme;
    const ko = $('#set-keyboard-order'); if (ko) ko.value = settings.keyboardOrder;
    $('#set-scan-interval').value = settings.scanInterval; $('#set-scan-interval-out').textContent = Number(settings.scanInterval).toFixed(1).replace('.', ',');
    $('#set-scan-loops').value = String(settings.scanLoops);
    $('#set-scan-select').value = settings.scanSelect;
    $('#set-scan-speak').checked = !!settings.scanSpeak;
    $('#set-scan-auto').checked = !!settings.scanAuto;
    $('#set-cam').checked = !!settings.cam;
    $('#set-cam-sens').value = settings.camSens; $('#set-cam-sens-out').textContent = sensLabel(settings.camSens);
    $('#set-cam-preview').checked = !!settings.camPreview;
    $('#set-people').value = settings.people || '';
    renderEditor();
    $('#backup-text').value = exportBackup();
  }
  function sensLabel(v) { v = Number(v); return v < 0.8 ? 'Baja (gestos amplios)' : v > 1.2 ? 'Alta (gestos pequeños)' : 'Media'; }

  function renderEditor() {
    const sel = $('#edit-cat');
    if (!sel.options.length) {
      D.categories.forEach(c => sel.appendChild(el('option', { value: c.id, text: `${c.emoji} ${c.name}` })));
    }
    const catId = sel.value || D.categories[0].id;
    sel.value = catId;
    const list = $('#edit-list');
    list.innerHTML = '';
    const cat = categoryById(catId);
    const items = Array.isArray(vocab[catId]) ? vocab[catId] : cat.items.map(i => Object.assign({}, i));
    items.forEach((item, i) => {
      const row = el('div', { class: 'edit-row' });
      row.appendChild(el('input', { class: 'edit-emoji', type: 'text', value: item.e || '', 'aria-label': 'Emoji', 'data-idx': String(i), 'data-field': 'e', maxLength: 8 }));
      row.appendChild(el('input', { class: 'edit-text', type: 'text', value: item.t || '', 'aria-label': 'Frase', 'data-idx': String(i), 'data-field': 't', placeholder: 'Frase' }));
      row.appendChild(el('button', { class: 'edit-del', type: 'button', 'data-del': String(i), 'aria-label': 'Quitar frase', text: '🗑' }));
      list.appendChild(row);
    });
  }
  function editableItems(catId) {
    if (!Array.isArray(vocab[catId])) vocab[catId] = categoryById(catId).items.map(i => Object.assign({}, i));
    return vocab[catId];
  }
  function saveVocab() { store.set(KEYS.vocab, vocab); }

  function exportBackup() {
    return JSON.stringify({ app: 'talk-again', v: 1, settings, vocab, words: learned, saved }, null, 0);
  }
  function importBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast('El texto no es una copia válida'); return false; }
    if (!data || data.app !== 'talk-again') { toast('El texto no es una copia de Talk Again'); return false; }
    settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    vocab = data.vocab && typeof data.vocab === 'object' ? data.vocab : {};
    learned = data.words && typeof data.words === 'object' ? data.words : {};
    saved = Array.isArray(data.saved) ? data.saved : [];
    saveSettings(); saveVocab(); store.set(KEYS.words, learned); store.set(KEYS.saved, saved);
    applySettings(); renderSettings();
    toast('Copia restaurada');
    return true;
  }

  /* ---------------- Cámara (gestos de cabeza) ---------------- */
  let gestureTimer = 0;
  function onGesture(g) {
    const panel = $('#cam-panel');
    panel.classList.add('is-gesture');
    clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => panel.classList.remove('is-gesture'), 900);
    if (currentView === 'yesno') { answer(g === 'yes' ? 'Sí' : 'No'); return; }
    if (scanner.active) { if (g === 'yes') scanner.select(); else scanner.back(); return; }
    answer(g === 'yes' ? 'Sí' : 'No');
  }
  function onCamStatus(state, msg, extra) {
    $('#cam-status').textContent = msg;
    const note = $('#cam-note');
    if (state === 'face' && extra && note) {
      note.textContent = `Cara detectada. Inclinación ${extra.pitch > 0 ? '+' : ''}${extra.pitch.toFixed(0)}°, giro ${extra.yaw > 0 ? '+' : ''}${extra.yaw.toFixed(0)}°. Asentir = Sí, negar = No.`;
    }
    if (state === 'error') {
      toast(msg, 6000);
      if (note) note.textContent = msg;
      $('#cam-panel').hidden = true;
      settings.cam = false; saveSettings();
      const cb = $('#set-cam'); if (cb) cb.checked = false;
    }
  }
  function startCamera(forcePreview) {
    if (!window.NodDetector) { toast('El detector de cámara no está disponible'); return; }
    const panel = $('#cam-panel');
    panel.hidden = false;
    panel.classList.toggle('is-hidden', !(settings.camPreview || forcePreview));
    window.NodDetector.start({
      video: $('#cam-video'),
      sensitivity: Number(settings.camSens) || 1,
      onGesture, onStatus: onCamStatus
    });
  }
  function stopCamera() {
    if (window.NodDetector) window.NodDetector.stop();
    $('#cam-panel').hidden = true;
    $('#cam-status').textContent = 'Cámara…';
  }

  /* ---------------- Eventos ---------------- */
  function bind() {
    $('#btn-home').addEventListener('click', () => show('home'));
    $('#btn-settings').addEventListener('click', () => show(currentView === 'settings' ? 'home' : 'settings'));
    $('#btn-help').addEventListener('click', help);
    $('#btn-scan').addEventListener('click', () => scanner.toggle());
    $('#btn-scan-select').addEventListener('click', () => scanner.select());
    $('#btn-scan-pause').addEventListener('click', () => scanner.pauseToggle());

    // Selección tocando la pantalla durante el barrido (fase de captura para adelantarse a los botones).
    $('#views').addEventListener('click', e => {
      if (!scanner.active || scanner.activating) return;
      if (currentView === 'settings' || scanner.state === 'paused') return;
      if (settings.scanSelect !== 'screen') return;
      if (e.target.closest('input, select, textarea, label, a')) return;
      e.preventDefault(); e.stopPropagation();
      scanner.select();
    }, true);

    document.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (scanner.active) {
        if (e.key === ' ' || e.key === 'Enter' || e.key === '1') { e.preventDefault(); scanner.select(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === '2') { e.preventDefault(); scanner.manualNext(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); scanner.manualPrev(); }
        else if (e.key === 'Escape') { e.preventDefault(); scanner.back(); }
        return;
      }
      if (currentView === 'yesno') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); answer('Sí', 'Sí'); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); answer('No', 'No'); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); answer('No sé', 'No sé'); }
      }
    });

    // Inicio
    $('#view-home').addEventListener('click', e => {
      const b = e.target.closest('[data-goto]');
      if (b) show(b.dataset.goto);
    });

    // Sí / No
    $('#view-yesno').addEventListener('click', e => {
      const b = e.target.closest('[data-answer]');
      if (b) answer(b.dataset.answer, b.dataset.say, b);
    });
    $('#btn-ask').addEventListener('click', () => {
      const q = $('#question-input').value.trim();
      if (q) speech.say(q); else toast('Escribe la pregunta primero');
    });
    $('#question-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#btn-ask').click(); } });

    // Frases
    $('#board-cats').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      currentCat = b.dataset.cat;
      renderBoard();
      scanner.refresh();
    });
    $('#board-grid').addEventListener('click', e => {
      const t = e.target.closest('.tile');
      if (!t) return;
      speech.say(t.dataset.say);
      addHistory('phrase', t.dataset.label);
      flashEl(t);
    });

    // Deletrear
    $('#spell-keyboard').addEventListener('click', e => {
      const k = e.target.closest('.key');
      if (!k) return;
      if (k.dataset.key) spellKey(k.dataset.key);
      else if (k.dataset.action) spellAction(k.dataset.action);
      scanner.refresh();
    });
    $('#spell-predictions').addEventListener('click', e => {
      const b = e.target.closest('[data-word]');
      if (!b) return;
      const prefix = currentWordPrefix();
      spellText = spellText.slice(0, spellText.length - prefix.length) + b.dataset.word + ' ';
      learnWords(b.dataset.word);
      renderOutput(); renderPredictions();
      scanner.refresh();
    });
    $('#spell-saved').addEventListener('click', e => {
      const del = e.target.closest('[data-del-saved]');
      if (del) { saved.splice(Number(del.dataset.delSaved), 1); store.set(KEYS.saved, saved); renderSaved(); scanner.refresh(); return; }
      const say = e.target.closest('[data-saved]');
      if (say) { const t = saved[Number(say.dataset.saved)]; speech.say(t); addHistory('spell', t); }
    });
    $('#btn-spell-speak-top').addEventListener('click', () => spellAction('speak'));

    // Dolor
    $('#view-pain').addEventListener('click', e => {
      const seg = e.target.closest('.seg-btn');
      if (seg) { painSide = seg.dataset.side; renderBodyMap(); scanner.refresh(); return; }
      const part = e.target.closest('[data-part]');
      if (part) {
        painPart = part.dataset.part;
        $$('#body-map [data-part]').forEach(g => g.classList.toggle('is-selected', g.dataset.part === painPart));
        const p = partById(painPart);
        $('#pain-selected').textContent = p ? p.say : '';
        speech.say(part.dataset.say);
        addHistory('pain', part.dataset.say);
        return;
      }
      const lvl = e.target.closest('.level');
      if (lvl) {
        const n = Number(lvl.dataset.level);
        $$('.level').forEach(l => l.classList.toggle('is-selected', l === lvl));
        const p = painPart ? partById(painPart) : null;
        const text = (p ? p.say + '. ' : '') + `El dolor es ${n} de 10`;
        speech.say(text);
        addHistory('pain', text);
        flashEl(lvl);
        return;
      }
      const tile = e.target.closest('#pain-quick .tile');
      if (tile) { speech.say(tile.dataset.say); addHistory('pain', tile.dataset.label); flashEl(tile); }
    });

    // Historial
    $('#btn-copy-history').addEventListener('click', () => {
      if (!history.length) { toast('El historial está vacío'); return; }
      copyText(historyAsText(), 'Historial copiado');
    });
    $('#btn-clear-history').addEventListener('click', () => { $('#history-confirm').hidden = false; });
    $('#btn-clear-no').addEventListener('click', () => { $('#history-confirm').hidden = true; });
    $('#btn-clear-yes').addEventListener('click', () => {
      history = []; store.set(KEYS.history, history);
      $('#history-confirm').hidden = true; renderHistory(); toast('Historial borrado');
    });

    // Ajustes
    const form = $('#settings-form');
    form.addEventListener('submit', e => e.preventDefault());
    $('#set-voice').addEventListener('change', e => { settings.voiceURI = e.target.value; saveSettings(); });
    $('#set-rate').addEventListener('input', e => { settings.rate = Number(e.target.value); $('#set-rate-out').textContent = settings.rate.toFixed(2).replace('.', ','); saveSettings(); });
    $('#btn-test-voice').addEventListener('click', () => speech.say('Hola, así sueno. Puedo decir sí, no, tengo sed, o cualquier frase del tablero.'));
    $('#set-scale').addEventListener('change', e => { settings.scale = e.target.value; saveSettings(); applySettings(); });
    $('#set-theme').addEventListener('change', e => { settings.theme = e.target.value; saveSettings(); applySettings(); });
    const ko = $('#set-keyboard-order');
    if (ko) ko.addEventListener('change', e => { settings.keyboardOrder = e.target.value; saveSettings(); });
    $('#set-scan-interval').addEventListener('input', e => { settings.scanInterval = Number(e.target.value); $('#set-scan-interval-out').textContent = settings.scanInterval.toFixed(1).replace('.', ','); saveSettings(); });
    $('#set-scan-loops').addEventListener('change', e => { settings.scanLoops = Number(e.target.value); saveSettings(); });
    $('#set-scan-select').addEventListener('change', e => { settings.scanSelect = e.target.value; saveSettings(); applySettings(); });
    $('#set-scan-speak').addEventListener('change', e => { settings.scanSpeak = e.target.checked; saveSettings(); });
    $('#set-scan-auto').addEventListener('change', e => { settings.scanAuto = e.target.checked; saveSettings(); });
    $('#set-cam').addEventListener('change', e => {
      settings.cam = e.target.checked; saveSettings();
      if (settings.cam) startCamera(); else stopCamera();
    });
    $('#set-cam-sens').addEventListener('input', e => {
      settings.camSens = Number(e.target.value); $('#set-cam-sens-out').textContent = sensLabel(settings.camSens); saveSettings();
      if (window.NodDetector) window.NodDetector.setSensitivity(settings.camSens);
    });
    $('#set-cam-preview').addEventListener('change', e => {
      settings.camPreview = e.target.checked; saveSettings();
      $('#cam-panel').classList.toggle('is-hidden', !settings.camPreview);
    });
    $('#btn-cam-test').addEventListener('click', () => {
      settings.cam = true; saveSettings(); $('#set-cam').checked = true;
      startCamera(true);
    });
    $('#cam-hide').addEventListener('click', () => {
      settings.camPreview = false; saveSettings();
      $('#set-cam-preview').checked = false;
      $('#cam-panel').classList.add('is-hidden');
    });
    $('#set-people').addEventListener('input', e => { settings.people = e.target.value; saveSettings(); });

    $('#edit-cat').addEventListener('change', renderEditor);
    $('#edit-list').addEventListener('input', e => {
      const inp = e.target.closest('input[data-idx]');
      if (!inp) return;
      const catId = $('#edit-cat').value;
      const items = editableItems(catId);
      const item = items[Number(inp.dataset.idx)];
      if (!item) return;
      item[inp.dataset.field] = inp.value;
      if (inp.dataset.field === 't') delete item.s;   // al cambiar el texto, se pronuncia lo que se ve
      saveVocab();
    });
    $('#edit-list').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      const catId = $('#edit-cat').value;
      editableItems(catId).splice(Number(del.dataset.del), 1);
      saveVocab(); renderEditor();
    });
    $('#btn-edit-add').addEventListener('click', () => {
      const catId = $('#edit-cat').value;
      editableItems(catId).push({ e: '💬', t: '' });
      saveVocab(); renderEditor();
      const inputs = $$('#edit-list .edit-text');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    $('#btn-edit-restore').addEventListener('click', () => {
      const catId = $('#edit-cat').value;
      delete vocab[catId]; saveVocab(); renderEditor(); toast('Categoría restaurada');
    });

    $('#btn-backup-copy').addEventListener('click', () => { const t = exportBackup(); $('#backup-text').value = t; copyText(t, 'Copia de seguridad copiada'); });
    $('#btn-backup-restore').addEventListener('click', () => importBackup($('#backup-text').value.trim()));
    $('#btn-reset-all').addEventListener('click', () => { $('#reset-confirm').hidden = false; });
    $('#btn-reset-no').addEventListener('click', () => { $('#reset-confirm').hidden = true; });
    $('#btn-reset-yes').addEventListener('click', () => {
      Object.values(KEYS).forEach(k => store.remove(k));
      location.reload();
    });
  }

  /* ---------------- Service worker (sin conexión) ---------------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    try { navigator.serviceWorker.register('sw.js').catch(() => { /* no disponible */ }); } catch (e) { /* nada */ }
  }

  /* ---------------- Arranque ---------------- */
  function init() {
    applySettings();
    speech.init();
    bind();
    $('#app-version').textContent = 'v' + D.version;
    if (window.TA_ARTIFACT) {
      // Vista previa publicada: sin cámara ni instalación; el resto funciona igual.
      const fs = $('#set-cam').closest('fieldset');
      fs.hidden = true;
      fs.insertAdjacentElement('afterend', el('p', { class: 'note', text: 'La detección con cámara y el uso sin conexión solo funcionan en la versión instalada desde GitHub Pages, no en esta vista previa.' }));
    }
    show('home');
    registerSW();
    if (settings.scanAuto) scanner.start();
    if (settings.cam) startCamera();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Para pruebas y depuración desde la consola.
  window.TalkAgain = {
    show, scanner, speech, answer, help,
    get settings() { return settings; },
    get history() { return history; },
    exportBackup, importBackup
  };
})();
