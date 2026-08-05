import type { AccessibilityProps } from 'react-native';

/** Canonical keyed item shared by segmented, tab, and filter controls. */
export interface SelectionControlItem<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly badge?: string | number;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
}

/** Announces an item's position without coupling selection to array indexes. */
export function selectionAccessibilityValue(
  index: number,
  itemCount: number,
): AccessibilityProps['accessibilityValue'] {
  return { text: `${index + 1} of ${itemCount}` };
}

/** Includes a visible count/status badge in the control's spoken label. */
export function selectionAccessibilityLabel<Value extends string>(
  item: SelectionControlItem<Value>,
): string {
  if (item.accessibilityLabel != null) return item.accessibilityLabel;
  return item.badge == null ? item.label : `${item.label}, ${item.badge}`;
}
