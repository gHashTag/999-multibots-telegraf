// ===============================
// Project Atom - Core state
// ===============================

import { atomWithStorage } from 'jotai/utils';
import type { Project } from '@vibee/atoms';
import { STORAGE_KEYS, DEFAULT_FPS, DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms';

const DEFAULT_PROJECT: Project = {
  id: '',
  name: 'Vibee Reel',
  fps: DEFAULT_FPS,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  durationInFrames: 834, // ~27.8 seconds at 30fps
};

export const projectAtom = atomWithStorage<Project>(
  STORAGE_KEYS.project,
  DEFAULT_PROJECT
);
