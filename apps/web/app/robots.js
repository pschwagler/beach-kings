/**
 * Next.js robots.txt generation via App Router convention.
 * Blocks all crawling in staging (dev environment).
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots() {
  if (process.env.ENV === 'staging') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/home', '/admin-view', '/profile', '/api/'],
      },
    ],
    sitemap: 'https://beachleaguevb.com/sitemap.xml',
  };
}
