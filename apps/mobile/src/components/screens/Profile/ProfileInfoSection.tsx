/**
 * ProfileInfoSection — read-only player profile fields.
 * Matches the "Player Profile" content section of profile.html wireframe.
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { Player } from '@beach-kings/shared';

interface InfoRowProps {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly placeholder?: string;
  readonly required?: boolean;
}

function InfoRow({ label, value, placeholder, required = false }: InfoRowProps): React.ReactNode {
  const isEmpty = value == null || value === '';
  return (
    <View className="mb-md">
      <View className="flex-row items-center gap-xs mb-1">
        {required && isEmpty && (
          <View className="w-1.5 h-1.5 rounded-full bg-danger" />
        )}
        <Text className="text-2xs uppercase tracking-wide font-semibold text-muted">
          {label}
        </Text>
      </View>
      <View
        className={`rounded-xl px-md py-sm border ${
          required && isEmpty
            ? 'bg-danger-tint border-danger/30'
            : 'bg-surface border-divider'
        }`}
      >
        <Text
          className={`text-sm ${
            isEmpty ? 'text-muted italic' : 'text-default'
          }`}
        >
          {isEmpty ? (placeholder ?? 'Not set') : value}
        </Text>
      </View>
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

function formatDateOfBirth(dob: string | null | undefined): string | null {
  if (dob == null) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
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
      <Text className="text-base font-bold text-default mb-md">
        Player Profile
      </Text>

      <View className="flex-row gap-sm">
        <View className="flex-1">
          <InfoRow label="First Name" value={firstName} />
        </View>
        <View className="flex-1">
          <InfoRow label="Last Name" value={lastName} />
        </View>
      </View>

      <InfoRow label="Nickname" value={player.nickname} placeholder="Add a nickname" />

      <InfoRow
        label="Gender"
        value={
          player.gender != null
            ? player.gender.charAt(0).toUpperCase() + player.gender.slice(1)
            : null
        }
        placeholder="Select gender"
        required
      />

      <InfoRow
        label="Date of Birth"
        value={formatDateOfBirth(player.date_of_birth)}
        placeholder="Add date of birth"
      />

      <InfoRow
        label="Height"
        value={formatHeight(player.height ?? null)}
        placeholder="Add height"
      />

      <InfoRow
        label="Level"
        value={player.level != null ? String(player.level) : null}
        placeholder="Select your level"
        required
      />

      <InfoRow
        label="Location"
        value={
          player.city != null && player.state != null
            ? `${player.state} - ${player.city}`
            : player.city ?? player.state ?? null
        }
        placeholder="Select your region"
        required
      />

      <InfoRow
        label="Preferred Side"
        value={player.preferred_side ?? null}
        placeholder="Left or right?"
      />
    </View>
  );
}
