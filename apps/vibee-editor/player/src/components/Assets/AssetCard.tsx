import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Play, Music, Image, Video, Sparkles, User } from 'lucide-react';
import { toAbsoluteUrl } from '@/lib/mediaUrl';
import { BRAND_COLORS, type Asset } from '@vibee/atoms';
import './AssetCard.css';

// Asset type configuration
export type AssetCategory = 'all' | 'video' | 'audio' | 'image' | 'avatar' | 'text' | 'fx';

export const ASSET_TYPE_CONFIG: Record<string, { color: string; icon: typeof Video; label: string }> = {
  video: { color: BRAND_COLORS.amber, icon: Video, label: 'Video' },
  audio: { color: '#10b981', icon: Music, label: 'Audio' },
  image: { color: '#ec4899', icon: Image, label: 'Image' },
  avatar: { color: BRAND_COLORS.amber, icon: User, label: 'Avatar' },
  text: { color: '#8b5cf6', icon: Sparkles, label: 'Text' },
  fx: { color: '#f97316', icon: Sparkles, label: 'FX' },
};

interface AssetCardProps {
  asset: Asset;
  size?: 'compact' | 'normal';
  thumbnail?: string;
  onDragStart?: (e: React.DragEvent, asset: Asset) => void;
  onClick?: (asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
}

// Format duration in MM:SS format
function formatDuration(frames: number, fps: number = 30): string {
  const totalSeconds = Math.floor(frames / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const AssetCard = memo(function AssetCard({
  asset,
  size = 'compact',
  thumbnail,
  onDragStart,
  onClick,
  onDoubleClick,
}: AssetCardProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const config = ASSET_TYPE_CONFIG[asset.type] || ASSET_TYPE_CONFIG.video;
  const TypeIcon = config.icon;
  const assetUrl = toAbsoluteUrl(asset.url);
  const isBlobUrl = asset.url.startsWith('blob:');

  // Video hover preview
  useEffect(() => {
    if (asset.type === 'video' && videoRef.current) {
      if (isHovering && !isDragging) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isHovering, isDragging, asset.type]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';

    // Create custom drag image
    const dragEl = e.currentTarget.cloneNode(true) as HTMLElement;
    dragEl.style.transform = 'scale(1.05)';
    dragEl.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
    dragEl.style.position = 'absolute';
    dragEl.style.top = '-9999px';
    document.body.appendChild(dragEl);
    e.dataTransfer.setDragImage(dragEl, 50, 44);
    setTimeout(() => document.body.removeChild(dragEl), 0);

    onDragStart?.(e, asset);
  }, [asset, onDragStart]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    onClick?.(asset);
  }, [asset, onClick]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(asset);
  }, [asset, onDoubleClick]);

  return (
    <div
      className={`asset-card-unified ${size} ${isDragging ? 'dragging' : ''} ${isBlobUrl ? 'blob-warning' : ''}`}
      style={{ '--asset-color': config.color } as React.CSSProperties}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      title={asset.name}
    >
      {/* Type badge */}
      <div className="asset-card-badge" style={{ backgroundColor: config.color }}>
        <TypeIcon size={10} />
      </div>

      {/* Thumbnail / Preview */}
      <div className="asset-card-preview">
        {asset.type === 'video' && isHovering && !isDragging ? (
          <video
            ref={videoRef}
            src={assetUrl}
            muted
            loop
            playsInline
            className="asset-card-video"
          />
        ) : asset.type === 'video' && thumbnail ? (
          <img src={thumbnail} alt={asset.name} className="asset-card-img" loading="lazy" />
        ) : asset.type === 'image' ? (
          <img src={assetUrl} alt={asset.name} className="asset-card-img" loading="lazy" />
        ) : asset.type === 'audio' ? (
          <div className="asset-card-audio-icon">
            <Music size={24} />
          </div>
        ) : (
          <div className="asset-card-placeholder">
            <TypeIcon size={20} />
          </div>
        )}

        {/* Duration badge for video/audio */}
        {asset.duration && (
          <span className="asset-card-duration">
            {formatDuration(asset.duration)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="asset-card-info">
        <span className="asset-card-name">{asset.name}</span>
        <span className="asset-card-type">{config.label}</span>
      </div>
    </div>
  );
});

export default AssetCard;
