import React from "react";
import { TextInput, View } from "react-native";
import AppText from "@/components/ui/AppText";
import { useTheme } from "@/contexts/ThemeContext";
import { usePaletteColors } from "@/theme/usePaletteColors";

export default function ScoresheetCorrectionForm({
  value,
  onChange,
  disabled,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
}) {
  const palette = usePaletteColors();
  const { isDark } = useTheme();
  return (
    <View className="gap-3">
      <AppText className="text-body font-bold text-default">
        Need a correction?
      </AppText>
      <AppText className="text-caption text-muted">
        Describe score or player changes, then tap Apply correction below.
      </AppText>
      <TextInput
        testID="scoresheet-correction-instructions"
        accessibilityLabel="Scoresheet correction instructions"
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        placeholder="E.g. game 2 finished 21–18. Replace Sam with Alex in game 3."
        placeholderTextColor={palette.textTertiary}
        keyboardAppearance={isDark ? "dark" : "light"}
        className="min-h-28 border border-strong rounded-lg px-4 py-3 bg-elevated text-body text-default"
      />
    </View>
  );
}
