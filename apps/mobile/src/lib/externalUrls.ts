import { Alert, Linking } from 'react-native';

import { PUBLIC_WEB_ORIGIN } from '@/config/publicWebOrigin';

const LINK_ERROR_TITLE = 'Unable to open link';
const LINK_ERROR_MESSAGE = 'This court does not have a valid web link.';
const WEB_LINK_ERROR_MESSAGE = 'This page could not be opened on this device.';
const PUBLIC_WEB_PROTOCOL = new URL(PUBLIC_WEB_ORIGIN).protocol;

export function isExternalUrl(
  value: string,
  allowedProtocols: readonly string[],
): boolean {
  try {
    const parsed = new URL(value);
    if (!allowedProtocols.includes(parsed.protocol)) return false;
    return parsed.protocol === 'mailto:'
      ? parsed.pathname.length > 0
      : parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isHttpUrl(value: string): boolean {
  return isExternalUrl(value, ['https:', 'http:']);
}

export function isPublicWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === PUBLIC_WEB_ORIGIN && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Validate and delegate an external URL to the operating system. */
export async function tryOpenExternalUrl(
  value: string,
  allowedProtocols: readonly string[],
): Promise<boolean> {
  if (!isExternalUrl(value, allowedProtocols)) return false;

  try {
    if (!(await Linking.canOpenURL(value))) return false;
    await Linking.openURL(value);
    return true;
  } catch {
    return false;
  }
}

/** Open a stored court link only when it is a supported HTTP(S) URL. */
export async function openHttpUrl(value: string): Promise<boolean> {
  if (!(await tryOpenExternalUrl(value, ['https:', 'http:']))) {
    Alert.alert(LINK_ERROR_TITLE, LINK_ERROR_MESSAGE);
    return false;
  }

  return true;
}

/** Open a trusted first-party web page with consistent failure behavior. */
export async function openPublicWebUrl(value: string): Promise<boolean> {
  if (
    !isPublicWebUrl(value) ||
    !(await tryOpenExternalUrl(value, [PUBLIC_WEB_PROTOCOL]))
  ) {
    Alert.alert(LINK_ERROR_TITLE, WEB_LINK_ERROR_MESSAGE);
    return false;
  }

  return true;
}
