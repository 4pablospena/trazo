import { parseArgs } from 'node:util';
import { createKeyStore } from '../server/keys.mjs';

const help = `Uso:
  npm run mcp:keys -- create --name "Cursor" --days 30
  npm run mcp:keys -- list
  npm run mcp:keys -- revoke --id IDENTIFICADOR
  npm run mcp:keys -- pair

La clave completa se muestra solo al crearla. Guárdala en tu cliente MCP.
TRAZO_MCP_DATA_DIR permite elegir la carpeta privada de claves.`;
let store;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    name: { type: 'string' }, days: { type: 'string' }, id: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help || !positionals.length) console.info(help);
  else {
    const [command, ...extra] = positionals;
    if (extra.length || !['create', 'list', 'revoke', 'pair'].includes(command)) throw new Error(help);
    if ((command === 'create' && values.id) || (command === 'list' && Object.keys(values).length)
      || (command === 'pair' && Object.keys(values).length) || (command === 'revoke' && (values.name || values.days))) throw new Error(help);
    store = createKeyStore();
    if (command === 'create') console.info(JSON.stringify(store.create({ name: values.name, days: values.days === undefined ? 30 : Number(values.days) }), null, 2));
    if (command === 'list') console.info(JSON.stringify(store.list(), null, 2));
    if (command === 'pair') console.info(JSON.stringify(store.createPairingCode(), null, 2));
    if (command === 'revoke') { store.revoke(values.id); console.info('Clave revocada.'); }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store?.close(); }
