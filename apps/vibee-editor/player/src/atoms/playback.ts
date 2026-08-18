// ===============================
// Playback Atoms - Web/Remotion Player
// ===============================
// Imports shared atoms from @vibee/atoms and defines web-specific ones

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { PlayerRef } from '@remotion/player';
import type React from 'react';
import { STORAGE_KEYS } from '@vibee/atoms';

// ===============================
// Re-export shared atoms from @vibee/atoms
// ===============================
export {
  // Core state
  isPlayingAtom,
  currentFrameAtom,
  isMutedAtom,
  // Settings (default values)
  playbackSpeedAtom,
  volumeAtom,
  fpsAtom,
  loopAtom,
  // Derived
  currentTimeAtom,
  // Actions
  setCurrentFrameAtom,
  setIsPlayingAtom,
  seekToAtom,
} from '@vibee/atoms';

// Import for use in this file
import {
  isPlayingAtom,
  currentFrameAtom,
  setIsPlayingAtom,
} from '@vibee/atoms';

// ===============================
// Web-specific atoms (Remotion Player)
// ===============================

// Playback rate with localStorage persistence
export const playbackRateAtom = atomWithStorage(STORAGE_KEYS.playbackRate, 1);

// Remotion Player ref for direct control
export const playerRefAtom = atom<React.RefObject<PlayerRef | null> | null>(null);

// Play action (with Remotion Player control)
export const playAtom = atom(
  null,
  (get, set, event?: React.MouseEvent) => {
    const playerRef = get(playerRefAtom);
    if (playerRef?.current) {
      const player = playerRef.current;
      if (player.unmute) player.unmute();
      if (player.setVolume) player.setVolume(1);
      player.play(event);
    }
    set(setIsPlayingAtom, true);
  }
);

// Pause action (with Remotion Player control)
export const pauseAtom = atom(
  null,
  (get, set) => {
    const playerRef = get(playerRefAtom);
    if (playerRef?.current) {
      playerRef.current.pause();
    }
    set(setIsPlayingAtom, false);
  }
);

// Toggle play/pause (with Remotion Player control)
export const togglePlayAtom = atom(
  null,
  (get, set, event?: React.MouseEvent) => {
    const isPlaying = get(isPlayingAtom);
    if (isPlaying) {
      set(pauseAtom);
    } else {
      set(playAtom, event);
    }
  }
);
