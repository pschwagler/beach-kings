import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActionSheetIOS, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomSheet from "@/components/ui/BottomSheet";
import AppText from "@/components/ui/AppText";

export type ScoresheetPhotoSource = "camera" | "library";
type Options = { anchor?: number; title?: string; message?: string };

/** Native iPhone action sheet / iPad anchored popover, with an Android bottom sheet. */
export function useScoresheetPhotoSource(
  onSelect: (source: ScoresheetPhotoSource) => void,
  onCancel?: () => void,
) {
  const callbacks = useRef({ onSelect, onCancel });
  callbacks.current = { onSelect, onCancel };
  const opened = useRef(false);
  const mounted = useRef(true),
    delivery = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (delivery.current) clearTimeout(delivery.current);
    };
  }, []);
  const [options, setOptions] = useState<Options | null>(null);
  const finish = useCallback((source?: ScoresheetPhotoSource) => {
    if (!opened.current || !mounted.current) return;
    opened.current = false;
    setOptions(null);
    // Finish dismissing the source sheet before presenting another native view.
    delivery.current = setTimeout(() => {
      delivery.current = null;
      if (!mounted.current) return;
      if (source) callbacks.current.onSelect(source);
      else callbacks.current.onCancel?.();
    }, 350);
  }, []);
  const open = useCallback(
    (settings: Options = {}) => {
      if (opened.current || delivery.current) return;
      opened.current = true;
      const config = { title: "Add scoresheet photo", ...settings };
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: config.title,
            message: config.message,
            anchor: config.anchor,
            options: ["Take photo", "Choose from photos", "Cancel"],
            cancelButtonIndex: 2,
          },
          (index) =>
            finish(
              index === 0 ? "camera" : index === 1 ? "library" : undefined,
            ),
        );
      } else setOptions(config);
    },
    [finish],
  );
  const sheet =
    Platform.OS === "ios" ? null : (
      <BottomSheet
        visible={options != null}
        onClose={() => finish()}
        testID="scoresheet-photo-source"
        accessibilityLabel="Add scoresheet photo"
      >
        <SafeAreaView edges={["bottom"]} className="px-4 pt-4">
          <AppText className="text-title3 font-bold text-default mb-2">
            {options?.title}
          </AppText>
          {options?.message && (
            <AppText className="text-caption text-muted mb-2">
              {options.message}
            </AppText>
          )}
          {(["camera", "library"] as const).map((source) => (
            <Pressable
              key={source}
              accessibilityRole="button"
              onPress={() => finish(source)}
              className="min-h-touch justify-center py-3 border-b border-divider"
            >
              <AppText className="text-body font-semibold text-brand-teal">
                {source === "camera" ? "Take photo" : "Choose from photos"}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => finish()}
            className="min-h-touch items-center justify-center my-2"
          >
            <AppText className="text-body font-semibold text-muted">
              Cancel
            </AppText>
          </Pressable>
        </SafeAreaView>
      </BottomSheet>
    );
  return { open, sheet };
}
