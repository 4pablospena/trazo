import { useCallback, useEffect, useState } from 'react';
import { parseMcpInvite, type McpInvite } from './lib/mcp-invite';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Check, ChevronDown, Clock3, Download, FileCode2, FileImage, FileJson, Image, Link2, LoaderCircle, Moon, PanelsTopLeft, Plus, Sun, TriangleAlert, X } from 'lucide-react';
import { useWorkspace } from './useWorkspace';
import { useMcpConnection } from './useMcpConnection';
import { McpConnectionDialog } from './components/McpConnectionDialog';
import { Logo } from './components/Logo';
import { Editor } from './components/Editor';
import { EditorErrorBoundary } from './components/ErrorBoundary';
import { BoardPanel } from './components/BoardPanel';
import { Modal } from './components/Modal';
import { TemplateChooser } from './components/TemplateChooser';
import { DocumentImportDialog } from './components/DocumentImportDialog';
import { isDocumentFile } from './lib/document-input';
import type { BoardMeta } from './lib/storage';

export default function App() {
  const workspace = useWorkspace();
  const mcp = useMcpConnection(workspace.executeMcp);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpInvite, setMcpInvite] = useState<McpInvite>();
  useEffect(() => {
    const receiveInvite = () => {
      const hash = window.location.hash;
      if (!new URLSearchParams(hash.slice(1)).has('trazo_mcp_code')) return;
      const invite = parseMcpInvite(hash);
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      if (invite) { setMcpInvite(invite); setMcpOpen(true); }
    };
    receiveInvite(); window.addEventListener('hashchange', receiveInvite);
    return () => window.removeEventListener('hashchange', receiveInvite);
  }, []);
  const [deleteTarget, setDeleteTarget] = useState<BoardMeta>();
  const [renameTarget, setRenameTarget] = useState<BoardMeta>();
  const [renameDraft, setRenameDraft] = useState('');
  const [documentImport, setDocumentImport] = useState<{ file?: File } | null>(null);
  const openConverter = useCallback(() => setDocumentImport({}), []);
  const { active, busy, status, theme } = workspace;

  if (workspace.fatal) return <div className="flex min-h-dvh items-center justify-center p-8"><div className="max-w-md text-center">
    <span className="mb-6 inline-flex text-violet-600"><Logo /></span>
    <h1 className="mb-3 text-xl font-semibold">No se pudo abrir tu espacio</h1>
    <p className="muted mb-6 leading-relaxed">{workspace.fatal}</p>
    <button className="primary-button mx-auto" onClick={() => window.location.reload()}>Volver a intentarlo</button>
  </div></div>;

  if (!active) return <div className="flex min-h-dvh flex-col items-center justify-center gap-5" role="status">
    <span className="text-violet-600"><Logo /></span><span className="muted flex items-center gap-2 text-sm"><LoaderCircle size={17} className="animate-spin" />Preparando tu espacio…</span>
  </div>;

  const saveLabel = status === 'saved' ? 'Guardado' : status === 'saving' ? 'Guardando…' : status === 'pending' ? 'Cambios pendientes' : 'Sin guardar';
  return <div className="workspace-app flex h-dvh flex-col overflow-hidden">
    <header className="app-header flex h-[62px] shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-5">
      <span className="hidden shrink-0 text-violet-600 sm:inline-flex"><Logo /></span>
      <span className="header-divider mx-1 hidden h-5 sm:block" />
      <button className="secondary-button shrink-0 !px-2.5 sm:!px-3" onClick={workspace.openBoards} disabled={busy} title="Mis tableros" aria-label="Abrir mis tableros"><PanelsTopLeft size={17} /><span className="hidden sm:inline">Tableros</span></button>
      <div className="min-w-0 flex-1">
        <input aria-label="Nombre del tablero" className="board-name w-full max-w-[340px] rounded-md px-2 py-1.5 font-medium" value={active.document.name} onChange={event => workspace.renameActive(event.target.value)} onBlur={() => { if (!active.document.name.trim()) workspace.renameActive('Sin título'); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }} maxLength={100} disabled={busy || !workspace.editorReady} placeholder="Sin título" autoComplete="off" spellCheck={false} />
      </div>
      <div className={`save-status flex shrink-0 items-center gap-1.5 text-sm ${status === 'error' ? 'danger-text' : 'muted'}`} role="status" aria-live="polite" title={`${saveLabel} en este navegador`}>
        {status === 'saved' ? <Check size={15} /> : status === 'saving' ? <LoaderCircle size={15} className="animate-spin" /> : status === 'pending' ? <Clock3 size={15} /> : <TriangleAlert size={15} />}
        <span className="hidden lg:inline">{saveLabel}</span><span className="sr-only lg:hidden">{saveLabel}</span>
      </div>
      <button className="icon-button app-theme-toggle ml-1 hidden sm:inline-flex" onClick={() => workspace.changeTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
      <button className="secondary-button shrink-0 !px-2.5" onClick={() => setMcpOpen(true)} aria-label="Conectar lienzo al MCP" data-mcp-status={mcp.status} title={mcp.status === 'connected' ? 'MCP conectado' : 'Conectar MCP'}><Link2 size={18} /><span className="hidden xl:inline">MCP</span></button>
      <button className="secondary-button shrink-0 !px-2.5" onClick={openConverter} disabled={busy} aria-label="Convertir Mermaid o Markdown" title="Convertir Mermaid o Markdown"><FileCode2 size={18} /><span className="hidden lg:inline">Convertir</span></button>
      <button className="secondary-button shrink-0 !px-2.5" onClick={workspace.openNew} disabled={busy} aria-label="Nuevo tablero" title="Nuevo tablero"><Plus size={18} /><span className="hidden xl:inline">Nuevo</span></button>
      <Menu>
        <MenuButton className="primary-button shrink-0 !gap-2 !px-3" disabled={!workspace.editorReady || busy || workspace.exporting} aria-label="Exportar tablero"><Download size={17} /><span className="hidden md:inline">Exportar</span><ChevronDown size={14} className="hidden sm:block" /></MenuButton>
        <MenuItems anchor="bottom end" className="dropdown-menu z-[120] w-64 [--anchor-gap:8px]">
          <p className="muted px-3 py-2 text-sm">Descargar este tablero</p>
          <MenuItem><button onClick={() => void workspace.exportBoard('json')}><FileJson size={18} /><span className="flex-1">Archivo Excalidraw</span><span className="muted text-xs">Editable</span></button></MenuItem>
          <MenuItem><button onClick={() => void workspace.exportBoard('png')}><Image size={18} /><span>Imagen PNG</span></button></MenuItem>
          <MenuItem><button onClick={() => void workspace.exportBoard('svg')}><FileImage size={18} /><span>Vector SVG</span></button></MenuItem>
        </MenuItems>
      </Menu>
    </header>

    {status === 'error' && <div className="error-banner flex flex-wrap items-center gap-3 px-4 py-3 text-sm" role="alert">
      <TriangleAlert size={17} className="shrink-0" /><p className="min-w-0 flex-1">{workspace.saveError || 'No se pudo guardar. Tu dibujo sigue abierto; descarga una copia para conservarlo.'}</p>
      <button className="underline underline-offset-4" onClick={() => void workspace.flush().catch(() => undefined)}>Reintentar</button>
      <button className="underline underline-offset-4" onClick={() => void workspace.exportBoard('json')}>Descargar copia</button>
    </div>}
    {workspace.notice && <div className="notice-banner flex items-center gap-3 px-4 py-3 text-sm" role="alert"><p className="flex-1">{workspace.notice}</p><button className="icon-button" onClick={() => workspace.setNotice('')} aria-label="Cerrar aviso"><X size={17} /></button></div>}

    <main className="relative min-h-0 flex-1" aria-label="Editor de dibujo">
      <EditorErrorBoundary key={active.document.id} backup={active.document.scene}>
        <Editor key={active.document.id} name={active.document.name.trim() || 'Sin título'} data={active.data} theme={theme}
          onApi={workspace.onApi} onReady={workspace.onReady} onChange={workspace.onChange} onLibraryChange={workspace.onLibraryChange}
          onThemeChange={workspace.changeTheme} onImport={workspace.openImport} onDownload={() => void workspace.exportBoard('json')}
          onNew={workspace.openNew} onBoards={workspace.openBoards} onConvert={openConverter} />
      </EditorErrorBoundary>
      {busy && <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-[1px]" role="status"><span className="operation-badge"><LoaderCircle size={18} className="animate-spin" />Guardando y abriendo…</span></div>}
    </main>

    <McpConnectionDialog open={mcpOpen} onClose={() => { setMcpOpen(false); setMcpInvite(undefined); }} mcp={mcp} invite={mcpInvite} />

    <BoardPanel open={workspace.boardsOpen} onClose={() => workspace.setBoardsOpen(false)} boards={workspace.boards} activeId={active.document.id} busy={busy}
      onSelect={id => void workspace.selectBoard(id)} onNew={workspace.openNew} onImport={workspace.openImport}
      onDuplicate={board => void workspace.duplicateBoard(board)} onDelete={setDeleteTarget}
      onRename={board => { setRenameTarget(board); setRenameDraft(board.name); }} />
    <TemplateChooser open={workspace.templatesOpen} onClose={() => workspace.setTemplatesOpen(false)} onCreate={id => void workspace.createBoard(id)} busy={busy} />
    {documentImport && <DocumentImportDialog initialFile={documentImport.file} onClose={() => setDocumentImport(null)}
      onCreate={document => workspace.createDocumentBoard(document.title, document.scene)} />}

    <Modal open={Boolean(renameTarget)} onClose={() => setRenameTarget(undefined)} title="Cambiar nombre">
      <form onSubmit={event => { event.preventDefault(); if (renameTarget) void workspace.renameBoard(renameTarget, renameDraft).then(() => setRenameTarget(undefined)); }}>
        <label className="mb-2 block text-sm font-medium" htmlFor="rename-board">Nombre del tablero</label>
        <input id="rename-board" className="text-field w-full" autoFocus value={renameDraft} onChange={event => setRenameDraft(event.target.value)} maxLength={100} required />
        <div className="mt-6 flex justify-end gap-3"><button type="button" className="secondary-button" onClick={() => setRenameTarget(undefined)}>Cancelar</button><button className="primary-button" disabled={busy || !renameDraft.trim()}>Guardar nombre</button></div>
      </form>
    </Modal>
    <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="¿Eliminar este tablero?">
      <p className="muted leading-relaxed">Se eliminará <strong className="ink break-words">{deleteTarget?.name || 'Sin título'}</strong> de este navegador. Puedes descargar una copia antes de eliminarlo.</p>
      <div className="mt-6 flex justify-end gap-3"><button className="secondary-button" onClick={() => setDeleteTarget(undefined)}>Cancelar</button><button className="danger-button" disabled={busy} onClick={() => { if (deleteTarget) void workspace.removeBoard(deleteTarget).then(() => setDeleteTarget(undefined)); }}>Eliminar tablero</button></div>
    </Modal>
    <input ref={workspace.fileInput} type="file" accept=".excalidraw,.json,.md,.markdown,.mmd,.mermaid,.txt,application/json,application/vnd.excalidraw+json,text/markdown,text/plain" className="hidden" aria-label="Importar archivo Excalidraw, Mermaid o Markdown" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { if (isDocumentFile(file.name)) setDocumentImport({ file }); else void workspace.importFile(file); } }} />
  </div>;
}
