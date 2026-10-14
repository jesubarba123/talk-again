/* Prueba de humo con Playwright: abre la app en Chromium, recorre todas las pantallas,
   comprueba que no hay errores de consola ni desbordamiento horizontal en móvil,
   y que el barrido, el historial y los ajustes funcionan.
   Uso: npm install && npm test   (necesita Python 3 para el servidor estático). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || path.join(tmpdir(), 'talk-again-shots');
mkdirSync(SHOTS, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) failures++; };
const consoleErrors = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  // ---------- Escritorio ----------
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.screenshot({ path: path.join(SHOTS, 'desktop-home.png') });
  check(await page.locator('.mode-tile').count() === 7, 'Inicio muestra 7 modos');
  check((await page.locator('meta[property="og:image"]').getAttribute('content') || '').endsWith('icons/social.png'), 'Etiquetas Open Graph presentes');
  check((await page.request.get(BASE + 'icons/social.png')).ok(), 'Imagen social servida');

  // Frases
  await page.click('[data-goto="board"]');
  check(await page.locator('#board-grid .tile').count() >= 10, 'Tablero de frases con tiles');
  await page.click('#board-grid .tile >> nth=1');
  let hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === 1 && hist[0].type === 'phrase', 'Tocar una frase la añade al historial');
  await page.click('[data-cat="sentimientos"]');
  check(await page.locator('#board-grid .tile.k-feel').count() >= 10, 'Cambio de categoría a Sentimientos');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-board.png') });

  // Sí / No
  await page.click('#btn-home'); await page.click('[data-goto="yesno"]');
  await page.fill('#question-input', '¿Tienes dolor?');
  await page.click('.answer-yes');
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === 2 && hist[1].text === 'Sí' && hist[1].q === '¿Tienes dolor?', 'SÍ queda en el historial con la pregunta');
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // quitar foco del input
  await page.keyboard.press('ArrowRight');
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === 3 && hist[2].text === 'No', 'Flecha derecha responde NO');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-yesno.png') });

  // Deletrear
  await page.click('#btn-home'); await page.click('[data-goto="spell"]');
  for (const k of ['H', 'O']) await page.click(`.key[data-key="${k}"]`);
  const preds = await page.locator('.pred-btn').allTextContents();
  check(preds.length > 0 && preds.every(w => w.toLowerCase().startsWith('ho')), `Predicciones para "ho": ${preds.join(', ')}`);
  for (const k of ['L', 'A']) await page.click(`.key[data-key="${k}"]`);
  await page.click('.key[data-action="space"]');
  await page.click('.key[data-key="Q"]'); await page.click('.key[data-key="U"]'); await page.click('.key[data-key="E"]');
  await page.click('.key[data-key="´"]');
  check((await page.locator('#spell-output').innerText()).trim() === 'hola qué', 'Deletreo con tilde: "hola qué"');
  await page.click('.key[data-action="save"]');
  check(await page.locator('.saved-chip').count() === 1, 'Frase guardada aparece como chip');
  await page.click('.key[data-action="speak"]');
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist[hist.length - 1].type === 'spell' && hist[hist.length - 1].text === 'hola qué', 'Hablar añade el texto al historial');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-spell.png') });

  // Dolor
  await page.click('#btn-home'); await page.click('[data-goto="pain"]');
  check(await page.locator('#body-map [data-part]').count() === 26, 'Mapa del cuerpo: 26 zonas (13 delante + 13 detrás)');
  await page.click('#body-map [data-part="pecho"]');
  await page.click('.level[data-level="7"]');
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist[hist.length - 1].text.includes('Me duele el pecho') && hist[hist.length - 1].text.includes('7 de 10'), 'Dolor: zona + intensidad en el historial');
  await page.click('.seg-btn[data-side="back"]');
  check(await page.locator('#body-map [data-part="espalda_baja"]').isVisible(), 'Vista de espalda visible');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-pain.png') });

  // Armar frase
  await page.click('#btn-home'); await page.click('[data-goto="build"]');
  check(await page.locator('#build-starts .tile').count() === 10, 'Armar frase: 10 comienzos');
  await page.click('#build-starts [data-start="0"]');
  check(await page.locator('#build-step-2').isVisible() && (await page.locator('#build-step-2-title').textContent()).includes('Quiero'), 'Paso 2 muestra continuaciones de "Quiero"');
  await page.click('#build-nexts [data-next="agua"]');
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist[hist.length - 1].text === 'Quiero agua', 'Frase armada "Quiero agua" en el historial');
  await page.click('#build-mods [data-mod="por favor"]');
  check((await page.locator('#build-sentence').innerText()).trim() === 'Quiero agua por favor', 'Añadido "por favor"');
  await page.click('#btn-build-save');
  await page.click('#btn-build-new'); await page.click('#build-starts [data-start="0"]');
  check((await page.locator('#build-nexts .tile').first().innerText()).trim() === 'agua', 'La continuación usada sube al principio');
  await page.click('#btn-build-back'); await page.click('#build-starts [data-start="8"]');
  await page.click('#build-nexts [data-next="beber?"]'); await page.click('#build-mods [data-mod="ahora"]');
  check((await page.locator('#build-sentence').innerText()).trim() === '¿Puedo beber ahora?', 'Pregunta con añadido conserva el signo');
  await page.click('#btn-home'); await page.click('[data-goto="spell"]');
  check((await page.locator('.saved-chip').allTextContents()).some(t => t.includes('Quiero agua por favor')), 'Frase guardada desde Armar aparece en Deletrear');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-build.png') });

  // Deslizar y soltar
  await page.click('#btn-settings'); await page.selectOption('#set-touch-mode', 'drag');
  await page.evaluate(() => window.TalkAgain.show('board'));
  check(await page.locator('#dragbar').isVisible(), 'Barra de deslizar visible');
  let before = (await page.evaluate(() => window.TalkAgain.history)).length;
  const t1 = page.locator('#board-grid .tile').nth(0), t2 = page.locator('#board-grid .tile').nth(3);
  const b1 = await t1.boundingBox(), b2 = await t2.boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 8 });
  check(await t2.evaluate(e => e.classList.contains('drag-hl')), 'La opción bajo el dedo se ilumina');
  await page.mouse.up();
  await page.waitForTimeout(100);
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === before + 1 && hist[hist.length - 1].text === await t2.evaluate(e => e.dataset.label), 'Soltar sobre la opción la elige una sola vez');
  before = hist.length;
  await page.mouse.move(b1.x + 10, b1.y + 10); await page.mouse.down(); await page.mouse.move(6, 300, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(100);
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === before, 'Soltar fuera de las opciones no elige nada');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-drag.png') });

  // Deslizar y mantener quieto
  await page.click('#btn-settings'); await page.selectOption('#set-touch-mode', 'dwell');
  await page.evaluate(() => { const r = document.getElementById('set-dwell'); r.value = '0.4'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => window.TalkAgain.show('board'));
  const t3 = page.locator('#board-grid .tile').nth(1); const b3 = await t3.boundingBox();
  before = (await page.evaluate(() => window.TalkAgain.history)).length;
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2); await page.mouse.down();
  await page.waitForTimeout(150);
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === before, 'Sin esperar el tiempo quieto no elige');
  await page.waitForTimeout(500);
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === before + 1, 'Dejar el dedo quieto elige');
  await page.waitForTimeout(700);
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === before + 1, 'Mantener el dedo no repite la elección');
  await page.mouse.up();

  // Toques cortos ignorados en modo normal
  await page.click('#btn-settings'); await page.selectOption('#set-touch-mode', 'tap');
  await page.evaluate(() => { const r = document.getElementById('set-min-touch'); r.value = '0.3'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => window.TalkAgain.show('board'));
  before = (await page.evaluate(() => window.TalkAgain.history)).length;
  await page.locator('#board-grid .tile').nth(2).click();
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === before, 'Un toque muy corto se ignora');
  await page.locator('#board-grid .tile').nth(2).click({ delay: 400 });
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist.length === before + 1, 'Un toque de 0,4 s sí elige');
  await page.evaluate(() => { const r = document.getElementById('set-min-touch'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); });

  // Historial
  await page.click('#btn-home'); await page.click('[data-goto="history"]');
  check(await page.locator('.hist-item').count() === hist.length, 'Historial lista todas las entradas');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-history.png') });

  // Ajustes persisten
  await page.click('#btn-settings');
  await page.selectOption('#set-scale', '1.4');
  await page.selectOption('#set-theme', 'dark');
  await page.reload({ waitUntil: 'load' });
  const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale').trim());
  check(scale === '1.4' && await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Tamaño de texto y tema persisten tras recargar');
  await page.click('#btn-settings');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-settings-dark.png'), fullPage: true });
  await page.selectOption('#set-theme', 'system'); await page.selectOption('#set-scale', '1');

  // Barrido: inicio → Espacio selecciona la primera opción (Sí/No)
  await page.click('#btn-home');
  await page.click('#btn-scan');
  await page.waitForTimeout(300);
  check(await page.locator('.scan-hl').count() === 1, 'Barrido ilumina una opción en Inicio');
  check(await page.locator('#scanbar').isVisible(), 'Barra de barrido visible');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-scan.png') });
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  check((await page.locator('#view-title').innerText()) === 'Sí / No', 'Espacio activa la opción iluminada (abre Sí / No)');
  await page.waitForTimeout(1700);
  check(await page.locator('#view-yesno .scan-hl').count() === 1, 'El barrido continúa en la nueva pantalla');
  // Tocar la pantalla selecciona
  await page.click('#view-yesno .hint');
  hist = await page.evaluate(() => window.TalkAgain.history);
  check(hist[hist.length - 1].type === 'answer', 'Tocar la pantalla durante el barrido elige la opción iluminada');
  // Tablero con filas (más de 8 opciones) → primer nivel por filas
  await page.click('#btn-home'); await page.waitForTimeout(1800);
  await page.evaluate(() => window.TalkAgain.show('board'));
  await page.waitForTimeout(1800);
  check(await page.locator('.scan-group-hl').count() >= 1, 'En Frases el barrido empieza por filas');
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check(await page.locator('#view-board .scan-hl').count() === 1, 'Elegir una fila pasa a barrer sus opciones');
  await page.click('#btn-scan');
  check(await page.locator('.scan-hl, .scan-group-hl').count() === 0, 'Detener el barrido quita el resaltado');

  // Service worker en localhost
  const sw = await page.evaluate(async () => { try { const r = await navigator.serviceWorker.getRegistration(); return !!r; } catch (e) { return false; } });
  check(sw, 'Service worker registrado');

  // ---------- Móvil 400 px ----------
  const mobile = await browser.newPage({ viewport: { width: 400, height: 780 }, isMobile: true, hasTouch: true });
  mobile.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  mobile.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await mobile.goto(BASE, { waitUntil: 'load' });
  const noOverflow = async (name) => {
    const r = await mobile.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, vw: document.getElementById('views').scrollWidth, vc: document.getElementById('views').clientWidth }));
    check(r.sw <= r.cw && r.vw <= r.vc, `Sin desbordamiento horizontal en móvil: ${name} (${r.sw}/${r.cw}, views ${r.vw}/${r.vc})`);
  };
  await noOverflow('inicio'); await mobile.screenshot({ path: path.join(SHOTS, 'mobile-home.png') });
  for (const v of ['yesno', 'board', 'build', 'spell', 'pain', 'history', 'settings']) {
    await mobile.evaluate(view => window.TalkAgain.show(view), v);
    await mobile.waitForTimeout(150);
    await noOverflow(v);
    await mobile.screenshot({ path: path.join(SHOTS, `mobile-${v}.png`) });
  }
  await mobile.emulateMedia({ colorScheme: 'dark' });
  await mobile.evaluate(() => window.TalkAgain.show('board'));
  await mobile.screenshot({ path: path.join(SHOTS, 'mobile-board-dark.png') });

  const relevant = consoleErrors.filter(e => !/favicon|fonts\.g|ERR_INTERNET|net::|Failed to load resource/i.test(e));
  check(relevant.length === 0, 'Sin errores de consola' + (relevant.length ? ': ' + relevant.join(' | ') : ''));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo correcto');
console.log('Capturas en', SHOTS);
process.exit(failures ? 1 : 0);
