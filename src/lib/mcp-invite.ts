import { localEndpoint } from './mcp-bridge';
export interface McpInvite { code: string; endpoint: string }

/** Pairing codes stay in the URL fragment and are removed by the app on read. */
export function parseMcpInvite(hash: string): McpInvite | undefined {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  const code = values.get('trazo_mcp_code');
  const server = values.get('trazo_mcp_server');
  if (!code || !/^trazo_pair_[A-Za-z0-9_-]{43}$/.test(code) || !server) return;
  try { return { code, endpoint: localEndpoint(server) }; } catch { return; }
}
