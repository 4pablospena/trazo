import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isMcpEnabled(value) {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

export function dataDirectory(env = process.env) {
  if (env.TRAZO_MCP_DATA_DIR) return resolve(env.TRAZO_MCP_DATA_DIR);
  const base = process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(base, 'Trazo', 'mcp');
}

export function serverConfig(env = process.env) {
  const port = Number(env.TRAZO_MCP_PORT ?? 5174);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TRAZO_MCP_PORT debe ser un puerto entre 1 y 65535.');
  return { port, host: '127.0.0.1', enabled: isMcpEnabled(env.MCP_ENABLED), dataDir: dataDirectory(env) };
}
