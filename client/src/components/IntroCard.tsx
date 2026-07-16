import { useState } from 'react';

interface IntroStep {
  title: string;
  body: string;
}

const STEPS: IntroStep[] = [
  {
    title: 'A real, live map',
    body: "Tracks the ISS's actual position. Drag to look around, scroll or pinch to zoom — it's a real map, not an illustration.",
  },
  {
    title: 'Mission stats',
    body: 'The left panel builds up the longer you leave this open — distance flown, countries overflown, orbit count. Click any heading to collapse it.',
  },
  {
    title: 'Visibility predictor',
    body: "Set your location in the right panel to find out exactly when it'll be bright enough to spot overhead — real orbital mechanics and solar geometry, not a guess.",
  },
  {
    title: 'Know where to look',
    body: 'Every predicted pass gets a real rise-to-set sky chart. Watch too for the "golden window" banner — it flags the single best place on Earth to look up, right now.',
  },
];

interface IntroCardProps {
  onFinish: () => void;
}

/**
 * A plain, first-visit-only intro card — deliberately as simple as
 * possible. This replaces an earlier spotlight-tour implementation
 * (per-target getBoundingClientRect tracking, a 400ms measurement poll, a
 * resize listener, a full-viewport dimmed backdrop) that a user reported
 * repeatedly, reproducibly vanishing within about a second of load on
 * their machine — a failure mode never reproduced in any of this
 * project's own testing across multiple rounds of direct instrumentation
 * (global error/rejection handlers, explicit call-site logging), ruling
 * out an uncaught exception or the dismiss handler firing unexpectedly.
 * Rather than keep chasing a machine-specific rendering issue blind,
 * this trades the spotlight/highlight novelty for a design with far less
 * that can go wrong: no polling, no target measurement, no backdrop, no
 * dependency on any other element's layout — just a small fixed card
 * advanced by explicit clicks. Named umbra-intro-* (not tour/overlay/
 * popup/modal) since generic ad-blocker cosmetic filters were separately
 * confirmed to strip class names like that in at least one real case.
 */
export function IntroCard({ onFinish }: IntroCardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const next = () => {
    if (isLast) onFinish();
    else setStepIndex((i) => i + 1);
  };

  return (
    <div className="umbra-intro-card" role="dialog" aria-label="Welcome to Umbra">
      <div className="umbra-intro-step">
        {stepIndex + 1} / {STEPS.length}
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      <div className="umbra-intro-actions">
        <button className="ghost" onClick={onFinish}>
          Skip
        </button>
        <button className="btn-console" onClick={next}>
          {isLast ? 'Got it' : 'Next'}
        </button>
      </div>
    </div>
  );
}
