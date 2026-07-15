interface OnboardingHintProps {
  onDismiss: () => void;
}

/** A one-time dismissible banner under the top bar, since the console alone doesn't explain itself on first visit. */
export function OnboardingHint({ onDismiss }: OnboardingHintProps) {
  return (
    <div className="onboarding-banner" role="note">
      <p>
        This map tracks the ISS's real live position and is draggable — click and drag left or right to look
        around. Its path persists across visits, slowly drawing a real ground-track weave as Earth rotates
        underneath each orbit. Set a location in the dock to see exactly when it'll next be bright enough to
        spot overhead — computed from real orbital mechanics and solar geometry, not a guess.
      </p>
      <button className="ghost" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
