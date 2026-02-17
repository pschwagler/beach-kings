'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import './GlassToast.css';

/**
 * Auto-dismiss durations per toast type (ms).
 */
const DURATIONS = {
  success: 5000,
  error: 10000,
  info: 5000,
};

/**
 * Icon component per toast type.
 */
const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

/**
 * Single glass-morphism toast notification.
 *
 * @param {Object} props
 * @param {string} props.message - Toast text
 * @param {'success'|'error'|'info'} props.type - Visual variant
 * @param {function} props.onDismiss - Called when toast should be removed
 */
export default function GlassToast({ message, type = 'info', onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const duration = DURATIONS[type] || DURATIONS.info;
  const Icon = ICONS[type] || ICONS.info;

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, dismiss]);

  return (
    <div
      className={`glass-toast glass-toast--${type}${exiting ? ' glass-toast--exiting' : ''}`}
      role="status"
      aria-live="polite"
    >
      <Icon size={18} className="glass-toast__icon" aria-hidden />
      <span className="glass-toast__message">{message}</span>
      <button className="glass-toast__close" onClick={dismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
