import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// A local MCP stdio client for the explicitly selected REA server.
// Usage: node scripts/rea-mcp.mjs schema TOOL
//        node scripts/rea-mcp.mjs call TOOL INPUT.json OUTPUT.json
const [operation, toolName, inputPath, outputPath] = process.argv.slice(2);
if (!['schema', 'call'].includes(operation) || !toolName) {
  throw new Error('Usage: rea-mcp.mjs schema TOOL | call TOOL INPUT.json OUTPUT.json');
}

const child = spawn('rea', ['mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map();
let nextId = 0;
let stderr = '';
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });

function rejectAll(error) {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}
child.on('error', rejectAll);
child.stdin.on('error', rejectAll);
child.on('exit', code => rejectAll(new Error(`REA exited (${code}): ${stderr}`)));

const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method) {
    if (message.id !== undefined) {
      send(message.method === 'ping'
        ? { id: message.id, result: {} }
        : { id: message.id, error: { code: -32601, message: 'Method not supported by this local client' } });
    }
    return;
  }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});

function send(message) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

async function request(method, params) {
  const id = ++nextId;
  let timer;
  try {
    return await new Promise((resolveRequest, rejectRequest) => {
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      timer = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`REA timed out: ${method}`));
      }, 180000);
      send({ id, method, params });
    });
  } finally {
    clearTimeout(timer);
  }
}

try {
  const server = await request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'excalidraw-reference-analysis', version: '1.0.0' },
  });
  send({ method: 'notifications/initialized' });
  const inventory = [];
  let cursor;
  do {
    const page = await request('tools/list', cursor ? { cursor } : {});
    inventory.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  const tool = inventory.find(item => item.name === toolName);
  if (!tool) throw new Error(`REA does not advertise ${toolName}`);
  if (operation === 'schema') {
    const { name, title, description, inputSchema } = tool;
    process.stdout.write(`${JSON.stringify({ server: server.serverInfo, tool: { name, title, description, inputSchema } }, null, 2)}\n`);
  } else {
    if (!inputPath || !outputPath) throw new Error('Input and output JSON paths are required');
    const args = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
    const result = await request('tools/call', { name: toolName, arguments: args });
    const destination = resolve(outputPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify({ server: server.serverInfo, tool: toolName, arguments: args, result }, null, 2)}\n`);
    const evidence = result.structuredContent;
    const steps = evidence?.normalized_result?.steps;
    const failedSteps = steps?.filter(step => ['failed', 'cancelled'].includes(step.status));
    process.stdout.write(`${JSON.stringify({
      server: server.serverInfo, tool: toolName, isError: result.isError ?? false,
      evidence_id: evidence?.evidence_id,
      completeness: evidence?.normalized_result?.completeness,
      steps: steps?.map(step => ({ id: step.step_id, status: step.status, error: step.error })),
      output: destination,
    })}\n`);
    if (result.isError || failedSteps?.length) process.exitCode = 1;
  }
} finally {
  lines.close();
  child.stdin.end();
  if (child.exitCode === null) child.kill('SIGTERM');
}
