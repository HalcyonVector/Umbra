interface OnboardingHintProps {
  onDismiss: () => void;
}

/** A one-time callout for first-time visitors, since the tray alone doesn't explain itself. */
export function OnboardingHint({ onDismiss }: OnboardingHintProps) {
  return (
    <div className="onboarding-hint" role="note">
      <p>
        This is the ISS's real live position, from Open Notify. A background drone continuously reshapes itself
        around altitude, orbital speed, who's currently aboard, and whether the station is in daylight or
        darkness. Every real sunrise or sunset the crew sees — about 16 a day — triggers a slow audible swell{' '}
        <em>exactly when it happens</em>, predicted from real solar geometry, not just reported by the feed.{' '}
        <strong>⚙</strong> opens the Telemetry panel for more controls.
      </p>
      <button className="ghost" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
