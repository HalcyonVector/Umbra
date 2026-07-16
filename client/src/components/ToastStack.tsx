import { useEffect } from 'react';

export interface ToastItem {
  id: string;
  message: string;
}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 6000;

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [toast.id, onDismiss]);

  return (
    <div className="toast" role="status">
      {toast.message}
    </div>
  );
}

/** A small stack of session-milestone notifications (distance/country/orbit thresholds crossed) — a moment of payoff for the otherwise-passive rail stats, auto-dismissing so they never pile up or block anything. */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
