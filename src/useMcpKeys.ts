import { useEffect, useRef, useState } from 'react';
import { manageApiKeys, type ApiKeyMetadata, type BridgeConnection, type IssuedApiKey } from './lib/mcp-bridge';

export function useMcpKeys(connection?: BridgeConnection) {
  const [rows, setRows] = useState<ApiKeyMetadata[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const lock = useRef(false);
  useEffect(() => {
    const request = ++version.current;
    setRows([]); setError(''); setBusy(false); setLoading(Boolean(connection)); lock.current = false;
    if (!connection) return;
    const abort = new AbortController();
    void manageApiKeys(connection, 'list', {}, abort.signal).then(value => { if (version.current === request) setRows(value.keys as ApiKeyMetadata[]); })
      .catch(cause => { if (!abort.signal.aborted && version.current === request) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las claves.'); })
      .finally(() => { if (version.current === request) setLoading(false); });
    return () => { ++version.current; abort.abort(); };
  }, [connection]);
  const run = async (operation: 'create' | 'revoke', args: Record<string, unknown>) => {
    if (!connection || lock.current) throw new Error('Espera a que termine la operación anterior y comprueba el enlace.');
    lock.current = true; setBusy(true); setError('');
    const request = ++version.current;
    setLoading(false);
    try {
      const value = await manageApiKeys(connection, operation, args);
      // Issuance succeeded even if refreshing the list later fails. Never hide
      // a newly issued secret or retry the creation on a metadata read failure.
      if (request === version.current) {
        if (operation === 'create') { const { key: _key, ...meta } = value as unknown as IssuedApiKey; setRows(previous => [meta, ...previous]); }
        else setRows(previous => previous.map(row => row.id === args.id ? { ...row, revokedAt: Date.now() } : row));
      }
      if (request !== version.current) throw new Error('El enlace cambió durante la operación. Revisa la lista de claves al volver a conectar.');
      return value;
    } catch (cause) { if (request === version.current) setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); throw cause; }
    finally { if (request === version.current) { lock.current = false; setBusy(false); } }
  };
  return { rows, busy, loading, error, create: async (name: string, days: number) => await run('create', { name, days }) as unknown as IssuedApiKey,
    revoke: async (id: string) => { await run('revoke', { id }); } };
}
