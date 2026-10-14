/* Talk Again — detector de gestos de cabeza (asentir = sí, negar = no) con la cámara frontal.
   Usa MediaPipe Face Landmarker (se descarga de un CDN la primera vez; el service worker lo guarda
   para usarlo sin conexión). Las imágenes se procesan en el dispositivo y no salen de él. */
(function () {
  'use strict';

  const MP_VERSION = '0.10.21';
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  const WINDOW_MS = 1200;      // ventana de análisis
  const REFRACTORY_MS = 1600;  // tiempo mínimo entre gestos
  const INFER_EVERY_MS = 100;  // ~10 imágenes por segundo: suficiente y gasta menos batería

  let landmarker = null;
  let stream = null;
  let video = null;
  let running = false;
  let starting = false;
  let rafId = 0;
  let failures = 0;
  let opts = { sensitivity: 1, onGesture: function () {}, onStatus: function () {}, video: null };
  let samples = [];
  let lastGestureAt = 0, lastFaceAt = 0, lastInferAt = 0, lastStatusAt = 0;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function status(state, msg, extra) {
    try { opts.onStatus(state, msg, extra); } catch (e) { /* nada */ }
  }

  async function loadLandmarker() {
    if (landmarker) return landmarker;
    const vision = await import(MP_BASE + '/vision_bundle.mjs');
    const fileset = await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
    const options = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      canvas: document.createElement('canvas'),   // evita OffscreenCanvas sin WebGL en iPadOS 16
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
      outputFaceBlendshapes: false
    };
    try {
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options);
    } catch (e) {
      options.baseOptions.delegate = 'CPU';
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options);
    }
    return landmarker;
  }

  async function start(options) {
    opts = Object.assign({}, opts, options || {});
    if (running || starting) return true;
    starting = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      starting = false;
      status('error', 'Este navegador no permite usar la cámara. Prueba con Chrome o Safari actualizados.');
      return false;
    }
    status('loading', 'Cargando el detector…');
    try {
      await loadLandmarker();
    } catch (e) {
      console.warn('MediaPipe', e);
      starting = false;
      status('error', 'No se pudo cargar el detector de cara. La primera vez hace falta conexión a internet.');
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
    } catch (e) {
      console.warn('getUserMedia', e);
      starting = false;
      status('error', isIOS
        ? 'Sin permiso para la cámara. En Safari: menú "aA" → Ajustes del sitio web → Cámara → Permitir; en la app instalada: Configuración → Safari → Cámara.'
        : 'Sin permiso para la cámara. Permítelo en el navegador (icono del candado junto a la dirección) y vuelve a probar.');
      return false;
    }
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', () => { if (running) { stop(); status('error', 'La cámara se detuvo. Vuelve a activarla.'); } });
    video = opts.video || document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', '');
    try { await video.play(); } catch (e) { /* algunos navegadores reproducen solos */ }
    samples = [];
    failures = 0;
    lastGestureAt = 0; lastFaceAt = 0; lastInferAt = 0;
    running = true;
    starting = false;
    status('searching', 'Buscando la cara…');
    rafId = requestAnimationFrame(loop);
    return true;
  }

  function stop() {
    running = false;
    starting = false;
    cancelAnimationFrame(rafId);
    if (stream) { stream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* nada */ } }); }
    stream = null;
    if (video) { try { video.pause(); video.srcObject = null; } catch (e) { /* nada */ } }
    samples = [];
    status('stopped', 'Cámara apagada');
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && running && video && video.paused) video.play().catch(() => { /* nada */ });
  });

  /* Ángulos (grados) a partir de la matriz 4x4 (orden por columnas) que da MediaPipe.
     pitch = inclinar la cabeza arriba/abajo (asentir); yaw = girarla a los lados (negar). */
  function anglesFromMatrix(d) {
    const r20 = d[2], r21 = d[6], r22 = d[10];
    const pitch = Math.atan2(r21, r22) * 180 / Math.PI;
    const yaw = Math.atan2(-r20, Math.sqrt(r21 * r21 + r22 * r22)) * 180 / Math.PI;
    return { pitch, yaw };
  }

  function range(arr) {
    let min = Infinity, max = -Infinity;
    for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
    return max - min;
  }

  /* Un gesto es un movimiento de ida y vuelta: amplitud suficiente en un eje, poca en el otro,
     y la cabeza termina cerca de donde empezó. */
  function detect(list) {
    if (list.length < 5) return null;
    const first = list[0], last = list[list.length - 1];
    if (last.t - first.t < 350) return null;
    const sens = Math.max(0.3, Number(opts.sensitivity) || 1);
    const T_NOD = 9 / sens;      // grados
    const T_SHAKE = 11 / sens;   // grados
    const pr = range(list.map(s => s.pitch));
    const yr = range(list.map(s => s.yaw));
    const backP = Math.abs(last.pitch - first.pitch) < pr * 0.5;
    const backY = Math.abs(last.yaw - first.yaw) < yr * 0.5;
    if (pr >= T_NOD && pr > yr * 1.5 && backP) return 'yes';
    if (yr >= T_SHAKE && yr > pr * 1.5 && backY) return 'no';
    return null;
  }

  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (document.hidden) return;
    const now = performance.now();
    if (now - lastInferAt < INFER_EVERY_MS) return;
    if (!video || video.readyState < 2) return;
    lastInferAt = now;
    let result;
    try {
      result = landmarker.detectForVideo(video, now);
      failures = 0;
    } catch (e) {
      if (++failures > 30) {
        console.warn('detectForVideo', e);
        stop();
        status('error', 'El detector falló en este dispositivo. Desactiva y vuelve a activar la cámara.');
      }
      return;
    }
    const mats = result && result.facialTransformationMatrixes;
    const m = mats && mats[0] && mats[0].data;
    if (!m) {
      samples = samples.filter(s => now - s.t < WINDOW_MS);
      if (now - lastFaceAt > 1200 && now - lastStatusAt > 800) { lastStatusAt = now; status('searching', 'Buscando la cara…'); }
      return;
    }
    lastFaceAt = now;
    const a = anglesFromMatrix(m);
    samples.push({ t: now, pitch: a.pitch, yaw: a.yaw });
    samples = samples.filter(s => now - s.t < WINDOW_MS);
    if (now - lastGestureAt < REFRACTORY_MS) return;
    const g = detect(samples);
    if (g) {
      lastGestureAt = now;
      samples = [];
      status('gesture', g === 'yes' ? '👍 Asentir: SÍ' : '👎 Negar: NO', a);
      try { opts.onGesture(g); } catch (e) { console.warn(e); }
    } else if (now - lastStatusAt > 500) {
      lastStatusAt = now;
      status('face', 'Cara detectada', a);
    }
  }

  window.NodDetector = {
    start, stop,
    isRunning() { return running; },
    setSensitivity(v) { opts.sensitivity = Number(v) || 1; },
    _anglesFromMatrix: anglesFromMatrix,
    _detect: detect
  };
})();
