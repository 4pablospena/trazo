import { useEffect, useRef, useState } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { CircleCheck, Eye, EyeOff, LoaderCircle, Plug } from 'lucide-react';
import { clientCommand, clientConfig, isApiKey, MCP_CLIENTS } from '../lib/mcp-client-config';
import { verifyMcp } from '../lib/mcp-bridge';
import { McpCopyButton } from './McpCopyButton';

export function McpClientSetup({ endpoint, token, onToken, issuedName }: { endpoint: string; token: string; onToken: (value: string) => void; issuedName?: string }) {
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => { ++version.current; setResult(''); setError(''); setVisible(false); setChecking(false); return () => { ++version.current; }; }, [endpoint, token]);
  const valid = isApiKey(token);
  let endpointValid = true;
  try { clientConfig('cursor', endpoint); } catch { endpointValid = false; }
  const changeToken = (value: string) => { onToken(value.trim()); setResult(''); setError(''); setVisible(false); };
  return <section className="mcp-card h-full" aria-labelledby="mcp-client-title">
    <h3 id="mcp-client-title" className="mb-2 flex items-center gap-2 font-semibold"><Plug size={18} />3. Conecta tu IA</h3>
    <p className="muted text-sm">Elige tu cliente y copia la configuración. La clave se mantiene en memoria hasta cerrar este panel.</p>
    {issuedName && <p role="status" className="mcp-issued mt-4 rounded-lg p-3 text-sm">Clave creada: <strong>{issuedName}</strong>. Ya está preparada para copiar en la configuración.</p>}
    <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="mcp-api-key">Clave API</label>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input id="mcp-api-key" type={visible ? 'text' : 'password'} className="text-field w-full sm:w-auto sm:min-w-0 sm:flex-1 font-mono !text-sm" placeholder="Pega tu clave trazo_…" value={token} onChange={event => changeToken(event.target.value)} autoComplete="off" spellCheck={false} disabled={checking} aria-invalid={Boolean(token && !valid)} />
      <button type="button" className="icon-button" aria-label={visible ? 'Ocultar clave' : 'Mostrar clave'} disabled={!token} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      <McpCopyButton value={token} label="Copiar clave" disabled={!valid} />
    </div>
    <p className="muted mt-2 text-xs">La vista previa oculta tu clave. Al copiar se incluye la clave completa.</p>
    {token && !valid && <p className="danger-text mt-2 text-xs" role="alert">Pega una clave API completa. El código de vinculación se utiliza en el primer paso.</p>}
    <TabGroup className="mt-5">
      <TabList aria-label="Cliente MCP" className="mcp-tabs flex gap-1 rounded-lg p-1">
        {MCP_CLIENTS.map(client => <Tab key={client.id} className="min-w-0 flex-1 rounded-md px-2 py-2 text-sm font-semibold outline-none data-selected:shadow-sm">{client.label}</Tab>)}
      </TabList>
      <TabPanels>{MCP_CLIENTS.map(client => {
        const config = endpointValid ? clientConfig(client.id, endpoint, token) : '';
        const command = endpointValid ? clientCommand(client.id, endpoint, token) : undefined;
        const previewKey = visible ? token : '';
        return <TabPanel key={client.id} className="mt-4 space-y-3 focus-visible:outline-none">
          <p className="muted text-sm">{client.instruction}</p>
          <div className="mcp-snippet rounded-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3" style={{ borderColor: 'var(--border)' }}><span className="break-all font-mono text-xs">{client.file}</span><McpCopyButton value={config} label="Copiar configuración" disabled={!valid || !endpointValid} /></div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed" aria-label={`Configuración ${client.label}`}>{endpointValid ? clientConfig(client.id, endpoint, previewKey) : 'Revisa la dirección del servidor local.'}</pre>
          </div>
          {command && <details className="mcp-cli rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}><summary className="cursor-pointer text-sm font-medium">Usar la terminal</summary>
            <div className="mt-3 flex justify-end"><McpCopyButton value={command} label="Copiar comando" disabled={!valid} /></div>
            <pre className="mt-3 overflow-x-auto text-xs leading-relaxed" aria-label={`Comando ${client.label}`}>{clientCommand(client.id, endpoint, previewKey)}</pre>
            {client.id === 'codex' && <p className="muted mt-3 text-xs">Esta alternativa usa TRAZO_API_KEY. Abre el CLI de Codex desde la misma terminal para heredarla. Para la app de escritorio, utiliza el bloque config.toml de arriba.</p>}
          </details>}
        </TabPanel>;
      })}</TabPanels>
    </TabGroup>
    <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
      <button type="button" className="secondary-button" disabled={!valid || !endpointValid || checking} onClick={() => {
        setChecking(true); setError(''); setResult('');
        const request = ++version.current;
        void verifyMcp(endpoint, token).then(count => { if (version.current === request) setResult(`Conexión verificada · ${count} herramientas disponibles`); })
          .catch(cause => { if (version.current === request) setError(cause instanceof Error ? cause.message : 'No se pudo comprobar la conexión.'); }).finally(() => { if (version.current === request) setChecking(false); });
      }}>{checking ? <LoaderCircle size={16} className="animate-spin" /> : <CircleCheck size={16} />}Comprobar conexión</button>
      {result && <p className="mt-3 text-sm" data-mcp-check="passed" role="status">{result}</p>}
      {error && <p className="danger-text mt-3 text-sm" role="alert">{error}</p>}
    </div>
  </section>;
}
