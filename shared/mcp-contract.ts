export const TOOL_NAMES = ['list_boards', 'get_board', 'create_board', 'update_board', 'rename_board', 'delete_board', 'convert_document', 'export_board'] as const;
export type ToolName = typeof TOOL_NAMES[number];
export interface BridgeCommand { id: string; name: ToolName; args: Record<string, unknown>; deadline: number }
export type BridgeResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
const id = { type: 'string', description: 'Board UUID from list_boards or create_board.' };
const revision = { type: 'integer', minimum: 0, description: 'Revision returned by get_board. A stale revision is rejected; read again before changing a board.' };
const name = { type: 'string', minLength: 1, maxLength: 100 };
const scene = { type: 'string', maxLength: 1_000_000, description: 'A complete Excalidraw JSON document, including type="excalidraw" and elements. Existing image files are preserved when omitted on update.' };
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false });
export const MCP_TOOLS = [
  { name: 'list_boards', description: 'List boards in the connected Trazo browser. Flushes pending local edits first.', inputSchema: schema({ query: { type: 'string', maxLength: 100 }, limit: { type: 'integer', minimum: 1, maximum: 50 } }), annotations: { readOnlyHint: true } },
  { name: 'get_board', description: 'Read an editable scene and its current revision. Image file data is omitted unless includeFiles is true.', inputSchema: schema({ boardId: id, includeFiles: { type: 'boolean' } }, ['boardId']), annotations: { readOnlyHint: true } },
  { name: 'create_board', description: 'Create and open a new board from a template or complete Excalidraw JSON. Use convert_document for Mermaid or Markdown.', inputSchema: schema({ name, templateId: { type: 'string', enum: ['blank', 'flow', 'kanban', 'notes'] }, scene }, ['name']), annotations: { destructiveHint: false } },
  { name: 'update_board', description: 'Replace the scene of an existing board and display the change if it is open. Requires its current revision. Existing image data is retained.', inputSchema: schema({ boardId: id, expectedRevision: revision, scene }, ['boardId', 'expectedRevision', 'scene']), annotations: { destructiveHint: true } },
  { name: 'rename_board', description: 'Rename a board without changing the drawing. Requires the current revision.', inputSchema: schema({ boardId: id, expectedRevision: revision, name }, ['boardId', 'expectedRevision', 'name']), annotations: { destructiveHint: false } },
  { name: 'delete_board', description: 'Permanently delete a board from this browser. Requires the current revision. Export a copy first if needed.', inputSchema: schema({ boardId: id, expectedRevision: revision }, ['boardId', 'expectedRevision']), annotations: { destructiveHint: true } },
  { name: 'convert_document', description: 'Convert Mermaid or Markdown into a new saved board. Markdown text becomes editable cards. Some diagram types become images; imageDiagrams reports this.', inputSchema: schema({ content: { type: 'string', minLength: 1, maxLength: 100_000 }, format: { type: 'string', enum: ['auto', 'mermaid', 'markdown'] }, name }, ['content']), annotations: { destructiveHint: false } },
  { name: 'export_board', description: 'Return an editable .excalidraw file, SVG resource or PNG image without starting a browser download.', inputSchema: schema({ boardId: id, format: { type: 'string', enum: ['excalidraw', 'svg', 'png'] } }, ['boardId', 'format']), annotations: { readOnlyHint: true } },
];

export function validateToolArguments(tool: unknown, value: unknown): asserts value is Record<string, unknown> {
  const definition = MCP_TOOLS.find(item => item.name === tool);
  if (!definition) throw new Error('Herramienta MCP desconocida.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Los argumentos deben ser un objeto.');
  const args = value as Record<string, unknown>;
  const properties = definition.inputSchema.properties as Record<string, { type: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; enum?: string[] }>;
  for (const field of definition.inputSchema.required) if (!Object.hasOwn(args, field)) throw new Error(`Falta el argumento ${field}.`);
  for (const [field, item] of Object.entries(args)) {
    const rule = properties[field];
    if (!rule) throw new Error(`Argumento no admitido: ${field}.`);
    if (rule.type === 'integer' ? !Number.isSafeInteger(item) : typeof item !== rule.type) throw new Error(`Tipo no válido: ${field}.`);
    if (typeof item === 'number' && (item < (rule.minimum ?? 0) || item > (rule.maximum ?? Number.MAX_SAFE_INTEGER))) throw new Error(`Valor fuera de rango: ${field}.`);
    if (typeof item === 'string' && (item.length > (rule.maxLength ?? 1_000_000) || item.trim().length < (rule.minLength ?? 0) || (rule.enum && !rule.enum.includes(item)))) throw new Error(`Valor no válido: ${field}.`);
    if (field === 'boardId' && (typeof item !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item))) throw new Error('El identificador del tablero no es válido.');
  }
  if (tool === 'create_board' && args.scene !== undefined && args.templateId !== undefined) throw new Error('Elige una escena o una plantilla.');
}
