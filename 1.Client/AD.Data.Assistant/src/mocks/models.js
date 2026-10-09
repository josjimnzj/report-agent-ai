// Respuesta en duro de GET /api/models (workflow-agent-api, ModelCatalog + appsettings), con Gemini habilitado.
export const MODELS_RESPONSE = {
  defaultModel: 'claude-opus-5-5',
  defaultEffort: 'high',
  defaultMaxIterations: 10,
  maxIterationsLimit: 20,
  models: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Recomendado: equilibrio calidad/costo ($4/$20 por MTok)', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], provider: 'anthropic' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Más rápido y barato ($2/$10 por MTok)', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], provider: 'anthropic' },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Máxima capacidad, el más caro ($10/$50 por MTok)', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], provider: 'anthropic' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'El más económico ($1/$5 por MTok); sin esfuerzo ni thinking adaptativo', efforts: [], provider: 'anthropic' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Rápido y económico; razonamiento ajustable', efforts: ['low', 'medium', 'high'], provider: 'gemini' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'El más barato de Gemini; menos capacidad', efforts: ['low', 'medium', 'high'], provider: 'gemini' },
  ],
};
