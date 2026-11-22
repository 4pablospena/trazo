import { createRoot } from 'react-dom/client';
import './styles.css';

declare global { interface Window { EXCALIDRAW_ASSET_PATH: string | string[] } }
window.EXCALIDRAW_ASSET_PATH = new URL(import.meta.env.BASE_URL, window.location.origin).href;
const { default: App } = await import('./App');
const root = document.getElementById('root');
if (!root) throw new Error('No se encuentra el contenedor de la aplicación.');
createRoot(root).render(<App />);
