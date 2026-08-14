import React from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Props {
  readonly visible: boolean;
  readonly playerName: string;
  readonly isPending: boolean;
  readonly errorMessage?: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export default function BlockPlayerDialog(props: Props): React.ReactNode {
  return (
    <ConfirmDialog
      visible={props.visible}
      title={`Block ${props.playerName}?`}
      message="They won't be notified. Direct contact, friendship, discovery, and invites stop in both directions. Shared league facts remain visible. This conversation is hidden until you unblock them."
      confirmLabel="Block player"
      confirmVariant="destructive"
      cancelLabel="Cancel"
      isPending={props.isPending}
      errorMessage={props.errorMessage}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
      testID="block-player-dialog"
    />
  );
}
