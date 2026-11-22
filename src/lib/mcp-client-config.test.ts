import { describe, expect, it } from 'vitest';
import { clientCommand, clientConfig, isApiKey } from './mcp-client-config';
import { localEndpoint } from './mcp-bridge';

const key = `trazo_${'a'.repeat(43)}`;
describe('MCP client configuration', () => {
  it('produces valid client-specific HTTP JSON with the selected port and exact bearer', () => {
    for (const client of ['cursor', 'claude'] as const) {
      const config = JSON.parse(clientConfig(client, 'http://127.0.0.1:6123/mcp/', key));
      expect(config.mcpServers.trazo.url).toBe('http://127.0.0.1:6123/mcp/');
      expect(config.mcpServers.trazo.headers.Authorization).toBe(`Bearer ${key}`);
      expect(config.mcpServers.trazo.type).toBe(client === 'claude' ? 'http' : undefined);
    }
  });
  it('generates a Codex config that works without desktop environment inheritance', () => {
    const config = clientConfig('codex', 'http://localhost:5174', key);
    expect(config).toContain('[mcp_servers.trazo]');
    expect(config).toContain(`http_headers = { Authorization = "Bearer ${key}" }`);
    expect(config).not.toContain('bearer_token_env_var');
    expect(clientCommand('codex', 'http://localhost:5174', key)).toContain(`export TRAZO_API_KEY='${key}'`);
  });
  it('does not interpolate malformed keys or shell expressions into configurations or commands', () => {
    const malicious = "trazo_$(touch /tmp/not-executed)'\n";
    for (const client of ['cursor', 'claude', 'codex'] as const) {
      expect(clientConfig(client, 'http://127.0.0.1:5174', malicious)).not.toContain(malicious);
      expect(clientCommand(client, 'http://127.0.0.1:5174', malicious) ?? '').not.toContain('touch');
    }
    expect(clientCommand('claude', 'http://localhost:5174', key)).toContain(`--header 'Authorization: Bearer ${key}'`);
  });
  it('only accepts full API keys and loopback HTTP endpoints without URL credentials or queries', () => {
    expect(isApiKey(` ${key} `)).toBe(true);
    for (const value of ['trazo_pair_abc', `${key}x`, '', 'TU_CLAVE_TRAZO']) expect(isApiKey(value)).toBe(false);
    expect(localEndpoint('http://127.0.0.1:5174/mcp/')).toBe('http://127.0.0.1:5174');
    for (const value of ['https://remote.example', 'http://127.0.0.1:5174/other', 'http://user:password@localhost:5174', 'http://localhost:5174/?token=secret']) expect(() => localEndpoint(value)).toThrow();
  });
});
