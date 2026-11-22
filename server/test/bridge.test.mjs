import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createBridge } from '../bridge.mjs';
import { createKeyStore } from '../keys.mjs';
import { createMcpServer } from '../mcp-http.mjs';
import { createToolCaller, MCP_TOOLS } from '../mcp-tools.mjs';
import { validateToolArguments } from '../../shared/mcp-contract.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const cleanup = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
const consumer = 'test-consumer-123';
const workspace = 'test-workspace-123';
function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'trazo-bridge-test-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const keys = createKeyStore({ directory, ...options });
  cleanup.push(() => keys.close());
  const bridge = createBridge({ redeemPairingCode: code => keys.redeemPairingCode(code), ...options });
  cleanup.push(() => bridge.close());
  const pair = () => bridge.connect(keys.createPairingCode().code, workspace);
  return { keys, bridge, pair };
}

test('pairing codes expire and are redeemed atomically only once', () => {
  let time = Date.now();
  const { keys } = fixture({ now: () => time });
  const code = keys.createPairingCode().code;
  assert.equal(keys.redeemPairingCode('bad'), false);
  assert.equal(keys.redeemPairingCode(code), true);
  assert.equal(keys.redeemPairingCode(code), false);
  const expired = keys.createPairingCode().code;
  time += 600_000;
  assert.equal(keys.redeemPairingCode(expired), false);
});

test('API keys do not authorize the browser; active pairing cannot be replaced', () => {
  const { keys, bridge, pair } = fixture();
  assert.throws(() => bridge.connect(keys.create({ name: 'IA' }).key, workspace), /Código/);
  const session = pair();
  assert.throws(pair, /Ya hay/);
  assert.throws(() => bridge.heartbeat('bad', consumer), /caducado/);
  bridge.heartbeat(session.token, consumer);
  assert.throws(() => bridge.heartbeat(session.token, 'another-consumer-123'), /Otra pestaña/);
});

test('pending pairing codes are bounded and expired sessions can be replaced', () => {
  let time = Date.now();
  const { keys, bridge, pair } = fixture({ now: () => time });
  const session = pair();
  bridge.heartbeat(session.token, consumer);
  for (let i = 0; i < 5; i++) keys.createPairingCode();
  assert.throws(() => keys.createPairingCode(), /cinco/);
  time += 8 * 60 * 60_000;
  assert.doesNotThrow(pair);
  assert.throws(() => bridge.heartbeat(session.token, consumer), /caducado/);
});

test('the broker dispatches in order and accepts a duplicate acknowledgement without reexecution', async () => {
  const { bridge, pair } = fixture();
  const session = pair();
  const first = bridge.execute('list_boards', {});
  const second = bridge.execute('list_boards', { query: 'Second' });
  const one = await bridge.poll(session.token, consumer);
  assert.equal(one.args.query, undefined);
  bridge.complete(session.token, consumer, one.id, { ok: true, value: { step: 1 } });
  bridge.complete(session.token, consumer, one.id, { ok: true, value: { step: 100 } });
  assert.deepEqual(await first, { step: 1 });
  const two = await bridge.poll(session.token, consumer);
  assert.equal(two.args.query, 'Second');
  bridge.complete(session.token, consumer, two.id, { ok: true, value: { step: 2 } });
  assert.deepEqual(await second, { step: 2 });
});

test('disconnect and timeouts never claim an unconfirmed mutation was saved', async () => {
  const { bridge, pair } = fixture({ commandTimeout: 25 });
  const session = pair();
  const pending = bridge.execute('create_board', { name: 'Timed out' });
  await bridge.poll(session.token, consumer);
  await assert.rejects(pending, /puede haberse aplicado/);
  await assert.rejects(bridge.execute('list_boards', {}), /no está conectado/);
});

test('a disconnected browser rejects queued commands without replaying them', async () => {
  const { bridge, pair } = fixture();
  const session = pair();
  const queued = bridge.execute('create_board', { name: 'Queued' });
  const rejected = assert.rejects(queued, /antes de ejecutar/);
  bridge.disconnect(session.token, consumer);
  await rejected;
  await assert.rejects(bridge.execute('list_boards', {}), /no está conectado/);
});

test('argument validation rejects stale-write omissions, unknown arguments and oversized input', () => {
  for (const [name, args] of [
    ['update_board', { boardId: 'bad', scene: '{}' }],
    ['create_board', { name: 'Name', scene: '{}', templateId: 'blank' }],
    ['list_boards', { limit: 51 }], ['list_boards', { unexpected: true }],
    ['convert_document', { content: 'x'.repeat(100_001) }],
  ]) assert.throws(() => validateToolArguments(name, args));
});

test('real MCP HTTP calls wait for an authorized browser result; bridge routes reject API keys', async () => {
  const { keys, bridge } = fixture();
  const key = keys.create({ name: 'SDK client' });
  const code = keys.createPairingCode().code;
  const server = createMcpServer({ keyStore: keys, enabled: true, bridge, tools: MCP_TOOLS, callTool: createToolCaller(bridge) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  cleanup.push(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token) => fetch(`${endpoint}/bridge/${path}`, { method: 'POST', headers: {
    Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
  assert.equal((await post('poll', { consumerId: consumer }, key.key)).status, 401);
  const session = await (await post('connect', { code, workspaceId: workspace })).json();
  const client = new Client({ name: 'trazo-bridge-sdk-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${endpoint}/mcp/`), { requestInit: { headers: { Authorization: `Bearer ${key.key}` } } }));
    assert.equal((await client.listTools()).tools.length, 8);
    const called = client.callTool({ name: 'create_board', arguments: { name: 'Saved board' } });
    const { command } = await (await post('poll', { consumerId: consumer }, session.token)).json();
    assert.equal(command.name, 'create_board');
    await post('result', { consumerId: consumer, id: command.id, result: { ok: true, value: { id: 'fixture-board', saved: true } } }, session.token);
    assert.equal(JSON.parse((await called).content[0].text).saved, true);
    await post('disconnect', { consumerId: consumer }, session.token);
    const disconnected = await client.callTool({ name: 'list_boards', arguments: {} });
    assert.equal(disconnected.isError, true);
    assert.match(disconnected.content[0].text, /no está conectado/);
  } finally { await client.close(); }
});
