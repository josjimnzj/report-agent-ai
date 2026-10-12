// Motores de dictado disponibles, compartidos por el compositor y el selector de modelo (como el selector «Motor de
// dictado» del visor): Whisper en Groq si el servidor lo tiene y el navegador puede grabar; si no, el del navegador.
import { computed, ref } from 'vue';
import { dictationStatus } from '@/services/dictationApi';
import { dictationSupport } from './dictation';

const groq = ref(false);
let loaded = false;

export function loadDictationEngines() {
  if (loaded) return;
  loaded = true;
  dictationStatus().then((s) => { groq.value = Boolean(s.groq); });
}

export const ENGINE_OPTIONS = computed(() => [
  {
    id: 'whisper',
    label: 'Whisper en Groq',
    note: !groq.value ? 'No configurado en el servidor' : !dictationSupport.whisper ? 'Este navegador no puede grabar audio' : 'Frase a frase, en cada pausa; gratis con límites',
    disabled: !(groq.value && dictationSupport.whisper),
  },
  {
    id: 'browser',
    label: 'Navegador',
    note: dictationSupport.browser ? 'Palabra a palabra, en vivo; gratis' : 'Este navegador no lo admite',
    disabled: !dictationSupport.browser,
  },
]);

/** Motor efectivo: el elegido si se puede usar; si no, Whisper y después el navegador. null si ninguno. */
export function effectiveEngine(preferred) {
  const usable = ENGINE_OPTIONS.value.filter((o) => !o.disabled).map((o) => o.id);
  return usable.includes(preferred) ? preferred : usable[0] ?? null;
}

export const DICTATION_LANGS = [{ id: 'es', label: 'Español' }, { id: 'en', label: 'English' }];
