/**
 * Точка входа для PromoReelV2 (см. index.relaunch.ts: основной граф тянет
 * @vibee/atoms → jotai, промо-композициям это не нужно).
 *
 *   npx remotion render src/index.promo2.ts PromoReelV2 out/promo-v2.mp4 --props=props.json
 */
import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { PromoReelV2, PromoReelV2Schema } from './compositions/PromoReelV2';

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: 'PromoReelV2',
    component: PromoReelV2 as never,
    durationInFrames: 600,
    fps: 30,
    width: 1080,
    height: 1920,
    schema: PromoReelV2Schema,
    defaultProps: {
      scenes: [],
      captions: [],
      voiceover: '',
      music: '',
      musicVolume: 0.18,
      ctaText: '/START',
      ctaFrom: 480,
      botHandle: '@neuro_blogger_bot',
    },
  });

registerRoot(Root);
