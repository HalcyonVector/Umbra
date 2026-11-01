import { useState } from 'react';

interface IntroStep {
  title: string;
  body: string;
}

const STEPS: IntroStep[] = [
  {
    title: 'Where the ISS is, right now',
    body: 'The glowing marker is the station, live. The faint line behind it is where it has been, the dotted line is where it goes in the next 3 hours, and the shaded half of the map is night.',
  },
  {
    title: 'Can I see it tonight?',
    body: 'Set your location in the passes panel (use your device location or click the map). Umbra predicts when the station will be sunlit while your sky is dark, which is when you can see it with your own eyes.',
  },
  {
    title: 'Know where to look',
    body: 'Every pass comes with a sky chart: which direction it rises from, how high it climbs, and where it sets. No telescope needed, it looks like a bright, steady star moving fast.',
  },
  {
    title: 'Leave it open',
    body: 'The longer the tab stays open, the more it records: distance flown, countries crossed, sunrises and sunsets. The track you have seen is kept between visits.',
  },
];

interface IntroCardProps {
  onFinish: () => void;
}

/** A small first-visit walkthrough, advanced by explicit clicks. Reopen it any time from the help button. */
export function IntroCard({ onFinish }: IntroCardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const next = () => {
    if (isLast) onFinish();
    else setStepIndex((i) => i + 1);
  };

  return (
    <div className="umbra-intro-card glass" role="dialog" aria-label="Welcome to Umbra">
      <div className="umbra-intro-progress" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
        {STEPS.map((_, i) => (
          <span key={i} className={i <= stepIndex ? 'is-on' : ''} />
        ))}
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      <div className="umbra-intro-actions">
        <button type="button" className="btn btn--ghost" onClick={onFinish}>
          Skip
        </button>
        <button type="button" className="btn btn--primary" onClick={next}>
          {isLast ? 'Start tracking' : 'Next'}
        </button>
      </div>
    </div>
  );
}
