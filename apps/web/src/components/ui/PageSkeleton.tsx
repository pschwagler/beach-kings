import './Skeletons.css';

/**
 * Full-page loading skeleton for Suspense fallbacks.
 * Shows a centered shimmer animation instead of plain "Loading..." text.
 */
export default function PageSkeleton(): React.ReactNode {
  return (
    <div className="page-skeleton" role="status" aria-label="Loading page">
      <div className="page-skeleton__bar" aria-hidden="true" />
      <div className="page-skeleton__bar page-skeleton__bar--short" aria-hidden="true" />
      <div className="page-skeleton__bar page-skeleton__bar--medium" aria-hidden="true" />
    </div>
  );
}
