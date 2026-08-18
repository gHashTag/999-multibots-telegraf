import { BRAND_COLORS, BG_COLORS } from '@vibee/atoms';
import './ProgressRing.css';

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  showPercentage?: boolean;
  children?: React.ReactNode;
}

export function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 4,
  color = BRAND_COLORS.amber,
  backgroundColor = BG_COLORS.secondary,
  showPercentage = false,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="progress-ring__svg">
        {/* Background circle */}
        <circle
          className="progress-ring__background"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          className="progress-ring__progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: 'stroke-dashoffset 0.3s ease-out',
          }}
        />
      </svg>
      <div className="progress-ring__content">
        {children ?? (showPercentage && <span>{Math.round(progress)}%</span>)}
      </div>
    </div>
  );
}

// Indeterminate spinner variant
interface SpinnerRingProps {
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export function SpinnerRing({
  size = 48,
  strokeWidth = 4,
  color = BRAND_COLORS.amber,
}: SpinnerRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  return (
    <div className="spinner-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="spinner-ring__svg">
        <circle
          className="spinner-ring__circle"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.75}
        />
      </svg>
    </div>
  );
}
