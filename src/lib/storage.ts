export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  templateId: string;
}

interface SceneRecord {
  id: string;
  json: string;
  revision: number;
}

export interface BoardDocument extends BoardMeta {
  scene: string;
  revision: number;
}

export class BoardConflictError extends Error {
  constructor() {
    super('Este tablero cambió en otra pestaña. Descarga una copia de tu dibujo y recarga la página para abrir la versión guardada.');
    this.name = 'BoardConflictError';
  }
}

const request = <T>(value: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('No se pudo leer el almacenamiento.'));
  });

export function createBoardRepository(databaseName = 'trazo-workspace-v1') {
  let connection: Promise<IDBDatabase> | undefined;

  function open(): Promise<IDBDatabase> {
    if (connection) return connection;
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open(databaseName, 1);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        db.createObjectStore('boards', { keyPath: 'id' });
        db.createObjectStore('scenes', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      };
      opening.onsuccess = () => {
        const db = opening.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
      opening.onerror = () => reject(opening.error ?? new Error('No se pudo abrir el almacenamiento local.'));
      opening.onblocked = () => reject(new Error('Cierra las otras pestañas de Trazo y vuelve a intentarlo.'));
    }).catch(error => { connection = undefined; throw error; });
    return connection;
  }

  async function transaction<T>(stores: string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await open();
    const tx = db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar. El almacenamiento no ha cambiado.'));
      tx.onerror = () => { /* onabort reports the transaction failure. */ };
    });
    try {
      const result = await action(tx);
      await done;
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  return {
    async list(): Promise<BoardMeta[]> {
      return transaction(['boards'], 'readonly', async tx => {
        const boards = await request<BoardMeta[]>(tx.objectStore('boards').getAll());
        return boards.sort((a, b) => b.updatedAt - a.updatedAt);
      });
    },
    async get(id: string): Promise<BoardDocument> {
      return transaction(['boards', 'scenes'], 'readonly', async tx => {
        const [meta, scene] = await Promise.all([
          request<BoardMeta | undefined>(tx.objectStore('boards').get(id)),
          request<SceneRecord | undefined>(tx.objectStore('scenes').get(id)),
        ]);
        if (!meta || !scene) throw new Error('No se encuentra este tablero. Vuelve a abrir tu lista de tableros.');
        return { ...meta, scene: scene.json, revision: scene.revision };
      });
    },
    async create(name: string, json: string, templateId = 'blank'): Promise<BoardDocument> {
      const now = Date.now();
      const meta: BoardMeta = { id: crypto.randomUUID(), name: name.trim() || 'Sin título', createdAt: now, updatedAt: now, templateId };
      return transaction(['boards', 'scenes'], 'readwrite', async tx => {
        await Promise.all([
          request(tx.objectStore('boards').add(meta)),
          request(tx.objectStore('scenes').add({ id: meta.id, json, revision: 0 } satisfies SceneRecord)),
        ]);
        return { ...meta, scene: json, revision: 0 };
      });
    },
    async save(id: string, json: string, expectedRevision: number, name?: string): Promise<{ meta: BoardMeta; revision: number }> {
      return transaction(['boards', 'scenes'], 'readwrite', async tx => {
        const [meta, previous] = await Promise.all([
          request<BoardMeta | undefined>(tx.objectStore('boards').get(id)),
          request<SceneRecord | undefined>(tx.objectStore('scenes').get(id)),
        ]);
        if (!meta || !previous) throw new Error('El tablero se ha eliminado en otra pestaña. Descarga una copia para conservarlo.');
        if (previous.revision !== expectedRevision) throw new BoardConflictError();
        const updated = { ...meta, ...(name !== undefined ? { name: name.trim().slice(0, 100) || 'Sin título' } : {}), updatedAt: Date.now() };
        const revision = previous.revision + 1;
        await Promise.all([
          request(tx.objectStore('boards').put(updated)),
          request(tx.objectStore('scenes').put({ id, json, revision } satisfies SceneRecord)),
        ]);
        return { meta: updated, revision };
      });
    },
    async rename(id: string, name: string, expectedRevision: number): Promise<{ meta: BoardMeta; revision: number }> {
      return transaction(['boards', 'scenes'], 'readwrite', async tx => {
        const [meta, scene] = await Promise.all([
          request<BoardMeta | undefined>(tx.objectStore('boards').get(id)),
          request<SceneRecord | undefined>(tx.objectStore('scenes').get(id)),
        ]);
        if (!meta || !scene) throw new Error('El tablero ya no existe.');
        if (scene.revision !== expectedRevision) throw new BoardConflictError();
        const updated = { ...meta, name: name.trim().slice(0, 100) || 'Sin título', updatedAt: Date.now() };
        const revision = scene.revision + 1;
        await Promise.all([
          request(tx.objectStore('boards').put(updated)),
          request(tx.objectStore('scenes').put({ ...scene, revision })),
        ]);
        return { meta: updated, revision };
      });
    },
    async remove(id: string, expectedRevision?: number): Promise<void> {
      return transaction(['boards', 'scenes'], 'readwrite', async tx => {
        if (expectedRevision !== undefined) {
          const previous = await request<SceneRecord | undefined>(tx.objectStore('scenes').get(id));
          if (!previous) throw new Error('El tablero ya no existe.');
          if (previous.revision !== expectedRevision) throw new BoardConflictError();
        }
        await Promise.all([
          request(tx.objectStore('boards').delete(id)),
          request(tx.objectStore('scenes').delete(id)),
        ]);
      });
    },
    async getSetting<T>(key: string, fallback: T): Promise<T> {
      return transaction(['settings'], 'readonly', async tx => {
        const value = await request<{ key: string; value: T } | undefined>(tx.objectStore('settings').get(key));
        return value?.value ?? fallback;
      });
    },
    async setSetting<T>(key: string, value: T): Promise<void> {
      return transaction(['settings'], 'readwrite', async tx => {
        await request(tx.objectStore('settings').put({ key, value }));
      });
    },
    async close(): Promise<void> {
      const db = await connection;
      db?.close();
      connection = undefined;
    },
  };
}

export const boardsRepository = createBoardRepository();
