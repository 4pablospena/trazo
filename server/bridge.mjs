import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { validateToolArguments } from '../shared/mcp-contract.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const problem = (message, status = 409) => Object.assign(new Error(message), { status });
const uncertain = 'No se confirmó el resultado. El cambio puede haberse aplicado; consulta el tablero antes de repetirlo.';

/** One explicitly paired browser, one in-flight command, no automatic redelivery. */
export function createBridge({ redeemPairingCode, now = Date.now, commandTimeout = 90_000, leaseMs = 15_000, pollMs = 8_000 } = {}) {
  let session;
  let waiter;
  let active;
  const queue = [];
  const settled = new Set();
  const fail = (job, message) => { clearTimeout(job.timer); job.reject(problem(message)); };
  const disconnect = () => {
    if (active) fail(active, uncertain);
    active = undefined;
    for (const job of queue.splice(0)) fail(job, 'El navegador se ha desconectado antes de ejecutar la operación.');
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(null); waiter = undefined; }
    session = undefined;
    settled.clear();
  };
  const deliver = () => {
    if (!waiter || active || !queue.length) return;
    active = queue.shift();
    const current = waiter;
    waiter = undefined;
    clearTimeout(current.timer);
    current.resolve(active.command);
  };
  const authorize = (token, consumerId) => {
    if (!session || typeof token !== 'string' || hash(token) !== session.hash || session.expiresAt <= now()) throw problem('El enlace con Trazo ha caducado. Vuelve a vincular el navegador.', 401);
    if (typeof consumerId !== 'string' || !/^[\w-]{10,80}$/.test(consumerId)) throw problem('Identificador de pestaña no válido.', 400);
    if (session.consumerId !== consumerId && (session.lastSeen + leaseMs > now() || active) && session.consumerId) throw problem('Otra pestaña está utilizando este enlace.');
    session.consumerId = consumerId;
    session.lastSeen = now();
  };
  return {
    authorizeBrowser(token) {
      if (!session || typeof token !== 'string' || hash(token) !== session.hash || session.expiresAt <= now()) throw problem('Vincula este navegador antes de gestionar claves.', 401);
    },
    connect(code, workspaceId) {
      if (typeof workspaceId !== 'string' || !/^[\w-]{10,80}$/.test(workspaceId)) throw problem('Espacio de trabajo no válido.', 400);
      if (session && session.expiresAt > now() && session.lastSeen + leaseMs > now()) throw problem('Ya hay un navegador conectado. Desconéctalo antes de vincular otro.');
      if (!redeemPairingCode?.(code)) throw problem('Código de vinculación no válido, utilizado o caducado.', 401);
      disconnect();
      const token = `trazo_bridge_${randomBytes(32).toString('base64url')}`;
      session = { hash: hash(token), workspaceId, expiresAt: now() + 8 * 60 * 60_000, lastSeen: now(), consumerId: null };
      return { token, expiresAt: session.expiresAt, workspaceId };
    },
    async poll(token, consumerId) {
      authorize(token, consumerId);
      if (waiter) throw problem('Ya hay una consulta de comandos pendiente.');
      return new Promise(resolve => {
        const pending = { resolve, timer: setTimeout(() => { if (waiter === pending) waiter = undefined; resolve(null); }, pollMs) };
        waiter = pending;
        deliver();
      });
    },
    heartbeat(token, consumerId) { authorize(token, consumerId); },
    complete(token, consumerId, id, result) {
      authorize(token, consumerId);
      if (settled.has(id)) return; // Lost acknowledgement: do not execute twice.
      if (!active || active.command.id !== id) throw problem('El comando ya no está pendiente.', 410);
      if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean'
        || (result.ok ? !result.value || typeof result.value !== 'object' || Array.isArray(result.value) : typeof result.error !== 'string')) throw problem('Resultado de comando no válido.', 400);
      const job = active;
      active = undefined;
      clearTimeout(job.timer);
      settled.add(id);
      if (settled.size > 100) settled.delete(settled.values().next().value);
      if (result.ok) job.resolve(result.value);
      else job.reject(problem(result.error.slice(0, 2000)));
      deliver();
    },
    disconnect(token, consumerId) { authorize(token, consumerId); disconnect(); },
    execute(name, args) {
      validateToolArguments(name, args);
      if (!session || session.expiresAt <= now() || session.lastSeen + leaseMs <= now()) return Promise.reject(problem('Trazo no está conectado. Abre la aplicación y vincula el navegador al MCP.'));
      if (queue.length >= 20) return Promise.reject(problem('Hay demasiadas operaciones pendientes. Espera antes de volver a intentarlo.'));
      return new Promise((resolve, reject) => {
        const job = { command: { id: randomUUID(), name, args, deadline: now() + commandTimeout }, resolve, reject, timer: undefined };
        job.timer = setTimeout(() => {
          if (active === job) { active = undefined; fail(job, uncertain); }
          else { const i = queue.indexOf(job); if (i >= 0) queue.splice(i, 1); fail(job, 'La operación caducó antes de llegar al editor.'); }
          // A timed-out in-flight command may still be running. Require a new
          // pairing rather than delivering another mutation concurrently.
          disconnect();
        }, commandTimeout);
        queue.push(job);
        deliver();
      });
    },
    close: disconnect,
  };
}
