/**
 * ChatView — generic chat surface (message list + composer).
 *
 * Pass oldest-first data. `renderBubble` receives `(item, nextItem)` where
 * `nextItem` is the next more-recent message (null for the newest). Use it to
 * compute whether to show the sender name/avatar at the bottom of a run.
 *
 * Keyboard handling: automaticallyAdjustKeyboardInsets on the FlatList +
 * KeyboardStickyView for the composer. No KeyboardAvoidingView needed.
 */

import React, { useRef } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateLabel(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Date divider
// ---------------------------------------------------------------------------

function DateDivider({ label }: { readonly label: string }): React.ReactNode {
  return (
    <View className="flex-row items-center px-4 py-3 gap-3">
      <View className="flex-1 h-[1px] bg-divider" />
      <Text className="text-[11px] text-muted font-medium">{label}</Text>
      <View className="flex-1 h-[1px] bg-divider" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// List item union
// ---------------------------------------------------------------------------

type DividerItem = {
  readonly kind: 'divider';
  readonly key: string;
  readonly label: string;
};
type MsgItem<T> = {
  readonly kind: 'message';
  readonly key: string;
  readonly item: T;
  readonly nextItem: T | null;
};
type ListItem<T> = DividerItem | MsgItem<T>;

// ---------------------------------------------------------------------------
// ChatView
// ---------------------------------------------------------------------------

export interface ChatViewProps<T> {
  readonly data: readonly T[];
  readonly keyExtractor: (item: T, index: number) => string;
  /**
   * Render a message bubble. nextItem is the next more-recent message in the
   * chronological list (null for the newest). Use it to decide whether to
   * show the sender name/avatar at the bottom of a consecutive run.
   */
  readonly renderBubble: (item: T, nextItem: T | null) => React.ReactNode;
  /** Returns an ISO 8601 timestamp string used to group messages by day. */
  readonly getTimestamp: (item: T) => string;
  readonly renderComposer: () => React.ReactNode;
  readonly onRefresh?: () => void;
  readonly isRefreshing?: boolean;
  readonly emptyState?: React.ReactNode;
  readonly listTestID?: string;
  readonly testID?: string;
  /**
   * Safe-area bottom inset (from useSafeAreaInsets). Applied as an animated
   * spacer that shrinks to 0 as keyboard opens, clearing the home indicator
   * without creating a gap. Set to 0 (or omit) when a parent handles safe area.
   */
  readonly bottomInset?: number;
  /**
   * Height of UI rendered BELOW this component (e.g. a BottomTabBar).
   * KeyboardStickyView translates by the full keyboard height but the composer
   * starts that many pixels above the screen bottom, so it overshoots the
   * keyboard top by this amount. Passing this value corrects the gap.
   */
  readonly keyboardOpenedOffset?: number;
}

export default function ChatView<T>({
  data,
  keyExtractor,
  renderBubble,
  getTimestamp,
  renderComposer,
  onRefresh,
  isRefreshing = false,
  emptyState,
  listTestID,
  testID,
  bottomInset = 0,
  keyboardOpenedOffset = 0,
}: ChatViewProps<T>): React.ReactNode {
  const flatListRef = useRef<FlatList<ListItem<T>> | null>(null);
  const { progress, height: keyboardHeight } = useReanimatedKeyboardAnimation();
  // Shrinks from bottomInset → 0 as keyboard opens, clearing the home indicator
  // when keyboard is closed without creating a gap when it's open.
  const safeAreaStyle = useAnimatedStyle(() => ({
    height: (1 - progress.value) * bottomInset,
  }));
  // Grows as keyboard opens so the newest message stays anchored just above
  // the composer's top edge (instead of being covered by the composer's
  // translate-up). Matches the composer's lift amount exactly.
  const listFooterStyle = useAnimatedStyle(() => ({
    height: Math.max(-keyboardHeight.value - keyboardOpenedOffset, 0),
  }));
  // Extends the composer's surface color downward behind the keyboard's
  // rounded top corners so the page bg doesn't peek through. Only needed
  // when keyboard is open.
  const composerSurfaceExtensionStyle = useAnimatedStyle(() => ({
    height: progress.value * 60,
  }));

  const listItems: ListItem<T>[] = [];
  data.forEach((item, i) => {
    const ts = getTimestamp(item);
    const prevTs = i > 0 ? getTimestamp(data[i - 1]!) : null;
    const dateKey = ts.split('T')[0] ?? String(i);
    const prevDateKey = prevTs ? prevTs.split('T')[0] : null;

    if (prevDateKey === null || dateKey !== prevDateKey) {
      listItems.push({
        kind: 'divider',
        key: `divider-${dateKey}-${i}`,
        label: formatDateLabel(ts),
      });
    }

    listItems.push({
      kind: 'message',
      key: keyExtractor(item, i),
      item,
      nextItem: i < data.length - 1 ? (data[i + 1] ?? null) : null,
    });
  });

  return (
    <View testID={testID} style={{ flex: 1 }}>
      <FlatList<ListItem<T>>
        ref={flatListRef}
        testID={listTestID}
        data={listItems}
        keyExtractor={(listItem) => listItem.key}
        renderItem={({ item }) => {
          if (item.kind === 'divider') {
            return <DateDivider label={item.label} />;
          }
          return renderBubble(item.item, item.nextItem) as React.ReactElement | null;
        }}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        refreshControl={
          onRefresh != null ? (
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          ) : undefined
        }
        ListEmptyComponent={
          emptyState != null ? (emptyState as React.ReactElement) : undefined
        }
        ListFooterComponent={<Animated.View style={listFooterStyle} />}
      />
      <KeyboardStickyView offset={{ closed: 0, opened: keyboardOpenedOffset }}>
        <View>
          {renderComposer()}
          <Animated.View
            className="bg-surface"
            style={[
              composerSurfaceExtensionStyle,
              { position: 'absolute', top: '100%', left: 0, right: 0 },
            ]}
          />
        </View>
        <Animated.View style={safeAreaStyle} />
      </KeyboardStickyView>
    </View>
  );
}
