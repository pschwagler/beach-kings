import { useEffect, useRef } from 'react';

/** Keep keyboard navigation in the dialog and return focus to its opener. */
export function useAuthDialog(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.querySelector<HTMLElement>('input:not([type="hidden"]), button')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      )].filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  // A mode change can remove the focused control (for example recovery).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>('input:not([type="hidden"]), button')?.focus();
    }
  });

  return dialogRef;
}
