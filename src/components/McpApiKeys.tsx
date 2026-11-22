import { useState } from 'react';
import { KeyRound, LoaderCircle, Plus } from 'lucide-react';
import type { useMcpKeys } from '../useMcpKeys';
import type { ApiKeyMetadata, IssuedApiKey } from '../lib/mcp-bridge';
import { McpCopyButton } from './McpCopyButton';

const date = (time: number) => new Date(time).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
export function McpApiKeys({ keys, connected, onIssued, onRevoked }: { keys: ReturnType<typeof useMcpKeys>; connected: boolean; onIssued: (key: IssuedApiKey) => void; onRevoked: (row: ApiKeyMetadata) => void }) {
  const [name, setName] = useState('Mi IA');
  const [days, setDays] = useState('30');
  const [confirmation, setConfirmation] = useState<string>();
  return <section className="mcp-card" aria-labelledby="mcp-keys-title">
    <h3 id="mcp-keys-title" className="mb-2 flex items-center gap-2 font-semibold"><KeyRound size={18} />2. Crea una clave para tu IA</h3>
    <p className="muted text-sm">Usa una clave distinta para cada cliente. Solo podrás copiarla al crearla.</p>
    <div className="mcp-command-row mt-3"><code>npm run api:key</code><McpCopyButton value="npm run api:key" label="Copiar comando API" /></div>
    <p className="muted mt-2 text-xs">Este comando muestra una clave API lista para copiar. También puedes crearla aquí después de vincular.</p>
    {!connected && <p className="muted mt-3 text-sm">Vincula este navegador para crear o revocar claves. También puedes pegar una clave que ya tengas en el panel de configuración.</p>}
    {connected && <>
      <form className="mt-4 space-y-3" onSubmit={event => {
        event.preventDefault(); void keys.create(name, Number(days)).then(value => { onIssued(value); }).catch(() => undefined);
      }}>
        <label className="block text-sm font-medium" htmlFor="mcp-key-name">Nombre de la clave</label>
        <input id="mcp-key-name" className="text-field w-full" placeholder="Cursor en mi portátil" value={name} onChange={event => setName(event.target.value)} maxLength={80} disabled={keys.busy} required />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm font-medium" htmlFor="mcp-key-days">Caducidad
            <select id="mcp-key-days" className="text-field mt-2 w-full !py-2" value={days} onChange={event => setDays(event.target.value)} disabled={keys.busy}>
              {[1, 7, 30, 90, 180, 365].map(day => <option key={day} value={day}>{day} {day === 1 ? 'día' : 'días'}</option>)}
            </select>
          </label>
          <button className="primary-button" disabled={keys.busy || keys.loading || !name.trim()}>{keys.busy ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}Crear clave</button>
        </div>
      </form>
      <ul className="mcp-key-list mt-5 max-h-56 overflow-auto" aria-label="Claves API">
        {keys.rows.map(row => <li key={row.id} className="border-t py-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><p className="break-words text-sm font-semibold">{row.name}</p><p className="muted mt-1 text-xs">{row.revokedAt ? 'Revocada' : row.expiresAt <= Date.now() ? 'Caducada' : `Caduca el ${date(row.expiresAt)}`} · {row.prefix}…</p></div>
            {!row.revokedAt && row.expiresAt > Date.now() && <button className="document-example danger-text !text-xs" type="button" disabled={keys.busy} aria-label={`Revocar ${row.name}`} onClick={() => setConfirmation(row.id)}>Revocar</button>}
          </div>
          {confirmation === row.id && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>¿Revocar esta clave?</span>
            <button type="button" className="secondary-button !py-1 !text-xs" onClick={() => setConfirmation(undefined)} disabled={keys.busy}>Cancelar</button>
            <button type="button" className="danger-button !py-1 !text-xs" disabled={keys.busy} onClick={() => { void keys.revoke(row.id).then(() => { setConfirmation(undefined); onRevoked(row); }).catch(() => undefined); }}>Confirmar revocación</button>
          </div>}
        </li>)}
      </ul>
      {keys.loading && <p className="muted text-sm" role="status">Cargando claves…</p>}
      {!keys.rows.length && !keys.error && !keys.loading && <p className="muted text-sm">Todavía no hay claves.</p>}
    </>}
    {keys.error && <p className="danger-text mt-3 text-sm" role="alert">{keys.error}</p>}
  </section>;
}
