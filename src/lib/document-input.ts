export type DocumentFormat = 'auto' | 'mermaid' | 'markdown';
export const MAX_DOCUMENT_CHARACTERS = 100_000;
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
export const MAX_MERMAID_DIAGRAMS = 12;
export const MAX_DOCUMENT_BLOCKS = 120;

export type DocumentBlock =
  | { kind: 'heading'; content: string; level: number; line: number }
  | { kind: 'text'; content: string; line: number }
  | { kind: 'code'; content: string; language: string; line: number }
  | { kind: 'mermaid'; content: string; line: number };

export interface ParsedDocument {
  format: Exclude<DocumentFormat, 'auto'>;
  title: string;
  blocks: DocumentBlock[];
}

export const isDocumentFile = (name: string): boolean => /\.(md|markdown|mmd|mermaid|txt)$/i.test(name);

export function markdownToText(source: string): string {
  return source
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, label: string, url: string) => `Imagen: ${label || url}${label ? ` (${url})` : ''}`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^([ \t]*)[-*+]\s+\[([ xX])\]\s+/gm, (_match, indent: string, checked: string) => `${indent}${checked.trim() ? '☑' : '☐'} `)
    .replace(/^([ \t]*)[-*+]\s+/gm, '$1• ')
    .replace(/^ {0,3}> ?/gm, '')
    .replace(/(\*\*|__)([^\n]*?)\1/g, '$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .trim();
}

function frontMatterEnd(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0 || !lines.slice(1, end).some(line => /^[\w-]+\s*:/.test(line))) return 0;
  return end + 1;
}

function detectFormat(source: string, filename?: string): Exclude<DocumentFormat, 'auto'> {
  if (/\.(md|markdown)$/i.test(filename ?? '')) return 'markdown';
  if (/\.(mmd|mermaid)$/i.test(filename ?? '')) return 'mermaid';
  const lines = source.split('\n');
  const first = lines.slice(frontMatterEnd(lines)).find(line => line.trim() && !line.trim().startsWith('%%'))?.trim() ?? '';
  return /^(?:(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)\b|(?:sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|gantt|pie|mindmap|timeline|journey|gitGraph|quadrantChart|requirementDiagram|C4\w+|block-beta|sankey-beta|xychart-beta|packet-beta|kanban|architecture-beta|radar-beta|treemap-beta|swimlane-beta)\b)/.test(first)
    ? 'mermaid' : 'markdown';
}

export function parseDocumentInput(source: string, format: DocumentFormat = 'auto', filename?: string): ParsedDocument {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new Error('Añade texto o un diagrama antes de convertir.');
  if (normalized.length > MAX_DOCUMENT_CHARACTERS) throw new Error('El documento supera los 100.000 caracteres. Divídelo en archivos más pequeños.');
  const resolved = format === 'auto' ? detectFormat(normalized, filename) : format;
  const blocks: DocumentBlock[] = [];
  if (resolved === 'mermaid') {
    blocks.push({ kind: 'mermaid', content: normalized, line: 1 });
  } else {
    const lines = normalized.split('\n');
    let pending: string[] = [];
    let pendingLine = 1;
    const flush = () => {
      const content = pending.join('\n').trim();
      if (content) blocks.push({ kind: 'text', content, line: pendingLine });
      pending = [];
    };
    for (let index = frontMatterEnd(lines); index < lines.length; index++) {
      const line = lines[index];
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
        flush();
        const marker = opening[1];
        const language = opening[2].trim().split(/\s/)[0].toLowerCase();
        const start = index + 1;
        const body: string[] = [];
        for (index++; index < lines.length; index++) {
          const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(lines[index]);
          if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) break;
          body.push(lines[index]);
        }
        const content = body.join('\n').trimEnd();
        if (language === 'mermaid' || language === 'mmd') {
          if (!content.trim()) throw new Error(`El bloque Mermaid de la línea ${start} está vacío.`);
          blocks.push({ kind: 'mermaid', content: content.trim(), line: start });
        } else if (content.trim()) {
          blocks.push({ kind: 'code', content, language, line: start });
        }
      } else {
        const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
        if (heading) {
          flush();
          blocks.push({ kind: 'heading', content: markdownToText(heading[2]), level: heading[1].length, line: index + 1 });
        } else if (!/^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(line)) {
          if (!pending.length) pendingLine = index + 1;
          pending.push(line);
        } else flush();
      }
    }
    flush();
  }
  if (!blocks.length) throw new Error('El documento no contiene texto ni diagramas para convertir.');
  if (blocks.length > MAX_DOCUMENT_BLOCKS) throw new Error('El documento tiene más de 120 secciones. Divídelo en archivos más pequeños.');
  const diagrams = blocks.filter(block => block.kind === 'mermaid').length;
  if (diagrams > MAX_MERMAID_DIAGRAMS) throw new Error('Puedes convertir hasta 12 diagramas por documento. Divide el archivo en varias partes.');
  const title = filename?.replace(/\.(md|markdown|mmd|mermaid|txt)$/i, '').trim()
    || blocks.find(block => block.kind === 'heading')?.content
    || (resolved === 'mermaid' ? 'Diagrama Mermaid' : 'Documento Markdown');
  return { format: resolved, title: title.slice(0, 100), blocks };
}

export async function readDocumentFile(file: File): Promise<{ source: string; filename: string }> {
  if (!isDocumentFile(file.name)) throw new Error('Elige un archivo .md, .markdown, .mmd, .mermaid o .txt.');
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('El archivo supera 1 MB. Divídelo en documentos más pequeños.');
  const source = await file.text();
  if (!source.trim()) throw new Error('El archivo está vacío.');
  if (source.length > MAX_DOCUMENT_CHARACTERS) throw new Error('El documento supera los 100.000 caracteres. Divídelo en archivos más pequeños.');
  return { source, filename: file.name };
}
