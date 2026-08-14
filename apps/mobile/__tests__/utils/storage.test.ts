/**
 * Tests for secure storage helpers in @/utils/storage.
 *
 * expo-secure-store is mocked to verify that each wrapper delegates to the
 * correct underlying method and propagates errors to the caller.
 */
import * as SecureStore from 'expo-secure-store';
import { getItem, setItem, removeItem } from '@/utils/storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockGetItem = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockSetItem = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const mockDeleteItem = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getItem
// ---------------------------------------------------------------------------
describe('getItem', () => {
  it('returns the value from secure store for a given key', async () => {
    mockGetItem.mockResolvedValueOnce('my-token');
    const result = await getItem('access_token');
    expect(result).toBe('my-token');
    expect(mockGetItem).toHaveBeenCalledWith('access_token');
  });

  it('returns null when the key does not exist', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const result = await getItem('missing_key');
    expect(result).toBeNull();
  });

  it('propagates errors thrown by getItemAsync', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('Keychain unavailable'));
    await expect(getItem('some_key')).rejects.toThrow('Keychain unavailable');
  });

  it('calls getItemAsync exactly once per invocation', async () => {
    mockGetItem.mockResolvedValueOnce('val');
    await getItem('k');
    expect(mockGetItem).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// setItem
// ---------------------------------------------------------------------------
describe('setItem', () => {
  it('delegates to setItemAsync with the correct key and value', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await setItem('refresh_token', 'abc123');
    expect(mockSetItem).toHaveBeenCalledWith('refresh_token', 'abc123');
  });

  it('resolves without a return value on success', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await expect(setItem('k', 'v')).resolves.toBeUndefined();
  });

  it('propagates errors thrown by setItemAsync', async () => {
    mockSetItem.mockRejectedValueOnce(new Error('Storage full'));
    await expect(setItem('k', 'v')).rejects.toThrow('Storage full');
  });

  it('calls setItemAsync exactly once per invocation', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await setItem('k', 'v');
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------
describe('removeItem', () => {
  it('delegates to deleteItemAsync with the correct key', async () => {
    mockDeleteItem.mockResolvedValueOnce(undefined);
    await removeItem('access_token');
    expect(mockDeleteItem).toHaveBeenCalledWith('access_token');
  });

  it('resolves without a return value on success', async () => {
    mockDeleteItem.mockResolvedValueOnce(undefined);
    await expect(removeItem('k')).resolves.toBeUndefined();
  });

  it('propagates errors thrown by deleteItemAsync', async () => {
    mockDeleteItem.mockRejectedValueOnce(new Error('Key not found'));
    await expect(removeItem('k')).rejects.toThrow('Key not found');
  });

  it('calls deleteItemAsync exactly once per invocation', async () => {
    mockDeleteItem.mockResolvedValueOnce(undefined);
    await removeItem('k');
    expect(mockDeleteItem).toHaveBeenCalledTimes(1);
  });
});
