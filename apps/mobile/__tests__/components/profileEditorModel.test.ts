import type { Player } from '@beach-kings/shared';
import {
  buildProfileEditorPayload,
  profileDraftFromPlayer,
  validateProfileEditor,
} from '@/components/screens/Profile/profileEditorModel';

const player = {
  id: 4,
  name: 'Ada Vega',
  first_name: 'Ada',
  last_name: 'Vega',
  nickname: 'Ace',
  gender: 'female',
  level: 'Open',
  city: 'Brooklyn',
  state: 'NY',
  location_id: '9',
  height: '5 ft 10 in',
  preferred_side: 'left',
} satisfies Player;

describe('profileEditorModel', () => {
  it('initializes every focused editor from current player data', () => {
    expect(profileDraftFromPlayer(player)).toEqual({
      firstName: 'Ada',
      lastName: 'Vega',
      nickname: 'Ace',
      gender: 'female',
      height: '5 ft 10 in',
      level: 'Open',
      city: 'Brooklyn, NY',
      locationId: '9',
      preferredSide: 'left',
    });
  });

  it('builds isolated grouped name and location payloads', () => {
    const draft = profileDraftFromPlayer(player);
    expect(buildProfileEditorPayload('name', { ...draft, firstName: ' Ada ', lastName: ' King ' })).toEqual({
      first_name: 'Ada',
      last_name: 'King',
      full_name: 'Ada King',
    });
    expect(buildProfileEditorPayload('location', draft, [
      { id: '9', city: 'Brooklyn', state: 'NY', name: 'Brooklyn' },
    ])).toEqual({ city: 'Brooklyn', state: 'NY', location_id: '9' });
  });

  it.each([
    ['nickname', 'nickname', { nickname: null }],
    ['height', 'height', { height: null }],
    ['preferredSide', 'preferredSide', { preferred_side: null }],
  ] as const)('serializes a cleared optional %s value as null', (editor, field, payload) => {
    const draft = { ...profileDraftFromPlayer(player), [field]: '' };
    expect(buildProfileEditorPayload(editor, draft)).toEqual(payload);
  });

  it('blocks blank required values', () => {
    const draft = profileDraftFromPlayer(player);
    expect(validateProfileEditor('name', { ...draft, firstName: ' ' })).toBe(
      'First name is required.',
    );
    expect(validateProfileEditor('location', { ...draft, locationId: '' })).toBe(
      'Please select a location.',
    );
  });
});
