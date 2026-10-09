// Punto único de acceso al agente de datos. En esta fase solo existe la implementación en duro;
// la fase 3 añadirá el cliente SSE real (fetch + ReadableStream) y elegirá con VITE_DATA_MODE.
export { streamQuery } from './dataAgentApi.mock';
