// ===============================
// Tracks Atom - Re-exports from @vibee/atoms
// with web-specific overrides
// ===============================

import { atom } from 'jotai';
import type { Track, TrackItem, TrackType, VideoLayout } from '@vibee/atoms';
import {
  STORAGE_KEYS,
  createDefaultTracks as sharedCreateDefaultTracks,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_COVER_DURATION,
  DEFAULT_VIGNETTE_STRENGTH,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_FPS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} from '@vibee/atoms';

// Import template props for resetTracksAtom
import {
  lipSyncVideoAtom,
  captionsAtom,
  coverImageAtom,
  backgroundMusicAtom,
  musicVolumeAtom,
  coverDurationAtom,
  vignetteStrengthAtom,
  colorCorrectionAtom,
  circleSizePercentAtom,
  circleBottomPercentAtom,
  circleLeftPercentAtom,
  faceOffsetXAtom,
  faceOffsetYAtom,
  faceScaleAtom,
  captionStyleAtom,
  showCaptionsAtom,
} from './derived/templateProps';
import { CAPTION_DEFAULTS } from '@vibee/atoms';
import { projectAtom } from './project';

// ===============================
// Re-export everything from @vibee/atoms
// ===============================
export {
  // Core atom
  tracksAtom,
  // Selectors
  videoTrackAtom,
  avatarTrackAtom,
  audioTrackAtom,
  voiceTrackAtom,
  imageTrackAtom,
  getTrackByIdAtom,
  getItemByIdAtom,
  // Track actions
  addTrackAtom,
  removeTrackAtom,
  updateTrackAtom,
  reorderTracksAtom,
  // Item actions
  addItemAtom,
  updateItemAtom,
  updateItemLayoutAtom,
  setAllVideoItemsLayoutAtom,
  deleteItemsAtom,
  moveItemAtom,
  resizeItemAtom,
  splitItemAtom,
  duplicateItemsAtom,
  moveItemToTrackAtom,
  rippleDeleteAtom,
  reorderItemsAtom,
  // Migrations
  ensureAudioTrackAtom,
  ensureVoiceTrackAtom,
  ensureImageTrackAtom,
  // Defaults
  DEFAULT_TRACKS,
  createDefaultTracks,
} from '@vibee/atoms';

// Import tracksAtom for use in resetTracksAtom
import { tracksAtom } from '@vibee/atoms';

// ===============================
// Web-specific: resetTracksAtom
// This atom has web-specific logic (localStorage, projectAtom)
// ===============================
export const resetTracksAtom = atom(
  null,
  (get, set, { fps = DEFAULT_FPS, durationInFrames = 825 }: { fps?: number; durationInFrames?: number }) => {
    // Reset project (duration, fps, etc.)
    set(projectAtom, {
      id: '',
      name: 'Vibee Reel',
      fps,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      durationInFrames,
    });

    // Reset tracks using shared factory (cast for atomWithStorage)
    set(tracksAtom, sharedCreateDefaultTracks(fps, durationInFrames) as any);

    // Reset lipsync video to default
    set(lipSyncVideoAtom, '/lipsync/lipsync.mp4');

    // Clear captions (will be loaded fresh from default captions.json)
    set(captionsAtom, []);

    // Reset all template props to defaults
    set(coverImageAtom, '/covers/poster.jpeg');
    set(backgroundMusicAtom, '/audio/music/bgmusic.mp3');
    set(musicVolumeAtom, DEFAULT_MUSIC_VOLUME);
    set(coverDurationAtom, DEFAULT_COVER_DURATION);
    set(vignetteStrengthAtom, DEFAULT_VIGNETTE_STRENGTH);
    set(colorCorrectionAtom, DEFAULT_COLOR_CORRECTION);
    set(circleSizePercentAtom, DEFAULT_AVATAR_CONFIG.circleSizePercent);
    set(circleBottomPercentAtom, 0);  // Center
    set(circleLeftPercentAtom, 0);    // Center
    set(faceOffsetXAtom, 0);
    set(faceOffsetYAtom, 0);
    set(faceScaleAtom, 1.0);
    set(showCaptionsAtom, true);
    set(captionStyleAtom, {
      fontSize: CAPTION_DEFAULTS.fontSize,
      textColor: CAPTION_DEFAULTS.textColor,
      highlightColor: CAPTION_DEFAULTS.highlightColor,
      backgroundColor: CAPTION_DEFAULTS.backgroundColor,
      bottomPercent: CAPTION_DEFAULTS.bottomPercent,
      maxWidthPercent: CAPTION_DEFAULTS.maxWidthPercent,
      fontWeight: CAPTION_DEFAULTS.fontWeight,
      showShadow: CAPTION_DEFAULTS.showShadow,
      fontId: CAPTION_DEFAULTS.fontId,
    });

    // Clear localStorage transcription cache
    localStorage.removeItem(STORAGE_KEYS.lastTranscribedVideo);
  }
);
