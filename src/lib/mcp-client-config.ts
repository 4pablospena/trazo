import { localEndpoint } from './mcp-bridge';
export type McpClient = 'cursor' | 'claude' | 'codex';
export const MCP_CLIENTS: { id: McpClient; label: string; file: string; instruction: string }[] = [
  { id: 'cursor', label: 'Cursor', file: '~/.cursor/mcp.json', instruction: 'Añade trazo dentro de mcpServers en tu configuración de Cursor. Conserva los demás servidores y vuelve a cargar los MCP.' },
  { id: 'claude', label: 'Claude Code', file: '.mcp.json', instruction: 'Añade trazo dentro de mcpServers en el .mcp.json de tu proyecto, o ejecuta el comando desde ese proyecto. Después abre un chat y revisa /mcp.' },
  { id: 'codex', label: 'Codex', file: '~/.codex/config.toml', instruction: 'Añade este bloque a tu config.toml y abre un chat nuevo. Funciona en la app de escritorio y en el CLI. Conserva los demás bloques.' },
];
export function isApiKey(value: string): boolean { return /^trazo_[A-Za-z0-9_-]{43}$/.test(value.trim()); }
const quote = (value: string) => `'${value.replace(/'/g, `'\''`)}'`;
export function clientConfig(client: McpClient, endpoint: string, key = ''): string {
  const url = `${localEndpoint(endpoint)}/mcp/`;
  const secret = isApiKey(key) ? key.trim() : 'TU_CLAVE_TRAZO';
  if (client === 'codex') return `[mcp_servers.trazo]\nurl = ${JSON.stringify(url)}\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${secret}`)} }`;
  return JSON.stringify({ mcpServers: { trazo: { ...(client === 'claude' ? { type: 'http' } : {}), url, headers: { Authorization: `Bearer ${secret}` } } } }, null, 2);
}
export function clientCommand(client: McpClient, endpoint: string, key = ''): string | undefined {
  const url = `${localEndpoint(endpoint)}/mcp/`;
  const secret = isApiKey(key) ? key.trim() : 'TU_CLAVE_TRAZO';
  if (client === 'claude') return `claude mcp add --transport http trazo ${quote(url)} \\\n  --header ${quote(`Authorization: Bearer ${secret}`)}`;
  if (client === 'codex') return `export TRAZO_API_KEY=${quote(secret)}\ncodex mcp add trazo --url ${quote(url)} --bearer-token-env-var TRAZO_API_KEY`;
}
