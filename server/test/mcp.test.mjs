import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createKeyStore } from '../keys.mjs';
import { createMcpServer } from '../mcp-http.mjs';
import { handleMcpMessage, PROTOCOL_VERSIONS } from '../mcp-protocol.mjs';
import { isMcpEnabled, serverConfig } from '../config.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const cleanup = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const init = version => rpc('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'trazo-tests', version: '1' } });

function store(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'trazo-mcp-test-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const keys = createKeyStore({ directory, ...options });
  cleanup.push(() => keys.close());
  return { keys, directory };
}

async function running(options = {}) {
  const { keys } = store(options.store);
  const issued = keys.create({ name: 'Test client' });
  const server = createMcpServer({ keyStore: keys, enabled: true, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanup.push(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/mcp/`;
  const send = (body = rpc('ping'), { headers, key = issued.key, ...rest } = {}) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...rest,
  });
  return { keys, issued, server, url, send };
}

test('MCP is enabled only explicitly, and the configured listener stays on loopback', () => {
  for (const value of [undefined, null, false, '', 'false', '1', 'yes', 1]) assert.equal(isMcpEnabled(value), false);
  for (const value of [true, 'true', ' TRUE ']) assert.equal(isMcpEnabled(value), true);
  assert.equal(serverConfig({}).host, '127.0.0.1');
  assert.equal(serverConfig({}).enabled, false);
  for (const port of ['0', '65536', 'abc', '1.5']) assert.throws(() => serverConfig({ TRAZO_MCP_PORT: port }));
});

test('keys survive reopening; only a hash and a short prefix are stored', () => {
  const { keys, directory } = store();
  const issued = keys.create({ name: ' Cursor ', days: 7 });
  assert.match(issued.key, /^trazo_[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.name, 'Cursor');
  const second = createKeyStore({ directory });
  try {
    assert.equal(second.authenticate(issued.key).id, issued.id);
    assert.equal(second.list()[0].name, 'Cursor');
    assert.equal(Object.hasOwn(second.list()[0], 'key'), false);
    assert.equal(Object.hasOwn(second.list()[0], 'key_hash'), false);
    for (const name of readdirSync(directory)) assert.equal(readFileSync(join(directory, name)).includes(Buffer.from(issued.key)), false);
    assert.equal(statSync(directory).mode & 0o077, 0);
    assert.equal(statSync(join(directory, 'keys.sqlite')).mode & 0o077, 0);
  } finally { second.close(); }
});

test('expiry and revocation invalidate a key, including from another connection', () => {
  let time = 1_000_000;
  const { keys, directory } = store({ now: () => time });
  const first = keys.create({ name: 'Expire', days: 1 });
  assert.equal(keys.authenticate(first.key).lastUsedAt, time);
  time += 86_400_000;
  assert.equal(keys.authenticate(first.key), null);
  const second = keys.create({ name: 'Revoke' });
  const admin = createKeyStore({ directory, now: () => time });
  try { admin.revoke(second.id); } finally { admin.close(); }
  assert.equal(keys.authenticate(second.key), null);
  keys.revoke(second.id); // Idempotent.
  assert.throws(() => keys.revoke('unknown'));
  assert.equal(keys.authenticate(`${first.key}x`), null);
});

test('key issuance validates its name, duration and active-key limit', () => {
  const { keys } = store();
  for (const name of ['', ' ', 'a'.repeat(81)]) assert.throws(() => keys.create({ name }));
  for (const days of [0, 366, 1.5, NaN]) assert.throws(() => keys.create({ name: 'Key', days }));
  for (let i = 0; i < 20; i++) keys.create({ name: `Key ${i}` });
  assert.throws(() => keys.create({ name: 'Over limit' }));
  keys.revoke(keys.list()[0].id);
  assert.doesNotThrow(() => keys.create({ name: 'Replacement' }));
});

test('shared directories and symlinked key stores are rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trazo-mcp-permissions-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  chmodSync(directory, 0o755);
  assert.throws(() => createKeyStore({ directory }), /privada/);
  chmodSync(directory, 0o700);
  const alias = `${directory}-link`;
  symlinkSync(directory, alias);
  cleanup.push(() => rmSync(alias));
  assert.throws(() => createKeyStore({ directory: alias }), /privada/);
  symlinkSync(join(directory, 'outside.sqlite'), join(directory, 'keys.sqlite'));
  assert.throws(() => createKeyStore({ directory }));
});

test('disabled endpoints return 404 for every method and never authenticate', async () => {
  let calls = 0;
  const { url } = await running({ enabled: false, keyStore: { authenticate() { calls++; } } });
  for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS', 'DELETE']) assert.equal((await fetch(url, { method })).status, 404);
  assert.equal(calls, 0);
});

test('a browser cookie never authenticates; revoked keys stop existing clients', async () => {
  const { send, keys, issued } = await running();
  const noAuth = await send(undefined, { key: null, headers: { Cookie: 'trazo_session=test' } });
  assert.equal(noAuth.status, 401);
  assert.match(noAuth.headers.get('www-authenticate'), /Bearer/);
  assert.equal((await send()).status, 200);
  keys.revoke(issued.id);
  assert.equal((await send()).status, 401);
});

test('foreign origins and DNS-rebinding hostnames cannot access the server', async () => {
  const { url, send, issued } = await running();
  assert.equal((await send(undefined, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await send(undefined, { headers: { Origin: 'null' } })).status, 403);
  // Node fetch rewrites Host, so use the HTTP client to send the attack as-is.
  for (const host of ['other.example', 'other.example@127.0.0.1', '127.0.0.1:1']) {
    const status = await new Promise((resolve, reject) => {
      const req = request(url, { method: 'POST', headers: { Host: host, Authorization: `Bearer ${issued.key}` } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 403);
  }
  const permitted = await send(undefined, { headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(permitted.status, 200);
  assert.equal(permitted.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  assert.equal(permitted.headers.get('access-control-allow-credentials'), null);
});

test('HTTP methods, both MCP paths and notification status follow the transport', async () => {
  const { url, issued, send } = await running();
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173' } })).status, 204);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${issued.key}` } })).status, 200);
  const notification = await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '');
  assert.equal((await fetch(url.slice(0, -1), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${issued.key}` }, body: JSON.stringify(rpc('ping')) })).status, 200);
});

test('protocol negotiation and version headers agree; unsupported HTTP versions fail', async () => {
  const { send } = await running();
  for (const version of [...PROTOCOL_VERSIONS, 'future-version']) {
    const response = await send(init(version));
    const body = await response.json();
    const expected = PROTOCOL_VERSIONS.includes(version) ? version : '2025-06-18';
    assert.equal(body.result.protocolVersion, expected);
    assert.equal(response.headers.get('mcp-protocol-version'), expected);
    assert.equal(body.result.serverInfo.name, 'Trazo');
  }
  assert.equal((await send(undefined, { headers: { 'MCP-Protocol-Version': 'unsupported' } })).status, 400);
  assert.equal((await send(undefined, { headers: { 'MCP-Protocol-Version': '2025-06-18' } })).headers.get('mcp-protocol-version'), '2025-06-18');
});

test('malformed JSON, invalid envelopes, batches, and unsupported methods are explicit errors', async () => {
  const { send } = await running();
  assert.equal((await (await send('{invalid')).json()).error.code, -32700);
  for (const value of [null, [], [rpc('ping')], { method: 'ping' }, rpc('ping', {}, null)]) {
    const response = await send(value);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, -32600);
  }
  assert.equal((await (await send(rpc('initialize', {}))).json()).error.code, -32602);
  assert.equal((await (await send(rpc('unrecognized'))).json()).error.code, -32601);
  assert.equal((await (await send(rpc('tools/call', { name: 'not_registered' }))).json()).error.code, -32602);
  assert.deepEqual((await (await send(rpc('tools/list'))).json()).result.tools, []);
});

test('body sizes and content negotiation are bounded before dispatch', async () => {
  const { send } = await running();
  assert.equal((await send('{}', { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await send('{}', { headers: { Accept: 'text/html' } })).status, 406);
  assert.equal((await send('x'.repeat(1_048_577))).status, 413);
});

test('chunked requests cannot bypass the body limit', async () => {
  const { url, issued } = await running();
  const status = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${issued.key}`,
    } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write('x'.repeat(524_288));
    req.end('x'.repeat(524_289));
  });
  assert.equal(status, 413);
});

test('an interrupted request does not crash or prevent subsequent calls', async () => {
  const { url, issued, server, send } = await running();
  const accepted = once(server, 'request');
  const req = request(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'Content-Length': '500', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${issued.key}`,
  } });
  req.on('error', () => {});
  req.write('{"jsonrpc":');
  const [incoming] = await accepted;
  const aborted = once(incoming, 'aborted');
  req.destroy();
  await aborted;
  assert.equal((await send()).status, 200);
});

test('repeated bad credentials are throttled and the window expires', async () => {
  let time = Date.now();
  const { send } = await running({ now: () => time });
  for (let i = 0; i < 5; i++) assert.equal((await send(undefined, { key: 'bad' })).status, 401);
  const blocked = await send();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  time += 60_001;
  assert.equal((await send()).status, 200);
});

test('tool dispatch preserves caller identity and never leaks unexpected error details', async () => {
  const key = { id: 'key-id' };
  const tool = { name: 'test_tool', description: 'Test only', inputSchema: { type: 'object' } };
  const response = await handleMcpMessage(rpc('tools/call', { name: tool.name, arguments: { value: 3 } }), {
    key, tools: [tool], callTool: async (name, args, context) => {
      assert.equal(name, tool.name); assert.deepEqual(args, { value: 3 }); assert.equal(context.key.id, key.id);
      return { content: [{ type: 'text', text: 'Confirmed' }] };
    },
  });
  assert.equal(response.payload.result.content[0].text, 'Confirmed');
  const failed = await handleMcpMessage(rpc('tools/call', { name: tool.name }), { tools: [tool], callTool() { throw new Error('sensitive detail'); } });
  assert.equal(failed.payload.result.isError, true);
  assert.equal(JSON.stringify(failed).includes('sensitive detail'), false);
});

test('the official MCP SDK initializes, discovers tools, pings and closes over real HTTP', async () => {
  const { url, issued } = await running();
  const client = new Client({ name: 'trazo-compatibility', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${issued.key}` } } });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name, 'Trazo');
    assert.deepEqual(await client.listTools(), { tools: [] });
    assert.deepEqual(await client.ping(), {});
  } finally { await client.close(); }
});

test('the official SDK can call an advertised tool with authenticated context', async () => {
  let callerId;
  const tool = { name: 'echo_test', description: 'A test fixture, never registered by the application', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } };
  const { url, issued } = await running({ tools: [tool], callTool: async (name, args, context) => {
    assert.equal(name, tool.name);
    callerId = context.key.id;
    return { content: [{ type: 'text', text: args.text }] };
  } });
  const client = new Client({ name: 'trazo-tool-compatibility', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${issued.key}` } } }));
    assert.equal((await client.listTools()).tools[0].name, tool.name);
    assert.equal((await client.callTool({ name: tool.name, arguments: { text: 'Hello' } })).content[0].text, 'Hello');
    assert.equal(callerId, issued.id);
  } finally { await client.close(); }
});

test('the CLI issues once, lists metadata and revokes across separate processes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trazo-mcp-cli-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const run = args => spawnSync(process.execPath, ['scripts/mcp-keys.mjs', ...args], { cwd: new URL('../../', import.meta.url), env: { ...process.env, TRAZO_MCP_DATA_DIR: directory }, encoding: 'utf8' });
  const created = run(['create', '--name', 'CLI', '--days', '7']);
  assert.equal(created.status, 0, created.stderr);
  const issued = JSON.parse(created.stdout);
  const listed = run(['list']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout.includes(issued.key), false);
  assert.equal(JSON.parse(listed.stdout)[0].id, issued.id);
  const revoked = run(['revoke', '--id', issued.id]);
  assert.equal(revoked.status, 0, revoked.stderr);
  const keys = createKeyStore({ directory });
  try { assert.equal(keys.authenticate(issued.key), null); } finally { keys.close(); }
  assert.notEqual(run(['create', '--name', 'Bad', '--days', '0']).status, 0);
});

test('the server entry point starts with environment config and stops cleanly', { timeout: 10_000 }, async () => {
  const { keys, directory } = store();
  const issued = keys.create({ name: 'Startup test' });
  const reservation = createMcpServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('../../', import.meta.url),
    env: { ...process.env, MCP_ENABLED: 'true', TRAZO_MCP_PORT: String(port), TRAZO_MCP_DATA_DIR: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  cleanup.push(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const exited = once(child, 'exit');
  let logs = '';
  child.stderr.resume();
  await Promise.race([
    new Promise(resolve => child.stdout.on('data', chunk => { logs += chunk; if (logs.includes('Trazo MCP:')) resolve(); })),
    exited.then(() => { throw new Error('El servidor terminó antes de arrancar.'); }),
  ]);
  const response = await fetch(`http://127.0.0.1:${port}/mcp/`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${issued.key}` },
    body: JSON.stringify(init('2025-06-18')),
  });
  assert.equal((await response.json()).result.serverInfo.name, 'Trazo');
  assert.equal(logs.includes(issued.key), false);
  child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0);
});
