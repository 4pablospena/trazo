import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { BoardConflictError, createBoardRepository } from './storage';

const repositories: ReturnType<typeof createBoardRepository>[] = [];
function repository(name = crypto.randomUUID()) {
  const value = createBoardRepository(name);
  repositories.push(value);
  return value;
}
afterEach(async () => { await Promise.all(repositories.splice(0).map(value => value.close())); });

describe('durable local boards', () => {
  it('preserves the entire scene, including image data, across connections', async () => {
    const name = crypto.randomUUID();
    const first = repository(name);
    const scene = JSON.stringify({ type: 'excalidraw', elements: [{ id: 'image-element', fileId: 'photo' }], files: { photo: { dataURL: 'data:image/png;base64,AAAB', mimeType: 'image/png' } } });
    const board = await first.create('Mi tablero', scene);
    await first.close();
    const reopened = repository(name);
    expect((await reopened.get(board.id)).scene).toBe(scene);
    expect(await reopened.list()).toEqual([expect.objectContaining({ id: board.id, name: 'Mi tablero' })]);
    expect((await reopened.list())[0]).not.toHaveProperty('scene');
  });

  it('rejects a stale tab atomically without overwriting the newer drawing or name', async () => {
    const name = crypto.randomUUID();
    const firstTab = repository(name);
    const secondTab = repository(name);
    const board = await firstTab.create('Original', 'initial');
    const stale = await secondTab.get(board.id);
    await firstTab.save(board.id, 'new drawing', board.revision, 'Nueva versión');
    await expect(secondTab.save(board.id, 'stale drawing', stale.revision, 'Nombre antiguo')).rejects.toBeInstanceOf(BoardConflictError);
    await expect(secondTab.rename(board.id, 'Nombre de otra pestaña', stale.revision)).rejects.toBeInstanceOf(BoardConflictError);
    expect(await firstTab.get(board.id)).toMatchObject({ name: 'Nueva versión', scene: 'new drawing', revision: 1 });
  });

  it('does not resurrect a board deleted while another tab was open', async () => {
    const store = repository();
    const board = await store.create('Eliminar', 'saved');
    await store.remove(board.id);
    await expect(store.save(board.id, 'late change', 0)).rejects.toThrow('eliminado');
    expect(await store.list()).toEqual([]);
    await expect(store.get(board.id)).rejects.toThrow('No se encuentra');
  });

  it('renames metadata without changing the saved drawing and keeps the shared library', async () => {
    const store = repository();
    const board = await store.create('Original', 'drawing with images');
    await store.rename(board.id, '  Diagrama nuevo  ', board.revision);
    const library = [{ id: 'item', elements: [{ id: 'shape' }] }];
    await store.setSetting('library', library);
    expect(await store.get(board.id)).toMatchObject({ name: 'Diagrama nuevo', scene: 'drawing with images', revision: 1 });
    expect(await store.getSetting('library', [])).toEqual(library);
  });
});
