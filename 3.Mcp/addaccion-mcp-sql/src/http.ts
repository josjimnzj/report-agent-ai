import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { AuthCheck } from './auth.js';

// Modo HTTP: el mismo MCP servido por red, protegido con API key.
//   GET  /sse               -> stream SSE (transporte SSE clásico); el servidor anuncia POST /messages?sessionId=...
//   POST /messages          -> mensajes del cliente para una sesión SSE
//   POST|GET|DELETE /mcp    -> Streamable HTTP (clientes MCP actuales)
//   GET  /health            -> sin autenticación, para el balanceador

export interface HttpOptions {
  port: number;
  host: string;
  auth: AuthCheck;
  createServer: () => Server;
  maxBodyBytes?: number;
}

export interface McpHttpHost {
  server: HttpServer;
  close: () => Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : undefined);
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function startHttpServer(opts: HttpOptions): Promise<McpHttpHost> {
  const maxBody = opts.maxBodyBytes ?? 4 * 1024 * 1024;
  const sse = new Map<string, { transport: SSEServerTransport; server: Server }>();
  const streamable = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

  async function handleSse(_req: IncomingMessage, res: ServerResponse) {
    const transport = new SSEServerTransport('/messages', res);
    const server = opts.createServer();
    sse.set(transport.sessionId, { transport, server });
    transport.onclose = () => {
      sse.delete(transport.sessionId);
    };
    res.on('close', () => {
      if (sse.delete(transport.sessionId)) void server.close().catch(() => undefined);
    });
    await server.connect(transport); // connect() llama a start(), que abre el stream SSE
  }

  async function handleSseMessage(req: IncomingMessage, res: ServerResponse, url: URL) {
    const sessionId = url.searchParams.get('sessionId') ?? '';
    const entry = sse.get(sessionId);
    if (!entry) {
      sendJson(res, 404, { error: 'Sesión SSE desconocida o cerrada.' });
      return;
    }
    await entry.transport.handlePostMessage(req, res);
  }

  async function handleStreamable(req: IncomingMessage, res: ServerResponse) {
    const header = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(header) ? header[0] : header;
    const body = req.method === 'POST' ? await readJsonBody(req, maxBody) : undefined;

    if (sessionId) {
      const entry = streamable.get(sessionId);
      if (!entry) {
        sendJson(res, 404, { jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
        return;
      }
      await entry.transport.handleRequest(req, res, body);
      return;
    }

    if (req.method !== 'POST' || !isInitializeRequest(body)) {
      sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: missing mcp-session-id' }, id: null });
      return;
    }

    const server = opts.createServer();
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: id => {
        streamable.set(id, { transport, server });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId && streamable.delete(transport.sessionId)) void server.close().catch(() => undefined);
    };
    // exactOptionalPropertyTypes: el transporte declara onclose como opcional-con-undefined
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, body);
  }

  const http = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/health' && req.method === 'GET') {
        sendJson(res, 200, { status: 'ok', sessions: sse.size + streamable.size });
        return;
      }

      if (!opts.auth(req, res)) return;

      if (path === '/sse' && req.method === 'GET') return handleSse(req, res);
      if (path === '/messages' && req.method === 'POST') return handleSseMessage(req, res, url);
      if (path === '/mcp' && ['GET', 'POST', 'DELETE'].includes(req.method ?? '')) return handleStreamable(req, res);

      sendJson(res, 404, { error: 'Not found' });
    })().catch(error => {
      const status = (error as { status?: number }).status ?? 500;
      if (status === 500) console.error('[HTTP Error]', error);
      sendJson(res, status, { error: (error as Error).message });
    });
  });

  const close = async () => {
    for (const { server } of [...sse.values(), ...streamable.values()]) await server.close().catch(() => undefined);
    sse.clear();
    streamable.clear();
    http.closeAllConnections?.();
    await new Promise<void>(resolve => http.close(() => resolve()));
  };

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port, opts.host, () => {
      http.off('error', reject);
      resolve({ server: http, close });
    });
  });
}
