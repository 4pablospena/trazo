import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { downloadBlob } from '../lib/scene';

export class EditorErrorBoundary extends Component<{ children: ReactNode; backup: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Editor error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="flex h-full items-center justify-center p-8 text-center"><div className="max-w-md">
      <h2 className="text-xl font-semibold">No se ha podido mostrar el lienzo</h2>
      <p className="muted my-4">Tu última versión guardada sigue disponible. Puedes descargarla antes de volver a cargar.</p>
      <div className="flex flex-wrap justify-center gap-3"><button className="secondary-button" onClick={() => downloadBlob(new Blob([this.props.backup], { type: 'application/json' }), 'recuperacion.excalidraw')}>Descargar copia guardada</button><button className="primary-button" onClick={() => window.location.reload()}>Volver a cargar</button></div>
    </div></div>;
  }
}
