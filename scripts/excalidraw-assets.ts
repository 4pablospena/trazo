import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Inventory only regular package files; never descend into generated fonts. */
export async function assetFiles(directory: string, excludeFonts = false, prefix = ''): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excludeFonts && !prefix && entry.name === 'fonts') continue;
    const name = `${prefix}${entry.name}`;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of await assetFiles(path, false, `${name}/`)) files.set(key, value);
    } else if (entry.isFile()) files.set(name, path);
  }
  return files;
}

export function fontRequestPath(url: string): string | undefined {
  try {
    const path = decodeURIComponent(url.split('?')[0]);
    if (!path.startsWith('/fonts/')) return;
    const name = path.slice('/fonts/'.length);
    if (!name || name.includes('\\') || name.split('/').some(segment => !segment || segment === '.' || segment === '..')) return;
    return name;
  } catch { return; }
}

export function excalidrawAssets(): Plugin {
  const fonts = fileURLToPath(new URL('../node_modules/@excalidraw/excalidraw/dist/prod/fonts/', import.meta.url));
  let publicDirectory = '';
  return {
    name: 'trazo-excalidraw-assets',
    configResolved(config) { publicDirectory = config.publicDir; },
    async configureServer(server) {
      const inventory = await assetFiles(fonts);
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/fonts/')) return next();
        const name = fontRequestPath(req.url);
        const path = name ? inventory.get(name) : undefined;
        if (!path) { res.statusCode = 404; res.end(); return; }
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
        void readFile(path).then(data => {
          res.setHeader('Content-Type', name?.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
          res.setHeader('Content-Length', data.length);
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.end(req.method === 'HEAD' ? undefined : data);
        }).catch(() => { if (!res.headersSent) res.statusCode = 500; res.end(); });
      });
    },
    async generateBundle() {
      // Vite's public-directory copy is disabled. Emit canonical package fonts
      // and other public assets without ever reading public/fonts.
      for (const [name, path] of await assetFiles(fonts)) {
        this.emitFile({ type: 'asset', fileName: `fonts/${name}`, source: await readFile(path) });
      }
      if (publicDirectory) for (const [name, path] of await assetFiles(publicDirectory, true)) {
        this.emitFile({ type: 'asset', fileName: name, source: await readFile(path) });
      }
    },
  };
}
