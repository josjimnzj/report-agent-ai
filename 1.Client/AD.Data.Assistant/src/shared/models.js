// Modelo y esfuerzo: mismas reglas que ModelCatalog.Resolve en workflow-agent-api, para no enviar combinaciones que la API rechaza.

export const EFFORT_LABELS = { low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo' };
export const PROVIDER_LABELS = { anthropic: 'Claude', gemini: 'Gemini' };

/**
 * @param {{ models: Array, defaultModel: string, defaultEffort: string }} catalog
 * @param {string|null} model   preferencia guardada (puede no existir ya en el catálogo)
 * @param {string|null} effort  preferencia guardada (puede no valer para el modelo)
 * @returns {{ model: string, label: string, effort: string|null, provider: string }}
 */
export function resolveRunSettings(catalog, model, effort) {
  const info = catalog.models.find((m) => m.id === model) ?? catalog.models.find((m) => m.id === catalog.defaultModel) ?? catalog.models[0];
  if (!info.efforts.length) return { model: info.id, label: info.label, effort: null, provider: info.provider };
  let e = effort && info.efforts.includes(effort) ? effort : catalog.defaultEffort;
  // Gemini solo tiene 3 niveles: xhigh/max se rebajan a high, como en la API.
  if (!info.efforts.includes(e)) e = info.efforts.includes('high') ? 'high' : info.efforts.at(-1);
  return { model: info.id, label: info.label, effort: e, provider: info.provider };
}

export const effortLabel = (e) => (e ? EFFORT_LABELS[e] ?? e : 'Sin esfuerzo');
