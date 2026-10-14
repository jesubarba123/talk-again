/* Prueba exploratoria con Playwright: recorre los flujos que la prueba de humo no cubre
   (editor de frases, copia de seguridad, historial, deletreo, dolor, barrido con botón y con
   pantalla, AYUDA, tamaño "Enorme" en móvil y tableta, sin conexión, tema, restablecer, toques
   rápidos). Imprime una línea OK/FAIL por comprobación, INFO para observaciones, guarda capturas
   y termina con código 1 si algo falla.
   Uso: npm install && node tests/explore.mjs   (necesita Python 3 para el servidor estático). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const PORT = 8231;
const BASE = `http://127.0.0.1:${PORT}/`;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = process.env.SHOTS_DIR || '/tmp/talk-again-explore';
mkdirSync(SHOTS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Servidor estático (se apaga y se vuelve a encender en la prueba sin conexión) ---------- */
let server = null;
async function startServer() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE, { cache: 'no-store' }); if (r.ok) return; } catch (e) { /* aún no */ }
    await sleep(100);
  }
  throw new Error('El servidor estático no arrancó en el puerto ' + PORT);
}
function stopServer() {
  return new Promise(res => {
    if (!server) return res();
    const s = server; server = null;
    s.once('exit', () => res());
    s.kill();
  });
}

/* ---------- Utilidades de comprobación ---------- */
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) failures++; };
const info = msg => console.log('INFO ' + msg);
const consoleErrors = [];
async function scenario(name, fn) {
  console.log(`\n--- ${name} ---`);
  try { await fn(); }
  catch (e) { failures++; console.log('FAIL ' + name + ' lanzó una excepción: ' + String(e && e.message || e).split('\n')[0]); }
}
const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/* Página nueva (contexto propio), con espía de la voz: window.__spoken guarda cada texto pronunciado. */
async function newPage(opts) {
  const page = await browser.newPage(Object.assign({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' }, opts || {}));
  page.setDefaultTimeout(10000);
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    window.__spoken = [];
    try {
      const orig = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = u => { window.__spoken.push(u.text); try { orig(u); } catch (e) { /* nada */ } };
    } catch (e) { /* sin voz */ }
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  return page;
}
const hist = p => p.evaluate(() => window.TalkAgain.history);
const last = async p => { const h = await hist(p); return h[h.length - 1] || {}; };
const spoken = p => p.evaluate(() => window.__spoken);
const settingsOf = p => p.evaluate(() => window.TalkAgain.settings);
const cssScale = p => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale').trim());
const text = async (p, sel) => (await p.locator(sel).innerText()).trim();
const toastState = p => p.evaluate(() => { const t = document.getElementById('toast'); return { text: t.textContent, visible: !t.hidden }; });
const setRange = (p, sel, v) => p.evaluate(([s, val]) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, String(v)]);
const shot = (p, name, full) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full });
const show = (p, v) => p.evaluate(view => window.TalkAgain.show(view), v);
const overflow = p => p.evaluate(() => {
  const d = document.documentElement, v = document.getElementById('views'), h = document.querySelector('.topbar');
  return { sw: d.scrollWidth, cw: d.clientWidth, vw: v.scrollWidth, vc: v.clientWidth, hw: h.scrollWidth, hc: h.clientWidth };
});
/* Medidas de la pantalla Dolor: altura del selector Delante/Detrás, hueco hasta el mapa y columnas. */
const painLayout = p => p.evaluate(() => {
  const seg = document.querySelector('#view-pain .seg').getBoundingClientRect();
  const map = document.getElementById('body-map').getBoundingClientRect();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const cols = getComputedStyle(document.getElementById('pain-levels')).gridTemplateColumns.trim().split(/\s+/).length;
  return {
    segH: Math.round(seg.height), segMax: Math.round(3.4 * rem), mapGap: Math.round(map.top - seg.bottom), levelCols: cols,
    bodyH: Math.round(document.querySelector('.pain-body').getBoundingClientRect().height),
    scaleH: Math.round(document.querySelector('.pain-scale').getBoundingClientRect().height)
  };
});
/* Textos recortados o que desbordan su botón (ayuda para la revisión visual). */
const clippedIn = p => p.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, .view-title, .scan-status, .pain-selected').forEach(e => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const overX = e.scrollWidth > e.clientWidth + 1, overY = e.scrollHeight > e.clientHeight + 1;
    if (!overX && !overY) return;
    const cs = getComputedStyle(e);
    const name = (e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]) + ' «' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26) + '»';
    out.push(name + (overX ? ` ancho ${e.scrollWidth}>${e.clientWidth}` : '') + (overY ? ` alto ${e.scrollHeight}>${e.clientHeight}` : '') + (cs.overflow === 'visible' ? ' (sin recorte, puede pisar vecinos)' : ' (RECORTADO)'));
  });
  return out;
});

await startServer();
try {
  /* ============ 1. Editor de frases ============ */
  await scenario('1. Ajustes > Editar frases (necesidades)', async () => {
    const page = await newPage();
    await page.click('#btn-settings');
    await page.selectOption('#edit-cat', 'necesidades');
    const rows = page.locator('#edit-list .edit-row');
    const before = await rows.count();
    check(before === 22, `El editor muestra las 22 frases de Necesidades (${before})`);
    await page.click('#btn-edit-add');
    check(await rows.count() === before + 1, 'Añadir frase crea una fila nueva');
    check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('edit-text')), 'El foco pasa al texto de la frase nueva');
    await rows.nth(before).locator('.edit-emoji').fill('🧃');
    await rows.nth(before).locator('.edit-text').fill('Quiero un zumo');
    await rows.nth(0).locator('.edit-text').fill('Quiero agua fría');
    await rows.nth(1).locator('.edit-del').click();                  // "Tengo hambre"
    check(await rows.count() === before, 'Quitar una frase elimina su fila');
    check((await rows.nth(1).locator('.edit-text').inputValue()) !== 'Tengo hambre', 'La fila quitada ya no está en el editor');

    await page.click('#btn-home'); await page.click('[data-goto="board"]'); await page.click('[data-cat="necesidades"]');
    const labels = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(labels.includes('Quiero un zumo'), 'La frase nueva aparece en el tablero');
    check(labels[0] === 'Quiero agua fría', 'La frase editada se actualiza en el tablero');
    check(!labels.includes('Tengo hambre'), 'La frase quitada desaparece del tablero');
    const nuevo = page.locator('#board-grid .tile', { hasText: 'Quiero un zumo' });
    check((await nuevo.locator('.tile-emoji').innerText()) === '🧃', 'La frase nueva muestra el emoji escrito');
    await nuevo.click();
    const h = await last(page);
    check(h.type === 'phrase' && h.text === 'Quiero un zumo', 'Tocar la frase nueva la añade al historial');
    check((await spoken(page)).includes('Quiero un zumo'), 'La frase nueva se pronuncia');
    check((await page.locator('#board-grid .tile').nth(0).getAttribute('data-say')) === 'Quiero agua fría', 'Al editar el texto se pronuncia el texto nuevo (se descarta la locución antigua)');

    await page.reload({ waitUntil: 'load' });
    await page.click('[data-goto="board"]'); await page.click('[data-cat="necesidades"]');
    const l2 = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(l2.includes('Quiero un zumo') && l2[0] === 'Quiero agua fría' && !l2.includes('Tengo hambre'), 'Los cambios persisten tras recargar');
    await page.click('#btn-settings'); await page.selectOption('#edit-cat', 'necesidades');
    check(await rows.count() === before && (await rows.nth(0).locator('.edit-text').inputValue()) === 'Quiero agua fría', 'El editor muestra los cambios tras recargar');
    await page.click('#btn-edit-restore');
    check(await rows.count() === 22 && (await rows.nth(0).locator('.edit-text').inputValue()) === 'Tengo sed', '"Restaurar esta categoría" vuelve a las 22 frases por defecto');
    check((await toastState(page)).text === 'Categoría restaurada', 'Aviso "Categoría restaurada"');
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-goto="board"]'); await page.click('[data-cat="necesidades"]');
    const l3 = await page.locator('#board-grid .tile').evaluateAll(ts => ts.map(t => t.dataset.label));
    check(l3.length === 22 && l3[0] === 'Tengo sed' && l3.includes('Tengo hambre'), 'La restauración persiste tras recargar');
    await page.close();
  });

  /* ============ 2. Copia de seguridad ============ */
  await scenario('2. Copia de seguridad: exportar, borrar, restaurar', async () => {
    const page = await newPage();
    await page.click('#btn-settings');
    await page.selectOption('#set-scale', '1.4');
    await setRange(page, '#set-scan-interval', 3);
    await page.fill('#set-people', 'Mi esposa Ana\nMi hijo Luis');
    let s = await settingsOf(page);
    check(s.scale === '1.4' && s.scanInterval === 3 && s.people === 'Mi esposa Ana\nMi hijo Luis', 'Los ajustes cambiados quedan en memoria');
    check((await text(page, '#set-scan-interval-out')) === '3,0', 'El intervalo se muestra como "3,0"');
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    for (const k of ['A', 'G', 'U', 'A']) await page.click(`.key[data-key="${k}"]`);
    await page.click('.key[data-action="save"]');
    check(await page.locator('.saved-chip').count() === 1 && (await text(page, '.saved-chip .saved-say')) === 'agua', 'Frase guardada "agua" en Deletrear');

    await page.click('#btn-settings');
    await page.click('#btn-backup-copy');
    const backup = await page.inputValue('#backup-text');
    let parsed = null; try { parsed = JSON.parse(backup); } catch (e) { /* inválido */ }
    check(!!parsed && parsed.app === 'talk-again' && parsed.settings.scale === '1.4' && parsed.settings.scanInterval === 3
      && parsed.settings.people.includes('Mi hijo Luis') && Array.isArray(parsed.saved) && parsed.saved.includes('agua'),
      'El texto de #backup-text contiene ajustes, personas y la frase guardada');
    info(`Copia: ${backup.length} caracteres`);

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    check((await cssScale(page)) === '1' && (await settingsOf(page)).people === '', 'Tras borrar el almacenamiento vuelven los valores por defecto');
    await page.click('#btn-settings');
    await page.fill('#backup-text', backup);
    await page.click('#btn-backup-restore');
    check((await toastState(page)).text === 'Copia restaurada', 'Aviso "Copia restaurada"');
    s = await settingsOf(page);
    check(s.scale === '1.4' && (await cssScale(page)) === '1.4' && (await page.inputValue('#set-scale')) === '1.4', 'Tamaño de texto 1.4 restaurado y aplicado');
    check(s.scanInterval === 3 && (await page.inputValue('#set-scan-interval')) === '3' && (await text(page, '#set-scan-interval-out')) === '3,0', 'Intervalo de barrido 3 s restaurado');
    check((await page.inputValue('#set-people')) === 'Mi esposa Ana\nMi hijo Luis', 'Personas restauradas en el ajuste');
    await page.click('#btn-home'); await page.click('[data-goto="board"]'); await page.click('[data-cat="personas"]');
    const tile = page.locator('#board-grid .tile', { hasText: 'Mi esposa Ana' });
    check(await tile.count() === 1 && (await tile.getAttribute('data-say')) === 'Quiero ver a Mi esposa Ana', 'Personas muestra "Mi esposa Ana" que dice "Quiero ver a Mi esposa Ana"');
    await tile.click();
    check((await spoken(page)).includes('Quiero ver a Mi esposa Ana') && (await last(page)).text === 'Mi esposa Ana', 'Tocar la persona la pronuncia y la registra');
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    check(await page.locator('.saved-chip').count() === 1 && (await text(page, '.saved-chip .saved-say')) === 'agua', 'La frase guardada vuelve tras restaurar');
    await page.reload({ waitUntil: 'load' });
    s = await settingsOf(page);
    check(s.scale === '1.4' && s.scanInterval === 3 && s.people.startsWith('Mi esposa Ana'), 'Lo restaurado persiste tras recargar');
    await page.close();
  });

  /* ============ 3. Historial ============ */
  await scenario('3. Historial: etiquetas, borrar con confirmación, estado vacío', async () => {
    const page = await newPage();
    await page.click('[data-goto="yesno"]'); await page.click('.answer-yes');
    await page.click('#btn-home'); await page.click('[data-goto="board"]'); await page.click('#board-grid .tile >> nth=3'); // Espera
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    for (const k of ['H', 'O', 'L', 'A']) await page.click(`.key[data-key="${k}"]`);
    await page.click('.key[data-action="speak"]');
    await page.click('#btn-home'); await page.click('[data-goto="pain"]'); await page.click('#body-map [data-part="cabeza"]');
    await page.click('#btn-help');
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
    await page.reload({ waitUntil: 'load' }); await page.click('[data-goto="history"]');
    check(await items.count() === 0 && await page.locator('#history-empty').isVisible(), 'El historial sigue vacío tras recargar');
    await page.close();
  });

  /* ============ 4. Deletrear ============ */
  await scenario('4. Deletrear: orden por frecuencia, predicción, tilde, borrar', async () => {
    const page = await newPage();
    await page.click('#btn-settings');
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
    await shot(page, 'spell-frecuencia');
    await page.close();
  });

  /* ============ 5. Dolor ============ */
  await scenario('5. Dolor: nivel sin zona, Detrás, zona + nivel, frases rápidas', async () => {
    const page = await newPage();
    await page.click('[data-goto="pain"]');
    await page.click('.level[data-level="4"]');
    let h = await last(page);
    check(h.type === 'pain' && h.text === 'El dolor es 4 de 10', `Nivel sin zona: "${h.text}"`);
    check((await text(page, '#pain-selected')) === 'Toca la parte del cuerpo que duele', 'Sin zona elegida se mantiene el texto de ayuda');
    await page.click('.seg-btn[data-side="back"]');
    check(await page.locator('#body-map [data-part="espalda_baja"]').isVisible() && await page.locator('#body-map [data-part="pecho"]').isHidden(), '"Detrás" muestra la espalda y oculta el pecho');
    await page.click('#body-map [data-part="espalda_baja"]');
    h = await last(page);
    check(h.text === 'Me duele la espalda, en la parte baja' && (await text(page, '#pain-selected')) === 'Me duele la espalda, en la parte baja', 'Elegir espalda baja la registra y la muestra');
    check(await page.locator('#body-map g.is-selected[data-part="espalda_baja"]').count() === 1, 'La zona elegida queda marcada en el mapa');
    await page.click('.level[data-level="6"]');
    h = await last(page);
    check(h.text === 'Me duele la espalda, en la parte baja. El dolor es 6 de 10', `Zona + nivel: "${h.text}"`);
    check((await spoken(page)).includes('Me duele la espalda, en la parte baja. El dolor es 6 de 10'), 'Se pronuncia zona + nivel');
    await page.locator('#pain-quick .tile').nth(1).click();   // Está empeorando
    h = await last(page);
    check(h.type === 'pain' && h.text === 'Está empeorando' && (await spoken(page)).includes('El dolor está empeorando'), 'Frase rápida: pronuncia la frase completa y registra la etiqueta');
    await shot(page, 'pain-back-selected');
    await page.click('.seg-btn[data-side="front"]');
    const visibleSel = await page.locator('#body-map g.is-selected:visible').count();
    const label = await text(page, '#pain-selected');
    await page.click('.level[data-level="2"]');
    h = await last(page);
    const keepsPart = h.text.includes('espalda');
    info(`Al volver a "Delante": zonas marcadas visibles=${visibleSel}, texto="${label}", nivel 2 → "${h.text}"`);
    check((label.includes('espalda')) === keepsPart, 'Coherencia: el texto bajo el mapa y la frase del nivel coinciden sobre si la zona sigue elegida');
    await shot(page, 'pain-front-after-back');
    await page.close();
  });

  /* ============ 6. Barrido con el botón SELECCIONAR ============ */
  await scenario('6. Barrido con método "botón"', async () => {
    const page = await newPage();
    await page.click('#btn-settings');
    await page.selectOption('#set-scan-select', 'button');
    await page.click('#btn-home'); await page.click('[data-goto="board"]');
    const h0 = (await hist(page)).length;
    await page.click('#btn-scan'); await sleep(300);
    check(await page.locator('.scan-group-hl').count() >= 1 && await page.locator('.scan-hl').count() === 0, 'El barrido empieza por filas en Frases');
    check(!(await page.evaluate(() => document.body.classList.contains('select-screen'))), 'Con método "botón" el cuerpo no lleva la clase select-screen');
    const cats = await page.locator('#board-cats').boundingBox(); const grid = await page.locator('#board-grid').boundingBox();
    const x = grid.x + grid.width / 2, y = (cats.y + cats.height + grid.y) / 2;
    const under = await page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return e ? (e.id ? '#' + e.id : e.tagName) : null; }, [x, y]);
    info(`Toque "en vacío" sobre ${under}`);
    await page.mouse.click(x, y); await sleep(150);
    check(await page.locator('.scan-hl').count() === 0 && (await hist(page)).length === h0, 'Tocar un hueco de la pantalla NO selecciona');
    await page.click('#btn-scan-select'); await sleep(150);
    check(await page.locator('.scan-hl').count() === 1, 'El botón SELECCIONAR entra en la fila iluminada');
    await page.click('#btn-scan-pause');
    check((await text(page, '#btn-scan-pause')) === '▶ Seguir' && (await text(page, '#scan-status')).startsWith('Pausado') && await page.locator('.scan-hl, .scan-group-hl').count() === 0, 'Pausa: sin resaltado y botón "Seguir"');
    const tile = page.locator('#board-grid .tile').nth(2);
    const tileLabel = await tile.getAttribute('data-label');
    await tile.click();
    let h = await last(page);
    check((await hist(page)).length === h0 + 1 && h.type === 'phrase' && h.text === tileLabel, `En pausa, tocar una frase funciona con normalidad ("${tileLabel}")`);
    await page.click('#btn-scan-pause'); await sleep(200);
    check((await text(page, '#btn-scan-pause')) === '⏸ Pausa' && await page.locator('.scan-hl, .scan-group-hl').count() >= 1, '"Seguir" reanuda el barrido');
    await page.click('#btn-scan');

    // Flechas y Escape con intervalo largo para que el avance automático no interfiera.
    await page.click('#btn-settings'); await setRange(page, '#set-scan-interval', 5);
    await page.click('#btn-home'); await page.click('[data-goto="board"]');
    await page.click('#btn-scan'); await sleep(200);
    await page.click('#btn-scan-select'); await sleep(150);
    const st = () => page.evaluate(() => { const s = window.TalkAgain.scanner; const e = document.querySelector('.scan-hl'); return { level: s.level, gi: s.gi, ii: s.ii, n: s.groups[s.gi].length, label: e ? e.dataset.label : null }; });
    const a = await st();
    await page.keyboard.press('ArrowRight'); const b = await st();
    check(a.level === 1 && b.level === 1 && b.ii === (a.ii + 1) % a.n && b.label !== a.label, `→ pasa de "${a.label}" a "${b.label}"`);
    await page.keyboard.press('ArrowLeft'); const c = await st();
    check(c.ii === a.ii && c.label === a.label, `← vuelve a "${c.label}"`);
    await page.keyboard.press('Escape'); await sleep(100);
    check((await st()).level === 0 && await page.locator('.scan-group-hl').count() >= 1 && await page.locator('.scan-hl').count() === 0, 'Escape dentro de una fila vuelve al nivel de filas');
    await page.keyboard.press('Escape'); await sleep(100);
    check((await text(page, '#view-title')) === 'Talk Again' && await page.locator('#view-home').isVisible(), 'Escape en el nivel de filas vuelve a Inicio');
    check(await page.locator('#view-home .scan-hl').count() === 1, 'El barrido continúa en Inicio');
    await page.click('#btn-scan');

    // Pausa automática: 1 vuelta a 0,8 s.
    await page.click('#btn-settings'); await page.selectOption('#set-scan-loops', '1'); await setRange(page, '#set-scan-interval', 0.8);
    await page.click('#btn-home'); await page.click('[data-goto="board"]');
    await page.click('#btn-scan');
    const t0 = Date.now(); let idle = false;
    while (Date.now() - t0 < 15000) { if ((await text(page, '#scan-status')).includes('En espera')) { idle = true; break; } await sleep(100); }
    check(idle, `Con 1 vuelta y 0,8 s el barrido queda "En espera" (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    check(await page.locator('.scan-hl, .scan-group-hl').count() === 0, 'En espera no hay nada resaltado');
    await shot(page, 'scan-idle');
    await page.keyboard.press('Space'); await sleep(150);
    check(!(await text(page, '#scan-status')).includes('En espera') && await page.locator('.scan-hl, .scan-group-hl').count() >= 1 && (await page.evaluate(() => window.TalkAgain.scanner.state)) === 'running', 'Espacio reanuda el barrido desde "En espera"');
    check((await hist(page)).length === h0 + 1, 'Reanudar con Espacio no selecciona nada');
    await page.close();
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
    check(!/\p{Extended_Pictographic}/u.test(status) && !/\p{Extended_Pictographic}/u.test(scanSaid || ''), `La etiqueta del barrido en Sí/No no lleva emoji (estado "${status}", voz "${scanSaid}")`);
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
    check((await hist(page)).length === h1 && (await page.evaluate(() => window.TalkAgain.scanner.active)), 'Teclear en la pregunta no dispara selecciones y el barrido sigue activo');
    const spokenBefore = (await spoken(page)).length;
    await page.keyboard.press('Enter'); await sleep(150);
    const sp = (await spoken(page)).slice(spokenBefore);
    h = await last(page);
    check(sp.includes('hola mundo') && (await hist(page)).length === h1, `Intro en la pregunta la lee en voz alta sin seleccionar (pronunciado: ${JSON.stringify(sp)}; historial ${h1}→${(await hist(page)).length}${(await hist(page)).length !== h1 ? ', última: ' + h.type + ' "' + h.text + '"' : ''})`);
    await sleep(1300);
    const h2 = (await hist(page)).length; const sb2 = (await spoken(page)).length;
    await page.click('#btn-ask'); await sleep(150);
    const sp2 = (await spoken(page)).slice(sb2);
    info(`Tocar "🔊 Leer" durante el barrido por pantalla: pronunciado ${JSON.stringify(sp2)}, historial ${h2}→${(await hist(page)).length}`);
    await shot(page, 'scan-screen-yesno');
    await page.close();
  });

  /* ============ 8. AYUDA ============ */
  await scenario('8. Botón AYUDA', async () => {
    const page = await newPage();
    const t0 = Date.now();
    await page.click('#btn-help');
    check(await page.locator('#flash').isVisible(), 'El destello rojo aparece');
    const ts = await toastState(page);
    check(ts.visible && ts.text === 'Aviso de AYUDA', 'Aviso "Aviso de AYUDA"');
    const h = await last(page);
    check(h.type === 'help' && h.text === '¡Necesito ayuda!', 'El historial recibe la entrada de ayuda');
    check((await spoken(page)).includes('¡Necesito ayuda, por favor!'), 'Se pronuncia la petición de ayuda');
    await shot(page, 'help-flash');
    let hiddenAt = null;
    while (Date.now() - t0 < 7000) { if (await page.locator('#flash').isHidden()) { hiddenAt = Date.now() - t0; break; } await sleep(100); }
    check(hiddenAt != null && hiddenAt >= 3500 && hiddenAt <= 5500, `El destello se apaga a los ~4 s (${hiddenAt} ms)`);
    await page.click('[data-goto="history"]');
    check((await page.locator('.hist-item .chip').first().innerText()) === 'AYUDA' && await page.locator('.chip-help').count() === 1, 'La entrada lleva la etiqueta "AYUDA"');
    await page.close();
  });

  /* ============ 9. Texto "Enorme" en móvil y tableta ============ */
  for (const vp of [{ w: 400, h: 780, name: 'phone' }, { w: 820, h: 1180, name: 'ipad' }]) {
    await scenario(`9. Texto "Enorme" (1.6) en ${vp.w}×${vp.h}`, async () => {
      const page = await newPage({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
      await page.click('#btn-settings'); await page.selectOption('#set-scale', '1.6');
      check((await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === '25.6px', 'Enorme = 25,6 px de base');
      for (const v of ['home', 'yesno', 'board', 'spell', 'pain', 'history', 'settings']) {
        await show(page, v); await sleep(200);
        const r = await overflow(page);
        check(r.sw <= r.cw && r.vw <= r.vc, `Sin desbordamiento horizontal en ${v} (documento ${r.sw}/${r.cw}, views ${r.vw}/${r.vc}, barra superior ${r.hw}/${r.hc})`);
        const clipped = await clippedIn(page);
        if (clipped.length) info(`${v}: ${clipped.join(' | ')}`);
        if (v === 'pain') {
          const m = await painLayout(page);
          check(m.segH <= m.segMax && m.mapGap <= 40, `Dolor: el selector Delante/Detrás mide ${m.segH} px de alto (máx. esperado ${m.segMax}) y el mapa empieza ${m.mapGap} px por debajo; niveles en ${m.levelCols} columna(s)`);
        }
        await shot(page, `enorme-${vp.name}-${v}`);
      }
      await show(page, 'board'); await page.click('[data-cat="necesidades"]'); await sleep(150);
      await shot(page, `enorme-${vp.name}-board-necesidades`);
      await show(page, 'home'); await page.click('#btn-scan'); await sleep(300);
      const r2 = await overflow(page);
      const sb = await page.evaluate(() => { const s = document.getElementById('scanbar'); return { sw: s.scrollWidth, cw: s.clientWidth }; });
      check(r2.sw <= r2.cw && sb.sw <= sb.cw, `Barra de barrido sin desbordamiento (barra ${sb.sw}/${sb.cw}, documento ${r2.sw}/${r2.cw})`);
      // Anchura mínima que necesitan las barras por sí solas (botones + huecos + márgenes), para separar su problema del de la rejilla .app.
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
      await page.close();
    });
  }
  await scenario('9c. Dolor en 820 px (iPad) con cada tamaño de texto', async () => {
    const page = await newPage({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
    for (const sc of ['1', '1.2', '1.4', '1.6']) {
      await show(page, 'settings'); await page.selectOption('#set-scale', sc); await show(page, 'pain'); await sleep(150);
      const m = await painLayout(page);
      check(m.segH <= m.segMax && m.mapGap <= 40, `Tamaño ${sc}: selector Delante/Detrás de ${m.segH} px (máx. ${m.segMax}); mapa ${m.mapGap} px por debajo; columna izquierda ${m.bodyH} px, derecha ${m.scaleH} px; niveles en ${m.levelCols} columna(s)`);
      await shot(page, `pain-820-scale-${sc}`);
    }
    await page.close();
  });
  await scenario('9b. Barra superior en 400 px con cada tamaño de texto', async () => {
    const page = await newPage({ viewport: { width: 400, height: 780 }, isMobile: true, hasTouch: true });
    for (const sc of ['1', '1.2', '1.4', '1.6']) {
      await show(page, 'settings'); await page.selectOption('#set-scale', sc); await show(page, 'home'); await sleep(100);
      const r = await overflow(page);
      const gear = await page.locator('#btn-settings').boundingBox();
      check(r.sw <= r.cw && r.hw <= r.hc && gear && gear.x + gear.width <= r.cw + 0.5, `Tamaño ${sc}: barra superior ${r.hw}/${r.hc}, documento ${r.sw}/${r.cw}, ⚙️ termina en x=${gear ? Math.round(gear.x + gear.width) : '?'}`);
      await shot(page, `topbar-400-scale-${sc}`);
    }
    await page.close();
  });

  /* ============ 11. Tema ============ */
  await scenario('11. Tema oscuro / como el dispositivo', async () => {
    const page = await newPage();
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const bg0 = await bg();
    await page.click('#btn-settings'); await page.selectOption('#set-theme', 'dark');
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', '"Oscuro" pone data-theme="dark" en <html>');
    const bgDark = await bg();
    check(bgDark === 'rgb(13, 20, 25)' && bgDark !== bg0, `El fondo cambia a oscuro (${bg0} → ${bgDark})`);
    await shot(page, 'theme-dark-settings');
    await page.selectOption('#set-theme', 'system');
    check(!(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))), '"Como el dispositivo" quita data-theme');
    check((await bg()) === bg0 && bg0 === 'rgb(238, 243, 246)', `El fondo vuelve al claro del dispositivo (${await bg()})`);
    await page.emulateMedia({ colorScheme: 'dark' });
    check((await bg()) === 'rgb(13, 20, 25)', 'Con el dispositivo en oscuro, "Como el dispositivo" se ve oscuro');
    await page.selectOption('#set-theme', 'light');
    check((await bg()) === 'rgb(238, 243, 246)' && (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light', '"Claro" fuerza el tema claro aunque el dispositivo esté en oscuro');
    await page.reload({ waitUntil: 'load' });
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light', 'El tema persiste tras recargar');
    await page.close();
  });

  /* ============ 12. Restablecer todo ============ */
  await scenario('12. Restablecer todo', async () => {
    const page = await newPage();
    await page.click('[data-goto="yesno"]'); await page.click('.answer-no');
    await page.click('#btn-settings'); await page.selectOption('#set-scale', '1.2'); await page.fill('#set-people', 'Mi hermano');
    const keys = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('talkagain.')));
    const k0 = await keys();
    check(k0.length >= 2, `Hay datos guardados antes de restablecer: ${k0.join(', ')}`);
    await page.click('#btn-reset-all');
    check(await page.locator('#reset-confirm').isVisible(), '"Restablecer todo" pide confirmación');
    await page.click('#btn-reset-no');
    check(await page.locator('#reset-confirm').isHidden() && (await keys()).length === k0.length, '"Cancelar" no borra nada');
    await page.click('#btn-reset-all');
    await Promise.all([page.waitForEvent('load'), page.click('#btn-reset-yes').catch(() => {})]);
    const k1 = await keys();
    check(k1.length === 0, `Tras confirmar y recargar no queda ninguna clave talkagain.* (${k1.join(', ') || 'ninguna'})`);
    check((await cssScale(page)) === '1' && (await hist(page)).length === 0 && (await settingsOf(page)).people === '', 'La app arranca con los valores por defecto y sin historial');
    await page.close();
  });

  /* ============ 13. Toques rápidos y Hablar sin texto ============ */
  await scenario('13. Dos toques rápidos y "Hablar" sin texto', async () => {
    const page = await newPage();
    await page.click('[data-goto="board"]');
    const tile = page.locator('#board-grid .tile').nth(5);
    const box = await tile.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const t0 = Date.now();
    await page.mouse.click(cx, cy); await page.mouse.click(cx, cy);
    const dt = Date.now() - t0;
    const h = await hist(page);
    info(`Los dos toques se hicieron en ${dt} ms`);
    check(h.length === 2 && h[0].text === h[1].text && h[0].text === (await tile.getAttribute('data-label')), `Dos toques rápidos dejan dos entradas (${h.length})`);
    await page.click('#btn-home'); await page.click('[data-goto="spell"]');
    await page.click('.key[data-action="speak"]');
    let ts = await toastState(page);
    check(ts.visible && ts.text === 'No hay nada escrito todavía', 'Hablar sin texto avisa "No hay nada escrito todavía"');
    check((await hist(page)).length === 2, 'Hablar sin texto no añade nada al historial');
    await page.evaluate(() => { document.getElementById('toast').hidden = true; });
    await page.click('#btn-spell-speak-top');
    ts = await toastState(page);
    check(ts.visible && ts.text === 'No hay nada escrito todavía', 'El botón "Hablar" superior avisa igual');
    await page.click('.key[data-action="save"]');
    check((await toastState(page)).text === 'Escribe algo antes de guardar', 'Guardar sin texto avisa');
    await page.close();
  });

  /* ============ 10. Sin conexión (al final: apaga el servidor) ============ */
  await scenario('10. Sin conexión (service worker)', async () => {
    const page = await newPage();
    let ready = false; const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      ready = await page.evaluate(async () => {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg || !reg.active) return false;
          for (const k of await caches.keys()) { const c = await caches.open(k); if ((await c.keys()).length >= 9) return true; }
        } catch (e) { /* nada */ }
        return false;
      });
      if (ready) break;
      await sleep(200);
    }
    check(ready, `Service worker activo con la caché inicial completa (${Date.now() - t0} ms)`);
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'load' });
    check(await page.locator('.mode-tile').count() === 6 && (await page.evaluate(() => !!window.TalkAgain)), 'Sin red (setOffline) la app se carga y funciona');
    check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'La página está controlada por el service worker');
    await page.click('[data-goto="board"]');
    check(await page.locator('#board-grid .tile').count() >= 10, 'El tablero funciona sin conexión');
    await shot(page, 'offline-board');
    await page.context().setOffline(false);
    await stopServer();
    await page.reload({ waitUntil: 'load' });
    check(await page.locator('.mode-tile').count() === 6, 'Con el servidor apagado la app se sirve desde la caché del service worker');
    await startServer();
    await page.reload({ waitUntil: 'load' });
    check(await page.locator('.mode-tile').count() === 6, 'De vuelta en línea la app sigue funcionando');
    await page.close();
  });

  const relevant = consoleErrors.filter(e => !/favicon|fonts\.g|ERR_INTERNET|net::|Failed to load resource/i.test(e));
  check(relevant.length === 0, 'Sin errores de consola en ninguna página' + (relevant.length ? ': ' + relevant.join(' | ') : ''));
} finally {
  await browser.close();
  await stopServer();
}
console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo correcto');
console.log('Capturas en', SHOTS);
process.exit(failures ? 1 : 0);
