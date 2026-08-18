import './Skeleton.css';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  className?: string;
  variant?: 'rectangular' | 'circular' | 'text';
}

export function Skeleton({
  width,
  height,
  borderRadius,
  className = '',
  variant = 'rectangular',
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: variant === 'circular'
      ? '50%'
      : typeof borderRadius === 'number'
        ? `${borderRadius}px`
        : borderRadius,
  };

  return (
    <div
      className={`skeleton ${variant} ${className}`}
      style={style}
    />
  );
}

// Preset components for common use cases
export function SkeletonAvatar({ size = 48 }: { size?: number }) {
  return <Skeleton width={size} height={size} variant="circular" />;
}

export function SkeletonText({
  width = '100%',
  height = 16,
  lines = 1,
}: {
  width?: number | string;
  height?: number;
  lines?: number;
}) {
  if (lines === 1) {
    return <Skeleton width={width} height={height} borderRadius={4} variant="text" />;
  }

  return (
    <div className="skeleton-text-lines">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '70%' : '100%'}
          height={height}
          borderRadius={4}
          variant="text"
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <Skeleton height={200} borderRadius={8} />
      <div className="skeleton-card-content">
        <div className="skeleton-card-header">
          <SkeletonAvatar size={40} />
          <div className="skeleton-card-meta">
            <SkeletonText width="60%" />
            <SkeletonText width="40%" height={12} />
          </div>
        </div>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}
