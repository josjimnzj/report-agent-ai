import { BaseTool } from './base.js';
import { SqlServerConnection } from '../connection.js';
import { QueryValidator } from '../security.js';
import { SchemaGraph, PathHop } from '../graph/schema-graph.js';

// Port de WorkflowAgentApi/Graph/SchemaTools.cs: herramientas de solo lectura sobre el grafo del esquema de AddACCION.
// Todas responden desde el grafo local salvo schema_checks, que ejecuta SELECT predefinidos contra la BD.

const MAX_CHARS = 14000;

/** JSON sin nulos (como JsonIgnoreCondition.WhenWritingNull) y truncado para no saturar el contexto del modelo. */
function ok(payload: unknown): string {
  let s = JSON.stringify(payload, (_k, v) => (v === null || v === undefined ? undefined : v));
  if (s.length > MAX_CHARS) s = s.slice(0, MAX_CHARS) + '… [truncado: acota con column_filter o una búsqueda más específica]';
  return s;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const int = (v: unknown, def: number) => (typeof v === 'number' && Number.isInteger(v) ? v : def);

abstract class SchemaGraphTool extends BaseTool {
  constructor(connection: SqlServerConnection, maxRows: number, protected readonly graph: SchemaGraph) {
    super(connection, maxRows);
  }
}

export class SchemaOverviewTool extends SchemaGraphTool {
  getName() { return 'schema_overview'; }
  getDescription() {
    return 'Grafo LOCAL del esquema de AddACCION (sin tocar la BD): resumen, dominios, tablas más conectadas, CONVENCIONES del modelo (reglas que debes respetar al escribir SQL) y términos del glosario de negocio. Úsalo para orientarte antes de explorar la BD.';
  }
  getInputSchema() { return { type: 'object', properties: {}, required: [] }; }

  async execute(): Promise<string> {
    const g = this.graph;
    const st = g.stats();
    const domainCount = new Map<string, string[]>();
    for (const t of g.tables) {
      const tag = t.tags.find(x => x !== 'catalogo' && x !== 'vista');
      if (!tag) continue;
      if (!domainCount.has(tag)) domainCount.set(tag, []);
      domainCount.get(tag)!.push(t.name);
    }
    const domains = [...domainCount.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15)
      .map(([prefix, names]) => ({ prefix, tables: names.length, examples: names.slice(0, 4) }));
    const mostConnected = [...g.tables]
      .sort((a, b) => g.degree(b.id) - g.degree(a.id))
      .slice(0, 10)
      .map(t => ({ table: t.id, relations: g.degree(t.id), description: t.description }));
    return ok({
      database: st.database, builtAt: st.builtAt, updatedAt: st.updatedAt, source: 'schema-graph',
      conventions: g.data.conventions.length === 0 ? null : g.data.conventions,
      glossaryTerms: g.data.glossary.length === 0 ? null : g.data.glossary.map(e => e.term),
      tables: st.tables, views: st.views, columns: st.columns, declaredRelations: st.declared, inferredRelations: st.inferred,
      catalogTables: g.tables.filter(t => t.tags.includes('catalogo')).length,
      domains, mostConnected,
      note: "Relaciones 'inferred' se deducen por nombre de columna (confianza < 1); verifica con datos si es crítico.",
    });
  }
}

export class SchemaSearchTool extends SchemaGraphTool {
  getName() { return 'schema_search'; }
  getDescription() {
    return 'Busca en el grafo LOCAL de AddACCION las tablas/vistas relevantes por palabras (nombre, columnas, descripción, alias; entiende español e inglés). Devuelve también definiciones del GLOSARIO de negocio (con su filtro SQL y medidas) cuando la pregunta usa un término de negocio como «ventas». Excluye tablas temporales/de respaldo (no-usar). Úsalo SIEMPRE antes de list_tables/describe_table.';
  }
  getInputSchema() {
    return {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Palabras clave, p. ej. 'resultado de llamada' o 'plantilla correo'." },
        limit: { type: 'integer', description: 'Máximo de resultados (1-25, por defecto 8).' },
        include_unused: { type: 'boolean', description: 'Incluir tablas temporales/respaldo/staging (no-usar). Por defecto false.' },
      },
      required: ['query'],
    };
  }

  async execute(params: any): Promise<string> {
    const query = str(params?.query);
    if (!query.trim()) throw new Error("Falta 'query'.");
    const { hits, excludedUnused } = this.graph.search(query, int(params?.limit, 8), params?.include_unused === true);
    const glossary = this.graph.searchGlossary(query);
    return ok({
      query, count: hits.length,
      glossary: glossary.length === 0 ? null : glossary.map(e => ({
        term: e.term, definition: e.definition, tables: e.tables, filter: e.filter, measures: e.measures, evidence: e.evidence,
      })),
      excludedUnused: excludedUnused > 0 ? excludedUnused : null,
      results: hits.map(h => ({
        table: h.table.id, kind: h.table.kind, rows: h.table.rowCount, description: h.table.description,
        tags: h.table.tags, primaryKey: h.table.columns.filter(c => c.isPk).map(c => c.name),
        matchedColumns: h.matchedColumns, score: Math.round(h.score * 10) / 10,
      })),
      hint: hits.length === 0 ? 'Sin coincidencias en el grafo. Prueba sinónimos; solo si no hay nada, usa list_tables/describe_table (último recurso).' : null,
    });
  }
}

export class SchemaDescribeTool extends SchemaGraphTool {
  getName() { return 'schema_describe'; }
  getDescription() {
    return 'Describe una tabla/vista del grafo LOCAL de AddACCION: columnas con tipo/PK/nulabilidad/descripción, filas aproximadas y relaciones (declaradas e inferidas) hacia y desde otras tablas.';
  }
  getInputSchema() {
    return {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla, con o sin esquema (dbo.Tabla).' },
        column_filter: { type: 'string', description: 'Opcional: texto que deben contener los nombres de columna (tablas con muchas columnas).' },
      },
      required: ['table'],
    };
  }

  async execute(params: any): Promise<string> {
    const g = this.graph;
    const name = str(params?.table);
    const filter = str(params?.column_filter);
    if (!name.trim()) throw new Error("Falta 'table'.");
    const { table: t, candidates } = g.resolve(name);
    if (!t) {
      const suggestions = candidates.length > 0 ? candidates : g.search(name, 5).hits.map(h => h.table);
      return ok({
        found: false, table: name,
        suggestions: suggestions.map(s => s.id),
        hint: candidates.length > 0
          ? 'Nombre ambiguo: indica esquema.tabla.'
          : 'No existe en el grafo (puede ser nueva o el grafo estar desactualizado). Último recurso: describe_table.',
      });
    }

    const f = filter.trim().toLowerCase();
    const colList = f ? t.columns.filter(c => c.name.toLowerCase().includes(f)) : t.columns;
    const shown = colList.slice(0, 150);
    const neighbors = g.neighbors(t.id);
    return ok({
      found: true, table: t.id, kind: t.kind, rows: t.rowCount, description: t.description, tags: t.tags, aliases: t.aliases,
      primaryKey: t.columns.filter(c => c.isPk).map(c => c.name),
      columns: shown.map(c => ({
        name: c.name, type: c.type, nullable: c.nullable, pk: c.isPk ? true : null, identity: c.isIdentity ? true : null, description: c.description,
      })),
      columnsOmitted: colList.length - shown.length > 0 ? colList.length - shown.length : null,
      references: neighbors.filter(n => n.outgoing).slice(0, 40)
        .map(n => ({ to: n.other, on: SchemaGraph.on(n.rel), kind: n.rel.kind, confidence: n.rel.confidence, name: n.rel.name })),
      referencedBy: neighbors.filter(n => !n.outgoing).slice(0, 40)
        .map(n => ({ from: n.other, on: SchemaGraph.on(n.rel), kind: n.rel.kind, confidence: n.rel.confidence, name: n.rel.name })),
      source: 'grafo local',
    });
  }
}

export class SchemaPathTool extends SchemaGraphTool {
  getName() { return 'schema_path'; }
  getDescription() {
    return 'Camino(s) de JOIN más corto(s) entre dos tablas según el grafo LOCAL de AddACCION, con la condición ON de cada salto.';
  }
  getInputSchema() {
    return {
      type: 'object',
      properties: {
        from_table: { type: 'string' },
        to_table: { type: 'string' },
        max_hops: { type: 'integer', description: 'Saltos máximos (1-6, por defecto 4).' },
      },
      required: ['from_table', 'to_table'],
    };
  }

  async execute(params: any): Promise<string> {
    const g = this.graph;
    const from = str(params?.from_table);
    const to = str(params?.to_table);
    const maxHops = int(params?.max_hops, 4);
    const a = g.resolve(from);
    const b = g.resolve(to);
    if (!a.table || !b.table) {
      return ok({
        found: false,
        hint: 'Tabla no encontrada o ambigua; usa schema_search para obtener el nombre exacto.',
        from: a.table?.id ?? from, to: b.table?.id ?? to,
        candidatesFrom: a.candidates.map(c => c.id), candidatesTo: b.candidates.map(c => c.id),
      });
    }
    const paths = g.findPaths(a.table.id, b.table.id, maxHops);
    if (paths.length === 0) {
      return ok({
        found: false, from: a.table.id, to: b.table.id, maxHops,
        hint: 'Sin camino dentro de ese número de saltos en el grafo (las relaciones no declaradas ni inferidas no aparecen).',
      });
    }
    const fromClause = (p: PathHop[]) => `FROM ${a.table!.id}` + p.map(h => ` JOIN ${h.to} ON ${h.on}`).join('');
    return ok({
      found: true, from: a.table.id, to: b.table.id,
      paths: paths.map(p => ({
        hops: p.length,
        inferredHops: p.filter(h => h.kind === 'inferred').length,
        steps: p,
        sqlFrom: fromClause(p),
      })),
    });
  }
}

export class SchemaExamplesTool extends SchemaGraphTool {
  getName() { return 'schema_examples'; }
  getDescription() {
    return 'Ejemplos de SQL YA PROBADOS sobre AddACCION para preguntas de negocio parecidas (few-shot). Úsalo antes de escribir una consulta de ventas, cobranza, leads, etc. Si un ejemplo trae mcpWarning, adáptalo.';
  }
  getInputSchema() {
    return {
      type: 'object',
      properties: { question: { type: 'string', description: 'La pregunta del usuario o sus palabras clave.' } },
      required: ['question'],
    };
  }

  async execute(params: any): Promise<string> {
    const question = str(params?.question);
    if (!question.trim()) throw new Error("Falta 'question'.");
    const found = this.graph.findExamples(question);
    return ok({
      question, count: found.length,
      examples: found.map(e => {
        const v = QueryValidator.validateQuery(e.sql);
        return { question: e.question, sql: e.sql, mcpWarning: v.isValid ? null : v.error };
      }),
      hint: found.length === 0
        ? 'Sin ejemplos parecidos; construye la consulta con schema_describe/schema_path.'
        : 'Adapta los nombres/filtros a la pregunta; respeta mcpWarning si aparece.',
    });
  }
}

export class SchemaChecksTool extends SchemaGraphTool {
  getName() { return 'schema_checks'; }
  getDescription() {
    return 'VERIFICA CON DATOS REALES los supuestos que hace el grafo de AddACCION (qué campo trae el monto de una venta, tipos de trámite, estados y códigos de catálogo, mapeos de estado). Ejecuta consultas de solo lectura predefinidas para el tema y devuelve sus resultados con la forma de interpretarlos. Úsalo ANTES de apoyarte en montos, estados o códigos de negocio; si los datos contradicen al grafo, mandan los datos.';
  }
  getInputSchema() {
    return {
      type: 'object',
      properties: {
        topic: { type: 'string', description: "Tema de la pregunta, p. ej. 'monto de ventas' o 'estados de venta'. Vacío = todas las verificaciones." },
      },
      required: [],
    };
  }

  async execute(params: any): Promise<string> {
    const topic = str(params?.topic);
    const found = this.graph.findChecks(topic);
    if (found.length === 0) {
      return ok({ topic, count: 0, hint: 'No hay verificaciones para ese tema; valida con un SELECT pequeño a las tablas que indique el grafo.' });
    }

    const results: unknown[] = [];
    for (const c of found) {
      const head = { id: c.id, title: c.title, assumption: c.assumption, interpret: c.interpret };
      const v = QueryValidator.validateQuery(c.sql);
      if (!v.isValid) { results.push({ head, error: `Verificación incompatible con el MCP: ${v.error}` }); continue; }
      try {
        await this.connection.connect();
        const sql = QueryValidator.addRowLimit(QueryValidator.sanitizeQuery(c.sql), 200);
        const rs = (await this.connection.query(sql)).recordset;
        const columns = rs.length > 0 ? Object.keys(rs[0]) : [];
        const rows = rs.slice(0, 40).map((r: any) => columns.map(col => r[col]));
        results.push({ head, ran: true, columns, rows, truncated: rs.length > 40 ? true : null });
      } catch (error) {
        results.push({ head, sql: c.sql, error: `No se pudo ejecutar: ${(error as Error).message}. Ejecuta este SQL con execute_query.` });
      }
    }
    return ok({ topic, count: results.length, checks: results });
  }
}

export const SCHEMA_TOOL_CLASSES = [
  SchemaOverviewTool,
  SchemaSearchTool,
  SchemaDescribeTool,
  SchemaPathTool,
  SchemaExamplesTool,
  SchemaChecksTool,
];
