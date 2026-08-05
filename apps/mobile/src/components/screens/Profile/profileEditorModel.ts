import type { Player, PlayerGender, SkillLevel } from '@beach-kings/shared';
import { formatLocation } from '@beach-kings/shared';
import type { LocationWithDistance } from '@/lib/useLocationAutoSelect';
import {
  birthdayDisplayToIso,
  profileBirthdaySchema,
  profileGenderSchema,
  profileHeightSchema,
  profileLevelSchema,
  profileLocationSchema,
  profileNameSchema,
  profileNicknameSchema,
  profilePreferredSideSchema,
} from '@/lib/validators';
import { isoBirthdayToDisplay } from './profileFormOptions';

export type ProfileEditorKey =
  | 'name'
  | 'nickname'
  | 'gender'
  | 'birthday'
  | 'height'
  | 'level'
  | 'location'
  | 'preferredSide';

export interface ProfileEditorDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly nickname: string;
  readonly gender: string;
  readonly dateOfBirth: string;
  readonly height: string;
  readonly level: string;
  readonly city: string;
  readonly locationId: string;
  readonly preferredSide: string;
}

export const PROFILE_EDITOR_TITLES: Record<ProfileEditorKey, string> = {
  name: 'Name',
  nickname: 'Nickname',
  gender: 'Gender',
  birthday: 'Birthday',
  height: 'Height',
  level: 'Skill Level',
  location: 'Location',
  preferredSide: 'Preferred Side',
};

export function profileDraftFromPlayer(player: Player): ProfileEditorDraft {
  const nameParts = (player.full_name ?? player.name ?? '').trim().split(/\s+/);
  return {
    firstName: player.first_name ?? nameParts[0] ?? '',
    lastName: player.last_name ?? nameParts.slice(1).join(' '),
    nickname: player.nickname ?? '',
    gender: player.gender ?? '',
    dateOfBirth: isoBirthdayToDisplay(player.date_of_birth),
    height: player.height ?? '',
    level: player.level ?? '',
    city: formatLocation(player.city, player.state) ?? '',
    locationId: player.location_id ?? '',
    preferredSide: player.preferred_side ?? '',
  };
}

export function validateProfileEditor(
  editor: ProfileEditorKey,
  draft: ProfileEditorDraft,
): string | null {
  const result = (() => {
    switch (editor) {
      case 'name':
        return profileNameSchema.safeParse(draft);
      case 'nickname':
        return profileNicknameSchema.safeParse(draft);
      case 'gender':
        return profileGenderSchema.safeParse(draft);
      case 'birthday':
        return profileBirthdaySchema.safeParse(draft);
      case 'height':
        return profileHeightSchema.safeParse(draft);
      case 'level':
        return profileLevelSchema.safeParse(draft);
      case 'location':
        return profileLocationSchema.safeParse(draft);
      case 'preferredSide':
        return profilePreferredSideSchema.safeParse(draft);
    }
  })();
  return result.success ? null : result.error.issues[0]?.message ?? 'Check this value.';
}

export function buildProfileEditorPayload(
  editor: ProfileEditorKey,
  draft: ProfileEditorDraft,
  locations: readonly LocationWithDistance[] = [],
): Partial<Player> {
  switch (editor) {
    case 'name': {
      const firstName = draft.firstName.trim();
      const lastName = draft.lastName.trim();
      return {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
      };
    }
    case 'nickname':
      return { nickname: draft.nickname.trim() || null };
    case 'gender':
      return { gender: draft.gender as PlayerGender };
    case 'birthday':
      return {
        date_of_birth: draft.dateOfBirth.trim()
          ? birthdayDisplayToIso(draft.dateOfBirth.trim())
          : null,
      };
    case 'height':
      return { height: draft.height.trim() || null };
    case 'level':
      return { level: draft.level as SkillLevel };
    case 'location': {
      const location = locations.find((item) => String(item.id) === draft.locationId);
      const typedCity = draft.city.trim();
      return {
        city: typedCity.split(',')[0]?.trim() ?? typedCity,
        state: location?.state ?? null,
        location_id: draft.locationId,
      };
    }
    case 'preferredSide':
      return { preferred_side: draft.preferredSide || null };
  }
}
