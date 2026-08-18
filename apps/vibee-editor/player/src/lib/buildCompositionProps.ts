/**
 * Single source of truth for building SplitTalkingHead composition props.
 * Used by BOTH the preview (InteractiveCanvas) and the export (Timeline).
 * This guarantees that what you see in the preview is exactly what gets rendered.
 */
import type { SplitTalkingHeadProps, Segment } from '@compositions/SplitTalkingHead';
import type { LipSyncMainProps, TrackItem, Asset, Track } from '@vibee/atoms';
import { DEFAULT_MUSIC_VOLUME, BRAND_COLORS, DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms';

/**
 * Convert LipSyncMainProps + timeline track data into SplitTalkingHeadProps.
 * Pure function — no React hooks, no side effects.
 */
export function convertToSplitTalkingHeadProps(
  props: LipSyncMainProps,
  durationInFrames: number,
  fps: number,
  videoTrackItems: TrackItem[],
  imageTrackItems: TrackItem[],
  assets: Asset[],
  avatarSettingsTab: 'split' | 'fullscreen'
): SplitTalkingHeadProps {
  const segments: Segment[] = [];

  // Sort items by startFrame to ensure correct order
  const sortedItems = [...videoTrackItems].sort((a, b) => a.startFrame - b.startFrame);

  if (sortedItems.length === 0) {
    // Default split with cover image B-roll
    segments.push({
      type: 'split',
      startFrame: 0,
      durationFrames: durationInFrames,
      bRollUrl: '/covers/poster.jpeg',
      bRollType: 'image',
      caption: '',
      layout: 'top-half',
    });
  } else {
    // Use actual timeline positions from video track items
    let lastEndFrame = 0;

    sortedItems.forEach((item) => {
      // Add fullscreen segment for gap before this b-roll (if any)
      if (item.startFrame > lastEndFrame) {
        segments.push({
          type: 'fullscreen',
          startFrame: lastEndFrame,
          durationFrames: item.startFrame - lastEndFrame,
          caption: '',
        });
      }

      // Get URL from item directly or via assetId lookup
      let bRollUrl: string | undefined;
      if ('url' in item && item.url) {
        bRollUrl = item.url as string;
      } else if (item.assetId) {
        const asset = assets.find((a) => a.id === item.assetId);
        bRollUrl = asset?.url;
      }

      if (!bRollUrl) {
        console.warn('[buildCompositionProps] Missing B-roll URL for item:', {
          itemId: item.id,
          assetId: item.assetId,
          hasDirectUrl: 'url' in item,
        });
      }

      // Add split segment with B-roll at timeline position
      segments.push({
        type: 'split',
        startFrame: item.startFrame,
        durationFrames: item.durationInFrames,
        bRollUrl: bRollUrl,
        bRollType: 'video',
        caption: '',
        layout: (item as any).layout || 'top-half',
        // Pass item position offsets for canvas drag handles
        offsetX: item.x || 0,
        offsetY: item.y || 0,
        scaleWidth: item.width !== DEFAULT_WIDTH ? item.width : undefined,
        scaleHeight: item.height !== DEFAULT_HEIGHT ? item.height : undefined,
        // Content panning inside container
        cropX: (item as any).cropX,
        cropY: (item as any).cropY,
      });

      lastEndFrame = item.startFrame + item.durationInFrames;
    });

    // Add final fullscreen segment if there's remaining time
    if (lastEndFrame < durationInFrames) {
      segments.push({
        type: 'fullscreen',
        startFrame: lastEndFrame,
        durationFrames: durationInFrames - lastEndFrame,
        caption: '',
      });
    }
  }

  return {
    lipSyncVideo: props.lipSyncVideo,
    segments,
    captionColor: props.captionStyle?.highlightColor || '#FFFF00',
    splitRatio: 0.5,
    backgroundMusic: props.backgroundMusic,
    musicVolume: props.musicVolume,
    captions: props.captions || [],
    showCaptions: props.showCaptions ?? true,
    captionStyle: props.captionStyle || {},
    // Face centering
    faceOffsetX: props.faceOffsetX ?? 0,
    faceOffsetY: props.faceOffsetY ?? 0,
    faceScale: props.faceScale ?? 1,
    // Video volume
    videoVolume: 1,
    // Circle/Avatar positioning
    circleSizePercent: props.circleSizePercent,
    circleBottomPercent: props.circleBottomPercent,
    circleLeftPercent: props.circleLeftPercent,
    // Circle mode
    isCircleAvatar: props.isCircleAvatar ?? false,
    avatarBorderRadius: props.avatarBorderRadius ?? 50,
    // Split mode settings
    splitCircleSize: props.splitCircleSize ?? 25,
    splitPositionX: props.splitPositionX ?? 0,
    splitPositionY: props.splitPositionY ?? 0,
    splitFaceScale: props.splitFaceScale ?? 1,
    splitIsCircle: props.splitIsCircle ?? true,
    splitBorderRadius: props.splitBorderRadius ?? 50,
    // Fullscreen mode settings
    fullscreenCircleSize: props.fullscreenCircleSize ?? 50,
    fullscreenPositionX: props.fullscreenPositionX ?? 0,
    fullscreenPositionY: props.fullscreenPositionY ?? 0,
    fullscreenFaceScale: props.fullscreenFaceScale ?? 1,
    fullscreenIsCircle: props.fullscreenIsCircle ?? false,
    fullscreenBorderRadius: props.fullscreenBorderRadius ?? 50,
    // Visual effects
    vignetteStrength: props.vignetteStrength,
    colorCorrection: props.colorCorrection,
    // Avatar settings mode (from UI toggle)
    avatarSettingsTab,
    // Avatar animation
    avatarAnimation: props.avatarAnimation ?? 'pop',
    // Avatar border effects
    avatarBorderEffect: props.avatarBorderEffect ?? 'none',
    avatarBorderColor: props.avatarBorderColor ?? BRAND_COLORS.amber,
    avatarBorderColor2: props.avatarBorderColor2 ?? '#fbbf24',
    avatarBorderWidth: props.avatarBorderWidth ?? 4,
    avatarBorderIntensity: props.avatarBorderIntensity ?? 0.8,
    // Image overlays from Image track
    imageOverlays: imageTrackItems
      .map(item => {
        const asset = item.assetId ? assets.find(a => a.id === item.assetId) : null;
        const url = asset?.url || '';
        if (!url) return null;
        return {
          url,
          startFrame: item.startFrame,
          durationFrames: item.durationInFrames,
          x: item.x || 0,
          y: item.y || 0,
          width: item.width || 1080,
          height: item.height || 1920,
          rotation: item.rotation || 0,
          opacity: item.opacity ?? 1,
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null),
  };
}

/**
 * Extract audio track URL and volume from tracks.
 * Used by both preview and export to get audio track override.
 */
export function getAudioTrackOverride(
  tracks: Track[],
  assets: Asset[]
): { audioTrackUrl: string | null; audioTrackVolume: number } {
  const audioTrack = tracks.find((t) => t.type === 'audio');
  if (!audioTrack || audioTrack.items.length === 0) {
    return { audioTrackUrl: null, audioTrackVolume: DEFAULT_MUSIC_VOLUME };
  }

  // Use the last added audio item (most recent)
  const lastAudioItem = audioTrack.items[audioTrack.items.length - 1];
  const volume = (lastAudioItem as any)?.volume ?? DEFAULT_MUSIC_VOLUME;

  // Get URL from asset
  const asset = assets.find(a => a.id === lastAudioItem.assetId);
  const url = asset?.url || null;

  return { audioTrackUrl: url, audioTrackVolume: volume };
}
