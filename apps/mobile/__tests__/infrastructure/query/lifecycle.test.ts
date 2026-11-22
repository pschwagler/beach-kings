import NetInfo from '@react-native-community/netinfo';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import {
  createQueryClient,
  subscribeQueryLifecycle,
} from '@/infrastructure/query/client';

jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));

const remove = jest.fn();
let unsubscribe: (() => void) | undefined;
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
  jest.mocked(NetInfo.addEventListener).mockReturnValue(jest.fn());
  onlineManager.setOnline(false);
});
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('development iOS simulator can fetch even when NetInfo previously reported offline', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  unsubscribe = subscribeQueryLifecycle();
  expect(onlineManager.isOnline()).toBe(true);
  expect(NetInfo.addEventListener).not.toHaveBeenCalled();
  const client = createQueryClient();
  const fetchStatus = jest.fn().mockResolvedValue({ status: 'COMPLETED' });
  await expect(
    client.fetchQuery({ queryKey: ['test-job'], queryFn: fetchStatus }),
  ).resolves.toEqual({ status: 'COMPLETED' });
  expect(fetchStatus).toHaveBeenCalledTimes(1);
  client.clear();
});

test.each(['physical iOS device', 'Android', 'release iOS simulator'])(
  '%s retains network-driven pause and resume',
  (target) => {
    jest.replaceProperty(
      Platform,
      'OS',
      target === 'Android' ? 'android' : 'ios',
    );
    if (target === 'physical iOS device')
      jest.replaceProperty(Device, 'isDevice', true);
    if (target === 'release iOS simulator')
      jest.replaceProperty(
        global as unknown as { __DEV__: boolean },
        '__DEV__',
        false,
      );
    const stopNetwork = jest.fn();
    jest.mocked(NetInfo.addEventListener).mockReturnValue(stopNetwork);
    unsubscribe = subscribeQueryLifecycle();
    const onNetwork = jest.mocked(NetInfo.addEventListener).mock.calls[0][0];
    onNetwork({ isConnected: false, isInternetReachable: false } as any);
    expect(onlineManager.isOnline()).toBe(false);
    onNetwork({ isConnected: true, isInternetReachable: true } as any);
    expect(onlineManager.isOnline()).toBe(true);
    unsubscribe();
    unsubscribe = undefined;
    expect(stopNetwork).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalled();
  },
);
