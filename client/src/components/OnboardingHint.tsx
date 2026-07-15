interface OnboardingHintProps {
  onDismiss: () => void;
}

/** A one-time callout for first-time visitors, since the tray alone doesn't explain itself. */
export function OnboardingHint({ onDismiss }: OnboardingHintProps) {
  return (
    <div className="onboarding-hint" role="note">
      <p>
        This map tracks the ISS's real live position from Open Notify. Its path persists across visits, slowly
        drawing a real "ground track" weave as Earth rotates underneath each orbit. Set a location in{' '}
        <strong>⚙ Mission Control</strong> to see exactly when the ISS will next be bright enough to spot
        overhead from where you are — computed from real orbital mechanics and solar geometry, not a guess.
      </p>
      <button className="ghost" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
