import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, constants, lstatSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDirectory } from './config.mjs';

const DAY = 86_400_000;
const KEY_PATTERN = /^trazo_[A-Za-z0-9_-]{43}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const columns = 'id, name, prefix, created_at AS createdAt, expires_at AS expiresAt, revoked_at AS revokedAt, last_used_at AS lastUsedAt';

/** Local OS access administers keys. HTTP clients can only authenticate with one. */
export function createKeyStore({ directory = dataDirectory(), now = Date.now } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const folder = lstatSync(directory);
  if (!folder.isDirectory() || folder.isSymbolicLink() || (folder.mode & 0o077) !== 0) {
    throw new Error('La carpeta MCP debe ser privada (permisos 700) y no ser un enlace simbólico.');
  }
  const filename = join(directory, 'keys.sqlite');
  const fd = openSync(filename, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  closeSync(fd);
  const file = lstatSync(filename);
  if (!file.isFile() || (file.mode & 0o077) !== 0) throw new Error('El archivo de claves debe tener permisos 600.');
  const db = new DatabaseSync(filename);
  try {
    db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER
      );
    `);
  } catch (error) { db.close(); throw error; }

  return {
    create({ name, days = 30 } = {}) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new Error('Indica un nombre de hasta 80 caracteres.');
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('La duración debe ser un número entero entre 1 y 365 días.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const time = now();
        const { total } = db.prepare('SELECT COUNT(*) AS total FROM api_keys WHERE revoked_at IS NULL AND expires_at > ?').get(time);
        if (total >= 20) throw new Error('Ya tienes 20 claves activas. Revoca una antes de crear otra.');
        const key = `trazo_${randomBytes(32).toString('base64url')}`;
        const metadata = { id: randomUUID(), name: name.trim(), prefix: key.slice(0, 14), createdAt: time, expiresAt: time + days * DAY, revokedAt: null, lastUsedAt: null };
        db.prepare('INSERT INTO api_keys (id, name, prefix, key_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(metadata.id, metadata.name, metadata.prefix, hash(key), metadata.createdAt, metadata.expiresAt);
        db.exec('COMMIT');
        return { ...metadata, key }; // The secret is returned only on issuance.
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    list() {
      return db.prepare(`SELECT ${columns} FROM api_keys ORDER BY created_at DESC, id`).all();
    },
    authenticate(key) {
      if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return null;
      const time = now();
      // Recheck expiry and revocation in the same statement as the usage update.
      return db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE key_hash = ? AND revoked_at IS NULL AND expires_at > ? RETURNING ${columns}`)
        .get(time, hash(key), time) ?? null;
    },
    revoke(id) {
      if (typeof id !== 'string' || !id) throw new Error('Indica el identificador de la clave.');
      const result = db.prepare('UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').run(now(), id);
      if (!result.changes) throw new Error('No se encuentra esa clave.');
    },
    close() { db.close(); },
  };
}
