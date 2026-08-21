/**
 * Отдельная точка входа для локального рендера RelaunchReel.
 *
 * Основной index.ts регистрирует и SplitTalkingHead, который тянет
 * @vibee/atoms → jotai; локально этот граф не собирается (jotai живёт в
 * node_modules рендера, а webpack резолвит от реального пути пакета).
 * Промо-рилсу вся эта цепочка не нужна — здесь регистрируется только он.
 *
 *   npx remotion render src/index.relaunch.ts RelaunchReel out/relaunch-reel.mp4
 */
import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { RelaunchReel, RelaunchReelSchema } from './compositions/RelaunchReel';

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: 'RelaunchReel',
    component: RelaunchReel,
    durationInFrames: 540,
    fps: 30,
    width: 1080,
    height: 1920,
    schema: RelaunchReelSchema,
    defaultProps: {
      botHandle: '@neuro_blogger_bot',
      ctaCommand: '/start',
      accentA: '#7C3AED',
      accentB: '#06B6D4',
      accentC: '#F472B6',
    },
  });

registerRoot(Root);
