/**
 * Tests for the API client singleton in @/lib/api.
 *
 * The module is thin — it wires together expo-secure-store and the shared
 * @beach-kings/api-client package.  These tests verify:
 *
 *   1. The exported `api` object has the expected shape (key methods present).
 *   2. `EXPO_PUBLIC_API_URL` controls the base URL passed to `createApiClient`.
 *   3. The default fallback base URL is used when the env var is absent.
 *   4. MobileStorageAdapter is constructed with the SecureStore module.
 *   5. Construction is lazy — deferred until the first property access on `api`.
 */

// ---------------------------------------------------------------------------
// Mocks — declared before any import that reaches for these modules.
// ---------------------------------------------------------------------------

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockApiObject = {
  setAuthTokens: jest.fn(),
  clearAuthTokens: jest.fn(),
  getStoredTokens: jest.fn(),
  login: jest.fn(),
  signup: jest.fn(),
  logout: jest.fn(),
  getPlayers: jest.fn(),
  healthCheck: jest.fn(),
};

const mockCreateApiClient = jest.fn((..._args: unknown[]) => mockApiObject);
const mockMobileStorageAdapterInstance = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
const MockMobileStorageAdapter = jest.fn(
  (..._args: unknown[]) => mockMobileStorageAdapterInstance,
);

jest.mock('@beach-kings/api-client', () => ({
  createApiClient: (...args: unknown[]) => mockCreateApiClient(...args),
  MobileStorageAdapter: (...args: unknown[]) => {
    MockMobileStorageAdapter(...args);
    return mockMobileStorageAdapterInstance;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Re-requires @/lib/api inside an isolated module registry so each test can
 * control environment variables independently.
 */
function loadApiModule(): { api: typeof mockApiObject } {
  let mod: { api: typeof mockApiObject } | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('@/lib/api');
  });
  return mod!;
}

/**
 * Touches the proxy to force lazy construction. The api singleton is built
 * on first property access, so assertions on createApiClient/MobileStorageAdapter
 * call counts must follow a proxy access.
 */
function triggerApiConstruction(api: typeof mockApiObject): void {
  void api.setAuthTokens;
}

// ---------------------------------------------------------------------------
// Shape of the exported singleton
// ---------------------------------------------------------------------------
describe('api singleton', () => {
  beforeEach(() => {
    mockCreateApiClient.mockClear();
    MockMobileStorageAdapter.mockClear();
  });

  it('is defined after module load', () => {
    const { api } = loadApiModule();
    expect(api).toBeDefined();
  });

  it('exposes setAuthTokens', () => {
    const { api } = loadApiModule();
    expect(typeof api.setAuthTokens).toBe('function');
  });

  it('exposes clearAuthTokens', () => {
    const { api } = loadApiModule();
    expect(typeof api.clearAuthTokens).toBe('function');
  });

  it('exposes getStoredTokens', () => {
    const { api } = loadApiModule();
    expect(typeof api.getStoredTokens).toBe('function');
  });

  it('forwards property access to the value returned by createApiClient', () => {
    const { api } = loadApiModule();
    expect(api.setAuthTokens).toBe(mockApiObject.setAuthTokens);
    expect(api.login).toBe(mockApiObject.login);
  });
});

// ---------------------------------------------------------------------------
// createApiClient is called with the correct base URL
// ---------------------------------------------------------------------------
describe('base URL resolution', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    mockCreateApiClient.mockClear();
    MockMobileStorageAdapter.mockClear();
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL;
    } else {
      process.env.EXPO_PUBLIC_API_URL = ORIGINAL_ENV;
    }
  });

  it('uses EXPO_PUBLIC_API_URL when set', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.beachleague.app';
    const { api } = loadApiModule();
    triggerApiConstruction(api);
    expect(mockCreateApiClient).toHaveBeenCalledWith(
      'https://api.beachleague.app',
      expect.anything(),
    );
  });

  it('falls back to http://localhost:8000 when EXPO_PUBLIC_API_URL is unset', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { api } = loadApiModule();
    triggerApiConstruction(api);
    expect(mockCreateApiClient).toHaveBeenCalledWith(
      'http://localhost:8000',
      expect.anything(),
    );
  });

  it('falls back to http://localhost:8000 when EXPO_PUBLIC_API_URL is an empty string', () => {
    process.env.EXPO_PUBLIC_API_URL = '';
    const { api } = loadApiModule();
    triggerApiConstruction(api);
    expect(mockCreateApiClient).toHaveBeenCalledWith(
      'http://localhost:8000',
      expect.anything(),
    );
  });

  it('calls createApiClient exactly once per module load', () => {
    const { api } = loadApiModule();
    triggerApiConstruction(api);
    triggerApiConstruction(api);
    triggerApiConstruction(api);
    expect(mockCreateApiClient).toHaveBeenCalledTimes(1);
  });

  it('does not construct the client until the proxy is accessed', () => {
    loadApiModule();
    expect(mockCreateApiClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// MobileStorageAdapter wiring
// ---------------------------------------------------------------------------
describe('MobileStorageAdapter wiring', () => {
  beforeEach(() => {
    mockCreateApiClient.mockClear();
    MockMobileStorageAdapter.mockClear();
  });

  it('constructs MobileStorageAdapter once per module load', () => {
    const { api } = loadApiModule();
    triggerApiConstruction(api);
    triggerApiConstruction(api);
    expect(MockMobileStorageAdapter).toHaveBeenCalledTimes(1);
  });

  it('passes the adapter instance to createApiClient as the second argument', () => {
    const { api } = loadApiModule();
    triggerApiConstruction(api);
    expect(mockCreateApiClient).toHaveBeenCalledWith(
      expect.any(String),
      mockMobileStorageAdapterInstance,
    );
  });
});
