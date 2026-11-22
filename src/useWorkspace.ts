import { useCallback, useEffect, useRef, useState } from 'react';
import { CaptureUpdateAction, exportScene, getNonDeletedElements } from '@excalidraw/excalidraw';
import type { BridgeCommand } from '../shared/mcp-contract';
import { createWorkspaceTools } from './lib/workspace-tools';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState, LibraryItems } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { boardsRepository as store, type BoardDocument, type BoardMeta } from './lib/storage';
import { SaveQueue, type SaveStatus } from './lib/save-queue';
import { captureScene, downloadBlob, parseScene, safeFilename, sceneFingerprint, serializeScene, type SceneSnapshot } from './lib/scene';
import { createTemplateScene, templates, type TemplateId } from './lib/templates';

interface LoadedBoard { document: BoardDocument; data: ExcalidrawInitialDataState }
interface PendingSave { id: string; name: string; snapshot: SceneSnapshot }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se ha podido completar la operación.';
const sorted = (boards: BoardMeta[]) => boards.sort((a, b) => b.updatedAt - a.updatedAt);

export function useWorkspace() {
  const [active, setActive] = useState<LoadedBoard>();
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [fatal, setFatal] = useState('');
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<SaveStatus>('saved');
  const [libraryStatus, setLibraryStatus] = useState<SaveStatus>('saved');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const current = useRef<LoadedBoard | undefined>(undefined);
  const revisions = useRef(new Map<string, number>());
  const fingerprint = useRef('');
  const ready = useRef(false);
  const locked = useRef(false);
  const library = useRef<LibraryItems>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [workspaceTools] = useState(() => createWorkspaceTools(store));

  const [saver] = useState(() => new SaveQueue<PendingSave>(async value => {
    const revision = revisions.current.get(value.id);
    if (revision === undefined) throw new Error('No se ha podido comprobar la versión del tablero. Descarga una copia antes de recargar.');
    const json = serializeScene(value.snapshot);
    const result = await store.save(value.id, json, revision, value.name);
    revisions.current.set(value.id, result.revision);
    setBoards(previous => sorted(previous.map(board => board.id === value.id
      ? { ...result.meta, name: current.current?.document.id === value.id ? current.current.document.name : result.meta.name }
      : board)));
    if (current.current?.document.id === value.id) {
      // Keep a recovery copy without replacing the editor's initialData.
      const next = { ...current.current, document: { ...current.current.document, scene: json, revision: result.revision } };
      current.current = next;
      setActive(next);
    }
  }, (status, error) => {
    setSceneStatus(status);
    if (error) setSaveError(errorMessage(error));
  }));

  const [librarySaver] = useState(() => new SaveQueue<LibraryItems>(
    value => store.setSetting('library', value),
    (status, error) => {
      setLibraryStatus(status);
      if (error) setSaveError(`No se pudo guardar la biblioteca. ${errorMessage(error)}`);
    },
  ));

  const activate = useCallback(async (document: BoardDocument, data?: ExcalidrawInitialDataState) => {
    const scene = data ?? await parseScene(document.scene);
    const next = { document, data: { ...scene, libraryItems: library.current } };
    api.current = null;
    ready.current = false;
    fingerprint.current = '';
    current.current = next;
    revisions.current.set(document.id, document.revision);
    setEditorReady(false);
    setActive(next);
    setSceneStatus('saved');
    setBoardsOpen(false);
    setTemplatesOpen(false);
    try { await store.setSetting('lastBoardId', document.id); }
    catch { setNotice('El tablero está abierto, pero no se ha podido recordar para la próxima visita.'); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [savedBoards, lastId, savedLibrary, savedTheme] = await Promise.all([
        store.list(), store.getSetting<string>('lastBoardId', ''),
        store.getSetting<LibraryItems>('library', []), store.getSetting<'light' | 'dark' | null>('theme', null),
      ]);
      if (cancelled) return;
      library.current = savedLibrary;
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
      let document: BoardDocument;
      if (!savedBoards.length) {
        document = await store.create('Mi primer tablero', createTemplateScene('blank'));
        savedBoards.push(document);
      } else {
        document = await store.get(savedBoards.some(board => board.id === lastId) ? lastId : savedBoards[0].id);
      }
      const data = await parseScene(document.scene);
      if (cancelled) return;
      setBoards(sorted(savedBoards));
      await activate(document, data);
    })().catch(error => { if (!cancelled) setFatal(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [activate]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#202026' : '#ffffff');
  }, [theme]);

  useEffect(() => { document.title = `${active?.document.name.trim() || 'Trazo'} — Trazo`; }, [active?.document.name]);

  const enqueue = useCallback((snapshot: SceneSnapshot) => {
    const document = current.current?.document;
    if (!document) return;
    const signature = `${document.name}\u0000${sceneFingerprint(snapshot)}`;
    if (fingerprint.current === signature) return;
    fingerprint.current = signature;
    saver.schedule({ id: document.id, name: document.name, snapshot });
  }, [saver]);

  const flush = useCallback(async () => {
    if (api.current && ready.current && !api.current.isDestroyed) enqueue(captureScene(api.current));
    await Promise.all([saver.flush(), librarySaver.flush()]);
    setSaveError('');
  }, [enqueue, saver, librarySaver]);

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') void flush().catch(() => undefined); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saver.dirty || librarySaver.dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', beforeUnload);
      saver.cancelTimer(); librarySaver.cancelTimer();
    };
  }, [flush, saver, librarySaver]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await flush();
      await action();
      return true;
    } catch (error) { setNotice(errorMessage(error)); return false; }
    finally { locked.current = false; setBusy(false); }
  }, [flush]);

  const onApi = useCallback((value: ExcalidrawImperativeAPI | null) => { api.current = value; }, []);
  const onReady = useCallback((value: ExcalidrawImperativeAPI) => {
    api.current = value;
    ready.current = true;
    fingerprint.current = `${current.current?.document.name ?? ''}\u0000${sceneFingerprint(captureScene(value))}`;
    setEditorReady(true);
  }, []);
  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    if (ready.current && !locked.current) enqueue({ elements, appState, files });
  }, [enqueue]);
  const onLibraryChange = useCallback(async (items: LibraryItems) => {
    if (JSON.stringify(items) === JSON.stringify(library.current)) return;
    library.current = items;
    librarySaver.schedule(items);
  }, [librarySaver]);
  const changeTheme = useCallback((value: 'light' | 'dark' | 'system') => {
    const resolved = value === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
    setTheme(resolved);
    void store.setSetting('theme', resolved).catch(() => setNotice('No se pudo guardar la preferencia de tema.'));
  }, []);

  const renameActive = useCallback((name: string) => {
    const selected = current.current;
    if (!selected || !api.current || !ready.current || locked.current) return;
    const next = { ...selected, document: { ...selected.document, name: name.slice(0, 100) } };
    current.current = next;
    setActive(next);
    setBoards(previous => previous.map(board => board.id === next.document.id ? { ...board, name: next.document.name } : board));
    enqueue(captureScene(api.current));
  }, [enqueue]);

  const selectBoard = useCallback((id: string) => run(async () => {
    if (id !== current.current?.document.id) await activate(await store.get(id));
    else setBoardsOpen(false);
  }), [run, activate]);

  const createBoard = useCallback((id: TemplateId) => run(async () => {
    const scene = createTemplateScene(id);
    const data = await parseScene(scene);
    const name = id === 'blank' ? 'Sin título' : templates.find(item => item.id === id)?.name ?? 'Sin título';
    const document = await store.create(name, scene, id);
    setBoards(previous => [document, ...previous]);
    await activate(document, data);
  }), [run, activate]);

  const createDocumentBoard = useCallback((name: string, json: string) => run(async () => {
    const data = await parseScene(json);
    const document = await store.create(name, json, 'converted');
    setBoards(previous => [document, ...previous]);
    await activate(document, data);
  }), [run, activate]);

  const duplicateBoard = useCallback((board: BoardMeta) => run(async () => {
    const original = await store.get(board.id);
    const data = await parseScene(original.scene);
    const copy = await store.create(`${original.name} (copia)`, original.scene, original.templateId);
    setBoards(previous => [copy, ...previous]);
    await activate(copy, data);
  }), [run, activate]);

  const renameBoard = useCallback((board: BoardMeta, name: string) => run(async () => {
    const expectedRevision = current.current?.document.id === board.id
      ? revisions.current.get(board.id)
      : (await store.get(board.id)).revision;
    if (expectedRevision === undefined) throw new Error('No se pudo comprobar la versión del tablero.');
    const result = await store.rename(board.id, name, expectedRevision);
    const updated = result.meta;
    revisions.current.set(board.id, result.revision);
    setBoards(previous => sorted(previous.map(item => item.id === board.id ? updated : item)));
    if (current.current?.document.id === board.id) {
      const next = { ...current.current, document: { ...current.current.document, ...updated, revision: result.revision } };
      current.current = next;
      setActive(next);
      if (api.current) fingerprint.current = `${next.document.name}\u0000${sceneFingerprint(captureScene(api.current))}`;
    }
  }), [run]);

  const removeBoard = useCallback((board: BoardMeta) => run(async () => {
    const savedBoards = await store.list();
    const others = savedBoards.filter(item => item.id !== board.id);
    let replacement: BoardDocument | undefined;
    let replacementData: ExcalidrawInitialDataState | undefined;
    if (current.current?.document.id === board.id) {
      replacement = others.length ? await store.get(others[0].id) : await store.create('Sin título', createTemplateScene('blank'));
      replacementData = await parseScene(replacement.scene);
    }
    await store.remove(board.id);
    revisions.current.delete(board.id);
    setBoards(sorted(replacement && !others.length ? [replacement] : others));
    if (replacement) await activate(replacement, replacementData);
  }), [run, activate]);

  const importFile = useCallback(async (file: File) => {
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('El archivo supera los 100 MB. Prueba con un tablero más pequeño.');
      const raw = await file.text();
      const data = await parseScene(raw); // Validate before changing or creating a board.
      await run(async () => {
        const json = serializeScene({ elements: data.elements ?? [], appState: data.appState ?? {}, files: data.files ?? {} });
        const document = await store.create(file.name.replace(/\.(excalidraw|json)$/i, ''), json, 'imported');
        setBoards(previous => [document, ...previous]);
        await activate(document, data);
      });
    } catch (error) { setNotice(`No se pudo importar el tablero. ${errorMessage(error)}`); }
  }, [run, activate]);

  const exportBoard = useCallback(async (type: 'json' | 'png' | 'svg') => {
    if (!api.current || !ready.current || exporting) return;
    setExporting(true);
    try {
      const snapshot = captureScene(api.current);
      const name = safeFilename(current.current?.document.name ?? 'Sin título');
      if (type === 'json') {
        downloadBlob(new Blob([serializeScene(snapshot)], { type: 'application/vnd.excalidraw+json' }), `${name}.excalidraw`);
      } else {
        const elements = getNonDeletedElements(snapshot.elements);
        if (!elements.length) throw new Error('Añade algo al lienzo antes de exportar una imagen.');
        const data = { elements, appState: snapshot.appState, files: snapshot.files };
        if (type === 'png') {
          const blob = await exportScene({ type: 'png', data, config: { padding: 32, maxWidthOrHeight: 4096, theme, embedScene: true } });
          downloadBlob(blob, `${name}.png`);
        } else {
          const svg = await exportScene({ type: 'svg', data, config: { padding: 32, theme, embedScene: true } });
          downloadBlob(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }), `${name}.svg`);
        }
      }
    } catch (error) { setNotice(`No se pudo descargar. ${errorMessage(error)}`); }
    finally { setExporting(false); }
  }, [theme, exporting]);

  const executeMcp = useCallback(async (command: BridgeCommand, signal?: AbortSignal) => {
    const waitingUntil = Math.min(command.deadline, Date.now() + 10_000);
    while ((!ready.current || locked.current) && Date.now() < waitingUntil) {
      signal?.throwIfAborted();
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    }
    signal?.throwIfAborted();
    if (!ready.current || locked.current) throw new Error('El editor está ocupado o todavía no está preparado. Vuelve a intentarlo.');
    locked.current = true;
    setBusy(true);
    let committed = false;
    try {
      await flush();
      const result = await workspaceTools(command, current.current?.document.id, signal);
      committed = result.changed === true;
      if (result.changed) setBoards(await store.list());
      if (result.activate) await activate(result.activate);
      else if (result.updated && current.current?.document.id === result.updated.id) {
        const document = result.updated;
        const data = await parseScene(document.scene);
        revisions.current.set(document.id, document.revision);
        if (command.name === 'update_board' && api.current) {
          api.current.addFiles(Object.values(data.files ?? {}));
          api.current.updateScene({ elements: data.elements ?? [], appState: { viewBackgroundColor: data.appState?.viewBackgroundColor ?? '#ffffff', selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
          if (data.elements?.length) api.current.setViewport({ target: data.elements, fit: 'scale-down' });
        }
        const next = { document, data: current.current.data };
        current.current = next;
        setActive(next);
        fingerprint.current = `${document.name}\u0000${sceneFingerprint({ elements: data.elements ?? [], appState: data.appState ?? {}, files: data.files ?? {} })}`;
      }
      return result.value;
    } catch (error) {
      const message = committed ? 'El cambio se guardó, pero no se pudo actualizar el lienzo. Recarga Trazo antes de repetir la operación.' : errorMessage(error);
      setNotice(message);
      throw new Error(message);
    } finally { locked.current = false; setBusy(false); }
  }, [flush, workspaceTools, activate]);

  const status: SaveStatus = sceneStatus === 'error' || libraryStatus === 'error' ? 'error'
    : sceneStatus === 'saving' || libraryStatus === 'saving' ? 'saving'
    : sceneStatus === 'pending' || libraryStatus === 'pending' ? 'pending' : 'saved';

  return { active, boards, fatal, notice, setNotice, busy, editorReady, status, saveError, theme, changeTheme,
    boardsOpen, setBoardsOpen, templatesOpen, setTemplatesOpen, fileInput, exporting,
    onApi, onReady, onChange, onLibraryChange, renameActive, selectBoard, createBoard, duplicateBoard, renameBoard, removeBoard,
    importFile, exportBoard, flush, createDocumentBoard, executeMcp,
    openImport: useCallback(() => fileInput.current?.click(), []),
    openNew: useCallback(() => { setBoardsOpen(false); setTemplatesOpen(true); }, []),
    openBoards: useCallback(() => { setBoardsOpen(true); void store.list().then(setBoards).catch(error => setNotice(errorMessage(error))); }, []),
  };
}
