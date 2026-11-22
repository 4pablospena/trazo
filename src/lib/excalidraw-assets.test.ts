import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetFiles, fontRequestPath } from '../../scripts/excalidraw-assets';

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });

it('does not inspect stale generated fonts or follow symlinks when collecting public assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trazo-assets-'));
  folders.push(root);
  await mkdir(join(root, 'fonts'));
  await writeFile(join(root, 'fonts', 'stale.woff2'), 'stale');
  await writeFile(join(root, 'favicon.svg'), '<svg/>');
  await symlink(join(root, 'fonts'), join(root, 'linked-fonts'));
  expect([...await assetFiles(root, true)].map(([name]) => name)).toEqual(['favicon.svg']);
});

it('only maps valid relative font paths, including query strings', () => {
  expect(fontRequestPath('/fonts/Assistant/Assistant-Regular.woff2?v=1')).toBe('Assistant/Assistant-Regular.woff2');
  for (const path of ['/fonts/../package.json', '/fonts/%2e%2e/package.json', '/fonts/a%5c..%5csecret', '/fonts/%zz', '/fonts/', '/fonts//file', '/other/file']) expect(fontRequestPath(path)).toBeUndefined();
});
