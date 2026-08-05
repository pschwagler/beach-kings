/**
 * ProfileInfoSection — read-only player profile fields.
 * Matches the "Player Profile" content section of profile.html wireframe.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { Pressable, View } from 'react-native';
import { formatLocation, type Player } from '@beach-kings/shared';
import { parseCalendarDate } from '@/lib/calendarDate';
import type { ProfileEditorKey } from './profileEditorModel';

interface InfoRowProps {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly required?: boolean;
  readonly isLast?: boolean;
  readonly emptyLabel: string;
  readonly onPress: () => void;
}

function InfoRow({
  label,
  value,
  required = false,
  isLast = false,
  emptyLabel,
  onPress,
}: InfoRowProps): React.ReactNode {
  const isEmpty = value == null || value === '';
  const displayValue = isEmpty ? emptyLabel : value;

  return (
    <Pressable
      testID={`profile-info-${label.toLowerCase().replace(/\s+/g, '-')}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${displayValue}`}
      className={`min-h-touch py-sm flex-row items-center active:opacity-70 ${isLast ? '' : 'border-b border-divider'}`}
    >
      <View className="flex-1 pr-sm">
        <View className="flex-row items-center gap-xs mb-xs">
          {required && isEmpty && (
            <View className="w-1.5 h-1.5 rounded-full bg-danger-fill" />
          )}
          <AppText className="text-2xs uppercase tracking-wide font-semibold text-muted">
            {label}
          </AppText>
        </View>
        <AppText
          numberOfLines={2}
          className={`text-body ${
            isEmpty
              ? required
                ? 'text-danger'
                : 'text-tertiary'
              : 'text-default'
          }`}
        >
          {displayValue}
        </AppText>
      </View>
      <AppText className="text-muted text-lg leading-none" accessibilityElementsHidden>
        {'›'}
      </AppText>
    </Pressable>
  );
}

interface ProfileInfoSectionProps {
  readonly player: Player;
  readonly onEdit: (editor: ProfileEditorKey) => void;
}

function formatHeight(height: string | null | undefined): string | null {
  if (height == null || height === '') return null;
  return height;
}

function formatEnumLabel(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatDateOfBirth(dob: string | null | undefined): string | null {
  if (dob == null) return null;
  const d = parseCalendarDate(dob);
  if (d == null) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ProfileInfoSection({ player, onEdit }: ProfileInfoSectionProps): React.ReactNode {
  const firstName = player.first_name ?? player.name?.split(' ')[0] ?? null;
  const lastName =
    player.last_name ??
    (player.name?.includes(' ') ? player.name.split(' ').slice(1).join(' ') : null);

  return (
    <View className="px-lg pt-md">
      <AppText className="text-body font-bold text-default mb-sm">
        Player Profile
      </AppText>

      <View
        testID="profile-info-list"
        className="bg-surface rounded-card px-lg overflow-hidden"
      >
        <InfoRow
          label="Name"
          value={[firstName, lastName].filter(Boolean).join(' ') || null}
          emptyLabel="Add name"
          required
          onPress={() => onEdit('name')}
        />

        <InfoRow label="Nickname" value={player.nickname} emptyLabel="Add nickname" onPress={() => onEdit('nickname')} />

        <InfoRow
          label="Gender"
          value={formatEnumLabel(player.gender)}
          emptyLabel="Add gender"
          required
          onPress={() => onEdit('gender')}
        />

        <InfoRow
          label="Date of Birth"
          value={formatDateOfBirth(player.date_of_birth)}
          emptyLabel="Add birthday"
          onPress={() => onEdit('birthday')}
        />

        <InfoRow
          label="Height"
          value={formatHeight(player.height ?? null)}
          emptyLabel="Add height"
          onPress={() => onEdit('height')}
        />

        <InfoRow
          label="Level"
          value={player.level != null ? String(player.level) : null}
          emptyLabel="Add level"
          required
          onPress={() => onEdit('level')}
        />

        <InfoRow
          label="Location"
          value={formatLocation(player.city, player.state)}
          emptyLabel="Add location"
          required
          onPress={() => onEdit('location')}
        />

        <InfoRow
          label="Preferred Side"
          value={formatEnumLabel(player.preferred_side)}
          emptyLabel="Add preferred side"
          isLast
          onPress={() => onEdit('preferredSide')}
        />
      </View>
    </View>
  );
}
