import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { Player } from '@beach-kings/shared';
import { useProfilePhotoActions } from '@/components/screens/Profile/useProfilePhotoActions';

const mockUpload = jest.fn();
const mockDelete = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@/features/player', () => ({
  usePlayerProfileMutations: () => ({
    uploadAvatar: { isPending: false, mutateAsync: mockUpload },
    deleteAvatar: { isPending: false, mutateAsync: mockDelete },
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock('@/utils/haptics', () => ({ hapticSuccess: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'images' },
  launchImageLibraryAsync: jest.fn(),
}));

const player: Player = { id: 5, name: 'Ada Vega', profile_picture_url: null };

describe('useProfilePhotoActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true });
  });

  it('opens the picker directly when no photo exists and treats cancellation as a no-op', async () => {
    const { result } = renderHook(() => useProfilePhotoActions(player));
    await act(async () => { result.current.onPhotoPress(); });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects oversized files without uploading', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///large.jpg', fileSize: 6 * 1024 * 1024 }],
    });
    const { result } = renderHook(() => useProfilePhotoActions(player));
    await act(async () => { result.current.onPhotoPress(); });
    expect(mockShowToast).toHaveBeenCalledWith('Choose a photo smaller than 5 MB.', 'error');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('shows replacement and removal actions for an existing photo', () => {
    const withPhoto = { ...player, profile_picture_url: 'https://example.com/a.jpg' };
    const { result } = renderHook(() => useProfilePhotoActions(withPhoto));
    act(() => { result.current.onPhotoPress(); });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Profile Photo',
      undefined,
      expect.arrayContaining([
        expect.objectContaining({ text: 'Choose New Photo' }),
        expect.objectContaining({ text: 'Remove Photo', style: 'destructive' }),
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
      ]),
    );
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('reports a failed replacement without claiming success', async () => {
    const withPhoto = {
      ...player,
      profile_picture_url: 'https://example.com/old.jpg',
    };
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///replacement.jpg',
          fileName: 'replacement.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
        },
      ],
    });
    mockUpload.mockRejectedValueOnce(new Error('network unavailable'));
    const { result } = renderHook(() => useProfilePhotoActions(withPhoto));

    act(() => {
      result.current.onPhotoPress();
    });
    const actions = (Alert.alert as jest.Mock).mock.calls[0]?.[2];
    const chooseReplacement = actions?.find(
      (action: { text?: string }) => action.text === 'Choose New Photo',
    );
    await act(async () => {
      await chooseReplacement?.onPress?.();
    });

    expect(mockShowToast).toHaveBeenCalledWith('network unavailable', 'error');
    expect(mockShowToast).not.toHaveBeenCalledWith('Profile photo updated.', 'success');
  });
});
