import './Skeleton.css';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  width,
  height,
  borderRadius,
  className = '',
  variant = 'rectangular',
  animation = 'pulse',
}: SkeletonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'text':
        return { borderRadius: 4, height: height ?? '1em', width: width ?? '100%' };
      case 'circular':
        return { borderRadius: '50%', width: width ?? 40, height: height ?? 40 };
      case 'rounded':
        return { borderRadius: borderRadius ?? 8, width, height };
      default:
        return { borderRadius: borderRadius ?? 0, width, height };
    }
  };

  const styles = getVariantStyles();

  return (
    <div
      className={`skeleton skeleton--${animation} ${className}`}
      style={{
        width: styles.width,
        height: styles.height,
        borderRadius: styles.borderRadius,
      }}
    />
  );
}

// Preset skeleton components
export function SkeletonAssetCard() {
  return (
    <div className="skeleton-asset-card">
      <Skeleton variant="rounded" height={56} borderRadius={8} />
      <div className="skeleton-asset-card__info">
        <Skeleton variant="text" width="80%" height={12} />
        <Skeleton variant="text" width="40%" height={10} />
      </div>
    </div>
  );
}

export function SkeletonAssetGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="skeleton-asset-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonAssetCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTrackItem({ width = 120 }: { width?: number }) {
  return (
    <div className="skeleton-track-item" style={{ width }}>
      <Skeleton variant="rounded" height="100%" borderRadius={4} />
    </div>
  );
}

export function SkeletonTimeline() {
  return (
    <div className="skeleton-timeline">
      <div className="skeleton-track">
        <Skeleton variant="text" width={60} height={16} />
        <div className="skeleton-track__items">
          <SkeletonTrackItem width={100} />
          <SkeletonTrackItem width={80} />
        </div>
      </div>
      <div className="skeleton-track">
        <Skeleton variant="text" width={60} height={16} />
        <div className="skeleton-track__items">
          <SkeletonTrackItem width={150} />
        </div>
      </div>
    </div>
  );
}
