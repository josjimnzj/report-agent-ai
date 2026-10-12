// Composable de Vue sobre dictation.js (equivalente al useDictation de React de workflow-agent-api).
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { createDictation, dictationSupport } from './dictation';

const join = (a, b) => a + (a && b && !/\s$/.test(a) ? ' ' : '') + b;

/**
 * @param {object} o
 * @param {import('vue').Ref<string>} o.text texto del compositor (v-model)
 * @param {import('vue').Ref<'browser'|'whisper'>} o.engine motor elegido
 * @param {import('vue').Ref<string>} o.language 'es' | 'en'
 * @param {string} o.transcribeUrl
 * @param {() => Record<string, string>} [o.getHeaders]
 */
export function useDictation({ text, engine, language, transcribeUrl, getHeaders }) {
  const state = ref('idle'); // 'idle' | 'listening' | 'transcribing'
  const status = ref('');
  const error = ref('');
  let base = '';

  const dict = createDictation({
    transcribeUrl,
    language: language.value,
    getHeaders: () => getHeaders?.() ?? {},
    getContext: () => text.value,
    onText: (t, { partial }) => {
      // Navegador: reemplaza lo dictado en esta sesión. Whisper: añade la frase al final.
      if (partial) text.value = join(base, t);
      else { text.value = join(text.value, t); base = text.value; }
    },
    onStatus: (msg, st) => { status.value = msg; state.value = st; },
    onError: (msg) => { error.value = msg; },
  });

  watch(language, (l) => dict.setLanguage(l));
  onBeforeUnmount(() => dict.stop());

  /** Llamar desde un clic (Safari/iOS exige un gesto del usuario para el micrófono). */
  function toggle() {
    if (dict.active) { dict.stop(); return; }
    error.value = '';
    base = text.value;
    void dict.start(engine.value);
  }

  /** Detener sin alternar: antes de enviar o vaciar el texto (un dictado activo lo volvería a escribir). */
  const stop = () => dict.stop();

  return {
    toggle,
    stop,
    state,
    status,
    error,
    /** Enviar queda bloqueado mientras se dicta y mientras Whisper termina de transcribir lo grabado. */
    busy: computed(() => state.value !== 'idle'),
    isBrowser: computed(() => engine.value === 'browser'),
    support: dictationSupport,
  };
}
