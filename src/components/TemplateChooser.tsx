import { Plus } from 'lucide-react';
import { templates, type TemplateId } from '../lib/templates';
import { Modal } from './Modal';

export function TemplateIllustration({ type }: { type: TemplateId }) {
  return <svg viewBox="0 0 300 150" className={`template-illustration template-${type}`} aria-hidden="true">
    {type === 'blank' ? <>
      <rect x="111" y="33" width="78" height="85" rx="7" fill="white" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="5 5" />
      <path d="M150 60v30m-15-15h30" stroke="#8b7add" strokeWidth="2" strokeLinecap="round" />
    </> : type === 'flow' ? <>
      <rect x="22" y="53" width="65" height="46" rx="9" fill="#e5dbff" stroke="#a394d9" strokeWidth="1.5" />
      <rect x="118" y="53" width="65" height="46" rx="9" fill="#d0ebff" stroke="#88b6d8" strokeWidth="1.5" />
      <rect x="214" y="53" width="65" height="46" rx="9" fill="#d3f9d8" stroke="#92c29a" strokeWidth="1.5" />
      <path d="M91 76h22m-5-5 5 5-5 5m80-5h22m-5-5 5 5-5 5" fill="none" stroke="#9b99a7" strokeWidth="1.7" />
      {[45, 141, 237].map(x => <path key={x} d={`M${x} 76h20`} stroke="#858298" strokeWidth="2" strokeLinecap="round" />)}
    </> : type === 'kanban' ? <>
      {[30, 115, 200].map((x, i) => <g key={x}>
        <rect x={x} y="25" width="70" height="105" rx="6" fill="white" stroke="#e6e7ed" />
        <rect x={x + 8} y="34" width="54" height="14" rx="3" fill={['#e5dbff', '#d0ebff', '#d3f9d8'][i]} />
        <rect x={x + 8} y="57" width="54" height="25" rx="3" fill="#fff1ad" />
        {i === 0 && <rect x={x + 8} y="90" width="54" height="25" rx="3" fill="#fce1eb" />}
      </g>)}
    </> : <>
      {[{ x: 64, y: 24, c: '#ffdf6b', r: -6 }, { x: 157, y: 31, c: '#a5d8ff', r: 5 }, { x: 69, y: 87, c: '#fcc2d7', r: 3 }, { x: 160, y: 91, c: '#b2f2bb', r: -4 }].map((n, i) => <g key={i} transform={`rotate(${n.r} ${n.x + 35} ${n.y + 25})`}>
        <rect x={n.x} y={n.y} width="70" height="49" rx="3" fill={n.c} />
        <path d={`M${n.x + 17} ${n.y + 20}h36m-36 8h25`} stroke="#716b57" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
      </g>)}
    </>}
  </svg>;
}

export function TemplateChooser({ open, onClose, onCreate, busy }: {
  open: boolean; onClose: () => void; onCreate: (id: TemplateId) => void; busy: boolean;
}) {
  return <Modal open={open} onClose={onClose} title="¿Qué tienes en mente?" description="Elige un punto de partida. Después puedes cambiarlo todo." wide>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {templates.map(template => <button key={template.id} className="template-card group overflow-hidden rounded-xl text-left" disabled={busy} onClick={() => onCreate(template.id)} aria-label={`Crear tablero: ${template.name}`}>
        <TemplateIllustration type={template.id} />
        <div className="flex items-center justify-between gap-3 p-4">
          <div><h3 className="font-semibold">{template.name}</h3><p className="muted mt-1 text-sm">{template.description}</p></div>
          <span className="template-add"><Plus size={17} /></span>
        </div>
      </button>)}
    </div>
    <p className="muted mt-6 text-center text-sm">Cada plantilla crea un tablero nuevo.</p>
  </Modal>;
}
