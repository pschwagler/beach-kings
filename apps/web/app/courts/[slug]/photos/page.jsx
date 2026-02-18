import { fetchBackend } from '../../../../src/utils/server-fetch';
import CourtPhotosClient from './CourtPhotosClient';

/**
 * Generate SEO metadata for the court photos page.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const court = await fetchBackend(`/api/public/courts/${slug}`);
    return {
      title: `Photos - ${court.name}`,
      description: `Browse all photos of ${court.name} beach volleyball court.`,
    };
  } catch {
    return { title: 'Court Photos' };
  }
}

/**
 * Court photos page — server component with SSR.
 * Fetches court data and passes to client for full photo grid + upload.
 */
export default async function CourtPhotosPage({ params }) {
  const { slug } = await params;
  let court = null;
  try {
    court = await fetchBackend(`/api/public/courts/${slug}`);
  } catch (error) {
    console.error(`[CourtPhotosPage] Failed to fetch court ${slug}:`, error.message);
  }

  return <CourtPhotosClient court={court} slug={slug} />;
}
