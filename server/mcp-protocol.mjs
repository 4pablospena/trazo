export const PROTOCOL_VERSIONS = Object.freeze(['2025-03-26', '2025-06-18']);
export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const success = (id, result) => ({ jsonrpc: '2.0', id, result });

/** Shared protocol dispatcher. Drawing operations are registered by the browser bridge. */
export async function handleMcpMessage(message, { key, tools = [], callTool } = {}) {
  const validId = typeof message?.id === 'string' || (typeof message?.id === 'number' && Number.isSafeInteger(message.id));
  if (!record(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string'
    || (Object.hasOwn(message, 'id') && !validId)
    || (message.params !== undefined && !record(message.params))) {
    return { status: 400, payload: rpcError(validId ? message.id : null, -32600, 'Invalid Request') };
  }
  if (!Object.hasOwn(message, 'id')) return { status: 202, payload: null };
  const { id, method, params = {} } = message;
  const respond = result => ({ status: 200, payload: success(id, result) });
  const invalidParams = text => ({ status: 200, payload: rpcError(id, -32602, text) });

  if (method === 'initialize') {
    if (typeof params.protocolVersion !== 'string' || !record(params.capabilities)
      || !record(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') {
      return invalidParams('protocolVersion, capabilities and clientInfo are required');
    }
    return respond({
      protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'Trazo', version: '0.1.0' },
      instructions: 'Trazo is a local drawing workspace. Only advertised tools are available. Drawing tools require an authorized browser connection. Never report a drawing as saved before a tool confirms it.',
    });
  }
  if (method === 'ping') return respond({});
  if (method === 'tools/list') {
    if (params.cursor !== undefined) return invalidParams('Pagination cursors are not supported');
    return respond({ tools });
  }
  if (method === 'tools/call') {
    if (typeof params.name !== 'string' || !tools.some(tool => tool.name === params.name)) return invalidParams('Unknown tool');
    if (params.arguments !== undefined && !record(params.arguments)) return invalidParams('Tool arguments must be an object');
    if (!callTool) return respond({ content: [{ type: 'text', text: 'El editor de Trazo no está conectado.' }], isError: true });
    try {
      return respond(await callTool(params.name, params.arguments ?? {}, { key }));
    } catch {
      return respond({ content: [{ type: 'text', text: 'No se pudo completar la operación en Trazo.' }], isError: true });
    }
  }
  return { status: 200, payload: rpcError(id, -32601, 'Method not found') };
}
