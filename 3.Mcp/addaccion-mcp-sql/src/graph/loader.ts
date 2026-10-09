import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SchemaGraph } from './schema-graph.js';

/** Grafo de AddACCION incluido en el paquete (data/schema-graph.addaccion.json). */
export const DEFAULT_GRAPH_PATH = fileURLToPath(new URL('../../data/schema-graph.addaccion.json', import.meta.url));

/**
 * Carga el grafo del esquema para las herramientas schema_*.
 * SCHEMA_GRAPH_ENABLED=false lo desactiva; SCHEMA_GRAPH_PATH cambia el archivo. Devuelve null (con aviso) si no se puede cargar.
 */
export function loadSchemaGraph(env: NodeJS.ProcessEnv = process.env): SchemaGraph | null {
  if ((env.SCHEMA_GRAPH_ENABLED ?? 'true').toLowerCase() === 'false') return null;
  const path = env.SCHEMA_GRAPH_PATH || DEFAULT_GRAPH_PATH;
  if (!existsSync(path)) {
    console.error(`Schema graph not found at ${path}; schema_* tools disabled`);
    return null;
  }
  try {
    const graph = SchemaGraph.load(path);
    const st = graph.stats();
    console.error(`Schema graph loaded: ${st.database} (${st.tables} tables, ${st.views} views, ${st.declared + st.inferred} relations)`);
    return graph;
  } catch (error) {
    console.error(`Schema graph could not be loaded from ${path}: ${(error as Error).message}; schema_* tools disabled`);
    return null;
  }
}
