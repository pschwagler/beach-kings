import { fetchBackend } from '../../../src/utils/server-fetch';
import CourtDetailClient from './CourtDetailClient';

/**
 * Generate dynamic SEO metadata for the court detail page.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const court = await fetchBackend(`/api/public/courts/${slug}`);
    return {
      title: `${court.name} - Beach Volleyball Court`,
      description:
        court.description ||
        `${court.name} beach volleyball court. ${court.review_count} reviews, ${court.court_count || ''} courts. ${court.address || ''}`.trim(),
      openGraph: {
        title: `${court.name} | Beach Kings`,
        description: court.description || `Beach volleyball at ${court.name}`,
        type: 'website',
      },
    };
  } catch {
    return { title: 'Court Not Found' };
  }
}

/**
 * Court detail page — server component with SSR.
 * Fetches court data by slug and passes to client component.
 */
export default async function CourtDetailPage({ params }) {
  const { slug } = await params;
  let court = null;
  try {
    court = await fetchBackend(`/api/public/courts/${slug}`);
  } catch (error) {
    console.error(`[CourtDetailPage] Failed to fetch court ${slug}:`, error.message);
  }

  return <CourtDetailClient court={court} slug={slug} />;
}
