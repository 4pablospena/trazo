import { useState } from 'react';
import { Link2, LoaderCircle } from 'lucide-react';
import { Modal } from './Modal';
import type { useMcpConnection } from '../useMcpConnection';

export function McpConnectionDialog({ open, onClose, mcp }: { open: boolean; onClose: () => void; mcp: ReturnType<typeof useMcpConnection> }) {
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:5174');
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  return <Modal open={open} onClose={onClose} title="Conectar lienzo al MCP" description="Autoriza a tus clientes MCP a trabajar sobre los tableros de este navegador. Mantén Trazo abierto mientras los utilizas.">
    {mcp.connection ? <div className="space-y-4">
      <p role="status">{mcp.status === 'connected' ? 'Lienzo conectado' : mcp.status === 'connecting' ? 'Conectando con el servidor…' : 'Enlace desconectado'}</p>
      <p className="muted break-all text-sm">{mcp.connection.endpoint}/mcp/</p>
      {mcp.error && <p role="alert" className="danger-text text-sm">{mcp.error}</p>}
      <button className="secondary-button" onClick={() => { void mcp.disconnect().catch(cause => setError(cause instanceof Error ? cause.message : 'No se pudo avisar al servidor.')); }}>Desconectar este navegador</button>
    </div> : <form className="space-y-4" onSubmit={event => {
      event.preventDefault(); setWorking(true); setError('');
      void mcp.connect(endpoint, code).then(() => setCode('')).catch(cause => setError(cause instanceof Error ? cause.message : 'No se pudo conectar.')).finally(() => setWorking(false));
    }}>
      <p className="muted text-sm">Arranca el servidor con <code>MCP_ENABLED=true npm run mcp</code>. Después genera un código de un solo uso con <code>npm run mcp:keys -- pair</code>.</p>
      <label className="block text-sm font-medium" htmlFor="mcp-endpoint">Servidor local</label>
      <input id="mcp-endpoint" className="text-field w-full" value={endpoint} onChange={event => setEndpoint(event.target.value)} disabled={working} required />
      <label className="block text-sm font-medium" htmlFor="mcp-pair-code">Código de vinculación</label>
      <input id="mcp-pair-code" type="password" className="text-field w-full font-mono" value={code} onChange={event => setCode(event.target.value)} disabled={working} autoComplete="off" spellCheck={false} placeholder="trazo_pair_…" required />
      <p className="muted text-sm">Este código autoriza el enlace con tus tableros. Las claves de las IA se generan por separado y se pueden revocar desde la terminal.</p>
      <button className="primary-button" disabled={working || !code.trim()}>{working ? <LoaderCircle size={16} className="animate-spin" /> : <Link2 size={16} />}Vincular navegador</button>
    </form>}
    {error && <p className="danger-text mt-4 text-sm" role="alert">{error}</p>}
  </Modal>;
}
