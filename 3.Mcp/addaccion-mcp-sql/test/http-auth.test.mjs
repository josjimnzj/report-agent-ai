import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApiKeyAuth } from '../dist/auth.js';
import { startHttpServer } from '../dist/http.js';

const KEY = 'test-key-123';
const makeServer = () => {
  const s = new Server({ name: 't', version: '1' }, { capabilities: { tools: {} } });
  s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'ping', inputSchema: { type: 'object' } }] }));
  return s;
};

const hosts = [];
async function start(authOptions) {
  const h = await startHttpServer({ port: 0, host: '127.0.0.1', auth: createApiKeyAuth(authOptions), createServer: makeServer });
  hosts.push(h);
  return `http://127.0.0.1:${h.server.address().port}`;
}
after(async () => { for (const h of hosts) await h.close(); });

test('health is public; MCP endpoints require the API key', async () => {
  const base = await start({ apiKey: KEY });
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/sse`)).status, 401);
  assert.equal((await fetch(`${base}/messages?sessionId=x`, { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(`${base}/mcp`, { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(`${base}/sse`, { headers: { 'X-Api-Key': 'wrong' } })).status, 401);
  assert.equal((await fetch(`${base}/nope`, { headers: { 'X-Api-Key': KEY } })).status, 404);
});

test('SSE transport works with X-Api-Key', async () => {
  const base = await start({ apiKey: KEY });
  const headers = { 'X-Api-Key': KEY };
  const client = new Client({ name: 'c', version: '1' });
  await client.connect(new SSEClientTransport(new URL(`${base}/sse`), {
    eventSourceInit: { fetch: (url, init) => fetch(url, { ...init, headers: { ...init?.headers, ...headers } }) },
    requestInit: { headers },
  }));
  const { tools } = await client.listTools();
  assert.equal(tools[0].name, 'ping');
  await client.close();
});

test('Streamable HTTP transport works with Bearer token', async () => {
  const base = await start({ apiKey: KEY });
  const client = new Client({ name: 'c', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${KEY}` } },
  }));
  const { tools } = await client.listTools();
  assert.equal(tools[0].name, 'ping');
  await client.close();
});

test('fails closed without a configured key, unless disabled', async () => {
  const closed = await start({});
  assert.equal((await fetch(`${closed}/sse`, { headers: { 'X-Api-Key': 'x' } })).status, 503);
  const open = await start({ disabled: true });
  const r = await fetch(`${open}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 400); // pasa la autenticación; falla por no ser un initialize
});

test('locks an IP out after 10 failures per minute', async () => {
  let now = 0;
  const base = await start({ apiKey: KEY, now: () => now });
  for (let i = 0; i < 10; i++) assert.equal((await fetch(`${base}/sse`)).status, 401);
  assert.equal((await fetch(`${base}/sse`, { headers: { 'X-Api-Key': KEY } })).status, 429);
  now = 60_000; // siguiente ventana
  const ok = await fetch(`${base}/health`);
  assert.equal(ok.status, 200);
  const ac = new AbortController();
  const r = await fetch(`${base}/sse`, { headers: { 'X-Api-Key': KEY }, signal: ac.signal });
  assert.equal(r.status, 200);
  ac.abort();
});
