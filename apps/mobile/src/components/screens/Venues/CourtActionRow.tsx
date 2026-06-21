/**
 * CourtActionRow — primary action buttons for the Court Detail screen.
 *
 * Renders:
 *   - "Check In" primary button (one-shot; no check-out).
 *     - While submitting: shows "Checking in..." and is non-interactive.
 *     - Already checked in: shows "Checked In" disabled state.
 *   - Live "N here now" count badge when at least one player is checked in.
 *   - "My Courts" / "Saved" outline button (favorites; toggles save state).
 *
 * Props:
 *   - court: Full court object passed down from CourtDetailScreen.
 *   - currentPlayerId: The signed-in player's id for self-detection (null if
 *     not authenticated).
 *   - onChanged: Optional callback fired after a successful check-in or
 *     save/unsave so the parent can refetch court data if needed.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCourtCheckIn } from './useCourtCheckIn';
import { useSaveCourt } from './useSaveCourt';
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { Court } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CourtActionRowProps {
  /** Full court object (for slug / id used by the check-in hook). */
  readonly court: Court;
  /** The signed-in player's id; null when not authenticated. */
  readonly currentPlayerId: number | null;
  /** Optional: called after a successful check-in. */
  readonly onChanged?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Action row with Check In + My Courts buttons and a live "N here now" count.
 *
 * The check-in button is one-shot only (product decision): once the player
 * is checked in, the button renders as a non-interactive "Checked In" state
 * and relies on the backend's 4-hour auto-expiry.
 *
 * The My Courts button toggles the saved state via useSaveCourt. When saved
 * it shows a filled active style; when unsaved it shows an outline style.
 */
export default function CourtActionRow({
  court,
  currentPlayerId,
  onChanged,
}: CourtActionRowProps): React.ReactNode {
  const { count, isCheckedIn, isSubmitting, checkIn } =
    useCourtCheckIn(court, currentPlayerId);

  const { isSaved, toggle: toggleSave, isSubmitting: isSaveSubmitting } =
    useSaveCourt(court, currentPlayerId, onChanged);

  const palette = usePaletteColors();

  // -------------------------------------------------------------------------
  // Check In button label + interactivity
  // -------------------------------------------------------------------------

  const checkInLabel = isCheckedIn
    ? 'Checked In'
    : isSubmitting
    ? 'Checking in...'
    : 'Check In';

  const isCheckInDisabled = isCheckedIn || isSubmitting;

  // -------------------------------------------------------------------------
  // My Courts button label + style
  // -------------------------------------------------------------------------

  const myCourtsLabel = isSaved ? 'Saved' : 'My Courts';
  const isMyCourtsDisabled = isSaveSubmitting;

  return (
    <View className="flex-row gap-3 px-4 py-4 border-b border-strong">
      {/* Check In button */}
      <View className="flex-1">
        <Pressable
          testID={`check-in-btn-${court.id}`}
          onPress={isCheckInDisabled ? undefined : () => { void checkIn(); }}
          accessibilityRole="button"
          accessibilityLabel={checkInLabel}
          accessibilityState={{ disabled: isCheckInDisabled }}
          disabled={isCheckInDisabled}
          className={`py-[14px] rounded-[10px] items-center ${
            isCheckedIn
              ? 'bg-brand-teal/20 border border-brand-teal'
              : 'bg-brand-gold active:opacity-80'
          } ${isSubmitting ? 'opacity-60' : ''}`}
        >
          <Text
            className={`font-bold text-[15px] ${
              isCheckedIn ? 'text-brand-teal' : 'text-white'
            }`}
          >
            {checkInLabel}
          </Text>
        </Pressable>

        {/* Live count badge */}
        {count > 0 && (
          <Text
            testID={`check-in-count-${court.id}`}
            className="text-[12px] text-muted text-center mt-1"
          >
            {count} here now
          </Text>
        )}
      </View>

      {/* My Courts / Saved button */}
      <Pressable
        testID={`add-court-btn-${court.id}`}
        onPress={isMyCourtsDisabled ? undefined : () => { void toggleSave(); }}
        accessibilityRole="button"
        accessibilityLabel={isSaved ? 'Remove from My Courts' : 'Add to My Courts'}
        accessibilityState={{ disabled: isMyCourtsDisabled }}
        disabled={isMyCourtsDisabled}
        className={`flex-1 py-[14px] rounded-[10px] items-center border active:opacity-80 ${
          isSaved
            ? 'bg-brand-teal/20 border-brand-teal'
            : 'border-brand-teal'
        } ${isMyCourtsDisabled ? 'opacity-60' : ''}`}
        style={isSaved ? { borderColor: palette.brandTeal } : undefined}
      >
        <Text
          className="font-semibold text-[15px] text-brand-teal"
        >
          {myCourtsLabel}
        </Text>
      </Pressable>
    </View>
  );
}
