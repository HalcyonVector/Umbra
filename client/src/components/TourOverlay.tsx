import { useEffect, useState } from 'react';

interface TourStep {
  selector: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="map"]',
    title: 'A real, live map',
    body: "Tracks the ISS's actual position. Drag to look around, scroll or pinch to zoom — it's a real map, not an illustration.",
  },
  {
    selector: '[data-tour="rail"]',
    title: 'Mission stats',
    body: 'Builds up the longer you leave this open — distance flown, countries overflown, orbit count. Click any heading to collapse it.',
  },
  {
    selector: '[data-tour="dock"]',
    title: 'Visibility predictor',
    body: "Set your location here to find out exactly when it'll be bright enough to spot overhead — real orbital mechanics and solar geometry, not a guess.",
  },
  {
    selector: '[data-tour="sky-chart"]',
    title: 'Know where to look',
    body: 'Every predicted pass gets a real rise-to-set sky chart. Watch too for the "golden window" banner up top — it flags the single best place on Earth to look up, right now.',
  },
];

interface TourOverlayProps {
  onFinish: () => void;
}

/**
 * A short spotlight tour replacing the old single dismissible banner — the
 * app now has real depth (session stats, the golden-window ticker, a real
 * sky-plot) that a first-time visitor has no way to discover otherwise. The
 * "hole" in the backdrop is a plain CSS trick (a giant box-shadow on a div
 * sized to the target's own bounding rect) rather than an SVG mask, so it
 * stays in sync with layout/scroll with nothing more than a resize listener.
 *
 * Deliberately named umbra-guide-* rather than tour-overlay/popup/modal:
 * a full-viewport fixed div with a dark backdrop and those class names is
 * exactly what generic ad-blocker "hide overlays/popups" cosmetic filters
 * target — confirmed as the actual cause of this getting silently stripped
 * seconds after mount for a user running one such extension.
 */
export function TourOverlay({ onFinish }: TourOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[stepIndex];

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(step.selector);
      const next = el ? el.getBoundingClientRect() : null;
      // Bail out on no real change: getBoundingClientRect() returns a new
      // object every call even when nothing moved, and calling setRect with
      // a fresh reference every poll tick — even to numerically-identical
      // values — forced a re-render every cycle, which was restarting the
      // CSS entrance animation each time and leaving it permanently stuck
      // at its 0%-keyframe (opacity: 0, i.e. genuinely invisible).
      setRect((prev) => {
        if (prev && next && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        return next;
      });
    };
    measure();
    window.addEventListener('resize', measure);
    // Live data streaming into the rail/dock can nudge layout slightly after
    // mount (a card growing once data arrives, a scrollbar appearing) — a
    // short-lived poll while the tour is up is simpler and more robust than
    // trying to observe every possible cause, and costs nothing once the
    // tour is dismissed (and costs nothing per-tick either, now that it
    // bails out instead of forcing a render every time).
    const interval = setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(interval);
    };
  }, [step.selector]);

  const isLast = stepIndex === STEPS.length - 1;
  const next = () => {
    if (isLast) onFinish();
    else setStepIndex((i) => i + 1);
  };

  const cardWidth = 280;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const cardTop = rect ? Math.min(viewportH - 180, Math.max(16, rect.top + rect.height / 2 - 70)) : viewportH / 2 - 70;
  const cardLeft = rect ? Math.min(viewportW - cardWidth - 16, Math.max(16, rect.left + rect.width / 2 - cardWidth / 2)) : viewportW / 2 - cardWidth / 2;

  return (
    <div className="umbra-guide-layer" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect && (
        <div
          className="umbra-guide-highlight"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="umbra-guide-card" style={{ top: cardTop, left: cardLeft, width: cardWidth }}>
        <div className="umbra-guide-step">
          {stepIndex + 1} / {STEPS.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="umbra-guide-actions">
          <button className="ghost" onClick={onFinish}>
            Skip
          </button>
          <button className="btn-console" onClick={next}>
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
