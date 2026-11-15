import React from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { AccessibilityFocusRef } from '@/components/ui/useModalAccessibility';

interface Props {
  readonly visible: boolean;
  readonly playerName: string;
  readonly isPending: boolean;
  readonly errorMessage?: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: AccessibilityFocusRef;
}

export default function UnblockPlayerDialog(props: Props): React.ReactNode {
  return (
    <ConfirmDialog
      visible={props.visible}
      title={`Unblock ${props.playerName}?`}
      message="Old messages will return. Your friendship and any pending invitations will not be restored."
      confirmLabel="Unblock player"
      cancelLabel="Cancel"
      isPending={props.isPending}
      errorMessage={props.errorMessage}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
      returnFocusRef={props.returnFocusRef}
      testID="unblock-player-dialog"
    />
  );
}
