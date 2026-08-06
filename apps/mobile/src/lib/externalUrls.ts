import { Alert, Linking } from 'react-native';

const LINK_ERROR_TITLE = 'Unable to open link';
const LINK_ERROR_MESSAGE = 'This court does not have a valid web link.';

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Open a stored court link only when it is a supported HTTP(S) URL. */
export async function openHttpUrl(value: string): Promise<boolean> {
  if (!isHttpUrl(value)) {
    Alert.alert(LINK_ERROR_TITLE, LINK_ERROR_MESSAGE);
    return false;
  }

  try {
    if (!(await Linking.canOpenURL(value))) {
      Alert.alert(LINK_ERROR_TITLE, LINK_ERROR_MESSAGE);
      return false;
    }
    await Linking.openURL(value);
    return true;
  } catch {
    Alert.alert(LINK_ERROR_TITLE, LINK_ERROR_MESSAGE);
    return false;
  }
}
