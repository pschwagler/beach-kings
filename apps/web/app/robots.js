/**
 * Next.js robots.txt generation via App Router convention.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots() {
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
