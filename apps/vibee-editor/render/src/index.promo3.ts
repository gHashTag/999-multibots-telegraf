/** Точка входа для PromoReelV3 (см. index.relaunch.ts — почему отдельная). */
import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { PromoReelV3, PromoReelV3Schema } from './compositions/PromoReelV3';

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: 'PromoReelV3',
    component: PromoReelV3 as never,
    durationInFrames: 600,
    fps: 30,
    width: 1080,
    height: 1920,
    schema: PromoReelV3Schema,
    defaultProps: {
      scenes: [],
      captions: [],
      voiceover: '',
      music: '',
      musicVolume: 0.14,
      ctaFrom: 540,
      ctaText: '/START',
      botHandle: '@neuro_blogger_bot',
    },
  });

registerRoot(Root);
