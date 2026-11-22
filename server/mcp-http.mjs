import { createServer } from 'node:http';
import { isMcpEnabled, LOOPBACK_HOSTS } from './config.mjs';
import { handleMcpMessage, PROTOCOL_VERSIONS, rpcError } from './mcp-protocol.mjs';

const MAX_BODY_BYTES = 1_048_576;
const DEFAULT_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173'];
const ALLOW = 'POST, DELETE, OPTIONS';

function validHost(value, port) {
  try {
    const url = new URL(`http://${value}`);
    return LOOPBACK_HOSTS.has(url.hostname) && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash && Number(url.port || 80) === port;
  } catch { return false; }
}

function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // An aborted IncomingMessage can emit error after aborted. Keep that listener
    // until the stream is collected, including after the promise has settled.
    const clean = () => { req.off('data', onData); req.off('end', onEnd); req.off('aborted', onError); };
    const fail = status => { clean(); reject(Object.assign(new Error(), { status })); };
    const onError = () => fail(400);
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) { fail(413); req.resume(); }
      else chunks.push(chunk);
    };
    const onEnd = () => {
      clean();
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { reject(Object.assign(new Error(), { status: 400 })); }
    };
    req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onError);
  });
}

export function createMcpServer({ keyStore, enabled = false, tools = [], callTool, bridge, now = Date.now, allowedOrigins = DEFAULT_ORIGINS } = {}) {
  enabled = isMcpEnabled(enabled);
  const origins = new Set(allowedOrigins);
  const attempts = new Map();
  const server = createServer((req, res) => {
    const send = (status, body = null, headers = {}) => {
      if (res.destroyed || res.headersSent) return;
      const data = body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
      res.writeHead(status, {
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        ...(body === null ? {} : { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' }),
        ...headers,
      });
      res.end(data);
      if (!req.readableEnded) req.resume();
    };

    void (async () => {
      // Validate the HTTP authority too: native MCP clients have no Origin header.
      const port = server.address()?.port;
      if (!port || !validHost(req.headers.host, port)) return send(403, { error: 'Host no permitido.' });
      const origin = req.headers.origin;
      if (origin !== undefined && !origins.has(origin) && ![
        `http://127.0.0.1:${port}`, `http://localhost:${port}`,
      ].includes(origin)) return send(403, { error: 'Origen no permitido.' });
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      const path = req.url?.split('?')[0];
      if (path === '/health' && req.method === 'GET') return send(200, { name: 'Trazo', mcpEnabled: enabled });
      if (path?.startsWith('/bridge/')) {
        if (!enabled || !bridge) return send(404, 'Not Found');
        if (!origin) return send(403, { error: 'El enlace debe iniciarse desde Trazo.' });
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        if (req.method === 'OPTIONS') return send(204);
        if (req.method !== 'POST') return send(405, null, { Allow: 'POST, OPTIONS' });
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return send(415, { error: 'Se requiere JSON.' });
        try {
          const body = await readJson(req, path === '/bridge/result' ? 16 * MAX_BODY_BYTES : MAX_BODY_BYTES);
          if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'Se requiere un objeto JSON.' });
          if (path === '/bridge/connect') return send(200, bridge.connect(body.code, body.workspaceId));
          const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
          if (path.startsWith('/bridge/keys/')) {
            bridge.authorizeBrowser(token);
            if (path === '/bridge/keys/list') return send(200, { keys: keyStore.list() });
            if (path === '/bridge/keys/create') return send(200, keyStore.create({ name: body.name, days: body.days }));
            if (path === '/bridge/keys/revoke') { keyStore.revoke(body.id); return send(200, { revoked: true }); }
            return send(404, 'Not Found');
          }
          if (path === '/bridge/poll') return send(200, { command: await bridge.poll(token, body.consumerId) });
          if (path === '/bridge/heartbeat') { bridge.heartbeat(token, body.consumerId); return send(200, { connected: true }); }
          if (path === '/bridge/result') { bridge.complete(token, body.consumerId, body.id, body.result); return send(200, { accepted: true }); }
          if (path === '/bridge/disconnect') { bridge.disconnect(token, body.consumerId); return send(200, { disconnected: true }); }
          return send(404, 'Not Found');
        } catch (error) { return send(error.status ?? 400, { error: error.message || 'No se pudo leer la solicitud del enlace.' }); }
      }
      if (path !== '/mcp' && path !== '/mcp/') return send(404, 'Not Found');
      if (!enabled) return send(404, 'Not Found');

      res.setHeader('Access-Control-Allow-Methods', ALLOW);
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id');
      res.setHeader('Access-Control-Expose-Headers', 'MCP-Protocol-Version');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') return send(204);
      if (req.method !== 'POST' && req.method !== 'DELETE') return send(405, null, { Allow: ALLOW });

      const time = now();
      for (const [ip, attempt] of attempts) if (attempt.until <= time) attempts.delete(ip);
      const ip = req.socket.remoteAddress;
      const attempt = attempts.get(ip);
      if (attempt?.count >= 5) return send(429, { error: 'Demasiados intentos. Espera un minuto.' }, { 'Retry-After': String(Math.ceil((attempt.until - time) / 1000)) });
      const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
      const key = token ? keyStore?.authenticate(token) : null;
      if (!key) {
        attempts.set(ip, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? time + 60_000 });
        return send(401, { error: 'Clave MCP no válida.' }, { 'WWW-Authenticate': 'Bearer realm="Trazo"' });
      }
      attempts.delete(ip);
      const version = req.headers['mcp-protocol-version'];
      if (version !== undefined && !PROTOCOL_VERSIONS.includes(version)) return send(400, rpcError(null, -32600, 'Unsupported MCP-Protocol-Version'));
      // No session state is allocated, so termination is an authenticated no-op.
      if (req.method === 'DELETE') return send(200);
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return send(415, { error: 'Se requiere Content-Type: application/json.' });
      const accept = (req.headers.accept ?? '').split(',').map(value => value.split(';')[0].trim());
      if (!accept.includes('*/*') && !(accept.includes('application/json') && accept.includes('text/event-stream'))) return send(406, { error: 'Accept debe incluir application/json y text/event-stream.' });
      if (Number(req.headers['content-length']) > MAX_BODY_BYTES) return send(413, { error: 'El mensaje supera 1 MB.' }, { Connection: 'close' });
      let message;
      try { message = await readJson(req); }
      catch (error) { return send(error.status ?? 400, rpcError(null, error.status === 413 ? -32600 : -32700, error.status === 413 ? 'Request too large' : 'Parse error'), { Connection: 'close' }); }
      const outcome = await handleMcpMessage(message, { key, tools, callTool });
      const negotiated = message?.method === 'initialize' ? outcome.payload?.result?.protocolVersion : undefined;
      return send(outcome.status, outcome.payload, { 'MCP-Protocol-Version': negotiated ?? version ?? '2025-03-26' });
    })().catch(() => send(500, { error: 'No se pudo completar la solicitud MCP.' }));
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;
  server.maxRequestsPerSocket = 100;
  return server;
}
