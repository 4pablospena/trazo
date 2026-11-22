import { exportScene, getNonDeletedElements } from '@excalidraw/excalidraw';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { validateToolArguments, type BridgeCommand } from '../../shared/mcp-contract';
import { BoardConflictError, type BoardDocument, type createBoardRepository } from './storage';
import { parseScene, safeFilename, serializeScene } from './scene';
import { createTemplateScene, type TemplateId } from './templates';

type Store = ReturnType<typeof createBoardRepository>;
export interface WorkspaceToolResult { value: Record<string, unknown>; changed?: boolean; activate?: BoardDocument; updated?: BoardDocument }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const metadata = ({ scene: _scene, ...meta }: BoardDocument) => meta;
const assertTime = (deadline: number) => { if (Date.now() >= deadline) throw new Error('El comando ha caducado antes de guardar cambios.'); };

async function normalizedScene(json: string, previous?: BoardDocument): Promise<string> {
  const raw: unknown = JSON.parse(json);
  if (!record(raw) || !Array.isArray(raw.elements) || raw.elements.length > 5000) throw new Error('La escena debe contener como máximo 5000 elementos.');
  for (const element of raw.elements) {
    if (!record(element) || typeof element.id !== 'string' || !element.id
      || !['x', 'y', 'width', 'height'].every(field => typeof element[field] === 'number' && Number.isFinite(element[field]))) throw new Error('La escena contiene un elemento incompleto o no válido.');
  }
  const old: unknown = previous ? JSON.parse(previous.scene) : {};
  raw.files = { ...(record(old) && record(old.files) ? old.files : {}), ...(record(raw.files) ? raw.files : {}) };
  const files = raw.files as Record<string, unknown>;
  for (const element of raw.elements) {
    if (element.type === 'image') {
      const file = files[element.fileId];
      if (!record(file) || typeof file.dataURL !== 'string' || !file.dataURL.startsWith('data:image/')) throw new Error('Faltan los datos de una imagen. Inclúyelos en files.');
    }
  }
  const data = await parseScene(JSON.stringify(raw));
  if (data.elements?.length !== raw.elements.length) throw new Error('Excalidraw no pudo restaurar todos los elementos; el tablero no se ha modificado.');
  const versions = new Map(record(old) && Array.isArray(old.elements) ? old.elements.map(e => [e.id, e.version]) : []);
  const elements = (data.elements ?? []).map(element => previous ? { ...element,
    version: Math.max(versions.get(element.id) ?? 0, element.version) + 1,
    versionNonce: crypto.getRandomValues(new Uint32Array(1))[0] >>> 1, updated: Date.now(),
  } : element);
  return serializeScene({ elements, appState: data.appState ?? {}, files: data.files ?? {} });
}

function fileBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('No se pudo codificar la imagen.'));
    reader.readAsDataURL(blob);
  });
}

/** Uses the same repository, scene conversion and export APIs as the web editor. */
export function createWorkspaceTools(store: Store) {
  return async (command: BridgeCommand, activeId?: string, signal?: AbortSignal): Promise<WorkspaceToolResult> => {
    const { name, args, deadline } = command;
    validateToolArguments(name, args);
    const check = () => { signal?.throwIfAborted(); assertTime(deadline); };
    check();
    const boardId = args.boardId as string;
    const expectedRevision = args.expectedRevision as number;
    const current = async () => {
      const board = await store.get(boardId);
      if (expectedRevision !== undefined && board.revision !== expectedRevision) throw new BoardConflictError();
      return board;
    };
    if (name === 'list_boards') {
      const query = ((args.query as string) ?? '').toLocaleLowerCase();
      return { value: { boards: (await store.list()).filter(board => board.name.toLocaleLowerCase().includes(query)).slice(0, (args.limit as number) ?? 20), activeBoardId: activeId } };
    }
    if (name === 'get_board') {
      const board = await current();
      const raw = JSON.parse(board.scene);
      if (!args.includeFiles) delete raw.files;
      const scene = JSON.stringify(raw);
      if (new Blob([scene]).size > 8_000_000) throw new Error('El tablero supera el límite de respuesta de 8 MB. Prueba sin includeFiles o exporta una imagen.');
      return { value: { ...metadata(board), scene, filesIncluded: args.includeFiles === true } };
    }
    if (name === 'create_board' || name === 'convert_document') {
      let scene: string;
      let title = args.name as string | undefined;
      let counts: Record<string, unknown> = {};
      if (name === 'convert_document') {
        const { convertDocument } = await import('./convert-document');
        const converted = await convertDocument(args.content as string, { format: args.format as 'auto' | 'mermaid' | 'markdown' | undefined });
        scene = converted.scene;
        title ||= converted.title;
        counts = { diagrams: converted.diagrams, imageDiagrams: converted.imageDiagrams, textBlocks: converted.textBlocks, elements: converted.elements };
      } else scene = args.scene ? await normalizedScene(args.scene as string) : createTemplateScene((args.templateId as TemplateId) ?? 'blank');
      check();
      const board = await store.create(title ?? 'Sin título', scene, name === 'convert_document' ? 'converted' : 'mcp');
      return { value: { ...metadata(board), ...counts }, changed: true, activate: board };
    }
    if (name === 'update_board') {
      const board = await current();
      const json = await normalizedScene(args.scene as string, board);
      check();
      await store.save(board.id, json, expectedRevision);
      const updated = await store.get(board.id);
      return { value: metadata(updated), changed: true, updated };
    }
    if (name === 'rename_board') {
      await current();
      check();
      await store.rename(boardId, args.name as string, expectedRevision);
      const updated = await store.get(boardId);
      return { value: metadata(updated), changed: true, updated };
    }
    if (name === 'delete_board') {
      await current();
      let replacement: BoardDocument | undefined;
      let createdReplacement = false;
      if (activeId === boardId) {
        const others = (await store.list()).filter(board => board.id !== boardId);
        check();
        replacement = others.length ? await store.get(others[0].id) : await store.create('Sin título', createTemplateScene('blank'));
        createdReplacement = !others.length;
      }
      try { check(); await store.remove(boardId, expectedRevision); }
      catch (error) { if (createdReplacement && replacement) await store.remove(replacement.id, 0).catch(() => undefined); throw error; }
      return { value: { deleted: true, boardId }, changed: true, activate: replacement };
    }
    if (name === 'export_board') {
      const board = await current();
      const format = args.format as 'excalidraw' | 'svg' | 'png';
      const filename = `${safeFilename(board.name)}.${format}`;
      if (format === 'excalidraw') {
        if (new Blob([board.scene]).size > 8_000_000) throw new Error('El archivo supera el límite de exportación MCP de 8 MB. Descárgalo desde Trazo.');
        return { value: { filename, mimeType: 'application/vnd.excalidraw+json', encoding: 'text', data: board.scene } };
      }
      const scene: ExcalidrawInitialDataState = await parseScene(board.scene);
      const elements = getNonDeletedElements(scene.elements ?? []);
      if (!elements.length) throw new Error('El tablero está vacío. Añade contenido antes de exportar una imagen.');
      const data = { elements, appState: scene.appState ?? {}, files: scene.files ?? {} };
      const config = { padding: 32, maxWidthOrHeight: 2560, embedScene: true };
      const blob = format === 'png' ? await exportScene({ type: 'png', data, config })
        : new Blob([new XMLSerializer().serializeToString(await exportScene({ type: 'svg', data, config }))], { type: 'image/svg+xml' });
      if (blob.size > 8_000_000) throw new Error('La imagen supera el límite de exportación MCP de 8 MB. Descárgala desde Trazo.');
      check();
      return { value: { filename, mimeType: blob.type, encoding: format === 'png' ? 'base64' : 'text', data: format === 'png' ? await fileBase64(blob) : await blob.text() } };
    }
    throw new Error('Herramienta MCP desconocida.');
  };
}
