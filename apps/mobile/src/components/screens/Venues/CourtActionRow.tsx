/**
 * CourtActionRow — primary action buttons for the Court Detail screen.
 *
 * Renders:
 *   - "Check In" primary button (one-shot; no check-out).
 *     - While submitting: shows "Checking in..." and is non-interactive.
 *     - Already checked in: shows "Checked In" disabled state.
 *   - Live "N here now" count badge when at least one player is checked in,
 *     followed by a breakdown row per level/gender group.
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
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import { useCourtCheckIn } from './useCourtCheckIn';
import { useSaveCourt } from './useSaveCourt';
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { CheckInBreakdownItem, Court } from '@beach-kings/shared';

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
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Formats a single breakdown item into a human-readable label.
 * Null level or gender is rendered as "Unspecified".
 */
function formatBreakdownLabel(item: CheckInBreakdownItem): string {
  const level = item.level ?? 'Unspecified';
  const gender = item.gender ?? 'Unspecified';
  return `${level} · ${gender}`;
}

/**
 * Renders a small row of breakdown chips beneath the "N here now" badge.
 * Each chip shows "Level · Gender · Count".
 */
function CheckInBreakdown({
  breakdown,
}: {
  readonly breakdown: readonly CheckInBreakdownItem[];
}): React.ReactNode {
  if (breakdown.length === 0) return null;

  return (
    <View
      testID="check-in-breakdown"
      className="flex-row flex-wrap gap-1 mt-1 justify-center"
    >
      {breakdown.map((item, index) => (
        <View
          key={`${item.level ?? 'unspecified'}:${item.gender ?? 'unspecified'}`}
          testID={`check-in-breakdown-chip-${index}`}
          className="flex-row items-center px-2 py-0.5 rounded-full bg-surface border border-strong"
        >
          <AppText className="text-[11px] text-muted">
            {`${formatBreakdownLabel(item)} · ${item.count}`}
          </AppText>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Action row with Check In + My Courts buttons and a live "N here now" count
 * with level/gender breakdown.
 *
 * The check-in button is one-shot only (product decision): once the player
 * is checked in this session, the button renders as a non-interactive
 * "Checked In" state and relies on the backend's 4-hour auto-expiry.
 *
 * The My Courts button toggles the saved state via useSaveCourt. When saved
 * it shows a filled active style; when unsaved it shows an outline style.
 */
export default function CourtActionRow({
  court,
  currentPlayerId,
  onChanged,
}: CourtActionRowProps): React.ReactNode {
  const { total, breakdown, isCheckedIn, isSubmitting, checkIn } =
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
      {/* Check In button + live count + breakdown */}
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
              ? 'bg-info-tint border border-brand-teal'
              : 'bg-brand-gold active:opacity-80'
          } ${isSubmitting ? 'opacity-60' : ''}`}
        >
          <AppText
            className={`font-bold text-[15px] ${
              isCheckedIn ? 'text-brand-teal' : 'text-on-brand-gold'
            }`}
          >
            {checkInLabel}
          </AppText>
        </Pressable>

        {/* Live count badge */}
        {total > 0 && (
          <AppText
            testID={`check-in-count-${court.id}`}
            className="text-[12px] text-muted text-center mt-1"
          >
            {total} here now
          </AppText>
        )}

        {/* Level/gender breakdown chips */}
        {total > 0 && <CheckInBreakdown breakdown={breakdown} />}
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
            ? 'bg-info-tint border-brand-teal'
            : 'border-brand-teal'
        } ${isMyCourtsDisabled ? 'opacity-60' : ''}`}
        style={isSaved ? { borderColor: palette.brandTeal } : undefined}
      >
        <AppText
          className="font-semibold text-[15px] text-brand-teal"
        >
          {myCourtsLabel}
        </AppText>
      </Pressable>
    </View>
  );
}
