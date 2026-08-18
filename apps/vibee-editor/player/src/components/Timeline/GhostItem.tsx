// ===============================
// GhostItem Component
// Preview of item placement on timeline
// ===============================

import { memo } from 'react';
import type { GhostPreview } from '@/atoms/timeline';

interface GhostItemProps {
  preview: GhostPreview;
  pxPerFrame: number;
}

export const GhostItem = memo(function GhostItem({ preview, pxPerFrame }: GhostItemProps) {
  return (
    <div
      className={`ghost-item ghost-item--${preview.type}`}
      style={{
        left: preview.startFrame * pxPerFrame,
        width: preview.durationInFrames * pxPerFrame,
      }}
    />
  );
});
