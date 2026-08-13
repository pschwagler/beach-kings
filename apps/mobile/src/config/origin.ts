interface ResolveOriginOptions {
  readonly configuredValue: string | undefined;
  readonly developmentDefault?: string;
  readonly environmentVariable: string;
  readonly isDevelopment: boolean;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]'
  );
}

function isPrivateIpv4Hostname(hostname: string): boolean {
  const octets = hostname.split('.');
  if (
    octets.length !== 4 ||
    octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)
  ) {
    return false;
  }

  const [first, second] = octets.map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function configuredHostname(value: string): string | null {
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(value)?.[1];
  if (!authority) return null;

  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (hostAndPort.startsWith('[')) {
    const closingBracket = hostAndPort.indexOf(']');
    return closingBracket === -1
      ? null
      : hostAndPort.slice(0, closingBracket + 1).toLowerCase();
  }
  return hostAndPort.split(':', 1)[0].toLowerCase();
}

/** Resolve a bundle-time HTTP(S) origin with the same policy across services. */
export function resolveConfiguredOrigin({
  configuredValue,
  developmentDefault,
  environmentVariable,
  isDevelopment,
}: ResolveOriginOptions): string {
  const value = configuredValue?.trim() || developmentDefault;
  if (!value) {
    throw new Error(
      `${environmentVariable} is required for production builds.`,
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${environmentVariable} must be a valid absolute URL.`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${environmentVariable} must use HTTPS.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      `${environmentVariable} must be an origin without credentials, query, or fragment.`,
    );
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`${environmentVariable} must not include a path.`);
  }

  const isLoopback = isLoopbackHostname(url.hostname);
  const originalHostname = configuredHostname(value);
  const isPrivateIpv4 =
    originalHostname === url.hostname &&
    isPrivateIpv4Hostname(originalHostname);
  if (isLoopback && !isDevelopment) {
    throw new Error(
      `${environmentVariable} cannot use localhost in production.`,
    );
  }
  if (
    url.protocol !== 'https:' &&
    !(isDevelopment && (isLoopback || isPrivateIpv4))
  ) {
    throw new Error(`${environmentVariable} must use HTTPS.`);
  }

  return url.origin;
}
