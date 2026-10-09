import { readFileSync } from 'node:fs';

// Port de WorkflowAgentApi/Graph/SchemaGraph.cs (Workflow-Agent-api): grafo del esquema en memoria.
// Nodos = tablas/vistas con columnas y metadatos; aristas = relaciones declaradas, inferidas o manuales.

export interface GColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPk: boolean;
  isIdentity: boolean;
  description?: string | null;
  aliases: string[];
}

export interface GTable {
  schema: string;
  name: string;
  kind: string; // "table" | "view"
  rowCount?: number | null;
  description?: string | null;
  tags: string[];
  aliases: string[];
  columns: GColumn[];
  id: string; // schema.name (calculado al cargar)
}

export interface GRelation {
  from: string;
  fromColumns: string[];
  to: string;
  toColumns: string[];
  kind: string; // declared | inferred | manual
  confidence: number;
  name?: string | null;
}

export interface GlossaryEntry {
  term: string;
  synonyms: string[];
  definition: string;
  tables: string[];
  filter?: string | null;
  measures: string[];
  evidence: string[];
}

export interface QueryExample {
  question: string;
  sql: string;
}

export interface GraphCheck {
  id: string;
  title: string;
  appliesTo: string[];
  tables: string[];
  assumption: string;
  sql: string;
  interpret: string;
}

export interface SchemaGraphData {
  format?: string;
  version: number;
  database: string;
  builtAt?: string;
  updatedAt?: string;
  tables: GTable[];
  relations: GRelation[];
  enrichment?: unknown;
  conventions: string[];
  glossary: GlossaryEntry[];
  queryExamples: QueryExample[];
  verifications: GraphCheck[];
}

export interface SearchHit {
  table: GTable;
  score: number;
  matchedColumns: string[];
}

export interface PathHop {
  from: string;
  to: string;
  on: string;
  kind: string;
  confidence: number;
}

export interface Neighbor {
  rel: GRelation;
  other: string;
  outgoing: boolean;
}

export interface GraphStats {
  database: string;
  builtAt?: string | undefined;
  updatedAt?: string | undefined;
  tables: number;
  views: number;
  columns: number;
  declared: number;
  inferred: number;
}

/** Grupos de sinónimos por defecto (Options.cs → SchemaGraphOptions.SynonymGroups). */
export const DEFAULT_SYNONYM_GROUPS: string[][] = [
  ['tramite', 'case'], ['actividad', 'activity'], ['llamada', 'call'], ['correo', 'email', 'mail'],
  ['plantilla', 'template'], ['campana', 'campaign'], ['cliente', 'account', 'customer'], ['cuenta', 'account'],
  ['resultado', 'result'], ['estado', 'state', 'status'], ['asunto', 'subject'], ['tipo', 'type'],
  ['lista', 'list'], ['usuario', 'user'], ['tarea', 'task'], ['cita', 'appointment'], ['flujo', 'workflow'],
  ['contacto', 'contact'], ['oportunidad', 'opportunity', 'lead'], ['producto', 'product'], ['venta', 'sale', 'sales', 'vendido', 'vendida', 'vender'],
];

/** Partes de nombre que marcan tablas de catálogo, p. ej. AD_T_CaseType. */
export const DEFAULT_CATALOG_MARKERS = ['T'];

const STOP_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'unos', 'unas', 'en', 'y', 'o', 'por', 'para', 'con', 'al', 'que', 'se', 'su', 'sus', 'mi',
  'the', 'of', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'with', 'is', 'are', 'by', 'on', 'from', 'all', 'todo', 'toda', 'todos', 'todas',
]);

const TOKEN_RX = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g;

const lower = (s: string) => s.toLowerCase();
const containsCI = (list: string[], value: string) => list.some(x => lower(x) === lower(value));

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
}

export function stem(w: string): string {
  w = stripAccents(w).toLowerCase();
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function tokenize(s: string | null | undefined): string[] {
  if (!s || !s.trim()) return [];
  return (stripAccents(s).match(TOKEN_RX) ?? []).map(stem);
}

const queryTokens = (q: string) => [...new Set(tokenize(q).filter(t => !STOP_WORDS.has(t)))];

interface TableTokens {
  name: Set<string>;
  meta: Set<string>;
  columns: Map<string, Set<string>>;
}

function normalizeTable(raw: any): GTable {
  const schema = raw.schema ?? 'dbo';
  const name = raw.name ?? '';
  return {
    schema,
    name,
    kind: raw.kind ?? 'table',
    rowCount: raw.rowCount ?? null,
    description: raw.description ?? null,
    tags: [...(raw.tags ?? [])],
    aliases: [...(raw.aliases ?? [])],
    columns: (raw.columns ?? []).map((c: any) => ({
      name: c.name ?? '',
      type: c.type ?? '',
      nullable: !!c.nullable,
      isPk: !!c.isPk,
      isIdentity: !!c.isIdentity,
      description: c.description ?? null,
      aliases: [...(c.aliases ?? [])],
    })),
    id: `${schema}.${name}`,
  };
}

export class SchemaGraph {
  readonly data: SchemaGraphData;
  readonly tables: GTable[];

  private readonly byId = new Map<string, GTable>();
  private readonly byName = new Map<string, GTable[]>();
  private readonly adj = new Map<string, Neighbor[]>();
  private readonly tokens = new Map<string, TableTokens>();
  private readonly synonyms = new Map<string, Set<string>>();

  constructor(raw: any, synonymGroups: string[][] = DEFAULT_SYNONYM_GROUPS, catalogMarkers: string[] = DEFAULT_CATALOG_MARKERS) {
    const markers = new Set(catalogMarkers.map(lower));
    const tables: GTable[] = (raw.tables ?? []).map(normalizeTable);
    for (const t of tables) if (t.tags.length === 0) SchemaGraph.addPrefixTags(t, markers); // un grafo enriquecido ya trae sus etiquetas

    this.data = {
      format: raw.format,
      version: raw.version ?? 1,
      database: raw.database ?? '',
      builtAt: raw.builtAt,
      updatedAt: raw.updatedAt,
      tables,
      relations: (raw.relations ?? []).map((r: any) => ({
        from: r.from, fromColumns: r.fromColumns ?? [], to: r.to, toColumns: r.toColumns ?? [],
        kind: r.kind ?? 'declared', confidence: r.confidence ?? 1, name: r.name ?? null,
      })),
      enrichment: raw.enrichment,
      conventions: raw.conventions ?? [],
      glossary: (raw.glossary ?? []).map((e: any) => ({
        term: e.term ?? '', synonyms: e.synonyms ?? [], definition: e.definition ?? '', tables: e.tables ?? [],
        filter: e.filter ?? null, measures: e.measures ?? [], evidence: e.evidence ?? [],
      })),
      queryExamples: (raw.queryExamples ?? []).map((e: any) => ({ question: e.question ?? '', sql: e.sql ?? '' })),
      verifications: (raw.verifications ?? []).map((c: any) => ({
        id: c.id ?? '', title: c.title ?? '', appliesTo: c.appliesTo ?? [], tables: c.tables ?? [],
        assumption: c.assumption ?? '', sql: c.sql ?? '', interpret: c.interpret ?? '',
      })),
    };
    this.tables = tables;

    for (const g of synonymGroups) {
      const set = new Set(g.map(stem));
      for (const w of set) {
        let cur = this.synonyms.get(w);
        if (!cur) this.synonyms.set(w, (cur = new Set()));
        for (const x of set) cur.add(x);
      }
    }

    for (const t of tables) {
      const key = lower(t.id);
      this.byId.set(key, t);
      const nk = lower(t.name);
      if (!this.byName.has(nk)) this.byName.set(nk, []);
      this.byName.get(nk)!.push(t);
      this.adj.set(key, []);
      const meta = new Set<string>();
      for (const s of [...t.tags, ...t.aliases, t.description ?? '']) for (const x of tokenize(s)) meta.add(x);
      const cols = new Map<string, Set<string>>();
      for (const c of t.columns) {
        const set = new Set(tokenize(c.name));
        for (const s of [...c.aliases, c.description ?? '']) for (const x of tokenize(s)) set.add(x);
        cols.set(c.name, set);
      }
      this.tokens.set(key, { name: new Set(tokenize(t.name)), meta, columns: cols });
    }

    for (const r of this.data.relations) {
      const f = lower(r.from);
      const to = lower(r.to);
      if (!this.adj.has(f) || !this.adj.has(to)) continue;
      this.adj.get(f)!.push({ rel: r, other: this.byId.get(to)!.id, outgoing: true });
      if (f !== to) this.adj.get(to)!.push({ rel: r, other: this.byId.get(f)!.id, outgoing: false });
    }
  }

  static load(path: string): SchemaGraph {
    return new SchemaGraph(JSON.parse(readFileSync(path, 'utf8')));
  }

  private static addPrefixTags(t: GTable, markers: Set<string>) {
    const parts = t.name.split('_').filter(p => p.length > 0);
    for (let i = 1; i < parts.length; i++) {
      const tag = parts.slice(0, i).join('_');
      if (!containsCI(t.tags, tag)) t.tags.push(tag);
    }
    if (parts.slice(1, parts.length - 1).some(p => markers.has(lower(p))) && !t.tags.includes('catalogo')) t.tags.push('catalogo');
    if (t.kind === 'view' && !t.tags.includes('vista')) t.tags.push('vista');
  }

  private expand(token: string): string[] {
    const out = [token];
    const syn = this.synonyms.get(token);
    if (syn) for (const x of syn) if (x !== token) out.push(x);
    return out;
  }

  private tok(t: GTable): TableTokens {
    return this.tokens.get(lower(t.id))!;
  }

  stats(): GraphStats {
    return {
      database: this.data.database,
      builtAt: this.data.builtAt,
      updatedAt: this.data.updatedAt ?? this.data.builtAt,
      tables: this.tables.filter(t => t.kind !== 'view').length,
      views: this.tables.filter(t => t.kind === 'view').length,
      columns: this.tables.reduce((n, t) => n + t.columns.length, 0),
      declared: this.data.relations.filter(r => r.kind === 'declared').length,
      inferred: this.data.relations.filter(r => r.kind === 'inferred').length,
    };
  }

  /** Resuelve "schema.nombre" o "nombre". Si es ambiguo devuelve los candidatos. */
  resolve(name: string): { table: GTable | null; candidates: GTable[] } {
    name = name.trim().replace(/^\[+|\]+$/g, '').replace('].[', '.');
    const byId = this.byId.get(lower(name));
    if (byId) return { table: byId, candidates: [] };
    const list = this.byName.get(lower(name));
    if (list) return list.length === 1 ? { table: list[0]!, candidates: [] } : { table: null, candidates: list };
    // coincidencia por tokens del nombre completo (p. ej. "case type" -> AD_T_CaseType)
    const qt = tokenize(name);
    if (qt.length > 0) {
      const qs = new Set(qt);
      const exact = this.tables.filter(x => {
        const n = this.tok(x).name;
        return n.size === qs.size && [...qs].every(q => n.has(q));
      }).slice(0, 5);
      if (exact.length === 1) return { table: exact[0]!, candidates: [] };
      if (exact.length > 1) return { table: null, candidates: exact };
      const subset = this.tables.filter(x => qt.every(q => this.tok(x).name.has(q))).slice(0, 5);
      if (subset.length === 1) return { table: subset[0]!, candidates: [] };
      if (subset.length > 1) return { table: null, candidates: subset };
    }
    return { table: null, candidates: [] };
  }

  /** Las tablas con etiqueta "no-usar" (temporales, respaldos, staging) se excluyen salvo que se pidan. */
  search(query: string, limit = 8, includeUnused = false): { hits: SearchHit[]; excludedUnused: number } {
    const qTokens = queryTokens(query);
    if (qTokens.length === 0) return { hits: [], excludedUnused: 0 };
    const exact = lower(query.trim());
    const hits: SearchHit[] = [];
    let excluded = 0;

    for (const t of this.tables) {
      const tk = this.tok(t);
      const unused = containsCI(t.tags, 'no-usar');
      let score = 0;
      const matched = new Set<string>();
      const matchedCols: { col: string; s: number }[] = [];

      for (const q of qTokens) {
        const variants = this.expand(q);
        let best = 0;
        for (const v of variants) {
          if (tk.name.has(v)) best = Math.max(best, 6);
          else if (v.length >= 3 && [...tk.name].some(n => n.startsWith(v) || (n.length >= 4 && v.startsWith(n)))) best = Math.max(best, 3);
          if (tk.meta.has(v)) best = Math.max(best, 3);
        }
        let colScore = 0;
        for (const [cname, ctoks] of tk.columns) {
          const cs = variants.some(v => ctoks.has(v)) ? 1.5 : 0;
          if (cs > 0) { colScore += cs; matchedCols.push({ col: cname, s: cs }); }
        }
        best = Math.max(best, Math.min(colScore, 4.5));
        if (best > 0) { matched.add(q); score += best; }
      }
      if (matched.size === 0) continue;

      if (lower(t.id) === exact || lower(t.name) === exact) score += 20;
      score *= matched.size / qTokens.length;
      if (t.kind === 'view') score *= 0.9;
      if (unused && !includeUnused) { excluded++; continue; }
      if (unused) score *= 0.5;
      if (containsCI(t.tags, 'nucleo')) score *= 1.2; // tablas núcleo del negocio primero
      if (containsCI(t.tags, 'sin-datos')) score *= 0.85; // vacías: menos probables
      const cols = [...new Set(matchedCols.sort((a, b) => b.s - a.s).map(c => c.col))].slice(0, 6);
      hits.push({ table: t, score, matchedColumns: cols });
    }

    hits.sort((a, b) => b.score - a.score || a.table.name.length - b.table.name.length);
    return { hits: hits.slice(0, Math.min(Math.max(limit, 1), 25)), excludedUnused: excluded };
  }

  /** Entradas del glosario cuyo término o algún sinónimo está contenido (con sinónimos) en la consulta. */
  searchGlossary(query: string, max = 3): GlossaryEntry[] {
    const q = new Set(queryTokens(query).flatMap(t => this.expand(t)));
    if (q.size === 0) return [];
    const scored: { e: GlossaryEntry; score: number }[] = [];
    for (const e of this.data.glossary) {
      let best = 0;
      for (const phrase of [...e.synonyms, e.term]) {
        const toks = queryTokens(phrase);
        if (toks.length > 0 && toks.every(t => q.has(t))) best = Math.max(best, toks.length);
      }
      if (best > 0) scored.push({ e, score: best });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, max).map(x => x.e);
  }

  /** Verificaciones relacionadas con el tema (por glosario, tablas o palabras); sin tema devuelve todas (hasta max). */
  findChecks(topic: string, max = 4): GraphCheck[] {
    const all = this.data.verifications;
    if (all.length === 0) return [];
    const q = new Set(queryTokens(topic).flatMap(t => this.expand(t)));
    if (q.size === 0) return all.slice(0, max);
    return all
      .map(c => {
        const words = [...c.appliesTo, ...c.tables.map(t => t.split('.').pop() ?? t), c.title, c.assumption];
        const toks = new Set(words.flatMap(tokenize).filter(t => !STOP_WORDS.has(t)));
        const applies = new Set(c.appliesTo.flatMap(tokenize).filter(t => !STOP_WORDS.has(t)));
        // coincidir con "aplica a" pesa más que con el texto libre
        let score = 0;
        for (const t of q) { if (applies.has(t)) score += 3; if (toks.has(t)) score += 1; }
        return { c, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(x => x.c);
  }

  /** Ejemplos de SQL cuya pregunta comparte más términos con la consulta. */
  findExamples(query: string, max = 3): QueryExample[] {
    const q = new Set(queryTokens(query).flatMap(t => this.expand(t)));
    if (q.size === 0) return [];
    return this.data.queryExamples
      .map(e => {
        const toks = queryTokens(e.question);
        const shared = toks.filter(t => this.expand(t).some(x => q.has(x))).length;
        return { e, score: toks.length === 0 ? 0 : shared + shared / toks.length };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(x => x.e);
  }

  neighbors(tableId: string): Neighbor[] {
    return this.adj.get(lower(tableId)) ?? [];
  }

  degree(tableId: string): number {
    return this.neighbors(tableId).length;
  }

  /** Caminos de unión más cortos entre dos tablas (hasta 5), prefiriendo relaciones declaradas. */
  findPaths(fromId: string, toId: string, maxHops: number): PathHop[][] {
    maxHops = Math.min(Math.max(maxHops, 1), 6);
    const from = lower(fromId);
    const to = lower(toId);
    if (!this.adj.has(from) || !this.adj.has(to) || from === to) return [];

    // distancia desde el destino (BFS) para recorrer solo caminos mínimos
    const dist = new Map<string, number>([[to, 0]]);
    const queue = [to];
    while (queue.length > 0) {
      const u = queue.shift()!;
      if (dist.get(u)! >= maxHops) continue;
      for (const n of this.adj.get(u)!) {
        const o = lower(n.other);
        if (!dist.has(o)) { dist.set(o, dist.get(u)! + 1); queue.push(o); }
      }
    }
    if (!dist.has(from)) return [];

    const results: PathHop[][] = [];
    let visited = 0;
    const dfs = (u: string, uId: string, acc: PathHop[], seen: Set<string>) => {
      if (results.length >= 40 || ++visited > 20000) return;
      if (u === to) { results.push([...acc]); return; }
      for (const n of this.adj.get(u)!) {
        const o = lower(n.other);
        const od = dist.get(o);
        if (od === undefined || od !== dist.get(u)! - 1 || seen.has(o)) continue;
        acc.push(SchemaGraph.hop(n.rel, uId, n.other, n.outgoing));
        seen.add(o);
        dfs(o, n.other, acc, seen);
        seen.delete(o);
        acc.pop();
      }
    };
    dfs(from, this.byId.get(from)!.id, [], new Set([from]));

    const weak = (p: PathHop[]) => p.filter(h => h.kind === 'inferred' && h.confidence < 0.9).length;
    const conf = (p: PathHop[]) => p.reduce((s, h) => s + h.confidence, 0);
    return results
      .sort((a, b) => weak(a) - weak(b) || conf(b) - conf(a)) // declaradas, manuales y con evidencia primero
      .slice(0, 5);
  }

  private static hop(rel: GRelation, from: string, to: string, outgoing: boolean): PathHop {
    // "on" siempre se expresa con la tabla origen del salto a la izquierda
    const [lt, lc, rt, rc] = outgoing
      ? [rel.from, rel.fromColumns, rel.to, rel.toColumns]
      : [rel.to, rel.toColumns, rel.from, rel.fromColumns];
    const on = lc.slice(0, rc.length).map((a, i) => `${lt}.${a} = ${rt}.${rc[i]}`).join(' AND ');
    return { from, to, on, kind: rel.kind, confidence: rel.confidence };
  }

  static on(r: GRelation): string {
    return r.fromColumns.slice(0, r.toColumns.length).map((x, i) => `${r.from}.${x} = ${r.to}.${r.toColumns[i]}`).join(' AND ');
  }
}
