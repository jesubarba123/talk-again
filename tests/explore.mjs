/* Prueba exploratoria con Playwright (segunda ronda): recorre los flujos que la prueba de humo no
   cubre o cubre a medias: editor de frases (añadir, quitar, reordenar, "lo que se dice", restaurar en
   dos toques), copia de seguridad (actual, formato antiguo y texto basura), historial, deletreo,
   dolor, barrido con botón y con pantalla (cabecera, pausa, Escape, tecla mantenida, arranque
   automático), AYUDA (mantener, no tocar), modos de tacto (deslizar y soltar, dejar quieto, toques
   cortos), hombre/mujer, personas importantes y gramática, tamaños de texto en 360/400/820 px, tema
   oscuro con medición de contraste, sin conexión y actualización del service worker.
   Imprime una línea OK/FAIL por comprobación, INFO para observaciones, guarda capturas y termina
   con código 1 si algo falla.
   Uso: npm install && node tests/explore.mjs   (necesita Python 3 para el servidor estático).
   Variables: PORT (por defecto 8347; usa también PORT+1), SHOTS_DIR (carpeta de capturas). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import zlib from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 8347;
const BASE = `http://127.0.0.1:${PORT}/`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS_DIR || path.join(tmpdir(), 'talk-again-explore');
mkdirSync(SHOTS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Servidores estáticos (el principal se apaga y se vuelve a encender en la prueba sin conexión) ---------- */
async function startServer(port, dir) {
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  let lastErr = '';
  proc.stderr.on('data', d => { const line = String(d).trim().split('\n').pop(); if (line) lastErr = line; });
  let exit = null;
  proc.once('exit', code => { exit = code == null ? 'señal' : code; });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (exit !== null) throw new Error(`El servidor del puerto ${port} terminó al arrancar (${exit}): ${lastErr}`);
    let ok = false;
    try { ok = (await fetch(base, { cache: 'no-store' })).ok; } catch (e) { /* aún no */ }
    if (ok) {
      await sleep(150);   // si el puerto ya estaba ocupado por otro proceso, python habrá salido con error
      if (exit !== null) throw new Error(`El puerto ${port} ya estaba en uso (${lastErr}). Prueba con PORT=otro.`);
      return proc;
    }
    await sleep(100);
  }
  throw new Error('El servidor estático no arrancó en el puerto ' + port);
}
function stopServer(proc) {
  return new Promise(res => {
    if (!proc || proc.exitCode !== null) return res();
    proc.once('exit', () => res());
    proc.kill();
  });
}
let server = null;

/* ---------- Utilidades de comprobación ---------- */
let failures = 0;
let currentScenario = '';
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) failures++; return !!cond; };
const info = msg => console.log('INFO ' + msg);
const consoleErrors = [];
const openPages = new Set();
async function scenario(name, fn) {
  currentScenario = name;
  console.log(`\n--- ${name} ---`);
  const t0 = Date.now();
  try { await fn(); }
  catch (e) { failures++; console.log('FAIL ' + name + ' lanzó una excepción: ' + String(e && e.message || e).split('\n')[0]); }
  finally {
    for (const p of openPages) { try { await p.context().close(); } catch (e) { /* ya cerrada */ } }
    openPages.clear();
    info(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
}
const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const EMOJI = /\p{Extended_Pictographic}/u;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/* Página nueva (contexto propio) con espías: window.__spoken guarda cada texto pronunciado y
   window.__toasts cada aviso mostrado. Con { fresh: true } no navega (para probar la primera visita). */
async function newPage(opts) {
  const { fresh, ...ctx } = opts || {};
  const page = await browser.newPage(Object.assign({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] }, ctx));
  page.setDefaultTimeout(10000);
  openPages.add(page);
  page.on('close', () => openPages.delete(page));
  const tag = currentScenario;
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
  await page.addInitScript(() => {
    window.__spoken = []; window.__toasts = [];
    try {
      const orig = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = u => { window.__spoken.push(u.text); try { orig(u); } catch (e) { /* nada */ } };
    } catch (e) { /* sin voz */ }
    document.addEventListener('DOMContentLoaded', () => {
      const t = document.getElementById('toast');
      if (!t) return;
      new MutationObserver(() => {
        const txt = (t.textContent || '').trim();
        if (t.classList.contains('is-visible') && txt && window.__toasts[window.__toasts.length - 1] !== txt) window.__toasts.push(txt);
      }).observe(t, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
  });
  if (fresh) return page;
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* nada */ } });
  await page.reload({ waitUntil: 'load' });
  return page;
}
const hist = p => p.evaluate(() => window.TalkAgain.history);
const last = async p => { const h = await hist(p); return h[h.length - 1] || {}; };
const spoken = p => p.evaluate(() => window.__spoken);
const toasts = p => p.evaluate(() => window.__toasts);
async function waitSpoken(p, t, from, ms) {
  const t0 = Date.now();
  for (;;) {
    if ((await spoken(p)).slice(from || 0).includes(t)) return true;
    if (Date.now() - t0 > (ms || 800)) return false;
    await sleep(50);
  }
}
const settingsOf = p => p.evaluate(() => window.TalkAgain.settings);
const cssScale = p => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale').trim());
const text = async (p, sel) => ((await p.locator(sel).textContent()) || '').replace(/\s+/g, ' ').trim();   // textContent: la CSS pone rótulos en mayúsculas
const toastState = p => p.evaluate(() => { const t = document.getElementById('toast'); return { text: t.textContent, visible: t.classList.contains('is-visible') }; });
const setRange = (p, sel, v) => p.evaluate(([s, val]) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, String(v)]);
const shot = (p, name, full) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full });
const show = (p, v) => p.evaluate(view => window.TalkAgain.show(view), v);
const title = p => text(p, '#view-title');
const openAdvanced = p => p.evaluate(() => { document.querySelectorAll('details.advanced, details.backup-details').forEach(d => { d.open = true; }); });
const scanState = p => p.evaluate(() => ({ active: window.TalkAgain.scanner.active, state: window.TalkAgain.scanner.state, level: window.TalkAgain.scanner.level }));
const hlLabel = p => p.evaluate(() => { const e = document.querySelector('.scan-hl'); return e ? e.getAttribute('data-label') : null; });
const hasClass = (p, sel, cls) => p.evaluate(([s, c]) => { const e = document.querySelector(s); return !!e && e.classList.contains(c); }, [sel, cls]);
const center = async (p, sel) => { const b = await p.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function pressAt(p, x, y, ms) { await p.mouse.move(x, y); await p.mouse.down(); await sleep(ms); await p.mouse.up(); }
async function holdHelp(p, ms) { const c = await center(p, '#btn-help'); await pressAt(p, c.x, c.y, ms == null ? 850 : ms); }
const overflow = p => p.evaluate(() => {
  const d = document.documentElement, v = document.getElementById('views'), h = document.querySelector('.topbar');
  return { sw: d.scrollWidth, cw: d.clientWidth, vw: v.scrollWidth, vc: v.clientWidth, hw: h.scrollWidth, hc: h.clientWidth };
});
const fits = r => r.sw <= r.cw && r.vw <= r.vc && r.hw <= r.hc;
const fmt = r => `documento ${r.sw}/${r.cw}, views ${r.vw}/${r.vc}, barra superior ${r.hw}/${r.hc}`;
/* Elementos que sobresalen por la derecha de la zona central (para saber qué desborda). */
const wideIn = p => p.evaluate(() => {
  const v = document.getElementById('views'); const limit = v.getBoundingClientRect().right;
  const out = [];
  v.querySelectorAll('.view:not([hidden]) *').forEach(e => {
    const b = e.getBoundingClientRect();
    if (b.width && b.right > limit + 0.5 && !out.some(o => o.el.contains(e))) out.push({ el: e, s: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''} «${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}» hasta x=${Math.round(b.right)}` });
  });
  return out.slice(0, 4).map(o => o.s);
});
const fitsMsg = async (p, r) => fmt(r) + (fits(r) ? '' : `; sobresale: ${(await wideIn(p)).join(' | ') || '?'}`);
/* Medidas de la pantalla Dolor: el selector Delante/Detrás debe ser una sola línea con sus dos botones lado a lado. */
const painMeasure = p => p.evaluate(() => {
  const segEl = document.querySelector('#view-pain .seg');
  const seg = segEl.getBoundingClientRect();
  const btns = Array.from(segEl.querySelectorAll('.seg-btn')).map(b => b.getBoundingClientRect());
  const map = document.getElementById('body-map').getBoundingClientRect();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const cols = s => getComputedStyle(document.querySelector(s)).gridTemplateColumns.trim().split(/\s+/).length;
  return {
    segH: Math.round(seg.height), segMax: Math.round(3.25 * rem + 14),
    sameRow: Math.abs(btns[0].top - btns[1].top) < 2, btnH: Math.round(Math.max(...btns.map(b => b.height))), btnMax: Math.round(3.25 * rem + 3),
    mapGap: Math.round(map.top - seg.bottom), levelCols: cols('#pain-levels'), layoutCols: cols('.pain-layout'),
    bodyH: Math.round(document.querySelector('.pain-body').getBoundingClientRect().height),
    scaleH: Math.round(document.querySelector('.pain-scale').getBoundingClientRect().height)
  };
});
const painOk = m => m.segH <= m.segMax && m.sameRow && m.btnH <= m.btnMax && m.mapGap <= 40;
const painFmt = m => `selector Delante/Detrás de ${m.segH} px (máx. ${m.segMax}, botones ${m.btnH}/${m.btnMax}${m.sameRow ? '' : ', EN DOS LÍNEAS'}); mapa ${m.mapGap} px por debajo; ${m.layoutCols} columna(s), niveles en ${m.levelCols}`;
/* Textos recortados o que desbordan su botón (ayuda para la revisión visual). */
const clippedIn = p => p.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, .view-title, .scan-status, .pain-selected, .build-sentence, .spell-output').forEach(e => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const overX = e.scrollWidth > e.clientWidth + 1, overY = e.scrollHeight > e.clientHeight + 1;
    if (!overX && !overY) return;
    const cs = getComputedStyle(e);
    const name = (e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]) + ' «' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26) + '»';
    out.push(name + (overX ? ` ancho ${e.scrollWidth}>${e.clientWidth}` : '') + (overY ? ` alto ${e.scrollHeight}>${e.clientHeight}` : '') + (cs.overflow === 'visible' ? ' (sin recorte, puede pisar vecinos)' : ' (RECORTADO)'));
  });
  return out;
});
/* Etiquetas del mapa del cuerpo que no caben en su zona (en unidades del propio dibujo). */
const bodyLabelsFit = p => p.evaluate(() => {
  const out = [];
  document.querySelectorAll('#body-map g[data-part]').forEach(g => {
    if (!g.getBoundingClientRect().width) return;
    const part = g.querySelector('.part'), t = g.querySelector('text');
    const pb = part.getBBox(), tb = t.getBBox();
    const ratio = tb.width / pb.width;
    if (tb.width > pb.width + 0.5) out.push(`${g.dataset.part} «${t.textContent}» ${Math.round(tb.width)}>${Math.round(pb.width)}`);
    else if (ratio > 0.92) out.push(`${g.dataset.part} «${t.textContent}» muy justo (${Math.round(ratio * 100)} % del ancho de la zona)`);
  });
  return out;
});
/* Contraste WCAG del texto sobre su fondo REAL: con superficies translúcidas (cristal) el color calculado no sirve,
   así que se captura la pantalla y se muestrean píxeles del fondo alrededor del texto (y en los bordes de su caja). */
function decodePng(buf) {
  let pos = 8, w = 0, h = 0, ct = 0, bd = 0, il = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; il = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bd !== 8 || il !== 0 || (ct !== 6 && ct !== 2)) throw new Error(`PNG no soportado (${bd} bits, tipo ${ct}, entrelazado ${il})`);
  const ch = ct === 6 ? 4 : 3, stride = w * ch, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride, prev = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[dst + i - ch] : 0, b = y > 0 ? out[prev + i] : 0, c = (y > 0 && i >= ch) ? out[prev + i - ch] : 0;
      let v = raw[src + i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  return { w, h, px: (x, y) => { const o = (Math.min(h - 1, Math.max(0, y | 0)) * w + Math.min(w - 1, Math.max(0, x | 0))) * ch; return [out[o], out[o + 1], out[o + 2]]; } };
}
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const wcag = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const contrastOf = async (p, specs) => {
  const items = await p.evaluate(specs => {
    const parse = c => { const m = (c || '').match(/[\d.]+/g); if (!m) return null; const a = m.length > 3 ? Number(m[3]) : 1; return a === 0 ? null : m.slice(0, 3).map(Number); };
    const hasBg = cs => (cs.backgroundImage && cs.backgroundImage !== 'none') || !!parse(cs.backgroundColor);
    const bgOf = e => { for (let n = e; n && n !== document.documentElement; n = n.parentElement) if (hasBg(getComputedStyle(n))) return n; return document.body; };
    document.querySelectorAll('[data-ta-c], [data-ta-b]').forEach(e => { e.removeAttribute('data-ta-c'); e.removeAttribute('data-ta-b'); });
    const out = []; let k = 0;
    specs.forEach(sp => {
      document.querySelectorAll(sp.sel).forEach((e, i) => {
        if (sp.max && i >= sp.max) return;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
        let fg, bgEl;
        if (sp.svg) { fg = parse(getComputedStyle(e).fill); bgEl = e.parentNode.querySelector('.part'); }
        else { fg = parse(getComputedStyle(e).color); bgEl = sp.bgSel ? (e.closest(sp.bgSel) || e) : bgOf(e); }
        if (!fg || !bgEl) return;
        e.setAttribute('data-ta-c', String(k)); bgEl.setAttribute('data-ta-b', String(k));
        out.push({ k, name: `${sp.name || sp.sel} «${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22)}»`, fg, svg: !!sp.svg, hideAfter: !!sp.hideAfter });
        k++;
      });
    });
    return out;
  }, specs);
  const results = [];
  for (const it of items) {
    const rects = await p.evaluate(k => {
      const e = document.querySelector(`[data-ta-c="${k}"]`), b = document.querySelector(`[data-ta-b="${k}"]`);
      if (!e || !b) return null;
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rr = x => { const r = x.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      // Caja de las letras (Range), no del elemento: en un botón la diferencia es el relleno, que es fondo medible.
      let t = rr(e);
      if (!(e instanceof SVGElement)) { try { const rg = document.createRange(); rg.selectNodeContents(e); const q = rg.getBoundingClientRect(); if (q.width && q.height) t = { l: q.left, t: q.top, r: q.right, b: q.bottom }; } catch (err) { /* nada */ } }
      return { t, o: rr(e), b: rr(b), vw: innerWidth, vh: innerHeight };
    }, it.k);
    if (!rects) continue;
    const { t, o } = rects;
    // Región de muestreo: la propia caja del elemento si tiene relleno alrededor de las letras (botón, píldora, ficha);
    // si no (texto a medida), la del ancestro con fondo.
    const b = (!it.svg && ((o.r - o.l) - (t.r - t.l) >= 8 || (o.b - o.t) - (t.b - t.t) >= 8)) ? o : rects.b;
    const clip = { x: Math.max(0, Math.floor(b.l)), y: Math.max(0, Math.floor(b.t)) };
    clip.width = Math.min(rects.vw, Math.ceil(b.r)) - clip.x; clip.height = Math.min(rects.vh, Math.ceil(b.b)) - clip.y;
    if (clip.width < 3 || clip.height < 3) continue;
    const png = decodePng(await p.screenshot({ clip, type: 'png' }));
    const sx = png.w / clip.width, sy = png.h / clip.height;
    const inClip = (x, y) => x >= clip.x && x < clip.x + clip.width && y >= clip.y && y < clip.y + clip.height;
    const inB = (x, y, m) => x >= b.l + m && x <= b.r - m && y >= b.t + m && y <= b.b - m && inClip(x, y);
    const inT = (x, y, m) => x >= t.l - m && x <= t.r + m && y >= t.t - m && y <= t.b + m;
    const cx = (t.l + t.r) / 2, cy = (t.t + t.b) / 2;
    // Se muestrea el relleno a izquierda y derecha del texto, a la altura de su centro (la parte más ancha de una píldora y
    // lejos del brillo del borde superior). Si no hay sitio (texto a todo el ancho), justo por encima y por debajo del texto.
    const pts = [];
    for (let x = t.l - 60; x <= t.r + 60; x += 2) if (inB(x, cy, 4) && !inT(x, cy, 3)) pts.push([x, cy]);
    if (pts.length < 6) for (let y = t.t - 12; y <= t.b + 12; y += 2) if (inB(cx, y, 4) && !inT(cx, y, 3)) pts.push([cx, y]);
    if (!pts.length) { info(`Sin píxeles de fondo medibles alrededor de ${it.name}`); continue; }
    const samples = pts.map(([x, y]) => { const c = png.px((x - clip.x) * sx, (y - clip.y) * sy); return { c, r: wcag(it.fg, c) }; }).sort((a, b) => a.r - b.r);
    const pick = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.25))];   // descarta algún píxel suelto (borde, letra)
    results.push({ name: it.name, fg: 'rgb(' + it.fg.join(',') + ')', bg: 'rgb(' + pick.c.join(',') + ')', ratio: Math.round(pick.r * 100) / 100 });
    if (it.hideAfter) await p.evaluate(k => { const e = document.querySelector(`[data-ta-c="${k}"]`); if (e) e.classList.remove('is-visible'); }, it.k);
  }
  await p.evaluate(() => { document.querySelectorAll('[data-ta-c], [data-ta-b]').forEach(e => { e.removeAttribute('data-ta-c'); e.removeAttribute('data-ta-b'); }); });
  return results;
};
const labelsOf = (p, view) => p.evaluate(v => Array.from(document.querySelectorAll('#view-' + v + ' [data-scan]')).filter(e => e.getBoundingClientRect().width > 0)
  .map(e => e.getAttribute('data-label') || e.getAttribute('aria-label') || e.getAttribute('data-say') || (e.textContent || '').trim().replace(/\s+/g, ' ')), view);
async function waitCache(p, name) {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const ok = await p.evaluate(async n => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || !reg.active) return false;
        for (const k of await caches.keys()) { if (n && k !== n) continue; const c = await caches.open(k); if ((await c.keys()).length >= 11) return true; }
      } catch (e) { /* nada */ }
      return false;
    }, name || null);
    if (ok) return true;
    await sleep(200);
  }
  return false;
}
async function waitToast(p, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await toasts(p)).some(pred)) return Date.now() - t0; await sleep(100); }
  return -1;
}

server = await startServer(PORT, ROOT);
try {
  /* ============ 1. Editor de frases ============ */
  await scenario('1. Ajustes > Editar frases (Necesidades): añadir, editar, quitar, restaurar', async () => {
    const page = await newPage();
    const defaults = await page.evaluate(() => window.TA_DATA.categories.find(c => c.id === 'necesidades').items.map(i => i.t));
    await page.click('#btn-settings');
    await page.selectOption('#edit-cat', 'necesidades');
    const rows = page.locator('#edit-list .edit-row');
    const values = () => page.locator('#edit-list .edit-text').evaluateAll(is => is.map(i => i.value));
    const before = await rows.count();
    check(before === defaults.length, `El editor muestra las ${defaults.length} frases de Necesidades (${before})`);
    check((await values())[0] === defaults[0], `La primera fila es "${defaults[0]}"`);
    await page.click('#btn-edit-add');
    check(await rows.count() === before + 1, 'Añadir frase crea una fila nueva');
    check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('edit-text')), 'El foco pasa al texto de la frase nueva');
    await rows.nth(before).locator('.edit-emoji').fill('🧃');
    await rows.nth(before).locator('.edit-text').fill('Quiero un zumo');
    await rows.nth(0).locator('.edit-text').fill('Quiero agua fría');
    const idx = (await values()).indexOf('Tengo hambre');
    check(idx > 0, `"Tengo hambre" está en la fila ${idx + 1}`);
    await rows.nth(idx).locator('[data-del]').click();
    check(await rows.count() === before, 'Quitar una frase elimina su fila');
    check(!(await values()).includes('Tengo hambre'), 'La fila quitada ya no está en el editor');

    await page.click('#btn-home'); await page.click('[data-goto="board"]'); await page.click('[data-cat="necesidades"]');
    const labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(labels.includes('Quiero un zumo'), 'La frase nueva aparece en el tablero');
    check(labels[0] === 'Quiero agua fría', 'La frase editada se actualiza en el tablero');
    check(!labels.includes('Tengo hambre'), 'La frase quitada desaparece del tablero');
    const nuevo = page.locator('#board-grid .tile[data-label="Quiero un zumo"]');
    check((await nuevo.locator('.tile-emoji').innerText()) === '🧃', 'La frase nueva muestra el emoji escrito');
    await nuevo.click();
    const h = await last(page);
    check(h.type === 'phrase' && h.text === 'Quiero un zumo', 'Tocar la frase nueva la añade al historial');
    check(await waitSpoken(page, 'Quiero un zumo'), 'La frase nueva se pronuncia');
    check((await page.locator('#board-grid .tile').nth(0).getAttribute('data-say')) === 'Quiero agua fría', 'Al editar el texto de una frase sin locución propia se pronuncia el texto nuevo');
    check(await hasClass(page, '#board-grid .tile', 'is-urgent'), 'La frase editada conserva la marca de urgente (borde rojo)');

    await page.reload({ waitUntil: 'load' });
    await page.click('[data-goto="board"]'); await page.click('[data-cat="necesidades"]');
    const l2 = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(l2.includes('Quiero un zumo') && l2[0] === 'Quiero agua fría' && !l2.includes('Tengo hambre'), 'Los cambios persisten tras recargar');
    await page.click('#btn-settings'); await page.selectOption('#edit-cat', 'necesidades');
    check(await rows.count() === before && (await values())[0] === 'Quiero agua fría', 'El editor muestra los cambios tras recargar');
    // Restaurar: un solo toque no restaura; dos toques en 4 s sí.
    await page.click('#btn-edit-restore');
    check((await text(page, '#btn-edit-restore')) === '¿Seguro? Toca otra vez para restaurar' && await rows.count() === before, 'El primer toque en "Restaurar" solo pide confirmación');
    await sleep(4300);
    check((await text(page, '#btn-edit-restore')) === '↩ Restaurar esta categoría' && await rows.count() === before, 'Pasados 4 s sin segundo toque, el botón vuelve a su texto y no restaura nada');
    await page.click('#btn-edit-restore'); await page.click('#btn-edit-restore');
    check(await rows.count() === defaults.length && (await values())[0] === defaults[0] && (await values()).includes('Tengo hambre'), `Dos toques en "Restaurar" vuelven a las ${defaults.length} frases por defecto`);
    check((await toastState(page)).text === 'Categoría restaurada', 'Aviso "Categoría restaurada"');
    check(!(await page.evaluate(() => 'necesidades' in (JSON.parse(localStorage.getItem('talkagain.v1.vocab') || '{}')))), 'Al restaurar, la categoría deja de estar personalizada en el almacenamiento');
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-goto="board"]'); await page.click('[data-cat="necesidades"]');
    const l3 = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(l3.length === defaults.length && l3[0] === defaults[0] && l3.includes('Tengo hambre'), 'La restauración persiste tras recargar');
  });

  /* ============ 2. Copia de seguridad ============ */
  await scenario('2. Copia de seguridad: exportar, borrar, restaurar', async () => {
    const page = await newPage();
    await page.click('#btn-settings');
    check((await settingsOf(page)).scale === '1.2' && (await cssScale(page)) === '1.2' && (await page.inputValue('#set-scale')) === '1.2', 'El tamaño de texto por defecto es "Grande" (1.2)');
    await page.selectOption('#set-scale', '1.4');
    check(!(await page.evaluate(() => document.querySelector('details.advanced').open)) && await page.locator('#set-scan-interval').isHidden(), 'Los ajustes avanzados empiezan plegados');
    await page.click('details.advanced > summary');
    check(await page.locator('#set-scan-interval').isVisible() && await page.locator('#set-cam').isVisible() && await page.locator('#set-keyboard-order').isVisible() && await page.locator('#backup-text').isHidden(), 'Tocar el resumen despliega barrido, cámara y teclado; el texto de la copia queda plegado aparte');
    await page.click('details.backup-details > summary');
    check(await page.locator('#backup-text').isVisible(), 'Tocar "Ver o pegar el texto de la copia" muestra el cuadro de texto');
    await setRange(page, '#set-scan-interval', 3.5);
    await page.fill('#set-people', 'Mi esposa Ana\nMi hijo Luis');
    let s = await settingsOf(page);
    check(s.scale === '1.4' && s.scanInterval === 3.5 && s.people === 'Mi esposa Ana\nMi hijo Luis', 'Los ajustes cambiados quedan en memoria');
    check((await text(page, '#set-scan-interval-out')) === '3,5', 'El intervalo se muestra como "3,5"');
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    for (const k of ['A', 'G', 'U', 'A']) await page.click(`.key[data-key="${k}"]`);
    await page.click('.key[data-action="save"]');
    check(await page.locator('.saved-chip').count() === 1 && (await text(page, '.saved-chip .saved-say')) === 'agua', 'Frase guardada "agua" en Deletrear');

    await page.click('#btn-settings'); await openAdvanced(page);
    await page.click('#btn-backup-copy'); await sleep(250);
    const backup = await page.inputValue('#backup-text');
    let parsed = null; try { parsed = JSON.parse(backup); } catch (e) { /* inválido */ }
    check(!!parsed && parsed.app === 'talk-again' && parsed.v === 1 && parsed.settings.scale === '1.4' && parsed.settings.scanInterval === 3.5
      && parsed.settings.people.includes('Mi hijo Luis') && Array.isArray(parsed.saved) && parsed.saved.includes('agua') && typeof parsed.builder === 'object',
      'El texto de #backup-text contiene ajustes, personas, la frase guardada y las estadísticas de Armar frase');
    check((await toastState(page)).text === 'Copia de seguridad copiada', 'Aviso "Copia de seguridad copiada"');
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    if (clip == null) info('No se pudo leer el portapapeles en este entorno'); else check(clip === backup, 'El portapapeles contiene la copia');
    info(`Copia: ${backup.length} caracteres`);

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    check((await cssScale(page)) === '1.2' && (await settingsOf(page)).people === '' && await page.evaluate(() => window.TalkAgain.show('spell') || document.querySelectorAll('.saved-chip').length === 0), 'Tras borrar el almacenamiento vuelven los valores por defecto');
    await show(page, 'settings'); await openAdvanced(page);
    await page.fill('#backup-text', backup);
    await page.click('#btn-backup-restore');
    check((await toastState(page)).text === 'Copia restaurada', 'Aviso "Copia restaurada"');
    s = await settingsOf(page);
    check(s.scale === '1.4' && (await cssScale(page)) === '1.4' && (await page.inputValue('#set-scale')) === '1.4', 'Tamaño de texto 1.4 restaurado y aplicado');
    check(s.scanInterval === 3.5 && (await page.inputValue('#set-scan-interval')) === '3.5' && (await text(page, '#set-scan-interval-out')) === '3,5', 'Intervalo de barrido 3,5 s restaurado');
    check((await page.inputValue('#set-people')) === 'Mi esposa Ana\nMi hijo Luis', 'Personas restauradas en el ajuste');
    await page.click('#btn-home'); await page.click('[data-goto="board"]'); await page.click('[data-cat="personas"]');
    const ana = page.locator('#board-grid .tile', { hasText: 'Mi esposa Ana' });
    check(await ana.count() === 2 && (await ana.nth(0).getAttribute('data-say')) === 'Quiero ver a mi esposa Ana' && (await ana.nth(1).getAttribute('data-say')) === 'Llamen a mi esposa Ana, por favor', 'Personas muestra las dos frases de "Mi esposa Ana" (con «mi» en minúscula dentro de la frase)');
    const sb = (await spoken(page)).length;
    await ana.nth(0).click();
    check(await waitSpoken(page, 'Quiero ver a mi esposa Ana', sb) && (await last(page)).text === 'Ver a mi esposa Ana', 'Tocar la persona la pronuncia y la registra');
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    check(await page.locator('.saved-chip').count() === 1 && (await text(page, '.saved-chip .saved-say')) === 'agua', 'La frase guardada vuelve tras restaurar');
    await page.reload({ waitUntil: 'load' });
    s = await settingsOf(page);
    check(s.scale === '1.4' && s.scanInterval === 3.5 && s.people.startsWith('Mi esposa Ana'), 'Lo restaurado persiste tras recargar');
  });

  /* ============ 3. Historial ============ */
  await scenario('3. Historial: etiquetas, copiar, borrar con confirmación, estado vacío', async () => {
    const page = await newPage();
    await page.click('[data-goto="yesno"]'); await page.click('.answer-yes');
    await page.click('#btn-home'); await page.click('[data-goto="board"]'); await page.click('#board-grid .tile[data-label="Espera"]');
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    for (const k of ['H', 'O', 'L', 'A']) await page.click(`.key[data-key="${k}"]`);
    await page.click('.key[data-action="speak"]');
    await page.click('#btn-home'); await page.click('[data-goto="pain"]'); await page.click('#body-map [data-part="cabeza"]');
    await holdHelp(page);
    await page.click('#btn-home'); await page.click('[data-goto="history"]');
    const items = page.locator('.hist-item');
    check(await items.count() === 5, `El historial lista las 5 entradas (${await items.count()})`);
    const chips = await page.locator('.hist-item .chip').allTextContents();
    check(JSON.stringify(chips) === JSON.stringify(['AYUDA', 'Dolor', 'Escrito', 'Frase', 'Respuesta']), `Etiquetas correctas, de la más reciente a la más antigua: ${chips.join(', ')}`);
    const texts = await page.locator('.hist-item .hist-text').allInnerTexts();
    check(texts[0].includes('¡Necesito ayuda!') && texts[1].includes('Me duele la cabeza') && texts[2].includes('hola') && texts[3].includes('Espera') && texts[4].includes('Sí'), 'Cada entrada muestra su texto');
    // textContent, no innerText: la CSS pone el rótulo en mayúsculas (text-transform) y innerText lo devuelve transformado.
    check(await page.locator('.hist-day').count() === 1 && (await page.locator('.hist-day').textContent()) === 'Hoy', 'Las entradas se agrupan bajo "Hoy"');
    check(await page.locator('#history-empty').isHidden(), 'El aviso de historial vacío está oculto cuando hay entradas');
    await page.click('#btn-copy-history'); await sleep(250);
    check((await toastState(page)).text === 'Historial copiado', '"📋 Copiar" avisa "Historial copiado"');
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    if (clip == null) info('No se pudo leer el portapapeles en este entorno');
    else check(clip.split('\n').length === 5 && clip.includes('Respuesta: Sí') && clip.includes('AYUDA: ¡Necesito ayuda!') && clip.includes('Dolor: Me duele la cabeza'), `El texto copiado tiene las 5 líneas con hora y etiqueta (${clip.split('\n')[0]})`);
    await shot(page, 'history-5');
    await page.click('#btn-clear-history');
    check(await page.locator('#history-confirm').isVisible(), '"Borrar todo" pide confirmación');
    await page.click('#btn-clear-no');
    check(await page.locator('#history-confirm').isHidden() && await items.count() === 5, '"Cancelar" cierra la confirmación y conserva las entradas');
    await page.click('#btn-clear-history'); await page.click('#btn-clear-yes');
    check(await items.count() === 0 && (await hist(page)).length === 0, '"Sí, borrar" vacía el historial');
    check(await page.locator('#history-empty').isVisible(), 'El aviso de historial vacío reaparece');
    check(await page.locator('#history-confirm').isHidden(), 'La confirmación se cierra al borrar');
    check((await toastState(page)).text === 'Historial borrado', 'Aviso "Historial borrado"');
    await page.click('#btn-copy-history');
    check((await toastState(page)).text === 'El historial está vacío', 'Copiar con el historial vacío avisa');
    await page.reload({ waitUntil: 'load' }); await page.click('[data-goto="history"]');
    check(await items.count() === 0 && await page.locator('#history-empty').isVisible(), 'El historial sigue vacío tras recargar');
  });

  /* ============ 4. Deletrear ============ */
  await scenario('4. Deletrear: orden por frecuencia, predicción, tilde, borrar', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await openAdvanced(page);
    await page.selectOption('#set-keyboard-order', 'frecuencia');
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    const rows = await page.locator('#spell-keyboard .key-row').evaluateAll(rs => rs.map(r => Array.from(r.querySelectorAll('.key')).map(k => k.dataset.key || k.dataset.action)));
    const expected = [['E', 'A', 'O', 'S', 'R', 'N', 'I'], ['D', 'L', 'C', 'T', 'U', 'M', 'P'], ['B', 'G', 'V', 'Y', 'Q', 'H', 'F'], ['Z', 'J', 'Ñ', 'X', 'K', 'W', '´']];
    check(JSON.stringify(rows.slice(0, 4)) === JSON.stringify(expected), `Teclado por frecuencia: ${rows.slice(0, 4).map(r => r.join('')).join(' / ')}`);
    check(JSON.stringify(rows[4]) === JSON.stringify(['space', 'back', 'clear', 'speak', 'save']), 'La fila de acciones está completa');
    await page.reload({ waitUntil: 'load' }); await page.click('[data-goto="spell"]');
    check((await page.locator('#spell-keyboard .key-row').nth(0).locator('.key').allTextContents()).join('') === 'EAOSRNI', 'El orden por frecuencia persiste tras recargar');

    const out = () => page.evaluate(() => document.getElementById('spell-output').textContent);
    for (const k of ['Q', 'U']) await page.click(`.key[data-key="${k}"]`);
    let preds = await page.locator('.pred-btn').allTextContents();
    check(preds.some(w => w === 'qué' || w === 'que'), `Predicción para "qu" incluye que/qué: ${preds.join(', ')}`);
    check(preds.length > 0 && preds.every(w => stripAccents(w.toLowerCase()).startsWith('qu')), 'Todas las sugerencias empiezan por "qu" ignorando tildes');
    await page.click('.key[data-action="clear"]');
    const typeWord = async w => { for (const ch of w) await page.click(`.key[data-key="${ch.toUpperCase()}"]`); };
    for (let i = 0; i < 2; i++) {
      await typeWord('casa'); await page.click('.key[data-action="space"]'); await typeWord('bonita');
      await page.click('.key[data-action="speak"]'); await page.click('.key[data-action="clear"]');
    }
    check((await hist(page)).filter(x => x.type === 'spell' && x.text === 'casa bonita').length === 2, 'Hablar "casa bonita" dos veces deja dos entradas');
    await page.click('.key[data-key="C"]');
    preds = await page.locator('.pred-btn').allTextContents();
    check(preds[0] === 'casa', `Tras usar "casa", al escribir "c" se sugiere primero: ${preds.join(', ')}`);
    await page.click('.key[data-key="A"]');
    await page.locator('.pred-btn', { hasText: 'casa' }).first().click();
    check((await out()) === 'casa ', `La sugerencia sustituye la palabra parcial y añade un espacio: "${await out()}"`);
    await page.click('.key[data-key="S"]'); await page.click('.key[data-key="´"]');
    check((await out()) === 'casa s', 'La tilde sobre una consonante no cambia nada');
    await page.click('.key[data-key="I"]'); await page.click('.key[data-key="´"]');
    check((await out()) === 'casa sí', 'La tilde sobre una vocal la acentúa');
    await page.click('.key[data-action="back"]');
    check((await out()) === 'casa s', 'Borrar quita la última letra');
    await page.click('.key[data-action="clear"]');
    preds = await page.locator('.pred-btn').allTextContents();
    check((await out()) === '' && preds.includes('casa'), `Borrar todo vacía el texto; sin prefijo se sugieren palabras aprendidas (${preds.join(', ')})`);
    await page.click('.saved-row'); // nada que elegir
    await shot(page, 'spell-frecuencia');
  });

  /* ============ 5. Dolor ============ */
  await scenario('5. Dolor: nivel sin zona, Detrás, zona + nivel, frases rápidas, etiquetas del mapa', async () => {
    const page = await newPage();
    await page.click('[data-goto="pain"]');
    check(await page.locator('#body-map [data-part]').count() === 30 && await page.locator('#body-map [data-part]:visible').count() === 15, 'Mapa con 30 zonas, 15 visibles por lado');
    let fit = await bodyLabelsFit(page);
    check(fit.filter(f => !f.includes('muy justo')).length === 0, 'Delante: ninguna etiqueta del mapa es más ancha que su zona' + (fit.length ? ` (${fit.join('; ')})` : ''));
    await page.click('.level[data-level="4"]');
    let h = await last(page);
    check(h.type === 'pain' && h.text === 'El dolor es 4 de 10, moderado', `Nivel sin zona: "${h.text}"`);
    check((await text(page, '#pain-selected')) === 'Toca la parte del cuerpo que duele', 'Sin zona elegida se mantiene el texto de ayuda');
    check(await hasClass(page, '.level[data-level="4"]', 'is-selected') && (await page.getAttribute('.level[data-level="4"]', 'aria-pressed')) === 'true', 'El nivel elegido queda marcado');
    await page.click('.seg-btn[data-side="back"]');
    check(await page.locator('#body-map [data-part="espalda_baja"]').isVisible() && await page.locator('#body-map [data-part="pecho"]').isHidden(), '"Detrás" muestra la espalda y oculta el pecho');
    check((await page.getAttribute('.seg-btn[data-side="back"]', 'aria-pressed')) === 'true' && (await page.getAttribute('.seg-btn[data-side="front"]', 'aria-pressed')) === 'false', 'El selector Delante/Detrás marca el lado activo');
    fit = await bodyLabelsFit(page);
    check(fit.filter(f => !f.includes('muy justo')).length === 0, 'Detrás: ninguna etiqueta del mapa es más ancha que su zona' + (fit.length ? ` (${fit.join('; ')})` : ''));
    await page.click('#body-map [data-part="espalda_baja"]');
    h = await last(page);
    check(h.text === 'Me duele la espalda, en la parte baja' && (await text(page, '#pain-selected')) === 'Me duele la espalda, en la parte baja', 'Elegir espalda baja la registra y la muestra');
    check(await page.locator('#body-map g.is-selected[data-part="espalda_baja"]').count() === 1, 'La zona elegida queda marcada en el mapa');
    await page.click('.level[data-level="6"]');
    h = await last(page);
    check(h.text === 'Me duele la espalda, en la parte baja. El dolor es 6 de 10, moderado', `Zona + nivel: "${h.text}"`);
    check(await waitSpoken(page, 'Me duele la espalda, en la parte baja. El dolor es 6 de 10, moderado'), 'Se pronuncia zona + nivel');
    await page.locator('#pain-quick .tile').nth(1).click();   // Está empeorando
    h = await last(page);
    check(h.type === 'pain' && h.text === 'Está empeorando' && (await waitSpoken(page, 'El dolor está empeorando')), 'Frase rápida: pronuncia la frase completa y registra la etiqueta');
    await shot(page, 'pain-back-selected');
    await page.click('.seg-btn[data-side="front"]');
    const visibleSel = await page.locator('#body-map g.is-selected:visible').count();
    const label = await text(page, '#pain-selected');
    await page.click('.level[data-level="2"]');
    h = await last(page);
    const keepsPart = h.text.includes('espalda');
    info(`Al volver a "Delante": zonas marcadas visibles=${visibleSel}, texto="${label}", nivel 2 → "${h.text}"`);
    check((label.includes('espalda')) === keepsPart, 'Coherencia: el texto bajo el mapa y la frase del nivel coinciden sobre si la zona sigue elegida');
    await page.click('#body-map [data-part="pecho"]');
    check((await last(page)).text === 'Me duele el pecho' && await page.locator('#body-map g.is-selected').count() === 1, 'Elegir otra zona sustituye la anterior');
    await page.keyboard.press('Tab');
    await page.focus('#body-map [data-part="cabeza"]'); await page.keyboard.press('Enter');
    check((await last(page)).text === 'Me duele la cabeza', 'Las zonas se eligen también con el teclado (Intro)');
    await shot(page, 'pain-front-after-back');
  });

  /* ============ 6. Barrido con el botón SELECCIONAR ============ */
  await scenario('6. Barrido con método "botón"', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await openAdvanced(page);
    await page.selectOption('#set-scan-select', 'button');
    await page.click('#btn-home'); await page.click('[data-goto="board"]');
    const h0 = (await hist(page)).length;
    await page.click('#btn-scan'); await sleep(300);
    check(await page.locator('.scan-group-hl').count() >= 1 && await page.locator('.scan-hl').count() === 0, 'El barrido empieza por filas en Frases');
    check(!(await page.evaluate(() => document.body.classList.contains('select-screen'))), 'Con método "botón" el cuerpo no lleva la clase select-screen');
    check((await text(page, '#scan-status')).startsWith('Fila 1 de') && (await text(page, '#scan-status')).endsWith('toca para entrar'), `Estado: "${await text(page, '#scan-status')}"`);
    const cats = await page.locator('#board-cats').boundingBox(); const grid = await page.locator('#board-grid').boundingBox();
    const x = grid.x + grid.width / 2, y = (cats.y + cats.height + grid.y) / 2;
    const under = await page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return e ? (e.id ? '#' + e.id : e.tagName) : null; }, [x, y]);
    info(`Toque "en vacío" sobre ${under}`);
    await page.mouse.click(x, y); await sleep(150);
    check(await page.locator('.scan-hl').count() === 0 && (await hist(page)).length === h0, 'Tocar un hueco de la pantalla NO selecciona');
    await page.click('#btn-settings'); await sleep(150);
    check((await title(page)) === 'Ajustes' && (await hist(page)).length === h0, 'Con método "botón", ⚙️ abre Ajustes con normalidad');
    await page.click('#btn-settings'); await show(page, 'board'); await sleep(300);
    await page.click('#btn-scan-select'); await sleep(150);
    check(await page.locator('.scan-hl').count() === 1, 'El botón SELECCIONAR entra en la fila iluminada');
    await page.click('#btn-scan-pause');
    check((await text(page, '#btn-scan-pause')) === '▶ Seguir' && (await text(page, '#scan-status')).startsWith('Pausado') && await page.locator('.scan-hl, .scan-group-hl').count() === 0, 'Pausa: sin resaltado y botón "Seguir"');
    const tile = page.locator('#board-grid .tile').nth(2);
    const tileLabel = await tile.getAttribute('data-label');
    await tile.click();
    const h = await last(page);
    check((await hist(page)).length === h0 + 1 && h.type === 'phrase' && h.text === tileLabel, `En pausa, tocar una frase funciona con normalidad ("${tileLabel}")`);
    await page.click('#btn-scan-pause'); await sleep(200);
    check((await text(page, '#btn-scan-pause')) === '⏸ Pausa' && await page.locator('.scan-hl, .scan-group-hl').count() >= 1, '"Seguir" reanuda el barrido');
    await page.click('#btn-scan');

    // Flechas y Escape con intervalo largo para que el avance automático no interfiera.
    await page.click('#btn-settings'); await setRange(page, '#set-scan-interval', 5);
    await page.click('#btn-home'); await page.click('[data-goto="board"]');
    await page.click('#btn-scan'); await sleep(200);
    await page.click('#btn-scan-select');
    await sleep(550);   // tras entrar en una fila, el barrido ignora teclas durante 400 ms (pulsador mantenido)
    const st = () => page.evaluate(() => { const s = window.TalkAgain.scanner; const e = document.querySelector('.scan-hl'); return { level: s.level, gi: s.gi, ii: s.ii, n: s.groups[s.gi].length, label: e ? e.dataset.label : null }; });
    const a = await st();
    await page.keyboard.press('ArrowRight'); const b = await st();
    check(a.level === 1 && b.level === 1 && b.ii === (a.ii + 1) % a.n && b.label !== a.label, `→ pasa de "${a.label}" a "${b.label}"`);
    await page.keyboard.press('ArrowLeft'); const c = await st();
    check(c.ii === a.ii && c.label === a.label, `← vuelve a "${c.label}"`);
    await page.keyboard.press('2'); check((await st()).ii === b.ii, 'La tecla "2" (pulsador doble) también avanza');
    await page.keyboard.press('Escape'); await sleep(100);
    check((await st()).level === 0 && await page.locator('.scan-group-hl').count() >= 1 && await page.locator('.scan-hl').count() === 0, 'Escape dentro de una fila vuelve al nivel de filas');
    await page.keyboard.press('Escape'); await sleep(100);
    check((await title(page)) === 'Talk Again' && await page.locator('#view-home').isVisible(), 'Escape en el nivel de filas vuelve a Inicio');
    check(await page.locator('#view-home .scan-hl').count() === 1, 'El barrido continúa en Inicio');
    await page.keyboard.press('Escape'); await sleep(100);
    check((await title(page)) === 'Talk Again' && await page.locator('#view-home .scan-hl').count() === 1, 'Escape en Inicio no hace nada raro: sigue barriendo');
    await page.click('#btn-scan');

    // Pausa automática: 1 vuelta a 0,8 s.
    await page.click('#btn-settings'); await openAdvanced(page); await page.selectOption('#set-scan-loops', '1'); await setRange(page, '#set-scan-interval', 0.8);
    await page.click('#btn-home'); await page.click('[data-goto="board"]');
    await page.click('#btn-scan');
    const t0 = Date.now(); let idle = false;
    while (Date.now() - t0 < 15000) { if ((await text(page, '#scan-status')).includes('En espera')) { idle = true; break; } await sleep(100); }
    check(idle, `Con 1 vuelta y 0,8 s el barrido queda "En espera" (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    check(await page.locator('.scan-hl, .scan-group-hl').count() === 0, 'En espera no hay nada resaltado');
    await shot(page, 'scan-idle');
    await page.keyboard.press('Space'); await sleep(150);
    check(!(await text(page, '#scan-status')).includes('En espera') && await page.locator('.scan-hl, .scan-group-hl').count() >= 1 && (await scanState(page)).state === 'running', 'Espacio reanuda el barrido desde "En espera"');
    check((await hist(page)).length === h0 + 1, 'Reanudar con Espacio no selecciona nada');
  });

  /* ============ 7. Barrido tocando la pantalla, en Sí/No ============ */
  await scenario('7. Barrido con método "pantalla" en Sí/No', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await setRange(page, '#set-scan-interval', 5);
    check((await settingsOf(page)).scanSelect === 'screen', 'El método por defecto es "pantalla"');
    await page.click('#btn-home'); await page.click('[data-goto="yesno"]');
    await page.click('#btn-scan'); await sleep(300);
    check(await page.evaluate(() => document.body.classList.contains('select-screen')), 'El cuerpo lleva la clase select-screen');
    const hl = await page.evaluate(() => { const e = document.querySelector('#view-yesno .scan-hl'); return e ? e.dataset.answer : null; });
    const status = await text(page, '#scan-status');
    const scanSaid = (await spoken(page)).slice(-1)[0];
    check(!EMOJI.test(status) && !EMOJI.test(scanSaid || ''), `La etiqueta del barrido en Sí/No no lleva emoji (estado "${status}", voz "${scanSaid}")`);
    const h0 = (await hist(page)).length;
    await page.click('#view-yesno .hint');
    let h = await last(page);
    check(!!hl && (await hist(page)).length === h0 + 1 && h.type === 'answer' && h.text === hl, `Tocar el párrafo de ayuda elige la respuesta iluminada ("${hl}")`);
    await sleep(1300);   // pasa la ventana de 1 s en la que el barrido ignora selecciones tras activar algo
    const h1 = (await hist(page)).length;
    await page.click('#question-input'); await sleep(150);
    check((await hist(page)).length === h1, 'Tocar el campo de la pregunta no selecciona');
    await page.keyboard.type('hola mundo');
    check((await page.inputValue('#question-input')) === 'hola mundo', 'Escribir en la pregunta (con espacio) funciona durante el barrido');
    check((await hist(page)).length === h1 && (await scanState(page)).active, 'Teclear en la pregunta no dispara selecciones y el barrido sigue activo');
    const spokenBefore = (await spoken(page)).length;
    await page.keyboard.press('Enter'); await sleep(200);
    const sp = (await spoken(page)).slice(spokenBefore);
    h = await last(page);
    check(sp.includes('hola mundo') && (await hist(page)).length === h1, `Intro en la pregunta la lee en voz alta sin seleccionar (pronunciado: ${JSON.stringify(sp)}; historial ${h1}→${(await hist(page)).length}${(await hist(page)).length !== h1 ? ', última: ' + h.type + ' "' + h.text + '"' : ''})`);
    await sleep(1300);
    const h2 = (await hist(page)).length; const sb2 = (await spoken(page)).length;
    await page.click('#btn-ask'); await sleep(200);
    const sp2 = (await spoken(page)).slice(sb2);
    check(sp2.includes('hola mundo') && (await hist(page)).length === h2, `Tocar "🔊 Leer" durante el barrido lee la pregunta sin seleccionar (pronunciado ${JSON.stringify(sp2)})`);
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });   // (tocar la cabecera seleccionaría)
    await sleep(1300);
    const h3 = (await hist(page)).length;
    await page.keyboard.press('Space'); await sleep(150);
    check((await hist(page)).length === h3 + 1 && (await last(page)).q === 'hola mundo', 'Espacio (pulsador) elige y la respuesta guarda la pregunta escrita');
    check((await page.inputValue('#question-input')) === '', 'La pregunta se vacía tras responder');
    await shot(page, 'scan-screen-yesno');
  });

  /* ============ 8. AYUDA ============ */
  await scenario('8. Botón AYUDA: toque corto no, mantener sí, teclado sí', async () => {
    const page = await newPage();
    await page.click('#btn-help'); await sleep(250);
    check((await hist(page)).length === 0 && await page.locator('#flash').isHidden() && !(await toasts(page)).includes('Aviso de AYUDA'), 'Un toque corto en AYUDA no dispara nada');
    const c = await center(page, '#btn-help');
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    const tDown = Date.now();
    await sleep(300);
    check(await hasClass(page, '#btn-help', 'is-holding') && (await hist(page)).length === 0, 'Mientras se mantiene, el botón muestra el progreso (is-holding) y aún no dispara');
    await sleep(550);
    await page.mouse.up();
    check(await page.locator('#flash').isVisible(), 'El destello rojo aparece al mantener 0,6 s');
    const ts = await toastState(page);
    check(ts.visible && ts.text === 'Aviso de AYUDA', 'Aviso "Aviso de AYUDA"');
    const h = await last(page);
    check(h.type === 'help' && h.text === '¡Necesito ayuda!', 'El historial recibe la entrada de ayuda');
    check(await waitSpoken(page, '¡Necesito ayuda, por favor!'), 'Se pronuncia la petición de ayuda');
    check(await hasClass(page, '#btn-help', 'is-cooling'), 'Tras disparar, el botón queda en reposo (is-cooling) 1,5 s');
    await shot(page, 'help-flash');
    let hiddenAt = null;
    while (Date.now() - tDown < 7000) { if (await page.locator('#flash').isHidden()) { hiddenAt = Date.now() - tDown - 600; break; } await sleep(100); }
    check(hiddenAt != null && hiddenAt >= 3500 && hiddenAt <= 5500, `El destello se apaga a los ~4 s (${hiddenAt} ms)`);
    await page.focus('#btn-help'); await page.keyboard.press('Enter'); await sleep(150);
    check((await hist(page)).length === 2 && (await last(page)).type === 'help', 'Con el teclado (Intro sobre el botón) la ayuda se dispara al momento');
    await page.click('[data-goto="history"]');
    check((await page.locator('.hist-item .chip').first().innerText()) === 'AYUDA' && await page.locator('.chip-help').count() === 2, 'Las entradas llevan la etiqueta "AYUDA"');
    await page.click('#btn-home'); await openAdvanced(page); await show(page, 'settings'); await page.uncheck('#set-flash'); await show(page, 'home');
    await page.locator('#flash').waitFor({ state: 'hidden', timeout: 6000 });   // se apaga el destello anterior y pasa el reposo de 1,5 s
    await holdHelp(page);
    check((await hist(page)).length === 3 && await page.locator('#flash').isHidden(), 'Sin la opción de destello, la ayuda suena y se registra pero no destella');
  });

  /* ============ 9. Texto "Enorme" en móvil y tableta ============ */
  for (const vp of [{ w: 400, h: 780, name: 'phone' }, { w: 820, h: 1180, name: 'ipad' }]) {
    await scenario(`9. Texto "Enorme" (1.6) en ${vp.w}×${vp.h}`, async () => {
      const page = await newPage({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
      check(await page.locator('.mode-tile').count() === 7, 'Inicio muestra 7 modos');
      await page.click('#btn-settings'); await page.selectOption('#set-scale', '1.6');
      check((await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === '25.6px', 'Enorme = 25,6 px de base');
      for (const v of ['home', 'yesno', 'board', 'build', 'spell', 'pain', 'history', 'settings']) {
        await show(page, v); await sleep(200);
        const r = await overflow(page);
        check(fits(r), `Sin desbordamiento horizontal en ${v} (${await fitsMsg(page, r)})`);
        const clipped = await clippedIn(page);
        if (clipped.length) info(`${v}: ${clipped.join(' | ')}`);
        if (v === 'pain') {
          const m = await painMeasure(page);
          check(painOk(m), `Dolor: ${painFmt(m)}`);
        }
        await shot(page, `enorme-${vp.name}-${v}`);
      }
      await show(page, 'board'); await page.click('[data-cat="necesidades"]'); await sleep(150);
      await shot(page, `enorme-${vp.name}-board-necesidades`);
      await show(page, 'home'); await page.click('#btn-scan'); await sleep(300);
      const r2 = await overflow(page);
      const sb = await page.evaluate(() => {
        const s = document.getElementById('scanbar'), b = document.getElementById('btn-scan-select'), p = document.getElementById('btn-scan-pause');
        const rb = b.getBoundingClientRect(), rp = p.getBoundingClientRect();
        return { sw: s.scrollWidth, cw: s.clientWidth, selRight: Math.round(rb.right), selOver: b.scrollWidth - b.clientWidth, pauseOver: p.scrollWidth - p.clientWidth, overlap: Math.round(rp.right - rb.left) };
      });
      check(r2.sw <= r2.cw && sb.sw <= sb.cw && sb.selRight <= vp.w && sb.selOver <= 1 && sb.pauseOver <= 1 && sb.overlap <= 0,
        `Barra de barrido sin desbordamiento y con los textos enteros (barra ${sb.sw}/${sb.cw}, SELECCIONAR termina en ${sb.selRight}, texto sobrante ${sb.selOver}/${sb.pauseOver} px, solape ${sb.overlap} px)`);
      const need = await page.evaluate(() => {
        const w = sel => document.querySelector(sel).getBoundingClientRect().width;
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const topbar = w('#btn-home') + w('#btn-scan') + w('#btn-help') + w('#btn-settings') + 3 * 0.35 * rem + 2 * 0.6 * rem;
        const scanbar = w('#btn-scan-pause') + w('#btn-scan-select') + 0.6 * rem + 2 * rem;
        return { topbar: Math.round(topbar), scanbar: Math.round(scanbar) };
      });
      info(`Anchura mínima necesaria con ${vp.w} px disponibles: barra superior (sin título) ${need.topbar} px, barra de barrido ${need.scanbar} px`);
      const clipped = await clippedIn(page);
      if (clipped.length) info(`barrido: ${clipped.join(' | ')}`);
      await shot(page, `enorme-${vp.name}-scanbar`);
      await page.click('#btn-scan');
    });
  }
  await scenario('9b. Barra superior en 400 px con cada tamaño de texto', async () => {
    const page = await newPage({ viewport: { width: 400, height: 780 }, isMobile: true, hasTouch: true });
    for (const sc of ['1', '1.2', '1.4', '1.6']) {
      await show(page, 'settings'); await page.selectOption('#set-scale', sc); await show(page, 'home'); await sleep(100);
      const r = await overflow(page);
      const gear = await page.locator('#btn-settings').boundingBox();
      const help = await page.locator('#btn-help').boundingBox();
      const helpOver = await page.evaluate(() => { const b = document.getElementById('btn-help'); return b.scrollWidth - b.clientWidth; });
      check(r.sw <= r.cw && r.hw <= r.hc && gear && gear.x + gear.width <= r.cw + 0.5 && help && help.x + help.width <= r.cw + 0.5 && helpOver <= 1, `Tamaño ${sc}: barra superior ${r.hw}/${r.hc}, documento ${r.sw}/${r.cw}, ⚙️ termina en x=${gear ? Math.round(gear.x + gear.width) : '?'}, AYUDA en x=${help ? Math.round(help.x + help.width) : '?'} con el texto entero (sobrante ${helpOver} px)`);
      const clipped = await clippedIn(page);
      if (clipped.length) info(`tamaño ${sc}: ${clipped.join(' | ')}`);
      await shot(page, `topbar-400-scale-${sc}`);
    }
  });
  await scenario('9c. Dolor en 820 px (iPad) con cada tamaño de texto', async () => {
    const page = await newPage({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
    for (const sc of ['1', '1.2', '1.4', '1.6']) {
      await show(page, 'settings'); await page.selectOption('#set-scale', sc); await show(page, 'pain'); await sleep(150);
      const m = await painMeasure(page); const r = await overflow(page);
      check(painOk(m) && fits(r), `Tamaño ${sc}: ${painFmt(m)}; columna izquierda ${m.bodyH} px, derecha ${m.scaleH} px; ${fmt(r)}`);
      await shot(page, `pain-820-scale-${sc}`);
    }
  });
  await scenario('9d. Móvil 400 px: ninguna pantalla desborda con ningún tamaño de texto', async () => {
    const page = await newPage({ viewport: { width: 400, height: 780 }, isMobile: true, hasTouch: true });
    for (const sc of ['1', '1.2', '1.4', '1.6']) {
      await show(page, 'settings'); await page.selectOption('#set-scale', sc);
      const bad = [];
      for (const v of ['home', 'yesno', 'board', 'build', 'spell', 'pain', 'history', 'settings']) {
        await show(page, v); await sleep(120);
        const r = await overflow(page);
        if (!fits(r)) bad.push(`${v} (${await fitsMsg(page, r)})`);
        if (v === 'pain') { const m = await painMeasure(page); if (!painOk(m)) bad.push(`pain: ${painFmt(m)}`); }
      }
      check(bad.length === 0, `Tamaño ${sc}: todas las pantallas caben en 400 px` + (bad.length ? ': ' + bad.join(' | ') : ''));
    }
    await show(page, 'board'); await page.click('#btn-scan'); await sleep(250);
    const r = await overflow(page);
    check(fits(r), `Barrido activo en Frases con texto enorme: ${fmt(r)}`);
    await shot(page, 'mobile-400-board-scan-xl');
    await page.click('#btn-scan');
  });

  /* ============ 11. Tema ============ */
  await scenario('11. Tema: cristal oscuro por defecto, claro y como el dispositivo', async () => {
    const page = await newPage();   // newPage emula un dispositivo en claro
    const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check((await attr()) === 'dark' && (await scheme()) === 'dark', 'Por defecto: cristal oscuro (data-theme="dark", color-scheme dark) aunque el dispositivo esté en claro');
    const bgDark = await bg();
    await page.click('#btn-settings'); await page.selectOption('#set-theme', 'light');
    const bgLight = await bg();
    check((await attr()) === 'light' && (await scheme()) === 'light' && bgLight !== bgDark, `"Cristal claro" cambia el fondo (${bgDark} → ${bgLight})`);
    await shot(page, 'theme-light-settings');
    await page.selectOption('#set-theme', 'system');
    check(!(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))) && (await scheme()) === 'light' && (await bg()) === bgLight, '"Como el dispositivo" quita data-theme y sigue al dispositivo (claro)');
    await page.emulateMedia({ colorScheme: 'dark' });
    check((await scheme()) === 'dark' && (await bg()) === bgDark, 'Con el dispositivo en oscuro, "Como el dispositivo" se ve oscuro');
    await page.selectOption('#set-theme', 'light');
    check((await bg()) === bgLight && (await attr()) === 'light', '"Cristal claro" fuerza el tema claro aunque el dispositivo esté en oscuro');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.selectOption('#set-theme', 'dark');
    check((await bg()) === bgDark && (await attr()) === 'dark', '"Cristal oscuro" fuerza el oscuro aunque el dispositivo esté en claro');
    await page.selectOption('#set-theme', 'light');
    await page.reload({ waitUntil: 'load' });
    check((await attr()) === 'light', 'El tema persiste tras recargar');
  });

  /* ============ 12. Restablecer todo ============ */
  await scenario('12. Restablecer todo', async () => {
    const page = await newPage();
    await page.click('[data-goto="yesno"]'); await page.click('.answer-no');
    await page.click('#btn-settings'); await page.selectOption('#set-scale', '1.6'); await page.fill('#set-people', 'Mi hermano');
    const keys = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('talkagain.')));
    const k0 = await keys();
    check(k0.length >= 2, `Hay datos guardados antes de restablecer: ${k0.join(', ')}`);
    await openAdvanced(page);
    await page.click('#btn-reset-all');
    check(await page.locator('#reset-confirm').isVisible(), '"Restablecer todo" pide confirmación');
    await page.click('#btn-reset-no');
    check(await page.locator('#reset-confirm').isHidden() && (await keys()).length === k0.length, '"Cancelar" no borra nada');
    await page.click('#btn-reset-all');
    await Promise.all([page.waitForEvent('load'), page.click('#btn-reset-yes').catch(() => {})]);
    const k1 = await keys();
    check(k1.length === 0, `Tras confirmar y recargar no queda ninguna clave talkagain.* (${k1.join(', ') || 'ninguna'})`);
    const s = await settingsOf(page);
    check(s.scale === '1.2' && (await cssScale(page)) === '1.2' && (await hist(page)).length === 0 && s.people === '', 'La app arranca con los valores por defecto (texto Grande 1.2) y sin historial');
  });

  /* ============ 13. Toques cortos, doble toque, Hablar sin texto ============ */
  await scenario('13. Toques: muy cortos ignorados, doble toque no repite, Hablar sin texto', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await setRange(page, '#set-min-touch', 0.3);
    check((await text(page, '#set-min-touch-out')) === '0,30 s' && (await settingsOf(page)).minTouchMs === 0.3, 'Ajuste "Ignorar toques más cortos de 0,30 s"');
    await show(page, 'board');
    const tile = page.locator('#board-grid .tile').nth(5); const label = await tile.getAttribute('data-label');
    await tile.click(); await sleep(120);
    check((await hist(page)).length === 0, 'Un toque instantáneo se ignora');
    await tile.click({ delay: 400 }); await sleep(120);
    check((await hist(page)).length === 1 && (await last(page)).text === label, `Un toque de 0,4 s sí elige ("${label}")`);
    await show(page, 'home'); await page.click('[data-goto="yesno"]'); await sleep(120);
    info(`Con 0,3 s, un toque instantáneo en el modo "Sí / No" de Inicio ${(await title(page)) === 'Sí / No' ? 'SÍ navega' : 'también se ignora (los botones de Inicio son opciones de barrido)'}`);
    await page.click('[data-goto="yesno"]', { delay: 400 });
    check((await title(page)) === 'Sí / No', 'Un toque de 0,4 s en Inicio navega');
    await page.click('#btn-home', { delay: 10 });
    check((await title(page)) === 'Talk Again', 'Los botones de la cabecera (🏠) no se ven afectados por el filtro de toques cortos');
    // Doble toque por temblor: una sola entrada.
    await setRange(page, '#set-min-touch', 0);
    await show(page, 'board');
    const box = await tile.boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const t0 = Date.now();
    await page.mouse.click(cx, cy); await page.mouse.click(cx, cy);
    const dt = Date.now() - t0;
    await sleep(120);
    let h = await hist(page);
    check(h.length === 2 && h[1].text === label, `Dos toques seguidos (${dt} ms) dejan una sola entrada nueva (${h.length - 1})`);
    await sleep(500); await page.mouse.click(cx, cy); await sleep(120);
    check((await hist(page)).length === 3, 'Pasado medio segundo, otro toque sí repite la frase');
    const other = page.locator('#board-grid .tile').nth(6); const ob = await other.boundingBox();
    await page.mouse.click(ob.x + ob.width / 2, ob.y + ob.height / 2); await sleep(120);
    check((await hist(page)).length === 4 && (await last(page)).text === await other.getAttribute('data-label'), 'Un toque rápido en OTRA frase sí se registra (el filtro solo frena la repetición)');
    // Hablar / guardar sin texto
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    await page.click('.key[data-action="speak"]');
    let ts = await toastState(page);
    check(ts.visible && ts.text === 'No hay nada escrito todavía', 'Hablar sin texto avisa "No hay nada escrito todavía"');
    check((await hist(page)).length === 4, 'Hablar sin texto no añade nada al historial');
    await page.evaluate(() => { document.getElementById('toast').classList.remove('is-visible'); document.getElementById('toast').textContent = ''; });
    await page.click('#btn-spell-speak-top');
    ts = await toastState(page);
    check(ts.visible && ts.text === 'No hay nada escrito todavía', 'El botón "Hablar" superior avisa igual');
    await page.click('.key[data-action="save"]');
    check((await toastState(page)).text === 'Escribe algo antes de guardar', 'Guardar sin texto avisa');
    await show(page, 'build'); await page.click('#btn-build-speak');
    check((await toastState(page)).text === 'Elige el comienzo y la continuación', 'Hablar en Armar frase sin frase avisa');
  });

  /* ============ 14. Modo deslizar y soltar ============ */
  await scenario('14. Tacto "deslizar y soltar"', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await page.selectOption('#set-touch-mode', 'drag');
    await show(page, 'board');
    check(await page.locator('#dragbar').isVisible() && await page.evaluate(() => document.body.classList.contains('touch-drag')), 'Barra ▲ ▼ visible y cuerpo en modo deslizar');
    check((await text(page, '#drag-status')) === 'Desliza el dedo y suelta sobre la opción', 'Instrucción del modo deslizar');
    const tiles = page.locator('#board-grid .tile');
    const b1 = await tiles.nth(0).boundingBox(), b2 = await tiles.nth(3).boundingBox();
    const label2 = await tiles.nth(3).getAttribute('data-label');
    const sp0 = (await spoken(page)).length;
    await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await page.mouse.down(); await sleep(60);
    check(await tiles.nth(0).evaluate(e => e.classList.contains('drag-hl')), 'Al apoyar el dedo, la opción de debajo se ilumina');
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 10 }); await sleep(60);
    check(await tiles.nth(3).evaluate(e => e.classList.contains('drag-hl')) && !(await tiles.nth(0).evaluate(e => e.classList.contains('drag-hl'))), 'Al deslizar, la iluminación sigue al dedo');
    check((await text(page, '#drag-status')) === label2, `La barra inferior muestra la opción bajo el dedo ("${label2}")`);
    check((await spoken(page)).slice(sp0).includes(label2), 'La opción bajo el dedo se lee en voz alta');
    check((await hist(page)).length === 0, 'Mientras se desliza no se elige nada');
    await page.mouse.up(); await sleep(150);
    let h = await hist(page);
    check(h.length === 1 && h[0].text === label2, 'Soltar sobre la opción la elige exactamente una vez');
    check(await page.locator('.drag-hl').count() === 0 && (await text(page, '#drag-status')) === 'Desliza el dedo y suelta sobre la opción', 'Al soltar desaparece la iluminación y vuelve la instrucción');
    const views = await page.locator('#views').boundingBox();
    await page.mouse.move(b1.x + 10, b1.y + 10); await page.mouse.down();
    await page.mouse.move(views.x + 4, views.y + views.height / 2, { steps: 6 }); await sleep(60);
    check(await page.locator('.drag-hl').count() === 0, 'Fuera de las opciones no hay iluminación');
    await page.mouse.up(); await sleep(150);
    check((await hist(page)).length === 1, 'Soltar fuera de las opciones no elige nada');
    const cat = await center(page, '[data-cat="sentimientos"]');
    await pressAt(page, cat.x, cat.y, 30); await sleep(150);
    check(await page.locator('#board-grid .tile.k-feel').count() >= 10 && (await hist(page)).length === 1, 'Apoyar y soltar sobre una categoría la abre sin añadir nada al historial');
    // Botones normales (sin data-scan) con un toque corriente
    await show(page, 'history');
    await page.click('#btn-copy-history'); await sleep(250);
    check((await toastState(page)).text === 'Historial copiado', '"📋 Copiar" funciona con un toque normal en modo deslizar');
    await page.click('#btn-clear-history');
    check(await page.locator('#history-confirm').isVisible(), '"🗑 Borrar todo" abre la confirmación');
    await page.click('#btn-clear-no');
    await show(page, 'yesno');
    await page.fill('#question-input', '¿Quieres agua?');
    const sb = (await spoken(page)).length;
    await page.click('#btn-ask');
    check(await waitSpoken(page, '¿Quieres agua?', sb), '"🔊 Leer" lee la pregunta con un toque normal');
    check((await hist(page)).length === 1, 'Leer la pregunta no añade nada al historial');
    const yes = await center(page, '.answer-yes');
    await pressAt(page, yes.x, yes.y, 30); await sleep(150);
    check((await hist(page)).length === 2 && (await last(page)).text === 'Sí' && (await last(page)).q === '¿Quieres agua?', 'Apoyar y soltar sobre SÍ responde y guarda la pregunta');
    await show(page, 'build');
    await page.click('#build-starts [data-start="0"]'); await sleep(100); await page.click('#build-nexts [data-next="agua"]'); await sleep(150);
    check((await text(page, '#build-sentence')) === 'Quiero agua' && (await last(page)).text === 'Quiero agua', 'En modo deslizar se arma "Quiero agua" apoyando y soltando');
    await page.click('#btn-build-new'); await sleep(150);
    check(await page.locator('#build-step-1').isVisible() && (await text(page, '#build-sentence')) === '' && (await hist(page)).length === 3, '"🆕 Otra frase" vuelve al paso 1 con un toque normal');
    await show(page, 'spell');
    await pressAt(page, ...Object.values(await center(page, '.key[data-key="H"]')), 30);
    await pressAt(page, ...Object.values(await center(page, '.key[data-key="O"]')), 30);
    check((await page.evaluate(() => document.getElementById('spell-output').textContent)) === 'ho', 'El teclado de Deletrear funciona apoyando y soltando');
    await shot(page, 'drag-spell');
    // ▲ ▼ desplazan la pantalla cuando no cabe
    await page.setViewportSize({ width: 1280, height: 500 }); await show(page, 'spell'); await sleep(200);
    const st0 = await page.evaluate(() => document.getElementById('views').scrollTop);
    await page.click('#btn-drag-down'); await sleep(600);
    const st1 = await page.evaluate(() => document.getElementById('views').scrollTop);
    check(st1 > st0, `▼ baja la pantalla (${st0} → ${st1})`);
    await page.click('#btn-drag-up'); await sleep(600);
    check((await page.evaluate(() => document.getElementById('views').scrollTop)) < st1, '▲ la sube');
  });

  /* ============ 15. Modo deslizar y dejar quieto ============ */
  await scenario('15. Tacto "deslizar y dejar quieto" (0,4 s)', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await page.selectOption('#set-touch-mode', 'dwell'); await setRange(page, '#set-dwell', 0.4);
    check((await text(page, '#set-dwell-out')) === '0,4' && (await settingsOf(page)).dwellMs === 400 && (await page.evaluate(() => document.documentElement.style.getPropertyValue('--dwell-ms'))) === '400ms', 'Tiempo quieto 0,4 s aplicado (dwellMs 400, --dwell-ms 400ms)');
    await show(page, 'board');
    check((await text(page, '#drag-status')) === 'Desliza el dedo y déjalo quieto sobre la opción', 'Instrucción del modo quieto');
    const tile = i => page.locator('#board-grid .tile').nth(i);
    const c1 = await center(page, '#board-grid .tile >> nth=1'), c2 = await center(page, '#board-grid .tile >> nth=2');
    const l1 = await tile(1).getAttribute('data-label'), l2 = await tile(2).getAttribute('data-label');
    await page.mouse.move(c1.x, c1.y); await page.mouse.down(); await sleep(150);
    check(await tile(1).evaluate(e => e.classList.contains('drag-hl') && e.classList.contains('dwell-anim')), 'La opción se ilumina y muestra la animación de espera');
    check((await hist(page)).length === 0, 'A los 0,15 s todavía no elige');
    await sleep(450);
    check((await hist(page)).length === 1 && (await last(page)).text === l1, `Tras 0,4 s quieto elige la opción ("${l1}")`);
    await sleep(800);
    check((await hist(page)).length === 1, 'Seguir quieto no repite');
    await page.mouse.move(c2.x, c2.y, { steps: 5 }); await sleep(650);
    check((await hist(page)).length === 1 && !(await tile(2).evaluate(e => e.classList.contains('drag-hl'))), 'Sin levantar el dedo, pasar a otra opción no la elige ni la ilumina');
    await page.mouse.up(); await sleep(100);
    check(await page.locator('.drag-hl').count() === 0, 'Al levantar el dedo desaparece la iluminación');
    await page.mouse.down(); await sleep(650);
    check((await hist(page)).length === 2 && (await last(page)).text === l2, `Tras levantar y apoyar de nuevo, vuelve a elegir ("${l2}")`);
    await page.mouse.up(); await sleep(100);
    // Mover antes de que pase el tiempo: no elige la primera
    await page.mouse.move(c1.x, c1.y); await page.mouse.down(); await sleep(200); await page.mouse.move(c2.x, c2.y, { steps: 4 }); await sleep(250);
    check((await hist(page)).length === 2 && await tile(2).evaluate(e => e.classList.contains('drag-hl')), 'Si el dedo se mueve antes de 0,4 s, la espera empieza de nuevo sobre la nueva opción');
    await sleep(350);
    check((await hist(page)).length === 3 && (await last(page)).text === l2, 'y la nueva opción se elige al cumplirse el tiempo quieto');
    await page.mouse.up(); await sleep(100);
    // Inicio → Frases con reposo; temblor de 3 px con el dedo apoyado
    await show(page, 'home');
    const f = await center(page, '[data-goto="board"]');
    await page.mouse.move(f.x, f.y); await page.mouse.down(); await sleep(650);
    check((await title(page)) === 'Frases', 'Reposo sobre "Frases" abre el tablero');
    check(await page.locator('.drag-hl').count() === 0, 'Nada iluminado en la pantalla nueva mientras el dedo sigue apoyado');
    await page.mouse.move(f.x + 3, f.y + 3); await sleep(700);
    check((await hist(page)).length === 3 && await page.locator('.drag-hl').count() === 0, 'Un temblor de 3 px tras cambiar de pantalla no elige ni ilumina nada');
    await page.mouse.up(); await sleep(100);
    const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const t = e && e.closest('[data-scan]'); return t ? t.dataset.label : null; }, [f.x + 3, f.y + 3]);
    if (under) {
      await page.mouse.down(); await sleep(650);
      check((await hist(page)).length === 4 && (await last(page)).text === under, `Al apoyar de nuevo sí elige lo que hay debajo ("${under}")`);
      await page.mouse.up();
    } else info('Bajo el dedo no quedó ninguna opción tras cambiar de pantalla');
    await shot(page, 'dwell-board');
    // Un toque corriente (apoyar y soltar enseguida) no elige en modo quieto
    await show(page, 'yesno');
    const yes = await center(page, '.answer-yes');
    await pressAt(page, yes.x, yes.y, 40); await sleep(200);
    check((await hist(page)).filter(x => x.type === 'answer').length === 0, 'En modo quieto, un toque corto no responde');
    await page.fill('#question-input', '¿Tienes frío?');
    check((await page.inputValue('#question-input')) === '¿Tienes frío?', 'El campo de la pregunta sigue aceptando texto en modo quieto');
  });

  /* ============ 16. Hombre / Mujer ============ */
  await scenario('16. Hombre / Mujer', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await page.click('#set-gender-f');
    check((await settingsOf(page)).gender === 'f' && (await page.getAttribute('#set-gender-f', 'aria-checked')) === 'true' && (await page.getAttribute('#set-gender-m', 'aria-checked')) === 'false', '"Mujer" queda marcado');
    await show(page, 'board'); await page.click('[data-cat="sentimientos"]');
    let labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(labels.includes('Estoy enojada') && labels.includes('Estoy cansada') && !labels.includes('Estoy enojado'), 'Sentimientos en femenino: "Estoy enojada", "Estoy cansada"');
    check((await page.getAttribute('#board-grid .tile[data-label="Estoy frustrada"]', 'data-say')) === 'Estoy frustrada, no me entienden', 'La locución también cambia de género');
    await page.click('[data-cat="rapidas"]');
    check((await page.locator('#board-grid .tile[data-label="Quiero estar sola"]').count()) === 1, 'Rápidas: "Quiero estar sola"');
    await page.click('[data-cat="necesidades"]');
    check((await page.getAttribute('#board-grid .tile[data-label="Estoy mojada"]', 'data-say')) === 'Estoy mojada, necesito que me cambien', 'Necesidades: "Estoy mojada"');
    await show(page, 'build'); await page.click('#build-starts [data-start="7"]');   // Estoy
    const nexts = await page.locator('#build-nexts .tile').evaluateAll(ts => ts.map(t => t.dataset.next));
    check(nexts.includes('cansada') && nexts.includes('nerviosa') && !nexts.includes('cansado'), `Armar frase "Estoy…" ofrece "cansada" (${nexts.slice(0, 6).join(', ')}…)`);
    await page.click('#build-nexts [data-next="cansada"]');
    check((await text(page, '#build-sentence')) === 'Estoy cansada' && (await last(page)).text === 'Estoy cansada' && await waitSpoken(page, 'Estoy cansada'), 'Se arma, registra y pronuncia "Estoy cansada"');
    await show(page, 'pain');
    info(`Frases rápidas de Dolor con "Mujer": ${(await page.locator('#pain-quick .tile').evaluateAll(ts => ts.map(t => t.dataset.label))).join(' / ')}`);
    await show(page, 'settings'); await page.selectOption('#edit-cat', 'sentimientos');
    const vals = await page.locator('#edit-list .edit-text').evaluateAll(is => is.map(i => i.value));
    const says = await page.locator('#edit-list .edit-say').evaluateAll(is => is.map(i => i.value));
    check(vals.includes('Estoy enojado/a') && says.includes('Estoy nervioso/a y ansioso/a'), 'El editor muestra las dos terminaciones ("Estoy enojado/a") en vez de fijar un género');
    await page.click('#set-gender-m');
    await show(page, 'board'); await page.click('[data-cat="sentimientos"]');
    labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(labels.includes('Estoy enojado') && !labels.includes('Estoy enojada'), '"Hombre" vuelve a "Estoy enojado"');
    await show(page, 'build'); await page.click('#btn-build-new'); await page.click('#build-starts [data-start="7"]');
    check((await page.locator('#build-nexts [data-next="cansado"]').count()) === 1, 'Armar frase vuelve a "cansado"');
    await show(page, 'settings'); await page.click('#set-gender-f');
    await page.reload({ waitUntil: 'load' });
    check((await settingsOf(page)).gender === 'f', 'El género persiste tras recargar');
    // Editar una frase conserva la terminación variable "o/a"
    await page.click('#btn-settings'); await page.selectOption('#edit-cat', 'sentimientos');
    const idx = (await page.locator('#edit-list .edit-text').evaluateAll(is => is.map(i => i.value))).indexOf('Estoy enojado/a');
    check(idx >= 0, 'La fila "Estoy enojado/a" existe en el editor');
    await page.locator('#edit-list .edit-text').nth(idx).fill('Estoy enojado/a hoy');
    await show(page, 'board'); await page.click('[data-cat="sentimientos"]');
    labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(labels[idx] === 'Estoy enojada hoy', `Con "Mujer", la frase editada se lee "Estoy enojada hoy" (${labels[idx]})`);
    await show(page, 'settings'); await page.click('#set-gender-m');
    await show(page, 'board'); await page.click('[data-cat="sentimientos"]');
    labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(labels[idx] === 'Estoy enojado hoy' && labels.find(l => l.startsWith('Estoy cans')) === 'Estoy cansado', `Con "Hombre", la editada vuelve a "Estoy enojado hoy" y las demás también cambian (${labels[idx]})`);
  });

  /* ============ 17. Personas importantes y gramática ============ */
  await scenario('17. Personas importantes y gramática de Armar frase', async () => {
    const page = await newPage();
    const defPersonas = await page.evaluate(() => window.TA_DATA.categories.find(c => c.id === 'personas').items.length);
    await page.click('#btn-settings'); await page.fill('#set-people', 'Mi esposa Ana');
    await show(page, 'board'); await page.click('[data-cat="personas"]');
    const tiles = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => ({ label: t.dataset.label, say: t.dataset.say, emoji: (t.querySelector('.tile-emoji') || {}).textContent })));
    check(tiles.length === defPersonas + 2, `Personas tiene ${defPersonas} frases fijas + 2 por persona (${tiles.length}); «Mi» pasa a minúscula dentro de la frase`);
    check(tiles[0].label === 'Ver a mi esposa Ana' && tiles[0].say === 'Quiero ver a mi esposa Ana' && tiles[0].emoji === '👤', `Primera: "${tiles[0].label}" dice "${tiles[0].say}"`);
    check(tiles[1].label === 'Llamar a mi esposa Ana' && tiles[1].say === 'Llamen a mi esposa Ana, por favor' && tiles[1].emoji === '📞', `Segunda: "${tiles[1].label}" dice "${tiles[1].say}"`);
    const sb = (await spoken(page)).length;
    await page.locator('#board-grid .tile').nth(1).click();
    check(await waitSpoken(page, 'Llamen a mi esposa Ana, por favor', sb) && (await last(page)).text === 'Llamar a mi esposa Ana', 'Tocar "Llamar a…" lo pronuncia y registra');
    await show(page, 'build');
    await page.click('#build-starts [data-start="5"]');   // Quiero ver a
    let nexts = await page.locator('#build-nexts .tile').evaluateAll(ts => ts.map(t => t.dataset.next));
    check(nexts[0] === 'mi esposa Ana' && nexts.includes('el médico'), `"Quiero ver a…" ofrece primero a la persona (${nexts.slice(0, 4).join(', ')})`);
    await page.click('#build-nexts [data-next="mi esposa Ana"]');
    check((await text(page, '#build-sentence')) === 'Quiero ver a mi esposa Ana', 'Frase: "Quiero ver a Mi esposa Ana"');
    await page.click('#btn-build-new'); await page.click('#build-starts [data-start="5"]'); await page.click('#build-nexts [data-next="el médico"]');
    check((await text(page, '#build-sentence')) === 'Quiero ver al médico' && (await last(page)).text === 'Quiero ver al médico' && await waitSpoken(page, 'Quiero ver al médico'), 'Gramática: "Quiero ver a" + "el médico" → "Quiero ver al médico" (se registra y pronuncia así)');
    await page.click('#btn-build-new'); await page.click('#build-starts [data-start="6"]');   // Llamen a
    nexts = await page.locator('#build-nexts .tile').evaluateAll(ts => ts.map(t => t.dataset.next));
    check(nexts[0] === 'mi esposa Ana', '"Llamen a…" también ofrece a la persona primero');
    await page.click('#build-nexts [data-next="el médico"]');
    check((await text(page, '#build-sentence')) === 'Llamen al médico', 'Gramática: "Llamen al médico"');
    await page.click('#btn-build-new'); await page.click('#build-starts [data-start="4"]'); await page.click('#build-nexts [data-next="al médico"]');
    check((await text(page, '#build-sentence')) === 'Necesito al médico', 'Gramática: "Necesito al médico" (sin duplicar)');
    await page.click('#btn-build-new'); await page.click('#build-starts [data-start="8"]');   // ¿Puedo
    await page.click('#build-nexts [data-next="beber?"]');
    check((await text(page, '#build-sentence')) === '¿Puedo beber?', 'Pregunta: "¿Puedo beber?"');
    await page.click('#build-mods [data-mod="ahora"]');
    check((await text(page, '#build-sentence')) === '¿Puedo beber ahora?' && (await last(page)).text === '¿Puedo beber ahora?', 'Con añadido: "¿Puedo beber ahora?"');
    await page.click('#build-mods [data-mod="por favor"]');
    check((await text(page, '#build-sentence')) === '¿Puedo beber ahora, por favor?', 'Dos añadidos: "¿Puedo beber ahora, por favor?" (por favor siempre al final, con coma)');
    await page.click('#build-mods [data-mod="ahora"]');
    check((await text(page, '#build-sentence')) === '¿Puedo beber, por favor?' && (await page.getAttribute('#build-mods [data-mod="ahora"]', 'aria-pressed')) === 'false', 'Quitar un añadido lo desmarca: "¿Puedo beber, por favor?"');
    await page.click('#btn-build-save');
    check((await toastState(page)).text === 'Guardada en «Frases guardadas» de Deletrear', 'Guardar la pregunta avisa');
    await show(page, 'spell');
    check((await page.locator('.saved-chip .saved-say').allTextContents()).includes('¿Puedo beber, por favor?'), 'La pregunta guardada aparece en Deletrear');
    // Varias personas, líneas vacías y espacios
    await show(page, 'settings'); await page.fill('#set-people', 'Mi esposa Ana\n\n   Mi hijo Luis   \n');
    await show(page, 'board'); await page.click('[data-cat="personas"]');
    const labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(labels.slice(0, 4).join(' | ') === 'Ver a mi esposa Ana | Llamar a mi esposa Ana | Ver a mi hijo Luis | Llamar a mi hijo Luis' && labels.length === defPersonas + 4, `Dos personas → cuatro frases, sin líneas vacías ni espacios sobrantes (${labels.slice(0, 4).join(' | ')})`);
    await shot(page, 'board-personas');
  });

  /* ============ 18. Editor: reordenar, "Lo que se dice", Restaurar ============ */
  await scenario('18. Editor: reordenar ↑/↓, "Lo que se dice", Restaurar en dos toques', async () => {
    const page = await newPage();
    await page.click('#btn-settings');
    check((await page.inputValue('#edit-cat')) === 'rapidas', 'El editor empieza en "Rápidas"');
    const names = () => page.locator('#edit-list .edit-text').evaluateAll(is => is.map(i => i.value));
    const n0 = await names();
    check(await page.evaluate(() => document.querySelector('#edit-list .edit-row:first-child [data-move="up"]').disabled && document.querySelector('#edit-list .edit-row:last-child [data-move="down"]').disabled), '↑ de la primera fila y ↓ de la última están desactivados');
    await page.click('#edit-list .edit-row:nth-child(2) [data-move="down"]');
    const n1 = await names();
    check(n1[1] === n0[2] && n1[2] === n0[1] && n1.length === n0.length, `↓ intercambia "${n0[1]}" con "${n0[2]}"`);
    check(await page.evaluate(() => document.activeElement === document.querySelector('#edit-list [data-move="down"][data-idx="2"]')), 'El foco sigue a la fila movida');
    await page.click('#edit-list .edit-row:nth-child(1) [data-move="down"]');
    const n2 = await names();
    check(n2[0] === n0[2] && n2[1] === n0[0], `Otro ↓ deja "${n2[0]}", "${n2[1]}", "${n2[2]}"`);
    await page.click('#edit-list .edit-row:nth-child(3) [data-move="up"]');
    const n3 = await names();
    check(n3[1] === n0[1] && n3[2] === n0[0], `↑ sube "${n0[1]}" a la segunda posición`);
    await page.reload({ waitUntil: 'load' }); await page.click('#btn-settings');
    check(JSON.stringify(await names()) === JSON.stringify(n3), 'El orden nuevo persiste tras recargar');
    await show(page, 'board');
    const labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(JSON.stringify(labels.slice(0, 3)) === JSON.stringify(n3.slice(0, 3)), `El tablero sigue el orden nuevo (${labels.slice(0, 3).join(', ')})`);
    // "Lo que se dice"
    await show(page, 'settings');
    const idxSi = (await names()).indexOf('Sí');
    await page.locator('#edit-list .edit-row').nth(idxSi).locator('.edit-say').fill('Sí, claro que sí');
    await show(page, 'board');
    const si = page.locator('#board-grid .tile[data-label="Sí"]');
    check((await si.getAttribute('data-say')) === 'Sí, claro que sí', 'La locución nueva llega al tablero');
    const sb = (await spoken(page)).length;
    await si.click();
    check(await waitSpoken(page, 'Sí, claro que sí', sb) && (await last(page)).text === 'Sí', 'Se pronuncia "Sí, claro que sí" y el historial guarda "Sí"');
    await show(page, 'settings');
    await page.locator('#edit-list .edit-row').nth(idxSi).locator('.edit-say').fill('');
    await show(page, 'board');
    check((await si.getAttribute('data-say')) === 'Sí', 'Al vaciar "Lo que se dice" se vuelve a leer el texto del botón');
    // Restaurar en dos toques
    await show(page, 'settings');
    await page.click('#btn-edit-restore');
    check((await text(page, '#btn-edit-restore')) === '¿Seguro? Toca otra vez para restaurar', 'Primer toque: pide confirmación');
    await sleep(4300);
    check((await text(page, '#btn-edit-restore')) === '↩ Restaurar esta categoría' && JSON.stringify(await names()) === JSON.stringify(n3), 'Sin segundo toque en 4 s no restaura y el botón vuelve a su texto');
    await page.click('#btn-edit-restore'); await sleep(1500); await page.click('#btn-edit-restore');
    check(JSON.stringify(await names()) === JSON.stringify(n0) && (await toastState(page)).text === 'Categoría restaurada', 'Dos toques en menos de 4 s restauran el orden original');
    check(!(await page.evaluate(() => 'rapidas' in JSON.parse(localStorage.getItem('talkagain.v1.vocab') || '{}'))), 'La categoría deja de estar personalizada');
    await shot(page, 'editor-rapidas', true);
  });

  /* ============ 19. Barrido por pantalla: cabecera, AYUDA, pausa, Escape, tecla mantenida ============ */
  await scenario('19. Barrido "pantalla": cabecera, AYUDA, pausa, Escape en Historial, tecla mantenida', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await setRange(page, '#set-scan-interval', 5);
    await show(page, 'yesno'); await page.click('#btn-scan'); await sleep(300);
    let cur = await hlLabel(page);
    check(cur === 'Sí', `Primera opción iluminada: "${cur}"`);
    await page.click('#btn-settings'); await sleep(150);
    check((await hist(page)).length === 1 && (await last(page)).text === 'Sí' && (await title(page)) === 'Sí / No', 'Tocar ⚙️ elige la opción iluminada y no abre Ajustes');
    await sleep(1100); cur = await hlLabel(page);
    await page.click('#btn-home'); await sleep(150);
    check((await hist(page)).length === 2 && (await last(page)).text === cur && (await title(page)) === 'Sí / No', `Tocar 🏠 elige la opción iluminada ("${cur}") y no vuelve a Inicio`);
    await sleep(1100);
    await page.click('#view-title'); await sleep(150);
    check((await hist(page)).length === 3, 'Tocar el título también elige');
    await sleep(1100);
    const n0 = (await hist(page)).length;
    await holdHelp(page);
    check((await last(page)).type === 'help' && (await hist(page)).length === n0 + 1, 'Mantener AYUDA durante el barrido dispara la alarma sin elegir nada más');
    check((await scanState(page)).active && (await scanState(page)).state === 'running' && (await title(page)) === 'Sí / No', 'El barrido sigue en marcha tras la ayuda');
    await page.click('#btn-help'); await sleep(200);
    check((await hist(page)).length === n0 + 1, 'Un toque corto en AYUDA durante el barrido no elige ni dispara');
    // Pausa y cabecera
    await page.click('#btn-scan-pause'); await sleep(100);
    check((await scanState(page)).state === 'paused' && (await text(page, '#btn-scan-pause')) === '▶ Seguir' && await page.locator('.scan-hl').count() === 0, 'Pausa: sin resaltado y botón "Seguir"');
    const n1 = (await hist(page)).length;
    await page.click('#btn-home'); await sleep(100);
    check((await title(page)) === 'Talk Again' && (await scanState(page)).state === 'paused' && (await hist(page)).length === n1, 'En pausa, 🏠 vuelve a Inicio y la pausa se mantiene');
    await page.click('#btn-settings'); await sleep(100);
    check((await title(page)) === 'Ajustes' && (await scanState(page)).state === 'paused', 'En pausa, ⚙️ abre Ajustes');
    await page.click('#btn-settings'); await sleep(100);
    check((await title(page)) === 'Talk Again', '⚙️ en Ajustes vuelve a Inicio');
    await page.click('[data-goto="board"]'); await sleep(100);
    check((await title(page)) === 'Frases' && (await scanState(page)).state === 'paused' && (await hist(page)).length === n1, 'En pausa, los modos de Inicio se abren con un toque normal');
    await page.click('#btn-scan-pause'); await sleep(300);
    check((await scanState(page)).state === 'running' && (await text(page, '#btn-scan-pause')) === '⏸ Pausa' && await page.locator('#view-board .scan-group-hl').count() >= 1, '"Seguir" reanuda el barrido en la pantalla actual (Frases, por filas)');
    // Escape en Historial
    await show(page, 'history'); await sleep(300);
    check(await page.locator('#view-history .scan-hl').count() === 1 && (await hlLabel(page)) === 'Volver al inicio' && (await text(page, '#scan-status')) === 'Volver al inicio', 'En Historial solo se barre "Volver al inicio"');
    await page.keyboard.press('Escape'); await sleep(250);
    check((await title(page)) === 'Talk Again' && await page.locator('#view-home .scan-hl').count() === 1, 'Escape en Historial vuelve a Inicio y sigue barriendo');
    await sleep(1100);
    await show(page, 'history'); await sleep(300); await page.keyboard.press('Space'); await sleep(250);
    check((await title(page)) === 'Talk Again', 'Elegir "Volver al inicio" con Espacio vuelve a Inicio');
    await sleep(1100);
    await show(page, 'history'); await sleep(300); await page.click('#history-list'); await sleep(250);
    check((await title(page)) === 'Talk Again', 'Tocar la pantalla en Historial elige "Volver al inicio"');
    await sleep(1100);
    // Ajustes: nada que barrer
    await show(page, 'settings'); await sleep(300);
    check((await text(page, '#scan-status')).startsWith('No hay opciones') && await page.locator('.scan-hl, .scan-group-hl').count() === 0, 'En Ajustes avisa "No hay opciones en esta pantalla"');
    await page.click('#btn-scan-select'); await sleep(250);
    check((await title(page)) === 'Talk Again', 'SELECCIONAR en Ajustes vuelve a Inicio');
    await sleep(1100);
    // Tecla mantenida (keydown repetido)
    const h0 = (await hist(page)).length; cur = await hlLabel(page);
    const key = (repeat, k) => page.evaluate(([r, kk]) => document.dispatchEvent(new KeyboardEvent('keydown', { key: kk, repeat: r, bubbles: true, cancelable: true })), [repeat, k || ' ']);
    await key(false); await sleep(200);
    check(cur === 'Sí o No' && (await title(page)) === 'Sí / No', `Un keydown de Espacio elige "${cur}" (abre Sí / No)`);
    await sleep(1100);
    for (let i = 0; i < 4; i++) { await key(true); await sleep(60); }
    await sleep(200);
    check((await hist(page)).length === h0 && (await title(page)) === 'Sí / No', 'Los keydown repetidos de una tecla mantenida no eligen nada');
    for (let i = 0; i < 3; i++) { await key(true, 'Enter'); await sleep(60); }
    check((await hist(page)).length === h0, 'Tampoco Intro mantenido');
    await key(false); await sleep(200);
    check((await hist(page)).length === h0 + 1 && (await last(page)).type === 'answer', 'Un keydown nuevo (sin repeat) sí elige');
    await page.click('#btn-scan');
    check(!(await scanState(page)).active && await page.locator('#scanbar').isHidden() && !(await page.evaluate(() => document.body.classList.contains('select-screen'))), '⏹ Barrido lo detiene y quita la barra');
  });

  /* ============ 20. Barrido automático al abrir ============ */
  await scenario('20. Barrido automático al abrir la aplicación (scanAuto)', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await openAdvanced(page);
    await page.check('#set-scan-auto');
    check((await settingsOf(page)).scanAuto === true && (await page.evaluate(() => JSON.parse(localStorage.getItem('talkagain.v1.settings')).scanAuto)) === true, 'La casilla guarda scanAuto=true');
    await page.reload({ waitUntil: 'load' }); await sleep(200);
    const gate = page.locator('.start-gate');
    check(await gate.count() === 1 && await gate.isVisible(), 'Al recargar aparece la pantalla "Toca para empezar"');
    const gb = await gate.boundingBox(); const vp = page.viewportSize();
    check(gb && gb.x <= 0 && gb.y <= 0 && gb.width >= vp.width && gb.height >= vp.height, `La pantalla de inicio cubre toda la ventana (${gb && Math.round(gb.width)}×${gb && Math.round(gb.height)})`);
    const gt = await text(page, '.start-gate');
    check(gt.includes('Toca para empezar') && gt.includes('Se activará el barrido automático'), `Texto: "${gt.replace(/\s+/g, ' ')}"`);
    check(!(await scanState(page)).active, 'El barrido no empieza hasta tocar');
    await shot(page, 'scan-auto-gate');
    await gate.click(); await sleep(350);
    check(await gate.count() === 0 && (await scanState(page)).active && await page.locator('#scanbar').isVisible() && await page.locator('#view-home .scan-hl').count() === 1, 'Tocar la pantalla de inicio la quita y arranca el barrido en Inicio');
    check(await page.evaluate(() => window.TalkAgain.speech.unlocked), 'La voz queda desbloqueada con ese toque');
    check((await hist(page)).length === 0, 'El toque de inicio no elige nada');
    await page.click('#btn-scan');
    await show(page, 'settings'); await openAdvanced(page); await page.uncheck('#set-scan-auto');
    await page.reload({ waitUntil: 'load' }); await sleep(200);
    check(await page.locator('.start-gate').count() === 0 && !(await scanState(page)).active, 'Sin la opción no aparece la pantalla de inicio ni arranca el barrido');
  });

  /* ============ 21. Copia de seguridad antigua y textos inválidos ============ */
  await scenario('21. Copia de seguridad en formato antiguo, con basura e inválida', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await openAdvanced(page);
    const old = JSON.stringify({ app: 'talk-again', v: 1, settings: { voiceURI: '', rate: '0.9', scale: 1.4, theme: 'dark', keyboardOrder: 'frecuencia', flashAlert: true, scanInterval: '2.5', scanLoops: 3, scanSelect: 'button', scanSpeak: true, scanAuto: false, cam: false, camSens: 1, camPreview: true }, vocab: {}, words: {}, saved: [] });
    const errBefore = consoleErrors.length;
    await page.fill('#backup-text', old); await page.click('#btn-backup-restore'); await sleep(200);
    check((await toastState(page)).text === 'Copia restaurada', 'La copia antigua (sin "builder") se restaura con aviso "Copia restaurada"');
    let s = await settingsOf(page);
    check(s.scale === '1.4' && (await cssScale(page)) === '1.4' && (await page.inputValue('#set-scale')) === '1.4', 'La escala numérica 1.4 se guarda como texto "1.4" y se aplica');
    check(s.rate === 0.9 && (await page.inputValue('#set-rate')) === '0.9' && (await text(page, '#set-rate-out')) === 'Normal', 'La velocidad "0.9" (texto) pasa a número 0.9 y se muestra como "Normal"');
    check(s.scanInterval === 2.5 && s.scanLoops === 3 && s.scanSelect === 'button' && s.theme === 'dark' && (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && s.keyboardOrder === 'frecuencia', 'Barrido, teclado y tema restaurados');
    check(s.touchMode === 'tap' && s.dwellMs === 900 && s.minTouchMs === 0 && s.dragSpeak === true && s.gender === 'm' && s.people === '', 'Los ajustes nuevos que faltaban toman sus valores por defecto');
    check(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('talkagain.v1.builder'))) === '{}' && JSON.stringify(JSON.parse(localStorage.getItem('talkagain.v1.saved'))) === '[]'), 'Estadísticas de Armar frase y frases guardadas quedan vacías');
    check(consoleErrors.length === errBefore, 'Sin errores de consola al restaurar la copia antigua');
    await show(page, 'board'); check(await page.locator('#board-grid .tile').count() >= 10, 'El tablero funciona tras la copia antigua');
    await show(page, 'build'); await page.click('#build-starts [data-start="0"]'); await page.click('#build-nexts [data-next="agua"]');
    check((await last(page)).text === 'Quiero agua' && (await page.evaluate(() => JSON.parse(localStorage.getItem('talkagain.v1.builder')).Quiero.agua)) === 1, 'Armar frase funciona y vuelve a contar usos');
    // Valores fuera de rango y basura
    await show(page, 'settings'); await openAdvanced(page);
    const junk = JSON.stringify({ app: 'talk-again', settings: { scale: '9', rate: 99, scanInterval: -4, theme: 'neon', touchMode: 'laser', dwellMs: 50, people: 42, gender: 'x', scanAuto: 0 },
      vocab: { rapidas: [{ t: 'Hola' }, 'basura', { e: '🧃🧃🧃🧃🧃🧃🧃🧃🧃🧃', t: 'x'.repeat(200), s: 7 }], inventada: [{ t: 'nada' }] }, words: [1, 2], saved: 'agua', builder: [] });
    await page.fill('#backup-text', junk); await page.click('#btn-backup-restore'); await sleep(200);
    s = await settingsOf(page);
    check((await toastState(page)).text === 'Copia restaurada' && s.scale === '1.2' && s.rate === 1.3 && s.scanInterval === 0.8 && s.theme === 'dark' && s.touchMode === 'tap' && s.dwellMs === 400 && s.people === '' && s.gender === 'm',
      `Valores fuera de rango se corrigen o acotan (scale ${s.scale}, rate ${s.rate}, intervalo ${s.scanInterval}, tema ${s.theme}, tacto ${s.touchMode}, quieto ${s.dwellMs})`);
    const vocab = await page.evaluate(() => JSON.parse(localStorage.getItem('talkagain.v1.vocab')));
    check(vocab.rapidas.length === 2 && !vocab.inventada && vocab.rapidas[1].t.length === 120 && [...vocab.rapidas[1].e].length <= 8 && !('s' in vocab.rapidas[1]), 'El vocabulario basura se filtra y recorta (2 frases válidas, textos acotados)');
    await show(page, 'board'); await page.click('[data-cat="rapidas"]');
    check(await page.locator('#board-grid .tile').count() === 2, 'El tablero muestra las 2 frases válidas de la copia');
    check(consoleErrors.length === errBefore, 'Sin errores de consola con la copia basura');
    await shot(page, 'board-copia-basura');
    // Inválidas
    await show(page, 'settings'); await openAdvanced(page);
    await page.fill('#backup-text', 'esto no es json'); await page.click('#btn-backup-restore');
    check((await toastState(page)).text === 'El texto no es una copia válida', 'Texto que no es JSON: aviso "no es una copia válida"');
    await page.fill('#backup-text', '{"app":"otra","settings":{"scale":"1.6"}}'); await page.click('#btn-backup-restore');
    check((await toastState(page)).text === 'El texto no es una copia de Talk Again' && (await settingsOf(page)).scale === '1.2', 'JSON de otra app: aviso y nada cambia');
    await page.fill('#backup-text', ''); await page.click('#btn-backup-restore');
    check((await toastState(page)).text === 'El texto no es una copia válida', 'Texto vacío: aviso');
  });

  /* ============ 22. Teléfono estrecho 360×740 con texto enorme ============ */
  await scenario('22. Teléfono estrecho 360×740 con texto "Enorme" (1.6)', async () => {
    const page = await newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await page.click('#btn-settings'); await page.selectOption('#set-scale', '1.6');
    for (const v of ['home', 'yesno', 'board', 'spell', 'pain', 'build', 'history', 'settings']) {
      await show(page, v); await sleep(200);
      const r = await overflow(page);
      check(fits(r), `Sin desbordamiento horizontal en ${v} a 360 px (${await fitsMsg(page, r)})`);
      const clipped = await clippedIn(page); if (clipped.length) info(`${v}: ${clipped.join(' | ')}`);
      if (v === 'pain') { const m = await painMeasure(page); check(painOk(m), `Dolor a 360 px: ${painFmt(m)}`); }
      await shot(page, `narrow-360-${v}`);
    }
    const tb = await page.evaluate(() => { const q = s => document.querySelector(s); const r = s => q(s).getBoundingClientRect(); return { scan: r('#btn-scan'), help: r('#btn-help'), helpOver: q('#btn-help').scrollWidth - q('#btn-help').clientWidth, w: document.documentElement.clientWidth }; });
    check(tb.help.right <= tb.w + 0.5 && tb.scan.right <= tb.help.left + 0.5, `▶ Barrido y 🆘 AYUDA no se pisan ni se salen (Barrido hasta ${Math.round(tb.scan.right)}, AYUDA ${Math.round(tb.help.left)}–${Math.round(tb.help.right)} de ${tb.w})`);
    check(tb.helpOver <= 1, `El texto de 🆘 AYUDA se ve entero (le faltan ${Math.max(0, tb.helpOver)} px de ancho)`);
    await show(page, 'board'); await page.click('#btn-scan'); await sleep(300);
    const r = await overflow(page);
    const sb = await page.evaluate(() => { const b = document.getElementById('btn-scan-select'), p = document.getElementById('btn-scan-pause'); return { right: Math.round(b.getBoundingClientRect().right), over: b.scrollWidth - b.clientWidth, pover: p.scrollWidth - p.clientWidth }; });
    check(fits(r) && sb.right <= 360 && sb.over <= 1 && sb.pover <= 1, `Barra de barrido a 360 px: ${fmt(r)}; SELECCIONAR termina en ${sb.right}, texto sobrante ${sb.over}/${sb.pover} px`);
    await shot(page, 'narrow-360-scanbar');
    await page.click('#btn-scan');
    await show(page, 'settings'); await page.selectOption('#set-touch-mode', 'drag'); await show(page, 'board'); await sleep(200);
    const r2 = await overflow(page);
    check(fits(r2), `Barra ▲ ▼ a 360 px: ${fmt(r2)}`);
    await shot(page, 'narrow-360-dragbar');
  });

  /* ============ 23. Tema oscuro en 400 px: capturas y contraste ============ */
  await scenario('23. Tema oscuro y claro en 400 px: capturas y contraste del texto', async () => {
    const page = await newPage({ viewport: { width: 400, height: 780 }, isMobile: true, hasTouch: true });
    await page.click('#btn-settings'); await page.fill('#set-people', 'Mi esposa Ana');
    const low = [], all = [];
    const specs = {
      home: [{ sel: '.mode-tile .mode-name' }, { sel: '.mode-tile .mode-desc' }, { sel: '.lead' }, { sel: '.hint' }],
      yesno: [{ sel: '.answer-yes .answer-text' }, { sel: '.answer-no .answer-text' }, { sel: '.answer-maybe' }, { sel: '.answer-neutral' }, { sel: '#btn-ask' }, { sel: '#question-input' }],
      board: [{ sel: '.cat-btn' }, { sel: '#board-grid .tile .tile-text', max: 3 }],
      build: [{ sel: '#build-starts .tile-text', max: 2 }, { sel: '#build-nexts .tile-text', max: 2 }, { sel: '#build-mods .tile-text', max: 2 }, { sel: '#btn-build-speak' }, { sel: '#btn-build-save' }],
      spell: [{ sel: '.toast', name: 'aviso', hideAfter: true }, { sel: '.key', max: 3 }, { sel: '.key-action' }, { sel: '.pred-btn', max: 2 }, { sel: '.saved-say' }],
      pain: [{ sel: '.seg-btn' }, { sel: '.level', max: 11 }, { sel: '#pain-quick .tile-text', max: 3 }, { sel: '.pain-selected' }, { sel: '#body-map g:not(.is-selected):not(.scan-hl) text', svg: true, max: 3 }, { sel: '#body-map g.is-selected text', svg: true, name: 'zona elegida' }, { sel: '#body-map g.scan-hl text', svg: true, name: 'zona iluminada por el barrido' }],
      history: [{ sel: '.hist-text' }, { sel: '.chip' }, { sel: '.hist-time' }, { sel: '.btn-danger' }, { sel: '.note' }],
      settings: [{ sel: '.group legend', max: 2 }, { sel: '.note', max: 2 }, { sel: '.seg-btn.is-active', name: 'género activo' }, { sel: '.btn-accent' }, { sel: '.btn-danger' }, { sel: 'details.advanced > summary' }, { sel: '.field select', max: 1 }, { sel: '.field label', max: 2 }]
    };
    for (const theme of ['dark', 'light']) {
      await show(page, 'settings'); await page.selectOption('#set-theme', theme);
      for (const v of Object.keys(specs)) {
        await show(page, v); await sleep(120);
        if (v === 'board') {
          for (const cat of ['rapidas', 'necesidades', 'sentimientos', 'personas', 'actividades', 'preguntas', 'salud']) {
            await page.click(`[data-cat="${cat}"]`);
            (await contrastOf(page, [{ sel: '#board-grid .tile .tile-text', max: 2, name: cat }, { sel: '.cat-btn.is-active', name: 'categoría activa' }])).forEach(r => all.push({ theme, v, ...r }));
          }
          await page.click('[data-cat="rapidas"]');
        }
        if (v === 'build') {
          if (await page.locator('#btn-build-new').isVisible()) await page.click('#btn-build-new');
          await page.click('#build-starts [data-start="0"]'); await page.click('#build-nexts [data-next="agua"]');
        }
        if (v === 'spell') { await page.click('.key[data-action="clear"]'); await page.click('.key[data-key="H"]'); await page.click('.key[data-action="save"]'); }
        if (v === 'pain') { await page.click('#body-map [data-part="pecho"]'); await page.evaluate(() => document.querySelector('#body-map [data-part="cabeza"]').classList.add('scan-hl')); await sleep(400); /* transición de relleno 0,15 s */ }
        if (v === 'history' && (await hist(page)).length === 0) { await show(page, 'yesno'); await page.click('.answer-yes'); await show(page, 'history'); }
        if (v === 'settings') await openAdvanced(page);
        (await contrastOf(page, specs[v])).forEach(r => all.push({ theme, v, ...r }));
        if (theme === 'dark' && ['yesno', 'board', 'pain', 'settings', 'home', 'spell'].includes(v)) await shot(page, `dark-400-${v}`, v === 'settings');
      }
    }
    all.forEach(r => { if (r.ratio < 4.5) low.push(`${r.theme}/${r.v}: ${r.name} ${r.fg} sobre ${r.bg} = ${r.ratio}:1`); });
    const worst = all.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 5).map(r => `${r.theme}/${r.v} ${r.name} ${r.ratio}:1`);
    info(`${all.length} combinaciones texto/fondo medidas; las de menor contraste: ${worst.join(' · ')}`);
    check(low.length === 0, 'Todo el texto medido tiene contraste ≥ 4,5:1 en los dos temas' + (low.length ? ': ' + low.join(' | ') : ''));
    // Resaltados: borde del barrido y de deslizar
    await show(page, 'settings'); await page.selectOption('#set-theme', 'dark'); await show(page, 'board'); await page.click('#btn-scan'); await sleep(300);
    await shot(page, 'dark-400-board-scan');
    await page.click('#btn-scan');
  });

  /* ============ 24. Etiquetas del barrido sin emoji ============ */
  await scenario('24. Etiquetas del barrido (lo que se lee y se muestra) sin emoji en todas las pantallas', async () => {
    const page = await newPage();
    await page.click('#btn-settings'); await page.fill('#set-people', 'Mi esposa Ana');
    const bad = []; let total = 0;
    for (const v of ['home', 'yesno', 'board', 'build', 'spell', 'pain', 'history']) {
      await show(page, v);
      if (v === 'build') { await page.click('#build-starts [data-start="0"]'); await page.click('#build-nexts [data-next="agua"]'); }
      if (v === 'spell') { await page.click('.key[data-key="H"]'); await page.click('.key[data-action="save"]'); }
      const sides = v === 'pain' ? ['front', 'back'] : [null];
      for (const side of sides) {
        if (side) await page.click(`.seg-btn[data-side="${side}"]`);
        const cats = v === 'board' ? ['rapidas', 'necesidades', 'sentimientos', 'personas', 'actividades', 'preguntas', 'salud'] : [null];
        for (const cat of cats) {
          if (cat) await page.click(`[data-cat="${cat}"]`);
          const labels = await labelsOf(page, v);
          total += labels.length;
          labels.forEach(l => { if (EMOJI.test(l) || !l.trim()) bad.push(`${v}${cat ? '/' + cat : ''}${side ? '/' + side : ''}: «${l}»`); });
        }
      }
    }
    check(bad.length === 0, `${total} opciones de barrido revisadas: ninguna etiqueta lleva emoji ni está vacía` + (bad.length ? ': ' + bad.slice(0, 8).join(' | ') : ''));
    // Lo que se lee al iluminarse coincide con la etiqueta
    await show(page, 'settings'); await setRange(page, '#set-scan-interval', 5); await show(page, 'board'); await page.click('[data-cat="rapidas"]');
    await page.click('#btn-scan'); await sleep(300);
    const said = (await spoken(page)).slice(-1)[0];
    check(/^Fila 1 de \d+$/.test(said || ''), `Al empezar por filas se lee "${said}"`);
    await page.keyboard.press('Space'); await sleep(300);
    const said2 = (await spoken(page)).slice(-1)[0];
    check(said2 === (await hlLabel(page)) && !EMOJI.test(said2 || ''), `Dentro de la fila se lee la etiqueta "${said2}"`);
    await page.click('#btn-scan');
  });

  /* ============ 10. Sin conexión (al final: apaga el servidor) ============ */
  await scenario('10. Sin conexión: aviso de primera instalación, recarga sin red y con el servidor apagado', async () => {
    const page = await newPage({ fresh: true });   // contexto nuevo: primera visita, sin service worker
    await page.goto(BASE, { waitUntil: 'load' });
    const t1 = await waitToast(page, t => t === 'Lista para usar sin internet', 8000);
    check(t1 >= 0, `Aviso "Lista para usar sin internet" en la primera visita (${t1} ms)`);
    check(await waitCache(page), 'Service worker activo con la caché inicial completa (11 archivos)');
    await sleep(1500);
    const first = await toasts(page);
    check(!first.some(t => t.startsWith('Versión nueva')), `En la primera instalación no debe aparecer "Versión nueva lista: cierra y vuelve a abrir la app" (avisos: ${JSON.stringify(first)})`);
    check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'La página queda controlada por el service worker desde la primera visita');
    await page.reload({ waitUntil: 'load' }); await sleep(1500);
    const again = await toasts(page);
    check(!again.includes('Lista para usar sin internet') && !again.some(t => t.startsWith('Versión nueva')), `Al recargar sin cambios no vuelve a avisar (avisos: ${JSON.stringify(again)})`);
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'load' });
    check(await page.locator('.mode-tile').count() === 7 && (await page.evaluate(() => !!window.TalkAgain)), 'Sin red (setOffline) la app se carga y funciona');
    check(await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Atkinson') && getComputedStyle(document.documentElement).colorScheme === 'dark' && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'Los estilos llegan desde la caché');
    const fontOk = await page.evaluate(async () => { try { await document.fonts.ready; return document.fonts.check('700 16px "Atkinson Hyperlegible"'); } catch (e) { return null; } });
    info(`Tipografía Atkinson disponible sin conexión: ${fontOk}`);
    await page.click('[data-goto="board"]');
    check(await page.locator('#board-grid .tile').count() >= 10, 'El tablero funciona sin conexión');
    await page.click('#btn-home'); await page.click('[data-goto="pain"]');
    check(await page.locator('#body-map [data-part]').count() === 30, 'El mapa del cuerpo funciona sin conexión');
    await shot(page, 'offline-pain');
    await page.context().setOffline(false);
    await stopServer(server); server = null;
    await page.reload({ waitUntil: 'load' });
    check(await page.locator('.mode-tile').count() === 7, 'Con el servidor apagado la app se sirve desde la caché del service worker');
    server = await startServer(PORT, ROOT);
    await page.reload({ waitUntil: 'load' });
    check(await page.locator('.mode-tile').count() === 7, 'De vuelta en línea la app sigue funcionando');
  });

  await scenario('10b. Actualización: un service worker nuevo avisa, limpia la caché vieja y sigue sin conexión', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'talk-again-copy-'));
    const port2 = PORT + 1;
    let server2 = null;
    try {
      cpSync(ROOT, dir, { recursive: true, filter: src => !/^(node_modules|\.git|\.claude|tests)([\\/]|$)/.test(path.relative(ROOT, src)) });
      server2 = await startServer(port2, dir);
      const base2 = `http://127.0.0.1:${port2}/`;
      const page = await newPage({ fresh: true });
      await page.goto(base2, { waitUntil: 'load' });
      check(await waitCache(page), 'Versión 1 instalada (caché completa)');
      const v1 = (await page.evaluate(async () => caches.keys()))[0];
      const swPath = path.join(dir, 'sw.js');
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*'/, "const VERSION = 'talkagain-test-update'"));
      const later = new Date(Date.now() + 5000); utimesSync(swPath, later, later);   // el servidor compara por segundos (If-Modified-Since)
      await page.reload({ waitUntil: 'load' });
      const t = await waitToast(page, x => x.startsWith('Versión nueva lista'), 10000);
      check(t >= 0, `Aviso "Versión nueva lista: cierra y vuelve a abrir la app" tras cambiar el service worker (${t} ms)`);
      let keys = [];
      for (let i = 0; i < 50; i++) { keys = await page.evaluate(async () => caches.keys()); if (keys.includes('talkagain-test-update') && !keys.includes(v1)) break; await sleep(100); }
      check(keys.includes('talkagain-test-update') && !keys.includes(v1), `Tras actualizar queda la caché nueva y desaparece la vieja (${keys.join(', ')})`);
      check(await waitCache(page, 'talkagain-test-update'), 'La caché nueva tiene los 11 archivos');
      await page.context().setOffline(true);
      await page.reload({ waitUntil: 'load' });
      check(await page.locator('.mode-tile').count() === 7 && (await page.evaluate(() => !!window.TalkAgain)), 'Tras la actualización, la app sigue cargando sin conexión');
      await page.context().setOffline(false);
      await page.reload({ waitUntil: 'load' }); await sleep(1200);
      check(!(await toasts(page)).some(x => x.startsWith('Versión nueva') || x === 'Lista para usar sin internet'), 'Una recarga posterior ya no avisa de nada');
    } finally {
      await stopServer(server2);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const relevant = consoleErrors.filter(e => !/favicon|fonts\.g|ERR_INTERNET|net::|Failed to load resource/i.test(e));
  check(relevant.length === 0, 'Sin errores de consola en ninguna página' + (relevant.length ? ': ' + relevant.join(' | ') : ''));
  if (consoleErrors.length && !relevant.length) info(`Errores de consola ignorados (red): ${consoleErrors.length}`);
} finally {
  await browser.close();
  await stopServer(server);
}
console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo correcto');
console.log('Capturas en', SHOTS);
process.exit(failures ? 1 : 0);
