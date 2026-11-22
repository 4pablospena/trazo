import { useState } from 'react';
import { CircleCheck, Link2, LoaderCircle, Unplug } from 'lucide-react';
import type { useMcpConnection } from '../useMcpConnection';
import { McpCopyButton } from './McpCopyButton';

export function McpBrowserConnection({ mcp, endpoint, onEndpoint, locked, initialCode }: { mcp: ReturnType<typeof useMcpConnection>; endpoint: string; onEndpoint: (value: string) => void; locked: boolean; initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  return <section className="mcp-card" aria-labelledby="mcp-browser-title">
    <h3 id="mcp-browser-title" className="mb-2 flex items-center gap-2 font-semibold"><Link2 size={18} />1. Vincula este navegador</h3>
    {mcp.connection ? <div className="mt-4 space-y-3">
      <p className="mcp-status" data-status={mcp.status} role="status">{mcp.status === 'connected' ? <CircleCheck size={16} /> : <LoaderCircle size={16} className={mcp.status === 'connecting' ? 'animate-spin' : ''} />}
        {mcp.status === 'connected' ? 'Lienzo conectado' : mcp.status === 'connecting' ? 'Conectando con el servidor…' : 'Enlace desconectado'}</p>
      <p className="muted text-sm">Mantén Trazo abierto. Las IA con una clave válida podrán trabajar sobre tus tableros.</p>
      <button className="secondary-button" disabled={working || locked} onClick={() => {
        setWorking(true); setError(''); void mcp.disconnect().catch(cause => setError(cause instanceof Error ? cause.message : 'El enlace local se ha cerrado. No se pudo avisar al servidor.')).finally(() => setWorking(false));
      }}><Unplug size={15} />Desconectar este navegador</button>
    </div> : <form className="mt-4 space-y-3" onSubmit={event => {
      event.preventDefault(); setWorking(true); setError('');
      void mcp.connect(endpoint, code).then(() => setCode('')).catch(cause => setError(cause instanceof Error ? cause.message : 'No se pudo conectar.')).finally(() => setWorking(false));
    }}>
      {initialCode ? <p className="muted text-sm">El enlace ya incluye el código. Pulsa <strong className="ink">Vincular navegador</strong> para continuar.</p> : <>
        <p className="muted text-sm">Ejecuta este comando desde el proyecto y abre el enlace que aparece. El servidor y el código se preparan automáticamente.</p>
        <div className="mcp-command-row"><code>npm run conectar</code><McpCopyButton value="npm run conectar" label="Copiar comando de inicio" /></div>
      </>}
      <details className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
        <summary className="cursor-pointer text-sm font-medium">Conexión manual</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-medium" htmlFor="mcp-endpoint">Servidor local</label>
          <input id="mcp-endpoint" className="text-field w-full" value={endpoint} onChange={event => onEndpoint(event.target.value)} disabled={working} required />
          <label className="block text-sm font-medium" htmlFor="mcp-pair-code">Código de vinculación</label>
          <input id="mcp-pair-code" type="password" className="text-field w-full font-mono" value={code} onChange={event => setCode(event.target.value)} disabled={working} autoComplete="off" spellCheck={false} placeholder="trazo_pair_…" required />
        </div>
      </details>
      <p className="muted text-xs">Al vincular autorizas el acceso a tus tableros y la gestión de claves desde este navegador.</p>
      <button className="primary-button" disabled={working || !code.trim()}>{working ? <LoaderCircle size={16} className="animate-spin" /> : <Link2 size={16} />}Vincular navegador</button>
    </form>}
    {(error || mcp.error) && <p className="danger-text mt-3 text-sm" role="alert">{error || mcp.error}</p>}
  </section>;
}
