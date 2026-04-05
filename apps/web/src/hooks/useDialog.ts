import { useEffect, useRef } from 'react';

/**
 * Provides dialog accessibility: Escape key dismissal and initial focus management.
 *
 * Usage:
 *   const dialogRef = useDialog(onClose);
 *   // or for modals with isOpen prop:
 *   const dialogRef = useDialog(onClose, isOpen);
 *
 * Then on the content div:
 *   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="my-title-id">
 *     <h2 id="my-title-id">Title</h2>
 *     ...
 *   </div>
 */
export function useDialog(
  onClose: () => void,
  isOpen = true,
): React.RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelector<HTMLElement>(
      'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [isOpen]);

  return dialogRef;
}
