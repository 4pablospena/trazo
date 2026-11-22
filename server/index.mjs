import { serverConfig } from './config.mjs';
import { createKeyStore } from './keys.mjs';
import { createMcpServer } from './mcp-http.mjs';

const config = serverConfig();
const keys = createKeyStore({ directory: config.dataDir });
const server = createMcpServer({ keyStore: keys, enabled: config.enabled });
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
  server.close(() => { keys.close(); });
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 5_000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
