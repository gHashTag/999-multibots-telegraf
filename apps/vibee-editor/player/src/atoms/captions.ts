// ===============================
// Captions Atoms - With AbortController for race condition fix
// ===============================

import { atom } from 'jotai';
import {
  captionsAtom,
  captionStyleAtom,
  showCaptionsAtom,
  lipSyncVideoAtom,
} from './derived/templateProps';
import { projectAtom } from './project';
import { tracksAtom } from './tracks';
import { produce } from 'immer';
import { CAPTION_DEFAULTS, STORAGE_KEYS, type CaptionItem, type CaptionStyle } from '@vibee/atoms';
import { RENDER_URL } from '../config';

// ===============================
// Re-export atoms for external use
// ===============================

// Core caption atoms from templateProps (with storage persistence)
export { captionsAtom, captionStyleAtom, showCaptionsAtom };

// Defaults from @vibee/atoms
export { CAPTION_DEFAULTS };

// ===============================
// Loading State
// ===============================

export const captionsLoadingAtom = atom(false);
export const captionsErrorAtom = atom<string | null>(null);
export const transcribingAtom = atom(false);

// ===============================
// Caption Actions
// ===============================

/**
 * clearCaptionsAtom - Clear all captions
 */
export const clearCaptionsAtom = atom(null, (_get, set) => {
  set(captionsAtom, []);
  set(captionsErrorAtom, null);
});

/**
 * setCaptionsAtom - Set captions array
 */
export const setCaptionsAtom = atom(
  null,
  (_get, set, captions: CaptionItem[]) => {
    set(captionsAtom, captions);
    set(captionsErrorAtom, null);
  }
);

/**
 * updateCaptionStyleAtom - Partially update caption style
 */
export const updateCaptionStyleAtom = atom(
  null,
  (get, set, updates: Partial<CaptionStyle>) => {
    const current = get(captionStyleAtom);
    set(captionStyleAtom, { ...current, ...updates });
  }
);

/**
 * resetCaptionStyleAtom - Reset caption style to defaults
 */
export const resetCaptionStyleAtom = atom(null, (_get, set) => {
  set(captionStyleAtom, {
    fontSize: CAPTION_DEFAULTS.fontSize,
    textColor: CAPTION_DEFAULTS.textColor,
    highlightColor: CAPTION_DEFAULTS.highlightColor,
    backgroundColor: CAPTION_DEFAULTS.backgroundColor,
    bottomPercent: CAPTION_DEFAULTS.bottomPercent,
    maxWidthPercent: CAPTION_DEFAULTS.maxWidthPercent,
    fontWeight: CAPTION_DEFAULTS.fontWeight,
    showShadow: CAPTION_DEFAULTS.showShadow,
    fontFamily: CAPTION_DEFAULTS.fontFamily,
    animation: 'pop', // Caption animation (pop-in effect)
  });
});

// AbortController for canceling in-flight requests
const abortControllerAtom = atom<AbortController | null>(null);

// ===============================
// Load Captions Action
// ===============================

const RENDER_SERVER_URL = RENDER_URL;

export const loadCaptionsAtom = atom(
  null,
  async (get, set, lipSyncVideo?: string) => {
    const videoUrl = lipSyncVideo ?? get(lipSyncVideoAtom);

    if (!videoUrl) {
      set(captionsAtom, []);
      return;
    }

    // Cancel previous request (prevents race condition!)
    const prevController = get(abortControllerAtom);
    if (prevController) {
      prevController.abort();
    }

    // Create new AbortController
    const controller = new AbortController();
    set(abortControllerAtom, controller);
    set(captionsLoadingAtom, true);
    set(captionsErrorAtom, null);

    try {
      // Build captions URL (same directory as lipsync video)
      const videoDir = videoUrl.substring(0, videoUrl.lastIndexOf('/'));
      const captionsPath = `${videoDir}/captions.json`;
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const fullUrl = captionsPath.startsWith('/')
        ? (isLocalhost ? captionsPath : `${RENDER_SERVER_URL}${captionsPath}`)
        : captionsPath;

      // Cache-busting
      const urlWithCacheBust = `${fullUrl}?_=${Date.now()}`;

      const response = await fetch(urlWithCacheBust, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        // Silently ignore missing captions - they're optional
        set(captionsLoadingAtom, false);
        return;
      }

      const captions: CaptionItem[] = await response.json();

      if (controller.signal.aborted) return;

      if (Array.isArray(captions) && captions.length > 0) {
        set(captionsAtom, captions);
      }
      // DON'T clear - persisted captions might exist from transcription
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Only log real errors, not expected 404s
      set(captionsErrorAtom, error instanceof Error ? error.message : 'Unknown error');
      // DON'T clear captions - they might be persisted from transcription
    } finally {
      // Only update loading state if not aborted
      if (!controller.signal.aborted) {
        set(captionsLoadingAtom, false);
      }
    }
  }
);

// ===============================
// Transcribe Video Action
// ===============================

export const transcribeVideoAtom = atom(
  null,
  async (get, set, options?: { force?: boolean }) => {
    const lipSyncVideo = get(lipSyncVideoAtom);
    const project = get(projectAtom);

    // Skip default video
    if (!lipSyncVideo || lipSyncVideo === '/lipsync/lipsync.mp4') {
      console.log('[Transcribe] Skipping default video');
      return;
    }

    // Check localStorage to prevent re-transcription on page refresh
    const lastTranscribed = localStorage.getItem(STORAGE_KEYS.lastTranscribedVideo);
    if (!options?.force && lastTranscribed === lipSyncVideo) {
      console.log('[Transcribe] Already transcribed this video, using persisted captions');
      // Captions are already persisted via atomWithStorage - no need to fetch
      return;
    }

    console.log('[Transcribe] Starting transcription for:', lipSyncVideo);
    set(transcribingAtom, true);
    set(captionsAtom, []); // Clear old captions

    try {
      const response = await fetch(`${RENDER_SERVER_URL}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: lipSyncVideo,
          language: 'ru',
          fps: project.fps,
        }),
      });

      const result = await response.json();

      if (result.success && result.captions) {
        set(captionsAtom, result.captions);
        localStorage.setItem(STORAGE_KEYS.lastTranscribedVideo, lipSyncVideo);
        console.log(`[Transcribe] Loaded ${result.captions.length} captions`);
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
    } catch (error) {
      console.error('[Transcribe] Failed:', error);
      set(captionsErrorAtom, error instanceof Error ? error.message : 'Unknown error');
    } finally {
      set(transcribingAtom, false);
    }
  }
);

// ===============================
// Update Video Duration Action
// ===============================

export const updateDurationFromLipSyncAtom = atom(
  null,
  async (get, set) => {
    const videoUrl = get(lipSyncVideoAtom);
    const project = get(projectAtom);

    if (!videoUrl) return;

    try {
      console.log('[Duration] Getting duration for:', videoUrl);

      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
          resolve(video.duration);
          video.remove();
        };

        video.onerror = () => {
          reject(new Error(`Failed to load video: ${videoUrl}`));
          video.remove();
        };

        // Handle relative URLs
        if (videoUrl.startsWith('/')) {
          video.src = `${RENDER_SERVER_URL}${videoUrl}`;
        } else {
          video.src = videoUrl;
        }
      });

      const fps = project.fps;
      const durationInFrames = Math.ceil(duration * fps);

      console.log(`[Duration] Video: ${duration.toFixed(2)}s = ${durationInFrames} frames`);

      // Update project duration (Avatar is master!)
      const currentProject = get(projectAtom);
      console.log(`[Duration] OLD project.durationInFrames: ${currentProject.durationInFrames}`);

      const newProject: typeof currentProject = {
        id: currentProject.id,
        name: currentProject.name,
        fps: currentProject.fps,
        width: currentProject.width,
        height: currentProject.height,
        durationInFrames,  // NEW VALUE
      };
      console.log(`[Duration] NEW project.durationInFrames: ${newProject.durationInFrames}`);

      // Force update both atom AND localStorage directly
      set(projectAtom, newProject);

      // Also directly update localStorage as backup (atomWithStorage sometimes doesn't sync)
      try {
        localStorage.setItem(STORAGE_KEYS.project, JSON.stringify(newProject));
        console.log('[Duration] Forced localStorage update:', newProject.durationInFrames);

        // Dispatch storage event to force any listeners to re-read
        window.dispatchEvent(new StorageEvent('storage', {
          key: STORAGE_KEYS.project,
          newValue: JSON.stringify(newProject),
        }));
      } catch (e) {
        console.warn('[Duration] localStorage update failed:', e);
      }

      // Update ONLY Avatar track to match lipsync - NON-DESTRUCTIVE!
      // Other tracks (Video, Audio, Text) stay UNTOUCHED
      const currentTracks = get(tracksAtom);
      const newTracks = produce(currentTracks, (draft) => {
        const avatarTrack = draft.find((t) => t.type === 'avatar');
        if (avatarTrack && avatarTrack.items.length > 0) {
          console.log(`[Duration] Avatar OLD: ${avatarTrack.items[0].durationInFrames} frames`);
          avatarTrack.items[0].durationInFrames = durationInFrames;
          avatarTrack.items[0].startFrame = 0;
          console.log(`[Duration] Avatar NEW: ${avatarTrack.items[0].durationInFrames} frames`);
        }
        // NO deletion of other tracks - professional NLE behavior!
      });
      set(tracksAtom, newTracks as any);

      // Force localStorage update for tracks (atomWithStorage sometimes doesn't sync)
      try {
        localStorage.setItem(STORAGE_KEYS.tracks, JSON.stringify(newTracks));
        console.log('[Duration] Forced tracks localStorage update');
        window.dispatchEvent(new StorageEvent('storage', {
          key: STORAGE_KEYS.tracks,
          newValue: JSON.stringify(newTracks),
        }));
      } catch (e) {
        console.warn('[Duration] tracks localStorage update failed:', e);
      }

      // Verify the update worked
      const verifyProject = get(projectAtom);
      const verifyTracks = get(tracksAtom);
      const verifyAvatar = verifyTracks.find((t) => t.type === 'avatar');
      console.log(`[Duration] VERIFY project: ${verifyProject.durationInFrames} frames`);
      console.log(`[Duration] VERIFY avatar: ${verifyAvatar?.items[0]?.durationInFrames} frames`);
      console.log(`[Duration] Project: ${durationInFrames} frames (${duration.toFixed(1)}s) - non-destructive`);
    } catch (error) {
      console.error('[Duration] Failed to get video duration:', error);
    }
  }
);
