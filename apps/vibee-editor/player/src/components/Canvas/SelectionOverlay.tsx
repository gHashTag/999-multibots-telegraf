import { useCallback, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  selectedItemIdsAtom,
  currentFrameAtom,
  updateItemAtom,
  tracksAtom,
  projectAtom,
  selectItemsAtom,
} from '@/atoms';
import { getLayoutDimensions, type VideoLayout } from '@compositions/SplitTalkingHead';
import type { TrackItem } from '@vibee/atoms';
import './SelectionOverlay.css';

interface ItemBounds {
  item: TrackItem;
  x: number;
  y: number;
  width: number;
  height: number;
}

const HANDLE_SIZE = 10;

function DragHandle({ bound, onMove, onResize }: {
  bound: ItemBounds;
  onMove: (totalDx: number, totalDy: number) => void;
  onResize: (corner: string, totalDx: number, totalDy: number) => void;
}) {
  const getZoom = useCallback((target: HTMLElement) => {
    const wrapper = target.closest('.canvas-player-wrapper');
    if (!wrapper) return 1;
    const rect = wrapper.getBoundingClientRect();
    return rect.width / 1080;
  }, []);

  const handleMoveDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const zoom = getZoom(e.target as HTMLElement);
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (ev: MouseEvent) => {
      const totalDx = (ev.clientX - startX) / zoom;
      const totalDy = (ev.clientY - startY) / zoom;
      onMove(totalDx, totalDy);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onMove, getZoom]);

  const handleResizeDown = useCallback((corner: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const zoom = getZoom(e.target as HTMLElement);
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (ev: MouseEvent) => {
      const totalDx = (ev.clientX - startX) / zoom;
      const totalDy = (ev.clientY - startY) / zoom;
      onResize(corner, totalDx, totalDy);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onResize, getZoom]);

  const corners = [
    { id: 'top-left', cursor: 'nwse-resize' },
    { id: 'top-right', cursor: 'nesw-resize' },
    { id: 'bottom-left', cursor: 'nesw-resize' },
    { id: 'bottom-right', cursor: 'nwse-resize' },
  ];

  return (
    <>
      {/* Bounding box - drag to move */}
      <div
        className="selection-box"
        style={{
          left: bound.x,
          top: bound.y,
          width: bound.width,
          height: bound.height,
        }}
        onMouseDown={handleMoveDown}
      />

      {/* Corner resize handles */}
      {corners.map(({ id, cursor }) => {
        const isLeft = id.includes('left');
        const isTop = id.includes('top');
        return (
          <div
            key={id}
            className="resize-handle"
            style={{
              left: (isLeft ? bound.x : bound.x + bound.width) - HANDLE_SIZE / 2,
              top: (isTop ? bound.y : bound.y + bound.height) - HANDLE_SIZE / 2,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              cursor,
            }}
            onMouseDown={handleResizeDown(id)}
          />
        );
      })}
    </>
  );
}

export function SelectionOverlay() {
  const selectedItemIds = useAtomValue(selectedItemIdsAtom);
  const currentFrame = useAtomValue(currentFrameAtom);
  const tracks = useAtomValue(tracksAtom);
  const project = useAtomValue(projectAtom);
  const updateItem = useSetAtom(updateItemAtom);
  const selectItems = useSetAtom(selectItemsAtom);

  // Compute bounds for all visible video items at current frame
  const visibleItemBounds = useMemo(() => {
    const bounds: ItemBounds[] = [];
    const videoTrack = tracks.find(t => t.type === 'video');
    if (!videoTrack) return bounds;

    for (const item of videoTrack.items) {
      const endFrame = item.startFrame + item.durationInFrames;
      if (currentFrame >= item.startFrame && currentFrame < endFrame) {
        const layout = ((item as any).layout as VideoLayout) || 'top-half';
        const dims = getLayoutDimensions(layout, project.width, project.height);
        bounds.push({
          item,
          x: dims.bRoll.left + (item.x || 0),
          y: dims.bRoll.top + (item.y || 0),
          width: item.width !== project.width ? item.width : dims.bRoll.width,
          height: item.height !== project.height ? item.height : dims.bRoll.height,
        });
      }
    }
    return bounds;
  }, [tracks, currentFrame, project]);

  // Filter to selected items only
  const selectedBounds = useMemo(() => {
    const ids = new Set(selectedItemIds);
    return visibleItemBounds.filter(b => ids.has(b.item.id));
  }, [visibleItemBounds, selectedItemIds]);

  // Move handler: receives TOTAL delta from drag start
  // startX/startY are captured at render time and stay stable during drag
  const handleMove = useCallback((itemId: string, startX: number, startY: number) =>
    (totalDx: number, totalDy: number) => {
      updateItem({
        itemId,
        updates: {
          x: Math.round(startX + totalDx),
          y: Math.round(startY + totalDy),
        },
      });
    }, [updateItem]);

  // Resize handler: receives TOTAL delta from drag start
  const handleResize = useCallback((itemId: string, startWidth: number, startHeight: number, startX: number, startY: number) =>
    (corner: string, totalDx: number, totalDy: number) => {
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startX;
      let newY = startY;

      if (corner.includes('right')) newWidth = Math.max(50, startWidth + totalDx);
      if (corner.includes('left')) {
        newWidth = Math.max(50, startWidth - totalDx);
        newX = startX + totalDx;
      }
      if (corner.includes('bottom')) newHeight = Math.max(50, startHeight + totalDy);
      if (corner.includes('top')) {
        newHeight = Math.max(50, startHeight - totalDy);
        newY = startY + totalDy;
      }

      updateItem({
        itemId,
        updates: {
          width: Math.round(newWidth),
          height: Math.round(newHeight),
          x: Math.round(newX),
          y: Math.round(newY),
        },
      });
    }, [updateItem]);

  if (visibleItemBounds.length === 0) return null;

  return (
    <div className="selection-overlay">
      {/* Clickable hit areas for all visible items (click to select) */}
      {visibleItemBounds.map(bound => {
        const isSelected = selectedItemIds.includes(bound.item.id);
        return (
          <div
            key={`hit-${bound.item.id}`}
            className={`item-hit-area ${isSelected ? 'selected' : ''}`}
            style={{
              left: bound.x,
              top: bound.y,
              width: bound.width,
              height: bound.height,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              const addToSelection = e.shiftKey || e.metaKey;
              selectItems({ itemIds: [bound.item.id], addToSelection });
            }}
          />
        );
      })}

      {/* Drag handles for selected items */}
      {selectedBounds.map(bound => (
        <DragHandle
          key={bound.item.id}
          bound={bound}
          onMove={handleMove(bound.item.id, bound.item.x || 0, bound.item.y || 0)}
          onResize={handleResize(bound.item.id, bound.width, bound.height, bound.item.x || 0, bound.item.y || 0)}
        />
      ))}
    </div>
  );
}
