/**
 * Точка входа для рилсов блога t27.ai.
 *
 *   npx remotion render src/index.blog.ts TrinityBlogReel out/post.mp4 --props=props.json
 *
 * Пропсы генерирует scripts/blog-reel.mjs из RSS-ленты — один пост даёт один
 * файл пропсов. Отдельная точка входа по той же причине, что и у промо:
 * основной граф тянет @vibee/atoms → jotai, блогу это не нужно.
 */
import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { TrinityBlogReel, TrinityBlogReelSchema } from './compositions/TrinityBlogReel';

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: 'TrinityBlogReel',
    component: TrinityBlogReel as never,
    durationInFrames: 900,
    fps: 30,
    width: 1080,
    height: 1920,
    schema: TrinityBlogReelSchema,
    // Длину диктует озвучка, а не константа: пять актов делят
    // durationInFrames долями, и если рендерить меньше кадров, чем объявлено,
    // сцены разъезжаются (проверено — вывод оказался на 20-й секунде вместо
    // 15-й). Хвост 1.2 с — на ленту аутро после последнего слова.
    calculateMetadata: async ({ props }: { props: { captions?: { endMs: number }[] } }) => {
      const last = props.captions?.length
        ? Math.max(...props.captions.map(c => c.endMs))
        : 0;
      if (!last) return {};
      return { durationInFrames: Math.round((last / 1000 + 1.2) * 30) };
    },
    defaultProps: {
      title: 'Equal stored width removed an accuracy lead',
      subtitle: 'A corrected remeasurement withdrew an earlier lead and recorded the defects that changed the reading.',
      dateline: '2026-08-21 · 6 min',
      tags: ['Measurement', 'Reproducibility', 'Self-critique'],
      plates: [
        { label: 'Withdrawn lead', value: '2.1x / 2.6x' },
        { label: 'Defects recorded', value: 'oracle + budget' },
        { label: 'Method', value: 'equal stored width' },
      ],
      lesson: 'Измерение, которое нельзя повторить, — не результат, а мнение.',
      invariant: 'measured, not claimed',
      url: 't27.ai/blog',
      year: 'MMXXVI',
      musicVolume: 0.05,
      captions: [],
      // Канон: имя клуба — «Золотая Литейная» (Golden Foundry), внесено в
      // carte титулов canon-cover-style 22.08.2026. Условия — черновик, пока
      // владелец не подтвердил суммы (см. Foundry.tsx, DRAFT_TERMS).
      club: {
        tagline: 'клуб разработчиков на кремнии',
        name: 'Золотая Литейная',
        terms: 'Свой FPGA-стенд, разбор чужих замеров\nи право первым проверить наш метод.',
        cta: 't27.ai/foundry',
      },
    },
  });

registerRoot(Root);
