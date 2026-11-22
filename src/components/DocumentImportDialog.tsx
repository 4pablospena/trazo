import { useCallback, useEffect, useRef, useState } from 'react';
import { FileCode2, FileUp, LoaderCircle, Sparkles } from 'lucide-react';
import { readDocumentFile, type DocumentFormat } from '../lib/document-input';
import type { ConvertedDocument } from '../lib/convert-document';
import { Modal } from './Modal';

const MERMAID_EXAMPLE = 'flowchart LR\n  A[Una idea] --> B{¿La probamos?}\n  B -->|Sí| C[Crear un prototipo]\n  B -->|Revisar| A\n  C --> D[Compartir]';
const MARKDOWN_EXAMPLE = '# Mi próximo proyecto\n\nUna idea que queremos convertir en algo útil.\n\n## Primeros pasos\n\n- Definir el objetivo\n- Preparar un prototipo\n- Recoger comentarios\n\n```mermaid\nflowchart LR\n  A[Idea] --> B[Prototipo] --> C[Aprendizaje]\n```\n\n## Notas\n\nTodo el texto y las formas se pueden editar en el lienzo.';

interface Props {
  initialFile?: File;
  onClose: () => void;
  onCreate: (document: Pick<ConvertedDocument, 'title' | 'scene'>) => Promise<boolean>;
}

export function DocumentImportDialog({ initialFile, onClose, onCreate }: Props) {
  const [source, setSource] = useState('');
  const [format, setFormat] = useState<DocumentFormat>('auto');
  const [filename, setFilename] = useState<string>();
  const [name, setName] = useState('');
  const [result, setResult] = useState<ConvertedDocument>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [reading, setReading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [creating, setCreating] = useState(false);
  const version = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const working = reading || converting || creating;

  const invalidate = useCallback(() => {
    version.current++;
    controller.current?.abort();
    setResult(undefined);
    setError('');
    setProgress('');
    return version.current;
  }, []);

  const loadFile = useCallback(async (file: File) => {
    const request = invalidate();
    setReading(true);
    try {
      const input = await readDocumentFile(file);
      if (version.current !== request) return;
      setSource(input.source);
      setFilename(input.filename);
      setName(input.filename.replace(/\.(md|markdown|mmd|mermaid|txt)$/i, '').slice(0, 100));
      setFormat('auto');
    } catch (cause) {
      if (version.current === request) setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo.');
    } finally { if (version.current === request) setReading(false); }
  }, [invalidate]);

  useEffect(() => { if (initialFile) void loadFile(initialFile); }, [initialFile, loadFile]);
  useEffect(() => () => { version.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!result) { setPreviewUrl(undefined); return; }
    const url = URL.createObjectURL(result.preview);
    setPreviewUrl(url);
    createButton.current?.focus();
    return () => URL.revokeObjectURL(url);
  }, [result]);

  const convert = async () => {
    if (working) return;
    const request = invalidate();
    const cancellation = new AbortController();
    controller.current = cancellation;
    setConverting(true);
    setProgress('Preparando la conversión…');
    try {
      const { convertDocument } = await import('../lib/convert-document');
      const converted = await convertDocument(source, { format, filename, signal: cancellation.signal,
        onProgress: (completed, total) => { if (version.current === request) setProgress(`Preparando bloque ${Math.min(completed + 1, total)} de ${total}…`); },
      });
      if (version.current === request) setResult(converted);
    } catch (cause) {
      if (version.current === request && !cancellation.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo convertir el contenido.');
    } finally { if (version.current === request) { setConverting(false); setProgress(''); } }
  };

  const create = async () => {
    if (!result || working) return;
    setCreating(true);
    try {
      const success = await onCreate({ title: name.trim() || result.title, scene: result.scene });
      if (success) onClose();
      else setError('No se pudo guardar el tablero. Tu contenido sigue aquí; puedes volver a intentarlo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el tablero.');
    } finally { setCreating(false); }
  };

  const example = (markdown: boolean) => {
    invalidate(); setFilename(undefined); setName(''); setFormat('auto');
    setSource(markdown ? MARKDOWN_EXAMPLE : MERMAID_EXAMPLE);
  };

  return <Modal open onClose={() => { if (!creating) onClose(); }} title="De texto a lienzo" maxWidth="68rem"
    description="Pega Mermaid o Markdown, o carga un archivo. Revisa el resultado y crea un tablero nuevo.">
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-label="Contenido de origen" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="document-source" className="text-sm font-semibold">Mermaid o Markdown</label>
          <button className="secondary-button !px-3" onClick={() => fileInput.current?.click()} disabled={working}><FileUp size={16} />Cargar archivo</button>
        </div>
        <textarea id="document-source" aria-label="Contenido Mermaid o Markdown" aria-invalid={Boolean(error && !result)} aria-describedby={error ? 'document-import-error' : undefined}
          className="document-source text-field block min-h-[300px] w-full resize-y text-sm" spellCheck={false} autoCapitalize="off" autoCorrect="off"
          placeholder={'flowchart LR\n  A[Inicio] --> B[Resultado]\n\nTambién puedes pegar un documento Markdown.'}
          value={source} disabled={working} onChange={event => { invalidate(); setSource(event.target.value); }} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="muted text-sm" htmlFor="document-format">Formato</label>
          <select id="document-format" className="text-field !py-1.5 !text-sm" value={format} disabled={working} onChange={event => { invalidate(); setFormat(event.target.value as DocumentFormat); }}>
            <option value="auto">Detectar automáticamente</option><option value="mermaid">Mermaid</option><option value="markdown">Markdown</option>
          </select>
          <span className="muted ml-auto text-sm">{source.length.toLocaleString('es-ES')} caracteres</span>
        </div>
        {filename && <p className="muted mt-2 break-all text-sm">Archivo: {filename}</p>}
        <div className="muted mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span>Probar un ejemplo:</span>
          <button className="document-example" onClick={() => example(false)} disabled={working}>Mermaid</button>
          <button className="document-example" onClick={() => example(true)} disabled={working}>Markdown</button>
        </div>
        <input ref={fileInput} type="file" className="hidden" accept=".md,.markdown,.mmd,.mermaid,.txt,text/markdown,text/plain" aria-label="Cargar archivo Mermaid o Markdown"
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void loadFile(file); }} />
      </section>
      <section aria-label="Resultado de la conversión" className="min-w-0">
        <h3 className="mb-3 text-sm font-semibold">Vista previa</h3>
        <div className="document-preview relative h-[330px] overflow-auto rounded-xl border lg:h-[360px]" aria-busy={converting}>
          {result && previewUrl ? <img src={previewUrl} alt="Vista previa de la conversión" className="block h-auto w-full" />
            : <div className="muted flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
              {converting || reading ? <LoaderCircle size={30} className="animate-spin" /> : <FileCode2 size={36} strokeWidth={1.2} />}
              <p className="max-w-xs text-sm leading-relaxed">{converting ? progress : reading ? 'Leyendo el archivo…' : 'El texto se convertirá en tarjetas y los diagramas Mermaid en contenido del lienzo.'}</p>
            </div>}
        </div>
        {result && <div className="mt-3" role="status">
          <p className="muted text-sm">{result.diagrams} {result.diagrams === 1 ? 'diagrama' : 'diagramas'} · {result.textBlocks} {result.textBlocks === 1 ? 'bloque de texto' : 'bloques de texto'} · {result.elements} elementos</p>
          {result.imageDiagrams > 0 && <p className="mt-2 text-sm">{result.imageDiagrams === 1 ? 'Un diagrama se importará como imagen.' : `${result.imageDiagrams} diagramas se importarán como imágenes.`} Los demás elementos se podrán editar.</p>}
        </div>}
        <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="converted-board-name">Nombre del nuevo tablero</label>
        <input id="converted-board-name" className="text-field w-full" value={name} placeholder={result?.title ?? 'Se usará el título del documento'} maxLength={100} disabled={creating} onChange={event => setName(event.target.value)} />
      </section>
    </div>
    {error && <p id="document-import-error" className="document-error mt-5 whitespace-pre-wrap break-words rounded-lg p-3 text-sm" role="alert">{error}</p>}
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
      <span className="muted mr-auto text-sm" role="status">{converting ? progress : 'El contenido se guarda al crear el tablero.'}</span>
      <button className="secondary-button" onClick={() => void convert()} disabled={!source.trim() || working}>{converting ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}Convertir a lienzo</button>
      <button ref={createButton} className="primary-button" onClick={() => void create()} disabled={!result || working}>{creating && <LoaderCircle size={16} className="animate-spin" />}Crear tablero</button>
    </div>
  </Modal>;
}
