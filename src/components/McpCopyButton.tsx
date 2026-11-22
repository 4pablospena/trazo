import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function McpCopyButton({ value, label = 'Copiar', disabled = false }: { value: string; label?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setCopied(false); setError(false); return () => clearTimeout(timer.current); }, [value]);
  return <span className="inline-flex flex-col items-end gap-1">
    <button type="button" className="secondary-button !px-2.5 !py-1 !text-xs" disabled={disabled} aria-label={label} data-copied={copied} onClick={() => {
      void navigator.clipboard.writeText(value).then(() => {
        setCopied(true); setError(false); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000);
      }).catch(() => setError(true));
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copiado' : label}</button>
    {error && <span className="danger-text max-w-48 text-xs" role="alert">No se pudo copiar. Selecciona el texto y cópialo manualmente.</span>}
  </span>;
}
