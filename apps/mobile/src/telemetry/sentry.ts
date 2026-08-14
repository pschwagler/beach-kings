import * as Sentry from '@sentry/react-native';
import type { ErrorEvent } from '@sentry/react-native';

const SAFE_CONTEXTS = new Set(['app', 'device', 'os', 'react_native_context', 'runtime']);
const SAFE_TAGS = new Set(['environment', 'release', 'dist', 'route']);
const DYNAMIC_ROUTE_ROOTS = new Set([
  'court',
  'invite',
  'kob',
  'league',
  'messages',
  'player',
  'session',
  'tournament',
]);
const ALLOWED_ENVIRONMENTS = new Set(['development', 'preview', 'production']);
const SAFE_DYNAMIC_ROUTE_SUFFIXES = new Set([
  'edit',
  'invite',
  'photos',
  'roster',
  'suggest-edit',
]);

function keepKeys<T>(
  source: Record<string, T> | undefined,
  allowed: ReadonlySet<string>,
): Record<string, T> | undefined {
  if (source == null) return undefined;
  const entries = Object.entries(source).filter(([key]) => allowed.has(key));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Strict outbound allowlist. Error types and stack frames are useful for
 * diagnosis; arbitrary values, content, request data, and breadcrumbs are not.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    exception: event.exception == null
      ? undefined
      : {
          values: event.exception.values?.map((value) => ({
            type: value.type,
            mechanism: value.mechanism == null
              ? undefined
              : {
                  type: value.mechanism.type,
                  handled: value.mechanism.handled,
                  synthetic: value.mechanism.synthetic,
                  source: value.mechanism.source,
                  is_exception_group: value.mechanism.is_exception_group,
                  exception_id: value.mechanism.exception_id,
                  parent_id: value.mechanism.parent_id,
                },
            stacktrace: value.stacktrace == null
              ? undefined
              : {
                  frames: value.stacktrace.frames?.map((frame) => ({
                    filename: frame.filename,
                    function: frame.function,
                    module: frame.module,
                    platform: frame.platform,
                    lineno: frame.lineno,
                    colno: frame.colno,
                    in_app: frame.in_app,
                    instruction_addr: frame.instruction_addr,
                    addr_mode: frame.addr_mode,
                    debug_id: frame.debug_id,
                  })),
                  frames_omitted: value.stacktrace.frames_omitted,
                },
          })),
        },
    user: event.user?.id == null ? undefined : { id: String(event.user.id) },
    tags: keepKeys(event.tags, SAFE_TAGS),
    contexts: keepKeys(event.contexts, SAFE_CONTEXTS),
  };
}

export function normalizeSentryDsn(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (candidate == null || candidate === '') return undefined;

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username === '' ||
      parsed.password !== '' ||
      parsed.pathname === '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function telemetryEnvironment(value: string | undefined): string {
  const candidate = value?.trim();
  if (candidate != null && ALLOWED_ENVIRONMENTS.has(candidate)) return candidate;
  return __DEV__ ? 'development' : 'production';
}

const dsn = normalizeSentryDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);
const environment = telemetryEnvironment(process.env.EXPO_PUBLIC_APP_ENV);

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: () => null,
  maxBreadcrumbs: 0,
  enableAutoPerformanceTracing: false,
  enableNativeFramesTracking: false,
  enableAppStartTracking: false,
  enableStallTracking: false,
  enableUserInteractionTracing: false,
  // Release-health sessions provide crash-free rates without interaction data.
  enableAutoSessionTracking: true,
  enableCaptureFailedRequests: false,
  enableLogs: false,
  sendClientReports: false,
  attachThreads: false,
  attachScreenshot: false,
  attachViewHierarchy: false,
});

export function setTelemetryUser(userId: number | null): void {
  Sentry.setUser(userId == null ? null : { id: `user:${userId}` });
}

export function normalizeTelemetryRoute(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const dynamicRootIndex = segments.findIndex((segment) =>
    DYNAMIC_ROUTE_ROOTS.has(segment),
  );
  if (dynamicRootIndex >= 0 && segments.length > dynamicRootIndex + 1) {
    const safeSuffixes = segments
      .slice(dynamicRootIndex + 2)
      .filter((segment) => SAFE_DYNAMIC_ROUTE_SUFFIXES.has(segment));
    return `/${[
      ...segments.slice(0, dynamicRootIndex + 1),
      ':id',
      ...safeSuffixes,
    ].join('/')}`;
  }
  return `/${segments
    .map((segment) => (/^\d+$/.test(segment) ? ':id' : segment))
    .join('/')}`;
}

export function setTelemetryRoute(route: string): void {
  Sentry.setTag('route', normalizeTelemetryRoute(route));
}

export function captureOperationalError(error: unknown): void {
  Sentry.captureException(error);
}
