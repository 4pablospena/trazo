import { expect, it } from 'vitest';
import { parseMcpInvite } from './mcp-invite';

const code = `trazo_pair_${'a'.repeat(43)}`;
it('reads one-use pairing links from the fragment and normalizes the local endpoint', () => {
  const hash = new URLSearchParams({ trazo_mcp_code: code, trazo_mcp_server: 'http://127.0.0.1:5184/mcp/' }).toString();
  expect(parseMcpInvite(`#${hash}`)).toEqual({ code, endpoint: 'http://127.0.0.1:5184' });
});
it('rejects API keys, malformed codes, remote endpoints and unrelated hashes', () => {
  for (const [value, server] of [[`trazo_${'a'.repeat(43)}`, 'http://localhost:5174'], ['short', 'http://localhost:5174'], [code, 'https://remote.example']]) {
    expect(parseMcpInvite(new URLSearchParams({ trazo_mcp_code: value, trazo_mcp_server: server }).toString())).toBeUndefined();
  }
  expect(parseMcpInvite('#existing-drawing-link')).toBeUndefined();
});
