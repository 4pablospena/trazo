import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  description?: string;
  wide?: boolean;
  maxWidth?: CSSProperties['maxWidth'];
}

export function Modal({ open, onClose, title, description, children, wide, maxWidth }: Props) {
  return <Dialog open={open} onClose={onClose} className="relative z-[100]">
    <div className="fixed inset-0 bg-slate-950/25 backdrop-blur-[3px]" aria-hidden="true" />
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4 sm:p-8">
      <DialogPanel style={maxWidth ? { maxWidth } : undefined} className={`modal-panel w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90dvh] overflow-y-auto rounded-2xl p-6 shadow-2xl sm:p-8`}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><DialogTitle className="text-xl font-semibold tracking-tight">{title}</DialogTitle>
            {description && <p className="muted mt-2 text-sm leading-relaxed">{description}</p>}
          </div>
          <button className="icon-button shrink-0" aria-label="Cerrar diálogo" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </DialogPanel>
    </div>
  </Dialog>;
}
