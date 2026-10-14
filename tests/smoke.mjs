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
  check(await page.locator('.mode-tile').count() === 6, 'Inicio muestra 6 modos');

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
  for (const v of ['yesno', 'board', 'spell', 'pain', 'history', 'settings']) {
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
