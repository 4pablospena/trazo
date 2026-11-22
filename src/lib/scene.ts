import { getNonDeletedElements, getSceneVersion, loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

export interface SceneSnapshot {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

export function captureScene(api: ExcalidrawImperativeAPI): SceneSnapshot {
  return { elements: api.getSceneElements(), appState: api.getAppState(), files: api.getFiles() };
}

export function sceneFingerprint(snapshot: SceneSnapshot): string {
  const { elements, appState: state, files } = snapshot;
  return JSON.stringify([getSceneVersion(elements), elements.length, state.viewBackgroundColor,
    state.gridModeEnabled, state.gridSize, state.gridStep, Object.keys(files).sort()]);
}

export function serializeScene(snapshot: SceneSnapshot): string {
  return serializeAsJSON(getNonDeletedElements(snapshot.elements), snapshot.appState, snapshot.files, 'local');
}

export async function parseScene(json: string): Promise<ExcalidrawInitialDataState> {
  const raw: unknown = JSON.parse(json);
  if (!raw || typeof raw !== 'object' || !('type' in raw) || raw.type !== 'excalidraw' ||
    !('elements' in raw) || !Array.isArray(raw.elements)) {
    throw new Error('El archivo no contiene un tablero de Excalidraw válido.');
  }
  const scene = await loadFromBlob(new Blob([json], { type: 'application/vnd.excalidraw+json' }), null, null);
  return { ...scene, scrollToContent: true };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().slice(0, 100) || 'sin-titulo';
}
