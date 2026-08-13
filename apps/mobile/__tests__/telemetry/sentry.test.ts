const mockInit = jest.fn();
const mockSetUser = jest.fn();
const mockSetTag = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@sentry/react-native', () => ({
  init: mockInit,
  setUser: mockSetUser,
  setTag: mockSetTag,
  captureException: mockCaptureException,
  wrap: (component: unknown) => component,
}));

describe('Sentry privacy boundary', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const originalEnvironment = process.env.EXPO_PUBLIC_APP_ENV;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    if (originalDsn == null) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    if (originalEnvironment == null) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = originalEnvironment;
  });

  it('is disabled unless a DSN is configured', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    require('@/telemetry/sentry');

    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      attachScreenshot: false,
      attachViewHierarchy: false,
      attachThreads: false,
      enableAutoSessionTracking: true,
      enableCaptureFailedRequests: false,
      enableAutoPerformanceTracing: false,
      enableLogs: false,
      sendClientReports: false,
    }));
    expect(mockInit.mock.calls[0][0]).not.toHaveProperty('tracesSampleRate');
  });

  it('enables only for a valid HTTPS public-key DSN', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'not-a-dsn';
    let telemetry = require('@/telemetry/sentry');
    expect(telemetry.normalizeSentryDsn('not-a-dsn')).toBeUndefined();
    expect(mockInit).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));

    jest.resetModules();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/123';
    telemetry = require('@/telemetry/sentry');
    expect(telemetry.normalizeSentryDsn(process.env.EXPO_PUBLIC_SENTRY_DSN)).toBe(
      'https://public@example.ingest.sentry.io/123',
    );
    expect(mockInit).toHaveBeenLastCalledWith(expect.objectContaining({
      dsn: 'https://public@example.ingest.sentry.io/123',
      enabled: true,
    }));

    expect(
      telemetry.normalizeSentryDsn('https://public:secret@example.ingest.sentry.io/123'),
    ).toBeUndefined();
  });

  it('removes content, contact data, request data, and arbitrary context', () => {
    const { scrubSentryEvent } = require('@/telemetry/sentry');
    const scrubbed = scrubSentryEvent({
      message: 'private message body',
      request: { headers: { authorization: 'Bearer secret' }, data: 'private body' },
      breadcrumbs: [{ message: 'invite code and exact location' }],
      extra: { email: 'private@example.com', photo_url: 'https://private/photo' },
      user: { id: 'user:42', email: 'private@example.com', ip_address: '127.0.0.1' },
      tags: { route: '/games', email: 'private@example.com' },
      contexts: { os: { name: 'iOS' }, response: { data: 'private body' } },
      exception: {
        values: [{
          type: 'TypeError',
          value: 'private message body',
          mechanism: {
            type: 'generic',
            handled: true,
            data: { target: 'private@example.com' },
          },
          stacktrace: {
            frames: [{
              filename: 'MessageThreadScreen.tsx',
              function: 'sendMessage',
              lineno: 42,
              colno: 7,
              abs_path: '/Users/private/repo/MessageThreadScreen.tsx',
              context_line: 'sendMessage(privateMessage)',
              vars: { privateMessage: 'secret body' },
            }],
          },
        }],
      },
    });

    expect(scrubbed).toEqual(expect.objectContaining({
      user: { id: 'user:42' },
      tags: { route: '/games' },
      contexts: { os: { name: 'iOS' } },
      exception: {
        values: [{
          type: 'TypeError',
          mechanism: expect.objectContaining({ type: 'generic', handled: true }),
          stacktrace: {
            frames: [{
              filename: 'MessageThreadScreen.tsx',
              function: 'sendMessage',
              module: undefined,
              platform: undefined,
              lineno: 42,
              colno: 7,
              in_app: undefined,
              instruction_addr: undefined,
              addr_mode: undefined,
              debug_id: undefined,
            }],
            frames_omitted: undefined,
          },
        }],
      },
    }));
    expect(scrubbed).not.toHaveProperty('message');
    expect(scrubbed).not.toHaveProperty('request');
    expect(scrubbed).not.toHaveProperty('breadcrumbs');
    expect(scrubbed).not.toHaveProperty('extra');
    expect(scrubbed.exception?.values?.[0]?.mechanism).not.toHaveProperty('data');
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).not.toHaveProperty(
      'vars',
    );
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).not.toHaveProperty(
      'context_line',
    );
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).not.toHaveProperty(
      'abs_path',
    );
  });

  it('publishes only an internal user ID and the current route', () => {
    const {
      normalizeTelemetryRoute,
      setTelemetryRoute,
      setTelemetryUser,
    } = require('@/telemetry/sentry');

    setTelemetryUser(42);
    setTelemetryRoute('/player/42/private-name');
    setTelemetryUser(null);

    expect(mockSetUser).toHaveBeenNthCalledWith(1, { id: 'user:42' });
    expect(normalizeTelemetryRoute('/league/12/spring-league')).toBe('/league/:id');
    expect(normalizeTelemetryRoute('/league/12/invite')).toBe('/league/:id/invite');
    expect(normalizeTelemetryRoute('/kob/private-code')).toBe('/kob/:id');
    expect(normalizeTelemetryRoute('/tournament/81')).toBe('/tournament/:id');
    expect(mockSetTag).toHaveBeenCalledWith('route', '/player/:id');
    expect(mockSetUser).toHaveBeenNthCalledWith(2, null);
  });
});
