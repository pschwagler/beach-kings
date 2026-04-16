/**
 * Tests for haptic feedback helpers in @/utils/haptics.
 *
 * expo-haptics is mocked to verify that each wrapper calls the correct
 * underlying API and silently absorbs hardware errors.
 */
import * as Haptics from 'expo-haptics';
import {
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticSuccess,
  hapticError,
} from '@/utils/haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Error: 'Error',
    Warning: 'Warning',
  },
}));

const mockImpactAsync = Haptics.impactAsync as jest.MockedFunction<typeof Haptics.impactAsync>;
const mockNotificationAsync = Haptics.notificationAsync as jest.MockedFunction<typeof Haptics.notificationAsync>;

beforeEach(() => {
  jest.clearAllMocks();
  mockImpactAsync.mockResolvedValue();
  mockNotificationAsync.mockResolvedValue();
});

// ---------------------------------------------------------------------------
// hapticLight
// ---------------------------------------------------------------------------
describe('hapticLight', () => {
  it('calls impactAsync with Light style', async () => {
    await hapticLight();
    expect(mockImpactAsync).toHaveBeenCalledTimes(1);
    expect(mockImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('resolves without throwing when impactAsync rejects', async () => {
    mockImpactAsync.mockRejectedValueOnce(new Error('Haptics unavailable'));
    await expect(hapticLight()).resolves.toBeUndefined();
  });

  it('does not propagate hardware errors', async () => {
    mockImpactAsync.mockRejectedValueOnce(new Error('Not supported'));
    await hapticLight();
    // No assertion needed — if the above line throws, the test fails automatically.
  });
});

// ---------------------------------------------------------------------------
// hapticMedium
// ---------------------------------------------------------------------------
describe('hapticMedium', () => {
  it('calls impactAsync with Medium style', async () => {
    await hapticMedium();
    expect(mockImpactAsync).toHaveBeenCalledTimes(1);
    expect(mockImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('resolves without throwing when impactAsync rejects', async () => {
    mockImpactAsync.mockRejectedValueOnce(new Error('Haptics unavailable'));
    await expect(hapticMedium()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hapticHeavy
// ---------------------------------------------------------------------------
describe('hapticHeavy', () => {
  it('calls impactAsync with Heavy style', async () => {
    await hapticHeavy();
    expect(mockImpactAsync).toHaveBeenCalledTimes(1);
    expect(mockImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
  });

  it('resolves without throwing when impactAsync rejects', async () => {
    mockImpactAsync.mockRejectedValueOnce(new Error('Haptics unavailable'));
    await expect(hapticHeavy()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hapticSuccess
// ---------------------------------------------------------------------------
describe('hapticSuccess', () => {
  it('calls notificationAsync with Success type', async () => {
    await hapticSuccess();
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('does not call impactAsync', async () => {
    await hapticSuccess();
    expect(mockImpactAsync).not.toHaveBeenCalled();
  });

  it('resolves without throwing when notificationAsync rejects', async () => {
    mockNotificationAsync.mockRejectedValueOnce(new Error('Haptics unavailable'));
    await expect(hapticSuccess()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hapticError
// ---------------------------------------------------------------------------
describe('hapticError', () => {
  it('calls notificationAsync with Error type', async () => {
    await hapticError();
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('does not call impactAsync', async () => {
    await hapticError();
    expect(mockImpactAsync).not.toHaveBeenCalled();
  });

  it('resolves without throwing when notificationAsync rejects', async () => {
    mockNotificationAsync.mockRejectedValueOnce(new Error('Haptics unavailable'));
    await expect(hapticError()).resolves.toBeUndefined();
  });
});
