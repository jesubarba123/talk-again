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
    saved: 'talkagain.v1.saved',
    builder: 'talkagain.v1.builder'
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
    voiceURI: '', rate: 0.95, scale: '1.2', theme: 'dark', keyboardOrder: 'abc', gender: 'm', flashAlert: true,
    scanInterval: 3, scanLoops: 2, scanSelect: 'screen', scanSpeak: true, scanAuto: false,
    cam: false, camSens: 1, camPreview: true,
    touchMode: 'tap', dwellMs: 900, minTouchMs: 0, dragSpeak: true,
    people: ''
  };
  const NUM = { rate: [0.6, 1.3], scanInterval: [0.8, 8], scanLoops: [1, 5], camSens: [0.5, 1.5], dwellMs: [400, 2500], minTouchMs: [0, 0.8] };
  const ENUM = {
    theme: ['system', 'light', 'dark'], keyboardOrder: ['abc', 'frecuencia'], scanSelect: ['screen', 'button'],
    touchMode: ['tap', 'drag', 'dwell'], gender: ['m', 'f'], scale: ['1', '1.2', '1.4', '1.6']
  };
  function sanitizeSettings(raw) {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object') return s;
    Object.keys(DEFAULT_SETTINGS).forEach(k => {
      if (!(k in raw)) return;
      const v = raw[k];
      if (k in NUM) {
        const n = Number(v);
        s[k] = Number.isFinite(n) ? Math.min(NUM[k][1], Math.max(NUM[k][0], n)) : DEFAULT_SETTINGS[k];
      } else if (k in ENUM) {
        s[k] = ENUM[k].includes(String(v)) ? String(v) : DEFAULT_SETTINGS[k];
      } else if (typeof DEFAULT_SETTINGS[k] === 'boolean') {
        s[k] = !!v;
      } else if (typeof v === 'string') {
        s[k] = v;
      }
    });
    return s;
  }
  function sanitizeVocab(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    D.categories.forEach(c => {
      const list = raw[c.id];
      if (!Array.isArray(list)) return;
      out[c.id] = list.filter(i => i && typeof i === 'object' && typeof i.t === 'string').map(i => {
        const item = { e: typeof i.e === 'string' ? i.e.slice(0, 8) : '', t: i.t.slice(0, 120) };
        if (typeof i.s === 'string' && i.s.trim()) item.s = i.s.slice(0, 300);
        if (i.urgent) item.urgent = true;
        return item;
      });
    });
    return out;
  }
  let settings = sanitizeSettings(store.get(KEYS.settings, {}));
  let vocab = sanitizeVocab(store.get(KEYS.vocab, {}));   // { categoriaId: [items] } sobrescribe los valores por defecto
  let history = store.get(KEYS.history, []) || [];
  let learned = store.get(KEYS.words, {}) || {};          // palabra -> veces usada
  let saved = store.get(KEYS.saved, []) || [];            // frases guardadas
  let builderStats = store.get(KEYS.builder, {}) || {};   // uso de continuaciones en Armar frase
  if (!Array.isArray(history)) history = [];
  if (!Array.isArray(saved)) saved = [];

  const saveSettings = () => store.set(KEYS.settings, settings);
  const saveVocab = () => store.set(KEYS.vocab, vocab);

  /* ---------------- Utilidades ---------------- */
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), ms || 2500);
  }
  function flashEl(node) {
    if (!node) return;
    node.classList.add('is-flash');
    setTimeout(() => node.classList.remove('is-flash'), 450);
  }
  function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /* "{o}" → "o" u "a" según la persona */
  function gen(text) { return String(text || '').replace(/\{o\}/g, settings.gender === 'f' ? 'a' : 'o'); }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'style') node.setAttribute(k, attrs[k]);
      else if (k in node) node[k] = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }
  function peopleNames() {
    // "Mi esposa María" → "mi esposa María", para que suene bien dentro de la frase.
    return (settings.people || '').split('\n').map(s => s.trim()).filter(Boolean)
      .map(n => (/^mis?\s/i.test(n) ? n[0].toLowerCase() + n.slice(1) : n));
  }

  /* ---------------- Voz ---------------- */
  const speech = {
    supported: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    voices: [],
    utt: null,            // última locución (evita que el navegador la descarte y ata sus eventos)
    seq: 0,               // número de orden: una locución pendiente ya superada no se dice
    pendingTimer: 0,
    contentSpeaking: false,
    unlocked: false,
    init() {
      if (!this.supported) { renderVoiceSelect(); return; }
      const load = () => { this.refreshVoices(); renderVoiceSelect(); };
      load();
      try { speechSynthesis.addEventListener('voiceschanged', load); } catch (e) { speechSynthesis.onvoiceschanged = load; }
      setTimeout(load, 800);
      setTimeout(load, 3000);
    },
    refreshVoices() {
      try { const v = speechSynthesis.getVoices() || []; if (v.length) this.voices = v; } catch (e) { /* nada */ }
      return this.voices;
    },
    spanishVoices() {
      if (!this.voices.length) this.refreshVoices();
      return this.voices.filter(v => /^es([-_]|$)/i.test(v.lang));
    },
    pickVoice() {
      const es = this.spanishVoices();
      if (settings.voiceURI) {
        const chosen = this.voices.find(x => x.voiceURI === settings.voiceURI);
        if (chosen) return chosen;
      }
      if (!es.length) return null;
      const local = es.filter(v => v.localService !== false);   // las voces "de red" se quedan mudas sin internet
      const pool = local.length ? local : es;
      const nav = (navigator.language || '').toLowerCase().replace('_', '-');
      return pool.find(v => v.lang.toLowerCase().replace('_', '-') === nav) || pool.find(v => v.default) || pool[0];
    },
    /* iOS solo permite hablar tras un gesto real del usuario: el primero "desbloquea" la voz. */
    unlock() {
      if (this.unlocked || !this.supported) return;
      this.unlocked = true;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* nada */ }
    },
    say(text, opts) {
      opts = opts || {};
      if (!text) return;
      if (!this.supported) { if (!opts.scan) toast('Este navegador no tiene voz. Prueben con Chrome, Safari o Edge.'); return; }
      try {
        if (opts.scan && this.contentSpeaking) return;   // una etiqueta del barrido nunca corta una frase
        const u = new SpeechSynthesisUtterance(text);
        const v = this.pickVoice();
        const nav = (navigator.language || '').toLowerCase();
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = nav.startsWith('es') ? navigator.language : 'es-ES'; }
        u.rate = opts.rate || settings.rate;
        u.pitch = 1;
        u.volume = 1;
        this.utt = u;
        const seq = ++this.seq;
        clearTimeout(this.pendingTimer);
        if (!opts.scan) {
          this.contentSpeaking = true;
          const done = () => { if (this.utt === u) this.contentSpeaking = false; };
          u.onend = done; u.onerror = done;
          setTimeout(done, 8000);
        }
        const busy = speechSynthesis.speaking || speechSynthesis.pending;
        if (busy) speechSynthesis.cancel();
        const go = () => { if (seq === this.seq) { try { speechSynthesis.speak(u); } catch (e) { /* nada */ } } };
        // Hablar justo después de cancelar pierde la frase en Android: se espera un instante.
        if (busy) this.pendingTimer = setTimeout(go, 150); else go();
      } catch (e) { console.warn('speech', e); }
    },
    stop() {
      this.seq++;
      clearTimeout(this.pendingTimer);
      this.contentSpeaking = false;
      if (this.supported) { try { speechSynthesis.cancel(); } catch (e) { /* nada */ } }
    }
  };

  function renderVoiceSelect() {
    const sel = $('#set-voice');
    const note = $('#voice-note');
    if (!sel) return;
    sel.innerHTML = '';
    if (!speech.supported) {
      sel.appendChild(el('option', { value: '', text: 'Sin voz disponible' }));
      note.textContent = 'Este navegador no puede leer en voz alta. Prueben con Chrome, Safari o Edge.';
      return;
    }
    const es = speech.spanishVoices();
    sel.appendChild(el('option', { value: '', text: es.length ? 'Automática (español)' : 'Predeterminada del dispositivo' }));
    es.forEach(v => sel.appendChild(el('option', { value: v.voiceURI, text: `${v.name} (${v.lang})${v.localService === false ? ' — necesita internet' : ''}` })));
    sel.value = settings.voiceURI && es.some(v => v.voiceURI === settings.voiceURI) ? settings.voiceURI : '';
    note.textContent = es.length
      ? `${es.length} voz${es.length === 1 ? '' : 'es'} en español en este dispositivo.`
      : 'No se encontraron voces en español. En Android, instalen la app de voz de Google («Speech Recognition & Synthesis», antes «Síntesis de voz de Google») y agreguen español; en iPhone/iPad: Configuración → Accesibilidad → Contenido hablado → Voces → Español.';
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
    if (view === 'build') renderBuild();
    if (view === 'spell') renderSpell();
    if (view === 'pain') renderPain();
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSettings();
    touch.release();          // un dedo que sigue apoyado no elige nada en la pantalla nueva
    touch.apply();
    scanner.refresh();
    try { $('#view-title').focus({ preventScroll: true }); } catch (e) { /* nada */ }
  }

  /* ---------------- Aviso de ayuda ---------------- */
  let audioCtx = null;
  function alarm() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state !== 'running') audioCtx.resume();
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
    if (settings.flashAlert) {
      const flash = $('#flash');
      flash.hidden = false;
      setTimeout(() => { flash.hidden = true; }, 4000);
    }
    speech.say('¡Necesito ayuda, por favor!');
    addHistory('help', '¡Necesito ayuda!');
    toast('Aviso de AYUDA');
  }

  /* ---------------- Pantalla siempre encendida mientras se usa barrido o deslizar ---------------- */
  const wake = {
    lock: null, want: false,
    async request() {
      this.want = true;
      if (!('wakeLock' in navigator) || this.lock) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (!this.want) { try { lock.release(); } catch (e) { /* nada */ } return; }
        this.lock = lock;
        lock.addEventListener('release', () => { if (this.lock === lock) this.lock = null; });
      } catch (e) { this.lock = null; }
    },
    release() {
      this.want = false;
      if (this.lock) { try { this.lock.release(); } catch (e) { /* nada */ } this.lock = null; }
    }
  };
  function updateWake() {
    if (scanner.active || settings.touchMode !== 'tap') wake.request(); else wake.release();
  }

  /* ---------------- Barrido (escaneo) ---------------- */
  const scanner = {
    active: false,
    state: 'running',   // running | idle (pausa automática) | paused (pausa del acompañante)
    timer: 0,
    suspendUntil: 0,
    activating: false,
    groups: [],
    level: 0, gi: 0, ii: 0, loops: 0,

    start() {
      this.active = true;
      this.state = 'running';
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      document.body.classList.add('is-scanning');
      document.body.classList.toggle('select-screen', settings.scanSelect === 'screen');
      $('#scanbar').hidden = false;
      $('#scan-status').setAttribute('aria-live', settings.scanSpeak ? 'off' : 'polite');
      const b = $('#btn-scan'); b.setAttribute('aria-pressed', 'true'); b.textContent = '⏹ Barrido';
      $('#btn-scan-pause').textContent = '⏸ Pausa';
      touch.apply();
      updateWake();
      this.refresh();
    },
    stop() {
      this.active = false;
      clearTimeout(this.timer);
      this.clearHl();
      document.body.classList.remove('is-scanning', 'select-screen');
      $('#scanbar').hidden = true;
      const b = $('#btn-scan'); b.setAttribute('aria-pressed', 'false'); b.textContent = '▶ Barrido';
      touch.apply();
      updateWake();
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
      let rows = [];
      auto.forEach(e => {
        const last = rows[rows.length - 1];
        if (last && Math.abs(top(e) - top(last[0])) <= 12) last.push(e);
        else rows.push([e]);
      });
      rows.forEach(r => r.sort((a, b) => left(a) - left(b)));
      // En pantallas estrechas (una o dos fichas por fila) salen muchas filas y cada vuelta tarda mucho:
      // se juntan filas vecinas del mismo bloque en grupos de unas √N opciones.
      this.merged = false;
      if (rows.length > 6) {
        const count = visible.length;
        const per = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(count))));
        const merged = [];
        rows.forEach(r => {
          const last = merged[merged.length - 1];
          if (last && last.length + r.length <= per && last[0].parentElement === r[0].parentElement) { last.push(...r); this.merged = true; }
          else merged.push(r.slice());
        });
        rows = merged;
      }
      explicit.forEach(items => rows.push(items.slice().sort((a, b) => left(a) - left(b))));
      rows.sort((a, b) => Math.min(...a.map(top)) - Math.min(...b.map(top)));
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
      if (this.state === 'paused') return;     // la pausa del acompañante sobrevive a los cambios de pantalla
      this.level = this.groups.length === 1 ? 1 : 0;
      this.gi = 0; this.ii = 0; this.loops = 0;
      this.state = 'running';
      $('#btn-scan-pause').textContent = '⏸ Pausa';
      if (!this.groups.length || !this.groups[0].length) { this.status('No hay opciones en esta pantalla. Toca para volver al inicio.'); return; }
      this.step();
    },

    current() { return this.groups[this.gi] ? this.groups[this.gi][this.ii] : null; },

    step() {
      this.clearHl();
      if (this.level === 0) {
        const g = this.groups[this.gi];
        g.forEach(e => e.classList.add('scan-group-hl'));
        try { g[0].scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* nada */ }
        const label = `${this.merged ? 'Grupo' : 'Fila'} ${this.gi + 1} de ${this.groups.length}`;
        this.status(label + ' · toca para entrar');
        if (settings.scanSpeak) speech.say(label, { scan: true });
      } else {
        const e = this.current();
        if (!e) { this.refresh(); return; }
        e.classList.add('scan-hl');
        try { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* nada */ }
        const label = labelOf(e);
        this.status(label);
        if (settings.scanSpeak) speech.say(label, { scan: true });
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
      if (!manual && this.loops >= Number(settings.scanLoops)) { this.idle(); return; }
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
      this.status('En espera. Toca, presiona el pulsador o asiente para seguir.');
      speech.stop();
    },
    pauseToggle() {
      if (!this.active) return;
      if (this.state === 'paused') { this.resume(); return; }
      this.state = 'paused';
      clearTimeout(this.timer);
      this.clearHl();
      this.status('Pausado por el acompañante: la pantalla se usa de forma normal.');
      $('#btn-scan-pause').textContent = '▶ Seguir';
      speech.stop();
    },
    resume() {
      if (!this.active) return;
      this.state = 'running';
      this.loops = 0;
      $('#btn-scan-pause').textContent = '⏸ Pausa';
      updateWake();
      this.collect();
      if (!this.groups.length || !this.groups[0].length) { this.status('No hay opciones en esta pantalla. Toca para volver al inicio.'); return; }
      this.level = this.groups.length === 1 ? 1 : 0;
      this.gi = Math.min(this.gi, this.groups.length - 1);
      this.ii = 0;
      this.step();
    },
    select() {
      if (!this.active || Date.now() < this.suspendUntil) return;
      if (this.state !== 'running') { this.resume(); return; }
      if (!this.groups.length || !this.groups[0].length) { this.back(); return; }
      clearTimeout(this.timer);
      if (this.level === 0) {
        const g = this.groups[this.gi];
        if (g.length === 1) { this.activate(g[0]); return; }
        this.level = 1; this.ii = 0; this.loops = 0;
        this.suspendUntil = Date.now() + 400;   // un pulsador mantenido no elige la primera opción sin querer
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
    return e.getAttribute('data-label') || e.getAttribute('aria-label') || e.getAttribute('data-say') || (e.textContent || '').trim().replace(/\s+/g, ' ');
  }

  /* ---------------- Sí / No ---------------- */
  function answer(text, say, sourceEl) {
    const input = $('#question-input');
    const q = (input.value || '').trim();
    speech.say(say || text);
    addHistory('answer', text, q ? { q } : {});
    input.value = '';   // la pregunta no se arrastra a las respuestas siguientes
    flashEl(sourceEl || $(`[data-answer="${text}"]`));
    toast(text, 1800);
  }

  /* ---------------- Frases (tablero) ---------------- */
  let currentCat = D.categories[0].id;
  function categoryById(id) { return D.categories.find(c => c.id === id); }
  function itemsOf(catId) {
    const cat = categoryById(catId);
    if (!cat) return [];
    let items = (Array.isArray(vocab[catId]) ? vocab[catId] : cat.items).map(i => Object.assign({}, i, { t: gen(i.t), s: i.s ? gen(i.s) : undefined }));
    if (catId === 'personas') {
      const names = [];
      peopleNames().forEach(n => {
        names.push({ e: '👤', t: `Ver a ${n}`, s: `Quiero ver a ${n}` });
        names.push({ e: '📞', t: `Llamar a ${n}`, s: `Llamen a ${n}, por favor` });
      });
      items = names.concat(items);
    }
    return items;
  }
  function makeTile(item, k, extraAttrs) {
    const attrs = Object.assign({
      class: 'tile ' + (k || '') + (item.urgent ? ' is-urgent' : ''),
      type: 'button', 'data-scan': '', 'data-label': item.t, 'data-say': item.s || item.t
    }, extraAttrs || {});
    const children = [];
    if (item.e) children.push(el('span', { class: 'tile-emoji', 'aria-hidden': 'true', text: item.e }));
    children.push(el('span', { class: 'tile-text', text: item.t }));
    return el('button', attrs, children);
  }
  function renderBoard() {
    const strip = $('#board-cats');
    strip.innerHTML = '';
    D.categories.forEach(c => {
      const active = c.id === currentCat;
      strip.appendChild(el('button', {
        class: 'cat-btn ' + c.k + (active ? ' is-active' : ''),
        type: 'button', 'data-scan': '', 'data-cat': c.id, 'data-label': c.name, 'aria-pressed': active ? 'true' : 'false'
      }, [el('span', { 'aria-hidden': 'true', text: c.emoji + ' ' }), c.name]));
    });
    const grid = $('#board-grid');
    grid.innerHTML = '';
    const cat = categoryById(currentCat);
    itemsOf(currentCat).forEach(item => { if (item.t) grid.appendChild(makeTile(item, cat.k)); });
  }

  /* ---------------- Armar frase ---------------- */
  const build = { start: null, next: null, mods: [] };
  function builderNexts(start) {
    let list = start.next.map(gen);
    if (start.people) list = peopleNames().concat(list);
    const stats = builderStats[start.t] || {};
    return list.map((t, i) => ({ t, i, n: stats[t] || 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.t);
  }
  function buildSentence() {
    if (!build.start) return '';
    let s = build.start.t;
    if (build.next) s += ' ' + build.next;
    if (build.mods.length) {
      const q = s.endsWith('?');
      if (q) s = s.slice(0, -1);
      const rest = build.mods.filter(m => m !== 'por favor');
      if (rest.length) s += ' ' + rest.join(' ');
      if (build.mods.includes('por favor')) s += ', por favor';   // dentro de los signos de pregunta: "¿Puedo beber, por favor?"
      if (q) s += '?';
    }
    return s.replace(/\ba el\b/g, 'al');
  }
  function renderBuild() {
    $('#build-sentence').textContent = buildSentence();
    $('#build-step-1').hidden = !!build.start;
    $('#build-step-2').hidden = !build.start || !!build.next;
    $('#build-step-3').hidden = !build.next;
    const starts = $('#build-starts');
    starts.innerHTML = '';
    D.builder.starts.forEach((s, i) => starts.appendChild(makeTile({ e: s.e, t: s.t }, 'k-action', { 'data-start': String(i) })));
    const nexts = $('#build-nexts');
    nexts.innerHTML = '';
    if (build.start) {
      $('#build-step-2-title').textContent = `2. ${build.start.t}…`;
      builderNexts(build.start).forEach(t => nexts.appendChild(makeTile({ t }, 'k-thing', { 'data-next': t, class: 'tile tile-textonly k-thing' })));
    }
    const mods = $('#build-mods');
    mods.innerHTML = '';
    D.builder.modifiers.forEach(m => mods.appendChild(makeTile({ t: m }, 'k-feel', {
      'data-mod': m, class: 'tile tile-textonly k-feel' + (build.mods.includes(m) ? ' is-selected' : ''),
      'aria-pressed': build.mods.includes(m) ? 'true' : 'false'
    })));
  }
  function buildSpeak() {
    const s = buildSentence();
    if (!s || !build.next) { toast('Elige el comienzo y la continuación'); return; }
    speech.say(s);
    addHistory('phrase', s);
  }
  function buildReset() { build.start = null; build.next = null; build.mods = []; renderBuild(); }

  /* ---------------- Tacto: deslizar para elegir ---------------- */
  const touch = {
    pointerId: null, startAt: 0, lastDuration: 0, current: null, dwellTimer: 0, activating: false, needsLift: false,
    enabled() { return settings.touchMode !== 'tap' && !scanner.active && currentView !== 'settings'; },
    apply() {
      const on = settings.touchMode !== 'tap' && !scanner.active && currentView !== 'settings';
      document.body.classList.toggle('touch-drag', on);
      $('#dragbar').hidden = !on;
      document.documentElement.style.setProperty('--dwell-ms', Math.round(settings.dwellMs) + 'ms');
      if (on) this.status(''); else this.release();
    },
    status(txt) {
      $('#drag-status').textContent = txt || (settings.touchMode === 'dwell'
        ? 'Desliza el dedo y déjalo quieto sobre la opción'
        : 'Desliza el dedo y suelta sobre la opción');
    },
    targetAt(x, y) {
      const e = document.elementFromPoint(x, y);
      if (!e) return null;
      const t = e.closest('[data-scan]');
      return t && $('#views').contains(t) ? t : null;
    },
    down(e) {
      if (!e.isPrimary) return;
      this.startAt = performance.now();
      if (!this.enabled() || currentView === 'settings') return;
      // Los botones normales (Copiar, Leer, ✕…) siguen funcionando con un toque corriente.
      if (e.target.closest('input, select, textarea, label, a, summary, button:not([data-scan])')) return;
      this.pointerId = e.pointerId;
      this.needsLift = false;
      try { $('#views').setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      this.enter(this.targetAt(e.clientX, e.clientY));
    },
    move(e) {
      if (this.pointerId !== e.pointerId || this.needsLift) return;
      const t = this.targetAt(e.clientX, e.clientY);
      if (t !== this.current) this.enter(t);
    },
    enter(t) {
      clearTimeout(this.dwellTimer);
      if (this.current) this.current.classList.remove('drag-hl', 'dwell-anim');
      this.current = t;
      if (!t) { this.status(''); return; }
      t.classList.add('drag-hl');
      const label = labelOf(t);
      this.status(label);
      if (settings.dragSpeak) speech.say(label, { scan: true });
      if (settings.touchMode === 'dwell') {
        t.classList.add('dwell-anim');
        this.dwellTimer = setTimeout(() => { t.classList.remove('dwell-anim'); this.fire(t); }, settings.dwellMs);
      }
    },
    up(e) {
      if (e.isPrimary) this.lastDuration = performance.now() - this.startAt;
      if (this.pointerId !== e.pointerId) return;
      const t = this.current;
      const dur = this.lastDuration;
      const lifted = this.needsLift;
      this.release();
      if (settings.touchMode === 'drag' && t && !lifted && dur >= settings.minTouchMs * 1000) this.fire(t);
    },
    cancel(e) { if (this.pointerId === e.pointerId) this.release(); },
    release() {
      clearTimeout(this.dwellTimer);
      if (this.current) this.current.classList.remove('drag-hl', 'dwell-anim');
      this.current = null;
      this.pointerId = null;
      this.needsLift = false;
      if (settings.touchMode !== 'tap') this.status('');
    },
    fire(t) {
      flashEl(t);
      if (settings.touchMode === 'dwell') this.needsLift = true;   // hasta levantar el dedo no se elige otra cosa
      this.activating = true;
      try {
        if (typeof t.click === 'function') t.click();
        else t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } finally { this.activating = false; }
    }
  };

  /* ---------------- Deletrear ---------------- */
  let spellText = '';
  function renderSpell() { renderKeyboard(); renderOutput(); renderPredictions(); renderSaved(); }
  function renderOutput() {
    const out = $('#spell-output');
    out.textContent = spellText;
    if (spellText) out.appendChild(el('span', { class: 'caret', 'aria-hidden': 'true' }));
  }
  function keyboardRows() {
    const letters = D.keyboardOrder[settings.keyboardOrder] || D.keyboardOrder.abc;
    const per = window.innerWidth < 560 ? 5 : 7;   // teclas más grandes en teléfono
    const rows = [];
    for (let i = 0; i < letters.length; i += per) rows.push(letters.slice(i, i + per));
    return { rows, per };
  }
  function renderKeyboard() {
    const kb = $('#spell-keyboard');
    kb.innerHTML = '';
    kb.setAttribute('data-scan-scope', '');
    const { rows, per } = keyboardRows();
    rows.forEach((row, ri) => {
      const r = el('div', { class: 'key-row', style: `--cols: ${per}` });
      row.forEach(ch => {
        const key = el('button', {
          class: 'key', type: 'button', 'data-scan': '', 'data-row': String(ri), 'data-key': ch,
          'data-label': ch === '´' ? 'tilde' : ch
        }, ch === '´' ? [el('span', { text: '´' }), el('span', { class: 'key-sub', 'aria-hidden': 'true', text: 'tilde' })] : [ch]);
        r.appendChild(key);
      });
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
      chip.appendChild(el('button', { class: 'saved-say', type: 'button', 'data-scan': '', 'data-saved': String(i), 'data-label': s, text: s }));
      chip.appendChild(el('button', { class: 'saved-del', type: 'button', 'data-del-saved': String(i), 'aria-label': 'Quitar la frase guardada ' + s, text: '✕' }));
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
    const map = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
    const last = spellText.slice(-1);
    if (map[last]) spellText = spellText.slice(0, -1) + map[last];
  }
  function announce(text) { const sr = $('#spell-sr'); if (sr) sr.textContent = text; }
  function spellKey(ch) {
    if (ch === '´') { accentLast(); announce('tilde'); }
    else { spellText += ch.toLowerCase(); announce(ch); }
    renderOutput(); renderPredictions();
  }
  function spellAction(a) {
    if (a === 'space') { if (spellText && !spellText.endsWith(' ')) { learnWords(currentWordPrefix()); spellText += ' '; announce('espacio'); } }
    else if (a === 'back') { spellText = spellText.slice(0, -1); announce('borrar'); }
    else if (a === 'clear') { spellText = ''; announce('borrado todo'); }
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
    hombro_der: 1, hombro_izq: 1, hombro_izq_atras: 1, hombro_der_atras: 1,
    pecho: 1, espalda_alta: 1, brazo_der: 1, brazo_izq: 1, brazo_izq_atras: 1, brazo_der_atras: 1,
    estomago: 2, espalda_baja: 2, pelvis: 2, gluteos: 2, mano_der: 2, mano_izq: 2, mano_izq_atras: 2, mano_der_atras: 2,
    pierna_der: 3, pierna_izq: 3, pierna_izq_atras: 3, pierna_der_atras: 3, pie_der: 3, pie_izq: 3, talon_izq: 3, talon_der: 3
  };
  function svgShape(ns, p, pad, cls) {
    let shape;
    if (p.shape === 'ellipse') {
      shape = document.createElementNS(ns, 'ellipse');
      shape.setAttribute('cx', p.cx); shape.setAttribute('cy', p.cy); shape.setAttribute('rx', p.rx + pad); shape.setAttribute('ry', p.ry + pad);
    } else {
      shape = document.createElementNS(ns, 'rect');
      shape.setAttribute('x', p.x - pad); shape.setAttribute('y', p.y - pad); shape.setAttribute('width', p.w + pad * 2); shape.setAttribute('height', p.h + pad * 2); shape.setAttribute('rx', (p.r || 8) + pad);
    }
    shape.setAttribute('class', cls);
    return shape;
  }
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
        g.setAttribute('data-label', p.spoken || p.label);
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', p.spoken || p.label);
        g.setAttribute('aria-pressed', p.id === painPart ? 'true' : 'false');
        if (p.id === painPart) g.classList.add('is-selected');
        const small = p.shape === 'ellipse' ? p.rx < 26 : p.w < 50;   // zonas pequeñas: letra más pequeña
        if (small) g.classList.add('small');
        g.dataset.inner = String((p.shape === 'ellipse' ? 2 * p.rx : p.w) - 9);   // ancho útil para la etiqueta (sin el trazo)
        g.appendChild(svgShape(ns, p, 7, 'hit'));    // zona de toque ampliada (invisible)
        g.appendChild(svgShape(ns, p, 0, 'part'));
        const label = document.createElementNS(ns, 'text');
        const cx = p.shape === 'ellipse' ? p.cx : p.x + p.w / 2;
        const cy = p.shape === 'ellipse' ? p.cy : p.y + p.h / 2;
        label.setAttribute('x', cx); label.setAttribute('y', cy + 4.5); label.setAttribute('text-anchor', 'middle');
        const words = p.label.split(' ');
        const narrow = p.shape === 'ellipse' ? p.rx < 30 : p.w < 90;
        if (words.length > 1 && narrow) {
          label.setAttribute('y', cy - 2);
          const t1 = document.createElementNS(ns, 'tspan'); t1.setAttribute('x', cx); t1.textContent = words[0];
          const t2 = document.createElementNS(ns, 'tspan'); t2.setAttribute('x', cx); t2.setAttribute('dy', '14'); t2.textContent = words.slice(1).join(' ');
          label.appendChild(t1); label.appendChild(t2);
        } else {
          label.textContent = p.label;
        }
        g.appendChild(label);
        group.appendChild(g);
      });
      svg.appendChild(group);
    });
    $$('.seg-btn[data-side]').forEach(b => {
      const active = b.dataset.side === painSide;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.setAttribute('data-scan', '');
      b.setAttribute('data-row', 'side');
      b.setAttribute('data-label', b.textContent.trim());
    });
    fitBodyLabels();
  }

  /* Si una etiqueta del mapa es más ancha que su zona (otra tipografía, sin conexión…), se comprime
     con textLength para que no pise el contorno. Se mide con un canvas para cubrir también el lado oculto. */
  function fitBodyLabels() {
    const svg = $('#body-map');
    if (!svg) return;
    let ctx = null;
    try { ctx = document.createElement('canvas').getContext('2d'); } catch (e) { /* nada */ }
    if (!ctx) return;
    $$('g[data-part]', svg).forEach(g => {
      const inner = Number(g.dataset.inner || 0);
      const label = g.querySelector('text');
      if (!inner || !label) return;
      const cs = getComputedStyle(label);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const spans = label.querySelectorAll('tspan');
      (spans.length ? Array.from(spans) : [label]).forEach(t => {
        const w = ctx.measureText(t.textContent).width;
        if (w > inner) { t.setAttribute('textLength', String(inner)); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
        else { t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust'); }
      });
    });
  }
  function renderLevels() {
    const wrap = $('#pain-levels');
    wrap.innerHTML = '';
    for (let n = 0; n <= 10; n++) {
      wrap.appendChild(el('button', {
        class: 'level', type: 'button', 'data-scan': '', 'data-level': String(n), 'data-label': `dolor ${n}, ${D.painLabels[n]}`, 'aria-pressed': 'false'
      }, [el('span', { class: 'level-face', 'aria-hidden': 'true', text: D.painFaces[n] }), el('span', { text: String(n) })]));
    }
  }
  function renderQuick() {
    const wrap = $('#pain-quick');
    wrap.innerHTML = '';
    D.painQuick.forEach(item => wrap.appendChild(makeTile(Object.assign({}, item, { t: gen(item.t), s: item.s ? gen(item.s) : undefined }), 'k-health')));
  }
  function renderPain() { renderBodyMap(); renderLevels(); renderQuick(); }
  function partById(id) { return D.body.front.concat(D.body.back).find(p => p.id === id); }

  /* ---------------- Ajustes ---------------- */
  function applySettings() {
    document.documentElement.style.setProperty('--scale', String(settings.scale || 1));
    if (settings.theme === 'light' || settings.theme === 'dark') document.documentElement.setAttribute('data-theme', settings.theme);
    else document.documentElement.removeAttribute('data-theme');
    document.body.classList.toggle('select-screen', scanner.active && settings.scanSelect === 'screen');
    touch.apply();
    updateWake();
  }
  function rateLabel(r) {
    r = Number(r);
    return r < 0.75 ? 'Muy lenta' : r < 0.9 ? 'Lenta' : r <= 1.05 ? 'Normal' : r <= 1.2 ? 'Rápida' : 'Muy rápida';
  }
  function minTouchLabel(v) { v = Number(v); return v > 0 ? v.toFixed(2).replace('.', ',') + ' s' : 'Desactivado'; }
  function sensLabel(v) { v = Number(v); return v < 0.8 ? 'Baja (gestos amplios)' : v > 1.2 ? 'Alta (gestos pequeños)' : 'Media'; }
  function renderSettings() {
    renderVoiceSelect();
    $('#set-rate').value = settings.rate; $('#set-rate-out').textContent = rateLabel(settings.rate);
    $('#set-scale').value = String(settings.scale);
    $('#set-theme').value = settings.theme;
    $$('[data-gender]').forEach(b => {
      const on = b.dataset.gender === settings.gender;
      b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('#set-keyboard-order').value = settings.keyboardOrder;
    $('#set-flash').checked = !!settings.flashAlert;
    $('#set-touch-mode').value = settings.touchMode;
    $('#set-dwell').value = settings.dwellMs / 1000; $('#set-dwell-out').textContent = (settings.dwellMs / 1000).toFixed(1).replace('.', ',');
    $('#set-min-touch').value = settings.minTouchMs; $('#set-min-touch-out').textContent = minTouchLabel(settings.minTouchMs);
    $('#set-drag-speak').checked = !!settings.dragSpeak;
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
      row.appendChild(el('input', { class: 'edit-text', type: 'text', value: editText(item.t), 'aria-label': 'Texto del botón', 'data-idx': String(i), 'data-field': 't', placeholder: 'Texto del botón' }));
      const tools = el('div', { class: 'edit-tools' });
      tools.appendChild(el('button', { type: 'button', 'data-move': 'up', 'data-idx': String(i), 'aria-label': 'Subir', text: '↑', disabled: i === 0 }));
      tools.appendChild(el('button', { type: 'button', 'data-move': 'down', 'data-idx': String(i), 'aria-label': 'Bajar', text: '↓', disabled: i === items.length - 1 }));
      tools.appendChild(el('button', { type: 'button', 'data-del': String(i), 'aria-label': 'Quitar frase', text: '🗑' }));
      row.appendChild(tools);
      row.appendChild(el('input', { class: 'edit-say', type: 'text', value: editText(item.s), 'aria-label': 'Lo que se dice', 'data-idx': String(i), 'data-field': 's', placeholder: 'Lo que se dice (opcional)' }));
      list.appendChild(row);
    });
  }
  // En el editor, "{o}" se muestra como "o/a" (enojado/a) y al guardar vuelve a ser "{o}".
  function editText(t) { return String(t || '').replace(/\{o\}/g, 'o/a'); }
  function storeText(t) { return String(t || '').replace(/o\/a\b/g, '{o}'); }
  function editableItems(catId) {
    if (!Array.isArray(vocab[catId])) vocab[catId] = categoryById(catId).items.map(i => Object.assign({}, i));
    return vocab[catId];
  }

  function exportBackup() {
    return JSON.stringify({ app: 'talk-again', v: 1, settings, vocab, words: learned, saved, builder: builderStats }, null, 0);
  }
  function importBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast('El texto no es una copia válida'); return false; }
    if (!data || data.app !== 'talk-again') { toast('El texto no es una copia de Talk Again'); return false; }
    settings = sanitizeSettings(data.settings);
    vocab = sanitizeVocab(data.vocab);
    learned = data.words && typeof data.words === 'object' && !Array.isArray(data.words) ? data.words : {};
    saved = Array.isArray(data.saved) ? data.saved.filter(s => typeof s === 'string') : [];
    builderStats = data.builder && typeof data.builder === 'object' && !Array.isArray(data.builder) ? data.builder : {};
    saveSettings(); saveVocab(); store.set(KEYS.words, learned); store.set(KEYS.saved, saved); store.set(KEYS.builder, builderStats);
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
    // En las demás pantallas un gesto no dice nada: evita respuestas falsas al mirar alrededor.
  }
  function onCamStatus(state, msg, extra) {
    $('#cam-status').textContent = msg;
    const note = $('#cam-note');
    if (state === 'face' && extra && note) {
      note.textContent = `Cara detectada. Asentir = Sí, negar = No (solo en Sí / No y durante el barrido). Movimiento arriba/abajo: ${extra.pitch > 0 ? '+' : ''}${extra.pitch.toFixed(0)}°, izquierda/derecha: ${extra.yaw > 0 ? '+' : ''}${extra.yaw.toFixed(0)}°.`;
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
  let lastHit = { el: null, t: 0 };
  function bind() {
    $('#btn-home').addEventListener('click', () => show('home'));
    $('#btn-settings').addEventListener('click', () => show(currentView === 'settings' ? 'home' : 'settings'));
    $('#btn-scan').addEventListener('click', () => scanner.toggle());
    $('#btn-scan-select').addEventListener('click', () => scanner.select());
    $('#btn-scan-pause').addEventListener('click', () => scanner.pauseToggle());

    // AYUDA: mantener presionado medio segundo (evita alarmas por un roce). Teclado y barrido la activan directamente.
    const helpBtn = $('#btn-help');
    const HOLD_MS = 600;
    let holdTimer = 0, cooling = false;
    const fireHelp = () => {
      if (cooling) return;
      cooling = true; helpBtn.classList.add('is-cooling');
      setTimeout(() => { cooling = false; helpBtn.classList.remove('is-cooling'); }, 1500);
      help();
    };
    const cancelHold = () => { clearTimeout(holdTimer); helpBtn.classList.remove('is-holding'); };
    helpBtn.style.setProperty('--hold-ms', HOLD_MS + 'ms');
    helpBtn.addEventListener('pointerdown', e => {
      if (cooling || (e.pointerType === 'mouse' && e.button !== 0)) return;
      helpBtn.classList.add('is-holding');
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { cancelHold(); fireHelp(); }, HOLD_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => helpBtn.addEventListener(t, cancelHold));
    helpBtn.addEventListener('click', e => { if (e.detail === 0) fireHelp(); });

    // Con el barrido en modo "tocar cualquier parte", la cabecera también elige (salvo ⏹ Barrido y AYUDA).
    $('.topbar').addEventListener('click', e => {
      if (!scanner.active || scanner.state !== 'running' || settings.scanSelect !== 'screen' || !e.isTrusted) return;
      if (e.target.closest('#btn-scan, #btn-help')) return;
      e.preventDefault(); e.stopPropagation();
      scanner.select();
    }, true);

    // Clicks dentro de la zona central (fase de captura para adelantarse a los botones).
    $('#views').addEventListener('click', e => {
      if (scanner.activating || touch.activating) return;
      const item = e.target.closest('[data-scan]');
      const real = e.isTrusted && e.detail !== 0;   // ni teclado ni click sintético
      if (item && real && !scanner.active && currentView !== 'settings' && !e.target.closest('input, select, textarea, label, a')) {
        // Al deslizar, elige el controlador táctil, no el click del navegador.
        if (settings.touchMode !== 'tap') { e.preventDefault(); e.stopPropagation(); return; }
        // Roces demasiado cortos se ignoran.
        if (settings.minTouchMs > 0 && touch.lastDuration < settings.minTouchMs * 1000) { e.preventDefault(); e.stopPropagation(); return; }
        // Un doble toque por temblor no repite la frase.
        const now = performance.now();
        if (!item.classList.contains('key') && lastHit.el === item && now - lastHit.t < 400) { e.preventDefault(); e.stopPropagation(); return; }
        lastHit = { el: item, t: now };
      }
      if (!scanner.active || !e.isTrusted) return;
      if (currentView === 'settings' || scanner.state === 'paused') return;
      if (settings.scanSelect !== 'screen') return;
      if (e.target.closest('input, select, textarea, label, a, .question-row')) return;
      e.preventDefault(); e.stopPropagation();
      scanner.select();
    }, true);

    document.addEventListener('keydown', e => {
      if (e.repeat) return;   // un pulsador mantenido no dispara varias veces
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

    // Desbloqueo de la voz y del sonido con el primer gesto real (iOS, Chrome).
    ['touchend', 'pointerup', 'keydown', 'click'].forEach(t => document.addEventListener(t, () => {
      speech.unlock();
      if (audioCtx && audioCtx.state !== 'running') { try { audioCtx.resume(); } catch (e) { /* nada */ } }
    }, { capture: true, passive: true }));

    // Al pasar a segundo plano se para la voz y el barrido espera; al volver, la voz se reinicia.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        speech.stop();
        if (scanner.active && scanner.state === 'running') scanner.idle();
      } else {
        try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch (e) { /* nada */ }
        speech.contentSpeaking = false;
        updateWake();
      }
    });
    // iOS deja la página desplazada al cerrar el teclado.
    document.addEventListener('focusout', () => setTimeout(() => window.scrollTo(0, 0), 50));
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (currentView === 'spell') { renderKeyboard(); scanner.refresh(); } }, 200);
    });

    // Deslizar para elegir
    const views = $('#views');
    views.addEventListener('pointerdown', e => touch.down(e));
    views.addEventListener('pointermove', e => touch.move(e));
    views.addEventListener('pointerup', e => touch.up(e));
    views.addEventListener('pointercancel', e => touch.cancel(e));
    $('#btn-drag-up').addEventListener('click', () => views.scrollBy({ top: -views.clientHeight * 0.7, behavior: 'smooth' }));
    $('#btn-drag-down').addEventListener('click', () => views.scrollBy({ top: views.clientHeight * 0.7, behavior: 'smooth' }));

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
    const readQuestion = () => {
      const q = $('#question-input').value.trim();
      if (q) speech.say(q); else toast('Escribe la pregunta primero');
    };
    $('#btn-ask').addEventListener('click', readQuestion);
    $('#question-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); readQuestion(); } });

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

    // Armar frase
    $('#view-build').addEventListener('click', e => {
      const st = e.target.closest('[data-start]');
      if (st) {
        build.start = D.builder.starts[Number(st.dataset.start)]; build.next = null; build.mods = [];
        renderBuild(); speech.say(build.start.t); scanner.refresh(); return;
      }
      const nx = e.target.closest('[data-next]');
      if (nx && build.start) {
        build.next = nx.dataset.next;
        const key = build.start.t;
        builderStats[key] = builderStats[key] || {};
        builderStats[key][build.next] = (builderStats[key][build.next] || 0) + 1;
        store.set(KEYS.builder, builderStats);
        renderBuild(); buildSpeak(); scanner.refresh(); return;
      }
      const md = e.target.closest('[data-mod]');
      if (md && build.next) {
        const m = md.dataset.mod;
        const i = build.mods.indexOf(m);
        if (i >= 0) build.mods.splice(i, 1); else build.mods.push(m);
        renderBuild(); buildSpeak(); scanner.refresh();
      }
    });
    $('#btn-build-speak').addEventListener('click', buildSpeak);
    $('#btn-build-back').addEventListener('click', () => { build.start = null; build.next = null; build.mods = []; renderBuild(); scanner.refresh(); });
    $('#btn-build-new').addEventListener('click', () => { buildReset(); scanner.refresh(); });
    $('#btn-build-save').addEventListener('click', () => {
      const s = buildSentence();
      if (!s || !build.next) { toast('Primero arma la frase'); return; }
      if (!saved.includes(s)) { saved.push(s); store.set(KEYS.saved, saved); }
      toast('Guardada en «Frases guardadas» de Deletrear');
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
    $('#btn-spell-speak-top').addEventListener('click', () => { spellAction('speak'); scanner.refresh(); });

    // Dolor
    $('#view-pain').addEventListener('click', e => {
      const seg = e.target.closest('.seg-btn[data-side]');
      if (seg) { painSide = seg.dataset.side; renderBodyMap(); scanner.refresh(); return; }
      const part = e.target.closest('[data-part]');
      if (part) {
        painPart = part.dataset.part;
        $$('#body-map [data-part]').forEach(g => {
          const on = g.dataset.part === painPart;
          g.classList.toggle('is-selected', on); g.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const p = partById(painPart);
        $('#pain-selected').textContent = p ? p.say : '';
        speech.say(part.dataset.say);
        addHistory('pain', part.dataset.say);
        return;
      }
      const lvl = e.target.closest('.level');
      if (lvl) {
        const n = Number(lvl.dataset.level);
        $$('.level').forEach(l => { const on = l === lvl; l.classList.toggle('is-selected', on); l.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        const p = painPart ? partById(painPart) : null;
        const text = (p ? p.say + '. ' : '') + `El dolor es ${n} de 10, ${D.painLabels[n]}`;
        speech.say(text);
        addHistory('pain', text);
        flashEl(lvl);
        return;
      }
      const tile = e.target.closest('#pain-quick .tile');
      if (tile) { speech.say(tile.dataset.say); addHistory('pain', tile.dataset.label); flashEl(tile); }
    });
    $('#body-map').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const g = e.target.closest('[data-part]');
      if (!g) return;
      e.preventDefault();
      g.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // Historial
    $('#btn-history-home').addEventListener('click', () => show('home'));
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
    $('#settings-form').addEventListener('submit', e => e.preventDefault());
    $('#btn-test-voice').addEventListener('click', () => speech.say(gen('Hola, así sueno. Puedo decir sí, no, tengo sed, o cualquier frase del tablero.')));
    $('#set-voice').addEventListener('change', e => { settings.voiceURI = e.target.value; saveSettings(); });
    $('#set-rate').addEventListener('input', e => { settings.rate = Number(e.target.value); $('#set-rate-out').textContent = rateLabel(settings.rate); saveSettings(); });
    $('#set-scale').addEventListener('change', e => { settings.scale = e.target.value; saveSettings(); applySettings(); });
    $('#set-theme').addEventListener('change', e => { settings.theme = e.target.value; saveSettings(); applySettings(); });
    $$('[data-gender]').forEach(b => b.addEventListener('click', () => { settings.gender = b.dataset.gender; saveSettings(); renderSettings(); }));
    $('#set-keyboard-order').addEventListener('change', e => { settings.keyboardOrder = e.target.value; saveSettings(); });
    $('#set-flash').addEventListener('change', e => { settings.flashAlert = e.target.checked; saveSettings(); });
    $('#set-touch-mode').addEventListener('change', e => { settings.touchMode = e.target.value; saveSettings(); applySettings(); });
    $('#set-dwell').addEventListener('input', e => { settings.dwellMs = Math.round(Number(e.target.value) * 1000); $('#set-dwell-out').textContent = (settings.dwellMs / 1000).toFixed(1).replace('.', ','); saveSettings(); applySettings(); });
    $('#set-min-touch').addEventListener('input', e => { settings.minTouchMs = Number(e.target.value); $('#set-min-touch-out').textContent = minTouchLabel(settings.minTouchMs); saveSettings(); });
    $('#set-drag-speak').addEventListener('change', e => { settings.dragSpeak = e.target.checked; saveSettings(); });
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
      const items = editableItems($('#edit-cat').value);
      const item = items[Number(inp.dataset.idx)];
      if (!item) return;
      const f = inp.dataset.field;
      if (f === 's') { if (inp.value.trim()) item.s = storeText(inp.value); else delete item.s; }
      else if (f === 't') item.t = storeText(inp.value);
      else item[f] = inp.value;
      saveVocab();
    });
    $('#edit-list').addEventListener('click', e => {
      const catId = $('#edit-cat').value;
      const del = e.target.closest('[data-del]');
      if (del) { editableItems(catId).splice(Number(del.dataset.del), 1); saveVocab(); renderEditor(); return; }
      const mv = e.target.closest('[data-move]');
      if (mv) {
        const items = editableItems(catId);
        const i = Number(mv.dataset.idx);
        const j = mv.dataset.move === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        saveVocab(); renderEditor();
        const btn = $(`#edit-list [data-move="${mv.dataset.move}"][data-idx="${j}"]`);
        const alt = $(`#edit-list .edit-text[data-idx="${j}"]`);
        if (btn && !btn.disabled) btn.focus(); else if (alt) alt.focus();
      }
    });
    $('#btn-edit-add').addEventListener('click', () => {
      const catId = $('#edit-cat').value;
      editableItems(catId).push({ e: '💬', t: '' });
      saveVocab(); renderEditor();
      const inputs = $$('#edit-list .edit-text');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    let restoreArmed = 0;
    $('#btn-edit-restore').addEventListener('click', e => {
      const b = e.currentTarget;
      if (!restoreArmed) {
        b.textContent = '¿Seguro? Toca otra vez para restaurar';
        restoreArmed = setTimeout(() => { restoreArmed = 0; b.textContent = '↩ Restaurar esta categoría'; }, 4000);
        return;
      }
      clearTimeout(restoreArmed); restoreArmed = 0; b.textContent = '↩ Restaurar esta categoría';
      delete vocab[$('#edit-cat').value]; saveVocab(); renderEditor(); toast('Categoría restaurada');
    });

    $('#btn-backup-copy').addEventListener('click', () => { const t = exportBackup(); $('#backup-text').value = t; copyText(t, 'Copia de seguridad copiada'); });
    $('#btn-backup-share').addEventListener('click', async () => {
      const t = exportBackup(); $('#backup-text').value = t;
      if (navigator.share) {
        try { await navigator.share({ title: 'Copia de Talk Again', text: t }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      copyText(t, 'Copia de seguridad copiada (este dispositivo no puede compartir directamente)');
    });
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
    try {
      const hadSW = !!navigator.serviceWorker.controller;   // true = ya había una versión instalada
      navigator.serviceWorker.register('sw.js').then(reg => {
        // El worker que se instala con la app recién abierta por primera vez es la instalación inicial;
        // cualquier otro (ya había una versión controlando la página, o es el segundo de esta sesión) es una actualización.
        const seen = new Set();
        const watch = w => {
          if (!w || seen.has(w)) return;
          seen.add(w);
          const update = hadSW || seen.size > 1;
          w.addEventListener('statechange', () => {
            if (w.state !== 'activated') return;
            if (update) toast('Versión nueva lista: cierra y vuelve a abrir la app', 5000);
            else toast('Lista para usar sin internet');
          });
        };
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      }).catch(() => { /* no disponible */ });
    } catch (e) { /* nada */ }
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
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBodyLabels).catch(() => { /* nada */ });
    if (settings.scanAuto || (settings.cam && !window.TA_ARTIFACT)) {
      // La voz y la cámara necesitan un primer toque: una pantalla de "empezar" lo garantiza.
      const gate = el('button', { class: 'start-gate', type: 'button' }, [
        el('span', { text: '👆 Toca para empezar' }),
        el('small', { text: settings.scanAuto ? 'Se activará el barrido automático' : 'Se activará la cámara' })
      ]);
      document.body.appendChild(gate);
      try { gate.focus(); } catch (e) { /* nada */ }
      gate.addEventListener('click', () => {
        gate.remove();
        speech.unlock();
        if (settings.scanAuto) scanner.start();
        if (settings.cam && !window.TA_ARTIFACT) startCamera();
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Para pruebas y depuración desde la consola.
  window.TalkAgain = {
    show, scanner, speech, answer, help, touch, build,
    get settings() { return settings; },
    get history() { return history; },
    exportBackup, importBackup
  };
})();
