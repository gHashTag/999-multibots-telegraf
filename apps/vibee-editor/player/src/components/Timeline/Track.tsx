import { useState, useCallback, memo, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectedItemIdsAtom, addItemAtom, updateItemAtom, lipSyncVideoAtom, backgroundMusicAtom, snapSettingsAtom, tracksAtom } from '@/atoms';
import { ghostPreviewAtom, setActiveSnapFrameAtom } from '@/atoms/timeline';
import { TrackItem } from './TrackItem';
import { GhostItem } from './GhostItem';
import type { Track as TrackType, Asset } from '@vibee/atoms';
import { DEFAULT_AVATAR_CONFIG, DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms';

// Calculate snap points from all track items and current frame
function getSnapPoints(tracks: TrackType[], currentFrame: number): number[] {
  const points = new Set<number>();
  points.add(0); // Start of timeline
  points.add(currentFrame); // Playhead

  tracks.forEach(track => {
    track.items.forEach(item => {
      points.add(item.startFrame); // Item start
      points.add(item.startFrame + item.durationInFrames); // Item end
    });
  });

  return Array.from(points).sort((a, b) => a - b);
}

// Find nearest snap point within threshold
function findSnapPoint(frame: number, snapPoints: number[], threshold: number): number | null {
  for (const point of snapPoints) {
    if (Math.abs(frame - point) <= threshold) {
      return point;
    }
  }
  return null;
}

interface TrackProps {
  track: TrackType;
  pxPerFrame: number;
}

export const Track = memo(function Track({ track, pxPerFrame }: TrackProps) {
  const selectedItemIds = useAtomValue(selectedItemIdsAtom);
  const addItem = useSetAtom(addItemAtom);
  const updateItem = useSetAtom(updateItemAtom);
  const setLipSyncVideo = useSetAtom(lipSyncVideoAtom);
  const setBackgroundMusic = useSetAtom(backgroundMusicAtom);
  const ghostPreview = useAtomValue(ghostPreviewAtom);
  const setGhostPreview = useSetAtom(ghostPreviewAtom);
  const snapSettings = useAtomValue(snapSettingsAtom);
  const allTracks = useAtomValue(tracksAtom);
  const setActiveSnapFrame = useSetAtom(setActiveSnapFrameAtom);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragAssetRef = useRef<Asset | null>(null);

  // Check if ghost should be shown on this track
  const showGhost = ghostPreview && ghostPreview.trackId === track.id;

  // Check if asset type is compatible with this track
  const isAssetCompatible = useCallback((asset: Asset): boolean => {
    return (
      (track.type === 'video' && (asset.type === 'video' || asset.type === 'image')) ||
      (track.type === 'audio' && asset.type === 'audio') ||
      (track.type === 'avatar' && asset.type === 'video') ||
      (track.type === 'image' && asset.type === 'image')
    );
  }, [track.type]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);

    // Capture asset data on enter (can access in enter event)
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        dragAssetRef.current = JSON.parse(data);
      }
    } catch {
      // May fail in some browsers
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);

    // Try to get asset data from drag event
    let asset = dragAssetRef.current;
    if (!asset) {
      try {
        const data = e.dataTransfer.getData('application/json');
        if (data) {
          asset = JSON.parse(data);
          dragAssetRef.current = asset;
        }
      } catch {
        // Can't access data during dragover in some browsers
      }
    }

    // Calculate drop frame position
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let dropFrame = Math.max(0, Math.round(x / pxPerFrame));

    // Apply snapping if enabled
    if (snapSettings.enabled) {
      const snapPoints = getSnapPoints(allTracks, 0); // Use 0 for currentFrame during drag
      const snapThreshold = 10; // frames
      const snapPoint = findSnapPoint(dropFrame, snapPoints, snapThreshold);
      if (snapPoint !== null) {
        dropFrame = snapPoint;
        setActiveSnapFrame(snapPoint);
      } else {
        setActiveSnapFrame(null);
      }
    }

    // Update ghost preview
    const assetType = asset?.type || 'video';
    const duration = asset?.duration || 150;

    // Only show ghost on compatible tracks
    if (!asset || isAssetCompatible(asset)) {
      setGhostPreview({
        trackId: track.id,
        startFrame: dropFrame,
        durationInFrames: duration,
        type: assetType as 'video' | 'audio' | 'image' | 'avatar',
      });
    }
  }, [pxPerFrame, snapSettings.enabled, allTracks, track.id, setGhostPreview, setActiveSnapFrame, isAssetCompatible]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the track entirely, not entering a child
    const relatedTarget = e.relatedTarget as Element;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return;
    }
    setIsDragOver(false);
    dragAssetRef.current = null;
    setGhostPreview(null);
    setActiveSnapFrame(null);
  }, [setGhostPreview, setActiveSnapFrame]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    dragAssetRef.current = null;
    setGhostPreview(null);
    setActiveSnapFrame(null);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const asset: Asset = JSON.parse(data);

      // Calculate drop position in frames
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let dropFrame = Math.max(0, Math.round(x / pxPerFrame));

      // Apply snapping if enabled
      if (snapSettings.enabled) {
        const snapPoints = getSnapPoints(allTracks, 0);
        const snapThreshold = 10;
        const snapPoint = findSnapPoint(dropFrame, snapPoints, snapThreshold);
        if (snapPoint !== null) {
          dropFrame = snapPoint;
        }
      }

      // Check if asset type matches track type
      const isCompatible = isAssetCompatible(asset);

      if (!isCompatible) {
        console.warn(`Asset type "${asset.type}" not compatible with track "${track.name}"`);
        // Flash red to indicate rejection
        e.currentTarget.classList.add('drop-rejected');
        setTimeout(() => e.currentTarget.classList.remove('drop-rejected'), 300);
        return;
      }

      // Check if dropping on an existing item - REPLACE instead of ADD
      const existingItem = track.items.find(
        (item) =>
          dropFrame >= item.startFrame &&
          dropFrame < item.startFrame + item.durationInFrames
      );

      if (existingItem) {
        // REPLACE: Update existing item's asset
        console.log(`Replacing ${existingItem.id} with ${asset.name}`);
        updateItem({ itemId: existingItem.id, updates: { assetId: asset.id } });

        // Update lipSyncVideoAtom if this is avatar track
        if (track.type === 'avatar' && asset.url) {
          console.log(`[Track] Avatar video changed to: ${asset.url}`);
          setLipSyncVideo(asset.url);
        }

        // Update backgroundMusicAtom if this is audio track
        if (track.type === 'audio' && asset.url) {
          console.log(`[Track] Background music changed to: ${asset.url}`);
          setBackgroundMusic(asset.url);
        }
        return;
      }

      // ADD NEW: Create item based on asset type
      const itemType = asset.type === 'image' ? 'image' : track.type;

      addItem({
        trackId: track.id,
        itemData: {
          type: itemType as any,
          assetId: asset.id,
          startFrame: dropFrame,
          durationInFrames: asset.duration || 150, // Default 5 seconds at 30fps
          x: 0,
          y: 0,
          width: asset.width || DEFAULT_WIDTH,
          height: asset.height || DEFAULT_HEIGHT,
          rotation: 0,
          opacity: 1,
          ...(itemType === 'video' && { volume: 1, playbackRate: 1 }),
          ...(itemType === 'audio' && { volume: 1 }),
          ...(itemType === 'avatar' && {
            circleSizePercent: DEFAULT_AVATAR_CONFIG.circleSizePercent,
            circleBottomPercent: DEFAULT_AVATAR_CONFIG.circleBottomPercent,
            circleLeftPercent: DEFAULT_AVATAR_CONFIG.circleLeftPercent,
          }),
        },
      });

      // Update lipSyncVideoAtom if this is avatar track
      if (track.type === 'avatar' && asset.url) {
        console.log(`[Track] Avatar video set to: ${asset.url}`);
        setLipSyncVideo(asset.url);
      }

      // Update backgroundMusicAtom if this is audio track
      if (track.type === 'audio' && asset.url) {
        console.log(`[Track] Background music set to: ${asset.url}`);
        setBackgroundMusic(asset.url);
      }

      console.log(`Added ${asset.name} to ${track.name} at frame ${dropFrame}`);
    } catch (error) {
      console.error('Drop error:', error);
    }
  }, [track, pxPerFrame, addItem, updateItem, setLipSyncVideo, setBackgroundMusic, setGhostPreview, setActiveSnapFrame, snapSettings.enabled, allTracks, isAssetCompatible]);

  return (
    <div
      className={`track-row ${isDragOver ? 'drag-over' : ''}`}
      data-track-id={track.id}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Ghost preview for add-to-timeline */}
      {showGhost && <GhostItem preview={ghostPreview} pxPerFrame={pxPerFrame} />}

      {track.items.map((item) => (
        <TrackItem
          key={item.id}
          item={item}
          pxPerFrame={pxPerFrame}
          isSelected={selectedItemIds.includes(item.id)}
          isLocked={track.locked}
        />
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  // Shallow compare track items
  if (prevProps.pxPerFrame !== nextProps.pxPerFrame) return false;
  if (prevProps.track.id !== nextProps.track.id) return false;
  if (prevProps.track.locked !== nextProps.track.locked) return false;
  if (prevProps.track.items.length !== nextProps.track.items.length) return false;

  // Check if items changed (positions/durations/assets)
  for (let i = 0; i < prevProps.track.items.length; i++) {
    const prev = prevProps.track.items[i];
    const next = nextProps.track.items[i];
    if (
      prev.id !== next.id ||
      prev.startFrame !== next.startFrame ||
      prev.durationInFrames !== next.durationInFrames ||
      prev.assetId !== next.assetId
    ) {
      return false;
    }
  }

  return true;
});
