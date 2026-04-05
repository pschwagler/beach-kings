import { X, AlertTriangle } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

interface ConfirmLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmLeaveModal({ isOpen, onClose, onConfirm }: ConfirmLeaveModalProps) {
  const dialogRef = useDialog(onClose, isOpen);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="auth-modal-overlay">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-leave-title" className="auth-modal">
        <div className="auth-modal__header">
          <div>
            <h2 id="confirm-leave-title">Unsaved Changes</h2>
          </div>
          <button className="auth-modal__close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
            <AlertTriangle size={24} style={{ color: '#b45309', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ margin: 0, lineHeight: '1.5' }}>
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            type="button"
            className="auth-modal__submit"
            onClick={onClose}
            style={{ 
              backgroundColor: 'transparent', 
              color: 'var(--gray-700)',
              border: '1px solid var(--gray-300)'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="auth-modal__submit"
            onClick={onConfirm}
            style={{ backgroundColor: '#ef4444' }}
          >
            Leave Without Saving
          </button>
        </div>
      </div>
    </div>
  );
}
