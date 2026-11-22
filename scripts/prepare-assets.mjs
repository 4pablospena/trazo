import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const missing = error => { if (error.code === 'ENOENT') return undefined; throw error; };

// This folder is generated. Remove stale/conflicted copies and leave identical
// files untouched so repeated builds do not create more filesystem versions.
async function synchronizeFonts(source, destination) {
  const existing = await lstat(destination).catch(missing);
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  const expected = new Set(entries.map(entry => entry.name));
  for (const name of await readdir(destination)) {
    if (!expected.has(name)) await rm(join(destination, name), { recursive: true, force: true });
  }
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await synchronizeFonts(from, to);
    else {
      const current = await lstat(to).catch(missing);
      if (current && (!current.isFile() || current.isSymbolicLink())) await rm(to, { recursive: true, force: true });
      const data = await readFile(from);
      const previous = await readFile(to).catch(missing);
      if (!previous || !data.equals(previous)) await writeFile(to, data);
    }
  }
}

await synchronizeFonts(fileURLToPath(new URL('node_modules/@excalidraw/excalidraw/dist/prod/fonts/', root)),
  fileURLToPath(new URL('public/fonts/', root)));
