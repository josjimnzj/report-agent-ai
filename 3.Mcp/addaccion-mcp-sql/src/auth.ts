import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Réplica de ApiKeyAuthMiddleware (Workflow-Agent-api/Services/ApiKeyAuth.cs) para el modo HTTP/SSE:
// - API key en la cabecera X-Api-Key o Authorization: Bearer <key>.
// - Falla cerrado: sin MCP_API_KEY responde 503, salvo MCP_AUTH_DISABLED=true (solo desarrollo local).
// - Limita los intentos fallidos por IP (10 por minuto) para frenar fuerza bruta.

export interface ApiKeyAuthOptions {
  apiKey?: string | undefined;
  disabled?: boolean;
  trustProxy?: boolean;
  maxFailuresPerMinute?: number;
  now?: () => number;
}

export type AuthCheck = (req: IncomingMessage, res: ServerResponse) => boolean;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? '?';
}

export function providedApiKey(req: IncomingMessage): string | undefined {
  const header = req.headers['x-api-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (key) return key;
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return undefined;
}

/** Devuelve una función que autoriza la petición (true) o escribe la respuesta de error (false). */
export function createApiKeyAuth(options: ApiKeyAuthOptions): AuthCheck {
  const maxFailures = options.maxFailuresPerMinute ?? 10;
  const now = options.now ?? Date.now;
  const expected = options.apiKey ? sha256(options.apiKey) : null;
  const failures = new Map<string, { window: number; count: number }>();

  return (req, res) => {
    if (options.disabled) return true;

    if (!expected) {
      sendJson(res, 503, { error: 'MCP_API_KEY no está configurada en el servidor.' });
      return false;
    }

    const ip = clientIp(req, options.trustProxy ?? false);
    const window = Math.floor(now() / 60000);
    const f = failures.get(ip);
    if (f && f.window === window && f.count >= maxFailures) {
      sendJson(res, 429, { error: 'Demasiados intentos fallidos; espera un minuto.' });
      return false;
    }

    const provided = providedApiKey(req);
    const valid = !!provided && timingSafeEqual(sha256(provided), expected);
    if (!valid) {
      failures.set(ip, f && f.window === window ? { window, count: f.count + 1 } : { window, count: 1 });
      if (failures.size > 10000) {
        for (const [k, v] of failures) if (v.window !== window) failures.delete(k); // limpieza de ventanas viejas
      }
      console.error(`Invalid API key from ${ip} on ${req.method} ${(req.url ?? '').split('?')[0]}`);
      sendJson(res, 401, { error: 'API key inválida o ausente.' });
      return false;
    }

    return true;
  };
}
