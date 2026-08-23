import { useState, useCallback, useEffect, memo, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectItemsAtom, selectRangeAtom, moveItemAtom, resizeItemAtom, getAssetByIdAtom, volumePopupItemIdAtom, snapSettingsAtom, tracksAtom, currentFrameAtom, lipSyncVideoAtom } from '@/atoms';
import { setActiveSnapFrameAtom, setDraggingItemAtom } from '@/atoms/timeline';
import { useLanguage } from '@/hooks/useLanguage';
import { ContextMenu } from './ContextMenu';
import { MiniWaveform } from './Waveform';
import { TrimPreview } from './TrimPreview';
import type { TrackItem as TrackItemType } from '@vibee/atoms';

const FPS = 30; // Default FPS for trim preview calculations

interface TrackItemProps {
  item: TrackItemType;
  pxPerFrame: number;
  isSelected: boolean;
  isLocked?: boolean;
}

export const TrackItem = memo(function TrackItem({ item, pxPerFrame, isSelected, isLocked = false }: TrackItemProps) {
  const { t } = useLanguage();
  const selectItems = useSetAtom(selectItemsAtom);
  const selectRange = useSetAtom(selectRangeAtom);
  const moveItem = useSetAtom(moveItemAtom);
  const resizeItem = useSetAtom(resizeItemAtom);
  const getAssetById = useAtomValue(getAssetByIdAtom);
  const lipSyncVideo = useAtomValue(lipSyncVideoAtom);

  // Snap settings and atoms
  const snapSettings = useAtomValue(snapSettingsAtom);
  const tracks = useAtomValue(tracksAtom);
  const currentFrame = useAtomValue(currentFrameAtom);
  const setActiveSnapFrame = useSetAtom(setActiveSnapFrameAtom);
  const setDraggingItem = useSetAtom(setDraggingItemAtom);

  // Calculate snap points from all track items
  const snapPoints = useMemo(() => {
    const points: number[] = [0, currentFrame]; // Frame 0 and playhead
    tracks.forEach(track => {
      track.items.forEach(trackItem => {
        if (trackItem.id !== item.id) { // Exclude current item
          points.push(trackItem.startFrame);
          points.push(trackItem.startFrame + trackItem.durationInFrames);
        }
      });
    });
    return [...new Set(points)].sort((a, b) => a - b);
  }, [tracks, currentFrame, item.id]);

  // Volume popup - only need setter (popup is rendered in Timeline)
  const setVolumePopupItemId = useSetAtom(volumePopupItemIdAtom);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [initialFrame, setInitialFrame] = useState(0);
  const [initialDuration, setInitialDuration] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Trim preview state
  const [trimPreviewPos, setTrimPreviewPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [currentTrimFrame, setCurrentTrimFrame] = useState(0);
  const itemRef = useRef<HTMLDivElement>(null);

  const asset = item.assetId ? getAssetById(item.assetId) : null;
  const label = asset?.name || item.type;

  // Get item-specific props for badges
  const playbackRate = item.type === 'video' ? (item as any).playbackRate : null;
  // Show volume for video, avatar, and audio tracks (use item's own volume)
  const volume = (item.type === 'audio' || item.type === 'video' || item.type === 'avatar')
    ? (item as any).volume
    : null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      // Shift+click: range selection
      selectRange(item.id);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle selection
      selectItems({ itemIds: [item.id], addToSelection: true });
    } else {
      // Regular click: single select
      selectItems({ itemIds: [item.id], addToSelection: false });
    }
  };

  // Double-click on audio/video/avatar track opens volume popup
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.type === 'audio' || item.type === 'video' || item.type === 'avatar') {
      setVolumePopupItemId(item.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Select item if not already selected
    if (!isSelected) {
      selectItems({ itemIds: [item.id], addToSelection: false });
    }

    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Volume popup handlers - for audio, video, avatar tracks
  const handleVolumeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.type === 'audio' || item.type === 'video' || item.type === 'avatar') {
      setVolumePopupItemId(item.id);
    }
  }, [item.type, item.id, setVolumePopupItemId]);

  // Helper function to find nearest snap point
  const getSnappedFrame = useCallback((targetFrame: number, snapThreshold: number = 8): { frame: number; snapped: boolean } => {
    if (!snapSettings.enabled) {
      return { frame: targetFrame, snapped: false };
    }

    let closestFrame = targetFrame;
    let closestDistance = Infinity;

    for (const point of snapPoints) {
      const distance = Math.abs(point - targetFrame);
      if (distance < closestDistance && distance <= snapThreshold) {
        closestDistance = distance;
        closestFrame = point;
      }
    }

    return {
      frame: closestFrame,
      snapped: closestDistance <= snapThreshold
    };
  }, [snapSettings.enabled, snapPoints]);

  /**
   * Pointer, а не mouse: pointer-события покрывают и мышь, и палец, и стилус
   * одним кодом, а координата e.clientX у них одинаковая. Пока здесь были
   * только mouse-события, клип на телефоне нельзя было ни передвинуть, ни
   * подрезать — при том, что CSS уже делал вид, что тач поддержан
   * (touch-action: none на ручке глушил ещё и прокрутку в этой полосе).
   */
  const handleMouseDown = (e: React.PointerEvent, type: 'drag' | 'resize-left' | 'resize-right') => {
    e.stopPropagation();
    e.preventDefault();
    // Захват указателя: дальнейшие move/up приходят на этот же элемент, даже
    // если палец ушёл за его границы.
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* капчур не критичен: без него работают глобальные слушатели ниже */
    }

    // Prevent drag/resize if track is locked
    if (isLocked) return;

    setDragStartX(e.clientX);
    setInitialFrame(item.startFrame);
    setInitialDuration(item.durationInFrames);

    if (type === 'drag') {
      setIsDragging(true);
      setDraggingItem(true);
    } else {
      setIsResizing(type === 'resize-left' ? 'left' : 'right');
      setDraggingItem(true);
    }

    // Select item if not already selected (for drag operations)
    if (!isSelected) {
      selectItems({ itemIds: [item.id], addToSelection: false });
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX;
      const deltaFrames = Math.round(deltaX / pxPerFrame);

      // Update trim preview position
      if (isResizing) {
        setTrimPreviewPos({ x: e.clientX, y: e.clientY });
      }

      if (isDragging) {
        const rawStart = Math.max(0, initialFrame + deltaFrames);
        const { frame: newStart, snapped } = getSnappedFrame(rawStart);

        // Update active snap frame for visual indicator
        setActiveSnapFrame(snapped ? newStart : null);

        moveItem({ itemId: item.id, newStartFrame: newStart, snapSettings });
      } else if (isResizing === 'left') {
        const rawStart = Math.max(0, initialFrame + deltaFrames);
        const { frame: newStart, snapped } = getSnappedFrame(rawStart);
        const newDuration = initialDuration - (newStart - initialFrame);

        setActiveSnapFrame(snapped ? newStart : null);
        setCurrentTrimFrame(newStart);

        if (newDuration > 0) {
          moveItem({ itemId: item.id, newStartFrame: newStart, snapSettings });
          resizeItem({ itemId: item.id, newDuration });
        }
      } else if (isResizing === 'right') {
        const rawEnd = initialFrame + initialDuration + deltaFrames;
        const { frame: newEnd, snapped } = getSnappedFrame(rawEnd);
        const newDuration = Math.max(1, newEnd - initialFrame);

        setActiveSnapFrame(snapped ? newEnd : null);
        setCurrentTrimFrame(newEnd);

        resizeItem({ itemId: item.id, newDuration });
      }
    },
    [isDragging, isResizing, dragStartX, initialFrame, initialDuration, pxPerFrame, item.id, moveItem, resizeItem, getSnappedFrame, setActiveSnapFrame, snapSettings]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
    setDraggingItem(false);
    setActiveSnapFrame(null);
  }, [setDraggingItem, setActiveSnapFrame]);

  // Add/remove global event listeners for drag/resize
  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('pointermove', handleMouseMove);
      window.addEventListener('pointerup', handleMouseUp);
      window.addEventListener('pointercancel', handleMouseUp);
      return () => {
        window.removeEventListener('pointermove', handleMouseMove);
        window.removeEventListener('pointerup', handleMouseUp);
        window.removeEventListener('pointercancel', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  const colorTag = item.colorTag || 'none';

  // Drag over handlers for visual feedback when dropping to replace
  // DO NOT use stopPropagation - let parent Track receive all drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    // DO NOT call stopPropagation - let parent Track handle the drop
    // Parent Track.handleDrop detects if drop is on existing item and replaces
    setIsDragOver(false);
  }, []);

  // Check if this is a video item that can show trim preview
  // For avatar, use lipSyncVideo; for video, use asset.url
  const trimPreviewUrl = item.type === 'avatar' ? lipSyncVideo : asset?.url;
  const canShowTrimPreview = (item.type === 'video' || item.type === 'avatar') && trimPreviewUrl;

  return (
    <div
      ref={itemRef}
      className={`track-item ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''} ${isDragOver ? 'drag-replace' : ''}`}
      data-type={item.type}
      data-color={colorTag}
      style={{
        left: item.startFrame * pxPerFrame,
        width: item.durationInFrames * pxPerFrame,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={(e) => handleMouseDown(e, 'drag')}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Color tag stripe */}
      {colorTag !== 'none' && <div className="track-item-color-tag" />}

      {/* Left resize handle */}
      <div
        className="track-item-handle left"
        onPointerDown={(e) => handleMouseDown(e, 'resize-left')}
      />

      {/* Thumbnail for video/avatar tracks */}
      {(item.type === 'video' || item.type === 'avatar') && (asset?.url || (item.type === 'avatar' && lipSyncVideo)) && (
        <div
          className="track-item-thumbnail"
          style={{
            // For avatar tracks, prefer lipSyncVideoAtom (synced with sidebar) over asset.url
            backgroundImage: `url(${item.type === 'avatar' ? lipSyncVideo : asset?.url})`,
          }}
        />
      )}

      {/* Audio waveform visualization */}
      {item.type === 'audio' && (
        <div className="track-item-waveform">
          <MiniWaveform
            width={Math.max(20, item.durationInFrames * pxPerFrame - 16)}
            height={32}
            color="currentColor"
            progress={0}
          />
        </div>
      )}

      {/* Content */}
      <div className="track-item-content">{label}</div>

      {/* Badges */}
      <div className="track-item-badges">
        {playbackRate !== null && playbackRate !== 1 && (
          <span className={`track-badge speed ${playbackRate > 1 ? 'fast' : 'slow'}`}>
            {playbackRate}x
          </span>
        )}
        {volume !== null && (
          <span
            className={`track-badge volume clickable ${volume === 0 ? 'muted' : ''}`}
            onClick={handleVolumeClick}
            title={t('track.clickToAdjustVolume')}
          >
            {volume === 0 ? '🔇' : `${Math.round(volume * 100)}%`}
          </span>
        )}
      </div>

      {/* Right resize handle */}
      <div
        className="track-item-handle right"
        onPointerDown={(e) => handleMouseDown(e, 'resize-right')}
      />

      {/* Context Menu */}
      {contextMenu && createPortal(
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          itemId={item.id}
          onClose={closeContextMenu}
        />,
        document.body
      )}

      {/* Trim Preview - shows frame preview while resizing video clips */}
      {isResizing && canShowTrimPreview && trimPreviewUrl && createPortal(
        <TrimPreview
          videoUrl={trimPreviewUrl}
          frameTime={currentTrimFrame / FPS}
          x={trimPreviewPos.x}
          y={trimPreviewPos.y}
          visible={true}
        />,
        document.body
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal re-renders
  // Note: musicVolume comes from Jotai atom, not props, so component re-renders automatically
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLocked === nextProps.isLocked &&
    prevProps.pxPerFrame === nextProps.pxPerFrame &&
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.startFrame === nextProps.item.startFrame &&
    prevProps.item.durationInFrames === nextProps.item.durationInFrames &&
    prevProps.item.assetId === nextProps.item.assetId &&
    prevProps.item.colorTag === nextProps.item.colorTag
  );
});
