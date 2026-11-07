import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface Props {
  readonly canSubmit: boolean;
  readonly isSaving: boolean;
  readonly saveButtonLabel: string;
  readonly onSave: () => void;
  readonly onSaveAndAddAnother?: () => void;
  readonly scoreWarning: string | null;
  readonly scoreWarningKind: 'error' | 'warning' | null;
  readonly onDelete?: () => void;
  readonly isDeleting: boolean;
}

/** Keep both save choices reachable while the score entry area scrolls. */
export default function ScoreSaveActions({
  canSubmit, isSaving, saveButtonLabel, onSave, onSaveAndAddAnother,
  scoreWarning, scoreWarningKind, onDelete, isDeleting,
}: Props): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="bg-surface border-t border-divider px-4 pt-3 pb-8">
      <Pressable
        testID="save-game-btn"
        onPress={onSave}
        disabled={!canSubmit || isSaving}
        accessibilityRole="button"
        accessibilityLabel={saveButtonLabel}
        accessibilityState={{
          disabled: !canSubmit || isSaving,
          busy: isSaving,
        }}
        className={`w-full py-4 rounded-[12px] items-center flex-row justify-center gap-2 border ${
          canSubmit ? 'bg-brand-gold border-brand-gold' : 'bg-warning-tint border-brand-gold opacity-disabled'
        }`}
      >
        {isSaving && <ActivityIndicator size="small" color={palette.onBrandGold} />}
        <AppText
          className={`font-bold text-[16px] ${canSubmit ? 'text-on-brand-gold' : 'text-warning'}`}
        >
          {saveButtonLabel}
        </AppText>
      </Pressable>

      {onSaveAndAddAnother != null && (
        <Pressable
          testID="save-and-add-another-btn"
          onPress={onSaveAndAddAnother}
          disabled={!canSubmit || isSaving}
          accessibilityRole="button"
          accessibilityLabel="Save and Add Another"
          accessibilityHint="Saves this game and starts a new game in the same session"
          accessibilityState={{ disabled: !canSubmit || isSaving, busy: isSaving }}
          className={`mt-2 min-h-touch rounded-[12px] border border-divider items-center justify-center px-4 py-3 ${!canSubmit || isSaving ? 'opacity-disabled' : 'active:opacity-70'}`}
        >
          <AppText className="text-[14px] font-semibold text-default">
            Save and Add Another
          </AppText>
        </Pressable>
      )}

      {scoreWarning != null && (
        <AppText
          testID="score-warning"
          accessibilityRole={scoreWarningKind === "error" ? "alert" : undefined}
          accessibilityLiveRegion={
            scoreWarningKind === "error" ? "polite" : "none"
          }
          className={`text-[12px] text-center mt-2 ${
            scoreWarningKind === "error"
              ? "text-danger font-semibold"
              : "text-tertiary"
          }`}
        >
          {scoreWarning}
        </AppText>
      )}

      {onDelete != null && (
        <Pressable
          testID="delete-game-link"
          onPress={onDelete}
          disabled={isDeleting || isSaving}
          accessibilityRole="button"
          accessibilityLabel="Delete Game"
          hitSlop={8}
          className="mt-3 items-center"
        >
          <AppText className="text-[14px] font-semibold text-danger">
            {isDeleting ? "Deleting…" : "Delete Game"}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
