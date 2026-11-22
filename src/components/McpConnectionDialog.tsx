import { useState } from 'react';
import { Modal } from './Modal';
import type { useMcpConnection } from '../useMcpConnection';
import { useMcpKeys } from '../useMcpKeys';
import { localEndpoint } from '../lib/mcp-bridge';
import { McpCopyButton } from './McpCopyButton';
import { McpBrowserConnection } from './McpBrowserConnection';
import { McpApiKeys } from './McpApiKeys';
import { McpClientSetup } from './McpClientSetup';

function McpSetup({ mcp }: { mcp: ReturnType<typeof useMcpConnection> }) {
  const [endpoint, setEndpoint] = useState(mcp.connection?.endpoint ?? 'http://127.0.0.1:5174');
  const [token, setToken] = useState('');
  const [issuedName, setIssuedName] = useState('');
  const keys = useMcpKeys(mcp.connection);
  const address = mcp.connection?.endpoint ?? endpoint;
  let url = '';
  try { url = `${localEndpoint(address)}/mcp/`; } catch { /* Validated on form submission. */ }
  return <>
    <div className="mcp-url mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"><div className="min-w-0"><p className="muted mb-1 text-xs font-medium">URL para tus clientes MCP</p><code className="break-all text-sm">{url || 'Indica un servidor local válido'}</code></div><McpCopyButton value={url} label="Copiar URL" disabled={!url} /></div>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <McpBrowserConnection mcp={mcp} endpoint={endpoint} onEndpoint={value => { setEndpoint(value); setToken(''); setIssuedName(''); }} locked={keys.busy} />
        <McpApiKeys keys={keys} connected={Boolean(mcp.connection) && mcp.status === 'connected'} onIssued={key => { setToken(key.key); setIssuedName(key.name); }}
          onRevoked={row => { if (token.startsWith(row.prefix)) { setToken(''); setIssuedName(''); } }} />
      </div>
      <div className="min-w-0"><McpClientSetup endpoint={address} token={token} onToken={value => { setToken(value); setIssuedName(''); }} issuedName={issuedName} /></div>
    </div>
  </>;
}

export function McpConnectionDialog({ open, onClose, mcp }: { open: boolean; onClose: () => void; mcp: ReturnType<typeof useMcpConnection> }) {
  return <Modal open={open} onClose={onClose} title="Conecta tus IA a Trazo" maxWidth="70rem"
    description="Configura Cursor, Claude Code o Codex para crear y editar tus dibujos. El servidor y esta pestaña deben permanecer abiertos.">
    {open && <McpSetup mcp={mcp} />}
  </Modal>;
}
