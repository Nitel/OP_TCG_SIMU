import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

// StrictMode intentionally excluded: it double-invokes effects, which causes
// two concurrent WebGL contexts on the same <canvas> — a browser-level limit
// that silently blacks out PixiJS rendering.
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(<App />);
