// Run with Trazo on 127.0.0.1:5173 and port 5174 free. Owns only its MCP
// fixture, temporary keys and REA's isolated browser; never uses personal keys.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKeyStore } from '../../server/keys.mjs';
import { createBridge } from '../../server/bridge.mjs';
import { createMcpServer } from '../../server/mcp-http.mjs';
import { createToolCaller, MCP_TOOLS } from '../../server/mcp-tools.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const directory = await mkdtemp(join(tmpdir(), 'trazo-mcp-live-'));
const keys = createKeyStore({ directory });
const bridge = createBridge({ redeemPairingCode: code => keys.redeemPairingCode(code) });
const acceptedConsumers = new Set();
const originalPoll = bridge.poll;
bridge.poll = async (token, consumerId) => { const command = await originalPoll(token, consumerId); acceptedConsumers.add(consumerId); return command; };
const originalHeartbeat = bridge.heartbeat;
bridge.heartbeat = (token, consumerId) => { originalHeartbeat(token, consumerId); acceptedConsumers.add(consumerId); };
const server = createMcpServer({ enabled: true, keyStore: keys, bridge, tools: MCP_TOOLS, callTool: createToolCaller(bridge) });
const client = new Client({ name: 'Trazo live browser validation', version: '1' });
const checks = [];
const appUrl = process.env.TRAZO_TEST_APP_URL ?? 'http://127.0.0.1:5173/';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const role = (role, name) => ({ kind: 'role', role, name });
const css = selector => ({ kind: 'css', selector });
const wait = (step_id, selector, timeout_ms = 90_000) => ({ step_id, action: 'wait_for', locator: css(selector), state: 'visible', timeout_ms });
const click = (step_id, name) => ({ step_id, action: 'click', locator: role('button', name), timeout_ms: 10_000 });
const fill = (step_id, selector, value) => ({ step_id, action: 'fill', locator: css(selector), value: { source: 'literal', value }, timeout_ms: 10_000 });
const boardSelector = value => `input[aria-label="Nombre del tablero"][value="${value}"]:not([disabled])`;
async function call(name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  assert.ok(!response.isError, response.content[0]?.text);
  return JSON.parse(response.content[0].text);
}

try {
  server.listen(5174, '127.0.0.1');
  await once(server, 'listening');
  const key = keys.create({ name: 'Temporary live validation' });
  const code = keys.createPairingCode().code;
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5174/mcp/'), { requestInit: { headers: { Authorization: `Bearer ${key.key}` } } }));
  assert.equal((await client.listTools()).tools.length, 8);
  const scenario = { browser: { mode: 'launch', executable_path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true },
    start_url: { url: appUrl }, environment: { viewport: { width: 1440, height: 1000, device_scale_factor: 1 }, locale: 'es-ES' },
    actions: [wait('editor-ready', 'canvas.excalidraw__canvas.interactive'), click('open-mcp', 'Conectar lienzo al MCP'),
      fill('pair-browser', '#mcp-pair-code', code), click('authorize-browser', 'Vincular navegador'),
      wait('bridge-connected', 'header button[data-mcp-status="connected"]'), click('close-dialog', 'Cerrar diálogo'),
      wait('undo-ready', boardSelector('Comprobar deshacer')), click('undo-mcp-update', 'Deshacer'),
      wait('mcp-operations-saved', boardSelector('MCP verificado')),
      { step_id: 'reload-browser', action: 'goto', destination: { url: appUrl }, wait_until: 'load', timeout_ms: 30_000 },
      wait('restored-and-read-through-mcp', boardSelector('MCP restaurado')),
      { step_id: 'final-render', action: 'wait_for_timeout', duration_ms: 1000 }],
    capture: { after_each_step: ['accessibility'], at_end: ['accessibility', 'screenshot', 'dom'], events: ['console', 'page-errors'] },
  };
  await mkdir('.research', { recursive: true });
  await writeFile('.research/mcp-live-scenario.json', JSON.stringify(scenario, null, 2));

  const workflow = async () => {
    const connectedUntil = Date.now() + 60_000;
    while (true) {
      const response = await client.callTool({ name: 'list_boards', arguments: {} });
      if (!response.isError) break;
      assert.ok(Date.now() < connectedUntil, response.content[0]?.text);
      await pause(300);
    }
    checks.push('Browser explicitly paired through the real application');
    const created = await call('create_board', { name: 'Creado por MCP', templateId: 'flow' });
    let board = await call('get_board', { boardId: created.id });
    const scene = JSON.parse(board.scene);
    const heading = scene.elements.find(element => element.type === 'text');
    heading.text = heading.originalText = 'Editado desde MCP';
    await call('update_board', { boardId: board.id, expectedRevision: board.revision, scene: JSON.stringify(scene) });
    board = await call('get_board', { boardId: board.id });
    assert.ok(JSON.parse(board.scene).elements.some(element => element.originalText === 'Editado desde MCP'));
    await call('rename_board', { boardId: board.id, expectedRevision: board.revision, name: 'Comprobar deshacer' });
    const undoUntil = Date.now() + 30_000;
    while (true) {
      board = await call('get_board', { boardId: board.id });
      if (JSON.parse(board.scene).elements.some(element => element.originalText === 'De la idea a la acción')) break;
      assert.ok(Date.now() < undoUntil, 'The MCP edit could not be undone');
      await pause(300);
    }
    await call('update_board', { boardId: board.id, expectedRevision: board.revision, scene: JSON.stringify(scene) });
    board = await call('get_board', { boardId: board.id });
    checks.push('The actual editor undo button reverses an MCP edit');
    const stale = board.revision;
    await call('rename_board', { boardId: board.id, expectedRevision: board.revision, name: 'Tablero editado' });
    const conflict = await client.callTool({ name: 'update_board', arguments: { boardId: board.id, expectedRevision: stale, scene: board.scene } });
    assert.equal(conflict.isError, true);
    checks.push('Create, read, edit and rename with stale-write rejection');
    for (const format of ['excalidraw', 'svg', 'png']) {
      const exported = await client.callTool({ name: 'export_board', arguments: { boardId: board.id, format } });
      assert.ok(!exported.isError, exported.content[0]?.text);
      if (format === 'png') assert.equal(Buffer.from(exported.content[1].data, 'base64').subarray(1, 4).toString(), 'PNG');
      else assert.ok(exported.content[1].resource.text.includes('Editado desde MCP'));
    }
    checks.push('Editable file, SVG and real PNG exported through MCP');
    const pie = await call('convert_document', { content: 'pie title Resultados\n"Sí" : 8\n"No" : 2', format: 'mermaid' });
    assert.equal(pie.imageDiagrams, 1);
    const withoutFiles = await call('get_board', { boardId: pie.id });
    assert.equal(JSON.parse(withoutFiles.scene).files, undefined);
    const movedImage = JSON.parse(withoutFiles.scene);
    movedImage.elements[0].x += 30;
    await call('update_board', { boardId: pie.id, expectedRevision: withoutFiles.revision, scene: JSON.stringify(movedImage) });
    const imageBoard = await call('get_board', { boardId: pie.id, includeFiles: true });
    const imageScene = JSON.parse(imageBoard.scene);
    assert.ok(imageScene.files[imageScene.elements.find(element => element.type === 'image').fileId].dataURL.startsWith('data:image/'));
    await call('delete_board', { boardId: pie.id, expectedRevision: imageBoard.revision });
    assert.ok(!(await call('list_boards')).boards.some(item => item.id === pie.id));
    checks.push('Fallback image files preserved and active-board deletion handled');
    const mixed = await call('convert_document', { content: '# Documento MCP\n\nTexto editable desde una IA.\n\n```mermaid\nflowchart LR\nA[Inicio] --> B[Guardado]\n```', format: 'markdown' });
    assert.equal(mixed.imageDiagrams, 0);
    let final = await call('get_board', { boardId: mixed.id });
    assert.ok(JSON.parse(final.scene).elements.some(element => element.type === 'arrow'));
    await call('rename_board', { boardId: mixed.id, expectedRevision: final.revision, name: 'MCP verificado' });
    checks.push('Markdown text and Mermaid converted into editable native elements');
    console.info(JSON.stringify({ stage: 'operations-complete', checks }));
    const reloadUntil = Date.now() + 50_000;
    while (acceptedConsumers.size < 2) { assert.ok(Date.now() < reloadUntil, 'The browser did not reconnect after reload'); await pause(200); }
    const listed = await call('list_boards');
    assert.equal(listed.activeBoardId, mixed.id);
    final = await call('get_board', { boardId: mixed.id });
    assert.equal(final.name, 'MCP verificado');
    assert.ok(JSON.parse(final.scene).elements.some(element => element.type === 'arrow'));
    await call('rename_board', { boardId: mixed.id, expectedRevision: final.revision, name: 'MCP restaurado' });
    checks.push('The real application reloads, reconnects and preserves its native drawing');
    return { boardId: mixed.id, checks };
  };
  const browser = promisify(execFile)(process.execPath, ['scripts/rea-mcp.mjs', 'call', 'capture_browser_scenario', '.research/mcp-live-scenario.json', '.research/mcp-live-evidence.json'], { timeout: 180_000, maxBuffer: 1_000_000 });
  browser.catch(() => bridge.close());
  const [report, replay] = await Promise.all([workflow(), browser]);
  console.info(replay.stdout.trim());
  await writeFile('.research/mcp-live-report.json', JSON.stringify({ passed: true, ...report }, null, 2));
  console.info(JSON.stringify({ passed: true, checks: report.checks }));
} finally {
  bridge.close();
  await client.close().catch(() => undefined);
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  keys.close();
  await rm(directory, { recursive: true, force: true });
}
