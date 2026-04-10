import './Skeletons.css';

/**
 * Full-page loading skeleton for Suspense fallbacks.
 * Shows a centered shimmer animation instead of plain "Loading..." text.
 */
export default function PageSkeleton(): React.ReactNode {
  return (
    <div className="page-skeleton">
      <div className="page-skeleton__bar" />
      <div className="page-skeleton__bar page-skeleton__bar--short" />
      <div className="page-skeleton__bar page-skeleton__bar--medium" />
    </div>
  );
}
