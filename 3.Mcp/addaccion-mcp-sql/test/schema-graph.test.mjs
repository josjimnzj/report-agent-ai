import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSchemaGraph, DEFAULT_GRAPH_PATH } from '../dist/graph/loader.js';
import { SchemaGraph, tokenize } from '../dist/graph/schema-graph.js';
import { QueryValidator } from '../dist/security.js';
import {
  SchemaOverviewTool, SchemaSearchTool, SchemaDescribeTool, SchemaPathTool, SchemaExamplesTool, SchemaChecksTool,
} from '../dist/tools/schema-tools.js';

const graph = SchemaGraph.load(DEFAULT_GRAPH_PATH);
const fakeConnection = {
  connect: async () => { throw new Error('sin BD en pruebas'); },
  query: async () => ({ recordset: [] }),
};
const tool = (C) => new C(fakeConnection, 1000, graph);

test('tokenize splits camelCase, strips accents and stems', () => {
  assert.deepEqual(tokenize('AD_CaseType'), ['ad', 'case', 'type']);
  assert.deepEqual(tokenize('Llamadas Telefónicas'), ['llamada', 'telefonica']);
});

test('bundled AddACCION graph loads', () => {
  const st = graph.stats();
  assert.equal(st.database, 'DESA_581CEM');
  assert.ok(st.tables > 100);
  assert.ok(st.declared > 0);
  assert.ok(graph.data.glossary.length > 0);
});

test('loader honours SCHEMA_GRAPH_ENABLED and missing paths', () => {
  assert.equal(loadSchemaGraph({ SCHEMA_GRAPH_ENABLED: 'false' }), null);
  assert.equal(loadSchemaGraph({ SCHEMA_GRAPH_PATH: '/no/such/graph.json' }), null);
  assert.ok(loadSchemaGraph({}));
});

test('resolve finds tables by id, name and tokens', () => {
  assert.equal(graph.resolve('dbo.AD_Account').table?.id, 'dbo.AD_Account');
  assert.equal(graph.resolve('[ad_account]').table?.id, 'dbo.AD_Account');
  assert.equal(graph.resolve('nope_xyz').table, null);
});

test('search ranks AD_Account for "clientes"', () => {
  const { hits } = graph.search('clientes', 5);
  assert.ok(hits.length > 0);
  assert.ok(hits.some(h => h.table.id === 'dbo.AD_Account'));
});

test('glossary answers "ventas"', () => {
  assert.ok(graph.searchGlossary('ventas del mes').length > 0);
});

test('findPaths returns JOIN paths with ON clauses', () => {
  const rel = graph.data.relations.find(r => r.kind === 'declared' && r.from !== r.to);
  const paths = graph.findPaths(rel.from, rel.to, 2);
  assert.ok(paths.length > 0);
  assert.equal(paths[0][0].from, rel.from);
  assert.match(paths[0][0].on, / = /);
});

test('every bundled verification and example passes the query validator', () => {
  for (const c of graph.data.verifications) assert.equal(QueryValidator.validateQuery(c.sql).isValid, true, `${c.id}: ${c.sql}`);
  for (const e of graph.data.queryExamples) assert.equal(QueryValidator.validateQuery(e.sql).isValid, true, e.question);
});

test('schema tools return JSON', async () => {
  const overview = JSON.parse(await tool(SchemaOverviewTool).execute({}));
  assert.equal(overview.database, 'DESA_581CEM');
  const search = JSON.parse(await tool(SchemaSearchTool).execute({ query: 'ventas' }));
  assert.ok(search.count > 0);
  const describe = JSON.parse(await tool(SchemaDescribeTool).execute({ table: 'AD_Account', column_filter: 'Account' }));
  assert.equal(describe.found, true);
  assert.ok(describe.columns.length > 0);
  const rel = graph.data.relations.find(r => r.kind === 'declared' && r.from !== r.to);
  const path = JSON.parse(await tool(SchemaPathTool).execute({ from_table: rel.from, to_table: rel.to }));
  assert.equal(path.found, true);
  assert.match(path.paths[0].sqlFrom, /^FROM .+ JOIN .+ ON /);
  const examples = JSON.parse(await tool(SchemaExamplesTool).execute({ question: 'ventas por mes' }));
  assert.ok(examples.count >= 0);
  await assert.rejects(tool(SchemaSearchTool).execute({}), /query/);
});

test('schema_checks reports the SQL when the database is unreachable', async () => {
  const r = JSON.parse(await tool(SchemaChecksTool).execute({ topic: '' }));
  assert.ok(r.count > 0);
  for (const c of r.checks) {
    assert.ok(c.sql);
    assert.match(c.error, /execute_query/);
  }
});
