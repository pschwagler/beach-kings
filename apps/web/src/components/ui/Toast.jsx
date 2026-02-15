'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

/**
 * Lightweight toast notification for temporary user feedback.
 *
 * @param {Object} props
 * @param {string} props.message - Toast message text
 * @param {React.ReactNode} [props.action] - Optional action element (e.g., button)
 * @param {number} [props.duration=10000] - Auto-dismiss time in ms (0 = never)
 * @param {function} props.onClose - Called when toast is dismissed
 */
export default function Toast({ message, action, duration = 10000, onClose }) {
  const [visible, setVisible] = useState(true);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200); // wait for fade-out animation
  }, [onClose]);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, dismiss]);

  return (
    <div className={`toast ${visible ? 'toast--visible' : 'toast--hidden'}`}>
      <span className="toast__message">{message}</span>
      {action && <span className="toast__action">{action}</span>}
      <button className="toast__close" onClick={dismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Container for rendering multiple toasts. Renders at bottom-center of viewport.
 *
 * @param {Object} props
 * @param {Array<{id, message, action}>} props.toasts - Active toasts
 * @param {function} props.onDismiss - Called with toast id when dismissed
 */
export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          action={t.action}
          duration={t.duration}
          onClose={() => onDismiss(t.id)}
        />
      ))}
    </div>
  );
}

/**
 * Hook for managing toast state.
 * Returns [toasts, addToast, dismissToast].
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  let nextId = 0;

  const addToast = useCallback((message, { action, duration } = {}) => {
    const id = Date.now() + nextId++;
    setToasts((prev) => [...prev, { id, message, action, duration }]);
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return [toasts, addToast, dismissToast];
}
