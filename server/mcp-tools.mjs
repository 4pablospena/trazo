import { MCP_TOOLS, validateToolArguments } from '../shared/mcp-contract.ts';
export { MCP_TOOLS };

export function createToolCaller(bridge) {
  return async (name, args) => {
    try {
      validateToolArguments(name, args);
      const value = await bridge.execute(name, args);
      if (name === 'export_board') {
        const { filename, mimeType, data, encoding } = value;
        if (typeof filename !== 'string' || typeof data !== 'string') throw new Error('El navegador no devolvió un archivo válido.');
        return { content: [
          { type: 'text', text: JSON.stringify({ filename, mimeType }) },
          ...(mimeType === 'image/png' && encoding === 'base64'
            ? [{ type: 'image', data, mimeType }]
            : [{ type: 'resource', resource: { uri: `trazo://exports/${encodeURIComponent(filename)}`, mimeType, text: data } }]),
        ] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: error.message || 'No se pudo completar la operación.' }], isError: true };
    }
  };
}
