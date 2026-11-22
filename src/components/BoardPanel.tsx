import { Dialog, DialogPanel, DialogTitle, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Check, Copy, FolderOpen, HardDrive, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { exportScene, getNonDeletedElements } from '@excalidraw/excalidraw';
import { boardsRepository, type BoardMeta } from '../lib/storage';
import { parseScene } from '../lib/scene';

function BoardThumbnail({ board }: { board: BoardMeta }) {
  const element = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let imageUrl: string | undefined;
    setUrl(undefined);
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void boardsRepository.get(board.id).then(async data => {
        const scene = await parseScene(data.scene);
        const elements = getNonDeletedElements(scene.elements ?? []);
        if (!elements.length || cancelled) return;
        const svg = await exportScene({ type: 'svg', data: { elements, appState: scene.appState ?? undefined, files: scene.files }, config: { maxWidthOrHeight: 220, padding: 16, embedScene: false } });
        if (cancelled) return;
        imageUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
        setUrl(imageUrl);
      }).catch(() => undefined); // A thumbnail failure never blocks opening the saved scene.
    }, { rootMargin: '100px' });
    if (element.current) observer.observe(element.current);
    return () => { cancelled = true; observer.disconnect(); if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [board.id, board.updatedAt]);
  return <div ref={element} className="board-thumbnail">{url ? <img src={url} alt="" /> : <Pencil size={21} strokeWidth={1.3} />}</div>;
}

function modifiedLabel(timestamp: number): string {
  const difference = Date.now() - timestamp;
  if (difference < 60000) return 'Editado ahora';
  if (difference < 3600000) return `Hace ${Math.floor(difference / 60000)} min`;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', ...(difference > 31536000000 ? { year: 'numeric' as const } : {}) }).format(timestamp);
}

interface Props {
  open: boolean; onClose: () => void; boards: BoardMeta[]; activeId: string; busy: boolean;
  onSelect: (id: string) => void; onNew: () => void; onImport: () => void;
  onRename: (board: BoardMeta) => void; onDuplicate: (board: BoardMeta) => void; onDelete: (board: BoardMeta) => void;
}

export function BoardPanel(props: Props) {
  const [search, setSearch] = useState('');
  const filtered = props.boards.filter(board => board.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  return <Dialog open={props.open} onClose={props.onClose} className="relative z-[80]">
    <div className="fixed inset-0 bg-slate-950/20 backdrop-blur-[2px]" aria-hidden="true" />
    <div className="fixed inset-0 flex">
      <DialogPanel className="board-panel flex h-full w-full max-w-[420px] flex-col shadow-2xl">
        <header className="flex items-center justify-between px-6 pt-7 pb-5">
          <div><span className="eyebrow">TU ESPACIO</span><DialogTitle className="mt-1 text-2xl font-semibold tracking-tight">Mis tableros <span className="muted ml-1 text-base font-normal">{props.boards.length}</span></DialogTitle></div>
          <button onClick={props.onClose} aria-label="Cerrar tableros" className="icon-button"><X size={20} /></button>
        </header>
        <div className="space-y-3 px-6 pb-5">
          <button className="primary-button w-full justify-center" onClick={props.onNew} disabled={props.busy}><Plus size={18} />Nuevo tablero</button>
          <label className="search-field"><Search size={17} className="muted shrink-0" /><input autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar un tablero…" aria-label="Buscar tableros" /></label>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="muted px-2 pb-3 text-sm">Últimos editados</p>
          {filtered.length === 0 && <div className="muted px-4 py-12 text-center text-sm">No hay tableros con ese nombre.</div>}
          <ul className="space-y-2">
            {filtered.map(board => <li key={board.id} className={`board-row ${board.id === props.activeId ? 'is-active' : ''}`}>
              <button className="flex min-w-0 flex-1 items-center gap-3.5 p-3 text-left" onClick={() => props.onSelect(board.id)} disabled={props.busy} aria-label={`Abrir tablero: ${board.name}`} aria-current={board.id === props.activeId ? 'page' : undefined}>
                <BoardThumbnail board={board} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{board.name}</span><span className="muted mt-1 block text-sm">{modifiedLabel(board.updatedAt)}</span></span>
                {board.id === props.activeId && <Check size={16} className="text-violet-500" />}
              </button>
              <Menu>
                <MenuButton className="icon-button mr-2 shrink-0" aria-label={`Opciones de ${board.name}`} disabled={props.busy}><MoreHorizontal size={19} /></MenuButton>
                <MenuItems anchor="bottom end" className="dropdown-menu z-[120] w-48 [--anchor-gap:6px]">
                  <MenuItem><button onClick={() => props.onRename(board)}><Pencil size={16} />Cambiar nombre</button></MenuItem>
                  <MenuItem><button onClick={() => props.onDuplicate(board)}><Copy size={16} />Duplicar</button></MenuItem>
                  <div className="menu-divider" />
                  <MenuItem><button className="danger-text" onClick={() => props.onDelete(board)}><Trash2 size={16} />Eliminar</button></MenuItem>
                </MenuItems>
              </Menu>
            </li>)}
          </ul>
        </div>
        <footer className="panel-footer px-6 py-5">
          <button className="secondary-button mb-4 w-full justify-center" onClick={props.onImport} disabled={props.busy}><FolderOpen size={17} />Importar .excalidraw</button>
          <p className="muted flex items-center justify-center gap-2 text-sm"><HardDrive size={15} />Guardados en este navegador</p>
        </footer>
      </DialogPanel>
    </div>
  </Dialog>;
}
