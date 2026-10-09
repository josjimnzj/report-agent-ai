// Punto único de acceso al agente de datos. En esta fase solo existe la implementación en duro;
// la fase 3 añadirá el cliente real (fetch + ReadableStream) y elegirá con VITE_DATA_MODE.
export { getModels, streamQuery } from './dataAgentApi.mock';
