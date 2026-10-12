/**
 * Dictado por voz, portado de workflow-agent-api (docs/dictado/dictation.js) con las correcciones del visor.
 * Sin dependencias (ES module). Dos motores:
 *  - 'browser': Web Speech API (SpeechRecognition). Texto palabra a palabra. Chrome/Edge, Android y Safari (Mac, iOS 14.5+).
 *  - 'whisper': graba con MediaRecorder, corta en cada pausa (detección de silencio) y envía cada frase a un
 *               endpoint del backend que transcribe con Whisper (Groq). Texto frase a frase. Todos los navegadores.
 *
 * Uso:
 *   const d = createDictation({
 *     transcribeUrl: '/api/transcribe',              // solo motor whisper
 *     getHeaders: () => ({ 'X-Api-Key': key }),       // opcional
 *     language: 'es',                                 // 'es' | 'en' | código BCP-47
 *     getContext: () => textarea.value,               // texto previo: contexto para Whisper
 *     onText: (text, { partial }) => …,               // ver abajo
 *     onStatus: (msg, state) => …,                    // state: 'idle' | 'listening' | 'transcribing'
 *     onError: (msg) => …,
 *   });
 *   await d.start('whisper'); … d.stop();
 *
 * onText:
 *   - whisper: se llama una vez por frase con { partial: false } → AÑADIR al final del texto.
 *   - browser: se llama continuamente con { partial: true } y el texto dictado acumulado de la sesión
 *              (finales + provisional) → REEMPLAZAR lo dictado en esta sesión (ver helper attachToTextarea).
 *              Al detener, lo mostrado se conserva y lo que el navegador aún tuviera pendiente se descarta.
 */

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : undefined;
const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_MOBILE = IS_IOS || /Android/i.test(UA);

export const dictationSupport = {
  /** Reconocimiento nativo disponible (no existe en Firefox ni en algunos navegadores de iOS). */
  browser: !!SR,
  /** Grabación disponible (requiere además un backend con /api/transcribe). */
  whisper: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && !!window.MediaRecorder,
};

const SR_ERRORS = {
  'not-allowed': 'Permiso de micrófono denegado. Ajustes del sitio (candado junto a la URL) → Micrófono → Permitir, y recarga.',
  'service-not-allowed': IS_IOS
    ? 'iOS bloqueó el reconocimiento de voz: activa Ajustes → General → Teclado → Dictado (y Siri).'
    : 'El navegador bloqueó el reconocimiento de voz.',
  'audio-capture': 'No se detecta un micrófono disponible (¿otra app lo está usando?).',
  network: 'El reconocimiento del navegador no pudo contactar su servicio de voz.',
  'language-not-supported': 'Idioma no soportado por el reconocimiento del navegador.',
  'no-speech': 'No se detectó voz.',
  'start-failed': 'No se pudo iniciar el reconocimiento de voz del navegador.',
};

/** El navegador cortó el dictado al reiniciarlo tras una pausa (no es un permiso negado por el usuario). */
export const RESTART_DENIED = 'El navegador detuvo el dictado tras una pausa. Pulsa Dictar para continuar.';

const join = (a, b) => a + (a && b && !/\s$/.test(a) ? ' ' : '') + b;
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);

// Texto de un reconocedor reconstruido desde cero en cada evento (no se acumula entre eventos): Android a veces
// entrega resultados acumulados ("hola", "hola necesito") o repetidos, que así no se duplican.
function transcriptOf(results) {
  let text = '';
  for (let i = 0; i < results.length; i++) {
    const t = results[i][0].transcript.trim();
    if (!t) continue;
    const tn = words(t).join(' '), cur = words(text).join(' ');
    if (cur && tn.startsWith(cur)) text = t;                                 // acumulado: sustituye
    else if (cur && (cur === tn || cur.endsWith(' ' + tn))) continue;       // repetido: se ignora
    else text = join(text, t);
  }
  return text;
}

// Quita del inicio de "next" las palabras con las que ya termina "prev" (el reconocedor nuevo puede reenviar
// lo ya dictado). Exige 2 palabras o "prev" completo para no comerse repeticiones legítimas de una palabra.
function stripOverlap(prev, next) {
  const p = words(prev), n = words(next);
  for (let k = Math.min(p.length, n.length); k > 0; k--) {
    if (p.slice(-k).join(' ') !== n.slice(0, k).join(' ')) continue;
    if (k < 2 && k !== p.length) break;
    const raw = next.trim().split(/\s+/);
    return raw.length === n.length ? raw.slice(k).join(' ') : next;
  }
  return next;
}

const DEFAULTS = {
  minSegmentMs: 3000,   // no cortar frases más cortas (cuida el límite de Groq: ~20 peticiones/min)
  softSegmentMs: 6000,  // a partir de aquí basta una pausa corta
  maxSegmentMs: 12000,  // cortar aunque no haya pausa
  pauseMs: 300,         // silencio que cierra una frase (al hablar seguido las pausas son de 300–700 ms)
  shortPauseMs: 200,    // pausa que basta pasado softSegmentMs
  minVoiceMs: 300,      // voz mínima para enviar un segmento (si no, se descarta)
  tickMs: 100,
  fixedSegmentMs: 5000, // sin Web Audio: cortes fijos
  contextChars: 200,
};

export function createDictation(options) {
  const o = { ...DEFAULTS, ...options };
  const noop = () => {};
  const onText = o.onText || noop, onStatus = o.onStatus || noop, onError = o.onError || noop;
  let active = null; // sesión en curso

  const bcp47 = (l) => (l === 'es' ? 'es-MX' : l === 'en' ? 'en-US' : l || 'es-MX');

  // ---------- motor navegador ----------
  let lastHeard = ''; // lo último dictado con este motor (para no repetirlo si el navegador lo reenvía)

  function startBrowser() {
    if (!SR) throw new Error('Este navegador no tiene reconocimiento de voz.');
    // committed: texto de reconocedores ya cerrados en esta sesión; heard: el del reconocedor actual.
    const s = { engine: 'browser', rec: null, committed: '', heard: '', prevHeard: '', restarts: 0 };
    const ctx = o.getContext?.() || '';
    const tail = words(lastHeard).join(' ');
    if (tail && words(ctx).join(' ').endsWith(tail)) s.prevHeard = lastHeard;

    // Cierra la sesión: desconecta y aborta el reconocedor, descartando lo que tuviera pendiente (Chrome sigue
    // entregando el resultado final tras stop(); si no se descarta, reaparece al volver a dictar).
    const close = () => {
      const r = s.rec;
      s.rec = null;
      lastHeard = join(s.committed, s.heard) || lastHeard;
      if (r) {
        r.onresult = r.onerror = r.onend = null;
        try { r.abort(); } catch { /* ya detenido */ }
      }
      if (active === s) { active = null; onStatus('', 'idle'); }
    };

    const create = () => {
      const r = new SR();
      r.lang = bcp47(o.language);
      // Android: "continuous" duplica o corta texto, se reinicia a mano. iOS: continuo, porque Safari puede negar
      // un reinicio que no sale de un toque (los duplicados se filtran en transcriptOf).
      r.continuous = !IS_MOBILE || IS_IOS;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        if (s.rec !== r) return;
        let text = transcriptOf(e.results);
        const prev = join(s.prevHeard, s.committed).trim();
        if (prev) text = stripOverlap(prev, text);
        s.heard = text;
        onText(join(s.committed, s.heard), { partial: true });
      };
      r.onerror = (e) => {
        if (s.rec !== r || e.error === 'aborted' || e.error === 'no-speech') return;
        close();
        // Un permiso negado en un reinicio automático (no en el primer arranque) es el navegador cortando la sesión.
        if (s.restarts && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) { onError(RESTART_DENIED); return; }
        onError(SR_ERRORS[e.error] || `Error de dictado: ${e.error}`);
      };
      r.onend = () => {
        if (s.rec !== r) return;
        // El navegador corta tras un silencio: se reinicia hasta que se pulse Detener.
        s.committed = join(s.committed, s.heard);
        s.heard = '';
        s.restarts++;
        try { s.rec = create(); s.rec.start(); } catch { close(); onError(RESTART_DENIED); }
      };
      return r;
    };
    s.stop = close;
    s.rec = create();
    try { s.rec.start(); } catch (e) { s.rec = null; throw new Error(`${SR_ERRORS['start-failed']} (${e.name || e.message})`); }
    onStatus('Escuchando…', 'listening');
    return s;
  }

  // ---------- motor Whisper frase a frase ----------
  async function transcribe(blob, ext) {
    const fd = new FormData();
    fd.append('audio', blob, `audio.${ext}`);
    fd.append('language', (o.language || 'es').slice(0, 2));
    const ctx = o.getContext?.();
    if (ctx) fd.append('prompt', ctx.slice(-o.contextChars));
    const res = await fetch(o.transcribeUrl, { method: 'POST', headers: o.getHeaders?.() || {}, body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText || `HTTP ${res.status}`);
    return (body.text || '').trim();
  }

  async function startWhisper() {
    if (!o.transcribeUrl) throw new Error('Falta transcribeUrl.');
    // AudioContext dentro del gesto del usuario (requisito de Safari/iOS): start() debe llamarse desde un clic.
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = AC ? new AC() : null;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      ac?.close();
      throw new Error(e.name === 'NotFoundError' ? 'No se encontró micrófono.' : e.name === 'NotReadableError' ? 'El micrófono está en uso por otra app.' : SR_ERRORS['not-allowed']);
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
    const type = (mime || 'audio/webm').split(';')[0];
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';

    const s = { engine: 'whisper', stopped: false, pending: 0, chain: Promise.resolve(), timer: null, rec: null, seg: null, error: null };
    let analyser = null, buf = null, floor = null;
    if (ac) {
      try {
        await ac.resume();
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        ac.createMediaStreamSource(stream).connect(analyser);
        buf = new Float32Array(analyser.fftSize);
      } catch { analyser = null; }
    }

    const status = () => {
      if (s.stopped) onStatus(s.pending ? 'Transcribiendo…' : '', s.pending ? 'transcribing' : 'idle');
      else onStatus(s.pending ? 'Escuchando… (transcribiendo frase)' : 'Escuchando… el texto aparece en cada pausa', 'listening');
    };
    const cleanup = () => {
      clearInterval(s.timer);
      stream.getTracks().forEach((t) => t.stop());
      ac?.close().catch(() => {});
      if (active === s) active = null;
      status();
    };

    // Cada frase es un MediaRecorder nuevo: los trozos sueltos de webm no son archivos válidos por sí solos.
    const startSegment = () => {
      const chunks = [];
      const now = performance.now();
      const seg = { startedAt: now, voicedMs: 0, lastSound: now };
      let rec;
      try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e) { onError(`No se pudo grabar audio (${e.name}).`); s.stop(); return; }
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        // Sin voz no se envía: ahorra cuota y evita que Whisper "invente" texto con el silencio.
        if (chunks.length && (seg.voicedMs >= o.minVoiceMs || !analyser)) {
          s.pending++; status();
          const job = transcribe(new Blob(chunks, { type }), ext);
          // En paralelo, pero se entregan EN ORDEN.
          s.chain = s.chain.then(() => job).then((t) => { if (t) onText(t, { partial: false }); })
            .catch((e) => { s.error = e.message; onError(e.message); })
            .finally(() => { s.pending--; status(); if (s.stopped && !s.pending) cleanup(); });
        } else if (s.stopped && !s.pending) cleanup();
        if (!s.stopped) startSegment();
      };
      rec.start();
      s.rec = rec; s.seg = seg;
    };

    s.stop = () => {
      if (s.stopped) return;
      s.stopped = true;
      clearInterval(s.timer);
      if (s.rec?.state === 'recording') s.rec.stop(); else if (!s.pending) cleanup();
      status();
    };

    // Detector de voz/silencio con umbral adaptativo al ruido de fondo.
    s.timer = setInterval(() => {
      const seg = s.seg; if (!seg || s.stopped) return;
      const now = performance.now(), age = now - seg.startedAt;
      if (analyser) {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // Ruido de fondo: baja rápido y sube despacio, también mientras se habla (si solo se actualizara en
        // silencio, con ambiente ruidoso todo contaría como voz y nunca se detectaría una pausa).
        if (floor === null) floor = rms;
        floor = rms < floor ? floor * 0.7 + rms * 0.3 : floor * 0.997 + rms * 0.003;
        if (rms > Math.max(0.01, floor * 2.5)) seg.voicedMs += o.tickMs;
        if (rms >= Math.max(0.006, floor * 1.8)) seg.lastSound = now;
        const pause = seg.voicedMs >= o.minVoiceMs && now - seg.lastSound >= (age >= o.softSegmentMs ? o.shortPauseMs : o.pauseMs);
        if ((pause && age >= o.minSegmentMs) || age >= o.maxSegmentMs) s.rec.stop();
      } else if (age >= o.fixedSegmentMs) s.rec.stop();
    }, o.tickMs);

    startSegment();
    status();
    return s;
  }

  return {
    /** Llamar desde un gesto del usuario (clic). engine: 'browser' | 'whisper'. */
    async start(engine = dictationSupport.whisper ? 'whisper' : 'browser') {
      if (active) return;
      try { active = engine === 'browser' ? startBrowser() : await startWhisper(); }
      catch (e) { active = null; onStatus('', 'idle'); onError(e.message); }
    },
    /**
     * Detiene la grabación. browser: queda 'idle' al instante y lo pendiente del reconocedor se descarta.
     * whisper: se transcribe la última frase antes de quedar 'idle'.
     * Llamar también antes de enviar o vaciar el texto: si el dictado siguiera activo, lo volvería a escribir.
     */
    stop() { active?.stop(); },
    get active() { return !!active; },
    setLanguage(l) { o.language = l; },
  };
}

/**
 * Helper: conecta el dictado a un <textarea>/<input> (motores browser y whisper).
 * Devuelve { onText, begin } para pasar a createDictation y llamar justo antes de start().
 */
export function attachToTextarea(el) {
  let base = '';
  const fire = () => el.dispatchEvent(new Event('input', { bubbles: true }));
  return {
    begin() { base = el.value; },
    onText(text, { partial }) {
      if (partial) el.value = join(base, text);           // browser: reemplaza lo dictado en la sesión
      else { el.value = join(el.value, text); base = el.value; } // whisper: añade la frase
      fire();
    },
  };
}
