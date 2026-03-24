'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import GlassToast from '../components/ui/GlassToast';

const ToastContext = createContext(null);

/** Maximum visible toasts at once. Oldest are auto-dismissed when exceeded. */
const MAX_TOASTS = 3;

/**
 * Global toast provider. Renders a portal-based toast container.
 * Wrap your app with `<ToastProvider>` and use `useToast()` anywhere.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + nextIdRef.current++;
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      // Auto-dismiss oldest when exceeding cap
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <GlassToastContainer toasts={toasts} onDismiss={dismissToast} />,
          document.body
        )}
    </ToastContext.Provider>
  );
}

/**
 * Container that renders active toasts.
 */
function GlassToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="glass-toast-container">
      {toasts.map((t) => (
        <GlassToast
          key={t.id}
          message={t.message}
          type={t.type}
          onDismiss={() => onDismiss(t.id)}
        />
      ))}
    </div>
  );
}

/**
 * Hook to access the global toast system.
 * @returns {{ showToast: (message: string, type?: 'success'|'error'|'info') => number }}
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
