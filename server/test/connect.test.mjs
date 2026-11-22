import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createKeyStore } from '../keys.mjs';
import { createMcpServer } from '../mcp-http.mjs';

const cleanup = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
async function settings() {
  const directory = mkdtempSync(join(tmpdir(), 'trazo-connect-'));
  cleanup.push(() => rmSync(directory, { force: true, recursive: true }));
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return { directory, port };
}
function helper(directory, port) {
  const child = spawn(process.execPath, ['scripts/connect-mcp.mjs'], { cwd: new URL('../../', import.meta.url),
    env: { ...process.env, TRAZO_MCP_DATA_DIR: directory, TRAZO_MCP_PORT: String(port), TRAZO_APP_URL: 'http://127.0.0.1:5173/' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  cleanup.push(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; } });
  child.stderr.resume();
  let output = '';
  const link = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { output += chunk; const url = output.match(/http:\/\/127\.0\.0\.1:5173\/#[^\s]+/); if (url) resolve(new URL(url[0])); });
    exited.then(() => { if (!output.includes('#trazo_mcp_code=')) reject(new Error('No se generó el enlace.')); });
  });
  return { child, exited, link };
}

test('the shortcut starts its own MCP, prints a one-use link and stops only its child', { timeout: 15_000 }, async () => {
  const { directory, port } = await settings();
  const process = helper(directory, port);
  const link = await process.link;
  const values = new URLSearchParams(link.hash.slice(1));
  assert.equal(link.search, '');
  assert.equal(values.get('trazo_mcp_server'), `http://127.0.0.1:${port}`);
  const keys = createKeyStore({ directory });
  try { assert.equal(keys.list().length, 0); assert.equal(keys.redeemPairingCode(values.get('trazo_mcp_code')), true); }
  finally { keys.close(); }
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).mcpEnabled, true);
  process.child.kill('SIGTERM'); await process.exited;
  await assert.rejects(fetch(`http://127.0.0.1:${port}/health`));
});

test('the shortcut reuses an already running MCP without stopping it', { timeout: 10_000 }, async () => {
  const { directory, port } = await settings();
  const keys = createKeyStore({ directory }); cleanup.push(() => keys.close());
  const server = createMcpServer({ keyStore: keys, enabled: true }); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  cleanup.push(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const process = helper(directory, port);
  await process.link;
  const [code] = await process.exited;
  assert.equal(code, 0);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
});
