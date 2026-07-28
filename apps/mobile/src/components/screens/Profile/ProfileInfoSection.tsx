/**
 * ProfileInfoSection — read-only player profile fields.
 * Matches the "Player Profile" content section of profile.html wireframe.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { formatLocation, type Player } from '@beach-kings/shared';
import { parseCalendarDate } from '@/lib/calendarDate';

interface InfoRowProps {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly required?: boolean;
  readonly isLast?: boolean;
}

function InfoRow({
  label,
  value,
  required = false,
  isLast = false,
}: InfoRowProps): React.ReactNode {
  const isEmpty = value == null || value === '';
  const displayValue = isEmpty
    ? required
      ? 'Required information missing'
      : 'Not provided'
    : value;

  return (
    <View
      testID={`profile-info-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`py-md ${isLast ? '' : 'border-b border-divider'}`}
    >
      <View className="flex-row items-center gap-xs mb-xs">
        {required && isEmpty && (
          <View className="w-1.5 h-1.5 rounded-full bg-danger" />
        )}
        <Text className="text-2xs uppercase tracking-wide font-semibold text-muted">
          {label}
        </Text>
      </View>
      <Text
        className={`text-body ${
          isEmpty
            ? required
              ? 'text-danger'
              : 'text-tertiary'
            : 'text-default'
        }`}
      >
        {displayValue}
      </Text>
    </View>
  );
}

interface ProfileInfoSectionProps {
  readonly player: Player;
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

export default function ProfileInfoSection({ player }: ProfileInfoSectionProps): React.ReactNode {
  const firstName = player.first_name ?? player.name?.split(' ')[0] ?? null;
  const lastName =
    player.last_name ??
    (player.name?.includes(' ') ? player.name.split(' ').slice(1).join(' ') : null);

  return (
    <View className="px-lg pt-md">
      <Text className="text-body font-bold text-default mb-sm">
        Player Profile
      </Text>

      <View
        testID="profile-info-list"
        className="bg-surface rounded-card px-lg overflow-hidden"
      >
        <View className="flex-row gap-sm">
          <View className="flex-1">
            <InfoRow label="First Name" value={firstName} />
          </View>
          <View className="flex-1">
            <InfoRow label="Last Name" value={lastName} />
          </View>
        </View>

        <InfoRow label="Nickname" value={player.nickname} />

        <InfoRow
          label="Gender"
          value={formatEnumLabel(player.gender)}
          required
        />

        <InfoRow
          label="Date of Birth"
          value={formatDateOfBirth(player.date_of_birth)}
        />

        <InfoRow
          label="Height"
          value={formatHeight(player.height ?? null)}
        />

        <InfoRow
          label="Level"
          value={player.level != null ? String(player.level) : null}
          required
        />

        <InfoRow
          label="Location"
          value={formatLocation(player.city, player.state)}
          required
        />

        <InfoRow
          label="Preferred Side"
          value={formatEnumLabel(player.preferred_side)}
          isLast
        />
      </View>
    </View>
  );
}
