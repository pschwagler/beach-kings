/** Public Beach League destinations derived from the current deployment. */

import { PUBLIC_WEB_ORIGIN } from '@/config/publicWebOrigin';

export { PUBLIC_WEB_ORIGIN } from '@/config/publicWebOrigin';

export const PUBLIC_URLS = Object.freeze({
  terms: `${PUBLIC_WEB_ORIGIN}/terms-of-service`,
  privacy: `${PUBLIC_WEB_ORIGIN}/privacy-policy`,
  communityGuidelines: `${PUBLIC_WEB_ORIGIN}/community-guidelines`,
});
