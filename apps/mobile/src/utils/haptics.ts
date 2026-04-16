/**
 * Haptic feedback helpers that wrap expo-haptics.
 *
 * Each function silently no-ops when haptics are unavailable (e.g. on
 * simulators or older Android devices), so call sites never need to guard
 * against hardware limitations.
 */
import * as Haptics from 'expo-haptics';

/**
 * Triggers a light impact haptic (e.g. tap, subtle selection feedback).
 */
export async function hapticLight(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics not supported on this device/platform — ignore.
  }
}

/**
 * Triggers a medium impact haptic (e.g. button press, drag drop).
 */
export async function hapticMedium(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Haptics not supported on this device/platform — ignore.
  }
}

/**
 * Triggers a heavy impact haptic (e.g. destructive action confirmation).
 */
export async function hapticHeavy(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // Haptics not supported on this device/platform — ignore.
  }
}

/**
 * Triggers a success notification haptic (e.g. form submitted, game saved).
 */
export async function hapticSuccess(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics not supported on this device/platform — ignore.
  }
}

/**
 * Triggers an error notification haptic (e.g. validation failure, network error).
 */
export async function hapticError(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptics not supported on this device/platform — ignore.
  }
}
