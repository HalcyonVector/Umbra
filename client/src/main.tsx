import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// React's own error boundary only catches errors thrown during render — not
// in event handlers, useEffect callbacks, timers, or rejected promises,
// which is most of this app's actual runtime logic (ISS polling, Leaflet's
// own internal handlers, etc.). Anything thrown there today just becomes a
// console error with no on-screen sign anything went wrong, which is
// exactly the kind of thing that's easy to miss if DevTools isn't already
// open. This surfaces it the same way the ErrorBoundary does, as a plain
// DOM banner outside React so it renders even if React itself is wedged.
function showDiagnosticBanner(title: string, detail: string) {
  const existing = document.getElementById('umbra-diagnostic-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'umbra-diagnostic-banner';
  banner.style.cssText =
    'position:fixed;inset:0 0 auto 0;z-index:9999;background:#3a0d0d;color:#ffdede;' +
    'font:12px/1.5 monospace;padding:12px 16px;max-height:50vh;overflow:auto;' +
    'white-space:pre-wrap;word-break:break-word;border-bottom:2px solid #ff5555;';
  banner.textContent = `[Umbra diagnostic] ${title}\n${detail}`;
  document.body.appendChild(banner);
}

window.addEventListener('error', (event) => {
  showDiagnosticBanner(
    `Uncaught error: ${event.message}`,
    `${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack ?? '(no stack)'}`,
  );
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  showDiagnosticBanner(
    'Unhandled promise rejection',
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  );
});

// Intentionally not wrapped in <React.StrictMode>: it double-invokes effects
// in dev, which tears down and rebuilds the Tone.js audio graph mid-session.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Only register in production builds — in dev this would cache Vite's
// module graph and fight with HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell caching is a nice-to-have; failure here shouldn't be user-visible.
    });
  });
}
