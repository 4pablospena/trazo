import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { serverConfig } from '../server/config.mjs';
import { createKeyStore } from '../server/keys.mjs';

const config = serverConfig();
const endpoint = `http://${config.host}:${config.port}`;
const app = new URL(process.env.TRAZO_APP_URL ?? 'http://127.0.0.1:5173/');
if (app.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname) || app.username || app.password || app.search || app.hash) {
  throw new Error('TRAZO_APP_URL debe ser una dirección HTTP local de Trazo.');
}
let child;
let stopping = false;
const stop = () => { stopping = true; child?.kill('SIGTERM'); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

async function status() {
  try {
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000), redirect: 'error' });
    if (!response.ok) throw new Error();
    const value = await response.json();
    if (value.name !== 'Trazo') throw new Error();
    return value;
  } catch { return undefined; }
}

try {
  let ready = await status();
  if (ready && !ready.mcpEnabled) throw new Error('El servidor MCP está desactivado. Detén su terminal y ejecuta npm run conectar de nuevo.');
  if (!ready) {
    child = spawn(process.execPath, ['server/index.mjs'], { cwd: new URL('../', import.meta.url),
      env: { ...process.env, MCP_ENABLED: 'true' }, stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.resume();
    let startupError;
    child.on('error', error => { startupError = error; });
    const until = Date.now() + 10_000;
    while (!stopping && !ready && !startupError && child.exitCode === null && child.signalCode === null && Date.now() < until) {
      await pause(100);
      ready = await status();
    }
    if (!ready || !ready.mcpEnabled) throw new Error(`No se pudo arrancar el MCP en el puerto ${config.port}. Comprueba la terminal o configura TRAZO_MCP_PORT.`);
  }
  if (!stopping) {
    const keys = createKeyStore({ directory: config.dataDir });
    try {
      const { code } = keys.createPairingCode();
      app.hash = new URLSearchParams({ trazo_mcp_code: code, trazo_mcp_server: endpoint }).toString();
      console.info('\nAbre este enlace y pulsa «Vincular navegador»:');
      console.info(app.href);
      console.info('\nDespués pulsa «Crear clave» → «Copiar clave», o ejecuta npm run api:key.');
      console.info(child ? 'Mantén esta terminal abierta. Ctrl+C detiene este servidor MCP.' : 'El servidor MCP que ya tenías abierto sigue funcionando.');
    } finally { keys.close(); }
    if (child) {
      await new Promise(resolve => { child.once('exit', resolve); if (child.exitCode !== null || child.signalCode !== null) resolve(); });
      if (!stopping && child.exitCode) process.exitCode = child.exitCode;
    }
  }
} catch (error) { console.error(error.message); child?.kill('SIGTERM'); process.exitCode = 1; }
