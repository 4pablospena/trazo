import type { BridgeCommand, BridgeResult } from '../../shared/mcp-contract';
export interface BridgeConnection { endpoint: string; token: string; expiresAt: number; workspaceId: string }
export type BridgeStatus = 'disconnected' | 'connecting' | 'connected';
const STORAGE_KEY = 'trazo.mcp.connection';

export function localEndpoint(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Usa la dirección HTTP local del servidor, por ejemplo http://127.0.0.1:5174.');
  return url.origin;
}

async function post(endpoint: string, path: string, body: unknown, token?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${endpoint}/bridge/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
  const text = await response.text();
  let value: Record<string, unknown>;
  try { value = JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(response.status === 404 ? 'El MCP no está activado en ese servidor. Arráncalo con MCP_ENABLED=true.' : 'El servidor no devolvió una respuesta MCP válida.'); }
  if (!response.ok) throw Object.assign(new Error(typeof value.error === 'string' ? value.error : 'No se pudo conectar con el MCP.'), { status: response.status });
  return value;
}

export async function pairBridge(endpoint: string, code: string, workspaceId: string): Promise<BridgeConnection> {
  endpoint = localEndpoint(endpoint);
  const result = await post(endpoint, 'connect', { code, workspaceId }, undefined, AbortSignal.timeout(10_000));
  if (typeof result.token !== 'string' || typeof result.expiresAt !== 'number') throw new Error('El servidor no devolvió un enlace válido.');
  const connection = { endpoint, token: result.token, expiresAt: result.expiresAt, workspaceId };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(connection)); } catch { /* The link still works in memory when browser storage is unavailable. */ }
  return connection;
}

export function storedBridge(): BridgeConnection | undefined {
  try {
    const value: BridgeConnection = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!value || typeof value.token !== 'string' || typeof value.workspaceId !== 'string' || typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now()) return;
    return { ...value, endpoint: localEndpoint(value.endpoint) };
  } catch { return; }
}
export function forgetBridge(): void { try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Optional session persistence. */ } }

export function startBridge(connection: BridgeConnection, execute: (command: BridgeCommand, signal: AbortSignal) => Promise<Record<string, unknown>>,
  onStatus: (status: BridgeStatus, error?: string) => void) {
  const consumerId = crypto.randomUUID();
  const abort = new AbortController();
  const pause = (ms: number) => new Promise<void>(resolve => {
    if (abort.signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    abort.signal.addEventListener('abort', finish, { once: true });
  });
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const loop = async () => {
    try {
      if (!navigator.locks) throw new Error('Este navegador no permite reservar el enlace MCP. Usa una versión actual de Chrome, Firefox o Safari.');
      await navigator.locks.request(`trazo-mcp:${connection.endpoint}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Otra pestaña de Trazo ya está utilizando este MCP.');
        onStatus('connecting');
        heartbeat = setInterval(() => { void post(connection.endpoint, 'heartbeat', { consumerId }, connection.token, abort.signal).catch(() => undefined); }, 5000);
        let failures = 0;
        while (!abort.signal.aborted) {
          try {
            const response = await post(connection.endpoint, 'poll', { consumerId }, connection.token, abort.signal);
            failures = 0;
            onStatus('connected');
            const command = response.command as BridgeCommand | null;
            if (!command) continue;
            let result: BridgeResult;
            try {
              if (Date.now() >= command.deadline || abort.signal.aborted) throw new Error('El comando ha caducado antes de ejecutarse.');
              result = { ok: true, value: await execute(command, abort.signal) };
            } catch (cause) { result = { ok: false, error: cause instanceof Error ? cause.message : 'No se pudo ejecutar la operación.' }; }
            // Retry only acknowledgement. The operation itself is never replayed.
            for (let attempt = 0; ; attempt++) {
              try { await post(connection.endpoint, 'result', { consumerId, id: command.id, result }, connection.token, abort.signal); break; }
              catch (error) { if (abort.signal.aborted || attempt >= 2) throw error; await pause(300); }
            }
          } catch (cause) {
            if (abort.signal.aborted) break;
            if (cause && typeof cause === 'object' && 'status' in cause && cause.status === 401) { forgetBridge(); throw cause; }
            if (++failures > 20) throw cause;
            onStatus('connecting', cause instanceof Error ? cause.message : 'Reconectando con el MCP…');
            await pause(1000);
          }
        }
      });
    } catch (cause) { if (!abort.signal.aborted) onStatus('disconnected', cause instanceof Error ? cause.message : 'No se pudo conectar con el MCP.'); }
    finally { clearInterval(heartbeat); }
  };
  void loop();
  return {
    stop() { abort.abort(); clearInterval(heartbeat); },
    async disconnect() {
      abort.abort(); clearInterval(heartbeat); forgetBridge();
      try { await post(connection.endpoint, 'disconnect', { consumerId }, connection.token, AbortSignal.timeout(3000)); }
      finally { onStatus('disconnected'); }
    },
  };
}
