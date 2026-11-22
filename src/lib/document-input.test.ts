import { describe, expect, it } from 'vitest';
import { isDocumentFile, markdownToText, MAX_DOCUMENT_CHARACTERS, parseDocumentInput, readDocumentFile } from './document-input';

describe('Mermaid and Markdown input', () => {
  it.each(['flowchart LR\nA --> B', 'graph TD\nA --> B', 'sequenceDiagram\nAlice->>Bob: Hola', 'stateDiagram-v2\n[*] --> Inicio', 'erDiagram\nA ||--o{ B : tiene'])('recognizes a raw diagram: %s', source => {
    const input = parseDocumentInput(source);
    expect(input.format).toBe('mermaid');
    expect(input.blocks).toEqual([{ kind: 'mermaid', content: source, line: 1 }]);
  });

  it('keeps prose and several Mermaid blocks in their original order', () => {
    const source = '# Proyecto\n\nAntes del flujo.\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nDespués.\n\n## Detalles\n\n~~~mermaid\nsequenceDiagram\nAlice->>Bob: Hola\n~~~\n\nFinal.';
    const document = parseDocumentInput(source);
    expect(document.title).toBe('Proyecto');
    expect(document.blocks.map(block => block.kind)).toEqual(['heading', 'text', 'mermaid', 'text', 'heading', 'mermaid', 'text']);
    expect(document.blocks[2]).toMatchObject({ content: 'flowchart LR\nA --> B', line: 5 });
    expect(document.blocks.at(-1)).toMatchObject({ content: 'Final.' });
  });

  it('does not interpret Mermaid examples inside a longer code fence as diagrams', () => {
    const document = parseDocumentInput('````markdown\n```mermaid\nflowchart LR\nA --> B\n```\n````');
    expect(document.blocks).toEqual([{ kind: 'code', language: 'markdown', content: '```mermaid\nflowchart LR\nA --> B\n```', line: 1 }]);
  });

  it('handles BOM, Windows newlines, uppercase language tags and a fence ending at EOF', () => {
    const document = parseDocumentInput('\uFEFF# Título\r\n\r\n```MERMAID\r\nflowchart LR\r\n A --> B');
    expect(document.blocks[1]).toMatchObject({ kind: 'mermaid', content: 'flowchart LR\n A --> B' });
  });

  it('keeps ordinary code editable and does not remove embedded HTML', () => {
    const document = parseDocumentInput('# Ejemplo\n\n<script>alert("texto")</script>\n\n```js\n  const n = 1;\n```');
    expect(document.blocks[1]).toMatchObject({ kind: 'text', content: '<script>alert("texto")</script>' });
    expect(document.blocks[2]).toMatchObject({ kind: 'code', content: '  const n = 1;', language: 'js' });
  });

  it('skips Markdown front matter while preserving Mermaid front matter for its parser', () => {
    expect(parseDocumentInput('---\ntitle: Configuración\n---\n# Contenido').blocks).toEqual([
      { kind: 'heading', content: 'Contenido', level: 1, line: 4 },
    ]);
    const diagram = '---\ntitle: Proceso\n---\nflowchart LR\nA --> B';
    expect(parseDocumentInput(diagram).blocks[0]).toMatchObject({ content: diagram, kind: 'mermaid' });
  });

  it('lets the selected format override the filename and detects common file extensions', () => {
    expect(parseDocumentInput('flowchart LR\nA --> B', 'auto', 'notas.md').format).toBe('markdown');
    expect(parseDocumentInput('flowchart LR\nA --> B', 'mermaid', 'notas.md').format).toBe('mermaid');
    expect(parseDocumentInput('# Documento', 'auto', 'Documento.MD').title).toBe('Documento');
    expect(isDocumentFile('flujo.MMD')).toBe(true);
    expect(isDocumentFile('imagen.svg')).toBe(false);
  });

  it('preserves link destinations, task states and image references as text', () => {
    expect(markdownToText('**Objetivo**\n- [x] Listo\n- [ ] Pendiente\n[Guía](https://example.com)\n![Plano](plano.png)')).toBe(
      'Objetivo\n☑ Listo\n☐ Pendiente\nGuía (https://example.com)\nImagen: Plano (plano.png)',
    );
  });

  it('rejects empty input, empty diagram blocks and excessive content before conversion', () => {
    expect(() => parseDocumentInput('  ')).toThrow('Añade texto');
    expect(() => parseDocumentInput('```mermaid\n```')).toThrow('línea 1 está vacío');
    expect(() => parseDocumentInput('x'.repeat(MAX_DOCUMENT_CHARACTERS + 1))).toThrow('100.000');
    expect(() => parseDocumentInput(Array(13).fill('```mermaid\nflowchart LR\nA --> B\n```').join('\n'))).toThrow('12 diagramas');
    expect(() => parseDocumentInput(Array(121).fill('# Sección').join('\n'))).toThrow('120 secciones');
  });

  it('loads actual Markdown files and rejects unsupported or empty uploads', async () => {
    await expect(readDocumentFile(new File(['# Mi documento'], 'notas.md'))).resolves.toEqual({ source: '# Mi documento', filename: 'notas.md' });
    await expect(readDocumentFile(new File(['flowchart LR\nA --> B'], 'flujo.mermaid'))).resolves.toMatchObject({ filename: 'flujo.mermaid' });
    await expect(readDocumentFile(new File([''], 'vacío.md'))).rejects.toThrow('vacío');
    await expect(readDocumentFile(new File(['x'], 'imagen.png'))).rejects.toThrow('Elige un archivo');
    await expect(readDocumentFile(new File(['x'.repeat(1024 * 1024 + 1)], 'grande.md'))).rejects.toThrow('1 MB');
  });
});
