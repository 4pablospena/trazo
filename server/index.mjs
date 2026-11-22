import { serverConfig } from './config.mjs';
import { createKeyStore } from './keys.mjs';
import { createMcpServer } from './mcp-http.mjs';
import { createBridge } from './bridge.mjs';
import { createToolCaller, MCP_TOOLS } from './mcp-tools.mjs';

const config = serverConfig();
const keys = createKeyStore({ directory: config.dataDir });
const bridge = createBridge({ redeemPairingCode: code => keys.redeemPairingCode(code) });
const server = createMcpServer({ keyStore: keys, enabled: config.enabled, bridge, tools: MCP_TOOLS, callTool: createToolCaller(bridge) });
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `El puerto ${config.port} ya está en uso.` : 'No se pudo arrancar el servidor MCP.');
  keys.close();
  process.exitCode = 1;
});
server.listen(config.port, config.host, () => {
  console.info(`Trazo MCP: http://${config.host}:${config.port}/mcp/ (${config.enabled ? 'activado' : 'desactivado: MCP_ENABLED=true para activarlo'})`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  bridge.close();
  server.close(() => { keys.close(); });
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 5_000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
