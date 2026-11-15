import React, { useRef } from "react";
import { Pressable, View, findNodeHandle } from "react-native";
import { Camera, CaretRight } from "phosphor-react-native";
import AppText from "@/components/ui/AppText";
import { usePaletteColors } from "@/theme/usePaletteColors";

import {
  useScoresheetPhotoSource,
  type ScoresheetPhotoSource,
} from "./useScoresheetPhotoSource";

export default function ScanScoresheetAction({
  onPress,
}: {
  readonly onPress: (source: ScoresheetPhotoSource) => void;
}) {
  const palette = usePaletteColors();
  const anchor = useRef<View>(null);
  const chooser = useScoresheetPhotoSource(onPress);
  return (
    <>
      <Pressable
        ref={anchor}
        testID="scan-scoresheet"
        accessibilityRole="button"
        accessibilityLabel="Scan scoresheet"
        onPress={() =>
          chooser.open({ anchor: findNodeHandle(anchor.current) ?? undefined })
        }
        className="flex-row items-center gap-3 rounded-card border border-brand-teal bg-info-tint px-4 py-4 active:opacity-70"
      >
        <Camera size={28} weight="duotone" color={palette.brandTeal} />
        <View className="flex-1 gap-1">
          <AppText className="text-title3 font-bold text-brand-teal">
            Scan scoresheet
          </AppText>
          <AppText className="text-caption text-muted">
            Take a photo. Review and add your games.
          </AppText>
        </View>
        <CaretRight size={20} color={palette.brandTeal} />
      </Pressable>
      {chooser.sheet}
    </>
  );
}
