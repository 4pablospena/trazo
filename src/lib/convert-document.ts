import { convertToExcalidrawElements, exportScene, getCommonBounds, getNonDeletedElements, restoreElements, serializeAsJSON } from '@excalidraw/excalidraw';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, FileId } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/transform';
import { markdownToText, parseDocumentInput, type DocumentFormat } from './document-input';

export interface ConvertedDocument {
  title: string;
  scene: string;
  preview: Blob;
  diagrams: number;
  imageDiagrams: number;
  textBlocks: number;
  elements: number;
}

interface ConversionOptions {
  format?: DocumentFormat;
  filename?: string;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

function textChunks(text: string, limit = 1800): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const newline = remaining.lastIndexOf('\n', limit);
    const space = remaining.lastIndexOf(' ', limit);
    const boundary = newline >= limit / 2 ? newline : space >= limit / 2 ? space : limit;
    chunks.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary).replace(/^\n/, '');
  }
  if (remaining.trim()) chunks.push(remaining);
  return chunks;
}

/** Conversion is prepared entirely in memory; the workspace saves only after confirmation. */
export async function convertDocument(source: string, options: ConversionOptions = {}): Promise<ConvertedDocument> {
  const document = parseDocumentInput(source, options.format, options.filename);
  const assembled: ExcalidrawElement[] = [];
  const files: BinaryFiles = {};
  let cursorY = 40;
  let diagrams = 0;
  let imageDiagrams = 0;
  let textBlocks = 0;
  const checkCancelled = () => options.signal?.throwIfAborted();

  const append = (skeleton: ExcalidrawElementSkeleton[]) => {
    const elements = convertToExcalidrawElements(skeleton, { regenerateIds: true });
    if (!elements.length) throw new Error('El diagrama no contiene elementos que se puedan importar.');
    const [left, top, right, bottom] = getCommonBounds(elements);
    if (![left, top, right, bottom].every(Number.isFinite)) throw new Error('No se pudo calcular el tamaño del contenido.');
    const groupId = crypto.randomUUID();
    assembled.push(...elements.map(element => ({ ...element, x: element.x + 40 - left, y: element.y + cursorY - top, groupIds: [...element.groupIds, groupId] })));
    cursorY += Math.max(bottom - top, 40) + 56;
  };

  for (const [index, block] of document.blocks.entries()) {
    checkCancelled();
    options.onProgress?.(index, document.blocks.length);
    if (block.kind === 'mermaid') {
      diagrams++;
      try {
        const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw');
        checkCancelled();
        const result = await parseMermaidToExcalidraw(block.content, { elbow: true, maxEdges: 500, maxTextSize: 50_000 });
        checkCancelled();
        const fileIds = new Map<FileId, FileId>();
        for (const [originalId, data] of Object.entries(result.files ?? {})) {
          const id = crypto.randomUUID() as FileId;
          fileIds.set(originalId as FileId, id);
          files[id] = { ...data, id };
        }
        const skeleton = result.elements.map(element => element.type === 'image'
          ? { ...element, fileId: fileIds.get(element.fileId) ?? element.fileId }
          : element);
        if (skeleton.some(element => element.type === 'image' && !files[element.fileId])) {
          throw new Error('Faltan los datos de una imagen del diagrama.');
        }
        if (skeleton.some(element => element.type === 'image')) imageDiagrams++;
        append(skeleton);
      } catch (error) {
        checkCancelled();
        const detail = error instanceof Error ? error.message.slice(0, 1600) : 'Revisa la sintaxis Mermaid.';
        throw new Error(`Diagrama ${diagrams}, línea ${block.line}: ${detail}`);
      }
    } else {
      const content = block.kind === 'code' ? block.content : markdownToText(block.content);
      for (const chunk of textChunks(content)) {
        const heading = block.kind === 'heading';
        const code = block.kind === 'code';
        append([{
          type: 'rectangle', x: 0, y: 0, width: 700, height: heading ? 64 : 100,
          backgroundColor: heading ? 'transparent' : code ? '#f1f3f5' : '#f8f7ff',
          strokeColor: heading ? 'transparent' : '#e0ddee', fillStyle: 'solid', roughness: 0,
          roundness: { type: 3 }, strokeWidth: 1,
          label: { text: chunk, fontSize: heading ? (block.level === 1 ? 30 : 25) : code ? 16 : 19,
            fontFamily: heading ? 5 : code ? 3 : 2, strokeColor: '#34315c', textAlign: 'left', verticalAlign: 'top' },
        }]);
        textBlocks++;
      }
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  checkCancelled();
  if (!assembled.length) throw new Error('El documento no contiene texto ni diagramas para convertir.');
  // Independent Mermaid blocks may reuse node ids and fractional z-indices.
  // IDs are regenerated per block; restore normalizes ordering for the complete scene.
  const elements = getNonDeletedElements(restoreElements(assembled, null, { repairBindings: true }));
  const appState = { viewBackgroundColor: '#ffffff' };
  const scene = serializeAsJSON(elements, appState, files, 'local');
  const svg = await exportScene({ type: 'svg', data: { elements, appState, files }, config: { maxWidthOrHeight: 1800, padding: 24, embedScene: false } });
  checkCancelled();
  options.onProgress?.(document.blocks.length, document.blocks.length);
  return { title: document.title, scene, preview: new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
    diagrams, imageDiagrams, textBlocks, elements: elements.length };
}
