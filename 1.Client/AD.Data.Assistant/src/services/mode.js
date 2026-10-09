// VITE_DATA_MODE=api: backend real (agente + Neon). Cualquier otro valor: datos en duro y localStorage.
export const IS_API = import.meta.env.VITE_DATA_MODE === 'api';
